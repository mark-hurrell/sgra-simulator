// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachKerrInvariantRecovery(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};
  SGRA.Physics.Kerr = SGRA.Physics.Kerr || {};

  //
  // Q0b: pure, read-only, fail-closed recovery of the project's Kerr
  // geodesic invariants (E, Lz, Q) from an admitted ingoing Kerr-Schild
  // Cartesian state {x,y,z,vx,vy,vz} (vx,vy,vz = dx^i/dt_KS, coordinate
  // time). Diagnostic only: never writes to body/physics/scheduler/force/
  // policy state, and does not run per integrator substep.
  //
  // AUTHORITY CHAIN (Q0a, reviewed and corrected before this file was
  // written):
  //
  //  1. E, Lz. The existing KerrHamiltonianRhs.admitState() converts the
  //     admitted coordinate-time 3-velocity into the normalised
  //     future-directed contravariant four-velocity and lowers it with
  //     the KS metric to produce covariant (px,py,pz,pt) -- reused
  //     verbatim, not reimplemented. E = -p_t and
  //     Lz = x*p_y - y*p_x are the existing energy()/angularMomentumZ()
  //     helpers, also reused verbatim.
  //
  //     E and Lz need NO Kerr-Schild <-> Boyer-Lindquist transform: the
  //     project's own KS<->BL authority (evidence/T2A/frozen_inputs/
  //     ks_boyer_lindquist.js) establishes that r and theta are IDENTICAL,
  //     UNSHIFTED between the two charts, and only t and phi receive an
  //     r-dependent shift (t_KS - t_BL and phi_KS - phi_BL are both
  //     functions of r alone). Under the standard covector transformation
  //     law this makes p_t, p_theta and p_phi chart-invariant; only p_r
  //     mixes (picking up p_t- and p_phi-dependent terms). p_r is not
  //     needed here. This is a derived consequence of the existing KS<->BL
  //     module's own documented chart relationship, not an assumption.
  //
  //  2. p_theta. p_mu are covariant momentum components, i.e. components
  //     of a one-form / partial derivatives of the action:
  //     p_theta = dS/dtheta = sum_i (dS/dx^i)(dx^i/dtheta)
  //             = p_x (dx/dtheta) + p_y (dy/dtheta) + p_z (dz/dtheta)
  //     -- the FORWARD coordinate Jacobian contracted with p, not
  //     p . grad(theta) (that would be the wrong tensor operation for a
  //     covector; an earlier draft of this module made exactly that
  //     mistake and was corrected before this file was written -- see
  //     kerr_invariant_recovery_negative_control.test.mjs, which keeps a
  //     copy of the wrong operation specifically so a future regression
  //     of this mistake is caught).
  //
  //     dt_KS/dtheta = 0 at fixed r (t_KS-t_BL depends on r only), so the
  //     p_t term drops and only the spatial terms survive.
  //
  //     From the ingoing KS embedding used throughout this codebase
  //     (kerr_schild_metric.js and evidence/T2A/frozen_inputs/
  //     ks_boyer_lindquist.js / inclined_kerr/state_construction.js's own
  //     blCartesianJacobian, at fixed r, phiBL):
  //       x = sin(theta)[r cos(phiKS) - a sin(phiKS)]
  //       y = sin(theta)[r sin(phiKS) + a cos(phiKS)]
  //       z = r cos(theta)
  //     => dx/dtheta = x cot(theta), dy/dtheta = y cot(theta),
  //        dz/dtheta = -r sin(theta)
  //     => p_theta = (x p_x + y p_y) cot(theta) - r p_z sin(theta)
  //
  //     This closed form is cross-checked in the test corpus against the
  //     explicit d(x,y,z)/dtheta column of state_construction.js's own
  //     blCartesianJacobian(), independently of this derivation, and
  //     agrees to ~1e-31 relative difference across a 96-case sweep.
  //
  //  3. Q. The project convention (frozen in evidence/T2A/frozen_inputs/
  //     inclined_kerr/geodesic_constants.js, NOT the Schmidt/Hughes et al.
  //     x_I=cos(I) closed form -- that module's own header proves the two
  //     differ by an a^2(1-E^2)cos^2(I) term) is Q = Lz^2 tan^2(iota),
  //     equivalently, from Theta(theta) = Q - cot^2(theta)Lz^2 -
  //     a^2 cos^2(theta)(1-E^2) [Hughes et al. 2021 arXiv:2102.02713 Eq.
  //     2.2, as already cited in that module] and
  //     Theta(theta) = p_theta^2:
  //       Q = p_theta^2 + cos^2(theta)[Lz^2/sin^2(theta) + a^2(1-E^2)]
  //
  // CONDITIONING NOTE (measured, not assumed): x and y both scale as
  // sin(theta) at fixed r, so for any admitted (finite p) state the
  // product (x p_x + y p_y) also scales as sin(theta), and the explicit
  // cot(theta) factor's 1/sin(theta) is analytically cancelled --
  // p_theta does NOT blow up approaching the axis. The same cancellation
  // applies to Lz = x p_y - y p_x inside the Q formula's Lz^2/sin^2(theta)
  // term. This was verified numerically (not just algebraically) down to
  // sin(theta) ~ 5e-4 with no growth in the cross-checked residual. The
  // remaining risk at the axis is therefore a literal division-by-zero at
  // sin(theta) EXACTLY 0 (a coordinate singularity of theta itself, x=y=0
  // identically), not a numerical-conditioning cliff needing a large
  // empirical band. SIN_THETA_FLOOR below is set to guard only that
  // literal case.

  const SIN_THETA_FLOOR = 1e-9;

  /**
   * Recover (E, Lz, Q) from an admitted ingoing Kerr-Schild Cartesian
   * state. Total, structured, fail-closed: never throws for malformed
   * input, never mutates anything, no allocation beyond the returned
   * object.
   *
   * @param {{x:number,y:number,z:number,vx:number,vy:number,vz:number}} state
   * @param {number} M
   * @param {number} a  dimensionless-scaled Kerr length parameter (a=chi*M)
   * @returns {{qualified:boolean, reason?:string, E?:number, Lz?:number,
   *            Q?:number, pTheta?:number, r?:number, theta?:number,
   *            sinTheta?:number, cosTheta?:number, massShellResidual?:number}}
   */
  function recoverKerrInvariantsFromAdmittedState(state, M, a) {
    const Rhs = SGRA.Physics.Kerr.KerrHamiltonianRhs;
    const Metric = SGRA.Physics.Kerr.KerrSchildMetric;
    if (!Rhs || !Metric) {
      return { qualified: false, reason: 'missing-dependency:KerrHamiltonianRhs-or-KerrSchildMetric' };
    }
    if (!state || typeof state !== 'object') {
      return { qualified: false, reason: 'non-finite-input' };
    }
    const { x, y, z, vx, vy, vz } = state;
    const inputs = [x, y, z, vx, vy, vz, M, a];
    if (inputs.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      return { qualified: false, reason: 'non-finite-input' };
    }

    let admission;
    try {
      admission = Rhs.admitState({ x, y, z, vx, vy, vz }, M, a);
    } catch (e) {
      return { qualified: false, reason: `admission-threw:${e && e.classification ? e.classification : 'unknown'}` };
    }
    if (!admission || !admission.admitted) {
      return { qualified: false, reason: `admission-failed:${admission ? admission.reason : 'unknown'}` };
    }
    const [px, py, pz, pt] = admission.p;

    const E = Rhs.energy(pt);
    const Lz = Rhs.angularMomentumZ(x, y, px, py);

    let radiusParts;
    try {
      radiusParts = Metric.ksRadius(x, y, z, a);
    } catch (e) {
      return { qualified: false, reason: 'invalid-r' };
    }
    const r = radiusParts.r;
    if (!(r > 0) || !Number.isFinite(r)) {
      return { qualified: false, reason: 'invalid-r' };
    }

    const cosTheta = Math.max(-1, Math.min(1, z / r));
    const theta = Math.acos(cosTheta);
    const sinTheta = Math.sin(theta);

    if (!(Math.abs(sinTheta) >= SIN_THETA_FLOOR)) {
      return { qualified: false, reason: 'near-axis-not-constructible', r, theta, sinTheta };
    }

    const pTheta = (x * px + y * py) * (cosTheta / sinTheta) - r * pz * sinTheta;
    const Q = pTheta * pTheta + cosTheta * cosTheta * ((Lz * Lz) / (sinTheta * sinTheta) + a * a * (1 - E * E));

    if (![E, Lz, Q, pTheta].every((v) => Number.isFinite(v))) {
      return { qualified: false, reason: 'non-finite-recovered-invariant' };
    }

    // Q must be non-negative for a physically consistent bound-orbit-type
    // recovery (Theta(theta) = p_theta^2 >= 0 by construction of Q above,
    // so a materially negative Q indicates an inconsistent/non-geodesic
    // input state, not a floating-point artefact of this formula -- do
    // not clamp it to zero).
    const QNegativeFloor = -1e-9 * Math.max(1, Q >= 0 ? Q : -Q, Lz * Lz, pTheta * pTheta);
    if (Q < QNegativeFloor) {
      return { qualified: false, reason: 'q-materially-negative', E, Lz, Q, pTheta, r, theta };
    }

    const massShellResidual = Rhs.massShellResidual(
      Metric.metricParts(x, y, z, M, a),
      px, py, pz, pt
    );

    return {
      qualified: true,
      E, Lz, Q, pTheta,
      r, theta, sinTheta, cosTheta,
      px, py, pz, pt,
      massShellResidual
    };
  }

  SGRA.Physics.Kerr.KerrInvariantRecovery = Object.freeze({
    SIN_THETA_FLOOR,
    recoverKerrInvariantsFromAdmittedState
  });
})(typeof window !== 'undefined' ? window : globalThis);
