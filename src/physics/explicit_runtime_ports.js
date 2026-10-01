(function (global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  function freezePort(name, values, required = []) {
    const port = { ...values };
    for (const member of required) {
      if (typeof port[member] !== 'function' && port[member] == null) {
        throw new TypeError(`${name} requires ${member}`);
      }
    }
    return Object.freeze(port);
  }

  function create(options = {}) {
    return Object.freeze({
      world: freezePort('world', options.world, ['getBodies']),
      clock: freezePort('clock', options.clock, ['getSimTime', 'advanceSimTime']),
      modes: freezePort('modes', options.modes, ['isGrEnabled', 'getPnRamp', 'isCuspEnabled']),
      telemetry: freezePort('telemetry', options.telemetry || {}),
      application: freezePort('application', options.application || {}),
      scheduler: freezePort('scheduler', options.scheduler || {}),
      fidelity: freezePort('fidelity', options.fidelity || {}),
      runtime: freezePort('runtime', options.runtime || {})
    });
  }

  SGRA.Physics.ExplicitRuntimePorts = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
