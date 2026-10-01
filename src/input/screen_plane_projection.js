// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachScreenPlaneProjection(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Input = SGRA.Input || {};

  function createScreenPlaneProjection(irotFn) {
    function planePoint(sx, sy, cam, viewport, blackHole) {
      const u = (sx - viewport.W / 2) / viewport.F * cam.dist;
      const v = -(sy - viewport.H / 2) / viewport.F * cam.dist;
      const [wx, wy, wz] = irotFn(u, v, 0);
      return [blackHole.x + cam.tx + wx, blackHole.y + cam.ty + wy, blackHole.z + cam.tz + wz];
    }

    return Object.freeze({ planePoint });
  }

  SGRA.Input.ScreenPlaneProjection = Object.freeze({ createScreenPlaneProjection });
})(typeof window !== 'undefined' ? window : globalThis);
