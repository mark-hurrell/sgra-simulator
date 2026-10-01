# Sgr A* Simulator — Design in Hindsight: V1

**Status:** V1 retrospective / release documentation  
**Date:** 2026-10-01  
**Purpose:** Record what the exploratory V1 design taught us, which assumptions survived, which did not, and how those findings inform—but do not block—a future V2.

---

## 1. Why this document exists

The Sgr A* simulator was developed as an exploratory scientific instrument rather than as a product whose architecture was completely frozen in advance. The design was allowed to evolve in response to measured scientific, numerical, performance, accessibility, and usability evidence.

That distinction matters. Several of the most important architectural lessons were not obvious before the simulator existed in a sufficiently complete form to measure them. V1 is an experimental prototype with positive numerical evidence in specified domains, and the evidence base from which V2 can be designed with less uncertainty.

The intended publication framing is:

> **V1 establishes a bounded, evidence-led simulator and the evidence base. V2 is the architecture investigation suggested by what V1 taught us.**

V2 is not a V1 release blocker. V1 should be published within its supported scope; future architecture work can resume later.

---

## 2. What V1 set out to be

V1 is a browser-based Sgr A* simulator with an intentionally fixed four-mode public physics structure:

1. Newtonian
2. Newtonian + 1PN
3. + Lense–Thirring
4. + Adaptive Kerr

The product goal was not merely visualisation. It was to expose scientifically meaningful differences between models while remaining accessible enough for exploratory use, including sonification and HCI work.

The implementation stayed within a classic browser-script architecture centred on `sgra_sim.html` and `window.SGRA`. Numerical methods were treated as scientific infrastructure, not as interchangeable implementation details.

---

## 3. The central hindsight lesson: exploratory design was the right choice

The strongest lesson from V1 is that important scientific-software architecture decisions should sometimes be deferred until the system can generate its own evidence.

Examples include:

- whether exact-Kerr ownership should be broad or narrow;
- whether event refinement was responsible for close-approach stalls;
- whether global timestepping was amplifying work;
- whether selective per-body cadence could preserve the science;
- whether the existing dormant BLOCK/rung machinery was usable;
- whether GLOBAL itself was an adequate numerical reference;
- whether apparent scheduler divergence was physical, numerical, or a measurement artefact;
- where accessibility and sonification needed runtime truth rather than inferred state.

Several of these questions produced answers different from the initial expectation. The value of V1 lies partly in making those answers measurable.

---

## 4. What survived essentially unchanged

### 4.1 The four public physics modes

The four-mode structure remains a good product abstraction. Future internal execution strategies should not create a fifth public physics mode merely to expose scheduler or performance policy.

### 4.2 Conservative scientific validation

The most successful V1 design decision was treating implementation claims as provisional until independently validated. The standing closure discipline evolved into:

1. source/unit/integration tests;
2. real browser smoke where applicable;
3. B0 or feature telemetry;
4. targeted execution-hit ledgers for critical paths;
5. comparison against the relevant scientific/numerical contract;
6. only then closure.

This methodology repeatedly prevented incorrect conclusions from becoming product decisions.

### 4.3 Adaptive ownership as a concept

The idea that expensive strong-field treatment should apply only where required remains sound. What changed over V1 was the precision of the ownership rules and the evidence required before promotion/demotion policy could be trusted.

Dataset B3/B4M tested a `delta_sep <= 0.02` candidate guard for earlier Kerr promotion. It changed two held-out outcomes, but had no independent truth reference and was not adopted. The shipping Newtonian-to-Kerr gate was separate: bound orbit, $e < 0.8$, and periapsis beyond 100 Schwarzschild radii. It is an operational safety gate rather than a universal physics threshold. No automatic transition through 1PN and Lense--Thirring reached the evidence standard required for production; the modes remain explicit comparisons.

### 4.4 Capture as a scientific event, not a radius hack

SCI-01 established a validated capture classifier and exposed an important distinction between a correct scientific classifier and a broken event-continuation implementation. The exact-spin freeze was traced to terminal-event continuation/rearming behaviour rather than to the classifier itself.

That is an important architectural lesson: scientific policy and event plumbing must remain separately testable.

### 4.5 Accessibility and runtime truth

Object lists, semantic controls, calm-motion behaviour, accessible status reporting, scene summaries, and runtime-truth wording all reinforced the same principle: accessibility should expose actual simulation state rather than inferred or cosmetic state.

---

## 5. What V1 changed our minds about

## 5.1 Event refinement was not the main severe-frame problem

Close-approach slowdown initially pointed toward Adaptive Kerr event refinement. Tiered work on endpoint bisection and Brent-style refinement produced real local wins and remained valuable, but later production telemetry showed that the severe frame problem was dominated elsewhere.

The lesson is not that the event work was wasted. It removed one expensive ambiguity and made the remaining problem observable.

## 5.2 Global timestep amplification was real

PERF-M0 through PERF-M2F established that the live production scheduler was effectively global. A single demanding body could bind the global timestep and cause the rest of the interacting population to be advanced at the same fine cadence.

By PERF-M2F this was no longer a hypothesis:

- severe Newtonian windows showed effectively global drag;
- severe Kerr windows showed large amounts of no-owner pair work;
- the primary timestep owner was identifiable;
- no STEP_MAX/underdelivery explanation was required for the accepted measurements.

This was one of the most important architectural discoveries of V1.

## 5.3 Dormant BLOCK machinery existed, but “available” did not mean “ready”

The repository already contained rung scheduling and block-step integration machinery, but V1 discovered multiple layers of non-readiness:

- production bootstrap did not wire it;
- required scripts were not loaded by the live page;
- a live getter was accidentally frozen by `Object.assign` in an experimental candidate;
- macrostep assignment and execution quantum could disagree;
- real wake/capture behaviour needed direct browser verification;
- scientific equivalence could not be assumed from code shape.

The lesson is that architectural potential is not production readiness.

---

## 6. The BLOCK programme: the most important negative-and-positive result

The BLOCK investigation is a useful example of why V1 should be documented as exploratory design rather than cleaned-up hindsight.

### 6.1 A fake large speedup was correctly rejected

An early candidate appeared to produce roughly 4.8–5.8x speedups. The result was false: a dynamic macrostep quantity had been frozen, allowing under-resolution. The numerical gate caught it.

This is worth preserving in the public methodology story because it demonstrates why performance claims cannot be separated from scientific equivalence.

### 6.2 M3B appeared to show a severe Newtonian science failure

The authoritative M3B integration correctly stopped when GLOBAL and BLOCK produced materially different severe-Newtonian states and no accepted tolerance existed.

That stop was correct on the evidence available at the time.

### 6.3 Kerr comparison was badly time-confounded

M3C showed that the accepted Kerr comparison had compared different body-state times. GLOBAL could overshoot the requested window while frame accounting carried the surplus; BLOCK landed on the requested interval. Once body-state time was matched, the apparent Kerr discrepancy collapsed by many orders of magnitude.

The lesson is fundamental:

> Simulation-clock accounting and body-state time are not interchangeable observables.

Future validation must compare trajectories at matched physical/body-state time.

### 6.4 GLOBAL was not numerical truth

M3E built a converged severe-Newtonian reference and measured clean approximately second-order convergence. The accepted GLOBAL path at its production cadence had a measurable truncation error.

A predeclared prediction for the GLOBAL worst-body velocity error was confirmed to within about 0.075%, showing that the original GLOBAL-vs-BLOCK discrepancy was dominated by GLOBAL's own finite-step error rather than proving a BLOCK failure.

This changed the equivalence philosophy:

> A production path should be compared with a converged reference, not assumed to be truth merely because it is the incumbent implementation.

### 6.5 A later secondary account corrected an apparent BLOCK fixed-dt defect

M3E then appeared to show BLOCK missing the uniform fixed-dt convergence ladder by a large factor. A later project account reports that M3F2 rechecked the ladder in one process and found that the quoted comparison points had been misidentified: an `n=20` error had been used as `n=16`, and an `n=640` error as `n=64`. The exact M3F2 primary artefact was not recovered, so this remains secondary evidence.

With the correct points:

- the expected second-order relation returned;
- all-fine BLOCK matched uniform `physicsStep` exactly at equal cadence;
- the supposed BLOCK executor defect was retired.

This is one of the clearest V1 examples of why internal numerical consistency checks are indispensable.

### 6.6 Ordinary-limited coarse scheduling survived direct ablation

On the accepted severe ordinary-limited Newtonian fixture, the coarse-vs-all-fine BLOCK difference was negligible relative to GLOBAL's own numerical error.

The correct bounded conclusion is:

> **On the accepted ordinary-limited Newtonian fixture, the coarse-rung ablation was negligible relative to GLOBAL's measured error against the converged reference.**

The broader conclusion is deliberately weaker:

> **Safe reconstructability remains unproven outside the validated ordinary-limited fixture, especially for pair-limited regimes.**

---

## 7. Performance hindsight: a sound idea can still have the wrong payoff

The BLOCK work also exposed a structural performance lesson.

The current implementation keeps drift broadly current while reducing selected kick/force work for coarse bodies. In small-N scenes, that can leave a poor ratio between fixed scheduler overhead and the amount of expensive work actually removed.

For the simulator's common small interacting populations, the current BLOCK design may therefore have a modest practical ceiling even if its numerical science is sound.

This is not evidence that multi-rate integration is intrinsically unsuitable. It is evidence that the current implementation is a shallow form of multi-rate execution in a regime where much of the skipped work is cheap.

A future design may need to amortise or predict background-force contributions rather than merely skipping coarse kicks. That is a V2 architectural question, not a V1 release blocker.

For isolated test-body motion in a fixed Kerr background, V2 must also ask whether the motion needs repeated local integration at all. Analytic and semi-analytic Kerr evaluation, numerical correction for perturbations, and full interacting integration are competing experimental candidates. V1 does not supply a measured speedup or select a winner.

---

## 8. Instrumentation was not auxiliary work

B0 telemetry, timestep attribution, ownership attribution, browser execution-hit evidence, and targeted profiling repeatedly changed the direction of the project.

Examples include:

- identifying which body actually owned the timestep;
- distinguishing ordinary/dynamical timestep limitation from pair or Courant limits;
- showing that event-root refinement was absent in some supposedly relevant slow cases;
- revealing global scheduler amplification;
- checking wake/capture execution in real browser paths;
- identifying physical-time comparison errors.

The hindsight lesson is that scientific observability should be designed into the workbench from the beginning.

For release, instrumentation can be stripped or disabled as required, but the development architecture should retain it.

---

## 9. Repository/process hindsight

V1 also produced strong process lessons:

- one active production tranche at a time;
- start from a known accepted commit;
- do not interleave unrelated dirty production work;
- evidence/research files are not the same thing as source changes;
- production claims require reconstructability from a clean checkout;
- browser/server/worker process cleanup is a hard completion gate;
- negative results are preserved rather than erased.

These are not merely workflow preferences. They became part of scientific reproducibility.

---

## 10. Science reuse: what V1 leaves behind for V2

V1's science work should be treated as an asset library, not discarded during architectural change.

### Reuse directly where assumptions remain valid

Likely examples include:

- Newtonian, PN, and LT equations and unit conventions;
- validated Kerr reference mathematics within its established domain;
- SCI-01 capture mathematics;
- many fixtures and convergence ladders;
- event-contract tests;
- dimension/unit checks;
- conservative ownership concepts;
- matched-time comparison methodology.

### Reuse with a new bridge or requalification

Likely examples include:

- SCI-01 if the BH-local frame or state plumbing changes;
- SCI-02 if V2 changes how estimator inputs are produced;
- Kerr ownership if a moving central object changes coordinate assumptions;
- scheduler/wake logic if V2 changes the execution model;
- sonification/readout if new observables are introduced.

### Require genuinely new science

Examples include:

- strong-field treatment of a moving/recoiling massive central object;
- dissipative GW backreaction and its validity boundaries;
- finite-mass-ratio corrections where the fixed-background approximation fails;
- secular/direct inspiral handoff if introduced;
- any predictive-force method that changes the numerical approximation rather than only its implementation.
- the long-horizon phase-accuracy campaign required to quantify drift at the shipped V1 state.

---

## 11. Design decisions we would make earlier if starting again

With V1 evidence available from day one, a successor architecture would likely:

1. make body-state time an explicit validation observable;
2. distinguish reference truth from incumbent-production behaviour;
3. expose per-body timestep ownership from the start;
4. make scheduler selection and execution-policy provenance explicit;
5. design hot numerical data for optional compiled/SIMD execution;
6. keep a clean separation between scientific state, auxiliary observables, presentation state, and diagnostics;
7. treat model-validity boundaries as explicit runtime/science contracts;
8. build targeted invariants and ablations alongside each new physical effect;
9. preserve a conservative fallback execution path for regimes not yet proved safe;
10. design workbench instrumentation and release stripping as separate, deliberate products.

---

## 12. What V1 deliberately does not need to solve before publication

V1 does **not** need to wait for:

- a moving/recoiling Sgr A* model;
- gravitational-wave inspiral/backreaction;
- strong-field self-force or merger physics;
- a secular inspiral tier;
- a redesigned predictive-force scheduler;
- a universal multi-rate solution for every pair-limited regime;
- a complete WASM/SIMD numerical backend;
- a worker-thread physics architecture.

Those are potential V2/V2.x subjects.

V1's publication value comes from the simulator and its bounded evidence record, including the unusually detailed account of where confidence was earned and where it remains open.

---

## 13. Release narrative

The V1 release should therefore present three things together:

1. **The instrument:** the four-mode browser simulator, accessibility/sonification work, scenario system, and scientific functionality.
2. **The validation:** SCI-01/SCI-02 and the broader numerical/evidence methodology, including negative results and corrected interpretations.
3. **The hindsight:** what the exploratory process revealed about timestep architecture, runtime observability, numerical truth, and the design of a future successor.

V2 should be described as future work derived from V1 evidence, not as unfinished V1 scope.

---

## 14. Closing statement

V1's most important architectural result is not a particular scheduler, integrator, or optimisation. It is the development discipline by which apparently convincing results were repeatedly challenged until they survived independent numerical and execution evidence.

The simulator is stronger because several attractive conclusions were rejected: fake speedups, misleading time comparisons, incorrect ladder indexing, and assumptions that incumbent behaviour represented truth.

That process is itself part of the design contribution.

V1 should now be published within its supported scope. The lessons captured here should be carried forward into V2 when development resumes, rather than expanding the V1 release indefinitely.
