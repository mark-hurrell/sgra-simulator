// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachTransientEffects(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  function createTransientEffects(options = {}) {
    const flashEffects = [];
    const captureEffects = [];
    let captureCount = 0;
    const now = typeof options.now === 'function' ? options.now : () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    // Strictly greater than 500 ms prevents three admissions at the endpoints
    // of an inclusive one-second wall-clock window.
    const flashMinIntervalMs = Number.isFinite(options.flashMinIntervalMs) ? Math.max(0, options.flashMinIntervalMs) : 501;
    const flashesEnabled = options.flashesEnabled !== false;
    const capturesEnabled = options.capturesEnabled !== false && flashesEnabled;
    let lastFlashAt = -Infinity;
    let suppressedFlashes = 0;

    function flashes() { return flashEffects; }
    function captures() { return captureEffects; }
    function addFlash(effect) { const time = now(); if (!flashesEnabled || time - lastFlashAt < flashMinIntervalMs) { suppressedFlashes += 1; return null; } lastFlashAt = time; flashEffects.push(effect); return effect; }
    function addCapture(effect) { if (!capturesEnabled) return null; captureEffects.push(effect); return effect; }
    function removeFlashAt(index) { return flashEffects.splice(index, 1)[0] || null; }
    function removeCaptureAt(index) { return captureEffects.splice(index, 1)[0] || null; }
    function getCaptureCount() { return captureCount; }
    function incrementCaptureCount() { captureCount += 1; return captureCount; }
    function setCaptureCount(value) { captureCount = Number.isFinite(value) ? value : captureCount; return captureCount; }
    function clear() {
      flashEffects.length = 0;
      captureEffects.length = 0;
      captureCount = 0;
      lastFlashAt = -Infinity;
      suppressedFlashes = 0;
    }
    function snapshotCounts() {
      return { flashes: flashEffects.length, captures: captureEffects.length, captureCount, suppressedFlashes };
    }

    return Object.freeze({
      flashes,
      captures,
      addFlash,
      addCapture,
      removeFlashAt,
      removeCaptureAt,
      getCaptureCount,
      incrementCaptureCount,
      setCaptureCount,
      clear,
      snapshotCounts
    });
  }

  SGRA.State.TransientEffects = Object.freeze({ createTransientEffects });
})(globalThis);
