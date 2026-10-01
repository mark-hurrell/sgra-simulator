// Explicit, creation-time SCI-02 orbit constructors.  The Oracle seam accepts
// only a completed shadow policy packet for qualified S9 references.
(function attachOrbitalElementLaunch(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Intruders = SGRA.Intruders || {};
  function requireApi(path, value) { if (!value) throw new Error(`${path} is unavailable`); return value; }
  function addBh(relative, blackHole) { return { x: blackHole.x + relative.x, y: blackHole.y + relative.y, z: blackHole.z + relative.z, vx: blackHole.vx + relative.vx, vy: blackHole.vy + relative.vy, vz: blackHole.vz + relative.vz }; }
  function hattedToRelativeState(state, blackHole) {
    const adapter = requireApi('ProductKerrRuntimeAdapter', SGRA.Physics && SGRA.Physics.ProductKerrRuntimeAdapter);
    const spin = adapter.getSpinContext(blackHole); if (!spin.valid) throw new Error(spin.reason);
    const matrix = spin.localToWorld, scales = spin.scales;
    const rotate = vector => matrix.map(row => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
    const position = rotate([state[0] * scales.Lg, state[1] * scales.Lg, state[2] * scales.Lg]);
    const velocity = rotate([state[3] * scales.c, state[4] * scales.c, state[5] * scales.c]);
    return { x: position[0], y: position[1], z: position[2], vx: velocity[0], vy: velocity[1], vz: velocity[2] };
  }
  function createQualifiedReferenceState(referenceId, blackHole, value) {
    const table = requireApi('Sci02ReferenceTable', SGRA.Data && SGRA.Data.Sci02ReferenceTable); const provenance = requireApi('CreationProvenance', SGRA.Domain && SGRA.Domain.CreationProvenance);
    const reference = table[referenceId]; if (!reference) throw new RangeError(`Unknown SCI-02 reference '${referenceId}'`);
    return Object.freeze({ state: Object.freeze(hattedToRelativeState(reference.ksCoordinateEventTangent, blackHole)), provenance: provenance.qualifiedReference(reference, value?.constructedAt) });
  }
  function createDeclaredOrbitState(elements, blackHole, simulationTime, generation, value) {
    const orbital = requireApi('OrbitalMath', SGRA.Physics && SGRA.Physics.OrbitalMath); const provenance = requireApi('CreationProvenance', SGRA.Domain && SGRA.Domain.CreationProvenance);
    const record = provenance.declaredOrbit(elements, generation, value?.constructedAt);
    const input = record.elements;
    const relative = orbital.elementsToState(input.aSemimajorAU, input.e, input.inclinationDeg, input.longitudeAscendingNodeDeg, input.argumentOfPeriapsisDeg, input.timeOfPeriapsis, simulationTime, blackHole);
    return Object.freeze({ state: Object.freeze(relative), provenance: record });
  }
  function createDeclaredSeededOrbitState(seed, sequence, blackHole, simulationTime, value) {
    const random = requireApi('SeededRandom', SGRA.Domain && SGRA.Domain.SeededRandom);
    return createDeclaredOrbitState(random.elementsForSeed(seed, sequence), blackHole, simulationTime, { mode: 'SEEDED_RANDOM', seed, sequence }, value);
  }
  function attachState(body, relative, blackHole, provenance) { return Object.assign(body, addBh(relative, blackHole), { __creationProvenance: provenance }); }
  function tryOracleLookup(body, policyPacket) {
    const provenance = body && body.__creationProvenance;
    if (!provenance || provenance.kind !== 'QUALIFIED_SCI02_REFERENCE' || !policyPacket || typeof policyPacket !== 'object') return null;
    return SGRA.Physics.KerrSwitchOracle.evaluate({
      provenance, policyPacket, aStar: provenance.descriptors.chi, eccentricity: provenance.descriptors.eccentricity,
      semiLatusRectumM: provenance.descriptors.semiLatusRectumM, inclinationDeg: provenance.descriptors.inclinationDeg,
      qCadence: policyPacket.qCadence, hCadence: policyPacket.Hhat
    });
  }
  SGRA.Intruders.OrbitalElementLaunch = Object.freeze({ createQualifiedReferenceState, createDeclaredOrbitState, createDeclaredSeededOrbitState, attachState, tryOracleLookup, hattedToRelativeState });
  if (typeof module !== 'undefined' && module.exports) module.exports = SGRA.Intruders.OrbitalElementLaunch;
})(typeof window !== 'undefined' ? window : globalThis);
