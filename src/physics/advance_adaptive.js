// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function (global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  /**
   * Pure adaptive substep scheduler. This is the load-bearing loop that the
   * "bodies explode at high time speed" regression (0307b71) removed and
   * restored. Extracted here as an injected-dependency function so the stepping
   * contract can be tested without the whole physics stack.
   *
   * Contract:
   *   - never call physicsStep(want) — never one step for the whole interval
   *   - each step uses the adaptive dt directly; if the final step overshoots
   *     `want`, the caller owns carrying the surplus into the next frame
   *   - accumulate until `want` is consumed or the safety cap `stepMax` is hit
   *   - a substep, once started, always completes: the deadline is only ever
   *     tested at substep boundaries (PERF plan P0A sec 5.1)
   *
   * @param {object} deps
   * @param {number}   deps.want              requested simulated interval
   * @param {function} deps.pickDt            () -> adaptive step
   * @param {function} deps.physicsStep       (dt) -> void
   * @param {number}   [deps.stepMax]         safety cap on substep count (corruption/safety ceiling, independent of the responsiveness deadline)
   * @param {number}   [deps.deadlineMs]      optional wall-clock budget in ms for this call; when omitted, behaviour is identical to the original unbounded loop
   * @param {function} [deps.now]             () -> current time in ms; required if deadlineMs is set (inject performance.now in the browser)
   * @param {number}   [deps.clockCheckStride]  substeps between deadline checks (default 8); avoids calling now() every substep
   * @returns {{done: number, steps: number, throttledByDeadline: boolean}} when deadlineMs is provided, else a bare number (done) for backward compatibility
   */
  function advanceAdaptive(deps) {
    const { want, pickDt, physicsStep } = deps;
    const stepMax = Number.isFinite(deps.stepMax) ? deps.stepMax : Infinity;
    const onOvershoot = typeof deps.onOvershoot === 'function' ? deps.onOvershoot : null;
    const hasDeadline = Number.isFinite(deps.deadlineMs) && typeof deps.now === 'function';
    const deadlineMs = hasDeadline ? deps.deadlineMs : Infinity;
    const now = hasDeadline ? deps.now : null;
    const clockCheckStride = Number.isFinite(deps.clockCheckStride) && deps.clockCheckStride > 0 ? deps.clockCheckStride : 8;
    const startTime = hasDeadline ? now() : 0;

    let done = 0;
    let n = 0;
    let throttledByDeadline = false;
    let primaryError = null;
    try {
      while (done < want && n < stepMax) {
        const sdt = pickDt();
        if (!Number.isFinite(sdt) || sdt <= 0) break;
        try {
          physicsStep(sdt);
        } catch (error) {
          // Preserve the amount of fully committed substep time for the
          // coordinator.  The failing substep has not returned and therefore
          // is not part of `done`.
          if (error && typeof error === 'object' && !Number.isFinite(error.actualAdvancedDelta)) {
            error.actualAdvancedDelta = done;
          }
          throw error;
        }
        done += sdt;
        n++;
        if (done > want && onOvershoot) onOvershoot(done - want);
        if (hasDeadline && n % clockCheckStride === 0) {
          if (now() - startTime >= deadlineMs) {
            throttledByDeadline = done < want;
            break;
          }
        }
      }
    } catch (error) {
      primaryError = error;
      throw error;
    } finally {
      try {
        if (typeof deps.onComplete === 'function') deps.onComplete({ done, steps: n, stepMaxHit: done < want && n >= stepMax, throttledByDeadline });
      } catch (completionError) {
        if (!primaryError) throw completionError;
      }
    }
    if (!hasDeadline) return done;
    if (!throttledByDeadline) throttledByDeadline = done < want && n >= stepMax ? false : throttledByDeadline;
    return { done, steps: n, throttledByDeadline };
  }

  SGRA.Physics.advanceAdaptive = advanceAdaptive;
})(typeof window !== 'undefined' ? window : globalThis);
