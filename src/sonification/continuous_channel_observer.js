// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachContinuousChannelObserver(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // SON-1. Read-only observer: turns "the followed body's current
  // position/velocity" into a carrier/pulse sample, on its own throttled
  // timer. No physics/render/camera/runtime import; G and central mass
  // are parameters, not imports.
  //
  // Eligibility is a first-class, testable
  // concept, not left to the caller. isEligible() must return true for a
  // sample to be produced at all -- this is where "no continuous
  // sonification during group follow" and "requires one explicit
  // followed body" are enforced, once, in the one place that decides
  // whether to sample.

  function distanceAu(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function relativeVelocity(a, b) {
    return { vx: (a.vx || 0) - (b.vx || 0), vy: (a.vy || 0) - (b.vy || 0), vz: (a.vz || 0) - (b.vz || 0) };
  }

  // options:
  //   isEligible()        -> boolean; false means "do not sample right
  //                          now" (e.g. group follow active, or no
  //                          explicit single followed body). Checked
  //                          every tick, not just at start().
  //   getFollowedBody() / getCentralBody() -> body-shaped objects or null
  //   getGravitationalConstant() -> number, injected not imported
  //   getPitchRangeKey()   -> 'low' | 'standard' | 'high', injected so a
  //                          live user setting change takes effect on
  //                          the very next sample
  //   calibration / mapping -> SGRA.Sonification.Calibration /
  //                          ContinuousChannelMapping (or test doubles)
  //   now() / intervalMs / onSample / scheduleTick / clearTick -- as
  //                          before
  function createContinuousChannelObserver(options = {}) {
    const isEligible = typeof options.isEligible === 'function' ? options.isEligible : () => true;
    const getFollowedBody = typeof options.getFollowedBody === 'function' ? options.getFollowedBody : () => null;
    const getCentralBody = typeof options.getCentralBody === 'function' ? options.getCentralBody : () => null;
    const getG = typeof options.getGravitationalConstant === 'function' ? options.getGravitationalConstant : () => NaN;
    const getPitchRangeKey = typeof options.getPitchRangeKey === 'function' ? options.getPitchRangeKey : () => 'standard';
    const calibration = options.calibration || null;
    const mapping = options.mapping || null;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const onSample = typeof options.onSample === 'function' ? options.onSample : () => {};
    const scheduleTick = typeof options.scheduleTick === 'function' ? options.scheduleTick : (fn, ms) => setInterval(fn, ms);
    const clearTick = typeof options.clearTick === 'function' ? options.clearTick : handle => clearInterval(handle);

    const requestedIntervalMs = Number.isFinite(options.intervalMs) ? options.intervalMs : 150;
    const floorMs = calibration ? calibration.RATE_GOVERNOR.minEventIntervalMs : 0;
    const effectiveIntervalMs = Math.max(requestedIntervalMs, floorMs);

    let tickHandle = null;
    let previousEnergy = null;
    let sampleCount = 0;
    let skippedIneligibleCount = 0;

    function sampleOnce() {
      if (!calibration || !mapping) return null;
      if (!isEligible()) { skippedIneligibleCount++; return null; }
      const followed = getFollowedBody();
      const central = getCentralBody();
      if (!followed || !central) return null;

      const radiusAu = distanceAu(followed, central);
      const relVel = relativeVelocity(followed, central);
      const radialRate = mapping.computeRadialRate(
        { x: followed.x - central.x, y: followed.y - central.y, z: followed.z - central.z },
        relVel
      );
      // The diagnostic is defined in the Sgr A* frame.  Using the body's
      // absolute catalogue velocity here made the invariant depend on the
      // central body's arbitrary inertial motion.
      const speed = Math.sqrt(relVel.vx * relVel.vx + relVel.vy * relVel.vy + relVel.vz * relVel.vz);
      const g = getG();
      const centralMass = Number.isFinite(central.m) ? central.m : NaN;

      const carrierHz = mapping.mapRadiusToCarrierHz(radiusAu, calibration, getPitchRangeKey());
      const pulseIntervalMs = mapping.mapInwardRadialRateToPulseIntervalMs(radialRate, calibration);

      const currentEnergy = mapping.computeSpecificOrbitalEnergy(radiusAu, speed, g, centralMass);
      const drift = mapping.computeSpecificEnergyDrift(previousEnergy, currentEnergy);
      const invariantAboveFloor = mapping.isDriftAboveNoiseFloor(drift, calibration);
      previousEnergy = Number.isFinite(currentEnergy) ? currentEnergy : previousEnergy;

      sampleCount++;
      const s = Object.freeze({
        radiusAu, radialRateAuPerYr: radialRate, carrierHz, pulseIntervalMs,
        invariantAboveFloor, drift, at: now()
      });
      onSample(s);
      return s;
    }

    function start() {
      if (tickHandle !== null) return;
      tickHandle = scheduleTick(sampleOnce, effectiveIntervalMs);
    }

    function stop() {
      if (tickHandle === null) return;
      clearTick(tickHandle);
      tickHandle = null;
    }

    function isRunning() { return tickHandle !== null; }

    function resetInvariantBaseline() { previousEnergy = null; }

    function snapshotCounts() { return { samples: sampleCount, skippedIneligible: skippedIneligibleCount }; }

    return Object.freeze({
      start, stop, isRunning, sampleOnce, resetInvariantBaseline, snapshotCounts,
      effectiveIntervalMs
    });
  }

  SGRA.Sonification.ContinuousChannelObserver = Object.freeze({ createContinuousChannelObserver });
})(typeof window !== 'undefined' ? window : globalThis);
