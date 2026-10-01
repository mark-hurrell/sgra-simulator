// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachDiscRasterKernel(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  // SGRA-DISC-REVISION-PLAN-v3 §3/§4, revised. In-scene raster disc drawn
  // at the black hole's screen position via body_scene_pass.js.
  //
  // WHAT CHANGED AND WHY (v4):
  //
  // The previous kernel rendered the DIRECT image only, via the
  // Beloborodov leading-order deflection, and stood a decorative
  // radial-gradient arc pair in for the missing lensed structure. Its own
  // comments were right that this was not a secondary image. The direct
  // image alone cannot look like a black hole: essentially all of the
  // recognisable silhouette — the far side of the disc arching over the
  // shadow, the thin under-arch, the bright ring hugging b_crit — is
  // higher-order lensed structure.
  //
  // This version renders image orders n = 0, 1, 2 from an exact
  // Schwarzschild null-geodesic transfer function (disc_bending.js's ray
  // table). The decorative photon-ring arcs are GONE: the bright ring near
  // b_crit is now produced by the n >= 1 images piling up there, which is
  // what a photon ring physically is.
  //
  // The geometry per pixel:
  //
  //   Let o be the unit vector from the hole to the observer, n the disc
  //   normal, e2 = normalise(n - (n.o) o) the projected normal (screen
  //   "up"), e1 = e2 x o (screen "right"). A screen point at impact
  //   parameter b and screen azimuth psi lies on a backward ray whose
  //   orbital plane is spanned by o and s = cos(psi) e1 + sin(psi) e2. A
  //   point on that ray at sweep angle Theta from the observer direction
  //   has unit position cos(Theta) o + sin(Theta) s. Requiring it to lie in
  //   the disc plane (dot with n = 0) gives, in closed form,
  //
  //       cos(Theta_0) prop. -sin(psi) sinI * sgn(cosI)
  //       sin(Theta_0) prop.  |cosI|
  //
  //   and the successive equatorial crossings are Theta_n = Theta_0 + n*PI.
  //   The emission radius is then just r = 1 / u(Theta_n; b) from the ray
  //   table. That is the whole transfer function: one atan2 and a table
  //   lookup per image order per pixel. No per-pixel ODE, no root find.
  //
  //   Occlusion is exact and free: order n is reached later along the
  //   backward ray than order n-1, so compositing n = 2, then 1, then 0
  //   with source-over is the correct visibility ordering.
  //
  //   The shadow is not drawn as a shape. b < b_crit = 3*sqrt(3) M is
  //   captured, so it is opaque black unless a foreground (n = 0) disc
  //   crossing covers it — which is exactly why the near-side band now
  //   correctly passes IN FRONT of the black disc, as in the references.
  //
  // Apparent inclination and on-screen roll are still derived each frame
  // from the actual camera yaw/pitch against a disc orientation fixed in
  // WORLD space (Constants.SPIN_AXIS_WORLD), so the disc behaves like a real 3D
  // object under camera orbit and never becomes a screen-space decal.
  //
  // Blackbody-style ramp: t=0 is the ISCO (hottest, near-white), t=1 is the
  // outer edge (coolest, dark red). Any blue/white bias must come from the
  // Doppler + gravitational shift factor g, not from a false-colour palette.
  const RAMP_STOPS = [
    { t: 0.00, r: 0xff, g: 0xf4, b: 0xd8 },
    { t: 0.25, r: 0xff, g: 0xc8, b: 0x70 },
    { t: 0.55, r: 0xff, g: 0x8a, b: 0x30 },
    { t: 0.80, r: 0xe8, g: 0x40, b: 0x10 },
    { t: 1.00, r: 0x5a, g: 0x08, b: 0x02 }
  ];

  function sampleRamp(t, outRGB) {
    const clamped = t < 0 ? 0 : (t > 1 ? 1 : t);
    let a = RAMP_STOPS[0], b = RAMP_STOPS[RAMP_STOPS.length - 1];
    for (let i = 0; i < RAMP_STOPS.length - 1; i++) {
      if (clamped >= RAMP_STOPS[i].t && clamped <= RAMP_STOPS[i + 1].t) {
        a = RAMP_STOPS[i]; b = RAMP_STOPS[i + 1];
        break;
      }
    }
    const span = b.t - a.t || 1;
    const lt = (clamped - a.t) / span;
    outRGB[0] = a.r + (b.r - a.r) * lt;
    outRGB[1] = a.g + (b.g - a.g) * lt;
    outRGB[2] = a.b + (b.b - a.b) * lt;
    return outRGB;
  }

  const R_ISCO_M = 6;    // 3 R_s, R_s = 2M
  const R_OUTER_M = 40;  // 20 R_s

  // AUTHORITATIVE SPIN AXIS. The local DISC_WORLD_TILT_DEG = 20 /
  // TILT_RAD / hand-written DISC_NORMAL_WORLD are GONE. The disc normal is now
  // the same vector the Lense-Thirring physics and the frame-dragging mesh use:
  // SGRA.Domain.Constants.SPIN_AXIS_WORLD. The numerical value is unchanged
  // ([0, -sin20, cos20]), so the frozen disc image is pixel-identical; what
  // changed is that there is now exactly one definition of it. It remains a
  // reference/illustrative orientation, not a measured Sgr A* spin axis --
  // see SPIN_AXIS_PROVENANCE.
  const AXIS_SOURCE = (global.SGRA && global.SGRA.Domain && global.SGRA.Domain.Constants &&
    global.SGRA.Domain.Constants.SPIN_AXIS_WORLD) || [0, 0, 1];
  const AXIS_NORM = Math.hypot(AXIS_SOURCE[0], AXIS_SOURCE[1], AXIS_SOURCE[2]) || 1;
  const DISC_NORMAL_WORLD = [
    AXIS_SOURCE[0] / AXIS_NORM,
    AXIS_SOURCE[1] / AXIS_NORM,
    AXIS_SOURCE[2] / AXIS_NORM
  ];
  const DISC_X_SEED_WORLD = [1, 0, 0];

  // --- presentation (visual-only) scale -------------------------------
  // The stylised disc is allowed a screen-space floor so the strong-field
  // silhouette stays readable at S-star cluster zoom. This is PRESENTATION
  // scale only. It is computed and consumed entirely inside this kernel and
  // the black-hole body sprite; frame.auToPx (physical scene scale) is never
  // modified, and scientific_annotation_pass.js keeps sole ownership of
  // scientific radii on the physical scale. Nothing here can leak into
  // annotations or orbital geometry.
  //
  // The floor is the minimum on-screen extent of the FULL disc image. It is
  // deliberately small: the physical scale must control ordinary zoom, and
  // this is only a last-resort visibility safeguard at extreme distance.
  const PRESENTATION_EXTENT_MIN_PX = 24;
  const PRESENTATION_EXTENT_SOFTNESS_PX = 1.5;

  function computePresentationExtent(physicalMPerPx, viewport, bMax) {
    const minDim = viewport ? Math.min(viewport.W || 0, viewport.H || 0) : 0;
    const floorExtent = minDim > 0
      ? Math.min(PRESENTATION_EXTENT_MIN_PX, minDim * 0.34)
      : PRESENTATION_EXTENT_MIN_PX;
    const physicalExtent = 2 * bMax * Math.max(0, physicalMPerPx);
    const softness = Math.min(PRESENTATION_EXTENT_SOFTNESS_PX, floorExtent * 0.25);
    return 0.5 * (physicalExtent + floorExtent +
      Math.hypot(physicalExtent - floorExtent, softness));
  }

  // --- buffer sizing ---------------------------------------------------
  // The rasterised image is scale-invariant: it is computed in units of M
  // over a fixed [-B_IMAGE_MAX, +B_IMAGE_MAX] window, so ZOOM NEVER FORCES
  // A REBUILD — the cached buffer is simply drawn at a different size. Only
  // inclination (quantised) and the resolution tier can invalidate it.
  const BUFFER_TIERS = [128, 192, 256, 320];
  const BUFFER_TIER_MOBILE_CAP = 192;   // ~29k solved pixels; safe on phones
  const MOBILE_MIN_DIM_PX = 700;        // below this treat as phone-class
  const INCLINATION_QUANTUM_RAD = 0.9 * Math.PI / 180;
  // While the camera is actually orbiting, rebuild at the cheap tier (~6 ms)
  // and only upgrade to the full tier once the inclination has been stable
  // for a couple of frames. This keeps interaction smooth without ever
  // shipping a permanently low-resolution image.
  const INTERACTIVE_TIER_PX = 128;
  const SETTLE_FRAMES = 2;

  const MIN_ABS_COS_I = 1e-3;   // avoid the exactly-edge-on Theta_0 degeneracy
  const MAX_ABS_COS_I = 0.99999;

  function camRot(x, y, z, cy, sy, cp, sp) {
    const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
    return [x1, y1 * cp - z * sp, y1 * sp + z * cp];
  }
  function camIrot(x, y, z, cy, sy, cp, sp) {
    const y1 = y * cp + z * sp;
    return [x * cy + y1 * sy, -x * sy + y1 * cy, -y * sp + z * cp];
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  // Derive the observer frame from the ACTUAL camera yaw/pitch against the
  // world-fixed disc normal. Returns everything the rasteriser needs:
  //   iEff  angle between the disc normal and the observer direction
  //   roll  on-screen angle of the buffer's +x axis (e1), applied once at
  //         composite time so roll changes never touch buffer contents
  //   projection constants mapping (Theta, psi) to WORLD-FIXED disc azimuth,
  //         so the surface texture is glued to the disc, not to the camera.
  function effectiveViewFromCamera(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Camera-space +Z points FROM the scene TOWARD the camera (projectBH uses
    // ze = dist - pz, i.e. the camera looks along -Z_cam). Its world image is
    // therefore already the observer direction seen from the hole, and must
    // NOT be negated: negating it put the observer on the far face of the
    // disc, flipping cosI and making (e1, e2, o) read left-handed on screen.
    const fwd = camIrot(0, 0, 1, cy, sy, cp, sp);
    const o = norm3([fwd[0], fwd[1], fwd[2]]);
    const n = DISC_NORMAL_WORLD;

    let cosI = dot3(o, n);
    if (cosI > MAX_ABS_COS_I) cosI = MAX_ABS_COS_I;
    if (cosI < -MAX_ABS_COS_I) cosI = -MAX_ABS_COS_I;
    if (Math.abs(cosI) < MIN_ABS_COS_I) cosI = cosI < 0 ? -MIN_ABS_COS_I : MIN_ABS_COS_I;
    const sinI = Math.sqrt(Math.max(0, 1 - cosI * cosI));

    // e2 = projected disc normal (screen up); e1 = e2 x o (screen right).
    // (e1, e2, o) is right-handed, which is what fixes the sign of the
    // Doppler term below.
    const e2 = norm3([n[0] - cosI * o[0], n[1] - cosI * o[1], n[2] - cosI * o[2]]);
    const e1 = cross3(e2, o);

    const camE1 = camRot(e1[0], e1[1], e1[2], cy, sy, cp, sp);
    const roll = Math.atan2(camE1[1], camE1[0]);

    // World-fixed in-plane axes for the disc azimuth (texture anchor).
    const seedDot = dot3(DISC_X_SEED_WORLD, n);
    const a1 = norm3([
      DISC_X_SEED_WORLD[0] - seedDot * n[0],
      DISC_X_SEED_WORLD[1] - seedDot * n[1],
      DISC_X_SEED_WORLD[2] - seedDot * n[2]
    ]);
    const a2 = cross3(n, a1);

    return {
      iEff: Math.acos(cosI),
      roll,
      cosI,
      sinI,
      oa1: dot3(o, a1), e1a1: dot3(e1, a1), e2a1: dot3(e2, a1),
      oa2: dot3(o, a2), e1a2: dot3(e1, a2), e2a2: dot3(e2, a2)
    };
  }

  // ---------------------------------------------------------------------
  // Rasteriser. Pure: writes RGBA into `data` (length 4*size*size). Exported
  // for tests; no canvas, DOM or timing dependency and no per-frame state,
  // so a test can assert the lensing geometry directly on the pixels.
  // ---------------------------------------------------------------------
  const MAX_IMAGE_ORDER = 2;
  const EMISSIVITY_EXP = 2.4;   // stylised: eps ~ (r_isco/r)^2. NOT Novikov-Thorne;
                                // no zero-torque inner-boundary taper, because the
                                // bright ISCO edge is what makes the lensing legible.
  // Close-up surface tuning only: a restrained exposure lift. Geometry,
  // redshift, and the outer footprint remain unchanged.
  const GAIN = 6.5;
  const G4_MIN = 0.02, G4_MAX = 20;
  // Slightly stronger existing modulation, still bounded by the same two
  // radial/spiral components and the same anti-aliasing damping below.
  const TEX_AMP = 0.52;
  const TEX_RING_K = 22;        // radial filament winding, phase per ln r
  const TEX_SPIRAL_R_K = 20;    // sheared spiral winding
  const TEX_SPIRAL_PHI_K = 5;   // MUST be an integer: cos(k*phi) is otherwise
                                // discontinuous across the phi = +-PI branch cut
                                // and leaves a visible seam through the disc.
  const OUTER_FADE_FRAC = 0.12; // soft taper at the outer edge, in r
  const LN_R_ISCO = Math.log(R_ISCO_M);
  const OPACITY_FLOOR = 0.06;   // stylised: opacity tracks brightness so the faint
                                // outer disc stays translucent over the S-star field
                                // instead of masking it as a true optically thick
                                // disc would. Explicitly a presentation choice.

  function rasterizeDiscImage(data, size, view, DiscBending) {
    const B_MAX = DiscBending.B_IMAGE_MAX_M;
    const B_CRIT = DiscBending.B_CRIT_M;
    const pxPerM = size / (2 * B_MAX);
    const mPerPx = 1 / pxPerM;
    const half = size / 2;

    const cosI = view.cosI, sinI = view.sinI;
    const oa1 = view.oa1, e1a1 = view.e1a1, e2a1 = view.e2a1;
    const oa2 = view.oa2, e1a2 = view.e1a2, e2a2 = view.e2a2;
    const sgnCosI = cosI < 0 ? -1 : 1;
    const absCosI = Math.abs(cosI);

    // Damp surface texture once its phase gradient approaches one radian per
    // buffer pixel, otherwise coarse tiers alias into shimmering moire.
    const gradAtIsco = (Math.max(TEX_RING_K, TEX_SPIRAL_R_K) / R_ISCO_M) * mPerPx;
    const texAmp = TEX_AMP * Math.max(0.25, Math.min(1, 1.4 - 0.9 * gradAtIsco));

    const ray = { u: 0, dudTheta: 0, captured: false };
    const rgb = [0, 0, 0];
    const rOuterFadeStart = R_OUTER_M * (1 - OUTER_FADE_FRAC);

    data.fill(0);

    const bMaxSq = B_MAX * B_MAX;
    for (let py = 0; py < size; py++) {
      const Y = -((py + 0.5) - half) * mPerPx; // buffer +y is down; e2 is up
      const YY = Y * Y;
      for (let px = 0; px < size; px++) {
        const X = ((px + 0.5) - half) * mPerPx;
        const bSq = X * X + YY;
        if (bSq > bMaxSq) continue;
        const b = Math.sqrt(bSq);

        // Antialiased capture disc: opaque black inside b_crit, unless a
        // foreground disc crossing paints over it below.
        let accA = Math.max(0, Math.min(1, (B_CRIT - b) * pxPerM + 0.5));
        let accR = 0, accG = 0, accB = 0; // premultiplied

        if (b > 1e-6) {
          const cosPsi = X / b, sinPsi = Y / b;
          // Closed-form first equatorial crossing.
          const c0 = -sinPsi * sinI * sgnCosI;
          const s0 = absCosI;
          const L = Math.sqrt(c0 * c0 + s0 * s0) || 1;
          const cosT0 = c0 / L, sinT0 = s0 / L;
          const theta0 = Math.atan2(sinT0, cosT0);
          // theta_hat . v = sinI*cosPsi is independent of Theta and of image
          // order (because r_hat x theta_hat = o x s is constant along the
          // ray), so the Doppler geometry factor is a per-pixel constant.
          const tHatDotV = sinI * cosPsi;

          // Reject unreachable image orders with one compare. For all but a
          // narrow annulus just outside b_crit the ray has already escaped
          // before Theta_0 + PI, so most pixels cost exactly one table probe.
          const thetaLimit = DiscBending.rayThetaLimit(b);
          let nMax = MAX_IMAGE_ORDER;
          while (nMax > 0 && theta0 + nMax * Math.PI > thetaLimit) nMax--;

          for (let n = nMax; n >= 0; n--) {
            const theta = theta0 + n * Math.PI;
            DiscBending.sampleRayInto(b, theta, ray);
            if (ray.captured || !(ray.u > 0)) continue;
            const r = 1 / ray.u;
            if (r < R_ISCO_M || r > R_OUTER_M) continue;

            const par = (n & 1) ? -1 : 1;
            const cosT = cosT0 * par, sinT = sinT0 * par;

            // World-fixed disc azimuth of the emission point.
            const sA1 = cosPsi * e1a1 + sinPsi * e2a1;
            const sA2 = cosPsi * e1a2 + sinPsi * e2a2;
            const rA1 = cosT * oa1 + sinT * sA1;
            const rA2 = cosT * oa2 + sinT * sA2;
            const phi = Math.atan2(rA2, rA1);

            // Redshift factor g = E_obs / E_emit for a circular Keplerian
            // orbit in Schwarzschild:
            //   g = sqrt(1 - 2/r) / (gamma (1 - v cos(xi)))
            // with v = sqrt(1/(r-2)) the speed measured by the local static
            // observer (0.5c at the ISCO) and cos(xi) the angle between the
            // emitted photon and the orbital velocity in that frame. The
            // photon direction splits into radial -dr/dTheta (stretched by
            // 1/sqrt(1-2/r)) and tangential -r; only the tangential part has
            // a projection on the velocity.
            const f = 1 - 2 / r;
            const drdT = -ray.dudTheta / (ray.u * ray.u);
            const kNorm = Math.sqrt((drdT * drdT) / f + r * r) || 1;
            const cosXi = (-r * tHatDotV) / kNorm;
            const v = Math.sqrt(1 / (r - 2));
            const gamma = 1 / Math.sqrt(Math.max(1e-6, 1 - v * v));
            let g = Math.sqrt(f) / (gamma * Math.max(0.05, 1 - v * cosXi));
            if (!(g > 0) || !Number.isFinite(g)) g = 1;

            let g4 = g * g * g * g;
            if (g4 < G4_MIN) g4 = G4_MIN;
            if (g4 > G4_MAX) g4 = G4_MAX;

            const lr = Math.log(r);
            const tex = 1 + texAmp * (
              0.52 * Math.cos(TEX_RING_K * lr) +
              0.48 * Math.cos(TEX_SPIRAL_PHI_K * phi + TEX_SPIRAL_R_K * lr)
            );

            // eps = (r_isco/r)^EMISSIVITY_EXP, via the ln r already in hand.
            const eps = Math.exp(EMISSIVITY_EXP * (LN_R_ISCO - lr));
            let I = GAIN * eps * g4 * (tex > 0.1 ? tex : 0.1);
            let outerAlphaScale = 1;
            if (r > rOuterFadeStart) {
              outerAlphaScale = (R_OUTER_M - r) / (R_OUTER_M - rOuterFadeStart);
              if (outerAlphaScale < 0) outerAlphaScale = 0;
              I *= outerAlphaScale;
            }
            if (!(I > 0)) continue;

            // Compressive tone map. Separating BRIGHTNESS from OPACITY is what
            // keeps a ~500:1 emitted dynamic range legible on an 8-bit canvas
            // without turning the centre into a saturated blob.
            const x = I / (1 + I);
            const sx = Math.sqrt(x);
            // A small midtone compression keeps bright lanes distinct from
            // intervening texture without adding any external glow.
            const bright = Math.pow(x, 0.78);
            const alpha = Math.min(1, OPACITY_FLOOR + 1.05 * bright) * outerAlphaScale;
            if (alpha <= 0.004) continue;

            const tRad = Math.sqrt((r - R_ISCO_M) / (R_OUTER_M - R_ISCO_M));
            // Colour temperature rides on g: g>1 pushes toward the hot end of
            // the same blackbody ramp. Linear in g, bounded, no false-colour
            // palette and no separate blue channel hack.
            let tShift = 1 - (1 - tRad) * (1 + 0.75 * (g - 1));
            if (tShift < 0) tShift = 0; else if (tShift > 1) tShift = 1;
            sampleRamp(tShift, rgb);
            // Hue-normalised: the ramp supplies hue, `bright` supplies value.
            // Without this the ramp's own falloff multiplies the tone map and
            // the outer disc disappears entirely.
            let mx = rgb[0];
            if (rgb[1] > mx) mx = rgb[1];
            if (rgb[2] > mx) mx = rgb[2];
            const hs = mx > 1 ? (255 / mx) * bright : bright;

            const sat = I > 4 ? Math.min(1, (I - 4) / 9) : 0;
            const wr = Math.min(255, rgb[0] * hs + (255 - rgb[0] * hs) * sat * 0.9);
            const wg = Math.min(255, rgb[1] * hs + (250 - rgb[1] * hs) * sat * 0.9);
            const wb = Math.min(255, rgb[2] * hs + (235 - rgb[2] * hs) * sat * 0.9);

            // source-over of this order on top of everything behind it.
            accR = wr * alpha + accR * (1 - alpha);
            accG = wg * alpha + accG * (1 - alpha);
            accB = wb * alpha + accB * (1 - alpha);
            accA = alpha + accA * (1 - alpha);
          }
        }

        if (accA <= 0.002) continue;
        const idx = (py * size + px) * 4;
        const inv = 1 / accA;
        data[idx] = Math.max(0, Math.min(255, Math.round(accR * inv)));
        data[idx + 1] = Math.max(0, Math.min(255, Math.round(accG * inv)));
        data[idx + 2] = Math.max(0, Math.min(255, Math.round(accB * inv)));
        data[idx + 3] = Math.max(0, Math.min(255, Math.round(accA * 255)));
      }
    }
  }

  function chooseBufferTier(extentPx, dpr, minViewportDim) {
    const mobile = minViewportDim > 0 && minViewportDim < MOBILE_MIN_DIM_PX;
    // Supersample only where it is actually visible: a DPR-2 phone still
    // caps at the mobile tier so the solved-pixel count never explodes.
    const want = extentPx * Math.max(1, Math.min(2, dpr || 1));
    const cap = mobile ? BUFFER_TIER_MOBILE_CAP : BUFFER_TIERS[BUFFER_TIERS.length - 1];
    let chosen = BUFFER_TIERS[0];
    for (let i = 0; i < BUFFER_TIERS.length; i++) {
      if (BUFFER_TIERS[i] <= cap && BUFFER_TIERS[i] <= want) chosen = BUFFER_TIERS[i];
    }
    return Math.max(BUFFER_TIERS[0], Math.min(cap, chosen));
  }

  // Rebuild at a quantised inclination while keeping the true world-fixed
  // azimuth basis, so texture stays glued to the disc across rebuilds.
  function viewAtQuantisedInclination(view, iQuant) {
    let cosI = Math.cos(iQuant);
    if (cosI > MAX_ABS_COS_I) cosI = MAX_ABS_COS_I;
    if (cosI < -MAX_ABS_COS_I) cosI = -MAX_ABS_COS_I;
    if (Math.abs(cosI) < MIN_ABS_COS_I) cosI = cosI < 0 ? -MIN_ABS_COS_I : MIN_ABS_COS_I;
    return {
      cosI,
      sinI: Math.sqrt(Math.max(0, 1 - cosI * cosI)),
      oa1: view.oa1, e1a1: view.e1a1, e2a1: view.e2a1,
      oa2: view.oa2, e1a2: view.e1a2, e2a2: view.e2a2
    };
  }

  function createDiscRasterKernel(deps) {
    const { DiscBending } = deps;
    const B_MAX = DiscBending.B_IMAGE_MAX_M;

    let offCanvas = null, offCtx = null, imgData = null, bufSize = 0;
    let bloomCanvas = null, bloomCtx = null, bloomSize = 0;
    let cacheKeyIncl = null, cacheKeyTier = 0, cacheValid = false;
    let lastSeenIncl = null, settleFrames = 0;
    const diagnostics = { rasterRebuilds: 0, lastRebuildMs: 0, bufferSize: 0, settled: false };

    function makeCanvas(size) {
      const c = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(size, size)
        : document.createElement('canvas');
      c.width = size; c.height = size;
      return c;
    }

    function ensureBuffers(size) {
      if (offCanvas && bufSize === size) return;
      bufSize = size;
      offCanvas = makeCanvas(size);
      offCtx = offCanvas.getContext('2d');
      imgData = offCtx.createImageData(size, size);
      bloomSize = Math.max(16, Math.round(size / 4));
      bloomCanvas = makeCanvas(bloomSize);
      bloomCtx = bloomCanvas.getContext('2d');
      cacheValid = false;
    }

    function rebuild(size, qView) {
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
      rasterizeDiscImage(imgData.data, size, qView, DiscBending);
      offCtx.putImageData(imgData, 0, 0);
      // Cheap bloom: one downsample, composited upscaled. Built only when the
      // raster is rebuilt, never per frame, and allocating nothing.
      bloomCtx.clearRect(0, 0, bloomSize, bloomSize);
      bloomCtx.imageSmoothingEnabled = true;
      bloomCtx.drawImage(offCanvas, 0, 0, bloomSize, bloomSize);
      diagnostics.rasterRebuilds++;
      diagnostics.bufferSize = size;
      if (t0) diagnostics.lastRebuildMs = performance.now() - t0;
    }

    // Presentation scale: preserve physical zoom until the disc becomes too
    // small to read, then approach a small minimum continuously. The raster
    // itself remains scale-invariant; only its final composite size changes.
    function presentationScale(physicalMPerPx, viewport) {
      return computePresentationExtent(physicalMPerPx, viewport, B_MAX) / (2 * B_MAX);
    }

    // render: draws the strong-field image centred at (screenX, screenY).
    // `physicalMPerPx` is the true scene scale (auToPx(RS())/2). Returns the
    // presentation geometry so the body pass can match its black core and
    // suppress its own generic glow, or null if nothing was drawn.
    function render(ctx, screenX, screenY, physicalMPerPx, yaw, pitch, viewport) {
      const view = effectiveViewFromCamera(yaw, pitch);
      const mPerPx = presentationScale(physicalMPerPx, viewport);
      const extentPx = 2 * B_MAX * mPerPx;
      if (!(extentPx > 12)) return null;

      const minDim = viewport ? Math.min(viewport.W || 0, viewport.H || 0) : 0;
      const desiredTier = chooseBufferTier(extentPx, viewport ? viewport.DPR : 1, minDim);

      const qIncl = Math.round(view.iEff / INCLINATION_QUANTUM_RAD);
      if (qIncl !== lastSeenIncl) { lastSeenIncl = qIncl; settleFrames = 0; }
      else if (settleFrames < SETTLE_FRAMES) settleFrames++;
      const settled = settleFrames >= SETTLE_FRAMES;
      const tier = settled ? desiredTier : Math.min(desiredTier, INTERACTIVE_TIER_PX);
      diagnostics.settled = settled;
      ensureBuffers(tier);

      if (!cacheValid || cacheKeyIncl !== qIncl || cacheKeyTier !== tier) {
        rebuild(tier, viewAtQuantisedInclination(view, qIncl * INCLINATION_QUANTUM_RAD));
        cacheKeyIncl = qIncl;
        cacheKeyTier = tier;
        cacheValid = true;
      }

      const half = extentPx / 2;
      const bloomHalf = half * 1.06;
      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(-view.roll);
      // Bloom first, additively, so the opaque shadow painted by the raster
      // below covers it: the black centre stays crisp and the glow only ever
      // spills OUTSIDE the silhouette.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30;
      ctx.drawImage(bloomCanvas, -bloomHalf, -bloomHalf, extentPx * 1.06, extentPx * 1.06);
      ctx.globalAlpha = 1;
      // The emitting surface itself is source-over: a solid surface, not a
      // wash. Additive is reserved for the bloom above.
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(offCanvas, -half, -half, extentPx, extentPx);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';

      return {
        mPerPx,
        extentPx,
        bCritPx: DiscBending.B_CRIT_M * mPerPx,
        iEff: view.iEff,
        roll: view.roll
      };
    }

    function getDiagnostics() { return diagnostics; }

    return Object.freeze({ render, effectiveViewFromCamera, getDiagnostics });
  }

  SGRA.Render.DiscRasterKernel = Object.freeze({
    createDiscRasterKernel,
    effectiveViewFromCamera,
    viewAtQuantisedInclination,
    rasterizeDiscImage,
    chooseBufferTier,
    computePresentationExtent,
    R_ISCO_M,
    R_OUTER_M,
    // Exposed (instead of the retired DISC_WORLD_TILT_DEG scalar) so the
    // authoritative-state gate can assert the disc, mesh and physics share
    // one axis. Read-only copy; the authority is Constants.SPIN_AXIS_WORLD.
    DISC_NORMAL_WORLD: Object.freeze([...DISC_NORMAL_WORLD])
  });
})(typeof window !== 'undefined' ? window : globalThis);
