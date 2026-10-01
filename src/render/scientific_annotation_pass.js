// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachScientificAnnotationPass(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Render = SGRA.Render || {};

  // SGRA-SPEC-001 B-2.3 / B-2.4.
  //
  // This pass is the SOLE owner of the scientific radius annotations:
  //   * PN validity boundaries  (100 R_s, 20 R_s)
  //   * equatorial ISCO reference branches (spin-aware)
  //   * capture radius          (R_CAP_FAC R_s)
  //   * Schwarzschild radius    (R_s)
  //
  // No other pass may draw these. `black_hole_environment_pass.js` was reduced
  // to the glow backdrop and `body_scene_pass.js` had its duplicate R_s and
  // R_cap rings removed as part of this block (D-2).
  //
  // Radii, in units of RS(), of the post-Newtonian validity boundary rings.
  const PN_VALIDITY_RS_FACTORS = Object.freeze([100, 20]);

  // Hoisted so the per-frame marker build performs no string concatenation.
  const PN_VALIDITY_IDS = Object.freeze(['pnValidity100', 'pnValidity20']);

  // Minimum on-screen radius (px) before a ring is drawn / labelled at all.
  // Both thresholds are carried over unchanged from the previous
  // black_hole_environment_pass ring block so the annotation family keeps its
  // existing appearance/disappearance behaviour under zoom.
  const MIN_RING_PX = 8;
  const MIN_LABEL_PX = 20;

  // Minimum on-screen radial separation (px) between two markers before the
  // label on the inner one is suppressed (ring kept, text dropped). Added
  // per SGRA-ADL-STYLISED-DISC-SPEC.md v2 §9: going from 5 rings to 6 puts
  // shadow (2.6 R_s), ISCO (3 R_s) and R_cap (4 R_s) close together.
  const MIN_LABEL_SEPARATION_PX = 6;

  // Hoisted so the draw loop allocates no dash arrays per ring per frame.
  const RING_DASH = [3, 6];
  const NO_DASH = [];

  function createScientificAnnotationPass() {
    // Preallocated marker records. The render path must not allocate.
    // Slots: 2 PN validity rings + ISCO + capture + R_s + optical shadow.
    const markers = [];
    for (let i = 0; i < 7; i++) {
      markers.push({ id: '', kind: '', rsFactor: 0, radiusAu: 0, radiusPx: 0, label: '', colour: '', drawn: false, labelSuppressed: false, sourceAuthority: '', validity: '' });
    }
    let activeMarkerCount = 0;

    // The PN validity labels are the only text that varies with the model. The
    // string concatenation is memoised on the formatted percentage so a steady
    // camera/mass produces zero label allocation per frame.
    // Memoised on the raw numeric percentage, not on its formatted form:
    // Number.prototype.toFixed itself allocates a string, so keying on the
    // formatted value would still allocate once per marker per frame.
    const pnLabelCache = ['', ''];
    const pnLabelKey = [NaN, NaN];

    function pnLabel(slot, pct) {
      if (pnLabelKey[slot] !== pct) {
        pnLabelKey[slot] = pct;
        pnLabelCache[slot] = 'PN ' + pct.toFixed(2) + '%';
      }
      return pnLabelCache[slot];
    }

    function buildMarkers(frame) {
      const physics = frame.physics;
      const rs = physics.RS();
      const capFactor = frame.constants && Number.isFinite(frame.constants.R_CAP_FAC)
        ? frame.constants.R_CAP_FAC
        : 0;
      let n = 0;

      for (let i = 0; i < PN_VALIDITY_RS_FACTORS.length; i++) {
        const f = PN_VALIDITY_RS_FACTORS[i];
        const m = markers[n++];
        m.id = PN_VALIDITY_IDS[i];
        m.kind = 'pn-validity-boundary';
        m.sourceAuthority = 'OrbitalMath.relWeight';
        m.validity = 'regime-guidance';
        m.rsFactor = f;
        m.radiusAu = f * rs;
        m.label = pnLabel(i, physics.pnFractionPct(m.radiusAu));
        m.colour = i === 0 ? 'rgba(80,160,255,.4)' : 'rgba(80,200,255,.55)';
      }

      const shadowFactor = frame.constants && Number.isFinite(frame.constants.SHADOW_B_CRIT_RS_FAC)
        ? frame.constants.SHADOW_B_CRIT_RS_FAC
        : 3 * Math.sqrt(3) / 2;

      const shadow = markers[n++];
      shadow.id = 'opticalShadow';
      shadow.kind = 'optical-shadow';
      shadow.sourceAuthority = 'Schwarzschild critical-impact reference';
      shadow.validity = 'Schwarzschild only; not generic Kerr shadow';
      shadow.rsFactor = shadowFactor;
      shadow.radiusAu = shadowFactor * rs;
      shadow.label = 'Schwarzschild shadow reference';
      // Plain white/grey to read as "boundary" rather than "measurement" —
      // not orange (collides with R_cap's --accent), not part of the weight
      // ramp (it isn't a weight).
      shadow.colour = 'rgba(200,205,215,.65)';

      const spin = Number.isFinite(physics.spinMagnitude) ? Math.abs(physics.spinMagnitude) : 0;
      const isco = SGRA.Physics.Kerr?.ISCO;
      if (!isco || typeof isco.radii !== 'function') throw new Error('Kerr ISCO scientific authority is unavailable');
      const branches = isco.radii(spin);
      const iscoBranches = spin === 0
        ? [{ id: 'isco', label: 'ISCO', m: branches.progradeM, validity: 'Schwarzschild; equatorial branches coincide' }]
        : [
          { id: 'isco-prograde-equatorial', label: 'prograde equatorial ISCO reference', m: branches.progradeM, validity: 'equatorial reference branch' },
          { id: 'isco-retrograde-equatorial', label: 'retrograde equatorial ISCO reference', m: branches.retrogradeM, validity: 'equatorial reference branch' }
        ];
      for (const branch of iscoBranches) {
        const marker = markers[n++];
        marker.id = branch.id;
        marker.kind = 'isco';
        marker.sourceAuthority = 'SGRA.Physics.Kerr.ISCO.radii';
        marker.validity = branch.validity;
        marker.rsFactor = branch.m / 2;
        marker.radiusAu = branch.m * rs / 2;
        marker.label = branch.label;
        marker.colour = 'rgba(120,230,255,.75)';
      }

      const cap = markers[n++];
      cap.id = 'captureRadius';
      cap.kind = 'capture-radius';
      cap.sourceAuthority = 'R_CAP_FAC * Rs production termination model';
      cap.validity = 'model termination boundary';
      cap.rsFactor = capFactor;
      cap.radiusAu = capFactor * rs;
      cap.label = 'R_cap';
      cap.colour = 'rgba(255,120,50,.5)';

      const horizon = markers[n++];
      horizon.id = 'schwarzschildRadius';
      horizon.kind = 'schwarzschild-radius';
      horizon.sourceAuthority = 'physics.RS';
      horizon.validity = 'definition';
      horizon.rsFactor = 1;
      horizon.radiusAu = rs;
      horizon.label = 'Rₛ';
      horizon.colour = 'rgba(210,245,255,.9)';

      for (let i = 0; i < n; i++) {
        markers[i].radiusPx = frame.auToPx(markers[i].radiusAu);
        markers[i].drawn = false;
        markers[i].labelSuppressed = false;
      }
      activeMarkerCount = n;
      applyDeclutter(markers, activeMarkerCount);
      return markers;
    }

    // Suppress the label (keep the ring, drop the text) on the inner marker
    // of any adjacent-by-radius pair whose radiusPx differ by less than
    // MIN_LABEL_SEPARATION_PX. Simple loop over the sorted marker list, no
    // new architecture. Reuses labelOrderScratch to avoid a per-frame sort
    // allocation.
    const labelOrderScratch = [];
    function applyDeclutter(list, count) {
      labelOrderScratch.length = 0;
      for (let i = 0; i < count; i++) labelOrderScratch.push(i);
      labelOrderScratch.sort((a, b) => list[a].radiusPx - list[b].radiusPx);
      for (let i = 0; i < labelOrderScratch.length - 1; i++) {
        const inner = list[labelOrderScratch[i]];
        const outer = list[labelOrderScratch[i + 1]];
        if (outer.radiusPx - inner.radiusPx < MIN_LABEL_SEPARATION_PX) {
          inner.labelSuppressed = true;
        }
      }
    }

    function render(frame) {
      const ctx = frame.ctx;
      const bhS = frame.blackHoleScreen;
      // B-3B: this family is now gated on its own DisplayOptions key, not
      // showGlow. Resolves B2-OPEN-1 / PO-B2-3. showGlow continues to gate the
      // backdrop pass only (black_hole_environment_pass.js).
      if (!frame.display.showScientificAnnotations || !bhS) return;

      const list = buildMarkers(frame);
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = '8.5px IBM Plex Mono';
      for (let i = 0; i < activeMarkerCount; i++) {
        const m = list[i];
        const sr = m.radiusPx;
        if (!(sr >= MIN_RING_PX)) continue;
        ctx.strokeStyle = m.colour;
        ctx.lineWidth = 0.8;
        ctx.setLineDash(RING_DASH);
        ctx.beginPath();
        ctx.arc(bhS[0], bhS[1], sr, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash(NO_DASH);
        if (sr > MIN_LABEL_PX && !m.labelSuppressed) {
          ctx.fillStyle = m.colour;
          ctx.fillText(m.label, bhS[0] + sr * 0.707 + 3, bhS[1] - sr * 0.707 + 3);
        }
        m.drawn = true;
      }
    }

    // Test/diagnostic seam: the marker set for a frame, without drawing.
    function describeMarkers(frame) {
      const list = buildMarkers(frame);
      const description = [];
      for (let i = 0; i < activeMarkerCount; i++) {
        const m = list[i];
        description.push({
          id: m.id,
          kind: m.kind,
          rsFactor: m.rsFactor,
          radiusAu: m.radiusAu,
          radiusPx: m.radiusPx,
          label: m.label,
          sourceAuthority: m.sourceAuthority,
          validity: m.validity
        });
      }
      return description;
    }

    return Object.freeze({ render, describeMarkers, MIN_RING_PX, MIN_LABEL_PX });
  }

  SGRA.Render.ScientificAnnotationPass = Object.freeze({
    createScientificAnnotationPass,
    PN_VALIDITY_RS_FACTORS
  });
})(typeof window !== 'undefined' ? window : globalThis);
