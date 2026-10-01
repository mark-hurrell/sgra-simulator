// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachBlackHoleModelState(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  const D = SGRA.State.StateDescriptors;
  const Catalogue = SGRA.State.HypothesisCatalogue;

  // SGRA-SPEC-001 B-3B §9 — BlackHoleModelState.
  //
  // NOTHING IN src/physics READS THIS MODULE, and that static rule still
  // holds: tests/b3b_state_ownership.test.mjs asserts no physics source
  // references BlackHoleModelState by name.
  //
  // CHANGED (central-spin tranche): `spinMagnitude` is no longer inert. It is
  // now the SOLE RUNTIME AUTHORITY for the dimensionless spin a* consumed by
  // the 1.5PN Lense-Thirring term AND by the frame-dragging mesh. The physics
  // never imports this module: the host (sgra_sim.html) reads spinMagnitude
  // and injects it through the explicit physics spin port and the
  // prediction deps, so ownership stays here and the no-direct-reference rule
  // stays intact. There is exactly one a* in the system; the render-only
  // `spinMeshSpin: 0.65` constant that used to shadow it is retired.
  //
  // Default remains the non-spinning reference (a* = 0), which makes no
  // observational claim AND preserves the validated Schwarzschild baseline
  // bit-for-bit.
  //
  // Orientation is still `unselected` because no source-backed values exist;
  // see hypothesis_catalogue.js and the ORIENTATION_DATA_PENDING finding. The
  // spin AXIS is deliberately NOT state: it is one frozen illustrative
  // constant (Constants.SPIN_AXIS_WORLD) shared by physics, mesh and disc.
  // Configurable orientation is a separate, unbuilt feature.

  const SCHEMA_VERSION = 1;
  const DEFAULT_SPIN_PRESET = 'non-spinning-reference';
  const DEFAULT_FLOW_FAMILY = 'unselected';
  const DEFAULT_FLOW_VARIANT = 'unselected';

  const SPIN_PRESET_IDS = Object.freeze(Catalogue.SPIN_PRESETS.map(p => p.preset_id));
  const FLOW_FAMILY_IDS = Object.freeze(Catalogue.ORIENTATION_FAMILIES.map(f => f.family_id));
  const FLOW_VARIANT_IDS = Object.freeze(
    Catalogue.ORIENTATION_FAMILIES.reduce((acc, f) => acc.concat(f.variants.map(v => v.variant_id)), [])
      .filter((v, i, arr) => arr.indexOf(v) === i)
  );
  const AXIS_SOURCES = Object.freeze(['aligned-to-flow', 'custom']);

  const DESCRIPTORS = Object.freeze([
    D.defineDescriptor({
      key: 'spinPresetId',
      owner: 'BlackHoleModelState',
      type: 'enum',
      allowedValues: SPIN_PRESET_IDS,
      default: DEFAULT_SPIN_PRESET,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Stable ID, never a label such as "high spin".'
    }),
    D.defineDescriptor({
      key: 'spinPresetVersion',
      owner: 'BlackHoleModelState',
      type: 'integer',
      default: 1,
      validate: v => v >= 1,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'spinMagnitude',
      owner: 'BlackHoleModelState',
      type: 'number',
      default: 0,
      // Non-negative by contract: a signed magnitude plus a directed axis would
      // let one physical state be represented two ways (authority section 4.1).
      validate: v => v >= 0 && v <= 1,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['sSpinAStar', 'sSpinAStarM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION,
      note: 'Dimensionless a*. Non-negative. Direction lives in the axis, never in the sign. ACTIVE: sole authority for the 1.5PN Lense-Thirring term and the frame-dragging mesh.'
    }),
    D.defineDescriptor({
      key: 'flowOrientationFamilyId',
      owner: 'BlackHoleModelState',
      type: 'enum',
      allowedValues: FLOW_FAMILY_IDS,
      default: DEFAULT_FLOW_FAMILY,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'flowOrientationFamilyVersion',
      owner: 'BlackHoleModelState',
      type: 'integer',
      default: 1,
      validate: v => v >= 1,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'flowOrientationVariantId',
      owner: 'BlackHoleModelState',
      type: 'enum',
      allowedValues: FLOW_VARIANT_IDS,
      default: DEFAULT_FLOW_VARIANT,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'A complete variant ID string. Never a Boolean, and branch B is never -branch A.'
    }),
    D.defineDescriptor({
      key: 'spinAxisSource',
      owner: 'BlackHoleModelState',
      type: 'enum',
      allowedValues: AXIS_SOURCES,
      default: 'aligned-to-flow',
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'alignmentTilt',
      owner: 'BlackHoleModelState',
      type: 'number',
      default: 0,
      validate: v => v >= -180 && v <= 180,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Degrees. An explicit transform, never a Boolean "aligned/misaligned".'
    }),
    D.defineDescriptor({
      key: 'alignmentAzimuth',
      owner: 'BlackHoleModelState',
      type: 'number',
      default: 0,
      validate: v => v >= -360 && v <= 360,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Degrees.'
    }),
    D.defineDescriptor({
      key: 'alignmentAssumption',
      owner: 'BlackHoleModelState',
      type: 'string',
      default: 'no-alignment-assumption-at-zero-spin',
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'modelVersion',
      owner: 'BlackHoleModelState',
      type: 'integer',
      default: 1,
      validate: v => v >= 1,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION
    })
  ]);

  const registration = D.registry.register('BlackHoleModelState', DESCRIPTORS);

  function defaults() {
    const out = {};
    for (const descriptor of registration.all()) out[descriptor.key] = descriptor.default;
    return out;
  }

  function createBlackHoleModelState() {
    let state = defaults();

    function get(key) {
      if (!registration.has(key)) throw new Error(`BlackHoleModelState does not own key '${key}'`);
      return state[key];
    }

    function set(key, value) {
      const descriptor = registration.get(key);
      if (!descriptor) throw new Error(`BlackHoleModelState does not own key '${key}'`);
      if (!D.isValidValue(descriptor, value)) {
        throw new Error(`invalid value for '${key}': ${JSON.stringify(value)}`);
      }
      state[key] = value;
      return state[key];
    }

    // Read-only catalogue lookups. These return the frozen catalogue records;
    // they are never mutable references into live state.
    function selectedSpinPreset() {
      return Catalogue.findSpinPreset(state.spinPresetId);
    }
    function selectedOrientationVariant() {
      return Catalogue.findVariant(state.flowOrientationFamilyId, state.flowOrientationVariantId);
    }
    function isNonSpinning() {
      return state.spinMagnitude === 0;
    }
    function orientationSelected() {
      return state.flowOrientationFamilyId !== 'unselected';
    }

    function reset() { state = defaults(); }

    function snapshot() {
      const preset = selectedSpinPreset();
      const variant = selectedOrientationVariant();
      return {
        ...state,
        // Values copied out, not references to catalogue records.
        selectedSpinPresetSummary: preset
          ? { preset_id: preset.preset_id, preset_version: preset.preset_version, magnitude: preset.magnitude,
              confidence_status: preset.confidence_status }
          : null,
        selectedOrientationVariantSummary: variant
          ? { variant_id: variant.variant_id, status: variant.status, pending_finding: variant.pending_finding }
          : null,
        orientationDataStatus: Catalogue.catalogueStatus().orientation_data_populated
          ? 'populated'
          : 'ORIENTATION_DATA_PENDING',
        schemaVersion: SCHEMA_VERSION
      };
    }

    function descriptors() { return registration.all(); }
    function descriptorFor(key) { return registration.get(key); }
    function ownedKeys() { return registration.keys; }

    return Object.freeze({
      get,
      set,
      selectedSpinPreset,
      selectedOrientationVariant,
      isNonSpinning,
      orientationSelected,
      reset,
      snapshot,
      descriptors,
      descriptorFor,
      ownedKeys,
      SCHEMA_VERSION
    });
  }

  SGRA.State.BlackHoleModelState = Object.freeze({
    createBlackHoleModelState,
    DESCRIPTORS,
    SCHEMA_VERSION,
    DEFAULT_SPIN_PRESET,
    DEFAULT_FLOW_FAMILY,
    DEFAULT_FLOW_VARIANT
  });
})(typeof window !== 'undefined' ? window : globalThis);
