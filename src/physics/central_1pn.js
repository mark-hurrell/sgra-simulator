// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachCentral1Pn(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  function computeCentral1PnAcceleration(args, out) {
    const target = out || {};
    const {
      gm,
      c2,
      pnScale,
      pnDamp,
      rSafe,
      rx, ry, rz,
      vx, vy, vz
    } = args || {};

    if (!Number.isFinite(gm) || !Number.isFinite(c2) || !Number.isFinite(rSafe) || rSafe <= 0 ||
        !Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rz) ||
        !Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) {
      target.x = 0;
      target.y = 0;
      target.z = 0;
      target.magnitude = 0;
      return target;
    }

    const invR = 1 / rSafe;
    const nx = rx * invR;
    const ny = ry * invR;
    const nz = rz * invR;
    const rvN = nx * vx + ny * vy + nz * vz;
    const v2 = vx * vx + vy * vy + vz * vz;
    const k = pnDamp * gm * pnScale / (c2 * rSafe * rSafe);
    const common = 4 * gm * invR - v2;
    const fx = k * (common * nx + 4 * rvN * vx);
    const fy = k * (common * ny + 4 * rvN * vy);
    const fz = k * (common * nz + 4 * rvN * vz);
    target.x = fx;
    target.y = fy;
    target.z = fz;
    target.magnitude = Math.hypot(fx, fy, fz);
    return target;
  }

  SGRA.Physics.computeCentral1PnAcceleration = computeCentral1PnAcceleration;
})(window);
