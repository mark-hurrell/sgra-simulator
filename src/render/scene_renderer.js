// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachSceneRenderer(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  // SGRA-SPEC-001 B-2.1 — the scene renderer walks the declared pass order in
  // src/render/render_pass_order.js. It must not carry its own hand-written
  // sequence of pass calls; the declared array is the single authority and the
  // draw-command spy in tests/render_pass_seams.test.mjs verifies the emitted
  // order against it.
  function createSceneRenderer(passes = {}) {
    const passOrder = SGRA.Render.PassOrder.PASS_ORDER;
    let observer = null;

    const dispatch = {
      background(frame) {
        if (frame.renderBackground) frame.renderBackground(frame.ctx, frame.starCanvas);
      },
      blackHoleBackdrop(frame) {
        if (passes.blackHoleEnvironment) passes.blackHoleEnvironment.render(frame);
      },
      discFar(frame) {
        if (passes.discFar) passes.discFar.render(frame);
      },
      pathsAndTrails(frame) {
        renderPaths(frame);
      },
      transients(frame) {
        if (passes.transientEffects) passes.transientEffects.render(frame);
      },
      bodies(frame) {
        if (passes.bodyScene) passes.bodyScene.render(frame);
      },
      discNear(frame) {
        if (passes.discNear) passes.discNear.render(frame);
      },
      scientificAnnotations(frame) {
        if (passes.scientificAnnotations) passes.scientificAnnotations.render(frame);
      },
      flowSpinAxes(frame) {
        if (passes.flowSpinAxes) passes.flowSpinAxes.render(frame);
      },
      interactionOverlays(frame) {
        renderIntruderAim(frame);
      }
    };

    for (let i = 0; i < passOrder.length; i++) {
      if (typeof dispatch[passOrder[i]] !== 'function') {
        throw new Error('scene renderer has no dispatch entry for declared pass: ' + passOrder[i]);
      }
    }

    function render(frame) {
      for (let i = 0; i < passOrder.length; i++) {
        const id = passOrder[i];
        if (observer) observer(id, 'begin', frame);
        dispatch[id](frame);
        if (observer) observer(id, 'end', frame);
      }
    }

    // Diagnostic-only seam. Disabled (null) by default so the ordinary render
    // path pays one truthiness check per pass and allocates nothing.
    function setPassObserver(fn) {
      observer = typeof fn === 'function' ? fn : null;
      return observer;
    }

    function declaredPassOrder() {
      return passOrder;
    }

    function renderPaths(frame) {
      const pathRenderers = frame.pathRenderers;
      if (!pathRenderers) return;
      pathRenderers.renderReferenceOrbits({
        ctx: frame.ctx,
        bodies: frame.bodies,
        orbitCache: frame.orbitCache,
        followIdx: frame.followedIndex,
        showOrbits: frame.display.showOrbits,
        PathDebug: frame.pathDebug,
        clipX: frame.clipX,
        clipY: frame.clipY,
        projectBH: frame.projectBH,
        camera: frame.camera,
        viewport: frame.viewport
        ,focusActive: frame.display.followFocus
      });
      pathRenderers.renderPredictionPaths({
        ctx: frame.ctx,
        futurePath: frame.predictions.followedPath,
        followIdx: frame.followedIndex,
        PathDebug: frame.pathDebug,
        simT: frame.physics.simT,
        clipX: frame.clipX,
        clipY: frame.clipY,
        projectCached: frame.projectCached,
        samplePredictionAt: frame.samplePredictionAt,
        adaptiveProjectCurve: frame.adaptiveProjectCurve
      });
      pathRenderers.renderHistoricalTrails({
        ctx: frame.ctx,
        bodies: frame.bodies,
        trailData: frame.trails.data,
        showTrails: frame.display.showTrails,
        PathDebug: frame.pathDebug,
        clipX: frame.clipX,
        clipY: frame.clipY,
        projectCached: frame.projectCached,
        projectUncached: frame.projectPoint,
        relWeight: frame.relWeight,
        RS: frame.physics.RS,
        camera: frame.camera,
        viewport: frame.viewport,
        attribution: frame.pathAttribution,
        followIdx: frame.followedIndex,
        focusActive: frame.display.followFocus
      });
    }

    function renderIntruderAim(frame) {
      const aim = frame.intruderAim;
      if (!aim || !aim.renderer) return;
      aim.renderer.renderAim(frame.ctx, {
        aim: aim.getAim(),
        preview: aim.isAiming() ? aim.ensurePreview() : null,
        projectBH: frame.projectBH,
        mass: aim.getMass(),
        formatMass: frame.formatMass,
        kms: frame.constants.KMS
      });
    }

    return Object.freeze({ render, setPassObserver, declaredPassOrder });
  }

  SGRA.Render.SceneRenderer = Object.freeze({ createSceneRenderer });
})(globalThis);
