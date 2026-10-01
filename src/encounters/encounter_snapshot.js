// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachEncounterSnapshot(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Encounter = SGRA.Encounter || {};

  const SCHEMA = 'sgra-encounter-snapshot';
  const SCHEMA_VERSION = 2;
  const BODY_KEYS = Object.freeze(['id', 'name', 'kind', 'flags', 'mass', 'position', 'velocity', 'captured', 'creationProvenance']);
  const FORBIDDEN_KEYS = new Set([
    '__kerrState', '__kerrUnits', '__kerrSpinContext', '__kerrMassShell',
    '__kerrPromotionTime', '__fidelityOwnership', '__kerrStateStale',
    'ax', 'ay', 'az', 'aPN', 'aLT', 'aMutual', 'legMinR', 'prevR',
    'prevDR', 'lastPeriT', 'predictionCache', 'orbitCache', 'trailData'
  ]);
  const VALID_KINDS = new Set(['bh', 'sstar', 'intruder', 'field', 'body']);
  const VALID_FIDELITY = new Set(['newtonian', '1pn', 'adaptive_kerr']);
  const VALID_COMPOSITIONS = new Set(['plain', 'yoshida4_trial']);

  class EncounterError extends Error {
    constructor(code, message, path = null) {
      super(message);
      this.name = 'EncounterError';
      this.code = code;
      this.path = path;
    }
  }

  function fail(code, message, path = null) {
    throw new EncounterError(code, message, path);
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function finite(value, path) {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('NONFINITE', 'expected a finite number', path);
    return value;
  }

  function string(value, path) {
    if (typeof value !== 'string' || value.length === 0) fail('TYPE', 'expected a non-empty string', path);
    return value;
  }

  function exactKeys(value, allowed, path) {
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) fail('UNKNOWN_FIELD', `unexpected field '${key}'`, `${path}.${key}`);
    }
  }

  function rejectForbidden(value, path = '$') {
    if (Array.isArray(value)) {
      value.forEach((item, index) => rejectForbidden(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(value)) return;
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) fail('FORBIDDEN_CACHE', `forbidden runtime/cache field '${key}'`, `${path}.${key}`);
      rejectForbidden(value[key], `${path}.${key}`);
    }
  }

  function vector(value, path) {
    if (!Array.isArray(value) || value.length !== 3) fail('VECTOR', 'expected a three-component vector', path);
    return value.map((item, index) => finite(item, `${path}[${index}]`));
  }

  function flags(value, path) {
    if (!isRecord(value)) fail('TYPE', 'expected body flags object', path);
    exactKeys(value, new Set(['bh', 'star', 'intr', 'field', 'captured']), path);
    for (const key of ['bh', 'star', 'intr', 'field', 'captured']) {
      if (typeof value[key] !== 'boolean') fail('TYPE', 'body role flag must be boolean', `${path}.${key}`);
    }
    const roleCount = Number(value.bh) + Number(value.star) + Number(value.intr) + Number(value.field);
    if (roleCount < 1) fail('ROLE', 'body must have at least one physical role', path);
    if (value.bh && (value.star || value.intr || value.field)) fail('ROLE', 'BH role is exclusive', path);
    if (value.field && (value.bh || value.star || value.intr)) fail('ROLE', 'field role is exclusive', path);
    return { ...value };
  }

  function validateCreationProvenance(value, path) {
    const authority = SGRA.Domain && SGRA.Domain.CreationProvenance;
    if (authority) {
      try { return JSON.parse(JSON.stringify(authority.validate(value))); }
      catch (error) { fail('CREATION_PROVENANCE', error.message, path); }
    }
    if (!isRecord(value) || typeof value.kind !== 'string' || typeof value.constructedAt !== 'string') fail('CREATION_PROVENANCE', 'invalid creation provenance', path);
    const allowed = value.kind === 'QUALIFIED_SCI02_REFERENCE'
      ? ['kind', 'referenceId', 'referenceSourceSha256', 'descriptors', 'constructedAt']
      : value.kind === 'DECLARED_UNVALIDATED_ORBIT'
        ? ['kind', 'elements', 'generation', 'constructedAt']
        : value.kind === 'NONE_DRAG_LAUNCH' ? ['kind', 'constructedAt'] : null;
    if (!allowed) fail('CREATION_PROVENANCE', 'unknown creation provenance kind', path);
    exactKeys(value, new Set(allowed), path);
    if (value.kind === 'QUALIFIED_SCI02_REFERENCE') {
      if (typeof value.referenceId !== 'string' || !/^[a-z0-9_-]+$/i.test(value.referenceId) || typeof value.referenceSourceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.referenceSourceSha256) || !isRecord(value.descriptors)) fail('CREATION_PROVENANCE', 'invalid qualified reference provenance', path);
      exactKeys(value.descriptors, new Set(['chi', 'eccentricity', 'semiLatusRectumM', 'inclinationDeg']), `${path}.descriptors`);
      for (const key of Object.keys(value.descriptors)) finite(value.descriptors[key], `${path}.descriptors.${key}`);
      if (value.descriptors.chi < 0 || value.descriptors.chi > 1 || value.descriptors.eccentricity < 0 || value.descriptors.eccentricity >= 1 || value.descriptors.semiLatusRectumM <= 0 || value.descriptors.inclinationDeg < 0 || value.descriptors.inclinationDeg > 180) fail('CREATION_PROVENANCE', 'qualified descriptor range', path);
    }
    if (value.kind === 'DECLARED_UNVALIDATED_ORBIT') {
      if (!isRecord(value.elements) || !isRecord(value.generation)) fail('CREATION_PROVENANCE', 'invalid declared orbit provenance', path);
      exactKeys(value.elements, new Set(['aSemimajorAU', 'e', 'inclinationDeg', 'longitudeAscendingNodeDeg', 'argumentOfPeriapsisDeg', 'timeOfPeriapsis']), `${path}.elements`);
      for (const key of Object.keys(value.elements)) finite(value.elements[key], `${path}.elements.${key}`);
      if (value.elements.aSemimajorAU <= 0 || value.elements.e < 0 || value.elements.e >= 1 || value.elements.inclinationDeg < 0 || value.elements.inclinationDeg > 180) fail('CREATION_PROVENANCE', 'declared element range', path);
      if (value.generation.mode === 'MANUAL') exactKeys(value.generation, new Set(['mode']), `${path}.generation`);
      else if (value.generation.mode === 'SEEDED_RANDOM') { exactKeys(value.generation, new Set(['mode', 'seed', 'sequence']), `${path}.generation`); if (!Number.isInteger(value.generation.seed) || !Number.isInteger(value.generation.sequence)) fail('CREATION_PROVENANCE', 'invalid seeded generation', path); }
      else fail('CREATION_PROVENANCE', 'invalid generation mode', path);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeBody(value, path, expectBh, version) {
    if (!isRecord(value)) fail('TYPE', 'expected body record', path);
    const keys = version === 1 ? BODY_KEYS.filter(key => key !== 'creationProvenance') : BODY_KEYS;
    exactKeys(value, new Set(keys), path);
    const id = finite(value.id, `${path}.id`);
    if (!Number.isInteger(id) || id < 0) fail('BODY_ID', 'body ID must be a non-negative integer', `${path}.id`);
    const name = value.name == null ? null : string(value.name, `${path}.name`);
    const kind = string(value.kind, `${path}.kind`);
    if (!VALID_KINDS.has(kind)) fail('ROLE', `unsupported body kind '${kind}'`, `${path}.kind`);
    const bodyFlags = flags(value.flags, `${path}.flags`);
    if (expectBh !== undefined && bodyFlags.bh !== expectBh) fail('ROLE', 'BH role does not match its section', `${path}.flags.bh`);
    if (bodyFlags.captured !== !!value.captured) fail('CAPTURE_STATE', 'captured flag disagrees with body flags', path);
    if (typeof value.captured !== 'boolean') fail('TYPE', 'captured must be boolean', `${path}.captured`);
    const mass = finite(value.mass, `${path}.mass`);
    if (mass <= 0) fail('MASS', 'mass must be positive', `${path}.mass`);
    const record = {
      id,
      name,
      kind,
      flags: bodyFlags,
      mass,
      position: vector(value.position, `${path}.position`),
      velocity: vector(value.velocity, `${path}.velocity`),
      captured: !!value.captured
    };
    if (version === 2 && value.creationProvenance !== undefined) record.creationProvenance = validateCreationProvenance(value.creationProvenance, `${path}.creationProvenance`);
    return record;
  }

  function constantsFromRuntime(runtime) {
    const supplied = typeof runtime?.getConstants === 'function' ? runtime.getConstants() : runtime?.constants;
    const source = supplied || SGRA.Domain?.Constants;
    if (!source) fail('CONSTANTS', 'production constants are unavailable');
    return {
      G: finite(source.G, 'policy.constantsIdentity.G'),
      C_AUYR: finite(source.C_AUYR, 'policy.constantsIdentity.C_AUYR'),
      MBH_INIT: finite(source.MBH_INIT, 'policy.constantsIdentity.MBH_INIT'),
      C2: finite(source.C2, 'policy.constantsIdentity.C2'),
      DT_MIN: finite(source.DT_MIN, 'policy.constantsIdentity.DT_MIN'),
      DT_MAX: finite(source.DT_MAX, 'policy.constantsIdentity.DT_MAX'),
      DT_SAFETY_DYN: finite(source.DT_SAFETY_DYN, 'policy.constantsIdentity.DT_SAFETY_DYN'),
      DT_SAFETY_PN: finite(source.DT_SAFETY_PN, 'policy.constantsIdentity.DT_SAFETY_PN'),
      DT_PERI_STEPS: finite(source.DT_PERI_STEPS, 'policy.constantsIdentity.DT_PERI_STEPS')
    };
  }

  function getPhysics(runtime, constants) {
    const supplied = typeof runtime?.getPhysicsState === 'function' ? runtime.getPhysicsState() : (runtime?.physics || {});
    const spin = supplied.spin || {};
    const fidelity = supplied.physicsSelector || supplied.fidelityMode || 'newtonian';
    if (!VALID_FIDELITY.has(fidelity)) fail('PHYSICS_SELECTOR', `unsupported physics selector '${fidelity}'`, 'physics.physicsSelector');
    const composition = supplied.integratorComposition || 'plain';
    if (!VALID_COMPOSITIONS.has(composition)) fail('INTEGRATOR', `unsupported integrator '${composition}'`, 'physics.integratorComposition');
    const axis = vector(spin.axisWorld || SGRA.Domain?.Constants?.SPIN_AXIS_WORLD || [0, 0, 1], 'spin.axisWorld');
    const axisNorm = Math.hypot(...axis);
    if (!(axisNorm > 0)) fail('SPIN', 'spin axis must be nonzero', 'spin.axisWorld');
    const magnitude = spin.magnitude == null ? 0 : finite(spin.magnitude, 'spin.magnitude');
    if (magnitude < 0 || magnitude > 1) fail('SPIN', 'spin magnitude must be in [0,1]', 'spin.magnitude');
    const axisSign = spin.axisSign == null ? 1 : finite(spin.axisSign, 'spin.axisSign');
    if (axisSign !== 1 && axisSign !== -1) fail('SPIN', 'spin axis sign must be +1 or -1', 'spin.axisSign');
    return {
      physicsSelector: fidelity,
      integratorIdentity: supplied.integratorIdentity || 'LocalStepIntegrator.physicsStep',
      integratorComposition: composition,
      grOn: !!supplied.grOn,
      cuspOn: !!supplied.cuspOn,
      pnRamp: supplied.pnRamp == null ? 0 : finite(supplied.pnRamp, 'physics.pnRamp'),
      centralFramePinned: supplied.centralFramePinned == null ? true : !!supplied.centralFramePinned,
      constantsIdentity: constants,
      spin: { magnitude, axisWorld: axis, axisSign }
    };
  }

  function sourceSha(runtime) {
    const value = typeof runtime?.getSourceSha === 'function' ? runtime.getSourceSha() : runtime?.sourceSha;
    return string(value, 'provenance.sourceSha');
  }

  function bodyKind(body) {
    if (body.bh) return 'bh';
    if (body.intr) return 'intruder';
    if (body.field) return 'field';
    if (body.star) return 'sstar';
    return 'body';
  }

  function capture(runtime) {
    if (!runtime || typeof runtime.getBodies !== 'function' || typeof runtime.getSimTime !== 'function') {
      fail('RUNTIME', 'capture requires getBodies() and getSimTime()');
    }
    const bodies = runtime.getBodies();
    if (!Array.isArray(bodies) || bodies.length === 0) fail('BODIES', 'runtime has no bodies');
    const blackHole = bodies.filter(body => body && body.bh);
    if (blackHole.length !== 1) fail('BH', 'runtime must contain exactly one BH');
    const constants = constantsFromRuntime(runtime);
    const physics = getPhysics(runtime, constants);
    const simTime = finite(runtime.getSimTime(), 'provenance.simulationTime');
    const seen = new Set();
    const encode = (body, path, expectBh) => {
      if (!isRecord(body)) fail('TYPE', 'runtime body must be an object', path);
      const id = finite(body.id, `${path}.id`);
      if (!Number.isInteger(id) || id < 0 || seen.has(id)) fail('BODY_ID', 'runtime body IDs must be unique non-negative integers', `${path}.id`);
      seen.add(id);
      const record = {
        id,
        name: body.name == null ? null : String(body.name),
        kind: bodyKind(body),
        flags: { bh: !!body.bh, star: !!body.star, intr: !!body.intr, field: !!body.field, captured: !!body.captured },
        mass: finite(body.m, `${path}.m`),
        position: [finite(body.x, `${path}.x`), finite(body.y, `${path}.y`), finite(body.z, `${path}.z`)],
        velocity: [finite(body.vx, `${path}.vx`), finite(body.vy, `${path}.vy`), finite(body.vz, `${path}.vz`)],
        captured: !!body.captured
      };
      if (body.__creationProvenance) record.creationProvenance = JSON.parse(JSON.stringify(body.__creationProvenance));
      if (record.mass <= 0) fail('MASS', 'runtime mass must be positive', `${path}.m`);
      if (expectBh !== undefined && record.flags.bh !== expectBh) fail('BH', 'runtime BH role mismatch', path);
      return record;
    };
    const bh = encode(blackHole[0], 'blackHole', true);
    const otherBodies = bodies.filter(body => !body.bh).map((body, i) => encode(body, `bodies[${i}]`, false));
    const maxId = Math.max(...[bh, ...otherBodies].map(body => body.id));
    const nextBodyId = runtime.getNextBodyId == null ? maxId + 1 : finite(runtime.getNextBodyId(), 'snapshot.nextBodyId');
    if (!Number.isInteger(nextBodyId) || nextBodyId <= maxId) fail('BODY_ID', 'next body ID must exceed all restored IDs', 'snapshot.nextBodyId');
    return {
      schema: SCHEMA,
      schemaVersion: SCHEMA_VERSION,
      provenance: {
        sourceSha: sourceSha(runtime),
        capturedAt: new Date().toISOString(),
        simulationTime: simTime
      },
      units: { length: 'AU', time: 'yr', mass: 'Msun', velocity: 'AU/yr' },
      policy: physics,
      blackHole: bh,
      bodies: otherBodies,
      nextBodyId
    };
  }

  function validate(input, options = {}) {
    try {
      if (!isRecord(input)) fail('TYPE', 'snapshot must be an object');
      rejectForbidden(input);
      exactKeys(input, new Set(['schema', 'schemaVersion', 'provenance', 'units', 'policy', 'blackHole', 'bodies', 'nextBodyId']), '$');
      if (input.schema !== SCHEMA) fail('SCHEMA', `unsupported schema '${input.schema}'`, 'schema');
      if (input.schemaVersion !== 1 && input.schemaVersion !== SCHEMA_VERSION) fail('SCHEMA_VERSION', `unsupported schema version '${input.schemaVersion}'`, 'schemaVersion');
      if (!isRecord(input.provenance)) fail('TYPE', 'provenance is required', 'provenance');
      exactKeys(input.provenance, new Set(['sourceSha', 'capturedAt', 'simulationTime']), 'provenance');
      string(input.provenance.sourceSha, 'provenance.sourceSha');
      string(input.provenance.capturedAt, 'provenance.capturedAt');
      finite(input.provenance.simulationTime, 'provenance.simulationTime');
      if (!isRecord(input.units)) fail('TYPE', 'units are required', 'units');
      exactKeys(input.units, new Set(['length', 'time', 'mass', 'velocity']), 'units');
      if (input.units.length !== 'AU' || input.units.time !== 'yr' || input.units.mass !== 'Msun' || input.units.velocity !== 'AU/yr') fail('UNITS', 'snapshot units do not match production AU/yr convention', 'units');
      if (!isRecord(input.policy)) fail('TYPE', 'policy is required', 'policy');
      exactKeys(input.policy, new Set(['physicsSelector', 'integratorIdentity', 'integratorComposition', 'grOn', 'cuspOn', 'pnRamp', 'centralFramePinned', 'constantsIdentity', 'spin']), 'policy');
      if (!VALID_FIDELITY.has(input.policy.physicsSelector)) fail('PHYSICS_SELECTOR', 'invalid physics selector', 'policy.physicsSelector');
      string(input.policy.integratorIdentity, 'policy.integratorIdentity');
      if (!VALID_COMPOSITIONS.has(input.policy.integratorComposition)) fail('INTEGRATOR', 'invalid integrator composition', 'policy.integratorComposition');
      for (const key of ['grOn', 'cuspOn', 'centralFramePinned']) if (typeof input.policy[key] !== 'boolean') fail('TYPE', `${key} must be boolean`, `policy.${key}`);
      finite(input.policy.pnRamp, 'policy.pnRamp');
      if (input.policy.pnRamp < 0 || input.policy.pnRamp > 1) fail('POLICY', 'pnRamp must be in [0,1]', 'policy.pnRamp');
      const constants = input.policy.constantsIdentity;
      if (!isRecord(constants)) fail('CONSTANTS', 'constants identity is required', 'policy.constantsIdentity');
      exactKeys(constants, new Set(['G', 'C_AUYR', 'MBH_INIT', 'C2', 'DT_MIN', 'DT_MAX', 'DT_SAFETY_DYN', 'DT_SAFETY_PN', 'DT_PERI_STEPS']), 'policy.constantsIdentity');
      for (const key of Object.keys(constants)) finite(constants[key], `policy.constantsIdentity.${key}`);
      const expected = options.expectedConstants;
      if (expected) for (const key of Object.keys(constants)) if (constants[key] !== expected[key]) fail('INCOMPATIBLE_CONSTANTS', `constant '${key}' differs from current production authority`, `policy.constantsIdentity.${key}`);
      const spin = input.policy.spin;
      if (!isRecord(spin)) fail('SPIN', 'spin identity is required', 'policy.spin');
      exactKeys(spin, new Set(['magnitude', 'axisWorld', 'axisSign']), 'policy.spin');
      finite(spin.magnitude, 'policy.spin.magnitude');
      if (spin.magnitude < 0 || spin.magnitude > 1) fail('SPIN', 'spin magnitude must be in [0,1]', 'policy.spin.magnitude');
      vector(spin.axisWorld, 'policy.spin.axisWorld');
      if (Math.hypot(...spin.axisWorld) <= 0) fail('SPIN', 'spin axis must be nonzero', 'policy.spin.axisWorld');
      if (spin.axisSign !== 1 && spin.axisSign !== -1) fail('SPIN', 'spin axis sign must be +1 or -1', 'policy.spin.axisSign');
      const bh = normalizeBody(input.blackHole, 'blackHole', true, input.schemaVersion);
      if (!Array.isArray(input.bodies)) fail('BODIES', 'bodies must be an array', 'bodies');
      const bodies = input.bodies.map((body, i) => normalizeBody(body, `bodies[${i}]`, false, input.schemaVersion));
      const all = [bh, ...bodies];
      const ids = new Set();
      for (const body of all) {
        if (ids.has(body.id)) fail('BODY_ID', 'duplicate body ID', `body(${body.id})`);
        ids.add(body.id);
      }
      const nextBodyId = finite(input.nextBodyId, 'nextBodyId');
      if (!Number.isInteger(nextBodyId) || nextBodyId <= Math.max(...ids)) fail('BODY_ID', 'next body ID must exceed all body IDs', 'nextBodyId');
      if (bodies.some(body => body.captured)) fail('CAPTURE_STATE', 'captured bodies must be represented by removal/event history, not live bodies', 'bodies');
      if (options.expectedPhysicsSelector && input.policy.physicsSelector !== options.expectedPhysicsSelector) fail('INCOMPATIBLE_POLICY', 'physics selector differs from current runtime', 'policy.physicsSelector');
      return { ok: true, value: JSON.parse(JSON.stringify(input)) };
    } catch (error) {
      const e = error instanceof EncounterError ? error : new EncounterError('VALIDATION', error.message);
      return { ok: false, error: { code: e.code, message: e.message, path: e.path } };
    }
  }

  function serialize(snapshot, options) {
    const checked = validate(snapshot, options);
    if (!checked.ok) throw new EncounterError(checked.error.code, checked.error.message, checked.error.path);
    return JSON.stringify(checked.value);
  }

  function parse(text, options) {
    if (typeof text !== 'string') return { ok: false, error: { code: 'TYPE', message: 'serialized snapshot must be text', path: null } };
    try {
      return validate(JSON.parse(text), options);
    } catch (error) {
      return { ok: false, error: { code: 'JSON', message: 'invalid JSON snapshot', path: null } };
    }
  }

  function load(input, runtime, options = {}) {
    const checked = typeof input === 'string' ? parse(input, options) : validate(input, options);
    if (!checked.ok) return checked;
    if (!runtime || typeof runtime.stage !== 'function' || typeof runtime.rebuild !== 'function' || typeof runtime.commit !== 'function') {
      return { ok: false, error: { code: 'RUNTIME', message: 'load requires stage(), rebuild(), and commit() transaction hooks', path: null } };
    }
    try {
      const staged = runtime.stage(checked.value);
      if (!staged) fail('RUNTIME', 'stage() returned no staged runtime');
      runtime.rebuild(staged, checked.value);
      const restoredBodies = staged?.bodies || staged?.run?.bodies || (typeof runtime.getStagedBodies === 'function' ? runtime.getStagedBodies(staged) : null);
      if (Array.isArray(restoredBodies)) {
        const records = [checked.value.blackHole, ...checked.value.bodies];
        const byId = new Map(records.map(record => [record.id, record]));
        for (const body of restoredBodies) {
          const record = byId.get(body?.id);
          if (record?.creationProvenance) {
            const authority = SGRA.Domain && SGRA.Domain.CreationProvenance;
            body.__creationProvenance = authority ? authority.freeze(record.creationProvenance) : Object.freeze(record.creationProvenance);
          }
        }
      }
      if (typeof runtime.validateStaged === 'function') runtime.validateStaged(staged, checked.value);
      runtime.commit(staged, checked.value);
      return { ok: true, snapshot: checked.value };
    } catch (error) {
      const e = error instanceof EncounterError ? error : new EncounterError('LOAD', error.message);
      return { ok: false, error: { code: e.code, message: e.message, path: e.path } };
    }
  }

  const api = Object.freeze({ SCHEMA, SCHEMA_VERSION, BODY_KEYS, EncounterError, capture, validate, serialize, parse, load });
  SGRA.Encounter.EncounterSnapshot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
