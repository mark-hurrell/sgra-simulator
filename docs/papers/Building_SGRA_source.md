---
title: "Building SGR A\\*"
subtitle: "Engineering a scientific simulator in an unfamiliar domain: from literature and numerical models to an interactive, evidence-backed product"
author: "Mark Hurrell"
date: "1 October 2026"
---

# Summary

SGR A\* is a browser-based simulation and sonification environment centred on the
supermassive black hole at the centre of the Milky Way. It exposes several
physical models of increasing fidelity, runs interactively, supports non-visual
access, and carries an evidence apparatus intended to let its results be
challenged rather than merely admired.

This paper is not a description of the simulator. It is an engineering account
of what had to be discovered before the software could be trusted, and of the
disciplines that made those discoveries possible.

The central finding is that the hardest part of implementing scientific software
was not translating equations into code. It was translating scientific
assumptions into explicit software contracts, finding independent ways to test
those contracts, and recognising when representation, numerical method or
experimental design had invalidated an otherwise plausible comparison.

Every substantive claim below is tied to a dated finding in the project record.
Where a result remains provisional or open, it is marked as such. Appendix A
tabulates the evidence; Appendix B states what this work does *not* claim.

---

# 1. The engineering problem

I chose a problem where plausible output would not be enough.

A black-hole simulator can look convincing while being scientifically wrong. A
trajectory can be smooth and visually impressive while using the wrong
coordinate representation, the wrong numerical method, the wrong timestep policy
or the wrong reference data. Nothing about the rendered image distinguishes
those cases.

The requirements were also in tension with one another:

- scientific fidelity sufficient that differences between models mean something;
- numerical stability in strong-field regimes;
- interactive performance in a browser;
- comprehensible interaction;
- non-visual access and sonification;
- evidence strong enough to survive hostile review.

The original product exposed four explicit physics modes: Newtonian; Newtonian
with first post-Newtonian (1PN) corrections; the addition of Lense--Thirring
spin effects; and adaptive Kerr.

That ladder was initially treated as a progression in fidelity, with each rung
expected to own a region of the parameter space where it was the right
cost/accuracy trade. One of the later lessons was that an attractive
architecture is only a hypothesis until evidence supports it. A separate
research investigation tested a `delta_sep <= 0.02` candidate guard for earlier
Kerr promotion. It changed two held-out outcomes, but had no independent truth
reference and was never adopted. It therefore established policy sensitivity,
not a physical inadequacy of 1PN or a universal transition law. The production
Newtonian-to-Kerr gate was developed separately: a body remains
Newtonian-owned only when its osculating orbit is bound, has $e < 0.8$, and has
periapsis beyond 100 Schwarzschild radii. It is an operational safety gate, not
a universal physics threshold. 1PN and Lense--Thirring remain explicit
comparison and sandbox modes; no automatic transition through those
intermediate tiers reached the evidence standard required for production.

That revision is representative of the project. The architecture was not
defended because it had been designed that way. It was changed when the evidence
said the assumptions behind it were weaker than expected.

---

# 2. Engineering outside an established domain

My professional background is in commercial systems engineering and, for
twenty-four years, in computer science teaching and research supervision. It is
not in relativistic dynamics, orbital mechanics, numerical relativity,
sonification or auditory display. I could not rely safely on intuition in any of
those areas.

That academic background mattered here, but not as a credential. It mattered as
a method: read critically, identify assumptions, compare sources, distinguish a
claim from the evidence for it, and keep pushing when a result does not make
sense.

I could not responsibly ask a model for an equation, receive plausible code, and
assume the result was correct. Whenever an implementation or an explanation
depended on scientific assumptions I did not understand well enough, I went back
to the literature. That happened when orbital behaviour did not match physical
expectation; when post-Newtonian and Kerr results disagreed; when different
integrations gave contradictory answers; when it became necessary to know which
coordinate system a published result actually assumed; and when algebraically
valid geodesic constants turned out not all to correspond to physically
admissible states.

It happened outside physics too. The sonification and accessibility work began
with a broad literature sweep to map the field, followed by a deeper adversarial
pass to challenge the first interpretation and extract design constraints. The
resulting authority document reviewed twenty-six works with explicit
confidence-in-transfer ratings before any audio code was written.

The pattern was consistent across domains:

> explore broadly, identify authoritative material, challenge the first
> interpretation, extract design constraints, implement, then test the resulting
> behaviour against something independent.

The lesson is not that AI assistance replaces expertise. It is that AI
assistance can compress the path from authoritative sources to an executable
engineering understanding, provided the engineer retains responsibility for the
interpretation and for what counts as closure.

---

# 3. The literature is not a software specification

Scientific papers are written to communicate scientific results. They are not
written as production specifications. Equations arrive with assumptions.
Notation differs between sources. Coordinate systems are often implicit. A
closed-form solution may depend on a definition that resembles the one in the
product without being the same. Algebraic solutions may admit several roots when
only one has physical meaning.

Three cases from this project show three distinct failure modes.

**The published expression was wrong.** A sign discrepancy appeared between Will
& Maitra Eq. A3 and the corresponding expression in Hergt & Schäfer. The
resolution was not to decide which paper looked more authoritative. It was an
independent algebraic cross-check, which established the correct sign from the
mathematics rather than from the citation.

**The mathematics underdetermined the answer.** In the geodesic constants work,
the solver could produce more than one algebraically valid combination of the
relativistic constants $E$, $L_z$ and $Q$ for a given set of orbital parameters.
Across a 1,400-cell grid, 22 cells admitted two mathematically valid solutions,
of which only one corresponded to the intended physical orbit. The literature
supplied the mathematics; the software needed something the papers left to
expert interpretation, namely an explicit *physical admissibility contract*.

**The published definition was not our definition.** The closed-form solutions
for $(E, L_z, Q)$ available in the literature use an inclination parameter that
differs from the inclination definition declared for this project's dataset.
They therefore could not be used directly, and the constants had to be solved
from the project's own definition. A closed form that solves a slightly
different problem is worse than no closed form, because it looks usable.

The general point for any scientific or regulated domain: mathematical validity
does not by itself determine product behaviour. The software must encode
assumptions the source may never have written down.

---

# 4. Representation is part of correctness

The most consequential finding in the project came from a result that simply did
not make physical sense.

Six orbital states at high eccentricity ($e = 0.9$, $p = 52.1536$, profile
families G02--G12) were being classified as unbound under the post-Newtonian
arms while the Kerr reference classified them as bound. It would have been easy
to treat this as one model being a rougher approximation than the other, or to
adjust tolerances until the curves agreed. Instead the question became:

> Are these calculations actually representing the same physical state in the
> same way?

They were not.

The implemented 1PN acceleration assumes harmonic (Cook--Scheel) gauge
coordinates. The seed states were Kerr--Schild / Boyer--Lindquist states handed
to that force law with no gauge transformation applied.

Two features of the diagnosis matter as much as the result.

First, the implemented gauge family was identified from executed source and a
residual-order diagnostic, not inferred from a plausible story. A numerical
Christoffel/gauge-family test showed the residuals
scaling as $O((M/r)^2)$ at $\lambda = 1$ and $O(M/r)$ at $\lambda = 0$, which
identifies the gauge family the implemented law belongs to.

Second, the instrument used to investigate was itself validated before
conclusions were drawn from it. The production JavaScript force law was
transcribed into Python and checked against the original to a worst-case
relative error of $6.28 \times 10^{-16}$ before the probe harness was trusted.

The consequence was not cosmetic. The representation mismatch induced a
specific-energy offset of approximately $3.7 \times 10^{-3}\,c^2$ against a
reference binding-energy magnitude of approximately $1.82 \times 10^{-3}\,c^2$ — twice the quantity
being measured, and therefore easily sufficient to flip a bound orbit to an
unbound classification. After applying the validated Kerr--Schild to harmonic
transformation in the correct black-hole spin frame, including the $20^{\circ}$
spin-axis tilt, all six disputed states became ordinarily bound, reaching
apoapsis within 0.69--0.74 Kerr radial periods.

The contemporaneous diagnosis also reported a 204-state probe across the
affected profile families, with 154 states crossing at least one radial-period
contour threshold and a median improvement of roughly 57 times. The row-level
table was not recovered, so these are summary-level figures. The affected
comparison science had to be regenerated.

The engineering lesson is more transferable than the transformation:

> **A scientifically correct equation can produce the wrong software result if
> the representation contract around it is wrong.**

This is the same class of defect that appears when currencies or valuation dates
are silently mixed in a financial system, when coordinate reference systems
differ in a geospatial pipeline, when timestamp semantics differ across a
distributed system, or when two schemas attach different meanings to identically
named fields. In each case both sides can be individually correct and the
comparison between them still meaningless.

The structural response mattered as much as the fix. Wherever possible,
comparison moved away from raw coordinate values and onto quantities that are
invariant under the relevant representation change: frequency ratios
$\Omega_\phi / \Omega_r$ and $\Omega_\theta / \Omega_r$, and apsidal and nodal
advance per radial period. Raw Cartesian comparison between harmonic-gauge
post-Newtonian output and Kerr--Schild reference output was prohibited as an
error metric.

> If two representations differ, do not compare raw values merely because they
> share units. Compare on quantities whose meaning survives the transformation.

---

# 5. Discriminating physical, representational and numerical disagreement

Several of the most productive investigations began with the same observation:
the result did not look like the physics we expected. The discipline that
emerged was to establish *what kind* of disagreement it was before changing
anything.

There are at least four candidate explanations for any discrepancy: it is
physical (the models genuinely differ); it is representational (§4); it is
numerical (the integration is not resolving what it claims to); or it is an
ordinary implementation defect. A language model, or a confident engineer, can
produce a persuasive explanation for any of the four. The experiment has to
discriminate between them.

**A case where the answer was physical.** A gate compared production output
against a leading-order analytic model and showed a 1.91% disagreement at 20 AU.
The question was whether that was integration error. An independent DOP853
integration of the *same equations of motion* differed from the production
trajectory by approximately $10^{-8}$%, seven orders of magnitude below the
disagreement under investigation. The 1.91% therefore could not be integration
error; it was 1PN cross-talk against a leading-order model. The gate was
reclassified as a comparison against an analytic model rather than a
numerical-integration gate.

**A case where the answer was numerical resolution, but not convergence
failure.** In a strong-field close-passage scenario, systematic timestep
refinement produced clean convergence at observed order 2.00--2.01. Separately,
the production timestep policy was found to be floor-limited in that same
scenario: 89 of 314 periapsis-active steps hit `DT_MIN` exactly, at a worst
floor ratio of 0.297, meaning the policy wanted a step roughly 3.4 times smaller
than the floor permitted. The careful conclusion was that the scheme converges
and the live resolution is capped. A resolution ceiling is not a convergence
failure, and conflating the two would have sent the work after the wrong defect.

**A case where the measurement itself was wrong.** This is the sharpest instance
in the record. A gate claimed that Lense--Thirring incremental energy drift
converged under timestep refinement, and was marked pass on 2% and 0.5%
thresholds. Its own output printed
`convergence_ratio_dt1_to_dt025 = 1.0000933` — that is, no convergence at all.
The number was printed and not acted upon, and the gate's stated purpose was
therefore not met.

The root cause was that `totalEnergy()` computed Newtonian kinetic plus
Newtonian potential energy and carried no 1PN conserved-energy correction. With
1PN active, Newtonian energy is not the conserved quantity, so the reported
drift was dominated by a physical, timestep-independent offset that had no
reason to converge. The corrected experiment nulled the 1PN term, under which
Newtonian energy genuinely *is* conserved by Newtonian plus Lense--Thirring
dynamics because $\mathbf{a}_{LT} \cdot \mathbf{v} \equiv 0$. The residual drift
over 30 orbits at $a = 40$ AU then came out at $7.8\times10^{-12}$% at zero spin
and $5.1\times10^{-12}$% at spin 0.9: round-off, and far stronger evidence than
the original claim. The load-bearing guard became the orthogonality identity
$|\mathbf{a}_{LT}\cdot\mathbf{v}| / (|\mathbf{a}_{LT}||\mathbf{v}|) =
1.4\times10^{-16}$, which is exact.

Three lessons compressed into one finding: a gate can pass while its own
diagnostic contradicts it; you cannot measure conservation using a quantity that
is not conserved; and the corrected experiment was more useful than the claim it
replaced.

**Why the horizon matters.** Throughout, generated analyses offered reassuringly
small local error figures. Those numbers answer the wrong question. A small
error per substep is not automatically harmless: if it carries a systematic
component, thousands of individually negligible errors accumulate into phase
drift, secular energy bias, incorrect precession or shifted event timing. The
relevant standard is not whether the solver reports a small local error. It is
whether the complete numerical method preserves the observable we care about,
over the horizon on which we care about it.

---

# 6. Numerical method is part of the scientific model

It is tempting to treat the integrator as an implementation detail sitting
beneath the equations. This project demonstrated otherwise. Step size, minimum
step policy, error control, event handling, root refinement and the choice
between fixed-step and adaptive methods all determine the regimes in which the
simulation can make a reliable claim.

**A very small detail can matter.** One phantom seed event was traced to a
negative floating-point denormal in a seeded radial derivative `dr/dt`. The
value was numerically negligible, but it crossed an event guard that interpreted
its sign physically. Nothing was wrong with the intended physics, and nothing
was wrong with floating-point arithmetic. The software contract simply failed to
distinguish numerical noise from a physically meaningful sign change.

**A structural limit can hide behind a respectable scheme.** The production
`physicsStep` is kick-drift-kick with a three-iteration fixed-point refinement
for the velocity-dependent 1PN and Lense--Thirring terms. Standard constant-step
KDK for a separable Newtonian Hamiltonian is second-order, symmetric and
symplectic. Those guarantees do not transfer automatically to an implementation
with velocity-dependent terms, finite fixed-point iteration and state-dependent
steps. The latter can break reversibility and the standard symplectic argument.
The `DT_MIN` floor then changes the effective step policy near close approach.
These are sound reasons to investigate long-horizon drift; they do not identify
its dominant mechanism or supply a quantified V1 phase-drift bound.

**A refinement sequence is not automatically a convergence study.** In the
`perf_close04` replay, 38.2% of the frame-1910 substeps and 39.2% of the
frame-3123 substeps were clamped at `DT_MIN`. At frame 1910, halving
`dtSafetyDyn` from 0.001 to 0.0005 increased the maximum interacting-body
position difference from $0.010161486$ AU to $0.025771077$ AU. At frame 3123,
the 0.002-to-0.001 and 0.002-to-0.0005 differences were
$7.613\times10^{-3}$ AU and $5.895\times10^{-3}$ AU. These are single-frame
state differences, not endpoint errors against a converged reference. Since the
floor changes the distribution of actual steps, no method order can be inferred
from these lanes. They establish timestep-policy sensitivity only.

---

# 7. Building and challenging a scientific oracle

A scientific simulator cannot validate itself by running the same code twice.
Independent references are therefore essential: high-order numerical
integration of the same equations, specialist relativistic tooling, literature
values, invariants where no closed form exists, and deliberately adversarial
fixtures.

The discipline that emerged was: establish known cases; compare against an
independent implementation or a published result; freeze qualified fixtures; use
invariants where no simple closed-form answer exists; perturb inputs and use
negative controls; distinguish agreement with the oracle from proof that the
product executes the same path; and challenge the oracle itself.

That last clause turned out to be load-bearing.

**The oracle can be confidently, structurally wrong.** In an early convergence
study, one moderate-field scenario appeared to plateau at roughly 1% error
regardless of refinement. That is the signature of genuine non-convergence, and
had the investigation stopped there it would have been reported as such. The
cause was a Newtonian-softening gap in the oracle. In a second scenario, the
production and reference trajectories disagreed by 55 AU, and the disagreement
*grew* under refinement — by the plan's own criteria, an outright failure. The
cause was a `pnDamp`/`rSafe` gap in the oracle. After both oracle defects were
corrected, both scenarios converged cleanly at observed order 2.00--2.01.

A defective oracle does not produce mild noise. It produces a confident,
structured and entirely wrong scientific conclusion, complete with a plausible
physical narrative.

**Two reference implementations of the same method had diverged.** The project
carried two copies of a DP5(4) integrator, one on the bench/reference side and
one on the product side. In a synthetic endpoint test the bench copy overshot
its requested endpoint by roughly three orders of magnitude while the
product-side copy handled it correctly. The reference implementation was the
defective one. That instance was closed; no structural guard against a
recurrence — a single-implementation rule — yet exists.

**Agreement with an oracle is not, by itself, evidence about a product.** This
was the most important discovery of the 26 August deep audit. Fourteen tranche
gate files carried a substantial body of apparently strong evidence for the Kerr
lane. That evidence had been produced using an adaptive DP5(4) path. The
shipping product was not executing that path: it used its own uncontrolled
fixed-step RK4 implementation. The science may well have been correct about the
system the harness exercised. It was not evidence about the product.

> **Agreement with an oracle is evidence about a product only when the
> executable path under validation has been established independently.**

The remedy moved the product adapter to bounded adaptive DP5(4) with explicit
tolerances, step bounds, subdivision and failure propagation. Implementation
gates and bounded validation passed. Final strong-field tolerance ratification
remains provisional and is recorded as such.

**Oracle infrastructure needs the same provenance discipline as product code.**
A later harness audit found that the Kerr geodesic oracle harness did not check
dependency identity, and that ten checkpoints were being silently skipped. The
skips were made explicit; that is not the same as proof of full oracle
execution, and it is not claimed to be. There is also a physics constraint on
that comparison which is easy to get wrong: the reference tooling integrates a
*geodesic*, whereas the product's bodies receive mutual half-kicks every
substep. The comparison is valid only with mutual coupling disabled, as an
explicitly single-body configuration. Comparing a coupled run against a geodesic
oracle and calling the difference "drift" would be precisely the category error
this paper is about.

---

# 8. An experiment that cannot fail has produced no evidence

The most uncomfortable class of defect found in this project was not in the
physics or the solver. It was in the apparatus that was supposed to be checking
them.

**An admissibility criterion that could not become true.** A validation
experiment compared several tolerance lanes and used their ordering to decide
whether a Kerr result was resolved. It returned a null result, which could
straightforwardly have been reported as "unresolved". Closer examination showed
something worse: a frozen step ceiling (`hMax = 1`) meant all three lanes were
driven by the same effective limit, so the criterion intended to distinguish
them was unsatisfiable by construction in all 72 cells. The correct outcome was
therefore not unresolved physics but **not evaluated under this experimental
design**, with the governing science target left open. A test that cannot fail
has not passed.

**A test suite that was green because it was not looking.** Twelve gate files
sat outside the release runner's `*.test.mjs` discovery glob, including one gate
that was red. The suite reported success throughout. The remedy was to replace
pattern-matched discovery with inventory-driven discovery, after which the suite
ran 92 of 92 files and 671 of 671 tests.

**A hash gate that could not mismatch.** The frozen-evidence gate regenerated
its artefacts before hashing them, so the comparison was structurally incapable
of detecting drift in the evidence it was meant to freeze. This finding remains
open at the time of writing.

**Harnesses that silently tolerated missing inputs.** A headless loader
continued without error when a module file was absent, meaning parity runs could
pass with code missing. Parity infrastructure was added; closure is not claimed.

These four share a shape. In each case the apparatus produced a result, the
result was reportable, and the result carried no information about the question
being asked. Detecting that requires asking a question one step removed from the
usual one: not "did the check pass?" but "could this check have failed, and what
exactly would have made it fail?"

---

# 9. What the product may claim

Severe close encounters impose a hard limit on what the current evidence can
claim. The recorded `perf_close04` timestep lanes demonstrate sensitivity to
the timestep policy, not a measured Lyapunov exponent, chaotic divergence or a
trajectory-error bound. The nominal refinement control was intercepted by
`DT_MIN`, so its lanes evolved different distributions of floor-clamped steps.

At frame 1910, tightening the Kerr tolerance from $10^{-13}$ to
$5\times10^{-14}$ and $2.5\times10^{-14}$ produced maximum interacting-body
position differences of $2.683\times10^{-13}$ AU and
$1.657\times10^{-13}$ AU. Changing `dtSafetyDyn` produced differences up to
$0.025771$ AU. The contrast shows that two controls labelled as accuracy
settings can have very different semantics. Neither set of figures is an
endpoint error against an independent reference.

The supported product claim is narrower: pointwise fidelity through severe
few-body encounters has not been established. Future validation must separate
numerical resolution from physical sensitivity, then use observables suitable
to the stated regime. Invariants, event outcomes and distributions may become
appropriate targets once an ensemble and its comparison contract are defined;
they are not established by these stored replay lanes.

---

# 10. Performance without weakening the physics

The easiest way to make a difficult physical model faster is to run less of the
difficult physical model. That was ruled out. The working question became: how
much of the cost is inherent in the physics, and how much is accidental?

**Some slowness is physics.** Near the Kerr separatrix, orbital behaviour
genuinely becomes expensive to resolve: zoom-whirl motion means the radial
period diverges logarithmically with distance from the separatrix, as
$T_r \sim -\ln(p - p_{\rm sep})$. Some increase in computational work near
critical states is therefore legitimate and must not be optimised away by
silently changing the model. This also has an evidential consequence: if
whirl count is confounded with solver inefficiency in the timing data, then
conclusions drawn from wall-clock cost near critical states are confounded until
the two are separated.

**Most of it was not.** Instrumentation showed that the timestep-selection
routine `pickDt` cost between 2.6 and 5 times as much as the force calculation
itself, flat across body counts, and consumed 3,997 ms, or 11.3%, of the
measured frame budget. The cause was scope rather than the inner loop: the
pairwise requirement was recomputed from scratch every substep across the entire
population when only the close body's requirement had actually changed. Moving
the comparison into squared space gave a 3.7 times improvement on `pickDt` and
1.9 times end-to-end, with identical physics. The architectural conclusion is
that a block scheduler should recompute only the woken block.

Related findings: in the Kerr lane, ten bodies were taking exactly one forced
DP5(4) step per substep, an inherited cadence with no defensible justification,
with readmission cost of 1.63 million calls scaling directly with it. Endpoint
bisection in event refinement was consuming a large number of nested solves;
safeguarded Brent refinement reduced that sharply while preserving the event
contract. And the accretion-disc renderer costs approximately 11 ms in the
Schwarzschild treatment against approximately 473 ms for full Kerr, which is why
fidelity tiering had to be a design axis rather than an afterthought.

**The measuring instrument was itself a defect.** The `vm`-based performance
harness inflated measured physics cost by between 8.8 and 18.4 times, and did so
non-uniformly. A harness that is uniformly wrong is an inconvenience; one that is
non-uniformly wrong reorders the optimisation priorities and sends the work
after the wrong bottleneck. It was replaced with a non-`vm` measurement loader.

The sequence that generalises:

> measure with an instrument you have validated; determine whether the cost is
> physical or accidental; optimise only the accidental part; then re-check the
> scientific result.

---

# 11. Non-visual access: when the literature overturns the design

The initial assumption was that sonification would be the route by which a blind
or low-vision user accessed the simulation. The literature review overturned
that, and the resulting determination is one of the clearest examples in the
project of research changing a design rather than decorating it.

**Sonification is not the accessibility strategy. The structured non-visual
rendering of the model is.** The evidence points one way: sonification delivers
overview and trend rather than values or geometry (Sharif et al., 2025);
untrained listeners obtain little from naive mappings on hard cases (Tucker
Brown et al., 2022); the auditory channel carries a false-positive bias (Guiotto
Nai Fovino et al., 2024); and no published work establishes audio-only
interpretation of trajectory data at all.

The practical build-order rule that followed: if the parallel semantic layer
ships and the audio layer does not, the product is accessible. If the audio
layer ships and the semantic layer does not, the product is inaccessible with an
interesting demo attached. If effort has to be cut, it is cut in that order.

The design decisions that followed are all traceable to published findings
rather than to taste:

- A parallel DOM, following the established PhET Interactive Simulations
  pattern, with landmark regions, a strict heading hierarchy, native HTML
  controls and description that updates in response to interaction. The canvas
  is one rendering of a model that has non-visual structure, not the model
  itself.
- A single audio authority. All sound — sonification, event cues, self-voicing
  speech, legend playback, confirmation tones — passes through one arbitration
  layer owning priority, gain and rate. No component emits sound directly.
- Mono as a hard requirement, with no information carried spatially. Assistive
  technology may split or force mono channels, and listeners arriving from this
  field read spatial auditory dimensions as kinematics, so a pan intended as
  azimuth is heard as velocity.
- Loudness carries no data. Neuhoff, Kramer & Wayand demonstrated bidirectional
  pitch/loudness interference with measurable distortion of the represented
  data. Loudness is reserved for user volume, focus emphasis and ducking.
- Derivatives live in timing, not pitch contour. Fan et al. (2026) found that
  the continuous glissando which feels most "scientific" was the
  worst-performing condition for exactly the judgements it was intended to
  support.
- Polarity is declared and spoken. There is no natural polarity for "distance to
  the black hole" (Walker, 2002), and blind and sighted listeners can differ, so
  the convention is stated in words at the start of every scenario.
- Nothing essential is carried by audio alone, which is both a WCAG requirement
  and the direct implication of the evidence above.

The legal frame is the Equality Act 2010 anticipatory duty and the updated EHRC
Services Code of Practice in force from 5 August 2026, with WCAG 2.2 Level AA as
the technical target. The project does not claim certified accessibility, nor
usability by people with particular personal circumstances, in the absence of
direct user evaluation. That boundary is recorded deliberately.

One further consequence surfaced late and is worth stating generally. Once the
interface can change physics modes, select and follow objects, launch intruders
and expose runtime state, interface state is no longer merely presentation: it
participates in correctness. A control that displays one state while the runtime
executes another is an engineering defect, not a cosmetic inconsistency.

---

# 12. What the prototype taught V2

V1 was approached as a prototype, and that turned out to be a strength. A
prototype reveals constraints that cannot be specified confidently before the
system has been exercised.

**Which motion requires integration?** The close-approach evidence separated
ordinary live-integration cost from terminal-event refinement. For an isolated
test body in a fixed Kerr background, geodesic motion is integrable. V2 should
therefore compare direct analytic or semi-analytic evaluation, numerical
correction for perturbations, and full numerical integration. V1 does not
establish a speedup or choose among those architectures; it supplies the reason
to test them.

**Central-body identity.** Identity had accumulated several implicit
authorities: array position, role flags, scenario metadata and helper methods.
They agreed with one another until scenarios became rich enough to reorder
bodies. At that point a perfectly valid ordering could cause an ordinary star to
be treated as the central body while Sgr A\* existed elsewhere in the state. The
V2 response is stable identity and a single canonical central-body resolver,
rather than patching each manifestation as it appears.

**Duplicated integration semantics.** In GR-enabled mode, the block path used a
single end half-kick while `physicsStep` used a three-iteration fixed point.
Making the loops identical brought the ten-orbit ratio to 1.00 across modes.

**Cheap tools catch what expensive review misses.** Three runtime crashes
surviving an earlier AI-directed review were identified by ESLint `no-undef`,
which flagged exactly the three undefined identifiers responsible. Sophisticated
review and standard static analysis fail differently, and the cost asymmetry
between them is enormous.

The same pattern recurred around numerical authority, product-versus-oracle
paths, engine-owned time advancement, scheduler semantics, evidence provenance
and event handling. This is why V1 is described here as an experimental
prototype with bounded evidence, rather than as a universally validated
scientific instrument.

> V1 answered: *can this be made to work, and what assumptions break when it
> does?* V2 is designed around a better question: *what must remain true for the
> system to stay correct as it grows?*

A standing preservation rule follows from this. The diagnostic and provenance
infrastructure built during V1 is retained even where it is hidden from the
normal interface: its code, telemetry hooks, evidence format, fixtures and
re-enablement path are not to be deleted as dead code or made unrecoverable by
release packaging. The apparatus that found these defects is not a development
artefact to be cleaned up on the way to release.

---

# 13. Method

The implementation and investigation were AI-assisted throughout. The working
method is treated in detail in the companion paper, *When Green Tests Aren't
Enough*; what matters here is the part that shaped the engineering.

Models were used adversarially rather than authoritatively. One model proposes;
another challenges; the disagreement is resolved by literature, mathematics,
code or experiment; and the corrected understanding becomes part of the
engineering contract. The value did not come from any single model being
strongest. It came from different models making *different* mistakes, which is
considerably more useful.

Two process rules earned their place. First, a technically interesting answer is
not necessarily progress on the task: sophisticated, genuinely novel analysis
can still be the wrong work, and long investigations need a separate context
whose job is to hold the objective, remember what has been ruled out, and
redirect drift. Second, closure is on evidence, not on confidence. A persuasive
explanation is not a result.

Neither rule is specific to AI. Both become more necessary when the cost of
producing a fluent, plausible, wrong answer falls to nearly zero.

---

# 14. Why this matters beyond scientific software

None of these lessons requires the next system to contain a black hole. The
physics made failures easier to expose, because the domain is unforgiving and
has independent references. The underlying problems are general.

A representation mismatch in orbital mechanics is a semantic mismatch between
schemas, currencies, time zones or units.

An unreliable scientific oracle is an unreliable golden dataset, a
mis-specified reference environment, or a compliance baseline nobody has
re-derived.

Long-horizon numerical bias is an individually negligible business-rule error
accumulating across millions of transactions.

A gate that cannot fail is a monitoring alert whose threshold can never be
crossed, a test suite whose discovery pattern silently excludes files, or a
control that samples only the cases it was designed around.

A severe close encounter is a regime in which the appropriate observable and
comparison horizon must be established before making a trajectory-level claim.

An interface state that participates in correctness is any system where
presentation and execution can diverge and nobody has decided which is
authoritative.

The habits that transfer are decomposition, explicit contracts, independent
validation, evidence discipline and a willingness to state the limits of a
claim. What AI assistance changed is the range of domains in which those habits
can be applied, not the need for them.

---

# 15. Conclusion

SGR A\* became more than the simulator I set out to build. It became a practical
investigation into how an experienced engineer can operate in a technically
unfamiliar, multidisciplinary environment without outsourcing judgement.

The most valuable discoveries were not that equations could be implemented or
code generated. They were that correctness lives at the boundaries:

between one coordinate representation and another;

between an equation and its numerical realisation;

between local accuracy and accumulated bias;

between a product and its oracle;

between literature and executable contract;

between an implementation and the evidence for it;

between a test that passed and a test that could have failed.

The project repeatedly produced plausible results that became interesting only
when challenged. The habit that mattered most was therefore not asking for
better answers. It was learning to ask:

> **What would prove that this answer is actually the right one?**

The simulator is one substantial worked example of that method. The method is
what I intend to carry into the next domain.

---

\newpage

# Appendix A: Evidence record

Findings are listed by date. "Gate state" records what the existing evidence
apparatus reported at the time.

| Date | Area | Gate state | What was actually true | Remedy / status |
|-------|---------------|----------------|------------------------------|--------------------------|
| 5 Aug | Oracle softening gap | Scenario appeared non-convergent at ~1% | Newtonian-softening gap in the oracle | Fixed; order 2.00 recovered |
| 5 Aug | Oracle `pnDamp`/`rSafe` gap | 55 AU disagreement growing under refinement | Oracle defect, not product failure | Fixed; order 2.00--2.01 recovered |
| 5 Aug | Timestep floor (S6) | — | 89/314 periapsis steps at `DT_MIN`, worst ratio 0.297 | Resolution ceiling documented; not a convergence failure |
| 17 Aug | LT energy-drift gate | Pass on 2% / 0.5% thresholds | Printed convergence ratio 1.0000933, i.e. none; energy measured with a non-conserved quantity | Gate withdrawn and replaced; corrected drift $7.8\times10^{-12}$% / $5.1\times10^{-12}$% over 30 orbits |
| 17 Aug | 1PN analytic gate | 1.91% disagreement at 20 AU | Same-equation DOP853 differs by ~$10^{-8}$%; disagreement is physical | Reclassified as analytic-model comparison |
| 19 Aug | Headless loader | In routine use | Continued silently when a module file was absent | Parity infrastructure added; closure not established |
| 19 Aug | Performance harness | In routine use | `vm` harness inflated physics cost 8.8--18.4x, non-uniformly | Non-`vm` measurement loader |
| 26 Aug | Kerr product path | 14 tranche gate files green | Evidence from adaptive DP5(4); product shipped fixed-step RK4 | Product moved to bounded adaptive DP5(4); strong-field ratification provisional |
| 26 Aug | Duplicated DP5(4) | Tranche evidence frozen | Bench/oracle copy overshot endpoint ~1000x in a synthetic case; shipped copy correct | Instance closed; no single-implementation guard |
| 26 Aug | Release runner | Release suite green | 12 gate files outside the `*.test.mjs` glob, including one red gate | Inventory-driven discovery: 92/92 files, 671/671 tests |
| 26 Aug | Frozen-evidence gate | Gate present | Regenerated its artefacts before hashing them | **Open** |
| 26 Aug | Timestep cost | — | `pickDt` 2.6--5x `computeAccel`, flat across body counts; 3,997 ms / 11.3% of frame | 3.7x on `pickDt`, 1.9x end-to-end, identical physics |
| 29 Aug | Gauge / representation | Six states classified `OUTBOUND_CONFIRMED` | 1PN law in harmonic gauge fed KS/BL seeds; offset $3.7\times10^{-3}c^2$ vs binding-energy magnitude $1.82\times10^{-3}c^2$ | KS-to-harmonic transform in spin frame; all six bound; 154/204 and median 57x are contemporaneous summary figures, not recovered row-level output |
| 31 Aug | Kerr tolerance experiment | Null result | Frozen `hMax=1` made lanes non-independent; criterion unsatisfiable in all 72 cells | Reclassified as not evaluated, step-ceiling dominated; science target left open |
| Aug | Geodesic constants | Algebraically valid solutions | 22 of 1,400 grid cells admitted two valid roots, one physically admissible | Explicit physical admissibility contract |
| Aug | Published expression | — | Sign discrepancy between Will & Maitra Eq. A3 and Hergt & Schäfer | Resolved by independent algebraic cross-check |
| 8 Sep | Timestep-policy sensitivity | "Method envelope" framing | Tolerance lanes decreased monotonically at about $10^{-13}$ AU; floor-clamped timestep-policy lanes differed at about $10^{-2}$ AU | No convergence order or chaos claim from the stored frame differences |
| 9 Sep | Kerr geodesic oracle harness | Oracle-backed gates | Dependency identity unchecked; 10 checkpoints silently skipped | Skips made explicit; full-execution proof not claimed |
| 11 Sep | Non-visual access | Sonification assumed to be the access route | 26-work review: audio gives trend, not values or geometry | Parallel DOM made primary; sonification supplementary |
| 13 Sep | Body interaction (GR on) | Existing gates green | Block path used one end half-kick; `physicsStep` used a three-iteration fixed point | Loops made identical; 10-orbit ratio 1.00 across modes |
| 22 Sep | Runtime crashes | Survived earlier AI-directed review | ESLint `no-undef` flagged exactly the three responsible identifiers | Standard lint adopted in the loop |

---

# Appendix B: Claims not made, and open items

This work does **not** claim:

- **Pointwise trajectory fidelity through severe close encounters.** See §9.
  The stored replays establish timestep-policy sensitivity, not a trajectory
  error bound, chaotic divergence or a validated statistical-fidelity claim.
- **Ratified strong-field tolerances for the Kerr lane.** The product path was
  moved to bounded adaptive DP5(4) and passed bounded validation; final
  strong-field ratification remains provisional.
- **Proof of full oracle execution** in the Kerr geodesic harness. Silent
  checkpoint skips were made explicit; that is a narrower statement.
- **Closure on frozen-evidence integrity.** The frozen-evidence gate regenerated
  artefacts before hashing them and is open at the time of writing.
- **Closure on headless-loader parity.** Infrastructure was added; closure is not
  established.
- **A structural guard against duplicated numerical implementations.** The one
  known divergence was closed; no single-implementation rule is yet enforced.
- **A quantified long-horizon phase-accuracy bound at the shipped V1 state.**
  State-dependent stepping and the timestep floor are relevant open issues, but
  no final long-horizon campaign closed a phase-drift claim.
- **Certified accessibility**, or usability by people with particular personal
  circumstances, in the absence of direct user evaluation.
- **That the reviewed relativistic literature was used as implementation
  authority** beyond the specific expressions and definitions named in the text.

Items carried forward: single-implementation guard for numerical methods;
frozen-evidence gate repair; a long-horizon phase study with a clearly specified
reference and executable path; strong-field tolerance ratification;
block-scheduler recomputation scope; and direct user evaluation of the
non-visual layer.
