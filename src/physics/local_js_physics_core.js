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

  const Constants = SGRA.Domain && SGRA.Domain.Constants;
  const LocalIntegrator = SGRA.Physics.LocalIntegrator;
  const STEP_MAX = Constants && Number.isFinite(Constants.STEP_MAX) ? Constants.STEP_MAX : 1;

  // PERF plan P0A: bound the uninterrupted main-thread physics work per
  // advance() call. A severe close passage can otherwise force STEP_MAX
  // substeps in one synchronous call, freezing input and rendering even
  // after allocation removal (plan sec 1 item 8).
  //
  // The bounded scheduler remains available as an explicit diagnostic/low-
  // power option, but it is disabled by default. In live close passages the
  // 4/6 ms visual-slice budget deliberately under-delivered simulation time
  // and made the displayed advance rate vary from frame to frame, producing
  // the observed slowdown and heartbeat. The smooth pre-P0A product contract
  // is therefore the default: complete the requested interval (subject only
  // to STEP_MAX), then render. Hosts may opt into a positive deadline only
  // after a measured device-specific acceptance test.
  const DEFAULT_DEADLINE_MS = null;
  const DEFAULT_CLOCK_CHECK_STRIDE = 8;
  let lastAdvanceTelemetry = { done: 0, steps: 0, stepMaxHit: false, throttledByDeadline: false };

  let configuredDeps = null;
  function configure(port) {
    if (!port || typeof port.getBodies !== 'function' || typeof port.getSimTime !== 'function') {
      throw new TypeError('LocalJsPhysicsCore requires explicit world and clock ports');
    }
    configuredDeps = Object.freeze(new Proxy({}, { get: (_target, key) => port[key], set: (_target, key, value) => { port[key] = value; return true; }, has: (_target, key) => key in port }));
    return configuredDeps;
  }
  function localDeps() {
    return configuredDeps || {};
  }

  function resolveDeadlineMs(deps) {
    if (typeof deps.getPhysicsDeadlineMs === 'function') {
      const v = deps.getPhysicsDeadlineMs();
      if (Number.isFinite(v) && v > 0) return v;
      if (v === null || v === false) return null; // explicit opt-out
    }
    return DEFAULT_DEADLINE_MS;
  }

  function resolveNow(deps) {
    if (typeof deps.getNow === 'function') return deps.getNow;
    if (typeof global.performance !== 'undefined' && typeof global.performance.now === 'function') {
      return () => global.performance.now();
    }
    return null;
  }

  function getSchedulerMode(deps) {
    const mode = typeof deps.getSchedulerMode === 'function' ? deps.getSchedulerMode() : 'global';
    return mode === 'block' ? 'block' : 'global';
  }

  const LocalJsPhysicsCore = Object.freeze({
    configure,
    kind: 'local-js',
    advance(want) {
      const deps = localDeps();
      const sampleTrails = typeof deps.showTrails === 'function' && deps.showTrails();
      if (typeof deps.setSubstepTrailSampling === 'function') {
        deps.setSubstepTrailSampling(!!sampleTrails);
      }

      const deadlineMs = resolveDeadlineMs(deps);
      const now = deadlineMs != null ? resolveNow(deps) : null;
      const useDeadline = deadlineMs != null && typeof now === 'function';

      const compositionMode = typeof deps.getIntegratorComposition === 'function' ? deps.getIntegratorComposition() : 'plain';
      const trial = SGRA.Physics.Yoshida4TrialIntegrator;
      if (compositionMode !== 'plain' && compositionMode !== 'yoshida4_trial') {
        throw new Error(`Unknown integrator composition "${compositionMode}"`);
      }
      if (compositionMode === 'yoshida4_trial' && !trial) {
        throw new Error('High precision composition requested, but SGRA.Physics.Yoshida4TrialIntegrator is unavailable.');
      }
      const useTrial = compositionMode === 'yoshida4_trial';
      const fidelityMode = typeof deps.getFidelityMode === 'function' ? deps.getFidelityMode() : null;
      const trialEligibility = useTrial && typeof trial.getTrialEligibility === 'function'
        ? trial.getTrialEligibility({ fidelityMode })
        : { eligible: true, reason: null };

      const runPlainPhysicsStep = dt => {
        const perf = deps.perfBaseline;
        return perf?.measure ? perf.measure('interacting_integrator_ms', () => LocalIntegrator.physicsStep(dt)) : LocalIntegrator.physicsStep(dt);
      };
      // Diagnostic/acceptance seam for BLOCK macrostep convergence.  The
      // production default remains DT_MAX; callers must opt in explicitly.
      const requestedBlockQuantum = Number(deps.blockMacrostepQuantum);
      const blockQuantum = deps.blockExecutionMode === 'block'
        ? (Number.isFinite(requestedBlockQuantum) && requestedBlockQuantum > 0
            ? Math.min(Constants.DT_MAX, requestedBlockQuantum)
            : Constants.DT_MAX)
        : undefined;
      const advanceArgs = {
        want,
        pickDt: LocalIntegrator.pickDt,
        getRequiredDt: deps.getRequiredDt || (body => SGRA.Physics.LocalTimestepPolicy.computeRequiredDt(body, (deps.getBodies?.() || [])[0], { grEnabled: typeof deps.isGrEnabled === 'function' ? deps.isGrEnabled() : undefined })),
        getConstraints: deps.getRungConstraints || ((assignment, bodies) => SGRA.Physics.RungScheduler.buildConstraintEdges(bodies, bodies[0], Constants.DT_MAX, { maxRung: deps.maxRung })),
        onRungTelemetry: deps.onRungTelemetry,
        maxRung: deps.maxRung,
        demotionMargin: deps.demotionMargin,
        tickQuantum: blockQuantum,
        planTickQuantum: blockQuantum,
        macrostepH: blockQuantum,
        forcedRung0: deps.forcedRung0,
        physicsStep(dt) {
          if (useTrial && trialEligibility.eligible && trial.shouldAttemptTrial({ fidelityMode })) {
            // BUGFIX (found by independent code review): the previous
            // version discarded this return value entirely. That meant
            // (a) a committed Yoshida step and a rolled-back-to-plain step
            // were recorded identically by every downstream consumer
            // (SGRA_DIAG, trail sampling) -- no way to distinguish
            // "validated precision happened" from "it silently didn't
            // this step" -- and (b) if the PLAIN FALLBACK step itself
            // also threw (a genuine double failure), that exception was
            // caught inside physicsStepTrial, stringified into
            // `plainFallbackThrew`, and then never inspected by anyone --
            // the outer loop would proceed as though the step succeeded.
            // Fixed: the result is now inspected. A double failure
            // (rollback AND the plain fallback itself throwing) is
            // re-thrown here, deliberately, so it reaches
            // physics_advance_coordinator.js's existing try/catch around
            // the whole advance() call (routes to finishFailure) --
            // exactly the safety net this kind of genuine failure is
            // supposed to hit, not a path that should ever swallow it.
            const perf = deps.perfBaseline;
            // Keep every actual plain substep under the existing integrator
            // scope. The injected function is unchanged; this only prevents
            // Yoshida child work from disappearing into residual time.
            const run = () => trial.physicsStepTrial(dt, runPlainPhysicsStep);
            const result = perf?.measure ? perf.measure('yoshida_composition_ms', run) : run();
            if (result.rolledBack && result.plainFallbackThrew) {
              throw new Error(`Yoshida4 trial: composition rolled back AND the plain fallback step itself failed: ${result.plainFallbackThrew}`);
            }
            trial.recordCompositionOutcome(result.committed ? 'trial_committed' : 'trial_rolled_back_to_plain');
            perf?.recordAttribution?.('yoshida_composition', { substeps: result.committed ? 3 : (result.telemetry?.substepTelemetry?.length || 0) + 1, outcome: result.committed ? 'trial_committed' : 'trial_rolled_back_to_plain' });
          } else if (useTrial) {
            const perf = deps.perfBaseline;
            const run = () => runPlainPhysicsStep(dt);
            perf?.measure ? perf.measure('yoshida_composition_ms', run) : run();
            trial.recordCompositionOutcome('plain_trial_mode_skipped', trialEligibility.reason);
            deps.perfBaseline?.recordAttribution?.('yoshida_composition', { substeps: 1, outcome: 'plain_trial_mode_skipped' });
          } else {
            runPlainPhysicsStep(dt);
          }
          if (global.SGRA_DIAG) {
            try { global.SGRA_DIAG.onAcceptedStep(dt); } catch (_) {}
          }
          if (sampleTrails && typeof deps.recordTrailSample === 'function') {
            deps.recordTrailSample('local-substep');
          }
        },
        // Diagnostic convergence runs may opt into a larger safety ceiling;
        // the production default remains the frozen STEP_MAX constant.
        stepMax: Number.isFinite(deps.stepMax) && deps.stepMax > 0 ? deps.stepMax : STEP_MAX
      };
      if (useDeadline) {
        advanceArgs.deadlineMs = deadlineMs;
        advanceArgs.now = now;
        advanceArgs.clockCheckStride = DEFAULT_CLOCK_CHECK_STRIDE;
      }

      advanceArgs.onComplete = meta => { lastAdvanceTelemetry = meta; };

      let result;
      const ownershipTelemetry = deps.kerrOwnershipTelemetry;
      const physicsToken = ownershipTelemetry?.enabled === true ? ownershipTelemetry.recordPhysicsStarted() : null;
      try {
        const schedulerMode = getSchedulerMode(deps);
        if (schedulerMode === 'block') {
          if (!SGRA.Physics.BlockStepIntegrator?.createBlockStepIntegrator || !SGRA.Physics.BlockStepIntegrator?.createProductionForceExecutor) {
            throw new Error('BLOCK scheduler requires the production two-rung force executor');
          }
          const productionForceExecutor = SGRA.Physics.BlockStepIntegrator.createProductionForceExecutor({ getBodies: deps.getBodies, getSimTime: deps.getSimTime, isGrEnabled: deps.isGrEnabled });
          const realBlock = deps.blockExecutionMode === 'block';
          const block = SGRA.Physics.BlockStepIntegrator.createBlockStepIntegrator({
            scheduler: SGRA.Physics.RungScheduler,
            getBodies: deps.getBodies,
            // Unspecified block mode is the real T5 path. The historical
            // forced-rung-0 behavior is selected explicitly by the T2/T3
            // compatibility callers via forcedRung0/blockExecutionMode.
            forcedRung0: realBlock ? deps.forcedRung0 === true : deps.forcedRung0 !== false,
            executionMode: deps.blockExecutionMode || 'block',
            isGrEnabled: deps.isGrEnabled,
            rungConvention: realBlock ? 'lld' : 'compatibility-t3',
            requireForceExecutor: realBlock,
            forceExecutor: productionForceExecutor
          });
          result = block.advance(advanceArgs);
        } else {
          result = SGRA.Physics.advanceAdaptive(advanceArgs);
        }
      } finally {
        const lane = SGRA.Physics.FieldTracerLane;
        if (lane) {
          const bodies = typeof deps.getBodies === 'function' ? deps.getBodies() : undefined;
          if (bodies) lane.flush(bodies);
        }
        if (ownershipTelemetry?.enabled === true) ownershipTelemetry.recordPhysicsFinished(physicsToken);
      }
      // PERF plan P4 fix (P4_ROOT_CAUSE_AND_FIX.md sec 3): flush any field
      // stars still holding un-integrated accumulated time. This must run
      // on every exit path from the substep loop above -- interval fully
      // consumed, STEP_MAX safety cap hit, or P0A deadline throttle -- all
      // three funnel through this one return point, so an unconditional
      // call here (not inside a branch) covers all of them. Previously this
      // was never called in production at all; only bench/gate scripts
      // called it, so every field star in the live app carried indefinite
      // lag relative to simT.
      // advanceAdaptive returns a bare number when no deadline was supplied,
      // and {done, steps, throttledByDeadline} when one was. Normalise to a
      // bare number here so physics_advance_coordinator.js's existing
      // `Number.isFinite(done)` contract and done<requestedDelta*.97
      // under-delivery check are unaffected by this stage.
      return useDeadline ? result.done : result;
    }
  });

  SGRA.Physics.LocalJsPhysicsCore = Object.freeze({ ...LocalJsPhysicsCore, getLastAdvanceTelemetry: () => ({ ...lastAdvanceTelemetry }) });
})(window);
