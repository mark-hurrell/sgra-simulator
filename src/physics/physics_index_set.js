// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function (global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  /**
   * Capacity-managed reusable index buffer. Replaces the `interacting = []`
   * allocation that both local_force_model.js::computeAccel() and
   * local_timestep_policy.js::pickDt() previously created on every call
   * (plan PERF-01 / sec 6.1).
   *
   * Usage:
   *   const set = createPhysicsIndexSet();
   *   set.reset();
   *   for (...) if (include) set.push(i);
   *   for (let k = 0; k < set.length; k++) { const i = set.get(k); ... }
   *
   * Growth doubles capacity (like a typical dynamic array) rather than
   * growing by exactly the overflow amount, so repeated small overflows
   * don't cause O(n^2) reallocation churn. Capacity only ever grows; it is
   * never shrunk (avoids allocation on body-count decrease from captures).
   */
  function createPhysicsIndexSet(initialCapacity = 32) {
    let buffer = new Int32Array(Math.max(1, initialCapacity));
    let len = 0;
    let growthEvents = 0;

    function ensureCapacity(minCapacity) {
      if (buffer.length >= minCapacity) return;
      let newCap = buffer.length * 2;
      while (newCap < minCapacity) newCap *= 2;
      const next = new Int32Array(newCap);
      next.set(buffer.subarray(0, len));
      buffer = next;
      growthEvents++;
    }

    function reset() { len = 0; }
    function push(index) {
      ensureCapacity(len + 1);
      buffer[len] = index;
      len++;
    }
    function get(k) { return buffer[k]; }
    function getLength() { return len; }
    function getCapacity() { return buffer.length; }
    function getGrowthEvents() { return growthEvents; }

    return Object.freeze({
      reset,
      push,
      get,
      get length() { return len; },
      get capacity() { return buffer.length; },
      getGrowthEvents
    });
  }

  SGRA.Physics.createPhysicsIndexSet = createPhysicsIndexSet;
})(typeof window !== 'undefined' ? window : globalThis);
