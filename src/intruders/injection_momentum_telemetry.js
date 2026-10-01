// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachInjectionMomentumTelemetry(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Intruders = SGRA.Intruders || {};

  const FRAME_POLICY_ID = 'original-frame-no-boost';
  const BOOST_CURRENTLY_EXISTS = false;
  const MOMENTUM_PARTICIPANT_RULE = 'all-live-bodies-with-finite-mass-and-velocity';
  const NON_FINITE_STATE_HANDLING = 'record-invalid-transaction';
  const TRANSACTION_SCHEMA_VERSION = 1;

  function cloneVector(value) {
    return [Number(value[0]), Number(value[1]), Number(value[2])];
  }

  function cloneVectorOrNaN(value) {
    return allFiniteVector(value) ? cloneVector(value) : [NaN, NaN, NaN];
  }

  function subtractVectors(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function scaleVector(scale, vector) {
    return [scale * vector[0], scale * vector[1], scale * vector[2]];
  }

  function gammaN(n) {
    const eps = Number.EPSILON;
    const neps = n * eps;
    if (!(neps < 1)) return Infinity;
    return neps / (1 - neps);
  }

  function allFiniteVector(vector) {
    return Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite);
  }

  function copyIdList(ids) {
    return ids.map((id) => Number(id));
  }

  function snapshotSystemMomentum(bodies) {
    const list = Array.isArray(bodies) ? bodies : [];
    let totalMass = 0;
    let totalMassAbs = 0;
    const momentum = [0, 0, 0];
    const contributionAbs = [0, 0, 0];
    const participantIds = [];
    let centralBodyIncluded = false;
    let fieldBodiesIncluded = false;
    let capturedBodiesIncluded = false;

    for (let i = 0; i < list.length; i++) {
      const body = list[i];
      if (!body) continue;
      const id = body.id;
      const mass = body.m;
      const velocity = [body.vx, body.vy, body.vz];
      if (!Number.isFinite(id)) {
        return Object.freeze({
          valid: false,
          reason: 'non_finite_body_id',
          bodyName: body.name || null,
          participantRule: MOMENTUM_PARTICIPANT_RULE,
          nonFiniteStateHandling: NON_FINITE_STATE_HANDLING
        });
      }
      if (!Number.isFinite(mass) || !allFiniteVector(velocity)) {
        return Object.freeze({
          valid: false,
          reason: 'non_finite_participant',
          bodyId: id,
          bodyName: body.name || null,
          participantRule: MOMENTUM_PARTICIPANT_RULE,
          nonFiniteStateHandling: NON_FINITE_STATE_HANDLING
        });
      }
      participantIds.push(id);
      if (body.bh) centralBodyIncluded = true;
      if (body.field) fieldBodiesIncluded = true;
      if (body.captured) capturedBodiesIncluded = true;
      totalMass += mass;
      totalMassAbs += Math.abs(mass);
      const px = mass * velocity[0];
      const py = mass * velocity[1];
      const pz = mass * velocity[2];
      momentum[0] += px;
      momentum[1] += py;
      momentum[2] += pz;
      contributionAbs[0] += Math.abs(px);
      contributionAbs[1] += Math.abs(py);
      contributionAbs[2] += Math.abs(pz);
    }

    return Object.freeze({
      valid: true,
      totalMass,
      totalMassAbs,
      momentum: cloneVector(momentum),
      contributionAbs: cloneVector(contributionAbs),
      participantCount: participantIds.length,
      participantIds: copyIdList(participantIds),
      participantRule: MOMENTUM_PARTICIPANT_RULE,
      centralBodyIncluded,
      fieldBodiesIncluded,
      capturedBodiesIncluded,
      nonFiniteStateHandling: NON_FINITE_STATE_HANDLING
    });
  }

  function compareParticipantSets(beforeIds, afterIds, injectedId) {
    const beforeSet = new Set(beforeIds);
    const afterSet = new Set(afterIds);
    const addedIds = [];
    const removedIds = [];
    for (const id of afterSet) {
      if (!beforeSet.has(id)) addedIds.push(id);
    }
    for (const id of beforeSet) {
      if (!afterSet.has(id)) removedIds.push(id);
    }
    const changedByExactlyOne = removedIds.length === 0 && addedIds.length === 1 && addedIds[0] === injectedId;
    return Object.freeze({
      addedIds: copyIdList(addedIds),
      removedIds: copyIdList(removedIds),
      changedByExactlyOne
    });
  }

  function buildArithmeticToleranceDetails(beforeSnapshot, afterSnapshot, expectedVector, massDeltaExpected) {
    const nTerms = beforeSnapshot.participantCount + afterSnapshot.participantCount + 4;
    const gamma = gammaN(nTerms);
    const perComponent = [0, 1, 2].map((axis) => gamma * (
      beforeSnapshot.contributionAbs[axis] +
      afterSnapshot.contributionAbs[axis] +
      Math.abs(expectedVector[axis])
    ));
    const massTolerance = gamma * (beforeSnapshot.totalMassAbs + afterSnapshot.totalMassAbs + Math.abs(massDeltaExpected));
    return Object.freeze({
      method: `gamma_n forward-error bound with n=${nTerms}, gamma_n=n*eps/(1-n*eps), component scale=sum|p_before_i|+sum|p_after_i|+|expected_delta|`,
      per_component: cloneVector(perComponent),
      mass: massTolerance
    });
  }

  function validateInjectionMomentumDiscontinuity({ beforeSnapshot, afterSpawnSnapshot, injectedBody, velocityPreBoost }) {
    const fallback = {
      expectedSpawnDelta: [NaN, NaN, NaN],
      actualSpawnDelta: [NaN, NaN, NaN],
      spawnResidual: [NaN, NaN, NaN],
      tolerance: { method: 'unavailable', per_component: [NaN, NaN, NaN], mass: NaN },
      participantSetChange: { addedIds: [], removedIds: [], changedByExactlyOne: false },
      passed: false,
      reasons: []
    };
    if (!beforeSnapshot.valid || !afterSpawnSnapshot.valid) {
      return Object.freeze({
        ...fallback,
        reasons: [
          { kind: 'invalid_snapshot', beforeValid: beforeSnapshot.valid, afterValid: afterSpawnSnapshot.valid, beforeReason: beforeSnapshot.reason || null, afterReason: afterSpawnSnapshot.reason || null }
        ]
      });
    }
    if (!Number.isFinite(injectedBody && injectedBody.id) || !Number.isFinite(injectedBody && injectedBody.m) || !allFiniteVector(velocityPreBoost)) {
      return Object.freeze({
        ...fallback,
        reasons: [{ kind: 'invalid_injected_body_metadata' }]
      });
    }

    const participantSetChange = compareParticipantSets(beforeSnapshot.participantIds, afterSpawnSnapshot.participantIds, injectedBody.id);
    const expectedSpawnDelta = scaleVector(injectedBody.m, velocityPreBoost);
    const actualSpawnDelta = subtractVectors(afterSpawnSnapshot.momentum, beforeSnapshot.momentum);
    const spawnResidual = subtractVectors(actualSpawnDelta, expectedSpawnDelta);
    const massDeltaActual = afterSpawnSnapshot.totalMass - beforeSnapshot.totalMass;
    const massDeltaExpected = injectedBody.m;
    const tolerance = buildArithmeticToleranceDetails(beforeSnapshot, afterSpawnSnapshot, expectedSpawnDelta, massDeltaExpected);
    const reasons = [];

    if (!participantSetChange.changedByExactlyOne) {
      reasons.push({ kind: 'participant_set_changed_unexpectedly', addedIds: participantSetChange.addedIds, removedIds: participantSetChange.removedIds });
    }
    if (afterSpawnSnapshot.participantCount - beforeSnapshot.participantCount !== 1) {
      reasons.push({ kind: 'participant_count_delta_mismatch', before: beforeSnapshot.participantCount, after: afterSpawnSnapshot.participantCount });
    }
    if (Math.abs(massDeltaActual - massDeltaExpected) > tolerance.mass) {
      reasons.push({ kind: 'mass_delta_mismatch', expected: massDeltaExpected, actual: massDeltaActual, tolerance: tolerance.mass });
    }
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(spawnResidual[axis]) > tolerance.per_component[axis]) {
        reasons.push({
          kind: 'momentum_delta_mismatch',
          axis,
          expected: expectedSpawnDelta[axis],
          actual: actualSpawnDelta[axis],
          residual: spawnResidual[axis],
          tolerance: tolerance.per_component[axis]
        });
      }
    }

    return Object.freeze({
      expectedSpawnDelta: cloneVector(expectedSpawnDelta),
      actualSpawnDelta: cloneVector(actualSpawnDelta),
      spawnResidual: cloneVector(spawnResidual),
      tolerance: Object.freeze({
        method: tolerance.method,
        per_component: cloneVector(tolerance.per_component),
        mass: tolerance.mass
      }),
      participantSetChange,
      passed: reasons.length === 0,
      reasons
    });
  }

  function validateComBoostTransformation({
    afterSpawnSnapshot,
    afterBoostSnapshot,
    boostApplied,
    vCOM,
    bodyVelocityTransitions = []
  }) {
    if (!afterSpawnSnapshot.valid || !afterBoostSnapshot.valid) {
      return Object.freeze({
        applicable: !!boostApplied,
        passed: false,
        reasons: [{ kind: 'invalid_snapshot_for_boost_validation' }]
      });
    }
    if (!boostApplied) {
      const zeroVector = [0, 0, 0];
      const tolerance = buildArithmeticToleranceDetails(afterSpawnSnapshot, afterBoostSnapshot, zeroVector, 0);
      const residual = subtractVectors(afterBoostSnapshot.momentum, afterSpawnSnapshot.momentum);
      const reasons = [];
      if (vCOM !== null) reasons.push({ kind: 'boost_marked_absent_but_v_com_present' });
      for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(residual[axis]) > tolerance.per_component[axis]) {
          reasons.push({ kind: 'no_boost_momentum_mismatch', axis, residual: residual[axis], tolerance: tolerance.per_component[axis] });
        }
      }
      return Object.freeze({
        applicable: false,
        passed: null,
        reasons,
        residual: cloneVector(residual),
        tolerance: Object.freeze({
          method: tolerance.method,
          per_component: cloneVector(tolerance.per_component)
        })
      });
    }

    if (!allFiniteVector(vCOM)) {
      return Object.freeze({
        applicable: true,
        passed: false,
        reasons: [{ kind: 'invalid_v_com' }]
      });
    }
    const expectedDelta = scaleVector(afterSpawnSnapshot.totalMass, vCOM);
    const actualAfterBoost = afterBoostSnapshot.momentum;
    const expectedAfterBoost = subtractVectors(afterSpawnSnapshot.momentum, expectedDelta);
    const residual = subtractVectors(actualAfterBoost, expectedAfterBoost);
    const tolerance = buildArithmeticToleranceDetails(afterSpawnSnapshot, afterBoostSnapshot, expectedDelta, 0);
    const reasons = [];
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(residual[axis]) > tolerance.per_component[axis]) {
        reasons.push({ kind: 'boost_momentum_mismatch', axis, residual: residual[axis], tolerance: tolerance.per_component[axis] });
      }
    }
    for (const transition of bodyVelocityTransitions) {
      const before = transition.before;
      const after = transition.after;
      if (!allFiniteVector(before) || !allFiniteVector(after)) {
        reasons.push({ kind: 'invalid_body_velocity_transition', bodyId: transition.bodyId });
        continue;
      }
      for (let axis = 0; axis < 3; axis++) {
        const shifted = before[axis] - vCOM[axis];
        const tol = gammaN(5) * (Math.abs(before[axis]) + Math.abs(after[axis]) + Math.abs(vCOM[axis]));
        if (Math.abs(after[axis] - shifted) > tol) {
          reasons.push({ kind: 'body_velocity_shift_mismatch', bodyId: transition.bodyId, axis, expected: shifted, actual: after[axis], tolerance: tol });
        }
      }
    }
    return Object.freeze({
      applicable: true,
      passed: reasons.length === 0,
      reasons,
      expectedAfterBoost: cloneVector(expectedAfterBoost),
      actualAfterBoost: cloneVector(actualAfterBoost),
      residual: cloneVector(residual),
      tolerance: Object.freeze({
        method: tolerance.method,
        per_component: cloneVector(tolerance.per_component)
      })
    });
  }

  function buildInjectionTransaction({
    frameContext,
    injectedBody,
    velocityPreBoost,
    beforeSnapshot,
    afterSpawnSnapshot,
    afterBoostSnapshot,
    boostApplied = false,
    vCOM = null,
    bodyVelocityTransitions = [],
    provenance = null
  }) {
    const discontinuity = validateInjectionMomentumDiscontinuity({
      beforeSnapshot,
      afterSpawnSnapshot,
      injectedBody,
      velocityPreBoost
    });
    const boostValidation = validateComBoostTransformation({
      afterSpawnSnapshot,
      afterBoostSnapshot,
      boostApplied,
      vCOM,
      bodyVelocityTransitions
    });
    return Object.freeze({
      schema_version: TRANSACTION_SCHEMA_VERSION,
      epoch: Number(frameContext && frameContext.epoch),
      frame_index: Number(frameContext && frameContext.frameIndex),
      step_index: Number(frameContext && frameContext.stepIndex),
      frame_policy_id: FRAME_POLICY_ID,
      pinned: !!(frameContext && frameContext.pinned),
      boost_applied: !!boostApplied,
      injected_body: Object.freeze({
        id: Number(injectedBody.id),
        name: injectedBody.name || null,
        role: injectedBody.intr ? 'intr' : (injectedBody.star ? 'core' : (injectedBody.field ? 'field' : (injectedBody.bh ? 'bh' : 'core'))),
        mass: Number(injectedBody.m),
        velocity_pre_boost: cloneVector(velocityPreBoost),
        x: Number(injectedBody.x), y: Number(injectedBody.y), z: Number(injectedBody.z),
        vx: Number(injectedBody.vx), vy: Number(injectedBody.vy), vz: Number(injectedBody.vz),
        ownership: injectedBody.__fidelityOwnership?.owner || null,
        classifier: injectedBody.__fidelityOwnership?.classifier || null,
        rung: injectedBody.__fidelityOwnership?.rung ?? null,
        canonical_state: injectedBody.__kerrState ? Array.from(injectedBody.__kerrState) : null,
        kerr_units: injectedBody.__kerrUnits || null,
        kerr_spin_context: injectedBody.__kerrSpinContext || null
      }),
      creation_source: provenance?.source || 'UI_OR_API_LAUNCH_UNSPECIFIED',
      requested_inputs: provenance?.requestedInputs || null,
      relative_state: provenance?.relativeState || null,
      random: provenance?.random || null,
      participant_count_before: beforeSnapshot.participantCount,
      participant_count_after: afterSpawnSnapshot.participantCount,
      total_mass_before: beforeSnapshot.totalMass,
      total_mass_after: afterSpawnSnapshot.totalMass,
      p_before_spawn: cloneVectorOrNaN(beforeSnapshot.momentum),
      p_after_spawn_before_boost: cloneVectorOrNaN(afterSpawnSnapshot.momentum),
      p_after_boost: cloneVectorOrNaN(afterBoostSnapshot.momentum),
      expected_spawn_delta: cloneVectorOrNaN(discontinuity.expectedSpawnDelta),
      actual_spawn_delta: cloneVectorOrNaN(discontinuity.actualSpawnDelta),
      spawn_residual: cloneVectorOrNaN(discontinuity.spawnResidual),
      v_COM: boostApplied ? cloneVector(vCOM) : null,
      tolerance: Object.freeze({
        method: discontinuity.tolerance.method,
        per_component: cloneVector(discontinuity.tolerance.per_component)
      }),
      injection_gate_passed: discontinuity.passed,
      boost_gate_applicable: boostValidation.applicable,
      boost_gate_passed: boostValidation.passed,
      mass_tolerance: discontinuity.tolerance.mass,
      participant_rule: MOMENTUM_PARTICIPANT_RULE,
      central_body_included: afterSpawnSnapshot.centralBodyIncluded,
      field_bodies_included: afterSpawnSnapshot.fieldBodiesIncluded,
      captured_bodies_included: afterSpawnSnapshot.capturedBodiesIncluded,
      non_finite_state_handling: NON_FINITE_STATE_HANDLING,
      participant_set_change: Object.freeze({
        added_ids: copyIdList(discontinuity.participantSetChange.addedIds),
        removed_ids: copyIdList(discontinuity.participantSetChange.removedIds)
      }),
      injection_gate_reasons: discontinuity.reasons.map((reason) => Object.freeze({ ...reason })),
      boost_gate_reasons: boostValidation.reasons ? boostValidation.reasons.map((reason) => Object.freeze({ ...reason })) : []
    });
  }

  const api = Object.freeze({
    FRAME_POLICY_ID,
    BOOST_CURRENTLY_EXISTS,
    MOMENTUM_PARTICIPANT_RULE,
    NON_FINITE_STATE_HANDLING,
    TRANSACTION_SCHEMA_VERSION,
    snapshotSystemMomentum,
    validateInjectionMomentumDiscontinuity,
    validateComBoostTransformation,
    buildInjectionTransaction
  });

  SGRA.Intruders.InjectionMomentumTelemetry = api;
})(typeof window !== 'undefined' ? window : globalThis);
