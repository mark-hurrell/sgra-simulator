# Numerical Evidence in Scientific Software

## What an integrator has actually established — the SGR A\* case

**Mark Hurrell**

**Completed manuscript — version 1.1, 1 October 2026**

## Abstract

Scientific software can produce smooth, plausible trajectories and pass extensive tests while answering the wrong numerical question. Small local error estimates, passing regression suites, agreement with a reference implementation and apparent convergence are all useful evidence, but none is self-interpreting. Each establishes only the property that was actually measured under the assumptions that were actually in force.

This paper uses the development of a browser-based simulator of stellar motion around Sgr A\* as a worked case in numerical evidence. V1 exposes four user-visible treatments — Newtonian, Newtonian plus first post-Newtonian corrections (1PN), Lense–Thirring, and Adaptive Kerr — and combines ordinary interacting-body integration with a bounded adaptive Kerr path. The development record contains several instructive failures: states that were bit-identical but not physically equivalent because of a coordinate-gauge mismatch; a reference implementation that could share or introduce defects of its own; a timestep “refinement” ladder blocked by a hard minimum step; an incumbent scheduler whose own truncation error made a more accurate candidate appear wrong; and a valid audit whose conclusions failed to propagate into the release record.

The main result is methodological. A numerical claim depends on a chain: equations, representation, parameter definitions, conserved quantities, reference independence, convergence, time alignment, event semantics, executable path, provenance and claim boundary. Break any link and a correct-looking run can answer a different question from the one the researcher intended.

V1 also produced a design result. Its close-approach cost did not arise from one universal mechanism. A deep capture fixture was dominated by event refinement, whereas a non-terminal close encounter was dominated by repeated live integration. For isolated test-body motion in a fixed Kerr background, much of that repeated integration is avoidable in principle because Kerr geodesic motion is integrable. V2 should therefore treat the choice between numerical integration, semi-analytic evolution and direct analytic evaluation as an experimental question rather than assuming that a faster integrator is the only solution.

---

## 1. What a numerical run establishes

A numerical result is not a scalar. It is the end of an evidential chain:

> equations → representation → parameter definitions → invariants and conserved quantities → reference → convergence → time alignment → event semantics → executable path → provenance → claim boundary

The SGR A\* project repeatedly produced cases in which most of that chain was sound and one link was not. Those cases are more useful than a sequence of clean passes because they show how evidence can change meaning without any obvious software crash.

The figures in this paper were established by searching the surviving project record rather than by recollection. Where an artefact was located, it is named. Where a figure appeared only in project documentation with no underlying output, it is labelled as such and carried no further. Several claims that earlier drafts stated confidently did not survive that process and have been removed. A paper about what numerical evidence establishes should be able to say which of its own numbers rest on recovered artefacts, and which do not.

The case study is an interactive simulator of S-stars and hypothetical intruders around the Galactic Centre black hole. Its engineering history is recorded separately in *Building SGR A\**. This paper has a narrower purpose: what did the numerical evidence actually establish, what did it fail to establish, and what changed when the same system was examined through a different numerical lens?

This is a retrospective numerical-software case study, not a new relativistic model or a comprehensive validation of V1. It separates implementation error, approximation error and experimental mismatch. The examples concern different development states; they are not pooled into a claim about one release.

This paper draws on the project’s evidence synthesis and correction records, identified in Appendix B. No new numerical runs were performed for this paper. V1.0.0 is identified by commit `3791beb73b026cd43cb35a3d706a082b5269b7bc`; earlier experiments are not represented as reruns of that release. The later V1.0.1 correction record is documentation correcting the interpretation and presentation of evidence; it does not reclassify earlier experimental runs as V1.0.1 runs.

Readers seeking the transferable lessons may begin with §12 and Appendix A; §§3–7 provide the worked cases from which those lessons are drawn.

---

## 2. Numerical scope and the V1 fidelity ladder

V1 ships four public treatments:

- Newtonian;
- Newtonian + 1PN;
- Newtonian + 1PN + Lense–Thirring;
- Adaptive Kerr.

The ladder is a product abstraction. It is **not** a statement that the four modes form a universally valid sequence of perturbative ownership regions.

The Lense–Thirring mode includes the 1PN terms; “Lense–Thirring” below refers to that combined treatment unless a term is explicitly nulled for an isolated check.

Two scope decisions are fundamental.

**The central black hole is a fixed background.** Sgr A\* is pinned in V1. Recoil of the central mass, finite-mass-ratio corrections to the Kerr geodesic problem and dissipative radiation reaction are outside the V1 physics contract.

**Fidelity and execution are separate questions.** “Which treatment should own this body?” and “which bodies must advance at the smallest cadence?” are different design problems. V1 implemented a conservative operational rule for treatment ownership; its physical calibration and the evidence for alternative scheduling remained bounded.

### 2.1 Notation and executable paths

Here 1PN denotes the first post-Newtonian correction and RHS a right-hand-side evaluation. DP5(4) denotes the Dormand–Prince embedded Runge–Kutta pair [1]. KDK denotes kick–drift–kick. `DT_MIN` denotes a hard minimum timestep. GLOBAL is the production population-wide scheduling path; BLOCK is the experimental multi-rate scheduler. Results for BLOCK are candidate evidence, not evidence that BLOCK shipped.

Distances and velocities in the reported replay experiments use AU and AU/yr. Relativistic orbit parameters sometimes use geometrised units: a quoted radius of 8M means eight gravitational radii, with M interpreted as GM_BH/c²; the Schwarzschild radius is twice that length. The symbols a* and χ denote dimensionless spin in the cited fixture descriptions. Inclination conventions require an explicit mapping (§3.2). Fixture labels such as S9 identify project experiments, not a general physical domain.

### 2.2 Principal results

| Experiment | Observed result | Supported claim |
|---|---|---|
| Fixed-step Newtonian, T = 5×10^-5 yr | Maximum worst-body velocity difference 108.581315 AU/yr against 108.5 predicted | Approximately second-order convergence on one severe fixture (§5.1) |
| Matched-reference scheduler comparison | Maximum worst-body velocity difference: BLOCK 2.726497 AU/yr, GLOBAL 108.581315 AU/yr | Candidate closer on that fixture; no universal scheduler ranking (§5.2) |
| Six high-e PN/Kerr comparisons | Coordinate mapping restores agreement on bound classification | Representation mismatch explained topology disagreement; quantitative PN error remains (§3.1) |
| SCI-03 frequency comparison | Quadrature/reference agreement ≤9.2×10^-14; estimator difference ≤1.021×10^-5 in sampled runs | Empirical validation within the tested envelope (§4.2) |
| Floor-clamped timestep replay | About 38–39% of baseline substeps hit the floor | Policy sensitivity, not a measured convergence order (§5.3) |
| K2 capture refinement | Nested RHS evaluations 2592 → 528 → 88 | Reduced event-localisation work on the tested event class (§6) |
| Ownership research and admission | Policy changes two held-out outcomes; inclined admission tested at one domain point | Bounded policy and admission evidence (§7) |

No final campaign establishes long-horizon phase accuracy at the shipped V1 state. The tested Kerr evidence includes equatorial K1 fixtures at χ ∈ {0, 0.9}, the single SCI-02 inclined point, and selected SCI-03 states; it does not define a universal strong-field accuracy envelope.

---

## 3. The numerical object is not automatically the physical object

The most important V1 numerical failure was not a broken integrator. It was a correct calculation applied to a state that did not mean what the experiment assumed it meant.

### 3.1 Coordinate gauge: bit-identical is not physically identical

A research campaign compared post-Newtonian and Kerr trajectories from common six-word states. Six high-eccentricity states were classified unbound under the PN path while the Kerr reference was bound. That looked like a scientific topology disagreement.

The later R4 coordinate diagnosis changed the interpretation completely.

The implemented 1PN law is a harmonic-coordinate law. The R4 seed came from the Kerr reference representation and was supplied to the harmonic PN acceleration without the required Kerr–Schild-to-harmonic state map. The two arms therefore did not start from the same physical event even though the stored floating-point state was identical.

The gauge identification was itself tested. A λ-family residual-order experiment showed:

- λ=1, the harmonic form: residual ratio under radius doubling → 4.00, consistent with an O((M/r)^2) remainder;
- λ=0, the areal alternative: ratio → 2.00, exposing an O(M/r) mismatch.

The investigating force transcription was checked independently against the production JavaScript over 240 states spanning r∈[0.35,400] AU, v≤0.32c, spins 0/0.7/0.9, with Lense–Thirring both off and on. Worst relative disagreement was 6.28×10^-16.

At the affected high-e state, the coordinate mismatch induced a specific-energy offset of about 3.7×10^-3 c^2 against a reference binding-energy magnitude of about 1.82×10^-3 c^2. The representation error was therefore approximately twice the binding energy and large enough to flip the sign.

The correction also had to be performed in the black-hole spin frame. A naive world-frame map failed when the configured spin axis was tilted. With the validated spin-frame Kerr–Schild↔harmonic map, round-trip relative errors were approximately 1.9×10^-16 in position and 10^-15–10^-14 in velocity.

After the map, all six previously “unbound” states were bound and reached apoapsis within roughly 0.69–0.74 Kerr radial periods.

That did **not** make 1PN accurate. Once the representation error was removed, a genuine model discrepancy remained: the corrected 1PN apoapsis was approximately 25–31% high and the binding energy approximately 20–23% low in the tested strong-field high-e regime. The crucial distinction is that topology then agreed while quantitative accuracy did not.

These measurements are reported in the contemporaneous R4 coordinate diagnosis [E1]. The force-transcription agreement tests the diagnostic implementation against production; it does not independently prove that the physical force law is correct. Likewise, a small coordinate round-trip residual establishes internal consistency of the map, not by itself its physical validity. The residual-order test and the corrected trajectory comparison provide distinct checks.

**Established:** common bits do not imply a common physical event across coordinate systems. Representation belongs inside the experimental contract.

### 3.2 Parameter definitions: a formula can be exact and still answer a different problem

Kerr orbit literature commonly parameterises bound geodesics by p, e and an inclination variable. The SGR A\* project used the relation

`Q = L_z^2 tan^2(iota)`

as its inclination convention. KerrGeoPy and published analytic routes use a different inclination parameter, commonly represented by `x = cos(I)` after constants are recovered.

The project therefore could not safely substitute `cos(iota_SGRA)` into the external formulation. The accepted comparison route became:

SGRA state → recover `(E,L_z,Q)` → recover the external `(p,e,x)` representation → evaluate frequencies.

The SCI-03 generic-spin evidence made the distinction measurable. For the inclined S9/S10/S11 states, the recovered x differed from naive `cos(iota_SGRA)` at about the 10^-5 level, while the recovered p and e agreed with the declared roster at approximately 10^-13–10^-14 relative/absolute scale.

**Established:** parameter definitions are part of the numerical object. An analytic formula in the wrong parameterisation is not an oracle until the mapping has itself been established.

### 3.3 Conserved quantities: test what the equations actually conserve

One V1 diagnostic originally attempted to assess Lense–Thirring behaviour through a Newtonian kinetic-plus-potential energy quantity while 1PN terms were present. That quantity is not conserved by the full dynamics, so its drift could not be interpreted as a numerical convergence error.

The replacement logic was more direct. With the 1PN contribution nulled, the Lense–Thirring acceleration satisfies the exact orthogonality identity

`a_LT · v = 0`.

For this isolated implementation check, the local identity tests the force property directly. It does not by itself establish discrete energy conservation, trajectory accuracy or correctness of the remaining force terms.

**Established:** before interpreting drift, establish that the measured quantity is actually conserved by the equations being integrated. If an exact local identity exists, test it directly.

### 3.4 Integrator properties depend on the step policy

The ordinary interacting-body path uses kick–drift–kick with fixed-point refinement for velocity-dependent relativistic terms.

For a separable Newtonian Hamiltonian, standard constant-step KDK is a symmetric, second-order symplectic method [2]. Those guarantees cannot be transferred solely by name to the implementation with velocity-dependent terms and finite fixed-point iterations. Nor do the usual constant-step guarantees automatically survive state-dependent step selection. Such selection can break reversibility and the standard symplectic argument; it does not, by itself, prove a particular secular-drift law.

That observation is relevant to V1 because the global step is selected from the current state and may then be clamped by `DT_MIN`. It is a plausible contributor to long-horizon phase drift, but V1 did not execute the final long-horizon experiment required to quantify that contribution.

**Established:** “second-order”, “symplectic” and “time-reversible” describe a scheme under conditions. A production step-selection policy can invalidate those conditions without changing the integrator’s name.

---

## 4. References are instruments, not truth

A simulator cannot validate itself by running the same implementation twice. V1 used external analytic software, converged self-reference, direct quadrature, frozen fixtures and independently transcribed force laws. None was treated as automatically authoritative.

### 4.1 KerrGeoPy and analytic Kerr structure

KerrGeoPy 0.9.3 was used as an isolated reference for timelike Kerr geodesics. No KerrGeoPy code ships in the browser product. This matters because the external library is useful only where the comparison is physically like-for-like: a pure Kerr geodesic reference cannot adjudicate a mutually coupled N-body trajectory without separating the coupling.

The mathematical foundation is well established. Schmidt derived invariant Kerr fundamental frequencies by quadrature, and Fujita & Hikida derived analytic bound timelike geodesics and fundamental frequencies in terms of elliptic functions and Mino time [3, 4]. KerrGeoPy exposes this structure computationally [5].

But the project also checked the reference path rather than trusting the package name. A hash-gated wrapper reproduced KerrGeoPy’s bundled cross-check against Black Hole Perturbation Toolkit Mathematica data to a maximum relative error of 9.65×10^-15. That checks the exercised wrapper/library path against the bundled external test data; it is not itself an independent SGR A\* derivation.

### 4.2 SCI-03 direct quadrature: independence by a different method

The stronger SCI-03 reference used a direct numerical quadrature of the defining Mino-time frequency integrals rather than KerrGeoPy’s elliptic-integral implementation.

The independently implemented quadrature route agreed with the KerrGeoPy route to no worse than 9.2×10^-14 over the named comparison envelope.

The product repeated-event estimator was then compared with the independent route on S1, S9, S10 and S11 at three solver tolerances, using averaging windows N = 1–8 and additional S11 windows N = 16 and 32 [E6]. Worst observed relative difference was 1.021×10^-5, inside the predeclared normal empirical target of 1×10^-4.

The two frequency routes share the underlying Kerr equations; their independence concerns the computational method and implementation. This supports a bounded empirical validation claim. It is not a global error theorem, a universal Kerr oracle or permission to extrapolate to arbitrary spin, eccentricity, inclination or averaging horizon.

### 4.3 A reference can be wrong in a structured way

Earlier project work found two common reference failure modes.

One oracle omitted a production assumption such as softening or damping. The resulting disagreement looked like non-convergence and could support a plausible physical story until the model mismatch was identified.

A second failure came from duplicate implementations of the same numerical method. Two DP5(4) copies were not behaviourally identical at a constrained endpoint. The bench copy, not the shipped copy, could overshoot the requested endpoint under a minimum-step condition. Agreement with the tableau was not enough; endpoint semantics were part of the implementation.

A September audit also found that an external dependency path could silently disappear when version identity and checkpoint execution were not asserted strongly enough.

**Established:** a reference is a role. Its independence, domain, dependency identity and failure semantics have to be tested like any other instrument.

---

## 5. Convergence, time and the shipping path

### 5.1 A clean convergence result: the accepted severe Newtonian fixture

The M3E experiment provides one of the cleanest positive convergence results in the recovered record.

For the accepted severe Newtonian fixture, `LocalStepIntegrator.physicsStep(dt)` was run over `T = 5.000000e-5 yr` with uniform fixed steps. The finest reference used `n = 163840`, corresponding to `dt = 3.0517578125e-10 yr`.

Successive halving ratios in velocity were:

- 3.916;
- 3.977;
- 3.994;
- 3.999;
- 4.000;
- 4.000;
- 4.000.

Position showed the same order until it reached a floating-point/reference floor.

For an error behaving as C h^p in the asymptotic regime, halving h gives an error ratio approaching 2^p. Ratios approaching four therefore support p ≈ 2. Here the reference is the same method at much finer resolution: it supports a discretisation-convergence claim, not an independent test of the force law [E2].

The production GLOBAL path took ten steps of `5.0e-6 yr` and returned exactly the requested interval. Against the converged reference, the **maximum worst-body velocity difference** was:

`108.5813150954889 AU/yr`.

Before the measurement, a truncation model predicted:

`108.5 AU/yr`.

The difference was 0.081315 AU/yr, or 0.0749% of the predeclared prediction. The recovered record did not preserve a fixture-wide characteristic velocity with which to normalise this absolute maximum; it should therefore not be read as a universal relative velocity error or phase-error bound.

This is stronger evidence than a post-hoc fit because the prediction existed before the decisive measurement.

### 5.2 The incumbent is not the truth

The scheduler investigation initially compared an experimental BLOCK scheduler against GLOBAL and treated disagreement as evidence against BLOCK.

M3E reversed that interpretation. On the accepted severe Newtonian fixture:

- GLOBAL velocity error vs converged reference: `108.581315 AU/yr`;
- original BLOCK velocity error vs the same reference: `2.726497 AU/yr`.

BLOCK was not “wrong because it disagreed with GLOBAL”; on that fixture it was substantially closer to the converged reference.

A coarse-rung ablation at matched `H` and matched fine timestep produced only `1.90×10^-8 AU/yr` velocity difference and `7.57×10^-8 AU` position difference between coarse-rung and all-fine BLOCK. The velocity difference was negligible compared with the GLOBAL velocity error on that fixture. This excludes ordinary-limited coarse scheduling as the explanation for the original large discrepancy in that specific test.

The time coordinate supplied another confound. In the fixed-step Newtonian fixture above, GLOBAL returned exactly the requested interval. In the separate severe Kerr M3C fixture, GLOBAL advanced `0.002005 yr` for a requested `5×10^-5 yr`, while BLOCK at the requested interval advanced only the requested time. The record establishes different time semantics in those fixtures, not a general property of every GLOBAL call or a settled mechanism for the M3C overshoot. A naive M3C comparison therefore compared different physical times. Driving BLOCK to GLOBAL’s actual returned duration reduced the position discrepancy from about 0.829 AU to `2.02×10^-5 AU` and the velocity discrepancy from about 5834 AU/yr to `2.33×10^-4 AU/yr`.

**Established:** compare candidates with a converged reference at matched physical time. Incumbency is not an error model. Matched-time agreement removes one confound; it does not independently establish the accuracy of either Kerr trajectory [E2, E3].

### 5.3 A refinement sequence is not automatically a convergence study

The `perf_close04` timestep-policy data looked like an accuracy ladder because the control being changed was named `dtSafetyDyn`.

The implementation makes the actual semantics explicit:

`returnedDt = min(DT_MAX, max(DT_MIN, safeDt))`.

With `DT_MIN = 5e-6 yr`, tightening the safety factor cannot reduce a requested step below that hard floor.

The stored replay evidence shows the floor was active heavily:

| Frame | Floor hits / substeps | Fraction | Worst requested/returned ratio | Largest floor overstep |
|---|---:|---:|---:|---:|
| 1910 | 634 / 1660 | 38.2% | ≈0.104 | ≈9.6× |
| 3123 | 693 / 1769 | 39.2% | ≈0.282 | ≈3.5× |

Tightening the dynamic safety factor increased floor hits:

- frame 1910: 634 → 975 → 1506;
- frame 3123: 693 → 1071 → 1637.

The stored state differences do not form a conventional decreasing refinement sequence. Against the production configuration (`dtSafetyDyn = 0.002`, `kerrTolerance = 1e-13`), the maximum interacting-body position differences at frame 1910 were:

- `dtSafetyDyn = 0.001`: `0.010161486 AU`;
- `dtSafetyDyn = 0.0005`: `0.025771077 AU`.

The difference grew by a factor of about 2.54 under nominal refinement.

At frame 3123, the `0.002→0.001` difference was `7.613×10^-3 AU`, while `0.002→0.0005` was `5.895×10^-3 AU`; the two refined levels differed by `1.718×10^-3 AU`.

No method order can be inferred from those sequences. The control is changing the distribution of floor-clamped steps and therefore the discrete trajectory.

By contrast, tightening the Kerr solver tolerance did behave monotonically in the stored frame-1910 lanes:

- `5×10^-14`: `2.682630587×10^-13 AU`;
- `2.5×10^-14`: `1.657340991×10^-13 AU`.

The solver-tolerance effect was roughly eleven orders of magnitude smaller than the timestep-policy effect in that workload.

These are **maximum interacting-body position differences at a single frame**, not errors against an independently converged trajectory. Their decrease in the tolerance lanes does not establish an absolute error bound or solver order. The evidence comes from the independent review dated 14 September 2026 at repository HEAD `8ee05104` [E4].

**Established:** two controls that look like “accuracy settings” can have completely different semantics. A refinement variable earns the word convergence only when the effective resolution actually refines.

### 5.4 Evidence about a method is evidence about the product only if the path matches

At one stage, strong evidence had been generated with an adaptive DP5(4) research path while the browser product still used a different strong-field execution path. The evidence could be sound about the harness and irrelevant to the executable product.

The production Adaptive Kerr path was subsequently moved onto bounded DP5(4), with explicit tolerances, step limits, event handling and failure propagation. From that point, validation could meaningfully refer to the shipping strong-field path.

**Established:** “we validated DP5(4)” is not equivalent to “we validated the program” unless the program is shown to execute that implementation under the tested conditions.

---

## 6. Events, capture and root refinement

Capture has two separable contracts:

1. **scientific classification** — what physical condition constitutes terminal capture?
2. **mechanical event semantics** — how does the integrator bracket, localise, commit and re-arm the terminal event?

A correct classifier embedded in a broken event pipeline still gives a wrong simulation.

The K2 terminal capture-boundary fixture exposed a large refinement cost. Endpoint continuation first reduced nested right-hand-side evaluations from 2592 to 528 while retaining 81 nested solves. Replacing bisection-style refinement with a safeguarded Brent method then reduced:

- nested RHS evaluations: 528 → 88;
- nested solves: 81 → 6.

The accepted result is bounded to that event class [E5]. These counts measure nested refinement work, not total application speedup.

Dense-output guidance was also investigated. The final executive record reports that after correcting its root-tolerance flaw, it produced no material gain on the smooth capture cases. Dense output remains useful as an algorithmic option, but it is not an evidenced V1 performance result.

The event contract remained conservative: interpolation may guide localisation, but the committed terminal state must be confirmed by integration.

**Established:** event localisation is part of the numerical method, not bookkeeping around it. Its speed and correctness have to be measured separately.

---

## 7. Model ownership: evidence boundaries rather than invented thresholds

The attractive architecture was automatic promotion through Newtonian → 1PN → Lense–Thirring → Kerr. Such a design needs independently justified ownership regions.

The research question was whether the available comparisons justified automatic treatment transitions. Policy sensitivity and physical adequacy must be distinguished.

A separate research investigation, Dataset B3/B4M, evaluated a `delta_sep ≤ 0.02` guard as a candidate rule for promoting a body to Kerr ownership earlier than the baseline schedule. Seven of twelve calibration fixtures and five of twelve held-out fixtures fell inside the guard region. In two held-out cases, O042 and O046, the guarded policy returned where fixed 1/8-cycle promotion produced a capture, so the guard demonstrably changes outcomes. The experiment contained no reference independent of itself, so it establishes policy sensitivity rather than which policy is physically correct. The candidate was recorded as research rather than production code and was never implemented in the shipping classifier.

V1 ships an operationally unrelated rule: a body stays Newtonian-owned only if its osculating orbit is bound with eccentricity below 0.8 and periapsis beyond 100 Schwarzschild radii. The product documentation calls this an ownership safety gate rather than a universal physics threshold. It was introduced on 25 August (commit `5734be6`), while the Dataset-B work was still running, so it was developed in parallel with that research and not adopted in response to it.

This ownership experiment does not establish the physical adequacy or inadequacy of 1PN. No automatic transition policy through the intermediate 1PN and Lense–Thirring tiers reached the evidential standard required for production; they remain explicit comparison treatments. That statement is compatible with shipping the separate Newtonian-to-Kerr operational gate described above [E7].

The inclined-Kerr admission rule is narrower still. SCI-02 was regraded over 48 cells at one qualified domain point, `a*=0.9, e=0.9, p=50M, i=60°`. The outcome was:

- 0 false safe;
- 21 safe-non-Kerr;
- 27 conservative-Kerr.

Within that 48-cell regrade, “safe-non-Kerr” denotes admission judged safe by the qualified reference, and “conservative-Kerr” denotes retention of Kerr treatment. The absence of false-safe outcomes is a result for those cells, not a statistical bound on unseen states or generic inclined-orbit validation [E8].

**Established:** when the evidence does not support a smooth model-transition surface, the honest architecture is an explicit conservative boundary plus visible comparison modes.

---

## 8. Long horizons, severe encounters and what V1 does not claim

### 8.1 Long-horizon phase accuracy remains open

The simulator is visually and scientifically sensitive to accumulated orbital phase. Several mechanisms capable of producing long-run phase drift were identified, including state-dependent stepping and hard timestep floors. Individual defects were repaired during development.

The final long-horizon campaign at the shipped V1 code state was not completed. The evidence therefore supports no quantified phase-drift bound for that release.

**V1 makes no quantified long-horizon phase-accuracy claim.**

### 8.2 Severe-encounter pointwise fidelity is also not established

The `perf_close04` record contains sensitive few-body close passages. The timestep-policy numbers in §5.3 do not establish chaotic divergence: the nominal refinement variable was being intercepted by `DT_MIN`.

The safe V1 statement is narrower: pointwise agreement through severe encounters has not been established, and a single end-state distance is not enough to distinguish timestep semantics, time alignment, physical sensitivity and numerical error.

For such regimes, validation should first separate numerical resolution from physical sensitivity, using conserved quantities appropriate to the equations, event outcomes and physically meaningful observables. Distributional claims require their own defined ensemble and validation; they are not established by these replays.

---

## 9. Performance evidence and architectural consequences

### 9.1 There was no single “close approach cost law”

The recovered performance record contains distinct workloads and should not be collapsed into a continuous radius-versus-cost law.

Two representative fixtures illustrate the distinction:

- ordinary non-terminal adaptive encounter: minimum radius `40.04475 AU`;
- K2 terminal capture boundary: `0.339562 AU = 8M`.

On the ordinary fixture, the measured kernel update distribution was approximately p50/p95/p99 = `1.1/8.0/19.5 ms`, with 14 frames above a 16.7 ms budget and **zero event-refinement time**. The visible cost was ordinary live integration/RHS work.

On the K2 fixture, p50/p95/p99 was approximately `0/9.1/10.2 ms`. The reported p50 is rounded to milliseconds and represents the low-cost half of the recorded frame distribution; it does not mean that event work itself required zero time. Event refinement dominated the measured capture occurrence, with 2592 nested RHS evaluations before the event-refinement optimisations.

These distributions describe the recorded workloads, not portable browser benchmarks [E9]. They are separate cost modes. A deep capture result cannot be used to explain an ordinary close-window stutter, and vice versa.

### 9.2 Global cadence amplified local cost

The production interacting layer selected a scalar cadence for the interacting population. A body demanding a fine step could therefore cause other active bodies to repeat expensive work at the same cadence.

This is the architectural issue that motivated BLOCK and later V2 work. The M3 experiments show that multi-rate scheduling can skip work in an ordinary-limited Newtonian fixture without the coarse-rung ablation becoming the dominant numerical error. They do **not** establish universal safe reconstruction for pair-limited or Kerr-dominated regimes.

A latent `STEP_MAX = 2600` correctness cliff was also identified in source review: `advanceAdaptive` can stop with `done < want` and defer the deficit through carry. Diagnostic runs raised the cap, but production behaviour at the cliff was not measured. This remains a V2/open correctness question, not a measured V1 failure.

### 9.3 The larger architectural question: which motion needs integration at all?

For an isolated test body in a fixed Kerr background, the geodesic problem is integrable [3, 4]. The conserved quantities `(E,L_z,Q)` separate the motion, and bound trajectories and fundamental frequencies admit analytic expressions in terms of elliptic functions and Mino time.

That changes the performance question.

Instead of asking only:

> How do we integrate the same orbit faster?

V2 can ask:

> Which parts of the motion need numerical integration at all?

Candidate architectures include:

- direct analytic/semi-analytic evaluation for isolated Kerr geodesic segments;
- numerical correction around that solution when interactions or non-geodesic forces are present;
- multi-rate numerical integration for genuinely interacting regimes;
- high-order converged numerical integration retained as an independent reference for any analytic production path.

This last point matters. If V2 moves the mathematics currently used as an oracle into production, that oracle ceases to be independent. The reference architecture must change at the same time.

Analytic structure does not eliminate numerical work. Evaluating special functions, recovering orbit parameters and converting from Mino time to requested coordinate time still introduce cost and error. The present evidence provides no measured speedup or uniform-cost guarantee for such a V2 path.

V2 architecture should follow experiments that compare accuracy and latency for isolated motion, then test controlled perturbations and the conditions requiring a return to full integration. The comparisons must preserve the representation, time and reference contracts established here. V1 motivates that investigation; it does not select the winning architecture in advance.

**Established:** demonstrated numerical accuracy and suitable computational architecture are separate questions.

---

## 10. Provenance and propagation are part of numerical evidence

The project record contains a failure that is methodological rather than mathematical.

An audit dated 27 August 2026, as recorded in the correction and closure documents [E7], identified several problems in Dataset B reporting before the V1 release:

- the B4M summary prose was generated from hardcoded text rather than from the computed tables;
- a derived guard table duplicated each orbit;
- the O077 margin description was wrong;
- the reported median Kerr duty of 0.78% was pinned to the measurement’s own 1/128 phase-resolution quantum.

The corrected account of the raw 24-row B3 table records 11 rows exactly at 1/128, nine exactly zero, and a median of 1/128. The audit correctly identified the resolution-floor problem but itself misstated the floor-row count as 13 rather than 11. An audit needs an evidence chain too.

More importantly, the audit existed outside the repository tree consumed by the release process. The later documents therefore retained stale interpretation.

The same pattern occurred elsewhere: valid evidence produced during agentic sessions could be delivered to the user or a downloads directory but not enter the version-controlled record. A later repository-only audit would then report the evidence as missing.

The companion paper *When Green Tests Aren’t Enough* examines this assurance and propagation problem beyond numerical software. *Building SGR A\** and *Design in Hindsight, V1* give the engineering and design narrative for this case study.

Two numerical-evidence requirements follow:

**Handoff.** Where does the tool producing the evidence place it, and does that handoff enter the controlled project record?

**Propagation.** When an audit changes the status of a claim, what downstream document, gate or release step is forced to consume the change?

Detection alone is not enough. A correct finding with no consumer can disappear operationally.

---

## 11. What V1 establishes

### Established

- The accepted severe Newtonian fixed-step fixture shows approximately second-order convergence, with a predeclared truncation prediction agreeing with the measured GLOBAL velocity error to 0.0749%.
- The SCI-03 independent direct-quadrature comparator agrees with the KerrGeoPy frequency route to ≤9.2×10^-14 over the sampled comparison set, and the tested product estimator stayed inside its predeclared 1×10^-4 normal empirical target.
- The R4 high-e PN/Kerr topology disagreement was a coordinate-representation mismatch. After a validated spin-frame Kerr–Schild↔harmonic map, all six tested states were bound; substantial quantitative 1PN model error remained.
- The `perf_close04` dynamic-timestep ladder was not a conventional convergence study because `DT_MIN` bound roughly two fifths of the substeps and changed the meaning of nominal refinement.
- The scheduler investigation demonstrates why an incumbent implementation must not be treated as truth. On the accepted severe Newtonian fixture, BLOCK was substantially closer than GLOBAL to a converged reference.
- Event-refinement optimisation on K2 reduced nested RHS evaluations from 2592 to 88 and nested solves from 81 to 6, without promoting the later dense-output experiment to an accepted speedup.
- Dataset B3/B4M established ownership-policy sensitivity, not a universal 1PN/Kerr transition law.
- SCI-02 provides a fail-closed inclined-Kerr admission result at one qualified domain point.
- Ordinary non-terminal close-window cost and deep terminal event cost are different performance modes.

### Established as negative or bounded

- No automatic transition policy through the intermediate 1PN and Lense–Thirring tiers reached the evidential standard for production. This is a classifier/evidence result, not a statement that 1PN is physically useless.
- A `dtSafetyDyn` ladder that is floor-clamped cannot be assigned a convergence order from the stored frame differences.
- Multi-rate BLOCK evidence from the accepted ordinary-limited fixture does not establish pair-limited or Kerr-regime safety.
- A same-force or same-code-family reference is insufficient to expose a shared representation assumption.
- A successful audit does not guarantee correction unless evidence is handed into, and propagated through, the release system.

### Not established, and not claimed

- Long-horizon phase accuracy at the shipped V1 state.
- Generic inclined-Kerr accuracy outside the specifically tested envelopes.
- A universal strong-field Adaptive Kerr tolerance across all spins, eccentricities, inclinations and interaction states.
- Pointwise trajectory fidelity through severe few-body encounters.
- A universal physical threshold at `e=0.8`, `100 r_s` or `delta_sep=0.02`.
- Production behaviour at the `STEP_MAX` cliff.
- Universal scientific equivalence of the experimental BLOCK scheduler.

### Out of scope by construction

- moving/recoiling central black hole in V1;
- finite-mass-ratio Kerr corrections;
- dissipative gravitational-radiation backreaction.

These boundaries are not caveats added after the result. They are part of the result.

---

## 12. Discussion and conclusion

The SGR A\* record suggests a practical hierarchy for numerical claims.

**First, establish meaning.** Coordinate chart, gauge, parameter definition, units and sign conventions precede error norms.

**Second, establish the reference.** A reference must be independently justified, versioned and tested for silent failure. Two implementations are not independent if they inherit the same assumption.

**Third, establish effective refinement.** The knob being changed must actually refine the discretisation. Floors, caps, adaptive reclassification and event semantics can make a nominal ladder non-convergent.

**Fourth, compare at the same physical event or time.** Loop counts and requested windows are not sufficient when one path can overshoot or carry time.

**Fifth, distinguish implementation error from model error.** Once the gauge mismatch was removed, the residual 1PN error became scientifically interpretable rather than being mixed with a representation defect.

**Sixth, validate the shipping path.** A beautiful harness result does not transfer to a different product integrator by analogy.

**Seventh, preserve the evidence chain.** Evidence that does not enter the controlled record cannot protect a later release.

V1 is a numerical prototype with positive evidence in specified domains and unresolved performance and fidelity questions beyond them. The Newtonian fixed-step study, independent frequency comparison and corrected coordinate experiment each support a different kind of claim. None substitutes for the missing long-horizon or broad-domain validation.

The strongest conclusion is that a discrepancy becomes interpretable only after its representation, reference, resolution and time semantics have been established. In this case, that discipline changed an apparent physical topology failure into a coordinate diagnosis, changed an apparent scheduler regression into evidence of incumbent truncation error, and prevented a floor-clamped policy experiment from being reported as convergence or chaos. It also separated event-refinement cost from ordinary integration cost, giving V2 an experimentally grounded question: which motion should be integrated, and which can be evaluated by another method?

---

## Appendix A. Checklist for a numerical claim

Before citing a numerical result, ask:

1. **Representation.** Are both sides in compatible coordinates, gauge, units and parameter definitions?
2. **Physical event.** Do numerically identical states denote the same physical state in each model?
3. **Conservation.** Is the monitored quantity actually conserved by the equations?
4. **Scheme conditions.** Do order, symmetry or symplectic claims survive the production step policy?
5. **Reference.** Is the reference independent in code, method and assumptions where independence matters?
6. **Reference audit.** Can the reference fail silently? Is its dependency identity pinned?
7. **Time.** Are both paths compared at the same physical time/event?
8. **Convergence.** Does the effective discretisation refine, or has a floor/cap/reclassification taken control?
9. **Incumbency.** Is the existing implementation being mistaken for truth?
10. **Path.** Did the experiment exercise the code the product actually runs?
11. **Events.** Are event classification and event localisation tested separately?
12. **Horizon.** Does local accuracy support the horizon of the claim?
13. **Regime.** Is the claimed observable meaningful in a sensitive/chaotic regime?
14. **Architecture.** Does the motion need numerical integration at all?
15. **Handoff.** Does produced evidence enter the controlled project record?
16. **Propagation.** What forces later documents/gates/releases to consume a changed evidential status?
17. **Boundary.** What does the result explicitly **not** establish?

---

## Appendix B. Evidence sources and availability

This paper uses the **Numerical Evidence v0.3 Evidence Complete** synthesis and **Evidence Authority Pack** dated 1 October 2026, together with the **V1.0.1 Corrections** and **Closure Pack**. The authority pack takes precedence where subsequent recovery supersedes an older instruction. The following identifiers map claims to the project reports identified by those records. They do not assert that raw outputs were independently rerun for this paper.

- **[E1] Coordinate diagnosis:** `SGRA_R4_COORDINATE_DIAGNOSIS.md`. Contemporaneous report of the six-state gauge diagnosis, force-transcription check, residual-order experiment and corrected model discrepancies. The unneeded 204-state summary aggregates are omitted here.
- **[E2] Newtonian convergence:** `PERF_M3E_ACCEPTED_NEWTONIAN_CONVERGENCE_2026-09-20.md`. Identified run/report supporting the fixed-step ladder, predeclared prediction and scheduler ablation.
- **[E3] Time alignment:** `PERF_M3C_MATCHED_BODY_TIME_FORENSIC_2026-09-20.md`. Identified run/report supporting the severe Kerr matched-time comparison. The later secondary M3F2 account is not needed for the conclusions and is omitted.
- **[E4] Timestep replay:** `SGRA_BLOCK_GLOBAL_INDEPENDENT_REVIEW_VERDICT.md`, with `perf_close04_frame1910_global_uncertainty.json` and the frame-3123 replay artefacts identified there. Source/replay evidence as recorded in the supplied synthesis.
- **[E5] Event refinement:** `00_EXECUTIVE_STATE.md`. Executive technical record of the accepted endpoint/Brent results and the final disposition of dense-output guidance.
- **[E6] Frequency comparison:** SCI-03 integration records dated 3 September 2026. Recovered integration record for the direct-quadrature comparator, wrapper checks and bounded product-estimator experiment.
- **[E7] Ownership and reporting:** `V1_0_1_CORRECTIONS.md` and `CLOSURE_PACK.md`, as consolidated by the Evidence Authority Pack. These record the B3/B4M counts, outcome changes, separate production gate and corrected August audit interpretation.
- **[E8] Inclined admission:** SCI-02 methodology, freeze and regrade records identified by the authority pack. Reported 48-cell result at one qualified domain point.
- **[E9] Performance workloads:** `SGRA_PRODUCT_PERFORMANCE_AND_SCIENCE_BRIDGE_2026-09-04.md`. Technical report distinguishing ordinary integration and terminal-event workloads.

These sources support a bounded retrospective case study. They are not a complete executable reproduction package. Missing raw material is not filled by reconstruction, and omitted figures are not required for the conclusions. Literature references below provide mathematical context; they do not certify a project implementation or its results.

---

## References

1. J. R. Dormand and P. J. Prince, “A family of embedded Runge–Kutta formulae,” *Journal of Computational and Applied Mathematics* **6**(1), 19–26 (1980). DOI: `10.1016/0771-050X(80)90013-3`.

2. E. Hairer, C. Lubich and G. Wanner, *Geometric Numerical Integration: Structure-Preserving Algorithms for Ordinary Differential Equations*, 2nd ed., Springer Series in Computational Mathematics 31 (2006).

3. W. Schmidt, “Celestial mechanics in Kerr spacetime,” *Classical and Quantum Gravity* **19**(10), 2743–2764 (2002). DOI: `10.1088/0264-9381/19/10/314`.

4. R. Fujita and W. Hikida, “Analytical solutions of bound timelike geodesic orbits in Kerr spacetime,” *Classical and Quantum Gravity* **26**, 135002 (2009). DOI: `10.1088/0264-9381/26/13/135002`.

5. S. Park and Z. Nasipak, “KerrGeoPy: A Python Package for Computing Timelike Geodesics in Kerr Spacetime,” *Journal of Open Source Software* **9**(98), 6587 (2024). DOI: `10.21105/joss.06587`.


**Companion papers/documents:** *Building SGR A\**; *When Green Tests Aren’t Enough*; *Design in Hindsight, V1*.
