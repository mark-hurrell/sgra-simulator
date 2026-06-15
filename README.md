# sgra-simulator


Sagittarius A* — S-Star Cluster Simulator
An interactive N-body simulation of the S-star cluster orbiting Sagittarius A*,
the supermassive black hole at the centre of the Milky Way. Runs entirely in
the browser, with an optional local GPU microservice for high-precision,
high-body-count integration.


## What it does

- Simulates the known Gillespie (2017) S-star orbital elements around Sgr A*,
  plus a configurable population of background field stars (19–280+ bodies).
- Optional **1PN (first post-Newtonian) Schwarzschild correction**, giving a
  rough relativistic precession/redshift approximation near the black hole.
- Optional **dark stellar cusp** potential (Bahcall–Wolf profile,
  `M(<r) ∝ r^1.5`).
- Live visualisation: orbital trails, osculating Keplerian ellipses,
  relativistic-regime colour zones, Schwarzschild radius / ISCO / capture
  radius rings, and a "launch an intruder" tool for sandboxing close
  encounters.
- A per-star info panel reporting orbital radius, velocity, v/c, osculating
  elements (a, e, T), and an estimated relativistic regime
  (Newtonian → Weak GR → Relativistic → Strong Field).
- A capture/accretion model: bodies that cross within a few Schwarzschild
  radii of Sgr A* are merged into the central mass and removed from the
  simulation.

## Architecture

```
┌─────────────────────┐        ┌──────────────────────────┐
│  sim_final.html      │  HTTP  │  sgra_backend_final.py     │
│  (browser, Canvas2D) │ <----> │  FastAPI + CUDA/OpenCL      │
│  - rendering         │        │  - N-body integration       │
│  - UI / controls     │        │  - 1PN, cusp, capture        │
│  - local JS fallback │        │  (CuPy / PyOpenCL kernels)   │
└─────────────────────┘        └──────────────────────────┘
```

- **`sim_final.html`** is a fully self-contained, dependency-free single page.
  It can be opened directly in a browser and runs a JavaScript leapfrog
  integrator with the same physics model. This is the easiest way to try it.
- **`sgra_backend_final.py`** is an optional local microservice
  (`http://localhost:7823`) that offloads the N-body integration to the GPU
  via a CUDA (CuPy) or OpenCL kernel, running a single-block/work-group
  shared-memory integrator. The frontend auto-detects it via `/status` and
  transparently switches between GPU and local JS integration. If the
  backend is unreachable, the simulation continues using the JS fallback —
  the GPU path is a performance optimisation, not a requirement.

## Running it

### Browser only (no setup)

Open `sim_final.html` in any modern browser. That's it — the local JS
integrator runs the full physics model, just at lower body counts / frame
rates for large populations.

### With the GPU backend (optional, recommended for large field-star counts)

```bash
pip install fastapi uvicorn pydantic numpy
# plus ONE of:
pip install cupy-cuda12x      # for NVIDIA/CUDA
pip install pyopencl          # for OpenCL (AMD/Intel/CPU fallback)

python sgra_backend_final.py
```

The service starts on `http://localhost:7823` and auto-selects CUDA, then
OpenCL, then logs a warning if neither is available (the frontend will fall
back to local JS integration in that case — `advance_numpy` is intentionally
unimplemented). Open `sim_final.html`; it will detect the running service and
switch to GPU integration automatically.

To force CPU/NumPy mode (which currently raises `NotImplementedError` and is
a placeholder for future work), set `SGRA_BACKEND=numpy`.

## Physics model & known limitations

This is a **toy/visualisation model**, not a research-grade integrator. In
particular:

- The 1PN term is a Schwarzschild-only approximation (no spin/Kerr terms),
  applied as a correction to Sgr A*'s gravity on each star individually —
  it is not a full PN N-body treatment.
- Softening lengths (`ε ≈ 3 AU` for star–star pairs, pinned to the
  Schwarzschild radius for BH pairs) are tuned for visual stability at
  interactive frame rates, not for orbit-fitting accuracy.
- A body crossing within **4 Schwarzschild radii** of Sgr A* is treated as
  captured/accreted — its mass and momentum are merged into the central body
  and it is removed from the simulation. This radius is a deliberately
  generous, tunable safety margin (real tidal disruption radii for
  Sun-like stars around Sgr A* are much larger; the 1PN approximation itself
  also breaks down well before this point). **This same mechanism applies to
  any body, including a second black hole** — there is no separate
  binary-inspiral/merger model, so a BH–BH "capture" is approximated the same
  way as a stellar tidal disruption, which is a known simplification.
- The on-screen "relativistic regime" label (Newtonian / Weak GR /
  Relativistic / Strong Field) is based on gravitational field strength
  (`Rₛ/r`) at the body's location, not its velocity. A body showing `v > c`
  indicates the integrator has broken down for that body (reported as
  `SUPERLUMINAL — INTEGRATION FAILED`) rather than a genuine relativistic
  state — this should not occur under normal operation but is surfaced
  explicitly if it does, rather than mislabelled.

## Controls

| Key / Control | Action |
|---|---|
| Space | Play / pause |
| `1PN approx` | Toggle the relativistic correction near Sgr A* |
| `dark cusp` | Toggle the Bahcall–Wolf dark mass profile |
| `⊕ intruder` | Drag to launch a body into the cluster |
| `orbits` / `trails` / `labels` / `zones` | Toggle visualisation layers |
| `R` | Reset to epoch |
| `H` | Recenter camera on Sgr A* |

## Status

Experimental / educational visualisation, developed iteratively with a focus
on numerical stability of close encounters with the central black hole. Not
intended for scientific orbit-fitting or publication-grade results.

## License

GNU AGPL v3.
