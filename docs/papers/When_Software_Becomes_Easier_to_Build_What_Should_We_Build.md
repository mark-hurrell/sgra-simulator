# When Software Becomes Easier to Build, What Should We Build?

## Using AI to understand the work, involve the people and choose better solutions

**Mark Hurrell · 16 November 2026 · Version 1.0**

This is the third in a series of papers exploring how to make better use of AI as a collaborative partner in software development. The first examined quality assurance; the second considered architecture and design. This paper turns to requirements and stakeholder participation: how AI could help us work with the people affected, understand the wider business process and make better decisions about what should change—and what software, if any, is needed.

## Building what was requested can still leave the problem unsolved

An approval screen can faithfully implement an unnecessary approval. A faster reporting system can preserve contradictory definitions used by different departments. A polished application can save one team time by quietly transferring its work to another.

Each can look like successful software delivery. Whether the organisation is better off is another question.

That question matters when we discuss AI in software development. There is considerable attention on generating code, automating tests and accelerating delivery. But an efficient software factory can still build around a badly understood problem. We should also ask what AI could do for the work that determines what enters that factory.

Suppose we could make it easier for operational staff, analysts, engineers and decision-makers to examine a business process together. They could explore how a proposed rule affects different roles, follow exceptions through the process and revise their understanding as they learn. A running model could let them try alternative arrangements before committing to a new application or a disruptive organisational change.

That is the opportunity explored here. AI could reduce the effort of preparing and maintaining the connected descriptions, scenarios and models that make this kind of investigation practical. It could help us examine more of the relationships that matter, while keeping the people who understand the work involved in shaping the outcome.

The ambition reaches beyond collecting better feature requests. An investigation must be allowed to question the process behind a request, the policy it implements and the assumption that new software is the answer. Sometimes the right outcome will be a new application. Sometimes it will be a different policy, better use of an existing system or a decision to leave a working arrangement alone.

Brooks recognised the difficulty of deciding what to build long before generative AI [1]. The opportunity now is to reconsider how much attention we can give that work, and how well we can support the people doing it.

## A repair service: what changes when we look across the process?

Consider a facilities organisation planning a replacement application for fault reporting, approval, scheduling and technician updates. Staff report duplicated entry and delays. Management proposes a simpler rule: repairs below £500 should proceed without a second approval.

*This is an invented example, including its rules and amounts. It illustrates how the approach could work; it is not evidence of measured AI savings.*

An application could implement that threshold quite straightforwardly. Before doing so, the team brings together repair histories, the current policy and accounts from finance, scheduling, procurement and technicians. AI helps organise the material into a set of linked scenarios and a small model of the approval rules. The analyst and the people responsible for the work check those rules against their sources.

One scenario involves three visits to repair the same asset, each costing £400. Every visit falls below the proposed threshold, but together they commit £1,200. Whether that matters depends on what the approval is meant to control. Finance needs to establish whether the policy concerns individual jobs or the total cost of related work.

In this example, finance confirms that related work should be considered together. Scheduling explains that parts shortages can split a repair across several visits. Technicians then point out that two reports about the same asset can concern different faults, including urgent ones. Automatically merging apparent duplicates could lose a distinction that matters.

The discussion has changed. The team is now examining what counts as a repair episode, how parts availability affects scheduling, how costs accumulate and who can authorise urgent action.

| Case to examine | What the simple threshold misses |
|---|---|
| One routine £400 job | Whether it belongs to an appropriate low-risk category |
| Three related £400 visits | Whether the £1,200 total should receive review |
| Two different faults on one asset | Whether apparently duplicate reports must remain separate |
| Urgent work during a parts delay | Who can authorise action and what follow-up is required |

Here the AI's useful contribution is helping the team keep these relationships connected as it explores alternatives. When participants change a rule, it can prepare revisions to the scenarios, model and explanations for each role. The team can then examine what follows, correct mistakes and try another arrangement.

A table may be enough for a few cases. A running model becomes more useful when several rules interact and participants want to change thresholds, grouping rules and exception paths repeatedly. They can follow a case through the process and see where it goes. The model makes those consequences easier to inspect; the participants establish whether it represents the work adequately.

Suppose the organisation decides to trial a revised process using existing tools. Staff link related visits where justified, make parts delays visible and follow an agreed route for urgent work. They retain separate fault reports and review cumulative commitments under the clarified policy.

The trial examines delays, repeat visits, administrative effort, financial exceptions and the work transferred between roles. It also checks whether people can access and use the service. If existing tools cannot support the process reliably, the findings give the team a stronger basis for a new application or targeted integration. If the revised process creates excessive burden, it needs reconsideration.

The opening request was for a new application with a simpler approval rule. The investigation has produced a better understanding of what any solution must address.

A capable team could reach that understanding without AI. The proposed benefit is that AI could make preparing, comparing and revising the connected material less laborious, allowing the team to examine more useful cases within its budget. Whether it actually does so needs to be measured. A changed recommendation, or a decision to build no software, is not proof of success on its own.

## Cheaper software does not settle the cost of change

The cost of a software project extends into the organisation that must adopt it. Data has to be migrated, systems connected, staff trained and responsibilities changed. Work may be disrupted during the transition. Those costs can remain substantial even when the code is much cheaper to produce.

The following figures are illustrative, not industry estimates or measured AI productivity results.

| Cost component | Initial estimate | Illustrative estimate with AI assistance |
|---|---:|---:|
| Software construction and testing | £100,000 | £30,000 |
| Integration and migration | £80,000 | £70,000 |
| Training and organisational transition | £100,000 | £100,000 |
| **Total** | **£280,000** | **£200,000** |

Construction and testing become 70% cheaper in this example, but the overall reduction is about 29%. AI may help with migration, training and other activities too; the unchanged transition figure is simply an assumption. A real appraisal must also include discovery and subsequent operating costs.

The point is that choosing the wrong change can remain expensive. Faster implementation does not remove the need to understand what people will have to live with afterwards.

There are two ways AI could help us give that understanding more attention. First, it can assist discovery itself: preparing comparisons, drafting scenarios and updating models. Any saving must include the effort of checking and correcting the results. Second, where AI demonstrably saves delivery time, an organisation can choose to reinvest some of it in observation, requirements work and engagement with users.

These opportunities are separate. AI-assisted discovery need not wait for programming savings. Reinvested delivery time can improve discovery even when AI contributes little to the investigation itself.

Neither creates extra hours for frontline staff. Their participation still needs a purpose, protected time and, where necessary, operational cover. One valuable use of engineering time is preparing better questions and doing the follow-up, so participants spend less time getting oriented and more time contributing their judgement.

Organisations can also take savings as reduced expenditure or additional output. Those are legitimate choices, but more software can bring more demands on people's attention and capacity to absorb change. Leaders should make that choice deliberately and account for the consequences.

Extra investigation must earn its place too. Value-of-information reasoning asks what we could learn that would affect a decision, and whether learning it is worth the effort and delay [2]. For the repair service, clarifying the purpose of the approval could change the entire proposed solution. Perfecting a diagram after that question is settled may add very little.

Accessibility, safety, trust and transferred workload also belong in that judgement, even when they resist a credible price tag. The aim is to spend effort on questions that matter to the decision, using the most useful way of answering them.

## Keeping the wider picture connected

A policy change rarely belongs to one screen or one department. It can affect what staff need to know, how work is handed over, which exceptions need attention and what evidence must be retained. Keeping those connections up to date is an important part of the opportunity for AI.

For example, it could help compare two teams' accounts of a handover and prepare questions about their differences. It could draft scenarios affected by a rule change, or identify earlier decisions that need another look when a policy changes. It could prepare an accessible explanation for participants who were absent from a workshop and organise their corrections for the team to consider.

This requires more than a fluent model. Sources, versions and review responsibilities have to be maintained. A revised policy should trigger review of dependent claims; it should not silently rewrite the record as though all the earlier evidence still applied.

There is research supporting some of the individual tasks. Shen, Singhal and Breaux reported favourable results from two controlled experiments on AI-generated follow-up interview questions, including benefits from guidance about common interviewer mistakes [3]. Mircea and colleagues found that 26 participants generally preferred AI revisions to their requirement statements, including for clarity and alignment with their intentions [4]. That study concerned integrated development environments and measured participants' perceptions; it did not establish that AI could accurately describe a complex organisation.

Korn, Gorsch and Vogelsang evaluated an interview chatbot through 33 simulated stakeholder interviews. It extracted requirements and asked context-sensitive questions, while also making interviewing errors [5]. People were acting in predefined scenarios, which limits what the results tell us about real workplace disagreements and pressures.

These studies give us reasons to explore particular forms of assistance. They do not yet demonstrate that maintaining connected organisational models saves time overall or leads to better business decisions. That wider expectation is the argument to test in practice, rather than a result this paper can claim.

AI interviews could offer another route for people to contribute, provided they know how their responses will be used, can correct the record and can speak to a human instead. Facilitators still need to examine whose views are missing and how the questions might steer the answers.

Generated personas and simulated objections can help prepare an investigation, but they cannot tell us what actual affected people experience or accept. They are suggestions to examine. They cannot stand in for stakeholder participation.

## Four disciplines that keep the work honest

The attraction of a connected model is also a danger: a mistaken account can become very convincing when its diagrams, explanations and demonstrations all agree. Four disciplines help keep that confidence proportionate to the evidence.

### Keep facts, proposals and assumptions distinguishable

A useful starting point is to label important claims according to where they came from.

| Status | What it tells us |
|---|---|
| Observed practice | What was recorded in actual work, within the scope of that observation |
| Documented policy | What an identified policy requires, which may differ from practice |
| Participant testimony | A person's account, with its context and any disagreement retained |
| Proposed policy | A possible future rule awaiting a decision |
| AI inference | A generated interpretation that needs checking |
| Placeholder assumption | A temporary modelling choice that remains unresolved |

These labels are not a ranking of truth. An observation can be unrepresentative and a policy outdated. A person's account may reveal something missing from the records. Where several sources support a claim, retain their different contributions.

For claims that affect the decision, record the source, date, scope, exceptions, uncertainty and reviewer. Repetition does not turn an AI inference into observed practice. Nor does a preferred proposal become policy without authorisation.

An authorised decision does not make an incorrect factual claim true. People with authority can decide a policy; evidence is still needed to establish what happens in practice and what the consequences are.

### Ask what the model represents—and what it leaves out

Three questions help distinguish a working model from a trustworthy account:

- **Internal coherence:** does it behave consistently with its own rules?
- **External fidelity:** do those rules and behaviours match the evidence about real work?
- **Evidential coverage:** whose work, which situations and what consequences have been examined?

A model can pass every internal test while missing an informal handover or excluding the night shift. More runs of the same model will not repair that omission.

Looking at the whole system means including the relationships that could materially affect the decision. It does not require modelling the entire organisation. Record the important exclusions and reopen the boundary when one could invalidate the proposed change. Stop investigating when the remaining uncertainty is acceptable for the commitment and further work offers too little value.

### Check beyond the generated material

A requirements document, diagram, prototype and test suite can all repeat the same mistake. Their agreement shows consistency, not independent confirmation. A second AI reviewer may find errors, but it cannot supply operational evidence missing from the sources.

Check important claims against observations, records, authoritative policies and the people involved. Reviewers must be able to question the interpretation itself. Production acceptance tests need a basis in approved domain evidence, rather than taking their entire authority from the prototype they are meant to check.

### Give participants influence over the decision

Participation involves the ability to shape and evaluate alternatives, as participatory-design research makes clear [6]. Attending a workshop is not enough.

AI adds a particular risk: the person choosing the prompts and sources can determine which alternatives become concrete first. A polished proposal can look settled before someone else has had a chance to explain a different view.

Invite alternative accounts, retain material objections and let contributors correct how their views are represented. Provide accessible ways to participate, including for people whose shifts or responsibilities make workshops difficult. Customers, contractors and others outside the organisation may also bear consequences that belong in the discussion.

Someone must have authority to act on findings that cross departmental boundaries. Decision owners should explain what changed because of participants' contributions and why significant objections were rejected. That gives participation consequences without giving every person a veto.

Agree how contributions will be used, accessed and retained, with appropriate privacy and security review. Discovery material should not be repurposed for individual performance scoring. People need to be able to describe workarounds and difficulties candidly if the organisation wants to understand its own work.

## Knowing when to try the change

Sometimes a small trial will teach us more than another model. Actual work can expose incentives, behaviour and workarounds that nobody anticipated. If a change has limited consequences, can genuinely be reversed and can be observed properly, trying it may be the best next step.

Reversibility needs to be considered from the users' perspective as well as the engineers'. Reverting code cannot undo disclosed information, recover lost trust or automatically restore responsibilities and working practices. Major migrations and difficult-to-reverse changes deserve more investigation before commitment.

This leaves room for both a broad understanding of the system and focused experiments. The broader investigation identifies the important unknowns; a trial answers a particular question; the result informs the wider decision. Short delivery cycles can help carry out that decision. They cannot substitute for understanding what the organisation is trying to achieve.

When software is warranted, the investigation should hand over clear requirements and their evidence, important scenarios and exceptions, technical constraints, decisions, disagreements and unresolved assumptions. Engineers still have to establish a sound architecture and address security, reliability, accessibility and maintainability. A useful exploratory model is not automatically a production design.

## Building on good engineering practice

Much of this will be familiar to experienced analysts, designers and engineers. Joint Application Design brought users and developers into facilitated requirements work. Davidson's study of three organisations found modest improvements, but also showed how restricted participation and developer-centred practices limited the benefits [7].

Soft systems methodology offers an established way to investigate difficult organisational situations [8]. Hammer challenged the automation of inherited processes [9]. EventStorming supports collaborative exploration across business boundaries [10]. The UK Government Digital Service asks teams to understand users, constraints and the wider problem before committing to a service, including considering alternatives to building one [11, 12].

AI did not invent those ideas. The question is whether it changes what teams can afford to do with them: maintain richer connections between different accounts, explore important alternatives and return to participants as understanding develops.

That is what I mean here by AI-enabled collaborative application discovery. The investigation concerns a possible application, while leaving its purpose, scope and necessity open to challenge. Its value has to be judged against capable existing practice, not against a deliberately weak process of collecting requests and immediately coding them.

## How we would know it was helping

A sensible place to begin is a project where several roles depend on one another, an unresolved question could change the decision, and people with the necessary knowledge and authority can participate. Agree beforehand what would make the effort worthwhile.

Three practical questions preserve the distinction between promise and demonstrated benefit:

| Question | What to examine | What would count against the approach |
|---|---|---|
| Does AI reduce preparation and revision effort without lowering quality? | Include checking, correction and coordination, with independent review of errors and omissions | The saving disappears when checking is included, or important mistakes increase |
| Can the team investigate more of what matters within the same budget? | Examine useful coverage across roles and scenarios, alongside participant time | More material is produced but no important question is answered better, or participants are overloaded |
| Does reinvesting delivery time improve decisions enough to justify the cost? | Compare the evidence behind decisions and subsequent results, including delay and transferred workload | Extra investigation adds too little value to justify its cost |

Assess AI assistance and reinvestment separately. Where feasible, compare similar work with and without each, using capable teams and recording their tool access. Agree quality criteria, the size of improvement worth pursuing and the follow-up period before looking at results. Record model versions, evidence access and participant availability so differences have a fair explanation.

A good decision has a worthwhile objective, credible alternatives, support for important claims, visible uncertainty and accountable reasons. Later results matter too: did the service improve, was rework avoided, and who absorbed extra burden? Agreement in a workshop or a changed recommendation is insufficient. Good decisions can be unlucky; poorly supported decisions can succeed by chance.

The approach may fail because drafting was never the real constraint. If staff cannot participate, departments will not cooperate or sponsors will not reconsider their preferred solution, cheaper models will achieve little. Checking can also absorb the saving, while too many generated alternatives can exhaust the people asked to review them.

Those are reasons to test the approach honestly. If useful coverage and net effort do not improve in the settings where we expect them to, the case for AI-assisted discovery weakens. If additional investigation does not justify its cost, reinvestment needs reconsideration. A faster document alone establishes neither benefit.

For engineers, this work calls for observation, requirements analysis, facilitation, evidence handling and feasibility judgement alongside technical expertise. Analysts, UX researchers, service designers and operational specialists bring skills that remain essential. Experience of implementation, debugging and operations also matters: it helps engineers recognise unrealistic proposals and challenge generated systems. Saved programming time does not instantly become expert discovery capacity; people need opportunities to develop those abilities.

## Choosing what deserves to be built

The opportunity is to use AI to support a more sustained conversation about how an organisation works, backed by models and evidence that participants can examine and challenge. If it makes that work more affordable, we can investigate relationships and alternatives that might otherwise receive too little attention.

Leaders can begin by accounting for the whole cost of a change, protecting time for meaningful participation and judging the outcome by the quality of the decision and its consequences. The result may be a better application. It may equally be a simpler process, a revised policy or better use of what already exists.

If AI gives us more capacity to build, we should use some of that capacity to understand what is worth building. The people who will live with the result should help us decide.

## References

*Academic research and established practice guidance serve different purposes here. The empirical studies cited concern bounded requirements-engineering tasks; they do not validate the complete proposal. Online sources were checked on 15 November 2026.*

[1] Brooks, F. P., Jr. (1987). *No Silver Bullet—Essence and Accidents of Software Engineering*. Computer, 20(4), 10–19. [University-hosted text](https://cgi.csc.liv.ac.uk/~coopes/comp319/2016/papers/NoSilverBullet-Brooks1987.htm).

[2] Howard, R. A. (1966). *Information Value Theory*. IEEE Transactions on Systems Science and Cybernetics, 2(1), 22–26. [DOI](https://doi.org/10.1109/TSSC.1966.300074).

[3] Shen, Y., Singhal, A., & Breaux, T. (2025). *Requirements Elicitation Follow-Up Question Generation*. **33rd IEEE International Requirements Engineering Conference (RE 2025)**, 117–129. [DOI](https://doi.org/10.1109/RE63999.2025.00021); [author manuscript](https://arxiv.org/abs/2507.02858).

[4] Mircea, M., Gevrek, E., Schmid, E., & Schneider, K. (2026). *Supporting Stakeholder Requirements Expression with LLM Revisions: An Empirical Evaluation*. In **Requirements Engineering: Foundation for Software Quality (REFSQ 2026)**, LNCS 16497, 303–319. Springer. [DOI](https://doi.org/10.1007/978-3-032-21423-2_21); [author manuscript](https://arxiv.org/abs/2601.16699).

[5] Korn, A., Gorsch, S., & Vogelsang, A. (2025). *LLMREI: Automating Requirements Elicitation Interviews with LLMs*. **33rd IEEE International Requirements Engineering Conference (RE 2025)**, 19–30. [DOI](https://doi.org/10.1109/RE63999.2025.00013); [author manuscript](https://arxiv.org/abs/2507.02564).

[6] Bratteteig, T., & Wagner, I. (2016). *Unpacking the Notion of Participation in Participatory Design*. Computer Supported Cooperative Work, 25, 425–475. [DOI](https://doi.org/10.1007/s10606-016-9259-4).

[7] Davidson, E. J. (1999). *Joint application design (JAD) in practice*. Journal of Systems and Software, 45(3), 215–223. [DOI](https://doi.org/10.1016/S0164-1212(98)10080-8).

[8] Checkland, P., & Poulter, J. (2006). *Learning for Action: A Short Definitive Account of Soft Systems Methodology, and Its Use for Practitioners, Teachers and Students*. Wiley. [Publisher record](https://www.wiley-vch.de/en/areas-interest/finance-economics-law/learning-for-action-978-0-470-02554-3).

[9] Hammer, M. (1990). *Reengineering Work: Don't Automate, Obliterate*. Harvard Business Review, July–August. [Article](https://hbr.org/1990/07/reengineering-work-dont-automate-obliterate).

[10] Brandolini, A. *EventStorming*. [Official practice site](https://www.eventstorming.com/).

[11] Government Digital Service. *How the discovery phase works*. GOV.UK Service Manual. [Official guidance](https://www.gov.uk/service-manual/agile-delivery/how-the-discovery-phase-works).

[12] Government Digital Service. *Service Standard, point 2: Solve a whole problem for users*. [Official guidance](https://www.gov.uk/service-manual/service-standard/point-2-solve-a-whole-problem).

## Author's note

Generative AI assisted the development, critical review and revision of this paper. Those exchanges are editorial inputs, not peer review or empirical evidence for the proposal. This is a practitioner discussion paper, not a peer-reviewed study.