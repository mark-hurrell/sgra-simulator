// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachRuntimeActionsController(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Controllers = SGRA.Controllers || {};

  function createRuntimeActions(deps) {
    function onCanvasKeydown(event) {
      if (event.target !== event.currentTarget) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      switch (event.key) {
        case 'ArrowLeft': event.preventDefault(); deps.rotateCamera(-24, 0); break;
        case 'ArrowRight': event.preventDefault(); deps.rotateCamera(24, 0); break;
        case 'ArrowUp': event.preventDefault(); deps.rotateCamera(0, -24); break;
        case 'ArrowDown': event.preventDefault(); deps.rotateCamera(0, 24); break;
        case '+': case '=': event.preventDefault(); deps.zoomCamera?.(1 / 1.1); break;
        case '-': event.preventDefault(); deps.zoomCamera?.(1.1); break;
        case ' ': event.preventDefault(); deps.triggerControl('bPlay'); break;
        case 'r': case 'R': event.preventDefault(); deps.triggerControl('bReset'); break;
        case 'h': case 'H': event.preventDefault(); deps.triggerControl('bHome'); break;
        case 'e': case 'E': event.preventDefault(); deps.triggerControl('bEarthView'); break;
        case 'o': case 'O': event.preventDefault(); deps.triggerControl('bPlane'); break;
        case 'f': case 'F': event.preventDefault(); deps.toggleFollow(); break;
        case 't': case 'T': event.preventDefault(); deps.triggerControl('bTrails'); break;
        case 'l': case 'L': event.preventDefault(); deps.triggerControl('bLabels'); break;
        case 'c': case 'C': event.preventDefault(); deps.triggerControl('bCusp'); break;
        case '[': deps.adjustSpeed(-0.2); break;
        case ']': deps.adjustSpeed(0.2); break;
        case '?': deps.showHelp(); break;
      }
    }
    function onGlobalKeydown(event) {
      switch (event.key) {
        case 'Escape':
          if (deps.isLaunchActive?.()) deps.cancelLaunch();
          deps.closeMobilePanel();
          break;
      }
    }
    return Object.freeze({ onCanvasKeydown, onGlobalKeydown, onKeydown: onCanvasKeydown });
  }

  SGRA.Controllers.RuntimeActions = Object.freeze({ createRuntimeActions });
})(typeof window !== 'undefined' ? window : globalThis);
