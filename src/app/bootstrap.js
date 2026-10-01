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
  SGRA.App = SGRA.App || {};

  // F-31: detectTier() is a hardware-capability heuristic (cores/RAM/mobile
  // UA sniffing). It has historically been used to auto-select a startup
  // value for simulationOptions' `tier`, but `tier` has exactly one meaning
  // in this codebase: the user-requested field-star/trail workload preset
  // that backs the "Star field density" selector (see TIER in
  // src/domain/constants.js and simulation_options.js's own
  // QUALITY-TIER RULING comment). There is no separate capability-ceiling
  // concept anywhere else that reads detectTier() or constrains `tier`
  // independently of it.
  //
  // Calling setTier(detectTier(...)) at startup therefore does not add a
  // performance ceiling on top of the user's choice -- it silently
  // overwrites the choice. The selects default to value="0" ("Off --
  // catalogue only") in markup; on capable desktop hardware detectTier()
  // returns 1 or 2, so heuristic field stars were being generated while the
  // control still read "Off — catalogue only" (F-31).
  //
  // Kept: detectTier() itself, exported below, in case a genuine
  // capability-ceiling feature (distinct state from the user's requested
  // density) is wanted post-V1 -- e.g. capping the *maximum* selectable
  // tier on weak hardware rather than choosing a tier for the user.
  // Removed: wiring it into simulationOptions.setTier at startup. For V1,
  // requestedTier stays at its declared default (0) unless the user (or an
  // applied scenario) changes it.
  function detectTier(nav) {
    const source = nav || global.navigator || {};
    const userAgent = typeof source.userAgent === 'string' ? source.userAgent : '';
    const mobile = /Mobi|Android|iPhone|iPad/i.test(userAgent);
    const cores = Number.isFinite(source.hardwareConcurrency) ? source.hardwareConcurrency : 2;
    const ram = Number.isFinite(source.deviceMemory) ? source.deviceMemory : 2;
    if (!mobile && cores >= 8 && ram >= 8) return 2;
    if (!mobile && cores >= 4) return 1;
    return 0;
  }


  SGRA.App.bootstrap = function bootstrap(options) {
    const opts = options || {};
    const canvas = document.getElementById(opts.canvasId);
    if (!canvas) {
      throw new Error(`SGRA.App.bootstrap: canvas "${opts.canvasId}" not found`);
    }

    const ctx = canvas.getContext('2d');
    const appContext = SGRA.App.createContext({ canvas, ctx });
    SGRA.App.context = appContext;

    if (typeof global.resize === 'function') global.resize();
    if (typeof global.init === 'function') global.init();
    if (typeof global.populateStarSel === 'function') global.populateStarSel();
    if (typeof global.requestAnimationFrame === 'function' && typeof global.resize === 'function') {
      global.requestAnimationFrame(() => global.requestAnimationFrame(() => global.resize()));
    }
    if (global.visualViewport && typeof global.visualViewport.addEventListener === 'function' && typeof global.resize === 'function') {
      global.visualViewport.addEventListener('resize', global.resize);
    }
    if (typeof global.toast === 'function') {
      global.toast('tap a star to follow · zoom in on Sgr A* to see regime zones');
    }

    return appContext;
  };

  SGRA.App.detectTier = detectTier;
})(window);
