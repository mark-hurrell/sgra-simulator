// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachPathGeometry(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Paths = SGRA.Paths || {};

  function hermitePoint(a, b, u) {
    const dt = Math.max(1e-12, b.t - a.t);
    const u2 = u * u;
    const u3 = u2 * u;

    const h00 =  2*u3 - 3*u2 + 1;
    const h10 =      u3 - 2*u2 + u;
    const h01 = -2*u3 + 3*u2;
    const h11 =      u3 -   u2;
    // Derivative basis (d/du). Dividing the result by dt converts d/du to d/dt.
    // The position basis (h00/h10) is NOT a valid velocity blend: it does not
    // partition unity, returns 0.625*v at u=0.5 for uniform motion, and returns
    // exactly 0 at u=1. See DEF-01.
    const g00 =  6*u2 - 6*u;
    const g10 =  3*u2 - 4*u + 1;
    const g01 = -6*u2 + 6*u;
    const g11 =  3*u2 - 2*u;
    const invDt = 1 / dt;

    return {
      index: a.index ?? 0,
      t: a.t + dt * u,
      x: h00*a.x + h10*dt*(a.vx||0) + h01*b.x + h11*dt*(b.vx||0),
      y: h00*a.y + h10*dt*(a.vy||0) + h01*b.y + h11*dt*(b.vy||0),
      z: h00*a.z + h10*dt*(a.vz||0) + h01*b.z + h11*dt*(b.vz||0),
      vx: (g00*a.x + g10*dt*(a.vx||0) + g01*b.x + g11*dt*(b.vx||0)) * invDt,
      vy: (g00*a.y + g10*dt*(a.vy||0) + g01*b.y + g11*dt*(b.vy||0)) * invDt,
      vz: (g00*a.z + g10*dt*(a.vz||0) + g01*b.z + g11*dt*(b.vz||0)) * invDt
    };
  }

  function adaptiveProjectCurve(path, start, projectCached, clipX, clipY) {
    const MAX_SEG2 = 80 * 80;
    const HARD_BREAK2 = 900 * 900;
    const MAX_DEPTH = 8;
    const validScreen = s => s && Math.abs(s[0]) <= clipX && Math.abs(s[1]) <= clipY;
    const segments = [];

    function pushPoint(s, move = false) {
      if (!validScreen(s)) return false;
      segments.push({ s, move });
      return true;
    }

    function subdivide(a, b, depth = 0) {
      const sa = projectCached(a);
      const sb = projectCached(b);
      if (!validScreen(sa) || !validScreen(sb)) {
        if (validScreen(sb)) pushPoint(sb, true);
        return;
      }
      const d2 = (sb[0] - sa[0]) ** 2 + (sb[1] - sa[1]) ** 2;
      if (d2 > HARD_BREAK2) {
        pushPoint(sb, true);
        return;
      }
      if (d2 > MAX_SEG2 && depth < MAX_DEPTH) {
        const m = hermitePoint(a, b, 0.5);
        subdivide(a, m, depth + 1);
        subdivide(m, b, depth + 1);
        return;
      }
      pushPoint(sb, false);
    }

    const first = { t: start.t, x: start.x, y: start.y, z: start.z, vx: start.vx || 0, vy: start.vy || 0, vz: start.vz || 0 };
    pushPoint(projectCached(first), true);
    for (let i = start.index + 1; i < path.pts.length; i++) {
      const p = path.pts[i];
      if (p.t < start.t) continue;
      subdivide(first, p);
      first.t = p.t; first.x = p.x; first.y = p.y; first.z = p.z; first.vx = p.vx || 0; first.vy = p.vy || 0; first.vz = p.vz || 0;
    }
    return segments;
  }

  SGRA.Paths.Geometry = Object.freeze({
    hermitePoint,
    adaptiveProjectCurve
  });
})(typeof window !== 'undefined' ? window : globalThis);
