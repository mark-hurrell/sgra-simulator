// Sgr A* Simulator
// SCI-01B physical classification adapter — production integration
// (CORRECTED: removed the forced-capture defer fallback from the first
// integration draft; see docs/SCI01B_PRODUCTION_INTEGRATION_2026-09-19.md,
// section "Correction history").
//
// SCOPE AND BOUNDARY:
//
// This file is diagnostic-classification-only. It reads live body/BH state
// and reports a decision; it never mutates simulation physics itself. Its
// caller (local_step_integrator.js) uses that decision to gate
// `body.captured = true` and to arm/disarm the capture-candidate
// short-circuit in product_kerr_runtime_adapter.js's advance().
//
// It reuses, verbatim, existing production functions:
//   - ProductKerrRuntimeAdapter.toHatted()
//   - KerrInvariantRecovery.recoverKerrInvariantsFromAdmittedState()
//   - KerrSchildMetric.metricParts() / .ksRadius() / .dKsRadius()
//   - KerrHamiltonianRhs.contravariantVelocity()
//
// PROVENANCE: SCI-01B (src/physics/sci01b_diagnostic.js) is unchanged by
// this patch. See that file and
// docs/SCI01B_RECONSTRUCTED_CONTRACT_FROZEN_2026-09-19.md /
// docs/SCI01B_NEAR_DOUBLE_ROOT_FINAL_CLOSURE_2026-09-19.md for its
// validation history. Validated domain: |a| <= 0.9999.
//
// ============================================================
// sign(dr/dlambda) -- DERIVED, NOT ASSUMED
// ============================================================
// The first integration draft set sign_dr_dlambda = -1 from the triggering
// DP54 event's own `direction: -1` (Kerr-Schild-Cartesian radius
// decreasing). That was flagged on review: SCI-01B's radial potential uses
// the Boyer-Lindquist/Kerr radial coordinate r, which is NOT identically
// the Kerr-Schild-Cartesian radius off-axis, so the two "decreasing"
// statements are not automatically the same claim.
//
// Corrected here to a genuine derivative of the SAME r used everywhere
// else in this file (KerrSchildMetric.ksRadius), via the chain rule:
//   dr/dlambda = (dr/dx) u^x + (dr/dy) u^y + (dr/dz) u^z
// where (dr/dx, dr/dy, dr/dz) is KerrSchildMetric.dKsRadius()'s exact
// analytic gradient of the same r(x,y,z,a) transform
// KerrInvariantRecovery already uses, and (u^x, u^y, u^z) is the
// CONTRAVARIANT spatial four-velocity from
// KerrHamiltonianRhs.contravariantVelocity() (the same function
// product_kerr_runtime_adapter.js's restore() already calls). Since
// u^t = dt/dlambda > 0 always (future-directed timelike/null geodesic),
// the sign of dr/dlambda equals the sign of this dot product directly --
// no normalisation by u^t is needed for the sign alone. This is exact for
// any state (equatorial or inclined), not a near-horizon or on-axis
// approximation.
//
// ============================================================
// CAPTURE AUTHORITY -- CORRECTED per review
// ============================================================
//   PLUNGE_COMMITTED                    -> commit = true
//   TURNING_POINT_EXISTS                -> commit = false, continue = true
//   TOPOLOGY_AMBIGUOUS (any reason)     -> commit = false, continue = true
//   AMB_SPIN_OUT_OF_RANGE specifically  -> commit = false, continue = true
//                                          (reported as OUTSIDE_VALIDATED_DOMAIN,
//                                          never described as SCI-01B capture
//                                          authority)
//   classification/recovery failure     -> commit = false, continue = false,
//     (module absent, toHatted threw,      fatal = true -- the caller must
//      spin context invalid, recovery       treat this as a genuine
//      threw/unqualified, non-finite        numerical/integration failure
//      invariants, sign derivation           (via the existing failKerr
//      failed, classify threw)               path), NOT as physical capture
//                                            and NOT as silent continuation.
//
// No count, timeout, radius-depth or repeated-event rule converts
// TURNING_POINT_EXISTS, TOPOLOGY_AMBIGUOUS, or a failure into
// PLUNGE_COMMITTED. There is no forced-capture fallback in this file.
//
// ============================================================
// CONTINUATION (candidate disarm/re-arm)
// ============================================================
// When continue=true, the caller sets body.__sci01bCandidateDisarmed=true,
// which makes advance()'s entry short-circuit in
// product_kerr_runtime_adapter.js skip past a body already inside the
// candidate radius and integrate the geodesic forward for real (see that
// file's comment at the short-circuit for why this cannot spuriously
// re-fire the terminal event). The caller clears the flag (re-arms) once
// the body's live radius genuinely exceeds the candidate radius again.
// This file does not manage that flag itself -- it only reports the
// decision the caller acts on.

(function attachSCI01BPhysicalClassification(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }

  function failureResult(source) {
    return { commit: false, continue: false, fatal: true, verdict: null, reason: null, source, a: null, r: null, signDrDlambda: null };
  }

  function deriveSignDrDlambda(hatted, aHat, recovered) {
    const k = SGRA.Physics.Kerr;
    const mp = k.KerrSchildMetric.metricParts(hatted.x, hatted.y, hatted.z, 1, aHat);
    const radiusParts = k.KerrSchildMetric.ksRadius(hatted.x, hatted.y, hatted.z, aHat);
    const grad = k.KerrSchildMetric.dKsRadius(hatted.x, hatted.y, hatted.z, aHat, radiusParts);
    const v = k.KerrHamiltonianRhs.contravariantVelocity(mp, recovered.px, recovered.py, recovered.pz, recovered.pt);
    if (![grad.drdx, grad.drdy, grad.drdz, v.ux, v.uy, v.uz].every(finite)) return null;
    const drdlambda = grad.drdx * v.ux + grad.drdy * v.uy + grad.drdz * v.uz;
    if (!finite(drdlambda) || drdlambda === 0) return null;
    return drdlambda > 0 ? 1 : -1;
  }

  /**
   * Evaluate a Kerr-owned body currently at/inside the geometric capture
   * candidate radius. `body` must have world-frame x,y,z,vx,vy,vz set to
   * the current live state (the state immediately after advance()/restore(),
   * whether that call ended in a fresh 'production-capture-radius' event or
   * simply completed while the body remained inside the candidate radius).
   *
   * @returns {{commit:boolean, continue:boolean, fatal:boolean,
   *            verdict:(string|null), reason:(string|null), source:string,
   *            a:(number|null), r:(number|null), signDrDlambda:(number|null)}}
   */
  function evaluateCaptureEvent(body, bh, spinContext) {
    const adapter = SGRA.Physics.ProductKerrRuntimeAdapter;
    const recovery = SGRA.Physics.Kerr && SGRA.Physics.Kerr.KerrInvariantRecovery;
    const metricOk = SGRA.Physics.Kerr && SGRA.Physics.Kerr.KerrSchildMetric && SGRA.Physics.Kerr.KerrHamiltonianRhs;
    const Diagnostic = SGRA.Physics.Kerr && SGRA.Physics.Kerr.SCI01BDiagnostic;
    if (!adapter || !recovery || !metricOk || !Diagnostic) {
      return failureResult('SCI01B_MODULE_UNAVAILABLE');
    }

    const aHat = spinContext && finite(spinContext.aHat) ? spinContext.aHat : null;
    if (aHat === null) return failureResult('SPIN_CONTEXT_INVALID');

    let hatted;
    try {
      hatted = adapter.toHatted(body, bh, spinContext);
    } catch (err) {
      return failureResult('TOHATTED_THREW:' + (err && err.message ? err.message : 'unknown'));
    }

    let recovered;
    try {
      recovered = recovery.recoverKerrInvariantsFromAdmittedState(
        { x: hatted.x, y: hatted.y, z: hatted.z, vx: hatted.vx, vy: hatted.vy, vz: hatted.vz },
        1, aHat
      );
    } catch (err) {
      return failureResult('RECOVERY_THREW:' + (err && err.message ? err.message : 'unknown'));
    }
    if (!recovered || !recovered.qualified) {
      return failureResult('RECOVERY_UNQUALIFIED:' + (recovered ? recovered.reason : 'null-result'));
    }
    const { E, Lz, Q, r } = recovered;
    if (![E, Lz, Q, r].every(finite) || !(r > 0)) {
      return failureResult('RECOVERED_INVARIANTS_NON_FINITE');
    }

    let signDrDlambda;
    try {
      signDrDlambda = deriveSignDrDlambda(hatted, aHat, recovered);
    } catch (err) {
      return failureResult('RADIAL_SIGN_DERIVATION_THREW:' + (err && err.message ? err.message : 'unknown'));
    }
    if (signDrDlambda !== 1 && signDrDlambda !== -1) {
      return failureResult('RADIAL_SIGN_INDETERMINATE');
    }

    let verdict;
    try {
      verdict = Diagnostic.classify({ a: aHat, E, Lz, Q, r_current: r, sign_dr_dlambda: signDrDlambda });
    } catch (err) {
      return failureResult('CLASSIFY_THREW:' + (err && err.message ? err.message : 'unknown'));
    }

    if (verdict.verdict === Diagnostic.VERDICT.PLUNGE_COMMITTED) {
      return { commit: true, continue: false, fatal: false, verdict: verdict.verdict, reason: verdict.reason, source: 'SCI01B_PLUNGE_COMMITTED', a: aHat, r, signDrDlambda };
    }
    if (verdict.verdict === Diagnostic.VERDICT.TURNING_POINT_EXISTS) {
      return { commit: false, continue: true, fatal: false, verdict: verdict.verdict, reason: verdict.reason, source: 'SCI01B_TURNING_POINT_EXISTS', a: aHat, r, signDrDlambda };
    }
    // TOPOLOGY_AMBIGUOUS.
    if (verdict.reason === Diagnostic.REASON.AMB_SPIN_OUT_OF_RANGE) {
      return { commit: false, continue: true, fatal: false, verdict: verdict.verdict, reason: verdict.reason, source: 'SCI01B_OUTSIDE_VALIDATED_DOMAIN', a: aHat, r, signDrDlambda };
    }
    return { commit: false, continue: true, fatal: false, verdict: verdict.verdict, reason: verdict.reason, source: 'SCI01B_AMBIGUOUS_CONTINUE', a: aHat, r, signDrDlambda };
  }

  SGRA.Physics.SCI01BPhysicalClassification = Object.freeze({
    VERSION: 'sci01b-physical-classification-v2-2026-09-19-no-forced-capture',
    evaluateCaptureEvent
  });
})(typeof window !== 'undefined' ? window : globalThis);
