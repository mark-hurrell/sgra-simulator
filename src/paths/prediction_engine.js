// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachPredictionEngine(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Paths = SGRA.Paths || {};

  function resolvePredictionDeps(depsOrFactory) {
    return typeof depsOrFactory === 'function' ? depsOrFactory() : depsOrFactory;
  }

  function makePredictionEngine(depsOrFactory) {
    // classification: INTENTIONALLY_DORMANT_FUTURE_SEAM. The local path is
    // live; this bounded path/status owner is retained for future providers,
    // is not a second physics authority, and costs only two Maps per engine.
    const paths = new Map();
    const status = new Map();

    return {
      paths,
      status,
      invalidateAll(reason) {
        paths.clear();
        status.clear();
      },
      invalidateBody(bodyId, reason) {
        paths.delete(bodyId);
        status.set(bodyId, reason || 'invalidated');
      },
      updateForTarget(bodyId, stateSnapshot, options = {}) {
        const deps = resolvePredictionDeps(depsOrFactory);
        const body = deps.getBodyById(bodyId);
        if (!body) return null;
        const path = deps.computeFuturePath(deps.getBodyIndexById(bodyId));
        if (path) {
          const current = paths.get(bodyId);
          if (!current || deps.shouldReplacePredictionPath(current, path, body)) {
            paths.set(bodyId, path);
            status.set(bodyId, path.status || 'unknown');
          }
        }
        return paths.get(bodyId) || null;
      },
      getPath(bodyId) { return paths.get(bodyId) || null; },
      getStatus(bodyId) { return status.get(bodyId) || 'none'; }
    };
  }

  function makePredictionCoreRegistry(depsOrFactory) {
    return {
      cores: [],
      active: null,
      register(core) { this.cores.push(core); },
      selectPreferred() {
        const deps = resolvePredictionDeps(depsOrFactory);
        const ordered = this.cores.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));
        for (const core of ordered) {
          const ok = typeof core.available === 'function' ? core.available() : !!core.available;
          if (ok) {
            this.active = core;
            return core;
          }
        }
        this.active = deps.getLocalPredictionCore();
        return this.active;
      },
      getActive() {
        const deps = resolvePredictionDeps(depsOrFactory);
        return this.active || deps.getLocalPredictionCore();
      }
    };
  }

  function makePredictionCore(depsOrFactory, kind, priority, available) {
    return {
      kind,
      priority,
      available() { return available; },
      requestPrediction(targetId, stateSnapshot, options = {}) {
        const deps = resolvePredictionDeps(depsOrFactory);
        return deps.computeFuturePath(deps.getBodyIndexById(targetId));
      },
      pollResult(targetId) {
        return resolvePredictionDeps(depsOrFactory).getPredictionEngine().getPath(targetId);
      },
      cancel(targetId) {
        if (available) resolvePredictionDeps(depsOrFactory).getPredictionEngine().invalidateBody(targetId, 'cancel');
      }
    };
  }

  function makeLocalPredictionCore(depsOrFactory) {
    return makePredictionCore(depsOrFactory, 'local-prediction', 100, true);
  }

  function makeWorkerPredictionCore(depsOrFactory) {
    // classification: INTENTIONALLY_DORMANT_FUTURE_SEAM. Unavailable and not
    // wired for shipping; retained for a future worker architecture.
    return makePredictionCore(depsOrFactory, 'worker-prediction', 40, false);
  }

  function makeWebGpuPredictionCore(depsOrFactory) {
    // classification: INTENTIONALLY_DORMANT_FUTURE_SEAM. Unavailable and not
    // wired for shipping; retained for a future GPU architecture.
    return makePredictionCore(depsOrFactory, 'webgpu-prediction', 20, false);
  }

  function shouldReplacePredictionPath(currentPath, nextPath, bodyRef) {
    if (!nextPath) return false;
    if (!currentPath) return true;
    if (currentPath.bodyRef !== bodyRef) return true;
    if (nextPath.complete) return true;
    if (!currentPath.complete && nextPath.status === 'captured') return true;
    return false;
  }

  // Maximum age (simulation years) a prediction path may reach before it is
  // considered stale regardless of positional agreement.
  const PREDICTION_MAX_AGE_YEARS = 60;

  function predictionNeedsRefresh(depsOrFactory, path, body, simTNow) {
    const deps = resolvePredictionDeps(depsOrFactory);
    if (!path) return true;
    if (path.bodyRef !== body) return true;
    const age = simTNow - path.sourceSimT;
    if (age < 0 || age > PREDICTION_MAX_AGE_YEARS) return true;
    const pred = deps.samplePredictionAt(path, age);
    if (!pred) return true;
    const bh = deps.getBodies()[0];
    if (!bh) return true;
    const err = Math.hypot(pred.x - (body.x - bh.x), pred.y - (body.y - bh.y), pred.z - (body.z - bh.z));
    const threshold = Math.max(10, 0.05 * Math.hypot(body.x - bh.x, body.y - bh.y, body.z - bh.z));
    return err > threshold;
  }

  SGRA.Paths.Prediction = Object.freeze({
    makePredictionEngine,
    makePredictionCoreRegistry,
    makeLocalPredictionCore,
    makeWorkerPredictionCore,
    makeWebGpuPredictionCore,
    shouldReplacePredictionPath,
    predictionNeedsRefresh
  });
})(typeof window !== 'undefined' ? window : globalThis);
