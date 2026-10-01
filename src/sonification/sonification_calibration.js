// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachSonificationCalibration(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // This file is the one place
  // TO CHANGE SONIFICATION NUMBERS.
  //
  // NAMING IS DELIBERATE: everything below is an "initial usability
  // value" / "initial mapping range" -- chosen so the feature is usable
  // and testable now, NOT a validated scientific calibration. Do not
  // present these numbers, in code, UI copy, or documentation, as
  // measured or scenario-derived. Future data-driven calibration is
  // explicitly deferred until scenario trajectories and a measured
  // invariant-noise methodology exist (see INVARIANT below).
  //
  // Units follow src/domain/constants.js: distance in AU, time in years,
  // G = 4*pi^2. This file imports nothing (see the boundary gate) --
  // it is data, handed to continuous_channel_mapping.js's pure functions
  // as parameters.

  const Calibration = {
    // ---- CARRIER: pitch, current radial proximity only ----
    // Source: current Euclidean radial distance (AU) from the followed
    // body to Sgr A*. Mapping: logarithmic inverse-radius -> pitch.
    // Permitted inference: relative current radial proximity only.
    // Forbidden: orbital speed, direction of motion, capture, eventual
    // outcome, physical frequency, mass, or time-to-event -- none of
    // those are computed or implied anywhere carrier touches.
    CARRIER: {
      radiusMinAu: 20,   // initial usability value, not measured
      radiusMaxAu: 10000, // initial engineering mapping range, not measured
      polarity: 'closer-is-higher-pitch',
      polarityValidatedWithBlvParticipants: false
    },

    // Accessible pitch-range choice, not a raw slider. The choice changes
    // ONLY the pitch bounds -- never the mapping meaning, gain, stereo,
    // or event semantics. 'standard' is default.
    PITCH_RANGES: {
      low: { minHz: 110, maxHz: 330, label: 'Low' },
      standard: { minHz: 220, maxHz: 660, label: 'Standard' },
      high: { minHz: 330, maxHz: 990, label: 'High' }
    },
    DEFAULT_PITCH_RANGE: 'standard',

    // ---- PULSE: timing, signed radial rate (dr/dt) only ----
    // Source: dr/dt = dot(relativePosition, relativeVelocity) / radius --
    // a closed-form kinematic quantity, not a force law or integrator
    // output. Only INWARD motion (dr/dt < 0) produces ticks. Outward,
    // stationary, unknown, non-finite, or below-dead-zone radial motion
    // produces no pulse at all -- silence there means "not currently
    // closing in", never "nothing happened".
    PULSE: {
      inwardSpeedMinAuPerYr: 0,     // initial usability value
      inwardSpeedMaxAuPerYr: 250,   // initial usability value
      // Below this |dr/dt| (AU/yr), even inward motion produces no
      // pulse -- a dead zone so near-zero radial motion doesn't chatter.
      // Provisional; not measured against any real trajectory noise.
      deadZoneAuPerYr: 2,
      intervalAtMinSpeedMs: 1200, // slowest tick (at/just above dead zone)
      intervalAtMaxSpeedMs: 250,  // fastest tick (at/beyond 250 AU/yr)
      // Interpolation is logarithmic between the dead zone and max speed,
      // matching the perceptual literature already cited for the carrier
      // channel (log-scaled proximity discrimination) rather than a
      // separate ad hoc curve for this channel.
      interpolation: 'logarithmic'
    },

    // ---- INVARIANT: silent in SON-1 ----
    // No measured, scenario-derived noise floor exists. This channel
    // computes nothing that produces sound; any internal diagnostic
    // value (see continuous_channel_mapping.js) has no physics/runtime
    // consequence and licenses no "steady means safe" claim. A future
    // invariant channel requires: a declared scenario set, a measured
    // noise floor, documented threshold/provenance, and separate
    // approval -- none of which this file or package attempts.
    INVARIANT: {
      measuredNoiseFloor: null,
      measuredNoiseFloorUnits: 'fractional drift in specific orbital energy per orbit',
      measuredAt: null,
      measurementMethod: null
    },

    // ---- Shared rate governor ----
    // Hard floor beneath PULSE's own interval range: no pulse may be
    // scheduled faster than this, even if a future setting changes
    // PULSE's own numbers above.
    RATE_GOVERNOR: {
      minEventIntervalMs: 180
    },

    // ---- Concurrency ----
    // A-side requirement: at most this many auditory objects sound at
    // once. Legend/event speech duck (pause, not stop) the continuous
    // carrier+pulse pair rather than adding a third simultaneous source.
    MAX_CONCURRENT_AUDITORY_OBJECTS: 2
  };

  function freezeDeep(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freezeDeep);
      return Object.freeze(value);
    }
    return value;
  }

  SGRA.Sonification.Calibration = freezeDeep({
    CARRIER: { ...Calibration.CARRIER },
    PITCH_RANGES: { ...Calibration.PITCH_RANGES },
    DEFAULT_PITCH_RANGE: Calibration.DEFAULT_PITCH_RANGE,
    PULSE: { ...Calibration.PULSE },
    INVARIANT: { ...Calibration.INVARIANT },
    RATE_GOVERNOR: { ...Calibration.RATE_GOVERNOR },
    MAX_CONCURRENT_AUDITORY_OBJECTS: Calibration.MAX_CONCURRENT_AUDITORY_OBJECTS
  });
})(typeof window !== 'undefined' ? window : globalThis);
