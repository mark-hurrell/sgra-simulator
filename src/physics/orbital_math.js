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

  function solveKepler(M, e) {
    M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let E = e < 0.8 ? M : Math.PI;
    for (let k = 0; k < 60; k++) {
      const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-12) break;
    }
    return E;
  }

  function elementsToState(aAU, e, iD, OmD, wD, tP, t, bh) {
    const gmbh = Constants.G * (bh && Number.isFinite(bh.m) ? bh.m : Constants.MBH_INIT);
    const n = Math.sqrt(gmbh / aAU ** 3);
    const E = solveKepler(n * (t - tP), e);
    const ce = Math.cos(E), se = Math.sin(E), d = 1 - e * ce;
    const xf = aAU * (ce - e), yf = aAU * Math.sqrt(1 - e * e) * se;
    const vxf = -aAU * n * se / d, vyf = aAU * n * Math.sqrt(1 - e * e) * ce / d;
    const i = iD * Math.PI / 180, Om = OmD * Math.PI / 180, w = wD * Math.PI / 180;
    const cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(i), si = Math.sin(i), cw = Math.cos(w), sw = Math.sin(w);
    const Px = cO * cw - sO * sw * ci, Py = sO * cw + cO * sw * ci, Pz = sw * si;
    const Qx = -cO * sw - sO * cw * ci, Qy = -sO * sw + cO * cw * ci, Qz = cw * si;
    return {
      x: Px * xf + Qx * yf,
      y: Py * xf + Qy * yf,
      z: Pz * xf + Qz * yf,
      vx: Px * vxf + Qx * vyf,
      vy: Py * vxf + Qy * vyf,
      vz: Pz * vxf + Qz * vyf
    };
  }

  function pnFractionPct(r, bh) {
    const bhMass = bh && Number.isFinite(bh.m) ? bh.m : Constants.MBH_INIT;
    return 1.5 * (2 * Constants.G * bhMass / Constants.C2) / r * 100;
  }

  function xiOf(b, bh) {
    const rx = b.x - bh.x, ry = b.y - bh.y, rz = b.z - bh.z;
    const vx = b.vx - bh.vx, vy = b.vy - bh.vy, vz = b.vz - bh.vz;
    const r = Math.hypot(rx, ry, rz);
    const v = Math.hypot(vx, vy, vz);
    const beta = v / Constants.C_AUYR;
    return (2 * Constants.G * bh.m / Constants.C2) / r + beta * beta;
  }

  function relWeight(b, bh) {
    return Math.min(1, xiOf(b, bh) / Constants.XI_STRONG);
  }

  function weightCol(w, alpha) {
    // NOTE: the RGB triples and thresholds here are mirrored in the trail colour
    // lookup table in src/render/path_renderers.js. Keep them in sync.
    if (w < 0.05) return `rgba(100,150,255,${alpha})`;
    if (w < 0.30) return `rgba(50,220,200,${alpha})`;
    if (w < 0.70) return `rgba(255,150,30,${alpha})`;
    return `rgba(255,50,50,${alpha})`;
  }

  function weightLabel(w) {
    if (w < 0.05) return 'Newtonian';
    if (w < 0.30) return 'Weak GR (1PN valid)';
    if (w < 0.70) return 'Relativistic (1PN limited)';
    return 'STRONG FIELD (PN breaks down)';
  }

  function weightPos(w) {
    return Math.min(1, Math.sqrt(w));
  }

  function relativityState(b, bh) {
    const rx = b.x - bh.x, ry = b.y - bh.y, rz = b.z - bh.z;
    const vx = b.vx - bh.vx, vy = b.vy - bh.vy, vz = b.vz - bh.vz;
    const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const v = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const vc = v / Constants.C_AUYR;
    const pnPct = 1.5 * (2 * Constants.G * bh.m / Constants.C2) / r * 100;
    const w = relWeight(b, bh);
    return { r, v, vc, pnPct, w, regime: weightLabel(w) };
  }

  function oscElements(b, bh, grOn) {
    const rx = b.x - bh.x, ry = b.y - bh.y, rz = b.z - bh.z;
    const vx = b.vx - bh.vx, vy = b.vy - bh.vy, vz = b.vz - bh.vz;
    const r = Math.sqrt(rx * rx + ry * ry + rz * rz), v2 = vx * vx + vy * vy + vz * vz;
    const mu = Constants.G * (bh.m + b.m);
    let v2_eff = v2;
    if (grOn) {
      v2_eff = v2 * (1 - (mu / r) / Constants.C2);
    }
    const aDenom = 2 / r - v2_eff / mu;
    if (Math.abs(aDenom) < 1e-12) return { a: Infinity, e: 1, bound: false, conf: 0, mu, r, v: Math.sqrt(v2), parabolic: true };
    const a = 1 / aDenom;
    const hx = ry * vz - rz * vy, hy = rz * vx - rx * vz, hz = rx * vy - ry * vx;
    const h2 = hx * hx + hy * hy + hz * hz;
    let eMag;
    if (a > 0) { eMag = Math.sqrt(Math.max(0, 1 - h2 / (mu * a))); }
    else { eMag = Math.sqrt(1 - h2 / (mu * a)); }
    const ex = (vy * hz - vz * hy) / mu - rx / r;
    const ey = (vz * hx - vx * hz) / mu - ry / r;
    const ez = (vx * hy - vy * hx) / mu - rz / r;
    const eLRL = Math.hypot(ex, ey, ez);
    let ux, uy, uz;
    let exUnit = ex, eyUnit = ey, ezUnit = ez;
    if (eLRL > 1e-12) {
      const invELRL = 1 / eLRL;
      ux = ex * invELRL;
      uy = ey * invELRL;
      uz = ez * invELRL;
      exUnit *= eMag * invELRL;
      eyUnit *= eMag * invELRL;
      ezUnit *= eMag * invELRL;
    } else {
      const invR = 1 / Math.max(r, 1e-30);
      ux = rx * invR;
      uy = ry * invR;
      uz = rz * invR;
      exUnit = ux * eMag;
      eyUnit = uy * eMag;
      ezUnit = uz * eMag;
    }
    const dax = b.ax - bh.ax, day = b.ay - bh.ay, daz = b.az - bh.az;
    const aCen = mu / (r * r);
    const aPert = Math.max(0, Math.hypot(dax, day, daz) - aCen);
    const conf = 1 / (1 + (aPert / Math.max(aCen, 1e-30)) * 4);
    return { a, e: eMag, ex: exUnit, ey: eyUnit, ez: ezUnit, ux, uy, uz, hx, hy, hz, r, v: Math.sqrt(v2), conf, mu };
  }

  function ellipsePoints(el, N) {
    if (!(el.a > 0 && el.e < 1)) return null;
    const h = Math.hypot(el.hx, el.hy, el.hz); if (h < 1e-9) return null;
    const hx = el.hx / h, hy = el.hy / h, hz = el.hz / h;
    let ux, uy, uz;
    if (Number.isFinite(el.ux) && Number.isFinite(el.uy) && Number.isFinite(el.uz)) {
      ux = el.ux; uy = el.uy; uz = el.uz;
    } else if (el.e > 1e-6) {
      ux = el.ex / el.e; uy = el.ey / el.e; uz = el.ez / el.e;
    } else {
      ux = 1; uy = 0; uz = 0;
    }
    const wx = hy * uz - hz * uy, wy = hz * ux - hx * uz, wz = hx * uy - hy * ux;
    const b_ax = el.a * Math.sqrt(1 - el.e * el.e);
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const E = 2 * Math.PI * k / N;
      const xo = el.a * (Math.cos(E) - el.e);
      const yo = b_ax * Math.sin(E);
      pts.push([xo * ux + yo * wx, xo * uy + yo * wy, xo * uz + yo * wz]);
    }
    return pts;
  }

  SGRA.Physics.OrbitalMath = {
    solveKepler,
    elementsToState,
    pnFractionPct,
    xiOf,
    relWeight,
    weightCol,
    weightLabel,
    weightPos,
    relativityState,
    oscElements,
    ellipsePoints
  };
})(window);
