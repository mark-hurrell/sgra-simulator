// Immutable, declared-at-birth provenance for SCI-02 creation actions.
(function attachCreationProvenance(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Domain = SGRA.Domain || {};

  const PROVENANCE_KIND = Object.freeze({
    QUALIFIED_SCI02_REFERENCE: 'QUALIFIED_SCI02_REFERENCE',
    // Diagnostic-only exact bound Kerr state.  This is intentionally not a
    // qualified catalogue reference: policy code continues to admit only
    // QUALIFIED_SCI02_REFERENCE.
    EXACT_BOUND_SCI02_DIAGNOSTIC: 'EXACT_BOUND_SCI02_DIAGNOSTIC',
    DECLARED_UNVALIDATED_ORBIT: 'DECLARED_UNVALIDATED_ORBIT',
    NONE_DRAG_LAUNCH: 'NONE_DRAG_LAUNCH'
  });

  function fail(message) { throw new TypeError(`Invalid creation provenance: ${message}`); }
  function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function finite(value, label) { if (!Number.isFinite(value)) fail(`${label} must be finite`); return value; }
  function exactKeys(value, keys, label) {
    if (!isRecord(value)) fail(`${label} must be an object`);
    const allowed = new Set(keys);
    for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${label}.${key} is not allowed`);
    for (const key of keys) if (!(key in value)) fail(`${label}.${key} is required`);
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }
  function timestamp(value) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) fail('constructedAt must be an ISO timestamp');
    return value;
  }
  function descriptorRecord(value) {
    exactKeys(value, ['chi', 'eccentricity', 'semiLatusRectumM', 'inclinationDeg'], 'descriptors');
    const chi = finite(value.chi, 'descriptors.chi');
    const eccentricity = finite(value.eccentricity, 'descriptors.eccentricity');
    const semiLatusRectumM = finite(value.semiLatusRectumM, 'descriptors.semiLatusRectumM');
    const inclinationDeg = finite(value.inclinationDeg, 'descriptors.inclinationDeg');
    if (chi < 0 || chi > 1 || eccentricity < 0 || eccentricity >= 1 || semiLatusRectumM <= 0 || inclinationDeg < 0 || inclinationDeg > 180) fail('descriptor range');
    return { chi, eccentricity, semiLatusRectumM, inclinationDeg };
  }
  function exactBoundInvariantRecord(value) {
    exactKeys(value, ['E', 'Lz', 'Q'], 'invariants');
    const E = finite(value.E, 'invariants.E');
    const Lz = finite(value.Lz, 'invariants.Lz');
    const Q = finite(value.Q, 'invariants.Q');
    if (!(E > 0 && E < 1) || Q < 0) fail('bound invariant range');
    return { E, Lz, Q };
  }
  function elementRecord(value) {
    exactKeys(value, ['aSemimajorAU', 'e', 'inclinationDeg', 'longitudeAscendingNodeDeg', 'argumentOfPeriapsisDeg', 'timeOfPeriapsis'], 'elements');
    const out = {};
    for (const key of Object.keys(value)) out[key] = finite(value[key], `elements.${key}`);
    if (out.aSemimajorAU <= 0 || out.e < 0 || out.e >= 1 || out.inclinationDeg < 0 || out.inclinationDeg > 180) fail('element range');
    return out;
  }
  function generationRecord(value) {
    if (!isRecord(value) || typeof value.mode !== 'string') fail('generation is invalid');
    if (value.mode === 'MANUAL') { exactKeys(value, ['mode'], 'generation'); return { mode: 'MANUAL' }; }
    if (value.mode === 'SEEDED_RANDOM') {
      exactKeys(value, ['mode', 'seed', 'sequence'], 'generation');
      if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 0xffffffff || !Number.isInteger(value.sequence) || value.sequence < 0 || value.sequence > 0xffffffff) fail('seeded generation range');
      return { mode: 'SEEDED_RANDOM', seed: value.seed, sequence: value.sequence };
    }
    fail('generation.mode is invalid');
  }
  function validate(record) {
    if (!isRecord(record) || typeof record.kind !== 'string') fail('kind is required');
    if (record.kind === PROVENANCE_KIND.QUALIFIED_SCI02_REFERENCE) {
      exactKeys(record, ['kind', 'referenceId', 'referenceSourceSha256', 'descriptors', 'constructedAt'], 'reference provenance');
      if (typeof record.referenceId !== 'string' || !/^[a-z0-9_-]+$/i.test(record.referenceId)) fail('referenceId');
      if (typeof record.referenceSourceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.referenceSourceSha256)) fail('referenceSourceSha256');
      return { kind: record.kind, referenceId: record.referenceId, referenceSourceSha256: record.referenceSourceSha256, descriptors: descriptorRecord(record.descriptors), constructedAt: timestamp(record.constructedAt) };
    }
    if (record.kind === PROVENANCE_KIND.EXACT_BOUND_SCI02_DIAGNOSTIC) {
      exactKeys(record, ['kind', 'stateId', 'stateSourceSha256', 'descriptors', 'deltaSep', 'pSep', 'pOverM', 'invariants', 'constructedAt'], 'exact-bound diagnostic provenance');
      if (typeof record.stateId !== 'string' || !/^[a-z0-9_-]+$/i.test(record.stateId)) fail('stateId');
      if (typeof record.stateSourceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.stateSourceSha256)) fail('stateSourceSha256');
      const deltaSep = finite(record.deltaSep, 'deltaSep');
      const pSep = finite(record.pSep, 'pSep');
      const pOverM = finite(record.pOverM, 'pOverM');
      if (!(deltaSep > 0) || !(pSep > 0) || !(pOverM > 0)) fail('exact-bound radial range');
      if (Math.abs(pOverM - pSep * (1 + deltaSep)) > 1e-12 * Math.max(1, Math.abs(pOverM))) fail('pOverM is inconsistent with pSep and deltaSep');
      return {
        kind: record.kind, stateId: record.stateId, stateSourceSha256: record.stateSourceSha256,
        descriptors: descriptorRecord(record.descriptors), deltaSep, pSep, pOverM,
        invariants: exactBoundInvariantRecord(record.invariants), constructedAt: timestamp(record.constructedAt)
      };
    }
    if (record.kind === PROVENANCE_KIND.DECLARED_UNVALIDATED_ORBIT) {
      exactKeys(record, ['kind', 'elements', 'generation', 'constructedAt'], 'declared provenance');
      return { kind: record.kind, elements: elementRecord(record.elements), generation: generationRecord(record.generation), constructedAt: timestamp(record.constructedAt) };
    }
    if (record.kind === PROVENANCE_KIND.NONE_DRAG_LAUNCH) {
      exactKeys(record, ['kind', 'constructedAt'], 'drag provenance');
      return { kind: record.kind, constructedAt: timestamp(record.constructedAt) };
    }
    fail('kind is invalid');
  }
  function freeze(record) { return deepFreeze(validate(record)); }
  function constructedAt(value) { return value || new Date().toISOString(); }
  function qualifiedReference(reference, value) {
    return freeze({ kind: PROVENANCE_KIND.QUALIFIED_SCI02_REFERENCE, referenceId: reference.referenceId, referenceSourceSha256: reference.referenceSourceSha256, descriptors: reference.descriptors, constructedAt: constructedAt(value) });
  }
  function exactBoundDiagnostic(state, value) {
    return freeze({
      kind: PROVENANCE_KIND.EXACT_BOUND_SCI02_DIAGNOSTIC,
      stateId: state.stateId,
      stateSourceSha256: state.stateSourceSha256,
      descriptors: state.descriptors,
      deltaSep: state.deltaSep,
      pSep: state.pSep,
      pOverM: state.pOverM,
      invariants: state.invariants,
      constructedAt: constructedAt(value)
    });
  }
  function declaredOrbit(elements, generation, value) {
    return freeze({ kind: PROVENANCE_KIND.DECLARED_UNVALIDATED_ORBIT, elements, generation, constructedAt: constructedAt(value) });
  }
  function noneDragLaunch(value) { return freeze({ kind: PROVENANCE_KIND.NONE_DRAG_LAUNCH, constructedAt: constructedAt(value) }); }

  SGRA.Domain.CreationProvenance = Object.freeze({ PROVENANCE_KIND, validate, freeze, qualifiedReference, exactBoundDiagnostic, declaredOrbit, noneDragLaunch });
  if (typeof module !== 'undefined' && module.exports) module.exports = SGRA.Domain.CreationProvenance;
})(typeof window !== 'undefined' ? window : globalThis);
