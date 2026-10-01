// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachIntruderInteractionController(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Intruders = SGRA.Intruders || {};

  /**
   * Owns launch-active state, selected mass, snap mode, aim endpoints and the
   * preview cache with its scheduling flag. Touches no DOM, no bodies, no
   * canvas, and no simulation-global state.
   *
   * @param {object} deps
   * @param {function} deps.screenToWorld          (sx,sy) -> [x,y,z]
   * @param {function} deps.toBHRelative           (x,y,z) -> [x,y,z]
   * @param {function} deps.getBlackHoleMass       () -> M☉
   * @param {function} deps.getCameraSnapshot      () -> {yaw,pitch,...}
   * @param {function} deps.computePreview         (p0Rel,p1Rel,mass) -> preview
   * @param {function} [deps.createPreviewJob]     (p0Rel,p1Rel,mass) -> resumable job
   * @param {function} [deps.getPreviewRevision]   () -> relevant scene revision
   * @param {function} deps.launch                 (p0Rel,p1Rel,mass) -> body
   * @param {function} deps.scheduleFrame          (cb) -> void
   * @param {function} [deps.runBackgroundInWorker] AIM-PERF: (p0Rel,p1Rel,mass,{onDone,onError}) -> {cancel}.
   *   Optional. Called once per preview key when a P2 provisional verdict is
   *   reached, to finish the full-horizon confirmation off the main thread.
   *   Omit it (the default) and this controller behaves exactly as it did
   *   before this hook existed -- the confirmation keeps running via
   *   previewJob.resume() on the main thread, unchanged.
   * @param {function} [deps.onLaunched]           (body) -> void
   * @param {function} [deps.onLaunchRejected]     (error) -> void
   * @param {function} [deps.onSelect]             (sx,sy) -> void
   * @param {object}   deps.constants              { G, LAUNCH_SCALE }
   */
  function createInteractionController(deps) {
    const {
      screenToWorld, toBHRelative,
      computePreview, createPreviewJob, getPreviewRevision, launch, scheduleFrame, onLaunched, onLaunchRejected, onSelect, constants,
      runBackgroundInWorker
    } = deps;
    const { LAUNCH_SCALE } = constants;

    let launchMode = false;
    let mass = 1e3;
    let aim = null;
    let preview = null;
    let previewJob = null;
    let previewKey = '';
    let previewScheduled = false;
    // AIM-PERF: once a P2 provisional verdict (view.outcomeVerdictComplete
    // && !view.complete) has been handed to deps.runBackgroundInWorker, the
    // worker owns finishing that confirmation; the main thread stops
    // resuming previewJob for the SAME key so the two don't race on the same
    // clone. workerHandoffKey tracks which key that is; workerHandoff is its
    // {cancel} handle, used to abandon a stale worker run the moment the aim
    // changes (see cancelAim/invalidatePreview below).
    let workerHandoff = null;
    let workerHandoffKey = null;

    function isLaunchMode() { return launchMode; }
    function abandonWorkerHandoff() {
      if (workerHandoff) { workerHandoff.cancel(); workerHandoff = null; }
      workerHandoffKey = null;
    }
    function cancelAim() {
      aim = null;
      preview = null;
      previewJob = null;
      previewKey = '';
      abandonWorkerHandoff();
    }

    function cancel() { cancelAim(); }

    function setLaunchMode(on) { launchMode = !!on; if (!launchMode) cancelAim(); }
    function toggleLaunchMode() { setLaunchMode(!launchMode); return launchMode; }

    function getMass() { return mass; }
    function setMass(m) { mass = m; invalidatePreview(); }

    function getAim() { return aim ? { p0_rel: aim.p0_rel.slice(), p1_rel: aim.p1_rel.slice() } : null; }
    function getPreview() { return preview; }
    function isAiming() { return aim !== null; }

    function invalidatePreview() {
      preview = null;
      previewJob = null;
      previewKey = '';
      abandonWorkerHandoff();
      if (aim) schedulePreview();
    }

    function schedulePreview() {
      if (previewScheduled || !aim) return;
      previewScheduled = true;
      scheduleFrame(() => {
        previewScheduled = false;
        if (!aim) return;
        updatePreview();
      });
    }

    function updatePreview() {
      if (!aim) return;
      // The preview depends on both endpoints.  Omitting p0 allows a changed
      // launch origin to reuse an obsolete trajectory when p1/mass are
      // unchanged.
      const revision = typeof getPreviewRevision === 'function' ? getPreviewRevision() : 0;
      const key = `${aim.p0_rel}|${aim.p1_rel}|${mass}|${revision}`;
      if (key === previewKey && previewJob?.isComplete?.()) return;
      // AIM-PERF: once this key's background confirmation has been handed to
      // a worker, do not resume previewJob for it again on the main thread --
      // that would race the worker over the same clone semantics. Just
      // replay the last known (provisional) view; the worker's onDone/onError
      // callback (registered below, at hand-off time) is what updates
      // `preview` and eventually marks it complete.
      if (key === previewKey && key === workerHandoffKey) return;
      const spd = Math.hypot(
        (aim.p1_rel[0] - aim.p0_rel[0]) * LAUNCH_SCALE,
        (aim.p1_rel[1] - aim.p0_rel[1]) * LAUNCH_SCALE,
        (aim.p1_rel[2] - aim.p0_rel[2]) * LAUNCH_SCALE
      );
      let result;
      try {
        if (key !== previewKey || !previewJob) {
          previewKey = key;
          previewJob = typeof createPreviewJob === 'function' ? createPreviewJob(aim.p0_rel, aim.p1_rel, mass) : null;
        }
        result = previewJob ? previewJob.resume() : computePreview(aim.p0_rel, aim.p1_rel, mass);
      } catch (error) {
        // AIM1-05: every Kerr preview failure becomes a distinct, visible
        // "unavailable" reason. Previously only KERR_PREVIEW_INPUT_REJECTED
        // was caught; KERR_ADMISSION_FAILED (incl. SCI-01B fatal
        // classification) escaped this RAF callback and left the previous
        // preview on screen. Non-Kerr errors are still programming faults and
        // are rethrown.
        const code = error && typeof error.code === 'string' ? error.code : '';
        if (!code.startsWith('KERR_')) throw error;
        // The launch vector itself is still defined by the two aim points: do
        // not replace that real speed with 0 km/s.
        const midTrajectory = Number.isFinite(error.previewStep) && error.previewStep > 0;
        const reason = code === 'KERR_PREVIEW_INPUT_REJECTED' && !midTrajectory ? 'LAUNCH_STATE_REJECTED' : midTrajectory ? 'INTEGRATION_FAILED' : 'KERR_ADMISSION_FAILED';
        const where = midTrajectory ? ` after ${error.previewSimTime.toFixed(1)} yr` : '';
        result = { pts: [], spd, truncated: false, captured: false, outcome: `→ PREVIEW UNAVAILABLE · ${error.message}${where}`, outcomeCol: 'rgba(255,200,100,1)', previewUnavailable: true, unavailableReason: reason, unavailableCode: code, invalid: reason === 'LAUNCH_STATE_REJECTED', complete: true };
      }
      preview = result;
      // AIM-PERF P2 + worker offload: a provisional verdict (outcome known,
      // full-horizon confirmation still running) is exactly the case
      // sgra_preview_worker.js exists for -- see that file's header. Hand it
      // off ONCE per key; the worker's own progress/done/error messages take
      // over updating `preview` for that key from here on, and the guard
      // above stops the main thread from also resuming previewJob for it.
      if (result.outcomeVerdictComplete && !result.complete && typeof runBackgroundInWorker === 'function' && workerHandoffKey !== key) {
        workerHandoffKey = key;
        const handoffAim = { p0_rel: aim.p0_rel.slice(), p1_rel: aim.p1_rel.slice() };
        const handoffMass = mass;
        workerHandoff = runBackgroundInWorker(handoffAim.p0_rel, handoffAim.p1_rel, handoffMass, {
          onDone: view => { if (key === previewKey) { preview = view; workerHandoff = null; } },
          // A worker failure (unavailable, or an in-flight error) is silent
          // to the user: the provisional verdict already on screen stays
          // there, unchanged, and the main-thread guard above is lifted so
          // schedulePreview can resume finishing the job on the main thread
          // exactly as it would have without a worker at all.
          onError: () => { if (workerHandoffKey === key) { workerHandoffKey = null; workerHandoff = null; schedulePreview(); } }
        }) || null;
      }
      if (!result.complete && !(result.outcomeVerdictComplete && workerHandoffKey === key)) schedulePreview();
    }

    /** Ensure a preview exists, computing synchronously if none is cached. */
    function ensurePreview() {
      if (!preview) updatePreview();
      return preview;
    }

    // --- pointer transitions -------------------------------------------------

    function begin(sx, sy, pointerCount) {
      if (pointerCount === 2) { cancel(); return false; }
      if (pointerCount !== 1 || !launchMode) return false;
      const p = screenToWorld(sx, sy);
      const rel = toBHRelative(p[0], p[1], p[2]);
      aim = { p0_rel: rel.slice(), p1_rel: rel.slice() };
      return true;
    }

    /** @returns {boolean} true if the aim consumed the move (camera must not rotate) */
    function update(sx, sy) {
      if (!aim) return false;
      const p = screenToWorld(sx, sy);
      const [relX, relY, relZ] = toBHRelative(p[0], p[1], p[2]);
      aim.p1_rel = [relX, relY, relZ];
      schedulePreview();
      return true;
    }

    /**
     * @returns {{launched:boolean, body:object|null, wasAiming:boolean}}
     * Exactly one launch per release, and only when the pointer actually moved.
     */
    function complete(data) {
      const wasAiming = aim !== null && !!data.wasTracked;
      if (wasAiming && data.moved) {
        const p0 = aim.p0_rel.slice();
        const p1 = aim.p1_rel.slice();
        const m = mass;
        cancelAim();                    // clear only this aim; placement remains active
        let body;
        try {
          body = launch(p0, p1, m);
        } catch (error) {
          if (error?.code !== 'INTRUDER_START_INSIDE_CAPTURE_BOUNDARY') throw error;
          onLaunchRejected?.(error);
          return { launched: false, rejected: true, body: null, wasAiming: true, error };
        }
        if (onLaunched) onLaunched(body);
        return { launched: true, body, wasAiming: true };
      }
      // Original semantics: an unmoved release cancels any aim AND still
      // selects. Cancelling must not suppress the selection.
      if (wasAiming) cancelAim();
      if (!data.moved && !data.remainingPointers && onSelect) onSelect(data.x, data.y);
      return { launched: false, body: null, wasAiming };
    }

    return Object.freeze({
      isLaunchMode, setLaunchMode, toggleLaunchMode,
      getMass, setMass,
      getAim, getPreview, ensurePreview, isAiming,
      begin, update, complete, cancel
    });
  }

  SGRA.Intruders.InteractionController = Object.freeze({ createInteractionController });
})(typeof window !== 'undefined' ? window : globalThis);
