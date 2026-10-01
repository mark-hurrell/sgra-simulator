// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachAudioAuthority(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // The one audio
  // authority. Every page-produced sound -- continuous carrier+pulse,
  // user earcons, replayed legend speech, optional spoken page/model
  // events -- is owned here. No other module constructs its own
  // AudioContext or references window.speechSynthesis directly; each
  // backend is handed a factory that returns THIS authority's single
  // shared instance, memoized, so "one owner" is structural, not a
  // convention someone could bypass by accident.
  //
  // Concurrency: continuous carrier+pulse together count as ONE
  // auditory object. Playing an earcon, the legend, or a spoken event
  // is the second and only other object -- starting one always ducks
  // (silences, without discarding state) the continuous pair first, and
  // restores it when the foreground sound ends. There is never a third
  // simultaneous source.
  //
  // Guaranteed stop: disable() is synchronous and leaves nothing able to
  // produce sound afterward, including a pulse timer callback already
  // in flight when disable() runs (continuous_channel_backend.js's own
  // `disposed`/`silenced` self-guard covers that; this module
  // additionally closes the shared context and cancels all speech).

  const EARCON_ASSUMED_DURATION_MS = 250; // covers every earcon profile's
  // actual duration (60-140ms) with margin; see event_earcon_backend.js.
  // A fixed, documented assumption rather than asking the backend for a
  // per-kind duration keeps the authority from needing to know earcon
  // internals.

  function suspendPageAudio({ pauseForLifecycle, speechSynthesis, audioContext }) {
    pauseForLifecycle();
    if (speechSynthesis && typeof speechSynthesis.cancel === 'function') {
      try { speechSynthesis.cancel(); } catch (_) { /* ignore */ }
    }
    const result = audioContext?.state === 'running' ? audioContext.suspend?.() : null;
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  function resumePageAudio(audioContext) {
    const result = audioContext?.state === 'suspended' ? audioContext.resume?.() : null;
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  function disposeAudioResources({ clearForegroundTimer, continuousBackend, toneBackend, spokenEventBackend, legendBackend, speechSynthesis, audioContext }) {
    clearForegroundTimer();
    continuousBackend?.dispose?.();
    toneBackend?.dispose?.();
    spokenEventBackend?.dispose?.();
    legendBackend?.dispose?.();
    if (speechSynthesis && typeof speechSynthesis.cancel === 'function') {
      try { speechSynthesis.cancel(); } catch (_) { /* already torn down */ }
    }
    if (audioContext && typeof audioContext.close === 'function') {
      const closeResult = audioContext.close();
      if (closeResult && typeof closeResult.catch === 'function') closeResult.catch(() => { /* already closed/closing -- nothing further to do */ });
    }
  }

  function createAudioAuthority(options = {}) {
    const audioContextCtor = typeof options.audioContextFactory === 'function'
      ? options.audioContextFactory
      : null;
    const speechSynthesisCtor = typeof options.speechSynthesisFactory === 'function'
      ? options.speechSynthesisFactory
      : null;
    const scheduleTimeout = typeof options.scheduleTimeout === 'function' ? options.scheduleTimeout : (fn, ms) => setTimeout(fn, ms);
    const clearTimeoutFn = typeof options.clearTimeoutFn === 'function' ? options.clearTimeoutFn : handle => clearTimeout(handle);

    let sharedAudioContext = null;
    let sharedSpeechSynthesis = null;
    let enabled = false;
    let continuousUserPaused = false;
    let continuousLifecyclePaused = false;
    let foregroundKind = null; // null | 'earcon' | 'legend' | 'event'
    let foregroundGeneration = 0;
    let foregroundEndTimer = null;

    // Backends are injected after construction (they need factories that
    // close over this authority); see wireBackends().
    let toneBackend = null;
    let continuousBackend = null;
    let spokenEventBackend = null;
    let legendBackend = null;

    function getSharedAudioContext() {
      if (!enabled) return null;
      if (sharedAudioContext) return sharedAudioContext;
      if (!audioContextCtor) return null;
      sharedAudioContext = audioContextCtor();
      return sharedAudioContext;
    }

    function getSharedSpeechSynthesis() {
      if (!enabled) return null;
      if (sharedSpeechSynthesis) return sharedSpeechSynthesis;
      if (!speechSynthesisCtor) return null;
      sharedSpeechSynthesis = speechSynthesisCtor();
      return sharedSpeechSynthesis;
    }

    function wireBackends(backends) {
      toneBackend = backends.toneBackend || null;
      continuousBackend = backends.continuousBackend || null;
      spokenEventBackend = backends.spokenEventBackend || null;
      legendBackend = backends.legendBackend || null;
    }

    function isContinuousAudible() {
      return enabled && !continuousUserPaused && !continuousLifecyclePaused && foregroundKind === null;
    }

    function clearForegroundTimer() {
      if (foregroundEndTimer !== null) { clearTimeoutFn(foregroundEndTimer); foregroundEndTimer = null; }
    }

    // Generation is the actual supersession token, not
    // `kind`. Two consecutive same-kind foreground items (e.g. two
    // model-event utterances back to back) must not let the first one's
    // stale onEnd end the SECOND one's foreground state -- `kind` alone
    // cannot distinguish that case, since it hasn't changed.
    function endForeground(generation) {
      if (generation !== undefined && generation !== foregroundGeneration) return; // superseded; ignore
      foregroundKind = null;
      clearForegroundTimer();
      if (isContinuousAudible()) continuousBackend?.resumeFromLastSample?.();
    }

    // Ducks continuous (if running), cancels whatever page-owned
    // foreground item was previously active (so a superseding item never
    // overlaps audibly with the one it replaces), and marks a new
    // foreground object as active with a fresh generation token. If
    // durationMs is finite, endForeground(generation) is scheduled
    // automatically as a fallback (used for earcons, and as a safety net
    // for a speech API that never reports true end); a caller that can
    // report genuine end (speech onend) instead calls
    // endForeground(generation) via the token closed over in the
    // returned value. Never a third source, and never two overlapping
    // page-owned utterances: starting a new foreground item always
    // supersedes, and audibly cancels, any previous one.
    function startForeground(kind, durationMs) {
      clearForegroundTimer();
      if (foregroundKind === 'legend') legendBackend?.skip?.();
      if (foregroundKind === 'event') spokenEventBackend?.cancelPending?.();
      if (continuousBackend) continuousBackend.silence();
      foregroundGeneration++;
      foregroundKind = kind;
      const generation = foregroundGeneration;
      if (Number.isFinite(durationMs)) {
        foregroundEndTimer = scheduleTimeout(() => endForeground(generation), durationMs);
      }
      return generation;
    }

    function playEarcon(qualifiedEvent) {
      if (!enabled) return false;
      const generation = startForeground('earcon', EARCON_ASSUMED_DURATION_MS);
      const played = toneBackend?.play?.(qualifiedEvent) || false;
      if (!played) endForeground(generation);
      return played;
    }

    // Shared by legend and spoken-event playback: both duck continuous
    // and both are cancelled outright if superseded before they end (see
    // startForeground). playFn receives an onEnd callback bound to THIS
    // call's generation token; a stale onEnd from a superseded call is a
    // no-op in endForeground's generation check even if the underlying
    // speech API still fires it after cancellation.
    function speakWithDucking(kind, playFn, fallbackDurationMs) {
      if (!enabled) return false;
      const generation = startForeground(kind, fallbackDurationMs);
      const played = playFn(() => endForeground(generation));
      if (!played) endForeground(generation);
      return played;
    }

    function speakLegend() {
      return speakWithDucking('legend', onEnd => legendBackend?.play?.(onEnd) || false, 12000);
    }

    function speakEvent(qualifiedEvent) {
      return speakWithDucking('event', onEnd => spokenEventBackend?.play?.(qualifiedEvent, onEnd) || false, 8000);
    }

    function setContinuousSample(sample) {
      if (!continuousBackend) return;
      if (isContinuousAudible()) continuousBackend.onSample(sample);
      else continuousBackend.rememberSample?.(sample);
    }

    function pauseContinuous() {
      continuousUserPaused = true;
      continuousBackend?.silence?.();
    }

    function resumeContinuous() {
      continuousUserPaused = false;
      if (isContinuousAudible()) continuousBackend?.resumeFromLastSample?.();
    }

    function pauseForLifecycle() {
      continuousLifecyclePaused = true;
      continuousBackend?.silence?.();
    }

    // Page-level lifecycle (hidden / pagehide / context loss): release the
    // audio device and stop queued speech. Simulation pause does NOT use this,
    // so user-action earcons keep working while the simulation is paused.
    function suspendForPage() {
      suspendPageAudio({ pauseForLifecycle, speechSynthesis: sharedSpeechSynthesis, audioContext: sharedAudioContext });
    }

    function resumeForPage() {
      resumePageAudio(sharedAudioContext);
    }

    function resumeForLifecycle() {
      continuousLifecyclePaused = false;
      if (isContinuousAudible()) continuousBackend?.resumeFromLastSample?.();
    }

    function isContinuousPaused() { return continuousUserPaused; }

    // Hard teardown of the continuous pair only -- used for follow
    // change, group-follow-without-eligible-body, scene/mode switch,
    // reset, and followed-intruder removal. Leaves the main enabled
    // state untouched; the stale sample is discarded rather than kept
    // for a later resume, since the body it described may no longer be
    // the one being followed.
    function stopContinuous() {
      continuousBackend?.silence?.();
      continuousBackend?.forgetSample?.();
    }

    // Synchronous, guaranteed. Nothing enabled afterward can produce
    // sound: every backend is disposed (closing its own dependence on
    // the shared context/synth and self-guarding any in-flight
    // callback), all speech is cancelled, the shared context is closed,
    // and enabled=false makes getSharedAudioContext()/getSharedSpeechSynthesis()
    // refuse to construct anything new even if a stray call reaches them.
    // Disable is idempotent and safe against unhandled promise
    // rejection. If disable() is called while already disabled (e.g. a
    // rapid double-click, or a second call from an unrelated teardown
    // path), this is a no-op rather than a second attempt to close an
    // already-closed context -- real AudioContext.close() rejects its
    // returned promise when called on a context that is already closed
    // or closing, and an unawaited, uncaught rejection there is exactly
    // the failure mode this guards against. Only the authority ever
    // calls close() on the shared context (backends' dispose() methods
    // do not -- see continuous_channel_backend.js/event_earcon_backend.js),
    // and this function calls it at most once per enable()/disable() cycle.
    function disable() {
      if (!enabled) return;
      foregroundKind = null;
      disposeAudioResources({ clearForegroundTimer, continuousBackend, toneBackend, spokenEventBackend, legendBackend, speechSynthesis: sharedSpeechSynthesis, audioContext: sharedAudioContext });
      sharedAudioContext = null;
      sharedSpeechSynthesis = null;
      enabled = false;
      continuousUserPaused = false;
      continuousLifecyclePaused = false;
    }

    // enable() itself does not start continuous sound -- that is a
    // separate opt-in (see sgra_sim.html's continuous-channels toggle),
    // matching the layered-consent pattern used throughout this package.
    function enable() {
      enabled = true;
    }

    function isEnabled() { return enabled; }

    function dispose() {
      disable();
    }

    return Object.freeze({
      wireBackends,
      enable, disable, dispose, isEnabled,
      getSharedAudioContext, getSharedSpeechSynthesis,
      playEarcon, speakLegend, speakEvent,
      setContinuousSample, pauseContinuous, resumeContinuous, pauseForLifecycle, resumeForLifecycle, suspendForPage, resumeForPage, isContinuousPaused, stopContinuous,
      isContinuousAudible
    });
  }

  SGRA.Sonification.AudioAuthority = Object.freeze({ createAudioAuthority });
})(typeof window !== 'undefined' ? window : globalThis);
