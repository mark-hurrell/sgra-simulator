// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachDiscBending(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  // Beloborodov (2002) leading-order light-bending approximation for a
  // Schwarzschild photon emitted from radius r (in units of M = GM/c^2)
  // toward an observer at angle gamma from the local radial direction.
  // Accurate to a few percent for r >= ~6M; this is a STYLISED renderer,
  // not a validated physics path — no oracle, no LUT, no numerical gates.
  // See SGRA-DISC-REVISION-PLAN-v3.md.
  //
  // Inputs/outputs in units of M (i.e. r already divided by GM/c^2).
  function impactParameter(rM, cosGamma) {
    const u = 2 / rM; // 2M/r
    const cosAlpha = 1 - (1 - u) * (1 - cosGamma);
    const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));
    const denom = Math.sqrt(Math.max(1e-9, 1 - u));
    return rM * sinAlpha / denom; // b, units of M
  }

  // ---------------------------------------------------------------------
  // Backward (screen -> disc) inversion, for the per-pixel raster kernel.
  // SGRA-DISC-REVISION-PLAN-v3.md §2.
  //
  // Given a screen-space point in the disc's local 2D frame (x, y) — same
  // frame the old forward projection produced — recover the emitting disc
  // radius r (units of M) and disc azimuth phi for a given image order n
  // (1 = direct image, 2 = lensed/far-side image).
  //
  // Two-stage inversion, not a joint 2D solve:
  //
  //   1. phi is recovered in CLOSED FORM from the screen azimuth alone.
  //      Because x = b*sinPhi/sinG and y = -b*cosI*cosPhi/sinG share an
  //      identical positive factor (b/sinG), psi = atan2(y, x) reduces to
  //      atan2(-cosI*cosPhi, sinPhi) — independent of b and r entirely.
  //      Inverting: phi = atan2(cos(psi), -sin(psi)/cosI). Verified against
  //      the full forward projection (not just the reduced psi formula) by
  //      direct sweep to floating-point precision; no iteration needed for
  //      this half.
  //
  //   2. With phi fixed, cosGamma(phi) = sinI*cos(phi) is now a fixed
  //      number, and b(r) = impactParameter(r, cosGamma) is monotonic
  //      increasing in r across the whole disc range (verified by sweep,
  //      r_isco..r_outer, all cosGamma in [-1,1]) — a clean 1D root-find
  //      for r given the target b = hypot(x, y). Newton with a bisection
  //      fallback, bounded to [rMin, rMax].
  //
  // n=2 (lensed/far-side) uses cosGamma(phi + PI) = -cosGamma(phi) instead
  // of cosGamma(phi) — the screen point at disc-azimuth phi's direct image
  // is, for the lensed branch, showing the far-side point at phi+PI bent
  // back into view. Same phi recovery, same solver, opposite-sign cosGamma.

  const NEWTON_MAX_ITERS = 8;
  const NEWTON_TOL = 1e-4; // in units of M on b; the raster buffer is far coarser than this
  const DERIV_EPS = 1e-4;

  // Recover disc azimuth phi from screen azimuth psi and cos(inclination).
  // Closed form, no iteration. See derivation above.
  const MIN_ABS_COS_I = 1e-3;
  function invertPhi(psi, cosI) {
    // Avoid the edge-on singularity in the closed-form azimuth inversion.
    const safeCosI = Math.abs(cosI) < MIN_ABS_COS_I
      ? (cosI < 0 ? -MIN_ABS_COS_I : MIN_ABS_COS_I)
      : cosI;
    return Math.atan2(Math.cos(psi), -Math.sin(psi) / safeCosI);
  }

  // Solve impactParameter(r, cosGamma) = bTarget for r, bounded to
  // [rMinM, rMaxM]. Returns NaN if bTarget is unreachable in that bound.
  //
  // IMPORTANT: this does NOT guarantee NaN for bTarget < b_crit. The
  // Beloborodov leading-order impactParameter() is only trusted "for
  // r >= ~6M" (see header comment) and does not enforce a hard b >= b_crit
  // floor at all (r, cosGamma) — at r=r_isco, b ranges continuously from 0
  // to ~7.3M depending on cosGamma. A caller that needs the shadow
  // boundary (SGRA-DISC-REVISION-PLAN-v3 §2: "inside b_crit, black — the
  // shadow falls out of the geometry rather than being drawn as a shape")
  // MUST apply that as an explicit pre-check on screen b before calling
  // into this solver, not rely on this function to return NaN there. See
  // tests/disc_bending_sanity.test.mjs, "every pixel inside b_crit..." for
  // the reproduction of this finding.
  function solveRadiusForImpactParameter(bTarget, cosGamma, rMinM, rMaxM) {
    if (!(bTarget > 0) || !Number.isFinite(bTarget)) return NaN;

    const bAtMin = impactParameter(rMinM, cosGamma);
    const bAtMax = impactParameter(rMaxM, cosGamma);
    // b(r) is monotonic increasing in r over this range (verified by sweep);
    // a target outside [bAtMin, bAtMax] has no solution in bounds.
    if (bTarget < bAtMin || bTarget > bAtMax) return NaN;

    // Newton, starting from the linear-interpolation guess between the
    // bounds — cheap and already close for the shallow curvature this
    // function has away from the photon sphere.
    let r = rMinM + (rMaxM - rMinM) * (bTarget - bAtMin) / (bAtMax - bAtMin || 1);
    let lo = rMinM, hi = rMaxM;

    for (let iter = 0; iter < NEWTON_MAX_ITERS; iter++) {
      const b = impactParameter(r, cosGamma);
      const diff = b - bTarget;
      if (Math.abs(diff) < NEWTON_TOL) return r;

      // Keep a bisection bracket alive in case Newton overshoots outside
      // bounds (can happen near the steep part of the curve close to the
      // photon sphere) — this is the "bisection fallback" the revision
      // plan calls for, folded into the same loop rather than a second pass.
      if (diff > 0) hi = r; else lo = r;

      const bPlus = impactParameter(Math.min(hi, r + DERIV_EPS), cosGamma);
      const bMinus = impactParameter(Math.max(lo, r - DERIV_EPS), cosGamma);
      const denomR = (Math.min(hi, r + DERIV_EPS) - Math.max(lo, r - DERIV_EPS));
      const deriv = denomR > 0 ? (bPlus - bMinus) / denomR : 0;

      let next = deriv !== 0 ? r - diff / deriv : NaN;
      if (!(next > lo && next < hi) || !Number.isFinite(next)) {
        next = (lo + hi) / 2; // bisection fallback
      }
      r = next;
    }
    return r;
  }

  // Invert a single screen point (x, y) in the disc's local 2D frame to
  // (r, phi) in units of M, for image order n (1 or 2). Returns
  // { r, phi } with r = NaN when (x, y) does not resolve to any disc
  // radius between rMinM and rMaxM for this image order.
  //
  // Does NOT itself classify the shadow. Callers MUST apply the explicit
  // b < b_crit pre-check before calling this (see the warning on
  // solveRadiusForImpactParameter above) — do not rely on NaN here to mean
  // "shadow"; it only means "no disc radius in [rMinM, rMaxM] reaches this
  // b at this cosGamma", which can also happen for ordinary off-disc
  // points that are not inside the shadow at all.
  function invert(x, y, cosI, sinI, n, rMinM, rMaxM) {
    const bTarget = Math.hypot(x, y);
    const psi = Math.atan2(y, x);
    const phi = invertPhi(psi, cosI);
    const phiEmit = n === 2 ? phi + Math.PI : phi;
    const cosGamma = sinI * Math.cos(phiEmit);
    const r = solveRadiusForImpactParameter(bTarget, cosGamma, rMinM, rMaxM);
    return { r, phi };
  }

  // =====================================================================
  // SCHWARZSCHILD RAY-SHAPE TABLE (replaces the Beloborodov path for the
  // raster kernel; the functions above are retained because they are the
  // published-approximation API other call sites/tests already use).
  //
  // WHY: Beloborodov (2002) is a leading-order DIRECT-image approximation.
  // It cannot express winding, has no periastron, and therefore cannot
  // produce the far-side (n>=1) lensed images that give a black hole its
  // recognisable silhouette. The old kernel's "n=2" branch fed phi+PI into
  // the same direct formula and was correctly criticised in its own
  // comments as not a secondary image at all.
  //
  // WHAT THIS IS: the exact Schwarzschild null-geodesic orbit equation
  //
  //     d^2u/dTheta^2 = -u + 3 M u^2          (u = 1/r, M = 1 here)
  //
  // integrated by RK4 from infinity (u = 0, du/dTheta = 1/b at Theta = 0)
  // for a grid of impact parameters b, and tabulated as u(Theta; b). This
  // is exact geometry for a non-spinning hole, not an approximation: the
  // only errors are RK4 truncation and table interpolation.
  //
  // The table is a function of b alone. It does NOT depend on inclination,
  // on screen scale, on camera roll, or on time — so it is built once per
  // page load and never rebuilt. That is what makes per-pixel multi-order
  // lensing affordable in a 2D canvas renderer on a phone.
  //
  // HOW IT IS USED (see disc_raster_kernel.js for the screen-side algebra):
  // for a screen point at impact parameter b and screen azimuth psi about
  // the hole, the equatorial-plane crossings of the backward ray occur at
  // sweep angles Theta_n = Theta_0 + n*PI, with Theta_0 available in closed
  // form from the inclination. Each n is a distinct image order: n=0 direct,
  // n=1 first lensed (far-side) image, n=2 second. Looking up r = 1/u at
  // each Theta_n and testing r against [r_isco, r_outer] IS the transfer
  // function. No per-pixel ODE solve, no per-pixel root find.
  //
  // LIMITATIONS, stated plainly:
  //  - Schwarzschild only. No spin, no frame dragging, so no photon-ring
  //    asymmetry and no ISCO shift. The disc's world tilt is illustrative.
  //  - Orders n >= 3 are not tabulated (THETA_MAX below). Each successive
  //    order is suppressed by roughly exp(-pi) ~ 4% in width, so truncating
  //    at n=2 loses a sub-pixel-width contribution at these buffer sizes.
  //  - Geometrically thin, optically thick, equatorial disc. No height, no
  //    self-shadowing beyond the exact image-order occlusion, no radiative
  //    transfer.
  // ---------------------------------------------------------------------

  const B_CRIT_M = 3 * Math.sqrt(3);          // photon-sphere impact parameter
  const R_OUTER_LIMIT_M = 40;                 // matches R_OUTER_M in the kernel
  // Largest impact parameter any photon leaving r <= R_OUTER can carry:
  // b_max = r / sqrt(1 - 2/r) at r = R_OUTER (tangential emission). Nothing
  // on the disc can image outside this radius, at any inclination, for any
  // image order. This is the exact image bound and it is view-independent.
  const B_IMAGE_MAX_M = R_OUTER_LIMIT_M / Math.sqrt(1 - 2 / R_OUTER_LIMIT_M) + 0.05;

  const U_HORIZON = 0.5;                      // r = 2M
  const NB_INSIDE = 96;                       // b samples in [0, b_crit)
  const NB_OUTSIDE = 416;                     // b samples in [b_crit, b_max]
  const NB_TOTAL = NB_INSIDE + NB_OUTSIDE;
  const WARP_K = 5;                           // exponential clustering just outside b_crit
  const WARP_EXP = Math.exp(WARP_K);
  const THETA_MAX = 3.2 * Math.PI;            // covers Theta_0 in (0,PI) plus n = 1, 2
  const N_THETA = 385;
  const D_THETA = THETA_MAX / (N_THETA - 1);
  const RK_SUBSTEPS = 3;

  const U_CAPTURED = 1;                       // sentinel: ray already inside the horizon
  const U_ESCAPED = 0;                        // sentinel: ray already back at infinity

  let rayTable = null;
  // Per-row largest Theta for which the ray still exists (before capture or
  // before escaping back to infinity). Lets the raster kernel reject higher
  // image orders with one compare instead of three table probes, which is
  // where most of the per-pixel cost would otherwise go: n >= 1 images only
  // exist for b within a couple of M of b_crit.
  let rayThetaLimitTable = null;

  // b -> fractional row index. Uniform inside b_crit, exponentially
  // clustered immediately outside it (that is where winding, and therefore
  // every higher-order image, lives).
  function rowIndexForB(b) {
    if (!(b > 0)) return 0;
    if (b <= B_CRIT_M) return (b / B_CRIT_M) * NB_INSIDE;
    const frac = (b - B_CRIT_M) / (B_IMAGE_MAX_M - B_CRIT_M);
    if (frac >= 1) return NB_TOTAL - 1;
    return NB_INSIDE + (Math.log(1 + frac * (WARP_EXP - 1)) / WARP_K) * (NB_OUTSIDE - 1);
  }

  function bForRowIndex(j) {
    if (j <= NB_INSIDE) return (j / NB_INSIDE) * B_CRIT_M;
    const k = (j - NB_INSIDE) / (NB_OUTSIDE - 1);
    return B_CRIT_M + (B_IMAGE_MAX_M - B_CRIT_M) * (Math.exp(WARP_K * k) - 1) / (WARP_EXP - 1);
  }

  function integrateRow(b, table, offset) {
    if (!(b > 1e-9)) {
      for (let k = 0; k < N_THETA; k++) table[offset + k] = U_CAPTURED;
      return 0;
    }
    let u = 0;
    let w = 1 / b; // du/dTheta at infinity
    table[offset] = 0;
    const h = D_THETA / RK_SUBSTEPS;
    for (let k = 1; k < N_THETA; k++) {
      for (let s = 0; s < RK_SUBSTEPS; s++) {
        // RK4 on u' = w, w' = -u + 3u^2
        const k1u = w,               k1w = -u + 3 * u * u;
        const u2 = u + 0.5 * h * k1u, w2 = w + 0.5 * h * k1w;
        const k2u = w2,              k2w = -u2 + 3 * u2 * u2;
        const u3 = u + 0.5 * h * k2u, w3 = w + 0.5 * h * k2w;
        const k3u = w3,              k3w = -u3 + 3 * u3 * u3;
        const u4 = u + h * k3u,      w4 = w + h * k3w;
        const k4u = w4,              k4w = -u4 + 3 * u4 * u4;
        u += (h / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
        w += (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
        if (u >= U_HORIZON) {
          for (let kk = k; kk < N_THETA; kk++) table[offset + kk] = U_CAPTURED;
          return (k - 1) * D_THETA;
        }
        if (u <= 0) {
          for (let kk = k; kk < N_THETA; kk++) table[offset + kk] = U_ESCAPED;
          return (k - 1) * D_THETA;
        }
      }
      table[offset + k] = u;
    }
    return THETA_MAX;
  }

  // Build (idempotent). ~500 rows x 385 samples x 3 RK4 substeps, once.
  function ensureRayTable() {
    if (rayTable) return rayTable;
    const table = new Float32Array(NB_TOTAL * N_THETA);
    const limits = new Float32Array(NB_TOTAL);
    for (let j = 0; j < NB_TOTAL; j++) {
      limits[j] = integrateRow(bForRowIndex(j), table, j * N_THETA);
    }
    rayTable = table;
    rayThetaLimitTable = limits;
    return rayTable;
  }

  // Sample the ray shape. Fills `out` in place (no allocation in the raster
  // hot loop; callers must not retain it).
  //   out.captured  true  -> the backward ray is inside the horizon by then
  //   out.u         1/r at Theta
  //   out.dudTheta  d(1/r)/dTheta at Theta (sign carries inbound/outbound)
  function sampleRayInto(b, theta, out) {
    const table = ensureRayTable();
    if (!(theta >= 0) || theta > THETA_MAX - D_THETA) {
      out.captured = true; out.u = U_CAPTURED; out.dudTheta = 0; return out;
    }
    const jf = rowIndexForB(b);
    const j0 = Math.min(NB_TOTAL - 2, Math.max(0, Math.floor(jf)));
    const jt = jf - j0;
    const kf = theta / D_THETA;
    const k0 = Math.min(N_THETA - 2, Math.max(0, Math.floor(kf)));
    const kt = kf - k0;

    const a0 = j0 * N_THETA + k0;
    const a1 = a0 + N_THETA;
    const u00 = table[a0], u01 = table[a0 + 1];
    const u10 = table[a1], u11 = table[a1 + 1];

    // A capture sentinel anywhere in the interpolation stencil means the
    // pixel is on the capture side of a sharp boundary; blending across it
    // would invent a radius that no ray reaches.
    if (u00 >= U_HORIZON || u01 >= U_HORIZON || u10 >= U_HORIZON || u11 >= U_HORIZON) {
      out.captured = true; out.u = U_CAPTURED; out.dudTheta = 0; return out;
    }
    const uA = u00 + (u01 - u00) * kt;
    const uB = u10 + (u11 - u10) * kt;
    const dA = (u01 - u00) / D_THETA;
    const dB = (u11 - u10) / D_THETA;
    out.captured = false;
    out.u = uA + (uB - uA) * jt;
    out.dudTheta = dA + (dB - dA) * jt;
    return out;
  }

  // Conservative (minimum over the interpolation stencil) largest Theta at
  // which a ray of impact parameter b still exists.
  function rayThetaLimit(b) {
    ensureRayTable();
    const jf = rowIndexForB(b);
    const j0 = Math.min(NB_TOTAL - 2, Math.max(0, Math.floor(jf)));
    const a = rayThetaLimitTable[j0], c = rayThetaLimitTable[j0 + 1];
    return a < c ? a : c;
  }

  SGRA.Render.DiscBending = Object.freeze({
    impactParameter,
    invertPhi,
    solveRadiusForImpactParameter,
    invert,
    // Exact-Schwarzschild transfer path used by the raster kernel:
    ensureRayTable,
    sampleRayInto,
    rayThetaLimit,
    rowIndexForB,
    bForRowIndex,
    B_CRIT_M,
    B_IMAGE_MAX_M,
    THETA_MAX,
    N_THETA,
    NB_TOTAL
  });
})(typeof window !== 'undefined' ? window : globalThis);
