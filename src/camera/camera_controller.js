// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachCameraController(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Camera = SGRA.Camera || {};

  function create(options = {}) {
    const TAU = 2 * Math.PI;
    function normalizeAngle(value) {
      if (!Number.isFinite(value)) return 0;
      value = ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;
      return value === -Math.PI ? Math.PI : value;
    }
    const defaults = Object.freeze({
      yaw: normalizeAngle(options.initialState?.yaw ?? 0.7),
      pitch: normalizeAngle(options.initialState?.pitch ?? 0.45),
      dist: options.initialState?.dist ?? 9000,
      tx: options.initialState?.tx ?? 0,
      ty: options.initialState?.ty ?? 0,
      tz: options.initialState?.tz ?? 0
    });
    const limits = Object.freeze({
      minDist: options.limits?.minDist ?? 40,
      maxDist: options.limits?.maxDist ?? 60000,
      rotateSensitivity: options.limits?.rotateSensitivity ?? 0.0045,
      wheelBase: options.limits?.wheelBase ?? 1.0015
    });
    const state = { ...defaults };
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    function rotateBy(deltaX, deltaY) {
      state.yaw = normalizeAngle(state.yaw - deltaX * limits.rotateSensitivity);
      state.pitch = normalizeAngle(state.pitch + deltaY * limits.rotateSensitivity);
    }
    function setOrientation(yaw, pitch) {
      state.yaw = normalizeAngle(yaw);
      state.pitch = normalizeAngle(pitch);
      return getCameraSnapshot();
    }
    function zoomBy(delta) { setZoom(state.dist * Math.pow(limits.wheelBase, delta)); }
    function setZoom(value) { state.dist = clamp(value, limits.minDist, limits.maxDist); }
    function reset() { Object.assign(state, defaults); }
    function resetTarget() { state.tx = 0; state.ty = 0; state.tz = 0; }
    function setTarget(x, y, z) { state.tx = x; state.ty = y; state.tz = z; }
    function followTarget(x, y, z, weight) {
      state.tx += (x - state.tx) * weight;
      state.ty += (y - state.ty) * weight;
      state.tz += (z - state.tz) * weight;
    }
    function getCameraSnapshot() { return Object.freeze({ ...state }); }

    return Object.freeze({ rotateBy, setOrientation, zoomBy, setZoom, reset, resetTarget, setTarget, followTarget, getCameraSnapshot });
  }

  SGRA.Camera.CameraController = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
