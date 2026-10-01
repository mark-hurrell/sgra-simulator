(function attachObjectInteractionActions(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  function requireDeps(deps, required) {
    for (const name of required) if (!(name in deps)) throw new TypeError(`ObjectInteractionActions requires ${name}`);
  }

  function create(deps) {
    requireDeps(deps, ['selectionState', 'followGroupDisplayState', 'bodyStore', 'bodies', 'intruders', 'cancelLaunch']);
    const {
      selectionState, orbitPlaneView, hideCard, announceStatus, updateHUD, updateObjectList,
      bodies, followGroupDisplayState, bodyStore, orbitCacheOwner, trailSampler,
      predictionDisplayState, surfaceIsOpen, $, updateSelectedInspector,
      restoreObjectsAfterGroupFollow, groupFramingState, resetGroupFollowCamera, intruders,
      recenterView, collapseObjectsForGroupFollow, groupStatusText, cancelLaunch, toast
    } = deps;

    const actions = {
      setFollowBody(idx) {
        const current = selectionState.getFollowIndex();
        const body = idx >= 0 ? bodies[idx] : null;
        if (idx >= 0 && idx === current && body?.intr && !followGroupDisplayState.active) { actions.clearSelectedIntruder(); return; }
        if (idx < 0) { selectionState.clear(); hideCard(); orbitPlaneView.transitioning = false; }
        else { selectionState.setFollowIndex(idx); predictionDisplayState.clearFollowedPath(); }
        updateSelectedInspector();
        updateObjectList();
      },
      clearSelectedIntruder() { selectionState.clear(); hideCard(); orbitPlaneView.transitioning = false; announceStatus('Intruder selection cleared; free view.'); updateHUD(); updateObjectList(); },
      removeSelectedIntruder() {
        const selectedIndex = selectionState.getFollowIndex();
        const selected = selectedIndex > 0 ? bodies[selectedIndex] : null;
        const index = selected?.intr ? bodyStore.indexById(selected.id) : -1;
        const body = index > 0 ? bodies[index] : null;
        if (!body?.intr) return false;
        const name = body.name || `Intruder ${body.id}`;
        followGroupDisplayState.remove(body.id);
        orbitCacheOwner.invalidateBody(body);
        trailSampler.removeBody(body.id);
        const removed = bodyStore.removeAt(index);
        if (!removed) return false;
        selectionState.clear();
        predictionDisplayState.clearFollowedPath();
        hideCard();
        followGroupDisplayState.prune();
        updateSelectedInspector();
        updateObjectList();
        updateHUD();
        const focusTarget = surfaceIsOpen($('objectListPanel')) ? $('objectListHeading') : $('bObjects');
        focusTarget?.focus();
        const remaining = followGroupDisplayState.liveMembers().length;
        announceStatus(`Sandbox action: ${name} removed; ${followGroupDisplayState.active ? `following ${remaining} remaining intruder${remaining === 1 ? '' : 's'}` : 'free view'}.`);
        return true;
      },
      addGroupMember(id) { const body = bodies.find(item => item.id === id); if (!followGroupDisplayState.add(body)) return false; updateObjectList(); announceStatus(`Added ${body.name || 'intruder'} ID ${body.id} to visual follow group.`); return true; },
      removeGroupMember(id) { const body = bodies.find(item => item.id === id); if (!followGroupDisplayState.remove(id)) return false; followGroupDisplayState.prune(); updateObjectList(); announceStatus(`Removed ${body?.name || 'intruder'} ID ${id} from visual follow group.`); return true; },
      followGroup() {
        const members = followGroupDisplayState.liveMembers();
        if (!members.length) { followGroupDisplayState.active = false; groupFramingState.radialMode = 'inward'; resetGroupFollowCamera(); restoreObjectsAfterGroupFollow(); updateObjectList(); announceStatus('Group follow unavailable: no live intruders are members.'); return false; }
        if (intruders.isLaunchMode()) cancelLaunch(true);
        recenterView.transitioning = false;
        groupFramingState.radialMode = 'inward';
        resetGroupFollowCamera();
        followGroupDisplayState.active = true;
        collapseObjectsForGroupFollow();
        orbitPlaneView.transitioning = false;
        updateObjectList();
        announceStatus('Group follow active. Arrow keys or drag adjust the view; scroll or +/− adjusts zoom.');
        return true;
      },
      stopGroupFollow() { followGroupDisplayState.stop(); restoreObjectsAfterGroupFollow(); updateObjectList(); announceStatus('Group follow stopped.'); },
      toggleFollow() {
        if (followGroupDisplayState.active) { announceStatus('Group follow is already active.'); return; }
        if (selectionState.getFollowIndex() > 0) { selectionState.clear(); orbitPlaneView.transitioning = false; hideCard(); announceStatus('Follow released; free view.'); return; }
        const candidate = bodies.find(body => body.intr && !body.captured) || bodies.find((body, index) => index > 0 && !body.field && !body.captured);
        if (candidate) { actions.setFollowBody(bodies.indexOf(candidate)); announceStatus(`Following ${candidate.name || `body ${candidate.id}`}.`); }
      },
      groupStatus() { const text = groupStatusText(); toast(text); announceStatus(text); return text; },
      adjustSpeed(delta) { const slider = $('sSpeed'); slider.value = Math.max(+slider.min, Math.min(+slider.max, +slider.value + delta)); slider.dispatchEvent(new Event('input')); },
      triggerControl(id) { $(id).click(); },
      showHelp() { const drawer = $('accessibilityDrawer'), disclosure = $('keyboardShortcuts'); if (drawer) drawer.open = true; if (disclosure) { disclosure.open = true; disclosure.querySelector('summary')?.focus(); } announceStatus('Keyboard shortcuts opened.'); },
      closeMobilePanel() {
        const panel = $('mobilePanel');
        if (panel && panel.classList.contains('open')) {
          const target = panel.__sgraReturnFocus || $('bPanel');
          panel.classList.remove('open'); $('scrim').classList.remove('open');
          const button = $('bPanel'); button.setAttribute('aria-expanded', 'false'); button.classList.remove('on');
          panel.__sgraReturnFocus = null;
          target?.focus?.();
        }
      }
    };
    return Object.freeze(actions);
  }

  SGRA.UI.ObjectInteractionActions = Object.freeze({ create });
})(typeof window !== 'undefined' ? window : globalThis);
