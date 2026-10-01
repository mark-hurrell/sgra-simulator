// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachPredictionCompute(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Paths = SGRA.Paths || {};

  function computeFuturePath(deps, idx) {
    const allBodies = deps.getBodies();
    if (idx <= 0 || idx >= allBodies.length) return null;
    const bodySnap = allBodies[idx];
    const cl = deps.cloneInBHFrame();
    deps.accelClone(cl);
    if (idx >= cl.length) return null;
    const b = cl[idx];
    const r0 = Math.hypot(b.x, b.y, b.z);
    const period = 2 * Math.PI * Math.sqrt(r0 * r0 * r0 / (deps.G * cl[0].m));
    const maxT = Math.max(period * 2.5, deps.PRED_MAX_T);
    const pts = [];
    let t = 0;
    const deadline = deps.now() + deps.PRED_BUDGET_MS;
    let status = 'incomplete', captured = false, escaped = false;
    const modelCounts = { newtonianSteps: 0, kerrSteps: 0 };
    while (t < maxT && pts.length < deps.PRED_MAX_PTS && deps.now() < deadline) {
      const bi = cl[idx];
      pts.push({
        index: pts.length,
        t,
        x: bi.x - cl[0].x, y: bi.y - cl[0].y, z: bi.z - cl[0].z,
        vx: bi.vx - cl[0].vx, vy: bi.vy - cl[0].vy, vz: bi.vz - cl[0].vz
      });
      const dt = Math.min(deps.PRED_DT, Math.max(deps.DT_MIN, deps.pickDtClone(cl, idx)));
      try {
        deps.stepClone(cl, dt);
      } catch (error) {
        status = error?.code === 'KERR_ADMISSION_FAILED' ? 'kerr-admission-failed' : 'kerr-unavailable';
        return {
          pts, bodyRef: bodySnap, sourceSimT: deps.getSimT(), status,
          complete: false, modelCounts,
          failure: { code: error?.code || 'PREDICTION_FAILED', reason: error?.message || String(error) }
        };
      }
      const owner = cl[idx].__fidelityOwnership?.owner;
      if (owner === 'KERR_ACTIVE') modelCounts.kerrSteps += 1;
      else modelCounts.newtonianSteps += 1;
      t += dt;
      const nextBody = cl[idx];
      const dist = Math.hypot(nextBody.x - cl[0].x, nextBody.y - cl[0].y, nextBody.z - cl[0].z);
      if (dist < deps.R_CAP_FAC * deps.RS()) { captured = true; status = 'captured'; break; }
      if (dist > 2e5) { escaped = true; status = 'escaped'; break; }
    }
    if (!captured && !escaped && t >= maxT) status = 'complete';
    else if (!captured && !escaped && pts.length >= deps.PRED_MAX_PTS) status = 'budget-limited';
    return {
      pts,
      bodyRef: bodySnap,
      sourceSimT: deps.getSimT(),
      status,
      complete: status === 'complete' || status === 'captured' || status === 'escaped',
      modelCounts
    };
  }

  SGRA.Paths.PredictionCompute = Object.freeze({ computeFuturePath });
})(typeof window !== 'undefined' ? window : globalThis);
