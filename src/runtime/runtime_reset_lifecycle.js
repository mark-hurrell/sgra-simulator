// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachRuntimeResetLifecycle(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Runtime = SGRA.Runtime || {};

  function assertRequiredInterfaces(bindings) {
    const requirements = [
      ['clock', 'getSimTime'], ['clock', 'getPendingAdvanceDelta'], ['clock', 'addPendingAdvanceDelta'],
      ['clock', 'takePendingAdvanceDelta'], ['clock', 'setThrottled'],
      ['clock', 'beginStep'], ['clock', 'endStep'],
      ['localTimestepPolicy', 'resetFrameStats'],
      ['yoshida4TrialIntegrator', 'resetTrialTelemetry'],
      ['localStepIntegrator', 'getActiveFidelityMode'],
      ['localForceModel', 'getForceEvalCount']
    ];
    for (const [owner, method] of requirements) {
      if (!bindings[owner] || typeof bindings[owner][method] !== 'function') {
        throw new Error(`required runtime interface missing: ${owner}.${method}`);
      }
    }
    assertPhysicalConstantsWired();
    return true;
  }

  function assertPhysicalConstantsWired() {
    const c = (typeof window !== 'undefined' ? window : globalThis).SGRA?.Domain?.Constants;
    if (!c || !Number.isFinite(c.G) || !Number.isFinite(c.C2)) {
      throw new Error('required physical constants missing: SGRA.Domain.Constants.G/C2 (src/domain/constants.js not loaded before runtime init?)');
    }
  }

  // The composition root owns ordering; each module remains the owner of its
  // mutable run/body state.  Keeping the list in one seam makes reset
  // completeness auditable without introducing a shared mutable store.
  const REQUIRED_RESET_SPEC = Object.freeze([
    ['fieldTracerLane', 'clear'],
    ['pathRenderers', 'clearIntruderFadeState'],
    ['localForceModel', 'resetRunTelemetry'],
    ['localStepIntegrator', 'resetRunState'],
    ['localEvents', 'resetRunState'],
    ['yoshida4TrialIntegrator', 'resetTrialTelemetry'],
    ['diagnostics', 'reset']
  ]);

  function createRuntimeResetLifecycle(owners) {
    const resetters = Object.freeze(REQUIRED_RESET_SPEC.map(([ownerKey, method]) => {
      const owner = owners?.[ownerKey];
      if (!owner || typeof owner[method] !== 'function') {
        throw new Error(`required reset owner missing: ${ownerKey}.${method}`);
      }
      return () => owner[method]();
    }));
    return Object.freeze({
      resetRuntimeStateForNewRun() {
        for (const reset of resetters) reset();
      }
    });
  }

  SGRA.Runtime.RuntimeResetLifecycle = Object.freeze({ createRuntimeResetLifecycle, assertRequiredInterfaces });
})(typeof window !== 'undefined' ? window : globalThis);
