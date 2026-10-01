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

  SGRA.App.createContext = function createContext(options) {
    const opts = options || {};
    return {
      canvas: opts.canvas || null,
      ctx: opts.ctx || null,
      dom: {},
      state: null,
      config: null,
      services: {},
      renderers: {},
      diagnostics: {}
    };
  };
})(window);
