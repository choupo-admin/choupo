# PLAN -- the CML plan: now, the next day, the next three days, beyond a week

The CML plan (curto / médio / longo; Vítor's name, 2026-10-31; his horizons,
2026-11-01: "1 h, 1 dia e 3 dias ou mais ... o que não couber pode ficar para
> 1 semana").  Months and years are `ROADMAP.md`, which feeds the last
section.  Read at the start of every session (CLAUDE.md rule 8).  Each row
points at its DEV.md 4c entry, the register of record.  Vítor's private
Portuguese view is https://claude.ai/artifact/JnokFGgoNMTAWvu9fkgyoQ; its
header names the PLAN.md commit it reflects, so a stale view shows itself.

## How the plan is kept (the architect's rule, 2026-11-01)

1. **Capacity, not hope.**  The usage budget allows 2-3 generals at once,
   each 30-60 minutes, and integrations one at a time.  So: **Now** holds
   only what is RUNNING (at most 3 rows); **Next day** at most 5 rows;
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

Status words: `todo` · `running` · `decide` (the architect's, with a written reason) · `waits-Vitor` (a fact or act only he holds) · `blocked` · `done`.

## Now (running; at most 3)

| status | what | ref |
|---|---|---|
| running | The pressure exchanger: unit, design sheet, schematic, SWRO energy-recovery case (a general, validating) | C192 |
| running | Negative kinetic orders dropped and the CHEMKIN A rounded per order: wrong rates at exit 0 (a Sonnet general) | C190 (10)(13) |

## Next day (at most 5)

| status | what | ref |
|---|---|---|
| todo | Confirm on the site (WASM) that C178 and C182 are published (minutes, done between integrations) | C178, C182 |
| todo | Pressure is not a tear variable; and DesignSpec, GridSweep and Sweep read unconverged points (one general: same driver files) | C186 (5) |
| todo | The rest of the audit: A_rev on the batch path, catalystLoading measured, the membrane fitter's 'converged' on a stall, PC-SAFT roots | C190 (14)(11)(15)(12) |
| todo | The commercial shortlist: hard filters, each candidate re-rated at the student's conditions, no default score, `partner` never read by the ranking | C189 slice 5 |
| todo | The Campo de Dalías seawater desalination plant (the sea of plastic) from Toray's case study, with its whole layout (scope put to Vítor) | C194 |

## Next three days (at most 8)

| status | what | ref |
|---|---|---|
| todo | The acceptance contract on the remaining units and the Theory Guide section: modelled / declared approximation / refused | C188 item 5 |
| todo | Curation: the module records' A_w gives about twice the sheets' permeate (NF270-4040, SW30HR-380) | C189 |
| todo | The module registry's data/local tier; the importer cannot seal a case with a feed-spacer record | C189 |
| todo | Distillation defects A (fullMESH seeded by an unconverged CMO phase) and B (NewtonND accepts a non-improving step) | C184 |
| todo | C170's owed fixes: gates must not judge data/local or untracked files; refuse `nu 0; order 1`; records still citing Burcat | C170 |
| todo | The methanation reactor EduTool and a Power-to-Gas plant case (pedagogical scope written first) | C191 (B) |
| todo | Release Choupo-2612, the first since 2608 | ROADMAP S4 |
| todo | A cumene case (the graph's three cumene routes link nothing) | C191 |

## Beyond a week

| status | what | ref |
|---|---|---|
| todo | Verify and fix the Gibbs review's three open items and the SpeciationSolver outer convergence | C187 (1)(2) |
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
| waits-Vitor | Reactive full MESH and the multi-ion NF dataset: the reference PDFs | C175, C176 |
| waits-Vitor | JOSS: ORCIDs, DOI; whether Pedro Mendes agrees to enter CITATION.cff | C168 (3), C171 |
| waits-Vitor | Was the reply to Tim (MionTec) sent? | C171 |

## Done (kept for one week, then removed)

| status | what | ref |
|---|---|---|
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
