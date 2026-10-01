// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachCentralFidelityOwnership(global) {
  'use strict';
  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.Physics = SGRA.Physics || {};

  const CLASSIFIER = Object.freeze({ N_SAFE: 'N_SAFE', KERR_REQUIRED: 'KERR_REQUIRED', UNCERTAIN: 'UNCERTAIN' });
  // STATE values are the only strings ever written to state.owner (persisted
  // ownership). KERR_PROMOTED remains in this enum only for the separate,
  // still-unreachable promote() function below and existing consumers.
  const STATE = Object.freeze({ N: 'N', KERR: 'KERR', KERR_PROMOTED: 'KERR_PROMOTED', KERR_ACTIVE: 'KERR_ACTIVE', KERR_ADMISSION_FAILED: 'KERR_ADMISSION_FAILED', KERR_INTEGRATION_FAILED: 'KERR_INTEGRATION_FAILED', OUT_OF_SUPPORTED_DOMAIN: 'OUT_OF_SUPPORTED_DOMAIN' });
  const ACTION = Object.freeze({
    STAY_N: 'STAY_N',
    PROMOTE_KERR_REQUIRED: 'PROMOTE_KERR_REQUIRED',
    PROMOTE_UNCERTAIN: 'PROMOTE_UNCERTAIN',
    EXIT_PENDING: 'EXIT_PENDING',
    DEMOTE_ORDINARY: 'DEMOTE_ORDINARY',
    ALREADY_KERR: 'ALREADY_KERR'
  });

  // Ownership-only persistence. This is deliberately not a physics gate:
  // the existing classifier remains the sole source of N_SAFE/KERR_REQUIRED.
  // Two consecutive safe decisions prevent a one-sample classifier excursion
  // from chattering ownership while keeping re-entry immediate.
  const EXIT_SAFE_CONFIRMATIONS = 2;

  let ownershipInvariantEnforced = true;
  function setOwnershipInvariantEnforcement(enabled) {
    ownershipInvariantEnforced = enabled !== false;
    return ownershipInvariantEnforced;
  }
  function isOwnershipInvariantEnforced() { return ownershipInvariantEnforced; }
  function missingOwnershipState() {
    if (ownershipInvariantEnforced) {
      const error = new Error('OWNERSHIP_STATE_MISSING: CentralFidelityOwnership.decide() called with no body.__fidelityOwnership record.');
      error.code = 'OWNERSHIP_STATE_MISSING';
      throw error;
    }
    return { classifier: CLASSIFIER.UNCERTAIN, owner: undefined, action: ACTION.STAY_N };
  }

  function finiteState(body, bh) {
    if (!body || !bh) return false;
    return [body.x, body.y, body.z, body.vx, body.vy, body.vz, body.m, bh.x, bh.y, bh.z, bh.vx, bh.vy, bh.vz, bh.m].every(Number.isFinite);
  }

  function classify(body, bh, orbitalMath) {
    if (!finiteState(body, bh) || !orbitalMath || typeof orbitalMath.oscElements !== 'function') return CLASSIFIER.UNCERTAIN;
    let el;
    try { el = orbitalMath.oscElements(body, bh, false); } catch (_) { return CLASSIFIER.UNCERTAIN; }
    if (!el || !Number.isFinite(el.a) || !Number.isFinite(el.e) || el.a <= 0 || el.e < 0 || el.e >= 1 || !Number.isFinite(el.conf) || el.conf < 0.75) return CLASSIFIER.UNCERTAIN;
    const rPeri = el.a * (1 - el.e);
    const G = SGRA.Domain?.Constants?.G;
    const C2 = SGRA.Domain?.Constants?.C2;
    if (!Number.isFinite(G) || !Number.isFinite(C2)) {
      throw new Error('CentralFidelityOwnership.classify: SGRA.Domain.Constants.G/C2 are unavailable (should have been caught at startup)');
    }
    const rs = Math.abs(2 * G * bh.m / C2);
    if (!Number.isFinite(rPeri) || !Number.isFinite(rs) || rs <= 0) return CLASSIFIER.UNCERTAIN;
    // Conservative product ownership rule: only a well-conditioned bound
    // osculating orbit with a periapsis at least 100 Schwarzschild radii away
    // remains cheap-owned. This is a safety gate, not a universal physics law.
    return rPeri > 100 * rs && el.e < 0.8 ? CLASSIFIER.N_SAFE : CLASSIFIER.KERR_REQUIRED;
  }

  function createBodyState(bodyId) {
    return { bodyId, owner: STATE.N, classifier: CLASSIFIER.UNCERTAIN, promotionTime: null, failure: null, safeExitStreak: 0, demotionTime: null };
  }

  function decide(state, body, bh, orbitalMath, simT) {
    if (!state) return missingOwnershipState();
    const failureOwner = state.owner === STATE.KERR_ADMISSION_FAILED
      || state.owner === STATE.KERR_INTEGRATION_FAILED
      || state.owner === STATE.OUT_OF_SUPPORTED_DOMAIN;
    if (failureOwner) {
      return { classifier: state.classifier, owner: state.owner, action: ACTION.ALREADY_KERR };
    }
    const classifier = classify(body, bh, orbitalMath);
    state.classifier = classifier;
    const incumbent = state.owner === STATE.KERR || state.owner === STATE.KERR_PROMOTED || state.owner === STATE.KERR_ACTIVE;
    if (incumbent) {
      if (classifier === CLASSIFIER.KERR_REQUIRED) {
        state.safeExitStreak = 0;
        return { classifier, owner: state.owner, action: ACTION.ALREADY_KERR };
      }
      if (classifier !== CLASSIFIER.N_SAFE) {
        state.safeExitStreak = 0;
        return { classifier, owner: state.owner, action: ACTION.ALREADY_KERR };
      }
      state.safeExitStreak = (state.safeExitStreak || 0) + 1;
      if (state.safeExitStreak < EXIT_SAFE_CONFIRMATIONS) {
        return { classifier, owner: state.owner, action: ACTION.EXIT_PENDING };
      }
      state.owner = STATE.N;
      state.safeExitStreak = 0;
      state.demotionTime = simT ?? null;
      return { classifier, owner: state.owner, action: ACTION.DEMOTE_ORDINARY };
    }
    if (classifier === CLASSIFIER.N_SAFE) { state.owner = STATE.N; return { classifier, owner: STATE.N, action: ACTION.STAY_N }; }
    if (classifier === CLASSIFIER.KERR_REQUIRED) return { classifier, owner: STATE.N, action: ACTION.PROMOTE_KERR_REQUIRED };
    return { classifier, owner: STATE.N, action: ACTION.PROMOTE_UNCERTAIN };
  }

  function promote(state, body, bh, simT, adapter) {
    if (!state || !body || !bh) throw new Error('KERR promotion requires state, body, and central body');
    if (state.owner === STATE.KERR || state.owner === STATE.KERR_PROMOTED || state.owner === STATE.KERR_ACTIVE) return { ok: true, state: state.owner, promoted: false };
    if (!adapter || typeof adapter.admit !== 'function' || typeof adapter.integrate !== 'function') { state.failure = 'KERR_INTEGRATION_FAILED'; state.owner = STATE.KERR_INTEGRATION_FAILED; return { ok: false, state: state.owner, reason: 'Kerr adapter unavailable' }; }
    const snapshot = { x: body.x, y: body.y, z: body.z, vx: body.vx, vy: body.vy, vz: body.vz, m: body.m, t: simT };
    let admission;
    try { admission = adapter.admit(snapshot, bh); } catch (error) { state.failure = 'KERR_ADMISSION_FAILED'; state.owner = STATE.KERR_ADMISSION_FAILED; return { ok: false, state: state.owner, reason: error.message }; }
    if (!admission || admission.admitted !== true) { state.failure = 'KERR_ADMISSION_FAILED'; state.owner = STATE.KERR_ADMISSION_FAILED; return { ok: false, state: state.owner, reason: admission?.reason || 'admission rejected' }; }
    try { adapter.integrate(snapshot, admission, simT); } catch (error) { state.failure = 'KERR_INTEGRATION_FAILED'; state.owner = STATE.KERR_INTEGRATION_FAILED; return { ok: false, state: state.owner, reason: error.message }; }
    state.owner = STATE.KERR_PROMOTED; state.promotionTime = simT; state.failure = null;
    return { ok: true, state: state.owner, promoted: true, discontinuity: { position: 0, velocity: 0, time: 0 } };
  }

  SGRA.Physics.CentralFidelityOwnership = Object.freeze({ CLASSIFIER, STATE, ACTION, EXIT_SAFE_CONFIRMATIONS, classify, createBodyState, decide, promote, setOwnershipInvariantEnforcement, isOwnershipInvariantEnforced });
})(typeof window !== 'undefined' ? window : globalThis);
