// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachEncounterPackage(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {}; SGRA.Encounter = SGRA.Encounter || {};
  const Snapshot = SGRA.Encounter.EncounterSnapshot;
  const Trajectory = SGRA.Encounter.EncounterTrajectory;
  const SCHEMA = 'sgra-encounter-package'; const SCHEMA_VERSION = 1;
  const clone = value => JSON.parse(JSON.stringify(value));
  function failure(code, message, path = null) { return { ok: false, error: { code, message, path } }; }
  function validate(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('TYPE', 'package must be an object');
    if (input.schema !== SCHEMA) return failure('SCHEMA', 'unsupported encounter package schema', 'schema');
    if (input.schemaVersion !== SCHEMA_VERSION) return failure('SCHEMA_VERSION', 'unsupported encounter package version', 'schemaVersion');
    const snapshot = Snapshot.validate(input.snapshot, options.snapshot || options);
    if (!snapshot.ok) return failure('SNAPSHOT_INVALID', snapshot.error.message, `snapshot${snapshot.error.path ? `.${snapshot.error.path}` : ''}`);
    const trajectory = Trajectory.validate(input.trajectory);
    if (!trajectory.ok) return failure('TRAJECTORY_INVALID', trajectory.error.message, `trajectory${trajectory.error.path ? `.${trajectory.error.path}` : ''}`);
    if (!Array.isArray(input.events)) return failure('EVENTS_INVALID', 'package events must be an array', 'events');
    return { ok: true, value: { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, provenance: clone(input.provenance || {}), snapshot: snapshot.value, trajectory: trajectory.value, events: clone(input.events), metadata: clone(input.metadata || {}) } };
  }
  function create(value) { const checked = validate({ schema: SCHEMA, schemaVersion: SCHEMA_VERSION, ...value }); if (!checked.ok) throw new Error(checked.error.message); return checked.value; }
  function capture(runtime, trajectory, options = {}) {
    if (!Snapshot || !trajectory || typeof trajectory.capture !== 'function') throw new Error('T6C package capture requires T6B snapshot and trajectory');
    const snapshot = Snapshot.capture(runtime); const trace = trajectory.capture();
    const terminal = trace.samples[trace.samples.length - 1];
    if (terminal && terminal.simulationTime === snapshot.provenance.simulationTime) {
      const states = new Map(terminal.bodies.map(state => [state.id, state]));
      const live = [snapshot.blackHole, ...snapshot.bodies];
      if (states.size !== live.length || live.some(body => {
        const state = states.get(body.id);
        return !state || body.position.some((v, i) => v !== state.position[i]) || body.velocity.some((v, i) => v !== state.velocity[i]);
      })) throw new Error('TERMINAL_STATE_MISMATCH: trajectory terminal sample differs from restart snapshot');
    }
    return create({ provenance: { sourceSha: snapshot.provenance.sourceSha, simulationTime: snapshot.provenance.simulationTime, ...(options.provenance || {}) }, snapshot, trajectory: trace, events: trace.events, metadata: options.metadata || {} });
  }
  function serialize(input, options) { const checked = validate(input, options); if (!checked.ok) throw new Error(checked.error.message); return JSON.stringify(checked.value); }
  function parse(text, options) { if (typeof text !== 'string') return failure('TYPE', 'package text is required'); try { return validate(JSON.parse(text), options); } catch (_) { return failure('JSON', 'invalid encounter package JSON'); } }
  function load(input, runtime, options = {}) { const checked = typeof input === 'string' ? parse(input, options) : validate(input, options); if (!checked.ok) return checked; return Snapshot.load(checked.value.snapshot, runtime, options.snapshot || options); }
  const api = Object.freeze({ SCHEMA, SCHEMA_VERSION, create, capture, validate, serialize, parse, load });
  SGRA.Encounter.EncounterPackage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
