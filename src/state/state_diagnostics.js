// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachStateDiagnostics(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  const D = SGRA.State.StateDescriptors;

  // SGRA-SPEC-001 B-3B §11 — diagnostic and persistence declarations.
  //
  // This is the CONFIGURATION diagnostic export: one namespace per owner, every
  // declared descriptor represented exactly once. It is distinct from
  // src/diag/diag_harness.js, which exports numerical/physics diagnostics and
  // is untouched by B-3B.
  //
  // Compatibility projections: SimulationOptions.snapshot() and
  // DisplayOptions.debugSnapshot() already existed pre-B-3B and other code may
  // depend on their exact shape. Rather than change those shapes, this module
  // treats them as compatibility projections and MECHANICALLY PROVES (in
  // tests/b3b_state_ownership.test.mjs) that every field they expose equals the
  // corresponding owner value.

  const SCHEMA_VERSIONS = D.deepFreeze({
    simulationOptions: SGRA.State.SimulationOptions.SCHEMA_VERSION,
    activationState: SGRA.State.ActivationState.SCHEMA_VERSION,
    displayOptions: SGRA.State.DisplayOptions.SCHEMA_VERSION,
    blackHoleModelState: SGRA.State.BlackHoleModelState.SCHEMA_VERSION,
    cameraViewState: SGRA.State.CameraViewState.SCHEMA_VERSION,
    hypothesisCatalogue: SGRA.State.HypothesisCatalogue.CATALOGUE_VERSION,
    descriptorSchema: 1
  });

  // Every diagnostic field declared exactly once, keyed by 'owner.key'. Used by
  // the uniqueness gate: if two owners ever declared the same field name this
  // Set construction would silently deduplicate, so the gate instead walks the
  // registry directly (see the test) rather than trusting this convenience map.
  function fieldInventory() {
    const registry = D.registry;
    const inventory = {};
    for (const descriptor of registry.all()) {
      if (descriptor.diagnostic !== 'included') continue;
      const namespacedKey = descriptor.owner + '.' + descriptor.key;
      if (namespacedKey in inventory) {
        throw new Error(`diagnostic field collision: '${namespacedKey}' declared twice`);
      }
      inventory[namespacedKey] = {
        owner: descriptor.owner,
        trueOwner: descriptor.trueOwner,
        key: descriptor.key,
        type: descriptor.type,
        activationKind: descriptor.activationKind,
        persistence: descriptor.persistence
      };
    }
    return inventory;
  }

  // Builds the full configuration diagnostic block from live owner instances.
  function buildConfigurationDiagnostics(owners) {
    const {
      simulationOptions,
      displayOptions,
      blackHoleModelState,
      cameraViewState
    } = owners;

    const simSnap = simulationOptions.snapshot();
    const actSnap = simulationOptions.activationState.snapshot();
    const dispSnap = displayOptions.debugSnapshot();
    const bhSnap = blackHoleModelState.snapshot();
    const camSnap = cameraViewState.snapshot();

    return {
      configuration: {
        simulationOptions: {
          grOn: simSnap.grOn,
          cuspOn: simSnap.cuspOn,
          tier: simSnap.tier,
          integratorComposition: simSnap.integratorComposition,
          pendingIntegratorComposition: simSnap.pendingIntegratorComposition,
          requestedIntegratorComposition: simSnap.requestedIntegratorComposition,
          fidelityMode: simSnap.fidelityMode,
          ltActivationRequested: false,
          flowDragActivationRequested: false,
          schemaVersion: SCHEMA_VERSIONS.simulationOptions
        },
        activationState: {
          pnRamp: actSnap.pnRamp,
          pnRampTarget: actSnap.pnRampTarget,
          ltRamp: actSnap.ltRamp,
          ltRampTarget: actSnap.ltRampTarget,
          flowDragRamp: actSnap.flowDragRamp,
          flowDragRampTarget: actSnap.flowDragRampTarget,
          schemaVersion: SCHEMA_VERSIONS.activationState
        },
        displayOptions: {
          showOrbits: dispSnap.showOrbits,
          showTrails: dispSnap.showTrails,
          showLabels: dispSnap.showLabels,
          showGlow: dispSnap.showGlow,
          showScientificAnnotations: dispSnap.showScientificAnnotations,
          showDisc: dispSnap.showDisc,
          showFlowAxis: dispSnap.showFlowAxis,
          showSpinAxis: dispSnap.showSpinAxis,
          showSpinMesh: dispSnap.showSpinMesh,
          schemaVersion: SCHEMA_VERSIONS.displayOptions
        },
        blackHoleModelState: {
          spinPresetId: bhSnap.spinPresetId,
          spinPresetVersion: bhSnap.spinPresetVersion,
          spinMagnitude: bhSnap.spinMagnitude,
          flowOrientationFamilyId: bhSnap.flowOrientationFamilyId,
          flowOrientationFamilyVersion: bhSnap.flowOrientationFamilyVersion,
          flowOrientationVariantId: bhSnap.flowOrientationVariantId,
          spinAxisSource: bhSnap.spinAxisSource,
          alignmentTilt: bhSnap.alignmentTilt,
          alignmentAzimuth: bhSnap.alignmentAzimuth,
          alignmentAssumption: bhSnap.alignmentAssumption,
          modelVersion: bhSnap.modelVersion,
          orientationDataStatus: bhSnap.orientationDataStatus,
          schemaVersion: SCHEMA_VERSIONS.blackHoleModelState
        },
        cameraViewState: {
          viewMode: camSnap.viewMode,
          viewModeLabel: camSnap.viewModeLabel,
          cameraYaw: camSnap.cameraYaw,
          cameraPitch: camSnap.cameraPitch,
          cameraDistance: camSnap.cameraDistance,
          cameraTarget: camSnap.cameraTarget,
          frameConventionId: camSnap.frameConventionId,
          frameConventionVersion: camSnap.frameConventionVersion,
          earthViewConvention: {
            celestialNorthSign: camSnap.frameDeclaration.celestial_north_sign,
            celestialEastSign: camSnap.frameDeclaration.celestial_east_sign,
            celestialWestSign: camSnap.frameDeclaration.celestial_west_sign,
            status: camSnap.frameDeclaration.status
          },
          schemaVersion: SCHEMA_VERSIONS.cameraViewState
        },
        schemaVersions: SCHEMA_VERSIONS
      }
    };
  }

  SGRA.State.StateDiagnostics = Object.freeze({
    SCHEMA_VERSIONS,
    fieldInventory,
    buildConfigurationDiagnostics
  });
})(typeof window !== 'undefined' ? window : globalThis);
