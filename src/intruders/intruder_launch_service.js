// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachIntruderLaunchService(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Intruders = SGRA.Intruders || {};

  /**
   * Coordinates insertion of a launched intruder. Holds no reference to
   * `bodies` or `trailData`; every mutation goes through an injected callback.
   *
   * @param {object} deps
   * @param {function} deps.allocateId                 () -> number
   * @param {function} deps.getBlackHole               () -> {x,y,z,vx,vy,vz}
   * @param {function} deps.getBodies                  () -> body[]
   * @param {function} [deps.getFrameContext]          () -> {epoch,frameIndex,stepIndex,pinned}
   * @param {function} deps.appendBody                 (body) -> index
   * @param {function} deps.appendEmptyTrail           () -> void
   * @param {function} deps.enforcePinnedBHFrame       () -> void
   * @param {function} deps.refreshAcceleration        () -> void
   * @param {function} deps.refreshEnergyBaseline      () -> void
   * @param {function} deps.createIntruderBody         (args) -> body
   * @param {function} [deps.snapshotBodyKinematics]   dev-mode only
   * @param {function} [deps.assertExistingBodiesUnchanged]
   * @param {function} [deps.publishInjectionTransaction]
   * @param {function} [deps.isDevMode]                () -> boolean
   * @param {object}   deps.constants                  { LAUNCH_SCALE }
   * @param {object}   deps.captureSurface             authoritative capture-radius helper
   */
  function createLaunchService(deps) {
    const {
      allocateId, getBlackHole, getBodies, getFrameContext, appendBody, appendEmptyTrail,
      enforcePinnedBHFrame,
      refreshAcceleration, refreshEnergyBaseline, createIntruderBody,
      snapshotBodyKinematics, assertExistingBodiesUnchanged, publishInjectionTransaction, isDevMode,
      constants, captureSurface
    } = deps;
    const MomentumTelemetry = SGRA.Intruders && SGRA.Intruders.InjectionMomentumTelemetry;
    const authoritativeCaptureSurface = captureSurface || SGRA.Physics?.CaptureSurface;

    let seq = 0;

    function validateInitialPosition(p1Rel, blackHole) {
      const radius = Math.hypot(p1Rel[0], p1Rel[1], p1Rel[2]);
      const captureRadius = authoritativeCaptureSurface && typeof authoritativeCaptureSurface.radius === 'function'
        ? authoritativeCaptureSurface.radius(blackHole.m)
        : NaN;
      if (Number.isFinite(radius) && Number.isFinite(captureRadius) && radius <= captureRadius) {
        const error = new Error('Intruder cannot start inside the capture boundary. Move the starting position farther from Sgr A*.');
        error.code = 'INTRUDER_START_INSIDE_CAPTURE_BOUNDARY';
        error.radius = radius;
        error.captureRadius = captureRadius;
        throw error;
      }
    }

    function resetSequence() {
      seq = 0;
    }

    /**
     * Commit one intruder. Returns the created body.
     * Ordering is load-bearing: finalize body, snapshot before, insert, snapshot
     * after spawn, apply frame policy, snapshot after policy, then continue the
     * pinned-frame/acceleration/baseline sequence unchanged.
     */
    function launch(p0Rel, p1Rel, mass) {
      if (!Number.isFinite(mass) || mass < 0.001 || mass > 100000) throw new RangeError('Intruder mass must be in [0.001, 100000] solar masses.');
      const blackHole = getBlackHole();
      validateInitialPosition(p1Rel, blackHole);
      const dev = typeof isDevMode === 'function' && isDevMode();
      const beforeSnap = dev && snapshotBodyKinematics ? snapshotBodyKinematics() : null;

      const id = allocateId();
      seq += 1;

      const body = createIntruderBody({
        id,
        seq,
        mass,
        p0Rel,
        p1Rel,
        blackHole,
        launchScale: constants.LAUNCH_SCALE
      });
      const velocityPreBoost = [body.vx, body.vy, body.vz];
      const beforeMomentum = MomentumTelemetry && typeof getBodies === 'function'
        ? MomentumTelemetry.snapshotSystemMomentum(getBodies())
        : null;
      const frameContext = typeof getFrameContext === 'function'
        ? getFrameContext()
        : { epoch: NaN, frameIndex: NaN, stepIndex: NaN, pinned: true };

      appendBody(body);
      appendEmptyTrail();
      const afterSpawnBeforeBoost = MomentumTelemetry && typeof getBodies === 'function'
        ? MomentumTelemetry.snapshotSystemMomentum(getBodies())
        : null;
      const boostApplied = false;
      const vCOM = null;
      const afterBoost = MomentumTelemetry && typeof getBodies === 'function'
        ? MomentumTelemetry.snapshotSystemMomentum(getBodies())
        : null;
      const injectionTransaction = MomentumTelemetry
        ? MomentumTelemetry.buildInjectionTransaction({
          frameContext,
          injectedBody: body,
          velocityPreBoost,
          beforeSnapshot: beforeMomentum,
          afterSpawnSnapshot: afterSpawnBeforeBoost,
          afterBoostSnapshot: afterBoost,
          boostApplied,
          vCOM,
          bodyVelocityTransitions: [],
          provenance: {
            source: 'UI_OR_API_LAUNCH',
            requestedInputs: { mass, p0Rel: [...p0Rel], p1Rel: [...p1Rel], launchScale: constants.LAUNCH_SCALE },
            relativeState: { referenceBodyId: getBlackHole()?.id ?? null, requestedRelativePosition: [...p1Rel], requestedRelativeVelocity: [velocityPreBoost[0] - (getBlackHole()?.vx || 0), velocityPreBoost[1] - (getBlackHole()?.vy || 0), velocityPreBoost[2] - (getBlackHole()?.vz || 0)] }
          }
        })
        : null;
      enforcePinnedBHFrame();

      if (dev && beforeSnap && assertExistingBodiesUnchanged && snapshotBodyKinematics) {
        assertExistingBodiesUnchanged(beforeSnap, snapshotBodyKinematics(), [id], 'intruder launch');
      }

      refreshAcceleration();
      refreshEnergyBaseline();
      const publish = typeof publishInjectionTransaction === 'function'
        ? publishInjectionTransaction
        : global.SGRA_DIAG && typeof global.SGRA_DIAG.recordInjectionTransaction === 'function'
          ? record => global.SGRA_DIAG.recordInjectionTransaction(record)
          : null;
      if (injectionTransaction && publish) {
        publish(injectionTransaction);
      }

      return body;
    }

    function currentSequence() {
      return seq;
    }

    return Object.freeze({ launch, resetSequence, currentSequence });
  }

  SGRA.Intruders.LaunchService = Object.freeze({ createLaunchService });
})(typeof window !== 'undefined' ? window : globalThis);
