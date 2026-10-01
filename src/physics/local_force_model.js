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
  const R_CAP_FAC = Constants.R_CAP_FAC;
  const C_AUYR = Constants.C_AUYR;
  const pnScratch = { x: 0, y: 0, z: 0, magnitude: 0 };
  const ltScratch = { x: 0, y: 0, z: 0, magnitude: 0 };
  const ltArgs = {
    g: 0, c2: 0, pnScale: 0, ltDamp: 0, rTrue: 0, rSafe: 0,
    jx: 0, jy: 0, jz: 0, rx: 0, ry: 0, rz: 0, vx: 0, vy: 0, vz: 0
  };
  const centralPolicyContext = {};
  const centralPolicyEvaluation = {};
  const centralRelativeState = {};
  const centralPolicyModelState = { pnScale: 0, pnEnabled: true, aStar: 0, ltEnabled: true, spinAxisSign: 1 };
  const centralPolicyDeps = { G, C2, C_AUYR, R_CAP_FAC };

  let configuredDeps = null;
  function configure(port) {
    if (!port || typeof port.getBodies !== 'function' || typeof port.isGrEnabled !== 'function' || typeof port.getPnRamp !== 'function' || typeof port.isCuspEnabled !== 'function') {
      throw new TypeError('LocalForceModel requires explicit world and mode ports');
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

  function isGrEnabled() {
    return deps().isGrEnabled();
  }

  function isKerrOwned(body) {
    const d = deps();
    return typeof d.isAutomaticFidelityEnabled === 'function'
      && d.isAutomaticFidelityEnabled()
      && body?.__fidelityOwnership?.owner === SGRA.Physics.CentralFidelityOwnership?.STATE.KERR_ACTIVE;
  }

  function getPnRamp() {
    return deps().getPnRamp();
  }

  function isCuspEnabled() {
    return deps().isCuspEnabled();
  }

  // Spin remains optional for validated Schwarzschild/headless fixtures; the
  // browser composition root supplies the authoritative runtime values.
  function getSpinMagnitude() {
    const d = deps();
    if (typeof d.getSpinMagnitude === 'function') {
      const value = d.getSpinMagnitude();
      return Number.isFinite(value) ? value : 0;
    }
    return 0;
  }

  // Diagnostic-only reversal seam; see central_relativistic_policy.js.
  function getSpinAxisSign() {
    const d = deps();
    if (typeof d.getSpinAxisSign === 'function') return d.getSpinAxisSign() === -1 ? -1 : 1;
    return 1;
  }

  // D0-PIN-01: diagnostic unpinned sandbox mode. Default TRUE (pinned) when
  // unwired -- normal interactive production never wires this dep, so this
  // is a no-op there and pinned-mode output is bitwise unchanged. Only the
  // sandbox's own explicit test port (bench/production_sandbox.mjs) may
  // override it, and only via an explicit central_frame_mode value, never
  // through any UI/URL/ordinary runtime configuration.
  function isCentralFramePinned() {
    const d = deps();
    if (typeof d.isCentralFramePinnedForSandbox === 'function') return d.isCentralFramePinnedForSandbox();
    return true;
  }

  const CUSP_M0 = Constants.CUSP_M0, CUSP_R0 = Constants.CUSP_R0;

  /**
   * Sole definition of the total acceleration on a passive field star:
   * BH point-mass monopole + extended-mass cusp term, nothing else (field
   * stars never backreact, never interact with each other, and never
   * receive a GR/cusp-independent PN correction -- confirmed in
   * body_roles.js::pairInteractionCode and the GR loop below, which both
   * exclude s.field).
   *
   * Called from computeAccel()'s fallback field-star path (when the
   * independent lane is unavailable) AND from FieldTracerLane.integrateBatch() -- this is the fix for the P4 cusp-
   * omission bug (see P4_ROOT_CAUSE_AND_FIX.md sec 2): the lane previously
   * had its own separate, incomplete copy of this force law (BH monopole
   * only, missing cusp), which diverged from computeAccel()'s actual
   * field-star force whenever the cusp toggle was on. Two independent
   * implementations of "the force on a field star" is exactly the bug --
   * there must be exactly one, called from both sites.
   *
   * Writes into `out` (three fields ax/ay/az) rather than allocating, since
   * this runs in the lane's per-batch hot path and P1's allocation
   * discipline applies (called twice per field star per batch).
   *
   * @param {object} b body (field star) with x,y,z
   * @param {object} bh black hole body with x,y,z,m
   * @param {boolean} cuspEnabled resolved by the caller via isCuspEnabled() --
   *   NOT cached, the toggle is live at runtime
   * @param {object} out { ax, ay, az } written in place
   */
  function fieldStarAccel(b, bh, cuspEnabled, out) {
    const epsBh = Math.max(EPS2_BH, (2 * G * bh.m / C2) ** 2);
    const dx = b.x - bh.x, dy = b.y - bh.y, dz = b.z - bh.z;
    const r2 = dx * dx + dy * dy + dz * dz + epsBh;
    const inv = G / (r2 * Math.sqrt(r2));
    let ax = -inv * bh.m * dx;
    let ay = -inv * bh.m * dy;
    let az = -inv * bh.m * dz;
    if (cuspEnabled) {
      const r = Math.hypot(dx, dy, dz);
      if (r >= 1) {
        const ca = G * CUSP_M0 * Math.pow(r / CUSP_R0, 1.5) / (r * r * r);
        ax -= ca * dx; ay -= ca * dy; az -= ca * dz;
      }
    }
    out.ax = ax; out.ay = ay; out.az = az;
    return out;
  }

  // PERF-01: reusable index buffer replacing a fresh `interacting = []` on
  // every call (this function runs up to 4x per substep when GR is enabled).
  // Module-level singleton is safe: computeAccel() is synchronous and never
  // reentrant, and the set is fully rebuilt (reset + repopulated) at the top
  // of every call before any read.
  const interactingSet = SGRA.Physics.createPhysicsIndexSet ? SGRA.Physics.createPhysicsIndexSet(32) : null;
  // P4 performance repair: reusable fallback scratch. This used to be created
  // inside computeAccel(), allocating once per force evaluation in the hottest
  // loop (up to four evaluations per fine substep with GR enabled).
  const fieldAccelScratch = { ax: 0, ay: 0, az: 0 };

  // R4.1: force-evaluation identity. This is run-scoped telemetry in the
  // browser composition root, so init() explicitly resets it for a new run.
  let forceEvalCounter = 0;
  // P1: cache only position-dependent terms during one fixed-point phase.
  // The cache is deliberately phase-scoped and never survives endPositionPhase().
  let positionPhaseActive = false;
  let positionPhaseEnabled = true;
  let posCacheValid = false;
  let posCacheLength = -1;
  let positionPhaseBeginCount = 0;
  let positionPhasePopulationCount = 0;
  let positionPhaseReuseCount = 0;
  let posAx = new Float64Array(0), posAy = new Float64Array(0), posAz = new Float64Array(0);
  let posMx = new Float64Array(0), posMy = new Float64Array(0), posMz = new Float64Array(0);
  let posBhAx = 0, posBhAy = 0, posBhAz = 0;

  // Cached force validity is deliberately separate from the position-phase
  // cache above. The lifecycle authorities explicitly invalidate this bit;
  // normal integrator-internal x/v evolution does not.
  let forceStateValid = false;
  let repairPrimeCount = 0;

  function ensurePositionCache(length) {
    if (posAx.length >= length) return;
    posAx = new Float64Array(length); posAy = new Float64Array(length); posAz = new Float64Array(length);
    posMx = new Float64Array(length); posMy = new Float64Array(length); posMz = new Float64Array(length);
  }

  function beginPositionPhase() {
    positionPhaseActive = positionPhaseEnabled;
    positionPhaseBeginCount += 1;
    posCacheValid = false;
    posCacheLength = -1;
  }

  function endPositionPhase() {
    positionPhaseActive = false;
    posCacheValid = false;
    posCacheLength = -1;
  }

  function setPositionPhaseEnabledForTest(enabled) {
    positionPhaseEnabled = enabled === true;
    if (!positionPhaseEnabled) endPositionPhase();
  }

  function invalidateForceState() { forceStateValid = false; }

  function ensureValid(caller = 'local_step.ensure_valid') {
    if (forceStateValid) return false;
    repairPrimeCount += 1;
    computeAccel(caller);
    return true;
  }

  function getPositionPhaseTelemetry() {
    return Object.freeze({
      enabled: positionPhaseEnabled,
      active: positionPhaseActive,
      positionPhaseBeginCount,
      positionPhasePopulationCount,
      positionPhaseReuseCount
    });
  }

  // Authoritative force-class extraction. These functions are the only
  // implementations used by computeAccel() and are deliberately written in
  // the same order as the historical combined evaluation. The `base` central
  // stage must precede near pairs; the relativistic central stage follows the
  // pairwise Newtonian observation, preserving floating-point ordering.
  function clearForceBuffers(list) {
    for (const b of list) {
      b.ax = 0; b.ay = 0; b.az = 0; b.aPN = 0; b.aLT = 0;
      b.aMutual = b.aMutual || { x: 0, y: 0, z: 0 };
      b.aMutual.x = 0; b.aMutual.y = 0; b.aMutual.z = 0;
      b.aNear = b.aNear || { x: 0, y: 0, z: 0 };
      b.aFar = b.aFar || { x: 0, y: 0, z: 0 };
      b.aNear.x = 0; b.aNear.y = 0; b.aNear.z = 0;
      b.aFar.x = 0; b.aFar.y = 0; b.aFar.z = 0;
    }
    if (interactingSet) interactingSet.reset();
  }

  function evaluateCentralForces(list, bh, context, stage = 'base') {
    if (stage === 'base') {
      const interacting = interactingSet || [];
      context.interacting = interacting;
      for (let j = 1; j < list.length; j++) {
        const b = list[j];
        if (b.captured) continue;
        if (b.field) {
          if (context.fieldLaneActive) continue;
          fieldStarAccel(b, bh, context.cuspEnabled, fieldAccelScratch);
          b.ax += fieldAccelScratch.ax; b.ay += fieldAccelScratch.ay; b.az += fieldAccelScratch.az;
          continue;
        }
        if (interactingSet) interactingSet.push(j); else interacting.push(j);
        const epsBh = Math.max(EPS2_BH, (2 * G * bh.m / C2) ** 2);
        const dx = b.x - bh.x, dy = b.y - bh.y, dz = b.z - bh.z;
        const r2 = dx * dx + dy * dy + dz * dz + epsBh;
        const inv = G / (r2 * Math.sqrt(r2));
        bh.ax += inv * b.m * dx; bh.ay += inv * b.m * dy; bh.az += inv * b.m * dz;
        b.ax -= inv * bh.m * dx; b.ay -= inv * bh.m * dy; b.az -= inv * bh.m * dz;
      }
      return;
    }
    if (stage !== 'relativistic') return;
    // BUGFIX (found via tests/production_sandbox.test.mjs R4.3): cusp
    // physics is architecturally independent of GR (per the design intent
    // this test documents), but this single early-return previously gated
    // BOTH the PN/LT section AND the cusp section on `context.grEnabled`,
    // so cuspOn:true silently produced no cusp acceleration whenever GR was
    // off. PN/LT remains exactly as before (still requires grEnabled,
    // wrapped in the same `if` rather than an early return); cusp now runs
    // whenever cuspEnabled is true, regardless of grEnabled. No change to
    // PN/LT numerics, thresholds, or the cusp force equation itself.
    if (context.grEnabled) {
    const policy = SGRA.Physics.CentralRelativisticPolicy;
    if (!policy) throw new Error('CentralRelativisticPolicy is not loaded');
    centralPolicyModelState.pnScale = getPnRamp();
    centralPolicyModelState.pnEnabled = true;
    centralPolicyModelState.aStar = getSpinMagnitude();
    centralPolicyModelState.ltEnabled = true;
    centralPolicyModelState.spinAxisSign = getSpinAxisSign();
    policy.prepareCentralContext(bh, centralPolicyModelState, centralPolicyDeps, centralPolicyContext);
    if (centralPolicyContext.ltEnabled && typeof SGRA.Physics.computeCentralSpinOrbitAcceleration !== 'function') {
      throw new Error('central_spin_orbit.js is not loaded but spin is non-zero; refusing to run silently without the 1.5PN spin-orbit term.');
    }
    for (let i = 1; i < list.length; i++) {
      const s = list[i];
      if (s.field || s.captured || isKerrOwned(s)) continue;
      if (context.activeMask && !context.activeMask[i]) continue;
      centralRelativeState.rx = s.x - bh.x;
      centralRelativeState.ry = s.y - bh.y;
      centralRelativeState.rz = s.z - bh.z;
      centralRelativeState.vx = s.vx - bh.vx;
      centralRelativeState.vy = s.vy - bh.vy;
      centralRelativeState.vz = s.vz - bh.vz;
      policy.evaluateBody(centralPolicyContext, s, centralRelativeState, centralPolicyEvaluation);
      const evaluation = centralPolicyEvaluation;
      s.__pnValidity = evaluation.validity;
      s.__pnDamp = evaluation.pnDamp;
      if (!evaluation.pnEnabled) continue;
      SGRA.Physics.computeCentral1PnAcceleration({
        gm: centralPolicyContext.gm, c2: centralPolicyContext.c2,
        pnScale: centralPolicyContext.pnScale, pnDamp: evaluation.pnDamp,
        rSafe: evaluation.rSafe, rx: evaluation.rx, ry: evaluation.ry, rz: evaluation.rz,
        vx: evaluation.vx, vy: evaluation.vy, vz: evaluation.vz
      }, pnScratch);
      const fx = pnScratch.x, fy = pnScratch.y, fz = pnScratch.z;
      s.ax += fx; s.ay += fy; s.az += fz;
      const mr = s.m / bh.m;
      bh.ax -= fx * mr; bh.ay -= fy * mr; bh.az -= fz * mr;
      s.aPN = pnScratch.magnitude;
      context.observer?.pn_acceleration_computed?.({ runId: context.runId, forceEvalIndex: context.forceEvalIndex, bodyId: s.id, simT: context.getSimT ? context.getSimT() : undefined, ax: fx, ay: fy, az: fz, phase: 'pn' });
      if (!evaluation.ltEnabled) continue;
      ltArgs.g = centralPolicyContext.g; ltArgs.c2 = centralPolicyContext.c2;
      ltArgs.pnScale = centralPolicyContext.pnScale; ltArgs.ltDamp = evaluation.ltDamp;
      ltArgs.rTrue = evaluation.rTrue; ltArgs.rSafe = evaluation.rSafe;
      ltArgs.jx = centralPolicyContext.jx; ltArgs.jy = centralPolicyContext.jy; ltArgs.jz = centralPolicyContext.jz;
      ltArgs.rx = evaluation.rx; ltArgs.ry = evaluation.ry; ltArgs.rz = evaluation.rz;
      ltArgs.vx = evaluation.vx; ltArgs.vy = evaluation.vy; ltArgs.vz = evaluation.vz;
      SGRA.Physics.computeCentralSpinOrbitAcceleration(ltArgs, ltScratch);
      s.ax += ltScratch.x; s.ay += ltScratch.y; s.az += ltScratch.z;
      s.aLT = ltScratch.magnitude;
      context.observer?.lt_acceleration_computed?.({ runId: context.runId, forceEvalIndex: context.forceEvalIndex, bodyId: s.id, simT: context.getSimT ? context.getSimT() : undefined, ax: ltScratch.x, ay: ltScratch.y, az: ltScratch.z, phase: 'lt' });
    }
    }
    if (!context.cuspEnabled) return;
    for (let i = 1; i < list.length; i++) {
      const s = list[i];
      if (s.captured || s.field) continue;
      const rx = s.x - bh.x, ry = s.y - bh.y, rz = s.z - bh.z;
      const r = Math.hypot(rx, ry, rz); if (r < 1) continue;
      const ca = G * CUSP_M0 * Math.pow(r / CUSP_R0, 1.5) / (r * r * r);
      const cx = -ca * rx, cy = -ca * ry, cz = -ca * rz;
      s.ax += cx; s.ay += cy; s.az += cz;
      if (isKerrOwned(s)) {
        s.aMutual.x += cx; s.aMutual.y += cy; s.aMutual.z += cz;
      }
      context.observer?.cusp_acceleration_computed?.({ runId: context.runId, forceEvalIndex: context.forceEvalIndex, bodyId: s.id, simT: context.getSimT ? context.getSimT() : undefined, ax: cx, ay: cy, az: cz, phase: 'cusp' });
    }
  }

  function accumulateMutualPair(a, b, className) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const r2 = dx * dx + dy * dy + dz * dz + EPS2_SS;
    const inv = G / (r2 * Math.sqrt(r2));
    const ax = inv * b.m * dx, ay = inv * b.m * dy, az = inv * b.m * dz;
    const bx = -inv * a.m * dx, by = -inv * a.m * dy, bz = -inv * a.m * dz;
    a.ax += ax; a.ay += ay; a.az += az;
    b.ax += bx; b.ay += by; b.az += bz;
    a.aMutual.x += ax; a.aMutual.y += ay; a.aMutual.z += az;
    b.aMutual.x += bx; b.aMutual.y += by; b.aMutual.z += bz;
    const aClass = className === 'far' ? a.aFar : a.aNear;
    const bClass = className === 'far' ? b.aFar : b.aNear;
    aClass.x += ax; aClass.y += ay; aClass.z += az;
    bClass.x += bx; bClass.y += by; bClass.z += bz;
  }

  function evaluatePairClass(list, context, className) {
    const interacting = context.interacting || interactingSet || [];
    const interactingLen = interactingSet ? interactingSet.length : interacting.length;
    const interactingAt = interactingSet ? k => interactingSet.get(k) : k => interacting[k];
    // MULTIRATE FORCE MASKING (T5 perf fix): when the caller supplies an
    // activeMask, a pair whose BOTH members are inactive contributes nothing
    // that will be consumed this tick -- inactive bodies are not kicked, and
    // their accelerations are restored from the pre-clear snapshot in
    // computeAccel(). Skipping those pairs is what turns the fine-tick cost
    // from O(N^2) into O(N_active * N), which is the actual saving the rung
    // design promises. A pair with ONE active member is still evaluated in
    // full (Newton's third law is untouched; the inactive member's partial
    // accumulation is discarded by the restore).
    const activeMask = context.activeMask;
    for (let ii = 0; ii < interactingLen; ii++) {
      const i = interactingAt(ii), a = list[i];
      const aActive = activeMask ? !!activeMask[i] : true;
      for (let jj = ii + 1; jj < interactingLen; jj++) {
        const j = interactingAt(jj), b = list[j];
        if (activeMask && !aActive && !activeMask[j]) continue;
        const pairClass = typeof context.pairClassifier === 'function' ? context.pairClassifier(i, j) : 'near';
        if (pairClass === className) accumulateMutualPair(a, b, className);
      }
    }
  }

  function evaluateNearForces(list, context) { evaluatePairClass(list, context, 'near'); }
  function evaluateFarForces(list, context) { evaluatePairClass(list, context, 'far'); }

  function computeAccel(caller = 'unknown', partition = null) {
    const list = getBodies();
    const grEnabled = isGrEnabled();
    const cuspEnabled = isCuspEnabled();
    const n = list.length, bh = list[0];
    const observer = deps().observer;
    const getSimT = typeof deps().getSimTime === 'function' ? deps().getSimTime : null;
    const runId = typeof deps().getRunId === 'function' ? deps().getRunId() : undefined;
    const forceEvalIndex = forceEvalCounter++;
    observer?.force_evaluation_started?.({ runId, forceEvalIndex, simT: getSimT ? getSimT() : undefined });
    // When P4 is active, field stars are advanced exclusively by the independent
    // lane. Recomputing their acceleration in every fine interacting-body
    // substep defeats the lane and made the optimisation slower than fallback.
    const fieldLaneActive = !!SGRA.Physics.FieldTracerLane;
    const perf = deps().perfBaseline;
    if (perf?.isRecording?.()) {
      let interactingBodies = 0, fieldBodies = 0;
      for (let i = 1; i < n; i++) {
        const body = list[i];
        if (!body || body.captured) continue;
        if (body.field) fieldBodies += 1; else interactingBodies += 1;
      }
      perf.recordAttribution?.('force_evaluation', {
        caller, totalBodies: n, interactingBodies, fieldBodies,
        centralInteractions: interactingBodies,
        pairwiseInteractions: interactingBodies * Math.max(0, interactingBodies - 1) / 2
      });
    }
    const canReusePositionCache = positionPhaseActive && posCacheValid && posCacheLength === n;
    if (canReusePositionCache) {
      positionPhaseReuseCount += 1;
      for (let i = 0; i < n; i++) {
        const b = list[i];
        b.ax = posAx[i]; b.ay = posAy[i]; b.az = posAz[i]; b.aPN = 0; b.aLT = 0;
        b.aMutual = b.aMutual || { x: 0, y: 0, z: 0 };
        b.aMutual.x = posMx[i]; b.aMutual.y = posMy[i]; b.aMutual.z = posMz[i];
      }
      bh.ax = posBhAx; bh.ay = posBhAy; bh.az = posBhAz;
    } else {
      if (positionPhaseActive) posCacheValid = false;
      // MULTIRATE FORCE MASKING (T5 perf fix): with an activeMask present,
      // inactive (coarse) bodies are not force-evaluated this tick. Their
      // accelerations must therefore survive clearForceBuffers() unchanged --
      // the rung design's explicit assumption is that a coarse body carries
      // its last fully-evaluated force until its own rung boundary, where it
      // becomes active and is recomputed in full. Snapshot before clearing,
      // restore after evaluating, so masked bodies never expose a zeroed or
      // partially-accumulated acceleration to the integrator.
      const activeMask = partition?.activeMask || null;
      let savedAx = null, savedAy = null, savedAz = null, savedMx = null, savedMy = null, savedMz = null, savedPN = null, savedLT = null;
      if (activeMask) {
        savedAx = new Float64Array(n); savedAy = new Float64Array(n); savedAz = new Float64Array(n);
        savedMx = new Float64Array(n); savedMy = new Float64Array(n); savedMz = new Float64Array(n);
        savedPN = new Float64Array(n); savedLT = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          const b = list[i];
          savedAx[i] = b.ax; savedAy[i] = b.ay; savedAz[i] = b.az;
          savedMx[i] = b.aMutual ? b.aMutual.x : 0; savedMy[i] = b.aMutual ? b.aMutual.y : 0; savedMz[i] = b.aMutual ? b.aMutual.z : 0;
          savedPN[i] = b.aPN || 0; savedLT[i] = b.aLT || 0;
        }
      }
      clearForceBuffers(list);
      const forceContext = { grEnabled, cuspEnabled, fieldLaneActive, observer, runId, forceEvalIndex, getSimT,
        activeMask,
        pairClassifier: typeof partition?.pairClassifier === 'function' ? partition.pairClassifier : null };
      evaluateCentralForces(list, bh, forceContext, 'base');
      evaluateNearForces(list, forceContext);
      evaluateFarForces(list, forceContext);
      if (activeMask) {
        // index 0 is the central BH: it is always restored/accumulated
        // normally (it is never a masked target), so start at 1.
        for (let i = 1; i < n; i++) {
          if (activeMask[i]) continue;
          const b = list[i];
          b.ax = savedAx[i]; b.ay = savedAy[i]; b.az = savedAz[i];
          if (b.aMutual) { b.aMutual.x = savedMx[i]; b.aMutual.y = savedMy[i]; b.aMutual.z = savedMz[i]; }
          b.aPN = savedPN[i]; b.aLT = savedLT[i];
        }
      }
      if (positionPhaseActive) {
        ensurePositionCache(n);
        for (let i = 0; i < n; i++) {
          const b = list[i];
          posAx[i] = b.ax; posAy[i] = b.ay; posAz[i] = b.az;
          posMx[i] = b.aMutual.x; posMy[i] = b.aMutual.y; posMz[i] = b.aMutual.z;
        }
        posBhAx = bh.ax; posBhAy = bh.ay; posBhAz = bh.az;
        posCacheLength = n; posCacheValid = true; positionPhasePopulationCount += 1;
      }
    }
    // R4 Step 4: this is the exact point where every body's acceleration
    // is the complete NEWTONIAN sum (pairwise BH + pairwise interacting-set)
    // and NOTHING PN has been added yet. Capturing here, not by
    // subtracting the final total afterward, is direct observation of the
    // real production quantity -- not a re-derived approximation.
    // R4.1 correction: this is the complete PAIRWISE Newtonian sum (BH +
    // interacting-set), but it is NOT the complete Newtonian-equivalent
    // contribution when cuspOn is true -- the cusp term is added later
    // (see the cusp block below) and was NOT included in this capture in
    // an earlier draft that incorrectly called this "the complete
    // Newtonian sum" unconditionally. Renamed semantically: this event is
    // "pairwise" Newtonian; cusp is captured separately as its own event
    // so base+PN+cusp reconstructs the true total even with cuspOn:true.
    if (observer) {
      for (let i = 0; i < n; i++) {
        const b = list[i];
        if (b.field || b.captured) continue;
        observer.newtonian_acceleration_computed?.({ runId, forceEvalIndex, bodyId: b.id, simT: getSimT ? getSimT() : undefined, ax: b.ax, ay: b.ay, az: b.az, phase: 'newtonian-pairwise' });
      }
    }
    const forceContext = { grEnabled, cuspEnabled, fieldLaneActive, observer, runId, forceEvalIndex, getSimT, activeMask: partition?.activeMask || null };
    if (!partition?.skipRelativistic) evaluateCentralForces(list, bh, forceContext, 'relativistic');

    // Pinned Sgr A* frame: the central BH carries no acceleration by definition.
    // The pairwise and PN loops above accumulate backreaction onto it, which the
    // local integrator then discards. Discard it here instead, so the invariant
    // holds for every caller of computeAccel() and prevents stale non-zero
    // BH acceleration from leaking into orbital_math.oscElements.
    //
    // D0-PIN-01: in the diagnostic-unpinned sandbox mode only, the
    // accumulated Newtonian backreaction is retained instead of discarded.
    // Note (per Mark's D0-PIN-01 decision): the declared central-test-
    // particle 1PN model supplies no 1PN reaction term on the central body
    // even when unpinned -- only the Newtonian pairwise/monopole terms
    // above reach bh.ax/ay/az. A GR-on unpinned run is therefore not a
    // closed system for momentum-conservation purposes; see provenance's
    // central_frame_reaction_semantics field.
    if (isCentralFramePinned()) {
      bh.ax = 0; bh.ay = 0; bh.az = 0;
    }
    forceStateValid = true;
    observer?.force_evaluation_completed?.({ runId, forceEvalIndex, simT: getSimT ? getSimT() : undefined });
  }

  function getForceEvalCount() { return forceEvalCounter; }

  function resetRunTelemetry() {
    forceEvalCounter = 0;
    positionPhaseBeginCount = 0;
    positionPhasePopulationCount = 0;
    positionPhaseReuseCount = 0;
    positionPhaseActive = false;
    posCacheValid = false;
    posCacheLength = -1;
    invalidateForceState();
    repairPrimeCount = 0;
  }

  function getRepairPrimeCount() { return repairPrimeCount; }

  // T5 performance seam (bounded, local optimization only -- see
  // block_step_integrator.js's grFixedPointEnabled block). Applies ONLY the
  // velocity-dependent relativistic (1PN/LT) term on top of an already-known
  // invariant base, by calling the SAME evaluateCentralForces('relativistic')
  // used inside computeAccel -- no PN/LT equations are duplicated here, this
  // is context wiring only. Caller is responsible for having reset
  // list[i].ax/ay/az to the cached invariant base before calling this, and
  // for re-deriving centralAx/etc from the result afterward.
  function applyRelativisticTerm(caller = 'unknown', partition = null) {
    const list = getBodies();
    const grEnabled = isGrEnabled();
    const cuspEnabled = isCuspEnabled();
    const observer = deps().observer;
    const getSimT = typeof deps().getSimTime === 'function' ? deps().getSimTime : null;
    const runId = typeof deps().getRunId === 'function' ? deps().getRunId() : undefined;
    const forceEvalIndex = forceEvalCounter++;
    const fieldLaneActive = !!SGRA.Physics.FieldTracerLane;
    const forceContext = { grEnabled, cuspEnabled, fieldLaneActive, observer, runId, forceEvalIndex, getSimT, activeMask: partition?.activeMask || null };
    evaluateCentralForces(list, list[0], forceContext, 'relativistic');
  }

  SGRA.Physics.LocalForceModel = Object.freeze({
    configure, computeAccel, ensureValid, invalidateForceState, fieldStarAccel,
    clearForceBuffers, evaluateCentralForces, evaluateNearForces, evaluateFarForces,
    getForceEvalCount, getRepairPrimeCount, resetRunTelemetry, beginPositionPhase,
    endPositionPhase, setPositionPhaseEnabledForTest, getPositionPhaseTelemetry,
    applyRelativisticTerm
  });
})(window);
