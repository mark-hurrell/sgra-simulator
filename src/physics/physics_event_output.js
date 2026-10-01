// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).

(function (global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  const EVENT_TYPES = Object.freeze(new Set(['bodyCaptured', 'bodyEjected', 'pericentre']));

  function create(capacity = 64) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new TypeError('PhysicsEventOutput capacity must be a positive integer');
    const queue = new Array(capacity);
    let length = 0;

    function emit(type, payload) {
      if (!EVENT_TYPES.has(type)) throw new TypeError(`Unknown physics event type: ${type}`);
      if (!payload || typeof payload !== 'object') throw new TypeError(`Physics event '${type}' requires a payload`);
      if (length >= capacity) throw new Error('PhysicsEventOutput capacity exceeded');
      queue[length++] = Object.freeze({ type, payload: Object.freeze({ ...payload }) });
    }

    function drain() {
      const events = queue.slice(0, length);
      for (let i = 0; i < length; i++) queue[i] = undefined;
      length = 0;
      return events;
    }

    return Object.freeze({
      emitBodyCaptured: payload => emit('bodyCaptured', payload),
      emitBodyEjected: payload => emit('bodyEjected', payload),
      emitPericentre: payload => emit('pericentre', payload),
      drain,
      pending: () => length,
      capacity
    });
  }

  SGRA.Physics.PhysicsEventOutput = Object.freeze({ create, EVENT_TYPES });
})(typeof window !== 'undefined' ? window : globalThis);
