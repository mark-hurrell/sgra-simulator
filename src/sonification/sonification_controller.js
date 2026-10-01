// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).

(function attachSonificationController(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  /* eslint-disable max-lines-per-function -- orchestration state and methods stay in one controller closure */
  function createSonificationController(options = {}) {
    const $ = typeof options.$ === 'function' ? options.$ : () => null;
    const settings = options.settings || null;
    const getAudioAuthority = typeof options.getAudioAuthority === 'function'
      ? options.getAudioAuthority : () => null;
    const getContinuousObserver = typeof options.getContinuousObserver === 'function'
      ? options.getContinuousObserver : () => null;
    const getContinuousEligible = typeof options.getContinuousEligible === 'function'
      ? options.getContinuousEligible : () => false;
    const getBackendsWired = typeof options.getBackendsWired === 'function'
      ? options.getBackendsWired : () => false;
    const setBackendsWired = typeof options.setBackendsWired === 'function'
      ? options.setBackendsWired : () => {};
    const wireBackends = typeof options.wireBackends === 'function' ? options.wireBackends : () => {};
    const announceStatus = typeof options.announceStatus === 'function' ? options.announceStatus : () => {};
    const statusPriority = options.statusPriority || { USER: 3, VALIDATION: 2 };
    const statusCategory = options.statusCategory || { VALIDATION: 'Form result' };
    let activationGeneration = 0;
    let simulationPaused = false;

    /* eslint-disable complexity -- preserves the existing UI synchronization branches */
    function syncSonificationUi() {
      const snapshot = settings?.get?.() || settings?.DEFAULTS || {
        enabled: false, masterGain: 0.6, speakModelEvents: false,
        continuousChannelsEnabled: false, pitchRangeKey: 'standard', speechRate: 1
      };
      for (const id of ['bSonification', 'bSonificationM']) {
        const button = $(id);
        if (!button) continue;
        button.textContent = `sonification: ${snapshot.enabled ? 'on' : 'off'}`;
        button.setAttribute('aria-pressed', String(snapshot.enabled));
        button.title = snapshot.enabled
          ? 'Optional audio accompaniment to on-screen and status events; off turns it back off'
          : 'Optional audio accompaniment to on-screen and status events; supplementary, not required to use SGRA';
      }
      for (const id of ['bContinuousChannels', 'bContinuousChannelsM']) {
        const button = $(id);
        if (!button) continue;
        button.textContent = `continuous sound: ${snapshot.continuousChannelsEnabled ? 'on' : 'off'}`;
        button.setAttribute('aria-pressed', String(snapshot.continuousChannelsEnabled));
        button.disabled = !snapshot.enabled;
      }
      const audioAuthority = getAudioAuthority();
      const continuousPaused = audioAuthority?.isContinuousPaused?.() === true;
      for (const id of ['bContinuousPauseResume', 'bContinuousPauseResumeM']) {
        const button = $(id);
        if (!button) continue;
        button.disabled = !snapshot.enabled || !snapshot.continuousChannelsEnabled;
        button.textContent = continuousPaused ? 'resume continuous sound' : 'pause continuous sound';
        button.setAttribute('aria-pressed', String(continuousPaused));
      }
      for (const id of ['bSonificationSpeakEvents', 'bSonificationSpeakEventsM']) {
        const button = $(id);
        if (!button) continue;
        button.setAttribute('aria-pressed', String(snapshot.speakModelEvents));
        button.disabled = !snapshot.enabled;
      }
      for (const id of ['bSonificationLegend', 'bSonificationLegendM']) {
        const button = $(id);
        if (!button) continue;
        button.disabled = !snapshot.enabled;
      }
      for (const id of ['sPitchRange', 'sPitchRangeM']) {
        const select = $(id);
        if (!select) continue;
        select.value = snapshot.pitchRangeKey;
      }
      for (const id of ['sSpeechRate', 'sSpeechRateM']) {
        const select = $(id);
        if (select) select.value = String(snapshot.speechRate ?? 1);
      }
      for (const [inputId, outputId] of [['sSonificationGain', 'oSonificationGain'], ['sSonificationGainM', 'oSonificationGainM']]) {
        const gainInput = $(inputId);
        const gainOutput = $(outputId);
        if (gainInput) gainInput.value = String(snapshot.masterGain);
        if (gainOutput) gainOutput.textContent = `${Math.round(snapshot.masterGain * 100)}%`;
      }
    }

    function syncContinuousEligibility() {
      const observer = getContinuousObserver();
      const audioAuthority = getAudioAuthority();
      if (!observer || !audioAuthority) return;
      const snapshot = settings?.get?.();
      if (!snapshot?.enabled || !snapshot?.continuousChannelsEnabled || simulationPaused) {
        observer.stop();
        audioAuthority.stopContinuous();
        return;
      }
      if (getContinuousEligible()) {
        if (!observer.isRunning()) observer.start();
      } else {
        observer.stop();
        audioAuthority.stopContinuous();
      }
    }

    function isCurrentSonificationActivation(generation) {
      return generation === activationGeneration
        && settings?.get?.().enabled === true
        && getAudioAuthority()?.isEnabled?.() === true;
    }

    function toggleSonification() {
      const activation = ++activationGeneration;
      const wasEnabled = settings?.get?.().enabled === true;
      settings?.setEnabled?.(!wasEnabled);
      syncSonificationUi();
      const audioAuthority = getAudioAuthority();
      const observer = getContinuousObserver();
      if (wasEnabled) {
        observer?.stop?.();
        audioAuthority?.disable?.();
        setBackendsWired(false);
        syncSonificationUi();
        announceStatus('Sonification off.');
        return;
      }
      if (!getBackendsWired()) wireBackends?.();
      audioAuthority?.enable?.();
      const ctx = audioAuthority?.getSharedAudioContext?.();
      const resumeResult = ctx && typeof ctx.resume === 'function' ? ctx.resume() : undefined;
      Promise.resolve(resumeResult).then(() => {
        if (!isCurrentSonificationActivation(activation)) return;
        const state = ctx?.state || 'not-constructed';
        if (state === 'running') {
          audioAuthority?.playEarcon?.({ kind: 'user-action', priority: statusPriority.USER, text: 'Sonification enabled', at: 0 });
          announceStatus('Sonification on: audio accompaniment supplements, and never replaces, on-screen and status information.');
          if (settings?.get?.().continuousChannelsEnabled === true) syncContinuousEligibility();
        } else {
          announceStatus(`Sonification on, but audio did not start (state: ${state}). Check that your device is not silenced or muted -- some platforms silence web audio without any visible indication.`, statusPriority.VALIDATION, statusCategory.VALIDATION);
        }
      }, () => {
        if (!isCurrentSonificationActivation(activation)) return;
        announceStatus('Sonification on, but audio did not start because the audio context could not resume.', statusPriority.VALIDATION, statusCategory.VALIDATION);
      });
    }

    function toggleContinuousChannels() {
      if (settings?.get?.().enabled !== true) return;
      const current = settings?.get?.().continuousChannelsEnabled === true;
      settings?.setContinuousChannelsEnabled?.(!current);
      syncSonificationUi();
      const observer = getContinuousObserver();
      const audioAuthority = getAudioAuthority();
      if (current) {
        observer?.stop?.();
        audioAuthority?.stopContinuous?.();
        announceStatus('Continuous sound off.');
        return;
      }
      if (!getContinuousEligible?.()) {
        announceStatus('Continuous sound needs one explicitly followed body; it is unavailable during group follow.', statusPriority.VALIDATION, statusCategory.VALIDATION);
        return;
      }
      observer?.start?.();
      announceStatus('Continuous sound on: a proximity tone and, only while currently getting closer, a pulse. These are initial usability values, not validated calibration.', statusPriority.VALIDATION, statusCategory.VALIDATION);
    }

    function toggleContinuousPauseResume() {
      const audioAuthority = getAudioAuthority();
      if (!audioAuthority) return;
      if (audioAuthority.isContinuousPaused()) {
        audioAuthority.resumeContinuous();
        announceStatus('Continuous sound resumed.');
      } else {
        audioAuthority.pauseContinuous();
        announceStatus('Continuous sound paused.');
      }
      syncSonificationUi();
    }

    function syncSimulationPlayback(playing) {
      simulationPaused = !playing;
      const observer = getContinuousObserver();
      const audioAuthority = getAudioAuthority();
      if (simulationPaused) {
        observer?.stop?.();
        audioAuthority?.pauseForLifecycle?.();
      } else {
        audioAuthority?.resumeForLifecycle?.();
        syncContinuousEligibility();
      }
    }

    function suspendForLifecycle() {
      getContinuousObserver()?.stop?.();
      const authority = getAudioAuthority();
      if (typeof authority?.suspendForPage === 'function') authority.suspendForPage();
      else authority?.pauseForLifecycle?.();
    }

    function resumeFromLifecycle() {
      getAudioAuthority()?.resumeForPage?.();
      if (!simulationPaused) {
        getAudioAuthority()?.resumeForLifecycle?.();
        syncContinuousEligibility();
      }
    }

    function teardownForLifecycle() {
      getContinuousObserver()?.stop?.();
      getAudioAuthority()?.disable?.();
      settings?.setEnabled?.(false);
      syncSonificationUi();
    }

    function toggleSonificationSpeakEvents() {
      const current = settings?.get?.().speakModelEvents === true;
      settings?.setSpeakModelEvents?.(!current);
      syncSonificationUi();
      announceStatus(`Speak page event messages: ${!current ? 'on' : 'off'}.`);
    }

    function playSonificationLegend() {
      if (settings?.get?.().enabled !== true) return;
      const played = getAudioAuthority()?.speakLegend?.();
      if (!played) announceStatus('Sound legend unavailable right now.', statusPriority.VALIDATION, statusCategory.VALIDATION);
    }

    function setSonificationPitchRange(key) {
      settings?.setPitchRangeKey?.(key);
      syncSonificationUi();
    }

    function setSonificationSpeechRate(rate) {
      settings?.setSpeechRate?.(rate);
      syncSonificationUi();
    }

    return Object.freeze({
      syncSonificationUi,
      syncContinuousEligibility,
      isCurrentSonificationActivation,
      toggleSonification,
      toggleContinuousChannels,
      toggleContinuousPauseResume,
      syncSimulationPlayback, suspendForLifecycle, resumeFromLifecycle, teardownForLifecycle,
      toggleSonificationSpeakEvents,
      playSonificationLegend,
      setSonificationPitchRange,
      setSonificationSpeechRate
    });
  }

  SGRA.Sonification.SonificationController = Object.freeze({ create: createSonificationController });
})(typeof window !== 'undefined' ? window : globalThis);
