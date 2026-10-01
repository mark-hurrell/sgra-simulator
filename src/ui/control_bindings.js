// Sgr A* Simulator
// Developed by Mark Hurrell in collaboration with
// ChatGPT (OpenAI) and Claude / Claude Opus (Anthropic).
//
// Scientific methodology, numerical methods, architecture,
// implementation and validation were developed through
// iterative human–AI collaboration.

(function attachControlBindings(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  function bindControls(root, actions) {
    const doc = root && root.getElementById ? root : global.document;
    const get = id => doc.getElementById(id);
    const setPressed = (element, on) => {
      element.classList.toggle('on', on);
      element.setAttribute('aria-pressed', String(on));
    };
    const setPlay = on => {
      for (const id of ['bPlay', 'bPlayM']) {
        const button = get(id);
        if (!button) continue;
        button.textContent = id === 'bPlayM' ? (on ? 'Ⅱ Pause' : '▶ Run') : (on ? '⏸' : '▶');
        button.setAttribute('aria-pressed', String(on));
        button.title = on ? 'Pause simulation (Space)' : 'Play simulation (Space)';
        button.setAttribute('aria-label', id === 'bPlayM' ? (on ? 'Pause simulation' : 'Run simulation') : (on ? 'Pause simulation' : 'Play simulation'));
      }
    };
    const setSpeed = value => {
      const result = actions.setSpeed(value);
      get('sSpeed').value = value;
      for (const id of ['sPreset', 'sPresetM']) {
        const preset = get(id);
        if (!preset) continue;
        const named = Array.from(preset.options).some(option => option.value === String(value) && option.value !== 'custom');
        preset.value = named ? String(value) : 'custom';
      }
      const output = result < 1 ? `${result.toFixed(2)} yr/s` : `${result.toFixed(1)} yr/s`;
      get('oSpeed').textContent = output;
      const mobileSpeed = get('sSpeedM');
      const mobileOutput = get('oSpeedM');
      if (mobileSpeed) mobileSpeed.value = value;
      if (mobileOutput) mobileOutput.textContent = output;
    };
    const syncIntegratorMode = () => {
      if (typeof actions.syncIntegratorMode === 'function') actions.syncIntegratorMode();
    };
    const syncLaunchUi = () => {
      const active = typeof actions.isLaunchActive === 'function' && actions.isLaunchActive();
      for (const id of ['bLaunch', 'bLaunchM', 'bLaunchSandboxM']) {
        const button = get(id);
        if (!button) continue;
        button.classList.toggle('on', active);
        button.setAttribute('aria-pressed', String(active));
        button.textContent = active ? 'Launch intruder: on' : 'Launch intruder';
        button.setAttribute('aria-label', active ? 'Launch intruder: on' : 'Launch intruder');
      }
      const chips = get('chips');
      if (chips) chips.classList.toggle('show', active);
      if (doc.body) doc.body.classList.toggle('aiming-active', active);
    };
    const bindToggle = (ids, callback) => {
      const buttonIds = Array.isArray(ids) ? ids : [ids];
      const apply = () => {
        const on = callback();
        for (const id of buttonIds) {
          const button = get(id);
          if (button) setPressed(button, on);
        }
      };
      for (const id of buttonIds) get(id).addEventListener('click', apply);
    };
    const bindAction = (id, callback) => {
      const button = get(id);
      button.addEventListener('click', callback);
    };

    get('cX').addEventListener('click', actions.dismissFollow);
    get('bPlay').addEventListener('click', () => setPlay(actions.togglePlay()));
    get('sSpeed').addEventListener('input', event => setSpeed(event.target.value));
    get('sPreset').addEventListener('change', event => setSpeed(event.target.value));
    get('starSel').addEventListener('change', event => event.target.value === '__group__' && actions.followGroup ? actions.followGroup() : actions.setFollowBody(+event.target.value));
    bindToggle(['bOrbits', 'bOrbitsM'], actions.toggleOrbits);
    bindToggle(['bTrails', 'bTrailsM'], actions.toggleTrails);
    bindToggle(['bLabels', 'bLabelsM'], actions.toggleLabels);
    bindToggle(['bGlow', 'bGlowM'], actions.toggleGlow);
    bindToggle(['bScientificAnnotations', 'bScientificAnnotationsM'], actions.toggleScientificAnnotations);
    bindToggle(['bDisc', 'bDiscM'], actions.toggleDisc);
    bindToggle(['bSpinMesh', 'bSpinMeshM'], actions.toggleSpinMesh);
    // SCI-01B product domain: exact |a| = 1 is not a supported Adaptive-Kerr
    // capture state. Keep the configured value and its visible representation
    // below that boundary on every product control surface.
    const setSpinAStar = value => syncSpinUi(actions.setSpinAStar(value));
    const syncSpinUi = applied => {
      // A1-03: the slider can only represent magnitude, but a scenario can set
      // a retrograde axis (SGRA_SPIN_DIAG axis sign -1) that changes 1PN+LT and
      // Kerr frame dragging. Make that runtime fact observable in the readout
      // rather than presenting a retrograde hole as a plain a*.
      const axisSign = global.SGRA_SPIN_DIAG?.getAxisSign?.() === -1 ? -1 : 1;
      const text = `a*=${applied.toFixed(4)}${axisSign === -1 && applied > 0 ? ' (retrograde)' : ''}`;
      for (const [inputId, outputId] of [['sSpinAStar', 'oSpinAStar'], ['sSpinAStarM', 'oSpinAStarM'], ['sSpinAStarSandboxM', 'oSpinAStarSandboxM']]) {
        const input = get(inputId);
        const output = get(outputId);
        if (input) input.value = applied;
        if (output) output.textContent = text;
      }
    };
    for (const id of ['sSpinAStar', 'sSpinAStarM', 'sSpinAStarSandboxM']) {
      const slider = get(id);
      if (slider) slider.addEventListener('input', event => setSpinAStar(event.target.value));
    }
    bindAction('bPlane', actions.alignOrbitPlaneView);
    bindToggle(['bLeg', 'bLegM'], () => {
      const on = actions.toggleLegend();
      get('legend').style.display = on ? 'block' : 'none';
      return on;
    });
    bindToggle(['bCusp', 'bCuspM'], actions.toggleCusp);
    const fidelity = get('sFidelity');
    if (fidelity && typeof actions.setFidelityMode === 'function') fidelity.addEventListener('change', event => actions.setFidelityMode(event.target.value));
    const fidelitySandbox = get('sFidelitySandboxM');
    if (fidelitySandbox && typeof actions.setFidelityMode === 'function') fidelitySandbox.addEventListener('change', event => actions.setFidelityMode(event.target.value));
    get('bLaunch').addEventListener('click', () => {
      actions.toggleLaunch();
      syncLaunchUi();
    });
    get('chips').querySelectorAll('button[data-m]').forEach(button => {
      button.addEventListener('click', () => actions.setIntruderMass(+button.dataset.m));
    });
    get('sQual').addEventListener('change', event => actions.setQuality(event.target.value));
    const integratorMode = get('sIntegratorMode');
    if (integratorMode) {
      integratorMode.addEventListener('change', event => {
        actions.setIntegratorMode(event.target.value);
        syncIntegratorMode();
      });
    }
    get('bHome').addEventListener('click', actions.home);
    const earthView = get('bEarthView');
    if (earthView) earthView.addEventListener('click', actions.earthView);
    get('bReset').addEventListener('click', () => {
      actions.reset();
      syncLaunchUi();
    });

    const panel = get('mobilePanel');
    const scrim = get('scrim');
    const panelButton = get('bPanel');
    let panelReturnFocus = null;
    const closePanel = () => {
      panel.classList.remove('open'); scrim.classList.remove('open');
      panelButton.setAttribute('aria-expanded', 'false'); panelButton.classList.remove('on');
      const target = panelReturnFocus || panelButton;
      panelReturnFocus = null;
      target?.focus?.();
    };
    const openPanel = () => {
      panelReturnFocus = document.activeElement === document.body ? panelButton : document.activeElement;
      panel.__sgraReturnFocus = panelReturnFocus;
      panel.classList.add('open'); scrim.classList.add('open');
      panelButton.setAttribute('aria-expanded', 'true'); panelButton.classList.add('on');
      get('mobilePanelHeading')?.focus();
    };
    panelButton.addEventListener('click', () => panel.classList.contains('open') ? closePanel() : openPanel());
    scrim.addEventListener('click', closePanel);
    get('panelClose').addEventListener('click', closePanel);
    get('bPlayM').addEventListener('click', () => setPlay(actions.togglePlay()));
    get('sSpeedM').addEventListener('input', event => setSpeed(event.target.value));
    get('sPresetM').addEventListener('change', event => setSpeed(event.target.value));
    get('bHomeM').addEventListener('click', actions.home);
    const earthViewMobile = get('bEarthViewM');
    if (earthViewMobile) earthViewMobile.addEventListener('click', actions.earthView);
    get('bResetM').addEventListener('click', () => { get('bReset').click(); closePanel(); });
    get('sQualM').addEventListener('change', event => { get('sQual').value = event.target.value; get('sQual').dispatchEvent(new Event('change')); });
    const integratorModeMobile = get('sIntegratorModeM');
    if (integratorModeMobile && integratorMode) {
      integratorModeMobile.addEventListener('change', event => {
        integratorMode.value = event.target.value;
        integratorMode.dispatchEvent(new Event('change'));
      });
    }
    const fidelityMobile = get('sFidelityM');
    if (fidelityMobile && fidelity && typeof actions.setFidelityMode === 'function') fidelityMobile.addEventListener('change', event => {
      fidelity.value = event.target.value;
      fidelity.dispatchEvent(new Event('change'));
    });
    get('starSelM').addEventListener('change', event => { get('starSel').value = event.target.value; get('starSel').dispatchEvent(new Event('change')); });
    get('bPlaneM').addEventListener('click', () => {
      actions.alignOrbitPlaneView();
      closePanel();
    });
    get('bRotateLeftM').addEventListener('click', () => actions.mobileRotate(-24, 0, 'Rotate left'));
    get('bRotateRightM').addEventListener('click', () => actions.mobileRotate(24, 0, 'Rotate right'));
    get('bRotateUpM').addEventListener('click', () => actions.mobileRotate(0, -24, 'Rotate up'));
    get('bRotateDownM').addEventListener('click', () => actions.mobileRotate(0, 24, 'Rotate down'));
    get('bZoomInM').addEventListener('click', () => actions.mobileZoom(-24, 'Zoom in'));
    get('bZoomOutM').addEventListener('click', () => actions.mobileZoom(24, 'Zoom out'));
    get('bRecenterViewM').addEventListener('click', () => actions.mobileRecenter());
    get('bLaunchM').addEventListener('click', () => {
      actions.toggleLaunch();
      syncLaunchUi();
      if (actions.isLaunchActive()) closePanel();
    });
    const sandboxLaunch = get('bLaunchSandboxM');
    if (sandboxLaunch) sandboxLaunch.addEventListener('click', () => {
      actions.toggleLaunch();
      syncLaunchUi();
    });
    doc.querySelectorAll('#massrowM button[data-m]').forEach(button => {
      button.addEventListener('click', () => {
        actions.setIntruderMass(+button.dataset.m);
        doc.querySelectorAll('#massrowM button[data-m]').forEach(item => item.classList.toggle('on', item === button));
      });
    });

    if (typeof actions.isPlaying === 'function') setPlay(actions.isPlaying());
    actions.syncPlayUi = setPlay;
    if (typeof actions.getSpinAStar === 'function') actions.syncSpinUi = () => syncSpinUi(actions.getSpinAStar());
  }

  SGRA.UI.ControlBindings = Object.freeze({ bindControls });
})(typeof window !== 'undefined' ? window : globalThis);
