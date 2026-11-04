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

Last reviewed: 2026-11-04 03:00 (W1, W2, W3 landed; the C214 week placed; acetic item 3 landed; C212 landed; acetic item 1 landed, item 3 running; stack landed; reorganised by C210, PIF first: Now holds only what runs, the document set and the PIF wins placed by their dependencies; earlier reviews in git).

Status words: `todo` · `queued` (built by a general, waiting its turn to integrate) · `integrating` · `running` · `decide` (the architect's, with a written reason) · `waits-Vitor` (a fact or act only he holds) · `blocked` · `done`.

## Now (running)

| status | what | ref |
|---|---|---|
| done | THE STACK IS LANDED on main and the site (2026-11-03 08:30, `ebe0e3a51`): the freeze was lifted because the tutorials are at 17:00 and 17:30, not noon; staging passed --fast 78/0, --gui 43/0, a second full sweep 822/0; the live bundle carries the compaction fits, the utilisation table and the equipment tags, the packs answer 200 | C200, C210 |
| todo | what the two PIF groups report from the 17:00/17:30 tutorials goes ahead of everything | C210 |
| done | Acetic acid item 3 (`1d25dd6de`, full sweep 825/0): the corrected constant, the Kirchhoff liquid bridge (latent heat at Tb 24.39 by construction, liquid -484.06 against NBS -484.3), the associated vapour, the distillate priced as its stream, 735 golden rows moved (by group, in the commit), the seven exotherm tutorials repaired honestly, the column gate's condenser arm fixed | C201 (3) |
| done | Two economics EduTools (C212, `349baa4a7`): what a plant costs to build (Lang, factored estimate, Choupo's bare module, working capital x3, loan) and to run (itemised cost vs Turton COM_d, shifts, depreciation by class, break-even, NPV/IRR/payback, elasticity, market arithmetic); every factor the student's input with a pointer to its table, no recalled range shipped | C212 |
| done | The capability index for assistants (C211, `7d1e9217d`): `/llm/capabilities.md` first in llms.txt under 'Does Choupo do X?' (computes / balances / checks / missing per concept, pharmaceutical plant first, witness cases by full path), the version line on every served document, a static `/llm/models.md`, AGENTS.md one path per question; gate `check_capability_index` (sabotage-verified) | C211 |
| done | Acetic acid item 1 (`7f8e5348b`): logK25 2.555 (formic) -> 3.107 (ethanoic, Chao & Zwolinski Tables 11/12) in the record and five mirrors, 54 golden rows re-recorded from 3.5x more dimer, gate `check_dimerisation_constants`; it exposed flash17's dimer-heat seam, pinned | C201 (1) |

## Next day (at most 5)

| status | what | ref |
|---|---|---|
| done | C214 W1 (`46bf7f942`): a GENERAL flash specification -- (P,H), (P,S), (T,V/F), (P,V/F) from one home `flashState::specifiedFlash`, with the props op `flashSpec`; the wet steam expansion matches the IF97 table (quality 0.8103 against 0.8102); a new liquid and mixture entropy surface paired with the enthalpy; `adiabaticFlash`, `valve`, `compressor`, `turbine` NOT migrated (byte-identical rule), listed in the record | C214 |
| todo | Acetic acid, the rest: the column's dew-point distillate, the Gibbs / three-phase / binaryTxy readers, the record's identity; one moved-row list; the seven exotherm tutorials to Vitor | C201 (1) |
| todo | The replacement for the seven exotherm tutorials (their honest repair is in the integration branch): a genuinely exothermic reaction -- the ethylene-oxide hydration to ethylene glycol, data already in the catalogue -- giving runaway, multiplicity (three steady states) and jacket control back; the Van Heerden EduTool still names `cstr05_multiplicity` as its witness and will draw ONE root: re-point it to the new case | C201 |
| todo | Document set S3 (line list per routed pipe, declared window, declared fittings, pressure deficit and the pump it needs) and S4 (the instrument and loop declaration, the instrument index), both after S1 lands; then S5 the P&ID and S6 the control narrative | C207, C203, C204, C210 |

## Next three days (at most 8)

| status | what | ref |
|---|---|---|
| done | C214 W3 (`46bf7f942`): dominant-eigenvalue recycle acceleration (Orbach & Crowe 1971, read from the paper), opt-in and announced; MEASURED LIMIT: it targets a dominant eigenvalue near 1 and this corpus sits near 0.2 (process05 6 iterations against Wegstein 9; membrane27 and acetonePlant worse), so it is a teaching aid, not a default; a misspelt `recycleSolver` now refuses | C214 |
| todo | C214 W4: Beggs-Brill two-phase pipe as `twoPhase { model BeggsBrill; }` beside Lockhart-Martinelli, with inclination (Beggs & Brill 1973) | C214 |
| todo | C214 W5: a Cv-rated control valve with an inherent characteristic (linear / equal-percentage), the opening as the manipulated variable -- what the digital twin's controllers move (ISA-75.01 form) | C214, C203 |
| todo | (Opus) C214 W6: IF97 region 3 (Helmholtz f(rho,T); the engine refuses it today) and a gate holding regions 1-4 to the IAPWS release's own verification tables | C214 |
| todo | C214 W7: a water electrolyser unit (declared cell-voltage curve, Faraday efficiency, stack power -> H2, O2, heat; Ulleberg 2003); the green-ammonia plant declares its H2 as a feed today | C214 |
| done | PIF E4 + E5 (2026-11-04, branch pif-e4e5, awaiting integration): `economics { buildings, breakEven, royalty, workingCapitalMethods }`, all opt-in, no number shipped; witness `economics04_building_royalty_breakeven`, gate `check_economic_extensions`; the asset-class depreciation stays absent | C195, C210 |
| todo | The control-placement EduTool, pages 1-5 and the plant method page (the Pareto is in C204); its loops use the instrument grammar above | C204 |
| todo | Dynamic units, slices 3 and 4: the flash drum (liquid level, vapour pressure, T) and the exchanger/heater as quasiSteady plus a sensor lag (they feed the digital twin) | C205 |

## Beyond a week

| status | what | ref |
|---|---|---|
| todo | C220 (Vitor's wish, LATER): a rare-earth separation case from the open literature -- first an EduTool on why a separation factor of 1.5 needs so many stages (no data), then a research general for ONE open-access Nd/Pr or Dy/Tb separation with printed constants and cascade, then a mass-action reactive extractor | C220 |
| todo | C219 liquid-liquid extraction COLUMNS: stage efficiency declared; sizing by a declared HETS with its source; flooding and diameter only on a readable source (Vitor supplies Treybal, Perry's, Seader, or Lo-Baird-Hanson) | C219 |
| todo | C218 EduTool: reversible vs irreversible, and when quenching works (K(T) and equilibrium conversion computed from the catalogue; a declared rate and a cooling rate; the freezing temperature; cracking against ammonia) | C218 |
| todo | C217 bio, step 1 (a research general): ONE openly licensed (CC BY) published fed-batch fermentation with every parameter printed (mu_max, Ks, Y, kLa, feed profile) and the elemental formula of the biomass; then the bioreactor with growth on `batchReactor`/`dynamicCSTR` (Monod, maintenance, yields, death), oxygen transfer, metabolic heat, thermal sterilisation (D, z, F0) | C217 |
| todo | C216 EduTool, biorefinery key reactions on the carbon-and-oxygen-removal lesson; FIRST measure which species carry formation data in the catalogue | C216 |
| todo | C215 EduTool, the fundamental organic reaction classes as what the engine needs (enthalpy computed, K from DeltaG, kinetic form, reactor, hazard); the liquid esterification (C201) first | C215 |
| done | C214 W2 (`f6492e8fb`): shell-and-tube rating by Bell-Delaware (Hewitt s.6.3.2), Example 6.2 reproduced to the book's rounding (worst 0.17 %), JL and JB declared chart readings; open: Serth 45 deg a1 0.498 against 1.498, and Serth's own JL/JB/Jr/Rl/Rb/Rs equations (pages requested) | C214 |
| todo | State checks: measure the seal-drift finding against main (9 sucrose / H2SO4 mirrors, 1809 moved values); one browser run on the site of each unit that reached main without one (Complete 0/, pressure exchanger, boron split, dynamic tank; C178, C182) | C201, C196 |
| todo | The C200 packs still missing (heat, electrolytes, membranes, solids, drivers, transient, props) and the generated reference; re-score the 2026-11-01 baseline with the -init0 step | C200 |
| todo | Newcomer surfaces (`runCase` shows the answer, the balance verdict and the caveat block; one start-here path) and the stale tutorial texts the review listed | C201 (3)-(6) |
| todo | The p10 finding: NaCl in water has no enthalpy datum the default energy report can use (refused by the engine): curate it | C200 5.2 |
| todo | PIF long-term (L1-L10 of the synthesis), in this order: the sterile route (filling, lyophiliser, sterilising filtration, F0), full HVAC (latent and equipment loads, the pressure cascade's leakage), labour following the plan and multiproduct campaigns, blend uniformity and cleaning limits, utility networks (steam, compressed air, vacuum), equipment catalogue records, scale-up and solid-dosage unit models, the economics as a distribution; open lactose compaction data when one appears | C195, C210 |
| todo | A sector that says how many times it repeats (`repeat N;`): ONE train in the flowsheet, plant totals split and summed at its boundary, shared services outside, tags A..F beside the "x N" box; replaces `trains { count }` | C209 |
| todo | `digitalTwin/`, its own tutorials folder (a designed plant in operation: continuous on choupoCtrl, then batch; layout required) -- needs the dynamic slices, the instrument grammar and the P&ID; the P&ID PDF sized by content (A3-A1) as the PFD; then the OPERATOR PANEL by Gall's law: the Pareto loops only, one screen per sector, alarms only where an action exists, grown only from a simpler panel that works | C203, docs/design/the-plant-document-set.md |
| todo | Dynamic units, slices 5 and 6: the RO train's pressure and recovery, the column's inventories on a quasiSteady column; the full dynamic MESH last | C205 |
| todo | The control EduTool, phase 2: the engine counts the control degrees of freedom and the inventory direction on the case's topology and publishes them; the GUI draws | C204 |
| todo | Two EduTools in Pareto mode: liquid effluent treatment and gaseous emission treatment (the Pareto first, against the corpus plants' boundary streams; then the scope to Vitor) | C206 |
| todo | C199 leftovers: the vessel port positions, the pressure-centre alternative case and the pump curves | C199 |
| todo | Release Choupo-2612, the first since 2608 | ROADMAP S4 |
| blocked | Seawater boron on Pitzer: BOH4/CaBOH4/MgBOH4 formation and eight mixing records, each from its primary (blocked on reading Felmy & Weare 1986) | C198 |
| todo | Boron Stage 2: the pH along the channel, the seawater feed as major ions, a dosing unit, and a recycle solver that refuses the trivial fixed point by name | C198 |
| todo | The methanation reactor EduTool and a Power-to-Gas plant case (pedagogical scope written first) | C191 (B) |
| todo | A cumene case (the graph's three cumene routes link nothing) | C191 |
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
| waits-Vitor | The Eucreas PIF folder holds two files of 0 bytes: a readable copy, if the review should count it | C195 |
| waits-Vitor | Felmy & Weare, Geochim. Cosmochim. Acta 50 (1986) 2771 (the seawater boron Pitzer parameters' primary): a copy through IST's library | C198 |
| waits-Vitor | Open swro01_campoDalias in the browser: does the 3D start, are the 2D drawings legible? | C199 |
| waits-Vitor | Reactive full MESH and the multi-ion NF dataset: the reference PDFs | C175, C176 |
| waits-Vitor | JOSS: ORCIDs, DOI; whether Pedro Mendes agrees to enter CITATION.cff | C168 (3), C171 |
| waits-Vitor | Was the reply to Tim (MionTec) sent? | C171 |

## Done (kept for one week, then removed)

| status | what | ref |
|---|---|---|
| done | The site serves the assistant documents: /llms.txt, /llm/brief.md (with the revision section) and seven packs, among them batch-plant, layout and design-cost; checked live | C200, 0828dffeb |
| done | Dynamic units, slice 1: `dynamicTank` (level by an outflow or a valve; one holdup home; two witnesses; PI holds the level, P-only offsets 0.050 m) | C205, 32aa8f278 |
| done | The compaction bench `compactionFit` (Heckel, Kawakita, Ryshkewitch-Duckworth) with two open-data witnesses, MCC and DCPD; no open lactose dataset found, none invented | C195 |
| done | The phaseChanger's saturated mixture is its bubble/dew point (it returned a liquid 102.7 K below its bubble point at exit 0) | C202 (1), 8a3946237 |
| done | The assistant brief (`docs/ai/brief.md`, renamed from kernel.md) with four packs; the review's corrections | C200, C202 |
| done | File > Complete 0/ in the app; the user guide documents it | C200 B', 3c4cfeff4, 2aadac008 |
| done | Boron Stage 1: boric acid and borate split by the declared pH; swro01_campoDalias re-recorded with the list; the GUI schema key it needed | C198, b3efefd9e, a551c1762 |
| done | Boron in seawater, measured: Davies 9.12, Pitzer 8.84 against Dickson's 8.82; the seawater route is Pitzer | C198, b23ab43e5 |
| done | The rack elevation draws each header at its own pipeHeader sheet | C199, ac3716305 |
| done | The LLM-brief harness, and its first run: the brief + four packs solve 10/10 at 7-30x less input | C200 A/E, df9f9e22b |
| done | Packs batch-plant, layout, design-cost (tablet plant: batch plan, machine utilisation, HVAC and purified water, plot plan and building, costing and economics) and `llms.txt` + `/llm/**` on the site (live after the next publish); harness p11-p13: lint 3/3, solves 2/3 | C200 phase C |
| done | Decisions: digitalTwin/ is its own folder (C203); the control-placement EduTool scope (C204); the dynamic units' contract and order (C205); association is a property of the vapour model (C201) | C201, C203-C205 |
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
