// Sgr A* Simulator
// Stable public action facade. Responsibility implementations live in the
// three cohesive action components attached before this module.

(function attachUIActions(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  const SIMULATION_DEPS = [
    '$', 'document', 'announceStatus', 'displayOptions', 'simulationClock', 'simulationOptions',
    'physicsAdvanceCoordinator', 'predictionEngine', 'syncFidelityUi', 'syncIntegratorModeUi', 'syncSonificationPlayback',
    'toast', 'motionPreference', 'calmMotionEnabled', 'syncCalmMotionUi', 'blackHoleModelState',
    'maxValidatedKerrSpin', 'invalidateForceState', 'intruders', 'cv', 'setToggle', 'selectionState',
    'hideCard', 'cameraController', 'cameraViewState', 'predictionDisplayState', 'incrementPreviewRevision', 'bodyStore',
    'epoch0', 'appliedScenario', 'applyScenario', 'resetSceneForMode', 'getApplicationMode',
    'sandboxSessionDirty', 'applicationModeController', 'syncApplicationModeUi', 'diagnostics'
  ];
  const OBJECT_DEPS = [
    'selectionState', 'orbitPlaneView', 'hideCard', 'announceStatus', 'updateHUD', 'updateObjectList',
    'bodies', 'followGroupDisplayState', 'bodyStore', 'orbitCacheOwner', 'trailSampler',
    'predictionDisplayState', 'surfaceIsOpen', '$', 'updateSelectedInspector',
    'restoreObjectsAfterGroupFollow', 'groupFramingState', 'resetGroupFollowCamera', 'intruders',
    'recenterView', 'collapseObjectsForGroupFollow', 'groupStatusText', 'toast'
  ];
  const CAMERA_DEPS = [
    'selectionState', 'orbitPlaneView', 'hideCard', 'followGroupDisplayState', 'updateObjectList',
    'startOrbitPlaneViewTransition', 'recenterView', 'cameraController', 'cameraViewState',
    'predictionDisplayState', 'startRecenteringTransition', 'calmMotionEnabled', 'currentFollowBody',
    'bodies', 'announceStatus', 'toast', 'applyGroupFollowRotate', 'applyGroupFollowZoomFactor'
  ];

  function pick(source, names) {
    const result = {};
    for (const name of names) if (name in source) result[name] = source[name];
    return result;
  }

  function create(deps = {}) {
    const simulation = SGRA.UI.SimulationApplicationActions.create(pick(deps, SIMULATION_DEPS));
    const object = SGRA.UI.ObjectInteractionActions.create({
      ...pick(deps, OBJECT_DEPS),
      cancelLaunch: simulation.cancelLaunch
    });
    const camera = SGRA.UI.CameraNavigationActions.create({
      ...pick(deps, CAMERA_DEPS),
      stopGroupFollow: object.stopGroupFollow
    });
    const implementation = Object.assign({}, simulation, object, camera);
    const boundary = deps.actionFailureBoundary || SGRA.UI.ActionFailureBoundary.create();
    const facade = {};
    for (const [name, action] of Object.entries(implementation)) {
      facade[name] = typeof action === 'function' ? boundary.wrap(name, action) : action;
    }
    return facade;
  }

  SGRA.UI.UIActions = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
