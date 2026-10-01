// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachActivationState(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  const D = SGRA.State.StateDescriptors;

  // SGRA-SPEC-001 B-3B §7 — ActivationState owns transitional mechanisms.
  //
  // Before B-3B, pnRamp/pnRampTarget lived in SimulationOptions alongside
  // GR/cusp/tier. They are not configuration; they are transitional machinery
  // that evolves every frame. They move here.
  //
  // BEHAVIOUR IS PRESERVED BIT-IDENTICALLY. updatePnRamp below is the pre-B-3B
  // formula character for character, including the 1e-6 no-op guard, the
  // Math.min(realDelta*rate, 1) step clamp and the 0.001 snap. It is compared
  // against a frozen copy of the legacy implementation over a matrix in
  // tests/b3b_state_ownership.test.mjs. Do not "tidy" it.
  //
  // SimulationOptions retains getPnRamp/getPnRampTarget/setPnRampTarget/
  // updatePnRamp as delegating compatibility wrappers, but the descriptors
  // below identify ActivationState as the true owner.

  const SCHEMA_VERSION = 1;

  const DESCRIPTORS = Object.freeze([
    D.defineDescriptor({
      key: 'pnRamp',
      owner: 'ActivationState',
      type: 'number',
      default: 0,
      validate: v => v >= 0 && v <= 1,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'transitional',
      schemaVersion: SCHEMA_VERSION,
      note: 'Current 1PN activation ramp. Driven by updatePnRamp, never set directly.'
    }),
    D.defineDescriptor({
      key: 'pnRampTarget',
      owner: 'ActivationState',
      type: 'number',
      default: 0,
      validate: v => v >= 0 && v <= 1,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bGR', 'bGRM'],
      activationKind: 'transitional',
      schemaVersion: SCHEMA_VERSION,
      note: 'Set to 1 when GR is enabled, 0 when disabled. The ramp chases it.'
    }),
    // ---- Declared, inactive. Nothing reads these in B-3B. ----
    D.defineDescriptor({
      key: 'ltRamp',
      owner: 'ActivationState',
      type: 'number',
      default: 0,
      validate: v => v === 0,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Lense-Thirring activation ramp. Declared only. Validator pins it to 0 so no ' +
        'code path can activate LT through this key before its authorising block.'
    }),
    D.defineDescriptor({
      key: 'ltRampTarget',
      owner: 'ActivationState',
      type: 'number',
      default: 0,
      validate: v => v === 0,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Declared only. Pinned to 0.'
    }),
    D.defineDescriptor({
      key: 'flowDragRamp',
      owner: 'ActivationState',
      type: 'number',
      default: 0,
      validate: v => v === 0,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Accretion-flow drag ramp. Declared only. Pinned to 0.'
    }),
    D.defineDescriptor({
      key: 'flowDragRampTarget',
      owner: 'ActivationState',
      type: 'number',
      default: 0,
      validate: v => v === 0,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Declared only. Pinned to 0.'
    })
  ]);

  const registration = D.registry.register('ActivationState', DESCRIPTORS);

  function createActivationState() {
    let pnRamp = 0;
    let pnRampTarget = 0;

    function getPnRamp() { return pnRamp; }
    function getPnRampTarget() { return pnRampTarget; }

    function setPnRampTarget(value) {
      pnRampTarget = Number.isFinite(value) ? value : pnRampTarget;
      return pnRampTarget;
    }

    // Pre-B-3B formula, unchanged.
    function updatePnRamp(realDelta, rate) {
      if (Math.abs(pnRamp - pnRampTarget) <= 1e-6) return pnRamp;
      const step = Math.min(realDelta * rate, 1);
      pnRamp += (pnRampTarget - pnRamp) * step;
      if (Math.abs(pnRamp - pnRampTarget) < 0.001) pnRamp = pnRampTarget;
      return pnRamp;
    }

    function reset() {
      pnRamp = 0;
      pnRampTarget = 0;
    }

    function snapshot() {
      return {
        pnRamp,
        pnRampTarget,
        ltRamp: 0,
        ltRampTarget: 0,
        flowDragRamp: 0,
        flowDragRampTarget: 0,
        schemaVersion: SCHEMA_VERSION
      };
    }

    function descriptors() { return registration.all(); }
    function descriptorFor(key) { return registration.get(key); }
    function ownedKeys() { return registration.keys; }

    return Object.freeze({
      getPnRamp,
      getPnRampTarget,
      setPnRampTarget,
      updatePnRamp,
      reset,
      snapshot,
      descriptors,
      descriptorFor,
      ownedKeys,
      SCHEMA_VERSION
    });
  }

  SGRA.State.ActivationState = Object.freeze({
    createActivationState,
    DESCRIPTORS,
    SCHEMA_VERSION
  });
})(typeof window !== 'undefined' ? window : globalThis);
