// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function (global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Config = SGRA.Config || {};

  const STORAGE_KEY = 'SGRA.RuntimeConfig.v1';
  const DEFAULTS = {
    requestedTrailRenderer: 'auto'
  };

  const RuntimeConfig = Object.assign({}, DEFAULTS);

  // Records the raw trail-renderer request and, if it had to be rejected
  // (e.g. 'segment' or 'webgl' requested but not implemented yet), why.
  const TrailRendererRequestInfo = {
    raw: null,
    rejected: false,
    reason: ''
  };

  function runtimeConfigNormalizeTrailRenderer(value, fallback) {
    const allowed = ['auto', 'legacy'];
    if (value === undefined || value === null || value === '') return fallback;
    const text = String(value).trim().toLowerCase();
    TrailRendererRequestInfo.raw = text;
    if (allowed.includes(text)) {
      TrailRendererRequestInfo.rejected = false;
      TrailRendererRequestInfo.reason = '';
      return text;
    }
    TrailRendererRequestInfo.rejected = true;
    TrailRendererRequestInfo.reason = `requested trail renderer '${text}' is not implemented (only 'auto'/'legacy' exist); using '${fallback}'`;
    return fallback;
  }

  function runtimeConfigGetTrailRendererRequestInfo() {
    return Object.assign({}, TrailRendererRequestInfo);
  }

  function runtimeConfigApplyPatch(patch) {
    if (!patch || typeof patch !== 'object') return RuntimeConfig;
    if (Object.prototype.hasOwnProperty.call(patch, 'requestedTrailRenderer')) {
      RuntimeConfig.requestedTrailRenderer = runtimeConfigNormalizeTrailRenderer(
        patch.requestedTrailRenderer,
        RuntimeConfig.requestedTrailRenderer
      );
    }
    return RuntimeConfig;
  }

  function runtimeConfigResetRuntimeConfig() {
    Object.assign(RuntimeConfig, DEFAULTS);
    return RuntimeConfig;
  }

  function runtimeConfigGetRuntimeConfig() {
    return RuntimeConfig;
  }

  function runtimeConfigReadLocalStorageObject() {
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

  function runtimeConfigLoadFromLocalStorage() {
    const stored = runtimeConfigReadLocalStorageObject();
    if (stored) runtimeConfigApplyPatch(stored);
    return RuntimeConfig;
  }

  function runtimeConfigLoadFromQuery() {
    try {
      const params = new URLSearchParams((global.location && global.location.search) || '');
      if (params.has('sgraTrailRenderer')) {
        runtimeConfigApplyPatch({ requestedTrailRenderer: params.get('sgraTrailRenderer') });
      }
    } catch (_) {
      // Ignore malformed URLs or unavailable query APIs.
    }
    return RuntimeConfig;
  }

  function runtimeConfigSaveToLocalStorage() {
    try {
      if (!global.localStorage) return false;
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(RuntimeConfig));
      return true;
    } catch (_) {
      return false;
    }
  }

  function runtimeConfigClearLocalStorage() {
    try {
      if (!global.localStorage) return false;
      global.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  runtimeConfigResetRuntimeConfig();
  runtimeConfigLoadFromLocalStorage();
  runtimeConfigLoadFromQuery();

  SGRA.Config.RuntimeConfig = RuntimeConfig;
  SGRA.Config.getRuntimeConfig = runtimeConfigGetRuntimeConfig;
  SGRA.Config.setRuntimeConfigPatch = runtimeConfigApplyPatch;
  SGRA.Config.resetRuntimeConfig = runtimeConfigResetRuntimeConfig;
  SGRA.Config.loadFromQuery = runtimeConfigLoadFromQuery;
  SGRA.Config.loadFromLocalStorage = runtimeConfigLoadFromLocalStorage;
  SGRA.Config.saveToLocalStorage = runtimeConfigSaveToLocalStorage;
  SGRA.Config.clearLocalStorage = runtimeConfigClearLocalStorage;
  SGRA.Config.getTrailRendererRequestInfo = runtimeConfigGetTrailRendererRequestInfo;
})(window);
