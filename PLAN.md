# PLAN -- the CML plan: now, the next day, the next three days, beyond a week

The CML plan (curto / médio / longo; Vítor's name, 2026-10-31; his horizons,
2026-11-01: "1 h, 1 dia e 3 dias ou mais ... o que não couber pode ficar para
> 1 semana").  Months and years are `ROADMAP.md`, which feeds the last
section.  Read at the start of every session (CLAUDE.md rule 8).  Each row
points at its DEV.md 4c entry, the register of record.  Vítor's private
Portuguese view is https://claude.ai/artifact/JnokFGgoNMTAWvu9fkgyoQ; its
header names the PLAN.md commit it reflects, so a stale view shows itself.

## How the plan is kept (the architect's rule, 2026-11-01)

1. **Capacity, not hope.**  Up to 7 generals at once (CLAUDE.md rule 4:
   each `make -j1`, at most 4 compiles or suites, one heavy job, 2 cores
   and 2 GB always left), each 30-60 minutes, integrations one at a time.  So: **Now** holds
   only what is RUNNING (at most 7 rows: Vítor ordered up to 7 generals on 2026-11-02); **Next day** at most 5 rows;
   **Next three days** at most 8; everything else is **Beyond a week**.  A
   column over its cap pushes its LAST row down one column.
2. **Order inside a column is priority**: a wrong number at exit 0 first,
   then what Vítor asked for most recently, then what unblocks other rows,
   then the rest.
3. **Revised as Vítor gives tasks.**  A new task is written in DEV.md 4c in
   the same turn (CLAUDE.md section 10), placed by rule 2, and the column
   caps of rule 1 decide what moves down; the move is said to him in one
   line.  A row is never dropped silently: it moves, finishes, or leaves
   with its reason in DEV.md 4c.
4. **Pulled forward when a slot frees**: when a general finishes, the first
   row of Next day starts and the first row of the next column moves up.
5. **Done rows stay one week**, then leave this file (DEV.md keeps them).

Last reviewed: 2026-11-01 (restructured by capacity; earlier reviews in git).

Status words: `todo` · `queued` (built by a general, waiting its turn to integrate) · `integrating` · `running` · `decide` (the architect's, with a written reason) · `waits-Vitor` (a fact or act only he holds) · `blocked` · `done`.

## Now (RESUME HERE after the 2026-11-02 controlled shutdown; nothing is running)

Every general stopped with the laptop.  All their work is on origin as `backup/*` branches; the first thing to read is `HANDOFF-C200.md` on `backup/c200-handoff`.

| status | what | ref |
|---|---|---|
| todo | Before the brief lands, read docs/reviews/2026-11-02-kernel-review.md: the phaseChanger fix, the two 404 URLs, Complete 0/ on the site, nine missing packs, five text corrections | C202 |
| todo | Merge the brief (`backup/c200-handoff`, its `kernel.md` renamed `brief.md` (in docs/ai) in the same commit) with the three packs (`backup/pack-recycles-pressure`, `backup/pack-separations`, `backup/pack-reactors`) in ONE commit (check_doc_references refuses a brief pointing at missing packs; the table lists only the packs that exist, the URLs and the browser Complete 0/ are not promised until they exist); fix the brief from the packs' findings; record the contradictions found in older docs/ai in DEV.md C200 | C200 |
| todo | Relaunch the browser Complete-0/ general from `backup/a8318e2acf001dce2` (it was in `--gui` validation; 16 files of WIP) | C200 B' |
| todo | Integrate boron Stage 1 (`backup/boron-stage1`); the golden re-record of swro01_campoDalias is ruled acceptable, the list goes in the commit | C198 |
| todo | Integrate the GUI header-read branch (`backup/adc55b34e36500669`) | C199 |
| todo | Re-run the LLM-brief harness (`bin/curate/llm_brief_eval.py`, branch `backup/c200-harness`) on the brief + packs; baseline: `--core` solves 7/10, the GUI bridge guide 0/10 | C200 A |

## Next day (at most 5)

| status | what | ref |
|---|---|---|
| todo | phaseChanger `outletState saturatedLiquid` / `outletQuality 0` on a mixture stops 119 K below saturation at exit 0 (PhaseChanger.cpp:428-433): fix the bracket scan, add a mixture witness; the C200 brief teaches this spec | C202 (1) |
| todo | (Opus) Acetic acid: the slice is BUILT on `backup/c201-acetic-vapour`; settle first why the engine prices 33.0 vs the measured 24.4 kJ/mol latent heat at Tb (test: Watson on the monomer-basis latent heat), then the column dew-point distillate, the Gibbs/three-phase/binaryTxy readers, the formula-match identity; then the moved rows to Vitor. Earlier text: Acetic acid, ONE slice: the liquid bridge (confirmed cause of the 7x esterification heat, branch `backup/c201-acetic-bridge`) together with the vapour-side association (one-record-two-vapours doc); alone it doubles real column condensers; then the seven tutorials whose exotherm was the artefact (content decision for Vitor) | C201 (1) |
| todo | The GUI's MASS cell reads "not published" on almost every case: read the massBalance report's TOTAL scope when `globalMassBoundary` is absent, as the emitter says | C201 (2) |
| todo | After each push that adds a unit: the site's own WASM build and one browser run of the new case (the pressure exchanger first) | C196 |
| todo | Confirm on the site (WASM) that C178 and C182 are published (minutes, done between integrations) | C178, C182 |

## Next three days (at most 8)

| status | what | ref |
|---|---|---|
| todo | C200 remaining packs (heat, electrolytes, membranes, solids, design-cost, drivers, batch-transient, props), the generated reference and `llms.txt` on the site; the harness re-run | C200 |
| todo | C199 leftovers: the vessel port positions, the pressure-centre alternative case and the pump curves | C199 |
| todo | The real boron: two-solute transport (boric acid, borate), a stream pH with speciation, a curated H3BO3/BOH4 record, a dosing unit; and a recycle solver that refuses the trivial fixed point by name | C198 |
| todo | The methanation reactor EduTool and a Power-to-Gas plant case (pedagogical scope written first) | C191 (B) |
| todo | Release Choupo-2612, the first since 2608 | ROADMAP S4 |
| todo | Newcomer surfaces: `runCase` shows the answer, the balance verdict and the caveat block (not a log tail); one "start here" path across doc, landing cards and the site folder | C201 (3), (4) |
| todo | Tutorial texts the review found stale or false (column duties after the condenser fix, flash02's "What to try", membrane01's header) and the housekeeping list; moved goldens, if any, go to Vitor as a list | C201 (5), (6) |

## Beyond a week

| status | what | ref |
|---|---|---|
| todo | `digitalTwin/`, its own tutorials folder (operation of a designed plant, continuous on choupoCtrl then batch on choupoBatch, layout REQUIRED): plan of dynamic models per unit first, then loops/instruments with a generated P&ID, then the operator panel (pedagogical scope to Vitor first) | C203 |
| todo | A cumene case (the graph's three cumene routes link nothing) | C191 |
| todo | Verify and fix the Gibbs review's three open items and the SpeciationSolver outer convergence | C187 (1)(2) |
| todo | Pharmaceutical groups: the compaction bench (Heckel, Kawakita, Ryshkewitch fitted to the group's data), sized tablet machines, clean utilities (HVAC, purified water), blend uniformity | C195 |
| todo | Distillation P0 (step contract, singular-Jacobian diagnostic); re-run and classify Vítor's DME plant | C184 |
| todo | aceticAcid02: the subcooled-feed q in the simultaneous column branch | C174, C175 |
| todo | Seeded crystallisation, cake filtration and washing, a linear chromatography column (pedagogical scope first) | C190 |
| todo | Views for choupoSolve cases; parallel runs | C187 (5)(6) |
| todo | Show a props run's `postProcessing/` in the GUI case tree | C183 (1) |
| todo | Owed answer tables: the EduTools review; C112 final table | C150, C112 |
| todo | EduTools: dispatch C127; quizzes (7 of 66 tools have one); C132; the RTD lesson | C127, C158, C132 |
| todo | UX-audit deliverables committed; parity study phase 0 landed or decided; details pane resizable after C172 | C168, C160, C153 |
| todo | The months-and-years roadmap | ROADMAP.md |

## The architect's decisions (rule 00; each taken with its written reason in DEV.md 4c)

| status | what | ref |
|---|---|---|
| decide | Sequential cooling: independent / solids retained / solids removed; solid-phase balances; CO2 as a separate boundary condition | C181 |
| decide | Where props operations write their CSV (case root today, or `postProcessing/<op>/`) | C183 (2) |
| decide | Laboratory template for a DSPM-DE fit | C177 |
| decide | Temperature excursion: the excipient and buffer names; whether the Explorer lens stays | C118 stage 3 |
| decide | Registered-trademark wording for the eight guides and the paper | new |
| decide | The reviews owed: C140 lesson (factor stays unwritten, decided), C53/C54, C101, C143, C58 | several |
| decide | Scope of the chemical-network EduTool | C139 |
| decide | Two liquid surfaces: the architecture (today a refusal by name) | C173, C187 (4) |
| decide | The comparison's recommendations (ii)-(viii): which enter the plan | C187 (3) |
| waits-Vitor | Membrane sponsorship (partner block, ranking never reads who pays): contact manufacturers only once Choupo has traffic; Synder Filtration first | C189 |

## Waits on Vítor (facts and acts only he holds)

| status | what | ref |
|---|---|---|
| waits-Vitor | Open swro01_campoDalias in the browser: does the 3D start, are the 2D drawings legible? | C199 |
| waits-Vitor | Reactive full MESH and the multi-ion NF dataset: the reference PDFs | C175, C176 |
| waits-Vitor | JOSS: ORCIDs, DOI; whether Pedro Mendes agrees to enter CITATION.cff | C168 (3), C171 |
| waits-Vitor | Was the reply to Tim (MionTec) sent? | C171 |

## Done (kept for one week, then removed)

| status | what | ref |
|---|---|---|
| done | The header sizer (diameter, velocity, pressure drop per header, 54 items) | C199, 9186e11dd |
| done | C199 B and C: every vessel inside its rack in 3D, plan / section / rack elevation with headers, the train schematic, the RO/NF layout heuristics in the user guide | C199, 7c63e6493, 8c6532f38 |
| done | C199 phase A: the Campo de Dalías plant is six trains in one RO building (pumps with a declared maximum, PX arrays, vessel banks with racks and loading clearance) | C199, 191be6e8a |
| done | Heavy water promoted: IAPWS/Herrig vapour pressure, reviewed against the primary equation, UNIFAC H2O as a declared approximation | C197, 4d3cb4f9d |
| done | check_model_boundary_ledger probes repaired after the turbine contract (they audit the flash) | C188, 0734b0c60 |
| done | The 3D layout view no longer crashes on a rack with no portals (found by Vítor on swro01_campoDalias) | C194, b19085a6b |
| done | The Campo de Dalías SWRO plant from Toray's case study, two passes, boron as a declared lumped approximation, layout to the fence | C194, 3736c17e8 |
| done | The EduTool 'Patent expiry and generic entry' for the two pharmaceutical groups (two real sources read, the rest declared assumed) | C195 (4), facf7ca2b |
| done | Pressure is a tear variable; the sibling drivers read no unconverged point (two goldens moved on written reasons) | C186 (5), 43b5c58c8 |
| done | The acceptance contract on 15 more units, three real defects found by it (turbine fed a liquid, absorber with an inert solute, extractor ports), the Theory Guide section | C188 item 5, 54f3ab783 |
| done | The commercial shortlist (no score), A_w derived from the data sheet, the module registry's local tier, class cases seal | C189, 2aa30a65d |
| done | Distillation: a non-improving Newton step is counted and announced; an unconverged CMO seed is announced | C184 A, B, 126fc9b98 |
| done | The gates judge the tracked tree; 16 Burcat records re-sourced to NASA/TP-2002-211556 | C170, 5759132c6 |
| done | The rest of the external audit: explicit reverse pair on the batch vessel, catalystLoading on the own paths, the membrane fitter's stall verdict, PC-SAFT roots near the spinodal | C190 (14)(11)(15)(12), 3168d0c7e |
| done | Integration friction: a tool that re-points lesson citations by content, index counts generated, additive conflicts kept by bin/integrate | C196, ba62b677b |
| done | Sized tablet machines (utilisation against the batch plan) and clean utilities (HVAC, purified water) for the two pharmaceutical groups | C195 (1)(2), 96e3d118d |
| done | The pressure exchanger: unit, design sheet, schematic, SWRO energy-recovery case (1.88 against 3.67 kWh/m3) | C192 |
| done | Negative kinetic orders honoured on the vessels' own paths; CHEMKIN molecularity summed before rounding | C190 (10)(13), ab25caab5 |
| done | The EduTool 'The tree of chemistry' (three views; every assumed band drawn as the curator's); the GUI dict parser keeps `=` in a word | C191 (A), 0ced76401 |
| done | Silica: a neutral dissolution master weighed as an aqueous species; checked in the site's WASM | C179, 571301962 |
| done | Precipitation against temperature as a native view; seen in the site's Studies | C180, b3b25db47 |
| done | JOSS paper sent to Pedro Mendes (paper.md attached) | 2026-10-27 |
| done | Audit of Vítor's requests 24-31 Oct | 2026-10-31 |
| done | C182 on main: the degC view axis, the volcanic case deleted (now a gate fixture), DEV.md C182-C186, five GUI lesson citations re-pointed | C182, 85700dbb8 |
| done | This plan in git (PLAN.md, CLAUDE.md section 0 rule 8) | PLAN.md |
| done | Seven wrong STATUS lines corrected in DEV.md 4c (C140, C173, C174, C118 stage 2, C172, C170 item 6; C178 on its integration) | DEV.md 4c |
| done | The audit's unrecorded items recorded (C187), the comparison's recommendations registered without the name | C187 |
| done | CLAUDE.md section 0: rule 00 (the architect decides), the laptop's measured budget, "the CML plan" | CLAUDE.md |
| done | C185 item 7 (LHHW detailed balance at the declared Kc) and the ruling: detailed balance with non-mass-action orders refused by name | C185, b98ddc97e |
| done | C186 item 6: an unconverged bubble point is not a T-x-y point (plot tolerance in one home, announced) | C186, b98ddc97e |
| done | C188 defects 1-4: RO swallowed a volatile solute; a pump pumped vapour; the aqueous solvent has one home; activity models declare their domain | C188, 6348b66e3 |
| done | C178 integrated; lesson citations re-pointed by content (C185/C186 had moved them); Node 18 `File` for the GUI tests | C178, 421bc12e0 |
| done | C185 item 9: thirdBody reactions ran at rate zero in the batch reactor; fixed, no golden moved (the end state is the equilibrium), the path changed | C185, 42de25568 |
| done | C188 item 5 slice C: the diafilter defect closed; the contract generates the docs/ai and GUI sections (one source) | C188, 0ca2b5166 |
| done | C188 item 5 slice B: ED, batch ED, diafilter, ion exchanger, crystalliser on the contract; passThrough on the ED stack (ed10) | C188, fdbc410e9 |
| done | C188 item 5 slice A: the acceptance contract, one writer of refusals, RO and pump migrated, authored inlets checked before the solve, --describe-units | C188, fe9420e07 |
| done | C185 item 8: the positivity guard is a per-row mask over every ODE unit | C185, 42de9160d |
| done | C186 item 4: the optimiser rejects unconverged simulations on every path (NM, SQP, integer enumeration) | C186, 1ad1aef00 |
| done | C191 (A) the graph of commodity chemistry curated: 157 substances, 168 routes, every route cited, all yield bands marked assumed | C191, 2b49af710 |
| done | C189 slice 4: the membrane catalogue import/QA tool; the real import of the workbook (13 records, all pressure bases unstated) | C189, bf3402ef5 |
| done | C189 slice 3: six illustrative membrane classes a student chooses by what they do (membrane26) | C189, 625c4c065 |
| done | Rated pressures read as gauge on NF270-4040 and SW30HR-380; membrane25 re-recorded (14 rows, one stated cause) | C189, 320bdc7a8 |
| done | C189 slice 2: several rated tests per module, each as the sheet states it (ratedTests, fromRatedTest <id>) | C189, 10dc43173 |
| done | C189 slice 1: a datasheet's observed rejection inverted to the intrinsic one (fromRatedTest, membrane25) | C189, 7c186a77a |
| done | bin/runTests pins CHOUPO_HOME and PATH to its own tree (a worktree's suite had read the primary checkout's engine and data) | b98ddc97e |
