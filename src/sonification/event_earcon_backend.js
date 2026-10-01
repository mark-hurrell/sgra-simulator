// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachEventEarconBackend(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // Increment 2 of the tracked sonification package
  // (SONIFICATION_CHANGE_PACKAGE_002.md). A concrete audio backend for the
  // event-channel arbitration service built in increment 1
  // (audio_arbitration_service.js). Plugs in via setBackend(); does not
  // change arbitration decisions.
  //
  // Hard constraints from README_FOR_OPUS_DESIGN_CONTEXT.md, enforced
  // structurally below and re-checked by
  // tests/sonification_boundary.test.mjs:
  //   - mono-safe: no StereoPannerNode, no pan parameter of any kind; the
  //     signal is identical in both channels because nothing ever splits it.
  //   - loudness is never a data channel: each event kind has one fixed
  //     peak gain, scaled only by the user's single overall master gain
  //     (settings.masterGain). No per-event value is derived from model
  //     state, priority magnitude, or event content.
  //   - no definitive capture cue: earcons are selected purely by the
  //     three existing STATUS_PRIORITY-derived kinds (model-event /
  //     form-result / user-action). The event text is never parsed for
  //     keywords ("captured", "accreted", etc.) to select or shape a sound
  //     -- doing so would let the audio layer assert something the
  //     existing, already-reviewed status text did not already assert.
  //     This is what doc 07 Appendix B's FORBIDDEN line is for.
  //   - calm, low-sensory-load production (doc 07 evidence item 16):
  //     short tones, gentle envelopes, no continuous drone in this
  //     increment.

  // One earcon per kind. Frequencies and durations are fixed constants,
  // not derived from anything -- see the loudness-as-data constraint above.
  // Distinct timbre per kind follows McGookin & Brewster (doc 07 evidence
  // item 8): concurrent/near-concurrent earcons need to be discriminable,
  // which a shared waveform and pitch would defeat.
  // CORRECTION (see SONIFICATION_CHANGE_PACKAGE_003.md): the first version
  // of this file included a 'model-event' profile and played a tone for
  // it. That directly contradicted doc 07 SON-01 ("event (sparse,
  // spoken)") and SON-03 ("Events are spoken words, not earcons"), which
  // were in the section of the document not read before increment 2 was
  // built. Physics events (pericentre, accretion, ejection) are spoken by
  // spoken_event_backend.js instead. This file now handles only
  // form-result and user-action -- ordinary UI confirmations, not part of
  // SON-01's four scientific channels, which D4 separately allows as
  // "confirmation tones" through the same audio authority. That scoping
  // is this codebase's own judgement call, not a direct doc 07 mandate,
  // and is recorded as such rather than asserted as settled.
  const EARCON_PROFILES = Object.freeze({
    'form-result': Object.freeze({ waveform: 'triangle', frequencyHz: 520, durationMs: 140, peakGain: 0.45 }),
    'user-action': Object.freeze({ waveform: 'sine', frequencyHz: 200, durationMs: 60, peakGain: 0.35 })
  });

  function profileFor(kind) {
    return EARCON_PROFILES[kind] || null;
  }

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  // audioContextFactory is injected so this module is testable without a
  // real Web Audio implementation (unavailable under node --test) and so
  // the browser entrypoint controls exactly when a context is constructed
  // (autoplay policy requires it happen inside a user-gesture handler --
  // see the bSonification click handler in sgra_sim.html, not in here).
  function createEventEarconBackend(options = {}) {
    const audioContextFactory = typeof options.audioContextFactory === 'function' ? options.audioContextFactory : null;
    const settings = options.settings || null;
    let ctx = null;
    let disposed = false;

    function masterGain() {
      if (!settings || typeof settings.get !== 'function') return 0.6;
      const snapshot = settings.get();
      return clamp01(snapshot && snapshot.masterGain);
    }

    function ensureContext() {
      if (disposed) return null;
      if (ctx) return ctx;
      if (!audioContextFactory) return null;
      ctx = audioContextFactory();
      return ctx;
    }

    // INT-03: on iOS the resume must happen synchronously inside the
    // user-gesture handler, not lazily whenever the first event happens
    // to arrive. This is the method the enable toggle calls directly;
    // play() no longer needs to construct a context from cold because
    // this will already have run first (though play() still calls
    // ensureContext() defensively in case it is ever invoked without an
    // explicit enable step, e.g. in a test harness).
    function ensureContextAndResume() {
      const audioCtx = ensureContext();
      if (!audioCtx) return { state: 'not-constructed' };
      const resumeResult = typeof audioCtx.resume === 'function' ? audioCtx.resume() : undefined;
      return { state: audioCtx.state || 'unknown', resumeResult };
    }

    function getState() {
      return ctx ? (ctx.state || 'unknown') : 'not-constructed';
    }

    // The qualified event from the arbitration service: { kind, priority,
    // text, at }. Only `kind` selects the earcon; `text` and `priority`
    // are intentionally unused here (see the no-definitive-capture-cue
    // constraint above -- the arbitration layer's classification is the
    // full extent of what this backend is allowed to react to).
    function play(qualifiedEvent) {
      if (disposed || !qualifiedEvent || typeof qualifiedEvent.kind !== 'string') return false;
      const profile = profileFor(qualifiedEvent.kind);
      // Hard refusal, not a fallback profile: a 'model-event' (or any
      // unrecognised kind) must never receive a tone. Silently falling
      // back to the user-action profile would still be an earcon for a
      // physics event, which is exactly what SON-03 rules out. This is
      // enforced here in addition to upstream routing (see
      // ensureSonificationBackendWired in sgra_sim.html) as defence in
      // depth against a future routing bug.
      if (!profile) return false;
      const audioCtx = ensureContext();
      if (!audioCtx) return false;

      const peak = profile.peakGain * masterGain();
      if (peak <= 0) return false; // muted master gain: arbitrate, but produce nothing

      const now = audioCtx.currentTime;
      const durationS = profile.durationMs / 1000;

      const oscillator = audioCtx.createOscillator();
      oscillator.type = profile.waveform;
      oscillator.frequency.value = profile.frequencyHz;

      const gainNode = audioCtx.createGain();
      // Gentle attack/decay -- no pan node exists anywhere in this chain
      // (mono-safe: connects straight to destination, identical in both
      // channels by construction, not by an explicit centred pan value).
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(peak, now + Math.min(0.02, durationS / 4));
      gainNode.gain.linearRampToValueAtTime(0, now + durationS);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start(now);
      oscillator.stop(now + durationS + 0.01);

      return true;
    }

    function suspend() {
      if (ctx && typeof ctx.suspend === 'function') ctx.suspend();
    }

    function resume() {
      if (ctx && typeof ctx.resume === 'function') ctx.resume();
    }

    // Never close the shared AudioContext --
    // see continuous_channel_backend.js's identical note. Only
    // sonification_audio_authority.js owns close().
    function dispose() {
      disposed = true;
      ctx = null;
    }

    return Object.freeze({ play, suspend, resume, dispose, ensureContextAndResume, getState });
  }

  SGRA.Sonification.EventEarconBackend = Object.freeze({
    createEventEarconBackend,
    EARCON_PROFILES
  });
})(typeof window !== 'undefined' ? window : globalThis);
