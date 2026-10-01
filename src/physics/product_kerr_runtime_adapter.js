// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachProductKerrRuntimeAdapter(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  function requireKerr(ports) {
    return ports.physicsInputs.kerr;
  }

  function constants(ports) {
    return ports.physicsInputs.constants;
  }

  function captureSurface(ports) {
    return ports.physicsInputs.captureSurface;
  }

  function dependency(ports, suppliedDeps, name, group) {
    if (suppliedDeps && suppliedDeps[name] !== undefined) return suppliedDeps[name];
    return ports[group][name];
  }

  function matVec(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
    ];
  }

  function transpose(m) {
    return [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]];
  }

  // Proper rotation taking local +z to the canonical unsigned world axis.
  // Degenerate axes are handled explicitly to avoid cross-product division.
  function rotationFromZ(axis) {
    const dot = axis[2];
    if (Math.abs(dot - 1) < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    if (Math.abs(dot + 1) < 1e-12) return [[1, 0, 0], [0, -1, 0], [0, 0, -1]];
    const v = [-axis[1], axis[0], 0];
    const s2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    const vx = [[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]];
    const vx2 = [
      [vx[0][0] * vx[0][0] + vx[0][1] * vx[1][0] + vx[0][2] * vx[2][0], vx[0][0] * vx[0][1] + vx[0][1] * vx[1][1] + vx[0][2] * vx[2][1], vx[0][0] * vx[0][2] + vx[0][1] * vx[1][2] + vx[0][2] * vx[2][2]],
      [vx[1][0] * vx[0][0] + vx[1][1] * vx[1][0] + vx[1][2] * vx[2][0], vx[1][0] * vx[0][1] + vx[1][1] * vx[1][1] + vx[1][2] * vx[2][1], vx[1][0] * vx[0][2] + vx[1][1] * vx[1][2] + vx[1][2] * vx[2][2]],
      [vx[2][0] * vx[0][0] + vx[2][1] * vx[1][0] + vx[2][2] * vx[2][0], vx[2][0] * vx[0][1] + vx[2][1] * vx[1][1] + vx[2][2] * vx[2][1], vx[2][0] * vx[0][2] + vx[2][1] * vx[1][2] + vx[2][2] * vx[2][2]]
    ];
    const factor = (1 - dot) / s2;
    const out = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[i][j] += vx[i][j] + vx2[i][j] * factor;
    return out;
  }

  function spinContext(bh, suppliedDeps, ports) {
    const c = constants(ports);
    const pinned = dependency(ports, suppliedDeps, 'isCentralFramePinnedForSandbox', 'physicsInputs');
    if (typeof pinned === 'function' && pinned() === false) {
      return { valid: false, reason: 'OUT_OF_SUPPORTED_DOMAIN: adaptive_kerr requires the pinned central frame (central_frame_mode=unpinned is not a supported combination)' };
    }
    const getSpinMagnitude = dependency(ports, suppliedDeps, 'getSpinMagnitude', 'physicsInputs');
    const rawMagnitude = getSpinMagnitude();
    const magnitude = Number(rawMagnitude);
    const rawSign = dependency(ports, suppliedDeps, 'getSpinAxisSign', 'physicsInputs')();
    const axisSign = rawSign === -1 ? -1 : 1;
    if (!Number.isFinite(magnitude) || magnitude < 0 || magnitude > 1) {
      return { valid: false, reason: 'OUT_OF_SUPPORTED_DOMAIN: spin magnitude must be finite in [0,1]' };
    }
    const source = Array.isArray(c.SPIN_AXIS_WORLD) ? c.SPIN_AXIS_WORLD : [0, 0, 1];
    const norm = Math.hypot(source[0], source[1], source[2]);
    if (!(norm > 0) || !Number.isFinite(norm)) return { valid: false, reason: 'OUT_OF_SUPPORTED_DOMAIN: spin axis is invalid' };
    const axis = source.map(v => v / norm);
    const localToWorld = magnitude === 0 ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : rotationFromZ(axis);
    const worldToLocal = transpose(localToWorld);
    const scalesValue = scales(bh, ports);
    return {
      valid: true,
      magnitude,
      axisSign,
      aHat: magnitude * axisSign,
      axis,
      localSpinAxis: [0, 0, 1],
      localToWorld,
      worldToLocal,
      scales: scalesValue,
      signature: `${magnitude}|${axisSign}|${axis.join(',')}|${scalesValue.M}`
    };
  }

  function scales(bh, ports) {
    const c = constants(ports);
    const M = Number(bh && bh.m);
    if (!(M > 0) || !Number.isFinite(M)) throw new Error('Central BH mass is invalid');
    const speed = c.C_AUYR;
    const Lg = c.G * M / (speed * speed);
    const Tg = c.G * M / (speed * speed * speed);
    if (!(Lg > 0) || !(Tg > 0) || !Number.isFinite(Lg) || !Number.isFinite(Tg)) throw new Error('Kerr gravitational scales are invalid');
    return { G: c.G, c: speed, M, Lg, Tg };
  }

  function toHatted(body, bh, context, ports) {
    const spin = context || spinContext(bh, undefined, ports);
    if (!spin.valid) throw new Error(spin.reason);
    const s = spin.scales;
    const bx = Number(bh.x) || 0, by = Number(bh.y) || 0, bz = Number(bh.z) || 0;
    const bvx = Number(bh.vx) || 0, bvy = Number(bh.vy) || 0, bvz = Number(bh.vz) || 0;
    const position = matVec(spin.worldToLocal, [body.x - bx, body.y - by, body.z - bz]);
    const velocity = matVec(spin.worldToLocal, [body.vx - bvx, body.vy - bvy, body.vz - bvz]);
    const x = position[0] / s.Lg, y = position[1] / s.Lg, z = position[2] / s.Lg;
    const vx = velocity[0] / s.c, vy = velocity[1] / s.c, vz = velocity[2] / s.c;
    if (![x, y, z, vx, vy, vz].every(Number.isFinite)) throw new Error('Product state is nonfinite');
    return { x, y, z, vx, vy, vz, scales: s, spin };
  }

  function restore(body, bh, y, s, context, ports) {
    const k = requireKerr(ports);
    const spin = context || body.__kerrSpinContext || spinContext(bh, undefined, ports);
    if (!spin.valid) throw new Error(spin.reason);
    const mp = k.KerrSchildMetric.metricParts(y[0], y[1], y[2], 1, spin.aHat);
    const v = k.KerrHamiltonianRhs.contravariantVelocity(mp, y[3], y[4], y[5], y[6]);
    if (!Number.isFinite(v.ut) || v.ut <= 0 || ![v.ux, v.uy, v.uz].every(Number.isFinite)) throw new Error('Kerr coordinate-time velocity became invalid');
    const bx = Number(bh.x) || 0, by = Number(bh.y) || 0, bz = Number(bh.z) || 0;
    const bvx = Number(bh.vx) || 0, bvy = Number(bh.vy) || 0, bvz = Number(bh.vz) || 0;
    const localPosition = [s.Lg * y[0], s.Lg * y[1], s.Lg * y[2]];
    const localVelocity = [s.c * v.ux / v.ut, s.c * v.uy / v.ut, s.c * v.uz / v.ut];
    const worldPosition = matVec(spin.localToWorld, localPosition);
    const worldVelocity = matVec(spin.localToWorld, localVelocity);
    body.x = bx + worldPosition[0]; body.y = by + worldPosition[1]; body.z = bz + worldPosition[2];
    body.vx = bvx + worldVelocity[0]; body.vy = bvy + worldVelocity[1]; body.vz = bvz + worldVelocity[2];
    return { metric: mp, velocity: v };
  }

  function promote(body, bh, simT, suppliedDeps, ports) {
    const k = requireKerr(ports);
    const spinContextValue = spinContext(bh, suppliedDeps, ports);
    if (!spinContextValue.valid) return { admitted: false, reason: spinContextValue.reason };
    let hatted;
    try { hatted = toHatted(body, bh, spinContextValue, ports); } catch (err) { return { admitted: false, reason: 'OUT_OF_SUPPORTED_DOMAIN: ' + err.message }; }
    let admission;
    try { admission = k.KerrHamiltonianRhs.admitState(hatted, 1, spinContextValue.aHat); }
    catch (err) { return { admitted: false, reason: 'KERR_ADMISSION_FAILED: ' + err.message }; }
    if (!admission.admitted) return { admitted: false, reason: admission.reason };
    const admissionKind = body.__kerrStateStale ? 'mass_change_readmission' : !body.__kerrState ? 'fresh_admission' : 'mutual_or_signature_readmission';
    body.__kerrState = new Float64Array([hatted.x, hatted.y, hatted.z, admission.p[0], admission.p[1], admission.p[2], admission.p[3]]);
    body.__kerrUnits = hatted.scales;
    body.__kerrSpinContext = spinContextValue;
    delete body.__kerrStateStale;
    const mp = k.KerrSchildMetric.metricParts(hatted.x, hatted.y, hatted.z, 1, spinContextValue.aHat);
    body.__kerrMassShell = k.KerrHamiltonianRhs.massShellResidual(mp, admission.p[0], admission.p[1], admission.p[2], admission.p[3]);
    body.__kerrLastAdmissionTime = simT;
    recordRoundTripContinuity(body, bh, hatted, admission, spinContextValue, simT, admissionKind, suppliedDeps, ports);
    return { admitted: true, state: body.__kerrState, scales: hatted.scales, massShellResidual: body.__kerrMassShell, aHat: spinContextValue.aHat, spinAxis: spinContextValue.axis };
  }

  function recordRoundTripContinuity(body, bh, hatted, admission, spinContextValue, simT, admissionKind, suppliedDeps, ports) {
    const trace = dependency(ports, suppliedDeps, 'kerrMutualTrace', 'telemetry');
    if (!trace || trace.enabled !== true) return;
    const restoredProbe = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    try {
      restore(restoredProbe, bh, [hatted.x, hatted.y, hatted.z, admission.p[0], admission.p[1], admission.p[2], admission.p[3]], hatted.scales, spinContextValue, ports);
    } catch (error) {
      trace.record('kerr_admission_round_trip', { simT, bodyId: body.id, bodyName: body.name, admissionKind, roundTripFailed: true, roundTripError: error.message });
      return;
    }
    trace.record('kerr_admission_round_trip', {
      simT, bodyId: body.id, bodyName: body.name, admissionKind,
      worldPosition: { x: body.x, y: body.y, z: body.z },
      worldVelocity: { x: body.vx, y: body.vy, z: body.vz },
      restoredPosition: { x: restoredProbe.x, y: restoredProbe.y, z: restoredProbe.z },
      restoredVelocity: { x: restoredProbe.vx, y: restoredProbe.vy, z: restoredProbe.vz },
      positionResidual: Math.hypot(restoredProbe.x - body.x, restoredProbe.y - body.y, restoredProbe.z - body.z),
      velocityResidual: Math.hypot(restoredProbe.vx - body.vx, restoredProbe.vy - body.vy, restoredProbe.vz - body.vz)
    });
  }

  function invalidateForCentralMassChange(bodies, oldMass, newMass) {
    let count = 0;
    for (const body of Array.isArray(bodies) ? bodies : []) {
      if (!body || body.bh || body.captured) continue;
      if (!body.__kerrState && !body.__kerrUnits && !body.__kerrSpinContext) continue;
      body.__kerrStateStale = { reason: 'central-mass-changed', oldMass, newMass };
      delete body.__kerrState;
      delete body.__kerrUnits;
      delete body.__kerrSpinContext;
      delete body.__kerrMassShell;
      delete body.__kerrLastAdmissionTime;
      count += 1;
    }
    return count;
  }

  function advance(body, bh, dt, suppliedDeps, ports) {
    const k = requireKerr(ports);
    const dp54 = k.DP54;
    if (!dp54 || typeof dp54.solve !== 'function') throw new Error('Kerr adaptive DP54 solver is unavailable');
    const profile = dependency(ports, suppliedDeps, 'kerrProfile', 'telemetry') || null;
    const observeArc = profile?.kerrArcObservation === true;
    dependency(ports, suppliedDeps, 'dutyMeasurement', 'telemetry')?.kerrAdvanceStarted?.(body, dt);
    const now = dependency(ports, suppliedDeps, 'now', 'telemetry');
    const adapterStart = profile ? now() : 0;
    if (profile) profile.adapterAdvances = (profile.adapterAdvances || 0) + 1;
    const getSimTime = dependency(ports, suppliedDeps, 'getSimTime', 'clock');
    const simT = typeof getSimTime === 'function' ? getSimTime() : undefined;
    const arcStart = observeArc ? { t: simT, x: body.x, y: body.y, z: body.z, vx: body.vx, vy: body.vy, vz: body.vz } : null;
    let spinContextValue = spinContext(bh, suppliedDeps, ports);
    if (!spinContextValue.valid) throw new Error(spinContextValue.reason);
    if (body.__kerrStateStale || !body.__kerrSpinContext || body.__kerrSpinContext.signature !== spinContextValue.signature) {
      const refreshed = promote(body, bh, simT, suppliedDeps, ports);
      if (!refreshed.admitted) throw new Error(refreshed.reason || 'KERR_ADMISSION_FAILED');
      spinContextValue = body.__kerrSpinContext;
    }
    const y = body.__kerrState;
    if (!(y instanceof Float64Array) || y.length !== 7) throw new Error('Kerr body has no admitted canonical state');
    if (!Array.from(y).every(Number.isFinite)) {
      const error = new Error('Kerr canonical state is non-finite');
      error.code = 'KERR_INTEGRATION_FAILED';
      error.solverStatus = 'rhs-failure';
      throw error;
    }
    dependency(ports, suppliedDeps, 'kerrMutualTrace', 'telemetry')?.record('kerr_advance_input', {
      simT, bodyId: body.id, bodyName: body.name, dt,
      position: { x: body.x, y: body.y, z: body.z },
      velocity: { x: body.vx, y: body.vy, z: body.vz },
      productState: { position: { x: body.x, y: body.y, z: body.z }, velocity: { x: body.vx, y: body.vy, z: body.vz } },
      canonicalState: Array.from(y), canonicalStateConsumed: Array.from(y),
      productVelocity: { x: body.vx, y: body.vy, z: body.vz }
    });
    const s = body.__kerrUnits || spinContextValue.scales;
    const dtHat = dt / s.Tg;
    if (!Number.isFinite(dtHat) || dtHat <= 0) throw new Error('Kerr product time interval is invalid');
    const rhs = k.KerrHamiltonianRhs.createGeodesicRhs({ M: 1, a: spinContextValue.aHat, profile });
    const metric = k.KerrSchildMetric;
    const radius = (state) => Math.hypot(state[0], state[1], state[2]);
    const hMaxRule = (t, state) => 0.05 * Math.pow(Math.max(metric.ksRadius(state[0], state[1], state[2], spinContextValue.aHat).r, 1e-12), 1.5);
    const initialRadius = radius(y);
    const captureRadiusHat = captureSurface(ports).radiusHatted();
    // SCI-01B integration (added in this patch): when a previous SCI-01B
    // physical-classification pass declined to commit capture for this
    // body (TURNING_POINT_EXISTS / TOPOLOGY_AMBIGUOUS / outside its
    // validated domain), local_step_integrator.js sets
    // body.__sci01bCandidateDisarmed = true so this short-circuit is
    // skipped and the geodesic actually integrates forward instead of
    // repeatedly reporting the same zero-duration entry event.
    // The terminal capture-radius event below remains registered and
    // unchanged: standard sign-change event detection cannot re-fire for
    // a state that STARTS already inside the radius (there is no
    // positive-to-negative crossing to find), so this is safe by
    // construction, not merely by convention -- the event only fires
    // again once the body has genuinely exited and re-entered.
    if (initialRadius <= captureRadiusHat && !body.__sci01bCandidateDisarmed) {
      body.__kerrState = Float64Array.from(y);
      return {
        status: 'event-terminated',
        tFinal: 0,
        telemetry: { rhsEvals: 0, acceptedSteps: 0, rejectedSteps: 0, failureDetail: null, entryTerminalEvent: true },
        event: { id: 'production-capture-radius', t: 0, y: Float64Array.from(y) }
      };
    }
    const captureEvent = {
      id: 'production-capture-radius',
      g: (t, state) => {
        if (profile) profile.eventPredicateEvaluations = (profile.eventPredicateEvaluations || 0) + 1;
        return radius(state) - captureRadiusHat;
      },
      direction: -1,
      terminal: true
    };
    // A declined candidate is already at (or just inside, within floating
    // point noise of) the terminal surface.  Keeping the event armed here
    // allows a radius value such as 8.000000000000004 to produce a fresh
    // positive-to-negative crossing on the very next step and localise it
    // back to t ~= 0 forever.  The local integrator owns the re-arm decision:
    // while disarmed, integrate without the terminal entry event; once the
    // live trajectory genuinely exits, it clears the flag and a later entry
    // is again handled by the normal event path.
    const events = body.__sci01bCandidateDisarmed ? [] : [captureEvent];
    const hMax = hMaxRule(0, y);
    const controls = {
      // Existing T1K/Kerr validation authority. This is deliberately
      // provisional for shipping use; K2 owns final tolerance ratification.
      absTol: 1e-13,
      relTol: 1e-13,
      hInit: Math.min(1e-3 * Math.pow(Math.max(initialRadius, 1e-12), 1.5), hMax),
      hMaxRule,
      hMin: 1e-12,
      maxSteps: 4_000_000,
      profile
    };
    const ownershipTelemetry = dependency(ports, suppliedDeps, 'kerrOwnershipTelemetry', 'telemetry');
    const ownershipToken = ownershipTelemetry?.enabled === true ? ownershipTelemetry.recordAdvanceStarted() : null;
    const solve = () => dp54.solve({ y0: Float64Array.from(y), t0: 0, t1: dtHat, rhs, controls, events });
    const perfBaseline = dependency(ports, suppliedDeps, 'perfBaseline', 'telemetry');
    const result = perfBaseline?.measure ? perfBaseline.measure('kerr_self_ms', solve, body) : solve();
    body.__kerrSolverTelemetry = result.telemetry;
    if (result.status !== 'completed' && result.status !== 'event-terminated') {
      const error = new Error(`DP54 ${result.status}: ${result.telemetry?.failureDetail || 'Kerr central integration failed'}`);
      error.code = 'KERR_INTEGRATION_FAILED';
      error.solverStatus = result.status;
      error.solverTelemetry = result.telemetry;
      throw error;
    }
    if (result.tFinal !== dtHat && result.status === 'completed') {
      const error = new Error('DP54 completed without reaching the requested Kerr endpoint');
      error.code = 'KERR_INTEGRATION_FAILED';
      error.solverStatus = 'numerical-failure';
      throw error;
    }
    const restored = restore(body, bh, result.yFinal, s, spinContextValue, ports);
    const residual = k.KerrHamiltonianRhs.massShellResidual(restored.metric, result.yFinal[3], result.yFinal[4], result.yFinal[5], result.yFinal[6]);
    if (!Number.isFinite(residual)) {
      const error = new Error('Kerr mass-shell diagnostic became non-finite');
      error.code = 'KERR_INTEGRATION_FAILED';
      error.solverStatus = 'numerical-failure';
      throw error;
    }
    body.__kerrState = Float64Array.from(result.yFinal);
    body.__kerrMassShell = residual;
    if (observeArc) profile.lastKerrArcObservation = Object.freeze({ bodyId: body.id, bodyName: body.name || '', start: Object.freeze(arcStart), end: Object.freeze({ t: simT + dt, x: body.x, y: body.y, z: body.z, vx: body.vx, vy: body.vy, vz: body.vz }), acceptedSteps: result.telemetry.acceptedSteps, rejectedSteps: result.telemetry.rejectedSteps, rhsEvals: result.telemetry.rhsEvals, status: result.status });
    if (ownershipTelemetry?.enabled === true) ownershipTelemetry.recordAdvanceCompleted(ownershipToken);
    dependency(ports, suppliedDeps, 'dutyMeasurement', 'telemetry')?.kerrAdvanceCompleted?.(body, result);
    if (profile) profile.adapterMs = (profile.adapterMs || 0) + now() - adapterStart;
    if (profile) profile.restoreCalls = (profile.restoreCalls || 0) + 1;
    return {
      status: result.status,
      tFinal: result.tFinal,
      telemetry: result.telemetry,
      event: result.events[0] || null
    };
  }

  // Reconstruct the canonical state after a product-space mutual kick. This
  // deliberately reuses the single established admission path; no velocity
  // to momentum approximation is introduced.
  function readmit(body, bh, simT, suppliedDeps, ports) {
    const dutyMeasurement = dependency(ports, suppliedDeps, 'dutyMeasurement', 'telemetry');
    dutyMeasurement?.admission?.(body, 'readmission');
    let result;
    try {
      result = promote(body, bh, simT, suppliedDeps, ports);
    } catch (error) {
      const ownershipTelemetry = dependency(ports, suppliedDeps, 'kerrOwnershipTelemetry', 'telemetry');
      if (ownershipTelemetry?.enabled === true) ownershipTelemetry.recordReadmission(false);
      throw error;
    }
    const ownershipTelemetry = dependency(ports, suppliedDeps, 'kerrOwnershipTelemetry', 'telemetry');
    if (ownershipTelemetry?.enabled === true) ownershipTelemetry.recordReadmission(result?.admitted === true);
    dependency(ports, suppliedDeps, 'kerrMutualTrace', 'telemetry')?.record('canonical_readmission', {
      bodyId: body.id, bodyName: body.name, simT,
      position: { x: body.x, y: body.y, z: body.z },
      velocity: { x: body.vx, y: body.vy, z: body.vz },
      velocitySuppliedToAdmission: { x: body.vx, y: body.vy, z: body.vz },
      success: result?.admitted === true,
      canonicalState: body.__kerrState ? Array.from(body.__kerrState) : null
    });
    return result;
  }

  function probeTimelikeN(body, bh, suppliedDeps, ports) {
    const k = requireKerr(ports);
    const spinContextValue = spinContext(bh, suppliedDeps, ports);
    if (!spinContextValue.valid) return { ok: false, reason: spinContextValue.reason };
    let hatted;
    try { hatted = toHatted(body, bh, spinContextValue, ports); } catch (err) { return { ok: false, reason: err.message }; }
    const mp = k.KerrSchildMetric.metricParts(hatted.x, hatted.y, hatted.z, 1, spinContextValue.aHat);
    const V = [1, hatted.vx, hatted.vy, hatted.vz];
    const N = k.KerrHamiltonianRhs.timelikeNorm(mp, V);
    const rKSHat = k.KerrSchildMetric.ksRadius(hatted.x, hatted.y, hatted.z, spinContextValue.aHat).r;
    const rCartesianHat = Math.hypot(hatted.x, hatted.y, hatted.z);
    return { ok: true, N, rKSHat, rCartesianHat, f: mp.f, vHat: Math.hypot(hatted.vx, hatted.vy, hatted.vz) };
  }

  function create(options) {
    const portContract = SGRA.Physics.ProductKerrRuntimePorts;
    if (!portContract || typeof portContract.create !== 'function') throw new Error('Product Kerr runtime ports are unavailable');
    const ports = portContract.create(options);
    return Object.freeze({
      promote: (body, bh, simT, suppliedDeps) => promote(body, bh, simT, suppliedDeps, ports),
      readmit: (body, bh, simT, suppliedDeps) => readmit(body, bh, simT, suppliedDeps, ports),
      advance: (body, bh, dt, suppliedDeps) => advance(body, bh, dt, suppliedDeps, ports),
      scales: bh => scales(bh, ports),
      toHatted: (body, bh, context) => toHatted(body, bh, context, ports),
      restore: (body, bh, y, s, context) => restore(body, bh, y, s, context, ports),
      invalidateForCentralMassChange,
      getSpinContext: (bh, suppliedDeps) => spinContext(bh, suppliedDeps, ports),
      probeTimelikeN: (body, bh, suppliedDeps) => probeTimelikeN(body, bh, suppliedDeps, ports)
    });
  }

  const existing = SGRA.Physics.ProductKerrRuntimeAdapter;
  const factory = { create };
  if (existing && typeof existing.promote === 'function') {
    SGRA.Physics.ProductKerrRuntimeAdapter = Object.freeze({ ...existing, create });
  } else {
    SGRA.Physics.ProductKerrRuntimeAdapter = Object.freeze(factory);
  }
})(typeof window !== 'undefined' ? window : globalThis);
