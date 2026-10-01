// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function (global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};
  const Constants = SGRA.Domain && SGRA.Domain.Constants;
  const G = Constants.G;
  const DT_SAFETY_DYN = Number.isFinite(Constants.DT_SAFETY_DYN) ? Constants.DT_SAFETY_DYN : Constants.DT_SAFETY;
  const CaptureSurface = SGRA.Physics.CaptureSurface;

  /**
   * PERF plan P4 -- independent timestep lane for passive field/tracer stars.
   *
   * Exactness argument: field stars never backreact on the BH or any other
   * body (body_roles.js::pairInteractionCode returns 0 for any
   * field-involving star-star pair, and BH<->field is include-only/no-
   * backreact), and never receive a GR/PN correction (local_force_model.js's
   * GR loop excludes s.field). They DO feel the extended-mass cusp term when
   * it's enabled -- local_force_model.js's cusp loop was never field-
   * exclusive; only GR is. A field star's true equation of motion is
   * therefore "free-fall toward the BH under monopole + cusp gravity",
   * independent of every other body.
   *
   * This module previously had its own separate, INCOMPLETE copy of that
   * force law (BH monopole only, missing cusp) -- see
   * P4_ROOT_CAUSE_AND_FIX.md sec 2 for the bug this caused (relative
   * position error grew to ~1.9e-3 by 20000 substeps whenever the cusp
   * toggle was on, since the lane silently dropped a term worth ~5-10% of
   * the BH term at field-star radii). Fixed by deferring entirely to
   * SGRA.Physics.LocalForceModel.fieldStarAccel() -- the SAME function
   * computeAccel() calls for its own field-star path -- rather than
   * maintaining two independent implementations of "the force on a field
   * star" that are merely expected to agree.
   *
   * Design: each field star accumulates elapsed dt from the fine substep
   * loop without being drifted/kicked. Once its accumulated time reaches
   * DT_SAFETY_DYN * its own t_dyn (same formula and safety factor
   * local_timestep_policy.js already uses for interacting bodies), it is
   * advanced in one batched kick-drift-kick using fieldStarAccel()
   * evaluated once at the start of the batch window and once after the
   * drift (standard 2-force-evaluation KDK), frozen across the batch --
   * justified because the batch window is itself derived from how slowly
   * that acceleration can plausibly change (see P4_ROOT_CAUSE_AND_FIX.md
   * sec 5: with the force law corrected, residual error from this
   * approximation alone is ~1.2e-6 at 20000 substeps and grows ~n^1.5, pure
   * truncation, not a defect). Any leftover accumulated time is flushed
   * with a final partial KDK when the caller asks for a hard flush (end of
   * an advance() call), so no elapsed simulated time is ever silently
   * dropped.
   */

  // Per-body accumulated-time ledger, keyed by body id. A Map (not a body
  // property) so captured/removed bodies don't need explicit cleanup logic
  // beyond what already happens to the bodies array; stale entries for
  // removed ids are harmless and never read again.
  const pendingDt = new Map();
  // Reused scratch object for fieldStarAccel()'s out-param -- called twice
  // per batch per field star; this keeps the lane allocation-free (P1
  // discipline applies here too).
  const accelScratch = { ax: 0, ay: 0, az: 0 };

  let configuredDeps = null;
  function configure(port) {
    if (!port || typeof port.getSimTime !== 'function' || typeof port.isCuspEnabled !== 'function') {
      throw new TypeError('FieldTracerLane requires explicit clock and mode ports');
    }
    configuredDeps = Object.freeze(new Proxy({}, { get: (_target, key) => port[key], set: (_target, key, value) => { port[key] = value; return true; }, has: (_target, key) => key in port }));
    return configuredDeps;
  }
  function deps() {
    return configuredDeps || {};
  }

  function isCuspEnabled() {
    return deps().isCuspEnabled();
  }

  function fieldStarAccel(b, bh, out) {
    return SGRA.Physics.LocalForceModel.fieldStarAccel(b, bh, isCuspEnabled(), out);
  }

  function fieldStarTdyn(b, bh) {
    const dx = b.x - bh.x, dy = b.y - bh.y, dz = b.z - bh.z;
    const r2 = dx * dx + dy * dy + dz * dz;
    const r = Math.sqrt(r2);
    return Math.sqrt(r2 * r / (G * (bh.m + b.m)));
  }

  function integrateBatch(b, bh, totalDt) {
    if (totalDt <= 0) return;
    const start = { x: b.x - bh.x, y: b.y - bh.y, z: b.z - bh.z };
    const h = 0.5 * totalDt;
    fieldStarAccel(b, bh, accelScratch);
    b.vx += accelScratch.ax * h; b.vy += accelScratch.ay * h; b.vz += accelScratch.az * h;
    b.x += b.vx * totalDt; b.y += b.vy * totalDt; b.z += b.vz * totalDt;
    fieldStarAccel(b, bh, accelScratch);
    b.vx += accelScratch.ax * h; b.vy += accelScratch.ay * h; b.vz += accelScratch.az * h;
    // Keep b.ax/ay/az consistent with the post-batch state, in case any
    // downstream code (HUD, trail sampling, etc.) reads it before the next
    // full computeAccel() call. Not load-bearing for correctness of this
    // module, but avoids a stale-acceleration read elsewhere.
    b.ax = accelScratch.ax; b.ay = accelScratch.ay; b.az = accelScratch.az;
    const crossing = CaptureSurface?.chordCrossing(start, { x: b.x - bh.x - start.x, y: b.y - bh.y - start.y, z: b.z - bh.z - start.z }, CaptureSurface.radius(bh.m));
    if (crossing?.status === CaptureSurface.ENTER_EVENT) {
      const theta = crossing.theta;
      b.x = bh.x + start.x + (b.x - bh.x - start.x) * theta;
      b.y = bh.y + start.y + (b.y - bh.y - start.y) * theta;
      b.z = bh.z + start.z + (b.z - bh.z - start.z) * theta;
      b.__captureEvent = { id: b.id, t: (deps().getSimTime?.() ?? 0) + totalDt * theta, fraction: theta, x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, localisation: 'field-lane-chord-root', velocity_convention: 'field-lane-kdk', canonical: null, units: null };
      b.captured = true;
    }
  }

  /**
   * Called once per fine substep with the substep's dt and the current body
   * list. Accumulates dt for every field, non-captured body; flushes
   * (integrates) any field star whose accumulated time has reached its own
   * safety-scaled dynamical timescale.
   */
  function accumulate(list, dt) {
    const bh = list[0];
    for (let i = 1; i < list.length; i++) {
      const b = list[i];
      if (!b.field || b.captured) continue;
      const prev = pendingDt.get(b.id) || 0;
      const next = prev + dt;
      const budget = DT_SAFETY_DYN * fieldStarTdyn(b, bh);
      if (next >= budget) {
        integrateBatch(b, bh, next);
        pendingDt.set(b.id, 0);
      } else {
        pendingDt.set(b.id, next);
      }
    }
  }

  /**
   * Called at the end of an advance() call (i.e. when the fine substep loop
   * for interacting bodies has finished, however it finished -- full
   * interval consumed, stepMax hit, or P0A deadline throttled it) to flush
   * any field stars still holding unintegrated accumulated time. This is
   * required for correctness: without it, elapsed simulated time would be
   * silently absorbed and a field star's motion would lag behind simT,
   * violating the plan's explicit non-goal ("do not make field stars
   * visually static").
   *
   * MUST be called by the production integrator after every advance() --
   * see P4_ROOT_CAUSE_AND_FIX.md sec 3: this was previously never called
   * outside bench/gate scripts, meaning every field star in the live
   * browser build carried up to DT_SAFETY_DYN*t_dyn of un-integrated lag at
   * all times, visible to energy accounting, trail sampling, and rendering.
   */
  function flush(list) {
    const bh = list[0];
    for (let i = 1; i < list.length; i++) {
      const b = list[i];
      if (!b.field || b.captured) continue;
      const pending = pendingDt.get(b.id) || 0;
      if (pending > 0) {
        integrateBatch(b, bh, pending);
        pendingDt.set(b.id, 0);
      }
    }
  }

  function clear() {
    pendingDt.clear();
  }

  function getPendingDt(bodyId) {
    return pendingDt.get(bodyId) || 0;
  }

  SGRA.Physics.FieldTracerLane = Object.freeze({ configure, accumulate, flush, clear, getPendingDt, fieldStarTdyn, fieldStarAccel, integrateBatch });
})(typeof window !== 'undefined' ? window : globalThis);
