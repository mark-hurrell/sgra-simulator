// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachAudioArbitrationService(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // Increment 1 of the tracked sonification package (see
  // SONIFICATION_CHANGE_PACKAGE_001.md). Builds only the discrete "event"
  // channel scaffolding -- the arbitration layer that sits between the
  // *already-qualified* accessible-status seam (sgra_sim.html
  // flushAccessibleStatus) and an eventual audio backend. It does not
  // synthesise sound; it decides whether and what to hand a backend.
  //
  // Continuous channels (carrier/pulse/invariant, tracking body motion
  // frame-to-frame per doc 07 Appendix B) are out of scope for this
  // increment -- they require subscribing to the simulation clock and body
  // store on every frame, which is a materially larger and separately
  // reviewable change. See doc 07 SON-06/SON-08 and the codemap's
  // "future query/scrub candidate" note on simulation_clock.js.
  //
  // Hard boundary, enforced by tests/sonification_boundary.test.mjs:
  // this module must not import or reference physics, integrator,
  // capture-classification, scheduler, renderer, camera, or ownership
  // modules, and must not mutate any object passed into it or touch the
  // DOM. Per README_FOR_OPUS_DESIGN_CONTEXT.md: audio must be off by
  // default, mono-safe, and must never use loudness or pan as a data
  // channel, and must not provide a definitive capture cue.

  // Mirrors sgra_sim.html's STATUS_PRIORITY without importing it (that file
  // is not a module and exposes no seam to import from; the values are a
  // stable, documented contract in the codemap, not private).
  const PRIORITY = Object.freeze({ MODEL: 1, VALIDATION: 2, USER: 3 });

  const PRIORITY_TO_KIND = Object.freeze({
    1: 'model-event',
    2: 'form-result',
    3: 'user-action'
  });

  function classifyKind(priority) {
    return PRIORITY_TO_KIND[priority] || 'user-action';
  }

  function noopBackend() {
    // No synthesis in increment 1. A real backend (Web Audio) is injected
    // by setBackend() in a later increment; until then every qualified
    // event is arbitrated but nothing audible happens.
  }

  function createArbitrationService(options = {}) {
    const settings = options.settings || null;
    let backend = typeof options.backend === 'function' ? options.backend : noopBackend;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();

    let lastEmittedAt = -Infinity;
    let emittedCount = 0;
    let suppressedCount = 0;
    let lastEvent = null;

    // A floor independent of the upstream status cadence, so this layer
    // never becomes a second, looser rate limit that the upstream policy
    // didn't intend (belt-and-braces against the false-positive-bias risk
    // recorded in doc 07 S1(b): an over-eager audio layer reporting change
    // that is not there). Upstream (MODEL_STATUS_INTERVAL_MS) is stricter
    // for model events already; this is a minimum floor for every kind.
    const minIntervalMs = Number.isFinite(options.minIntervalMs) ? Math.max(0, options.minIntervalMs) : 150;

    function isEnabled() {
      if (!settings || typeof settings.get !== 'function') return false;
      const snapshot = settings.get();
      return !!(snapshot && snapshot.enabled === true);
    }

    function setBackend(fn) {
      backend = typeof fn === 'function' ? fn : noopBackend;
    }

    // entry: { text: string, priority: 1|2|3 }. Read-only -- never mutated,
    // never stored by reference (a frozen copy is built instead).
    function notify(entry) {
      if (!entry || typeof entry.text !== 'string' || !entry.text.trim()) return null;
      if (!isEnabled()) return null;

      const t = now();
      if (t - lastEmittedAt < minIntervalMs) {
        suppressedCount++;
        return null;
      }

      const priority = [PRIORITY.MODEL, PRIORITY.VALIDATION, PRIORITY.USER].includes(entry.priority)
        ? entry.priority
        : PRIORITY.USER;

      const qualifiedEvent = Object.freeze({
        kind: classifyKind(priority),
        priority,
        // The text itself is carried for a future spoken-equivalent /
        // earcon-selection step (doc 07 Appendix B SPOKEN EQUIVALENT); this
        // increment does not derive any new claim from it.
        text: entry.text,
        at: t
      });

      lastEmittedAt = t;
      emittedCount++;
      lastEvent = qualifiedEvent;
      backend(qualifiedEvent);
      return qualifiedEvent;
    }

    function snapshotCounts() {
      return { emitted: emittedCount, suppressed: suppressedCount };
    }

    function lastEmitted() {
      return lastEvent;
    }

    return Object.freeze({ notify, setBackend, snapshotCounts, lastEmitted });
  }

  SGRA.Sonification.Arbitration = Object.freeze({
    createArbitrationService,
    PRIORITY
  });
})(typeof window !== 'undefined' ? window : globalThis);
