# Sgr A* Simulator

Sgr A* is an experimental browser-based scientific prototype for exploring
stellar motion around a galactic-centre black hole, validated within its tested
domain. It is intentionally a research and visualisation tool, not a production
astronomy package.

Author: Mark Hurrell.

## What it demonstrates

The published prototype supports Newtonian, Newtonian + 1PN, Lense–Thirring,
and Adaptive Kerr fidelity modes, intruder experiments, curated publication
scenarios, an accessible structured object list, keyboard/mobile camera
controls, and optional supplementary sonification. Group Follow is a chase
camera for a selected group of intruders.

## Run locally

Serve the repository root with any static HTTP server and open `sgra_sim.html`.
For example: `python3 -m http.server 8000`, then visit
`http://127.0.0.1:8000/sgra_sim.html`.

When a body is selected and followed, the faint line behind it shows its recent
trail. While preparing an intruder launch, the orange line shows the proposed
trajectory from the current launch inputs.

## Validation

`npm run test:fast` runs the focused Node tests. `npm run test:browser` runs
browser tests when Chromium is available. `npm test` and `npm run test:release`
invoke the canonical release runner. Browser tests may use `SGRA_CHROMIUM` to
select a Chromium executable; a missing browser is reported as an environment
limitation rather than a product pass.

The release runner reports each executable test file and supports deterministic
shards for long runs. For example, run `SGRA_RELEASE_SHARDS=8
SGRA_RELEASE_SHARD_INDEX=0 SGRA_RELEASE_SUMMARY_PATH=/tmp/sgra-release-shards/shard-0.json
npm run test:release:shard` for one shard, then run
`npm run test:release:aggregate -- --dir=/tmp/sgra-release-shards --shards=8`.
The aggregate checks that every canonical file appears exactly once; frozen
artifact-dependent and historical evidence gates remain reported separately.

The Workbench is the source authority and permanently retains B0 diagnostics.
`npm run release:build` generates a Release derivative outside the repository;
`npm run release:verify` checks that B0 is absent from that derivative while
canonical scenarios and selected product sources remain byte-equivalent. The
Release is generated, never manually patched.

The validation and provenance record is indexed in [docs/INDEX.md](docs/INDEX.md).
Known architectural and scientific limitations are recorded in the V1 closure
audit and scenario catalogue documents.

## Further reading

- [Design in Hindsight: V1](docs/DESIGN_IN_HINDSIGHT_V1.md) — what the V1
  prototype taught us, and the questions it poses for V2.
- *Building SGR A\** — engineering a scientific simulator in an unfamiliar
  domain. [PDF](Building_SGRA.pdf) · [Markdown](docs/papers/Building_SGRA_source.md)
- *Numerical Evidence in Scientific Software* — numerical assurance and
  evidence practices for scientific software. [PDF](NUMERICAL_EVIDENCE_FINAL.pdf)
  · [Markdown](docs/papers/NUMERICAL_EVIDENCE_FINAL.md)
- *When Green Tests Aren't Enough* — engineering and assurance lessons from an
  AI-assisted software system. [PDF](When_Green_Tests_Aren_t_Enough.pdf) ·
  [Markdown](docs/papers/When_Green_Tests_Arent_Enough.md)

## Accessibility and licence

The canvas is supplementary; structured DOM content and keyboard controls are
the primary access paths. Sonification is optional and does not determine
physical events. See [docs/ACCESSIBILITY_STATEMENT.md](docs/ACCESSIBILITY_STATEMENT.md).
The repository licence is the authoritative licence notice for this snapshot.
