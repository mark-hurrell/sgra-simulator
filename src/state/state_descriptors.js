// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachStateDescriptors(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  // SGRA-SPEC-001 B-3B §5 — shared descriptor contract WITHOUT a universal store.
  //
  // This module validates descriptor shape and enforces cross-owner key
  // uniqueness. It deliberately does NOT hold any values. Each owner
  // (SimulationOptions, ActivationState, DisplayOptions, BlackHoleModelState,
  // CameraViewState) remains a separate module with its own closure state and
  // its own public API. There is no universal mutable options bag, and adding
  // one later would require deleting this comment first.
  //
  // The API is explicit function calls with explicit key strings. Dynamically
  // generated English method names are not the API.

  const OWNERS = Object.freeze([
    'SimulationOptions',
    'ActivationState',
    'DisplayOptions',
    'BlackHoleModelState',
    'CameraViewState'
  ]);

  const TYPES = Object.freeze(['boolean', 'number', 'integer', 'string', 'enum', 'object']);

  const PERSISTENCE = Object.freeze([
    'not-persisted-yet',   // declared, deliberately not written anywhere
    'session-only',
    'persisted'
  ]);

  const DIAGNOSTIC = Object.freeze([
    'included',            // serialised into the diagnostic export
    'excluded'
  ]);

  const ACTIVATION_KIND = Object.freeze([
    'immediate',              // takes effect on the next frame
    'reset-only',             // requires an explicit reset/restart
    'transitional',           // ramps over time
    'future-feature-inactive' // declared, nothing reads it yet
  ]);

  const RESET_POLICY = Object.freeze([
    'reset-to-default',
    'preserved-across-reset'
  ]);

  const REQUIRED_FIELDS = Object.freeze([
    'key', 'owner', 'type', 'default', 'persistence',
    'diagnostic', 'reset', 'controlBindingIds', 'activationKind', 'schemaVersion'
  ]);

  function fail(message) {
    throw new Error('state descriptor contract violation: ' + message);
  }

  function deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const k of Object.keys(value)) deepFreeze(value[k]);
    if (Array.isArray(value)) for (let i = 0; i < value.length; i++) deepFreeze(value[i]);
    return value;
  }

  function checkType(descriptor, value) {
    switch (descriptor.type) {
      case 'boolean': return typeof value === 'boolean';
      case 'number': return typeof value === 'number' && Number.isFinite(value);
      case 'integer': return Number.isInteger(value);
      case 'string': return typeof value === 'string';
      case 'enum': return descriptor.allowedValues.indexOf(value) >= 0;
      case 'object':
        // A nullable object key (e.g. "no selection yet") is legitimate. It is
        // only accepted when the descriptor's own validator explicitly allows
        // null; that keeps a bare 'object' type from silently becoming 'any'.
        if (value === null) return typeof descriptor.validate === 'function' && descriptor.validate(null);
        return value !== null && typeof value === 'object';
      default: return false;
    }
  }

  function defineDescriptor(spec) {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in spec)) fail(`missing mandatory field '${field}' on '${spec.key || '(no key)'}'`);
    }
    if (typeof spec.key !== 'string' || !spec.key) fail('key must be a non-empty string');
    if (OWNERS.indexOf(spec.owner) < 0) fail(`unknown owner '${spec.owner}' for key '${spec.key}'`);
    if (TYPES.indexOf(spec.type) < 0) fail(`unknown type '${spec.type}' for key '${spec.key}'`);
    if (PERSISTENCE.indexOf(spec.persistence) < 0) fail(`unknown persistence '${spec.persistence}' for key '${spec.key}'`);
    if (DIAGNOSTIC.indexOf(spec.diagnostic) < 0) fail(`unknown diagnostic policy '${spec.diagnostic}' for key '${spec.key}'`);
    if (RESET_POLICY.indexOf(spec.reset) < 0) fail(`unknown reset policy '${spec.reset}' for key '${spec.key}'`);
    if (ACTIVATION_KIND.indexOf(spec.activationKind) < 0) fail(`unknown activation kind '${spec.activationKind}' for key '${spec.key}'`);
    if (!Array.isArray(spec.controlBindingIds)) fail(`controlBindingIds must be an array for key '${spec.key}'`);
    if (!Number.isInteger(spec.schemaVersion) || spec.schemaVersion < 1) fail(`schemaVersion must be a positive integer for key '${spec.key}'`);
    if (spec.type === 'enum' && !Array.isArray(spec.allowedValues)) fail(`enum key '${spec.key}' requires allowedValues`);
    if (spec.validate !== undefined && typeof spec.validate !== 'function') fail(`validate must be a function for key '${spec.key}'`);

    const descriptor = {
      key: spec.key,
      owner: spec.owner,
      type: spec.type,
      default: spec.default,
      allowedValues: spec.allowedValues ? Object.freeze([...spec.allowedValues]) : null,
      validate: spec.validate || null,
      persistence: spec.persistence,
      diagnostic: spec.diagnostic,
      reset: spec.reset,
      controlBindingIds: Object.freeze([...spec.controlBindingIds]),
      activationKind: spec.activationKind,
      schemaVersion: spec.schemaVersion,
      trueOwner: spec.trueOwner || spec.owner,
      note: spec.note || null
    };

    if (!checkType(descriptor, descriptor.default)) {
      fail(`default value for '${descriptor.key}' does not satisfy its declared type '${descriptor.type}'`);
    }
    if (descriptor.validate && !descriptor.validate(descriptor.default)) {
      fail(`default value for '${descriptor.key}' fails its own validator`);
    }
    return deepFreeze(descriptor);
  }

  function isValidValue(descriptor, value) {
    if (!checkType(descriptor, value)) return false;
    if (descriptor.validate && !descriptor.validate(value)) return false;
    return true;
  }

  // Cross-owner uniqueness. Registering the same key twice — from any owner —
  // throws. This is the mechanically executable owner-key uniqueness gate.
  function createOwnerKeyRegistry() {
    const byKey = new Map();

    function register(owner, descriptors) {
      if (OWNERS.indexOf(owner) < 0) fail(`unknown owner '${owner}'`);
      const map = new Map();
      for (const descriptor of descriptors) {
        if (descriptor.owner !== owner) {
          fail(`descriptor '${descriptor.key}' declares owner '${descriptor.owner}' but was registered under '${owner}'`);
        }
        if (byKey.has(descriptor.key)) {
          fail(`key '${descriptor.key}' is already owned by '${byKey.get(descriptor.key).owner}'; ` +
            `'${owner}' may not also own it`);
        }
        byKey.set(descriptor.key, descriptor);
        map.set(descriptor.key, descriptor);
      }
      return Object.freeze({
        owner,
        keys: Object.freeze([...map.keys()]),
        get: key => map.get(key) || null,
        has: key => map.has(key),
        all: () => Object.freeze([...map.values()])
      });
    }

    function get(key) { return byKey.get(key) || null; }
    function keys() { return Object.freeze([...byKey.keys()]); }
    function all() { return Object.freeze([...byKey.values()]); }
    function ownerOf(key) { const d = byKey.get(key); return d ? d.owner : null; }
    function trueOwnerOf(key) { const d = byKey.get(key); return d ? d.trueOwner : null; }

    function toOwnerKeyMap() {
      const out = {};
      for (const d of byKey.values()) {
        out[d.key] = {
          owner: d.owner,
          trueOwner: d.trueOwner,
          type: d.type,
          default: d.default,
          allowedValues: d.allowedValues,
          persistence: d.persistence,
          diagnostic: d.diagnostic,
          reset: d.reset,
          controlBindingIds: d.controlBindingIds,
          activationKind: d.activationKind,
          schemaVersion: d.schemaVersion,
          note: d.note
        };
      }
      return out;
    }

    return Object.freeze({ register, get, keys, all, ownerOf, trueOwnerOf, toOwnerKeyMap });
  }

  // The single process-wide registry the five owners register into at load time.
  const registry = createOwnerKeyRegistry();

  SGRA.State.StateDescriptors = Object.freeze({
    OWNERS,
    TYPES,
    PERSISTENCE,
    DIAGNOSTIC,
    ACTIVATION_KIND,
    RESET_POLICY,
    REQUIRED_FIELDS,
    defineDescriptor,
    isValidValue,
    deepFreeze,
    createOwnerKeyRegistry,
    registry
  });
})(typeof window !== 'undefined' ? window : globalThis);
