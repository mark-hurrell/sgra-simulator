// Explicit construction contract for the product Kerr runtime adapter.
(function attachProductKerrRuntimePorts(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  function requiredObject(value, name) {
    if (!value || typeof value !== 'object') throw new TypeError(`Product Kerr ${name} port is required`);
    return value;
  }

  function requiredFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(`Product Kerr ${name} dependency is required`);
    return value;
  }

  function create(options = {}) {
    const input = requiredObject(options.physicsInputs, 'physicsInputs');
    const constants = requiredObject(input.constants, 'constants');
    if (!Number.isFinite(constants.G) || !Number.isFinite(constants.C_AUYR)) {
      throw new TypeError('Product Kerr physical constants are invalid');
    }
    const kerr = requiredObject(input.kerr, 'kerr');
    requiredFunction(kerr.KerrHamiltonianRhs?.admitState, 'KerrHamiltonianRhs.admitState');
    requiredFunction(kerr.KerrHamiltonianRhs?.contravariantVelocity, 'KerrHamiltonianRhs.contravariantVelocity');
    requiredFunction(kerr.KerrHamiltonianRhs?.massShellResidual, 'KerrHamiltonianRhs.massShellResidual');
    requiredFunction(kerr.KerrHamiltonianRhs?.timelikeNorm, 'KerrHamiltonianRhs.timelikeNorm');
    requiredFunction(kerr.KerrHamiltonianRhs?.createGeodesicRhs, 'KerrHamiltonianRhs.createGeodesicRhs');
    requiredFunction(kerr.KerrSchildMetric?.metricParts, 'KerrSchildMetric.metricParts');
    requiredFunction(kerr.KerrSchildMetric?.ksRadius, 'KerrSchildMetric.ksRadius');
    requiredFunction(kerr.DP54?.solve, 'DP54.solve');
    const captureSurface = requiredObject(input.captureSurface, 'captureSurface');
    requiredFunction(captureSurface.radiusHatted, 'captureSurface.radiusHatted');
    requiredFunction(input.getSpinMagnitude, 'getSpinMagnitude');
    requiredFunction(input.getSpinAxisSign, 'getSpinAxisSign');

    const physicsInputs = Object.freeze({
      constants,
      kerr,
      captureSurface,
      getSpinMagnitude: input.getSpinMagnitude,
      getSpinAxisSign: input.getSpinAxisSign,
      isCentralFramePinnedForSandbox: typeof input.isCentralFramePinnedForSandbox === 'function'
        ? input.isCentralFramePinnedForSandbox : () => true
    });
    const clockInput = options.clock || {};
    const clock = Object.freeze({
      getSimTime: typeof clockInput.getSimTime === 'function' ? clockInput.getSimTime : () => undefined
    });
    const telemetryInput = options.telemetry || {};
    const telemetry = Object.freeze({
      kerrMutualTrace: telemetryInput.kerrMutualTrace,
      kerrOwnershipTelemetry: telemetryInput.kerrOwnershipTelemetry,
      dutyMeasurement: telemetryInput.dutyMeasurement,
      perfBaseline: telemetryInput.perfBaseline,
      kerrProfile: telemetryInput.kerrProfile,
      now: typeof telemetryInput.now === 'function' ? telemetryInput.now : () => 0
    });
    return Object.freeze({ physicsInputs, clock, telemetry });
  }

  SGRA.Physics.ProductKerrRuntimePorts = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
