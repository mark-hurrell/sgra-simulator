// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachDiscSeamPasses(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  // SGRA-SPEC-001 B-2.1 / B-2.2.
  //
  // These are structural seams only. They exist so that the later static
  // accretion disc (Phase B) and the later spin/flow axes (Phase C) have a
  // declared, tested insertion point that does not require the pass order to
  // be renegotiated at that time.
  //
  // They are EMPTY in this packet. Each render() call issues zero canvas
  // commands and mutates no canvas state (no globalCompositeOperation, no
  // globalAlpha, no transform, no line dash). That property is asserted by
  // tests/render_pass_seams.test.mjs, and it is what makes the "empty seams
  // preserve the baseline draw stream" gate meaningful.
  //
  // Far/near is painter order, NOT a depth buffer. A future disc implementation
  // must split its own geometry per-fragment or per-element; it must not
  // classify a whole path or a whole trail into one seam using a single scalar
  // depth. See render_pass_order.js.

  function createEmptySeamPass(id) {
    let renderCount = 0;

    function render() {
      renderCount++;
      // Intentionally empty. Do not add content here without the Phase B / C
      // authority that owns disc and spin work.
    }

    function isEmpty() { return true; }
    function contentCount() { return 0; }
    function seamId() { return id; }
    function debugRenderCount() { return renderCount; }

    return Object.freeze({ render, isEmpty, contentCount, seamId, debugRenderCount });
  }

  function createDiscFarPass() { return createEmptySeamPass('discFar'); }
  function createDiscNearPass() { return createEmptySeamPass('discNear'); }
  function createFlowSpinAxesPass() { return createEmptySeamPass('flowSpinAxes'); }

  SGRA.Render.DiscSeamPasses = Object.freeze({
    createEmptySeamPass,
    createDiscFarPass,
    createDiscNearPass,
    createFlowSpinAxesPass
  });
})(typeof window !== 'undefined' ? window : globalThis);
