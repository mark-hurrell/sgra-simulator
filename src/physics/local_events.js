// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function (global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};
  const Constants = SGRA.Domain && SGRA.Domain.Constants;
  const G = Constants.G;
  const C2 = Constants.C2;
  const CaptureSurface = SGRA.Physics.CaptureSurface;
  if (!CaptureSurface) throw new Error('CaptureSurface is unavailable');
  const KMS = Constants.KMS;
  const R_EJECT = 20000;
  // One-substep scratch, indexed by the current body-array index.  The array
  // is not mutated until after observeSubstep(), so this index is stable for
  // the complete bracket lifetime.  Capacity is retained across substeps.
  let bracketCapacity = 0;
  let bracketActive = new Uint8Array(0);
  let bracketDt = new Float64Array(0);
  let bracketSimT = new Float64Array(0);
  let bracketX = new Float64Array(0), bracketY = new Float64Array(0), bracketZ = new Float64Array(0);
  let bracketVx = new Float64Array(0), bracketVy = new Float64Array(0), bracketVz = new Float64Array(0);
  let bracketRx = new Float64Array(0), bracketRy = new Float64Array(0), bracketRz = new Float64Array(0);
  let bracketR = new Float64Array(0);

  function ensureBracketCapacity(count) {
    if (count <= bracketCapacity) return;
    SGRA.Diag?.R6AllocationProbe?.typedArrayGrowth?.();
    const next = Math.max(count, bracketCapacity ? bracketCapacity * 2 : 16);
    const grow = old => { const out = new Float64Array(next); out.set(old); return out; };
    bracketActive = (() => { const out = new Uint8Array(next); out.set(bracketActive); return out; })();
    bracketDt = grow(bracketDt); bracketSimT = grow(bracketSimT);
    bracketX = grow(bracketX); bracketY = grow(bracketY); bracketZ = grow(bracketZ);
    bracketVx = grow(bracketVx); bracketVy = grow(bracketVy); bracketVz = grow(bracketVz);
    bracketRx = grow(bracketRx); bracketRy = grow(bracketRy); bracketRz = grow(bracketRz);
    bracketR = grow(bracketR);
    bracketCapacity = next;
  }

  function clearBracketActivity(count) {
    bracketActive.fill(0, 0, Math.min(count, bracketCapacity));
  }

  function resetRunState() {
    bracketActive.fill(0);
  }

  let configuredDeps = null;
  function configure(port) {
    if (!port || typeof port.getBodies !== 'function' || typeof port.getSimTime !== 'function' || !port.eventOutput || typeof port.eventOutput.emitBodyCaptured !== 'function' || typeof port.eventOutput.emitBodyEjected !== 'function' || typeof port.eventOutput.emitPericentre !== 'function') {
      throw new TypeError('LocalEvents requires explicit world, clock, and physics event output ports');
    }
    configuredDeps = Object.freeze(new Proxy({}, { get: (_target, key) => port[key], set: (_target, key, value) => { port[key] = value; return true; }, has: (_target, key) => key in port }));
    return configuredDeps;
  }
  function deps() {
    return configuredDeps || {};
  }

  function getBodies() {
    return deps().getBodies();
  }

  function getSimTime() {
    return deps().getSimTime();
  }

  function isCentralFramePinned() {
    const d = deps();
    if (typeof d.isCentralFramePinnedForSandbox === 'function') return d.isCentralFramePinnedForSandbox();
    return true;
  }

  function isKerrOwned(body) {
    const checker = deps().isKerrOwned || SGRA.Physics.LocalStepIntegrator?.isKerrOwned;
    if (typeof checker !== 'function') throw new Error('LocalEvents.isKerrOwned() is not wired; cannot classify local capture ownership.');
    return checker(body) === true;
  }

  function removeBodyAt(index) {
    const d = deps();
    if (typeof d.removeBodyAt !== 'function') throw new Error('LocalEvents.removeBodyAt() is not wired; cannot remove a body.');
    return d.removeBodyAt(index);
  }

  function recordRemovalEvent(event) {
    const d = deps();
    if (d && typeof d.recordRemovalEvent === 'function') {
      d.recordRemovalEvent(event);
    } else if (global.SGRA_DIAG && typeof global.SGRA_DIAG.recordRemovalEvent === 'function') {
      global.SGRA_DIAG.recordRemovalEvent(event);
    }
  }

  function removalAuditState(body, bh, bhMassBefore) {
    const dx = body.x - bh.x, dy = body.y - bh.y, dz = body.z - bh.z;
    const dvx = body.vx - bh.vx, dvy = body.vy - bh.vy, dvz = body.vz - bh.vz;
    const r = Math.hypot(dx, dy, dz);
    const v = Math.hypot(dvx, dvy, dvz);
    const captureRadius = CaptureSurface.radius(bhMassBefore);
    const specificEnergy = r > 0 ? 0.5 * (dvx * dvx + dvy * dvy + dvz * dvz) - G * bhMassBefore / r : Number.NEGATIVE_INFINITY;
    return {
      r,
      v,
      specificEnergy,
      captureRadius
    };
  }

  function isValidCaptureEvent(event) {
    if (!event || typeof event !== 'object') return false;
    for (const key of ['id', 't', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'localisation', 'velocity_convention', 'canonical', 'units']) {
      if (!Object.hasOwn(event, key)) return false;
    }
    if (![event.t, event.x, event.y, event.z, event.vx, event.vy, event.vz].every(Number.isFinite)) return false;
    if (event.localisation === 'chord-root') return event.canonical === null && event.units === null;
    if (event.localisation === 'field-lane-chord-root') return event.canonical === null && event.units === null;
    if (event.localisation === 'dp54-refined') return ArrayBuffer.isView(event.canonical) && event.canonical.length === 7 && event.units && typeof event.units === 'object';
    return false;
  }

  function removeCapturedBody(index, body, bh) {
    const event = body.__captureEvent;
    if (!isValidCaptureEvent(event)) {
      throw new Error(`Captured body ${body.id} is missing a valid canonical __captureEvent at local removal boundary`);
    }
    const bhMassBefore = bh.m;
    const audit = removalAuditState(body, bh, bhMassBefore);
    bh.m += body.m;
    recordRemovalEvent({
      bodyId: body.id,
      bodyName: body.name || null,
      removal_reason: 'merged',
      mass_removed: body.m,
      mass_to_bh: body.m,
      mass_to_escape: 0,
      mass_to_sink: 0,
      mBH_before: bhMassBefore,
      mBH_after: bh.m,
      r_at_removal: audit.r,
      v_at_removal: audit.v,
      specific_energy_at_removal: audit.specificEnergy,
      specific_energy_mu_convention: 'central-mass-only-pre-removal-bh-mass',
      capture_radius_at_removal: audit.captureRadius,
      captured_flag_before_removal: !!body.captured
    });
    if (isCentralFramePinned()) {
      SGRA.Physics.LocalStepIntegrator.enforcePinnedBHFrame();
    }
    removeBodyAt(index);
    deps().eventOutput.emitBodyCaptured({
      index,
      body,
      centralBody: bh,
      eventTime: event.t,
      centralMassBefore: bhMassBefore,
      centralMassAfter: bh.m,
      audit
    });
  }

  function closePericentreThreshold(body) {
    return body.intr ? 5000 : 500;
  }

  function closePericentreRearmThreshold(body) {
    return closePericentreThreshold(body) * 1.25;
  }

  function updateClosePericentreArming(body, r) {
    if (body.field) return;
    if (body.bhCloseFlashArmed !== false) body.bhCloseFlashArmed = true;
    if (r > closePericentreRearmThreshold(body)) body.bhCloseFlashArmed = true;
  }

  function classifyBhPericentre(body, periR) {
    const closeThreshold = closePericentreThreshold(body);
    const isClose = periR < closeThreshold;
    const flashAllowed = !body.field && isClose && body.bhCloseFlashArmed !== false;
    return Object.freeze({ isClose, flashAllowed });
  }

  function checkPericentre() {
    const list = getBodies();
    const bh = list[0];
    for (let i = 1; i < list.length; i++) {
      const b = list[i];
      const r = Math.hypot(b.x - bh.x, b.y - bh.y, b.z - bh.z);
      updateClosePericentreArming(b, r);
      const dr = r - b.prevR;
      if (dr < 0) {
        if (!b.legMinR || r < b.legMinR) b.legMinR = r;
      } else if (b.prevDR < 0 && dr >= 0 && b.prevR > 0) {
        const periR = b.legMinR || b.prevR;
        const simTime = getSimTime();
        const cooldownOk = !b.lastPeriT || (simTime - b.lastPeriT) > 0.5;
        if (cooldownOk) {
          b.lastPeriT = simTime;
          const v = Math.hypot(b.vx - bh.vx, b.vy - bh.vy, b.vz - bh.vz) * KMS;
          const classification = classifyBhPericentre(b, periR);
          if (classification.flashAllowed) {
            deps().eventOutput.emitPericentre({ body: b, time: simTime, radius: periR, speedKms: v, flash: true, notify: b.name === 'S2' || b.intr || classification.isClose });
            b.bhCloseFlashArmed = false;
          }
          else if (b.name === 'S2' || b.intr || classification.isClose)
            deps().eventOutput.emitPericentre({ body: b, time: simTime, radius: periR, speedKms: v, flash: false, notify: true });
        }
        b.legMinR = null;
      }
      b.prevDR = dr; b.prevR = r;
    }
  }

  function beginSubstep(dt) {
    const list = getBodies();
    SGRA.Diag?.R6AllocationProbe?.beginSubstep?.();
    ensureBracketCapacity(list.length);
    clearBracketActivity(list.length);
    const bh = list[0];
    const simT = getSimTime();
    for (let i = 0; i < list.length; i++) {
      const body = list[i];
      if (body?.field) SGRA.Diag?.R6AllocationProbe?.fieldBody?.();
      if (!body || body.bh || body.captured || body.field || isKerrOwned(body)) continue;
      bracketActive[i] = 1;
      SGRA.Diag?.R6AllocationProbe?.activeBracket?.();
      bracketDt[i] = dt; bracketSimT[i] = simT;
      bracketX[i] = body.x; bracketY[i] = body.y; bracketZ[i] = body.z;
      bracketVx[i] = body.vx; bracketVy[i] = body.vy; bracketVz[i] = body.vz;
      bracketRx[i] = body.x - bh.x; bracketRy[i] = body.y - bh.y; bracketRz[i] = body.z - bh.z;
      bracketR[i] = Math.hypot(bracketRx[i], bracketRy[i], bracketRz[i]);
    }
  }

  // Called after every local drift, before the next force evaluation. Keep the
  // cheap continuous facts at integrator granularity; notifications and array
  // mutation remain in the once-per-advance event pass.
  function observeSubstep() {
    const list = getBodies();
    const bh = list[0];
    if (!bh) { clearBracketActivity(list.length); return; }
    const rcap = CaptureSurface.radius(bh.m);
    try {
      for (let i = 1; i < list.length; i++) {
        const b = list[i];
        // Field bodies are owned by FieldTracerLane and are not part of this
        // local drift or local capture event lane.
        if (b.captured || b.field || isKerrOwned(b)) continue;
        const r = Math.hypot(b.x - bh.x, b.y - bh.y, b.z - bh.z);
        if (b.legMinR == null || r < b.legMinR) b.legMinR = r;
        if (!bracketActive[i]) continue;
        const startX = bracketX[i], startY = bracketY[i], startZ = bracketZ[i];
        const startRx = bracketRx[i], startRy = bracketRy[i], startRz = bracketRz[i];
        const startR = bracketR[i], startDt = bracketDt[i], startSimT = bracketSimT[i];
      const crossing = CaptureSurface.chordCrossing(
        { x: startRx, y: startRy, z: startRz },
        { x: (b.x - bh.x) - startRx, y: (b.y - bh.y) - startRy, z: (b.z - bh.z) - startRz },
        rcap
      );
      if (crossing.status === CaptureSurface.INVALID_PRECONDITION) {
        throw new Error(`Local capture crossing precondition invalid for body ${b.id}: startRadius=${startR} captureRadius=${rcap} dt=${startDt} lane=local`);
      }
      if (crossing.status !== CaptureSurface.ENTER_EVENT) continue;
      const fraction = crossing.theta;
      const dx = b.x - startX, dy = b.y - startY, dz = b.z - startZ;
      b.x = startX + dx * fraction;
      b.y = startY + dy * fraction;
      b.z = startZ + dz * fraction;
      // The local KDK drift is the exact discrete chord
      // P(theta) = P0 + v_half * dt * theta. At this observation point b.v*
      // is the half-step velocity after the opening kick and before the
      // closing kick. Preserve it as the event velocity; interpolating
      // between pre-kick and post-kick values would mix staggered states.
      const eventVx = b.vx, eventVy = b.vy, eventVz = b.vz;
      b.__captureEvent = {
        id: b.id,
        t: startSimT + startDt * fraction,
        fraction,
        x: b.x,
        y: b.y,
        z: b.z,
        vx: eventVx,
        vy: eventVy,
        vz: eventVz,
        localisation: 'chord-root',
        velocity_convention: 'leapfrog-half-step',
        canonical: null,
        units: null
      };
      b.captured = true;
      }
    } finally {
      clearBracketActivity(list.length);
    }
  }

  function checkCaptures() {
    const list = getBodies();
    const bh = list[0], rcap = CaptureSurface.radius(bh.m);
    for (let i = list.length - 1; i >= 1; i--) {
      const b = list[i];
      const r = Math.hypot(b.x - bh.x, b.y - bh.y, b.z - bh.z);
      if (isKerrOwned(b) && !b.captured) continue;
      if (b.captured || r < rcap) {
        removeCapturedBody(i, b, bh);
        continue;
      }
      if (!b.name?.match(/^S\d/)) {
        const dvx = b.vx - bh.vx, dvy = b.vy - bh.vy, dvz = b.vz - bh.vz;
        const v2rel = dvx * dvx + dvy * dvy + dvz * dvz;
        const specificE = 0.5 * v2rel - G * bh.m / r;
        if (specificE > 0 && r > R_EJECT) {
          recordRemovalEvent({
            bodyId: b.id,
            bodyName: b.name || null,
            removal_reason: 'ejected',
            mass_removed: b.m,
            mass_to_bh: 0,
            mass_to_escape: b.m,
            mass_to_sink: 0,
            mBH_before: bh.m,
            mBH_after: bh.m,
            r_at_removal: r,
            v_at_removal: Math.sqrt(v2rel),
            specific_energy_at_removal: specificE,
            specific_energy_mu_convention: 'central-mass-only-pre-removal-bh-mass',
            capture_radius_at_removal: rcap,
            captured_flag_before_removal: !!b.captured
          });
          removeBodyAt(i);
          deps().eventOutput.emitBodyEjected({ index: i, body: b, centralBody: bh, radius: r, speed: Math.sqrt(v2rel) });
        }
      }
    }
  }

  SGRA.Physics.LocalEvents = Object.freeze({ configure, beginSubstep, observeSubstep, checkPericentre, checkCaptures, resetRunState });
})(window);
