// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachCentralSpinOrbit(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  /**
   * 1.5PN spin-orbit (Lense-Thirring) acceleration on a test particle in the
   * field of a spinning central mass.
   *
   *   a_LT = (2G / (c^2 r^3)) [ 3 (J . n) (n x v) + (v x J) ]
   *
   * with n = r/|r|.
   *
   * UNIT CONTRACT (authoritative; the comment and the code must never drift):
   *
   *   jx, jy, jz  are the central body's PHYSICAL SPIN ANGULAR MOMENTUM J,
   *               in the caller's mass-length-time system. NOT G*J. For a
   *               Kerr hole,  J = aStar * G M^2 / c.
   *   g           is the gravitational constant in that same system, and it
   *               appears EXPLICITLY in the prefactor below.
   *
   * G*J/c^2 then carries units of length^3/time, and a_LT comes out as
   * length/time^2. In SGRA's units (AU, yr, solar masses) that means
   * g = Constants.G = 4*pi^2 and |J| = aStar * G * MBH^2 / C_AUYR.
   *
   * A dimensionless G = M = c = 1 harness CANNOT detect a missing or doubled
   * factor of G here, so the real-units nodal-rate test is the only guard.
   *
   * SIGN: fixed by the Lense-Thirring nodal precession rate
   *   dOmega/dt = 2 G J / (c^2 a^3 (1 - e^2)^{3/2}),  PROGRADE,
   * which this form reproduces to 0.02-0.05% across inclinations 30-120 deg,
   * together with dOmega_peri/dt = -6 G J cos(i) / (c^2 a^3 (1 - e^2)^{3/2}).
   * Do not "simplify" the sign without re-running those two tests.
   *
   * The acceleration is purely gravitomagnetic: both terms are orthogonal to
   * v, so a_LT . v == 0 identically and this term does NO WORK on the
   * particle. Any energy drift attributed to it is an integrator artefact,
   * never the force law.
   *
   * @param {object} args
   * @param {number} args.c2      c^2
   * @param {number} args.pnScale global PN ramp (shared with the 1PN term)
   * @param {number} args.ltDamp  near-field transition damping for the LT term.
   *   DELIBERATELY SEPARATE from the 1PN term's pnDamp. It may be initialised
   *   equal to it, but the equality must not be baked in: the ramp is an
   *   artificial withdrawal of the PN approximation, and nothing yet shows the
   *   two terms should be withdrawn on the same profile.
   * @param {number} args.rTrue   true |r|; used ONLY to build the unit vector n
   * @param {number} args.rSafe   |r| floored at the policy capture radius; used
   *   ONLY for the 1/r^3 radial factor. See the note in the body.
   * @param {number} args.g       gravitational constant, caller's units
   * @param {number} args.jx,jy,jz  central PHYSICAL spin angular momentum J
   * @param {number} args.rx,ry,rz  separation, body minus central
   * @param {number} args.vx,vy,vz  relative velocity
   * @param {object} [out] scratch; allocation-free hot path
   */
  function computeCentralSpinOrbitAcceleration(args, out) {
    const target = out || {};
    const {
      g,
      c2,
      pnScale,
      ltDamp,
      rTrue,
      rSafe,
      jx, jy, jz,
      rx, ry, rz,
      vx, vy, vz
    } = args || {};

    if (!Number.isFinite(g) || !Number.isFinite(c2) || c2 <= 0 ||
        !Number.isFinite(pnScale) || !Number.isFinite(ltDamp) ||
        !Number.isFinite(rTrue) || rTrue <= 0 ||
        !Number.isFinite(rSafe) || rSafe <= 0 ||
        !Number.isFinite(jx) || !Number.isFinite(jy) || !Number.isFinite(jz) ||
        !Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz) ||
        !Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) {
      target.x = 0;
      target.y = 0;
      target.z = 0;
      target.magnitude = 0;
      return target;
    }

    // DIRECTION vs RADIAL FLOOR are deliberately separated.
    //
    //   n     is built from rTrue, so it is a UNIT vector unconditionally.
    //   rSafe is used only where the 1/r^3 singularity floor is intended.
    //
    // The policy sets rSafe = max(|r|, rMin), so rSafe > rTrue whenever a body
    // is inside the capture floor. In the current production ordering that
    // cannot reach a force evaluation -- local_step_integrator.js calls
    // LocalEvents.observeSubstep() immediately BEFORE
    // LocalForceModel.computeAccel(), observeSubstep flags b.captured at the
    // same radius (R_CAP_FAC * R_s), and computeAccel skips captured bodies.
    // But that invariant is incidental, not structural: the observeSubstep
    // call is behind a `typeof === 'function'` guard, rMin carries an
    // independent 1e-4 floor that could exceed R_CAP_FAC*R_s for a small
    // enough central mass, and the headless test seam can drive computeAccel
    // directly. Building n from rSafe would then silently shorten it and
    // scale the whole term down, which is exactly the kind of quiet wrongness
    // that does not announce itself. Costs nothing to be correct by
    // construction.
    //
    // NOTE: central_1pn.js currently builds its n from rSafe and so carries
    // the same latent issue, with a larger coefficient. Not changed here:
    // that would alter frozen 1PN numerics and needs its own decision.
    const invR = 1 / rTrue;
    const nx = rx * invR;
    const ny = ry * invR;
    const nz = rz * invR;

    const jDotN = jx * nx + jy * ny + jz * nz;

    // n x v
    const nvx = ny * vz - nz * vy;
    const nvy = nz * vx - nx * vz;
    const nvz = nx * vy - ny * vx;

    // v x J
    const vjx = vy * jz - vz * jy;
    const vjy = vz * jx - vx * jz;
    const vjz = vx * jy - vy * jx;

    // G appears explicitly: see the unit contract above.
    const k = 2 * g * ltDamp * pnScale / (c2 * rSafe * rSafe * rSafe);
    const fx = k * (3 * jDotN * nvx + vjx);
    const fy = k * (3 * jDotN * nvy + vjy);
    const fz = k * (3 * jDotN * nvz + vjz);

    target.x = fx;
    target.y = fy;
    target.z = fz;
    target.magnitude = Math.hypot(fx, fy, fz);
    return target;
  }

  SGRA.Physics.computeCentralSpinOrbitAcceleration = computeCentralSpinOrbitAcceleration;
})(typeof window !== 'undefined' ? window : globalThis);
