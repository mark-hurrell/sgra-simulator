// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachEncounterEnvironment(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {}; SGRA.Encounter = SGRA.Encounter || {};
  const MODES = Object.freeze({ MAIN: 'MAIN', SANDBOX: 'SANDBOX', SCENARIO: 'SCENARIO' });
  const clone = value => JSON.parse(JSON.stringify(value));
  class EnvironmentError extends Error { constructor(code, message) { super(message); this.code = code; } }
  function create(options = {}) {
    let mode = options.mode || MODES.MAIN;
    const require = (name) => { if (typeof options[name] !== 'function') throw new EnvironmentError('RUNTIME', `environment requires ${name}()`); return options[name]; };
    const bodies = require('getBodies'); const replaceBodies = options.replaceBodies;
    function setMode(next) { if (!Object.values(MODES).includes(next)) throw new EnvironmentError('ENVIRONMENT_MODE', 'unsupported environment mode'); mode = next; return mode; }
    function resetDerived() { if (typeof options.rebuildDerived === 'function') options.rebuildDerived(); if (typeof options.refreshAcceleration === 'function') options.refreshAcceleration(); }
    function createSandbox() {
      const current = bodies(); const bh = current.find(body => body && body.bh);
      if (!bh) throw new EnvironmentError('BH_REQUIRED', 'Sandbox requires one BH');
      if (current.filter(body => body && body.bh).length !== 1) throw new EnvironmentError('BH_REQUIRED', 'Sandbox requires exactly one BH');
      if (typeof replaceBodies !== 'function') throw new EnvironmentError('RUNTIME', 'Sandbox creation requires replaceBodies()');
      replaceBodies([bh]); setMode(MODES.SANDBOX); resetDerived();
      if (typeof options.recordEvent === 'function') options.recordEvent({ type: 'sandbox-started', kind: 'intervention', simulationTime: options.getSimTime ? options.getSimTime() : 0 });
      return { ok: true, code: 'SANDBOX_STARTED', mode };
    }
    function addIntruder(args) {
      if (mode !== MODES.SANDBOX) return { ok: false, error: { code: 'SANDBOX_ONLY', message: 'intruders may be added only in Sandbox' } };
      const factory = require('createIntruderBody'); const append = require('appendBody');
      const body = factory({ ...args, id: typeof options.allocateId === 'function' ? options.allocateId() : args.id });
      append(body); resetDerived();
      if (typeof options.recordEvent === 'function') options.recordEvent({ type: 'sandbox-intruder-added', kind: 'intervention', simulationTime: options.getSimTime ? options.getSimTime() : 0, bodyId: body.id, role: 'intruder' });
      return { ok: true, code: 'SANDBOX_INTRUDER_ADDED', bodyId: body.id, body };
    }
    function removeSandboxBody(bodyId) {
      if (mode !== MODES.SANDBOX) return { ok: false, error: { code: 'MANUAL_REMOVAL_SANDBOX_ONLY', message: 'manual body removal is restricted to Sandbox' } };
      const list = bodies(); const index = list.findIndex(body => body && body.id === bodyId);
      if (index < 0) return { ok: false, error: { code: 'SANDBOX_BODY_NOT_FOUND', message: 'Sandbox body does not exist' } };
      const body = list[index];
      if (body.bh) return { ok: false, error: { code: 'SANDBOX_BH_PROTECTED', message: 'the BH cannot be manually removed' } };
      if (!body.intr) return { ok: false, error: { code: 'SANDBOX_TARGET_NOT_INTRUDER', message: 'only Sandbox intruders may be removed' } };
      if (typeof options.removeBodyAt !== 'function') throw new EnvironmentError('RUNTIME', 'environment requires removeBodyAt()');
      options.removeBodyAt(index);
      if (typeof options.clearBodyReferences === 'function') options.clearBodyReferences(bodyId);
      resetDerived();
      if (typeof options.recordEvent === 'function') options.recordEvent({ type: 'sandbox-intruder-removed', kind: 'intervention', simulationTime: options.getSimTime ? options.getSimTime() : 0, bodyId, role: 'intruder' });
      return { ok: true, code: 'SANDBOX_INTRUDER_REMOVED', bodyId, removed: clone({ id: body.id, name: body.name, mass: body.m }) };
    }
    return Object.freeze({ getMode: () => mode, setMode, createSandbox, addIntruder, removeSandboxBody, modes: MODES });
  }
  const api = Object.freeze({ MODES, EnvironmentError, create }); SGRA.Encounter.EncounterEnvironment = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
