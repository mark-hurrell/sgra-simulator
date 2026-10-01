(function attachCameraNavigationActions(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  function requireDeps(deps, required) {
    for (const name of required) if (!(name in deps)) throw new TypeError(`CameraNavigationActions requires ${name}`);
  }

  function create(deps) {
    requireDeps(deps, ['cameraController', 'cameraViewState', 'followGroupDisplayState', 'stopGroupFollow', 'bodies']);
    const {
      selectionState, orbitPlaneView, hideCard, followGroupDisplayState, updateObjectList,
      startOrbitPlaneViewTransition, recenterView, cameraController, cameraViewState,
      predictionDisplayState, startRecenteringTransition, calmMotionEnabled, currentFollowBody,
      bodies, announceStatus, toast, applyGroupFollowRotate, applyGroupFollowZoomFactor,
      stopGroupFollow
    } = deps;
    const actions = {
      dismissFollow() { selectionState.clear(); orbitPlaneView.transitioning = false; hideCard(); },
      alignOrbitPlaneView() { stopGroupFollow(); updateObjectList(); return startOrbitPlaneViewTransition(); },
      freeView() { stopGroupFollow(); selectionState.clear(); orbitPlaneView.transitioning = false; recenterView.transitioning = false; hideCard(); updateObjectList(); announceStatus('Free view: follow released; no body selected.'); },
      home() { stopGroupFollow(); orbitPlaneView.transitioning = false; selectionState.clear(); startRecenteringTransition(); hideCard(); predictionDisplayState.clearFollowedPath(); cameraViewState.enterStartInspection(); toast('Centred on Sgr A*'); },
      earthView() {
        stopGroupFollow();
        recenterView.transitioning = false;
        const v = cameraViewState.enterEarthObserver();
        orbitPlaneView.transitioning = true;
        orbitPlaneView.lastRealTime = performance.now();
        orbitPlaneView.targetYaw = v.yaw;
        orbitPlaneView.targetPitch = v.pitch;
        if (calmMotionEnabled()) { cameraController.setOrientation(v.yaw, v.pitch); orbitPlaneView.transitioning = false; }
        toast('Earth-observer view');
      },
      rotateCamera(deltaX, deltaY) { orbitPlaneView.transitioning = false; recenterView.transitioning = false; if (applyGroupFollowRotate(deltaX, deltaY)) return; cameraController.rotateBy(deltaX, deltaY); cameraViewState.noteManualCameraChange(); },
      mobileRotate(deltaX, deltaY, label) { actions.rotateCamera(deltaX, deltaY); announceStatus(`${label}; view rotated.`); },
      zoomCamera(factor) { recenterView.transitioning = false; if (!applyGroupFollowZoomFactor(factor)) { cameraController.zoomBy(Math.log(factor) / Math.log(1.0015)); cameraViewState.noteManualCameraChange(); } },
      mobileZoom(delta, label) { actions.zoomCamera(Math.pow(1.0015, delta)); announceStatus(`${label}; view zoom changed.`); },
      mobileRecenter() {
        const groupAnchor = followGroupDisplayState.active ? followGroupDisplayState.anchor() : null;
        const followed = currentFollowBody();
        if (groupAnchor || followed) {
          const bh = bodies[0];
          const target = groupAnchor || { tx: followed.x - bh.x, ty: followed.y - bh.y, tz: followed.z - bh.z };
          cameraController.followTarget(target.tx, target.ty, target.tz, calmMotionEnabled() ? 1 : .15);
          cameraViewState.noteManualCameraChange();
          announceStatus(groupAnchor ? 'View re-centred on the followed intruder group.' : `View re-centred on followed ${followed.name || `body ${followed.id}`}.`);
          return;
        }
        actions.home();
      }
    };
    return Object.freeze(actions);
  }

  SGRA.UI.CameraNavigationActions = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
