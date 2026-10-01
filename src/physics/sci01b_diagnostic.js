// SCI-01B diagnostic: Kerr plunge/turning-point topology classifier.
//
// STATUS: this file is a NEW, independently-written executable implementation
// of the SCI-01B reference contract described in
// `research/source/SCI01B_METHODOLOGY_2026-09-18.md` and
// `research/source/SCI01B_ADDENDUM_A_NEAR_EXTREMAL_2026-09-18.md`.
//
// It is explicitly NOT a recovered or reconstructed copy of the original
// `lib/sci01b_classifier.js` described in that research. That file, its
// fixture corpus, and its result JSON are absent from every artifact
// supplied to this codebase (see
// `authority/SCI01B_REFERENCE_ORACLE_RECOVERY_2026-09-18.md`,
// RECOVERY_STATUS = RECONSTRUCTION_BLOCKED_BY_MISSING_SPECIFICATION). The
// numbers reported in the methodology (2,981 fixtures, 0 false
// PLUNGE_COMMITTED, K=32, etc.) are evidence about THAT absent program, not
// a claim about this one. This module has its own test corpus
// (`tests/sci01b_diagnostic.test.mjs`) built from structural identities,
// closed-form Kerr special cases, and property checks; it does not reuse or
// claim the original's adversarial fixture numbers.
//
// SCOPE: read-only diagnostic. Given (a, E, Lz, Q, r_current,
// sign(dr/dlambda)), classify whether the future *inward* radial branch has
// an accessible exterior turning point, a committed plunge, or is
// undetermined. This module:
//   - does not read or write any body/physics/scheduler/integrator state;
//   - is not wired into SCI-01A's capture surface, event path, or any
//     ownership/timestep/rendering/HCI/sonification code;
//   - is not called from the production step loop by this patch;
//   - touches no SCI-02 file.
// Any future wiring of this module's verdict into production behaviour is a
// separate, explicit decision outside this patch.
//
// CONTRACT (reference-level, per the research pack):
//   R(r)     = (E(r^2+a^2) - a*Lz)^2 - Delta*(r^2 + (Lz-a*E)^2 + Q)
//   Delta(r) = r^2 - 2r + a^2
//   r_plus   = 1 + sqrt(1 - a^2)               (event horizon, a in (-1,1))
//   quartic:  c4 = E^2-1, c3 = 2, c2 = a^2E^2-Lz^2-Q-a^2,
//             c1 = 2[(Lz-aE)^2+Q], c0 = -a^2*Q
//   noise floor: N(r) = u*[2P^2 + 2|Delta|*B + 4*B*S_Delta + 8|P|*S_P]
//             where P = E*(r^2+a^2) - a*Lz, B = r^2+(Lz-aE)^2+Q,
//             S_P = |E*(r^2+a^2)| + |a*Lz|, S_Delta = r^2+2r+a^2, u = 2^-53
//   validated spin domain: |a| <= 0.9999 (exact |a|=1 excluded, per Addendum A)
//
// This module enforces |a| <= 0.9999 as an admission boundary and returns
// TOPOLOGY_AMBIGUOUS with AMB_SPIN_OUT_OF_RANGE outside it, matching the
// research's documented validated domain rather than silently extrapolating.

(function attachSCI01BDiagnostic(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};
  SGRA.Physics.Kerr = SGRA.Physics.Kerr || {};

  const VERSION = 'sci01b-diagnostic-new-implementation-v1-2026-09-19';
  const MAX_VALIDATED_SPIN = 0.9999;
  const MACHINE_U = Math.pow(2, -53);

  const VERDICT = Object.freeze({
    TURNING_POINT_EXISTS: 'TURNING_POINT_EXISTS',
    PLUNGE_COMMITTED: 'PLUNGE_COMMITTED',
    TOPOLOGY_AMBIGUOUS: 'TOPOLOGY_AMBIGUOUS'
  });

  const REASON = Object.freeze({
    AMB_NON_FINITE_INPUT: 'AMB_NON_FINITE_INPUT',
    AMB_SPIN_OUT_OF_RANGE: 'AMB_SPIN_OUT_OF_RANGE',
    AMB_CARTER_Q_NEGATIVE_VORTICAL_DOMAIN: 'AMB_CARTER_Q_NEGATIVE_VORTICAL_DOMAIN',
    AMB_ENERGY_NON_POSITIVE: 'AMB_ENERGY_NON_POSITIVE',
    AMB_CURRENT_RADIUS_INSIDE_HORIZON: 'AMB_CURRENT_RADIUS_INSIDE_HORIZON',
    AMB_R_NEGATIVE_AT_CURRENT_RADIUS: 'AMB_R_NEGATIVE_AT_CURRENT_RADIUS',
    AMB_RADIAL_DIRECTION_INDETERMINATE: 'AMB_RADIAL_DIRECTION_INDETERMINATE',
    AMB_CURRENT_RADIUS_ON_TURNING_POINT: 'AMB_CURRENT_RADIUS_ON_TURNING_POINT',
    AMB_NEAR_DOUBLE_ROOT: 'AMB_NEAR_DOUBLE_ROOT',
    AMB_INSUFFICIENT_CONDITIONING_MARGIN: 'AMB_INSUFFICIENT_CONDITIONING_MARGIN',
    AMB_HORIZON_GRAZING_MARGINAL_P_AT_RPLUS: 'AMB_HORIZON_GRAZING_MARGINAL_P_AT_RPLUS',
    AMB_ROOT_METHOD_DISAGREEMENT: 'AMB_ROOT_METHOD_DISAGREEMENT',
    AMB_INVARIANT_UNCERTAINTY_DOMINATES: 'AMB_INVARIANT_UNCERTAINTY_DOMINATES',
    AMB_VERDICT_UNSTABLE_UNDER_PERTURBATION: 'AMB_VERDICT_UNSTABLE_UNDER_PERTURBATION',
    AMB_ROOT_REFINEMENT_NONCONVERGENT: 'AMB_ROOT_REFINEMENT_NONCONVERGENT'
  });

  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }

  // ---------------------------------------------------------------------
  // Core algebra: Delta, R(r), dR/dr, quartic coefficients, noise floor.
  // ---------------------------------------------------------------------

  function horizonRadius(a) {
    const disc = 1 - a * a;
    if (disc < 0) return NaN;
    return 1 + Math.sqrt(disc);
  }

  function delta(r, a) { return r * r - 2 * r + a * a; }

  // R(r) evaluated by the exact operation sequence the methodology's
  // conditioning analysis is derived against (A, P, Delta, B, then P^2 -
  // Delta*B), so that N(r) below bounds THIS evaluation path.
  function evalR(r, a, E, L, Q) {
    const A = r * r + a * a;
    const P = E * A - a * L;
    const Dl = delta(r, a);
    const B = r * r + (L - a * E) * (L - a * E) + Q;
    const R = P * P - Dl * B;
    return { R, P, Dl, A, B };
  }

  function R_of_r(r, a, E, L, Q) { return evalR(r, a, E, L, Q).R; }

  // dR/dr, closed form (independent of the quartic-coefficient route below,
  // used as a cross-check and for Newton polishing).
  function dR_dr(r, a, E, L, Q) {
    const A = r * r + a * a;
    const P = E * A - a * L;
    const Dl = delta(r, a);
    const B = r * r + (L - a * E) * (L - a * E) + Q;
    const dP = 2 * E * r;
    const dDl = 2 * r - 2;
    const dB = 2 * r;
    return 2 * P * dP - (dDl * B + Dl * dB);
  }

  function quarticCoefficients(a, E, L, Q) {
    const c4 = E * E - 1;
    const c3 = 2;
    const c2 = a * a * E * E - L * L - Q - a * a;
    const c1 = 2 * ((L - a * E) * (L - a * E) + Q);
    const c0 = -a * a * Q;
    return { c4, c3, c2, c1, c0 };
  }

  function evalQuartic(r, c) {
    return (((c.c4 * r + c.c3) * r + c.c2) * r + c.c1) * r + c.c0;
  }

  function evalQuarticDeriv(r, c) {
    return ((4 * c.c4 * r + 3 * c.c3) * r + 2 * c.c2) * r + c.c1;
  }

  // Noise floor N(r), methodology eq. 4.2.
  function noiseFloor(r, a, E, L, Q) {
    const { P, Dl, B } = evalR(r, a, E, L, Q);
    const A = r * r + a * a;
    const S_P = Math.abs(E * A) + Math.abs(a * L);
    const S_Delta = r * r + 2 * r + a * a;
    return MACHINE_U * (2 * P * P + 2 * Math.abs(Dl) * B + 4 * B * S_Delta + 8 * Math.abs(P) * S_P);
  }

  // Invariant-uncertainty contribution, methodology eq. 4.4.
  function invariantUncertaintyTerm(r, a, E, L, Q, sigmaE, sigmaL, sigmaQ) {
    const { P, Dl } = evalR(r, a, E, L, Q);
    const A = r * r + a * a;
    const dR_dE = 2 * P * A + 2 * Dl * a * (L - a * E);
    const dR_dL = -2 * P * a - 2 * Dl * (L - a * E);
    const dR_dQ = -Dl;
    const sE = finite(sigmaE) ? sigmaE : 0;
    const sL = finite(sigmaL) ? sigmaL : 0;
    const sQ = finite(sigmaQ) ? sigmaQ : 0;
    return Math.abs(dR_dE) * sE + Math.abs(dR_dL) * sL + Math.abs(dR_dQ) * sQ;
  }

  function totalNoiseFloor(r, a, E, L, Q, sigmaE, sigmaL, sigmaQ) {
    return noiseFloor(r, a, E, L, Q) + invariantUncertaintyTerm(r, a, E, L, Q, sigmaE, sigmaL, sigmaQ);
  }

  // ---------------------------------------------------------------------
  // Real-root solvers for the quartic R(r) and its cubic derivative.
  // Two independent methods per the methodology's cross-validation step:
  //   Method A: Durand-Kerner (Weierstrass) complex quartic root iteration,
  //             filtered to real roots, Newton-polished on R_of_r.
  //   Method B: log-spaced sign-change scan + bisection, restricted to
  //             (r_plus, r_current), on R_of_r directly.
  // These are two different numerical routes to the same root set, not two
  // copies of the same algorithm, so disagreement between them is a
  // meaningful signal.
  // ---------------------------------------------------------------------

  function durandKernerQuarticRoots(c) {
    // Normalise to monic quartic z^4 + b3 z^3 + b2 z^2 + b1 z + b0.
    if (Math.abs(c.c4) < 1e-300) {
      // Degenerate to cubic/lower; handled by caller via generic cubic solve
      // on the derivative path, but guard here defensively.
      return [];
    }
    const b3 = c.c3 / c.c4, b2 = c.c2 / c.c4, b1 = c.c1 / c.c4, b0 = c.c0 / c.c4;
    const f = (z) => {
      // Horner in complex arithmetic, z = {re, im}.
      let re = 1, im = 0;
      const coeffs = [b3, b2, b1, b0];
      for (const cf of coeffs) {
        const nre = re * z.re - im * z.im + cf;
        const nim = re * z.im + im * z.re;
        re = nre; im = nim;
      }
      return { re, im };
    };
    const csub = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });
    const cmul = (x, y) => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
    const cdiv = (x, y) => {
      const d = y.re * y.re + y.im * y.im;
      if (d < 1e-300) return { re: 0, im: 0 };
      return { re: (x.re * y.re + x.im * y.im) / d, im: (x.im * y.re - x.re * y.im) / d };
    };
    // Standard initial guesses on a circle scaled to the coefficient magnitude.
    const scale = 1 + Math.max(Math.abs(b3), Math.abs(b2), Math.abs(b1), Math.abs(b0));
    let roots = [0, 1, 2, 3].map(k => {
      const theta = (2 * Math.PI * k) / 4 + 0.4;
      return { re: scale * Math.cos(theta), im: scale * Math.sin(theta) };
    });
    for (let iter = 0; iter < 200; iter++) {
      let maxDelta = 0;
      const next = roots.slice();
      for (let i = 0; i < 4; i++) {
        let denom = { re: 1, im: 0 };
        for (let j = 0; j < 4; j++) {
          if (j === i) continue;
          denom = cmul(denom, csub(roots[i], roots[j]));
        }
        const step = cdiv(f(roots[i]), denom);
        next[i] = csub(roots[i], step);
        maxDelta = Math.max(maxDelta, Math.hypot(step.re, step.im));
      }
      roots = next;
      if (maxDelta < 1e-14) break;
    }
    return roots;
  }

  function realCubicRoots(a3, a2, a1, a0) {
    // Closed-form real roots of a3*x^3 + a2*x^2 + a1*x + a0 (a3 != 0).
    if (Math.abs(a3) < 1e-300) {
      // Falls back to quadratic.
      if (Math.abs(a2) < 1e-300) {
        if (Math.abs(a1) < 1e-300) return [];
        return [-a0 / a1];
      }
      const disc = a1 * a1 - 4 * a2 * a0;
      if (disc < 0) return [];
      const sq = Math.sqrt(disc);
      return [(-a1 + sq) / (2 * a2), (-a1 - sq) / (2 * a2)];
    }
    const b2 = a2 / a3, b1 = a1 / a3, b0 = a0 / a3;
    const p = b1 - (b2 * b2) / 3;
    const q = (2 * b2 * b2 * b2) / 27 - (b2 * b1) / 3 + b0;
    const shift = -b2 / 3;
    const disc = (q * q) / 4 + (p * p * p) / 27;
    const roots = [];
    if (disc > 1e-300) {
      const sq = Math.sqrt(disc);
      const u = Math.cbrt(-q / 2 + sq);
      const v = Math.cbrt(-q / 2 - sq);
      roots.push(u + v + shift);
    } else if (Math.abs(disc) <= 1e-300) {
      const u = Math.cbrt(-q / 2);
      roots.push(2 * u + shift, -u + shift);
    } else {
      const r = Math.sqrt(-p * p * p / 27);
      const phi = Math.acos(Math.max(-1, Math.min(1, (-q / 2) / r)));
      const m = 2 * Math.sqrt(-p / 3);
      for (let k = 0; k < 3; k++) {
        roots.push(m * Math.cos((phi + 2 * Math.PI * k) / 3) + shift);
      }
    }
    return roots;
  }

  function newtonPolish(r0, a, E, L, Q, maxIter, tol) {
    let r = r0;
    for (let i = 0; i < maxIter; i++) {
      const Rv = R_of_r(r, a, E, L, Q);
      const dRv = dR_dr(r, a, E, L, Q);
      if (Math.abs(dRv) < 1e-300) return { r, converged: Math.abs(Rv) < tol };
      const step = Rv / dRv;
      r -= step;
      if (Math.abs(step) < tol) return { r, converged: true };
    }
    return { r, converged: false };
  }

  // Method A: complex quartic roots -> filter real -> Newton polish.
  function methodARoots(a, E, L, Q, lo, hi) {
    const c = quarticCoefficients(a, E, L, Q);
    let candidates = [];
    let nonconvergent = false;
    if (Math.abs(c.c4) < 1e-12) {
      // E^2 ~ 1: quartic degenerates towards cubic. Use derivative-style
      // cubic solver on the quartic coefficients directly as a fallback
      // real-root finder (bounded, still an independent code path from
      // Method B's scan/bisection).
      candidates = realCubicRoots(c.c3, c.c2, c.c1, c.c0);
    } else {
      const complexRoots = durandKernerQuarticRoots(c);
      for (const z of complexRoots) {
        if (Math.abs(z.im) < 1e-6 * Math.max(1, Math.abs(z.re))) candidates.push(z.re);
      }
    }
    const polished = [];
    for (const r0 of candidates) {
      if (!finite(r0) || r0 <= lo || r0 >= hi) continue;
      const { r, converged } = newtonPolish(r0, a, E, L, Q, 100, 1e-13);
      if (!converged) { nonconvergent = true; continue; }
      if (r > lo && r < hi) polished.push(r);
    }
    polished.sort((x, y) => x - y);
    return { roots: polished, nonconvergent };
  }

  // Method B: dual-anchored geometric (log-spaced) sign-change scan +
  // bisection on R_of_r, restricted to the open interval (lo, hi).
  // Independent of the quartic-coefficient route entirely.
  //
  // CORRECTNESS NOTE (found on review, 2026-09-19): an earlier version of
  // this function claimed "log-spaced" sampling in its comment but actually
  // built a uniform linear mesh (`lo + t*span`). That under-resolves
  // structure close to r_plus and close to r_current relative to the middle
  // of a wide interval. Fixed here to genuinely geometric spacing, anchored
  // from BOTH ends: distance from `lo` is sampled on a log grid (resolving
  // near-horizon structure) and distance from `hi` is sampled on a log grid
  // (resolving near-r_current structure); the two meshes are merged. This
  // still cannot be the sole safeguard against an even-multiplicity root
  // that stays tangent to (never crosses) zero -- a pure sign-change scan
  // structurally cannot detect a touch-without-crossing. That case is
  // caught independently by the interior-minima conditioning gate in
  // `classify()` step 6, which tests R at every interior stationary point
  // against the noise floor regardless of whether a sign change was ever
  // observed. See `sci01b_adversarial.test.mjs` for a fixture that
  // exercises exactly this: a near-tangent minimum with zero scan
  // crossings, where the minima gate is the only thing standing between
  // the classifier and a false PLUNGE_COMMITTED.
  function methodBRoots(a, E, L, Q, lo, hi, samples) {
    const n = samples || 4096;
    const roots = [];
    const span = hi - lo;
    if (!(span > 0)) return { roots };
    const floor = Math.max(1e-14, span * 1e-13);
    const half = Math.floor(n / 2);
    const xs = [];
    // Geometric mesh anchored at lo: lo + floor * (span/floor)^(i/half).
    const ratio = span / floor;
    for (let i = 0; i <= half; i++) {
      const t = i / half;
      xs.push(lo + floor * Math.pow(ratio, t));
    }
    // Geometric mesh anchored at hi (mirrored), same construction from the
    // other end, so structure near r_current gets equal resolution.
    for (let i = 0; i <= half; i++) {
      const t = i / half;
      xs.push(hi - floor * Math.pow(ratio, t));
    }
    xs.push(lo, hi);
    xs.sort((x, y) => x - y);
    // Dedupe near-identical samples from the two merged meshes.
    const merged = [];
    for (const x of xs) {
      if (merged.length === 0 || x - merged[merged.length - 1] > 1e-15 * Math.max(1, Math.abs(x))) merged.push(x);
    }
    let prevX = merged[0];
    let prevR = R_of_r(prevX, a, E, L, Q);
    for (let i = 1; i < merged.length; i++) {
      const x = merged[i];
      const Rv = R_of_r(x, a, E, L, Q);
      if (finite(prevR) && finite(Rv) && ((prevR <= 0 && Rv >= 0) || (prevR >= 0 && Rv <= 0)) && !(prevR === 0 && Rv === 0)) {
        let a0 = prevX, b0 = x, fa = prevR, fb = Rv;
        for (let it = 0; it < 100; it++) {
          const mid = 0.5 * (a0 + b0);
          const fm = R_of_r(mid, a, E, L, Q);
          if (fa <= 0 && fm >= 0 || fa >= 0 && fm <= 0) { b0 = mid; fb = fm; } else { a0 = mid; fa = fm; }
          if (Math.abs(b0 - a0) < 1e-14 * Math.max(1, Math.abs(mid))) break;
        }
        const r = 0.5 * (a0 + b0);
        if (r > lo && r < hi) roots.push(r);
      }
      prevX = x; prevR = Rv;
    }
    roots.sort((x, y) => x - y);
    return { roots };
  }

  function rootsAgree(rootsA, rootsB, tol) {
    if (rootsA.length !== rootsB.length) return false;
    for (let i = 0; i < rootsA.length; i++) {
      if (Math.abs(rootsA[i] - rootsB[i]) > tol * Math.max(1, Math.abs(rootsA[i]))) return false;
    }
    return true;
  }

  // Interior stationary points of R (roots of R' = 4c4 r^3+3c3 r^2+2c2 r+c1),
  // restricted to (lo, hi), classified as minima via R'' sign.
  function interiorMinima(a, E, L, Q, lo, hi) {
    const c = quarticCoefficients(a, E, L, Q);
    const stat = realCubicRoots(4 * c.c4, 3 * c.c3, 2 * c.c2, c.c1);
    const minima = [];
    for (const r of stat) {
      if (!finite(r) || r <= lo || r >= hi) continue;
      const dR2 = 12 * c.c4 * r * r + 6 * c.c3 * r + 2 * c.c2; // R''(r)
      if (dR2 > 0) minima.push(r);
    }
    return minima;
  }

  // ---------------------------------------------------------------------
  // Classifier: verdict order per the methodology's §5 decision tree.
  // ---------------------------------------------------------------------

  function ambiguous(reason, extra) {
    return Object.assign({ verdict: VERDICT.TOPOLOGY_AMBIGUOUS, reason }, extra || {});
  }

  function classify(input) {
    return classifyCore(input, true);
  }

  // skipProbe=false is used for the recursive perturbation sub-calls in
  // step 7 so that the probe itself never re-triggers another round of
  // perturbation probing (which would recurse without bound). A sub-call
  // that would otherwise reach step 7 is instead resolved as PLUNGE_COMMITTED
  // directly -- it has already passed every gate through step 6 -- and the
  // caller (the top-level classify) is the only place perturbation
  // instability is reported.
  function classifyCore(input, allowProbe) {
    const a = input.a, E = input.E, L = input.Lz, Q = input.Q;
    const rCur = input.r_current;
    const sgnDr = input.sign_dr_dlambda;
    const sigmaE = input.sigma_E, sigmaL = input.sigma_L, sigmaQ = input.sigma_Q;
    const K = finite(input.K) ? input.K : 32;

    // 1. Admission.
    for (const v of [a, E, L, Q, rCur, sgnDr]) {
      if (v !== undefined && v !== null && !finite(v)) return ambiguous(REASON.AMB_NON_FINITE_INPUT);
    }
    if (!finite(a) || !finite(E) || !finite(L) || !finite(Q) || !finite(rCur) || !finite(sgnDr)) {
      return ambiguous(REASON.AMB_NON_FINITE_INPUT);
    }
    // BUG FOUND round 4 (independent high-precision validation): this was
    // originally `>=`, which excludes the boundary value a=MAX_VALIDATED_SPIN
    // itself -- contradicting the documented CLOSED interval contract
    // "|a| <= 0.9999 validated" (Addendum A; also this file's own
    // MAX_VALIDATED_SPIN constant name and every prior round's docs).
    // `>=` silently made the true admitted domain the OPEN interval
    // |a| < 0.9999, so every constructed a=0.9999 adversarial case in
    // rounds 1-3 was rejected at admission (AMB_SPIN_OUT_OF_RANGE) before
    // ever reaching the topology logic -- invisible in earlier rounds
    // because nothing had specifically demanded a=0.9999 be admitted and
    // then asked why it kept coming back ambiguous. Found via the round-4
    // independent validator's case-by-case reason-code breakdown (64/64
    // a=0.9999 rungs showed AMB_SPIN_OUT_OF_RANGE, not a conditioning
    // reason). Fixed to `>`, so exactly a=0.9999 is admitted and anything
    // strictly greater (0.99991, ..., exact 1) remains excluded -- matching
    // the documented closed boundary while still excluding everything past
    // it, including exact extremality.
    if (Math.abs(a) > MAX_VALIDATED_SPIN) return ambiguous(REASON.AMB_SPIN_OUT_OF_RANGE);
    if (Q < 0) return ambiguous(REASON.AMB_CARTER_Q_NEGATIVE_VORTICAL_DOMAIN);
    if (E <= 0) return ambiguous(REASON.AMB_ENERGY_NON_POSITIVE);
    const rPlus = horizonRadius(a);
    if (!finite(rPlus) || rCur <= rPlus) return ambiguous(REASON.AMB_CURRENT_RADIUS_INSIDE_HORIZON);
    if (sgnDr !== 1 && sgnDr !== -1) return ambiguous(REASON.AMB_RADIAL_DIRECTION_INDETERMINATE);

    const Rcur = R_of_r(rCur, a, E, L, Q);
    const Ncur = totalNoiseFloor(rCur, a, E, L, Q, sigmaE, sigmaL, sigmaQ);

    // 2. On-shell check.
    if (Rcur < -Ncur) return ambiguous(REASON.AMB_R_NEGATIVE_AT_CURRENT_RADIUS);
    if (Math.abs(Rcur) <= Ncur) return ambiguous(REASON.AMB_CURRENT_RADIUS_ON_TURNING_POINT);

    // 3. Direction: outward branch is never committed.
    if (sgnDr > 0) return { verdict: VERDICT.TURNING_POINT_EXISTS, reason: null, note: 'outward_branch' };

    // 4. Two independent root methods, restricted to (r_plus, r_current).
    const mA = methodARoots(a, E, L, Q, rPlus, rCur);
    const mB = methodBRoots(a, E, L, Q, rPlus, rCur);
    if (mA.nonconvergent) return ambiguous(REASON.AMB_ROOT_REFINEMENT_NONCONVERGENT);
    if (!rootsAgree(mA.roots, mB.roots, 1e-6)) {
      return ambiguous(REASON.AMB_ROOT_METHOD_DISAGREEMENT, { methodARoots: mA.roots, methodBRoots: mB.roots });
    }

    if (mA.roots.length > 0) {
      // 5. Root resolved -> turning point, unless near-double-root.
      const rt = mA.roots[mA.roots.length - 1];
      const slope = Math.abs(dR_dr(rt, a, E, L, Q));
      const Nrt = totalNoiseFloor(rt, a, E, L, Q, sigmaE, sigmaL, sigmaQ);
      const intervalScale = Math.max(1e-300, rCur - rPlus);
      // NEW_RECONSTRUCTION_NUMERICAL_PARAMETER: this fraction is this
      // implementation's own near-double-root threshold (see
      // docs/SCI01B_RECONSTRUCTED_CONTRACT_FROZEN_2026-09-19.md and
      // docs/SCI01B_NEAR_DOUBLE_ROOT_FINAL_CLOSURE_2026-09-19.md) -- not an
      // inherited historical SCI-01B constant.
      //
      // VALUE HISTORY: originally 1e-6 (round 1, unvalidated placeholder).
      // Round 5 found this unreachable: across five independently
      // constructed bound-orbit (E<1, R''(r_d)>0) critical states spanning
      // all four mandatory families at a=0.9999 plus an a=0.3 control, the
      // achievable margin_ratio (this quantity) never exceeded ~1.7e-10
      // before Method A's Newton polish failed to converge or Method A/B
      // disagreed -- four to five orders of magnitude below 1e-6, making
      // the gate structurally dead code. Round 6 mapped this failure
      // boundary precisely per family (finest resolution: EQ_PRO at
      // a=0.9999 up to ~1.72e-10; the MINIMUM across all five states, the
      // conservative basis for a single global constant, was ~1.66e-12 at
      // the a=0.3 control) and derived this value as
      // (minimum observed ceiling) / 8, an explicit safety factor chosen
      // from a candidate ladder of /2../32 -- selected as a middle value:
      // enough margin below the smallest observed ceiling to absorb
      // uncertainty in that boundary estimate, without shrinking the gate's
      // effective reach to a sliver. Verified non-vacuous: deliberately
      // constructed states at ratios 1.05x-4x this threshold produce
      // AMB_NEAR_DOUBLE_ROOT on every mandatory family (16/40 targeted
      // checks hit the gate; the rest resolved confidently below 1x or hit
      // an unrelated upstream gate, never a false PLUNGE_COMMITTED).
      const nearDoubleRootFraction = finite(input.nearDoubleRootFraction) ? input.nearDoubleRootFraction : 2e-13;
      if (slope < 1e-300 || (Nrt / slope) > nearDoubleRootFraction * intervalScale) {
        return ambiguous(REASON.AMB_NEAR_DOUBLE_ROOT, { r_t: rt, margin_ratio: Nrt / slope / intervalScale });
      }
      return { verdict: VERDICT.TURNING_POINT_EXISTS, reason: null, r_t: rt };
    }

    // 6. No root: gate the absence via interior minima + horizon grazing.
    const minima = interiorMinima(a, E, L, Q, rPlus, rCur);
    for (const rm of minima) {
      const Rm = R_of_r(rm, a, E, L, Q);
      const Nm = totalNoiseFloor(rm, a, E, L, Q, sigmaE, sigmaL, sigmaQ);
      if (invariantUncertaintyTerm(rm, a, E, L, Q, sigmaE, sigmaL, sigmaQ) > noiseFloor(rm, a, E, L, Q) && Rm <= K * Nm) {
        return ambiguous(REASON.AMB_INVARIANT_UNCERTAINTY_DOMINATES, { r_min: rm });
      }
      if (!(Rm > K * Nm)) return ambiguous(REASON.AMB_INSUFFICIENT_CONDITIONING_MARGIN, { r_min: rm, R: Rm, N: Nm });
    }
    const Rplus = R_of_r(rPlus, a, E, L, Q);
    const Nplus = totalNoiseFloor(rPlus, a, E, L, Q, sigmaE, sigmaL, sigmaQ);
    if (!(Rplus > K * Nplus)) return ambiguous(REASON.AMB_HORIZON_GRAZING_MARGINAL_P_AT_RPLUS, { R: Rplus, N: Nplus });

    // 7. Stability probe: re-classify under +/-1e-13 relative perturbations
    // of E, L, Q. Q is perturbed downward only when it stays on-domain
    // (Q >= 0), matching the domain-boundary correction documented in
    // methodology §5.1. Sub-calls run with allowProbe=false so this step
    // cannot recurse into itself.
    if (allowProbe) {
      const eps = 1e-13;
      const probes = [
        { E: E * (1 + eps), L, Q },
        { E: E * (1 - eps), L, Q },
        { E, L: L * (1 + eps), Q },
        { E, L: L * (1 - eps), Q },
        { E, L, Q: Q * (1 + eps) }
      ];
      if (Q > 0) probes.push({ E, L, Q: Q * (1 - eps) });
      for (const p of probes) {
        const sub = classifyCore({
          a, E: p.E, Lz: p.L, Q: p.Q, r_current: rCur, sign_dr_dlambda: sgnDr,
          sigma_E: sigmaE, sigma_L: sigmaL, sigma_Q: sigmaQ, K, nearDoubleRootFraction: input.nearDoubleRootFraction
        }, false);
        if (sub.verdict !== VERDICT.PLUNGE_COMMITTED) {
          return ambiguous(REASON.AMB_VERDICT_UNSTABLE_UNDER_PERTURBATION, { probe: p, subVerdict: sub.verdict });
        }
      }
    }

    // 8. Otherwise, committed.
    return { verdict: VERDICT.PLUNGE_COMMITTED, reason: null };
  }

  // ---------------------------------------------------------------------
  // Live-state adapter.
  //
  // This is deliberately NOT auto-wired to any production body state. The
  // authority recovery report names the missing accepted contract for
  // extracting (E, Lz, Q, sign(dr/dlambda)) from a live production body as
  // one of the unresolved gaps. This function documents the *shape* of that
  // adapter and fails closed (throws) if the caller has not supplied every
  // required field explicitly -- it does not guess, default, or silently
  // pull values from an unrelated production structure.
  // ---------------------------------------------------------------------

  function buildDiagnosticInput(explicit) {
    const required = ['a', 'E', 'Lz', 'Q', 'r_current', 'sign_dr_dlambda'];
    for (const key of required) {
      if (!(key in explicit)) {
        throw new Error(
          'SCI01BDiagnostic.buildDiagnosticInput: missing required field "' + key + '". ' +
          'This adapter does not infer SCI-01B inputs from production body state; ' +
          'the caller must supply an explicitly justified (a, E, Lz, Q, r_current, ' +
          'sign(dr/dlambda)) extraction. See authority/SCI01B_REFERENCE_ORACLE_RECOVERY_2026-09-18.md.'
        );
      }
    }
    const out = {
      a: explicit.a, E: explicit.E, Lz: explicit.Lz, Q: explicit.Q,
      r_current: explicit.r_current, sign_dr_dlambda: explicit.sign_dr_dlambda
    };
    if ('sigma_E' in explicit) out.sigma_E = explicit.sigma_E;
    if ('sigma_L' in explicit) out.sigma_L = explicit.sigma_L;
    if ('sigma_Q' in explicit) out.sigma_Q = explicit.sigma_Q;
    if ('K' in explicit) out.K = explicit.K;
    return out;
  }

  SGRA.Physics.Kerr.SCI01BDiagnostic = Object.freeze({
    VERSION,
    VERDICT,
    REASON,
    MAX_VALIDATED_SPIN,
    horizonRadius,
    delta,
    R_of_r,
    dR_dr,
    quarticCoefficients,
    noiseFloor,
    invariantUncertaintyTerm,
    totalNoiseFloor,
    methodARoots,
    methodBRoots,
    interiorMinima,
    classify,
    buildDiagnosticInput,
    // exposed for tests, not part of the stable external contract:
    _internal: { durandKernerQuarticRoots, realCubicRoots, newtonPolish, evalQuartic, evalQuarticDeriv }
  });
})(typeof window !== 'undefined' ? window : globalThis);
