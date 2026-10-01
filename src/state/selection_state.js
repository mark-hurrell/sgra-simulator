// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachSelectionState(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  function createSelectionState() {
    let followIndex = -1;

    function getFollowIndex() { return followIndex; }
    function setFollowIndex(index) {
      followIndex = Number.isFinite(index) ? index : -1;
      return followIndex;
    }
    function clear() { followIndex = -1; return followIndex; }
    function normalise(bodyCount) {
      if (followIndex < 0 || followIndex >= bodyCount) followIndex = -1;
      return followIndex;
    }

    return Object.freeze({ getFollowIndex, setFollowIndex, clear, normalise });
  }

  SGRA.State.SelectionState = Object.freeze({ createSelectionState });
})(globalThis);
