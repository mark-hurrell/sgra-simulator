// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachEncounterTrajectory(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Encounter = SGRA.Encounter || {};
  const SCHEMA = 'sgra-encounter-trajectory';
  const SCHEMA_VERSION = 1;

  class TrajectoryError extends Error {
    constructor(code, message, path = null) { super(message); this.name = 'TrajectoryError'; this.code = code; this.path = path; }
  }
  const fail = (code, message, path = null) => { throw new TrajectoryError(code, message, path); };
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = (value, path) => { if (typeof value !== 'number' || !Number.isFinite(value)) fail('NONFINITE', 'expected a finite number', path); return value; };
  const vector = (value, path) => { if (!Array.isArray(value) || value.length !== 3) fail('VECTOR', 'expected a three-component vector', path); return value.map((v, i) => finite(v, `${path}[${i}]`)); };
  const clone = value => JSON.parse(JSON.stringify(value));
  const bodyKind = body => body.bh ? 'bh' : body.intr ? 'intruder' : body.field ? 'field' : body.star ? 'sstar' : 'body';

  function bodyMeta(body, time) {
    return { id: body.id, name: body.name == null ? null : String(body.name), kind: bodyKind(body),
      role: body.bh ? 'black-hole' : body.intr ? 'intruder' : body.field ? 'field' : body.star ? 'star' : 'body',
      mass: finite(body.m, 'body.mass'), firstSeenSimulationTime: time, lastSeenSimulationTime: time };
  }

  function make(options = {}) {
    const maxSamples = Number.isInteger(options.maxSamples) && options.maxSamples > 0 ? options.maxSamples : 1000;
    const samples = [];
    const events = [];
    const bodyTable = new Map();
    let droppedSamples = 0;
    let header = clone(options.header || { timeBasis: 'simulation-time', units: { length: 'AU', time: 'yr', mass: 'Msun', velocity: 'AU/yr' } });

    function addMetadata(body, time) {
      if (!Number.isInteger(body.id) || body.id < 0) fail('BODY_ID', 'trajectory body ID must be a non-negative integer', 'body.id');
      const old = bodyTable.get(body.id);
      if (old) { old.lastSeenSimulationTime = time; return old; }
      const meta = bodyMeta(body, time); bodyTable.set(body.id, meta); return meta;
    }
    function recordCommitted(runtime, extra = {}) {
      if (!runtime || typeof runtime.getBodies !== 'function' || typeof runtime.getSimTime !== 'function') fail('RUNTIME', 'recordCommitted requires getBodies() and getSimTime()');
      const time = finite(runtime.getSimTime(), 'sample.simulationTime');
      if (samples.length && time < samples[samples.length - 1].simulationTime) fail('TIME_ORDER', 'trajectory timestamps must be monotonic', 'sample.simulationTime');
      const bodies = runtime.getBodies();
      if (!Array.isArray(bodies)) fail('BODIES', 'runtime bodies must be an array');
      const state = bodies.filter(body => body && !body.captured).map((body, i) => {
        addMetadata(body, time);
        return { id: body.id, position: [finite(body.x, `samples[${samples.length}].bodies[${i}].x`), finite(body.y, `samples[${samples.length}].bodies[${i}].y`), finite(body.z, `samples[${samples.length}].bodies[${i}].z`)], velocity: [finite(body.vx, 'sample.vx'), finite(body.vy, 'sample.vy'), finite(body.vz, 'sample.vz')] };
      });
      const sample = { simulationTime: time, bodies: state };
      if (Number.isFinite(extra.dt)) sample.dt = extra.dt;
      if (extra.limiter != null) sample.limiter = String(extra.limiter);
      if (extra.physicsOwner != null) sample.physicsOwner = String(extra.physicsOwner);
      samples.push(sample);
      while (samples.length > maxSamples) { samples.shift(); droppedSamples += 1; }
      return clone(sample);
    }
    function recordEvent(event) {
      if (!record(event) || typeof event.type !== 'string' || event.type.length === 0) fail('EVENT', 'event type is required');
      const time = finite(event.simulationTime, 'event.simulationTime');
      if (events.length && time < events[events.length - 1].simulationTime) fail('TIME_ORDER', 'event timestamps must be monotonic');
      events.push(clone({ ...event, simulationTime: time }));
      return events[events.length - 1];
    }
    function markRemoved(bodyId, time) {
      const meta = bodyTable.get(bodyId); if (meta) meta.lastSeenSimulationTime = finite(time, 'body.lastSeenSimulationTime');
    }
    function snapshot() {
      return { schema: SCHEMA, schemaVersion: SCHEMA_VERSION, header: clone(header), bodyTable: Array.from(bodyTable.values()).map(clone), samples: clone(samples), events: clone(events), retention: { maxSamples, droppedSamples } };
    }
    function memoryStats() {
      const value = snapshot(); const approxBytes = JSON.stringify(value).length;
      const bodies = samples.reduce((n, sample) => n + sample.bodies.length, 0);
      return { retainedSamples: samples.length, retainedBodies: bodies, approxBytes, bytesPerSampleBody: bodies ? approxBytes / bodies : 0, maxSamples, droppedSamples };
    }
    return Object.freeze({ recordCommitted, recordEvent, markRemoved, snapshot, capture: snapshot, memoryStats,
      get samples() { return samples.length; }, get maxSamples() { return maxSamples; } });
  }

  function validate(input) {
    try {
      if (!record(input)) fail('TYPE', 'trajectory must be an object');
      if (input.schema !== SCHEMA) fail('SCHEMA', 'unsupported trajectory schema', 'schema');
      if (input.schemaVersion !== SCHEMA_VERSION) fail('SCHEMA_VERSION', 'unsupported trajectory version', 'schemaVersion');
      if (!record(input.header) || input.header.timeBasis !== 'simulation-time') fail('HEADER', 'simulation-time header is required', 'header');
      if (!Array.isArray(input.bodyTable) || !Array.isArray(input.samples) || !Array.isArray(input.events)) fail('SHAPE', 'trajectory tables are required');
      const ids = new Set();
      for (const [i, body] of input.bodyTable.entries()) {
        if (!record(body) || !Number.isInteger(body.id) || body.id < 0 || ids.has(body.id)) fail('BODY_ID', 'invalid or duplicate trajectory body ID', `bodyTable[${i}].id`);
        ids.add(body.id); finite(body.mass, `bodyTable[${i}].mass`); if (body.mass <= 0) fail('MASS', 'trajectory mass must be positive');
        finite(body.firstSeenSimulationTime, `bodyTable[${i}].firstSeenSimulationTime`); finite(body.lastSeenSimulationTime, `bodyTable[${i}].lastSeenSimulationTime`);
      }
      let lastTime = -Infinity;
      for (const [i, sample] of input.samples.entries()) {
        finite(sample.simulationTime, `samples[${i}].simulationTime`); if (sample.simulationTime < lastTime) fail('TIME_ORDER', 'samples must be chronological'); lastTime = sample.simulationTime;
        if (!Array.isArray(sample.bodies)) fail('SAMPLE', 'sample bodies are required'); const sampleIds = new Set();
        for (const [j, state] of sample.bodies.entries()) { if (!record(state) || !ids.has(state.id) || sampleIds.has(state.id)) fail('BODY_ID', 'sample references invalid/duplicate body', `samples[${i}].bodies[${j}].id`); sampleIds.add(state.id); vector(state.position, `samples[${i}].bodies[${j}].position`); vector(state.velocity, `samples[${i}].bodies[${j}].velocity`); }
      }
      let lastEvent = -Infinity;
      for (const [i, event] of input.events.entries()) { if (!record(event) || typeof event.type !== 'string') fail('EVENT', 'invalid event', `events[${i}]`); finite(event.simulationTime, `events[${i}].simulationTime`); if (event.simulationTime < lastEvent) fail('TIME_ORDER', 'events must be chronological'); lastEvent = event.simulationTime; }
      return { ok: true, value: clone(input) };
    } catch (error) { return { ok: false, error: { code: error.code || 'VALIDATION', message: error.message, path: error.path || null } }; }
  }
  function serialize(input) { const checked = validate(input); if (!checked.ok) throw new TrajectoryError(checked.error.code, checked.error.message, checked.error.path); return JSON.stringify(checked.value); }
  function parse(text) { try { return validate(JSON.parse(text)); } catch (error) { return { ok: false, error: { code: 'JSON', message: 'invalid trajectory JSON', path: null } }; } }
  const api = Object.freeze({ SCHEMA, SCHEMA_VERSION, TrajectoryError, create: make, validate, serialize, parse });
  SGRA.Encounter.EncounterTrajectory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
