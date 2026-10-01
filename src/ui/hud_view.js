// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachHudView(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};
  const UNAVAILABLE = '—';

  function setLabel(element, text, title) {
    if (!element) return;
    element.textContent = text;
    if (title) {
      element.title = title;
      element.setAttribute('aria-label', title);
    }
  }

  function setValue(element, text, ariaLabel) {
    if (!element) return;
    element.textContent = text;
    if (ariaLabel) element.setAttribute('aria-label', ariaLabel);
  }

  function roleDriftText(roleDrifts = {}) {
    const core = Number.isFinite(roleDrifts.core) ? roleDrifts.core.toFixed(3) : '—';
    const intr = Number.isFinite(roleDrifts.intr) ? roleDrifts.intr.toFixed(3) : '—';
    const field = Number.isFinite(roleDrifts.field) ? roleDrifts.field.toFixed(3) : '—';
    return ` · C ${core} · I ${intr} · F ${field}`;
  }

  function updateHud(elements, snapshot) {
    elements.epoch.textContent = snapshot.epoch.toFixed(2);
    elements.bodyCount.textContent = snapshot.bodyCount;
    elements.blackHoleMass.textContent = `${(snapshot.blackHoleMass / 1e6).toFixed(3)}M`;
    elements.captures.textContent = snapshot.captureCount ? `⚫×${snapshot.captureCount}` : '';
    elements.throttled.textContent = snapshot.timestepWarning || '';

    if (snapshot.energyState === 'gr') {
      elements.energy.textContent = '—';
      elements.energy.className = 'v';
    } else if (snapshot.energyState === 'cusp') {
      elements.energy.textContent = '— (cusp)';
      elements.energy.className = 'v warn';
    } else {
      const maxRoleDrift = Number.isFinite(snapshot.energyMaxRoleDrift) ? snapshot.energyMaxRoleDrift : snapshot.energyDrift;
      elements.energy.textContent = `${snapshot.energyDrift.toFixed(4)}${roleDriftText(snapshot.energyRoleDrifts)}`;
      elements.energy.className = `v ${maxRoleDrift < 0.05 ? 'ok' : 'warn'}`;
    }

    elements.scale.textContent = snapshot.scaleText;
    updateBodyCards(elements, snapshot.follow);
  }

  function updateBodyCards(elements, body) {
    const labels = body && body.labels ? body.labels : {
      radius: 'r (current)',
      speed: 'v (current)',
      speedRatio: 'v/c (current)',
      periapsis: 'rₚ (osc)',
      pnRatio: '1PN/N (current)',
      axis: 'a (osc)',
      eccentricity: 'e (osc)',
      period: 'T (osc)',
      mass: 'mass'
    };
    const titles = body && body.titles ? body.titles : {};
    setLabel(elements.cardRadiusLabel, labels.radius, titles.radius);
    setLabel(elements.cardVelocityLabel, labels.speed, titles.speed);
    setLabel(elements.cardVelocityRatioLabel, labels.speedRatio, titles.speedRatio);
    setLabel(elements.cardPeriapsisLabel, labels.periapsis, titles.periapsis);
    setLabel(elements.cardPnLabel, labels.pnRatio, titles.pnRatio);
    setLabel(elements.cardAxisLabel, labels.axis, titles.axis);
    setLabel(elements.cardEccentricityLabel, labels.eccentricity, titles.eccentricity);
    setLabel(elements.cardPeriodLabel, labels.period, titles.period);
    setLabel(elements.cardMassLabel, labels.mass, titles.mass);
    if (!body) {
      elements.cardName.textContent = UNAVAILABLE;
      setValue(elements.cardRadius, UNAVAILABLE, 'Current radius unavailable');
      setValue(elements.cardVelocity, UNAVAILABLE, 'Current speed unavailable');
      setValue(elements.cardVelocityRatio, UNAVAILABLE, 'Current speed over c unavailable');
      setValue(elements.cardPeriapsis, UNAVAILABLE, 'Osculating periapsis unavailable');
      setValue(elements.cardPn, UNAVAILABLE, 'Current 1PN-to-Newtonian ratio unavailable');
      setValue(elements.cardAxis, UNAVAILABLE, 'Osculating semi-major axis unavailable');
      setValue(elements.cardEccentricity, UNAVAILABLE, 'Osculating eccentricity unavailable');
      setValue(elements.cardPeriod, UNAVAILABLE, 'Osculating period unavailable');
      setValue(elements.cardMass, UNAVAILABLE, 'Selected-body mass unavailable');
      elements.regimeName.textContent = UNAVAILABLE;
      elements.regimeName.style.color = '';
      elements.regimeDot.style.left = '0%';
      return;
    }
    elements.cardName.textContent = body.name || UNAVAILABLE;
    setValue(
      elements.cardRadius,
      Number.isFinite(body.currentRadiusAu) && Number.isFinite(body.currentRadiusRs)
        ? `${body.currentRadiusAu.toFixed(1)} AU (${body.currentRadiusRs.toFixed(0)}Rₛ)`
        : UNAVAILABLE,
      Number.isFinite(body.currentRadiusAu) ? `Current radius ${body.currentRadiusAu.toFixed(1)} AU` : 'Current radius unavailable'
    );
    setValue(
      elements.cardVelocity,
      Number.isFinite(body.currentSpeedKms) ? `${body.currentSpeedKms.toFixed(0)} km/s` : UNAVAILABLE,
      Number.isFinite(body.currentSpeedKms) ? `Current speed ${body.currentSpeedKms.toFixed(0)} kilometres per second` : 'Current speed unavailable'
    );
    setValue(
      elements.cardVelocityRatio,
      Number.isFinite(body.currentSpeedOverC) ? `${body.currentSpeedOverC.toFixed(5)} (${(body.currentSpeedOverC * 100).toFixed(2)}%)` : UNAVAILABLE,
      Number.isFinite(body.currentSpeedOverC) ? `Current speed over c ${body.currentSpeedOverC.toFixed(5)}` : 'Current speed over c unavailable'
    );
    setValue(
      elements.cardPeriapsis,
      Number.isFinite(body.osculatingPeriapsisAu) ? `${body.osculatingPeriapsisAu.toFixed(3)} AU` : UNAVAILABLE,
      Number.isFinite(body.osculatingPeriapsisAu) ? `Osculating periapsis ${body.osculatingPeriapsisAu.toFixed(3)} AU` : 'Osculating periapsis unavailable'
    );
    setValue(
      elements.cardPn,
      Number.isFinite(body.currentPnPct) ? `~${body.currentPnPct.toFixed(3)}%` : UNAVAILABLE,
      Number.isFinite(body.currentPnPct) ? `Current 1PN to Newtonian ratio approximately ${body.currentPnPct.toFixed(3)} percent` : 'Current 1PN to Newtonian ratio unavailable'
    );
    setValue(
      elements.cardAxis,
      body.parabolic ? 'parabolic / near escape' : body.osculatingSemiMajorAxisAu > 0 ? `${body.osculatingSemiMajorAxisAu.toFixed(0)} AU` : 'unbound',
      body.parabolic ? 'Osculating semi-major axis parabolic or near escape' : body.osculatingSemiMajorAxisAu > 0 ? `Osculating semi-major axis ${body.osculatingSemiMajorAxisAu.toFixed(0)} AU` : 'Osculating semi-major axis unbound'
    );
    setValue(
      elements.cardEccentricity,
      Number.isFinite(body.osculatingEccentricity) ? body.osculatingEccentricity.toFixed(4) : UNAVAILABLE,
      Number.isFinite(body.osculatingEccentricity) ? `Osculating eccentricity ${body.osculatingEccentricity.toFixed(4)}` : 'Osculating eccentricity unavailable'
    );
    setValue(
      elements.cardPeriod,
      body.osculatingPeriodYears > 0 ? `${body.osculatingPeriodYears.toFixed(1)} yr` : body.parabolic ? UNAVAILABLE : '∞ (unbound)',
      body.osculatingPeriodYears > 0 ? `Osculating period ${body.osculatingPeriodYears.toFixed(1)} years` : body.parabolic ? 'Osculating period unavailable' : 'Osculating period unbound'
    );
    setValue(
      elements.cardMass,
      body.mass >= 1e3 ? `${body.mass.toExponential(0)} M☉` : `${body.mass.toFixed(1)} M☉`,
      `Selected-body mass ${body.mass}`
    );
    elements.regimeName.textContent = body.regime;
    elements.regimeName.style.color = body.regimeColor;
    elements.regimeDot.style.left = `${body.regimePosition * 100}%`;
  }

  SGRA.UI.HudView = Object.freeze({ updateHud, updateBodyCards });
})(typeof window !== 'undefined' ? window : globalThis);
