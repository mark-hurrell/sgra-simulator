// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachTransientEffectsPass(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  function createTransientEffectsPass() {
    function render(frame) {
      const { ctx, bodies, effects } = frame;
      ctx.globalCompositeOperation = 'lighter';
      for (let k = effects.flashes.length - 1; k >= 0; k--) {
        const f = effects.flashes[k]; f.t += .03;
        if (f.t > 1 || !bodies.includes(f.b)) { effects.flashes.splice(k, 1); continue; }
        const s = frame.projectBody(f.b); if (!s) continue;
        const w = frame.relWeight(f.b);
        ctx.strokeStyle = frame.weightCol(w, .9 * (1 - f.t)); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s[0], s[1], 3 + f.t * 26, 0, 2 * Math.PI); ctx.stroke();
      }
      for (let k = effects.captures.length - 1; k >= 0; k--) {
        const f = effects.captures[k]; f.t += .018; if (f.t > 1) { effects.captures.splice(k, 1); continue; }
        if (!frame.blackHoleScreen) continue;
        const al = 1 - f.t;
        ctx.strokeStyle = `rgba(255,255,200,${.9 * al})`; ctx.lineWidth = 2 * (1 - f.t) + .5;
        ctx.beginPath(); ctx.arc(frame.blackHoleScreen[0], frame.blackHoleScreen[1], 8 + f.t * 80, 0, 2 * Math.PI); ctx.stroke();
        ctx.strokeStyle = `rgba(255,180,50,${.6 * al})`; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.arc(frame.blackHoleScreen[0], frame.blackHoleScreen[1], (8 + f.t * 80) * 1.5, 0, 2 * Math.PI); ctx.stroke();
      }
    }

    return Object.freeze({ render });
  }

  SGRA.Render.TransientEffectsPass = Object.freeze({ createTransientEffectsPass });
})(globalThis);
