(function attachDesktopDrawerLayout(global) {
  'use strict';

  const SGRA = global.SGRA = global.SGRA || {};
  SGRA.UI = SGRA.UI || {};

  const VIEWPORT_MARGIN = 12;
  const BAR_GAP = 9;
  const MIN_USABLE_HEIGHT = 120;

  // Pure geometry: all inputs are viewport-space numbers. Returns offsets
  // relative to the drawer's <details> element (the panel's containing block).
  // keepClear: viewport rects ({ left, right, bottom }) that must stay
  // reachable above an open drawer -- the header mode control (A1-05). A rect
  // only constrains the drawer when their horizontal extents overlap, so wide
  // layouts where the drawer opens clear of the header keep their full height.
  function computeDrawerPlacement({ anchor, barTop, panelWidth, viewportWidth, margin = VIEWPORT_MARGIN, gap = BAR_GAP, keepClear = [] }) {
    const usableWidth = Math.max(0, viewportWidth - 2 * margin);
    const width = Math.min(panelWidth, usableWidth);
    const centred = anchor.left + anchor.width / 2 - width / 2;
    const left = Math.max(margin, Math.min(centred, viewportWidth - margin - width));
    const panelBottom = barTop - gap;
    let topLimit = margin;
    for (const rect of keepClear) {
      if (!rect || !(rect.right > left && rect.left < left + width)) continue;
      topLimit = Math.max(topLimit, rect.bottom + gap);
    }
    return {
      leftOffset: left - anchor.left,
      bottomOffset: anchor.bottom - panelBottom,
      maxHeight: Math.max(MIN_USABLE_HEIGHT, panelBottom - topLimit),
      viewportLeft: left,
      width
    };
  }

  function install(doc = global.document, win = global) {
    const bar = doc.getElementById('bar');
    if (!bar) return Object.freeze({ layout() {} });
    const drawers = Array.from(bar.querySelectorAll('details.desktop-drawer'));

    function layoutDrawer(drawer) {
      const panel = drawer.querySelector(':scope > .drawer-content');
      if (!panel || !drawer.open) return;
      if (win.getComputedStyle(panel).position !== 'absolute') return; // mobile: not a floating drawer
      panel.style.left = '0px';
      panel.style.maxHeight = '';
      const anchor = drawer.getBoundingClientRect();
      const modeShell = doc.querySelector('.mode-shell');
      const shellRect = modeShell?.getBoundingClientRect();
      const placement = computeDrawerPlacement({
        anchor,
        barTop: bar.getBoundingClientRect().top,
        panelWidth: panel.getBoundingClientRect().width,
        viewportWidth: doc.documentElement.clientWidth,
        keepClear: shellRect && shellRect.width > 0 && shellRect.height > 0 ? [shellRect] : []
      });
      panel.style.left = `${placement.leftOffset}px`;
      panel.style.bottom = `${placement.bottomOffset}px`;
      panel.style.maxHeight = `${placement.maxHeight}px`;
    }

    function syncBarClearance() {
      if (win.getComputedStyle(bar).position !== 'fixed') return;
      if (bar.getBoundingClientRect().height > 0 && win.matchMedia?.('(min-width: 721px)').matches) {
        doc.documentElement.style.setProperty('--bottom-ui-clearance', `${Math.ceil(win.innerHeight - bar.getBoundingClientRect().top)}px`);
      } else {
        doc.documentElement.style.removeProperty('--bottom-ui-clearance');
      }
    }

    function layout() {
      syncBarClearance();
      for (const drawer of drawers) if (drawer.open) layoutDrawer(drawer);
    }

    for (const drawer of drawers) drawer.addEventListener('toggle', () => { if (drawer.open) layoutDrawer(drawer); });
    win.addEventListener('resize', layout);
    if (typeof win.ResizeObserver === 'function') {
      const observer = new win.ResizeObserver(() => layout());
      observer.observe(bar);
      // The mode shell changes width when Enter Sandbox / Return to Explore
      // swap; re-layout so the keep-clear region follows it.
      const modeShell = doc.querySelector('.mode-shell');
      if (modeShell) observer.observe(modeShell);
      for (const drawer of drawers) {
        const panel = drawer.querySelector(':scope > .drawer-content');
        if (panel) observer.observe(panel);
      }
    }
    doc.fonts?.ready?.then(layout);
    layout();
    return Object.freeze({ layout });
  }

  SGRA.UI.DesktopDrawerLayout = Object.freeze({ computeDrawerPlacement, install, VIEWPORT_MARGIN, BAR_GAP });
})(typeof window !== 'undefined' ? window : globalThis);
