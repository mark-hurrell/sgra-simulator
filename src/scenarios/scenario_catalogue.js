// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachScenarioCatalogue(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Scenarios = SGRA.Scenarios || {};
  const SCHEMA_VERSION = 1;
  const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1, 2]);
  const SCENARIO_SCHEMA_VERSIONS = Object.freeze([1, 2]);
  const PHYSICS_MODES = Object.freeze(['newtonian', '1pn', 'adaptive_kerr']);
  const SCENE_CONTEXTS = Object.freeze(['explore', 'sandbox']);
  const KINDS = Object.freeze(['initial-condition', 'canonical-state']);
  const CAMERA_PRESETS = Object.freeze(['free', 'selected-body-follow', 'explicit-intruder-group-follow']);
  const CATALOGUE_KEYS_V1 = new Set(['schemaVersion', 'provenance', 'scenarios']);
  const CATALOGUE_KEYS_V2 = new Set(['schemaVersion', 'provenance', 'scenarios', 'intruderPresets']);
  const SCENARIO_KEYS = new Set(['schemaVersion', 'id', 'title', 'shortDescription', 'accessibilityDescription', 'sceneContext', 'kind', 'physicsMode', 'centralSpin', 'intruders', 'camera', 'provenance', 'state', 'presentation']);
  const SPIN_KEYS = new Set(['magnitude', 'axisSign']);
  const INTRUDER_KEYS = new Set(['id', 'mass', 'p0Rel', 'p1Rel', 'launchMappingVersion']);
  const CAMERA_KEYS = new Set(['preset', 'bodyId', 'memberIds']);
  const PROVENANCE_KEYS = new Set(['source', 'version', 'sourceSha256', 'conversion']);
  const PRESET_KEYS = new Set(['id', 'title', 'description', 'kind', 'massSolarMasses', 'p0Rel', 'p1Rel', 'launchMappingVersion', 'provenance']);
  const STATE_KEYS = new Set(['epoch', 'simTime', 'bodies', 'runtime']);
  const BODY_STATE_KEYS = new Set(['id', 'name', 'role', 'mass', 'position', 'velocity', 'captured', 'ownership']);
  const RUNTIME_STATE_KEYS = new Set(['requestedFidelity', 'integrator', 'tier']);
  const INTEGRATOR_STATE_KEYS = new Set(['requested', 'active', 'pending']);
  const OWNERSHIP_KEYS = new Set(['owner', 'classifier']);
  const PRESENTATION_KEYS = new Set(['selectedBodyId', 'groupMemberIds', 'groupActive']);
  const BODY_ROLES = Object.freeze(['bh', 'star', 'field', 'intruder']);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
  const safeText = (value, path) => {
    if (!nonEmptyString(value)) reject(path, 'must be a non-empty string');
    if (/(?:<\/?script\b|javascript:|data:text\/html|\bon\w+\s*=|\bfunction\s*\(|=>)/i.test(value)) reject(path, 'must not contain executable-looking content');
  };

  function reject(path, message) { throw new Error(`${path}: ${message}`); }
  function exactKeys(object, allowed, path) {
    for (const key of Object.keys(object)) if (!allowed.has(key)) reject(`${path}.${key}`, 'unknown key');
  }
  function required(object, keys, path) {
    for (const key of keys) if (!own(object, key)) reject(`${path}.${key}`, 'required');
  }
  function vector(value, path) {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(finite)) reject(path, 'must be an array of three finite numbers');
  }
  function provenance(value, path) {
    if (!isObject(value)) reject(path, 'must be an object');
    exactKeys(value, PROVENANCE_KEYS, path); required(value, ['source', 'version'], path);
    if (!nonEmptyString(value.source) || !nonEmptyString(value.version)) reject(path, 'source and version must be non-empty strings');
    if (own(value, 'sourceSha256') && !/^[a-f0-9]{64}$/i.test(value.sourceSha256)) reject(`${path}.sourceSha256`, 'must be a SHA-256 hex digest');
    if (own(value, 'conversion') && !nonEmptyString(value.conversion)) reject(`${path}.conversion`, 'must be a non-empty string');
  }

  function validateScenario(value, options = {}, index = 0) {
    const path = `scenarios[${index}]`;
    if (!isObject(value)) reject(path, 'must be an object');
    exactKeys(value, SCENARIO_KEYS, path);
    required(value, ['schemaVersion', 'id', 'title', 'shortDescription', 'accessibilityDescription', 'sceneContext', 'kind', 'physicsMode', 'centralSpin', 'intruders', 'provenance'], path);
    if (!SCENARIO_SCHEMA_VERSIONS.includes(value.schemaVersion)) reject(`${path}.schemaVersion`, 'unsupported scenario schema version');
    if (value.schemaVersion === 1 && (own(value, 'state') || own(value, 'presentation'))) reject(`${path}`, 'canonical state fields require scenario schema version 2');
    if (value.schemaVersion === 2 && value.kind !== 'canonical-state') reject(`${path}.kind`, 'canonical scenarios must use kind canonical-state');
    for (const key of ['id', 'title', 'shortDescription', 'accessibilityDescription']) if (!nonEmptyString(value[key])) reject(`${path}.${key}`, 'must be a non-empty string');
    if (!SCENE_CONTEXTS.includes(value.sceneContext)) reject(`${path}.sceneContext`, 'unsupported scene context');
    if (!KINDS.includes(value.kind)) reject(`${path}.kind`, 'unsupported scenario kind');
    if (!PHYSICS_MODES.includes(value.physicsMode)) reject(`${path}.physicsMode`, 'unsupported physics mode');
    if (!isObject(value.centralSpin)) reject(`${path}.centralSpin`, 'must be an object');
    exactKeys(value.centralSpin, SPIN_KEYS, `${path}.centralSpin`); required(value.centralSpin, ['magnitude', 'axisSign'], `${path}.centralSpin`);
    if (!finite(value.centralSpin.magnitude) || value.centralSpin.magnitude < 0 || value.centralSpin.magnitude > 1) reject(`${path}.centralSpin.magnitude`, 'must be finite and in [0, 1]');
    if (value.centralSpin.axisSign !== 1 && value.centralSpin.axisSign !== -1) reject(`${path}.centralSpin.axisSign`, 'must be exactly 1 or -1');
    if (!Array.isArray(value.intruders)) reject(`${path}.intruders`, 'must be an array');
    const intruderIds = new Set();
    value.intruders.forEach((intruder, intruderIndex) => {
      const intruderPath = `${path}.intruders[${intruderIndex}]`;
      if (!isObject(intruder)) reject(intruderPath, 'must be an object');
      exactKeys(intruder, INTRUDER_KEYS, intruderPath); required(intruder, ['id', 'mass', 'p0Rel', 'p1Rel', 'launchMappingVersion'], intruderPath);
      if (!nonEmptyString(intruder.id)) reject(`${intruderPath}.id`, 'must be a non-empty string');
      if (intruderIds.has(intruder.id)) reject(`${intruderPath}.id`, 'duplicate intruder ID');
      intruderIds.add(intruder.id);
      if (!finite(intruder.mass) || intruder.mass < 0.001 || intruder.mass > 100000) reject(`${intruderPath}.mass`, 'must be finite and in [0.001, 100000]');
      vector(intruder.p0Rel, `${intruderPath}.p0Rel`); vector(intruder.p1Rel, `${intruderPath}.p1Rel`);
      if (!nonEmptyString(intruder.launchMappingVersion)) reject(`${intruderPath}.launchMappingVersion`, 'must be a non-empty string');
    });
    if (value.schemaVersion === 2) validateFullState(value, path, options);
    if (value.camera !== undefined) {
      if (!isObject(value.camera)) reject(`${path}.camera`, 'must be an object');
      exactKeys(value.camera, CAMERA_KEYS, `${path}.camera`); required(value.camera, ['preset'], `${path}.camera`);
      if (!CAMERA_PRESETS.includes(value.camera.preset)) reject(`${path}.camera.preset`, 'unsupported camera preset');
      if (value.camera.preset === 'selected-body-follow') {
        if (!nonEmptyString(value.camera.bodyId)) reject(`${path}.camera.bodyId`, 'required for selected-body-follow');
        const known = new Set(options.knownExploreBodyIds || []);
        if (!intruderIds.has(value.camera.bodyId) && !known.has(value.camera.bodyId)) reject(`${path}.camera.bodyId`, 'unknown body reference');
      } else if (value.camera.preset === 'explicit-intruder-group-follow') {
        if (!Array.isArray(value.camera.memberIds) || value.camera.memberIds.length === 0 || !value.camera.memberIds.every(nonEmptyString)) reject(`${path}.camera.memberIds`, 'must contain one or more intruder IDs');
        const seen = new Set();
        for (const memberId of value.camera.memberIds) {
          if (seen.has(memberId) || !intruderIds.has(memberId)) reject(`${path}.camera.memberIds`, 'contains duplicate or unknown intruder reference');
          seen.add(memberId);
        }
      } else if (own(value.camera, 'bodyId') || own(value.camera, 'memberIds')) reject(`${path}.camera`, 'free preset cannot contain body references');
    }
    provenance(value.provenance, `${path}.provenance`);
    return value;
  }

  function validateFullState(value, path, options = {}) {
    if (!isObject(value.state)) reject(`${path}.state`, 'required for canonical full-state scenarios');
    exactKeys(value.state, STATE_KEYS, `${path}.state`); required(value.state, ['epoch', 'simTime', 'bodies', 'runtime'], `${path}.state`);
    if (!finite(value.state.epoch) || !finite(value.state.simTime)) reject(`${path}.state`, 'epoch and simTime must be finite');
    if (!Array.isArray(value.state.bodies) || value.state.bodies.length === 0) reject(`${path}.state.bodies`, 'must be a non-empty array');
    const ids = new Set();
    let blackHoleCount = 0;
    value.state.bodies.forEach((body, index) => {
      const bodyPath = `${path}.state.bodies[${index}]`;
      if (!isObject(body)) reject(bodyPath, 'must be an object');
      exactKeys(body, BODY_STATE_KEYS, bodyPath); required(body, ['id', 'name', 'role', 'mass', 'position', 'velocity', 'captured', 'ownership'], bodyPath);
      if (!Number.isInteger(body.id) || body.id < 0 || ids.has(body.id)) reject(`${bodyPath}.id`, 'must be a unique non-negative integer');
      ids.add(body.id);
      if (!nonEmptyString(body.name) && body.name !== null) reject(`${bodyPath}.name`, 'must be a string or null');
      if (!BODY_ROLES.includes(body.role)) reject(`${bodyPath}.role`, 'unsupported body role');
      if (body.role === 'bh') blackHoleCount += 1;
      if (!finite(body.mass) || body.mass <= 0) reject(`${bodyPath}.mass`, 'must be a positive finite number');
      vector(body.position, `${bodyPath}.position`); vector(body.velocity, `${bodyPath}.velocity`);
      if (typeof body.captured !== 'boolean') reject(`${bodyPath}.captured`, 'must be boolean');
      if (body.ownership !== null) {
        if (!isObject(body.ownership)) reject(`${bodyPath}.ownership`, 'must be an object or null');
        exactKeys(body.ownership, OWNERSHIP_KEYS, `${bodyPath}.ownership`);
        for (const key of ['owner', 'classifier']) if (body.ownership[key] !== null && !nonEmptyString(body.ownership[key])) reject(`${bodyPath}.ownership.${key}`, 'must be a string or null');
      }
    });
    if (blackHoleCount !== 1) reject(`${path}.state.bodies`, 'must contain exactly one black-hole body');
    if (value.state.bodies[0].role !== 'bh') reject(`${path}.state.bodies[0]`, 'V1 invariant: the black-hole body must be first (index 0)');
    if (!isObject(value.state.runtime)) reject(`${path}.state.runtime`, 'must be an object');
    exactKeys(value.state.runtime, RUNTIME_STATE_KEYS, `${path}.state.runtime`); required(value.state.runtime, ['requestedFidelity', 'integrator', 'tier'], `${path}.state.runtime`);
    if (!PHYSICS_MODES.includes(value.state.runtime.requestedFidelity)) reject(`${path}.state.runtime.requestedFidelity`, 'unsupported physics mode');
    if (!isObject(value.state.runtime.integrator)) reject(`${path}.state.runtime.integrator`, 'must be an object');
    exactKeys(value.state.runtime.integrator, INTEGRATOR_STATE_KEYS, `${path}.state.runtime.integrator`);
    for (const key of ['requested', 'active', 'pending']) if (value.state.runtime.integrator[key] !== null && !nonEmptyString(value.state.runtime.integrator[key])) reject(`${path}.state.runtime.integrator.${key}`, 'must be a string or null');
    if (!Number.isInteger(value.state.runtime.tier) || value.state.runtime.tier < 0 || (Number.isInteger(options.maxTier) && value.state.runtime.tier > options.maxTier)) reject(`${path}.state.runtime.tier`, 'must be an integer in the supported quality-tier range');
    if (!isObject(value.presentation)) reject(`${path}.presentation`, 'required for canonical full-state scenarios');
    exactKeys(value.presentation, PRESENTATION_KEYS, `${path}.presentation`); required(value.presentation, ['selectedBodyId', 'groupMemberIds', 'groupActive'], `${path}.presentation`);
    if (value.presentation.selectedBodyId !== null && (!Number.isInteger(value.presentation.selectedBodyId) || !ids.has(value.presentation.selectedBodyId))) reject(`${path}.presentation.selectedBodyId`, 'must reference a stored body or be null');
    if (!Array.isArray(value.presentation.groupMemberIds) || !value.presentation.groupMemberIds.every(id => Number.isInteger(id) && ids.has(id) && value.state.bodies.find(body => body.id === id)?.role === 'intruder')) reject(`${path}.presentation.groupMemberIds`, 'must contain stored intruder body IDs');
    if (new Set(value.presentation.groupMemberIds).size !== value.presentation.groupMemberIds.length) reject(`${path}.presentation.groupMemberIds`, 'must not contain duplicates');
    if (typeof value.presentation.groupActive !== 'boolean') reject(`${path}.presentation.groupActive`, 'must be boolean');
  }

  function validatePreset(value, index = 0) {
    const path = `intruderPresets[${index}]`;
    if (!isObject(value)) reject(path, 'must be an object');
    exactKeys(value, PRESET_KEYS, path);
    required(value, ['id', 'title', 'description', 'kind', 'massSolarMasses', 'p0Rel', 'p1Rel', 'launchMappingVersion', 'provenance'], path);
    for (const key of ['id', 'title', 'description', 'launchMappingVersion']) safeText(value[key], `${path}.${key}`);
    if (value.kind !== 'intruderPreset') reject(`${path}.kind`, 'must be intruderPreset');
    if (!finite(value.massSolarMasses) || value.massSolarMasses < 0.001 || value.massSolarMasses > 100000) reject(`${path}.massSolarMasses`, 'must be finite and in [0.001, 100000]');
    vector(value.p0Rel, `${path}.p0Rel`); vector(value.p1Rel, `${path}.p1Rel`);
    provenance(value.provenance, `${path}.provenance`);
    return value;
  }

  function validateCatalogue(value, options = {}) {
    if (!isObject(value)) reject('catalogue', 'must be an object');
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(value.schemaVersion)) reject('catalogue.schemaVersion', 'unsupported schema version; expected 1 or 2');
    exactKeys(value, value.schemaVersion === 2 ? CATALOGUE_KEYS_V2 : CATALOGUE_KEYS_V1, 'catalogue'); required(value, ['schemaVersion', 'provenance', 'scenarios'], 'catalogue');
    provenance(value.provenance, 'catalogue.provenance');
    if (!Array.isArray(value.scenarios) || value.scenarios.length === 0) reject('catalogue.scenarios', 'must be a non-empty array');
    const ids = new Set();
    const scenarios = value.scenarios.map((scenario, index) => {
      validateScenario(scenario, options, index);
      if (ids.has(scenario.id)) reject(`scenarios[${index}].id`, 'duplicate scenario ID');
      ids.add(scenario.id);
      return scenario;
    });
    const presets = value.schemaVersion === 2 ? value.intruderPresets : [];
    if (value.schemaVersion === 2 && !Array.isArray(presets)) reject('catalogue.intruderPresets', 'must be an array');
    const presetIds = new Set();
    const intruderPresets = presets.map((preset, index) => {
      validatePreset(preset, index);
      if (presetIds.has(preset.id)) reject(`intruderPresets[${index}].id`, 'duplicate preset ID');
      presetIds.add(preset.id);
      return preset;
    });
    return Object.freeze({ schemaVersion: value.schemaVersion, provenance: Object.freeze({ ...value.provenance }), scenarios: Object.freeze(scenarios.map(scenario => Object.freeze({ ...scenario }))), intruderPresets: Object.freeze(intruderPresets.map(preset => Object.freeze({ ...preset }))) });
  }

  SGRA.Scenarios.Catalogue = Object.freeze({ SCHEMA_VERSION, SCENARIO_SCHEMA_VERSIONS, SUPPORTED_SCHEMA_VERSIONS, PHYSICS_MODES, SCENE_CONTEXTS, KINDS, CAMERA_PRESETS, BODY_ROLES, validateCatalogue });
})(typeof window !== 'undefined' ? window : globalThis);
