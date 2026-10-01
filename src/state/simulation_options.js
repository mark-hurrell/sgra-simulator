// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachSimulationOptions(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  const D = SGRA.State.StateDescriptors;

  // SGRA-SPEC-001 B-3B §6 — SimulationOptions.
  //
  // Owns ONLY: GR activation, cusp activation, integrator composition state,
  // quality tier (retained here for compatibility, see below), and declared
  // inactive LT/flow-drag activation descriptors.
  //
  // PN ramp moved to ActivationState (B-3B §7). getPnRamp/getPnRampTarget/
  // setPnRampTarget/updatePnRamp are preserved here as DELEGATING compatibility
  // wrappers so existing callers are unaffected; the descriptors below name
  // ActivationState as the true owner via `trueOwner`.
  //
  // QUALITY-TIER RULING (§6): tier stays in SimulationOptions in this block.
  // It currently controls both field-star workload and trail budget and is
  // part of the pre-C4M performance matrix. This is an intentional
  // compatibility ownership decision, not an accidental omission, and it is
  // not to be split before C-4M.

  const SCHEMA_VERSION = 2;
  const VALID_INTEGRATOR_COMPOSITIONS = Object.freeze(['plain', 'yoshida4_trial']);
  const VALID_FIDELITY_MODES = Object.freeze(['newtonian', '1pn', 'adaptive_kerr']);

  const DESCRIPTORS = Object.freeze([
    D.defineDescriptor({
      key: 'grOn',
      owner: 'SimulationOptions',
      type: 'boolean',
      default: false,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bGR', 'bGRM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'cuspOn',
      owner: 'SimulationOptions',
      type: 'boolean',
      default: false,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bCusp', 'bCuspM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'tier',
      owner: 'SimulationOptions',
      type: 'integer',
      default: 0,
      validate: v => v >= 0,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['sQual', 'sQualM'],
      activationKind: 'reset-only',
      schemaVersion: SCHEMA_VERSION,
      note: 'Quality tier. Intentionally retained here for compatibility; controls field-star ' +
        'workload and trail budget. Not split before C-4M — see B-3B section 6 ruling.'
    }),
    D.defineDescriptor({
      key: 'integratorComposition',
      owner: 'SimulationOptions',
      type: 'enum',
      allowedValues: VALID_INTEGRATOR_COMPOSITIONS,
      default: 'plain',
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'reset-only',
      schemaVersion: SCHEMA_VERSION,
      note: 'Active composition. Changes only via activateRequestedIntegratorComposition().'
    }),
    D.defineDescriptor({
      key: 'pendingIntegratorComposition',
      owner: 'SimulationOptions',
      type: 'object',
      default: null,
      validate: v => v === null || VALID_INTEGRATOR_COMPOSITIONS.indexOf(v) >= 0,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['sIntegratorMode', 'sIntegratorModeM'],
      activationKind: 'reset-only',
      schemaVersion: SCHEMA_VERSION,
      note: 'Requested but not yet activated. Fast/High-Precision remains reset-only.'
    }),
    // ---- Compatibility-delegated to ActivationState. Declared here so a
    // reader of SimulationOptions' owned keys sees the true owner, without
    // re-registering the key (that would throw the uniqueness gate). ----
    D.defineDescriptor({
      key: 'ltActivationRequested',
      owner: 'SimulationOptions',
      trueOwner: 'SimulationOptions',
      type: 'boolean',
      default: false,
      validate: v => v === false,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Lense-Thirring activation request descriptor. Declared only, pinned false.'
    }),
    D.defineDescriptor({
      key: 'flowDragActivationRequested',
      owner: 'SimulationOptions',
      trueOwner: 'SimulationOptions',
      type: 'boolean',
      default: false,
      validate: v => v === false,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Flow-drag activation request descriptor. Declared only, pinned false.'
    }),
    D.defineDescriptor({
      key: 'fidelityMode', owner: 'SimulationOptions', type: 'enum',
      allowedValues: VALID_FIDELITY_MODES, default: 'newtonian',
      persistence: 'not-persisted-yet', diagnostic: 'included', reset: 'reset-to-default',
      controlBindingIds: ['sFidelity', 'sFidelityM'], activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION,
      note: 'Adaptive Kerr is automatic N-to-exact-Kerr ownership; LT is not a shipping mode.'
    })
  ]);

  const registration = D.registry.register('SimulationOptions', DESCRIPTORS);

  function createSimulationOptions(options = {}) {
    const maxTier = Number.isInteger(options.maxTier) ? options.maxTier : Infinity;
    const initialTier = Number.isInteger(options.tier) && options.tier >= 0 && options.tier <= maxTier ? options.tier : 0;
    let grOn = false;
    let cuspOn = false;
    let requestedTier = initialTier;
    let activeTier = initialTier;
    let integratorComposition = 'plain';
    let pendingIntegratorComposition = null;
    let fidelityMode = 'newtonian';
    const onForceInputsChanged = typeof options.onForceInputsChanged === 'function' ? options.onForceInputsChanged : () => {};

    // The true owner of PN ramp state. May be injected (so a caller can share
    // one ActivationState across owners); defaults to a private instance so
    // createSimulationOptions() remains usable standalone, exactly as before.
    const activationState = options.activationState
      || SGRA.State.ActivationState.createActivationState();

    function isGrEnabled() { return grOn; }
    function setGrEnabled(value) { const next = !!value; if (next !== grOn) { grOn = next; onForceInputsChanged(); } return grOn; }
    function getFidelityMode() { return fidelityMode; }
    function setFidelityMode(value) {
      if (!VALID_FIDELITY_MODES.includes(value)) throw new Error(`Unknown physics fidelity mode: ${value}`);
      const nextGrOn = value === '1pn';
      if (fidelityMode !== value || grOn !== nextGrOn) onForceInputsChanged();
      fidelityMode = value;
      grOn = nextGrOn;
      // Fidelity selection changes the destination of the existing PN ramp;
      // ActivationState remains responsible for advancing pnRamp itself.
      activationState.setPnRampTarget(value === '1pn' ? 1 : 0);
      return fidelityMode;
    }

    function isCuspEnabled() { return cuspOn; }
    function setCuspEnabled(value) { const next = !!value; if (next !== cuspOn) { cuspOn = next; onForceInputsChanged(); } return cuspOn; }

    // ---- Compatibility wrappers. Delegate to ActivationState. ----
    function getPnRamp() { return activationState.getPnRamp(); }
    function getPnRampTarget() { return activationState.getPnRampTarget(); }
    function setPnRampTarget(value) { return activationState.setPnRampTarget(value); }
    function updatePnRamp(realDelta, rate) {
      const before = activationState.getPnRamp();
      const next = activationState.updatePnRamp(realDelta, rate);
      if (next !== before) onForceInputsChanged();
      return next;
    }

    // Compatibility: getTier/setTier continue to address the requested tier.
    // The live scene tier is exposed separately and advances only after the
    // scene has actually been rebuilt with the request.
    function getTier() { return requestedTier; }
    function getRequestedTier() { return requestedTier; }
    function getActiveTier() { return activeTier; }
    function isTierChangePending() { return requestedTier !== activeTier; }
    function setTier(value) {
      if (!Number.isInteger(value) || value < 0 || value > maxTier) throw new RangeError(`Unsupported quality tier: ${value}`);
      requestedTier = value;
      return requestedTier;
    }
    function activateTier() { activeTier = requestedTier; return activeTier; }

    function normalizeIntegratorComposition(value) {
      return VALID_INTEGRATOR_COMPOSITIONS.indexOf(value) >= 0 ? value : null;
    }

    function getIntegratorComposition() { return integratorComposition; }
    function getPendingIntegratorComposition() { return pendingIntegratorComposition; }
    function getRequestedIntegratorComposition() { return pendingIntegratorComposition || integratorComposition; }

    function requestIntegratorComposition(value) {
      const next = normalizeIntegratorComposition(value);
      if (!next) throw new Error(`Unknown integrator composition: ${value}`);
      pendingIntegratorComposition = next === integratorComposition ? null : next;
      return getRequestedIntegratorComposition();
    }

    function isIntegratorCompositionEffective(compositionValue, fidelityModeValue) {
      return !(compositionValue === 'yoshida4_trial' && fidelityModeValue === 'adaptive_kerr');
    }

    function getEffectiveIntegratorComposition() {
      return isIntegratorCompositionEffective(integratorComposition, fidelityMode) ? integratorComposition : 'plain';
    }

    function activateRequestedIntegratorComposition() {
      integratorComposition = pendingIntegratorComposition || integratorComposition;
      pendingIntegratorComposition = null;
      return integratorComposition;
    }

    function reset() {
      grOn = false;
      cuspOn = false;
      activationState.reset();
      requestedTier = initialTier;
      integratorComposition = 'plain';
      pendingIntegratorComposition = null;
      fidelityMode = 'newtonian';
      onForceInputsChanged();
    }

    function snapshot() {
      return {
        grOn,
        cuspOn,
        pnRamp: activationState.getPnRamp(),
        pnRampTarget: activationState.getPnRampTarget(),
        tier: requestedTier,
        requestedTier,
        activeTier,
        tierChangePending: isTierChangePending(),
        integratorComposition,
        pendingIntegratorComposition,
        requestedIntegratorComposition: getRequestedIntegratorComposition(),
        fidelityMode
      };
    }

    function descriptors() { return registration.all(); }
    function descriptorFor(key) { return registration.get(key); }
    function ownedKeys() { return registration.keys; }

    return Object.freeze({
      isGrEnabled,
      setGrEnabled,
      getFidelityMode,
      setFidelityMode,
      isCuspEnabled,
      setCuspEnabled,
      getPnRamp,
      getPnRampTarget,
      setPnRampTarget,
      updatePnRamp,
      getTier,
      setTier,
      getRequestedTier,
      getActiveTier,
      isTierChangePending,
      activateTier,
      getIntegratorComposition,
      getPendingIntegratorComposition,
      getRequestedIntegratorComposition,
      getEffectiveIntegratorComposition,
      isIntegratorCompositionEffective,
      requestIntegratorComposition,
      activateRequestedIntegratorComposition,
      reset,
      snapshot,
      descriptors,
      descriptorFor,
      ownedKeys,
      activationState,
      SCHEMA_VERSION
    });
  }

  SGRA.State.SimulationOptions = Object.freeze({
    createSimulationOptions,
    DESCRIPTORS,
    SCHEMA_VERSION
  });
})(globalThis);
