// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachBodyScenePass(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  // BH body sprite drawn a bit larger than bare R_s for visibility (tuned by
  // eye), floored for wide-field visibility — same idiom as MIN_RING_PX in
  // the annotation pass. When the floor is active the sprite is no longer
  // to scale (see bhSpriteAtFloor below).
  const BH_SPRITE_RS_MULT = 2.4;
  const MIN_BH_SPRITE_PX = 10;
  const INTRUDER_MARKER_MIN_PX = 2.2;
  const INTRUDER_MARKER_MAX_PX = 7;
  const INTRUDER_GLOW_MAX_PX = 24;
  const LABEL_TRANSITION_MS = 160;

  function createBodyScenePass() {
    let discRasterKernel = null;
    const labelPlacementState = new Map();
    function render(frame) {
      const { ctx } = frame;
      const labels = [];
      for (const record of frame.depthOrderedBodies) renderBodyRecord(frame, record, labels);
      drawLabels(frame, labels);
      ctx.globalCompositeOperation = 'source-over';
    }

    function renderBodyRecord(frame, record, labels) {
      const { ctx, camera, display } = frame;
      const { index: i, body: b, screen: s } = record;
      const persp = Math.min(2.6, Math.max(.55, 2600 / s[2]));
      if (b.bh) {
        renderBlackHoleBody(frame, b, s);
        return;
      }
      const w = b.field ? 0 : frame.relWeight(b);
      const base = b.intr ? (b.star ? 3.0 : 4.2) : b.field ? 2.4 : (b.mag ? (16 - b.mag) * .12 : 2.6);
      const rawRadius = Math.max(1.3, base * persp);
      const r = b.intr ? Math.min(INTRUDER_MARKER_MAX_PX, Math.max(INTRUDER_MARKER_MIN_PX, rawRadius)) : rawRadius;
      if (!b.field) {
        const gR = b.intr ? Math.min(INTRUDER_GLOW_MAX_PX, Math.max(7, r * (2.2 + w * 6))) : r * (2.8 + w * 18);
        const g = ctx.createRadialGradient(s[0], s[1], r * .5, s[0], s[1], gR);
        g.addColorStop(0, frame.weightCol(w, .7)); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s[0], s[1], gR, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = b.intr && !b.star ? b.col : frame.weightCol(w, 1);
      } else {
        ctx.fillStyle = 'rgba(130,150,190,1)';
      }
      ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 2 * Math.PI); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (i === frame.followedIndex) {
        ctx.strokeStyle = b.field ? 'rgba(255,138,76,.9)' : frame.weightCol(w, .9); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(s[0], s[1], r + 6, 0, 2 * Math.PI); ctx.stroke();
      }
      if (display.showLabels && (i === frame.followedIndex || b.intr || (camera.dist < 14000 && b.name))) {
        const focused = display.followFocus && (b.intr || i === frame.followedIndex || b.bh);
        ctx.fillStyle = focused || !display.followFocus
          ? (b.field ? 'rgba(110,130,165,.6)' : 'rgba(160,180,210,.8)')
          : (b.field ? 'rgba(110,130,165,.22)' : 'rgba(160,180,210,.28)');
        ctx.font = '9.5px IBM Plex Mono';
        labels.push({ body: b, index: i, x: s[0] + r + 5, y: s[1] + 3, r, priority: i === frame.followedIndex ? 0 : b.intr ? 1 : 2 });
      }
      ctx.globalCompositeOperation = 'lighter';
    }

    // Small deterministic screen-space guard for the handful of labels that
    // matter during an encounter. This is intentionally not a general layout
    // engine: each label tries a fixed vertical offset sequence and keeps the
    // first non-overlapping placement.
    function drawLabels(frame, labels) {
      const { ctx, display, viewport } = frame;
      if (!display.showLabels || !labels.length) return;
      labels.sort((a, b) => a.priority - b.priority || a.index - b.index);
      const placed = [];
      const offsets = [0, 12, -12, 24, -24];
      ctx.font = '9.5px IBM Plex Mono';
      for (const label of labels) {
        const text = label.body.name || '';
        const width = ctx.measureText(text).width;
        let chosen = null;
        for (const dy of offsets) {
          const x = Math.max(2, Math.min(viewport.W - width - 2, label.x));
          const y = Math.max(11, Math.min(viewport.H - 2, label.y + dy));
          const box = { left: x - 1, right: x + width + 1, top: y - 10, bottom: y + 2 };
          if (!placed.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) { chosen = { x, y, box }; break; }
        }
        if (!chosen) continue;
        placed.push(chosen.box);
        const b = label.body;
        const key = b.id ?? label.index;
        const targetOffset = chosen.y - label.y;
        let transition = labelPlacementState.get(key);
        if (!transition || transition.target !== targetOffset) {
          const currentOffset = transition ? transition.current : targetOffset;
          transition = { current: currentOffset, target: targetOffset, startedAt: frame.realNow };
          labelPlacementState.set(key, transition);
        }
        const elapsed = frame.reducedMotion ? LABEL_TRANSITION_MS : Math.max(0, frame.realNow - transition.startedAt);
        const progress = Math.min(1, elapsed / LABEL_TRANSITION_MS);
        const eased = progress * progress * (3 - 2 * progress);
        transition.current = transition.current + (transition.target - transition.current) * eased;
        if (progress >= 1) transition.current = transition.target;
        const drawY = Math.max(11, Math.min(viewport.H - 2, label.y + transition.current));
        const focused = display.followFocus && (b.intr || label.index === frame.followedIndex || b.bh);
        ctx.fillStyle = focused || !display.followFocus
          ? (b.field ? 'rgba(110,130,165,.6)' : 'rgba(160,180,210,.8)')
          : (b.field ? 'rgba(110,130,165,.22)' : 'rgba(160,180,210,.28)');
        ctx.fillText(text, chosen.x, drawY);
      }
    }

    function renderBlackHoleBody(frame, b, s) {
      const { ctx, display, constants, physics } = frame;
      // B-2.4 / ADL-DISC v2 §0 fix: sprite radius must scale as 1/dist (like
      // every other radius in the renderer — auToPx, annotation rings, orbit
      // geometry), not 1/dist^2. Driven from auToPx(RS()), linear in M, so it
      // tracks BH mass growth from captures instead of diverging via cbrt(M).
      const rsPx = frame.auToPx(physics.RS());
      const R = Math.max(MIN_BH_SPRITE_PX, rsPx * BH_SPRITE_RS_MULT);
      // rsPx * BH_SPRITE_RS_MULT < MIN_BH_SPRITE_PX means the floor is active
      // and the sprite is no longer to scale at this zoom (same idiom as
      // MIN_RING_PX in the annotation pass) — not surfaced in UI yet.

      // SGRA-DISC-REVISION-PLAN-v3 (v4 disc kernel): in-scene raster strong-
      // field image drawn at the black hole's own screen position. mPerPx:
      // RS() is 2M (R_s = 2GM/c^2), so 1 M = auToPx(RS())/2 screen px at this
      // zoom. That is the PHYSICAL scale; the kernel may floor it to a
      // presentation scale for visibility and reports back what it used.
      //
      // The kernel now paints its own shadow (b < b_crit is captured, hence
      // opaque black) and its own bloom, so this pass no longer draws a
      // generic orange radial glow or a separate black core on top of it.
      // That glow was washing the disc out, and the black core was erasing
      // the near-side band that must pass IN FRONT of the shadow.
      let discInfo = null;
      if (display.showDisc && SGRA.Render.DiscRasterKernel) {
        discRasterKernel = discRasterKernel || SGRA.Render.DiscRasterKernel.createDiscRasterKernel({
          DiscBending: SGRA.Render.DiscBending
        });
        const yaw = frame.cameraBasis ? frame.cameraBasis.yaw : 0;
        const pitch = frame.cameraBasis ? frame.cameraBasis.pitch : 0;
        discInfo = discRasterKernel.render(ctx, s[0], s[1], rsPx / 2, yaw, pitch, frame.viewport);
      }

      if (!discInfo) {
        // Disc disabled (or degenerate viewport): fall back to the previous
        // body sprite, unchanged, on the PHYSICAL scale.
        const g = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], R);
        g.addColorStop(0, 'rgba(255,190,130,.95)'); g.addColorStop(.2, 'rgba(255,130,60,.45)');
        g.addColorStop(.55, 'rgba(180,60,20,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s[0], s[1], R, 0, 2 * Math.PI); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        // Black core radius is the apparent photon-ring shadow (b_crit =
        // (3*sqrt(3)/2) * R_s), the one physically meaningful radius here —
        // not the horizon, and not an arbitrary fraction of the sprite.
        const shadowR = frame.auToPx(constants.SHADOW_B_CRIT_RS_FAC * physics.RS());
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(s[0], s[1], Math.max(2.5, shadowR), 0, 2 * Math.PI); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // PO-5 (SGRA-SPEC-001-PO-RULINGS.md, PROPOSED/pending ratification):
      // the pre-ADL-DISC code drew a 1px stroked highlight rim here
      // (previously at R*.13 + 1). It is dropped now that
      // scientific_annotation_pass.js's opticalShadow marker (ADL-DISC v2
      // §9) draws a real, labelled, dashed ring at exactly this radius —
      // keeping both would be two visually near-coincident strokes, one of
      // them an unlabelled leftover. If PO-5 is not ratified, restore the
      // rim and see that ruling for why the +1px offset was load-bearing
      // for a test, not a design choice.
      if (display.showLabels) {
        const ms2 = b.m > constants.MBH_INIT * 1.001 ? ` ${(b.m / 1e6).toFixed(3)}M` : '';
        ctx.fillStyle = 'rgba(255,170,120,.9)'; ctx.font = '10px IBM Plex Mono';
        // Offset from whatever silhouette was actually drawn, so the label
        // does not land inside the shadow once the presentation floor is up.
        const labelDx = discInfo ? discInfo.bCritPx + 8 : R * .2 + 8;
        ctx.fillText(`SGR A*${ms2}`, s[0] + labelDx, s[1] - 6);
      }
      // B-2.4 (D-2): this pass previously drew a second R_s ring, a second
      // R_cap ring and duplicate 'Rₛ'/'R_cap' labels. Those markers are now
      // owned solely by src/render/scientific_annotation_pass.js. This pass
      // draws the black hole *body* only and must not draw scientific radii.
      ctx.globalCompositeOperation = 'lighter';
    }

    return Object.freeze({ render });
  }

  SGRA.Render.BodyScenePass = Object.freeze({ createBodyScenePass, easeLabelOffset: (from, to, progress) => from + (to - from) * (progress * progress * (3 - 2 * progress)) });
})(globalThis);
