// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachBlackHoleEnvironmentPass(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  function glowRadiusForPhysicalScale(physicalPx) {
    return Math.min(260, Math.max(36, Number.isFinite(physicalPx) ? physicalPx : 36));
  }

  function createBlackHoleEnvironmentPass() {
    let glowCache = null, glowMode = '', glowR = 0, glowX = 0, glowY = 0;

    function render(frame) {
      const { ctx, blackHoleScreen: bhS, physics } = frame;
      const showLegacyGlow = frame.display.showGlow;
      const showCuspGlow = frame.display.isCuspEnabled && !showLegacyGlow;
      if ((!showLegacyGlow && !showCuspGlow) || !bhS) return;

      const phyR = frame.auToPx(500 * physics.RS());
      const currentGlowR = glowRadiusForPhysicalScale(phyR);
      ctx.globalCompositeOperation = 'lighter';
      const mode = showCuspGlow ? 'cusp' : 'legacy';
      if (!glowCache || glowMode !== mode || Math.abs(currentGlowR - glowR) > 1 || Math.abs(bhS[0] - glowX) > 1 || Math.abs(bhS[1] - glowY) > 1) {
        glowMode = mode; glowR = currentGlowR; glowX = bhS[0]; glowY = bhS[1];
        const g = ctx.createRadialGradient(bhS[0], bhS[1], 0, bhS[0], bhS[1], currentGlowR);
        if (showCuspGlow) {
          g.addColorStop(0, 'rgba(120,20,10,.12)');
          g.addColorStop(.15, 'rgba(90,15,8,.06)');
          g.addColorStop(.40, 'rgba(60,10,5,.02)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
        } else {
          g.addColorStop(0, 'rgba(220,245,255,.88)'); g.addColorStop(.06, 'rgba(100,210,255,.62)');
          g.addColorStop(.18, 'rgba(50,150,255,.32)'); g.addColorStop(.42, 'rgba(30,90,220,.12)');
          g.addColorStop(.75, 'rgba(20,50,170,.04)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        }
        glowCache = g;
      }
      ctx.fillStyle = glowCache; ctx.beginPath(); ctx.arc(bhS[0], bhS[1], currentGlowR, 0, 2 * Math.PI); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      // B-2.4 (D-2): the R_s / ISCO / capture / PN-validity rings that used to
      // be drawn here are now owned solely by
      // src/render/scientific_annotation_pass.js, which runs later in the
      // declared pass order (after `discNear`). Do not reintroduce ring or
      // radius-label drawing in this pass.
    }

    return Object.freeze({ render });
  }

  SGRA.Render.BlackHoleEnvironmentPass = Object.freeze({ createBlackHoleEnvironmentPass, glowRadiusForPhysicalScale });
})(globalThis);
