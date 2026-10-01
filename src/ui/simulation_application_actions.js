(function attachSimulationApplicationActions(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  function requireDeps(deps, required) {
    for (const name of required) if (!(name in deps)) throw new TypeError(`SimulationApplicationActions requires ${name}`);
  }

  function create(deps) {
    requireDeps(deps, ['simulationClock', 'simulationOptions', 'intruders', 'cameraController', 'selectionState', 'bodyStore', 'predictionEngine', 'applicationModeController']);
    const {
      $, document, announceStatus, displayOptions, simulationClock,
      simulationOptions, physicsAdvanceCoordinator, predictionEngine, syncFidelityUi,
      syncIntegratorModeUi, toast, motionPreference, calmMotionEnabled, syncCalmMotionUi, syncSonificationPlayback,
      blackHoleModelState, maxValidatedKerrSpin, invalidateForceState, intruders, cv,
      setToggle, selectionState, hideCard, cameraController, predictionDisplayState,
      incrementPreviewRevision, bodyStore, epoch0, appliedScenario, applyScenario, cameraViewState,
      resetSceneForMode, getApplicationMode, sandboxSessionDirty, applicationModeController,
      syncApplicationModeUi, diagnostics
    } = deps;

    const actions = {
      togglePlay() { const playing = simulationClock.togglePlaying(); syncSonificationPlayback?.(playing); return playing; },
      isPlaying() { return simulationClock.isPlaying(); },
      setSpeed(value) { return simulationClock.setTimeScale(Math.pow(10, +value)); },
      toggleOrbits() { return displayOptions.toggleOrbits(); },
      toggleTrails() { return displayOptions.toggleTrails(); },
      toggleLabels() { return displayOptions.toggleLabels(); },
      toggleGlow() { return displayOptions.toggleGlow(); },
      setFidelityMode(value) {
        const mode = simulationOptions.setFidelityMode(value);
        incrementPreviewRevision();
        physicsAdvanceCoordinator.clearFailure();
        predictionEngine.invalidateAll('fidelity-changed');
        syncFidelityUi();
        syncIntegratorModeUi();
        toast(mode === 'adaptive_kerr' ? 'Adaptive Kerr enabled' : `${mode === '1pn' ? '1PN' : 'Newtonian'} enabled`);
        return mode;
      },
      toggleScientificAnnotations() { return displayOptions.toggleScientificAnnotations(); },
      toggleCalmMotion() {
        motionPreference.userChoice = !calmMotionEnabled();
        syncCalmMotionUi();
        announceStatus(`Calm motion ${motionPreference.userChoice ? 'active' : 'inactive'}.`);
        return motionPreference.userChoice;
      },
      toggleDisc() { return displayOptions.toggleDisc(); },
      toggleSpinMesh() { return displayOptions.toggleSpinMesh(); },
      setSpinAStar(value) {
        const clamped = Math.max(0, Math.min(maxValidatedKerrSpin, Number(value) || 0));
        blackHoleModelState.set('spinMagnitude', clamped);
        incrementPreviewRevision();
        invalidateForceState();
        predictionDisplayState.clearFollowedPath();
        predictionEngine.invalidateAll('spin-changed');
        syncFidelityUi();
        return clamped;
      },
      getSpinAStar() { return blackHoleModelState.get('spinMagnitude'); },
      toggleLegend() { return $('legend').style.display !== 'block'; },
      toggleCusp() {
        const enabled = simulationOptions.setCuspEnabled(!simulationOptions.isCuspEnabled());
        incrementPreviewRevision();
        predictionEngine.invalidateAll('cusp-changed');
        bodyStore.setBaselineEnergy(SGRA.Physics.LocalIntegrator.totalEnergy());
        bodyStore.setBaselineEnergyBreakdown(SGRA.Physics.LocalEnergy.roleEnergyBreakdown());
        toast(enabled ? 'Dark cusp on (Bahcall-Wolf)' : 'Dark cusp off');
        return enabled;
      },
      toggleLaunch() {
        const on = intruders.toggleLaunchMode();
        cv.classList.toggle('aiming', on);
        if (on) {
          selectionState.clear();
          hideCard();
          cameraController.resetTarget();
          toast('Intruder placement active: drag on sky to aim; activate Launch intruder: on or press Escape to cancel.');
        } else toast('Intruder placement exited.');
        return on;
      },
      isLaunchActive() { return intruders.isLaunchMode(); },
      cancelLaunch(silent = false) {
        intruders.setLaunchMode(false);
        for (const id of ['bLaunch', 'bLaunchM', 'bLaunchSandboxM']) {
          const button = $(id);
          if (!button) continue;
          setToggle(button, false);
          button.textContent = 'Launch intruder';
          button.setAttribute('aria-label', 'Launch intruder');
        }
        $('chips').classList.remove('show');
        cv.classList.remove('aiming');
        document?.body?.classList.remove('aiming-active');
        if (!silent) announceStatus('Intruder placement cancelled.');
      },
      setIntruderMass(mass) {
        intruders.setMass(mass);
        document?.querySelectorAll('button[data-m]').forEach(button => {
          const selected = +button.dataset.m === intruders.getMass();
          button.classList.toggle('on', selected);
          button.setAttribute('aria-pressed', String(selected));
        });
      },
      setIntegratorMode(value) {
        const requested = simulationOptions.requestIntegratorComposition(value);
        syncIntegratorModeUi();
        if (requested === simulationOptions.getIntegratorComposition()) {
          toast(`Integrator mode unchanged: ${requested === 'yoshida4_trial' ? 'High precision - slower' : 'Fast - reduced precision'}`);
        } else {
          toast(`Integrator mode pending reset: ${requested === 'yoshida4_trial' ? 'High precision - slower' : 'Fast - reduced precision'}`);
        }
        return requested;
      },
      syncIntegratorMode() { syncIntegratorModeUi(); },
      setQuality(value) {
        const previous = simulationOptions.getRequestedTier();
        const requested = simulationOptions.setTier(+value);
        // A1-04: the desktop change handler never reached the mobile select
        // (only mobile -> desktop was wired), so after a desktop change plus
        // Reset the mobile control could read "Off — catalogue only" while
        // heuristic field stars rendered. Paint every density control from
        // the requested tier authority.
        for (const id of ['sQual', 'sQualM']) { const select = $?.(id); if (select) select.value = String(requested); }
        if (diagnostics && typeof diagnostics.recordEvent === 'function' && requested !== previous) diagnostics.recordEvent('QUALITY_CHANGE_PENDING', { subsystem: 'quality', requested: previous, actual: requested, reason: 'selector request; reset required' });
        toast('Quality changed — reset to apply');
      },
      reset() {
        const scenario = appliedScenario?.();
        if (scenario) {
          applyScenario(scenario, true);
          toast('Reset to the applied scenario state.');
          return;
        }
        resetSceneForMode(getApplicationMode());
        cameraController.reset();
        cameraViewState.reset();
        toast('Reset to epoch ' + epoch0);
      },
      getApplicationMode() { return getApplicationMode(); },
      isSandboxDirty() { return sandboxSessionDirty(); },
      enterSandbox() {
        const result = applicationModeController.enterSandbox();
        if (result.ok) { syncApplicationModeUi(); announceStatus('Sandbox started: Sgr A* only; no catalogue S-stars or field tracers.'); }
        return result;
      },
      returnToExplore() {
        const result = applicationModeController.returnToExplore();
        if (result.ok) { syncApplicationModeUi(); announceStatus('Explore restored: catalogue S-stars and field population returned.'); }
        return result;
      }
    };
    return Object.freeze(actions);
  }

  SGRA.UI.SimulationApplicationActions = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
