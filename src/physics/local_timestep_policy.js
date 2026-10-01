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
  const EPS2_BH = Constants.EPS2_BH;
  const EPS2_SS = Constants.EPS2_SS;
  const DT_MIN = Constants.DT_MIN;
  const DT_MAX = Constants.DT_MAX;
  const DT_SAFETY_DYN = Number.isFinite(Constants.DT_SAFETY_DYN) ? Constants.DT_SAFETY_DYN : Constants.DT_SAFETY;
  const DT_SAFETY_PN = Number.isFinite(Constants.DT_SAFETY_PN) ? Constants.DT_SAFETY_PN : Constants.DT_SAFETY;
  const DT_PERI_STEPS = Number.isFinite(Constants.DT_PERI_STEPS) ? Constants.DT_PERI_STEPS : 32;
  const frameStats = {
    floorHits: 0,
    worstFloorRatio: 1,
    periLimiterHits: 0,
    periFloorHits: 0,
    relLimiterHits: 0,
    ltLimiterHits: 0,
    worstAPN: 0,
    worstALT: 0,
    lastPick: null
  };

  let configuredDeps = null;
  function configure(port) {
    if (!port || typeof port.getBodies !== 'function' || typeof port.isGrEnabled !== 'function') {
      throw new TypeError('LocalTimestepPolicy requires explicit world and mode ports');
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

  function assertFiniteBodyState(body, index) {
    const label = body && (body.id ?? body.name) != null ? `body ${body.id ?? body.name}` : `body index ${index}`;
    const required = ['m', 'x', 'y', 'z', 'vx', 'vy', 'vz'];
    for (const field of required) {
      if (!Number.isFinite(body?.[field])) {
        const error = new Error(`TIMESTEP_SELECTION_FAILED: non-finite ${field} in ${label}`);
        error.code = 'TIMESTEP_SELECTION_FAILED';
        error.reason = 'non-finite-body-state';
        error.bodyId = body?.id ?? null;
        error.bodyName = body?.name ?? null;
        error.field = field;
        error.value = body?.[field];
        throw error;
      }
    }
  }

  function validateTimestepInputs(list) {
    if (!Array.isArray(list) || list.length === 0 || !list[0]) {
      const error = new Error('TIMESTEP_SELECTION_FAILED: missing black-hole state');
      error.code = 'TIMESTEP_SELECTION_FAILED';
      error.reason = 'missing-black-hole-state';
      throw error;
    }
    assertFiniteBodyState(list[0], 0);
    for (let i = 1; i < list.length; i++) {
      const body = list[i];
      // Captured and field bodies are not consumed by this timestep policy;
      // active participants must be finite before any limiter is evaluated.
      if (body && !body.field && !body.captured) assertFiniteBodyState(body, i);
    }
  }

  function isGrEnabled() {
    return deps().isGrEnabled();
  }

  function shouldUsePeriTimestep(body) {
    const d = deps();
    if (typeof d.shouldUsePeriTimestep === 'function') return !!d.shouldUsePeriTimestep(body);
    // Candidate-B production default: future-pericentre limiting is an
    // explicit diagnostic/test capability, never an implicit body trait.
    return false;
  }

  function ordinaryTimestepComponents(body, bh) {
    const rx = body.x - bh.x, ry = body.y - bh.y, rz = body.z - bh.z;
    const r = Math.hypot(rx, ry, rz);
    const td = Math.sqrt(r * r * r / (G * (bh.m + body.m)));
    const vx = body.vx - bh.vx, vy = body.vy - bh.vy, vz = body.vz - bh.vz;
    const v = Math.hypot(vx, vy, vz);
    const courant = v > 0 ? r / (10 * v) : 1e9;
    return { r, td, v, courant, ordinary: Math.min(DT_SAFETY_DYN * td, courant) };
  }

  // Shared per-body authority for rung planning. Pair limits remain a graph
  // constraint, matching SGRA-LLD-001: the ordinary body demand is the
  // central dynamical/Courant demand plus the existing relativistic and
  // optional periapsis limits.
  function computeRequiredDt(body, bh, context = {}) {
    if (!body || !bh || body.bh || body.field || body.captured) return null;
    assertFiniteBodyState(body, -1);
    assertFiniteBodyState(bh, 0);
    const grEnabled = context.grEnabled == null ? !!isGrEnabled() : !!context.grEnabled;
    const components = ordinaryTimestepComponents(body, bh);
    const { r, td, v, ordinary } = components;
    if (!(r > 0)) return null;
    let required = ordinary;
    if (grEnabled) {
      const aPN = body.aPN || 0;
      const aLT = body.aLT || 0;
      const aRel = aPN + aLT;
      if (aRel && v > 0) required = Math.min(required, DT_SAFETY_PN * v / Math.max(aRel, 1e-30));
    }
    const peri = intruderPeriLimit(body, bh);
    if (peri) required = Math.min(required, peri.limit);
    return Math.min(DT_MAX, Math.max(DT_MIN, required));
  }

  // Shared pair limiter authority used by the constraint graph. This is the
  // same formula and EPS2_SS floor as the existing global picker.
  function computePairDt(a, b) {
    if (!a || !b || a.field || b.field || a.captured || b.captured) return null;
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    const d = Math.sqrt(Math.max(dx * dx + dy * dy + dz * dz, EPS2_SS));
    const pdDyn = Math.sqrt(d * d * d / (G * Math.max(a.m + b.m, 1))) * 0.05;
    const dvx = a.vx - b.vx, dvy = a.vy - b.vy, dvz = a.vz - b.vz;
    const dv = Math.hypot(dvx, dvy, dvz);
    const pdCour = dv > 0 ? d / (20 * dv) : 1e9;
    return Math.min(pdDyn, pdCour);
  }

  function resetFrameStats() {
    frameStats.floorHits = 0;
    frameStats.worstFloorRatio = 1;
    frameStats.periLimiterHits = 0;
    frameStats.periFloorHits = 0;
    frameStats.relLimiterHits = 0;
    frameStats.ltLimiterHits = 0;
    frameStats.worstAPN = 0;
    frameStats.worstALT = 0;
    frameStats.lastPick = null;
  }

  function getFrameStats() {
    return {
      floorHits: frameStats.floorHits,
      worstFloorRatio: frameStats.worstFloorRatio,
      periLimiterHits: frameStats.periLimiterHits,
      periFloorHits: frameStats.periFloorHits,
      relLimiterHits: frameStats.relLimiterHits,
      ltLimiterHits: frameStats.ltLimiterHits,
      worstAPN: frameStats.worstAPN,
      worstALT: frameStats.worstALT,
      lastPick: frameStats.lastPick ? Object.freeze({ ...frameStats.lastPick }) : null
    };
  }

  function intruderPeriLimit(body, bh) {
    if (!body || !shouldUsePeriTimestep(body) || body.field || body.captured) return null;
    const rx = body.x - bh.x;
    const ry = body.y - bh.y;
    const rz = body.z - bh.z;
    const vx = body.vx - bh.vx;
    const vy = body.vy - bh.vy;
    const vz = body.vz - bh.vz;
    const r = Math.hypot(rx, ry, rz);
    if (!(r > 0)) return null;
    const v2 = vx * vx + vy * vy + vz * vz;
    const mu = G * (bh.m + body.m);
    if (!(mu > 0) || !Number.isFinite(v2)) return null;
    const hx = ry * vz - rz * vy;
    const hy = rz * vx - rx * vz;
    const hz = rx * vy - ry * vx;
    const h = Math.hypot(hx, hy, hz);
    if (!(h > 0)) return null;
    const invR = 1 / r;
    const ex = (vy * hz - vz * hy) / mu - rx * invR;
    const ey = (vz * hx - vx * hz) / mu - ry * invR;
    const ez = (vx * hy - vy * hx) / mu - rz * invR;
    const e = Math.hypot(ex, ey, ez);
    const denom = 1 + e;
    if (!(denom > 1e-12)) return null;
    const rp = (h * h) / (mu * denom);
    if (!(rp > 0) || !Number.isFinite(rp)) return null;
    const vp = h / rp;
    if (!(vp > 0) || !Number.isFinite(vp)) return null;
    const tauPeri = rp / vp;
    const phaseScale = Math.max(1, r / rp);
    const limit = (tauPeri * phaseScale) / DT_PERI_STEPS;
    if (!(limit > 0) || !Number.isFinite(limit)) return null;
    return {
      bodyId: body.id,
      bodyName: body.name || '',
      r,
      rp,
      vp,
      tauPeri,
      phaseScale,
      limit
    };
  }

  // PERF-01: reusable index buffer, separate instance from
  // local_force_model.js's (each module owns its own singleton; pickDt() and
  // computeAccel() are never concurrently reentrant, but keeping them
  // separate avoids any coupling between the two modules' internal state).
  const interactingSet = SGRA.Physics.createPhysicsIndexSet ? SGRA.Physics.createPhysicsIndexSet(32) : null;

  function pickDt() {
    const perf = deps().perfBaseline;
    if (perf?.isRecording?.()) return perf.measure('pick_dt_ms', pickDtUnmeasured);
    return pickDtUnmeasured();
  }

  function pickDtUnmeasured() {
    const list = getBodies();
    const dutyMeasurement = deps().dutyMeasurement;
    const measureDuty = dutyMeasurement?.enabled === true;
    const attribute = deps().observer?.timestepAttributionEnabled?.() === true;
    validateTimestepInputs(list);
    const bh = list[0];
    if (interactingSet) interactingSet.reset();
    const interacting = interactingSet || [];
    let t_dyn = 1e9, t_courant = 1e9, ordinaryWinner = null;
    for (let i = 1; i < list.length; i++) {
      const b = list[i];
      if (b.field || b.captured) continue;
      if (interactingSet) interactingSet.push(i); else interacting.push(i);
      if (shouldUsePeriTimestep(b)) continue;
      const components = ordinaryTimestepComponents(b, bh);
      const { r, td, v } = components;
      if (td < t_dyn) t_dyn = td;
      if (v > 0) t_courant = Math.min(t_courant, components.courant);
        if (attribute || measureDuty) {
        const candidate = components.ordinary;
        if (!ordinaryWinner || candidate < ordinaryWinner.value) ordinaryWinner = { bodyId: b.id, bodyName: b.name || '', role: b.role || (b.intr ? 'intruder' : 'body'), owner: b.__fidelityOwnership?.owner || 'N', value: candidate, radius: r, speed: v, dynamical_dt: DT_SAFETY_DYN * td, courant_dt: v > 0 ? r / (10 * v) : 1e9 };
      }
    }
    const interactingLen = interactingSet ? interactingSet.length : interacting.length;
    const interactingAt = interactingSet ? (k) => interactingSet.get(k) : (k) => interacting[k];
    let pairDt = 1e9, pairWinner = null;
    for (let ii = 0; ii < interactingLen; ii++) {
      const i = interactingAt(ii);
      for (let jj = ii + 1; jj < interactingLen; jj++) {
        const j = interactingAt(jj);
        const dx = list[i].x - list[j].x, dy = list[i].y - list[j].y, dz = list[i].z - list[j].z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const d = Math.sqrt(Math.max(d2, EPS2_SS));
        const m = list[i].m + list[j].m;
        const pdDyn = Math.sqrt(d * d * d / (G * Math.max(m, 1))) * 0.05;
        const dvx = list[i].vx - list[j].vx, dvy = list[i].vy - list[j].vy, dvz = list[i].vz - list[j].vz;
        const dv = Math.hypot(dvx, dvy, dvz);
        const pdCour = dv > 0 ? d / (20 * dv) : 1e9;
        if (pdDyn < pairDt) { pairDt = pdDyn; if (attribute || measureDuty) pairWinner = { bodyId: list[i].id, bodyName: list[i].name || '', secondBodyId: list[j].id, secondBodyName: list[j].name || '', kind: 'pair-dynamical', separation: d, relativeSpeed: dv, candidate: pdDyn }; }
        if (pdCour < pairDt) { pairDt = pdCour; if (attribute || measureDuty) pairWinner = { bodyId: list[i].id, bodyName: list[i].name || '', secondBodyId: list[j].id, secondBodyName: list[j].name || '', kind: 'pair-courant', separation: d, relativeSpeed: dv, candidate: pdCour }; }
      }
    }
    // Relativistic timestep limiter. This is the EXISTING 1PN limiter with
    // aLT folded in as a sibling term, not a new law:
    //
    //     aRel  = aPN + aLT
    //     dtRel = DT_SAFETY_PN * v / max(aRel, tiny)
    //
    // Deliberately NOT an r^-3.5 spin timestep law -- no evidence supports
    // inventing one, and the measured LT acceleration is already the quantity
    // the limiter cares about. The sum (rather than a hypot) is the
    // conservative choice: the two terms are not generally aligned, so
    // |aPN + aLT| <= aPN + aLT, and this can only ever pick a SMALLER step
    // than the true combined magnitude would.
    //
    // At aStar = 0, aLT is exactly 0 for every body, so this reduces
    // bit-identically to the previous expression.
    let pnDt = 1e9;
    let relMaxAPN = 0, relMaxALT = 0, relMaxARel = 0, pnWinner = null;
    let ltBinding = false;
    if (isGrEnabled()) {
      for (let i = 1; i < list.length; i++) {
        const b = list[i];
        if (b.field || b.captured) continue;
        const aPN = b.aPN || 0;
        const aLT = b.aLT || 0;
        const aRel = aPN + aLT;
        if (aPN > relMaxAPN) relMaxAPN = aPN;
        if (aLT > relMaxALT) relMaxALT = aLT;
        if (aRel > relMaxARel) relMaxARel = aRel;
        if (!aRel) continue;
        const v = Math.hypot(b.vx - bh.vx, b.vy - bh.vy, b.vz - bh.vz);
        if (v > 0) {
          const dtRel = DT_SAFETY_PN * v / Math.max(aRel, 1e-30);
          if (dtRel < pnDt) {
            pnDt = dtRel;
            if (attribute || measureDuty) pnWinner = { bodyId: b.id, bodyName: b.name || '', owner: b.__fidelityOwnership?.owner || 'N', candidate: dtRel, speed: v, acceleration: aRel, aPN, aLT };
            // "LT binding" = for the body that sets the relativistic limit,
            // omitting aLT would have chosen a materially larger step.
            ltBinding = aLT > 0 && aLT > 1e-3 * aPN;
          }
        }
      }
    }
    // Candidate-B keeps the future-pericentre limiter diagnostic-only.  The
    // explicit dependency seam permits controlled restoration for calibration
    // and comparison without changing the ordinary production default.
    let periDt = 1e9;
    let periInfo = null;
    for (let i = 1; i < list.length; i++) {
      const info = intruderPeriLimit(list[i], bh);
      if (!info) continue;
      if (info.limit < periDt) {
        periDt = info.limit;
        periInfo = info;
      }
    }
    const ordinaryDt = Math.min(DT_SAFETY_DYN * t_dyn, t_courant);
    const safeDt = Math.min(ordinaryDt, pairDt, pnDt, periDt);
    let attribution = null;
    if (attribute) {
      const candidates = [{ criterion: 'ordinary', value: ordinaryDt, owner: ordinaryWinner }, { criterion: 'pair', value: pairDt, owner: pairWinner }, { criterion: 'pn', value: pnDt, owner: pnWinner }, { criterion: 'peri', value: periDt, owner: periInfo }].filter(c => Number.isFinite(c.value) && c.value < 1e9);
      const selected = candidates.reduce((a, c) => !a || c.value < a.value ? c : a, null);
      attribution = selected ? { criterion: selected.criterion, candidateDt: selected.value, owner: selected.owner } : { criterion: 'other', candidateDt: safeDt, owner: null };
    }
    const periActive = periDt < 1e9 && periDt <= safeDt * (1 + 1e-12);
    if (periActive) frameStats.periLimiterHits += 1;
    if (safeDt < DT_MIN) {
      frameStats.floorHits += 1;
      frameStats.worstFloorRatio = Math.min(frameStats.worstFloorRatio, safeDt / DT_MIN);
      if (periActive) frameStats.periFloorHits += 1;
    }
    frameStats.lastPick = {
      ordinaryDt,
      pairDt,
      pnDt,
      periDt,
      unclampedDt: safeDt,
      returnedDt: Math.min(DT_MAX, Math.max(DT_MIN, safeDt)),
      periActive,
      floorApplied: safeDt < DT_MIN,
      periInfo,
      // Gate 7 instrumentation: is the relativistic term the binding limiter,
      // and is LT a material part of it?
      relMaxAPN,
      relMaxALT,
      relMaxARel,
      relActive: pnDt < 1e9 && pnDt <= safeDt * (1 + 1e-12),
      ltContributesToLimiter: ltBinding
    };
    if (frameStats.lastPick.relActive) {
      frameStats.relLimiterHits += 1;
      if (ltBinding) frameStats.ltLimiterHits += 1;
    }
    if (relMaxALT > frameStats.worstALT) frameStats.worstALT = relMaxALT;
    if (relMaxAPN > frameStats.worstAPN) frameStats.worstAPN = relMaxAPN;
    // R4 Step 3/5: optional observer hook, no-op by default. Reports the
    // exact value about to be returned plus periapsis-limiter state --
    // this is what Step 5's per-run timestep provenance will consume.
    deps().observer?.timestep_selected?.({ dt: frameStats.lastPick.returnedDt, periActive, attribution, simT: typeof deps().getSimTime === 'function' ? deps().getSimTime() : undefined });
    if (measureDuty) {
      const kerrState = SGRA.Physics.CentralFidelityOwnership?.STATE;
      const kerrOwnedCandidates = kerrState ? list.filter(b => b && !b.bh && !b.field && !b.captured && b.__fidelityOwnership?.owner === kerrState.KERR_ACTIVE) : [];
      dutyMeasurement.timestepSelected({ ...frameStats.lastPick, bodies: list, bh, G, safetyDyn: DT_SAFETY_DYN, ordinaryWinner, pairWinner, pnWinner, kerrOwnedCandidateCount: kerrOwnedCandidates.length, aMutualMaxAtPick: kerrOwnedCandidates.reduce((max, b) => Math.max(max, Math.hypot(b.aMutual?.x || 0, b.aMutual?.y || 0, b.aMutual?.z || 0)), 0) });
    }
    return frameStats.lastPick.returnedDt;
  }

  SGRA.Physics.LocalTimestepPolicy = Object.freeze({ configure, pickDt, resetFrameStats, getFrameStats, computeRequiredDt, computePairDt });
})(window);
