// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachCentralRelativisticPolicy(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  const VERSION = 'central-relativistic-policy-v2-spin';
  const Constants = SGRA.Domain && SGRA.Domain.Constants;
  const DEFAULT_G = Constants ? Constants.G : 4 * Math.PI * Math.PI;
  const DEFAULT_C2 = Constants ? Constants.C2 : 63241.077 * 63241.077;
  const DEFAULT_C = Constants ? Constants.C_AUYR : 63241.077;

  // The single frozen world-space spin axis (src/domain/constants.js). Read
  // once here; this module is the only physics consumer, and it re-normalises
  // defensively rather than trusting the literal.
  const AXIS_SOURCE = (Constants && Constants.SPIN_AXIS_WORLD) || [0, 0, 1];
  const AXIS_NORM = Math.hypot(AXIS_SOURCE[0], AXIS_SOURCE[1], AXIS_SOURCE[2]) || 1;
  const SPIN_AXIS = Object.freeze([
    AXIS_SOURCE[0] / AXIS_NORM,
    AXIS_SOURCE[1] / AXIS_NORM,
    AXIS_SOURCE[2] / AXIS_NORM
  ]);

  function prepareCentralContext(bh, modelState, deps, out) {
    const state = modelState || {};
    const d = deps || {};
    const G = typeof d.G === 'number' ? d.G : DEFAULT_G;
    const c2 = typeof d.C2 === 'number' ? d.C2 : DEFAULT_C2;
    const rCapFac = typeof d.R_CAP_FAC === 'number' ? d.R_CAP_FAC : Constants.R_CAP_FAC;
    const c = typeof d.C_AUYR === 'number' ? d.C_AUYR : DEFAULT_C;
    const centralEligible = !!bh && !!bh.bh;
    const gm = centralEligible ? G * bh.m : 0;
    const schwarzschildRadius = centralEligible ? 2 * G * bh.m / c2 : 0;
    const captureSurface = SGRA.Physics.CaptureSurface;
    if (!captureSurface || typeof captureSurface.radiusFromValues !== 'function') throw new Error('CaptureSurface is unavailable');
    const rMin = Math.max(captureSurface.radiusFromValues(bh.m, { G, C2: c2, R_CAP_FAC: rCapFac }), 1e-4);

    // ---- spin authority ---------------------------------------------------
    //
    // aStar comes from exactly one place at runtime: the caller reads
    // BlackHoleModelState.spinMagnitude and puts it on the model state. This
    // module never imports that module (keeping the B-3B "no physics source
    // references BlackHoleModelState" static rule intact) -- it just consumes
    // the value it is handed, clamped to the descriptor's own 0..1 contract.
    //
    // PHYSICAL J, not G*J. central_spin_orbit.js's unit contract is explicit:
    // it takes J and applies g itself. For a Kerr hole
    //
    //     J = aStar * G * M^2 / c
    //
    // and in SGRA units (AU, yr, Msun) that is aStar * Constants.G * m^2 /
    // Constants.C_AUYR. A dimensionless G=M=c=1 harness cannot detect a
    // missing or doubled G here; the real-units nodal-rate gate is the guard.
    const rawAStar = typeof state.aStar === 'number' && Number.isFinite(state.aStar)
      ? state.aStar : 0;
    const aStar = centralEligible ? Math.max(0, Math.min(1, rawAStar)) : 0;
    const spinJ = aStar > 0 ? aStar * G * bh.m * bh.m / c : 0;

    out.version = VERSION;
    out.centralEligible = centralEligible;
    out.centralReason = centralEligible ? 'central-bh' : 'central-reference-not-bh';
    out.forceModelId = 'central-testparticle-1pn-plus-15pn-spin-orbit';
    out.gm = gm;
    out.g = G;
    out.c2 = c2;
    out.c = c;
    out.schwarzschildRadius = schwarzschildRadius;
    out.rMin = rMin;
    out.transitionOuterRadius = rMin * 3;
    out.pnScale = typeof state.pnScale === 'number' ? state.pnScale : 1;
    out.pnEnabled = state.pnEnabled !== false;

    out.aStar = aStar;
    // Directed spin vector J = |J| * axis. The axis is frozen and shared; the
    // magnitude is non-negative by the descriptor contract, so direction lives
    // entirely in the axis and never in the sign of aStar.
    //
    // spinAxisSign is a DIAGNOSTIC-ONLY seam, default +1, with no UI, no
    // persistence and no descriptor: its sole purpose is to let the spin
    // reversal gate drive axis -> -axis through the real production force
    // path, which is otherwise impossible with a frozen axis and a
    // non-negative magnitude. It is not the beginning of configurable
    // spin-axis state. If a real orientation feature is ever built, this
    // field is deleted and replaced by a proper axis descriptor.
    const axisSign = state.spinAxisSign === -1 ? -1 : 1;
    out.spinAxisSign = axisSign;
    out.spinAxisX = SPIN_AXIS[0] * axisSign;
    out.spinAxisY = SPIN_AXIS[1] * axisSign;
    out.spinAxisZ = SPIN_AXIS[2] * axisSign;
    out.spinJ = spinJ;
    out.jx = spinJ * out.spinAxisX;
    out.jy = spinJ * out.spinAxisY;
    out.jz = spinJ * out.spinAxisZ;
    // ltEnabled is deliberately NOT `pnEnabled && aStar > 0` collapsed into
    // pnEnabled: a caller may want 1PN without LT for A/B comparison.
    out.ltEnabled = centralEligible && out.pnEnabled && aStar > 0 && spinJ > 0 &&
      state.ltEnabled !== false;
    out.zeroSpin = aStar === 0;
    out.spinStatus = out.zeroSpin
      ? 'zero-spin-no-lt'
      : (out.ltEnabled ? 'linear-spin-15pn-lense-thirring' : 'spin-set-but-lt-disabled');
    return out;
  }

  function evaluateBody(context, body, relativeState, out) {
    const rel = relativeState;
    const eligible = !!context.centralEligible && !!body && !body.bh && !body.field && !body.captured;
    const rx = rel.rx, ry = rel.ry, rz = rel.rz;
    const r2 = rx * rx + ry * ry + rz * rz;
    const rTrue = Math.sqrt(r2);
    const rSafe = Math.max(rTrue, context.rMin);
    let validity = 'outside-transition';
    let pnDamp = 1;
    if (rSafe < context.transitionOuterRadius) {
      validity = rSafe <= context.rMin ? 'capture-floor' : 'transition-ramp';
      pnDamp = Math.max(0, (rSafe - context.rMin) / (context.rMin * 2));
    }

    out.version = context.version;
    out.eligible = eligible;
    out.reason = eligible ? 'non-central-non-field-non-captured' : 'body-ineligible';
    out.rx = rx; out.ry = ry; out.rz = rz;
    out.vx = rel.vx; out.vy = rel.vy; out.vz = rel.vz;
    out.rTrue = rTrue;
    out.rSafe = rSafe;
    out.validity = validity;
    out.pnDamp = pnDamp;
    out.pnEnabled = eligible && context.pnEnabled;
    // ltDamp is initialised EQUAL to pnDamp and kept as a SEPARATE field. The
    // ramp is an artificial withdrawal of the PN approximation near the capture
    // floor; nothing yet shows the 1PN and 1.5PN terms should be withdrawn on
    // the same profile, so the equality must not be baked in by reusing the
    // pnDamp field. Do not invent a different LT ramp without evidence.
    out.ltDamp = pnDamp;
    out.ltEnabled = eligible && !!context.ltEnabled;
    out.zeroSpin = context.zeroSpin;
    out.spinStatus = context.spinStatus;
    return out;
  }

  SGRA.Physics.CentralRelativisticPolicy = Object.freeze({
    VERSION,
    prepareCentralContext,
    evaluateBody
  });
})(typeof window !== 'undefined' ? window : globalThis);
