// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachViewportState(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  function createViewportState() {
    let W = 0;
    let H = 0;
    let DPR = 1;
    let F = 0;
    // Live, mutable view of the viewport. Callers MUST treat it as read-only and
    // MUST NOT retain it across a resize. Provided so per-point projection
    // helpers do not allocate a snapshot per call. See PERF-06.
    const live = { W: 0, H: 0, DPR: 1, F: 0 };

    function setSize(w, h, dpr, f) {
      W = w;
      H = h;
      DPR = dpr;
      F = f;
      live.W = w;
      live.H = h;
      live.DPR = dpr;
      live.F = f;
    }

    function getSnapshot() {
      return { W, H, DPR, F };
    }

    function getLive() {
      return live;
    }

    return Object.freeze({ setSize, getSnapshot, getLive });
  }

  SGRA.Render.ViewportState = Object.freeze({ createViewportState });
})(typeof window !== 'undefined' ? window : globalThis);
