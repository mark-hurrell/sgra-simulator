// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachSpokenEventBackend(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // Increment 3 / correction package (SONIFICATION_CHANGE_PACKAGE_003.md).
  // This is the actual SON-01 "event" channel: sparse, spoken. It exists
  // because event_earcon_backend.js's first version wrongly played a tone
  // for model events (pericentre, accretion, ejection), which SON-03
  // rules out categorically: "Events are spoken words, not earcons."
  //
  // This backend handles ONLY the 'model-event' kind. It speaks the exact
  // text the arbitration service already carries -- the same text the
  // visible accessible-status region shows -- so it cannot assert
  // anything beyond what has already been reviewed and displayed (D9: no
  // discrete cue may assert an undetermined fact; INT-04: every audible
  // feature has a text equivalent, trivially satisfied here since they
  // are the same string).
  //
  // Deliberately conservative on one open question doc 07 leaves
  // unresolved: whether this backend's own speech collides with a screen
  // reader's own announcement of the same live region (the "two speech
  // sources talking over each other" problem SR-11 names for the
  // separate self-voicing feature). Rather than guess, this backend
  // requires its OWN explicit opt-in on top of sonification being on
  // (settings.speakModelEvents, default false) -- see
  // sonification_settings.js and the paired UI control in sgra_sim.html.
  // That is a recorded, conservative engineering choice, not a claim that
  // doc 07 has settled the question; §12's open items and amendment 3
  // (BLV participants) are what would actually settle it.
  //
  // No pitch/rate is ever derived from event content, priority, or model
  // state (extends D6/D8's discipline to speech synthesis parameters,
  // which is this codebase's own extension, not a literal doc 07 line
  // about SpeechSynthesisUtterance).

  const DEFAULT_RATE = 1;
  const FIXED_PITCH = 1;

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  // speechSynthesisFactory returns an object with speak(utterance) and
  // cancel(); utteranceFactory returns an utterance-shaped object given
  // text. Both injected for testability (no real speechSynthesis under
  // node --test) and so the browser entrypoint controls construction
  // timing exactly as event_earcon_backend.js does for AudioContext.
  function createSpokenEventBackend(options = {}) {
    const speechSynthesisFactory = typeof options.speechSynthesisFactory === 'function' ? options.speechSynthesisFactory : null;
    const utteranceFactory = typeof options.utteranceFactory === 'function'
      ? options.utteranceFactory
      : text => ({ text, volume: 1, rate: DEFAULT_RATE, pitch: FIXED_PITCH });
    const settings = options.settings || null;
    let synth = null;
    let disposed = false;
    let spokenCount = 0;

    function isSpeechEnabled() {
      if (!settings || typeof settings.get !== 'function') return false;
      const snapshot = settings.get();
      return !!(snapshot && snapshot.enabled === true && snapshot.speakModelEvents === true);
    }

    function masterGain() {
      if (!settings || typeof settings.get !== 'function') return 0.6;
      const snapshot = settings.get();
      return clamp01(snapshot && snapshot.masterGain);
    }

    function ensureSynth() {
      if (disposed) return null;
      if (synth) return synth;
      if (!speechSynthesisFactory) return null;
      synth = speechSynthesisFactory();
      return synth;
    }

    // qualifiedEvent: { kind, priority, text, at }. Only 'model-event'
    // is spoken here; any other kind is refused (defence in depth --
    // upstream routing should never send anything else, but this
    // backend does not trust that alone). onEnd, if supplied by the
    // audio authority, is wired to the utterance's genuine end event so
    // the authority can resume continuous sound immediately rather than
    // waiting out a fixed fallback timer.
    function play(qualifiedEvent, onEnd) {
      if (disposed || !qualifiedEvent || qualifiedEvent.kind !== 'model-event') return false;
      if (typeof qualifiedEvent.text !== 'string' || !qualifiedEvent.text.trim()) return false;
      if (!isSpeechEnabled()) return false;

      const gain = masterGain();
      if (gain <= 0) return false;

      const speechApi = ensureSynth();
      if (!speechApi) return false;

      // The exact text already shown in the accessible status region --
      // no rewording, no added certainty, no truncation that could change
      // meaning.
      const utterance = utteranceFactory(qualifiedEvent.text);
      utterance.volume = gain;
      const configuredRate = Number(settings?.get?.()?.speechRate);
      utterance.rate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : DEFAULT_RATE;
      utterance.pitch = FIXED_PITCH;
      if (typeof onEnd === 'function') utterance.onend = onEnd;

      speechApi.speak(utterance);
      spokenCount++;
      return true;
    }

    function cancelPending() {
      if (synth && typeof synth.cancel === 'function') synth.cancel();
    }

    function dispose() {
      disposed = true;
      cancelPending();
      synth = null;
    }

    function snapshotCounts() {
      return { spoken: spokenCount };
    }

    return Object.freeze({ play, cancelPending, dispose, snapshotCounts });
  }

  SGRA.Sonification.SpokenEventBackend = Object.freeze({
    createSpokenEventBackend
  });
})(typeof window !== 'undefined' ? window : globalThis);
