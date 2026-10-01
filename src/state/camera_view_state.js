// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachCameraViewState(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.State = SGRA.State || {};

  const D = SGRA.State.StateDescriptors;

  // SGRA-SPEC-001 B-3B §10 — Camera/ViewState.
  //
  // This owner holds the VIEW MODE and the declared canonical viewpoints. It
  // does NOT rewrite camera mathematics: rotation, zoom, clamping and target
  // following stay in src/camera/camera_controller.js, which remains the sole
  // owner of yaw/pitch/dist/target arithmetic. This module records which named
  // view the user is in and mirrors the camera values for diagnostics.
  //
  // The mode is EXPLICIT STATE. It is never inferred by comparing floats
  // against START_VIEW/EARTH_VIEW, because floating-point drift after a single
  // pointer move would silently reclassify the mode.

  const SCHEMA_VERSION = 1;
  const FRAME_CONVENTION_VERSION = 2;
  const FRAME_CONVENTION_ID = 'SGRA-FRAME-CONV-B3B';

  const START_VIEW = D.deepFreeze({ yaw: 0.7, pitch: 0.45 });
  const EARTH_VIEW = D.deepFreeze({ yaw: 0, pitch: 0 });

  const MODES = Object.freeze(['start-inspection', 'earth-observer', 'free-inspection']);

  const MODE_LABELS = D.deepFreeze({
    'start-inspection': 'Start 3D inspection',
    'earth-observer': 'Earth-observer view',
    'free-inspection': 'Free 3D inspection — virtual viewpoint'
  });

  // SGRA-SPEC-001-FRAME-CONVENTION v2 (B-3B canonical closure, PO-B3B-2).
  //
  // celestial_north_sign / celestial_east_sign are a DISPLAY LABEL, ratified
  // by Product Owner ruling PO-B3B-2, not a claim derived from any physical
  // orientation measurement of Sgr A* or the Galactic Center. They apply
  // ONLY to the Earth-observer view's screen presentation.
  //
  // Derivation from the unmodified rot()/irot()/projectBH() math in
  // src/render/camera_projection.js, evaluated at EARTH_VIEW (yaw=0,
  // pitch=0), where cy=1, sy=0, cp=1, sp=0:
  //   px = x, py = y, pz = z  (post-rotation, pre-perspective)
  //   screen_x = W/2 + F*px/ze   -> world +x increases screen_x (rightward)
  //   screen_y = H/2 - F*py/ze   -> world +y DECREASES screen_y, i.e.
  //                                 moves upward in the usual raster sense
  //                                 (row 0 at top)
  //   ze = dist - pz             -> world +z moves the point toward the
  //                                 camera (smaller depth); the camera's
  //                                 line-of-sight into the scene is -z.
  //
  // PO-B3B-2 requires: north -> up, east -> left, west -> right, at
  // EARTH_VIEW. World +y already renders upward with no code change, so
  // +y is declared celestial north. World +x already renders rightward
  // with no code change, so +x is declared celestial WEST (not east) --
  // the only labelling of the two available that satisfies the ruling
  // without touching rot()/irot()/projectBH(). Celestial east is
  // therefore world -x.
  //
  // Caveat recorded, not resolved, by this declaration: bench/
  // s301_sky_projection.mjs names its output fields ra_offset_mas (= world
  // x, unflipped) and dec_offset_mas (= world y, unflipped). Read as raw
  // numeric offsets this is consistent with +y = north = +Dec; read as a
  // claim that +x = +RA = east, it is the OPPOSITE of the +x = west label
  // declared here. That module is a validation-only RA/Dec fixture
  // comparison, is not wired into camera_projection.js, and does not
  // itself assert a screen direction, so this is a naming caveat for a
  // future pass, not a contradiction this closure is blocked by. See
  // SGRA-SPEC-001-FRAME-CONVENTION.md §7.
  const FRAME_DECLARATION = D.deepFreeze({
    frame_convention_id: FRAME_CONVENTION_ID,
    frame_convention_version: FRAME_CONVENTION_VERSION,
    world_axes: 'x, y, z as used by src/render/camera_projection.js rot()/irot()',
    handedness: 'right-handed',
    positive_line_of_sight: 'world -z at EARTH_VIEW (camera sits at +z, looks toward -z)',
    earth_observer_camera_direction: '-z (world, at yaw=0, pitch=0)',
    screen_x_direction: 'world +x (unchanged, no projection flip)',
    screen_y_direction: 'world +y, inverted for raster row order (row 0 = top)',
    celestial_north_sign: '+y',
    celestial_east_sign: '-x',
    celestial_west_sign: '+x',
    position_angle_convention: 'measured east of north: PA = atan2(-x, y) in world coordinates at EARTH_VIEW',
    status: 'EARTH_OBSERVER_DISPLAY_CONVENTION_DECLARED',
    ruling: 'PO-B3B-2',
    required_before: Object.freeze(['A-0']),
    note:
      'This is a projection/reproducibility display convention only (PO-B3B-2). It does not ' +
      'claim celestial north is physically preferred, that Sgr A* spin is aligned with it, or ' +
      'that the accretion flow and black-hole spin are aligned. Spin magnitude remains 0 and ' +
      'orientation remains unselected (PO-B3B-1). The known-star apparent-rotation gate ' +
      '(source-derived, not this declaration) remains separately pending -- see ' +
      'SGRA-SPEC-001-FRAME-CONVENTION.md.'
  });

  const DESCRIPTORS = Object.freeze([
    D.defineDescriptor({
      key: 'viewMode',
      owner: 'CameraViewState',
      type: 'enum',
      allowedValues: MODES,
      default: 'start-inspection',
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: ['bHome', 'bHomeM', 'bEarthView', 'bEarthViewM', 'bPlane', 'bPlaneM'],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION,
      note: 'Explicit state. Never inferred from a float comparison against START_VIEW/EARTH_VIEW.'
    }),
    D.defineDescriptor({
      key: 'cameraYaw',
      owner: 'CameraViewState',
      type: 'number',
      default: 0.7,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION,
      note: 'Mirror of camera_controller yaw for diagnostics. The controller owns the arithmetic.'
    }),
    D.defineDescriptor({
      key: 'cameraPitch',
      owner: 'CameraViewState',
      type: 'number',
      default: 0.45,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'cameraDistance',
      owner: 'CameraViewState',
      type: 'number',
      default: 9000,
      validate: v => v > 0,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'cameraTarget',
      owner: 'CameraViewState',
      type: 'object',
      default: { x: 0, y: 0, z: 0 },
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'reset-to-default',
      controlBindingIds: [],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION
    }),
    D.defineDescriptor({
      key: 'frameConventionVersion',
      owner: 'CameraViewState',
      type: 'integer',
      default: FRAME_CONVENTION_VERSION,
      validate: v => v >= 1,
      persistence: 'not-persisted-yet',
      diagnostic: 'included',
      reset: 'preserved-across-reset',
      controlBindingIds: [],
      activationKind: 'immediate',
      schemaVersion: SCHEMA_VERSION
    })
  ]);

  const registration = D.registry.register('CameraViewState', DESCRIPTORS);

  function createCameraViewState() {
    let viewMode = 'start-inspection';
    const camera = { yaw: START_VIEW.yaw, pitch: START_VIEW.pitch, dist: 9000, tx: 0, ty: 0, tz: 0 };

    function getViewMode() { return viewMode; }
    function getViewModeLabel() { return MODE_LABELS[viewMode]; }

    function setViewMode(mode) {
      if (MODES.indexOf(mode) < 0) throw new Error(`unknown view mode: ${mode}`);
      viewMode = mode;
      return viewMode;
    }

    // Named transitions. Each returns the orientation the caller should apply
    // through camera_controller; this module never does the trigonometry.
    function enterStartInspection() { viewMode = 'start-inspection'; return START_VIEW; }
    function enterEarthObserver() { viewMode = 'earth-observer'; return EARTH_VIEW; }
    function enterFreeInspection() { viewMode = 'free-inspection'; return null; }

    // Called on manual camera movement (drag, wheel, orbit-plane alignment).
    // Idempotent: repeated manual movement inside free-inspection is a no-op.
    function noteManualCameraChange() {
      if (viewMode !== 'free-inspection') viewMode = 'free-inspection';
      return viewMode;
    }

    function syncFromCamera(snapshot) {
      if (!snapshot) return;
      camera.yaw = snapshot.yaw;
      camera.pitch = snapshot.pitch;
      camera.dist = snapshot.dist;
      camera.tx = snapshot.tx;
      camera.ty = snapshot.ty;
      camera.tz = snapshot.tz;
    }

    function reset() {
      viewMode = 'start-inspection';
      camera.yaw = START_VIEW.yaw;
      camera.pitch = START_VIEW.pitch;
      camera.dist = 9000;
      camera.tx = 0; camera.ty = 0; camera.tz = 0;
    }

    function snapshot() {
      return {
        viewMode,
        viewModeLabel: MODE_LABELS[viewMode],
        cameraYaw: camera.yaw,
        cameraPitch: camera.pitch,
        cameraDistance: camera.dist,
        cameraTarget: { x: camera.tx, y: camera.ty, z: camera.tz },
        frameConventionId: FRAME_CONVENTION_ID,
        frameConventionVersion: FRAME_CONVENTION_VERSION,
        frameDeclaration: FRAME_DECLARATION,
        schemaVersion: SCHEMA_VERSION
      };
    }

    function descriptors() { return registration.all(); }
    function descriptorFor(key) { return registration.get(key); }
    function ownedKeys() { return registration.keys; }

    return Object.freeze({
      getViewMode,
      getViewModeLabel,
      setViewMode,
      enterStartInspection,
      enterEarthObserver,
      enterFreeInspection,
      noteManualCameraChange,
      syncFromCamera,
      reset,
      snapshot,
      descriptors,
      descriptorFor,
      ownedKeys,
      START_VIEW,
      EARTH_VIEW,
      MODES,
      MODE_LABELS,
      FRAME_DECLARATION,
      SCHEMA_VERSION
    });
  }

  SGRA.State.CameraViewState = Object.freeze({
    createCameraViewState,
    DESCRIPTORS,
    START_VIEW,
    EARTH_VIEW,
    MODES,
    MODE_LABELS,
    FRAME_DECLARATION,
    SCHEMA_VERSION,
    FRAME_CONVENTION_VERSION,
    FRAME_CONVENTION_ID
  });
})(typeof window !== 'undefined' ? window : globalThis);
