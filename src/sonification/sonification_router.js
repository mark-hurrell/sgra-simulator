// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachSonificationRouter(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // Correction package (SONIFICATION_CHANGE_PACKAGE_003.md). The single
  // function handed to audio_arbitration_service.js's setBackend(). Its
  // entire job is SON-03 compliance at the routing layer: a 'model-event'
  // goes to the spoken backend and nothing else ever does. This is a thin
  // dispatcher, not a decision-maker -- it has no policy of its own beyond
  // the one routing rule, so it cannot drift from that rule without the
  // change being visible in a one-line diff.

  function createSonificationRouter({ toneBackend, spokenBackend } = {}) {
    function route(qualifiedEvent) {
      if (!qualifiedEvent || typeof qualifiedEvent.kind !== 'string') return false;
      if (qualifiedEvent.kind === 'model-event') {
        return spokenBackend && typeof spokenBackend.play === 'function' ? spokenBackend.play(qualifiedEvent) : false;
      }
      return toneBackend && typeof toneBackend.play === 'function' ? toneBackend.play(qualifiedEvent) : false;
    }
    return route;
  }

  SGRA.Sonification.Router = Object.freeze({ createSonificationRouter });
})(typeof window !== 'undefined' ? window : globalThis);
