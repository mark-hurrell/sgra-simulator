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
  const DELTA_X = [1, 0, 0];
  const DELTA_Y = [0, 1, 0];
  const DELTA_Z = [0, 0, 1];

//
// Implements SGRA_EXACT_KERR_FEASIBILITY_IMPLEMENTATION_PLAN_v2.md §3.2
// (Kerr radius r), §3.3 (ingoing/advanced Kerr-Schild metric), §3.4
// (derivatives of the metric parts). Pure math, no allocation in hot paths
// where an `out` buffer is supplied. Nothing here is re-derived from the
// plan; every formula is transcribed literally per §3's normative
// instruction ("If any equation here looks wrong, REPORT and STOP — do not
// edit.").
//
// Internal geometrized units, M = 1 (§3.1). Signature (-,+,+,+).

/**
 * Kerr radius r and the pieces derived alongside it (§3.2).
 *
 * R^2 = x^2+y^2+z^2. r is the positive root of
 *   r^4 - (R^2-a^2) r^2 - a^2 z^2 = 0
 * computed as
 *   D  = sqrt( (R^2-a^2)^2 + 4 a^2 z^2 )
 *   r^2 = ( (R^2-a^2) + D ) / 2
 *   r  = sqrt(r^2)
 * Identity: D = 2 r^2 - R^2 + a^2.
 * Guard: if D < 1e-30 or r < 1e-12, abort with F-KERR-MATH.
 *
 * @returns {{ r: number, r2: number, D: number, Sigma: number, A: number }}
 */
function ksRadius(x, y, z, a) {
  const R2 = x * x + y * y + z * z;
  const a2 = a * a;
  const term = R2 - a2;
  const D = Math.sqrt(term * term + 4 * a2 * z * z);
  if (!(D >= 1e-30)) {
    const err = new Error(`ksRadius: D collapsed (D=${D}) at (${x},${y},${z},a=${a})`);
    err.classification = 'F-KERR-MATH';
    throw err;
  }
  const r2 = (term + D) / 2;
  const r = Math.sqrt(r2);
  if (!(r >= 1e-12) || !Number.isFinite(r)) {
    const err = new Error(`ksRadius: r collapsed or non-finite (r=${r}) at (${x},${y},${z},a=${a})`);
    err.classification = 'F-KERR-MATH';
    throw err;
  }
  const Sigma = r2 * r2 + a2 * z * z; // Sigma = r^4 + a^2 z^2
  const A = r2 + a2; // A = r^2 + a^2
  return { r, r2, D, Sigma, A };
}

/**
 * Exact derivatives of Kerr r with respect to x, y, z (§3.2).
 *   dr/dx = x r / D        dr/dy = y r / D        dr/dz = z (r^2+a^2) / (r D)
 */
function dKsRadius(x, y, z, a, radiusParts) {
  const { r, D, A } = radiusParts ?? ksRadius(x, y, z, a);
  const drdx = (x * r) / D;
  const drdy = (y * r) / D;
  const drdz = (z * A) / (r * D);
  return { drdx, drdy, drdz };
}

/**
 * Metric parts f, l_t, l_x, l_y, l_z (§3.3), plus r, D, Sigma, A for reuse.
 *
 * Sigma = r^4 + a^2 z^2       f = 2 M r^3 / Sigma       A = r^2 + a^2
 * l_t = 1     l_x = (r x + a y)/A     l_y = (r y - a x)/A     l_z = z/r
 *
 * l_t = +1 is the ingoing/advanced form (regular on the future horizon).
 * The outgoing form is not used anywhere in this lane.
 *
 * @param {Float64Array|Object} [out] optional reusable output object
 */
function metricParts(x, y, z, M, a, out) {
  const radiusParts = ksRadius(x, y, z, a);
  const { r, Sigma, A } = radiusParts;
  const f = (2 * M * r * r * r) / Sigma;
  const lt = 1;
  const lx = (r * x + a * y) / A;
  const ly = (r * y - a * x) / A;
  const lz = z / r;

  const result = out || {};
  result.f = f;
  result.lt = lt;
  result.lx = lx;
  result.ly = ly;
  result.lz = lz;
  result.r = r;
  result.D = radiusParts.D;
  result.Sigma = Sigma;
  result.A = A;
  return result;
}

/**
 * Covariant metric g_{mu nu} = eta_{mu nu} + f l_mu l_nu (§3.3).
 * Row-major Float64Array(16), index order (t,x,y,z) i.e. [mu*4+nu].
 * Signature (-,+,+,+): eta = diag(-1,1,1,1).
 *
 * @param {Float64Array} [out] optional Float64Array(16) to fill in place
 */
function metricCov(x, y, z, M, a, out) {
  const mp = metricParts(x, y, z, M, a);
  const { f, lt, lx, ly, lz } = mp;
  const l = [lt, lx, ly, lz];
  const eta = [-1, 1, 1, 1];

  const g = out || new Float64Array(16);
  for (let mu = 0; mu < 4; mu++) {
    for (let nu = 0; nu < 4; nu++) {
      const etaTerm = mu === nu ? eta[mu] : 0;
      g[mu * 4 + nu] = etaTerm + f * l[mu] * l[nu];
    }
  }
  return g;
}

/**
 * Contravariant (inverse) metric g^{mu nu} from the CLOSED FORM (§3.3) —
 * never inverted numerically:
 *   g^{mu nu} = eta^{mu nu} - f l^mu l^nu     with  l^t = -1,  l^i = l_i
 *   => g^tt = -1 - f,   g^{ti} = f l_i,   g^{ij} = delta_ij - f l_i l_j
 *
 * @param {Float64Array} [out] optional Float64Array(16) to fill in place
 */
function metricInv(x, y, z, M, a, out) {
  const mp = metricParts(x, y, z, M, a);
  const { f, lx, ly, lz } = mp;
  const li = [lx, ly, lz]; // l^i = l_i (spatial components unchanged by index raise here)

  const g = out || new Float64Array(16);
  // index 0 = t, 1..3 = x,y,z
  g[0 * 4 + 0] = -1 - f; // g^tt
  for (let i = 0; i < 3; i++) {
    const gti = f * li[i];
    g[0 * 4 + (i + 1)] = gti; // g^{ti}
    g[(i + 1) * 4 + 0] = gti; // g^{it} (symmetric)
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const deltaIj = i === j ? 1 : 0;
      g[(i + 1) * 4 + (j + 1)] = deltaIj - f * li[i] * li[j]; // g^{ij}
    }
  }
  return g;
}

/**
 * Derivatives of the metric parts (§3.4):
 *   df/dr|_z = 2 M r^2 (3 Sigma - 4 r^4) / Sigma^2
 *   df/dz|_r = -4 M a^2 z r^3 / Sigma^2
 *   d_i f    = (df/dr)(dr/dx_i)  [ + df/dz|_r  for i = z ]
 *
 *   d_i l_x = [ (x d_i r + r delta_ix + a delta_iy) A - (r x + a y) 2 r d_i r ] / A^2
 *   d_i l_y = [ (y d_i r + r delta_iy - a delta_ix) A - (r y - a x) 2 r d_i r ] / A^2
 *   d_i l_z = delta_iz / r - z (d_i r) / r^2
 *
 * Returns { dfdx, dfdy, dfdz, dlx: [dlx/dx, dlx/dy, dlx/dz], dly: [...], dlz: [...],
 *           drdx, drdy, drdz }
 */
function dMetricParts(x, y, z, M, a, out) {
  const radiusParts = ksRadius(x, y, z, a);
  const { r, Sigma, A } = radiusParts;
  const { drdx, drdy, drdz } = dKsRadius(x, y, z, a, radiusParts);
  const dr = out?.dr || [drdx, drdy, drdz];
  if (out?.dr) {
    dr[0] = drdx;
    dr[1] = drdy;
    dr[2] = drdz;
  }

  const dfdr_z = (2 * M * r * r * (3 * Sigma - 4 * r * r * r * r)) / (Sigma * Sigma);
  const dfdz_r = (-4 * M * a * a * z * r * r * r) / (Sigma * Sigma);

  const dfdx = dfdr_z * drdx;
  const dfdy = dfdr_z * drdy;
  const dfdz = dfdr_z * drdz + dfdz_r;

  const rx_ay = r * x + a * y;
  const ry_ax = r * y - a * x;

  const dlx = out?.dlx || new Array(3);
  const dly = out?.dly || new Array(3);
  const dlz = out?.dlz || new Array(3);

  const deltaIx = DELTA_X;
  const deltaIy = DELTA_Y;
  const deltaIz = DELTA_Z;

  for (let i = 0; i < 3; i++) {
    const dri = dr[i];
    dlx[i] = ((x * dri + r * deltaIx[i] + a * deltaIy[i]) * A - rx_ay * 2 * r * dri) / (A * A);
    dly[i] = ((y * dri + r * deltaIy[i] - a * deltaIx[i]) * A - ry_ax * 2 * r * dri) / (A * A);
    dlz[i] = deltaIz[i] / r - (z * dri) / (r * r);
  }

  const result = out || {};
  result.dfdx = dfdx;
  result.dfdy = dfdy;
  result.dfdz = dfdz;
  result.dlx = dlx;
  result.dly = dly;
  result.dlz = dlz;
  result.drdx = drdx;
  result.drdy = drdy;
  result.drdz = drdz;
  return result;
}

/**
 * Horizon radius r_+ = M + sqrt(M^2 - a^2) (§3.3, §3.8).
 * chi = 0 => r_+ = 2 = R_S.
 */
function horizonRadius(M, a) {
  const disc = M * M - a * a;
  if (disc < 0) {
    throw new Error(`horizonRadius: naked-singularity parameters (M=${M}, a=${a}), M^2 - a^2 < 0`);
  }
  return M + Math.sqrt(disc);
}

/**
 * Ergosurface r_E(theta) = M + sqrt(M^2 - a^2 cos^2(theta)), cos(theta) = z/r (§3.3, §3.8).
 * Accepts cosTheta directly (caller supplies z/r).
 */
function ergoRadius(M, a, cosTheta) {
  const disc = M * M - a * a * cosTheta * cosTheta;
  if (disc < 0) {
    throw new Error(`ergoRadius: invalid parameters (M=${M}, a=${a}, cosTheta=${cosTheta}), discriminant < 0`);
  }
  return M + Math.sqrt(disc);
}

  SGRA.Physics.Kerr.KerrSchildMetric = Object.freeze({ ksRadius, dKsRadius, metricParts, metricCov, metricInv, dMetricParts, horizonRadius, ergoRadius });
})(typeof window !== 'undefined' ? window : globalThis);
