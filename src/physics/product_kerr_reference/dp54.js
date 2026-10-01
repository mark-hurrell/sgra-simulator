// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachKerrModule(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};
  SGRA.Physics.Kerr = SGRA.Physics.Kerr || {};

//
// Implements SGRA_EXACT_KERR_FEASIBILITY_IMPLEMENTATION_PLAN_v2.md §5.1
// (DP5(4) — Dormand-Prince 5(4), adaptive, embedded error estimate), §5.3
// (events and root refinement — transactional re-integration), and §5.4
// (transactional semantics).
//
// INDEPENDENCE NOTE (per §5.1, recorded here not papered over): the
// Dormand-Prince tableau below is RE-TYPED from
// bench/oracle_schwarzschild_geodesic.mjs rather than imported, so that
// oracle stays textually independent. The chi=0 cross-check therefore
// shares an integrator FAMILY with the Schwarzschild oracle but not the
// PHYSICS — the oracle integrates a reduced effective-potential radial ODE
// in proper time; this lane integrates the full 4D Hamiltonian system in
// coordinate time. Independence lives in the RHS, not the tableau.
//
// Determinism: no Math.random, no Date.now, no wall-clock branching in any
// control-flow path. wallMs is evidence only. Two runs of the same fixture
// under the same controls must produce bitwise-identical yFinal.

const DP = {
  a: [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]
  ],
  b5: [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0],
  b4: [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40]
};

const SAFETY = 0.9;
const MIN_FACTOR = 0.2;
const MAX_FACTOR = 5.0;
const ERROR_EXPONENT = 1 / 5;

function allocState(dim) {
  return new Float64Array(dim);
}

function assertFiniteState(state) {
  for (let i = 0; i < state.length; i++) {
    if (!Number.isFinite(state[i])) throw new Error(`non-finite RHS/state component at index ${i}`);
  }
}

function combineInto(out, y0, ks, activeStageCount, coeffs, h) {
  for (let d = 0; d < out.length; d++) out[d] = y0[d];
  for (let i = 0; i < activeStageCount; i++) {
    const c = coeffs[i];
    if (c === 0) continue;
    const ki = ks[i];
    for (let d = 0; d < out.length; d++) out[d] += h * c * ki[d];
  }
}

function errorNorm(y0, y5, y4, absTol, relTol) {
  const dim = y0.length;
  let sumSq = 0;
  for (let d = 0; d < dim; d++) {
    const scale = absTol + relTol * Math.max(Math.abs(y0[d]), Math.abs(y5[d]));
    const e = (y5[d] - y4[d]) / scale;
    sumSq += e * e;
  }
  return Math.sqrt(sumSq / dim);
}

/**
 * Take a single DP5(4) step from (t, y) with step size h. Returns
 * { y5, y4, err, ks } where err is the (unscaled) embedded error norm
 * given absTol/relTol, and ks are the 7 stage derivatives (reusable by
 * callers, e.g. event g-function evaluation without recomputing stage 7 —
 * ks[6] is the derivative at the *accepted* endpoint for a FSAL-style read
 * if the caller wants it, though this implementation does not exploit FSAL
 * internally to keep the tableau a literal transcription).
 */
function dp54Step(rhs, t, y, h, absTol, relTol, scratch, profile = null) {
  const dim = y.length;
  const { ks, yStage, y5, y4 } = scratch;

  for (let i = 0; i < 7; i++) {
    combineInto(yStage, y, ks, i, DP.a[i], h);
    if (!ks[i]) ks[i] = allocState(dim);
    rhs(t + (i === 0 ? 0 : cNode(i)) * h, yStage, ks[i]);
    assertFiniteState(ks[i]);
  }

  combineInto(y5, y, ks, 7, DP.b5, h);
  combineInto(y4, y, ks, 7, DP.b4, h);
  assertFiniteState(y5);
  assertFiniteState(y4);
  const errorStart = profile && typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : 0;
  const err = errorNorm(y, y5, y4, absTol, relTol);
  if (profile && errorStart) profile.errorNormWallMs = (profile.errorNormWallMs || 0) + globalThis.performance.now() - errorStart;
  return { y5, y4, err };
}

// Standard DP5(4) c-nodes (time fractions), used only for rhs(t + c_i h, ...)
// argument construction; the tableau's a-coefficients above are the
// authoritative re-typed values and are unchanged from the oracle.
const C_NODES = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
function cNode(i) {
  return C_NODES[i];
}

function makeScratch(dim) {
  return {
    ks: new Array(7).fill(null),
    yStage: allocState(dim),
    y5: allocState(dim),
    y4: allocState(dim)
  };
}

/**
 * solve({ y0, t0, t1, rhs, controls, events, sample }) -> result
 *
 * controls: { absTol, relTol, hInit, hFac, hMin, maxSteps, hMaxRule }
 *   hMaxRule(rCurrent) -> hMax, OR a fixed number. Per plan §5.1, Tranche 1
 *   fixtures use hMax(r) = hFac_ceiling * r^{3/2} recomputed at every step
 *   from the CURRENT Kerr radius; callers supply hMaxRule as a function
 *   (t, y) -> number for this. If controls.hMax is a plain number instead,
 *   that fixed ceiling is used (useful for non-Kerr-radius-aware tests).
 *
 * events: array of { id, g(t,y,dydt), direction, terminal }
 *   direction: +1 (only rising crossings), -1 (only falling), 0 (either)
 *
 * status in {'completed','event-terminated','max-steps','rhs-failure'}
 */
function solve({ y0, t0, t1, rhs, controls, events = [], sample = null }) {
  const dim = y0.length;
  const {
    absTol = 1e-12,
    relTol = 1e-12,
    hInit,
    hFac = 0.05,
    hMin = 1e-12,
    maxSteps = 4_000_000,
    hMaxRule = null,
    hMax: fixedHMax = null
  } = controls;
  const profile = controls?.profile || null;
  const nestedSolve = profile ? profile.activeSolveDepth > 0 : false;
  const profileClock = profile && typeof globalThis.performance?.now === 'function' ? globalThis.performance : null;
  const profileSolveStart = profileClock ? profileClock.now() : 0;
  const nestedWallAtStart = profile ? (profile.nestedSolveWallMs || 0) : 0;
  if (profile) {
    profile.solveCalls = (profile.solveCalls || 0) + 1;
    if (!nestedSolve) profile.topLevelSolveCalls = (profile.topLevelSolveCalls || 0) + 1;
    profile.activeSolveDepth = (profile.activeSolveDepth || 0) + 1;
  }

  const scratch = makeScratch(dim);
  const dydtScratch = allocState(dim);

  let t = t0;
  let y = Float64Array.from(y0);
  const direction = t1 >= t0 ? 1 : -1;

  function computeHMax(tCur, yCur) {
    if (typeof hMaxRule === 'function') return hMaxRule(tCur, yCur);
    if (fixedHMax !== null) return fixedHMax;
    return Infinity;
  }

  let h;
  if (typeof hInit === 'number') {
    h = hInit;
  } else {
    h = direction * computeHMax(t, y) * 1e-3;
  }
  h = direction * Math.min(Math.abs(h), computeHMax(t, y));

  let acceptedSteps = 0;
  let rejectedSteps = 0;
  let rhsEvals = 0;
  let lastAcceptedErrorNorm = null;
  let failureDetail = null;
  const hValues = [];
  const firedEvents = [];
  const samples = [];

  const wallStart = Date.now();

  // Wrap rhs to count evaluations without altering control flow.
  // Refinement reuses the parent counted wrapper.  Do not wrap that wrapper
  // again: doing so executes the RHS once but increments the attribution
  // counters twice for every nested call.
  let countedRhs;
  if (rhs && rhs.__dp54CountedRhs) {
    countedRhs = rhs;
  } else {
    countedRhs = (tt, yy, out) => {
      const rhsNested = profile ? profile.activeSolveDepth > 1 : false;
      rhsEvals++;
      if (profile) profile.rhsEvals = (profile.rhsEvals || 0) + 1;
      if (profile) {
        if (rhsNested) profile.nestedRhsEvals = (profile.nestedRhsEvals || 0) + 1;
        else profile.topLevelRhsEvals = (profile.topLevelRhsEvals || 0) + 1;
        if (typeof profile.rhsSpy === 'function') profile.rhsSpy(rhsNested);
      }
      const rhsStart = profile && typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : 0;
      try {
        rhs(tt, yy, out);
        assertFiniteState(out);
      } finally {
        if (profile && rhsStart) {
          const rhsMs = globalThis.performance.now() - rhsStart;
          profile.rhsWallMs = (profile.rhsWallMs || 0) + rhsMs;
          if (rhsNested) profile.nestedRhsWallMs = (profile.nestedRhsWallMs || 0) + rhsMs;
          else profile.topLevelRhsWallMs = (profile.topLevelRhsWallMs || 0) + rhsMs;
        }
      }
    };
    if (profile) countedRhs.__dp54CountedRhs = true;
  }

  let status = 'completed';

  try {
    assertFiniteState(y);
  } catch (error) {
    status = 'numerical-failure';
    failureDetail = error.message;
    return finalize();
  }
  if (t0 === t1) return finalize();

  // Event state tracking (previous g-values per event, for sign-change detection).
  let prevG;
  try {
    prevG = events.map((ev) => {
      countedRhs(t, y, dydtScratch);
      const value = ev.g(t, y, dydtScratch);
      if (!Number.isFinite(value)) throw new Error(`non-finite event value for ${ev.id}`);
      return value;
    });
  } catch (error) {
    status = 'rhs-failure';
    failureDetail = error.message;
    return finalize();
  }

  if (sample) samples.push({ t, y: Float64Array.from(y) });

  while ((direction > 0 ? t < t1 : t > t1) && acceptedSteps + rejectedSteps < maxSteps) {
    if (profile) profile.attemptedSteps = (profile.attemptedSteps || 0) + 1;
    const remaining = t1 - t;
    let finalClampedStep = false;
    if (direction > 0 ? h >= remaining : h <= remaining) {
      h = remaining;
      finalClampedStep = true;
    }
    const hMaxNow = computeHMax(t, y);
    if (!Number.isFinite(hMaxNow) && hMaxNow !== Infinity) {
      status = 'numerical-failure';
      failureDetail = 'non-finite hMax';
      return finalize();
    }
    if (Math.abs(h) > hMaxNow) {
      h = direction * hMaxNow;
      finalClampedStep = false;
    }
    if (Math.abs(h) < hMin && !finalClampedStep) h = direction * hMin;
    if (!Number.isFinite(h) || h === 0) {
      status = 'numerical-failure';
      failureDetail = 'non-finite or zero step size';
      return finalize();
    }

    let stepResult;
    try {
      stepResult = dp54Step(countedRhs, t, y, h, absTol, relTol, scratch, profile);
    } catch (e) {
      status = 'rhs-failure';
      failureDetail = e.message;
      return finalize();
    }

    const { y5, err } = stepResult;
    if (profile) profile.errorNormEvaluations = (profile.errorNormEvaluations || 0) + 1;

    if (!Number.isFinite(err)) {
      status = 'rhs-failure';
      failureDetail = 'non-finite error norm';
      return finalize();
    }

    if (err <= 1) {
      // accept
      lastAcceptedErrorNorm = err;
      const tNew = finalClampedStep ? t1 : t + h;
      const yNew = Float64Array.from(y5);

      // Event detection on the accepted step.
      assertFiniteState(yNew);
      countedRhs(tNew, yNew, dydtScratch);
      let terminate = false;
      let terminalRoot = null;
      for (let e = 0; e < events.length; e++) {
        const ev = events[e];
        if (profile) profile.eventPredicateEvaluations = (profile.eventPredicateEvaluations || 0) + 1;
        const gNew = ev.g(tNew, yNew, dydtScratch);
        if (!Number.isFinite(gNew)) {
          status = 'rhs-failure';
          failureDetail = `non-finite event value for ${ev.id}`;
          return finalize();
        }
        const gOld = prevG[e];
        const signChange = Math.sign(gOld) !== Math.sign(gNew) && gOld !== 0;
        const risingOk = ev.direction === 0 || (ev.direction > 0 && gOld < gNew) || (ev.direction < 0 && gOld > gNew);
        if (signChange && risingOk) {
          if (profile) profile.eventRefinements = (profile.eventRefinements || 0) + 1;
          const refineStart = profile && typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : 0;
          const root = refineEventRoot({
            rhs: countedRhs,
            g: ev.g,
            tA: t,
            yA: y,
            tB: tNew,
            yB: yNew,
            gB: gNew,
            controls: { absTol, relTol, hMin, maxSteps: Math.min(maxSteps, 1000), hMaxRule, hMax: fixedHMax, profile, refinementMethod: profile?.refinementMethod, refinementTol: profile?.refinementTol, refinementMaxIterations: profile?.refinementMaxIterations },
          });
          if (profile && refineStart) profile.eventRefinementWallMs = (profile.eventRefinementWallMs || 0) + globalThis.performance.now() - refineStart;
          if (!root.ok) {
            status = 'event-refinement-failed';
            failureDetail = root.cause;
            return finalize();
          }
          firedEvents.push({ id: ev.id, t: root.t, y: root.y });
          if (ev.terminal) {
            terminate = true;
            terminalRoot = root;
          }
        }
        prevG[e] = gNew;
      }

      t = tNew;
      y = yNew;
      acceptedSteps++;
      if (profile) profile.acceptedSteps = (profile.acceptedSteps || 0) + 1;
      // Research telemetry is diagnostic only; keep its quantile sample bounded
      // so long event-domain trajectories cannot exhaust memory.
      if (hValues.length < 4096) hValues.push(Math.abs(h));
      if (sample) samples.push({ t, y: Float64Array.from(y) });

      if (terminate) {
        // BUG FIX (found during T2 G3A-3 investigation): the solver's own
        // returned tFinal/yFinal must be the REFINED event root
        // (terminalRoot.t/terminalRoot.y), not the raw accepted-step
        // endpoint (t/y) that merely bracketed the crossing. Committing
        // t=tNew/y=yNew unconditionally above (correct — that update must
        // happen regardless, since it also drives sample recording and
        // acceptedSteps bookkeeping) and then returning that same t/y as
        // the terminal state silently discarded the whole point of
        // event root refinement for every terminal-event caller: the
        // event's own recorded {id,t,y} in result.events was always
        // correct, but result.tFinal/result.yFinal were not, and any
        // caller reading the top-level returned state (as opposed to
        // digging into result.events) got the coarse, un-refined value.
        // This was invisible in T1/T1.5 because no terminal event there
        // was read via top-level tFinal/yFinal in a tolerance-convergence
        // gate; T2's G3A-3 (t_cross ladder) was the first gate to do so
        // and is what surfaced it.
        t = terminalRoot.t;
        y = terminalRoot.y;
        status = 'event-terminated';
        return finalize();
      }

      const factor = err > 0 ? SAFETY * Math.pow(1 / err, ERROR_EXPONENT) : MAX_FACTOR;
      h = direction * Math.abs(h) * Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor));
    } else {
      // A rejected endpoint is never an accepted state, but it can still
      // prove that a terminal surface was crossed during this attempted
      // interval. Resolve that event from the last accepted state before
      // applying ordinary tolerance-failure semantics.
      rejectedSteps++;
      if (profile) profile.rejectedSteps = (profile.rejectedSteps || 0) + 1;
      const candidateT = finalClampedStep ? t1 : t + h;
      for (let e = 0; e < events.length; e++) {
        const ev = events[e];
        if (!ev.terminal) continue;
        if (profile) profile.eventPredicateEvaluations = (profile.eventPredicateEvaluations || 0) + 1;
        const gCandidate = ev.g(candidateT, y5, scratch.ks[6]);
        if (!Number.isFinite(gCandidate)) {
          status = 'rhs-failure';
          failureDetail = `non-finite event value for ${ev.id}`;
          return finalize();
        }
        const gStart = prevG[e];
        const signChange = Math.sign(gStart) !== Math.sign(gCandidate) && gStart !== 0;
        const risingOk = ev.direction === 0 || (ev.direction > 0 && gStart < gCandidate) || (ev.direction < 0 && gStart > gCandidate);
        if (signChange && risingOk) {
          if (profile) profile.eventRefinements = (profile.eventRefinements || 0) + 1;
          const refineStart = profile && typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : 0;
          const root = refineEventRoot({
            rhs: countedRhs,
            g: ev.g,
            tA: t,
            yA: y,
            tB: candidateT,
            yB: y5,
            gB: gCandidate,
            // This is an event-localization solve, not a production step.
            // A rejected hMin candidate may bracket a terminal surface so
            // tightly that re-integrating the bracket with the ordinary
            // hMin would fail before reaching the root.  Permit only this
            // bounded terminal subsolve to subdivide more finely; the
            // ordinary solve still rejects errorNorm > 1 at its hMin.
            controls: {
              absTol,
              relTol,
              hMin: Math.min(hMin, Math.max(Number.EPSILON, Math.abs(candidateT - t) * 1e-3)),
              maxSteps: Math.min(maxSteps, 1000),
              hMaxRule,
              hMax: fixedHMax,
              profile,
              refinementMethod: profile?.refinementMethod,
              refinementTol: profile?.refinementTol,
              refinementMaxIterations: profile?.refinementMaxIterations
            }
          });
          if (profile && refineStart) profile.eventRefinementWallMs = (profile.eventRefinementWallMs || 0) + globalThis.performance.now() - refineStart;
          if (!root.ok) {
            status = 'event-refinement-failed';
            failureDetail = root.cause;
            return finalize();
          }
          firedEvents.push({ id: ev.id, t: root.t, y: root.y });
          t = root.t;
          y = root.y;
          status = 'event-terminated';
          return finalize();
        }
      }
      if (Math.abs(h) <= hMin) {
        status = 'tolerance-not-met';
        failureDetail = `error norm ${err} exceeds 1 at hMin ${hMin}`;
        return finalize();
      }
      const factor = SAFETY * Math.pow(1 / err, ERROR_EXPONENT);
      h = direction * Math.abs(h) * Math.min(1, Math.max(MIN_FACTOR, factor));
    }
  }

  if ((direction > 0 ? t < t1 : t > t1) && acceptedSteps + rejectedSteps >= maxSteps) {
    status = 'max-steps';
  }
  if (status === 'completed' && t !== t1) {
    status = 'numerical-failure';
    failureDetail = 'completed without reaching requested endpoint';
  }

  function finalize() {
    const wallMs = profileClock ? profileClock.now() - profileSolveStart : Date.now() - wallStart;
    if (profile) {
      profile.solveWallMs = (profile.solveWallMs || 0) + wallMs;
      if (nestedSolve) {
        profile.nestedSolveWallMs = (profile.nestedSolveWallMs || 0) + wallMs;
        profile.nestedAcceptedSteps = (profile.nestedAcceptedSteps || 0) + acceptedSteps;
        profile.nestedRejectedSteps = (profile.nestedRejectedSteps || 0) + rejectedSteps;
      } else {
        const nestedWallMs = Math.max(0, (profile.nestedSolveWallMs || 0) - nestedWallAtStart);
        profile.topLevelDp54WallMsExclusive = (profile.topLevelDp54WallMsExclusive || 0) + Math.max(0, wallMs - nestedWallMs);
        profile.topLevelAcceptedSteps = (profile.topLevelAcceptedSteps || 0) + acceptedSteps;
        profile.topLevelRejectedSteps = (profile.topLevelRejectedSteps || 0) + rejectedSteps;
        profile.topLevelWallMs = (profile.topLevelWallMs || 0) + wallMs;
      }
      profile.activeSolveDepth = Math.max(0, (profile.activeSolveDepth || 1) - 1);
    }
    // Telemetry-only reduction.  Do not spread a long accepted-step history
    // into Math.min/Math.max: large research trajectories can complete their
    // numerical integration and then overflow the JS argument stack here.
    let hMinUsed = null;
    let hMaxUsed = null;
    for (const hValue of hValues) {
      if (hMinUsed === null || hValue < hMinUsed) hMinUsed = hValue;
      if (hMaxUsed === null || hValue > hMaxUsed) hMaxUsed = hValue;
    }
    const hSorted = hValues.length ? [...hValues].sort((a, b) => a - b) : [];
    const quantile = (p) => hSorted.length ? hSorted[Math.min(hSorted.length - 1, Math.floor((hSorted.length - 1) * p))] : null;
    const hMedianUsed = hSorted.length ? hSorted[Math.floor((hSorted.length - 1) / 2)] : null;
    return {
      status,
      yFinal: y,
      tFinal: t,
      events: firedEvents,
      telemetry: {
        rhsEvals,
        acceptedSteps,
        rejectedSteps,
        lastAcceptedErrorNorm,
        failureDetail,
        hMinUsed,
        hMaxUsed,
        hMedianUsed,
        hP10Used: quantile(0.10),
        hP90Used: quantile(0.90),
        wallMs
      },
      samples: sample ? samples : null
    };
  }

  return finalize();
}

function medianOf(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Transactional re-integration root refinement (§5.3). No dense interpolant
 * exists for this solver; the only mechanism is repeated re-integration
 * from the accepted step's start state under the same controls.
 *
 *   lo = t_a, hi = t_b
 *   repeat 80 times:
 *     mid = (lo+hi)/2
 *     y_mid = solve({y0:y_lo, t0:t_lo, t1:mid, rhs, controls, events:[]}).yFinal
 *     if sign(g(mid,y_mid)) == sign(g(t_lo,y_lo)) then lo=mid else hi=mid
 *   root = (lo+hi)/2 ; y_root = re-integrate from y_lo to root
 *
 * `controls.refineFromStart === true` retains the original-start route for
 * isolated reference tests. Production callers use the endpoint-continuation
 * route; both routes are transactional and pass events: [] to nested solves.
 */
function refineEventRoot({ rhs, g, tA, yA, tB, yB, gB, controls }) {
  const profile = controls?.profile || null;
  const refineFromStart = controls?.refineFromStart === true;
  const method = controls?.refinementMethod || profile?.refinementMethod || 'bisection-endpoint';
  const dydtA = allocState(yA.length);
  try {
    rhs(tA, yA, dydtA);
  } catch (error) {
    return { ok: false, cause: `rhs-failure: ${error.message}` };
  }
  const gA = g(tA, yA, dydtA);
  if (!Number.isFinite(gA)) return { ok: false, cause: 'rhs-failure: non-finite event value at bracket start' };
  const signA = Math.sign(gA);

  if (method === 'brent') {
    return refineBrent({ rhs, g, tA, yA, tB, yB, gA, gB, controls, profile });
  }

  let lo = tA;
  let hi = tB;
  let yLo = yA;
  let gLo = gA;
  if (profile) profile.eventRefinementInitialBracketWidth = (profile.eventRefinementInitialBracketWidth || 0) + Math.abs(tB - tA);

  for (let iter = 0; iter < 80; iter++) {
    if (profile) profile.eventRefinementIterations = (profile.eventRefinementIterations || 0) + 1;
    const mid = (lo + hi) / 2;
    const midResult = solve({ y0: refineFromStart ? yA : yLo, t0: refineFromStart ? tA : lo, t1: mid, rhs, controls, events: [] });
    if (midResult.status !== 'completed' || midResult.tFinal !== mid) {
      return { ok: false, cause: `${midResult.status}: inner refinement solve did not reach requested endpoint` };
    }
    const yMid = midResult.yFinal;
    const dydtMid = allocState(yMid.length);
    try {
      rhs(mid, yMid, dydtMid);
    } catch (error) {
      return { ok: false, cause: `rhs-failure: ${error.message}` };
    }
    const gMid = g(mid, yMid, dydtMid);
    if (!Number.isFinite(gMid)) return { ok: false, cause: 'rhs-failure: non-finite event value during refinement' };
    if (Math.sign(gMid) === (refineFromStart ? signA : Math.sign(gLo))) {
      lo = mid;
      if (!refineFromStart) {
        yLo = yMid;
        gLo = gMid;
      }
    } else {
      hi = mid;
    }
  }

  const root = (lo + hi) / 2;
  if (profile) profile.eventRefinementFinalBracketWidth = (profile.eventRefinementFinalBracketWidth || 0) + Math.abs(hi - lo);
  const rootResult = solve({ y0: refineFromStart ? yA : yLo, t0: refineFromStart ? tA : lo, t1: root, rhs, controls, events: [] });
  if (rootResult.status !== 'completed' || rootResult.tFinal !== root) {
    return { ok: false, cause: `${rootResult.status}: final refinement solve did not reach requested endpoint` };
  }
  if (profile) profile.eventRefinementCompleted = (profile.eventRefinementCompleted || 0) + 1;
  return { ok: true, t: root, y: rootResult.yFinal };
}

// Tier 2: safeguarded Brent-Dekker refinement. Every trial state is obtained
// by transactional DP54 re-integration from a cached bracket state. If the
// interpolation proposal fails a standard Brent safeguard, bisection is used.
function refineBrent({ rhs, g, tA, yA, tB, yB, gA, gB, controls, profile }) {
  const telemetry = { iterations: 0, interpolated: 0, bisected: 0 };
  if (!Number.isFinite(gB) || Math.sign(gA) === Math.sign(gB)) {
    return { ok: false, cause: 'brent: bracket endpoints do not have opposite-sign g values', telemetry };
  }
  const EPS = Number.EPSILON;
  const tol = controls?.refinementTol ?? 1e-15;
  const maxIterations = controls?.refinementMaxIterations ?? 100;
  let a = tA, b = tB, c = tA;
  let fa = gA, fb = gB, fc = gA;
  let stateA = { t: tA, y: yA }, stateB = { t: tB, y: yB }, stateC = stateA;
  let d = b - a, e = d;
  const width0 = Math.abs(b - a);
  const nested = (target) => {
    const candidates = [stateA, stateB, stateC];
    let base = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      if (Math.abs(target - candidates[i].t) < Math.abs(target - base.t)) base = candidates[i];
    }
    const res = solve({ y0: base.y, t0: base.t, t1: target, rhs, controls, events: [] });
    if (res.status !== 'completed' || res.tFinal !== target) throw new Error(`${res.status}: nested refinement solve did not reach requested endpoint`);
    if (profile) profile.eventRefinementNestedSolves = (profile.eventRefinementNestedSolves || 0) + 1;
    telemetry.nestedSolves++;
    return res.yFinal;
  };
  const evaluate = (target) => {
    const y = nested(target);
    const dydt = allocState(y.length);
    rhs(target, y, dydt);
    const value = g(target, y, dydt);
    if (!Number.isFinite(value)) throw new Error('non-finite event value during Brent refinement');
    return { t: target, y, g: value };
  };
  try {
    for (let iter = 0; iter < maxIterations; iter++) {
      telemetry.iterations++;
      if (profile) profile.eventRefinementIterations = (profile.eventRefinementIterations || 0) + 1;
      if (Math.abs(fc) < Math.abs(fb)) {
        a = b; fa = fb; stateA = stateB;
        b = c; fb = fc; stateB = stateC;
        c = a; fc = fa; stateC = stateA;
      }
      const tol1 = 2 * EPS * Math.abs(b) + 0.5 * tol * Math.max(1, width0);
      const xm = 0.5 * (c - b);
      if (Math.abs(xm) <= tol1 || fb === 0) {
        if (profile) {
          profile.eventRefinementBrentInterpolated = (profile.eventRefinementBrentInterpolated || 0) + telemetry.interpolated;
          profile.eventRefinementBrentBisected = (profile.eventRefinementBrentBisected || 0) + telemetry.bisected;
          profile.eventRefinementNestedSolves = (profile.eventRefinementNestedSolves || 0) + telemetry.nestedSolves;
        }
        if (profile) profile.eventRefinementFinalBracketWidth = (profile.eventRefinementFinalBracketWidth || 0) + Math.abs(c - b);
        return { ok: true, t: b, y: stateB.y, telemetry };
      }
      let interpolated = false;
      if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
        const s = fb / fa;
        let p, q;
        if (a === c) { p = 2 * xm * s; q = 1 - s; }
        else {
          const q0 = fa / fc, r = fb / fc;
          p = s * (2 * xm * q0 * (q0 - r) - (b - a) * (r - 1));
          q = (q0 - 1) * (r - 1) * (s - 1);
        }
        if (p > 0) q = -q;
        p = Math.abs(p);
        if (q !== 0 && 2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
          e = d; d = p / q; interpolated = true;
        }
      }
      if (interpolated) telemetry.interpolated++;
      else { d = xm; e = d; telemetry.bisected++; }
      a = b; fa = fb; stateA = stateB;
      const trial = b + (Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1));
      const value = evaluate(trial);
      b = value.t; fb = value.g; stateB = { t: value.t, y: value.y };
      if (Math.sign(fb) === Math.sign(fc)) { c = a; fc = fa; stateC = stateA; d = b - a; e = d; }
    }
  } catch (error) { return { ok: false, cause: error.message, telemetry }; }
  return { ok: false, cause: `brent: did not converge within ${maxIterations} iterations`, telemetry };
}

  SGRA.Physics.Kerr.DP54 = Object.freeze({ solve });
})(typeof window !== 'undefined' ? window : globalThis);
