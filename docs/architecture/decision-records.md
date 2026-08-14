# Architecture decision records — the index

> **AUTHORITY: LEVEL 1** for the INDEX (which decision is recorded where, and
> what its status is).  The records it points at keep their own levels.
> Authority map: [`README.md`](README.md).  Ratified 2026-08-05.
>
> This closes the one viewpoint
> [`architecture-description.md`](architecture-description.md) §3 listed as
> having **no view** (V8), and with it requirements R11, R14, R15 and R16 of
> the [42010 conformance assessment](conformance-42010.md), plus
> correspondence C5.

---

## 1. Why an index, when 67 records already exist

The decisions were recorded.  What did not exist was any way to ask **"has
this been decided, and where?"** — and that question is the whole reason the
constitutional layer exists.  Without it a decision is discoverable only by
someone who already knows it happened, which is precisely the reader who does
not need it.

Three concrete costs, all observed:

- The same question was reopened from outside twice this week, and the
  rebuttal had to be reconstructed from memory rather than cited.
- `project-philosophy.md` §5 lists eleven CLOSED decisions and, until this
  file, could not point at the argument for any of them (correspondence C5,
  recorded UNVERIFIABLE).
- Of 67 design records, **32 state a rejected alternative and 35 do not** —
  so for more than half, the reasoning that would prevent re-litigation is
  absent, and nothing said so.

## 2. How to read the table

**Kind** — what the record *is*, which is not the same as what it is called:

| kind | meaning |
|---|---|
| **ADR** | a decision, its alternatives, and why they were rejected |
| **SCOPE** | a programme's boundary: what is in, out, and named-as-deferred |
| **FORUM** | a structured deliberation; the decision is its conclusion |
| **SPIKE** | a vertical proof; the finding is the record |
| **STUDY** | evidence gathered to inform a decision, deciding nothing |

**Alt** — does the record state a rejected alternative? `yes` / **`no`**.
A `no` is not a defect in every kind (a STUDY decides nothing), but a `no` on
an ADR or a FORUM means the decision is recorded without its reasoning, and
that is the shape that gets re-litigated.

**Status** — `SHIPPED` (in the engine, with a gate), `CONTRACT` (written, not
built), `OPEN` (awaiting a decision), `HISTORICAL` (superseded or a snapshot).

**OWED ≠ AWAITING** (standing distinction, ruled 2026-08-08).  An item on the
curation ledger — a citation, a primary-source datum, an INTERIM promotion —
is OWED: reserved to Vítor, standing, blocking nothing, with no deadline and
no queue entry.  Only an item that blocks work pending an architectural
ruling is AWAITING.  Listing an owed item as awaiting recreates the
over-capacity queue this index was just cleared of; conflating them in either
direction is an error.

---

## 3. The records

### Settled and shipped

| record | kind | alt | status |
|---|---|---|---|
| [`equilibrium-parameterisation-identity.md`](../design/equilibrium-parameterisation-identity.md) | ADR | no | SHIPPED — D2 migration closed 2026-07-26 |
| [`computational-seal-migration.md`](../design/computational-seal-migration.md) | ADR | no | SHIPPED — `sealSchema computational`, 328/0 |
| [`basis-reconciliation-spike.md`](../design/basis-reconciliation-spike.md) | SPIKE | yes | SHIPPED (spike only); **mass migration UNAUTHORISED** |
| [`reactive-second-liquid-proposal.md`](../design/reactive-second-liquid-proposal.md) | ADR | no | SHIPPED — §14 records three failed designs |
| [`pcsaft-association-proposal.md`](../design/pcsaft-association-proposal.md) | ADR | no | SHIPPED with three ratified amendments |
| [`batch-temporal-utilities-proposal.md`](../design/batch-temporal-utilities-proposal.md) | ADR | yes | SHIPPED — form B |
| [`pinch-programme-scope.md`](../design/pinch-programme-scope.md) | SCOPE | no | SHIPPED P1+P2; **P3 area-cost UNAUTHORISED** |
| [`fixed-bed-thermal-a5.md`](../design/fixed-bed-thermal-a5.md) | SCOPE | no | SHIPPED — T1, T1.5, T2 |
| [`williams-otto-reference-case.md`](../design/williams-otto-reference-case.md) | SCOPE | no | SHIPPED — all four anchors |
| [`restricted-speciation-network.md`](../design/restricted-speciation-network.md) | ADR | yes | SHIPPED |
| [`general-salt-reconstruction-proposal.md`](../design/general-salt-reconstruction-proposal.md) | ADR | yes | SHIPPED — slice 1 |
| [`aqueous-stream-basis-proposal.md`](../design/aqueous-stream-basis-proposal.md) | ADR | yes | SHIPPED |
| [`normalized-residual-convergence.md`](../design/normalized-residual-convergence.md) | ADR | yes | SHIPPED 2026-08-09 — OpenFOAM-style normalized residual, ONE home (`src/solver/Convergence.H`); wired to `ReactiveVLE`'s outer Newton, §4 records what is NOT wired and why; rounding, a case-specific tolerance and a second bare threshold are the recorded rejected alternatives |
| [`model-boundary-energy-ledger.md`](../design/model-boundary-energy-ledger.md) | ADR | yes | SHIPPED 2026-08-09 — the enthalpy STEP at a per-unit `thermo {}` boundary is ACCOUNTED, not charged to the unit: three quantities (raw imbalance / declared step / remaining) kept apart on both surfaces, the verdict taken on the third, the step credited only when an INDEPENDENTLY assembled package reproduces it under `solver/Convergence.H`'s declared criteria; absorbing the step into T, pricing the report in each unit's world, and letting the report ask the auditee for its own dH are the recorded rejected alternatives |
| [`sour-water-stripper-scope.md`](../design/sour-water-stripper-scope.md) | SCOPE | no | PARTIAL — S1–S3 shipped; Table 7 needs the vapour side |
| [`curation-backlog-estimated-records.md`](../design/curation-backlog-estimated-records.md) | SCOPE | no | ONGOING |

### Contract written, not built

| record | kind | alt | status |
|---|---|---|---|
| [`provenance-semantics-five-axes.md`](../design/provenance-semantics-five-axes.md) | ADR | yes | **RATIFIED 2026-08-12, contract only** — `origin` / `method`(+`methodVersion`) / `from` / `provenance` / `reviewStatus`+`validation`, one responsibility each.  Retires `derived` AS AN ORIGIN (it only ever said a value has parents — that is `from`) and the scalar `provenance <word>;` shorthand (6 of its 22 uses answered the question the axis is named for; the BLOCK form already did this right).  The calculated/predicted line is *would perfect inputs give an exact result?*, with `K_f` kept as the permanent exhibit: exact arithmetic, inexact physical model.  Rejects storing a confidence tag (compute it from the graph) and rejects re-encoding input status into `origin`.  No implementation authorised |
| [`standard-state-transfer-adr.md`](../design/standard-state-transfer-adr.md) | ADR | no | CONTRACT ONLY — D3, no implementation authorised |
| [`model-declared-record-homes.md`](../design/model-declared-record-homes.md) | ADR | yes | **RATIFIED 2026-08-08** (queue ruling D2) — direction + recommended shape approved; build sequenced after the validation work |
| [`where-a-finding-record-lives.md`](../design/where-a-finding-record-lives.md) | ADR | yes | **DECIDED + IMPLEMENTED 2026-08-05** — debt D7; records to `core`, audit to the engine; checked against DWSIM, which supplies the pattern (`DWSIM.Interfaces`, zero deps) and the counter-example (its solver's compile path to WinForms) |
| [`problem-divergence-contract.md`](../design/problem-divergence-contract.md) | ADR | yes | **RULED + IMPLEMENTED 2026-08-11** — an approximation nobody authorised is REFUSED; one the case authorised runs and RIDES the result on three surfaces, above the KPIs and apart from the advisories.  Rejects filing the authorisation inside `activityModel {}` (a scientific concession is not an object's parameter) and rejects a new AdvisoryLog severity (a divergence is not a qualification).  Records the sabotage that caught nothing and what was changed because of it |
| [`ice-as-a-solid-phase-of-the-solvent.md`](../design/ice-as-a-solid-phase-of-the-solvent.md) | ADR | yes | **DESIGN DECIDED 2026-08-06** — one condition (mu equality), not six solvers; ice falls out of `gStd(T)` as an interface rather than a seventh special case.  Its own first draft is recorded as the rejected alternative |
| [`reference-rung-refusal.md`](../design/reference-rung-refusal.md) | ADR | yes | **DECIDED + IMPLEMENTED 2026-08-06** — `h_pure_ig`/`s_pure_ig`/`g_pure_ig` refuse a non-gas `referenceState`; revised its own plan on the first measurement (the field was already parsed), and names the water-liquid-datum gap as NOT closed |
| [`which-result-blocks-a-golden-can-read.md`](../design/which-result-blocks-a-golden-can-read.md) | ADR | yes | **FINDING + RULE, EXECUTED 2026-08-12** — a top-level result block the golden format cannot read arrives UNPINNED, silently, with no failure anywhere; three were found in one session (`validation`, `energyClosures`, `utilityAllocation` — the last on 77 cases) and closed with the `aad` / `closure` / `utility` kinds and a gate each (published ⇒ pinned AND pinned ⇒ published).  The rule is the Edwards lesson one layer up: add the kind in the same commit as the block.  §4 audits what is deliberately NOT pinned (residual histories, curves, words) with the reason for each.  Rejects a gate on the rule itself — a curve and a decision look identical to a script — and rejects regenerating goldens to add rows, which would silently rewrite every other row in 67 files |
| [`origin-vocabulary-conflict.md`](../design/origin-vocabulary-conflict.md) | ADR | yes | **FINDING RECORDED 2026-08-12, nothing executed** — `src/core/Origin.H` silently folds five of the eleven catalogue records declaring an `origin` word onto `unattributed` ("no provenance declared"), including fluorine's IUPAC-`definition` ΔHf° = 0, and folds `measured` into `literature` against the five-axis record ratified above.  The fold is the deliberate typo guard, which is the defect: an unknown word and a curator's word are indistinguishable.  Proposes a DELEGATE-WITH-DEFAULT — add `definition` (a category the enum lacks), `standard`→`literature`, `asserted`→`placeholder`, keep the `measured` fold as a STATED approximation, and refuse an unknown word by name.  Rejects a silent mechanical remap (it would lose the one fact `definition` carries) |
| [`vapour-or-gas-is-a-state.md`](../design/vapour-or-gas-is-a-state.md) | ADR | yes | **FINDING RECORDED 2026-08-06, implementation NOT started** — `noncondensable true;` stores a STATE relation (T vs Tc) as a substance flag; CO2's Tc is 31.0 °C and nine corpus cases run it at 298.15 K, six kelvin BELOW, while the engine announces "above Tc".  Ruled: announce the contradiction, as `role` vs `volatility{}` already does — never delete the flag, never silently re-route |
| [`theory-in-class-structure-study.md`](../design/theory-in-class-structure-study.md) | STUDY | no | **LEARNING STUDY, no decision** — how OpenFOAM, Cantera and DWSIM embed thermodynamic theory and size distributions in class structure; commissioned before any change to Choupo's thermo spine |

### Awaiting a decision

**EMPTY as of 2026-08-08** — cleared in one pass by
[`queue-ruling-2026-08-08.md`](../design/queue-ruling-2026-08-08.md), whose
same-day addendum resolved the one escalated item (the Wilson standards pair
joins the standing curation ledger: explicitly owed until a primary source is
verified, blocking nothing).  The one scheduled future entry (C2's spike
returning for review) was DISCHARGED the same day: reviewed and PASSED,
ruling in the spike record's §7.  The five rows this section
used to hold were STALE — each already decided when it was listed here, which
is this index failing its own purpose; they move below with their rulings.

### Decided — rows formerly (and wrongly) listed as awaiting

| record | kind | alt | ruling |
|---|---|---|---|
| [`solid-equilibrium-spike.md`](../design/solid-equilibrium-spike.md) | SPIKE | yes | **REVIEWED AND PASSED 2026-08-08 (same day)** — the three classes demonstrated, no falsification clause fired, the reactive oracle reproduced untouched to 3e-10; target architecture **RATIFIED**, migration **AUTHORISED** under the four boundary rulings of the record's §7 (one transfer mechanism; solver owns policy, models own physics); the both-active eutectic stays a named curation gap |
| [`numerical-provenance-contract.md`](../design/numerical-provenance-contract.md) | ADR | yes | **CONTRACT DECIDED 2026-08-10** (Vítor's post-consolidation directive) — every reported number traceable result→equation→state→model→parameters→primary datum→iterations→residual; `WHY?` is the SERIALISATION of that graph, so the ENGINE substantiates and the GUI only exposes.  Rejects: a parallel provenance log (two homes, drifts), boundary-only provenance (today's state — answers "which file", not "through what"), on-demand re-run (a re-run is a different execution and cannot survive into a permalink), and `Tracked<T>` in hot loops (cost, and an unreadable graph is not an explanation).  Binds work in flight; implementation UNAUTHORISED |
| [`property-evidence-taxonomy.md`](../design/property-evidence-taxonomy.md) | ADR | yes | **CONTRACT DECIDED 2026-08-10** — downloaded is not curated, fitted is not measured, generated is not authoritative: `origin` ∈ curatedMeasured/importedMeasured/fitted/estimated + orthogonal `reviewStatus`, solver REFUSES unreviewed candidates absent a case opt-in, `choupoProps acquire` mints candidates that never self-promote.  Rejects: a `trusted` boolean (cannot separate unchecked-measurement from known-estimate, so the remedy becomes unguessable), trust-by-location (today's rule, and why unsourced values sat inside standards/), a numeric confidence score as primary tag, and tagging only at import (`fitted` is minted internally).  Implementation UNAUTHORISED |
| [`reproducible-permalink-sealing.md`](../design/reproducible-permalink-sealing.md) | ADR | yes | **SEALING DECIDED 2026-08-10** (surface is roadmap) — the hash seals CODE + DATA: engine version + the case's full dependency closure as addressed content; the promise is **same result within the declared residual, NOT bit-for-bit**; the released `.wasm` is archived because permanent executability is part of the product promise.  Rejects: hashing case files only (same dict over a different catalogue is a different calculation), data-by-version-tag (a mutable pointer breaks every minted link), bit-exact determinism (unachievable, and buys a property nobody needs at accuracy's expense), re-run-at-current-version (answers a different question), rebuild-from-source (depends on a toolchain surviving) |
| [`post-consolidation-roadmap.md`](../design/post-consolidation-roadmap.md) | SCOPE | n/a | **RECORDED 2026-08-10** — positioning (reproducibility infrastructure; the opponent is the black box in the Methods section), the non-negotiable sequence, the ThermoML pilot's machine-enforced fit/held-out split, the anchor assessment taxonomy with the anti-rationalisation rule (MODEL-LIMITED requires a PRE-DECLARED envelope; otherwise UNEXPLAINED, which is a CI failure).  Authorises nothing |
| [`operational-memory-stopping-proof.md`](../design/operational-memory-stopping-proof.md) | RECORD | n/a | **CAMPAIGN CLOSED 2026-08-10** (Vítor's operational-memory ruling) — the four artefacts (ownership index · codeMap · caseManifest · impact brief §6b of DEV.md) with their gates, the five construction-time finds, and the stopping proof: two impact briefs filled by artefact lookup alone and verified against the tree.  Future gaps are fixed by the change that finds them; no enrichment campaign |
| [`queue-ruling-2026-08-08.md`](../design/queue-ruling-2026-08-08.md) | ADR | yes | **RULED 2026-08-08** — C1 delegation (amended: immediate ship, silence is not a mechanism, reserved list), C2 one solid-equilibrium architecture with class-appropriate solid models + mandatory 3-case spike, C3 uniform `phases` direction (no mass migration), D2–D4, N1–N5 deferred-with-trigger; D1 escalated back on a failed premise |
| [`open-decisions-2026-08-03.md`](../design/open-decisions-2026-08-03.md) | ADR | yes | RESOLVED 2026-08-03 in its own §Resolution — A no-reseal (report restructure to build), B built, C splitter capability to build, D stamp refinement |
| [`role-vocabulary-forum-2026-08-02.md`](../design/role-vocabulary-forum-2026-08-02.md) | FORUM | yes | DECIDED + BUILT 2026-08-02 — panel option C (DEV.md §4b item 2) |
| [`unread-dict-keys-proposal.md`](../design/unread-dict-keys-proposal.md) | ADR | no | v1 DECIDED + BUILT 2026-07-31; end state RULED 2026-08-08 (queue ruling D3: warning stays, `strictKeys` opt-in on demand) |
| [`solid-equilibrium-migration.md`](../design/solid-equilibrium-migration.md) | SCOPE | no | **CAMPAIGN OPENED 2026-08-08** under the C2 review's four boundaries (spike record §7 is the authority) — S1 production solver + S2 service seam SHIPPED (active-set + simultaneous Newton; provider-resolved sinks, `check_solid_service` sabotage-verified); S3–S5 sequenced, one slice per suite cycle |
| [`stream-transport-reconciliation.md`](../design/stream-transport-reconciliation.md) | ADR | yes | **RULED + EXECUTED 2026-08-08** — the result JSON's F/composition/H become the OVERALL material (one stream, one semantics, equal to `converged/` component by component); the "F (fluid)" relabel is the recorded rejected alternative; gate `check_stream_transport_closure`, sabotage-verified; goldens that pinned the fluid-only rows re-recorded |
| [`tp-stream-energy-coherence.md`](../design/tp-stream-energy-coherence.md) | ADR | yes | **RATIFIED 2026-08-09** (Vítor) — R-E1..R-E5 + O1: an unpinned TP inlet's ENERGY means its equilibrium state (as material already does); a pin is a declared constraint with a visible price; ONE solid rung on every surface; phase enthalpies are consistent VIEWS of one thermochemical definition (the binding precision — never pairwise-curated routes, refuse on missing transition data); one stream-H convention.  Implementation sliced (rung → inlet resolution → coherence); blast radius MEASURED before any golden moved.  **ALL THREE SLICES SHIPPED 2026-08-09** — flash19 closes at 100.00 % with Q = 0, only duties moved corpus-wide (ten goldens, each with its reason; cavett01 changed SIGN on two drums), gates `check_inlet_resolution` + `check_mass_closure`, both sabotage-verified |
| [`aqueous-analysis-inlet-scope.md`](../design/aqueous-analysis-inlet-scope.md) | SCOPE | yes | **A1 SHIPPED 2026-08-09** — a laboratory aqueous analysis is a first-class inlet with three separately recorded layers (measurement in `0/`, reconciled inventory in `converged/` under `calculated {}`, equilibrium in the answer).  Vítor ruled the three open questions: `aqueousAnalysis` is a SEVENTH exclusive canonical form (*inventory is not measurement* — the recorded rejected alternative was extending `speciesMolarFlows`, which would have made one block mean two things about the same numbers); the record goes to `converged/` only, never back into the authored file (O1); with no rule declared, an analysis inside the closure tolerance passes through ANNOUNCED and one outside it REFUSES naming both remedies — never a silent adjustment.  Ships `as <formula>` reporting bases through the shared `ElementComposition` parser, carried per-entry uncertainties, an explicit density route (iterative density refused BY NAME as the declared gap), and one reconciliation method (`adjustSingleSpecies` + its `adjustChloride` sugar) under a mandatory `maximumCorrection`.  Blast radius as predicted: ZERO corpus goldens moved.  Witness `analysis01_water_analysis_inlet` (+0.7813 % ion balance → 0, chloride +5.1208 %); gate `check_aqueous_analysis`, sabotage-verified.  **A2 SHIPPED 2026-08-09** — `method weightedLeastSquares;` minimises `Σ ((x−m)/σ)²` over the measured quantities subject to the laws the case DECLARES in `enforce ( electroneutrality elementalConservation )` plus non-negativity, solved as a convex QP by the existing hand-rolled `solver/ActiveSetQP`.  **The ruling's one-way arrow is STRUCTURAL, not a comment**: the reconciler is its own translation unit including nothing from `thermo/`, so it cannot name a speciation solver or an activity model — checked as a compile fact (the object references exactly ONE Choupo symbol).  The per-law attribution of every correction is a KKT identity the solver asserts before publishing.  Adds the ELEMENT-TOTAL row (a redundant determination carrying no material — which is what makes `elementalConservation` real), `maximumCorrection` in sigma beside per cent, and every correction reported with reported/adjusted/σ+weight/correction-in-σ/constraint-responsible/closure.  **`genericWaterAnalysis-v1` was REFUSED, not shipped** — an uncertainty belongs to a laboratory and a method, not to an analyte, so a versioned table would be invented and would look authoritative because it carried a version; a missing σ refuses naming both one-line remedies.  **pH stays refused and A2 found the reason**: adjusting it needs an activity coefficient, hence the speciation — it is not deferred, it is on the other side of the boundary.  Witness `analysis02_weighted_least_squares` (four quantities move, worst 0.2813 σ, against A1's single 5.12 % shove); gate `check_aqueous_reconciliation`, four sabotages, one of which proved the object-level boundary reading is blind to header-inline reach (stated, not discovered later).  ZERO existing goldens moved |
| [`solverdict-consolidation-scope.md`](../design/solverdict-consolidation-scope.md) | SCOPE | no | DECIDED 2026-08-04 by Vítor — Option A, recorded in its own §5 |
| [`seal-divergence-forum-2026-08-02.md`](../design/seal-divergence-forum-2026-08-02.md) | FORUM | no | DECIDED 2026-08-03 — no re-seal (counsel ruling in open-decisions §Resolution); report restructure is implementation |

### Deliberations (the decision is the conclusion)

| record | kind | alt |
|---|---|---|
| [`thermo-grammar-professors-forum-2026-07-04.md`](../design/thermo-grammar-professors-forum-2026-07-04.md) | FORUM | no |
| [`thermo-grammar-students-forum-2026-07-04.md`](../design/thermo-grammar-students-forum-2026-07-04.md) | FORUM | no |
| [`mixing-rules-forum-2026-07-04.md`](../design/mixing-rules-forum-2026-07-04.md) | FORUM | yes |
| [`flash-eos-vs-raoult-forum-2026-07-04.md`](../design/flash-eos-vs-raoult-forum-2026-07-04.md) | FORUM | yes |
| [`world-selection-forum-2026-07-04.md`](../design/world-selection-forum-2026-07-04.md) | FORUM | yes |
| [`mesh-stabilization-forum-2026-07-03.md`](../design/mesh-stabilization-forum-2026-07-03.md) | FORUM | yes |
| [`cyclone-iozia-leith-forum-2026-07-04.md`](../design/cyclone-iozia-leith-forum-2026-07-04.md) | FORUM | yes |
| [`pneumatic-conveying-forum-2026-07-03.md`](../design/pneumatic-conveying-forum-2026-07-03.md) | FORUM | yes |
| [`gibbs-map-forum-2026-07-02.md`](../design/gibbs-map-forum-2026-07-02.md) | FORUM | no |
| [`under-relaxation-forum-2026-07-03.md`](../design/under-relaxation-forum-2026-07-03.md) | FORUM | no |
| [`solution-directories-forum-2026-07-03.md`](../design/solution-directories-forum-2026-07-03.md) | FORUM | no |
| [`property-dict-review-2026-07-04.md`](../design/property-dict-review-2026-07-04.md) | FORUM | no |
| [`comfort-loop-2026-07-04.md`](../design/comfort-loop-2026-07-04.md) | FORUM | no |

### Evidence, deciding nothing

| record | kind | note |
|---|---|---|
| [`solid-migration-witness-data.md`](../design/solid-migration-witness-data.md) | SCOPE | staged 2026-08-08, reviewStatus interim — the authorised migration's validation targets, transcribed from the two owner-provided primaries (Archer 1992: invariant points + dihydrate formation props; Marcilla 1995: LLE tie-lines + the LLS tie-triangles); locates anchors, curates nothing |
| [`state-of-the-art-property-study-2026-07-17.md`](../design/state-of-the-art-property-study-2026-07-17.md) | STUDY | ordered after two AIs decided a day's architecture in a self-ratification loop without studying the field |
| [`audit-2026-08-05-arity.md`](audit-2026-08-05-arity.md) | STUDY | fleet audit, I1 |
| [`audit-2026-08-05-silent-fallbacks.md`](audit-2026-08-05-silent-fallbacks.md) | STUDY | fleet audit, I5 |
| [`audit-2026-08-05-provenance.md`](audit-2026-08-05-provenance.md) | STUDY | fleet audit, I3 |
| [`dwsim-architecture-manual.md`](../design/dwsim-architecture-manual.md) | STUDY | a consultable dev manual: 5 patterns to copy, 6 to avoid, each measured from source.  Rejects DWSIM's presentation-first object base (6 of 9 mandatory members are GUI; `Calculate` is optional) |
| [`dwsim-solids-study.md`](../design/dwsim-solids-study.md) | STUDY | ordered "if openfoam is not the way, try dwsim"; DWSIM has ONE solid mechanism (fusion K, chemistry entering via gamma) and corroborates Choupo's crystal equation; decides nothing |
| [`openfoam-study.md`](../design/openfoam-study.md) | STUDY | ordered "go and learn first, no deliverable"; proposes a uniform `phases ( … )` list and one shared unknown-type refusal, decides neither |
| [`thermoml-campaign-plan.md`](../design/thermoml-campaign-plan.md) | PLAN | the ThermoML curation campaign: sync/index/search/extract, the evidence partition, the dossier boundary.  Sequencing only -- the scientific rulings live in the ADRs it points at |
| [`evidence-partition-slice-plan.md`](../design/evidence-partition-slice-plan.md) | PLAN | the FIT / HELD-OUT contract as an executable plan: the grammar, enforcement BY CONSTRUCTION, refusals R1-R5, and the dossier's home outside every resolver root.  R5 shipped 2026-08-11 WIDER than planned and the record says so |
| [`acetone-ipa-reference-case.md`](../design/acetone-ipa-reference-case.md) | ANCHOR | transcribed 2026-08-11 from two owner-supplied primaries (Luyben 2011: flowsheet, stream table, kinetics, UNIQUAC + the IPA/water azeotrope; Rioux & Vannice 2003: measured LHHW rates).  States that the two are at DIFFERENT SCALES and must not be blended, and lists the five data gaps a case would still have to close.  Locates anchors, curates nothing, builds no case |
| [`acetone-plant-closure-state.md`](../design/acetone-plant-closure-state.md) | BUILD RECORD | how the Luyben plant went from six isolated units to a closed flowsheet, 2026-08-13.  Six findings, each reproduced: a declared H2 approximation that was NOT locally contained (it diverges the MESH three units downstream); the plant's inability to honour the published product rate; a refusal that turned out to be ONE missing datum answered two ways rather than a missing feature; the two column ceilings compounding through the recycle; a convergence aid that cannot live on a unit object; and an importer closure written for NRTL that never grew.  Decides nothing about doctrine -- it records what building it cost |
| [`props-component-curator-assessment.md`](../design/props-component-curator-assessment.md) | STUDY | assessment of the proposed `curateComponent` op; concluded the natural output is a curation DOSSIER, not a resurrected `data/proposed/` tier.  Decides nothing by itself |
| [`properties-gui-task-orientation-2026-08-11.md`](../design/properties-gui-task-orientation-2026-08-11.md) | STUDY | measured the Properties GUI against a task-orientation critique: the flow is already substance-first and one-click-to-a-curve, and the real gap is that a component is not an inspectable object.  Item 1 (the Component Inspector) shipped from it |

### Historical

`docs/architecture/archive/`, `final-property-architecture.md` (superseded
2026-07-14), `propertyPackage-v2-constitution.md` and everything under
`docs/architecture/proposals/` (unratified drafts).

## 4. Where the CLOSED decisions were argued

Correspondence C5 requires each entry in
[`project-philosophy.md`](project-philosophy.md) §5 to point at its argument.
Six do.  **Five do not, and that is stated rather than papered over** — they
predate the design-record practice and their reasoning survives only in
`CLAUDE.md` §10 as a settled note.

| closed decision | argued in |
|---|---|
| C++17, no external libraries | **ARGUED** — `CLAUDE.md` §10 licence policy ("favours readable, local C++ over dependency expansion") and the COSMO reversal, which states what the rejection was *against*: bloat — heavy deps, quantum chemistry, bulk imports, a new architecture |
| Make, no CMake | **UNARGUED** — asserted, never reasoned, anywhere |
| Explicit factory, no auto-registration | **ARGUED** — `CLAUDE.md` §5 gives three reasons: pedagogical clarity, the static-init order fiasco, and pattern consistency |
| File-first dictionaries, never YAML/JSON | **UNARGUED** — asserted, never reasoned, anywhere |
| One binary per problem class | **PARTLY ARGUED** — the *boundary* is argued (do not split within a class; strategies coexist, selected by dict) but not the choice of one-per-class over one-binary-total |
| GPL-3.0-or-later, no CLA | `CONTRIBUTING.md`, `TRADEMARKS.md` |
| Brand casing | `CLAUDE.md` §10 |
| Flat `components/` | `CLAUDE.md` §7 |
| GUI is a runner, not an editor | [`../ai/gui-credo.md`](../ai/gui-credo.md) |
| Estimation is a curation problem | [`property-architecture.md`](property-architecture.md) |
| The repository is English (US) | `CLAUDE.md` §5, [`project-philosophy.md`](project-philosophy.md) §5 |

**This table was WRONG when first written, and the correction is the point.**
It claimed all five founding decisions had no record.  Re-reading the sources
instead of the index found that **two of the five are fully argued** and a
third is argued in part — the reasoning existed, in `CLAUDE.md` §5 and in the
licence-policy and COSMO-reversal passages of §10, which is simply not where
the index looked.

**Exactly two are genuinely unargued: Make-not-CMake, and file-first
dictionaries.**  Both are asserted and never reasoned, anywhere in the tree.

This is the same defect as the provenance audit's species list, in the
opposite direction: that one **undercounted** violations (seventeen named,
eighteen found), this one **overcounted** them (five claimed, two real).  One
cause — *a hand-compiled list is itself a hand-maintained derived fact*, and
an index that measures the corpus without re-reading it drifts from the
corpus.  A gate recounts; a list remembers what it was told once.

The two real gaps stay named.  They are the oldest decisions and the most
likely to be challenged by someone who was not there, and *"it was decided"*
is not an argument.

## 5. What this index shows that no individual record could

**35 of 67 records state no rejected alternative.**  For a FORUM or a STUDY
that is often fine.  For an ADR it means the decision is recorded without the
argument that would prevent it being reopened — and reopening settled
questions is the specific failure the constitutional layer exists to stop.

The pattern is temporal: the records with rejected alternatives cluster in
July, when forums were convened deliberately; the ones without cluster in the
August programme docs, written as scope statements after the decision was
already taken. **The practice decayed as the work sped up**, which is exactly
when the record matters most.

## 6. Actions

| id | action |
|---|---|
| **AD1** | The five founding decisions gain a record of their reasoning, or `project-philosophy.md` §5 states that their argument is unrecorded. Either is honest; silence is not. |
| **AD2** | An ADR states its rejected alternatives, or says why there were none. A gate can check the section exists; it cannot check it is true. |
| **AD3** | Every future record declares its **kind** and **status** in its own header, so this index reads them instead of a maintainer inferring them — a second home for a fact that the record itself should own. |
