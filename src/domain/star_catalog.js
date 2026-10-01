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
  SGRA.Domain = SGRA.Domain || {};

  SGRA.Domain.StarCatalog = {
    SSTARS: [
      ['S1',  0.595, 0.556, 119.14, 342.04, 122.3, 2001.80, 11.4],
      ['S2',  0.1255, 0.8839, 134.18, 226.94, 65.51, 2002.33, 15.8],
      ['S4',  0.3570, 0.3905, 80.33, 258.84, 290.8, 1957.4, 13.0],
      ['S6',  0.6574, 0.8400, 87.24, 85.07, 116.23, 2108.61, 8.3],
      ['S8',  0.4047, 0.8031, 74.37, 315.43, 346.70, 1983.64, 12.4],
      ['S9',  0.2724, 0.644,  82.41, 156.60, 150.6, 1976.71, 9.5],
      ['S12', 0.2987, 0.8883, 33.56, 230.1, 317.9, 1995.59, 8.0],
      ['S13', 0.2641, 0.4250, 24.70, 74.5, 245.2, 2004.86, 7.0],
      ['S14', 0.2863, 0.9761, 100.59, 226.38, 334.59, 2000.12, 7.3],
      ['S17', 0.3559, 0.397,  96.83, 191.62, 326.0, 1991.19, 8.7],
      ['S18', 0.2379, 0.471, 110.67, 49.11, 349.46, 1993.86, 4.7],
      ['S21', 0.2190, 0.764,  58.8, 259.64, 166.4, 2027.40, 4.3],
      ['S29', 0.428, 0.728, 105.8, 161.96, 346.5, 2025.96, 4.7],
      ['S31', 0.449, 0.5497, 109.03, 137.16, 308.0, 2018.07, 7.3],
      ['S38', 0.1416, 0.8201, 171.1, 101.06, 17.99, 2003.19, 4.1],
      ['S39', 0.370, 0.9236, 89.36, 159.03, 23.3, 2000.06, 4.5],
      ['S55', 0.1078, 0.7209, 150.1, 325.5, 331.5, 2009.34, 3.3],
      ['S175', 0.414, 0.9867, 88.53, 326.83, 68.52, 2009.51, 3.3],
      // S301: source arXiv:2607.12664 (K. Abd El Dayem et al., GRAVITY
      // Collaboration, accepted Nature 2026), Extended Data Table 2.
      // Astrometry alone cannot distinguish two orbit orientations (fits
      // A and B, essentially equal chi^2: 25.86 vs 25.53) -- Omega and
      // omega each differ by ~180 deg between them, the classic
      // ascending-node ambiguity. BOTH are recorded here rather than
      // picking one; do not delete either without a reason. Shortest known
      // period of any S-star; closest known pericenter too, though the
      // two solutions are NOT interchangeable there: A ~136.7 Rs,
      // B ~143.2 Rs (computed from each solution's own a(1-e), not a
      // single blended figure -- see bench/s301_fixture.mjs).
      // See also bench/s301_fixture.mjs / tests/s301_regime.test.mjs for a
      // physics-regime stress test using these same values -- that test
      // found SGRA's current GR-on integration does not keep this orbit
      // bound, a real open finding, not yet resolved.
      ['S301-A', 0.0830, 0.9832, 124.09, 73.8, 293.4, 2023.126, 19.3],
      ['S301-B', 0.0830, 0.9824, 122.84, 256.9, 115.1, 2023.125, 19.3]
    ]
  };
})(window);
