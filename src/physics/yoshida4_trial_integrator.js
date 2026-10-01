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

  // ---------------------------------------------------------------------
  // Yoshida-4 high-precision integrator composition.
  //
  // PRODUCT CONTEXT: this is one of two permanent, user/host-selectable
  // integration paths, not a temporary trial flag to be deleted later:
  //   'plain'          -- current single-kick-drift-kick step. High
  //                        performance, the existing default.
  //   'yoshida4_trial'  -- three-substep 4th-order composition of the SAME,
  //                        unmodified physicsStep() primitive. High
  //                        precision (bench-validated: 23x-4360x accuracy
  //                        improvement across 16 regime/geometry fixtures,
  //                        see SGRA-PHASE-1-YOSHIDA4-BROAD-VALIDATION.md),
  //                        at exactly 3x the force evaluations.
  // 'plain' remains the default and is not scheduled for removal. Both
  // paths are expected to persist; 'plain' would only be pruned if future,
  // separate performance work established the precision path is cheap
  // enough on low-end/mobile hardware to make the performance path
  // unnecessary -- a product decision this module does not make and a
  // performance-optimisation question explicitly out of scope for this
  // change (see SGRA-PHASE-1-YOSHIDA4-PRODUCTION-TRIAL.md).
  //
  // TRANSACTIONAL SAFETY (required, not optional -- see the independent
  // review this module implements): the three Yoshida substeps run against
  // a snapshot of every field src/physics/local_step_integrator.js's
  // physicsStep() is known (by direct source inspection) to mutate:
  //   - per body: x, y, z, vx, vy, vz, ax, ay, az, aPN, aLT, captured, m,
  //     and the owned __captureEvent record when a local entry is observed
  //   - simulation time (via advanceSimTime)
  // State is validated after EVERY substep (finite, v/c bound, positive
  // finite radius). If any substep's resulting state fails validation, the
  // entire composition is rolled back to the exact pre-composition
  // snapshot and a single ordinary ('plain') step is taken instead from
  // the restored state -- never does a partially-mutated Yoshida state
  // fall through to plain-step fallback.
  //
  // Field-type bodies remain on their own decoupled FieldTracerLane. Under
  // the PO-1 F1 ruling, Yoshida composition applies only to interacting
  // bodies; the field lane consumes the positive outer dt exactly once after
  // a committed composition, or exactly once during the restored plain
  // fallback after a rollback.

  const YOSHIDA_X1 = 1 / (2 - Math.pow(2, 1 / 3));
  const YOSHIDA_X0 = -Math.pow(2, 1 / 3) / (2 - Math.pow(2, 1 / 3));

  // Hard validity bound for v/c during intermediate substeps. Deliberately
  // conservative relative to c itself (1.0): every bench-validated fixture
  // stayed at or below v/c~0.4 (S6, the most extreme validated case), so a
  // bound of 0.9 gives a wide, explicit margin above anything validated
  // while still catching genuine breakdown before it reaches c.
  const MAX_VALID_V_OVER_C = 0.9;

  let lastEvent = null; // bounded, single most-recent event, not a growing log
  let rollbackCount = 0;
  let trialStepCount = 0;
  let lastOutcomeReason = null;
  // BUGFIX (found by independent code review): previously there was no
  // way for anything outside this module to tell whether a given outer
  // step actually ran the Yoshida composition, rolled back to plain, or
  // was skipped entirely (e.g. a field-type body present) while
  // 'yoshida4_trial' mode was selected -- local_js_physics_core.js
  // discarded physicsStepTrial()'s return value entirely. Fixed: the
  // caller now reports which outcome occurred via this counter set.
  const compositionOutcomeCounts = { trial_committed: 0, trial_rolled_back_to_plain: 0, plain_trial_mode_skipped: 0 };

  function recordCompositionOutcome(outcome, reason = null) {
    if (Object.prototype.hasOwnProperty.call(compositionOutcomeCounts, outcome)) {
      compositionOutcomeCounts[outcome]++;
      lastOutcomeReason = reason;
    }
  }

  let configuredDeps = null;
  function configure(port) {
    if (!port || typeof port.getBodies !== 'function' || typeof port.getSimTime !== 'function') {
      throw new TypeError('Yoshida4TrialIntegrator requires explicit world and clock ports');
    }
    configuredDeps = Object.freeze(new Proxy({}, { get: (_target, key) => port[key], set: (_target, key, value) => { port[key] = value; return true; }, has: (_target, key) => key in port }));
    return configuredDeps;
  }
  function deps() {
    return configuredDeps || {};
  }

  function getBodies() {
    const d = deps();
    if (typeof d.getBodies === 'function') return d.getBodies();
    throw new Error('Yoshida4TrialIntegrator: getBodies() is not wired.');
  }

  function getSimTime() {
    const d = deps();
    if (typeof d.getSimTime === 'function') return d.getSimTime();
    throw new Error('Yoshida4TrialIntegrator: getSimTime() is not wired.');
  }

  function setSimTime(t) {
    const d = deps();
    if (typeof d.setSimTime === 'function') { d.setSimTime(t); return; }
    // Fallback: some harnesses only expose advanceSimTime (delta-based),
    // not an absolute setter. Reconstruct via delta from current time.
    if (typeof d.advanceSimTime === 'function') {
      const current = getSimTime();
      d.advanceSimTime(t - current);
      return;
    }
    throw new Error('Yoshida4TrialIntegrator: no way to restore simulation time (need setSimTime or advanceSimTime).');
  }

  // BUGFIX (found by this module's own empirical snapshot-completeness
  // audit test, tests/yoshida4_trial_integrator.test.mjs -- not found by
  // source reading alone): src/physics/local_events.js's observeSubstep()
  // (called inside physicsStep, once per substep) also mutates
  // `b.legMinR`, tracking the minimum radius seen during the current
  // orbital "leg" for pericentre-detection purposes. This was missing
  // from the original field list, which only covered `captured` from
  // that same function. `checkPericentre()`'s own fields (prevR, prevDR,
  // lastPeriT, bhCloseFlashArmed) are confirmed by source inspection to
  // run once per full advance() call (outside any single Yoshida
  // composition's scope, per that function's own comment: "notifications
  // and array mutation remain in the once-per-advance event pass"), so
  // they do not need to be in this per-composition snapshot -- but that
  // claim is exactly the kind of thing the empirical audit test below is
  // designed to keep honest rather than trusted from a single reading.
  // ADDITION (central-spin tranche): 'aLT'. physicsStep() -> computeAccel()
  // now zeroes and writes b.aLT exactly where it zeroes and writes b.aPN, so
  // aLT is mutated by every substep and MUST be part of the transactional
  // snapshot. Omitting it would leave a rolled-back body carrying an aLT from
  // an abandoned substep, which the timestep policy then reads -- a silent
  // cross-contamination of a discarded state into the retry. This is not
  // assumed harmless: tests/yoshida4_snapshot_completeness.test.mjs is the
  // empirical audit that keeps this list honest, and it was extended to
  // cover aLT rather than left to pass by only checking the old fields.
  const BODY_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'ax', 'ay', 'az', 'aPN', 'aLT', 'captured', 'm', 'legMinR'];

  function cloneCaptureEvent(value) {
    if (value == null || typeof value !== 'object') return value;
    if (ArrayBuffer.isView(value)) return new value.constructor(value);
    if (Array.isArray(value)) return value.map(cloneCaptureEvent);
    const clone = {};
    for (const key of Object.keys(value)) clone[key] = cloneCaptureEvent(value[key]);
    return clone;
  }

  function snapshotState() {
    const list = getBodies();
    const bodies = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const s = { __id: b.id };
      for (const f of BODY_FIELDS) s[f] = b[f];
      s.__captureEventPresent = Object.hasOwn(b, '__captureEvent');
      if (s.__captureEventPresent) s.__captureEvent = cloneCaptureEvent(b.__captureEvent);
      bodies[i] = s;
    }
    return { bodies, simT: getSimTime() };
  }

  function restoreState(snapshot) {
    const list = getBodies();
    if (list.length !== snapshot.bodies.length) {
      throw new Error('Yoshida4TrialIntegrator: body list length changed during composition -- cannot safely restore (structural mutation was not expected and is not covered by this snapshot).');
    }
    // BUGFIX (found by independent code review): the previous version
    // only checked array length, not identity -- if bodies were reordered
    // or replaced at the same indices during the composition (e.g. by an
    // event handler), state could silently be restored onto the wrong
    // object. Bodies are expected to carry a stable `id` field throughout
    // this codebase; verify it at each index rather than assume ordering
    // held. This turns a previously-unverified assumption into a checked
    // invariant that fails loudly (throws) instead of mis-restoring
    // silently.
    for (let i = 0; i < list.length; i++) {
      if (list[i].id !== snapshot.bodies[i].__id) {
        throw new Error(`Yoshida4TrialIntegrator: body identity at index ${i} changed during composition (expected id=${snapshot.bodies[i].__id}, found id=${list[i].id}) -- cannot safely restore. This indicates a body list reorder/replace occurred mid-composition, which this transactional wrapper does not currently support.`);
      }
    }
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      const s = snapshot.bodies[i];
      for (const f of BODY_FIELDS) b[f] = s[f];
      if (s.__captureEventPresent) b.__captureEvent = cloneCaptureEvent(s.__captureEvent);
      else delete b.__captureEvent;
    }
    setSimTime(snapshot.simT);
  }

  function isFiniteState() {
    const list = getBodies();
    for (const b of list) {
      if (b.captured) continue;
      for (const f of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'ax', 'ay', 'az']) {
        if (!Number.isFinite(b[f])) return false;
      }
    }
    return true;
  }

  function peakVOverC() {
    const Constants = SGRA.Domain && SGRA.Domain.Constants;
    const c = Constants && Constants.C_AUYR;
    if (!Number.isFinite(c) || c <= 0) return 0; // constants not wired (e.g. isolated unit test) -- caller should not rely on this check in that case
    const list = getBodies();
    let peak = 0;
    for (const b of list) {
      if (b.bh || b.captured) continue;
      const v = Math.hypot(b.vx, b.vy, b.vz);
      peak = Math.max(peak, v / c);
    }
    return peak;
  }

  function minRadiusFinitePositive() {
    const list = getBodies();
    let minR = Infinity;
    let sawAny = false;
    for (const b of list) {
      if (b.bh || b.captured) continue;
      sawAny = true;
      const r = Math.hypot(b.x, b.y, b.z);
      if (!Number.isFinite(r)) return { ok: false, minR: NaN };
      minR = Math.min(minR, r);
    }
    // BUGFIX (found by independent code review, not caught by the original
    // author): the previous condition was
    //   `minR > 0 || !Number.isFinite(minR) === false`
    // `!Number.isFinite(minR) === false` reduces to `Number.isFinite(minR)`,
    // which is true for ANY finite number -- so the `minR > 0` check was
    // entirely dead, and a negative or zero (but finite) radius incorrectly
    // passed validation. Verified directly: with minR=-5, the old
    // expression evaluated to `true`. Fixed to the actually-intended
    // logic: if there is at least one non-BH, non-captured body, its
    // minimum radius must be finite AND strictly positive; if there are
    // no such bodies, there is nothing to validate and this check trivially
    // passes (represented explicitly, not via the same finite-number
    // loophole that caused the original bug).
    if (!sawAny) return { ok: true, minR: Infinity };
    return { ok: Number.isFinite(minR) && minR > 0, minR };
  }

  function validateIntermediateState() {
    if (!isFiniteState()) return { ok: false, reason: 'non-finite-state' };
    const rCheck = minRadiusFinitePositive();
    if (!rCheck.ok) return { ok: false, reason: 'non-finite-or-nonpositive-radius', minR: rCheck.minR };
    const vOverC = peakVOverC();
    if (vOverC >= MAX_VALID_V_OVER_C) return { ok: false, reason: 'v-over-c-bound-exceeded', vOverC };
    return { ok: true, minR: rCheck.minR, vOverC };
  }

  /**
   * Whether the trial composition should even be attempted for the
   * upcoming outer step.
   */
  function getTrialEligibility(capabilities = {}) {
    if (capabilities.fidelityMode === 'adaptive_kerr') {
      return { eligible: false, reason: 'adaptive-kerr-signed-substeps-unsupported' };
    }
    return { eligible: true, reason: null };
  }

  function shouldAttemptTrial(capabilities = {}) {
    return getTrialEligibility(capabilities).eligible;
  }

  function withSuspendedFieldLaneAccumulation(fn) {
    const d = deps();
    const previous = d.__sgraFieldLaneAccumulationSuspended === true;
    d.__sgraFieldLaneAccumulationSuspended = true;
    try {
      return fn();
    } finally {
      d.__sgraFieldLaneAccumulationSuspended = previous;
    }
  }

  function accumulateFieldLaneOuterDt(dtOuter) {
    const lane = SGRA.Physics.FieldTracerLane;
    if (!lane) return;
    const list = getBodies();
    const perf = deps().perfBaseline;
    if (perf?.isRecording?.()) {
      const fieldBodyCount = list.filter(body => body && body.field && !body.captured).length;
      perf.recordAttribution?.('field_lane', { active: true, fieldBodies: fieldBodyCount });
      const run = () => lane.accumulate(list, dtOuter);
      perf.measure ? perf.measure('field_lane_ms', run) : run();
    } else {
      lane.accumulate(list, dtOuter);
    }
  }

  /**
   * Runs one Yoshida-4 outer composition (three substeps of the
   * unmodified plainPhysicsStep, coefficients x1,x0,x1) transactionally.
   * `plainPhysicsStep` is injected by the caller (local_js_physics_core.js)
   * so this module never directly depends on LocalStepIntegrator, keeping
   * the coupling explicit and one-directional.
   *
   * Returns { committed: boolean, rolledBack: boolean, telemetry }.
   * On rollback, state is restored to exactly the pre-composition
   * snapshot and ONE plain step of size dtOuter is taken from that
   * restored state before returning -- the composition and the fallback
   * are never mixed.
   */
  /**
   * ADVISORY preflight check, not a hard gate -- explicitly not claimed to
   * be a validated bound (see independent review item 9: "there is no
   * visible preflight asking whether the larger backward substep
   * satisfies the timestep policy's local assumptions"). Tied directly to
   * the actual failure mechanism diagnosed during bench validation: the
   * original close-approach failure was a single step whose predicted
   * displacement (|v|*dt) grossly exceeded the body's own current radius
   * (r=2.24 AU with a step implying landing near r=276 AU). This flags
   * (via telemetry, not by blocking) any substep whose predicted
   * displacement exceeds `overshootRatio` times the body's current
   * radius. The existing post-hoc validateIntermediateState() check
   * remains the actual, PROVEN (via the rollback tests) safety mechanism
   * -- this is a diagnostic signal for tuning/monitoring, not a
   * substitute for it.
   */
  function estimateSubstepOvershoot(dtOuter, overshootRatio = 2) {
    const list = getBodies();
    let worstRatio = 0;
    for (const b of list) {
      if (b.bh || b.captured) continue;
      const r = Math.hypot(b.x, b.y, b.z);
      if (!(r > 0)) continue;
      const v = Math.hypot(b.vx, b.vy, b.vz);
      const predictedDisplacement = v * Math.abs(YOSHIDA_X0) * dtOuter; // the largest-magnitude substep
      worstRatio = Math.max(worstRatio, predictedDisplacement / r);
    }
    return { worstRatio, advisoryFlag: worstRatio > overshootRatio };
  }

  function physicsStepTrial(dtOuter, plainPhysicsStep) {
    trialStepCount++;
    const snapshot = snapshotState();
    // BUGFIX (found by independent code review, round 3): this advisory
    // check was previously defined and exported but never actually
    // called from anywhere -- dead API surface, contradicting the
    // earlier claim that it was "wired into telemetry." Fixed: computed
    // here, every composition, and included in the returned telemetry
    // and in `lastEvent` unconditionally (not just when flagged) so a
    // caller can inspect the overshoot ratio for any step, not only
    // discover it after something already went wrong.
    const overshoot = estimateSubstepOvershoot(dtOuter);
    const substeps = [YOSHIDA_X1 * dtOuter, YOSHIDA_X0 * dtOuter, YOSHIDA_X1 * dtOuter];
    const substepTelemetry = [];
    let maxSubstepMagnitude = 0;
    let failure = null;

    withSuspendedFieldLaneAccumulation(() => {
      for (let i = 0; i < substeps.length; i++) {
        const sub = substeps[i];
        maxSubstepMagnitude = Math.max(maxSubstepMagnitude, Math.abs(sub));
        let threw = null;
        try {
          plainPhysicsStep(sub);
        } catch (err) {
          threw = err;
        }
        const validation = threw ? { ok: false, reason: 'exception', error: String(threw) } : validateIntermediateState();
        substepTelemetry.push({ index: i, signedDt: sub, ok: validation.ok, reason: validation.reason, minR: validation.minR, vOverC: validation.vOverC });
        if (!validation.ok) { failure = validation; break; }
      }
    });

    if (failure) {
      restoreState(snapshot);
      rollbackCount++;
      lastEvent = {
        type: 'rollback', dtOuter, maxSubstepMagnitude, substepTelemetry, failure, overshoot,
        simTAtEvent: snapshot.simT
      };
      if (global.SGRA_DIAG && typeof global.SGRA_DIAG.markDegraded === 'function') {
        global.SGRA_DIAG.markDegraded('Yoshida trial rolled back to plain fallback', {
          subsystem: 'yoshida4',
          actual: 'plain',
          requested: 'yoshida4_trial',
          simTime: snapshot.simT
        });
      }
      // Retry policy: one ordinary plain step from the restored state.
      // See module header -- never fall through from a partially mutated
      // Yoshida state.
      let plainThrew = null;
      try {
        plainPhysicsStep(dtOuter);
      } catch (err) {
        plainThrew = err;
      }
      if (!plainThrew && global.SGRA_DIAG && typeof global.SGRA_DIAG.recordEvent === 'function') {
        global.SGRA_DIAG.recordEvent('PLAIN_FALLBACK_USED', {
          subsystem: 'yoshida4',
          requested: 'yoshida4_trial',
          actual: 'plain',
          reason: failure.reason,
          simTime: snapshot.simT
        });
      }
      return {
        committed: false, rolledBack: true, plainFallbackThrew: plainThrew ? String(plainThrew) : null,
        telemetry: { dtOuter, maxSubstepMagnitude, substepTelemetry, failure, overshoot }
      };
    }

    accumulateFieldLaneOuterDt(dtOuter);
    lastEvent = { type: 'committed', dtOuter, maxSubstepMagnitude, substepTelemetry, overshoot };
    return {
      committed: true, rolledBack: false,
      telemetry: { dtOuter, maxSubstepMagnitude, substepTelemetry, overshoot }
    };
  }

  function getTrialTelemetry() {
    return Object.freeze({ trialStepCount, rollbackCount, lastEvent, lastOutcomeReason, compositionOutcomeCounts: { ...compositionOutcomeCounts } });
  }

  function resetTrialTelemetry() {
    trialStepCount = 0;
    rollbackCount = 0;
    lastEvent = null;
    lastOutcomeReason = null;
    compositionOutcomeCounts.trial_committed = 0;
    compositionOutcomeCounts.trial_rolled_back_to_plain = 0;
    compositionOutcomeCounts.plain_trial_mode_skipped = 0;
  }

  SGRA.Physics.Yoshida4TrialIntegrator = Object.freeze({
    configure, physicsStepTrial,
    shouldAttemptTrial,
    getTrialEligibility,
    snapshotState,
    restoreState,
    validateIntermediateState,
    estimateSubstepOvershoot,
    getTrialTelemetry,
    resetTrialTelemetry,
    recordCompositionOutcome,
    YOSHIDA_X1,
    YOSHIDA_X0,
    MAX_VALID_V_OVER_C
  });
})(typeof window !== 'undefined' ? window : globalThis);
