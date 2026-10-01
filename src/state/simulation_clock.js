// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachSimulationClock(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  function createSimulationClock(options = {}) {
    const initialNow = Number.isFinite(options.now) ? options.now : 0;
    const initialTimeScale = Number.isFinite(options.timeScale) ? options.timeScale : 1;
    const initialPlaying = options.playing !== undefined ? !!options.playing : true;

    let simTime = 0;
    let timeScale = initialTimeScale;
    let playing = initialPlaying;
    let lastRealTime = initialNow;
    let stepping = false;
    let throttled = false;
    let substepTrailSampling = false;
    let pendingAdvanceDelta = 0;
    const carryFrames = 2;
    const nominalFrameDelta = Number.isFinite(options.nominalFrameDelta) && options.nominalFrameDelta > 0 ? options.nominalFrameDelta : 1 / 60;
    const accountingTraceEnabled = options.clockTraceEnabled === true;
    const accountingTraceLimit = Number.isInteger(options.clockTraceLimit) && options.clockTraceLimit > 0 ? options.clockTraceLimit : 256;
    let accountingFrame = 0;
    let accountingTrace = [];
    let accountingTotals = { generatedDemand: 0, actualAdvance: 0, explicitDiscard: 0, discardedDelta: 0 };
    let frameDiscardedDelta = 0;
    let lastRealDeltaInfo = { rawDelta: 0, delta: 0, discarded: 0 };

    function getSimTime() { return simTime; }
    function setSimTime(value) { simTime = Number.isFinite(value) ? value : 0; return simTime; }
    function advanceSimTime(delta) { simTime += delta; return simTime; }

    function getTimeScale() { return timeScale; }
    function setTimeScale(value) { timeScale = Number.isFinite(value) ? value : timeScale; return timeScale; }

    function isPlaying() { return playing; }
    function setPlaying(value) { playing = !!value; return playing; }
    function togglePlaying() { playing = !playing; return playing; }

    function consumeRealDelta(now, maxDelta) {
      const rawDelta = (now - lastRealTime) / 1e3;
      const dt = Math.max(0, Math.min(maxDelta, rawDelta));
      lastRealTime = now;
      lastRealDeltaInfo = { rawDelta, delta: dt, discarded: Math.max(0, rawDelta - dt) };
      return dt;
    }

    function getLastRealDeltaInfo() { return { ...lastRealDeltaInfo }; }
    function recordAccounting(record) {
      accountingFrame += 1;
      accountingTotals.generatedDemand += Number.isFinite(record?.generatedDemand) ? record.generatedDemand : 0;
      accountingTotals.actualAdvance += Number.isFinite(record?.actualAdvance) ? record.actualAdvance : 0;
      accountingTotals.explicitDiscard += Number.isFinite(record?.explicitDiscard) ? record.explicitDiscard : 0;
      accountingTotals.discardedDelta += Number.isFinite(record?.discardedDelta) ? record.discardedDelta : 0;
      if (accountingTraceEnabled) {
        accountingTrace.push(Object.freeze({ ...record, frame: accountingFrame }));
        if (accountingTrace.length > accountingTraceLimit) accountingTrace.shift();
      }
      return accountingFrame;
    }
    function getAccountingTrace() { return accountingTrace.slice(); }
    function getAccountingSnapshot() { return { frame: accountingFrame, ...accountingTotals, closingCarry: pendingAdvanceDelta, traceEnabled: accountingTraceEnabled }; }
    function resetAccountingTelemetry() { accountingFrame = 0; accountingTrace = []; accountingTotals = { generatedDemand: 0, actualAdvance: 0, explicitDiscard: 0, discardedDelta: 0 }; frameDiscardedDelta = 0; }

    function maxCarry() { return carryFrames * Math.max(0, timeScale) * nominalFrameDelta; }
    function enforceCarryBound() {
      const discarded = Math.max(0, pendingAdvanceDelta - maxCarry());
      pendingAdvanceDelta = Math.min(pendingAdvanceDelta, maxCarry());
      if (discarded > 0) frameDiscardedDelta += discarded;
      return pendingAdvanceDelta;
    }
    function getMaxCarry() { return maxCarry(); }
    function getPendingAdvanceDelta(options = {}) { return options.bound === false ? pendingAdvanceDelta : enforceCarryBound(); }
    function addPendingAdvanceDelta(delta) {
      if (Number.isFinite(delta) && delta !== 0) pendingAdvanceDelta += delta;
      return pendingAdvanceDelta;
    }
    function takeDiscardedDelta() { const value = frameDiscardedDelta; frameDiscardedDelta = 0; return value; }
    function takePendingAdvanceDelta() {
      const value = pendingAdvanceDelta;
      pendingAdvanceDelta = 0;
      return value;
    }

    // Lifecycle restore must discard wall time accumulated while the page was
    // suspended. This also prevents a pre-suspend carry from being applied on
    // the first resumed frame.
    function resyncRealTime(now, clearPending = true) {
      if (Number.isFinite(now)) lastRealTime = now;
      if (clearPending) pendingAdvanceDelta = 0;
      return lastRealTime;
    }

    function isStepping() { return stepping; }
    function beginStep() {
      if (stepping) return false;
      stepping = true;
      return true;
    }
    function endStep() { stepping = false; }

    function isThrottled() { return throttled; }
    function setThrottled(value) { throttled = !!value; return throttled; }

    function usedSubstepTrailSampling() { return substepTrailSampling; }
    function setSubstepTrailSampling(value) { substepTrailSampling = !!value; return substepTrailSampling; }

    function reset() {
      simTime = 0;
      timeScale = initialTimeScale;
      playing = initialPlaying;
      lastRealTime = initialNow;
      stepping = false;
      throttled = false;
      substepTrailSampling = false;
      pendingAdvanceDelta = 0;
      lastRealDeltaInfo = { rawDelta: 0, delta: 0, discarded: 0 };
      resetAccountingTelemetry();
    }

    function snapshot() {
      return {
        simTime,
        timeScale,
        playing,
        lastRealTime,
        stepping,
        throttled,
        substepTrailSampling,
        pendingAdvanceDelta
      };
    }

    return Object.freeze({
      getSimTime,
      setSimTime,
      advanceSimTime,
      getTimeScale,
      setTimeScale,
      isPlaying,
      setPlaying,
      togglePlaying,
      consumeRealDelta,
      getLastRealDeltaInfo,
      recordAccounting,
      getAccountingTrace,
      getAccountingSnapshot,
      resetAccountingTelemetry,
      getPendingAdvanceDelta,
      getMaxCarry,
      addPendingAdvanceDelta,
      takeDiscardedDelta,
      takePendingAdvanceDelta,
      resyncRealTime,
      syncRealTime: resyncRealTime,
      isStepping,
      beginStep,
      endStep,
      isThrottled,
      setThrottled,
      usedSubstepTrailSampling,
      setSubstepTrailSampling,
      reset,
      snapshot
    });
  }

  SGRA.State.SimulationClock = Object.freeze({ createSimulationClock });
})(globalThis);
