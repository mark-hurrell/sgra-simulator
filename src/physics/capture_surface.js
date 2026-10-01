// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachCaptureSurface(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};
  const Constants = SGRA.Domain && SGRA.Domain.Constants;
  const EPS = Number.EPSILON;
  const NO_EVENT = 'NO_EVENT';
  const ENTER_EVENT = 'ENTER_EVENT';
  const INVALID_PRECONDITION = 'INVALID_PRECONDITION';

  function requireFinite(name, value) {
    if (!Number.isFinite(value)) throw new Error(`CaptureSurface ${name} must be finite`);
    return value;
  }

  function radiusFromValues(bhMass, values) {
    const source = values || Constants;
    if (!source) throw new Error('CaptureSurface constants are unavailable');
    const mass = requireFinite('BH mass', Number(bhMass));
    const factor = requireFinite('R_CAP_FAC', Number(source.R_CAP_FAC));
    const g = requireFinite('G', Number(source.G));
    const c2 = requireFinite('C2', Number(source.C2));
    if (!(mass > 0) || !(factor > 0) || !(g > 0) || !(c2 > 0)) {
      throw new Error('CaptureSurface physical inputs must be positive');
    }
    // CARTESIAN_SPHERE_AUTHORITY: R_CAP_FAC originates from the PN radial
    // softening/model-validity cap and is reused as a numerical/model
    // termination boundary. It is not a Kerr horizon or constant-KS-r surface.
    // Keep the established operation order for behaviour-preserving reuse.
    return factor * (2 * g * mass / c2);
  }

  function radius(bhMass) {
    return radiusFromValues(bhMass, Constants);
  }

  function radiusHatted() {
    if (!Constants) throw new Error('CaptureSurface constants are unavailable');
    const factor = requireFinite('R_CAP_FAC', Number(Constants.R_CAP_FAC));
    if (!(factor > 0)) throw new Error('CaptureSurface R_CAP_FAC must be positive');
    // Product Kerr uses M=1, hence Rs=2M in hatted units.
    return factor * 2;
  }

  function contains(dx, dy, dz, rcap) {
    if (![dx, dy, dz, rcap].every(Number.isFinite) || !(rcap >= 0)) return false;
    return Math.hypot(dx, dy, dz) <= rcap;
  }

  function component(point, index, key) {
    if (Array.isArray(point) || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(point))) return point[index];
    if (point && typeof point === 'object') return point[key];
    return undefined;
  }

  function chordCrossing(p0Input, deltaInput, rcapInput) {
    const rcap = Number(rcapInput);
    const p0x = Number(component(p0Input, 0, 'x'));
    const p0y = Number(component(p0Input, 1, 'y'));
    const p0z = Number(component(p0Input, 2, 'z'));
    const dxInput = Number(component(deltaInput, 0, 'x'));
    const dyInput = Number(component(deltaInput, 1, 'y'));
    const dzInput = Number(component(deltaInput, 2, 'z'));
    if (![p0x, p0y, p0z, dxInput, dyInput, dzInput].every(Number.isFinite) ||
      !Number.isFinite(rcap) || !(rcap > 0)) {
      return { status: INVALID_PRECONDITION };
    }

    const px = p0x / rcap, py = p0y / rcap, pz = p0z / rcap;
    const dx = dxInput / rcap, dy = dyInput / rcap, dz = dzInput / rcap;
    const A = dx * dx + dy * dy + dz * dz;
    const B = 2 * (px * dx + py * dy + pz * dz);
    const C = px * px + py * py + pz * pz - 1;
    if (![A, B, C].every(Number.isFinite)) return { status: INVALID_PRECONDITION };

    const boundaryScale = Math.max(1, Math.abs(px * px + py * py + pz * pz));
    const boundaryTol = 8 * EPS * boundaryScale;
    if (C < -boundaryTol) return { status: INVALID_PRECONDITION };
    if (C < 0) {
      // A tiny negative C is boundary round-off, not evidence of a missed
      // earlier crossing. Exact boundary contact is terminal by product rule.
      return { status: ENTER_EVENT, theta: 0 };
    }
    if (C === 0) return { status: ENTER_EVENT, theta: 0 };
    if (A === 0) return { status: NO_EVENT };

    const thetaStar = Math.max(0, Math.min(1, -B / (2 * A)));
    const gStar = A * thetaStar * thetaStar + B * thetaStar + C;
    if (!Number.isFinite(thetaStar) || !Number.isFinite(gStar)) return { status: INVALID_PRECONDITION };
    if (gStar > 0) return { status: NO_EVENT };

    let discriminant = B * B - 4 * A * C;
    if (!Number.isFinite(discriminant)) return { status: INVALID_PRECONDITION };
    const discriminantTol = 4 * EPS * Math.max(B * B, 4 * Math.abs(A * C));
    if (discriminant < 0) {
      if (discriminant >= -discriminantTol) discriminant = 0;
      else return { status: INVALID_PRECONDITION };
    }
    const sqrtD = Math.sqrt(discriminant);
    const signB = B >= 0 ? 1 : -1;
    const q = -0.5 * (B + signB * sqrtD);
    const t1 = q / A;
    const t2 = q !== 0 ? C / q : t1;
    let thetaEnter = Math.min(t1, t2);
    if (!Number.isFinite(thetaEnter)) return { status: INVALID_PRECONDITION };
    const endpointTol = 8 * EPS * Math.max(1, Math.abs(thetaEnter));
    if (thetaEnter < 0) {
      if (thetaEnter >= -endpointTol) thetaEnter = 0;
      else return { status: NO_EVENT };
    }
    if (thetaEnter > 1) {
      if (thetaEnter <= 1 + endpointTol) thetaEnter = 1;
      else return { status: NO_EVENT };
    }
    return { status: ENTER_EVENT, theta: thetaEnter };
  }

  SGRA.Physics.CaptureSurface = Object.freeze({
    NO_EVENT,
    ENTER_EVENT,
    INVALID_PRECONDITION,
    radius,
    radiusFromValues,
    radiusHatted,
    contains,
    chordCrossing
  });
})(typeof window !== 'undefined' ? window : globalThis);
