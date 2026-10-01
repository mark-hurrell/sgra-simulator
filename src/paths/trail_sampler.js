// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachTrailSampler(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Paths = SGRA.Paths || {};

  function resolveDeps(depsOrFactory) {
    return typeof depsOrFactory === 'function' ? depsOrFactory() : depsOrFactory;
  }


  function appendTrailSampleForBodyIfNeeded(depsOrFactory, body, trail) {
    const deps = resolveDeps(depsOrFactory);
    const allBodies = deps.getBodies();
    const bh = allBodies[0];
    if (!body || !trail || !bh) return false;
    const now = deps.getSimT();
    if (deps.shouldAddTrailSample(body, trail, bh, now)) {
      const nextSeq = deps.getTrailSeq() + 1;
      deps.setTrailSeq(nextSeq);
      const physicsState = typeof deps.getBodyPhysicsPresentationState === 'function'
        ? deps.getBodyPhysicsPresentationState(body)
        : null;
      trail.push(deps.buildTrailSampleAt(body, bh, now, nextSeq, physicsState));
      return true;
    }
    return false;
  }

  function capTrailForBodyIndex(depsOrFactory, i) {
    const deps = resolveDeps(depsOrFactory);
    const allBodies = deps.getBodies();
    const allTrailData = deps.getTrailData();
    const body = allBodies[i];
    if (!body || !allTrailData[i]) return;
    const trail = allTrailData[i];

    // Count-based retention restores the longer history that existed before
    // the short orbit-window experiment. Intruders keep the original larger
    // budget because close passages need denser sampling than ordinary stars.
    const cap = body.intr ? Math.max(deps.getTrailLen(), 720) : deps.getTrailLen();
    const excess = trail.length - cap;
    if (excess > 0) trail.splice(0, excess);
  }

  function recordTrailSamplesForCurrentState(depsOrFactory) {
    const deps = resolveDeps(depsOrFactory);
    if (!deps.getShowTrails()) return 0;
    const allBodies = deps.getBodies();
    if (!allBodies.length) return 0;

    const allTrailData = deps.getTrailData();
    let added = 0;

    for (let i = 1; i < allBodies.length; i++) {
      if (!allTrailData[i]) allTrailData[i] = [];
      const didAdd = appendTrailSampleForBodyIfNeeded(deps, allBodies[i], allTrailData[i]);
      if (didAdd) added++;
      capTrailForBodyIndex(deps, i);
    }

    return added;
  }

  function makeTrailSampler(depsOrFactory) {
    return {
      maybeAddSamples() {
        recordTrailSamplesForCurrentState(depsOrFactory);
      },
      clearAll() {
        const deps = resolveDeps(depsOrFactory);
        deps.setTrailData([]);
      },
      clearBody(bodyId) {
        const deps = resolveDeps(depsOrFactory);
        const idx = deps.getBodyIndexById(bodyId);
        const allTrailData = deps.getTrailData();
        if (idx >= 0 && idx < allTrailData.length) allTrailData[idx] = [];
      },
      removeBody(bodyId) {
        const deps = resolveDeps(depsOrFactory);
        // Trail slots are index-aligned with bodies: remove the slot (not just
        // empty it) so the caller's subsequent bodyStore.removeAt keeps alignment.
        const idx = deps.getBodyIndexById(bodyId);
        const allTrailData = deps.getTrailData();
        if (idx >= 0 && idx < allTrailData.length) allTrailData.splice(idx, 1);
        deps.PredictionEngine.invalidateBody(bodyId, 'removed');
      }
    };
  }

  SGRA.Paths.TrailSampler = Object.freeze({
    appendTrailSampleForBodyIfNeeded,
    capTrailForBodyIndex,
    recordTrailSamplesForCurrentState,
    makeTrailSampler
  });
})(typeof window !== 'undefined' ? window : globalThis);
