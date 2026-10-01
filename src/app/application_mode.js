// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachApplicationMode(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.App = SGRA.App || {};
  const MODES = Object.freeze({ EXPLORE: 'explore', SANDBOX: 'sandbox' });

  function createApplicationMode(options = {}) {
    let current = MODES.EXPLORE;
    const getDirty = typeof options.isSandboxDirty === 'function' ? options.isSandboxDirty : () => false;
    const confirmDiscard = typeof options.confirmDiscard === 'function'
      ? options.confirmDiscard
      : () => global.confirm('Discard Sandbox experiment and return to Explore');
    const resetForMode = options.resetForMode;
    if (typeof resetForMode !== 'function') throw new TypeError('application mode requires resetForMode()');

    function getMode() { return current; }
    function setMode(mode) {
      if (mode !== MODES.EXPLORE && mode !== MODES.SANDBOX) throw new TypeError(`unsupported application mode: ${mode}`);
      current = mode;
      return current;
    }
    function enterSandbox() {
      if (current === MODES.SANDBOX) return { ok: true, changed: false, mode: current };
      setMode(MODES.SANDBOX);
      resetForMode(current);
      options.onChanged?.(current);
      return { ok: true, changed: true, mode: current };
    }
    function returnToExplore() {
      if (current === MODES.EXPLORE) return { ok: true, changed: false, mode: current };
      if (getDirty() && !confirmDiscard()) return { ok: false, code: 'SANDBOX_DISCARD_CANCELLED', mode: current };
      setMode(MODES.EXPLORE);
      resetForMode(current);
      options.onChanged?.(current);
      return { ok: true, changed: true, mode: current };
    }
    return Object.freeze({ MODES, getMode, setMode, enterSandbox, returnToExplore });
  }

  SGRA.App.ApplicationMode = Object.freeze({ MODES, createApplicationMode });
  if (typeof module !== 'undefined' && module.exports) module.exports = SGRA.App.ApplicationMode;
})(typeof window !== 'undefined' ? window : globalThis);
