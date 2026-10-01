// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachPhysicsAdvanceCoordinator(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Runtime = SGRA.Runtime || {};
  const LocalTimestepPolicy = SGRA.Physics && SGRA.Physics.LocalTimestepPolicy;

  function encodeDiagnosticValue(value, depth = 0, seen = new Set()) {
    if (typeof value === 'number') {
      if (Number.isNaN(value)) return { type: 'non-finite-number', value: 'NaN' };
      if (value === Infinity) return { type: 'non-finite-number', value: '+Infinity' };
      if (value === -Infinity) return { type: 'non-finite-number', value: '-Infinity' };
      return value;
    }
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (depth >= 4) return { type: 'diagnostic-value-truncated' };
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return { type: 'diagnostic-value-circular' };
    seen.add(value);
    if (Array.isArray(value)) {
      const result = value.slice(0, 64).map(entry => encodeDiagnosticValue(entry, depth + 1, seen));
      if (value.length > 64) result.push({ type: 'diagnostic-array-truncated', length: value.length });
      seen.delete(value);
      return result;
    }
    const result = {};
    for (const key of Object.keys(value).slice(0, 64)) result[key] = encodeDiagnosticValue(value[key], depth + 1, seen);
    if (Object.keys(value).length > 64) result.__truncatedKeys = Object.keys(value).length - 64;
    seen.delete(value);
    return result;
  }

  function failureDetails(error, requestedDelta, committed) {
    const details = {
      outerDt: requestedDelta,
      actualAdvancedDelta: committed
    };
    for (const key of ['field', 'value', 'solverStatus', 'solverTelemetry', 'eventStatus', 'massShellResidual', 'cause']) {
      if (error && error[key] !== undefined) details[key] = encodeDiagnosticValue(error[key]);
    }
    if (error && error.details !== undefined) details.upstream = encodeDiagnosticValue(error.details);
    return details;
  }

  function createPhysicsAdvanceCoordinator(deps) {
    const {
      clock,
      physicsCore,
      checkCaptures,
      checkPericentre,
      consumePhysicsEvents,
      recordFinalTrailSample,
      onError
    } = deps;

    if (!physicsCore || typeof physicsCore.advance !== 'function') {
      throw new Error('PhysicsAdvanceCoordinator requires a local physics core');
    }

    let failureState = null;

    function finishSuccess(done, requestedDelta) {
      clock.setThrottled(done < requestedDelta * .97);
      const advanceTelemetry = typeof physicsCore.getLastAdvanceTelemetry === 'function' ? physicsCore.getLastAdvanceTelemetry() : null;
      const timestepStats = LocalTimestepPolicy && typeof LocalTimestepPolicy.getFrameStats === 'function' ? LocalTimestepPolicy.getFrameStats() : null;
      const usedSubstepTrailSampling = clock.usedSubstepTrailSampling();
      try {
        checkCaptures();
        if (globalThis.SGRA_DIAG) globalThis.SGRA_DIAG.onFrameBoundary();
        checkPericentre();
        if (typeof consumePhysicsEvents === 'function') consumePhysicsEvents();
        if (!usedSubstepTrailSampling) recordFinalTrailSample('advance-final');
      } catch (error) {
        clock.endStep();
        const capsule = { code: 'POST_ADVANCE_PROCESSING_FAILED', subsystem: 'runtime', reason: error?.message ?? String(error), errorName: error?.name ?? null, simTime: clock.getSimTime() };
        try { globalThis.SGRA_DIAG?.markRuntimeFailure?.('POST_ADVANCE_PROCESSING_FAILED', capsule); } catch (_) {
          /* failure reporting must not mask the original post-advance error */
        }
        if (typeof onError === 'function') onError(error);
        return { advanced: true, failed: false, postAdvanceFailed: true, error, failure: capsule, requestedDelta, actualAdvancedDelta: done, source: physicsCore.kind || 'local-js', bodiesApplied: true, usedSubstepTrailSampling, finalTrailSampled: false };
      }
      clock.endStep();
      return {
        advanced: true,
        requestedDelta,
        actualAdvancedDelta: done,
        substeps: advanceTelemetry?.steps ?? null,
        stepMaxHit: advanceTelemetry?.stepMaxHit === true,
        timestep: timestepStats?.lastPick ?? null,
        source: physicsCore.kind || 'local-js',
        bodiesApplied: true,
        usedSubstepTrailSampling,
        finalTrailSampled: !usedSubstepTrailSampling
      };
    }

    function finishFailure(error, requestedDelta) {
      const committed = Number.isFinite(error?.actualAdvancedDelta)
        ? Math.max(0, Math.min(requestedDelta, error.actualAdvancedDelta))
        : 0;
      if (typeof clock.setThrottled === 'function') clock.setThrottled(committed < requestedDelta * .97);
      clock.endStep();
      if (typeof onError === 'function') onError(error);
      const capsule = {
        code: typeof error?.code === 'string' ? error.code : (typeof error?.message === 'string' && error.message.startsWith('KERR_') ? error.message.split(':')[0] : 'PHYSICS_ADVANCE_FAILED'),
        subsystem: 'physics',
        bodyId: error?.bodyId ?? null,
        bodyName: error?.bodyName ?? null,
        reason: error?.message ?? String(error),
        errorName: error?.name ?? null,
        simTime: clock.getSimTime(),
        details: failureDetails(error, requestedDelta, committed)
      };
      failureState = capsule;
      const advanceTelemetry = typeof physicsCore.getLastAdvanceTelemetry === 'function' ? physicsCore.getLastAdvanceTelemetry() : null;
      const timestepStats = LocalTimestepPolicy && typeof LocalTimestepPolicy.getFrameStats === 'function' ? LocalTimestepPolicy.getFrameStats() : null;
      if (globalThis.SGRA_DIAG && typeof globalThis.SGRA_DIAG.onPhysicsFailure === 'function') {
        try { globalThis.SGRA_DIAG.onPhysicsFailure(capsule); } catch (_) {
          /* failure reporting must not mask the original physics error */
        }
      }
      if (committed > 0 && globalThis.SGRA_DIAG && typeof globalThis.SGRA_DIAG.recordEvent === 'function') {
        try {
          globalThis.SGRA_DIAG.recordEvent('PARTIAL_ADVANCE', {
            subsystem: 'physics',
            requested: requestedDelta,
            actual: committed,
            reason: capsule.reason,
            simTime: capsule.simTime
          });
        } catch (_) {
          /* telemetry is best-effort and must not disturb the frame */
        }
      }
      return {
        advanced: false,
        failed: true,
        error,
        requestedDelta,
        actualAdvancedDelta: committed,
        substeps: advanceTelemetry?.steps ?? null,
        stepMaxHit: advanceTelemetry?.stepMaxHit === true,
        timestep: timestepStats?.lastPick ?? null,
        source: physicsCore.kind || 'local-js',
        bodiesApplied: committed > 0,
        usedSubstepTrailSampling: clock.usedSubstepTrailSampling()
      };
    }

    function advanceSimulation(requestedDelta) {
      if (failureState) {
        return {
          advanced: false,
          failed: true,
          skipped: true,
          reason: 'physics-failed',
          failure: failureState,
          requestedDelta,
          actualAdvancedDelta: 0,
          source: physicsCore.kind || 'local-js',
          bodiesApplied: false,
          usedSubstepTrailSampling: clock.usedSubstepTrailSampling()
        };
      }
      if (!Number.isFinite(requestedDelta) || requestedDelta <= 0) {
        return {
          advanced: false,
          skipped: true,
          reason: 'non-positive-delta',
          requestedDelta,
          actualAdvancedDelta: 0,
          source: 'none',
          bodiesApplied: false,
          usedSubstepTrailSampling: clock.usedSubstepTrailSampling()
        };
      }
      if (!clock.beginStep()) {
        return {
          advanced: false,
          skipped: true,
          reason: 'already-stepping',
          requestedDelta,
          actualAdvancedDelta: 0,
          source: 'none',
          bodiesApplied: false,
          usedSubstepTrailSampling: clock.usedSubstepTrailSampling()
        };
      }

      try {
        if (LocalTimestepPolicy && typeof LocalTimestepPolicy.resetFrameStats === 'function') {
          LocalTimestepPolicy.resetFrameStats();
        }
        const done = physicsCore.advance(requestedDelta);
        if (!Number.isFinite(done)) {
          throw new Error('invalid local physics advance result');
        }
        return finishSuccess(done, requestedDelta);
      } catch (error) {
        return finishFailure(error, requestedDelta);
      }
    }

    function clearFailure() {
      failureState = null;
      return true;
    }

    function getFailureState() {
      return failureState;
    }

    return Object.freeze({ advanceSimulation, clearFailure, getFailureState });
  }

  SGRA.Runtime.PhysicsAdvanceCoordinator = Object.freeze({ createPhysicsAdvanceCoordinator });
})(globalThis);
