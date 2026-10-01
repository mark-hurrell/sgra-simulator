// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachPathRenderers(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  // A NaN/Infinity coordinate must never be treated as "in bounds": a bare
  // `Math.abs(x) > clip` check silently passes NaN through (NaN comparisons
  // are always false), which previously let corrupted points reach ctx.lineTo
  // and draw invalid huge/cross-screen connectors.
  function isFiniteScreenPoint(s) {
    return !!s && Number.isFinite(s[0]) && Number.isFinite(s[1]);
  }

  // Trail colours are drawn from a fixed 9-step alpha ramp crossed with the
  // 4 weightCol buckets plus the intruder and field cases. Precomputed at load
  // so the inner loop does no string work at all. See PERF-05.
  const TRAIL_ALPHA_STEPS = 9; // Math.round(8*p/len)/8 -> {0, 1/8, ... 8/8}
  const TRAIL_COL_INTRUDER = new Array(TRAIL_ALPHA_STEPS);
  const TRAIL_COL_FIELD = new Array(TRAIL_ALPHA_STEPS);
  const TRAIL_COL_WEIGHT = [
    new Array(TRAIL_ALPHA_STEPS), new Array(TRAIL_ALPHA_STEPS),
    new Array(TRAIL_ALPHA_STEPS), new Array(TRAIL_ALPHA_STEPS)
  ];
  const RELATIVISTIC_FADE_MS = 3000;
  const intruderFadeState = new Map();
  (function buildTrailColourTables() {
    for (let k = 0; k < TRAIL_ALPHA_STEPS; k++) {
      const ab = +(k / 8).toFixed(2);
      TRAIL_COL_INTRUDER[k] = `rgba(255,140,100,${(ab * 0.45).toFixed(2)})`;
      TRAIL_COL_FIELD[k] = `rgba(130,150,190,${(ab * 0.28).toFixed(2)})`;
      const a = ab * 0.55;
      TRAIL_COL_WEIGHT[0][k] = `rgba(100,150,255,${a})`;
      TRAIL_COL_WEIGHT[1][k] = `rgba(50,220,200,${a})`;
      TRAIL_COL_WEIGHT[2][k] = `rgba(255,150,30,${a})`;
      TRAIL_COL_WEIGHT[3][k] = `rgba(255,50,50,${a})`;
    }
  })();

  function weightBucket(w) {
    return w < 0.05 ? 0 : w < 0.30 ? 1 : w < 0.70 ? 2 : 3;
  }

  function nowMs() {
    return global.performance && typeof global.performance.now === 'function'
      ? global.performance.now()
      : Date.now();
  }

  function blendTrailColours(green, orange, progress) {
    const greenMatch = green.match(/^rgba\((\d+),(\d+),(\d+),([0-9.]+)\)$/);
    const orangeMatch = orange.match(/^rgba\((\d+),(\d+),(\d+),([0-9.]+)\)$/);
    if (!greenMatch || !orangeMatch) return progress < 1 ? green : orange;
    const mix = (a, b) => Math.round(Number(a) * (1 - progress) + Number(b) * progress);
    const alpha = Number(greenMatch[4]) * (1 - progress) + Number(orangeMatch[4]) * progress;
    return `rgba(${mix(greenMatch[1], orangeMatch[1])},${mix(greenMatch[2], orangeMatch[2])},${mix(greenMatch[3], orangeMatch[3])},${alpha.toFixed(2)})`;
  }

  function trailMidpoint(a, b) {
    const dt = Math.max(1e-12, (b.t ?? 0) - (a.t ?? 0));
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const chord = Math.max(1e-9, Math.hypot(dx, dy, dz));
    const av = Math.hypot(a.vx || 0, a.vy || 0, a.vz || 0) * dt;
    const bv = Math.hypot(b.vx || 0, b.vy || 0, b.vz || 0) * dt;
    // When tangents are much longer than the actual chord, the Hermite midpoint
    // overshoots and produces visible ringing in tight mutual orbits. Fall back
    // to a linear midpoint in that regime.
    if (Math.max(av, bv) > chord * 2.25) {
      return {
        t: ((a.t ?? 0) + (b.t ?? 0)) * 0.5,
        x: (a.x + b.x) * 0.5,
        y: (a.y + b.y) * 0.5,
        z: (a.z + b.z) * 0.5,
        vx: ((a.vx || 0) + (b.vx || 0)) * 0.5,
        vy: ((a.vy || 0) + (b.vy || 0)) * 0.5,
        vz: ((a.vz || 0) + (b.vz || 0)) * 0.5
      };
    }
    return SGRA.Paths.Geometry.hermitePoint(a, b, 0.5);
  }

  function subdivideTrailSegment(segOut, a, sa, b, sb, depth, options) {
    const { clipX, clipY, curveSeg2, curveFlatnessPx, hardBreak2, curveMaxDepth, projectUncached } = options;
    if (!isFiniteScreenPoint(sa) || Math.abs(sa[0]) > clipX || Math.abs(sa[1]) > clipY) return null;
    if (!isFiniteScreenPoint(sb) || Math.abs(sb[0]) > clipX || Math.abs(sb[1]) > clipY) return null;
    const d2 = (sb[0] - sa[0]) ** 2 + (sb[1] - sa[1]) ** 2;
    if (d2 > hardBreak2) return null;
    // Endpoint length alone is insufficient: a cubic can bow sharply while
    // both endpoints remain close together. Measure the Hermite midpoint's
    // perpendicular screen-space distance from the endpoint chord as well.
    let midpoint = null;
    let midpointScreen = null;
    let flatness = 0;
    if (depth < curveMaxDepth) {
      midpoint = trailMidpoint(a, b);
      midpointScreen = projectUncached(midpoint);
      if (!isFiniteScreenPoint(midpointScreen)) return null;
      const dx = sb[0] - sa[0], dy = sb[1] - sa[1];
      const length2 = dx * dx + dy * dy;
      if (length2 > 0) {
        const u = Math.max(0, Math.min(1, ((midpointScreen[0] - sa[0]) * dx + (midpointScreen[1] - sa[1]) * dy) / length2));
        const px = sa[0] + u * dx, py = sa[1] + u * dy;
        flatness = Math.hypot(midpointScreen[0] - px, midpointScreen[1] - py);
      }
    }
    if ((d2 > curveSeg2 || flatness > curveFlatnessPx) && depth < curveMaxDepth) {
      const m = midpoint || trailMidpoint(a, b);
      const sm = midpointScreen || projectUncached(m); // generated point: single use, do not cache
      if (subdivideTrailSegment(segOut, a, sa, m, sm, depth + 1, options) === null) return null;
      if (subdivideTrailSegment(segOut, m, sm, b, sb, depth + 1, options) === null) return null;
      return sb;
    }
    segOut.push(sb);
    return sb;
  }

  function renderReferenceOrbits(deps) {
    const {
      ctx,
      bodies,
      orbitCache,
      followIdx,
      showOrbits,
      PathDebug,
      clipX,
      clipY,
      projectBH,
      camera,
      viewport,
      focusActive = false
    } = deps;

    if (showOrbits && (PathDebug.showOsculatingOrbits || PathDebug.showReferenceOrbits)) {
      const projectionKey = `${camera.yaw}|${camera.pitch}|${camera.dist}|${camera.tx}|${camera.ty}|${camera.tz}|${viewport.W}|${viewport.H}|${viewport.F}`;
      ctx.lineWidth=1;
      // PATH_DEBUG_NOTE: Osculating/reference orbit drawing is still combined here.
      for(let i=1;i<bodies.length;i++){
        const b=bodies[i];if(b.intr||b.field)continue;
        const c=orbitCache.get(b);if(!c||!c.pts)continue;
        if(c.conf<0.04)continue;
        if (c._screenKey !== projectionKey || !Array.isArray(c._screenPts) || c._screenPts.length !== c.pts.length) {
          c._screenKey = projectionKey;
          c._screenPts = c.pts.map(p => projectBH(p[0], p[1], p[2]));
        }
        const fade=0.35+0.65*c.conf;
        const alpha=(.18+fade*.5) * (focusActive && i !== followIdx ? .28 : 1);
        ctx.strokeStyle=i===followIdx?`rgba(255,138,76,${.6*fade+.22})`:`rgba(110,150,190,${alpha})`;
        ctx.beginPath();let started=false;
        let prevS=null;
        for(const s of c._screenPts){
          if(!isFiniteScreenPoint(s)||Math.abs(s[0])>clipX||Math.abs(s[1])>clipY){started=false;prevS=null;continue;}
          if(started&&prevS){
            const sl2=(s[0]-prevS[0])**2+(s[1]-prevS[1])**2;
            if(sl2>250000){started=false;prevS=null;ctx.moveTo(s[0],s[1]);started=true;prevS=s;continue;}
          }
          if(!started){ctx.moveTo(s[0],s[1]);started=true;}else ctx.lineTo(s[0],s[1]);
          prevS=s;
        }
        ctx.stroke();
      }
    }
  }

  function renderPredictionPaths(deps) {
    const {
      ctx,
      futurePath,
      followIdx,
      PathDebug,
      simT,
      clipX,
      clipY,
      projectCached,
      samplePredictionAt,
      adaptiveProjectCurve
    } = deps;

    // Draw from the current prediction age forward. Do not draw the elapsed part of
    // an old forecast, because that creates the visible snapping/geometric artefact.
    const drawPredPath = (path, style, alpha=1.0) => {
      if(!path || !Array.isArray(path.pts) || path.pts.length < 2) return;
      const age = simT - path.sourceSimT;
      const start = samplePredictionAt(path, age);
      if(!start) return;

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = style;
      ctx.setLineDash([4,6]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const segments = adaptiveProjectCurve(path, start, projectCached, clipX, clipY);
      for (const seg of segments) {
        if (seg.move) ctx.moveTo(seg.s[0], seg.s[1]);
        else ctx.lineTo(seg.s[0], seg.s[1]);
      }

      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    };

    if (PathDebug.showPredictionPaths) {
      if (followIdx > 0 && futurePath) {
        drawPredPath(futurePath, 'rgba(255,155,50,0.8)', 1.0);
      }
    }
  }

  function updateHistoricalTrailFade(td, isIntr, fadeKey) {
    let latestExit = null;
    if (isIntr) {
      for (let q = 1; q < td.length; q++) {
        if (td[q - 1].relativistic === true && td[q].relativistic !== true) {
          let greenStart = q - 1;
          while (greenStart > 0 && td[greenStart - 1].relativistic === true) greenStart--;
          latestExit = { exitN: td[q].n ?? q, greenStartN: td[greenStart].n ?? greenStart };
        }
      }
    }
    const latestSample = td[td.length - 1];
    if (latestSample?.relativistic === true) {
      intruderFadeState.delete(fadeKey);
    } else if (isIntr && latestExit) {
      const previous = intruderFadeState.get(fadeKey);
      if (!previous || previous.exitN !== latestExit.exitN) {
        intruderFadeState.set(fadeKey, { ...latestExit, startedAt: nowMs() });
      }
    }
    return isIntr ? intruderFadeState.get(fadeKey) : null;
  }

  function setHistoricalTrailStrokeStyle(ctx, colIdx, previousColIdx, useRelativisticPalette, fade, t, p, bodyIndex, followIdx, focusActive, isIntr, isField, bucket, k) {
    if (colIdx === previousColIdx) return previousColIdx;
    if (previousColIdx !== -1) ctx.stroke();
    const fading = useRelativisticPalette && fade && (t.n ?? p) >= fade.greenStartN && (t.n ?? p) < fade.exitN;
    const fadeProgress = fading ? Math.min(1, Math.max(0, (nowMs() - fade.startedAt) / RELATIVISTIC_FADE_MS)) : 0;
    const focusAlpha = focusActive && !isIntr && bodyIndex !== followIdx ? 0.28 : 1;
    ctx.strokeStyle = useRelativisticPalette
      ? (fading ? blendTrailColours(TRAIL_COL_WEIGHT[1][k], TRAIL_COL_INTRUDER[k], fadeProgress) : TRAIL_COL_WEIGHT[1][k])
      : isIntr ? TRAIL_COL_INTRUDER[k]
      : isField ? TRAIL_COL_FIELD[k]
      : TRAIL_COL_WEIGHT[bucket][k];
    if (focusAlpha !== 1) {
      const match = ctx.strokeStyle.match?.(/rgba?\(([^)]+)\)/);
      if (match) { const parts = match[1].split(',').map(v => v.trim()); const a = parts.length === 4 ? Number(parts[3]) : 1; ctx.strokeStyle = `rgba(${parts.slice(0, 3).join(',')},${(Number.isFinite(a) ? a : 1) * focusAlpha})`; }
    }
    ctx.beginPath();
    return colIdx;
  }

  function strokeHistoricalTrailSegments(ctx, td, bodyIndex, b, followIdx, focusActive, weight, fade, nearR, clipX, clipY, projectCached, subdivideOptions, metrics) {
    const isIntr = b.intr, isField = b.field;
    let prevRaw=null,prevScreen=null;
    let _trailColIdx=-1;
    let needMove=true;
    for(let p=0;p<td.length;p++){
      const t=td[p];
      const r=Math.hypot(t.x,t.y,t.z);
      if(r<nearR){prevRaw=null;prevScreen=null;needMove=true;continue;}
      const B=projectCached(t);
      if(!isFiniteScreenPoint(B)||Math.abs(B[0])>clipX||Math.abs(B[1])>clipY){prevRaw=null;prevScreen=null;needMove=true;continue;}
      if(prevRaw&&prevScreen){
        const segPoints=[];
        const ok=subdivideTrailSegment(segPoints,prevRaw,prevScreen,t,B,0,subdivideOptions);
        if(ok!==null&&segPoints.length){
          const k = Math.round(8 * p / td.length);
          const bucket = weightBucket(weight);
          // Use the state captured at the segment's endpoint. This keeps
          // historical orange intruder trail segments orange and turns
          // only segments sampled under relativistic treatment green.
          const useRelativisticPalette = isIntr && t.relativistic === true;
          const colIdx = useRelativisticPalette ? 300 + k
                       : isIntr ? 100 + k
                       : isField ? 200 + k
                       : bucket * 10 + k;
          if(colIdx!==_trailColIdx){ _trailColIdx = setHistoricalTrailStrokeStyle(ctx, colIdx, _trailColIdx, useRelativisticPalette, fade, t, p, bodyIndex, followIdx, focusActive, isIntr, isField, bucket, k); needMove=true; }
          if(needMove){ctx.moveTo(prevScreen[0],prevScreen[1]);needMove=false;}
          if (metrics) metrics.segmentsDrawn += segPoints.length;
          for(const s of segPoints) ctx.lineTo(s[0],s[1]);
        } else needMove=true;
      }
      prevRaw=t;prevScreen=B;
    }
    if(_trailColIdx!==-1)ctx.stroke();
  }

  function renderHistoricalTrailBodies(ctx, bodies, trailData, followIdx, focusActive, nearR, clipX, clipY, projectCached, subdivideOptions, relWeight, metrics) {
    for(let i=1;i<bodies.length;i++){
      const td=trailData[i];if(!td||td.length<2)continue;
      if (metrics) { metrics.visiblePaths++; metrics.pointsConsidered += td.length; metrics.segmentsConsidered += td.length - 1; }
      const b=bodies[i],isField=b.field;
      const w=isField?0:relWeight(b);
      const fade = updateHistoricalTrailFade(td, b.intr, b.id ?? i);
      strokeHistoricalTrailSegments(ctx, td, i, b, followIdx, focusActive, w, fade, nearR, clipX, clipY, projectCached, subdivideOptions, metrics);
    }
  }

  function renderHistoricalTrails(deps) {
    const {
      ctx,
      bodies,
      trailData,
      showTrails,
      PathDebug,
      clipX,
      clipY,
      projectCached,
      projectUncached,
      relWeight,
      RS,
      camera,
      viewport,
      attribution,
      followIdx = -1,
      focusActive = false
    } = deps;

    if(showTrails && PathDebug.showHistoricalTrails){
      const metrics = attribution;
      if (metrics && metrics.runIdentity !== renderHistoricalTrails.lastRunIdentity) {
        renderHistoricalTrails.lastRunIdentity = metrics.runIdentity;
        renderHistoricalTrails.lastTrailSignature = null;
        renderHistoricalTrails.lastViewSignature = null;
      }
      const trailSignature = metrics ? bodies.slice(1).map((body, i) => {
        const td = trailData[i + 1];
        const last = td?.at(-1);
        return `${body.id ?? i + 1}:${td?.length || 0}:${last?.n ?? ''}:${last?.t ?? ''}:${body.captured ? 1 : 0}`;
      }).join('|') : null;
      const viewSignature = metrics ? `${camera?.yaw}|${camera?.pitch}|${camera?.dist}|${camera?.tx}|${camera?.ty}|${camera?.tz}|${viewport?.W}|${viewport?.H}|${viewport?.F}|${clipX}|${clipY}|${RS()}` : null;
      if (metrics) {
        if (trailSignature === renderHistoricalTrails.lastTrailSignature) metrics.noSourceTrailChangeFrames++;
        else metrics.sourceTrailChangedFrames++;
        if (trailSignature === renderHistoricalTrails.lastTrailSignature && viewSignature !== renderHistoricalTrails.lastViewSignature) metrics.cameraOnlyChangedFrames++;
        renderHistoricalTrails.lastTrailSignature = trailSignature;
        renderHistoricalTrails.lastViewSignature = viewSignature;
      }
      ctx.lineWidth=1;
      // Only hide samples inside the horizon glow. The old 50 AU world-space
      // floor erased real close-approach history at every zoom level.
      const nearR=12*RS();
      // Curve-fit tuning: subdivide (via Hermite interpolation using each sample's
      // stored velocity as tangent) until on-screen sub-segments are this short.
      // HARD_BREAK2 stays at the same 400px threshold the old straight-line code
      // used to reject spurious connectors (real discontinuities: capture, removal,
      // wraparound) — that behaviour is preserved, only the in-between fill method
      // changed from a straight chord to a fitted curve.
      const CURVE_SEG2 = 60 * 60;
      const HARD_BREAK2 = 400 * 400;
      const CURVE_MAX_DEPTH = 6;
      const subdivideOptions = {
        clipX,
        clipY,
        curveSeg2: CURVE_SEG2,
        curveFlatnessPx: 1.5,
        hardBreak2: HARD_BREAK2,
        curveMaxDepth: CURVE_MAX_DEPTH,
        projectUncached
      };
      renderHistoricalTrailBodies(ctx, bodies, trailData, followIdx, focusActive, nearR, clipX, clipY, projectCached, subdivideOptions, relWeight, metrics);
    }
  }

  // Run-scoped lifecycle seam.  Fade history is keyed by reusable body ids,
  // so it must not outlive the run that created those ids.
  function clearIntruderFadeState() {
    intruderFadeState.clear();
  }

  SGRA.Render.PathRenderers = Object.freeze({
    renderReferenceOrbits,
    renderPredictionPaths,
    renderHistoricalTrails,
    clearIntruderFadeState
  });
})(typeof window !== 'undefined' ? window : globalThis);
