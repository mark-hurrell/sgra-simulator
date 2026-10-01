// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachDomBindings(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  function bindDom(root) {
    const doc = root && root.getElementById ? root : global.document;
    return Object.freeze({
      epoch: doc.getElementById('rT'),
      energy: doc.getElementById('rE'),
      throttled: doc.getElementById('rThr'),
      bodyCount: doc.getElementById('rN'),
      gr: doc.getElementById('rGR'),
      blackHoleMass: doc.getElementById('rBH'),
      captures: doc.getElementById('rCap'),
      scale: doc.getElementById('scTxt'),
      cardName: doc.getElementById('cN'),
      cardRadiusLabel: doc.getElementById('cRLabel'),
      cardRadius: doc.getElementById('cR'),
      cardVelocityLabel: doc.getElementById('cVLabel'),
      cardVelocity: doc.getElementById('cV'),
      cardVelocityRatioLabel: doc.getElementById('cVCLabel'),
      cardVelocityRatio: doc.getElementById('cVC'),
      cardPeriapsisLabel: doc.getElementById('cRpLabel'),
      cardPeriapsis: doc.getElementById('cRp'),
      cardPnLabel: doc.getElementById('cPNLabel'),
      cardPn: doc.getElementById('cPN'),
      cardAxisLabel: doc.getElementById('cALabel'),
      cardAxis: doc.getElementById('cA'),
      cardEccentricityLabel: doc.getElementById('cELabel'),
      cardEccentricity: doc.getElementById('cE'),
      cardPeriodLabel: doc.getElementById('cPLabel'),
      cardPeriod: doc.getElementById('cP'),
      cardMassLabel: doc.getElementById('cMLabel'),
      cardMass: doc.getElementById('cM'),
      regimeName: doc.getElementById('rName'),
      regimeDot: doc.getElementById('rDot')
    });
  }

  SGRA.UI.DomBindings = Object.freeze({ bindDom });
})(typeof window !== 'undefined' ? window : globalThis);
