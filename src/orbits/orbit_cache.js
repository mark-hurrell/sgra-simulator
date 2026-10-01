// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachOrbitCache(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Orbits = SGRA.Orbits || {};

  const UPDATE_EVERY = 4;
  const N_HIGH = 192, N_MID = 120, N_LOW = 72;
  const SCREEN_R_HIGH = 80, SCREEN_R_MID = 30;

  function orbitPointCount(el, viewport, cam) {
    const screenR = el.a * (1 + el.e) * viewport.F / cam.dist;
    const base = screenR > SCREEN_R_HIGH ? N_HIGH : screenR > SCREEN_R_MID ? N_MID : N_LOW;
    const ecc = Number.isFinite(el.e) ? el.e : 0;
    const eccBoost = ecc > 0.7 ? Math.min(2.5, 1 + (ecc - 0.7) * 4) : 1;
    return Math.max(base, Math.round(base * eccBoost));
  }

  function createOrbitCache(deps) {
    const { getBodies, oscElements, ellipsePoints, getCamera, getViewport } = deps;
    const orbitCache = new Map();
    const oscCache = new Map();
    let frame = 0;

    function update() {
      if (++frame % UPDATE_EVERY !== 0) return;
      const bodies = getBodies();
      const cam = getCamera();
      const viewport = getViewport();
      for (let i = 1; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.intr || b.field) continue;
        const el = oscElements(b);
        oscCache.set(b, el);
        if (!(el.a > 0 && el.e < 1)) {
          orbitCache.set(b, { pts: null, conf: el.conf });
          continue;
        }
        const N = orbitPointCount(el, viewport, cam);
        orbitCache.set(b, { pts: ellipsePoints(el, N), conf: el.conf });
      }
    }

    function getOrbit(body) { return orbitCache.get(body); }
    function getElements(body) { return oscCache.get(body); }
    function orbits() { return orbitCache; }
    function invalidateBody(body) {
      orbitCache.delete(body);
      oscCache.delete(body);
    }
    function clear() { orbitCache.clear(); oscCache.clear(); }

    return Object.freeze({ update, getOrbit, getElements, orbits, invalidateBody, clear });
  }

  SGRA.Orbits.OrbitCache = Object.freeze({ createOrbitCache, orbitPointCount });
})(typeof window !== 'undefined' ? window : globalThis);
