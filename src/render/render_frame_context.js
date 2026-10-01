// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachRenderFrameContext(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  function createRenderFrameContextBuilder() {
    let currentArgs = null;
    const projectFramePoint = (x, y, z) => currentArgs.projectBH(x, y, z, currentArgs.camera);
    const auToPxFrame = value => currentArgs.auToPx(value, currentArgs.camera);
    const projectionCache = SGRA.Render.FrameProjectionCache.createFrameProjectionCache(projectFramePoint);
    const projectCached = projectionCache.projectCached;
    const projectedBodies = [];
    const depthOrderedBodies = [];
    const recordPool = [];

    const context = {
      ctx: null,
      canvas: null,
      starCanvas: null,
      viewport: null,
      camera: null,
      bodies: null,
      blackHole: null,
      followedIndex: -1,
      display: null,
      physics: null,
      trails: null,
      predictions: null,
      effects: null,
      orbitCache: null,
      pathDebug: null,
      clipX: 0,
      clipY: 0,
      blackHoleScreen: null,
      projectionCache,
      projectCached,
      projectedBodies,
      depthOrderedBodies,
      cameraBasis: null,
      projectBH: null,
      auToPx: null,
      renderBackground: null,
      pathRenderers: null,
      pathAttribution: null,
      samplePredictionAt: null,
      adaptiveProjectCurve: null,
      relWeight: null,
      weightCol: null,
      weightPos: null,
      formatMass: null,
      intruderAim: null,
      realNow: 0,
      reducedMotion: false,
      constants: null,
      projectBody(body) {
        const rel = currentArgs.toBH(body.x, body.y, body.z);
        return projectFramePoint(rel[0], rel[1], rel[2]);
      },
      projectPoint(point) {
        return Array.isArray(point)
          ? projectFramePoint(point[0], point[1], point[2])
          : projectFramePoint(point.x, point.y, point.z);
      }
    };

    function build(args) {
      currentArgs = args;
      const viewport = args.viewport;
      const camera = args.camera;
      const bodies = args.bodies;
      const blackHole = bodies[0];
      const clipX = viewport.W * 3;
      const clipY = viewport.H * 3;
      projectionCache.clear();
      const blackHoleScreen = projectFramePoint(0, 0, 0);
      projectedBodies.length = 0;

      for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        const rel = args.toBH(body.x, body.y, body.z);
        const screen = projectFramePoint(rel[0], rel[1], rel[2]);
        if (screen) {
          const record = recordPool[projectedBodies.length] || (recordPool[projectedBodies.length] = { index: 0, body: null, screen: null, bx: 0, by: 0, bz: 0 });
          record.index = i;
          record.body = body;
          record.screen = screen;
          record.bx = rel[0];
          record.by = rel[1];
          record.bz = rel[2];
          projectedBodies.push(record);
        }
      }
      depthOrderedBodies.length = projectedBodies.length;
      for (let i = 0; i < projectedBodies.length; i++) depthOrderedBodies[i] = projectedBodies[i];
      depthOrderedBodies.sort((a, b) => b.screen[2] - a.screen[2]);

      context.ctx = args.ctx;
      context.canvas = args.canvas;
      context.starCanvas = args.starCanvas;
      context.viewport = viewport;
      context.camera = camera;
      context.bodies = bodies;
      context.blackHole = blackHole;
      context.followedIndex = args.followedIndex;
      context.display = args.display;
      context.physics = args.physics;
      context.trails = args.trails;
      context.predictions = args.predictions;
      context.effects = args.effects;
      context.orbitCache = args.orbitCache;
      context.pathDebug = args.pathDebug;
      context.clipX = clipX;
      context.clipY = clipY;
      context.blackHoleScreen = blackHoleScreen;
      context.cameraBasis = args.cameraBasis;
      context.projectBH = projectFramePoint;
      context.auToPx = auToPxFrame;
      context.renderBackground = args.renderBackground;
      context.pathRenderers = args.pathRenderers;
      context.pathAttribution = args.pathAttribution || null;
      context.samplePredictionAt = args.samplePredictionAt;
      context.adaptiveProjectCurve = args.adaptiveProjectCurve;
      context.relWeight = args.relWeight;
      context.weightCol = args.weightCol;
      context.weightPos = args.weightPos;
      context.formatMass = args.formatMass;
      context.intruderAim = args.intruderAim;
      context.realNow = Number.isFinite(args.realNow) ? args.realNow : 0;
      context.reducedMotion = args.reducedMotion === true;
      context.constants = args.constants;
      return context;
    }

    return Object.freeze({ build });
  }

  SGRA.Render.RenderFrameContext = Object.freeze({ createRenderFrameContextBuilder });
})(globalThis);
