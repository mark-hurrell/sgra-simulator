// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function (global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Domain = SGRA.Domain || {};

  SGRA.Domain.Constants = {
    G: 4 * Math.PI * Math.PI,
    MBH_INIT: 4.30e6,
    C_AUYR: 63241.077,
    C2: 63241.077 * 63241.077,
    KMS: 4.7406,
    AU_PER_AS: 8320,
    EPOCH0: 2026.44,
    LAUNCH_SCALE: 0.25,
    EPS2_BH: 1e-6,
    EPS2_SS: 9.0,
    CUSP_M0: 3.5e5,
    CUSP_R0: 103132,
    RS_INIT: 2 * (4 * Math.PI * Math.PI) * 4.30e6 / (63241.077 * 63241.077),
    // Apparent Schwarzschild photon-ring shadow, in units of R_s.
    // b_crit = 3*sqrt(3)*GM/c^2 = (3*sqrt(3)/2) * R_s
    SHADOW_B_CRIT_RS_FAC: 3 * Math.sqrt(3) / 2,   // ≈ 2.598

    // Illustrative outer edge of the stylised accretion-disc inset, in units
    // of R_s. Not a physical boundary — see SGRA-ADL-STYLISED-DISC-SPEC.md v2.
    DISC_OUTER_RS_FAC: 20,
    R_CAP_FAC: 4,

    // ---- central spin axis: SINGLE AUTHORITY -------------------------------
    //
    // SPIN_AXIS_WORLD is the sole world-space direction of the central black
    // hole's spin. It is consumed by, and must be consumed by, exactly three
    // places:
    //
    //   src/physics/central_relativistic_policy.js  (Lense-Thirring physics)
    //   src/render/frame_dragging_mesh.js           (frame-dragging cage)
    //   src/render/disc_raster_kernel.js            (disc normal)
    //
    // It was promoted from two independent, coincidentally-identical renderer
    // constants (frame_dragging_mesh.js's AXIS_Z and disc_raster_kernel.js's
    // DISC_NORMAL_WORLD, both [0, -sin20, cos20]). Those duplicates are gone;
    // do not reintroduce a local tilt constant in any renderer.
    //
    // PROVENANCE: this is a REFERENCE / ILLUSTRATIVE orientation, chosen so
    // the stylised disc reads legibly on screen. It is NOT a measured or
    // inferred Sgr A* spin-axis claim, and no observational source backs it
    // (see hypothesis_catalogue.js, ORIENTATION_DATA_PENDING). Configurable
    // spin-axis state and UI are deliberately not built: there is exactly one
    // frozen axis today.
    //
    // Sign convention: this is the direction of J (the angular-momentum
    // vector), so positive spinMagnitude drags spacetime in the right-handed
    // sense about it. frame_dragging_mesh.js's SPIN_DIRECTION_SIGN = +1 and
    // the Lense-Thirring nodal precession being prograde both depend on that
    // reading; see central_spin_orbit.js's SIGN note.
    SPIN_AXIS_TILT_DEG: 20,
    SPIN_AXIS_WORLD: Object.freeze([
      0,
      -Math.sin(20 * Math.PI / 180),
      Math.cos(20 * Math.PI / 180)
    ]),
    SPIN_AXIS_PROVENANCE: 'reference-illustrative-orientation-not-a-measurement',

    XI_WEAK: 0.003,
    XI_MOD: 0.02,
    XI_STRONG: 0.08,
    DT_MAX: 0.002,
    DT_MIN: 5e-6,
    DT_SAFETY: 0.001,
    DT_SAFETY_DYN: 0.002,
    DT_SAFETY_PN: 0.001,
    DT_PERI_STEPS: 40,
    STEP_MAX: 2600,
    PRED_DT: 0.025,
    PRED_MAX_T: 60,
    PRED_MAX_PTS: 2400,
    PRED_BUDGET_MS: 40,
    PRED_INTERVAL: 45,
    TIER: [
      { fs: 0, trl: 120 },
      { fs: 60, trl: 240 },
      { fs: 120, trl: 300 },
      { fs: 200, trl: 360 }
    ]
  };
})(window);
