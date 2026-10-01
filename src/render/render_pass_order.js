// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachRenderPassOrder(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  // SGRA-SPEC-001 B-2.1 — the single declared renderer pass order.
  //
  // This array is the authority. `scene_renderer.js` MUST walk it in index
  // order and MUST NOT contain an independently written sequence of calls.
  //
  // B-2.2 PROHIBITION — painter order is not a depth buffer.
  // `discFar` and `discNear` are painter-order seams only. Placing content in
  // `discFar` does not mean "behind" in any per-fragment sense; it means
  // "drawn earlier". No pass may assign one global scalar depth to a whole
  // path, trail or curve in order to choose between the two seams. Bodies are
  // depth-ordered individually (per body, per frame) and that remains the only
  // sanctioned depth ordering in the renderer.
  const PASS_ORDER = Object.freeze([
    'background',
    'blackHoleBackdrop',
    'discFar',
    'pathsAndTrails',
    'transients',
    'bodies',
    'discNear',
    'scientificAnnotations',
    'flowSpinAxes',
    'interactionOverlays'
  ]);

  // Seams that are declared but deliberately carry no content in this packet.
  // B-2 establishes the structure required by the later static accretion disc;
  // it does not implement disc content, spin or flow drag.
  const EMPTY_SEAMS = Object.freeze(['discFar', 'discNear', 'flowSpinAxes']);

  // Passes that `discNear` must never be allowed to paint over. Enforced by
  // ordering: every id here has a strictly greater index than `discNear`.
  const PROTECTED_AFTER_DISC_NEAR = Object.freeze([
    'scientificAnnotations',
    'flowSpinAxes',
    'interactionOverlays'
  ]);

  // The one pass permitted to draw R_s, ISCO, the capture radius and the PN
  // validity boundaries. See B-2.4 (D-2 correction).
  const SCIENTIFIC_ANNOTATION_OWNER = 'scientificAnnotations';

  function indexOfPass(id) {
    return PASS_ORDER.indexOf(id);
  }

  function isEmptySeam(id) {
    return EMPTY_SEAMS.indexOf(id) >= 0;
  }

  SGRA.Render.PassOrder = Object.freeze({
    PASS_ORDER,
    EMPTY_SEAMS,
    PROTECTED_AFTER_DISC_NEAR,
    SCIENTIFIC_ANNOTATION_OWNER,
    indexOfPass,
    isEmptySeam
  });
})(typeof window !== 'undefined' ? window : globalThis);
