// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachIntruderBodyFactory(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Intruders = SGRA.Intruders || {};

  const STELLAR_MASS_LIMIT = 100;   // M☉ — below this a launch is a star
  const STAR_COLOUR = '#bcd2ff';
  const IMBH_COLOUR = '#ff7a5c';

  function isStellar(mass) {
    return mass < STELLAR_MASS_LIMIT;
  }

  /**
   * Build an intruder body. Pure: no ID allocation, no array mutation,
   * no side effects. The caller supplies id and seq.
   *
   * @param {object} args
   * @param {number} args.id            body id, already allocated
   * @param {number} args.seq           intruder sequence number, 1-based
   * @param {number} args.mass          M☉
   * @param {number[]} args.p0Rel       aim start, BH-relative [x,y,z]
   * @param {number[]} args.p1Rel       aim end, BH-relative [x,y,z]
   * @param {object} args.blackHole     {x,y,z,vx,vy,vz}
   * @param {number} args.launchScale   LAUNCH_SCALE
   * @returns {object} body
   */
  function createIntruderBody(args) {
    const { id, seq, mass, p0Rel, p1Rel, blackHole, launchScale } = args;
    const star = isStellar(mass);
    const [vxRel, vyRel, vzRel] = launchVelocity(p0Rel, p1Rel, launchScale);

    const body = {
      name: (star ? 'STAR-' : 'IMBH-') + seq,
      m: mass,
      x: blackHole.x + p1Rel[0],
      y: blackHole.y + p1Rel[1],
      z: blackHole.z + p1Rel[2],
      vx: blackHole.vx + vxRel,
      vy: blackHole.vy + vyRel,
      vz: blackHole.vz + vzRel,
      ax: 0, ay: 0, az: 0,
      col: star ? STAR_COLOUR : IMBH_COLOUR,
      intr: true,
      star,
      prevR: Math.hypot(p1Rel[0], p1Rel[1], p1Rel[2]),
      prevDR: 0, legMinR: null, lastPeriT: null,
      id,
      aPN: 0,
      aLT: 0
    };
    const provenance = SGRA.Domain && SGRA.Domain.CreationProvenance;
    body.__creationProvenance = provenance
      ? provenance.noneDragLaunch()
      : Object.freeze({ kind: 'NONE_DRAG_LAUNCH', constructedAt: new Date().toISOString() });
    return body;
  }

  /** Launch velocity in the BH frame, for display and toasts. */
  function launchVelocity(p0Rel, p1Rel, launchScale) {
    return [
      (p1Rel[0] - p0Rel[0]) * launchScale,
      (p1Rel[1] - p0Rel[1]) * launchScale,
      (p1Rel[2] - p0Rel[2]) * launchScale
    ];
  }

  SGRA.Intruders.BodyFactory = Object.freeze({
    createIntruderBody,
    launchVelocity,
    isStellar,
    STELLAR_MASS_LIMIT
  });
})(typeof window !== 'undefined' ? window : globalThis);
