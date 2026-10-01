// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachFrameProjectionCache(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  function createFrameProjectionCache(projectFn) {
    let projCache = new WeakMap();

    function projectCached(p) {
      if (!p) return null;
      const hit = projCache.get(p);
      if (hit) return hit;
      const s = projectFn(p.x, p.y, p.z);
      if (s) projCache.set(p, s);
      return s;
    }

    function clear() {
      projCache = new WeakMap();
    }

    return Object.freeze({ projectCached, clear });
  }

  SGRA.Render.FrameProjectionCache = Object.freeze({ createFrameProjectionCache });
})(typeof window !== 'undefined' ? window : globalThis);
