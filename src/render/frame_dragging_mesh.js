// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachFrameDraggingMesh(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  // AUTHORITATIVE SPIN AXIS. The local `TILT_RAD = 20 * Math.PI / 180` and the
  // hand-written AXIS_Z that used to live here are GONE: they were one of two
  // independent copies of the same orientation (the other was
  // disc_raster_kernel.js's DISC_NORMAL_WORLD). Both now derive from
  // SGRA.Domain.Constants.SPIN_AXIS_WORLD, which the Lense-Thirring physics
  // also consumes. Do not reintroduce a local tilt constant here -- the mesh
  // must be drawing the axis the physics is actually using.
  const Constants = (global.SGRA && global.SGRA.Domain && global.SGRA.Domain.Constants) || null;
  const AXIS_SOURCE = (Constants && Constants.SPIN_AXIS_WORLD) || [0, 0, 1];
  const AXIS_NORM = Math.hypot(AXIS_SOURCE[0], AXIS_SOURCE[1], AXIS_SOURCE[2]) || 1;
  const AXIS_Z = [AXIS_SOURCE[0] / AXIS_NORM, AXIS_SOURCE[1] / AXIS_NORM, AXIS_SOURCE[2] / AXIS_NORM];
  // Equatorial basis built FROM the axis rather than written alongside it, so
  // the triad cannot drift out of orthogonality if the axis ever changes.
  // Seed away from the axis, then Gram-Schmidt; AXIS_Y = AXIS_Z x AXIS_X keeps
  // (AXIS_X, AXIS_Y, AXIS_Z) right-handed, which is what SPIN_DIRECTION_SIGN
  // below depends on.
  const SEED = Math.abs(AXIS_Z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const SEED_DOT = SEED[0] * AXIS_Z[0] + SEED[1] * AXIS_Z[1] + SEED[2] * AXIS_Z[2];
  const AXIS_X_RAW = [
    SEED[0] - SEED_DOT * AXIS_Z[0],
    SEED[1] - SEED_DOT * AXIS_Z[1],
    SEED[2] - SEED_DOT * AXIS_Z[2]
  ];
  const AXIS_X_NORM = Math.hypot(AXIS_X_RAW[0], AXIS_X_RAW[1], AXIS_X_RAW[2]) || 1;
  const AXIS_X = [AXIS_X_RAW[0] / AXIS_X_NORM, AXIS_X_RAW[1] / AXIS_X_NORM, AXIS_X_RAW[2] / AXIS_X_NORM];
  const AXIS_Y = [
    AXIS_Z[1] * AXIS_X[2] - AXIS_Z[2] * AXIS_X[1],
    AXIS_Z[2] * AXIS_X[0] - AXIS_Z[0] * AXIS_X[2],
    AXIS_Z[0] * AXIS_X[1] - AXIS_Z[1] * AXIS_X[0]
  ];
  const SHELL_COUNT = 4;
  const LATITUDE_COUNT = 5;
  const MERIDIAN_COUNT = 10;
  const ARC_SEGMENTS = 40;
  const MERIDIAN_SEGMENTS = 20;
  const INNER_RADIUS_RS = 24;
  const OUTER_RADIUS_RS = 52;
  const MAX_TWIST_RAD = 1.15;
  // Handedness convention, fixed at this one seam.
  //
  //   (AXIS_X, AXIS_Y, AXIS_Z) is right-handed (AXIS_X x AXIS_Y = AXIS_Z), so
  //   increasing longitude is the right-handed sense about the spin axis.
  //   The disc raster kernel uses the same convention (a2 = n x a1 with the
  //   same tilted normal), and camera_projection maps world +x to screen right
  //   and world +y to screen up with the observer on +z, i.e. it preserves
  //   handedness. A right-handed world twist therefore reads right-handed on
  //   screen for every camera orientation.
  //
  //   Positive spin therefore drags spacetime toward INCREASING longitude:
  //   the sign is +1. The previous -1 made the mesh counter-rotate against
  //   both the spin axis and the disc's orbital sense, which is the reported
  //   "wrong handedness".
  const SPIN_DIRECTION_SIGN = 1;
  // Lense-Thirring: omega = 2J/r^3. Cubic falloff, not quadratic, so the
  // inner shells are unambiguously the strongly dragged ones.
  const FALLOFF_EXPONENT = 3;
  const SPOKE_COUNT = 12;
  const SPOKE_SEGMENTS = 48;
  const SPOKE_LATITUDES = [-Math.PI / 6, 0, Math.PI / 6];
  const STROKE_ALPHA_INNER = 0.10;
  const STROKE_ALPHA_OUTER = 0.03;
  const SPOKE_ALPHA_GAIN = 1.45;
  const LINE_WIDTH = 0.7;
  const LINE_WIDTH_BASE = 0.55;
  const LINE_WIDTH_GAIN = 0.35;
  // Restrained two-point ramp: cool grey-blue outside, marginally brighter and
  // a touch warmer where the drag is strongest. Same family, no false colour.
  const COLOUR_WEAK = [128, 152, 172];
  const COLOUR_STRONG = [178, 188, 186];

  function twistAngle(radiusRs, spin) {
    if (!Number.isFinite(spin) || spin === 0) return 0;
    const falloff = INNER_RADIUS_RS / Math.max(INNER_RADIUS_RS, radiusRs);
    return Math.max(-MAX_TWIST_RAD, Math.min(MAX_TWIST_RAD,
      SPIN_DIRECTION_SIGN * spin * MAX_TWIST_RAD
        * Math.pow(falloff, FALLOFF_EXPONENT)));
  }

  function dragStrength(radiusRs, spin) {
    return Math.min(1, Math.abs(twistAngle(radiusRs, spin)) / MAX_TWIST_RAD);
  }

  function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value < edge0 ? 0 : 1;
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // Compatibility seam retained for the pre-spin renderer tests. The
  // authoritative geometry uses dragStrength; strengthFade is its descriptive
  // public alias.
  const strengthFade = dragStrength;

  function meshStyle(strength, gain) {
    const t = Math.max(0, Math.min(1, strength));
    const alpha = Math.min(0.30, (STROKE_ALPHA_OUTER +
      (STROKE_ALPHA_INNER - STROKE_ALPHA_OUTER) * t) * (gain || 1));
    const r = Math.round(COLOUR_WEAK[0] + (COLOUR_STRONG[0] - COLOUR_WEAK[0]) * t);
    const g = Math.round(COLOUR_WEAK[1] + (COLOUR_STRONG[1] - COLOUR_WEAK[1]) * t);
    const b = Math.round(COLOUR_WEAK[2] + (COLOUR_STRONG[2] - COLOUR_WEAK[2]) * t);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }

  function pointAt(radiusRs, latitude, longitude, spin, schwarzschildRadius) {
    const theta = longitude + twistAngle(radiusRs, spin);
    const radiusAu = radiusRs * schwarzschildRadius;
    const cLat = Math.cos(latitude), sLat = Math.sin(latitude);
    const c = Math.cos(theta) * cLat, s = Math.sin(theta) * cLat;
    return [
      radiusAu * (AXIS_X[0] * c + AXIS_Y[0] * s + AXIS_Z[0] * sLat),
      radiusAu * (AXIS_X[1] * c + AXIS_Y[1] * s + AXIS_Z[1] * sLat),
      radiusAu * (AXIS_X[2] * c + AXIS_Y[2] * s + AXIS_Z[2] * sLat)
    ];
  }

  // Radius samples for a drag spoke, geometrically spaced so the strongly
  // curved inner end is the best resolved.
  function spokeRadius(t) {
    return INNER_RADIUS_RS * Math.pow(OUTER_RADIUS_RS / INNER_RADIUS_RS, t);
  }

  function createFrameDraggingMeshPass() {
    function render(frame) {
      if (!frame.display.showSpinMesh || !frame.projectBH || !frame.physics?.RS) return;

      const { ctx } = frame;
      // AUTHORITATIVE SPIN MAGNITUDE. The hardcoded render-only
      // `spinMeshSpin: 0.65` is retired: the mesh now reads the SAME
      // dimensionless a* that the Lense-Thirring physics reads
      // (BlackHoleModelState.spinMagnitude, plumbed in as display.spinAStar).
      // The fallback is 0, not 0.65 -- if the value is ever missing, the
      // honest picture is "no spin", not a decorative one.
      //
      // At a* = 0 the cage still draws, but perfectly untwisted and at the
      // weak end of the colour ramp -- twistAngle() already returns 0 for zero
      // spin. That is the faithful picture (an axis, no drag), and it keeps the
      // toggle from silently doing nothing. Note this is a deliberate change
      // in the mesh's DEFAULT appearance: it used to show a 0.65-spin twist
      // regardless of state, which was decorative rather than true.
      const spin = Number.isFinite(frame.display.spinAStar)
        ? frame.display.spinAStar : 0;
      const rs = frame.physics.RS();
      if (!(rs > 0)) return;

      // The mask is outside the complete physical disc extent (20 R_s). This
      // keeps the optional mesh from crossing the frozen BH/disc image.
      const exclusionPx = Math.max(2, frame.auToPx(21 * rs));
      const center = frame.blackHoleScreen || frame.projectBH(0, 0, 0);
      if (!center) return;

      ctx.save();
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const outsideMask = (point) =>
        Math.hypot(point[0] - center[0], point[1] - center[1]) >= exclusionPx;

      const strokeVisible = (points, alpha) => {
        const projected = points.map(point => frame.projectBH(point[0], point[1], point[2]));
        if (projected.some(point => !point)) return;
        ctx.strokeStyle = alpha;
        let open = false;
        for (let i = 0; i < projected.length; i++) {
          const point = projected[i];
          if (!outsideMask(point)) {
            if (open) ctx.stroke();
            open = false;
            continue;
          }
          if (!open) {
            ctx.beginPath();
            ctx.moveTo(point[0], point[1]);
            open = true;
          } else {
            ctx.lineTo(point[0], point[1]);
          }
        }
        if (open) ctx.stroke();
      };

      // Spokes carry the drag gradient, so they are stroked segment by segment
      // with their own local strength rather than one alpha for the curve.
      const strokeGraded = (points, strengths, gain) => {
        const projected = points.map(point => frame.projectBH(point[0], point[1], point[2]));
        for (let i = 0; i < projected.length - 1; i++) {
          const a = projected[i], b = projected[i + 1];
          if (!a || !b || !outsideMask(a) || !outsideMask(b)) continue;
          const strength = (strengths[i] + strengths[i + 1]) * 0.5;
          ctx.strokeStyle = meshStyle(strength, gain);
          ctx.lineWidth = LINE_WIDTH_BASE + LINE_WIDTH_GAIN * strength;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
      };

      for (let shell = 0; shell < SHELL_COUNT; shell++) {
        const radiusRs = INNER_RADIUS_RS + (OUTER_RADIUS_RS - INNER_RADIUS_RS) * shell / (SHELL_COUNT - 1);
        const strength = dragStrength(radiusRs, spin);
        const style = meshStyle(strength, 1);
        ctx.lineWidth = LINE_WIDTH_BASE + LINE_WIDTH_GAIN * strength;

        // Latitude rings above, through, and below the spin equator.
        for (let latitudeIndex = 0; latitudeIndex < LATITUDE_COUNT; latitudeIndex++) {
          const latitude = (-2 + latitudeIndex) * Math.PI / 6;
          const points = [];
          for (let segment = 0; segment <= ARC_SEGMENTS; segment++) {
            points.push(pointAt(radiusRs, latitude,
              Math.PI * 2 * segment / ARC_SEGMENTS, spin, rs));
          }
          strokeVisible(points, style);
        }

        // Meridian curves complete the 3D coordinate cage. They are not free
        // loops: each follows one fixed longitude through the latitude grid.
        for (let meridian = 0; meridian < MERIDIAN_COUNT; meridian++) {
          const longitude = Math.PI * 2 * meridian / MERIDIAN_COUNT;
          const points = [];
          for (let segment = 0; segment <= MERIDIAN_SEGMENTS; segment++) {
            const latitude = -Math.PI / 2 + Math.PI * segment / MERIDIAN_SEGMENTS;
            points.push(pointAt(radiusRs, latitude, longitude, spin, rs));
          }
          strokeVisible(points, style);
        }
      }

      // Radial drag spokes. A shell is a surface of constant radius, so the
      // twist is constant over it and the shell is only rigidly rotated: no
      // shear is visible anywhere on the cage. These curves are the only
      // geometry that crosses the radial twist gradient, and so the only
      // geometry that actually shows the frame dragging.
      for (let latitudeIndex = 0; latitudeIndex < SPOKE_LATITUDES.length; latitudeIndex++) {
        const latitude = SPOKE_LATITUDES[latitudeIndex];
        for (let spoke = 0; spoke < SPOKE_COUNT; spoke++) {
          const longitude = Math.PI * 2 * spoke / SPOKE_COUNT;
          const points = [];
          const strengths = [];
          for (let segment = 0; segment <= SPOKE_SEGMENTS; segment++) {
            const radiusRs = spokeRadius(segment / SPOKE_SEGMENTS);
            points.push(pointAt(radiusRs, latitude, longitude, spin, rs));
            strengths.push(dragStrength(radiusRs, spin));
          }
          strokeGraded(points, strengths, SPOKE_ALPHA_GAIN);
        }
      }

      ctx.restore();
    }

    return Object.freeze({ render });
  }

  SGRA.Render.FrameDraggingMesh = Object.freeze({
    createFrameDraggingMeshPass,
    twistAngle,
    dragStrength,
    strengthFade,
    smoothstep,
    meshStyle,
    pointAt,
    spokeRadius,
    constants: Object.freeze({ INNER_RADIUS_RS, OUTER_RADIUS_RS, MAX_TWIST_RAD, SPIN_DIRECTION_SIGN, FALLOFF_EXPONENT, SHELL_COUNT, LATITUDE_COUNT, MERIDIAN_COUNT, SPOKE_COUNT }),
    // Exposed so the authoritative-state gate can assert mechanically that the
    // mesh, the disc and the physics are all using ONE axis.
    spinAxis: Object.freeze([AXIS_Z[0], AXIS_Z[1], AXIS_Z[2]]),
    equatorialBasis: Object.freeze({ x: Object.freeze([...AXIS_X]), y: Object.freeze([...AXIS_Y]) })
  });
})(typeof window !== 'undefined' ? window : globalThis);
