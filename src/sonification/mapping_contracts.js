// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachMappingContracts(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // One contract per channel,
  // generated from sonification_calibration.js so it cannot drift from
  // the numbers actually running. SCOPE is generic (no doc 07 §7
  // scenario contract exists), recorded honestly rather than invented.
  //
  // CORRECTION: the prior pulse contract described an instantaneous-
  // radius mapping while its legend said "faster ticks mean getting
  // closer" -- a rate claim from a non-rate source. The pulse contract
  // below matches what continuous_channel_mapping.js actually computes:
  // signed radial rate dr/dt, inward-only.

  const CONTRACT_VERSION = 2; // bumped: pulse's source quantity and
  // semantics changed from v1 (instantaneous radius) to v2 (signed
  // radial rate, inward-only). A consumer checking contractVersion
  // against a cached v1 copy will correctly see it as stale.
  const SCENARIO_SCOPE = 'generic (no scenario contract exists yet -- see doc 07 §7)';

  function buildContracts(calibration) {
    const c = calibration;
    const pitchRangeList = Object.keys(c.PITCH_RANGES)
      .map(key => `${c.PITCH_RANGES[key].label} (${c.PITCH_RANGES[key].minHz}-${c.PITCH_RANGES[key].maxHz} Hz)`)
      .join(', ');
    return Object.freeze([
      Object.freeze({
        channel: 'carrier',
        scenario: SCENARIO_SCOPE,
        contractVersion: CONTRACT_VERSION,
        sourceQuantity: 'radius: current Euclidean radial distance (AU) from the followed body to Sgr A*',
        derivedVia: 'inverse radius, log-space linear interpolation, clamped to [radiusMinAu, radiusMaxAu], into the user-selected pitch range',
        constants: {
          radiusMinAu: c.CARRIER.radiusMinAu,
          radiusMaxAu: c.CARRIER.radiusMaxAu,
          pitchRanges: pitchRangeList,
          defaultPitchRange: c.PITCH_RANGES[c.DEFAULT_PITCH_RANGE].label
        },
        initialUsabilityValues: true,
        polarity: c.CARRIER.polarity,
        polarityJustification: "D7 convention (higher value -> higher pitch), applied to inverse radius so 'closer' is the higher-value end.",
        polarityValidatedWithBlvParticipants: c.CARRIER.polarityValidatedWithBlvParticipants,
        rangeClamp: `pitch bounds follow the selected range (${pitchRangeList}); radius beyond [${c.CARRIER.radiusMinAu}, ${c.CARRIER.radiusMaxAu}] AU is clamped, not extrapolated`,
        noiseFloor: 'not applicable to this channel',
        tolerance: 'not yet measured against the doc 06 §10 determinism gate',
        allowedInference: 'relative current radial proximity of the followed body to Sgr A*, right now, in this session',
        forbidden: 'orbital speed, direction of motion, capture, eventual outcome, physical frequency, mass, or a time-to-event',
        spokenEquivalent: 'the object list / inspector already exposes exact position on demand; this channel adds no fact speech does not already carry',
        legendText: `A continuous tone: higher pitch means the followed body is currently closer to the black hole, lower pitch means farther away. This is the ${c.PITCH_RANGES[c.DEFAULT_PITCH_RANGE].label} pitch range by default and can be changed. Its initial engineering mapping range is ${c.CARRIER.radiusMinAu} to ${c.CARRIER.radiusMaxAu} astronomical units, not a measured scientific calibration. This mapping has not been tested with blind or low-vision listeners.`
      }),
      Object.freeze({
        channel: 'pulse',
        scenario: SCENARIO_SCOPE,
        contractVersion: CONTRACT_VERSION,
        sourceQuantity: 'signed radial rate dr/dt = dot(relativePosition, relativeVelocity) / radius',
        derivedVia: 'a closed-form kinematic transform of the followed body\'s position and velocity relative to Sgr A* -- no force law, integrator, or prediction',
        constants: {
          inwardSpeedMinAuPerYr: c.PULSE.inwardSpeedMinAuPerYr,
          inwardSpeedMaxAuPerYr: c.PULSE.inwardSpeedMaxAuPerYr,
          deadZoneAuPerYr: c.PULSE.deadZoneAuPerYr,
          intervalAtMinSpeedMs: c.PULSE.intervalAtMinSpeedMs,
          intervalAtMaxSpeedMs: c.PULSE.intervalAtMaxSpeedMs,
          minEventIntervalMs: c.RATE_GOVERNOR.minEventIntervalMs
        },
        initialUsabilityValues: true,
        polarity: 'faster inward radial speed -> shorter tick interval; only inward motion produces ticks at all',
        polarityValidatedWithBlvParticipants: false,
        rangeClamp: `${c.PULSE.intervalAtMaxSpeedMs}-${c.PULSE.intervalAtMinSpeedMs} ms, floored at ${c.RATE_GOVERNOR.minEventIntervalMs} ms; no tick below ${c.PULSE.deadZoneAuPerYr} AU/yr inward speed`,
        noiseFloor: 'not applicable to this channel',
        tolerance: 'not yet measured against the doc 06 §10 determinism gate',
        allowedInference: 'that the followed body\'s distance to Sgr A* is currently decreasing, and an approximate current rate -- nothing about what happens next',
        forbidden: 'capture, collision, closest approach, eventual inward continuation, or certainty about the orbit; any pitch variation encoding this channel\'s information',
        spokenEquivalent: 'not yet provided on demand for the exact numeric rate',
        legendText: 'Short clicks, only while the followed body is currently getting closer to the black hole: faster clicking means a faster current decrease in distance. No clicking can mean the body is moving away, holding steady, or that its motion is not currently known -- it does not mean nothing is happening.'
      }),
      Object.freeze({
        channel: 'invariant',
        scenario: SCENARIO_SCOPE,
        contractVersion: CONTRACT_VERSION,
        sourceQuantity: 'specific orbital energy E = |v|^2/2 - GM/r, computed each sample from the followed body\'s position and velocity',
        derivedVia: 'fractional drift between consecutive specific-energy samples -- computed internally only; has no physics/runtime consequence and produces no sound in SON-1',
        constants: {
          measuredNoiseFloor: c.INVARIANT.measuredNoiseFloor,
          measuredNoiseFloorUnits: c.INVARIANT.measuredNoiseFloorUnits,
          measuredAt: c.INVARIANT.measuredAt,
          measurementMethod: c.INVARIANT.measurementMethod
        },
        initialUsabilityValues: false,
        polarity: 'not applicable -- this channel is silent in SON-1',
        polarityValidatedWithBlvParticipants: false,
        rangeClamp: 'not applicable',
        noiseFloor: 'NOT MEASURED. This channel is silent by construction until a declared scenario set, a measured noise floor, documented threshold/provenance, and separate approval all exist.',
        tolerance: 'not applicable -- no sound is produced',
        allowedInference: 'none -- this channel produces no audible signal in SON-1 and licenses no "steady means safe" or "no interaction" claim',
        forbidden: 'any invariant timbre, pulse, or cue; any claim tied to silence meaning safety or absence of interaction',
        spokenEquivalent: 'not applicable',
        legendText: 'A channel reserved for detecting real changes to the orbit is unavailable in this version because it has not yet been calibrated.'
      }),
      Object.freeze({
        channel: 'event',
        scenario: SCENARIO_SCOPE,
        contractVersion: CONTRACT_VERSION,
        sourceQuantity: 'the exact text and priority of an already-qualified status announcement',
        derivedVia: 'no transformation -- the spoken text is verbatim the same text shown in the visible accessible-status region',
        constants: {},
        initialUsabilityValues: false,
        polarity: 'not applicable',
        polarityValidatedWithBlvParticipants: false,
        rangeClamp: 'not applicable',
        noiseFloor: 'not applicable',
        tolerance: 'not applicable',
        allowedInference: 'exactly what the spoken words state, and nothing more',
        forbidden: 'earcons standing in for this channel (SON-03); any rewording, summarising, or added certainty beyond the source text',
        spokenEquivalent: 'this channel IS the text equivalent',
        legendText: 'Physics events such as closest approach can be spoken aloud as plain words, labelled "Speak page event messages" -- off by default, and independent of the rest of sonification.'
      })
    ]);
  }

  function getContracts() {
    const calibration = SGRA.Sonification && SGRA.Sonification.Calibration;
    if (!calibration) return Object.freeze([]);
    return buildContracts(calibration);
  }

  SGRA.Sonification.MappingContracts = Object.freeze({ getContracts, CONTRACT_VERSION });
})(typeof window !== 'undefined' ? window : globalThis);
