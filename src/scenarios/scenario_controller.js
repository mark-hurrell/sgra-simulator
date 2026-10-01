// Sgr A* Simulator
// Scenario/catalogue application controller.

(function attachScenarioController(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Scenarios = SGRA.Scenarios || {};

  function create(options = {}) {
    const {
      $, document, stars, getBodies, bodyStore, trailState, simulationClock,
      simulationOptions, blackHoleModelState, getSpinAxisSign, selectionState,
      followGroupDisplayState, intruders, intruderLaunch, applicationModeController,
      resetSceneForMode, syncApplicationModeUi, enforcePinnedBHFrame, computeAccel,
      updateObjectList, updateHUD, setIntruderFieldValidation,
      updateIntruderFormSummary, announceStatus, toast, scenarioCommands,
      getApplicationModeName, maxTier, syncRuntimeControls
    } = options;

    const catalogueController = SGRA.Scenarios.ScenarioCatalogueController.create({
      $, document, stars, getBodies, selectionState, followGroupDisplayState,
      setIntruderFieldValidation, updateIntruderFormSummary, announceStatus, toast, maxTier
    });
    const {
      scenarioKnownExploreBodyIds, scenarioValidationOptions: catalogueScenarioValidationOptions, scenarioDescriptionText,
      renderIntruderPresetCatalogue, applyIntruderPreset, renderScenarioCatalogue,
      selectedScenario, setScenarioCatalogue, loadScenarioCatalogueFile, populateStarSel
    } = catalogueController;
    let scenarioBodyIdMap = new Map();
    let appliedScenarioState = null;
    function scenarioValidationOptions() { return { ...catalogueScenarioValidationOptions(), maxTier }; }

    function scenarioSessionDirty() {
      const bodies = getBodies();
      const changedSettings = simulationOptions.getFidelityMode() !== 'newtonian'
        || blackHoleModelState.get('spinMagnitude') !== 0
        || getSpinAxisSign() !== 1;
      const changedScene = Math.abs(simulationClock.getSimTime()) > 1e-12
        || selectionState.getFollowIndex() !== -1
        || followGroupDisplayState.active
        || intruders.isLaunchMode()
        || bodies.some(body => body.intr);
      return changedSettings || changedScene;
    }

    function scenarioBodyForReference(reference) {
      return scenarioBodyIdMap.get(reference) || getBodies().find(body => body.name === reference) || null;
    }

    function applyScenarioCamera(scenario) {
      const camera = scenario.camera || { preset: 'free' };
      followGroupDisplayState.stop();
      selectionState.clear();
      if (camera.preset === 'selected-body-follow') {
        const body = scenarioBodyForReference(camera.bodyId);
        if (!body) throw new Error(`camera.bodyId: body '${camera.bodyId}' was not created`);
        selectionState.setFollowIndex(getBodies().indexOf(body));
      } else if (camera.preset === 'explicit-intruder-group-follow') {
        for (const reference of camera.memberIds) {
          const body = scenarioBodyForReference(reference);
          if (!body || !followGroupDisplayState.add(body)) throw new Error(`camera.memberIds: intruder '${reference}' was not created`);
        }
        if (!scenarioCommands.followGroup()) throw new Error('camera.memberIds: group follow could not be activated');
      }
    }

    function restoreCanonicalScenarioState(scenario) {
      const state = scenario.state;
      const restored = state.bodies.map(body => ({
        name: body.name || '', m: body.mass,
        x: body.position[0], y: body.position[1], z: body.position[2],
        vx: body.velocity[0], vy: body.velocity[1], vz: body.velocity[2],
        ax: 0, ay: 0, az: 0, id: body.id,
        bh: body.role === 'bh', star: body.role === 'star', field: body.role === 'field', intr: body.role === 'intruder',
        captured: body.captured, col: body.role === 'bh' ? '#ffb27a' : body.role === 'intruder' ? '#ff7a5c' : '#bcd2ff',
        prevR: 0, prevDR: 0, legMinR: null, lastPeriT: null,
        aPN: 0, aLT: 0,
        ...(body.ownership ? { __fidelityOwnership: { ...body.ownership, bodyId: body.id } } : {})
      }));
      bodyStore.replaceAll(restored);
      bodyStore.resetIdSequence(Math.max(...restored.map(body => body.id)) + 1);
      simulationClock.setSimTime(state.simTime);
      simulationClock.setPlaying(false);
      const runtime = state.runtime;
      simulationOptions.setTier(runtime.tier);
      // A1-02: the restored body list IS the scene built at runtime.tier (its
      // field population came from the canonical state, not from init()), so
      // the tier is active now, not pending the next reset. Without this the
      // runtime reported activeTier/qualityPending from the pre-apply scene
      // and kept the old trail budget until Reset, so "apply" and
      // "apply -> Reset" were different initial states.
      simulationOptions.activateTier();
      const tierTable = global.SGRA?.Domain?.Constants?.TIER;
      if (tierTable && tierTable[runtime.tier] && typeof trailState.setLength === 'function') trailState.setLength(tierTable[runtime.tier].trl);
      if (runtime.integrator.requested) {
        simulationOptions.requestIntegratorComposition(runtime.integrator.requested);
        simulationOptions.activateRequestedIntegratorComposition();
      }
      scenarioBodyIdMap = new Map(restored.map(body => [`body-${body.id}`, body]));
      enforcePinnedBHFrame();
      trailState.ensureBodySlots(getBodies().length);
      computeAccel();
      const presentation = scenario.presentation;
      if (presentation.selectedBodyId !== null) {
        const selected = bodyStore.indexById(presentation.selectedBodyId);
        if (selected >= 0) selectionState.setFollowIndex(selected);
      }
      if (presentation.groupActive) {
        for (const id of presentation.groupMemberIds) followGroupDisplayState.add(bodyStore.findById(id));
        if (!scenarioCommands.followGroup()) throw new Error('presentation.groupMemberIds: canonical group could not be activated');
      }
    }

    function applyScenario(scenario, force = false) {
      if (!scenario) return false;
      const applicationMode = getApplicationModeName();
      if (!force && scenarioSessionDirty() && !global.confirm(`Discard the current ${applicationMode} session and apply scenario “${scenario.title}”?`)) {
        announceStatus(`Scenario not applied: current ${applicationMode} session was kept.`);
        return false;
      }
      scenarioBodyIdMap = new Map();
      applicationModeController.setMode(scenario.sceneContext);
      resetSceneForMode(scenario.sceneContext);
      syncApplicationModeUi();
      scenarioCommands.setFidelityMode(scenario.physicsMode);
      scenarioCommands.setSpinAStar(scenario.centralSpin.magnitude);
      global.SGRA_SPIN_DIAG?.setAxisSign(scenario.centralSpin.axisSign);
      if (scenario.schemaVersion === 2) restoreCanonicalScenarioState(scenario);
      else for (const intruder of scenario.intruders) {
        const body = intruderLaunch.launch(intruder.p0Rel, intruder.p1Rel, intruder.mass);
        scenarioBodyIdMap.set(intruder.id, body);
      }
      if (scenario.schemaVersion === 1) applyScenarioCamera(scenario);
      if (typeof syncRuntimeControls === 'function') syncRuntimeControls();
      populateStarSel(); updateObjectList(); updateHUD();
      const bodies = getBodies();
      const selected = selectionState.getFollowIndex() > 0 ? bodies[selectionState.getFollowIndex()] : null;
      const groupCount = followGroupDisplayState.active ? followGroupDisplayState.liveMembers().length : 0;
      announceStatus(`Scenario “${scenario.title}” applied as ${scenario.sceneContext} initial-condition; ${bodies.length} bodies; ${scenario.intruders.length} intruders; ${selected ? `selected/followed ${selected.name}` : groupCount ? `following ${groupCount} intruders` : 'free view'}. Sandbox remains an explicit controlled experiment, not an observed S-star cluster model.`);
      appliedScenarioState = scenario;
      return true;
    }

    function applySelectedScenario(force = false) { return applyScenario(selectedScenario(), force); }
    function appliedScenario() { return appliedScenarioState; }
    function clearAppliedScenario() { appliedScenarioState = null; }

    return Object.freeze({
      populateStarSel, scenarioKnownExploreBodyIds, scenarioValidationOptions,
      scenarioDescriptionText, renderIntruderPresetCatalogue, applyIntruderPreset,
      renderScenarioCatalogue, selectedScenario, setScenarioCatalogue,
      scenarioSessionDirty, scenarioBodyForReference, applyScenarioCamera, appliedScenario, clearAppliedScenario, applyScenario,
      restoreCanonicalScenarioState, applySelectedScenario, loadScenarioCatalogueFile
    });
  }

  SGRA.Scenarios.ScenarioController = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
