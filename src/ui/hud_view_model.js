// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachHudViewModel(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  const LABELS = Object.freeze({
    radius: 'r (current)',
    speed: 'v (current)',
    speedRatio: 'v/c (current)',
    periapsis: 'rₚ (osc)',
    pnRatio: '1PN/N (current)',
    axis: 'a (osc)',
    eccentricity: 'e (osc)',
    period: 'T (osc)',
    mass: 'mass'
  });

  const TITLES = Object.freeze({
    radius: 'Current radius relative to the live Sgr A* state',
    speed: 'Current relative speed in the live Sgr A* frame',
    speedRatio: 'Current speed as a fraction of c',
    periapsis: 'Osculating periapsis from the current osculating two-body solution',
    pnRatio: 'Current 1PN-to-Newtonian strength estimate',
    axis: 'Osculating semi-major axis from the current osculating two-body solution',
    eccentricity: 'Osculating eccentricity from the current osculating two-body solution',
    period: 'Osculating period from the current osculating two-body solution',
    mass: 'Current selected-body mass'
  });

  function finiteOrNull(value) {
    return Number.isFinite(value) ? value : null;
  }

  function computeOsculatingPeriapsisAu(el) {
    if (!el || el.parabolic) return null;
    if (!Number.isFinite(el.a) || !Number.isFinite(el.e)) return null;
    const periapsis = el.a * (1 - el.e);
    return periapsis > 0 && Number.isFinite(periapsis) ? periapsis : null;
  }

  function computeOsculatingPeriodYears(el) {
    if (!el || !(el.a > 0) || !Number.isFinite(el.mu)) return 0;
    return 2 * Math.PI * Math.sqrt(el.a ** 3 / el.mu);
  }

  function buildSelectedBodyCardModel(input) {
    if (!input || !input.body || !input.centralBody) return null;
    const {
      body,
      centralBody,
      epoch,
      grOn,
      rsAu,
      relativityState,
      osculatingElements,
      regimeColor,
      regimePosition
    } = input;
    if (!relativityState || !osculatingElements) return null;
    return Object.freeze({
      name: body.name || null,
      selectedBodyId: Number.isFinite(body.id) ? body.id : null,
      sourceEpoch: finiteOrNull(epoch),
      centralBodyMass: finiteOrNull(centralBody.m),
      grOn: !!grOn,
      currentRadiusAu: finiteOrNull(relativityState.r),
      currentRadiusRs: rsAu > 0 ? finiteOrNull(relativityState.r / rsAu) : null,
      currentSpeedAuYr: finiteOrNull(relativityState.v),
      currentSpeedKms: finiteOrNull(relativityState.v * global.SGRA.Domain.Constants.KMS),
      currentSpeedOverC: finiteOrNull(relativityState.vc),
      currentPnPct: finiteOrNull(relativityState.pnPct),
      osculatingSemiMajorAxisAu: finiteOrNull(osculatingElements.a),
      osculatingEccentricity: finiteOrNull(osculatingElements.e),
      osculatingPeriodYears: finiteOrNull(computeOsculatingPeriodYears(osculatingElements)),
      osculatingPeriapsisAu: finiteOrNull(computeOsculatingPeriapsisAu(osculatingElements)),
      osculatingMu: finiteOrNull(osculatingElements.mu),
      osculatingMuConvention: 'two-body-total-mass',
      parabolic: !!osculatingElements.parabolic,
      mass: finiteOrNull(body.m),
      regime: relativityState.regime,
      regimeColor,
      regimePosition,
      labels: LABELS,
      titles: TITLES
    });
  }

  SGRA.UI.HudViewModel = Object.freeze({
    LABELS,
    TITLES,
    buildSelectedBodyCardModel,
    computeOsculatingPeriapsisAu,
    computeOsculatingPeriodYears
  });
})(typeof window !== 'undefined' ? window : globalThis);
