// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachCameraProjection(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  function createCameraProjection() {
    let _cy = 1;
    let _sy = 0;
    let _cp = 1;
    let _sp = 0;

    function setOrientation(yaw, pitch) {
      _cy = Math.cos(yaw);
      _sy = Math.sin(yaw);
      _cp = Math.cos(pitch);
      _sp = Math.sin(pitch);
    }

    function rot(x, y, z) {
      const x1 = x * _cy - y * _sy, y1 = x * _sy + y * _cy;
      return [x1, y1 * _cp - z * _sp, y1 * _sp + z * _cp];
    }

    function irot(x, y, z) {
      const y1 = y * _cp + z * _sp;
      return [x * _cy + y1 * _sy, -x * _sy + y1 * _cy, -y * _sp + z * _cp];
    }

    function projectBH(bx, by, bz, cam, viewport) {
      const [px, py, pz] = rot(bx - cam.tx, by - cam.ty, bz - cam.tz);
      const ze = cam.dist - pz;
      if (ze <= 5 || !Number.isFinite(ze)) return null;
      return [viewport.W / 2 + viewport.F * px / ze, viewport.H / 2 - viewport.F * py / ze, ze];
    }

    function auToPx(r, cam, viewport) {
      return r * viewport.F / cam.dist;
    }

    return Object.freeze({ setOrientation, rot, irot, projectBH, auToPx });
  }

  SGRA.Render.CameraProjection = Object.freeze({ createCameraProjection });
})(typeof window !== 'undefined' ? window : globalThis);
