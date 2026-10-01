// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachSonificationSettings(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Sonification = SGRA.Sonification || {};

  // Persisted user
  // preferences only. Continuous-sound pause state is deliberately NOT
  // persisted here -- it lives on sonification_audio_authority.js as
  // session-only state, since a page reload already requires a fresh
  // user gesture before any audio can play again (autoplay policy), so
  // there is nothing meaningful to resume across reloads.
  //
  // Does NOT register with SGRA.State.StateDescriptors: that contract's
  // OWNERS list is closed and maintained by the stabilisation work;
  // extending it is out of scope for an additive, isolated layer.

  const STORAGE_KEY = 'SGRA.Sonification.Settings.v2'; // v2: adds
  // pitchRangeKey and changes PULSE semantics (see mapping_contracts.js
  // CONTRACT_VERSION) -- a fresh key so a v1 stored value (from before
  // this correction) is never silently reinterpreted under new meaning.

  const DEFAULTS = Object.freeze({
    enabled: false,
    masterGain: 0.6,
    speakModelEvents: false,
    continuousChannelsEnabled: false,
    pitchRangeKey: 'standard', // 'low' | 'standard' | 'high'
    speechRate: 1
  });

  const VALID_PITCH_RANGE_KEYS = ['low', 'standard', 'high'];
  const VALID_SPEECH_RATES = [0.75, 1, 1.5, 2, 2.5, 3];

  const Settings = Object.assign({}, DEFAULTS);
  let hadPersistedPreferences = false;

  function clampGain(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULTS.masterGain;
    return Math.min(1, Math.max(0, n));
  }

  function sonificationSettingsGet() {
    return Object.assign({}, Settings);
  }

  function sonificationSettingsSetEnabled(value) {
    Settings.enabled = value === true;
    sonificationSettingsSaveToLocalStorage();
    return Settings.enabled;
  }

  function sonificationSettingsSetMasterGain(value) {
    Settings.masterGain = clampGain(value);
    sonificationSettingsSaveToLocalStorage();
    return Settings.masterGain;
  }

  function sonificationSettingsSetSpeakModelEvents(value) {
    Settings.speakModelEvents = value === true;
    sonificationSettingsSaveToLocalStorage();
    return Settings.speakModelEvents;
  }

  function sonificationSettingsSetContinuousChannelsEnabled(value) {
    Settings.continuousChannelsEnabled = value === true;
    sonificationSettingsSaveToLocalStorage();
    return Settings.continuousChannelsEnabled;
  }

  // The pitch-range CHOICE changes only pitch bounds -- it never touches
  // mapping meaning, gain, stereo, or event semantics (enforced by
  // continuous_channel_mapping.js taking the key purely as a lookup into
  // calibration.PITCH_RANGES).
  function sonificationSettingsSetPitchRangeKey(key) {
    Settings.pitchRangeKey = VALID_PITCH_RANGE_KEYS.includes(key) ? key : DEFAULTS.pitchRangeKey;
    sonificationSettingsSaveToLocalStorage();
    return Settings.pitchRangeKey;
  }

  function sonificationSettingsSetSpeechRate(value) {
    const n = Number(value);
    Settings.speechRate = VALID_SPEECH_RATES.includes(n) ? n : DEFAULTS.speechRate;
    sonificationSettingsSaveToLocalStorage();
    return Settings.speechRate;
  }

  function sonificationSettingsReadLocalStorageObject() {
    try {
      if (!global.localStorage) return null;
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function sonificationSettingsLoadFromLocalStorage() {
    const stored = sonificationSettingsReadLocalStorageObject();
    if (stored) {
      // `enabled` is deliberately never restored from
      // storage. Browser autoplay policy means audio cannot legitimately
      // be active on a fresh page load without a new user gesture, so a
      // persisted `enabled: true` would be a lie the moment the page
      // loads -- the button would say "on" while nothing is playing and
      // nothing CAN play until the user acts again. Every other
      // preference below is safe to restore because none of them, alone,
      // produces sound.
      if (typeof stored.speakModelEvents === 'boolean') Settings.speakModelEvents = stored.speakModelEvents;
      if (typeof stored.continuousChannelsEnabled === 'boolean') Settings.continuousChannelsEnabled = stored.continuousChannelsEnabled;
      if (stored.masterGain !== undefined) Settings.masterGain = clampGain(stored.masterGain);
      if (VALID_PITCH_RANGE_KEYS.includes(stored.pitchRangeKey)) Settings.pitchRangeKey = stored.pitchRangeKey;
      if (VALID_SPEECH_RATES.includes(Number(stored.speechRate))) Settings.speechRate = Number(stored.speechRate);
      Settings.enabled = DEFAULTS.enabled; // always false, regardless of what was ever stored
      hadPersistedPreferences = Boolean(
        stored.speakModelEvents || stored.continuousChannelsEnabled
        || stored.masterGain !== undefined || stored.pitchRangeKey !== undefined
        || stored.speechRate !== undefined
      );
    }
    return sonificationSettingsGet();
  }

  // Let the UI truthfully distinguish "nothing has ever
  // been set" from "preferences exist from a previous session, but
  // sonification is not currently active" -- the caller is responsible
  // for wording this honestly (e.g. "previous audio preferences
  // restored; activate sonification to start sound"), never implying
  // sound is already playing.
  function sonificationSettingsHadPersistedPreferences() {
    return hadPersistedPreferences;
  }

  function sonificationSettingsSaveToLocalStorage() {
    try {
      if (!global.localStorage) return false;
      // `enabled` is never written to storage at all --
      // not just ignored on read. There is nothing for a session's
      // active/inactive state to mean across a page load; only the
      // preferences below are meaningful to persist.
      const { enabled: _sessionOnlyEnabled, ...persisted } = Settings; // enabled is session-only; never persisted
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      return true;
    } catch (_) {
      return false;
    }
  }

  function sonificationSettingsResetToDefaults() {
    Settings.enabled = DEFAULTS.enabled;
    Settings.masterGain = DEFAULTS.masterGain;
    Settings.speakModelEvents = DEFAULTS.speakModelEvents;
    Settings.continuousChannelsEnabled = DEFAULTS.continuousChannelsEnabled;
    Settings.pitchRangeKey = DEFAULTS.pitchRangeKey;
    Settings.speechRate = DEFAULTS.speechRate;
    sonificationSettingsSaveToLocalStorage();
    return sonificationSettingsGet();
  }

  SGRA.Sonification.Settings = Object.freeze({
    get: sonificationSettingsGet,
    setEnabled: sonificationSettingsSetEnabled,
    setMasterGain: sonificationSettingsSetMasterGain,
    setSpeakModelEvents: sonificationSettingsSetSpeakModelEvents,
    setContinuousChannelsEnabled: sonificationSettingsSetContinuousChannelsEnabled,
    setPitchRangeKey: sonificationSettingsSetPitchRangeKey,
    setSpeechRate: sonificationSettingsSetSpeechRate,
    loadFromLocalStorage: sonificationSettingsLoadFromLocalStorage,
    saveToLocalStorage: sonificationSettingsSaveToLocalStorage,
    resetToDefaults: sonificationSettingsResetToDefaults,
    hadPersistedPreferences: sonificationSettingsHadPersistedPreferences,
    DEFAULTS,
    VALID_PITCH_RANGE_KEYS,
    VALID_SPEECH_RATES
  });
})(typeof window !== 'undefined' ? window : globalThis);
