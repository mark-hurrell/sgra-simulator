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
  const { metricParts, dMetricParts, ksRadius, horizonRadius, metricInv } = SGRA.Physics.Kerr.KerrSchildMetric;
//
// Implements SGRA_EXACT_KERR_FEASIBILITY_IMPLEMENTATION_PLAN_v2.md §3.5
// (state, Hamiltonian, equations of motion), §3.6 (external force and the
// orthogonality closure), and §4.4 (state admission). Pure transcription of
// the normative equations; nothing here is re-derived.
//
// State (7 components, hatted): Y = [x, y, z, p_x, p_y, p_z, p_t].
// p_t is carried EXPLICITLY and evolved, not solved from the mass shell —
// this is deliberate (§3.5) and must not be "optimised" away.


const STATE_DIM = 7;

const IDX = Object.freeze({ X: 0, Y: 1, Z: 2, PX: 3, PY: 4, PZ: 5, PT: 6 });

/**
 * P = l^mu p_mu = -p_t + l_x p_x + l_y p_y + l_z p_z   (§3.5)
 */
function computeP(mp, px, py, pz, pt) {
  return -pt + mp.lx * px + mp.ly * py + mp.lz * pz;
}

/**
 * H = 1/2 g^{mu nu} p_mu p_nu
 *   = 1/2 [ -p_t^2 + p_x^2 + p_y^2 + p_z^2 - f P^2 ]     (§3.5)
 */
function hamiltonian(mp, px, py, pz, pt) {
  const P = computeP(mp, px, py, pz, pt);
  return 0.5 * (-pt * pt + px * px + py * py + pz * pz - mp.f * P * P);
}

/**
 * mass-shell residual = 2H + 1  (= 0 for a test particle)
 */
function massShellResidual(mp, px, py, pz, pt) {
  return 2 * hamiltonian(mp, px, py, pz, pt) + 1;
}

/**
 * E = -p_t (conserved for dp_t/dlambda|_geo = 0, since d_t g = 0).
 */
function energy(pt) {
  return -pt;
}

/**
 * L_z = x p_y - y p_x (conserved).
 */
function angularMomentumZ(x, y, px, py) {
  return x * py - y * px;
}

/**
 * Contravariant velocity, reduced forms (§3.5):
 *   u^t = -p_t + f P
 *   u^i = p_i - f l_i P
 *
 * Returns { ut, ux, uy, uz, P }.
 */
function contravariantVelocity(mp, px, py, pz, pt) {
  const P = computeP(mp, px, py, pz, pt);
  const ut = -pt + mp.f * P;
  const ux = px - mp.f * mp.lx * P;
  const uy = py - mp.f * mp.ly * P;
  const uz = pz - mp.f * mp.lz * P;
  return { ut, ux, uy, uz, P };
}

/**
 * Independent full-matrix-product contravariant velocity, u^mu = g^{mu nu} p_nu,
 * using the closed-form inverse metric directly (metricInv), not the
 * reduced forms above. Used ONLY by gate G1-0d to cross-check the reduced
 * forms; not used in the RHS itself, so a slip in one path is not silently
 * shared by the other.
 *
 * @returns {{ ut: number, ux: number, uy: number, uz: number }}
 */
function contravariantVelocityFullMatrix(x, y, z, M, a, px, py, pz, pt) {
  const ginv = metricInv(x, y, z, M, a);
  const p = [pt, px, py, pz]; // order (t,x,y,z)
  const uFull = [0, 0, 0, 0];
  for (let mu = 0; mu < 4; mu++) {
    let sum = 0;
    for (let nu = 0; nu < 4; nu++) sum += ginv[mu * 4 + nu] * p[nu];
    uFull[mu] = sum;
  }
  return { ut: uFull[0], ux: uFull[1], uy: uFull[2], uz: uFull[3] };
}

/**
 * Geodesic momentum evolution (d_t g = 0 gauge; §3.5):
 *   dp_i/dlambda|_geo = 1/2 (d_i f) P^2 + f P ( (d_i l_x) p_x + (d_i l_y) p_y + (d_i l_z) p_z )
 *
 * Returns [dpx_dlambda, dpy_dlambda, dpz_dlambda] (spatial only; dp_t/dlambda|_geo = 0).
 */
function geodesicMomentumDerivative(dmp, P, px, py, pz, f, out = null) {
  const result = out || new Array(3);
  for (let i = 0; i < 3; i++) {
    const dif = i === 0 ? dmp.dfdx : i === 1 ? dmp.dfdy : dmp.dfdz;
    const dlx_i = dmp.dlx[i];
    const dly_i = dmp.dly[i];
    const dlz_i = dmp.dlz[i];
    result[i] = 0.5 * dif * P * P + f * P * (dlx_i * px + dly_i * py + dlz_i * pz);
  }
  return result;
}

/**
 * Admit a local hatted state per §4.4. Given local hatted x and coordinate
 * 3-velocity v^i, forms V^mu = (1, v^x, v^y, v^z) and
 *   N = g_{mu nu} V^mu V^nu = g_tt + 2 g_ti v^i + g_ij v^i v^j
 *
 * | N < -1e-12              | ADMIT  timelike, future-directed |
 * | -1e-12 <= N < 0          | REJECT near-null-marginal        |
 * | N >= 0                   | REJECT non-timelike-initial-state|
 * | r <= r_+ at admission    | REJECT inside-horizon-initial-state |
 * | any non-finite input     | REJECT non-finite-initial-state  |
 *
 * On admission:
 *   u^t = 1/sqrt(-N)      u^mu = u^t V^mu      p_mu = g_{mu nu} u^nu
 *   assert |2H+1| < 1e-12  and  u^t > 0   (failure => F-KERR-MATH)
 *
 * No clamping, projection, or rescaling. Rejection is explicit and total.
 *
 * @returns {{ admitted: boolean, N: number|null, reason: string|null, p: number[]|null }}
 */
function timelikeNorm(mp, V) {
  const l = [mp.lt, mp.lx, mp.ly, mp.lz];
  const eta = [-1, 1, 1, 1];
  let lDotV = 0;
  for (let mu = 0; mu < 4; mu++) lDotV += l[mu] * V[mu];
  let etaContraction = 0;
  for (let mu = 0; mu < 4; mu++) etaContraction += eta[mu] * V[mu] * V[mu];
  return etaContraction + mp.f * lDotV * lDotV;
}

function admitState({ x, y, z, vx, vy, vz }, M, a) {
  const inputs = [x, y, z, vx, vy, vz];
  if (inputs.some((v) => !Number.isFinite(v))) {
    return { admitted: false, N: null, reason: 'non-finite-initial-state', p: null };
  }

  let radiusParts;
  try {
    radiusParts = ksRadius(x, y, z, a);
  } catch (e) {
    return { admitted: false, N: null, reason: 'non-finite-initial-state', p: null };
  }

  const rPlus = horizonRadius(M, a);
  if (radiusParts.r <= rPlus) {
    return { admitted: false, N: null, reason: 'inside-horizon-initial-state', p: null };
  }

  const mp = metricParts(x, y, z, M, a);
  const f = mp.f;
  const l = [mp.lt, mp.lx, mp.ly, mp.lz];
  const eta = [-1, 1, 1, 1];
  const V = [1, vx, vy, vz];
  const N = timelikeNorm(mp, V);

  if (N >= 0) {
    return { admitted: false, N, reason: 'non-timelike-initial-state', p: null };
  }
  if (N >= -1e-12) {
    return { admitted: false, N, reason: 'near-null-marginal', p: null };
  }

  const ut = 1 / Math.sqrt(-N);
  const uContra = [ut, ut * vx, ut * vy, ut * vz];

  // p_mu = g_{mu nu} u^nu = eta_{mu nu} u^nu + f l_mu (l . u)
  let lDotU = 0;
  for (let mu = 0; mu < 4; mu++) lDotU += l[mu] * uContra[mu];
  const pCov = new Array(4);
  for (let mu = 0; mu < 4; mu++) {
    pCov[mu] = eta[mu] * uContra[mu] + f * l[mu] * lDotU;
  }
  const [pt, px, py, pz] = pCov;

  const resid = massShellResidual(mp, px, py, pz, pt);
  if (!(Math.abs(resid) < 1e-12)) {
    const err = new Error(`admitState: mass-shell residual ${resid} exceeds 1e-12 at admission`);
    err.classification = 'F-KERR-MATH';
    throw err;
  }
  if (!(ut > 0)) {
    const err = new Error(`admitState: u^t = ${ut} is not positive at admission`);
    err.classification = 'F-KERR-MATH';
    throw err;
  }

  return { admitted: true, N, reason: null, p: [px, py, pz, pt] };
}

/**
 * Create a geodesic RHS function rhs(t, y, dydt) with no per-call
 * allocation (closure-owned scratch buffers).
 *
 * Coordinate-time parameterisation (§3.5, the SGRA common-time contract):
 *   dx^i/dt_hat = u^i / u^t
 *   dp_i/dt_hat = ( dp_i/dlambda|_geo + F_i ) / u^t
 *   dp_t/dt_hat =                         F_t   / u^t
 *
 * externalAcceleration(t, y, out3) fills out3 = [alpha_x, alpha_y, alpha_z]
 * (spatial coordinate acceleration, §3.6) and may be null/undefined for no
 * external coupling (Tranche 1 fixtures: perturber_count = 0).
 *
 * Orthogonality closure (§3.6):
 *   F_i = u^t alpha_i          F_t = -(F_j u^j) / u^t
 *
 * Guard: if |u^t| < 1e-12 or u^t <= 0, abort the step (F-NUMERICAL).
 */
function createGeodesicRhs({ M, a, externalAcceleration, profile = null }) {
  const mpScratch = {};
  const dmpScratch = { dr: new Array(3), dlx: new Array(3), dly: new Array(3), dlz: new Array(3) };
  const alphaScratch = [0, 0, 0];
  const geoScratch = new Array(3);

  return function rhs(t, y, dydt) {
    const profileNow = profile && typeof global.performance?.now === 'function' ? () => global.performance.now() : null;
    const rhsStart = profileNow ? profileNow() : 0;
    if (profile) profile.rhsCalls = (profile.rhsCalls || 0) + 1;
    const x = y[IDX.X];
    const yy = y[IDX.Y];
    const z = y[IDX.Z];
    const px = y[IDX.PX];
    const py = y[IDX.PY];
    const pz = y[IDX.PZ];
    const pt = y[IDX.PT];

    let phaseStart = profileNow ? profileNow() : 0;
    metricParts(x, yy, z, M, a, mpScratch);
    if (profile) {
      profile.metricEvaluations = (profile.metricEvaluations || 0) + 1;
      profile.metricMs = (profile.metricMs || 0) + (profileNow ? profileNow() - phaseStart : 0);
    }
    phaseStart = profileNow ? profileNow() : 0;
    dMetricParts(x, yy, z, M, a, dmpScratch, profile);
    if (profile) {
      profile.metricDerivativeEvaluations = (profile.metricDerivativeEvaluations || 0) + 1;
      profile.metricDerivativeMs = (profile.metricDerivativeMs || 0) + (profileNow ? profileNow() - phaseStart : 0);
    }

    const P = computeP(mpScratch, px, py, pz, pt);
    const { ut, ux, uy, uz } = contravariantVelocity(mpScratch, px, py, pz, pt);

    if (!Number.isFinite(ut) || Math.abs(ut) < 1e-12 || ut <= 0) {
      const err = new Error(`createGeodesicRhs: guard failed, u^t = ${ut}`);
      err.classification = 'F-NUMERICAL';
      throw err;
    }

    phaseStart = profileNow ? profileNow() : 0;
    const geo = geodesicMomentumDerivative(dmpScratch, P, px, py, pz, mpScratch.f, geoScratch);
    if (profile) {
      profile.hamiltonianDerivativeEvaluations = (profile.hamiltonianDerivativeEvaluations || 0) + 1;
      profile.hamiltonianDerivativeMs = (profile.hamiltonianDerivativeMs || 0) + (profileNow ? profileNow() - phaseStart : 0);
    }

    let Fx = 0;
    let Fy = 0;
    let Fz = 0;
    let Ft = 0;
    if (externalAcceleration) {
      externalAcceleration(t, y, alphaScratch);
      const alphaX = alphaScratch[0];
      const alphaY = alphaScratch[1];
      const alphaZ = alphaScratch[2];
      Fx = ut * alphaX;
      Fy = ut * alphaY;
      Fz = ut * alphaZ;
      const FjUj = Fx * ux + Fy * uy + Fz * uz;
      Ft = -FjUj / ut;
    }

    dydt[IDX.X] = ux / ut;
    dydt[IDX.Y] = uy / ut;
    dydt[IDX.Z] = uz / ut;
    dydt[IDX.PX] = (geo[0] + Fx) / ut;
    dydt[IDX.PY] = (geo[1] + Fy) / ut;
    dydt[IDX.PZ] = (geo[2] + Fz) / ut;
    dydt[IDX.PT] = Ft / ut;
    if (profile) profile.rhsMs = (profile.rhsMs || 0) + (profileNow ? profileNow() - rhsStart : 0);
  };
}

const _internal = Object.freeze({ IDX, computeP, geodesicMomentumDerivative });

  SGRA.Physics.Kerr.KerrHamiltonianRhs = Object.freeze({ STATE_DIM, hamiltonian, massShellResidual, energy, angularMomentumZ, contravariantVelocity, contravariantVelocityFullMatrix, admitState, timelikeNorm, createGeodesicRhs, _internal });
})(typeof window !== 'undefined' ? window : globalThis);
