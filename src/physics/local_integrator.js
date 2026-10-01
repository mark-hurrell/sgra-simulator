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

  SGRA.Physics.LocalIntegrator = Object.freeze({
    enforcePinnedBHFrame: SGRA.Physics.LocalStepIntegrator.enforcePinnedBHFrame,
    computeAccel: SGRA.Physics.LocalForceModel.computeAccel,
    pickDt: SGRA.Physics.LocalTimestepPolicy.pickDt,
    relKick: SGRA.Physics.LocalStepIntegrator.relKick,
    physicsStep: SGRA.Physics.LocalStepIntegrator.physicsStep,
    kineticEnergy: SGRA.Physics.LocalEnergy.kineticEnergy,
    potentialEnergy: SGRA.Physics.LocalEnergy.potentialEnergy,
    totalEnergy: SGRA.Physics.LocalEnergy.totalEnergy,
    beginSubstep: SGRA.Physics.LocalEvents.beginSubstep,
    observeSubstep: SGRA.Physics.LocalEvents.observeSubstep,
    checkPericentre: SGRA.Physics.LocalEvents.checkPericentre,
    checkCaptures: SGRA.Physics.LocalEvents.checkCaptures
  });
})(window);
