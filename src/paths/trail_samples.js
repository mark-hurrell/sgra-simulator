// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachTrailSamples(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Paths = SGRA.Paths || {};

  function relativeToBHLocal(body, bh) {
    return {
      x: body.x - bh.x,
      y: body.y - bh.y,
      z: body.z - bh.z,
      vx: body.vx - bh.vx,
      vy: body.vy - bh.vy,
      vz: body.vz - bh.vz
    };
  }

  function buildTrailSampleAt(body, bh, t, trailSeqNow, physicsState = null) {
    return {
      t,
      x: body.x - bh.x, y: body.y - bh.y, z: body.z - bh.z,
      vx: body.vx - bh.vx, vy: body.vy - bh.vy, vz: body.vz - bh.vz,
      bx: bh.x, by: bh.y, bz: bh.z,
      bvx: bh.vx, bvy: bh.vy, bvz: bh.vz,
      n: trailSeqNow,
      // Historical semantic state: renderer must not recolour the whole trail
      // from the body's current owner after a later transition.
      relativistic: physicsState?.relativistic === true,
      physicsMode: physicsState?.mode || 'newtonian'
    };
  }


  function shouldAddTrailSample(body, trail, bh, simTNow) {
    if (!trail || trail.length === 0) return true;

    const last = trail[trail.length - 1];
    const r = relativeToBHLocal(body, bh);
    const dx = r.x - last.x;
    const dy = r.y - last.y;
    const dz = r.z - last.z;
    const dist = Math.hypot(dx, dy, dz);

    const radius = Math.max(1, Math.hypot(r.x, r.y, r.z));
    const lastRadius = Math.max(1, Math.hypot(last.x, last.y, last.z));

    const dot =
      (last.x * r.x + last.y * r.y + last.z * r.z) /
      Math.max(1e-12, lastRadius * radius);

    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    const dt = simTNow - (last.t ?? simTNow);

    const isIntr = !!body.intr;
    const maxDist = isIntr ? Math.max(5, radius * 0.01) : Math.max(20, radius * 0.025);
    // Intruders need finer angular sampling through close, high-curvature passages.
    const maxAngle = isIntr ? Math.PI / 48 : Math.PI / 12;
    const maxTime = isIntr ? 0.01 : 0.05;

    return dist > maxDist || angle > maxAngle || dt > maxTime;
  }

  SGRA.Paths.TrailSamples = Object.freeze({
    buildTrailSampleAt,
    shouldAddTrailSample
  });
})(typeof window !== 'undefined' ? window : globalThis);
