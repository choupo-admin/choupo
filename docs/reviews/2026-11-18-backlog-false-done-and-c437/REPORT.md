# Two reviews asked by the laptop session (SESSIONS.md, 2026-11-19)

Cloud session, read-only, against origin/main (e86e4046b1 when the work
started).  (1) false DONE rows in `BACKLOG.tsv`; (2) C437, an outside reading
of Labban et al. 2017.  Nothing in the tree was edited; this file is the
ledger.

## Part 1 -- false DONE in the backlog

**Sample, as asked.**  `BACKLOG.tsv` holds 288 DONE rows.  The sample is
every 7th by item number (41 rows) plus every DONE row with an empty
`commit` column (3: C9, C385, C387; C385 is in both), 43 items.  Three
reviewers each took a third.  For each item they read the FIRST DEV.md 4c
paragraph that commissions it, listed its concrete points, looked for each on
origin/main (code, case, gate, guide, EduTool) and gave a verdict; a point
later withdrawn by Vitor in a DEV.md paragraph counts as satisfied when the
withdrawal is quoted.

**Result.**

| verdict | count |
|---|---|
| DONE | 38 |
| PARTIAL | 5 (C91, C154, C167, C212, C241) |
| OPEN | 0 |

**False-DONE rate: 5 of 43 = 11.6 % PARTIAL; 0 % entirely open.**  No DONE
row hides an ask that is absent from main; five hide one point of their
first ask that was never built or never proven, and in each case the
landing note itself says so -- the backlog dropped the sentence the DEV.md
note kept.

**The five PARTIAL rows** (the missing point and where it was looked for):

- **C91** -- the pipe register "optionally docked beside the view" (first
  paragraph, DEV.md ~l.1315-1326).  Not built: the merge note (~l.1351) says
  "NOT done: docking the register beside the view (no right-edge panel rule)",
  repeated at `gui/src/ui/LayoutPopOutTab.tsx:54-56`.  An architect's
  judgement no later paragraph records Vitor withdrawing.
- **C154** -- "inactive properties marked" (the A_w of an imposed-flux bench)
  and F1 on the thermoPhysPropDict keys.  The landing note says "NOT done:
  inactive-property marks ..., the thermoPhysPropDict F1"; still listed as
  owed at DEV.md ~l.14024 item (9); nothing in `gui/src` or `src`.
- **C167** -- the acceptance proof: one serial and one parallel FULL sweep
  with identical result lines.  The parallel suite is on main
  (`bin/runTests -j N`, `CHOUPO_JOBS`); DEV.md ~l.14279 says "NOT proven here:
  the full -j1 vs -jN sweep"; no later record of that proof.
- **C212** -- "every factor a student input with the cited range beside it".
  Both EduTools are live (`plant-cost`, `plant-running-cost`), but
  `gui/src/ui/methods/plantCostLesson.ts:27/:343` says "The page prints no
  typical range" (a pointer only) -- the commander's decision, because the
  ranges in hand were recalled, not read; no record of Vitor withdrawing them.
- **C241** -- the CLAUDE.md diet "target 300 lines".  BRAIN.md, its generator,
  `check_brain_fresh`, the `@BRAIN.md` import, `settled-contracts.md` and a hook
  are on main; CLAUDE.md landed at 1068 lines (bab4dff30) and is 1168 on main;
  no record revises the target.

**Borderline, counted DONE, worth a line in the row:**

- **C420** -- DONE only if the redirection stands: the first ask's per-gate
  map of guarantees (KEEP/NIGHTLY/MERGE/DELETE) was never written; the
  architect withdrew the deletion target and Vitor's "PARETO CUT" (DEV.md
  ~l.3714) redirected the work to the kit and the copy slice.
- **C137** -- point (3), the prior widened by a process-evolution term, is in
  the lesson only (`dataReconciliationLesson.ts:634`); the engine has no
  separate evolution term (an `evolution {}` block was proposed, not built).

**The `commit` column (the shape C436's gate holds) is wrong in a different
way on 11 of the 43 rows** -- every one is an ancestor of main, so the gate
passes, but it does not name the landing:

| row | commit column | the landing found on main |
|---|---|---|
| C9 | empty | 680faf6d0 (named in DEV.md) |
| C385 | empty | 645e439a76 (break-even price), a83eae0f27 (PH-01) |
| C387 | empty | 8fc3468aea, merged as 03653ad9ce (DEV.md cites 390b304a3, an unrelated merge of origin/main) |
| C175 | 5a6b99ea9 (DEV.md record) | built under C231/C233 |
| C241 | 39daf7d27 (registration) | bab4dff30 |
| C367 | e58d49c7b (DEV.md record) | 34d81eaf1, 07b4aac7f |
| C375 | 5a0689270 (DEV.md record) | c2ec992b68, 0bd6ed7b5e |
| C384 | 560381c00 (DEV.md record) | 17999a2cc3, 882b5bfbcb (and the CI-band fixes) |
| C394 | aac2a4941 (DEV.md record) | a28b24cfbb |
| C402 | 2d2a0cdad (a C421 door slice) | not C402's own closing commit |

**A tooling note.**  The cloud clone is shallow (history boundary 5e7208babf,
2026-10-18), so `git merge-base --is-ancestor` answers "not an ancestor" for
every older commit -- missing history, not "off main".  Ancestry was checked
with the GitHub compare API instead.  A gate that checks a DONE row's commit
needs full history or that API, or it will accuse every row older than the
clone.

### Per-item ledger

#### Reviewer 1

| item | commit ancestor of main? | first-ask points (short) | where found / not found | verdict |
|---|---|---|---|---|
| C9 | n/a (row empty); DEV.md's 680faf6d0 yes | EduTool: what a Gibbs reactor is; data availability not project stage; T+dT for the chemistry only; the sign; 3 caveats; the absences (fractional approach, eta) | gui/src/ui/methods/approachToEquilibriumLesson.ts (l.107, 185-264, 286-313, 322-360), ApproachToEquilibriumTool.tsx, MethodsWorkspace.tsx:629 | DONE |
| C16 | yes (e53d9de6c) | route 1 import with licences checked; route 2 ThermoML fit chain by CAS/InChI, ~5 VLE pairs, NRTL first, held-out verdict, provenance, cases | check_source_licence.py EXCLUDED_TABLES; bin/choupo-thermoml identity/vle-index/vle-search; NRTL methanol-water, isopropanol-water, ethanol-ethylAcetate, methanol-methylAcetate; tutorials/props/curation/curate04..12; check_regressed_pairs.py | DONE |
| C24 | yes (4c6f8733e) | route-screening EduTool; witness case; prices declared | tutorials/steady/reactors/screen01_methanol_routes; RouteScreeningTool.tsx, routeScreeningLesson.ts; registry.ts:2190 | DONE |
| C32 | yes (c8f924f86) | degree-sign EduTool: h(T,P) of H2, 150 bar, enthalpy zero, 1/T relations, six questions; witness; reference CSV | StandardStateTool.tsx (quiz l.431), standardStateLesson.ts; tutorials/props/thermo/standardState01_hydrogen_enthalpy_TP (+ Leachman CSV); bin/curate/reference_h2_enthalpy.py | DONE |
| C40 | yes (03731af63) | supercritical-discard stream read as vapour; T <= 0 K refused (stream, gibbs operation.T, adiabatic trial) | StreamEquilibrium.H:211/267/348; StreamStateIO.cpp:3140-3146; GibbsReactor.cpp:178, :503 | DONE |
| C48 | yes (8666cf30c) | Kern/TEMA design of every green-ammonia exchanger, one shared kernel, FEHE vs its 2000 m2, condensers said | htc/ShellTubeDesign.{H,cpp}; HeatExchanger.cpp:331; ShellTubeHX.cpp:883; ammoniaPEQ_baseCase postDict (6x method Kern, condenser note l.96); check_design_sheet arm (s) | DONE |
| C55 | yes (5210e7f65) | a dragged layout must not write the tracked .cho | FlowCanvas.tsx:645-648 (never writes .cho; C55); "Save layout to case" the only write (l.1737) | DONE |
| C62 | yes (6edf2a640) | reliefValve sizer (declared scenarios, set pressure from the protected item, API 520/521, not costed) in the basic design | sizing/ReliefValveSize.{H,cpp}, ReliefArithmetic.H, EquipmentSize.cpp:114; ammoniaPEQ03_basicDesign postDict 8x reliefValve; check_relief_valve.py | DONE |
| C70 | yes (91d58fbe5) | 15-point review of the letdown EduTool + citation fixes | letdownLesson.ts (l.63, 80, 92, 137, 446-450, 543, 557, 591, 600); designGuide.tex:1530 | DONE |
| C77 | yes (eff6fd6d6) | cstr adiabatic/heatExchange and pfr energy solves on the published outlet surface | reactor/ReactorOutlet.{H,cpp}; CSTR.cpp:649,768; PFR.cpp:900,918 | DONE |
| C84 | yes (2290586cb) | materials EduTool in six parts | MaterialsTool.tsx, materialsLesson.ts, materialsBench.ts; registry l.2155 | DONE |
| C91 | yes (0ccd69330) | 3D view fills the window, resizable, full screen; panels collapsible and remembered; pipe register optionally DOCKED beside the view; same in the export | LayoutPopOutTab.tsx:46-56; layoutExport.ts:105,240,340,347.  Docking NOT built (LayoutPopOutTab.tsx:54-56; DEV.md merge note "NOT done: docking the register beside the view") | PARTIAL |
| C99 | yes (d8b374a89) | batchPlan pass (size factors, lot, lots/year, cycle, parallel units, occupancy, Gantt); per-lot sizing; quote scaling | postProcessing/BatchPlanPass.{H,cpp}; check_batch_plan.py; apalutamide01_tablets postDict (l.83, 280, 559+) | DONE |
| C106 | yes (ccf5fc4d6) | move apalutamide01 to tutorials/batch/plant/, update readers, record the ruling | tutorials/batch/plant/apalutamide01_tablets; tutorials/ALIASES:42; FASTSET:110; docs/architecture/settled-contracts.md:156 | DONE |

C91 PARTIAL: the first paragraph (DEV.md l.1315-1326) asks for the pipe register "optionally docked beside the view"; the merge note (l.1351) says it was not done (no right-edge panel rule), an architect's judgement no later paragraph records Vitor withdrawing.

Ancestry: the local clone is shallow (history boundary 5e7208babf, 2026-10-18), so `git merge-base --is-ancestor` answers 1 for every older commit -- missing history, not "off main".  Checked with the GitHub compare API instead: every commit is an ancestor of origin/main.

#### Reviewer 2

| item | commit ancestor of main? | first-ask points (short) | where found / not found | verdict |
|---|---|---|---|---|
| C114 | yes (acd9866f8) | colour by any published field incl. per-compound; follow a molecule; range auto/fixed/log; units by a KPI; threshold dimming; hover probe; export with legend (item 7 deferred by Vitor) | gui/src/case/streamColouring.ts (:461, :492); ColoursMenu.tsx (:44, :49); canvasColour.ts :55; FlowCanvas.tsx :1435/:1792; flowsheetSvg.ts, colourLegend.ts | DONE |
| C122 | yes (8aa4905df) | bin/integrate (merge, regenerate, make -B guides, scoped validation, one verdict, never pushes); CI smoke opening every live EduTool | bin/integrate (:30, :118, :551); generated_artefacts.py; driveApp.mjs --edutools :112; .github/actions/smoke-site, site-smoke.yml, publish-site.yml :186 | DONE |
| C137 | yes (39e55b652) | prior/likelihood/posterior named; distribution narrowing; informative prior widened by a process-evolution term; tests said frequentist; three results side by side | dataReconciliationLesson.ts (:59, :376, :479, :634, :722) | DONE (caveat: point 3 in the lesson only; no engine evolution term) |
| C145 | yes (206525118) | comparison cases (stiff case Table 2 grid, Fig. 4; Bowen & Mohammad CA30); which Davies each number uses | tutorials/props/membrane/nanofiltran_geraldesAlves2008 (reference CSVs Table 2, Fig 3, Fig 4; README :123, propsDict :109) | DONE |
| C154 | yes (4c2f3db7d) | P1 About/status/F1 on a key; P2 three studies, table, figures, caveats, Outline, INACTIVE PROPERTIES MARKED, units; P3 log/CSV; block states | landing note: "NOT done: inactive-property marks ..., the thermoPhysPropDict F1"; still owed at DEV.md ~14024 item 9; nothing in gui/src or src | PARTIAL |
| C167 | yes (a445a2a50; slice 1 73ea36014) | measure first; -j N case walk and gates; same order and verdict; -j 1 serial; PROOF: a serial and a parallel FULL sweep with identical result lines | bin/runTests :200-353; suite_lanes.txt.  DEV.md :14279 "NOT proven here: the full -j1 vs -jN sweep"; no later record of the proof | PARTIAL |
| C175 | yes, but 5a6b99ea9 is the DEV.md record only | reactive full MESH (reaction term, formation-datum heat, reaction derivatives in the Jacobian) | built under C231/C233: DistillationColumn.cpp :3026, :4314, :4338; check_reactive_mesh.py, check_kinetic_mesh.py; column19/column20 | DONE (implemented by other commits) |
| C186 | yes (0aae8f4e9 + 43b5c58c8, d8a895955, 1ad1aef00) | pressure in the tear test; unconverged simulation = failed optimiser evaluation; unconverged bubble T is not a point | Flowsheet.cpp :1853/:3490; simulationFailure; check_optimiser_converged.py, check_txy_bubble_verdict.py | DONE |
| C194 | yes (3736c17e8) | Campo de Dalias plant; literature/assumed provenance; case-local Toray records; layout said to be Choupo's; pressure exchanger | tutorials/plant/swro01_campoDalias (TM820E-400.dat, TM720C-430.dat, pressureExchanger, layoutDict :10-15) | DONE |
| C212 | yes (2cc075d35) | "costs to build" and "costs to run" EduTools; EVERY FACTOR AN INPUT "WITH THE CITED RANGE BESIDE IT" | registry.ts :2384, :2406; PlantCostTool.tsx, PlantRunTool.tsx.  plantCostLesson.ts :27/:343: "The page prints no typical range" (pointer only; the commander's decision, the ranges were recalled; no record of Vitor withdrawing them) | PARTIAL |
| C230 | yes (d426219bd) | GUI draws the engine's pinch artefacts, computes none; utility side excluded, announced; witness ammonia02; independent gate | gui/src/case/pinch.ts :205; ammonia02_full_plant postDict :97; check_pinch.py (runTests :3741) | DONE |
| C241 | yes, but 39daf7d27 is the registration only (landed bab4dff30) | BRAIN.md + generated FACTS + check_brain_fresh + @BRAIN.md; DEV.md 4c append-only; CLAUDE.md diet to settled-contracts.md, TARGET 300 LINES; rules toward hooks | BRAIN.md, gen_brain_facts.py, check_brain_fresh.py, settled-contracts.md, .claude/hooks/refuse_git_add_all.py.  CLAUDE.md on main is 1168 lines (landed at 1068); no record revises the 300 target | PARTIAL |
| C249 | yes (4b6f82ebc) | donepezil two-strengths case; design-guide chapter on multi-product plants; campaign-plan EduTool with a live Gantt | tutorials/batch/plant/donepezil02_two_strengths; designGuide.tex :3332; registry.ts :2452 | DONE |
| C258 | yes (350b60dc7) | dryer water booked as an outlet; declared make-up stream (Vitor's ruling); cause on screen; a gate over every campaign | FixedBedAdsorber.cpp :1134 carrierMakeUp; check_campaign_closure.py (runTests :1605) | DONE |
| C271 | yes (9ccc3c431; landing b7b10d809) | references/views in a steady postDict; column14 vs Klemola Table 2 (parity, tables, profile, notes); GUI draws declared views | column14 postDict :33, :51; klemola1996_table2.csv; DeclaredViews.tsx, PlotsWorkspace.tsx :496 | DONE |

Commit column naming only a DEV.md registration commit (not the implementation): C175 (5a6b99ea9; built under C231/C233), C241 (39daf7d27; landed bab4dff30).

#### Reviewer 3

| item | commit ancestor of main? | first-ask points (short) | where found / not found | verdict |
|---|---|---|---|---|
| C281 | yes (e2526ce49) | the AW model says it is a corresponding-states estimate with the Tb gap; fitted Antoine replaces AW where two labs measured | AmbroseWalton.cpp:121-125; check_ambrose_walton_announced.py (AW_MAX 48 -> 32); nHexylAcetate.dat, 12Butanediol.dat (`replaces "model AmbroseWalton"`); bin/choupo-curate vp | DONE |
| C291 | yes (26675191f) | NRTL pairs from P-x data with a new tool, graded; components with Joback Tc/Pc (C292) | bin/curate/pairs_px.py; choupo-thermoml extract-px; 92 NRTL records naming P_bubble/pairs_px; check_regressed_pairs arm (k); C292 components in data/standards/components | DONE |
| C299 | yes (6b8ad8d62) | duty unit in the Units menu; every Pinch number follows T and duty; list the other kW pages | displayUnits.ts:48-68, 358-364; pinchUnits.ts:89; follow-up list in DEV ~8806 | DONE |
| C311 | yes (9c349eb92) | eNRTL and Pitzer campaign salt by salt on Hamer & Wu / Goldberg, graded, held out, reviewed | propertyOps/ElectrolyteFit.{H,cpp}; data/curation/electrolytes (67 cases); 45 eNRTL + 44 Pitzer records naming electrolyteFit | DONE |
| C332 | yes (2ac3a65e8) | "Property data & parameters" shelf; three tools moved; page "From a database to binary parameters"; path "From a measurement to a parameter" | registry.ts:139-150, :246; DatabaseToParametersTool.tsx | DONE |
| C367 | yes (e58d49c7b, a DEV-only record; landing 34d81eaf1 / 07b4aac7f) | two Tb corrected; declared fitWindow with a reason; Trange = window; points left out printed; dimethylethanolamine Tb derived; DMSO pinned | diNButylEther.dat 414.55; squalane.dat 686.4; bin/choupo-curate:1395,1871, :1633,1982,2024; dimethylethanolamine.dat 407.25 (origin derived); debt_registry TB_ANTOINE_PINNED | DONE |
| C375 | yes (5a0689270, DEV-only; landings c2ec992b68, 0bd6ed7b5e) | announce numerical dispersion; vanLeer selectable, validated, then default; the bed obeys write false; Theory Guide flux corrected | FixedBedAdsorber.H:305-314, :479-485; FixedBedAdsorber.cpp:188-194, :1122; batch15_mesh_study, batch29_pulse_two_schemes | DONE |
| C384 | yes (560381c00, DEV-only; fixes 17999a2cc3, 882b5bfbcb) | fix the WASM failure, native on-open test, let a publication finish; CI green honestly | publish-site.yml:72; gui/tests/electrolyteModelsRuns.test.ts; 8e1a05c2ab, 153f9d1c04, 882b5bfbcb, 47645107a6, 56e6d3c44f | DONE ((b) is a practice) |
| C385 | none in the row; landings 645e439a76, a83eae0f27 on main | breakEven price per stream via appraise; 4.5 positions per shift declared and announced | EconomicsPass.cpp:4170-4181, :3278-3328 | DONE (commit column empty) |
| C387 | none in the row; landing 8fc3468aea (merged as 03653ad9ce) on main | hero boxes show the development line's counts with the release's beneath | bin/buildSite:215-222; site/index.html (8fc3468aea) | DONE (commit column empty; DEV cites 390b304a3, an unrelated merge) |
| C394 | yes (aac2a4941, DEV-only; landing a28b24cfbb) | input-keyed REUSED; --fast before a sweep; the self-test in a pool | bin/runTests (:211, :732, :2921); suite_reuse.py; check_gate_selftest.py:56-63 | DONE |
| C402 | yes (2d2a0cdad, a C421 door commit) | no property typed in a unit block; 7 fragments to named variants; old diffusivity reader deleted; literal defaults; door ratchet to zero | liquid_property_ratchet_debt.tsv 0 rows; Flowsheet.cpp:297,650,2347; the 7 cases use `thermo <name>;` | DONE (commit is another slice's) |
| C420 | yes (1da7e9abc) | per-gate evidence table; a MAP OF GUARANTEES (KEEP/NIGHTLY/MERGE/DELETE) before files move; builder + reviewer; target under 250 gates | docs/audits/2026-11-17-gate-evidence.tsv (358 rows, no verdict column); gatekit.py, check_refusal_probes.py; copy slice | DONE only if the redirection stands: the per-gate map was never written; the architect withdrew the target and Vitor's "PARETO CUT" (DEV ~3714) redirected the work |
| C431 | yes (a9642fe3b) | consolidated claim for a declared scope; datum flip prove-or-refuse; who governs a pure fluid; several sets per pair; downloaded case runs alone; carried-quantities spike; comparator tests | measured-facts-materials-and-flow-curves.md §0; check_datum_flip_refused.py; check_exported_case_runs_alone.py; check_carried_kinds.py; check_golden_comparator.py | DONE |

## Part 2 -- C437, an outside reading of Labban et al. 2017 (before any run)

O. Labban, C. Liu, T. H. Chong, J. H. Lienhard V, J. Membr. Sci. 521 (2017)
18-32, doi 10.1016/j.memsci.2016.08.062.  Read at the page from the copy Vitor
uploaded to the cloud session (pp. 18-31).  No run; the case on
build/c176-c177-dspmde-lab was not opened.  I do not know which of the three
misses (8.7, 7.6, 16.2 points) belongs to which mixture or ion, so the
attribution below is by mechanism and reach, not by row.

### Verdict: "how Davies is applied" is the most likely suspect, by the paper's own equations

1. **Eq. 18 is a natural-log Davies with the base-10 constant.**
   - Eq. 18 reads ln(gamma_i) = -A z_i^2 (sqrt(I)/(1+sqrt(I)) - b I),
     with b = 0.3.
   - Eq. 20 defines A = (sqrt(2 pi N_A)/ln 10)(e^2/(4 pi eps0 eps_r k T))^(3/2).
     The 1/ln 10 makes A the log10 constant.
   - Recomputed with the paper's own constants at 25 C (eps_r 78.4): A =
     0.01615 m^1.5 mol^-0.5.  With I in mol/m^3 that is 0.509 per
     sqrt(mol/L), the textbook log10 Davies constant.
   - Used inside ln(gamma), it corrects ln(gamma) by 1/2.303 of the Davies
     value.
   - This is the same mix as NanoFiltran's Davies (CLAUDE.md: "its own
     Davies applies exp() to a log10 constant"; Choupo's anchors patch
     exactly that one line).  The paper says its numerical approach "is in
     tandem with that presented by Geraldes and Alves [31]" (p. 22, sec.
     2.4) -- NanoFiltran.
2. **Eq. 18 cannot have been coded as written.**
   - The nomenclature (p. 31) gives I in mol/m^3 and A in m^(3/2)/mol^(1/2).
   - Read literally, the bracket sqrt(I)/(1+sqrt(I)) - 0.3 I with I in
     mol/m^3 gives ln(gamma) = +0.1, +1.9 and +13.5 for z = 2 at I = 0.01,
     0.1 and 0.7 M.  That is absurd.
   - So the authors applied the bracket in mol/L (or mol/kg).  Whatever they
     coded is not on the page.
3. **The fitted parameters carry that convention.**
   - eps_p = 41.3 (Table 5) was least-squares fitted to the NaCl rejections
     at pH 7-8 (sec. 4.1.3).
   - X_d = 2.83, -1.92 and -27 mol/m^3 were fitted per mixture to the very
     rejections of Tables 7-9 (sec. 4.1.4).
   - Both were fitted through the paper's activity treatment.  A model with
     a correct Davies (Choupo's), fed Table 5 and those X_d, is expected to
     miss.  The miss should be largest where z^2 sqrt(I) is largest: the
     artificial seawater, I about 0.7 M, also beyond Davies' validity band.
     The 16.2-point miss is the first candidate for that row.
   - A reading, not a measurement: the test is to rerun the case with
     ln(gamma) = -0.509 z^2 (...) (the paper's convention, I in mol/L) and
     see whether the three misses collapse.

### The film (Eq. 13): second, and it cannot explain a seawater miss

- **Eqs. 9-13 are Geraldes and Afonso's film.**  They use the suction
  correction Xi = phi + (1 + 0.26 phi^1.4)^-1.7, with phi = J_v/k_c (Eqs.
  11-12).  The mass transfer coefficient is Sh = 1.62 Re^0.33 Sc^0.33
  (d_i/L)^0.33, the Leveque form for laminar tube flow with a developing
  concentration profile, on d_i = the fibre inside diameter and L = the
  module length.
- **The geometry is given:** substrate ID 1.0 mm (sec. 3.1), effective
  length 25 cm (sec. 3.2), cross-flow 0.3 m/s (Fig. 4).
- **My estimate:** Re about 340 (the paper says Re ~400 for its uncharged
  runs), k_c about 2.1e-5 (Na+), 1.4e-5 (Mg2+) and 1.8e-5 (SO4 2-) m/s.
  - In the binary mixtures (up to 31.6 LMH), J_v/k_c reaches 0.4-0.6.  The
    film moves the wall concentration by tens of percent there, and a
    different film (or no suction correction) can move those rejections by
    several points.
  - In seawater (1.4-6 LMH), J_v/k_c is at most about 0.1.  The film is
    almost irrelevant there.
- **Check first:** whether the case uses d_i = 1.0 mm and L = 0.25 m (not
  the outside diameter 1.4 mm), the Leveque form, and the suction
  correction.

### T and density: weakest

- The paper states neither the temperature nor a solution density.  Its D_inf
  (Tables 1-2) are 25 C values, and its feeds are in mg/kg (Table 6).
- **Density:** mg/kg to mol/m^3 moves concentrations by at most about 2.5 %
  (seawater).  That is far too little to move a rejection by 8-16 points.
- **Temperature:** it enters A (Eq. 20) and the Born term (Eq. 25), but
  eps_p and X_d were fitted at the paper's own (unstated) T.  A few kelvin
  cannot produce the misses.

### The paper's "12 %": two different claims, neither defined

- **Uncharged solutes** (p. 26 and Fig. 8: "an average deviation of 12 %").
  - Glycerol's experimental rejections are 11, 15, 19.5 and 29 % (Table 3),
    and the model curve sits a few points below them.  That is 20-40 %
    relative but only 3-7 points absolute.
  - Glucose and sucrose agree within a few points.
  - An AVERAGE absolute deviation of 12 points is impossible on those data.
    An average relative deviation of about 12 % fits.  This one is RELATIVE.
- **Artificial seawater** (p. 28 and Fig. 13: "a maximum deviation of 12 %
  for the multivalent ions").
  - Not defined either.  Read off Fig. 13, the largest gap is Ca2+ at 3 bar
    (measured 71.1 %, model about 80-82 %): about 10 points absolute, 13-15 %
    relative.
  - The absolute reading fits "did not exceed 12" slightly better, but the
    figure cannot settle it.  AMBIGUOUS.
  - It is also a fit, not a prediction: X_d = -27 mol/m^3 was regressed on
    the same seawater rejections.
- **Consequence:** neither "12 %" is a band a reproduction can be held to
  without first saying which convention it uses.
