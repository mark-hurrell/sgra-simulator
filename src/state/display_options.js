// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachDisplayOptions(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  const D = SGRA.State.StateDescriptors;

  // SGRA-SPEC-001 B-3B §8 — DisplayOptions owns every visual toggle.
  //
  // showScientificAnnotations resolves B2-OPEN-1 under PO-B2-3. Before B-3B the
  // scientific annotation family was gated on showGlow, so turning the backdrop
  // glow off also removed the R_s / ISCO / capture / PN-validity markers. That
  // was accepted only as a temporary B-2 transitional state. The two are now
  // fully independent:
  //
  //   showGlow                   -> backdrop glow only
  //   showScientificAnnotations  -> the five scientific markers only
  //
  // showFlowAxis / showSpinAxis are still DECLARED and INACTIVE. Nothing
  // reads them and nothing renders from them; they exist so Phase C does not
  // have to renegotiate display ownership. showDisc was activated by
  // SGRA-ADL-STYLISED-DISC-SPEC.md v2 and re-pointed at the in-scene raster
  // disc by SGRA-DISC-REVISION-PLAN-v3 — see its descriptor note below.

  const SCHEMA_VERSION = 2;

  const DESCRIPTORS = Object.freeze([
    D.defineDescriptor({
      key: 'showOrbits',
      owner: 'DisplayOptions',
      type: 'boolean',
      default: false,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bOrbits', 'bOrbitsM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'showTrails',
      owner: 'DisplayOptions',
      type: 'boolean',
      default: true,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bTrails', 'bTrailsM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'showLabels',
      owner: 'DisplayOptions',
      type: 'boolean',
      default: true,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bLabels', 'bLabelsM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'showGlow',
      owner: 'DisplayOptions',
      type: 'boolean',
      default: false,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bGlow', 'bGlowM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION,
      note: 'Backdrop glow ONLY. It no longer gates the scientific annotation family.'
    }),
    D.defineDescriptor({
      key: 'showScientificAnnotations',
      owner: 'DisplayOptions',
      type: 'boolean',
      default: true,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bScientificAnnotations', 'bScientificAnnotationsM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION,
      note: 'Owns visibility of R_s, ISCO, capture radius and the PN validity boundaries. ' +
        'Resolves B2-OPEN-1 under PO-B2-3.'
    }),
    // ---- Declared, inactive. No GUI control, nothing renders from these. ----
    D.defineDescriptor({
      key: 'showDisc',
      owner: 'DisplayOptions',
      type: 'boolean',
      default: true,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bDisc', 'bDiscM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION,
      note: 'Gates the in-scene stylised accretion disc (SGRA-DISC-REVISION-PLAN-v3), ' +
        'rendered at the black hole itself, replacing the v2 corner-panel inset. ' +
        'discFar/discNear remain empty seams, untouched by this feature. ' +
        'default:true is a PO-6 decision (SGRA-SPEC-001-PO-RULINGS.md, PROPOSED/pending ' +
        'ratification), NOT a requirement of the spec, which is silent on the default value.'
    }),
    D.defineDescriptor({
      key: 'showFlowAxis',
      owner: 'DisplayOptions',
      type: 'boolean',
      default: false,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Phase C. Declared only; the flowSpinAxes seam remains empty.'
    }),
    D.defineDescriptor({
      key: 'showSpinAxis',
      owner: 'DisplayOptions',
      type: 'boolean',
      default: false,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'future-feature-inactive',
      schemaVersion: SCHEMA_VERSION,
      note: 'Phase C. Flow axis and spin axis are separate indicators with separate toggles.'
    }),
    D.defineDescriptor({
      key: 'showSpinMesh',
      owner: 'DisplayOptions',
      type: 'boolean',
      default: false,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bSpinMesh', 'bSpinMeshM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION,
      note: 'Optional static frame-dragging mesh prototype; no spin physics.'
    })
  ]);

  const registration = D.registry.register('DisplayOptions', DESCRIPTORS);

  function createDisplayOptions() {
    let orbits = true;
    let trails = true;
    let labels = true;
    let glow = false;
    let scientificAnnotations = true;
    // Future display flags. Held so the descriptor set is honest about where
    // the value lives, but no renderer consumes them in B-3B.
    let disc = true;
    let flowAxis = false;
    let spinAxis = false;
    let spinMesh = false;
    const pathDebug = {
      showHistoricalTrails: true,
      showPredictionPaths: true,
      showOsculatingOrbits: true,
      showReferenceOrbits: true
    };

    // ---- existing public wrappers, unchanged ----
    function showOrbits() { return orbits; }
    function showTrails() { return trails; }
    function showLabels() { return labels; }
    function showGlow() { return glow; }

    function setOrbits(value) { orbits = !!value; return orbits; }
    function setTrails(value) { trails = !!value; return trails; }
    function setLabels(value) { labels = !!value; return labels; }
    function setGlow(value) { glow = !!value; return glow; }

    function toggleOrbits() { return setOrbits(!orbits); }
    function toggleTrails() { return setTrails(!trails); }
    function toggleLabels() { return setLabels(!labels); }
    function toggleGlow() { return setGlow(!glow); }

    // ---- new in B-3B ----
    function showScientificAnnotations() { return scientificAnnotations; }
    function setScientificAnnotations(value) { scientificAnnotations = !!value; return scientificAnnotations; }
    function toggleScientificAnnotations() { return setScientificAnnotations(!scientificAnnotations); }

    function showDisc() { return disc; }
    function setDisc(value) { disc = !!value; return disc; }
    function toggleDisc() { return setDisc(!disc); }
    function showFlowAxis() { return flowAxis; }
    function showSpinAxis() { return spinAxis; }
    function showSpinMesh() { return spinMesh; }
    function setSpinMesh(value) { spinMesh = !!value; return spinMesh; }
    function toggleSpinMesh() { return setSpinMesh(!spinMesh); }

    function pathDebugFlags() { return pathDebug; }

    function debugSnapshot() {
      return {
        showOrbits: orbits,
        showTrails: trails,
        showLabels: labels,
        showGlow: glow,
        showScientificAnnotations: scientificAnnotations,
        showDisc: disc,
        showFlowAxis: flowAxis,
        showSpinAxis: spinAxis,
        showSpinMesh: spinMesh,
        schemaVersion: SCHEMA_VERSION,
        pathDebug: { ...pathDebug }
      };
    }

    function reset() {
      orbits = true;
      trails = true;
      labels = true;
      glow = true;
      scientificAnnotations = true;
      disc = true;
      flowAxis = false;
      spinAxis = false;
      spinMesh = false;
      pathDebug.showHistoricalTrails = true;
      pathDebug.showPredictionPaths = true;
      pathDebug.showOsculatingOrbits = true;
      pathDebug.showReferenceOrbits = true;
    }

    function descriptors() { return registration.all(); }
    function descriptorFor(key) { return registration.get(key); }
    function ownedKeys() { return registration.keys; }

    return Object.freeze({
      showOrbits,
      showTrails,
      showLabels,
      showGlow,
      showScientificAnnotations,
      showDisc,
      showFlowAxis,
      showSpinAxis,
      showSpinMesh,
      setSpinMesh,
      toggleSpinMesh,
      setOrbits,
      setTrails,
      setLabels,
      setGlow,
      setScientificAnnotations,
      setDisc,
      toggleOrbits,
      toggleTrails,
      toggleLabels,
      toggleGlow,
      toggleScientificAnnotations,
      toggleDisc,
      pathDebugFlags,
      debugSnapshot,
      reset,
      descriptors,
      descriptorFor,
      ownedKeys,
      SCHEMA_VERSION
    });
  }

  SGRA.State.DisplayOptions = Object.freeze({
    createDisplayOptions,
    DESCRIPTORS,
    SCHEMA_VERSION
  });
})(globalThis);
