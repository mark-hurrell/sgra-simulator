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
  let scratchVx = new Float64Array(0);
  let scratchVy = new Float64Array(0);
  let scratchVz = new Float64Array(0);
  let activeFidelityMode = null;
  let fieldLaneAccumulationSuspended = false;

  let configuredDeps = null;
  function configure(port) {
    if (!port || typeof port.getBodies !== 'function' || typeof port.advanceSimTime !== 'function' || typeof port.isGrEnabled !== 'function') {
      throw new TypeError('LocalStepIntegrator requires explicit world, clock, and mode ports');
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

  function advanceSimTime(dt) {
    const d = deps();
    if (typeof d.advanceSimTime === 'function') return d.advanceSimTime(dt);
    return deps().advanceSimTime(dt);
  }

  function isGrEnabled() {
    return deps().isGrEnabled();
  }

  function isAutomaticFidelityEnabled() {
    const d = deps();
    return typeof d.isAutomaticFidelityEnabled === 'function' ? !!d.isAutomaticFidelityEnabled() : false;
  }

  function syncFidelityMode(list) {
    const d = deps();
    const mode = typeof d.getFidelityMode === 'function' ? d.getFidelityMode() : (isAutomaticFidelityEnabled() ? 'adaptive_kerr' : null);
    if (mode === activeFidelityMode) return;
    SGRA.Physics.LocalForceModel?.invalidateForceState?.();
    activeFidelityMode = mode;
    const policy = SGRA.Physics.CentralFidelityOwnership;
    if (!policy) return;
    for (let i = 1; i < list.length; i++) {
      const body = list[i];
      if (!body || body.field || body.captured) continue;
      if (mode === 'adaptive_kerr') body.__fidelityOwnership = policy.createBodyState(body.id || `body-${i}`);
      else {
        delete body.__fidelityOwnership;
        delete body.__kerrState; delete body.__kerrUnits;
        delete body.__kerrSpinContext; delete body.__kerrStateStale;
        delete body.__kerrMassShell; delete body.__kerrLastAdmissionTime;
      }
    }
  }

  function isKerrOwned(body) {
    return isAutomaticFidelityEnabled() && body?.__fidelityOwnership?.owner === SGRA.Physics.CentralFidelityOwnership?.STATE.KERR_ACTIVE;
  }

  function isKerrFailureOwner(body) {
    const owner = body?.__fidelityOwnership?.owner;
    const state = SGRA.Physics.CentralFidelityOwnership?.STATE;
    return owner === state?.KERR_ADMISSION_FAILED || owner === state?.KERR_INTEGRATION_FAILED;
  }

  function failKerr(body, code, reason) {
    const ownership = body.__fidelityOwnership;
    ownership.failure = reason;
    ownership.owner = code;
    const ownershipTelemetry = deps().kerrOwnershipTelemetry;
    if (ownershipTelemetry?.enabled === true) ownershipTelemetry.recordFailure(code);
    const error = new Error(`${code}: ${reason}`);
    error.code = code;
    error.bodyId = body.id ?? null;
    error.bodyName = body.name ?? null;
    const diag = global.SGRA_DIAG;
    if (diag && typeof diag.recordKerrFailure === 'function') {
      diag.recordKerrFailure(code, {
        bodyId: error.bodyId,
        bodyName: error.bodyName,
        requested: 'adaptive_kerr',
        actual: code,
        reason
      });
    }
    throw error;
  }

  function ensureFidelityOwnership(list) {
    if (!isAutomaticFidelityEnabled()) return;
    const policy = SGRA.Physics.CentralFidelityOwnership;
    const adapter = SGRA.Physics.ProductKerrRuntimeAdapter;
    const math = SGRA.Physics.OrbitalMath;
    if (!policy || !adapter) throw new Error('Adaptive Kerr ownership dependencies are unavailable');
    const bh = list[0];
    const simT = typeof deps().getSimTime === 'function' ? deps().getSimTime() : undefined;
    for (let i = 1; i < list.length; i++) {
      const body = list[i];
      if (!body || body.field || body.captured) continue;
      body.__fidelityOwnership ||= policy.createBodyState(body.id || `body-${i}`);
      const state = body.__fidelityOwnership;
      if (isKerrFailureOwner(body)) {
        failKerr(body, state.owner, state.failure || state.owner);
      }
      const decision = policy.decide(state, body, bh, math, simT);
      if (decision.action === policy.ACTION.DEMOTE_ORDINARY) {
        delete body.__kerrState;
        delete body.__kerrUnits;
        delete body.__kerrSpinContext;
        delete body.__kerrStateStale;
        delete body.__kerrMassShell;
        delete body.__kerrLastAdmissionTime;
        SGRA.Physics.LocalForceModel?.invalidateForceState?.();
        deps().kerrMutualTrace?.record('body_demoted', { simT, bodyId: body.id, bodyName: body.name, classifier: state.classifier });
        continue;
      }
      if (decision.classifier === policy.CLASSIFIER.N_SAFE || state.owner !== policy.STATE.N) continue;
      let promoted;
      try { promoted = adapter.promote(body, bh, simT); } catch (error) { promoted = { admitted: false, reason: error.message }; }
      if (!promoted || promoted.admitted !== true) {
        const ownershipTelemetry = deps().kerrOwnershipTelemetry;
        if (ownershipTelemetry?.enabled === true) ownershipTelemetry.recordPromotion(false);
        failKerr(body, policy.STATE.KERR_ADMISSION_FAILED, promoted?.reason || 'KERR_ADMISSION_FAILED');
      }
      state.promotionTime = simT;
      state.owner = policy.STATE.KERR_ACTIVE;
      SGRA.Physics.LocalForceModel?.invalidateForceState?.();
      const ownershipTelemetry = deps().kerrOwnershipTelemetry;
      if (ownershipTelemetry?.enabled === true) ownershipTelemetry.recordPromotion(true);
      deps().dutyMeasurement?.admission?.(body, 'promotion');
      deps().kerrMutualTrace?.record('body_promoted', { simT, bodyId: body.id, bodyName: body.name, classifier: state.classifier });
    }
  }

  function applyKerrMutualKick(body, bh, dt, adapter, simT, trace, phase, mutualOverride = null) {
    const mutual = mutualOverride || body.aMutual;
    if (!mutual) return;
    const magnitude = value => Math.hypot(value?.x || 0, value?.y || 0, value?.z || 0);
    const scale = 0.5 * dt;
    if (![mutual.x, mutual.y, mutual.z].every(Number.isFinite)) {
      failKerr(body, SGRA.Physics.CentralFidelityOwnership.STATE.KERR_INTEGRATION_FAILED, 'nonfinite mutual acceleration');
    }
    const beforeVx = body.vx, beforeVy = body.vy, beforeVz = body.vz;
    const traceActive = typeof trace?.record === 'function';
    const before = traceActive ? { x: beforeVx, y: beforeVy, z: beforeVz } : null;
    const position = traceActive ? { x: body.x, y: body.y, z: body.z } : null;
    const mutualSnapshot = traceActive ? { x: mutual.x, y: mutual.y, z: mutual.z } : null;
    const dvx = mutual.x * scale, dvy = mutual.y * scale, dvz = mutual.z * scale;
    if (dvx === 0 && dvy === 0 && dvz === 0) {
      if (traceActive) trace.record('mutual_half_kick', { phase, simT, bodyId: body.id, bodyName: body.name, ownership: body.__fidelityOwnership?.owner, position, aMutual: mutualSnapshot, aMutualMagnitude: magnitude(mutualSnapshot), velocityBefore: before, velocityAfter: before, velocitySuppliedToAdmission: before, deltaV: { x: 0, y: 0, z: 0 }, readmission: 'not-needed' });
      return;
    }
    body.vx += dvx; body.vy += dvy; body.vz += dvz;
    let admitted;
    try {
      admitted = adapter.readmit(body, bh, simT);
    } catch (error) {
      body.vx = beforeVx; body.vy = beforeVy; body.vz = beforeVz;
      throw error;
    }
    const after = traceActive ? trace.velocity(body) : null;
    if (traceActive) trace.record('mutual_half_kick', { phase, simT, bodyId: body.id, bodyName: body.name, ownership: body.__fidelityOwnership?.owner, position, aMutual: mutualSnapshot, aMutualMagnitude: magnitude(mutualSnapshot), velocityBefore: before, velocityAfter: after, velocitySuppliedToAdmission: after, deltaV: { x: dvx, y: dvy, z: dvz }, readmission: admitted?.admitted === true ? 'success' : 'failed' });
    if (!admitted || admitted.admitted !== true) {
      const reason = admitted?.reason || 'KERR_ADMISSION_FAILED';
      if (traceActive && trace.enabled === true) {
        const kAdapter = SGRA.Physics.ProductKerrRuntimeAdapter;
        const beforeProbe = kAdapter.probeTimelikeN({ ...body, vx: beforeVx, vy: beforeVy, vz: beforeVz }, bh, deps());
        const afterProbe = kAdapter.probeTimelikeN(body, bh, deps());
        trace.record('mutual_kick_cone_transition', {
          phase, simT, bodyId: body.id, bodyName: body.name, reason,
          N_before: beforeProbe.ok ? beforeProbe.N : null,
          N_after: afterProbe.ok ? afterProbe.N : null,
          rKSHat: afterProbe.ok ? afterProbe.rKSHat : (beforeProbe.ok ? beforeProbe.rKSHat : null),
          rCartesianHat: afterProbe.ok ? afterProbe.rCartesianHat : (beforeProbe.ok ? beforeProbe.rCartesianHat : null),
          f: afterProbe.ok ? afterProbe.f : (beforeProbe.ok ? beforeProbe.f : null),
          vHat_before: beforeProbe.ok ? beforeProbe.vHat : null,
          vHat_after: afterProbe.ok ? afterProbe.vHat : null,
          deltaV: { x: dvx, y: dvy, z: dvz }, dt, aMutual: mutualSnapshot
        });
      }
      body.vx = beforeVx; body.vy = beforeVy; body.vz = beforeVz;
      failKerr(body, SGRA.Physics.CentralFidelityOwnership.STATE.KERR_ADMISSION_FAILED, reason);
    }
  }

  function shouldAccumulateFieldLane() {
    const d = deps();
    if (typeof d.shouldAccumulateFieldLane === 'function') return !!d.shouldAccumulateFieldLane();
    return fieldLaneAccumulationSuspended !== true && d.__sgraFieldLaneAccumulationSuspended !== true;
  }

  // D0-PIN-01: see local_force_model.js for the full note. Same default-true,
  // sandbox-only flag, resolved independently here since this module has its
  // own deps() closure -- both must agree, which the shared sandbox
  // provenance/config wiring guarantees since it sets both from one value.
  function isCentralFramePinned() {
    const d = deps();
    if (typeof d.isCentralFramePinnedForSandbox === 'function') return d.isCentralFramePinnedForSandbox();
    return true;
  }

  function enforcePinnedBHFrame() {
    const list = getBodies();
    if (!list.length) return;
    const bh = list[0];
    bh.x = 0; bh.y = 0; bh.z = 0;
    bh.vx = 0; bh.vy = 0; bh.vz = 0;
    bh.ax = 0; bh.ay = 0; bh.az = 0;
  }

  function relKick(b, h) {
    b.vx += b.ax * h; b.vy += b.ay * h; b.vz += b.az * h;
  }

  function ensureVelocityScratch(length) {
    if (scratchVx.length >= length) return;
    scratchVx = new Float64Array(length);
    scratchVy = new Float64Array(length);
    scratchVz = new Float64Array(length);
  }

  function isSelected(activeMask, index) {
    return activeMask == null || activeMask[index] === 1 || activeMask[index] === true;
  }

  function isOrdinaryEligible(body, index, activeMask) {
    return isSelected(activeMask, index) && body && !(body.bh && isCentralFramePinned())
      && !body.captured && !isKerrOwned(body);
  }

  // Active-step primitives are the single integrator authority used by both
  // the all-active GLOBAL path and future block scheduling.  They operate on
  // caller-owned masks; inactive bodies remain in `list` for force evaluation.
  function kickSelectedBodies(list, h, activeMask = null, lane = null, stepForIndex = null, accelerationForIndex = null) {
    for (let i = 0; i < list.length; i++) {
      const body = list[i];
      if (!isOrdinaryEligible(body, i, activeMask)) continue;
      if (body.field && lane) continue;
      const kickH = typeof stepForIndex === 'function' ? stepForIndex(i, body, h) : h;
      const acceleration = typeof accelerationForIndex === 'function' ? accelerationForIndex(i, body) : null;
      if (acceleration) {
        body.vx += acceleration.x * kickH; body.vy += acceleration.y * kickH; body.vz += acceleration.z * kickH;
      } else relKick(body, kickH);
    }
  }

  function driftSelectedOrdinaryBodies(list, dt, activeMask = null, lane = null) {
    for (let i = 0; i < list.length; i++) {
      const body = list[i];
      if (!isOrdinaryEligible(body, i, activeMask)) continue;
      if (body.field && lane) continue;
      body.x += body.vx * dt; body.y += body.vy * dt; body.z += body.vz * dt;
    }
  }

  function recomputeAuthoritativeForces(caller = 'local_step.recompute', activeMask = null, partition = null) {
    // The force authority intentionally receives the complete body list. An
    // inactive body is still physically present and must remain in pair/Kerr
    // context; the mask controls state integration, not force eligibility.
    const forceModel = SGRA.Physics.LocalForceModel;
    forceModel.computeAccel(caller, partition);
  }

  function observeStepLifecycle() {
    SGRA.Physics.LocalEvents?.observeSubstep?.();
  }

  function beginStepLifecycle(dt) {
    SGRA.Physics.LocalEvents?.beginSubstep?.(dt);
  }

  function notifyStepStarted(dt) {
    const d = deps();
    const observer = d.observer;
    const getSimT = typeof d.getSimTime === 'function' ? d.getSimTime : null;
    observer?.integration_step_started?.({ dt, simT: getSimT ? getSimT() : undefined });
  }

  function commitStepLifecycle(dt, stepStartSimT, meta = {}) {
    advanceSimTime(dt);
    deps().dutyMeasurement?.stepCommitted?.(dt, stepStartSimT);
    const ownershipTelemetry = deps().kerrOwnershipTelemetry;
    if (ownershipTelemetry?.enabled === true) ownershipTelemetry.recordPhysicsStep(getBodies());
    deps().scientificTrace?.recordAcceptedStep?.(dt);
    deps().acceptedStateCapture?.recordAcceptedStep?.(dt, stepStartSimT, meta);
    const getSimT = typeof deps().getSimTime === 'function' ? deps().getSimTime : null;
    deps().observer?.integration_step_completed?.({ dt, simT: getSimT ? getSimT() : undefined });
  }

  function applySelectedKerrMutualKick(list, bh, dt, activeMask = null, phase = 'active', simT = undefined, trace = null, stepForIndex = null, mutualForIndex = null) {
    if (!isAutomaticFidelityEnabled()) return;
    const adapter = SGRA.Physics.ProductKerrRuntimeAdapter;
    for (let i = 1; i < list.length; i++) {
      const body = list[i];
      if (!isSelected(activeMask, i) || body.captured || !isKerrOwned(body)) continue;
      const selectedDt = typeof stepForIndex === 'function' ? stepForIndex(i, body, dt) : dt;
      const selectedMutual = typeof mutualForIndex === 'function' ? mutualForIndex(i, body) : null;
      applyKerrMutualKick(body, bh, selectedDt * 2, adapter, simT, trace, phase, selectedMutual);
    }
  }

  function advanceSelectedKerrBodies(list, bh, dt, activeMask = null, automatic = isAutomaticFidelityEnabled(), trace = null, simT = undefined, stepForIndex = null) {
    if (!automatic) return 0;
    const adapter = SGRA.Physics.ProductKerrRuntimeAdapter;
    let advanced = 0;
    for (let i = 1; i < list.length; i++) {
      const body = list[i];
      if (!isSelected(activeMask, i) || body.captured || !isKerrOwned(body)) continue;
      const selectedDt = typeof stepForIndex === 'function' ? stepForIndex(i, body, dt) : dt;
      trace?.record('before_kerr_advance', { simT, bodyId: body.id, bodyName: body.name, ownership: body.__fidelityOwnership?.owner, position: { x: body.x, y: body.y, z: body.z }, velocity: trace ? trace.velocity(body) : null });
      try {
        const result = adapter.advance(body, bh, selectedDt);
        // SCI-01B physical-classification gate (added in this patch;
        // corrected after review to remove a forced-capture fallback --
        // see src/physics/sci01b_physical_classification.js's header for
        // the full decision policy and docs/SCI01B_PRODUCTION_INTEGRATION_2026-09-19.md
        // for the correction history). Event localisation above (the DP54
        // terminal radius-crossing event, or a normal full-dt integration
        // while the candidate short-circuit was disarmed) is unaffected by
        // any of this; it decides only whether to reach the capture-commit
        // block below.
        //
        // The check below is NOT limited to a fresh 'event-terminated'
        // result: a body can also complete a full-dt advance() while still
        // inside the candidate radius (this is exactly the disarmed
        // continuation case), and SCI-01B must be re-asked on that
        // genuinely-evolved state too, not just on the first crossing.
        const captureRadiusHat = SGRA.Physics.CaptureSurface.radiusHatted();
        const canonical = body.__kerrState;
        // NOTE: deliberately not `canonical instanceof Float64Array` --
        // this code can run in a vm sandbox context whose Float64Array
        // constructor differs from an array constructed in a different
        // realm (e.g. a test harness), and `instanceof` is realm-sensitive.
        // A length + finite-value check is realm-agnostic and just as safe
        // here, since body.__kerrState is only ever written by this file
        // and product_kerr_runtime_adapter.js as a 7-element numeric array.
        const currentRadius = canonical && canonical.length >= 3 && Number.isFinite(canonical[0])
          ? Math.hypot(canonical[0], canonical[1], canonical[2])
          : Infinity;
        const isCaptureCandidate = (result?.status === 'event-terminated' && result.event?.id === 'production-capture-radius')
          || currentRadius <= captureRadiusHat;
        if (isCaptureCandidate) {
          const classifier = SGRA.Physics.SCI01BPhysicalClassification;
          const classification = classifier
            ? classifier.evaluateCaptureEvent(body, bh, body.__kerrSpinContext)
            : { commit: false, continue: false, fatal: true, source: 'SCI01B_MODULE_NOT_LOADED' };
          body.__sci01bCaptureClassification = classification;

          if (classification.fatal) {
            failKerr(body, SGRA.Physics.CentralFidelityOwnership.STATE.KERR_INTEGRATION_FAILED,
              `SCI-01B physical classification failed: ${classification.source}`);
          } else if (classification.commit) {
            body.captured = true;
            body.__sci01bCandidateDisarmed = false;
            const units = body.__kerrUnits;
            // A fresh terminal event carries a precise crossing time
            // (result.event.t); a capture confirmed after a disarmed
            // continuation step (result.status === 'completed') has no
            // such root -- selectedDt is used as the best available
            // approximation for that case, and is exact for the fresh-event
            // case's usual dt-consuming callers.
            const rootTimeHat = result?.event?.t ?? selectedDt;
            if (!units || !Number.isFinite(units.Tg) || !Number.isFinite(rootTimeHat)) {
              throw new Error(`Kerr capture event state is incomplete for body ${body.id}: refined root time or unit context is invalid`);
            }
            body.__captureEvent = {
              id: body.id,
              t: simT + rootTimeHat * units.Tg,
              x: body.x, y: body.y, z: body.z,
              vx: body.vx, vy: body.vy, vz: body.vz,
              localisation: result?.event ? 'dp54-refined' : 'sci01b-continuation-confirmed',
              velocity_convention: 'kerr-restored',
              canonical: Float64Array.from(body.__kerrState),
              units: { ...units }
            };
          } else {
            // TURNING_POINT_EXISTS / TOPOLOGY_AMBIGUOUS / outside validated
            // domain: no capture. Disarm the candidate short-circuit so the
            // NEXT advance() call actually integrates this body forward
            // (see product_kerr_runtime_adapter.js's entry short-circuit)
            // instead of repeatedly reporting the same zero-duration event.
            body.__sci01bCandidateDisarmed = true;
          }
        } else if (body.__sci01bCandidateDisarmed) {
          // The body has genuinely exited the candidate radius -- re-arm so
          // a future fresh inward crossing is detected and classified again.
          body.__sci01bCandidateDisarmed = false;
        }
      } catch (error) {
        failKerr(body, SGRA.Physics.CentralFidelityOwnership.STATE.KERR_INTEGRATION_FAILED, error?.message || 'Kerr advance failed');
      }
      trace?.record('after_kerr_advance', { simT, bodyId: body.id, bodyName: body.name, ownership: body.__fidelityOwnership?.owner, position: { x: body.x, y: body.y, z: body.z }, velocity: trace ? trace.velocity(body) : null, canonicalState: body.__kerrState ? Array.from(body.__kerrState) : null });
      advanced++;
    }
    return advanced;
  }

  function physicsStep(dt) {
    const list = getBodies();
    const h = .5 * dt;
    const bh = list[0];
    const stepStartSimT = typeof deps().getSimTime === 'function' ? deps().getSimTime() : undefined;
    beginStepLifecycle(dt);
    syncFidelityMode(list);
    ensureFidelityOwnership(list);
    // Leading kicks consume cached ax/aMutual. Prime only when the force model
    // cannot prove that its cached state matches this lifecycle state; a
    // completed warm step therefore contributes no repair evaluation.
    const forceModel = SGRA.Physics.LocalForceModel;
    forceModel.ensureValid?.('local_step.ensure_valid');
    const automatic = isAutomaticFidelityEnabled();
    const kerrAdapter = SGRA.Physics.ProductKerrRuntimeAdapter;
    const simT = typeof deps().getSimTime === 'function' ? deps().getSimTime() : undefined;
    const trace = deps().kerrMutualTrace;
    // Diagnostic-only inventory: do not traverse/allocate when the optional
    // trace has no consumer.
    const kerrBodies = trace ? (automatic ? list.filter(isKerrOwned) : []) : null;
    trace?.record('substep_input', { simT, bodyCount: list.length, kerrOwnedBodies: kerrBodies?.length || 0, bodies: kerrBodies ? kerrBodies.slice(0, 1).map(body => ({ bodyId: body.id, bodyName: body.name, ownership: body.__fidelityOwnership?.owner, position: { x: body.x, y: body.y, z: body.z }, velocity: trace.velocity(body) })) : [] });
    if (automatic) {
      for (let i = 1; i < list.length; i++) {
        const body = list[i];
        if (!body.captured && isKerrOwned(body)) applyKerrMutualKick(body, bh, dt, kerrAdapter, simT, trace, 'start');
      }
    }
    // R4 Step 3: optional observer hook, no-op by default (see
    // local_force_model.js for the identical pattern/rationale).
    const observer = deps().observer;
    const getSimT = typeof deps().getSimTime === 'function' ? deps().getSimTime : null;
    notifyStepStarted(dt);
    // D0-PIN-01: skip only when pinned (default). Unpinned mode lets the
    // BH carry whatever velocity/acceleration the previous step left it
    // with, exactly like every other body.
    if (isCentralFramePinned()) {
      bh.ax = bh.ay = bh.az = 0;
      bh.vx = bh.vy = bh.vz = 0;
    }
    const lane = SGRA.Physics.FieldTracerLane;
    // PERF plan P4: field/tracer stars never backreact on anything and never
    // receive a GR/cusp term (local_force_model.js already skips them in
    // both), so their true motion is fully decoupled from every interacting
    // body. Route them through the independent timestep lane instead of
    // drifting/kicking them at the fine dt this substep uses -- exact within
    // tight numerical tolerance (see bench/p4_explore_batching.mjs and
    // bench/p4_lane_gate.mjs), since their own dynamical timescale is
    // orders of magnitude longer than the fine substep a close encounter
    // forces on interacting bodies. If the lane isn't loaded for some
    // reason, fall through to the original per-substep behaviour so this
    // never becomes a hard dependency.
    const allActive = null;
    kickSelectedBodies(list, h, allActive, lane);
    driftSelectedOrdinaryBodies(list, dt, allActive, lane);
    advanceSelectedKerrBodies(list, bh, dt, allActive, automatic, trace, simT);
    observeStepLifecycle();
    // P1 is scoped to the legacy 1PN fixed-point loop only. Adaptive Kerr
    // owns exact central propagation and must not inherit this cache phase.
    const p1Phase = isGrEnabled() && !isAutomaticFidelityEnabled();
    if (p1Phase && typeof forceModel.beginPositionPhase === 'function') forceModel.beginPositionPhase();
    try {
      const measure = deps().perfBaseline?.measure;
      const measureForce = caller => () => recomputeAuthoritativeForces(caller, allActive);
      measure ? measure('interacting_force_ms', measureForce('local_step.initial_force')) : measureForce('local_step.initial_force')();
      if (isGrEnabled()) {
      ensureVelocityScratch(list.length);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        scratchVx[i] = b.vx;
        scratchVy[i] = b.vy;
        scratchVz[i] = b.vz;
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if ((b.bh && isCentralFramePinned()) || b.captured || isKerrOwned(b)) continue;
          if (b.field && lane) continue;
          b.vx = scratchVx[i] + b.ax * h;
          b.vy = scratchVy[i] + b.ay * h;
          b.vz = scratchVz[i] + b.az * h;
        }
        measure ? measure('interacting_force_ms', measureForce('local_step.fixed_point_force')) : measureForce('local_step.fixed_point_force')();
      }
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if ((b.bh && isCentralFramePinned()) || b.captured || isKerrOwned(b)) continue;
        if (b.field && lane) continue;
        b.vx = scratchVx[i] + b.ax * h;
        b.vy = scratchVy[i] + b.ay * h;
        b.vz = scratchVz[i] + b.az * h;
      }
      } else {
        for (const b of list) {
          if ((b.bh && isCentralFramePinned()) || b.captured || isKerrOwned(b)) continue;
          if (b.field && lane) continue;
          relKick(b, h);
        }
      }
    } finally {
      if (p1Phase && typeof forceModel.endPositionPhase === 'function') forceModel.endPositionPhase();
    }
    if (automatic) {
      const endSimT = typeof deps().getSimTime === 'function' ? deps().getSimTime() + dt : undefined;
      for (let i = 1; i < list.length; i++) {
        const body = list[i];
        if (!body.captured && isKerrOwned(body)) applyKerrMutualKick(body, bh, dt, kerrAdapter, endSimT, trace, 'end');
      }
    }
    if (trace) trace.stepSummary({ kerrOwnedBodies: kerrBodies.length, halfKicksApplied: kerrBodies.length * 2, maxMutualAcceleration: Math.max(0, ...kerrBodies.map(body => Math.hypot(body.aMutual?.x || 0, body.aMutual?.y || 0, body.aMutual?.z || 0))), maxMutualDeltaV: Math.max(0, ...kerrBodies.map(body => Math.hypot((body.aMutual?.x || 0) * dt * 0.5, (body.aMutual?.y || 0) * dt * 0.5, (body.aMutual?.z || 0) * dt * 0.5))) });
    if (lane && shouldAccumulateFieldLane()) {
      const measure = deps().perfBaseline?.measure;
      const fieldBodyCount = deps().perfBaseline?.isRecording?.() ? list.filter(b => b && b.field && !b.captured).length : 0;
      deps().perfBaseline?.recordAttribution?.('field_lane', { active: true, fieldBodies: fieldBodyCount });
      measure ? measure('field_lane_ms', () => lane.accumulate(list, dt)) : lane.accumulate(list, dt);
    } else if (deps().perfBaseline?.isRecording?.()) {
      deps().perfBaseline.recordAttribution?.('field_lane', { active: false, fieldBodies: list.filter(b => b && b.field && !b.captured).length, reason: lane ? 'accumulation-suspended' : 'lane-unavailable' });
    }
    // D0-PIN-01: same gate as the top-of-step reset. When unpinned, the
    // BH's freshly computed acceleration/velocity are retained rather than
    // discarded, and its position was already advanced above (it was not
    // skipped by the b.bh guard in that case).
    if (isCentralFramePinned()) {
      bh.ax = bh.ay = bh.az = 0;
      bh.vx = bh.vy = bh.vz = 0;
    }
    // Scientific tracing is opt-in and selected-body only.  It observes the
    // committed world state after the clock advances; disabled tracing adds
    // only this null-safe branch and no serialization work.
    commitStepLifecycle(dt, stepStartSimT, { branch: 'ordinary' });
  }

  function getActiveFidelityMode() { return activeFidelityMode; }

  function resetRunState() { activeFidelityMode = null; }

  // Restart seam: rebuild ownership/canonical admission from authoritative
  // world state without advancing time. This deliberately exposes the exact
  // admission helper already used at the start of physicsStep; it does not
  // create a second ownership policy or restore serialized runtime caches.
  function rebuildFidelityOwnership() {
    const list = getBodies();
    syncFidelityMode(list);
    ensureFidelityOwnership(list);
    return list;
  }

  SGRA.Physics.LocalStepIntegrator = Object.freeze({
    configure, enforcePinnedBHFrame, relKick, physicsStep,
    kickSelectedBodies, driftSelectedOrdinaryBodies,
    advanceSelectedKerrBodies, observeStepLifecycle,
    recomputeAuthoritativeForces,
    syncFidelityMode, rebuildFidelityOwnership, getActiveFidelityMode,
    resetRunState, isKerrOwned, beginStepLifecycle, notifyStepStarted,
    commitStepLifecycle, applySelectedKerrMutualKick
  });
})(window);
