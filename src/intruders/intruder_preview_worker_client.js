// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// AIM-PERF worker client. Thin, feature-detected wrapper around
// sgra_preview_worker.js for the ONE case worth moving off-thread: the P2
// provisional-verdict background confirmation (see that file's header for
// why the interactive preview itself stays on the main thread). Optional and
// additive -- if Worker is unavailable, or the worker fails to load or
// errors, `available` is false (or becomes false) and the caller is expected
// to keep using the existing main-thread previewJob.resume() path, exactly
// as before this file existed.
(function attachIntruderPreviewWorkerClient(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Intruders = SGRA.Intruders || {};

  function createPreviewWorkerClient({ workerScriptUrl, physicsScriptUrls }) {
    let worker = null;
    let available = typeof Worker !== 'undefined' && typeof workerScriptUrl === 'string' && Array.isArray(physicsScriptUrls) && physicsScriptUrls.length > 0;
    let nextRequestId = 1;
    let active = null; // { requestId, onProgress, onDone, onError }

    function spawn() {
      if (worker || !available) return;
      try {
        worker = new Worker(workerScriptUrl);
        worker.onmessage = ev => {
          const msg = ev.data;
          if (!active || msg.requestId !== active.requestId) return; // stale response from a cancelled run
          if (msg.type === 'progress') { active.onProgress && active.onProgress(msg.view); return; }
          if (msg.type === 'done') { const cb = active.onDone; active = null; cb && cb(msg.view); return; }
          if (msg.type === 'error') { const cb = active.onError; active = null; cb && cb(new Error(msg.message)); return; }
        };
        worker.onerror = err => {
          // A worker-level failure (e.g. importScripts blocked by CSP, or a
          // file:// origin that refuses module workers) permanently disables
          // this client for the rest of the session; the caller falls back
          // to the main-thread path for every subsequent preview.
          available = false;
          if (active) { const cb = active.onError; active = null; cb && cb(err); }
          try { worker.terminate(); } catch (_e) { /* already gone */ }
          worker = null;
        };
      } catch (_err) {
        available = false;
        worker = null;
      }
    }

    // AIM-PERF: snapshot the scene exactly as the preview clone already
    // does -- a frozen point-in-time copy, not a live view (see
    // prediction_clone_integrator.js AIM1 notes). Only the plain-data fields
    // the physics reads are copied; no functions, no DOM, nothing that would
    // fail structured clone.
    function snapshotBody(b) {
      return { id: b.id, name: b.name, bh: !!b.bh, star: !!b.star, intr: !!b.intr,
        field: !!b.field, captured: !!b.captured, x: b.x, y: b.y, z: b.z,
        vx: b.vx, vy: b.vy, vz: b.vz, m: b.m };
    }

    /**
     * Run one preview job to completion in the worker. `request` mirrors the
     * arguments createPreviewJob would take, plus the scene/physics context
     * a worker cannot otherwise see (it has no access to SGRA.Domain, etc,
     * until physicsScriptUrls are loaded into it).
     *
     * @param {object} request
     * @param {number[]} request.p0 request.p1  aim endpoints (BH-relative)
     * @param {number} request.mass
     * @param {object[]} request.bodies  live scene bodies (getBodies())
     * @param {string} request.mode  'newtonian' | '1pn' | 'adaptive_kerr'
     * @param {number} request.spin
     * @param {number} request.pnRamp
     * @param {boolean} request.cuspOn
     * @param {'auto'|'twoBody'} [request.previewMode]
     * @param {object} request.constants  a plain copy of SGRA.Domain.Constants'
     *   fields the physics needs (G, C2, C_AUYR, EPS2_BH, EPS2_SS, DT_MIN,
     *   DT_MAX, DT_SAFETY, DT_SAFETY_DYN, DT_SAFETY_PN, CUSP_M0, CUSP_R0,
     *   LAUNCH_SCALE, R_CAP_FAC)
     * @param {function} [callbacks.onProgress]  (view) -> void, periodic
     * @param {function} callbacks.onDone        (view) -> void, terminal
     * @param {function} callbacks.onError       (Error) -> void, terminal
     * @returns {{cancel: function}} cancel() makes any further messages for
     *   this request a no-op; it does not terminate the worker (so the next
     *   run() can reuse it).
     */
    function run(request, { onProgress, onDone, onError } = {}) {
      if (!available) { onError && onError(new Error('preview worker unavailable')); return { cancel() {} }; }
      spawn();
      if (!worker) { onError && onError(new Error('preview worker failed to start')); return { cancel() {} }; }
      const requestId = nextRequestId++;
      active = { requestId, onProgress, onDone, onError };
      worker.postMessage({
        type: 'run', requestId, physicsScriptUrls,
        bodies: request.bodies.map(snapshotBody),
        p0: request.p0.slice(), p1: request.p1.slice(), mass: request.mass,
        mode: request.mode, spin: request.spin, pnRamp: request.pnRamp, cuspOn: !!request.cuspOn,
        previewMode: request.previewMode, constants: request.constants
      });
      return { cancel() { if (active && active.requestId === requestId) active = null; } };
    }

    function isAvailable() { return available; }
    function terminate() { if (worker) { try { worker.terminate(); } catch (_e) { /* noop */ } worker = null; } active = null; }

    return Object.freeze({ run, isAvailable, terminate });
  }

  SGRA.Intruders.PreviewWorkerClient = Object.freeze({ createPreviewWorkerClient });
})(typeof window !== 'undefined' ? window : globalThis);
