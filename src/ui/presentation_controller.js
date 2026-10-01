// Sgr A* Simulator
// HUD, object-list, inspector and presentation-surface controller.

(function attachPresentationController(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  /* eslint-disable max-lines-per-function -- presentation state and its DOM routes stay together */
  function create(options = {}) {
    const {
      $, document, getBodies, getApplicationMode, simulationClock, simulationOptions,
      transientEffects, getCamera, getFocalLength, schwarzschildRadius, bodyStore,
      selectionState, oscElements, relativityState, relWeight, weightCol, weightPos,
      uiElements, hudViewModel, hudView, followGroupDisplayState, intruders,
      interactionCommands, showCard, hideCard, announceStatus, statusPriority, statusCategory,
      cameraViewState, syncContinuousEligibility
    } = options;

    let sceneSummaryText = '';
    let sceneSummaryLastAt = -Infinity;
    let runtimeTruthAnnouncementKey = '';
    let lastViewModeBadge = null;
    const surfaceFocus = new Map();
    const groupFollowSurfaceState = { previousObjectOpen: null };
    const surfaceButtonIds = {
      objectListPanel: ['bObjects'],
      runtimeTruthPanel: ['bRuntimeStatus', 'bRuntimeStatusM']
    };

    function makeHudSnapshot() {
      const timestepStats = SGRA.Physics.LocalTimestepPolicy.getFrameStats();
      const timestepBits = [];
      if (simulationClock.isThrottled()) timestepBits.push('throttled');
      if (timestepStats.floorHits > 0) {
        timestepBits.push(`dt floor×${timestepStats.floorHits}${timestepStats.worstFloorRatio < 1 ? ` (${timestepStats.worstFloorRatio.toExponential(1)})` : ''}`);
      }
      const bodies = getBodies();
      const cam = getCamera();
      const snapshot = {
        epoch: options.epoch0 + simulationClock.getSimTime(), bodyCount: bodies.length - 1,
        grOn: simulationOptions.isGrEnabled(), blackHoleMass: bodies[0].m,
        captureCount: transientEffects.getCaptureCount(), throttled: simulationClock.isThrottled(),
        timestepWarning: timestepBits.length ? ` ·${timestepBits.join(' ·')}` : '',
        energyState: simulationOptions.isGrEnabled() ? 'gr' : simulationOptions.isCuspEnabled() ? 'cusp' : 'normal',
        energyDrift: 0, energyRoleDrifts: null, energyMaxRoleDrift: 0,
        scaleText: `${(100 * cam.dist / getFocalLength()).toFixed(0)} AU · Rₛ=${schwarzschildRadius().toFixed(3)} AU`, follow: null
      };
      if (snapshot.energyState === 'normal') {
        const currentEnergy = SGRA.Physics.LocalIntegrator.totalEnergy();
        const baselineEnergy = bodyStore.getBaselineEnergy();
        snapshot.energyDrift = Math.abs((currentEnergy - baselineEnergy) / (Math.abs(baselineEnergy) || 1e-30)) * 100;
        const currentBreakdown = SGRA.Physics.LocalEnergy.roleEnergyBreakdown();
        const baselineBreakdown = bodyStore.getBaselineEnergyBreakdown() || currentBreakdown;
        snapshot.energyRoleDrifts = {
          core: Math.abs((currentBreakdown.core.total - baselineBreakdown.core.total) / (Math.abs(baselineBreakdown.core.total) || 1e-30)) * 100,
          intr: Math.abs((currentBreakdown.intr.total - baselineBreakdown.intr.total) / (Math.abs(baselineBreakdown.intr.total) || 1e-30)) * 100,
          field: Math.abs((currentBreakdown.field.total - baselineBreakdown.field.total) / (Math.abs(baselineBreakdown.field.total) || 1e-30)) * 100
        };
        snapshot.energyMaxRoleDrift = Math.max(snapshot.energyRoleDrifts.core, snapshot.energyRoleDrifts.intr, snapshot.energyRoleDrifts.field);
      }
      const selectedIndex = selectionState.getFollowIndex();
      if (selectedIndex > 0 && selectedIndex < bodies.length) {
        const body = bodies[selectedIndex];
        const elements = oscElements(body);
        const state = relativityState(body);
        const weight = relWeight(body);
        snapshot.follow = hudViewModel.buildSelectedBodyCardModel({
          body, centralBody: bodies[0], epoch: snapshot.epoch, grOn: snapshot.grOn,
          rsAu: schwarzschildRadius(), relativityState: state, osculatingElements: elements,
          regimeColor: weightCol(weight, 1), regimePosition: weightPos(weight)
        });
      }
      return snapshot;
    }

    function updateViewModeBadge() {
      const badge = document.getElementById('viewModeBadge');
      if (!badge) return;
      const label = cameraViewState.getViewModeLabel();
      if (label !== lastViewModeBadge) { badge.textContent = label; lastViewModeBadge = label; }
    }

    function updateSelectedInspector() {
      const bodies = getBodies();
      const index = selectionState.getFollowIndex();
      const body = index > 0 && index < bodies.length ? bodies[index] : null;
      const roleState = $('cRoleState');
      if (roleState) roleState.textContent = body ? `${objectRole(body)} · selected/followed` : 'No body selected';
      const removeButton = $('bRemoveSelectedIntruder'); if (removeButton) removeButton.hidden = !body?.intr;
      const card = $('card');
      if (card) card.classList.toggle('pdom-collapsed', !body);
      if (body && !$('runtimeTruthPanel').hidden) { $('runtimeTruthPanel').hidden = true; setSurfaceExpanded('runtimeTruthPanel', false); }
    }

    function updateHUD() {
      updateViewModeBadge();
      const result = hudView.updateHud(uiElements, makeHudSnapshot());
      updateSelectedInspector();
      return result;
    }

    const objectListPresentation = SGRA.UI.ObjectListPresentation.create({
      $, document, getBodies, getApplicationMode, selectionState, followGroupDisplayState,
      relativityState, updateHUD, syncContinuousEligibility,
      populateStarSel: options.populateStarSel,
      restoreObjectsAfterGroupFollow, updateRuntimeTruth, updateSemanticSceneSummary,
      interactionCommands, showCard, hideCard
    });
    const { objectRole, updateObjectList } = objectListPresentation;


    function updateSemanticSceneSummary() {
      const node = $('sceneSummaryText');
      if (!node) return;
      const now = performance.now();
      if (now - sceneSummaryLastAt < 250) return;
      const bodies = getBodies();
      const selectedIndex = selectionState.getFollowIndex();
      const selected = selectedIndex > 0 && selectedIndex < bodies.length ? bodies[selectedIndex] : null;
      const follow = followGroupDisplayState.active
        ? `following the group encounter (${followGroupDisplayState.liveMembers().length} intruders)`
        : selected ? `selected/followed ${selected.name || `body ${selected.id}`}` : 'no body selected';
      const value = `${getApplicationMode() === 'sandbox' ? 'Sandbox' : 'Explore'} mode; ${bodies.length} bodies including Sgr A*; ${follow}; epoch ${simulationClock.getSimTime().toFixed(3)} years; ${simulationClock.isPlaying() ? 'playing' : 'paused'}; speed multiplier ${simulationClock.getTimeScale().toFixed(2)}; placement ${intruders.isLaunchMode() ? 'active' : 'inactive'}.`;
      if (value !== sceneSummaryText) { node.textContent = value; sceneSummaryText = value; sceneSummaryLastAt = now; }
    }

    function setSurfaceExpanded(panelId, open) {
      for (const id of surfaceButtonIds[panelId] || []) {
        const button = $(id);
        button?.setAttribute('aria-expanded', String(open));
        const indicator = button?.querySelector('[data-surface-disclosure]');
        if (indicator) indicator.textContent = open ? '▴' : '▾';
      }
    }
    function surfaceIsOpen(panel) { return panel?.id === 'objectListPanel' ? !panel.classList.contains('pdom-collapsed') : !panel?.hidden; }
    function toggleSurface(panelId, buttonId, headingId) {
      const panel = $(panelId), button = $(buttonId);
      if (!panel || !button) return;
      const open = !surfaceIsOpen(panel);
      if (open && panelId === 'runtimeTruthPanel' && selectionState.getFollowIndex() > 0) {
        const details = $('cardRuntimeDetails');
        if (details) { details.open = true; details.querySelector('summary')?.focus(); }
        setSurfaceExpanded(panelId, false);
        return;
      }
      if (open) surfaceFocus.set(panelId, document.activeElement);
      if (open) {
        const other = panelId === 'objectListPanel' ? 'runtimeTruthPanel' : 'objectListPanel';
        const otherPanel = $(other);
        if (otherPanel && surfaceIsOpen(otherPanel)) { if (otherPanel.id === 'objectListPanel') otherPanel.classList.add('pdom-collapsed'); else otherPanel.hidden = true; setSurfaceExpanded(other, false); }
      }
      if (panel.id === 'objectListPanel') panel.classList.toggle('pdom-collapsed', !open);
      else panel.hidden = !open;
      setSurfaceExpanded(panelId, open);
      if (open) $(headingId)?.focus();
      else (surfaceFocus.get(panelId) || button)?.focus();
    }
    function collapseObjectsForGroupFollow() {
      const panel = $('objectListPanel');
      if (!panel || groupFollowSurfaceState.previousObjectOpen !== null) return;
      groupFollowSurfaceState.previousObjectOpen = surfaceIsOpen(panel);
      if (groupFollowSurfaceState.previousObjectOpen) {
        if (panel.contains(document.activeElement)) $('bObjects')?.focus();
        panel.classList.add('pdom-collapsed');
        setSurfaceExpanded('objectListPanel', false);
      }
    }
    function restoreObjectsAfterGroupFollow() {
      const panel = $('objectListPanel');
      const wasOpen = groupFollowSurfaceState.previousObjectOpen;
      groupFollowSurfaceState.previousObjectOpen = null;
      if (panel && wasOpen === true) { panel.classList.remove('pdom-collapsed'); setSurfaceExpanded('objectListPanel', true); }
    }
    function announceSceneSummary() {
      const bodies = getBodies();
      const selected = selectionState.getFollowIndex();
      const body = selected > 0 ? bodies[selected] : null;
      const mode = simulationOptions.getFidelityMode();
      const rate = simulationClock.getTimeScale();
      announceStatus(`Scene: ${bodies.length - 1} bodies${bodies.some(b => b.field) ? ` plus ${bodies.filter(b => b.field).length} field tracers` : ''}; ${body ? `selected ${body.name || `body ${body.id}`}` : 'no body selected'}; ${simulationClock.isPlaying() ? 'running' : 'paused'}; elapsed simulation time ${simulationClock.getSimTime().toFixed(3)} years at ${rate.toFixed(2)} years per second; requested fidelity ${mode}; ${followGroupDisplayState.active ? `follow group ${followGroupDisplayState.memberIds.size} explicit intruders` : 'group follow inactive'}.`);
    }
    /* eslint-disable complexity -- preserves the existing runtime-truth presentation branches */
    function updateRuntimeTruth() {
      const diagnostic = global.SGRA_DIAG?.snapshot?.();
      const truth = diagnostic?.runtimeTruth;
      const requested = truth?.requestedFidelity || 'not reported by current runtime';
      const active = truth?.activeFidelity || 'not reported by current runtime';
      const bodies = getBodies();
      const pnDisclosure = simulationOptions.isGrEnabled() && simulationOptions.getFidelityMode() !== 'adaptive_kerr'
        ? bodies.find(body => !body.bh && !body.field && !body.captured && ['transition-ramp', 'capture-floor'].includes(body.__pnValidity)) : null;
      const availability = pnDisclosure ? `PN validity: ${pnDisclosure.__pnValidity} (1PN/LT suppression ${Math.round((1 - (pnDisclosure.__pnDamp ?? 0)) * 100)}%)` : 'not reported by current runtime';
      const exceptional = Array.isArray(diagnostic?.exceptionalEvents) ? diagnostic.exceptionalEvents.at(-1) : null;
      const fallback = truth?.disposition && truth.disposition !== 'HEALTHY' ? (exceptional?.reason ? `${exceptional.code || truth.disposition}: ${exceptional.reason}` : truth.disposition) : 'not reported by current runtime';
      const selectedIndex = selectionState.getFollowIndex();
      const selected = selectedIndex > 0 ? bodies[selectedIndex] : null;
      const owner = selected?.__fidelityOwnership;
      const ownership = !selected ? 'no body selected' : owner?.owner === 'KERR_ACTIVE' ? 'Kerr-active' : owner?.owner === 'ONE_PN' ? '1PN' : owner?.owner === 'N' ? 'Newtonian' : owner?.owner ? (owner.failure ? `${owner.owner}: ${owner.failure}` : owner.owner) : 'uncertain/not admitted';
      for (const [id, value] of [['runtimeRequested', requested], ['runtimeActive', active], ['runtimeAvailability', availability], ['runtimeFallback', fallback], ['runtimeOwnership', ownership]]) $(id).textContent = value;
      for (const [id, value] of [['cardRuntimeRequested', requested], ['cardRuntimeActive', active], ['cardRuntimeAvailability', availability], ['cardRuntimeFallback', fallback], ['cardRuntimeOwnership', ownership]]) $(id).textContent = value;
      const key = `${requested}|${active}|${fallback}`;
      if (key !== runtimeTruthAnnouncementKey && runtimeTruthAnnouncementKey) announceStatus(`Runtime truth changed: requested ${requested}; active ${active}; ${fallback}.`, statusPriority.MODEL, statusCategory.MODEL);
      runtimeTruthAnnouncementKey = key;
    }

    return Object.freeze({ makeHudSnapshot, updateHUD, objectRole, updateSemanticSceneSummary, updateObjectList, setSurfaceExpanded, surfaceIsOpen, toggleSurface, collapseObjectsForGroupFollow, restoreObjectsAfterGroupFollow, announceSceneSummary, updateRuntimeTruth, updateSelectedInspector, updateViewModeBadge });
  }

  SGRA.UI.PresentationController = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
