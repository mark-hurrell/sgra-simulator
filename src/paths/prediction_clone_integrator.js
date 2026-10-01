// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachPredictionCloneIntegrator(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Paths = SGRA.Paths || {};
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

  // Newtonian and legacy-1PN prediction stepping remains local because it is
  // a prediction scheduler, but Adaptive Kerr is deliberately delegated to
  // ProductKerrRuntimeAdapter. Prediction must never become a second Kerr
  // equation/metric/DP54 authority.
  function resolveSpinMagnitude(deps) {
    if (typeof deps.getSpinMagnitude === 'function') {
      const value = deps.getSpinMagnitude();
      return Number.isFinite(value) ? value : 0;
    }
    return 0;   // unwired means zero spin, never an exception -- see local_force_model.js
  }

  function resolveSpinAxisSign(deps) {
    if (typeof deps.getSpinAxisSign === 'function') return deps.getSpinAxisSign() === -1 ? -1 : 1;
    return 1;
  }

  let cloneScratchVx = new Float64Array(0);
  let cloneScratchVy = new Float64Array(0);
  let cloneScratchVz = new Float64Array(0);

  function ensureCloneVelocityScratch(length) {
    if (cloneScratchVx.length >= length) return;
    cloneScratchVx = new Float64Array(length);
    cloneScratchVy = new Float64Array(length);
    cloneScratchVz = new Float64Array(length);
  }

  function cloneInBHFrame(deps, extraBody) {
    const allBodies = deps.getBodies();
    const bh = allBodies[0];
    const cl = allBodies.map(b => ({
      id: b.id, name: b.name, field: !!b.field, intr: !!b.intr, star: !!b.star,
      x: b.x - bh.x, y: b.y - bh.y, z: b.z - bh.z,
      vx: b.vx - bh.vx, vy: b.vy - bh.vy, vz: b.vz - bh.vz,
      ax: 0, ay: 0, az: 0, m: b.m, bh: !!b.bh, aPN: 0, aLT: 0,
      aMutual: { x: 0, y: 0, z: 0 }, captured: !!b.captured
    }));
    if (extraBody) {
      cl.push({
        x: extraBody.x, y: extraBody.y, z: extraBody.z,
        id: extraBody.id || -1, name: extraBody.name || '', field: false, intr: false, star: false,
        vx: extraBody.vx, vy: extraBody.vy, vz: extraBody.vz,
        ax: 0, ay: 0, az: 0, m: extraBody.m, bh: false, aPN: 0, aLT: 0,
        aMutual: { x: 0, y: 0, z: 0 }, captured: false
      });
    }
    return cl;
  }

  function isAdaptiveKerr(deps) {
    return typeof deps.getFidelityMode === 'function'
      ? deps.getFidelityMode() === 'adaptive_kerr'
      : false;
  }

  // AIM-PERF P1: prepareAdaptiveOwnership previously called adapter.promote()
  // unconditionally for every non-N_SAFE body on every step, including bodies
  // already KERR_ACTIVE with a perfectly valid canonical state -- a full
  // re-admission (toHatted / admitState / metricParts / massShellResidual,
  // plus a fresh Float64Array) where a no-op would do. Measured at ~20% of
  // preview wall time across three admissions (this promote, plus the two
  // readmit calls around the mutual kick in stepAdaptiveKerrClone) per Kerr
  // body per step.
  //
  // adapter.advance() already re-promotes internally when the canonical state
  // is stale (product_kerr_runtime_adapter.js: "if (body.__kerrStateStale ||
  // !body.__kerrSpinContext || body.__kerrSpinContext.signature !==
  // spinContextValue.signature) { ...promote... }"), so this promotion was
  // duplicating a check that already exists one call downstream. Skipping it
  // here when the state is demonstrably fresh cannot change any canonical
  // state -- it can only avoid recomputing an identical one.
  //
  // PROMOTE_SKIPPED_IF: owner is already KERR_ACTIVE, the classifier's own
  // decision is ALREADY_KERR (so no transition is being requested), and every
  // one of the staleness conditions adapter.advance() itself checks is absent.
  // Everything else -- first admission, a stale/missing canonical state, a
  // spin-signature mismatch, a central-mass change -- still promotes exactly
  // as before. The two readmit calls around the mutual kick in
  // stepAdaptiveKerrClone are UNCHANGED: they exist because the mutual kick
  // mutates product-space velocity, which invalidates the canonical momenta,
  // and are not touched by this optimisation.
  function kerrStateLooksFresh(body, spinContextValue) {
    const st = body.__kerrState;
    if (!(st instanceof Float64Array) || st.length !== 7) return false;
    for (let k = 0; k < 7; k++) if (!Number.isFinite(st[k])) return false;
    if (!body.__kerrUnits) return false;
    if (!body.__kerrSpinContext) return false;
    if (body.__kerrStateStale) return false;
    if (!spinContextValue || body.__kerrSpinContext.signature !== spinContextValue.signature) return false;
    return true;
  }

  function prepareAdaptiveOwnership(deps, cl) {
    const policy = SGRA.Physics.CentralFidelityOwnership;
    const adapter = SGRA.Physics.ProductKerrRuntimeAdapter;
    const orbitalMath = SGRA.Physics.OrbitalMath;
    if (!policy || !adapter || !orbitalMath) throw new Error('Adaptive Kerr prediction dependencies are unavailable');
    const bh = cl[0];
    const simT = typeof deps.getSimT === 'function' ? deps.getSimT() : 0;
    let spinContextValue = null;
    for (let i = 1; i < cl.length; i++) {
      const body = cl[i];
      if (body.field || body.captured) continue;
      body.__fidelityOwnership ||= policy.createBodyState(body.id || `prediction-${i}`);
      const state = body.__fidelityOwnership;
      const decision = policy.decide(state, body, bh, orbitalMath, simT);
      if (decision.classifier === policy.CLASSIFIER.N_SAFE) continue;
      if (state.owner === policy.STATE.KERR_ACTIVE && decision.action === policy.ACTION.ALREADY_KERR) {
        if (spinContextValue === null && typeof adapter.getSpinContext === 'function') {
          spinContextValue = adapter.getSpinContext(bh, deps) || false;
        }
        if (spinContextValue && kerrStateLooksFresh(body, spinContextValue)) {
          // Skip: promote() would leave state.owner, state.promotionTime and
          // the canonical state unchanged. Not calling it changes nothing but
          // the work done.
          continue;
        }
      }
      const admitted = adapter.promote(body, bh, simT, deps);
      if (!admitted || admitted.admitted !== true) {
        state.owner = policy.STATE.KERR_ADMISSION_FAILED;
        state.failure = admitted?.reason || 'KERR_ADMISSION_FAILED';
        throw makeKerrAdmissionError(state.failure);
      }
      state.owner = policy.STATE.KERR_ACTIVE;
      state.promotionTime = simT;
    }
  }

  function accelClone(deps, cl) {
    const n = cl.length;
    const epsBh = Math.max(deps.EPS2_BH, (2 * deps.G * cl[0].m / deps.C2) ** 2);
    const epsSs = deps.EPS2_SS;
    for (let i = 0; i < n; i++) {
      cl[i].ax = 0; cl[i].ay = 0; cl[i].az = 0; cl[i].aPN = 0; cl[i].aLT = 0;
      cl[i].aMutual.x = cl[i].aMutual.y = cl[i].aMutual.z = 0;
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = cl[i], b = cl[j];
      const code = deps.pairInteractionCode(a, b);
      if (!(code & deps.PAIR_INCLUDE)) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const eps = (a.bh || b.bh) ? epsBh : epsSs;
      const r2 = dx * dx + dy * dy + dz * dz + eps;
      const inv = deps.G / (r2 * Math.sqrt(r2));
      a.ax += inv * b.m * dx; a.ay += inv * b.m * dy; a.az += inv * b.m * dz;
      if (code & deps.PAIR_BACKREACT) {
        b.ax -= inv * a.m * dx; b.ay -= inv * a.m * dy; b.az -= inv * a.m * dz;
      }
      // AIM1-04: aMutual is the NON-CENTRAL acceleration, exactly as in
      // production (local_force_model: only body-body pairs and the cusp
      // accumulate into aMutual). A Kerr-owned body receives the black hole's
      // gravity through its geodesic; including the BH pair here made the clone
      // kick it with Newtonian central gravity as well -- double central
      // gravity, a sqrt(2)-fast fall (measured 9.9 yr vs 14.0 yr), and false
      // CAPTURED predictions for orbits production keeps bound.
      if (!(a.bh || b.bh)) {
        a.aMutual.x += inv * b.m * dx; a.aMutual.y += inv * b.m * dy; a.aMutual.z += inv * b.m * dz;
        if (code & deps.PAIR_BACKREACT) {
          b.aMutual.x -= inv * a.m * dx; b.aMutual.y -= inv * a.m * dy; b.aMutual.z -= inv * a.m * dz;
        }
      }
    }
    const bh = cl[0];
    if (deps.getGrOn()) {
      const policy = SGRA.Physics.CentralRelativisticPolicy;
      if (!policy) throw new Error('CentralRelativisticPolicy is not loaded');
      centralPolicyModelState.pnScale = deps.getPnRamp();
      centralPolicyModelState.pnEnabled = true;
      centralPolicyModelState.aStar = resolveSpinMagnitude(deps);
      centralPolicyModelState.ltEnabled = true;
      centralPolicyModelState.spinAxisSign = resolveSpinAxisSign(deps);
      policy.prepareCentralContext(bh, centralPolicyModelState, deps, centralPolicyContext);
      if (centralPolicyContext.ltEnabled && typeof SGRA.Physics.computeCentralSpinOrbitAcceleration !== 'function') {
        throw new Error('central_spin_orbit.js is not loaded but spin is non-zero; refusing to predict with Schwarzschild dynamics while the live path uses Lense-Thirring.');
      }
      for (let i = 1; i < n; i++) {
        const s = cl[i];
        if (s.field || (isAdaptiveKerr(deps) && s.__fidelityOwnership?.owner === SGRA.Physics.CentralFidelityOwnership.STATE.KERR_ACTIVE)) continue;
        centralRelativeState.rx = s.x - bh.x;
        centralRelativeState.ry = s.y - bh.y;
        centralRelativeState.rz = s.z - bh.z;
        centralRelativeState.vx = s.vx - bh.vx;
        centralRelativeState.vy = s.vy - bh.vy;
        centralRelativeState.vz = s.vz - bh.vz;
        policy.evaluateBody(
          centralPolicyContext, s, centralRelativeState, centralPolicyEvaluation
        );
        const evaluation = centralPolicyEvaluation;
        if (!evaluation.pnEnabled) continue;
        SGRA.Physics.computeCentral1PnAcceleration({
          gm: centralPolicyContext.gm,
          c2: centralPolicyContext.c2,
          pnScale: centralPolicyContext.pnScale,
          pnDamp: evaluation.pnDamp,
          rSafe: evaluation.rSafe,
          rx: evaluation.rx, ry: evaluation.ry, rz: evaluation.rz,
          vx: evaluation.vx, vy: evaluation.vy, vz: evaluation.vz
        }, pnScratch);
        const fx = pnScratch.x;
        const fy = pnScratch.y;
        const fz = pnScratch.z;
        s.ax += fx; s.ay += fy; s.az += fz;
        const mr = s.m / bh.m;
        // Mirrors local_force_model.js exactly, including the deliberate
        // asymmetry: 1PN gets a mass-weighted reaction on the central body,
        // the central-spin test-particle LT term gets none.
        bh.ax -= fx * mr; bh.ay -= fy * mr; bh.az -= fz * mr;
        s.aPN = pnScratch.magnitude;

        if (!evaluation.ltEnabled) continue;
        ltArgs.g = centralPolicyContext.g;
        ltArgs.c2 = centralPolicyContext.c2;
        ltArgs.pnScale = centralPolicyContext.pnScale;
        ltArgs.ltDamp = evaluation.ltDamp;
        ltArgs.rTrue = evaluation.rTrue;
        ltArgs.rSafe = evaluation.rSafe;
        ltArgs.jx = centralPolicyContext.jx;
        ltArgs.jy = centralPolicyContext.jy;
        ltArgs.jz = centralPolicyContext.jz;
        ltArgs.rx = evaluation.rx; ltArgs.ry = evaluation.ry; ltArgs.rz = evaluation.rz;
        ltArgs.vx = evaluation.vx; ltArgs.vy = evaluation.vy; ltArgs.vz = evaluation.vz;
        SGRA.Physics.computeCentralSpinOrbitAcceleration(ltArgs, ltScratch);
        s.ax += ltScratch.x; s.ay += ltScratch.y; s.az += ltScratch.z;
        s.aLT = ltScratch.magnitude;
      }
    }
    applyCloneCusp(deps, cl, bh);
  }

  // AIM1-06: mirror production (local_force_model cusp pass): skip
  // captured/field bodies and feed Kerr-owned bodies through aMutual,
  // otherwise the cusp force is silently lost for them in adaptive Kerr.
  function applyCloneCusp(deps, cl, bh) {
    if (!deps.getCuspOn()) return;
    const cuspM0 = deps.CUSP_M0, cuspR0 = deps.CUSP_R0, kerrMode = isAdaptiveKerr(deps);
    for (let i = 1; i < cl.length; i++) {
      const s = cl[i];
      if (s.captured || s.field) continue;
      const rx = s.x - bh.x, ry = s.y - bh.y, rz = s.z - bh.z;
      const r = Math.hypot(rx, ry, rz);
      if (r < 1) continue;
      const ca = deps.G * cuspM0 * Math.pow(r / cuspR0, 1.5) / (r * r * r);
      s.ax -= ca * rx; s.ay -= ca * ry; s.az -= ca * rz;
      if (kerrMode && s.__fidelityOwnership?.owner === SGRA.Physics.CentralFidelityOwnership.STATE.KERR_ACTIVE) {
        s.aMutual.x -= ca * rx; s.aMutual.y -= ca * ry; s.aMutual.z -= ca * rz;
      }
    }
  }

  function applyCloneKick(c, h) {
    c.vx += c.ax * h; c.vy += c.ay * h; c.vz += c.az * h;
  }

  function stepClone(deps, cl, dt) {
    if (isAdaptiveKerr(deps)) return stepAdaptiveKerrClone(deps, cl, dt);
    const h = 0.5 * dt;
    const bh = cl[0];
    bh.ax = bh.ay = bh.az = 0;
    bh.vx = bh.vy = bh.vz = 0;
    for (const c of cl) {
      if (c.bh) continue;
      applyCloneKick(c, h);
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    }
    deps.accelClone(cl);
    if (deps.getGrOn()) {
      const n = cl.length;
      ensureCloneVelocityScratch(n);
      for (let i = 0; i < n; i++) {
        const c = cl[i];
        cloneScratchVx[i] = c.vx;
        cloneScratchVy[i] = c.vy;
        cloneScratchVz[i] = c.vz;
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < n; i++) {
          if (cl[i].bh) continue;
          const c = cl[i];
          c.vx = cloneScratchVx[i] + c.ax * h;
          c.vy = cloneScratchVy[i] + c.ay * h;
          c.vz = cloneScratchVz[i] + c.az * h;
        }
        deps.accelClone(cl);
      }
      for (let i = 0; i < n; i++) {
        if (cl[i].bh) continue;
        const c = cl[i];
        c.vx = cloneScratchVx[i] + c.ax * h;
        c.vy = cloneScratchVy[i] + c.ay * h;
        c.vz = cloneScratchVz[i] + c.az * h;
      }
    } else {
      for (const c of cl) if (!c.bh) applyCloneKick(c, h);
    }
    const ox = bh.x, oy = bh.y, oz = bh.z;
    if (Math.abs(ox) + Math.abs(oy) + Math.abs(oz) > 1e-8) {
      for (const c of cl) { c.x -= ox; c.y -= oy; c.z -= oz; }
    }
  }

  // AIM1-03: mirror production's capture authority (local_step_integrator
  // KERR capture block). Crossing the capture-radius sphere is only a
  // CANDIDATE: production runs the SCI-01B physical classification and, when
  // a turning point exists, declines, disarms and keeps integrating (re-arming
  // once the body has genuinely exited). The clone previously treated every
  // crossing as capture, so the preview said CAPTURED for orbits production
  // keeps bound.
  function applyKerrCaptureDecision(c, bh, result) {
    if (result?.status === 'event-terminated' && result.event?.id === 'production-capture-radius') {
      const classifier = SGRA.Physics.SCI01BPhysicalClassification;
      const classification = classifier
        ? classifier.evaluateCaptureEvent(c, bh, c.__kerrSpinContext)
        : { commit: false, fatal: true, source: 'SCI01B_MODULE_NOT_LOADED' };
      if (classification.fatal) throw makeKerrAdmissionError(`sci01b-classification-failed:${classification.source}`);
      if (classification.commit) c.captured = true;
      else c.__sci01bCandidateDisarmed = true;
      return;
    }
    if (!c.__sci01bCandidateDisarmed) return;
    const k = c.__kerrState;
    if (k && k.length >= 3 && Math.hypot(k[0], k[1], k[2]) > SGRA.Physics.CaptureSurface.radiusHatted()) c.__sci01bCandidateDisarmed = false;
  }

  function stepAdaptiveKerrClone(deps, cl, dt) {
    prepareAdaptiveOwnership(deps, cl);
    const h = 0.5 * dt;
    const bh = cl[0];
    accelClone(deps, cl);
    for (const c of cl) {
      if (c.bh || c.captured) continue;
      if (c.__fidelityOwnership?.owner === SGRA.Physics.CentralFidelityOwnership.STATE.KERR_ACTIVE) {
        c.vx += c.aMutual.x * h; c.vy += c.aMutual.y * h; c.vz += c.aMutual.z * h;
        const result = SGRA.Physics.ProductKerrRuntimeAdapter.readmit(c, bh, deps.getSimT?.() || 0, deps);
        if (!result?.admitted) throw makeKerrAdmissionError(result?.reason);
      } else {
        c.vx += c.ax * h; c.vy += c.ay * h; c.vz += c.az * h;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      }
    }
    for (const c of cl) {
      if (c.bh || c.captured || c.__fidelityOwnership?.owner !== SGRA.Physics.CentralFidelityOwnership.STATE.KERR_ACTIVE) continue;
      const result = SGRA.Physics.ProductKerrRuntimeAdapter.advance(c, bh, dt, deps);
      applyKerrCaptureDecision(c, bh, result);
    }
    accelClone(deps, cl);
    for (const c of cl) {
      if (c.bh || c.captured) continue;
      if (c.__fidelityOwnership?.owner === SGRA.Physics.CentralFidelityOwnership.STATE.KERR_ACTIVE) {
        c.vx += c.aMutual.x * h; c.vy += c.aMutual.y * h; c.vz += c.aMutual.z * h;
        const result = SGRA.Physics.ProductKerrRuntimeAdapter.readmit(c, bh, (deps.getSimT?.() || 0) + dt, deps);
        if (!result?.admitted) throw makeKerrAdmissionError(result?.reason);
      } else {
        c.vx += c.ax * h; c.vy += c.ay * h; c.vz += c.az * h;
      }
    }
  }

  const USER_INPUT_REJECTION_REASONS = [
    'non-timelike-initial-state',
    'inside-horizon-initial-state',
    'near-null-marginal'
  ];
  function classifyAdmissionReason(reason) {
    if (typeof reason === 'string' && USER_INPUT_REJECTION_REASONS.some(r => reason === r)) return 'KERR_PREVIEW_INPUT_REJECTED';
    return 'KERR_ADMISSION_FAILED';
  }
  function makeKerrAdmissionError(reason) {
    const error = new Error(reason || 'KERR_ADMISSION_FAILED');
    error.code = classifyAdmissionReason(reason);
    return error;
  }

  function pickDtClone(deps, cl, targetIdx) {
    const bh = cl[0];
    const epsBh = Math.max(deps.EPS2_BH, (2 * deps.G * cl[0].m / deps.C2) ** 2);
    const epsSs = deps.EPS2_SS;
    let tDyn = 1e9, tCourant = 1e9;
    for (let i = 1; i < cl.length; i++) {
      if (i === targetIdx) continue;
      const c = cl[i];
      if (c.field || c.captured) continue;
      const r = Math.hypot(c.x - bh.x, c.y - bh.y, c.z - bh.z);
      const td = Math.sqrt(r * r * r / (deps.G * (bh.m + c.m)));
      if (td < tDyn) tDyn = td;
      const v = Math.hypot(c.vx - bh.vx, c.vy - bh.vy, c.vz - bh.vz);
      if (v > 0) tCourant = Math.min(tCourant, r / (10 * v));
    }
    const t = cl[targetIdx];
    const rT = Math.hypot(t.x - bh.x, t.y - bh.y, t.z - bh.z);
    const vT = Math.hypot(t.vx - bh.vx, t.vy - bh.vy, t.vz - bh.vz);
    const tdT = Math.sqrt(rT * rT * rT / (deps.G * (bh.m + t.m)));
    if (tdT < tDyn) tDyn = tdT;
    if (vT > 0) tCourant = Math.min(tCourant, rT / (10 * vT));

    let pairDt = 1e9;
    for (let i = 1; i < cl.length; i++) {
      if (i === targetIdx) continue;
      const a = cl[targetIdx], b = cl[i];
      const code = deps.pairInteractionCode(a, b);
      if (!(code & deps.PAIR_INCLUDE)) continue;
      if (b.captured) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const eps2 = (a.bh || b.bh) ? epsBh : epsSs;
      const d = Math.sqrt(Math.max(d2, eps2));
      const m = a.m + b.m;
      const pdDyn = Math.sqrt(d * d * d / (deps.G * Math.max(m, 1))) * 0.05;
      const dvx = a.vx - b.vx, dvy = a.vy - b.vy, dvz = a.vz - b.vz;
      const dv = Math.hypot(dvx, dvy, dvz);
      const pdCour = dv > 0 ? d / (20 * dv) : 1e9;
      pairDt = Math.min(pairDt, pdDyn, pdCour);
    }
    let pnDt = 1e9;
    if (deps.getGrOn() && !t.field) {
      // aRel = aPN + aLT, matching local_timestep_policy.js. At aStar = 0,
      // aLT is exactly 0 and this reduces to the previous expression.
      const v = Math.hypot(t.vx - bh.vx, t.vy - bh.vy, t.vz - bh.vz);
      const aRel = (t.aPN || 0) + (t.aLT || 0);
      if (v > 0 && aRel) pnDt = deps.DT_SAFETY_PN * v / Math.max(aRel, 1e-30);
    }
    const safeDt = Math.min(deps.DT_SAFETY_DYN * tDyn, tCourant, pairDt, pnDt);
    return Math.min(deps.DT_MAX, Math.max(deps.DT_MIN, safeDt));
  }

  SGRA.Paths.PredictionCloneIntegrator = Object.freeze({
    cloneInBHFrame,
    accelClone,
    pickDtClone,
    stepClone
  });
})(typeof window !== 'undefined' ? window : globalThis);
