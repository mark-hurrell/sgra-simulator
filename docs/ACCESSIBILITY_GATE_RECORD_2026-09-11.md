# Accessibility gate record — 2026-09-11

This record contains only evidence observed in the current worktree. It is
not a conformance, certification, legal-compliance, or user-study claim.

## A16 — contrast and layout evidence

Measured against panel `#070910`:

| Pair | Ratio |
|---|---:|
| Dim text `#8d9ab0` | 6.99:1 |
| Faint control border `#697892` | 4.45:1 |
| Line border | 3.71:1 |
| Primary border | 4.06:1 |
| Accent text `#ff8a4c` | 8.52:1 |
| Error text `#ff8791` | 8.65:1 |
| Body text `#cdd6e4` | 13.58:1 |

The A16 checks also cover narrow-dialog reflow, wrapped controls, minimum
target sizes, visible focus, forced-colours behavior, and the absence of an
orientation lock. These are source/test checks, not an independent browser
measurement of every viewport.

## A17 — structured accessibility content

The focused A17 checks cover the separated visible precision vector and
automatic spoken summary, exact `Initial position (p1)` and `Velocity
reference point (p0)` labels plus help text, decimal input mechanics,
native dialog and fallback focus/Escape behavior, validation wiring, and the
semantic labelled Controls region.

## A18 — state and surface evidence

The focused A18 checks and manual browser checks cover synchronized
desktop/mobile display state, synchronized Objects and Runtime-status
launchers including `aria-expanded`, View-drawer toast collision protection,
inactive Escape as a no-op while preserving active placement cancellation,
and the mobile controls sheet as a labelled non-modal region. No blanket
mobile-sheet auto-close behavior was added.

## Automated validation

Focused content and state checks:

```text
node --test tests/a16_accessibility_closure.test.mjs tests/hci_a17_accessibility_content.test.mjs tests/hci_a18_state_surfaces.test.mjs
3/3 passed
```

Complete HCI/IA/accessibility inventory and relevant input/lifecycle checks:

```text
node --test tests/hci_*.test.mjs tests/ia*.test.mjs tests/a12_parallel_dom.test.mjs tests/a13_intruder_presets.test.mjs tests/a14_mobile_view_controls.test.mjs tests/a15_status_history.test.mjs tests/a16_accessibility_closure.test.mjs tests/intruder_body_factory.test.mjs tests/intruder_preview_admission.test.mjs tests/mobile_reload_blank_canvas.test.mjs tests/canvas_pointer_input.test.mjs tests/camera_transition.test.mjs tests/camera_transition_controls.test.mjs
28/28 passed
```

The commands above include the accepted A17 and A18 focused tests. `git diff
--check` passed.

## Browser evidence

```text
node bench/b3b_browser_smoke.mjs
B3B_BROWSER_SMOKE_PASS
```

The permitted Chromium run reported no application console error, page error,
or failed application request, and passed its configured state-ownership,
display, camera, diagnostics, and control checks. A restricted sandbox launch
was separately blocked by `setsockopt: Operation not permitted` from
Chromium Crashpad. That restriction is an environment limitation, not an
application result; the permitted browser result is the accepted browser
evidence.

No screen-reader-user testing, disabled-user testing, WCAG conformance,
PSBAR compliance, certification, or legal-compliance conclusion is recorded.
No known pre-existing failure was observed in the validation commands above.
