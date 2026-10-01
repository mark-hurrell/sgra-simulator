// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachKerrIsco(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};
  SGRA.Physics.Kerr = SGRA.Physics.Kerr || {};

  // Equatorial Kerr reference branches in units of GM/c^2. These are
  // reference radii, not a claim about a generic inclined orbit's stability.
  function radii(aStar) {
    const a = Number(aStar);
    if (!Number.isFinite(a) || a < 0 || a > 1) throw new Error('Kerr ISCO spin must be finite in [0,1]');
    const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
    const z2 = Math.sqrt(3 * a * a + z1 * z1);
    const root = Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
    return Object.freeze({ progradeM: 3 + z2 - root, retrogradeM: 3 + z2 + root });
  }

  SGRA.Physics.Kerr.ISCO = Object.freeze({ radii });
})(typeof window !== 'undefined' ? window : globalThis);
