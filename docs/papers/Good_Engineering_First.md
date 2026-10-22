# Good Engineering First
## Directing AI to Design, Question, Review and Improve

Mark Hurrell · 22 October 2026  
Revision 8 · Final

> **We are learning to ask AI for code. Are we making equal use of it to question the design, understand the system and improve the engineering?**

## The engineering opportunity

AI can generate code remarkably quickly. But software engineering is more than producing an implementation. It involves understanding the requirements, deciding where responsibilities belong, tracing how parts of a system affect one another and recognising when successive local changes are making the whole harder to maintain. **The opportunity is not merely to generate software faster. It is to use AI to help us engineer better software.**

The Sgr A* simulator provides a concrete example. Its Group Follow camera feature, which tracks a selected group of orbiting bodies, had needed repeated local repairs. Instead of seeking another feature-specific correction, the author commissioned a technical-debt review. The investigation exposed competing sources of camera control and raised a question the local repairs had not settled: who should decide the camera's orientation, target and distance? [3]

The pattern is familiar: local repairs can address visible symptoms while leaving unclear responsibilities in place. Recognising when this is happening—and when refactoring would help—is a continuing engineering judgement, not a problem unique to AI-generated code.

The opportunity extends beyond the next implementation: AI can help design solutions, question architecture, investigate technical debt and identify justified improvements, including arrangements worth preserving. These activities already belong within software engineering. Asking an assistant to implement a feature does not establish that it has examined the design, architectural consequences or accumulating debt. That work needs to be commissioned deliberately, with enough context and appropriate capabilities, and its findings judged rather than assumed correct.

The camera was only one example. Other investigations exposed a faulty agreement between components, dependencies crossing unexpected boundaries and an apparent performance improvement that did not preserve the required computation. The examples that follow examine what those investigations revealed and the engineering judgements they demanded.

## The case at a glance

Sgr A* (SGRA in the code) simulates and sonifies bodies orbiting the black hole at the centre of the Milky Way. The October 2026 V1 release runs in the browser, with roughly 140 JavaScript modules coordinated by a top-level page script—the *application root*. An earlier June implementation used a Python-hosted CUDA backend; that backend is not part of the October release. [4, 6–7]

The scientific requirements make this an unusually revealing software project. Numerical integration must balance accuracy with computational cost; bodies approaching the black hole can require much smaller time steps, and the later Kerr (spinning black-hole) work added further demands. A physically plausible animation does not by itself establish that the underlying computation is right.

From the outset of V1, the project had two connected interests: developing the scientific simulator and exploring how to work effectively with AI across software engineering rather than code generation alone. The author directed implementation, testing, validation and technical reviews as the software moved towards public release. These investigations helped refine the questions put to AI, the scrutiny applied to its proposals and the evidence required for acceptance. V1 was deliberately exploratory: implementation and measurement exposed constraints that could not all have been known in advance.

The investigations used frontier AI models extensively, including ChatGPT and Claude, for work spanning scientific and numerical reasoning, software implementation and architectural analysis. This was a practical choice, not a controlled comparison, but it matters for anyone applying the approach. Many teams select models for implementation cost, and a model that completes bounded coding tasks well has not thereby shown that it can question a design, reconstruct an architecture or challenge a scientific result. **Directing AI towards the wider engineering work is necessary; it is not sufficient if the model lacks the capability the investigation requires.**

Three records are especially relevant to the examples below: a July engineering audit of the earlier backend [1], a September technical-debt review [3] and a September architecture review [2]. Some findings were reproduced or tested by their reviewers; others were read-only analyses. The October source provides a later, publicly inspectable state, not an independently verified history of every intervening change. The source chronology, methods and limits are recorded in Appendix A.

### Four parts of the engineering work

| Activity | The central question | A useful outcome |
|---|---|---|
| **Design** | How should the solution fit the requirements, state and constraints as they evolve? | A justified decision, or a bounded experiment to settle an uncertainty |
| **Architectural challenge** | Who actually controls decisions, state changes and dependencies at runtime? | An account of real ownership and interaction |
| **Technical debt investigation** | Where are workarounds, duplication, dependencies or other small changes accumulating into obstacles to understanding, correctness or further development? | An assessment of emerging debt, its effects and whether intervention is warranted |
| **Improvement** | What should change, what should remain, and why? | A justified change—or a reason to preserve an arrangement—with its important constraints made clear |

The four activities are not four new approval stages. They are familiar questions to bring into task definition, design discussion, review and acceptance as circumstances require.

## 1. Design is a continuing engineering decision

A working first design can be entirely reasonable and still become unsuitable as a system develops. The important judgement is not whether its original author anticipated everything, but whether later requirements have changed the assumptions on which it depended.

In Sgr A* V1, the original scheduling arrangement used a global time step. When one body needed very fine resolution, the other bodies advanced at the same small step, multiplying the computation. The growing scientific demands made that cost measurable and created a reason to investigate alternatives. The project's retrospective documents the scheduling problem and the subsequent experiments [11, §§3, 5.2]. It would have been premature to select an elaborate scheduler before understanding the workload; it would also have been unwise to retain the first arrangement without examining what had changed.

A smaller example comes from the June backend. It exposed a `pinBH` configuration field—short for “pin black hole”—while documenting that the black hole remained fixed in the computation. Allowing the black hole itself to move would change assumptions in the physical and numerical model. It was not simply a switch waiting to be enabled [4]. The field was a useful reminder that an interface can suggest a degree of flexibility the underlying design does not yet provide.

The author’s earlier CUDA experience in a video-processing pipeline made GPU acceleration a reasonable possibility to explore. In the June workload, however, each simulation call did too little computation to offset communication and coordination costs. The point is not that choosing a GPU was inherently mistaken; it is that experience supplies candidates, and measurement tells us whether they suit the new problem. This performance issue is separate from the correctness defect discussed in §2.

The same reasoning applies outside scientific software. An internal catalogue and a financial adjustment workflow might share a familiar application shape but differ substantially in authorisation, audit history, concurrent edits and recovery from partial failure. Reusing an established design is good engineering when its assumptions hold. Recognising where they do not is equally important.

This is where directing AI towards design becomes useful. Every implementation gives someone permission to mutate state, makes assumptions about failure and settles dependencies between components. Some decisions merit only a brief explanation; consequential or unfamiliar ones may need alternatives, measurements or a prototype. **Good engineering first does not mean designing everything up front. It means recognising the decisions being made and revisiting them when the evidence changes.**

## 2. Architecture is about responsibility, not file count

The September architecture review found substantial modularisation: roughly 140 modules, 142 source files examined and a mostly acyclic static import graph. Those were real structural gains. It also found that the application root still retained decisions about camera policy, reset ordering, scenario setup and controller coordination [2, §§0–2].

The distinction matters. A composition root legitimately assembles a program. It becomes problematic when it also makes unrelated policy decisions or competes with components that are supposed to own state. Parnas's work on modular decomposition provides the established rationale: the value of a boundary lies in what it separates and protects, not the number of files it creates [5].

One finding made the issue especially visible. The review described `SGRA.Physics.LocalIntegratorDeps`, a global object containing roughly 45 members. They ranged from numerical inputs and clock updates to mutation of bodies and operations on the interface. In a capture path, the integrator's call stack could hide an inspector card, repopulate a selection control and change the followed body. The static import graph did not expose the authority conveyed through this runtime object [2, §4].

The following abbreviated schematic uses names reported in the review; it is not a verbatim source extract:

```javascript
LocalIntegratorDeps = {
  getBodies, getSimTime,                // numerical inputs
  advanceSimTime, removeBodyAt,         // clock and world mutation
  hideCard, populateStarSel, setFollowIndex // interface operations
};
```

The concern was not that dependencies were passed through an object. It was that a numerical component received capabilities extending into application and interface policy. The engineering question became: what should the integrator be responsible for, and what should the rest of the application decide? That is a stronger basis for correction than simply asking for smaller modules or a dependency-injection framework. It is also a question about architecture within the program, not by itself a claim about security isolation.

### A failure that still changed the state

Architecture includes the agreements between components when something goes wrong. The July audit examined such an agreement in the earlier GPU-backend arrangement [1, CRIT-03].

The backend applied successful chunks of a requested time advance immediately. If a later chunk failed, it rejected the request without telling the coordinator how much progress had already been committed. The coordinator then asked the local fallback to advance the *whole* original interval. The audit reproduced this coordination contract directly, although it did not execute the GPU computation.

| Operation | Simulated time advanced |
|---|---:|
| Original request | 2.5 years requested |
| Backend completed before failure | 1.0 year |
| Local fallback then advanced | 2.5 years |
| **Actual total** | **3.5 years** |

The caller expected a total advance of 2.5 simulated years; the state had advanced 3.5. The defect lay in the contract between the backend and coordinator: a failure response was being interpreted as “nothing committed” when that was not necessarily true.

There was no single mandatory repair. The design could have staged changes until completion, returned the committed progress, continued only the remainder or expressed the operation as a target time, provided that time and side effects were consistently controlled. What mattered was choosing a truthful completion and recovery contract. That decision belongs in the design of the interaction, not only in a later exception handler.

The October browser-only release no longer contains this backend. Its removal establishes the later architecture; it does not, on its own, prove that the historical defect was repaired before removal.

The example transfers readily to imports, queued jobs, migrations and financial operations. A caller needs to know whether a failed operation changed nothing, changed something or completed without an acknowledgement. Otherwise, retry logic may make the damage worse. A successful unit test of each component does not establish the recovery behaviour of the combined system.

## 3. Technical debt can accumulate one change at a time

The Group Follow camera problem illustrates the difference between asking for another repair and investigating why repairs keep recurring. The technical-debt review reported 22 direct writes to the camera controller from five drivers. Each could influence the camera, with competing flags used to arbitrate which one was active [3, §3.3].

That diagnosis was more useful than a complaint about code style. It identified a plausible structural source of repeated difficulty: no single authority clearly owned the camera's target, orientation and distance. The report linked the arrangement to the repair history; it did not establish that this explained every camera symptom. Even with that limit, it suggested a productive change of approach—settle ownership and the permitted commands rather than keep treating each symptom independently.

The same review uncovered a related maintenance problem. The intended Group Follow behaviour had changed to a chase view, but a source-text test still expected an expression associated with the previous framing behaviour. In a focused test run, 16 tests passed and one failed. Two browser assertions were judged stale but were not executed because the browser was unavailable; user-facing wording also described the retired behaviour [3, §§3.1, 3.5, 5].

Here the problem was not a missing abstraction. Requirements, implementation, tests and explanation had drifted apart. Updating a brittle assertion without determining the intended behaviour would not have restored their agreement. Nor would reorganising the camera code have settled the contract on its own.

Debt is not confined to an earlier decision that can be singled out as wrong. It often develops through the accumulation of individually defensible changes. Consider a long-lived relational database: new requirements bring more fields, tables acquire responsibilities they were not originally designed to hold, or data is copied into additional places to meet immediate needs. The growing difficulty may only become evident when a routine change requires coordinating updates across several representations. Deliberate denormalisation can be justified by performance or other constraints; it becomes a maintenance concern when the responsibilities, consistency rules and costs of those copies are no longer adequately controlled.

Similar patterns appear in application code, tests and documentation. Repeated workarounds, a simple feature requiring edits across unrelated components, duplicated rules and increasingly brittle tests can all be *smells*: reasons to investigate, not automatic proof that a refactor is needed. Waiting for a major failure can allow the cost to grow, but restructuring every unusual piece of code can waste effort and introduce new defects.

The judgement is therefore both *where debt is accumulating* and *when to act*. That depends on what the structure is making difficult, how frequently the affected area changes, the consequences for correctness and maintenance, and whether a targeted correction can be understood and verified. Sometimes the right response is to refactor before another feature is added. Sometimes it is to record a tolerable constraint and revisit it when circumstances change. The aim is to keep the system changeable, not to make every code smell disappear.

## 4. Improvement includes knowing what to preserve

An improvement should address the problem the investigation has actually identified. That may mean refactoring a boundary before further change compounds the debt, rather than continuing to patch symptoms. A useful correction might remove an unwanted dependency, clarify ownership, make a failure contract testable or isolate an expected source of change. Equally, an unconventional but sound arrangement may be worth preserving.

The September architecture review identified two copies of authoritative state. The application root held a mode variable alongside the mode controller's own state, and camera readers depended on a snapshot that callers had to refresh after mutations [2]. Both arrangements relied on coordination that could be forgotten or bypassed.

The October public source shows narrower arrangements. The earlier `LocalIntegratorDeps` object is absent; the integrator and event code receive dependencies through explicit configuration ports, and capture outcomes use a defined event-output interface. Readers obtain mode state through `applicationModeController.getMode()` and camera state through `cameraController.getCameraSnapshot()`, rather than relying on the previously duplicated root variable and explicit snapshot refresh. Some event code still accesses the globally exposed `SGRA.Physics.LocalStepIntegrator` module directly or as a fallback. That module is the integrator itself, not the removed all-purpose dependency object [2, 6–7].

Those observations support a bounded conclusion: the later source shows specific structural corrections and greater visibility of dependencies. They do not establish that every capability was narrowed appropriately or that the earlier camera ownership problem was fully resolved at runtime. **Passing dependencies explicitly is progress only to the extent that it changes what components can actually do.**

The same review also argued for preservation. Its recommendations included keeping tight numerical kernels imperative, retaining related equations with their provenance and avoiding an event bus inside deterministic integration steps [2, §13.3]. This was architectural judgement, not a benchmark claiming that all alternatives would be slower. An integrator has a legitimate reason to update positions and velocities in close numerical loops; structural decisions about adding or removing bodies can be separated without turning every assignment into an event.

A stable façade may similarly be valuable in legacy software because it preserves callers while internal responsibilities move. An event bus or a new framework is useful when it solves an identified problem, not when it merely makes the architecture look more modern.

There is external evidence for AI's constructive role in maintenance, too. Wadhwa and colleagues' CORE system proposed repairs for static-analysis findings and used an additional model assessment to rank them. Human reviewers accepted some and rejected others that had satisfied the static checks [12]. It is an example of useful assisted repair with human judgement, not proof of autonomous architectural improvement.

## 5. Evidence decides whether the engineering worked

Directing an assistant towards design and architecture makes those subjects examinable. It does not make the resulting diagnosis correct. Acceptance depends on the requirement and on evidence that reaches the part of the system about which the claim is being made.

The Group Follow test protected a superseded implementation expression rather than the new behaviour. That is a useful distinction for refactoring: tests should detect damage to deliberate contracts without making harmless rearrangement impossible. Structural constraints can be legitimate test subjects—for example, whether only the designated component accesses persistent storage—but a test needs an engineering reason to enforce that boundary.

The July fallback problem needed a behavioural test spanning failure and recovery across components. The dependency-object problem needed inspection of what physics code could invoke at runtime. Neither would have been established merely by a convenient suite of successful feature tests. The wider assurance question is examined in *When Green Tests Aren't Enough* [8]; the point here is that requirements and architectural obligations must shape what counts as acceptance.

Scientific software makes this especially clear. The project investigated advancing different bodies at different rates through a block-step scheduler. Its retrospective records three occasions when initial appearances were misleading [11, §6]:

1. A seemingly substantial speedup was rejected because the faster candidate computed trajectories at insufficient resolution.
2. Some discrepancies in Kerr simulations were traced to comparing states at different physical times.
3. A converged reference exposed finite-step error in the original global-step result, which therefore could not be treated as numerical truth simply because it was the existing implementation.

These reversals were productive. They changed what the project could responsibly accept. The principle applies in less specialised software as well: a quicker import might drop records, a cache might return out-of-date permissions and a refactor might pass tests exercising different wiring from production. Existing behaviour can be a valuable characterisation baseline without being the correct behaviour.

### Understanding remains part of acceptance

An engineer directing AI-assisted work needs enough understanding to identify important assumptions, locate the relevant code and evaluate the consequences of changing it. Reading code, independently writing it, debugging and making architectural judgements are related skills, but they are not interchangeable. Assistance that helps deliver a task may or may not build the understanding required for the next one.

In a randomised experiment involving developers learning an unfamiliar Python library, participants using AI assistance had lower subsequent understanding scores. Exploratory analysis associated seeking explanations with better learning than broad delegation, but those interaction patterns were not themselves randomised treatments; the study did not measure long-term skill loss [13]. The practical concern is straightforward: completion and understanding need not progress together.

Comprehension benefits from two complementary views. Locally, cohesive code with a clear purpose is easier to reason about. Globally, source-grounded maps of dependencies, state ownership and important execution paths help reveal relationships no single file explains. Such maps should be tied to the code and distinguish static imports from actual runtime wiring.

The context given to AI also needs care. Successive plans, reviews and handoffs can leave obsolete guidance in circulation. When an assistant receives conflicting descriptions of the same system, a confident answer may merely reflect whichever account it encountered. Clear supersession and a discoverable source of current decisions are more useful than an ever-growing collection of partially overlapping documents.

## 6. Bringing the questions into ordinary development

None of this calls for a separate AI-governance lifecycle. The four activities belong where design and maintenance already happen: in the definition of work, discussion of consequential choices, code review, refactoring and acceptance. The amount of attention should reflect uncertainty and the cost of getting the decision wrong.

| Situation | The engineering work that matters | How AI can contribute |
|---|---|---|
| **New development** | Understand the domain and choose an initial design that fits its constraints | Explore alternatives, challenge assumptions and help plan bounded experiments |
| **Maintained application** | Understand the affected production path and its current owners | Trace dependencies, question new special cases and identify focused corrections |
| **Legacy system** | Recover essential behaviour, compatibility constraints and failure semantics | Help characterise the boundary and support small, verifiable changes with recovery options |

An approach developed through the Sgr A* testing and validation work was to examine the same problem from deliberately different perspectives, rather than rely on a single assessment [8, §4]. The same principle extends beyond testing. Requirements, architectural responsibilities, accumulating technical debt and opportunities for improvement expose different aspects of an evolving system. Examining them separately can reveal assumptions and weaknesses that an implementation-focused review might overlook. These perspectives need not involve separate AI models or additional approval stages; their purpose is to improve engineering judgement, not replace it.

Fowler's account of incremental, behaviour-preserving refactoring is an established basis for changing existing code safely [9]. A necessary change in behaviour should be stated separately, not smuggled into a refactor. The same approach serves new and maintained systems: make important assumptions explicit and keep changes understandable enough to verify.

An assistant also needs to be equipped for the task. Requirements, constraints, source access and acceptance criteria are essential, but so is capability appropriate to the investigation. A model that can implement a well-defined local change has not thereby demonstrated that it can reconstruct a complex architecture or challenge a scientific model. Selection and verification remain engineering judgements, whether the model runs locally or through a frontier service.

### What this sounds like in practice

The following are example commissions written for this paper, not transcripts from Sgr A*. Their purpose is to ask for the relevant engineering work, not to prescribe a new administrative process.

**For a consequential feature or change:**

> Examine the requirement and the design it affects before editing. Who owns the relevant state and behaviour? Which assumptions, dependencies and failure cases matter? Explain whether the proposed implementation fits the current design or creates a competing responsibility. Identify what should be preserved, what needs changing and how the result can be checked. Raise material uncertainties before committing to the dependent implementation.

**For an existing or legacy system:**

> Trace the production path, including configuration, callbacks and recovery behaviour. Identify where real mutation and decision-making authority sit. Distinguish source observations, executed results and hypotheses. Explain which weaknesses obstruct change, which arrangements deserve preservation and what small corrections would improve the design without losing required behaviour.

The language will vary by task. The important shift is from assuming that a coding request includes sufficient design scrutiny to deliberately making the appropriate engineering investigation part of the work.

A useful review then asks five familiar questions: where does this responsibility belong; what state is authoritative; how do components interact and fail; does the existing design still fit; and what evidence would justify accepting the change? Security remains part of that design discussion, including authorisation, trust boundaries and enforcement. A dependency interface inside a program is not itself a security boundary. NIST's Secure Software Development Framework provides a recognised basis for treating secure development as part of the lifecycle [10].

### Engineering first; additional controls where justified

A further approval gate cannot, by itself, give competing camera drivers coherent ownership or repair a false partial-progress contract. Those problems call first for clearer responsibilities, more accurate agreements between components and verification relevant to the failure. Adding process without addressing the cause may leave the defect in place and create more work to maintain.

This is not a claim that established practices resolve every difficulty introduced by AI. It is a proposed order of investigation. We should apply the engineering we already understand, examine the weaknesses that persist and decide what additional mechanisms—tests, constraints, independent challenge or specialised assurance—are justified by the evidence. As in experimental work, reducing known sources of error helps us interpret what remains; it must not become an excuse to discard inconvenient observations.

A targeted control is valuable when it addresses a real failure that the existing arrangements do not adequately handle, and when its benefit merits the additional complexity. The same standard applies to the control itself: does it work, and does it introduce a new source of confusion or failure? The priority is better engineering, not the accumulation of gates.

## 7. What the case and wider research can establish

The strongest evidence from Sgr A* is about specific mechanisms. Directed reviews reported competing owners, broad dependencies, stale tests and an incorrect failure contract. Later public source inspection shows certain structural changes. The case supports the value of asking these engineering questions explicitly; it cannot measure the practice's general effect on productivity or establish how often an assistant would discover the same problems without direction.

The historical audit and reviews are project-held reports rather than third-party certification. The July reproduction was reported by the audit, not re-executed for this paper. Static source inspection is not a complete runtime test. The author’s account and the retrospective are not independent witnesses. These limits affect how far we can take a particular claim; they do not make the underlying engineering questions less important. Appendix A sets out the source record.

Research on AI-assisted development offers useful but mixed perspectives. It studies different outcomes and should not be collapsed into a single claim that AI either improves or degrades software quality.

| Research | Relevant finding | What it cannot establish |
|---|---|---|
| Liu and colleagues, AI-attributed commits [14] | Some static-analysis issues introduced with those commits persisted into later revisions | A human-only comparison, or that every warning is a confirmed defect |
| He and colleagues, Cursor adoption [15] | Adoption was associated with higher aggregate warning and complexity measures, with codebase growth also examined | A universal per-line quality penalty caused by AI |
| Larsen and Moghaddam, 151 Java repositories [16] | Architectural-smell counts showed no significant change; lower density accompanied code growth | That lower density means the actual architecture improved |
| Borg and colleagues, maintenance experiment [17] | No clear overall subsequent maintainability disadvantage emerged on the studied tasks | Long-term behaviour of large, evolving systems |

A smaller study of MetaGPT-generated applications described concentrated responsibilities and coupling under its particular scenarios and prompts [18]. It is a reason to examine superficial modularity, not a basis for generalising to every model and workflow.

Other research deliberately places architecture at the centre of AI-assisted work. Li and colleagues’ MAAD framework gives separate agents responsibility for requirements analysis, modelling, design and evaluation, supported by retrieved architectural knowledge and a history of design decisions. In experiments using ten requirements specifications, the authors reported more complete and traceable architecture artefacts than MetaGPT, and six practitioners found the outputs useful as design assistance. The quality of the generated designs also depended strongly on the underlying model [23]. That is evidence about designs produced from specifications, not how those designs perform as implemented systems evolve. MAAD explores greater automation; the emphasis here is on engineer-directed judgement. Both approaches treat architectural evaluation as work that should be explicit rather than incidental.

Böckeler's account of specification-driven tools highlights both the value of explicit intent and the effort involved in keeping specifications current [19]. The engineering concern is not whether a workflow is fashionable, but whether its stated design matches the system that is actually running.

The literature also raises a question for further investigation: does sustained AI assistance change how developers attend to architecture and take responsibility for an evolving codebase? Student experiments report some differences in ownership, recall and understanding, but they do not resolve that question for professional teams over long periods [13, 20]. Repository studies of agent-assisted development find changes in recorded testing and review activity, yet those measures cannot directly establish the quality of architectural judgement or a developer's sense of ownership [21–22]. Faster implementation could weaken stewardship if scrutiny does not keep pace; AI could also strengthen it by making investigation easier. Both possibilities remain open.

### Continuing the work

V1 supplied both a working scientific simulator and experience that informs further investigation. Its global-step scheduling, single-threaded workload and the June GPU backend's coordination costs presented different engineering problems: how much work is required, how it is grouped and how it is executed. The retrospective records those distinctions [11, §§5–7, 10–13]. V2 extends the science; its engineering choices must follow the physical and numerical requirements rather than precede them.

The investigation of AI-assisted engineering also began in V1 and continues. Following publication of V2, the author intends to report further work on methods for directing, coordinating and evaluating AI-assisted engineering, and to apply and develop those practices in Weft, an early-stage commercial software project. The aim is to establish a sound way of working before substantial implementation and then evaluate it through development, deployment and maintenance. This is the direction of the work, not a claim that commercial outcomes have already been demonstrated.

## 8. Keep engineering judgement at the centre

The practical opportunity is larger than faster code generation. We can use AI to interrogate design choices, recover an understanding of existing software, recognise when the architecture is becoming harder to change and improve it deliberately. Sometimes that means refactoring. Sometimes it means preserving an arrangement whose purpose is sound. Sometimes it means learning enough from a prototype to make a better decision.

The Sgr A* investigations reinforced the importance of *directing* that work. The camera review became useful when the investigation moved from another local repair to the question of ownership. The backend audit exposed a failure contract that successful feature behaviour could not establish. The scientific performance investigations showed why an apparent improvement needed the right reference before it could be accepted. None of those examples calls for abandoning established engineering principles. They show reasons to apply them more deliberately with AI as part of the work.

There is a wider question behind these examples. As new AI-specific review gates and assurance mechanisms are proposed, **are we first making effective use of the engineering practices we already have—with AI helping us design, question and improve systems, not merely generate code?**

The case does not establish a universal answer. It gives us good reason to examine that question. Where existing practices leave genuine weaknesses, investigate them and introduce targeted additional controls when the evidence justifies them.

**Good engineering first.**

---

*AI assistance.* This paper was drafted and revised with the assistance of AI models, including ChatGPT and Claude. The author directed the argument and takes responsibility for its content and claims.

---

## Appendix A. Sources, attribution and interpretation

This appendix makes the case evidence traceable without requiring readers to work through the source history before encountering the argument.

| Date (2026) | Source | Origin and method | Public? |
|---|---|---|---|
| June | Original backend [4] | AI-assisted implementation; individual contributions not fully reconstructed | Yes, commit `163c6f0` |
| 14 July | Engineering audit [1] | Unbylined project-held report associated with ChatGPT in recovered conversation context; model not confirmed. Source-archive review and direct reproduction of the backend–coordinator contract; no GPU execution | No |
| 21 September | Technical debt review [3] | Claude (Opus); source review and focused executed tests. Browser tests unavailable; release run incomplete | No |
| 22 September | Architecture review [2] | Claude Opus (identified as “Claude Opus 5” by the report); read-only review of 142 source files and runtime wiring code | No |
| 1 October | Design retrospective [11] | Project-held secondary account of investigations | No |
| October | Browser-only V1 release [6–7] | Public source examined statically at commit `65adc0d` | Yes |

In the main text, the audit is the July document; the September documents are *reviews*. Statements about the author’s decisions and intentions are **author accounts**. The October implementation is **public source evidence**, not a substitute for runtime verification. The retrospective is a **secondary project account**. Reported reviewer findings and reproductions are **AI-review evidence**, not independently re-executed results for this paper. Generalisations beyond the case are **engineering arguments or reasoned extensions**, not observations of Sgr A* itself.

The July report is titled *Independent Engineering Audit*, but the title does not denote independent human certification. Its precise AI model attribution remains unresolved. The September architecture review's model name is its own self-description, not independently recovered execution metadata. Earlier prompts and per-line implementation authorship have not been reconstructed comprehensively. The case does not support comparative AI-versus-human defect rates, claims of industry prevalence or measured productivity improvements.

---

## References

1. *SGRA Independent Engineering Audit*, 14 July 2026. Project-held report: `SGRA_INDEPENDENT_ENGINEERING_AUDIT_2026-07-14.md`, audit method and CRIT-03. Review of the source archive `performateAuditNeeded.zip` (archive name as recorded). Includes the reported direct reproduction of the partial-progress contract. No CUDA/OpenCL hardware execution was performed in that audit. Reviewer attribution is qualified in the case table and §7.
2. Claude Opus, *SGRA — Architectural Review of the Live Product*, 22 September 2026. Project-held report: `SGRA_ARCHITECTURE_REVIEW_2026-09-22.md`. The report identifies its reviewer as “Claude Opus 5”; this is the report’s own attribution, not independently recovered execution metadata. Read-only review; relevant sections: 0–4, 6 and 13.3.
3. Claude (Opus), *Technical Debt Improvement Report*, 21 September 2026. Project-held report: `TECHNICAL_DEBT_IMPROVEMENT_REPORT_2026-09-21.md`, §§3.1–3.3 and 5. Distinguishes the focused executed tests from unavailable browser tests and an incomplete release run.
4. Sgr A* public June backend, commit `163c6f0`, [`sgra_backend_final.py`, lines 650–667](https://github.com/mark-hurrell/sgra-simulator/blob/163c6f0/sgra_backend_final.py#L650-L667). Static configuration-field observation.
5. D. L. Parnas (1972), [“On the Criteria To Be Used in Decomposing Systems into Modules”](https://doi.org/10.1145/361598.361623), *Communications of the ACM*, 15(12), 1053–1058.
6. Sgr A* public V1 application root, commit `65adc0d863c354e1d395e9f41fc2e786a9dadb3d`: [`sgra_sim.html`](https://github.com/mark-hurrell/sgra-simulator/blob/65adc0d863c354e1d395e9f41fc2e786a9dadb3d/sgra_sim.html). Application-mode controller and readers; camera-snapshot readers; explicit runtime wiring.
7. Sgr A* public V1 source, commit `65adc0d863c354e1d395e9f41fc2e786a9dadb3d`: [`local_step_integrator.js`](https://github.com/mark-hurrell/sgra-simulator/blob/65adc0d863c354e1d395e9f41fc2e786a9dadb3d/src/physics/local_step_integrator.js) and [`local_events.js`](https://github.com/mark-hurrell/sgra-simulator/blob/65adc0d863c354e1d395e9f41fc2e786a9dadb3d/src/physics/local_events.js). Explicit configuration ports, event-output calls and remaining integrator dependencies.
8. M. Hurrell (2026), *When Green Tests Aren’t Enough: Engineering and assurance lessons from an AI-assisted software system*, 29 September 2026. Related project paper.
9. M. Fowler (2018), *Refactoring: Improving the Design of Existing Code*, second edition. [Author’s overview](https://martinfowler.com/books/refactoring.html), describing incremental behaviour-preserving transformations.
10. M. Souppaya, K. Scarfone and D. Dodson (2022), [*Secure Software Development Framework (SSDF) Version 1.1*](https://csrc.nist.gov/pubs/sp/800/218/final), NIST SP 800-218.
11. *Sgr A\* Simulator — Design in Hindsight: V1*, 1 October 2026. Project-held retrospective / release documentation: `DESIGN_IN_HINDSIGHT_V1.md`, especially §§3, 5–7 and 10–13. Secondary account of the investigations, not a substitute for their primary execution records.
12. N. Wadhwa, J. Pradhan, A. Sonwane, S. P. Sahu, N. Natarajan, A. Kanade, S. Parthasarathy and S. Rajamani (2024), [“CORE: Resolving Code Quality Issues using LLMs”](https://doi.org/10.1145/3643762), *Proceedings of the ACM on Software Engineering*, 1(FSE), article 36. [Author-hosted paper](https://www.microsoft.com/en-us/research/wp-content/uploads/2024/02/fse24main-p651-p-0b6cdc2533-77992-final.pdf).
13. J. H. Shen and A. Tamkin (2026), [“How AI Impacts Skill Formation”](https://arxiv.org/abs/2601.20245), preprint. Relevant experiment, exploratory interaction analysis and limitations: §§4–7.
14. Y. Liu, R. Widyasari, Y. Zhao, I. C. Irsan, J. Chen and D. Lo (2026), [“Debt Behind the AI Boom: A Large-Scale Empirical Study of AI-Generated Code in the Wild”](https://arxiv.org/abs/2603.28592v3), preprint, version 3.
15. H. He, C. Miller, S. Agarwal, C. Kästner and B. Vasilescu (2025), [“Speed at the Cost of Quality? The Impact of LLM Agent Assistance on Software Development”](https://arxiv.org/abs/2511.04427v1), preprint, version 1. Cited directly under the title of the version consulted.
16. O. A. Larsen and M. T. Moghaddam (2026), [“Mining Architectural Quality Under Agentic AI Adoption: A Causal Study of Java Repositories”](https://arxiv.org/abs/2606.13298v1), author’s accepted manuscript, SEAA 2026.
17. M. Borg, D. Hewett, N. Hagatulah, N. Couderc, E. Söderberg, D. Graham, U. Kini and D. Farley (2025), [“Echoes of AI: Investigating the Downstream Effects of AI Assistants on Software Maintainability”](https://arxiv.org/abs/2507.00788), author manuscript.
18. Y. Zhu, N. Tsantalis and P. C. Rigby (2026), [“AI-Generated Smells: An Analysis of Code and Architecture in LLM- and Agent-Driven Development”](https://arxiv.org/abs/2605.02741v1), preprint. Methods and limits: §§3–5.
19. B. Böckeler (2025), [“Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl”](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html), *Exploring Generative AI*, 15 October. Practitioner account of tools examined in 2025.
20. C. Bergh, B. Tag, A. Vassar and J. Renzella (2026), [“Your Programming Students’ Cognition with ChatGPT: Higher Performance, Lower Retention, and Reduced Ownership”](https://arxiv.org/abs/2609.21194v1), preprint.
21. M. Hamza, D. Siemon and W. N. Awan (2026), [“Does Working with AI Agents Change How Developers Code, Test, and Review?”](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESEM.2026.67), *ESEM 2026*, LIPIcs 394, 67:1–67:13, Emerging Results, Vision & Reflection track.
22. H. Yu, L. Liu, X. Jiang, Y. Jia, S. Wang, P. Qian and Y. Chen (2026), [“Habituation at the Gate: Rising Approval and Declining Scrutiny in Human Review of AI Agent Code”](https://arxiv.org/abs/2606.22721v1), preprint.
23. R. Li, Y. Zhang, X. Zhou, Y. Cai, P. Liang, W. Sun, J. Xuan, Z. Jin and Y. Liu (2026), [“Bridging Requirements and Architecture: Multi-Agent Orchestration with External Knowledge and Hierarchical Memory”](https://arxiv.org/html/2606.01385), arXiv:2606.01385v1, preprint. Extended MAAD study; the earlier work is [“MAAD: Automate Software Architecture Design through Knowledge-Driven Multi-Agent Collaboration”](https://arxiv.org/html/2507.21382v1) (2025). The two publications are one continuing research programme, not independent replications.
