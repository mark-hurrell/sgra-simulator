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
  const BodyRoles = SGRA.Domain && SGRA.Domain.BodyRoles;
  const G = Constants.G;
  const C2 = Constants.C2;
  const EPS2_BH = Constants.EPS2_BH;
  const EPS2_SS = Constants.EPS2_SS;

  let configuredDeps = null;
  function configure(port) {
    if (!port || typeof port.getBodies !== 'function') throw new TypeError('LocalEnergy requires an explicit world port');
    configuredDeps = Object.freeze(new Proxy({}, { get: (_target, key) => port[key], set: (_target, key, value) => { port[key] = value; return true; }, has: (_target, key) => key in port }));
    return configuredDeps;
  }
  function deps() {
    return configuredDeps || {};
  }

  function getBodies() {
    const d = deps();
    return d.getBodies();
  }

  function kineticEnergy() {
    const list = getBodies();
    let E = 0;
    for (const b of list) E += .5 * b.m * (b.vx ** 2 + b.vy ** 2 + b.vz ** 2);
    return E;
  }

  function roleKey(body) {
    if (body && body.field) return 'field';
    if (body && body.intr) return 'intr';
    return 'core';
  }

  function emptyRoleBreakdown() {
    return {
      core: { kinetic: 0, potential: 0, total: 0 },
      intr: { kinetic: 0, potential: 0, total: 0 },
      field: { kinetic: 0, potential: 0, total: 0 }
    };
  }

  function potentialEnergy() {
    const list = getBodies();
    const epsBh = Math.max(EPS2_BH, (2 * G * list[0].m / C2) ** 2);
    let E = 0;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const code = BodyRoles.pairInteractionCode(a, b);
      if (!(code & BodyRoles.PAIR_INCLUDE)) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const eps = (a.bh || b.bh) ? epsBh : EPS2_SS;
      E -= G * a.m * b.m / Math.sqrt(dx * dx + dy * dy + dz * dz + eps);
    }
    return E;
  }

  function totalEnergy() {
    return kineticEnergy() + potentialEnergy();
  }

  function roleEnergyBreakdown() {
    const list = getBodies();
    const epsBh = Math.max(EPS2_BH, (2 * G * list[0].m / C2) ** 2);
    const totals = emptyRoleBreakdown();
    for (const b of list) {
      totals[roleKey(b)].kinetic += .5 * b.m * (b.vx ** 2 + b.vy ** 2 + b.vz ** 2);
    }
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const code = BodyRoles.pairInteractionCode(a, b);
      if (!(code & BodyRoles.PAIR_INCLUDE)) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const eps = (a.bh || b.bh) ? epsBh : EPS2_SS;
      const pe = -G * a.m * b.m / Math.sqrt(dx * dx + dy * dy + dz * dz + eps);
      const aRole = roleKey(a);
      const bRole = roleKey(b);
      if (aRole === bRole) {
        totals[aRole].potential += pe;
      } else if (!(code & BodyRoles.PAIR_BACKREACT)) {
        // One-way interaction: pairInteractionCode() grants PAIR_INCLUDE without
        // PAIR_BACKREACT for BH <-> field, i.e. the field body feels the BH but
        // the BH does not feel it. Charging half this potential to the BH's role
        // therefore contradicts the force model -- and it made the field role's
        // energy KE + 0.5*PE, which passes through ZERO at virial equilibrium.
        // Since a relaxed field population sits at exactly that point, the drift
        // denominator went to zero and the reported percentage became unbounded
        // (hundreds of percent for a well-converged run). Attribute the whole
        // interaction energy to the role that actually feels it.
        const feelingRole = a.bh ? bRole : aRole;
        totals[feelingRole].potential += pe;
      } else {
        totals[aRole].potential += pe * 0.5;
        totals[bRole].potential += pe * 0.5;
      }
    }
    for (const key of Object.keys(totals)) {
      totals[key].total = totals[key].kinetic + totals[key].potential;
    }
    return totals;
  }

  SGRA.Physics.LocalEnergy = Object.freeze({ configure, kineticEnergy, potentialEnergy, totalEnergy, roleEnergyBreakdown });
})(window);
