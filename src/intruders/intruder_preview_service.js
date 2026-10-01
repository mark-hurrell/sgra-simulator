// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
(function attachIntruderPreviewService(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Intruders = SGRA.Intruders || {};
  const SIM_HORIZON_YR = 300, BUDGET_MS = 5, PATH_SPACING_FRAC = 0.03;
  const ESCAPE_RADIUS_AU = 80000, ESCAPE_MARGIN = 1.05, MAX_SEMI_MAJOR_AU = 1e6;
  // AIM-PERF P2: early-BOUND completion. Ratified by the 30-cell / 16-setting
  // adversarial matrix in SGRA_AIM_PERF_IMPLEMENTATION_DESIGN_FINAL.md Part E:
  // FALSE_BOUND = 0 at every setting tested. N_PERIODS=4 / EPS_SECULAR=1e-4 is
  // the loosest setting that excludes every materially-perturbed cell (two
  // cells with a later massive-bystander encounter fire, and drift 1.3%/6.4%,
  // at the rejected N=3/EPS=1e-3; neither fires here). PERI_MARGIN blocks the
  // criterion for any orbit whose periapsis is close enough to the capture
  // surface that AIM1-07's turning-point exception could apply -- measured:
  // it never fires for such orbits even after 219 radial periods, so those
  // previews get no early-completion speedup and still run to the horizon.
  // These osculating a/e/r_peri are Newtonian diagnostics computed from the
  // instantaneous product-space state, NOT conserved Kerr invariants; their
  // only justification is the empirical matrix, not any claim of exactness.
  const EARLY_BOUND_N_PERIODS = 4, EARLY_BOUND_EPS_SECULAR = 1e-4, EARLY_BOUND_PERI_MARGIN_RCAP = 4;
  const EARLY_BOUND_VISUAL_PERIODS = 5;
  const PROVISIONAL_SLICE_MS = 2;
  // AIM-PERF P0: conservative two-body admissibility. Static, computed once
  // from osculating radial ranges (never from the unratified P3 look-ahead
  // gate); see design Part "TRANCHE P0". Deliberately over-refuses: it exists
  // to guarantee a fast path with no dependency on any experiment, not to be
  // the tightest possible test.
  const TWO_BODY_EPS = 1e-3, EPS2_SS_FALLBACK = 9;
  // AIM1-01: the predictor's step demand is production's per-body demand
  // (LocalTimestepPolicy.ordinaryTimestepComponents / computeRequiredDt):
  //   dt = min(DT_SAFETY_DYN * sqrt(r^3 / G(M+m)), r / (COURANT_DIVISOR * v))
  // clamped to [constants.DT_MIN, DT_MAX]. The previous demand,
  // (r + 1)/(12 (v + 0.1)) with a 5e-4 yr floor, left eccentric passages ~35x
  // under-resolved: a straight chord could cut the capture sphere while the true
  // orbit stayed outside it (false CAPTURED), and leapfrog error manufactured
  // energy (measured E -5.66e4 -> +8.4e4 in one passage; false ESCAPES for
  // bound orbits) while production, from the identical initial state,
  // conserves energy to ~2e-4. Only the far-field ceiling differs: DT_MAX 0.05
  // (production 0.002) keeps a 300 yr preview affordable; near the hole the
  // dynamical-time term is far below either ceiling, so resolution matches.
  const DT_MAX = 0.05, COURANT_DIVISOR = 10, DT_SAFETY_DYN_FALLBACK = 0.002, DT_MIN_FALLBACK = 5e-6;
  const COL_PENDING = 'rgba(255,200,100,1)', COL_INVALID = 'rgba(255,80,80,1)';
  const COL_CAPTURED = 'rgba(255,100,50,1)', COL_ESCAPE = 'rgba(100,200,255,1)', COL_ORBIT = 'rgba(100,255,150,1)';
  function createPreviewService(deps) {
    const { cloneInBHFrame, accelClone, stepClone, schwarzschildRadius, now, constants, captureSurface } = deps;
    const { G, LAUNCH_SCALE, R_CAP_FAC } = constants;
    const DT_MIN = Number.isFinite(constants.DT_MIN) && constants.DT_MIN > 0 ? constants.DT_MIN : DT_MIN_FALLBACK;
    const DT_SAFETY_DYN = Number.isFinite(constants.DT_SAFETY_DYN) && constants.DT_SAFETY_DYN > 0 ? constants.DT_SAFETY_DYN : DT_SAFETY_DYN_FALLBACK;
    function requiredDt(rr, speed, muTotal) {
      const dynamical = DT_SAFETY_DYN * Math.sqrt(rr * rr * rr / muTotal);
      const courant = speed > 0 ? rr / (COURANT_DIVISOR * speed) : Infinity;
      return Math.min(DT_MAX, Math.max(DT_MIN, Math.min(dynamical, courant)));
    }
    if (!captureSurface || typeof captureSurface.chordCrossing !== 'function') throw new Error('PreviewService requires deps.captureSurface (CaptureSurface.chordCrossing) to share the production capture authority');

    // AIM-PERF P0: static two-body admissibility, computed once from
    // osculating radial ranges. NOT the P3 look-ahead gate (unratified,
    // trajectory-dependent); this is a conservative geometric bound with no
    // experimental dependency of its own. If the target's and a bystander's
    // radial ranges overlap at all, gap=0 and the bound is large, so the
    // configuration is refused. See design Part "TRANCHE P0".
    function osculate(rx, ry, rz, vx2, vy2, vz2, mu) {
      const r = Math.hypot(rx, ry, rz), v2 = vx2 * vx2 + vy2 * vy2 + vz2 * vz2;
      const a = 1 / (2 / r - v2 / mu);
      const hx = ry * vz2 - rz * vy2, hy = rz * vx2 - rx * vz2, hz = rx * vy2 - ry * vx2;
      const h2 = hx * hx + hy * hy + hz * hz;
      const e2 = a > 0 ? Math.max(0, 1 - h2 / (mu * a)) : 1;
      const e = Math.sqrt(e2);
      return { a, e, rp: a > 0 ? a * (1 - e) : r, ra: a > 0 ? a * (1 + e) : r };
    }
    function twoBodyAdmissible(cl, ti) {
      const bh = cl[0], mu = G * bh.m;
      const t = cl[ti];
      const ot = osculate(t.x - bh.x, t.y - bh.y, t.z - bh.z, t.vx - bh.vx, t.vy - bh.vy, t.vz - bh.vz, mu);
      if (!(ot.a > 0) || !Number.isFinite(ot.rp) || !Number.isFinite(ot.ra)) return { admissible: false, worstRho: Infinity };
      const softLen = Number.isFinite(constants.EPS2_SS) && constants.EPS2_SS > 0 ? Math.sqrt(constants.EPS2_SS) : Math.sqrt(EPS2_SS_FALLBACK);
      let worstRho = 0;
      for (let i = 1; i < cl.length; i++) {
        if (i === ti) continue;
        const b = cl[i];
        if (!(b.m > 0)) continue;
        const ob = osculate(b.x - bh.x, b.y - bh.y, b.z - bh.z, b.vx - bh.vx, b.vy - bh.vy, b.vz - bh.vz, mu);
        const gap = Math.max(0, Math.max(ot.rp, ob.rp) - Math.min(ot.ra, ob.ra));
        const dMinPossible = Math.max(gap, softLen);
        const rhoMaxPossible = (b.m / bh.m) * (ot.ra / dMinPossible) ** 2;
        if (rhoMaxPossible > worstRho) worstRho = rhoMaxPossible;
      }
      return { admissible: worstRho < TWO_BODY_EPS, worstRho };
    }

    function createPreviewJob(p0Rel, p1Rel, mass, options) {
      const requestedMode = options && options.previewMode === 'twoBody' ? 'twoBody' : 'auto';
      const vx = (p1Rel[0] - p0Rel[0]) * LAUNCH_SCALE, vy = (p1Rel[1] - p0Rel[1]) * LAUNCH_SCALE, vz = (p1Rel[2] - p0Rel[2]) * LAUNCH_SCALE;
      const spd = Math.hypot(vx, vy, vz), intr = { x: p1Rel[0], y: p1Rel[1], z: p1Rel[2], vx, vy, vz, m: mass, bh: false, aPN: 0, aLT: 0 };
      // Field tracers interact only with the BH and never back-react
      // (BodyRoles.pairInteractionCode), so they cannot influence the
      // intruder: excluding them from the preview clone is exact for the
      // predicted trajectory and removes their O(n^2) cost per step.
      let cl = cloneInBHFrame(intr).filter(body => !body.field), ti = cl.length - 1, rcap = R_CAP_FAC * schwarzschildRadius(), r0 = Math.hypot(cl[ti].x, cl[ti].y, cl[ti].z);
      if (r0 <= rcap) { const result = { pts: [], outcome: '→ INVALID · launch point is inside the capture surface', outcomeCol: COL_INVALID, spd, truncated: false, captured: false, minR: r0, invalid: true, complete: true }; return { resume: () => result, isComplete: () => true }; }

      // AIM-PERF P0: decide the clone membership ONCE, before any stepping.
      // 'auto' silently narrows to two bodies only when the static bound
      // proves it is safe; a request for 'twoBody' against an inadmissible
      // scene is honoured but permanently labelled as an approximation and
      // never allowed to report a final verdict (design: "never present a
      // two-body result as a scene prediction").
      const admissibility = twoBodyAdmissible(cl, ti);
      let approximate = false;
      if (requestedMode === 'twoBody') {
        approximate = !admissibility.admissible;
        cl = [cl[0], cl[ti]]; ti = 1;
      } else if (admissibility.admissible) {
        cl = [cl[0], cl[ti]]; ti = 1;
      }
      // AIM-PERF P1: role tagging. Inert until Tranche P3's significance gate
      // (unratified; NOT implemented here) reads it -- a clone whose bodies
      // carry only this tag behaves exactly as before. otherMassiveBodyCount
      // is what P2 below uses to decide the final-vs-provisional split.
      cl[ti].__previewRole = 'TARGET';
      for (let i = 0; i < cl.length; i++) if (i !== 0 && i !== ti) cl[i].__previewRole = 'BACKGROUND';
      const otherMassiveBodyCount = cl.length - 2;

      accelClone(cl);
      let outcome = '...', outcomeCol = COL_PENDING, minR = r0, tSim = 0, stepN = 0, captured = false, complete = false;
      const pts = []; let prevX = cl[ti].x, prevY = cl[ti].y, prevZ = cl[ti].z;

      // AIM-PERF P2: apoapsis-tracked early BOUND completion. See the
      // EARLY_BOUND_* constants above for the ratification evidence.
      let prevR = null, rising = null, eNegAlways = true;
      const apoWindow = []; // ring buffer of the last EARLY_BOUND_N_PERIODS apoapsis samples
      let periodsObserved = 0;
      let verdictReached = false, verdictProvisional = false, verdictPeriodYr = null;

      function sampleApoapsis() {
        const rr = Math.hypot(cl[ti].x - cl[0].x, cl[ti].y - cl[0].y, cl[ti].z - cl[0].z);
        const vv2 = (cl[ti].vx - cl[0].vx) ** 2 + (cl[ti].vy - cl[0].vy) ** 2 + (cl[ti].vz - cl[0].vz) ** 2;
        const mu = G * cl[0].m, energy = 0.5 * vv2 - mu / rr;
        if (energy >= 0) eNegAlways = false;
        const wasRising = rising;
        if (prevR !== null) rising = rr > prevR;
        if (wasRising === true && rising === false) {
          periodsObserved++;
          const osc = osculate(cl[ti].x - cl[0].x, cl[ti].y - cl[0].y, cl[ti].z - cl[0].z,
            cl[ti].vx - cl[0].vx, cl[ti].vy - cl[0].vy, cl[ti].vz - cl[0].vz, mu);
          apoWindow.push({ a: osc.a, rp: osc.rp, eNegAlways });
          if (apoWindow.length > EARLY_BOUND_N_PERIODS) apoWindow.shift();
          if (!verdictReached && eNegAlways && apoWindow.length === EARLY_BOUND_N_PERIODS) {
            let okA = true, minA = Infinity, maxA = -Infinity, minRp = Infinity, maxRp = -Infinity;
            for (const s of apoWindow) {
              if (!(s.a > 0) || !(s.a < MAX_SEMI_MAJOR_AU) || !s.eNegAlways) { okA = false; break; }
              if (s.a < minA) minA = s.a; if (s.a > maxA) maxA = s.a;
              if (s.rp < minRp) minRp = s.rp; if (s.rp > maxRp) maxRp = s.rp;
            }
            if (okA) {
              const spreadA = (maxA - minA) / minA, spreadRp = (maxRp - minRp) / minRp;
              if (spreadA <= EARLY_BOUND_EPS_SECULAR && spreadRp <= EARLY_BOUND_EPS_SECULAR && minRp > EARLY_BOUND_PERI_MARGIN_RCAP * rcap) {
                verdictReached = true;
                verdictProvisional = otherMassiveBodyCount > 0;
                verdictPeriodYr = 2 * Math.PI * Math.sqrt(osc.a ** 3 / mu);
                outcome = `→ ${verdictProvisional ? 'BOUND SO FAR' : 'LIKELY BOUND'} · P≈${verdictPeriodYr.toFixed(1)} yr  min r=${minR.toFixed(0)} AU` +
                  (verdictProvisional ? `  (stable over ${EARLY_BOUND_N_PERIODS} orbits, provisional)` : '');
                outcomeCol = COL_ORBIT;
              }
            }
          }
        }
        prevR = rr;
      }

      function classifyFinal() {
        if (outcome !== '...' && !verdictProvisional) return;
        if (tSim < SIM_HORIZON_YR) return;
        const rr = Math.hypot(cl[ti].x, cl[ti].y, cl[ti].z), vv = Math.hypot(cl[ti].vx, cl[ti].vy, cl[ti].vz), mu = G * cl[0].m, energy = 0.5 * vv * vv - mu / rr;
        if (energy < 0) { const a = 1 / (2 / rr - vv * vv / mu); if (a > 0 && a < MAX_SEMI_MAJOR_AU) { const period = 2 * Math.PI * Math.sqrt(a ** 3 / mu); outcome = `→ LIKELY BOUND · P≈${period.toFixed(1)} yr  min r=${minR.toFixed(0)} AU`; outcomeCol = COL_ORBIT; } else { outcome = '→ ESCAPING'; outcomeCol = COL_ESCAPE; } } else { outcome = '→ ESCAPING'; outcomeCol = COL_ESCAPE; }
        complete = true; verdictProvisional = false;
      }

      function view() {
        classifyFinal();
        return {
          pts: pts.slice(), outcome: complete || verdictReached ? outcome : '→ Preview calculating…' + (degraded ? ' (dense scene)' : ''),
          outcomeCol: complete || verdictReached ? outcomeCol : COL_PENDING, spd, truncated: !complete, captured, minR, complete,
          simTime: tSim, stepCount: stepN, approximate, twoBodyMode: cl.length === 2,
          outcomeVerdictComplete: complete || verdictReached, verdictProvisional, degraded
        };
      }

      // AIM-PERF P4: predictive slice budgeting. An EWMA of measured step
      // cost decides whether to START another step, so the loop does not
      // regularly admit a step likely to overrun the slice; it CANNOT
      // interrupt a step already running, so the maximum blocking interval is
      // still bounded below by one atomic stepClone() call (see design Part
      // 5 / Part 4 "RESPONSIVENESS DESIGN" -- no hard ceiling is claimed).
      // The one-step-per-slice floor below guarantees forward progress even
      // when the EWMA exceeds the whole budget; `degraded` surfaces that case
      // to the UI instead of leaving it indistinguishable from a stall.
      let stepCostEwma = -1;
      let degraded = false;
      const EWMA_ALPHA = 0.2;

      return { resume(sliceBudgetMs = BUDGET_MS) {
        if (complete) return view();
        // Once an outcome verdict is reached but the job is still extending
        // the visual path (final case) or still confirming in the background
        // (provisional case), neither is time-critical for the UI, so run at
        // the reduced background budget instead of the caller's request.
        const effectiveBudget = verdictReached && (verdictProvisional || otherMassiveBodyCount === 0)
          ? Math.min(sliceBudgetMs, PROVISIONAL_SLICE_MS) : sliceBudgetMs;
        const deadline = now() + effectiveBudget;
        let stepsThisSlice = 0;
        degraded = stepCostEwma > effectiveBudget;
        while (tSim < SIM_HORIZON_YR && (stepsThisSlice === 0 || now() < deadline)) {
          if (stepsThisSlice > 0 && stepCostEwma > 0 && now() + stepCostEwma > deadline) break;
          const stepT0 = now();
          const rr = Math.hypot(cl[ti].x, cl[ti].y, cl[ti].z), sp2 = Math.hypot(cl[ti].vx, cl[ti].vy, cl[ti].vz), dt = requiredDt(rr, sp2, G * (cl[0].m + cl[ti].m));
          // AIM1-05: tag a failure with where it happened, so the controller
          // can tell a rejected launch state (step 0) from a mid-trajectory
          // integration failure instead of labelling both "input rejected".
          try { stepClone(cl, dt); } catch (error) { if (error && typeof error === 'object') { error.previewStep = stepN; error.previewSimTime = tSim; } throw error; }
          tSim += dt; stepN++; stepsThisSlice++; if (rr < minR) minR = rr;
          const measured = now() - stepT0;
          stepCostEwma = stepCostEwma < 0 ? measured : EWMA_ALPHA * measured + (1 - EWMA_ALPHA) * stepCostEwma;
          sampleApoapsis();
          // AIM1-02: in adaptive Kerr the clone integrator reports the capture
          // event itself (event-terminated -> clone.captured) and then freezes
          // the body at the surface; the chord test below never fires on a
          // frozen body, so the job ground at DT_MIN to the 300 yr horizon
          // (measured: 32.7M steps, "Preview calculating..." indefinitely).
          if (cl[ti].captured) { captured = true; outcome = `→ CAPTURED in ${tSim.toFixed(1)} yr`; outcomeCol = COL_CAPTURED; complete = true; verdictProvisional = false; pts.push([cl[ti].x, cl[ti].y, cl[ti].z]); break; }
          // AIM1-08: sample the displayed path by geometry, not by step count.
          // With pericentre-resolving steps a bound orbit takes ~60k steps; the
          // old rule (every step inside CLOSE_RADIUS_AU) produced ~53k points,
          // copied by view() and drawn every frame. Emit a point once the body
          // has moved PATH_SPACING_FRAC of its current radius since the last one.
          if (!verdictReached || verdictProvisional || periodsObserved < EARLY_BOUND_VISUAL_PERIODS) {
            const last = pts[pts.length - 1], nr = Math.hypot(cl[ti].x, cl[ti].y, cl[ti].z);
            if (!last || Math.hypot(cl[ti].x - last[0], cl[ti].y - last[1], cl[ti].z - last[2]) >= PATH_SPACING_FRAC * nr) pts.push([cl[ti].x, cl[ti].y, cl[ti].z]);
          }
          const crossing = captureSurface.chordCrossing({ x: prevX, y: prevY, z: prevZ }, { x: cl[ti].x - prevX, y: cl[ti].y - prevY, z: cl[ti].z - prevZ }, rcap);
          prevX = cl[ti].x; prevY = cl[ti].y; prevZ = cl[ti].z;
          // AIM1-07: for a Kerr-owned body the capture sphere is only a
          // CANDIDATE (production: SCI-01B classification declines when a
          // turning point exists, e.g. L ~ 4.4 M turns at ~6.9 M inside the
          // 8 M sphere and escapes back out). Its verdict comes solely from the
          // clone's committed classification (cl[ti].captured, above). The
          // geometric chord verdict applies to non-Kerr-owned bodies only.
          const kerrOwned = cl[ti].__fidelityOwnership?.owner === 'KERR_ACTIVE';
          if (!kerrOwned && crossing.status === captureSurface.ENTER_EVENT) { captured = true; outcome = `→ CAPTURED in ${(tSim - dt * (1 - crossing.theta)).toFixed(1)} yr`; outcomeCol = COL_CAPTURED; complete = true; verdictProvisional = false; break; }
          if (rr > ESCAPE_RADIUS_AU && sp2 > Math.sqrt(2 * G * cl[0].m / rr) * ESCAPE_MARGIN) { outcome = `→ ESCAPES at ${tSim.toFixed(1)} yr`; outcomeCol = COL_ESCAPE; complete = true; verdictProvisional = false; break; }
          // Early-BOUND completion, final case (no other massive body in the
          // clone): once the verdict has fired AND the visual path has run to
          // EARLY_BOUND_VISUAL_PERIODS radial periods, stop -- there is no
          // background confirmation left to do and nothing more to draw.
          if (verdictReached && !verdictProvisional && otherMassiveBodyCount === 0 && periodsObserved >= EARLY_BOUND_VISUAL_PERIODS) { complete = true; break; }
        }
        if (!complete && tSim >= SIM_HORIZON_YR) classifyFinal();
        return view();
      }, isComplete: () => complete };
    }
    function computePreview(p0Rel, p1Rel, mass) { return createPreviewJob(p0Rel, p1Rel, mass).resume(BUDGET_MS); }
    return Object.freeze({ computePreview, createPreviewJob });
  }
  SGRA.Intruders.PreviewService = Object.freeze({ createPreviewService });
})(typeof window !== 'undefined' ? window : globalThis);
