// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachRuntimeLoopController(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Runtime = SGRA.Runtime || {};

  function submitFramePhysics(state, rawRequestedDelta, clock, advanceCoordinator, now, afterPhysics, report, telemetry, stop) {
    if (typeof clock.takePendingAdvanceDelta === 'function') clock.takePendingAdvanceDelta();
    const physicsStart = now();
    const result = advanceCoordinator.advanceSimulation(rawRequestedDelta);
    try { afterPhysics?.(result); } catch (error) { report(error); }
    const physicsMs = now() - physicsStart;
    try { telemetry?.physicsCompleted?.({ wallMs: now() - physicsStart, result }); } catch (_) {
      /* telemetry is best-effort and must not disturb the frame */
    }
    const actualAdvance = Number.isFinite(result?.actualAdvancedDelta) ? Math.max(0, result.actualAdvancedDelta) : 0;
    let source = state.source;
    if (result?.reason === 'already-stepping') source = 'ALREADY_STEPPING';
    else if (actualAdvance < rawRequestedDelta) source = result?.stepMaxHit ? 'STEP_MAX_UNDERDELIVERY' : 'PHYSICS_UNDERDELIVERY';
    else if (actualAdvance > rawRequestedDelta) source = 'PHYSICS_OVERDELIVERY';
    if (typeof clock.addPendingAdvanceDelta === 'function') clock.addPendingAdvanceDelta(rawRequestedDelta - actualAdvance);
    if (typeof clock.getPendingAdvanceDelta === 'function') clock.getPendingAdvanceDelta();
    if (typeof clock.takeDiscardedDelta === 'function') state.discardedDelta += clock.takeDiscardedDelta();
    if (result?.failed) stop();
    state.actualAdvance = actualAdvance;
    state.result = result;
    state.physicsMs = physicsMs;
    state.source = source;
  }

  function queueFrameDemand(state, generatedDemand, clock) {
    clock.addPendingAdvanceDelta(generatedDemand);
    if (typeof clock.getPendingAdvanceDelta === 'function') clock.getPendingAdvanceDelta();
    if (typeof clock.takeDiscardedDelta === 'function') state.discardedDelta += clock.takeDiscardedDelta();
  }

  function advanceFramePhysics(state, realDelta, clock, options, advanceCoordinator, now, afterPhysics, report, telemetry, stop) {
    if (Math.abs(options.getPnRamp() - options.getPnRampTarget()) > 1e-6) options.updatePnRamp(realDelta, 2.0);
    const playing = clock.isPlaying();
    const timeScale = clock.getTimeScale();
    const openingCarry = typeof clock.getPendingAdvanceDelta === 'function' ? clock.getPendingAdvanceDelta({ bound: false }) : 0;
    if (typeof clock.getPendingAdvanceDelta === 'function') clock.getPendingAdvanceDelta();
    const generatedDemand = playing ? timeScale * realDelta : 0;
    const rawRequestedDelta = openingCarry + generatedDemand;
    state.playing = playing;
    state.timeScale = timeScale;
    state.openingCarry = openingCarry;
    state.generatedDemand = generatedDemand;
    state.rawRequestedDelta = rawRequestedDelta;
    state.actualAdvance = 0;
    state.result = null;
    state.physicsMs = null;
    state.discardedDelta = typeof clock.takeDiscardedDelta === 'function' ? clock.takeDiscardedDelta() : 0;
    state.source = rawRequestedDelta <= 0 ? 'NEGATIVE_DEBT_RETAINED' : 'PAUSED';
    if (playing && rawRequestedDelta > 0) submitFramePhysics(state, rawRequestedDelta, clock, advanceCoordinator, now, afterPhysics, report, telemetry, stop);
    else if (playing && typeof clock.addPendingAdvanceDelta === 'function' && rawRequestedDelta !== openingCarry) queueFrameDemand(state, generatedDemand, clock);
  }

  function frameStepResult(result) {
    return result?.reason || (result?.failed ? 'failed' : result ? 'completed' : 'not-submitted');
  }

  function frameWinningLimiter(result) {
    if (result?.timestep?.returnedDt === result?.timestep?.periDt) return 'periapsis';
    if (result?.timestep?.returnedDt === result?.timestep?.pairDt) return 'pair';
    if (result?.timestep?.returnedDt === result?.timestep?.pnDt) return 'relativistic';
    if (result?.timestep?.returnedDt === result?.timestep?.ordinaryDt) return 'ordinary';
    return null;
  }

  function frameSchedulerAccounting(schedulerDeps, constants) {
    const deps = schedulerDeps || {};
    const c = constants || {};
    return {
      mode: typeof deps.getSchedulerMode === 'function' ? deps.getSchedulerMode() : 'global',
      executionMode: deps.blockExecutionMode || 'global-adaptive',
      macrostepQuantum: deps.blockExecutionMode === 'block' ? c.DT_MAX ?? null : null,
      dtMin: c.DT_MIN ?? null,
      dtMax: c.DT_MAX ?? null,
      stepMax: c.STEP_MAX ?? null
    };
  }

  function buildFrameAccounting(state, realDelta, realDeltaInfo, clock, scheduler, constants) {
    const { playing, timeScale, openingCarry, generatedDemand, rawRequestedDelta, actualAdvance, result, physicsMs, discardedDelta } = state;
    const closingCarry = typeof clock.getPendingAdvanceDelta === 'function' ? clock.getPendingAdvanceDelta() : openingCarry;
    if (result?.failed) state.source = 'PHYSICS_FAILURE';
    const wallDiscard = playing ? realDeltaInfo.discarded * timeScale : 0;
    const explicitDiscard = wallDiscard + discardedDelta;
    const submitted = result?.requestedDelta ?? null;
    return { playing, timeScale, realDelta, rawWallDelta: realDeltaInfo.rawDelta, wallDeltaDiscard: realDeltaInfo.discarded, generatedDemand, openingCarry, rawRequestedDelta, totalDemand: rawRequestedDelta, submittedRequestedDelta: submitted, actualAdvance, schedulerOvershoot: Number.isFinite(submitted) ? actualAdvance - submitted : null, closingCarry, explicitDiscard, discardedDelta, playbackRate: generatedDemand > 0 ? actualAdvance / generatedDemand : null, source: state.source, stepResult: frameStepResult(result), stepMaxHit: result?.stepMaxHit === true, alreadyStepping: result?.reason === 'already-stepping', substeps: Number.isFinite(result?.substeps) ? result.substeps : null, winningLimiter: frameWinningLimiter(result), physicsMs, scheduler: frameSchedulerAccounting(scheduler, constants) };
  }

  function recordFrameAccounting(state, realDelta, realDeltaInfo, clock, telemetry, scheduler, constants) {
    const accounting = buildFrameAccounting(state, realDelta, realDeltaInfo, clock, scheduler, constants);
    if (typeof clock.recordAccounting === 'function') clock.recordAccounting(accounting);
    try { globalThis.SGRA_DIAG?.recordFrameAccounting?.(accounting); } catch (_) {
      /* optional diagnostic capture must not disturb the frame */
    }
    try { telemetry?.clockFrame?.(accounting); } catch (_) {
      /* telemetry is best-effort and must not disturb the frame */
    }
  }

  function createRuntimeLoopController(deps) {
    const {
      clock,
      options,
      advanceCoordinator,
      refreshCoordinator,
      tickFps,
      requestFrame,
      now,
      onError,
      telemetry,
      afterPhysics,
      scheduler,
      constants
    } = deps;

    let running = false;
    let frameCounter = 0;
    let generation = 0;
    const scheduledGenerations = new Set();

    function report(error) {
      if (typeof onError === 'function') onError(error);
    }

    function scheduleNext(targetGeneration = generation) {
      if (!running || targetGeneration !== generation || scheduledGenerations.has(targetGeneration)) return;
      scheduledGenerations.add(targetGeneration);
      requestFrame(timestamp => {
        scheduledGenerations.delete(targetGeneration);
        if (!running || targetGeneration !== generation) return false;
        return frame(timestamp);
      });
    }

    function start() {
      if (running) return false;
      generation += 1;
      running = true;
      scheduleNext();
      return true;
    }

    function restart() {
      generation += 1;
      running = true;
      scheduleNext();
      return true;
    }

    function stop() {
      running = false;
      generation += 1;
    }

    function isRunning() {
      return running;
    }

    function afterAdvance(timestamp, realDelta) {
      try {
        refreshCoordinator.refreshFrame({
          timestamp,
          realDelta,
          realNow: now(),
          shouldUpdateHud: frameCounter++ % 24 === 0
        });
      } catch (error) {
        report(error);
      } finally {
          scheduleNext();
      }
    }

    const frameState = {};

    function frame(timestamp) {
      if (!running) return false;
      const frameStart = now();
      if (typeof tickFps === 'function') tickFps(timestamp);
      const realDelta = clock.consumeRealDelta(timestamp, .05);
      const realDeltaInfo = typeof clock.getLastRealDeltaInfo === 'function' ? clock.getLastRealDeltaInfo() : { rawDelta: realDelta, discarded: 0 };
      try { telemetry?.frameStarted?.({ timestamp, realDelta }); } catch (_) {
        /* telemetry is best-effort and must not disturb the frame */
      }
      try {
        advanceFramePhysics(frameState, realDelta, clock, options, advanceCoordinator, now, afterPhysics, report, telemetry, stop);
        recordFrameAccounting(frameState, realDelta, realDeltaInfo, clock, telemetry, scheduler, constants);
        afterAdvance(timestamp, realDelta);
      } catch (error) {
        running = false; generation += 1;
        try { globalThis.SGRA_DIAG?.markRuntimeFailure?.('RUNTIME_FRAME_PROLOGUE_FAILED', { subsystem: 'runtime', reason: error?.message || String(error) }); } catch (_) {
          /* failure reporting must not mask the original frame error */
        }
        report(error);
      }
      try { telemetry?.frameCompleted?.({ frameMs: now() - frameStart }); } catch (_) {
        /* telemetry is best-effort and must not disturb the frame */
      }
      return true;
    }

    return Object.freeze({ start, restart, stop, frame, isRunning, generation: () => generation });
  }

  SGRA.Runtime.RuntimeLoopController = Object.freeze({ createRuntimeLoopController });
})(globalThis);
