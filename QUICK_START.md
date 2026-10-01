# Quick Start

## Launch

Unzip the package, then start a local server **pointed at the folder that
contains `sgra_sim.html`** — the server only serves the folder you give it, so
if it can't find the file, you are most likely in the wrong folder or didn't
tell it which one to use.

```bash
cd path/to/unzipped-folder     # the folder containing sgra_sim.html
python3 -m http.server 8888    # serves that folder
```

Then open <http://127.0.0.1:8888/sgra_sim.html> in a browser.

If that page 404s, run `ls sgra_sim.html` in the same terminal first — if it
says "No such file", `cd` into the right folder and try again.

The simulator starts in **Explore** mode, already running, with the prepared
S-star cluster around Sgr A*.

## Finding your way around

On a desktop-width window:

- The **Objects** button (top centre) opens the **Bodies** list: name and ID,
  role, state, distance, speed and regime for every body.
- The bottom toolbar holds play/pause, the speed preset and slider, the
  **follow** dropdown, a **View** menu and **reset**.
- Five menus sit below it: **Display**, **Experiment**, **Session / numerics**,
  **Scenarios** and **Accessibility & diagnostics**.

On narrow screens these are gathered into a single **controls** panel.

## View

**Rotate.** Click and hold the mouse button (or press and hold the trackpad) on an
empty part of the scene, then move the mouse or your finger to turn the view.
Release to stop. The arrow keys also rotate the view once you have clicked the
scene.

**Zoom.** Use the mouse wheel to zoom in and out. On a laptop trackpad (including
a Mac), scroll with two fingers. You can also click the scene and press `+` or
`-` on the keyboard.

**Select a body.** Click a star or other body in the scene. It is highlighted,
the camera changes its point of focus to follow it, and an information panel
shows details about it.

When a body is selected and followed, the faint line behind it shows its recent
trail. While preparing an intruder launch, the orange line shows the proposed
trajectory from the current launch inputs.

**Orbit-plane view.** With a body selected, choose **View > orbit plane** to
look straight down onto its orbit (see *Orbit-plane view* below for how this
behaves).

**Deselect and return to the centre.** Choose **View > home** (or press `H`) to
clear the selection and re-centre the view on the central black hole, Sgr A*.
Clicking empty space in the scene also releases the selected body.

## Explore and Sandbox

**Explore** is the prepared Sgr A* environment: the catalogued S-stars, running
from the start. You can launch intruders into it (see below).

**Enter Sandbox** (top left) switches to a controlled experiment: Sgr A* on its
own, with no S-stars. Sandbox starts **paused**, so press `Space` (or the play
button) once you have launched something. The physics fidelity selector, the
Sgr A* spin control and the intruder controls are in the **Experiment** menu.
The **follow** dropdown is not shown in Sandbox; use the Bodies list, the scene,
or `F` instead.

**Return to Explore** leaves Sandbox. If you have changed anything, you are
asked to confirm that the experiment will be discarded.

## Select and follow

Selecting a body normally starts following it: its inspector opens and the
camera centres on it. Any of these select a body:

- click the body in the scene;
- click its name in the Bodies list;
- choose it from the **follow** dropdown (Explore only).

To release the camera, press `F`, choose **— follow —** in the dropdown, or
click empty space in the scene. Clicking a followed *intruder* again also
releases it, and clicking Sgr A* clears the selection and recentres the camera.

### Orbit-plane view

Follow a star or intruder, then press `O` (or **orbit plane** in the **View**
menu). The camera turns to look straight down onto that body's current orbital
plane, measured relative to Sgr A*.

- It needs a followed body; with nothing followed it does nothing.
- It is a one-off alignment, not a lock. It uses the plane at the moment you
  press it, and any rotation you make afterwards moves the view off the plane.
- The turn is a slow glide: it is largely aligned after about 10 seconds and
  fully settled after about 20. Turning on **calm motion** (in **Accessibility
  & diagnostics**) makes it instant.
- It looks down from whichever side of the plane is nearer to your current view,
  so the orbit may appear clockwise or anticlockwise.

## Keyboard shortcuts

Click the canvas first so it has focus. Ctrl, Cmd and Alt combinations are
ignored.

| Action | Shortcut |
|---|---|
| Pause / resume | `Space` |
| Reset simulation | `R` |
| Recentre on Sgr A* | `H` |
| Earth-observer view | `E` |
| Orbit-plane view for the followed body (see above) | `O` |
| Follow the first available body, or release the current one | `F` |
| Zoom in / out | `+` or `=` / `-` |
| Rotate camera | `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown` |
| Toggle trails | `T` |
| Toggle labels | `L` |
| Toggle dark stellar cusp | `C` |
| Decrease / increase simulation speed | `[` / `]` |
| Show keyboard help | `?` |
| Leave intruder placement mode, or cancel an aim in progress | `Escape` |

`?` opens the shortcut list inside **Accessibility & diagnostics**. There are no
shortcuts for stepping between objects or for opening menus.

## Launch an intruder

This is the interactive part of the simulator, where you can add a star or a
black hole as an intruder. Launch two or more with large masses close together
and you will see them pull on each other as well as on Sgr A*, forming a bound
pair or a chaotic interaction — a good way to explore three-body instability.
Close encounters between massive bodies are chaotic: tiny differences lead to
different outcomes, so the simulator's claims there are statistical rather than
about exact paths.

1. Open **Experiment** and press **Launch intruder**. It switches to
   **Launch intruder: on** (placement mode).
2. A row of mass buttons now appears — 20 M☉ (star), or 10³, 10⁴ or 10⁵ M☉ —
   hidden until placement mode is on. Choose the mass you want; you can change
   it again before each launch.
3. In the scene, press and hold at the velocity reference point, then drag to
   the desired starting position. The intruder starts at the point where you
   release and travels away from the reference point. A longer drag gives it
   a higher speed.
4. Keep the button down until the predicted path appears, then release to
   launch. A click without a drag launches nothing.
5. Placement mode stays on, so you can launch more.
6. When you have launched all the intruders you want, **turn placement mode
   off**: press **Launch intruder** again (it changes back from
   **Launch intruder: on**) or press `Escape`. While it is on, dragging in the
   scene launches a new intruder instead of selecting or moving the camera.

The new body appears in the Bodies list as an intruder. A launch that starts
inside the capture boundary is rejected with a message; start farther from
Sgr A*.

For keyboard and screen-reader use, **Configure intruder** (also in
**Experiment**) is the accessible route. It opens a form for the mass, the
velocity reference point (p0) and the initial position (p1), in AU relative to
Sgr A*, with a text summary of the resulting launch and a choice of illustrative
starting configurations.

## Group follow

1. Launch one or more intruders, then turn **Launch intruder** off (see above).
2. Click the **Objects** button at the top of the screen to open the Bodies list.
3. In the list, press **add to group** beside each intruder you want.
4. Open **Follow group** in the Bodies panel and press **Follow group**.

The camera then frames the group's encounter while keeping Sgr A* in view. Arrow
keys or dragging adjust the view; `+` / `-` or scroll zooms. Only intruders can
join a group; S-stars and field tracers cannot. Use **remove from group** to
drop a member, or **Stop group follow** to end it. Starting group follow also
leaves placement mode.

## Scenarios

The **Scenarios** menu lists the built-in scenario (**Explore S2 reference**).
Choose one and press **Apply scenario**. You can also load a scenario catalogue
JSON file from the same menu.

## Sonification

Sonification is off by default. Open **Accessibility & diagnostics** and select
**sonification: off** to switch sonification on. The same menu has volume, pitch
range, speech rate, **continuous sound**, **Replay sound legend** and **Speak
page event messages**. Continuous sound needs exactly one followed body and is
unavailable during group follow.

Sonification is supplementary: on-screen text, the Bodies list and the status
messages remain the primary information routes.

## Try these

### Follow an S-star

In Explore, click an S-star in the scene with the mouse. The camera follows it
and its inspector opens. Click **Objects** at the top to open the Bodies list
and watch its distance and speed as it approaches periapsis. (You can also pick
it from the **follow** dropdown or click its name in the list.) Press `Space` to
pause and `R` to reset.

### Create a close encounter

In Explore or Sandbox, launch an intruder toward the centre, then turn
**Launch intruder** off and follow it through the system. Launch a second
intruder, add both to a group and use **Follow group** to watch them together.
