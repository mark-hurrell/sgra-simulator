// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachForceModelDeclaration(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};
  const Constants = SGRA.Domain && SGRA.Domain.Constants;

  // Honest declaration. This is NOT "full Kerr" and must never be labelled as
  // such: it is a central test-particle 1PN term plus the linear-in-spin
  // 1.5PN spin-orbit (Lense-Thirring) term for a spinning central mass.
  const FORCE_MODEL_ID = 'central-testparticle-1pn-plus-15pn-spin-orbit';
  const MASS_CONVENTION = 'central-mass-only';
  const SPIN_CONVENTION = 'central-linear-spin-test-particle-limit';
  const RECOGNIZED_FORCE_MODEL_IDS = Object.freeze([
    'central-testparticle-1pn',
    'central-testparticle-1pn-plus-15pn-spin-orbit',
    'central-selected-1pn',
    'pairwise-1pn',
    'eih-nbody-1pn'
  ]);
  // The single authoritative statement of what this model does NOT contain.
  // Anything that reports the model to a user or an artifact should be able to
  // reach this string; it is deliberately blunt.
  const MODEL_LIMITATIONS = Object.freeze({
    relativistic_suppression: Object.freeze({
      mechanism: 'pnDamp linear ramp on 1PN and 1.5PN-LT',
      full_fidelity_outside_Rs: 12,
      zero_inside_Rs: 4,
      profile: 'pnDamp = clamp((r - 4 Rs) / (8 Rs), 0, 1)',
      affected_modes: Object.freeze(['N+1PN', 'N+1PN+LS']),
      unaffected_modes: Object.freeze(['adaptive_kerr']),
      note: 'Adaptive Kerr promotes bodies with rPeri < 100 Rs and bypasses this path.'
    }),
    central_softening: Object.freeze({
      epsilon_au: Math.sqrt(Math.max(Constants.EPS2_BH, (Constants.RS_INIT) ** 2)),
      epsilon_expression: 'max(sqrt(EPS2_BH), R_s)',
      apsidal_bias_rad_per_orbit: '-3*pi*R_s^2 / p^2',
      apsidal_bias_fraction_of_GR: '-R_s / p',
      affected_modes: Object.freeze(['N', 'N+1PN', 'N+1PN+LS'])
    }),
    pair_softening: Object.freeze({
      epsilon_au: Math.sqrt(Constants.EPS2_SS),
      force_error_at_10au: 1 - (10 ** 3) / ((10 ** 2 + Constants.EPS2_SS) ** 1.5),
      force_error_at_5au: 1 - (5 ** 3) / ((5 ** 2 + Constants.EPS2_SS) ** 1.5),
      affected_modes: 'all (enters via aMutual, so Adaptive Kerr included)'
    }),
    summary: 'Linear-in-spin 1.5PN frame dragging is included. Spin-squared/Kerr quadrupole effects, finite-mass spin-orbit dynamics, Kerr-dependent capture and Kerr ray tracing are not included.'
  });
  const MODEL_LIMITATIONS_SUMMARY = MODEL_LIMITATIONS.summary;
  const HUD_MAPPINGS = Object.freeze({
    'central-testparticle-1pn': Object.freeze({
      forceModelLabel: 'Central 1PN approximation',
      summaryLabel: 'central 1PN approx',
      toggleLabel: '1PN approx',
      toggleTitle: 'Central 1PN approximation'
    }),
    'central-testparticle-1pn-plus-15pn-spin-orbit': Object.freeze({
      forceModelLabel: 'Central 1PN + frame dragging',
      summaryLabel: 'central 1PN + frame dragging',
      toggleLabel: '1PN + drag',
      toggleTitle: 'Central 1PN + frame dragging (linear-in-spin 1.5PN spin-orbit). ' + MODEL_LIMITATIONS_SUMMARY
    })
  });
  const PRODUCTION_COMPOSITION = Object.freeze([
    'Newtonian BH-mobile',
    'Newtonian mobile-mobile',
    'central test-particle 1PN',
    'central linear-spin 1.5PN spin-orbit (Lense-Thirring), active when a* > 0',
    'optional Newtonian cusp'
  ]);

  function isRecognizedForceModelId(value) {
    return RECOGNIZED_FORCE_MODEL_IDS.includes(value);
  }

  function getHudMapping(forceModelId = FORCE_MODEL_ID) {
    const mapping = HUD_MAPPINGS[forceModelId];
    if (!mapping) {
      throw new Error(`No HUD mapping is declared for force_model_id='${forceModelId}'`);
    }
    return mapping;
  }

  function getArtifactFields() {
    return {
      force_model_id: FORCE_MODEL_ID,
      mass_convention: MASS_CONVENTION,
      spin_convention: SPIN_CONVENTION,
      model_limitations: MODEL_LIMITATIONS
    };
  }

  function snapshot() {
    return {
      force_model_id: FORCE_MODEL_ID,
      mass_convention: MASS_CONVENTION,
      spin_convention: SPIN_CONVENTION,
      model_limitations: MODEL_LIMITATIONS,
      spin_axis_provenance: (SGRA.Domain && SGRA.Domain.Constants && SGRA.Domain.Constants.SPIN_AXIS_PROVENANCE) || null,
      central_spin_reaction_semantics: 'no LT reaction on the central body: central-spin test-particle limit, J constant',
      central_reference: 'current BH state',
      normal_production_central_state: 'pinned',
      pn_eligibility: 'non-central, non-field, non-captured bodies when GR is active',
      production_composition: PRODUCTION_COMPOSITION.slice()
    };
  }

  function applyHudBindings(doc) {
    if (!doc || typeof doc.getElementById !== 'function') return false;
    const mapping = getHudMapping();
    let applied = false;
    const summary = doc.getElementById('forceModelSummaryLabel');
    if (summary) {
      summary.textContent = mapping.summaryLabel;
      applied = true;
    }
    const desktop = doc.getElementById('bGR');
    if (desktop) {
      desktop.textContent = mapping.toggleLabel;
      desktop.title = mapping.toggleTitle;
      applied = true;
    }
    const mobile = doc.getElementById('bGRM');
    if (mobile) {
      mobile.textContent = mapping.toggleLabel;
      mobile.title = mapping.toggleTitle;
      applied = true;
    }
    return applied;
  }

  const api = Object.freeze({
    FORCE_MODEL_ID,
    MASS_CONVENTION,
    SPIN_CONVENTION,
    MODEL_LIMITATIONS,
    RECOGNIZED_FORCE_MODEL_IDS,
    isRecognizedForceModelId,
    getArtifactFields,
    getHudMapping,
    snapshot,
    applyHudBindings
  });

  SGRA.Physics.ForceModelDeclaration = api;

  if (global.document) {
    try { applyHudBindings(global.document); } catch (_) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
