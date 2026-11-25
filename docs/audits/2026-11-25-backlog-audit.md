# Backlog audit, 2026-11-25 (read-only; 56 items OPEN/PARTIAL, number < 490)

Method: BACKLOG.tsv row, DEV.md 4c entry, grep/read of the tree, git log. No gate was run (read-only,
no builds); so NO row below is a verified CLOSE NOW. Where a half of a row is already done, it is named
so the architect can narrow the row's text.

Legend: DONE/PART/MISSING = what the tree says. Hours are a general's working hours.

| # | row says missing | tree says | verdict |
|---|---|---|---|
| C110 | RO+EDI purified water, pipe cost, fire water | MISSING all three (no grep hit for EDI/pipe cost in costing; fire water only a layout word, PlantLayout.cpp:3553). Pipe/fire water are the same programme as C306 (utilities piping) | FOLD into C306 (RO+EDI as a line there) |
| C124 | side exchangers, pumparounds in column | MISSING: no "pumparound/sideDuty" anywhere in src or tutorials (item 1, condenser/reboiler detail, landed 10-21) | KEEP, L (new MESH physics) |
| C135 | kij(T) in pair record, regress, per-unit read | MISSING: pair records are scalar kij (data/standards/parameters/SRK/N2-CH4.dat:`kij 0.0272`, valid at one T, [pair-span] announced); PPR78 route exists (C245) but is a predictive route, not this | KEEP, L (~16 h: record form, fitParameters, CubicEoS.cpp:886 read) |
| C154 | engine publishes inactive record properties | F1 + not-read keys DONE (ac199ea23c). Engine fact MISSING (no inactive-property record in result/ResultRecords.H; A_w read at thermo/membrane/Membrane.cpp:68 unconditionally) | FINISH SMALL, 5 h: Membrane.cpp + ResultRecords.H + the Case tab; test: one membrane case with imposed flux |
| C159 | Explorer->fit; student's own fit; `method` key | (1) DONE: explore/EvidenceLens.tsx:118 dossierFor, PropertyPanel.tsx:418 "Open the fit". (3) MISSING: no `LevenbergMarquardt` in src/propertyOps. (2) MISSING: no template generator (bin/choupo-thermoml extract-vle exists) | FINISH SMALL (3), 4 h, src/propertyOps FitParameters + schema + guide; (2) KEEP M 8 h. Row text: strike (1) |
| C184 | initial thermo profile, adaptive MESH->fullMESH, DME plant | partly landed (defects A,B, diagnosis A-D); rest on cloud branch | ASK: the DME plant is Vítor's material; rest stays KEEP L on the cloud |
| C199 | vessel port positions, pressure-centre case, pump curves | ports DONE in effect (layout/NozzleSchedule.H, C229 and C318 DONE); pump curves exist (rotating/PumpSelection.H level 2); pressure-centre case MISSING (only docs/design/a-desalination-plant-is-trains-and-racks.md) | FINISH SMALL, 6 h: one swro layoutDict/flowsheet variant in tutorials/plant; test: its golden + layout gates. Strike ports and curves from the row |
| C205 | dynamic flash, exchanger, RO train, column, PFR | MISSING: dynamic/ holds only CSTR, Tank, QuasiSteady, VariableVolume, WilliamsOtto | KEEP, L (four units, slice each) |
| C209 | sector with multiplicity | MISSING (no multiplicity in Flowsheet.cpp; design records only, 11-02) | KEEP, M (touches flowsheet core: needs full-sweep reason) |
| C214 | W5 valve Cv/characteristic, W7 water electrolyser | MISSING both: valve/Valve.H has no Cv/characteristic; "electrolys" appears only in GasStoreSize.H | W5 FINISH SMALL 8 h (valve/Valve.*, one case, docs 4d); W7 KEEP M 12 h |
| C217 | fed-batch Mazzoleni 2015 case | MISSING (no tutorial). Paper present: ~/Choupo-Literature/Articles/Bioprocesses/mazzoleni2015-...pdf; DEV says it is a case on existing pieces (batchReactor + expression) | FINISH SMALL, 8 h: tutorials/batch/<new>; test: case + golden, parameters read from the paper table |
| C218 | reversibility/quench EduTool; extractor efficiency, flooding, packed/disc/pulsed | MISSING: no flood/diameter in separation/Extractor.*, no gui methods file for reversibility. C219 already DROPPED into it | KEEP, L (extractor half); the reversibility half FOLD into C417 (ROADMAP, it says "via C417") |
| C226 | coverage map, UNIQUAC/Wilson in choupo-curate, full pure Cp | MISSING: bin/choupo-curate:75 "fit any model but two-parameter NRTL"; no coverage-map script | KEEP, M |
| C227 | (b) archive pair index, (c) brief to one rule + Explorer reads card | (a) done; (b)(c) MISSING (docs/ai/brief.md unchanged shape; no pair index in bin/curate) | KEEP, M |
| C238 | write demo path, fill reference plant, rehearse | path WRITTEN (docs/demo/demonstration-path-december.md, 125 lines, economics framing at l.68-75); only the box at l.121 "Vitor rehearses once in the browser" is open | ASK: the rehearsal is Vítor's act (deadline 11-30). Row text: path and plant are done |
| C240 | ammonia02 tower/refrigeration/flare, compact loop, distance witness | PEQ pipes done (36/36). ammonia02 layoutDict still has only cw supply/return lines (l.776) | FINISH SMALL, 4 h: tutorials/plant/ammonia02_full_plant/system/layoutDict; test: layout gates + its golden. Compact loop + witness = KEEP S after |
| C241 | CLAUDE.md diet to ~300 lines | CLAUDE.md is 1209 lines (not 1168); same goal as C415's second half; BRAIN.md is 165 lines (fine) | FOLD into C415 |
| C245 | slices 5b, 6, 7-10, 12, Rodas4 constants | all MISSING per row; DEV l.12801: rodas.f unverified, "unige.ch refuses automated access" | ASK: Vítor downloads rodas.f (a fact only he can fetch); then KEEP, L, cloud |
| C261 | Reviews & Contributors | MISSING (no hit in gui/src, src, docs) | KEEP, M (names of third parties: consent per CLAUDE.md) |
| C263 | surge line, anti-surge, capacity control, API fields, EduTool | EduTool half DONE by C510 (compressorChoiceMath.ts:199 anti-surge recycle). Engine: MISSING (no surge in CompressorDesign.H or rotating/*.H; math.ts:35 "NO characteristic map in the engine") | KEEP, M. Strike the EduTool from the row |
| C267 | warehouse sizing, per-lot in/out table, Gantt blocks | Gantt chart exists (gui BatchPlanSection.tsx); the three listed pieces MISSING in BatchPlanPass.cpp | KEEP, M |
| C270 | retime plan by dwell-limited capacity; press EduTool | press sizing DONE (README: 110 008 tablets/h dwell-limited); retime and EduTool MISSING | KEEP, M |
| C274 | a column/plant on COSMO-SAC or PC-SAFT | MISSING: only flash10/flash20 (PC-SAFT) and props cosmoSAC01-03 | FINISH SMALL, 6 h, tutorials/steady/distillation new case; risk: convergence (C184); test: case + closures |
| C278 | declared stage pressure profile in tray columns | MISSING (no stagePressure/pressureProfile in DistillationColumn.*) | KEEP, M (solver path; column14 is the witness) |
| C288 | slices 2-4: apply declared heat, energy-report line, EduTool | slice 1 only: ReactionHeat.H included in PFR/Equilibrium/Gibbs/Batch/DynCSTR/column to announce; CSTR.cpp and ConversionReactor.cpp 0 uses | KEEP, M (EduTool scope to Vítor is a pedagogy item the architect now holds) |
| C296 | per-compound index, revision ledger, mixing matrix tool | MISSING (no such script in bin/curate) | KEEP, L |
| C306 | steam/condensate balance per header, HEN design step, P&ID | MISSING (PinchPass.H:124 "recommends no network"; no P&ID in src) | KEEP, L (absorbs C110) |
| C308 | per-lab consistency test before fit, refuse by name, 17 severe | PART: propertyOps/VleConsistency.* exists (Herington + pointwise; header says van Ness direct "planned"); not wired before the fit | KEEP, M |
| C309 | ~647 components blocked on IUPAC Tc/Pc, Zabransky Cp | open-ended campaign, 657 component files now; blocked on sources not code | ROADMAP (reason: unbounded data campaign, no finishing line) |
| C319 | film-theory absorber/stripper | MISSING; rate-based machinery exists only through DistillationColumn (PackingBS/RBF/Delft, ratebased01-05) | FOLD into C329 (same rate-based column work) |
| C323 | molten salts as fluids + phase diagrams | MISSING: utilities/hitecSalt.dat is a 2013-sourced stub (no Janz 1988); no LiCl-KCl etc. | KEEP, L |
| C329 | crude column, B2b, Klemola/Mori calculated efficiency | MISSING per row | KEEP, L (absorbs C319; keeps C228's content) |
| C339 | eta inside units, published-kinetics bench cases, kinetic fit | MISSING: PFR/CSTR/Batch/DynCSTR only `announceUnresolvedPellet` (PFR.cpp:280); pellet/ dir exists; rateLawBench op exists | KEEP, L |
| C403 | D0 for sulfite, permanganate, thiocyanate, organics, Good buffers, amino acids | MISSING: MnO4, SCN, HEPES, MES, HTris, Tris have no diffusivity (70 of 250 species carry one) | KEEP, M (page reads, Li & Gregory style) |
| C405 | review 88 surface-tension laws, gate on Brock-Bird for polars | MISSING (no gate in bin/curate; BrockBird present in SurfaceTensionModel.H) | KEEP, M |
| C406 | solvent-dependent pKa, meter-scale pH, titration witness | MISSING (only ed08/ed09 wine cases) | KEEP, M (absorbs the ethanol half of C409) |
| C408 | HV1979, PSRK, Wong-Sandler, GERG-2008, EduTool | MISSING: CubicMixingRule.cpp carries only MHV1/MHV2 | KEEP, L (four separable slices) |
| C409 | constants read at source page; speciation in water+ethanol | ethanol half = C406; page-read half = same corrections as C411 | FOLD into C411 (ethanol half into C406) |
| C411 | six defects below 0 C and in K(T) | unverified-fixed: no commit under C411 after 11-16; item 4 pattern (phi applied to the whole sum) still at SpeciationSolver.cpp:~1995 | KEEP, M-L |
| C415 | citations by symbol everywhere; shorten CLAUDE.md/DEV.md | CLAUDE.md 1209, DEV.md 27 477 lines; citation work PART | KEEP, L (absorbs C241 and C445 point 5) |
| C416 | QC EduTool (Cpk, Shewhart, MC) | MISSING (no methods file) | KEEP, M (waits: cloud) |
| C424 | rename ions, tentative-state refusal, IF97 datum probe, case-download probe | who-governs DONE (ResolvedView.cpp:434); atom Cl now `CL` (C458), ion `Cl` kept; two measurements and one refusal MISSING | FINISH SMALL, 6 h: two probes (read-only cases), then the refusal in ThermoPackage/solver trial path; test: a probe case each |
| C425 | MATERIAL (no formula, mass basis), biomass dryer+boiler case | MISSING (no unconventional/proximate in src) | KEEP, L (architecture) |
| C428 | Hansen lens in Explorer, solubility view, Stefanis tool | data now PRESENT: 310 of 657 component records carry hansen; lens still Hildebrand (ExploreWorkspace.tsx:1310); Stefanis absent | FINISH SMALL (lens) 5 h, gui only, `--gui`; Stefanis tool KEEP M |
| C437 | test Davies application, hollow-fibre film | MISSING | KEEP, M (research) |
| C445 | (3) liquid Cp in the door, (4) particle-size list in one home, (5) citations by marker | LiquidPropertyDoor.H:64 Property has no Cp; (5) = C415 | KEEP, M for (3)(4); (5) FOLD into C415 |
| C452 | slice 1 check forms vs Chemkin-II/III; slice 2 EduTool | MISSING (no gate, plan amended 36f37b2cc3); kinetics-fit tool exists (KnowK) but is another idea | FINISH SMALL slice 1, 4 h (a gate/test reading the two manuals); slice 2 KEEP M |
| C454 | remaining unit-trap families, windows and anchors | PART; 18-family programme with its own gates (check_unit_*) | ROADMAP (reason: programme measured by family; a ratchet, not one deliverable) |
| C456 | radical scheme 1978, PFR T/P profiles, propane, acetylene, PE | MISSING per row | KEEP, L (absorbs C457) |
| C457 | three EduTools on olefin witnesses | blocked behind C456 | FOLD into C456 (last slice) |
| C473 | pass Cantera (RHS threads) | essential DONE (17x -> 1.2x, DEV 5341: "wish list") | ASK: is 1.2x enough? If yes CLOSE |
| C475 | surface microkinetics | MISSING (nothing in src); waits_on C473 is no longer a real block | KEEP, L |
| C477 | plots for 211 cases by family, 15 columns beside outerDict | PART (batch + 15 distillation done) | KEEP, L (family by family) |
| C479 | economic framing, rehearsal | framing WRITTEN (demo doc l.68-75); only the rehearsal left = C238 | FOLD into C238 |
| C482 | writeSteps true -> <t>/steps/; zip carries last results | MISSING: no `writeSteps` in src; saveCase.ts has no results | FINISH SMALL, 4 h (batch driver writer + saveCase.ts); test: nox03 seulex run, vitest |
| C485 | automatic validation log, escalation sentence in CLAUDE.md, push refused on red gate | MISSING: bin/hooks has only pre-commit; no "escalat" in CLAUDE.md | FINISH SMALL, 3 h: bin/hooks/pre-push + one CLAUDE.md sentence; test: a failing-gate dry run |

## CLOSE NOW
None. I could not honestly verify any row as wholly done without running gates. Half-closures to strike
from row text (evidence above): C159(1), C199 ports/pump curves, C263 EduTool, C238/C479 path+economics,
C214 none, C428 data prerequisite now met.

## FOLD (architect applies)
- C110 -> C306
- C241 -> C415 (also C445 point 5 -> C415)
- C319 -> C329
- C409 -> C411 (ethanol half -> C406)
- C457 -> C456
- C479 -> C238
- C218 reversibility half -> C417 (already ROADMAP)

## ROADMAP
C309 (open-ended compound campaign), C454 (family-by-family ratchet programme).

## ASK (facts Vítor holds)
C238 rehearse the path in the browser; C245 download rodas.f; C184 the DME plant material; C473 whether 1.2x of Cantera is enough.

## FINISH SMALL, ordered by hours, grouped by file territory (one general per group)
G1 hygiene/tooling (bin/hooks, CLAUDE.md, no src): C485 3 h; C424 probes 6 h (read-only cases first) = 9 h
G2 GUI only (`--gui`): C428 Hansen lens 5 h; C482 part 3 saveCase.ts 2 h (part 2 writeSteps is src: give to G4)
G3 layout cases (tutorials/plant, layoutDict): C240 4 h; C199 pressure-centre case 6 h = 10 h
G4 engine batch/props writers: C452 slice 1 4 h (tests only); C159(3) `method` key 4 h (src/propertyOps); C482 writeSteps 2 h (batch driver); C154 5 h (Membrane.cpp + ResultRecords.H + Case tab) = 15 h; C154 and C159 both touch guides: sequence them
G5 new cases and units: C217 Mazzoleni 8 h (tutorials/batch); C214 W5 valve Cv 8 h (unitOperations/valve); C274 column on COSMO-SAC/PC-SAFT 6 h (tutorials/steady/distillation, after C184 lands to avoid column collisions) = 22 h
Order by hours overall: C485 3, C452-1 4, C240 4, C159(3) 4, C482 4, C428 5, C154 5, C199 6, C424 6, C274 6, C217 8, C214-W5 8.

## Honest counts of the 56
CLOSE NOW 0 | FOLD 6 | ROADMAP 2 | ASK 4 | FINISH SMALL 12 | KEEP 32 (sum 56).
If the folds and roadmaps are applied the open count falls by 8 at once, by up to 12 more when the FINISH SMALL items land (about 77 h of work), and by 4 when Vítor answers. The remaining 32 are real work: 9 are L-sized programmes.
Caveat: PARTIAL counts that read "done" in the row but I checked only against the tree by grep/read; a gate run would be needed before the architect strikes any half in the "tree says" column.
