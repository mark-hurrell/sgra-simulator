// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachContinuousChannelBackend(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // SON-1. Renders continuous_channel_observer.js's samples as sound:
  // CARRIER (continuous tone, pitch tracks proximity) and PULSE (short
  // clicks, inward-only, per continuous_channel_mapping.js's corrected
  // radial-rate mapping -- sample.pulseIntervalMs is null/undefined
  // whenever the body is not currently closing in, and this backend
  // schedules no tick at all in that case, rather than a slow one).
  //
  // silence() vs dispose(): silence() stops the carrier oscillator and
  // clears the pulse timer but keeps the AudioContext alive, for cheap
  // pause/duck/resume cycles driven by sonification_audio_authority.js.
  // dispose() additionally closes the context permanently. Neither
  // leaves a scheduled callback able to produce sound afterward -- every
  // pulse tick checks a live "silenced" flag before playing anything,
  // not just before scheduling the next one, so a callback already
  // in flight when silence()/dispose() runs still self-guards.
  //
  // Mono-safe (no panner node), loudness never data-driven (only the
  // user's single masterGain, applied uniformly -- SON-04's looming-bias
  // caution: proximity is carried by pitch and timing only, never
  // amplitude).

  const CARRIER_BASE_GAIN = 0.12;
  const PULSE_PEAK_GAIN = 0.4;
  const PULSE_DURATION_MS = 40;
  const PULSE_WAVEFORM = 'sine';
  const PULSE_FREQUENCY_HZ = 900;
  const PITCH_UPDATE_RAMP_S = 0.03;
  const CARRIER_FADE_S = 0.015;

  function clamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  function createContinuousChannelBackend(options = {}) {
    const audioContextFactory = typeof options.audioContextFactory === 'function' ? options.audioContextFactory : null;
    const settings = options.settings || null;
    const scheduleTimeout = typeof options.scheduleTimeout === 'function' ? options.scheduleTimeout : (fn, ms) => setTimeout(fn, ms);
    const clearTimeoutFn = typeof options.clearTimeoutFn === 'function' ? options.clearTimeoutFn : handle => clearTimeout(handle);
    const now = typeof options.now === 'function' ? options.now : () => Date.now();

    let ctx = null;
    let disposed = false;
    let silenced = true; // starts silenced; onSample() lifts this
    let carrierOscillator = null;
    let carrierGainNode = null;
    let pulseTimer = null;
    let pulseGeneration = 0;
    let latestSample = null;

    function masterGain() {
      if (!settings || typeof settings.get !== 'function') return 0.6;
      return clamp01(settings.get()?.masterGain);
    }

    function ensureContext() {
      if (disposed) return null;
      if (ctx) return ctx;
      if (!audioContextFactory) return null;
      ctx = audioContextFactory();
      return ctx;
    }

    function ensureContextAndResume() {
      const audioCtx = ensureContext();
      if (!audioCtx) return { state: 'not-constructed' };
      const resumeResult = typeof audioCtx.resume === 'function' ? audioCtx.resume() : undefined;
      return { state: audioCtx.state || 'unknown', resumeResult };
    }

    function getState() {
      return ctx ? (ctx.state || 'unknown') : 'not-constructed';
    }

    function stopCarrierOscillator() {
      const oscillator = carrierOscillator;
      const gainNode = carrierGainNode;
      carrierOscillator = null;
      carrierGainNode = null;
      if (oscillator) {
        const audioCtx = ctx;
        const at = audioCtx?.currentTime || 0;
        try {
          if (gainNode?.gain) {
            gainNode.gain.cancelScheduledValues?.(at);
            gainNode.gain.setTargetAtTime?.(0, at, CARRIER_FADE_S);
          }
          oscillator.stop(at + CARRIER_FADE_S * 4);
        } catch (_) {
          try { oscillator.stop(); } catch (_) { /* already stopped */ }
        }
      }
    }

    function clearPulseTimer() {
      if (pulseTimer !== null) { clearTimeoutFn(pulseTimer); pulseTimer = null; }
      pulseGeneration++;
    }

    // Full audible teardown that keeps the context alive for a fast
    // resume. Safe to call repeatedly; safe to call when nothing is
    // running.
    function silence() {
      silenced = true;
      stopCarrierOscillator();
      clearPulseTimer();
    }

    function ensureCarrierStarted() {
      if (carrierOscillator || disposed || silenced) return;
      const audioCtx = ensureContext();
      if (!audioCtx) return;
      carrierOscillator = audioCtx.createOscillator();
      carrierOscillator.type = 'sine';
      carrierGainNode = audioCtx.createGain();
      const at = audioCtx.currentTime;
      carrierGainNode.gain.setValueAtTime(0, at);
      carrierGainNode.gain.linearRampToValueAtTime(CARRIER_BASE_GAIN * masterGain(), at + CARRIER_FADE_S);
      carrierOscillator.connect(carrierGainNode);
      carrierGainNode.connect(audioCtx.destination); // mono-safe: no panner
      carrierOscillator.start(audioCtx.currentTime);
    }

    function playPulseTick() {
      if (disposed || silenced) return; // self-guard: a stray callback that
      // fires after silence()/dispose() produces nothing, even if the
      // timer that scheduled it wasn't successfully cleared in time.
      const audioCtx = ensureContext();
      if (!audioCtx) return;
      const peak = PULSE_PEAK_GAIN * masterGain();
      if (peak <= 0) return;
      const now = audioCtx.currentTime;
      const durationS = PULSE_DURATION_MS / 1000;
      const osc = audioCtx.createOscillator();
      osc.type = PULSE_WAVEFORM;
      osc.frequency.value = PULSE_FREQUENCY_HZ;
      const gainNode = audioCtx.createGain();
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(peak, now + Math.min(0.01, durationS / 4));
      gainNode.gain.linearRampToValueAtTime(0, now + durationS);
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination); // mono-safe
      osc.start(now);
      osc.stop(now + durationS + 0.01);
    }

    function scheduleNextPulse(resetDeadline = false) {
      if (disposed || silenced || !latestSample || !audioContextFactory) return;
      const intervalMs = latestSample.pulseIntervalMs;
      // null/undefined means "not currently closing in" -- no pulse at
      // all, not a slow one. Nothing to schedule.
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) { clearPulseTimer(); return; }
      // Samples update parameters; they do not reset a live physical-pulse
      // deadline. This makes pulse cadence independent of observer cadence.
      if (pulseTimer !== null && !resetDeadline) return;
      if (pulseTimer !== null) clearPulseTimer();
      const generation = ++pulseGeneration;
      pulseTimer = scheduleTimeout(() => {
        if (generation !== pulseGeneration || disposed || silenced || !latestSample) return;
        pulseTimer = null;
        playPulseTick();
        scheduleNextPulse();
      }, intervalMs);
    }

    // The entry point continuous_channel_observer.js's onSample callback
    // is wired to, via the audio authority. Lifts `silenced` so audio can
    // start/continue; the authority is responsible for calling silence()
    // when ducking, pausing, or stopping instead of simply not calling
    // this.
    function rememberSample(sample) {
      if (sample) latestSample = sample;
    }

    function forgetSample() {
      latestSample = null;
    }

    function onSample(sample) {
      if (disposed || !sample) return;
      const intervalChanged = latestSample?.pulseIntervalMs !== sample.pulseIntervalMs;
      rememberSample(sample);
      silenced = false;
      ensureCarrierStarted();
      if (carrierOscillator) {
        const audioCtx = ensureContext();
        const at = audioCtx.currentTime;
        if (typeof carrierOscillator.frequency.setTargetAtTime === 'function') carrierOscillator.frequency.setTargetAtTime(sample.carrierHz, at, PITCH_UPDATE_RAMP_S);
        else {
          carrierOscillator.frequency.setValueAtTime(sample.carrierHz, at);
          carrierOscillator.frequency.linearRampToValueAtTime(sample.carrierHz, at + PITCH_UPDATE_RAMP_S);
        }
      }
      if (carrierGainNode) {
        carrierGainNode.gain.setValueAtTime(CARRIER_BASE_GAIN * masterGain(), ensureContext().currentTime);
      }
      scheduleNextPulse(intervalChanged);
    }

    // Re-applies the last known sample's sound without waiting for a new
    // observer tick -- used by the audio authority on resume-from-pause
    // so the listener doesn't have to wait up to one sampling interval
    // to hear anything again.
    function resumeFromLastSample() {
      if (latestSample) onSample(latestSample);
    }

    // This backend never closes the shared
    // AudioContext. The context it holds came from
    // sonification_audio_authority.js's shared factory; only the
    // authority may call close() on it. Disposing here means: stop every
    // oscillator, clear every timer, drop this backend's own reference --
    // and nothing more.
    function dispose() {
      disposed = true;
      silence();
      ctx = null;
      latestSample = null;
    }

    return Object.freeze({
      onSample, rememberSample, forgetSample, silence, resumeFromLastSample,
      ensureContextAndResume, getState, dispose
    });
  }

  SGRA.Sonification.ContinuousChannelBackend = Object.freeze({ createContinuousChannelBackend });
})(typeof window !== 'undefined' ? window : globalThis);
