// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachContinuousChannelMapping(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // Pure functions only -- no state, no DOM, no audio API, no
  // physics import. The current contract maps
  // pulse from instantaneous radius while its own legend said "faster
  // ticks mean getting closer" -- a rate claim from a non-rate quantity.
  // Pulse is now driven by the signed radial rate dr/dt, matching the
  // legend it ships with.

  function clamp(value, min, max) {
    if (Number.isNaN(value)) return min;
    if (typeof value !== 'number') return min;
    return Math.min(max, Math.max(min, value));
  }

  function logMapClampedRadius(radius, radiusMin, radiusMax, outAtRadiusMin, outAtRadiusMax) {
    const r = clamp(radius, radiusMin, radiusMax);
    const logMin = Math.log(radiusMin);
    const logMax = Math.log(radiusMax);
    const logR = Math.log(r);
    const t = logMax === logMin ? 0 : (logR - logMin) / (logMax - logMin);
    return outAtRadiusMin + t * (outAtRadiusMax - outAtRadiusMin);
  }

  // CARRIER: inverse-radius -> pitch. radiusMinAu (closest) maps to the
  // chosen pitch range's max; radiusMaxAu (farthest) maps to its min.
  // pitchRangeKey selects one of calibration.PITCH_RANGES ('low',
  // 'standard', 'high'); an unknown key falls back to
  // calibration.DEFAULT_PITCH_RANGE rather than throwing.
  function mapRadiusToCarrierHz(radiusAu, calibration, pitchRangeKey) {
    const c = calibration.CARRIER;
    const range = calibration.PITCH_RANGES[pitchRangeKey] || calibration.PITCH_RANGES[calibration.DEFAULT_PITCH_RANGE];
    return logMapClampedRadius(radiusAu, c.radiusMinAu, c.radiusMaxAu, range.maxHz, range.minHz);
  }

  // Signed radial rate: dr/dt = dot(relativePosition, relativeVelocity) / r.
  // Negative means the radius is currently decreasing (closing in).
  // A closed-form kinematic transform of already-computed position and
  // velocity -- no force law, no integrator, no prediction. Returns NaN
  // for a degenerate radius or non-finite input, never a false zero.
  function computeRadialRate(relPos, relVel) {
    if (!relPos || !relVel) return NaN;
    const { x, y, z } = relPos;
    const { vx, vy, vz } = relVel;
    if (![x, y, z, vx, vy, vz].every(Number.isFinite)) return NaN;
    const r = Math.sqrt(x * x + y * y + z * z);
    if (!(r > 0)) return NaN;
    const dot = x * vx + y * vy + z * vz;
    return dot / r;
  }

  // PULSE: inward-only. Returns null (no pulse) for outward, stationary,
  // unknown (NaN), non-finite, or below-dead-zone radial motion -- silence
  // there is a distinct state from "measured, and slow", never collapsed
  // into a false near-zero. Only a radialRateAuPerYr <= -deadZone produces
  // an interval; faster inward speed -> shorter interval, floored by the
  // shared rate governor regardless of how fast the body is closing.
  function mapInwardRadialRateToPulseIntervalMs(radialRateAuPerYr, calibration) {
    const p = calibration.PULSE;
    if (!Number.isFinite(radialRateAuPerYr)) return null;
    if (radialRateAuPerYr > -p.deadZoneAuPerYr) return null; // outward, stationary, or inside the dead zone
    const inwardSpeed = -radialRateAuPerYr; // positive AU/yr, how fast it's closing in
    const speedFloor = Math.max(p.deadZoneAuPerYr, p.inwardSpeedMinAuPerYr || p.deadZoneAuPerYr);
    const clampedSpeed = clamp(inwardSpeed, speedFloor, p.inwardSpeedMaxAuPerYr);
    // log-map: at speedFloor -> intervalAtMinSpeedMs (slowest), at
    // inwardSpeedMaxAuPerYr -> intervalAtMaxSpeedMs (fastest)
    const logMin = Math.log(speedFloor);
    const logMax = Math.log(p.inwardSpeedMaxAuPerYr);
    const logS = Math.log(clampedSpeed);
    const t = logMax === logMin ? 1 : (logS - logMin) / (logMax - logMin);
    const raw = p.intervalAtMinSpeedMs + t * (p.intervalAtMaxSpeedMs - p.intervalAtMinSpeedMs);
    return Math.max(raw, calibration.RATE_GOVERNOR.minEventIntervalMs);
  }

  // INVARIANT (diagnostic only -- see sonification_calibration.js: this
  // channel produces no sound in SON-1 regardless of what these return).
  function isDriftAboveNoiseFloor(drift, calibration) {
    const floor = calibration.INVARIANT.measuredNoiseFloor;
    if (floor === null || floor === undefined || !Number.isFinite(floor)) return false;
    if (!Number.isFinite(drift)) return false;
    return Math.abs(drift) > floor;
  }

  function computeSpecificOrbitalEnergy(radiusAu, speedAuPerYr, gravitationalConstant, centralMassSolar) {
    if (!Number.isFinite(radiusAu) || radiusAu <= 0) return NaN;
    return (speedAuPerYr * speedAuPerYr) / 2 - (gravitationalConstant * centralMassSolar) / radiusAu;
  }

  function computeSpecificEnergyDrift(previousEnergy, currentEnergy) {
    if (!Number.isFinite(previousEnergy) || !Number.isFinite(currentEnergy) || previousEnergy === 0) return NaN;
    return (currentEnergy - previousEnergy) / previousEnergy;
  }

  SGRA.Sonification.ContinuousChannelMapping = Object.freeze({
    clamp,
    logMapClampedRadius,
    mapRadiusToCarrierHz,
    computeRadialRate,
    mapInwardRadialRateToPulseIntervalMs,
    isDriftAboveNoiseFloor,
    computeSpecificOrbitalEnergy,
    computeSpecificEnergyDrift
  });
})(typeof window !== 'undefined' ? window : globalThis);
