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

  const BODY_BH = 1 << 0;
  const BODY_SSTAR = 1 << 1;
  const BODY_INTRUDER = 1 << 2;
  const BODY_FIELD = 1 << 3;
  const BODY_CAPTURED = 1 << 4;
  const BODY_RENDERONLY = 1 << 5;
  // Bit-packed result of pairInteraction, for use in O(n^2) inner loops where
  // the object allocation dominates. Bit 0 = include, bit 1 = backreact.
  // Must stay behaviourally identical to pairInteraction() above.
  const PAIR_INCLUDE = 1 << 0;
  const PAIR_BACKREACT = 1 << 1;

  function pairInteraction(a, b) {
    if (a.bh && b.bh) return { include: false, backreact: false };
    if (a.bh || b.bh) {
      const other = a.bh ? b : a;
      if (other.field) {
        return { include: true, backreact: false };
      }
      return { include: true, backreact: true };
    }
    if (a.field || b.field) {
      return { include: false, backreact: false };
    }
    return { include: true, backreact: true };
  }

  function pairInteractionCode(a, b) {
    if (a.bh && b.bh) return 0;
    if (a.bh || b.bh) {
      const other = a.bh ? b : a;
      return other.field ? PAIR_INCLUDE : (PAIR_INCLUDE | PAIR_BACKREACT);
    }
    if (a.field || b.field) return 0;
    return PAIR_INCLUDE | PAIR_BACKREACT;
  }

  function hasRole(b, roleName) {
    switch (roleName) {
      case 'bh':
        return !!b.bh;
      case 'sstar':
        return !!b.star && !b.intr && !b.field && !b.bh;
      case 'intruder':
        return !!b.intr;
      case 'field':
        return !!b.field;
      default:
        return false;
    }
  }

  function bodyFlagsFromBody(b) {
    let flags = 0;
    if (b.bh) flags |= BODY_BH;
    if (b.star) flags |= BODY_SSTAR;
    if (b.intr) flags |= BODY_INTRUDER;
    if (b.field) flags |= BODY_FIELD;
    if (b.captured) flags |= BODY_CAPTURED;
    if (b.renderOnly) flags |= BODY_RENDERONLY;
    return flags >>> 0;
  }

  SGRA.Domain.BodyRoles = {
    BODY_BH,
    BODY_SSTAR,
    BODY_INTRUDER,
    BODY_FIELD,
    BODY_CAPTURED,
    BODY_RENDERONLY,
    PAIR_INCLUDE,
    PAIR_BACKREACT,
    pairInteraction,
    pairInteractionCode,
    hasRole,
    bodyFlagsFromBody
  };
})(window);
