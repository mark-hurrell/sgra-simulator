// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachApplicationTruth(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Encounter = SGRA.Encounter || {};
  const MODES = Object.freeze({ MAIN: 'MAIN', SANDBOX: 'SANDBOX', SCENARIO: 'SCENARIO' });
  const ACTIONS = Object.freeze(['runPhysics', 'addIntruder', 'removeIntruder', 'recordEncounter', 'captureEncounter', 'reset', 'loadScenario', 'mutateScenario']);
  const CAPABILITIES = Object.freeze({
    MAIN: Object.freeze({ runPhysics: true, addIntruder: true, removeIntruder: false, recordEncounter: true, captureEncounter: true, reset: true, loadScenario: true, mutateScenario: false }),
    SANDBOX: Object.freeze({ runPhysics: true, addIntruder: true, removeIntruder: true, recordEncounter: true, captureEncounter: true, reset: true, loadScenario: true, mutateScenario: false }),
    SCENARIO: Object.freeze({ runPhysics: true, addIntruder: false, removeIntruder: false, recordEncounter: true, captureEncounter: true, reset: true, loadScenario: true, mutateScenario: false })
  });
  const KERR_OWNERS = new Set(['KERR', 'KERR_PROMOTED', 'KERR_ACTIVE']);
  function getBodyPhysicsPresentationState(body, options = {}) {
    if (!body || body.bh || body.captured) return Object.freeze({ semantic: 'NOT_APPLICABLE', relativistic: false, mode: 'none' });
    const owner = body.__fidelityOwnership?.owner || null;
    // An explicit Newtonian selection is authoritative for presentation too.
    // Do not let the proximity/velocity weight paint new green samples while
    // the Newtonian physics path is selected.
    if (options.physicsSelector === 'newtonian') {
      return Object.freeze({ semantic: 'NEWTONIAN', relativistic: false, mode: 'newtonian', owner, relWeight: options.relWeight });
    }
    // Trail/body presentation follows the existing relativistic-regime
    // convention when the caller supplies the canonical dimensionless weight.
    // This is intentionally separate from low-level ownership: a body can be
    // visually in the relativistic regime before Adaptive Kerr admission.
    if (Number.isFinite(options.relWeight)) {
      if (options.relWeight >= 0.05) return Object.freeze({ semantic: 'RELATIVISTIC', relativistic: true, mode: 'relativistic-regime', owner, relWeight: options.relWeight });
      return Object.freeze({ semantic: 'NEWTONIAN', relativistic: false, mode: 'newtonian', owner, relWeight: options.relWeight });
    }
    if (KERR_OWNERS.has(owner)) return Object.freeze({ semantic: 'RELATIVISTIC', relativistic: true, mode: 'KERR', owner });
    if (options.physicsSelector === '1pn' || options.grEnabled === true) return Object.freeze({ semantic: 'RELATIVISTIC', relativistic: true, mode: '1PN', owner });
    if (options.physicsSelector === 'adaptive_kerr' && owner && owner !== 'N') return Object.freeze({ semantic: 'UNKNOWN', relativistic: false, mode: 'uncertain', owner });
    return Object.freeze({ semantic: 'NEWTONIAN', relativistic: false, mode: 'newtonian', owner });
  }
  function create(options = {}) {
    const getMode = typeof options.getMode === 'function' ? options.getMode : () => MODES.MAIN;
    const resetters = options.resetters || {};
    function mode() { const value = getMode(); return Object.values(MODES).includes(value) ? value : null; }
    function getCapabilities() { const current = mode(); return current ? { mode: current, ...CAPABILITIES[current] } : { mode: null, ...Object.fromEntries(ACTIONS.map(action => [action, false])) }; }
    function can(action) { return ACTIONS.includes(action) && getCapabilities()[action] === true; }
    function reset() { const current = mode(); const fn = current && resetters[current]; if (typeof fn !== 'function') return { ok: false, code: 'RESET_UNAVAILABLE', message: `reset is unavailable for ${current || 'unknown'} environment` }; try { const value = fn(); return { ok: true, code: 'ENVIRONMENT_RESET', mode: current, value }; } catch (error) { return { ok: false, code: 'RESET_FAILED', mode: current, message: error.message }; } }
    return Object.freeze({ getMode: mode, getCapabilities, can, reset });
  }
  SGRA.Encounter.ApplicationTruth = Object.freeze({ MODES, ACTIONS, CAPABILITIES, getBodyPhysicsPresentationState, create });
  if (typeof module !== 'undefined' && module.exports) module.exports = SGRA.Encounter.ApplicationTruth;
})(typeof window !== 'undefined' ? window : globalThis);
