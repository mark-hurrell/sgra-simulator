// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachBodyStore(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  function createBodyStore(options = {}) {
    const bodies = [];
    let nextBodyId = Number.isFinite(options.nextBodyId) ? options.nextBodyId : 1;
    let baselineEnergy = null;
    let baselineEnergyBreakdown = null;
    const onForceInputsChanged = typeof options.onForceInputsChanged === 'function' ? options.onForceInputsChanged : () => {};

    function all() { return bodies; }
    function count() { return bodies.length; }
    function blackHole() { return bodies[0]; }
    function at(index) { return bodies[index]; }
    function findById(id) { return bodies.find(body => body && body.id === id) || null; }
    function indexById(id) { return bodies.findIndex(body => body && body.id === id); }

    function replaceAll(value) {
      bodies.length = 0;
      if (Array.isArray(value)) bodies.push(...value);
      onForceInputsChanged();
      return bodies;
    }
    function append(body) { bodies.push(body); onForceInputsChanged(); return bodies.length - 1; }
    function removeAt(index) {
      if (index < 0 || index >= bodies.length) return null;
      const removed = bodies.splice(index, 1)[0] || null;
      if (removed) onForceInputsChanged();
      return removed;
    }
    function clear() { bodies.length = 0; onForceInputsChanged(); }
    function normalizeStructure() {
      bodies.forEach((body, index) => {
        if (!body || typeof body !== 'object') throw new TypeError(`body at index ${index} must be an object`);
        body.id = index;
        if (!Object.hasOwn(body, 'field')) body.field = false;
        if (!Object.hasOwn(body, 'intr')) body.intr = false;
        if (!Object.hasOwn(body, 'star')) body.star = false;
        if (body.name && /^S\d/.test(body.name)) body.star = true;
      });
      resetIdSequence(bodies.length);
      return bodies;
    }

    function allocateId() {
      const id = nextBodyId;
      nextBodyId += 1;
      return id;
    }
    function peekNextId() { return nextBodyId; }
    function resetIdSequence(start = 1) { nextBodyId = start; return nextBodyId; }

    function getBaselineEnergy() { return baselineEnergy; }
    function setBaselineEnergy(value) { baselineEnergy = value; return baselineEnergy; }
    function getBaselineEnergyBreakdown() { return baselineEnergyBreakdown; }
    function setBaselineEnergyBreakdown(value) { baselineEnergyBreakdown = value; return baselineEnergyBreakdown; }

    function snapshot() {
      return {
        count: bodies.length,
        nextBodyId,
        baselineEnergy,
        baselineEnergyBreakdown
      };
    }

    return Object.freeze({
      all,
      count,
      blackHole,
      at,
      findById,
      indexById,
      replaceAll,
      append,
      removeAt,
      clear,
      normalizeStructure,
      allocateId,
      peekNextId,
      resetIdSequence,
      getBaselineEnergy,
      setBaselineEnergy,
      getBaselineEnergyBreakdown,
      setBaselineEnergyBreakdown,
      snapshot
    });
  }

  SGRA.State.BodyStore = Object.freeze({ createBodyStore });
})(globalThis);
