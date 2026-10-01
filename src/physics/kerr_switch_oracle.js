(function attachKerrSwitchOracle(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  const VERSION = 'kerr-switch-oracle-v3-sci02-policy-tranche-2026-09-18';
  const VERDICT = Object.freeze({ KERR_REQUIRED: 'KERR_REQUIRED', IN_VALIDATED_DOMAIN: 'IN_VALIDATED_DOMAIN' });

  const VALIDATED_S9 = Object.freeze({
    aStar: 0.9, eccentricity: 0.9, semiLatusRectumM: 50, inclinationDeg: 60,
    qMin: 0.125, qMax: 0.5, hMin: 13.2075366562, hMax: 52.8301466249,
    deltaMin: -0.386, deltaMax: 0.475, maxCenteringRatio: 0.5
  });
  const H_RANGE_EPSILON = 1e-10;

  const SCI02_POLICY = Object.freeze({
    optionBFalseSafeRelThreshold: 1.25e-4,
    trGateFraction: 0.5, trHorizonFraction: 1.5, trPhaseAmbiguityBand: 0.03,
    trConvergenceRequirement: 1e-8,
    regradeResult: '48_CELLS_0_FALSE_SAFES_21_SAFE_NON_KERR_27_CONSERVATIVE_KERR',
    closedAt: '2026-09-18'
  });

  function deepFreeze(value) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      if (child && (typeof child === 'object' || typeof child === 'function') && !Object.isFrozen(child)) deepFreeze(child);
    }
    return value;
  }
  deepFreeze(VALIDATED_S9); deepFreeze(SCI02_POLICY);

  const BRIDGE_RECOVERY = deepFreeze({ eRecovery: 1.5e-9, lRecovery: 7.8e-8, declaredTolerance: 1e-6 });

  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function frozenObject(v) { return v && typeof v === 'object' && !Array.isArray(v) && Object.isFrozen(v); }
  function same(v, e) { return finite(v) && v === e; }
  function fail(reason, domainChecks) { return { version: VERSION, verdict: VERDICT.KERR_REQUIRED, reason, domainChecks, uncertaintyEnvelope: null }; }

  function packetChecks(packet, candidate) {
    const obs = packet && packet.observationDiagnostic;
    const centering = packet && packet.centeringDiagnostic;
    const delta = packet && packet.deltaDiagnostic;
    const estimator = packet && packet.estimatorResult;
    const m1 = obs && obs.m1;
    const samples = obs && obs.samples;
    const stencil = obs && obs.selectedStencil;
    const targetLattice = obs && obs.targetLattice;
    const expectedH = finite(packet?.tauHat) && finite(packet?.qCadence) ? packet.qCadence * packet.tauHat : NaN;
    const hResidual = finite(candidate?.hCadence) && finite(expectedH) ? Math.abs(candidate.hCadence - expectedH) : Infinity;
    return {
      packetIdentity: !!packet && typeof packet === 'object' && !Array.isArray(packet) && packet.shadowOnly === true && packet.nonAuthoritative === true,
      referenceId: packet?.referenceId === 'S9',
      invariantRecovery: finite(packet?.invariantDiagnostic?.E) && finite(packet?.invariantDiagnostic?.Lz) && finite(packet?.invariantDiagnostic?.Q),
      m1Qualified: m1?.qualification?.laterThanInitial === true && m1.qualification?.beyondQuarterPeriod === true && m1.qualification?.radialRateQualified === true,
      integerHLattice: Array.isArray(targetLattice) && targetLattice.length === 8 && targetLattice.every((x, i) => finite(x) && (i === 0 || Math.abs(x - targetLattice[i - 1] - packet.Hhat) <= 1e-10 * Math.max(1, Math.abs(packet.Hhat)))),
      interiorStencil: Array.isArray(stencil) && stencil.length === 3 && Array.isArray(samples) && samples.length >= 3 && stencil.every(x => finite(x.actualTH) && finite(x.targetTH) && finite(x.rBL)),
      canonicalLocalization: Array.isArray(samples) && samples.length === 3 && samples.every(x => finite(x.targetResidual)),
      centering: finite(centering?.centeringError) && finite(centering?.centeringThreshold) && centering.centeringThreshold > 0 && centering.centeringError <= centering.centeringThreshold && finite(centering.centeringMargin) && centering.centeringMargin >= 0,
      centeringRatio: finite(centering?.centeringError) && finite(centering?.centeringThreshold) && centering.centeringThreshold > 0 ? centering.centeringError / centering.centeringThreshold : Infinity,
      delta: finite(delta?.delta) && delta.vertexInsideCentralInterval === true && delta.delta >= VALIDATED_S9.deltaMin && delta.delta <= VALIDATED_S9.deltaMax,
      finiteH2H3: finite(estimator?.H2) && finite(estimator?.H3),
      qCadence: finite(candidate?.qCadence) && candidate.qCadence >= VALIDATED_S9.qMin && candidate.qCadence <= VALIDATED_S9.qMax,
      hCadenceRange: finite(candidate?.hCadence) && candidate.hCadence >= VALIDATED_S9.hMin - H_RANGE_EPSILON && candidate.hCadence <= VALIDATED_S9.hMax + H_RANGE_EPSILON,
      hCadenceConsistent: finite(hResidual) && hResidual <= 1e-12 * Math.max(1, Math.abs(expectedH)),
      estimatorAdmitted: packet?.estimatorDisposition === 'ADMITTED' && !!estimator,
      noFailure: packet?.qualified === true && !packet?.estimatorReason
    };
  }

  // Option-B anomaly check.
  // FAIL-CLOSED CONTRACT (v3): for any candidate that reaches the SCI-02
  // policy checks, a missing optionBDiagnostic is not a pass-through —
  // it is a hard block. Every v3-eligible packet produced by the live
  // shadow estimator carries this field; its absence means the packet
  // was not produced by the v3 wiring and cannot be trusted.
  //   missing field         → OPTION_B_DIAGNOSTIC_MISSING → KERR_REQUIRED
  //   {available:false}     → OPTION_B_INVALID_FIELDS    → KERR_REQUIRED
  //   anomalous relDiff     → OPTION_B_ANOMALY_EXCEEDS_THRESHOLD → KERR_REQUIRED
  //   clean relDiff         → passed:true
  function optionBCheck(packet) {
    const ob = packet?.optionBDiagnostic;
    if (!ob) return { available: false, passed: false, reason: 'OPTION_B_DIAGNOSTIC_MISSING' };
    if (!finite(ob.independent) || !finite(ob.measured) || ob.measured === 0) {
      return { available: true, passed: false, reason: 'OPTION_B_INVALID_FIELDS' };
    }
    const relDiff = Math.abs(ob.independent - ob.measured) / Math.abs(ob.measured);
    if (relDiff > SCI02_POLICY.optionBFalseSafeRelThreshold) {
      return { available: true, passed: false, reason: 'OPTION_B_ANOMALY_EXCEEDS_THRESHOLD', relDiff };
    }
    return { available: true, passed: true, relDiff };
  }

  // Tr-based recurrence eligibility check (gate/horizon/phase).
  // FAIL-CLOSED CONTRACT (v3): missing recurrenceDiagnostic is not a
  // pass-through — it is a hard block on the same grounds as optionB.
  //   missing field                  → RECURRENCE_DIAGNOSTIC_MISSING → KERR_REQUIRED
  //   {available:false} / no Tr      → RECURRENCE_AUTHORITY_UNAVAILABLE → KERR_REQUIRED
  //   poor convergence               → RECURRENCE_TR_NOT_PRECISELY_KNOWN → KERR_REQUIRED
  //   invalid requestedDt            → RECURRENCE_INVALID_REQUESTED_DT → KERR_REQUIRED
  //   horizon exceeded               → RECURRENCE_HORIZON_EXCEEDED → KERR_REQUIRED
  //   phase near turning point       → RECURRENCE_PHASE_AMBIGUOUS_NEAR_TURNING_POINT → KERR_REQUIRED
  //   within gate/horizon, clean     → eligible:true
  function recurrenceCheck(packet) {
    const rec = packet?.recurrenceDiagnostic;
    if (!rec) return { available: false, eligible: false, reason: 'RECURRENCE_DIAGNOSTIC_MISSING' };
    const { Tr, requestedDt, convergenceRelDelta } = rec;
    if (!finite(Tr) || Tr <= 0) return { available: true, eligible: false, reason: 'RECURRENCE_AUTHORITY_UNAVAILABLE' };
    if (!finite(convergenceRelDelta) || convergenceRelDelta >= SCI02_POLICY.trConvergenceRequirement) return { available: true, eligible: false, reason: 'RECURRENCE_TR_NOT_PRECISELY_KNOWN' };
    if (!finite(requestedDt) || requestedDt < 0) return { available: true, eligible: false, reason: 'RECURRENCE_INVALID_REQUESTED_DT' };
    const gate = SCI02_POLICY.trGateFraction * Tr;
    const horizon = SCI02_POLICY.trHorizonFraction * Tr;
    if (requestedDt > horizon) return { available: true, eligible: false, reason: 'RECURRENCE_HORIZON_EXCEEDED' };
    const phase = (requestedDt % Tr) / Tr;
    const distToTP = Math.min(Math.abs(phase), Math.abs(phase - 1), Math.abs(phase - 0.5));
    if (distToTP < SCI02_POLICY.trPhaseAmbiguityBand) return { available: true, eligible: false, reason: 'RECURRENCE_PHASE_AMBIGUOUS_NEAR_TURNING_POINT' };
    return { available: true, eligible: true, reason: requestedDt <= gate ? 'WITHIN_GATE' : 'WITHIN_HORIZON_PHASE_VERIFIED' };
  }

  function evaluate(candidate) {
    const domainChecks = { aStar: false, eccentricity: false, semiLatusRectumM: false, inclinationDeg: false, qCadence: false, hCadence: false };
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return fail('INVALID_CANDIDATE_OBJECT', domainChecks);
    if (!same(candidate.aStar, VALIDATED_S9.aStar)) return fail('OUT_OF_VALIDATED_DOMAIN_SPIN', domainChecks);
    domainChecks.aStar = true;
    if (!same(candidate.eccentricity, VALIDATED_S9.eccentricity)) return fail('OUT_OF_VALIDATED_DOMAIN_ECCENTRICITY', domainChecks);
    domainChecks.eccentricity = true;
    if (!same(candidate.semiLatusRectumM, VALIDATED_S9.semiLatusRectumM)) return fail('OUT_OF_VALIDATED_DOMAIN_SEMI_LATUS_RECTUM', domainChecks);
    domainChecks.semiLatusRectumM = true;
    if (!same(candidate.inclinationDeg, VALIDATED_S9.inclinationDeg)) return fail('OUT_OF_VALIDATED_DOMAIN_INCLINATION', domainChecks);
    domainChecks.inclinationDeg = true;
    let reason = 'IN_VALIDATED_DOMAIN';
    if (!finite(candidate.qCadence) || candidate.qCadence < VALIDATED_S9.qMin || candidate.qCadence > VALIDATED_S9.qMax) reason = 'OUT_OF_VALIDATED_DOMAIN_CADENCE';
    else if (!finite(candidate.hCadence) || candidate.hCadence < VALIDATED_S9.hMin - H_RANGE_EPSILON || candidate.hCadence > VALIDATED_S9.hMax + H_RANGE_EPSILON) reason = 'OUT_OF_VALIDATED_DOMAIN_HCADENCE';
    if (reason !== 'IN_VALIDATED_DOMAIN') return fail(reason, domainChecks);
    if (!frozenObject(candidate.provenance) || candidate.provenance.kind !== 'QUALIFIED_SCI02_REFERENCE' ||
        candidate.provenance.referenceId !== 'S9' || !frozenObject(candidate.provenance.descriptors) ||
        candidate.provenance.referenceSourceSha256 !== 'dd7b7051aac229e58a4afcc4017ffb43a9bb4ee62dd650ad214ca1bf621d87b2') {
      return fail('OUT_OF_VALIDATED_DOMAIN_PROVENANCE', domainChecks);
    }
    const checks = packetChecks(candidate.policyPacket, candidate);
    domainChecks.qCadence = checks.qCadence;
    domainChecks.hCadence = checks.hCadenceRange && checks.hCadenceConsistent;
    const failed = Object.entries(checks).filter(([k, v]) => k === 'centeringRatio' ? v > VALIDATED_S9.maxCenteringRatio : v === false).map(([k]) => k);
    if (checks.centeringRatio > VALIDATED_S9.maxCenteringRatio) failed.push('centeringRatio');
    if (failed.length) return fail(`OUT_OF_VALIDATED_DOMAIN_POLICY_PRECONDITION:${failed.join(',')}`, domainChecks);
    const ob = optionBCheck(candidate.policyPacket);
    if (!ob.passed) return fail(`SCI02_OPTION_B_${ob.reason}`, domainChecks);
    const rec = recurrenceCheck(candidate.policyPacket);
    if (!rec.eligible) return fail(`SCI02_RECURRENCE_${rec.reason}`, domainChecks);
    const uncertaintyEnvelope = deepFreeze({
      policy: 'SCI02_CONSERVATIVE_PRODUCTION_POLICY_V3', qMin: VALIDATED_S9.qMin, qMax: VALIDATED_S9.qMax,
      hMin: VALIDATED_S9.hMin, hMax: VALIDATED_S9.hMax, centeringRatioMax: VALIDATED_S9.maxCenteringRatio,
      deltaMin: VALIDATED_S9.deltaMin, deltaMax: VALIDATED_S9.deltaMax,
      qCadence: candidate.qCadence, hCadence: candidate.hCadence,
      bridgeRecovery: BRIDGE_RECOVERY, policyChecks: checks,
      sci02Policy: SCI02_POLICY, optionBDiagnostic: ob, recurrenceDiagnostic: rec
    });
    return { version: VERSION, verdict: VERDICT.IN_VALIDATED_DOMAIN, reason, domainChecks, uncertaintyEnvelope };
  }

  SGRA.Physics.KerrSwitchOracle = Object.freeze({ VERSION, VERDICT, VALIDATED_S9, SCI02_POLICY, evaluate });
})(typeof window !== 'undefined' ? window : globalThis);
