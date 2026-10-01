// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachTrailState(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  function createTrailState(options = {}) {
    const trails = [];
    let sequence = 0;
    let length = Number.isFinite(options.length) ? options.length : 240;

    function all() { return trails; }
    function forBody(index) { return trails[index]; }
    function replaceAll(value) {
      trails.length = 0;
      if (Array.isArray(value)) trails.push(...value);
      return trails;
    }
    function ensureBodySlots(count) {
      while (trails.length < count) trails.push([]);
      if (trails.length > count) trails.length = count;
      return trails;
    }
    function clearAll() {
      for (const trail of trails) {
        if (Array.isArray(trail)) trail.length = 0;
      }
    }

    function getSequence() { return sequence; }
    function nextSequence() { sequence += 1; return sequence; }
    function setSequence(value) { sequence = Number.isFinite(value) ? value : sequence; return sequence; }

    function getLength() { return length; }
    function setLength(value) { length = Number.isFinite(value) ? value : length; return length; }

    function reset() {
      trails.length = 0;
      sequence = 0;
      length = Number.isFinite(options.length) ? options.length : 240;
    }

    function snapshotMetadata() {
      return { count: trails.length, sequence, length };
    }

    return Object.freeze({
      all,
      forBody,
      replaceAll,
      ensureBodySlots,
      clearAll,
      getSequence,
      nextSequence,
      setSequence,
      getLength,
      setLength,
      reset,
      snapshotMetadata
    });
  }

  SGRA.State.TrailState = Object.freeze({ createTrailState });
})(globalThis);
