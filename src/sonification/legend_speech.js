// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachLegendSpeech(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // The current contract: the
  // legend is no longer auto-played on first enable. It exists only
  // behind an explicit "Replay sound legend" control (see sgra_sim.html)
  // -- keyboard/touch accessible and available while continuous sound is
  // paused. play() now accepts an onEnd callback wired to the utterance's
  // genuine end event, so the audio authority can resume continuous sound
  // the moment speech actually finishes rather than after a fixed timer.
  //
  // Required content (item D), all built from mapping_contracts.js's
  // legendText fields so the legend and the versioned contract can never
  // say two different things about the same channel:
  //   - higher/lower pitch convention
  //   - pulse timing convention, INCLUDING that no pulse can mean
  //     outward/stationary/unknown radial motion, not "nothing happened"
  //   - that sound does not determine capture, ejection, or future outcome
  //   - the current pitch-range choice
  //   - that invariant sonification is unavailable until it has a
  //     measured threshold

  function buildLegendScript(contracts, settings) {
    if (!contracts || contracts.length === 0) return '';
    const snapshot = settings && typeof settings.get === 'function'
      ? settings.get()
      : { speakModelEvents: false, continuousChannelsEnabled: false, pitchRangeLabel: 'Standard' };
    const parts = ['Sonification legend.'];
    const carrier = contracts.find(c => c.channel === 'carrier');
    const pulse = contracts.find(c => c.channel === 'pulse');
    const invariant = contracts.find(c => c.channel === 'invariant');
    const event = contracts.find(c => c.channel === 'event');
    if (snapshot.continuousChannelsEnabled) {
      if (carrier) parts.push(carrier.legendText);
      if (pulse) parts.push(pulse.legendText);
    } else {
      parts.push('Continuous sound is currently off.');
    }
    // Required regardless of whether continuous is on: sound never
    // determines outcome.
    parts.push('No sound in this application determines whether a body is captured, ejected, or what will happen next -- that is never something audio decides here.');
    if (invariant) parts.push(invariant.legendText);
    if (event) {
      parts.push(snapshot.speakModelEvents ? event.legendText : 'Speak page event messages is currently off.');
    }
    if (snapshot.pitchRangeLabel) parts.push(`Current pitch range: ${snapshot.pitchRangeLabel}.`);
    parts.push('This is accompaniment only, and is never required to use SGRA.');
    return parts.join(' ');
  }

  function createLegendSpeech(options = {}) {
    const speechSynthesisFactory = typeof options.speechSynthesisFactory === 'function' ? options.speechSynthesisFactory : null;
    const utteranceFactory = typeof options.utteranceFactory === 'function'
      ? options.utteranceFactory
      : text => ({ text, volume: 1 });
    const getContracts = typeof options.getContracts === 'function' ? options.getContracts : () => [];
    const settings = options.settings || null;
    let synth = null;
    let disposed = false;
    let playCount = 0;

    function masterGain() {
      if (!settings || typeof settings.get !== 'function') return 0.6;
      const n = Number(settings.get()?.masterGain);
      return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.6;
    }

    function ensureSynth() {
      if (disposed) return null;
      if (synth) return synth;
      if (!speechSynthesisFactory) return null;
      synth = speechSynthesisFactory();
      return synth;
    }

    // Explicit, user-initiated only -- never called automatically by
    // this module or by anything that enables sonification. onEnd, if
    // supplied, is wired to the utterance's real end event.
    function play(onEnd) {
      if (disposed) return false;
      const script = buildLegendScript(getContracts(), settings);
      if (!script) return false;
      const gain = masterGain();
      if (gain <= 0) return false;
      const speechApi = ensureSynth();
      if (!speechApi) return false;
      if (typeof speechApi.cancel === 'function') speechApi.cancel();
      const utterance = utteranceFactory(script);
      utterance.volume = gain;
      if (typeof onEnd === 'function') utterance.onend = onEnd;
      speechApi.speak(utterance);
      playCount++;
      return true;
    }

    function skip() {
      if (synth && typeof synth.cancel === 'function') synth.cancel();
    }

    function dispose() {
      disposed = true;
      skip();
      synth = null;
    }

    function snapshotCounts() { return { played: playCount }; }

    return Object.freeze({ play, skip, dispose, snapshotCounts });
  }

  SGRA.Sonification.LegendSpeech = Object.freeze({ createLegendSpeech, buildLegendScript });
})(typeof window !== 'undefined' ? window : globalThis);
