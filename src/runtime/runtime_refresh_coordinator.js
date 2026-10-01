// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachRuntimeRefreshCoordinator(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Runtime = SGRA.Runtime || {};

  function createRuntimeRefreshCoordinator(deps) {
    const {
      bodies,
      selectionState,
      predictionDisplayState,
      orbitCache,
      displayOptions,
      groupFollowAnchor,
      cameraFollow,
      renderFrame,
      updateHud,
      now,
      onError,
      telemetry
    } = deps;

    function report(error) {
      if (typeof onError === 'function') onError(error);
    }

    function clearFollowedPredictionAttempt() {
      predictionDisplayState.clearFollowedPath();
    }

    function refreshFollowedPrediction() {
      // Group follow is an independent camera mode. It must be refreshed even
      // when no individual body is selected; otherwise the single-body follow
      // gate below prevents group framing from reaching the camera owner.
      const groupAnchor = typeof groupFollowAnchor === 'function' ? groupFollowAnchor() : null;
      if (groupAnchor) {
        cameraFollow(groupAnchor.tx, groupAnchor.ty, groupAnchor.tz);
        clearFollowedPredictionAttempt();
        return;
      }
      const followIndex = selectionState.getFollowIndex();
      if (followIndex > 0 && followIndex < bodies.length) {
        const bh = bodies[0], b = bodies[followIndex];
        if (b) {
          const tx = b.x - bh.x, ty = b.y - bh.y, tz = b.z - bh.z;
          cameraFollow(tx, ty, tz);
        }
      }
      clearFollowedPredictionAttempt();
    }

    function refreshPredictions() {
      try {
        refreshFollowedPrediction();
      } catch (error) {
        report(error);
      }
    }

    function refreshFrame(frameInfo = {}) {
      const refreshStart = now();
      if (displayOptions.showOrbits()) orbitCache.update();
      refreshPredictions();
      const renderStart = now();
      const renderAttribution = renderFrame();
      const renderMs = now() - renderStart;
      if (renderAttribution && Number.isFinite(renderAttribution.sum_ms)) {
        renderAttribution.canonical_render_ms = renderMs;
        renderAttribution.residual_ms = renderMs - renderAttribution.sum_ms;
      }
      if (frameInfo.shouldUpdateHud) updateHud();
      try { telemetry?.refreshCompleted?.({ refreshMs: now() - refreshStart, renderMs, renderAttribution }); } catch (_) {
        /* telemetry is best-effort and must not disturb the frame */
      }
    }

    return Object.freeze({ refreshFrame, refreshPredictions });
  }

  SGRA.Runtime.RuntimeRefreshCoordinator = Object.freeze({ createRuntimeRefreshCoordinator });
})(globalThis);
