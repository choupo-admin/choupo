# PIF readiness review: the two tablet plants, walked as a student (2026-11-08)

Context: Vítor's pharmaceutical-plant design project (PIF) groups meet him on
2026-11-09.  This review plays a group that has chosen a drug and a dose and
must deliver what the 18 earlier reports delivered
(`docs/reviews/2026-11-02-pif-reports-synthesis.md`): batch plan and Gantt
with machine utilisation, an equipment list matched to the batch, GMP rooms
and air grades, purified water, CAPEX -> OPEX -> NPV / IRR / break-even,
sensitivity, staffing, layout.  Engine at `5a912a62c` (main), built in a
worktree with `make -j1 all`; the browser reviewed by its source and its
tests (no display).  Companion: `docs/pif-student-path.md`, the route a
student follows tomorrow.

## 1. Walk-through log

### 1.1 donepezil01_tablets, as shipped

`runCase tutorials/batch/plant/donepezil01_tablets`: exit 0 in 15 s.  The
terminal prints only the caveat tail (a `pipeRack` default announcement and
eleven `reviewStatus interim` lines); every answer is in the 1 478-line
`log.choupoSolve` and in 63 files (`converged/`, 16 `design/` sheets,
`reports/{balances,batchPlan,economics,equipment,streams}`, `report.ods`).

What a student sees, section by section, and whether the number is explained:

* **Stream table**: 30 streams; a solid-only stream prints `F = 0.0000
  kmol/h ... solids = 7.2000 kg/h` and a line of fourteen mole fractions
  that are all zero.  Explained ("the solids above ARE the stream"), noisy.
* **Batch plan**: `Lot B = 300 kg of finalBlend x r_P / r_finalBlend (206.879
  / 202.921) = 305.852 kg of product`, N = 143, H_eq = 210 h, each train's
  table with m/lot, S, size/unit, t_j, u %, occ %, and the formulas printed
  under it.  Every input echoed with its `source`.  Clear.  The Gantt is a
  CSV (the GUI draws it).  Cleaning: 966 cleans, 560 m3 water, 532 m3
  effluent, with the counting rule in a sentence.
* **Sizing**: two heaters (A = Q/(U LMTD), U author-set, said), two tanks
  from the plan, seven `ratedMachine` rows with utilisation and a `basis`
  sentence each; three announced above 0.85 with the remedy (`declare
  announceAbove to own it`).  Clear.
* **Layout**: 9 items placed, 0 findings, 30 streams "not routed" each with
  its reason (indoors, solids, no sized item), roads, plot 12 321 m2.  The
  building: 33 rooms with grade, pressure, area, containment; 0 findings.
* **Clean utilities**: per-room table (area, height, V, ACH, supply), totals
  by grade, fan 51.5 kW, heating 134 kW, cooling 90 kW, the sensible-only
  limit announced; purified water per use, per lot 3.136 m3, peak 1.33 m3/h,
  generator 1.67 m3/h, tank 5.33 m3.
* **Costing**: every item with its correlation or `declared-quote`, the
  arithmetic of each quote (scaling, exponent source, `source`, `reason`),
  the HVAC per grade, the ten NOT COSTED items each with why.  Two tanks
  flagged outside the correlation range.
* **Economics**: FCI 19.80 M EUR (quotes 14.24 M of it), WC 3.15 M built up
  line by line, TCI 22.95 M, land 0.99 M; COM_d 14.82 M/yr with the crew
  declared (10/shift x 4.5 = 45 positions, 3.70 M/yr) and Turton's N_OL
  printed as a comparison (33.9/shift, 12.55 M/yr); revenue 15.0 M; NPV
  -18.67 M, IRR none, simple payback 26.9 yr.  Class 5 band printed.
* **Caveat block**: every announcement repeated, grouped (batch plan,
  extrapolations, model assumptions, plant layout, unverified data).
* **Not produced** on this case as shipped at `5a912a62c`: no break-even
  (no `breakEven {}`), no sensitivity (no `sensitivity {}`), no
  `workingCapitalMethods` -- all three declared on both cases later the same
  night (section 4, item 5) -- and no element balance (HPC and HPMC have no
  formula -- announced).

Wrong or confusing, found while reading:

1. `design/hvac/gradeD` cost factors wrote `hvacPricePerSupplyAir12;` -- key
   and value fused (a 21-character key against a 20-wide pad), one token no
   dict parser reads as two.  FIXED (section 4).
2. `[layout] no pipeRack is declared, so the 0 pipe(s) are routed on the
   engine's STATED DEFAULT rack ... declare pipeRack { ... }` is printed and
   repeated in the caveat block although 0 pipes are routed; it is the
   first thing the terminal shows after `done`.  Noise that reads as a
   defect of the case.  Not fixed (an announcement condition in
   `src/postProcessing/layout/`; cheap, but it moves an advisory on every
   layout case and I did not want to touch pinned advisories tonight).
3. The terminal summary after `runCase` carries none of the answers (no NPV,
   no lot, no limiting stage): a student must know to open the log.

### 1.2 apalutamide01_tablets, as shipped

Exit 0 in 26 s; 2 029-line log; 24 design sheets.  Adds to the above: a
sensitivity table (price 5 513.8 / 12 130.3 EUR/kg: NPV 128 -> 448 M, IRR
70.7 -> 161.7 %), a spray dryer with its approximations announced, a tank
farm with an `unbundedLiquid` finding left on purpose, `singleEntrance`.
The README's section 6 arithmetic matched the run (FCI 23.78 M, NPV 128.1 M).

### 1.3 The browser (source and tests; not exercised in a display)

`gui/src/cases/tutorials.ts` bundles every `tutorials/*/*/**` case, so both
plants are in the case tree; a student's own copy opens through *File / Open
Case / Browse local folder* (`gui/src/cases/loadCase.ts`), and every file that
is not one of the eight known dicts -- `system/layoutDict`, the
`constant/components/*.dat`, `constant/economics` -- reaches the WASM run as a
raw file (`gui/src/cases/tutorials.ts`, the `KNOWN` set), so the batch plan,
sizing, building and economics run in the browser too.  Reports sections
(`gui/src/case/reportSections.ts`): Batch plan (Gantt + utilisation table,
`gui/src/ui/BatchPlanSection.tsx`, `gui/src/case/machineUtilisation.ts`),
Equipment design, Equipment sheets (every `design/` sheet, so the HVAC and
purified-water sheets are reachable), Plant layout (3D), the GMP plan
(`gui/src/ui/GmpBuildingSection.tsx`), Economic appraisal, Economic
sensitivity, PFD (PDF).  NOT drawn by any section: the clean-utilities tables,
the cleaning table, the break-even block, the three working-capital methods
(grep of `gui/src` for `breakEven`, `royalty`, `hvac`, `cleans_year` finds
only the EduTool lessons).  Tests run headless: 9 files, 161 tests pass
(`batchGantt`, `machineUtilisation`, `gmpPlanSheet`, `gmpBuilding`,
`designSheet`, `equipmentListSheet`, `reportSections`, `caseArchive`,
`gmpLayoutLesson`).  `machineUtilisation.ts` still infers the machine `kind`
from which keys the sheet publishes (its own header says so; C208 follow-up).
The WASM bundle served by www.choupo.org was not checked tonight (no network
check from here); whether it is at the commit of the fixes below is for the
publisher.

### 1.4 Changing the case to the group's drug (the probe)

A copy of donepezil01 became metformin hydrochloride 500 mg tablets (600 mg
core, 600 kg lots, 100 M tablets/yr), then a direct-compression variant.
Every refusal met, in order:

| Step | What I changed | What the engine said | Remedy |
|---|---|---|---|
| P1 rename the API | new record, `thermoPhysPropDict`, `0/apiFeed` | `ERROR: ThermoPackage: component 'donepezilHydrochloride' not loaded`, exit 2, no file named | the eleven ESTIMATE files in `0/` still carried the old name: delete them, `bin/choupo-init0`.  FIXED: the message now names the stream and the remedy (section 4) |
| P1b rerun | nothing | `runCase: '...log.choupoSolve' exists; pass -f`, exit 1, old log kept | `runCase -f`.  Looks like a failure of the case; I fell for it myself |
| P2 new dose and lot | 12 feed files rewritten (a script), lot 600 kg, Q 61 800 kg, `itemMass` x2 | four `ratedMachine` rows `FAILED: the machine does NOT fit the lot -- utilisation 1.86886 ... 2 machine(s) of this rating would carry it ...`; the quote on a refused unit stops the run, exit 2 | the message is exact; larger ratings (a vendor's) or `installed { count 2 }` |
| P3 larger machines | four `nominalVolume`s | exit 0, NPV +7.7 M -- but both dryers `[heat-bound]`, granules leave at 73.9 wt % water, pressed and sold | announced, not refused; the air (`0/fbdAirIn`) must be scaled by hand (700 kmol/h); the plan's 1.5 h drying time does not know |
| P3 price | nothing | revenue at the OLD price per kg (0.213 EUR/tablet instead of 0.03): silent | prices are per kg of a RESULT stream; redo the division after every formula change |
| P4 deliverables | `breakEven {}`, `workingCapitalMethods {}`, `sensitivity {}` | sensitivity printed; then `ERROR: economics: the workingCapital { ... } model ... no priced product carries any mass`, exit 2 | the NPV break-even search evaluates s = 0 and the itemised WC refuses a copy with no product; reproduced on plain donepezil01 + `breakEven {}`.  FIXED (section 4) |
| P5 direct compression | 5 units, 9 streams, 4 stages, 3 cleans, 5 sizers, 3 quotes, 1 water use, 2 layout items, 3 prices removed; `init0` | ran at the first attempt (the rooms of the removed train still served by the HVAC) | none |

Not tried: capsules and a parenteral (no unit models a filler, a filling
line, a lyophiliser or sterilising filtration -- `docs/ai/capabilities.md`
section 1 says so; a group can only declare placeholders).

## 2. Deliverables: what Choupo produces today

| Deliverable | Verdict | Evidence |
|---|---|---|
| Material balance per unit of product, PFD, stream table | PRODUCES | log, `reports/streams/`, GUI PFD |
| Batch plan: lot, lots/yr, cycles, limiting stage, campaigns, occupancy | PRODUCES | `BatchPlanPass`, `reports/batchPlan/` |
| Gantt with per-machine utilisation | PRODUCES (single product) | `gantt.csv`, GUI Batch plan; multiproduct plans refuse `ratedMachine` |
| Equipment list matched to batch size | PRODUCES the fit, HALF the list | utilisation refused above 1; sizes are the plan's; prices are the group's quotes; no catalogue |
| GMP rooms, grades, pressures, airlocks, flows | PRODUCES (checks a declaration) | `[building]`, 0 findings on both cases; the GUI plan |
| HVAC air changes x volume, fan, heating/cooling | PRODUCES, sensible only | `cleanUtilities`; priced per m3/h |
| Purified water (demand, peak, generator, tank) | PRODUCES, not costed | `design/purifiedWater/*` |
| Cleaning water and effluent | PRODUCES volumes, no load | `kpis.cleaning` |
| CAPEX with the arithmetic of every quote | PRODUCES | costing table, `costs.csv`, `equipmentList.csv` |
| OPEX, crew, Turton comparison | PRODUCES | economics block |
| NPV, IRR, payback, cash flow, working capital | PRODUCES | `cashFlow.csv`, `workingCapital.csv` |
| Sensitivity (tornado) | PRODUCES; both base cases declare one since tonight (donepezil01: price +-30 %, discount rate 8-15 %, labour +-20 %) | apalutamide01; donepezil01 |
| Break-even (operating and NPV) | PRODUCES; REFUSED on both base cases until tonight (fixed), now declared on both | donepezil01: x = 1.19, s = 1.28; apalutamide01: x = 0.40, s = 0.43 |
| Working capital by three methods | PRODUCES; declared on both since tonight | donepezil01 spread x1.40, apalutamide01 x3.02 |
| Royalty inside a patent window; building by room area | PRODUCES when declared | `economics04_building_royalty_breakeven` |
| Staffing | HALF | a declared table priced; nothing derived from the Gantt |
| Layout drawing | PRODUCES from a declaration | plot plan, 3D; indoor pipes not drawn |
| Market forecast, patent expiry | HALF (EduTools, one price in the economics) | `patent-expiry`, `demand-forecast` |
| Compaction, tablet press physics | HALF (props bench on literature data) / NOT (press model) | `compaction01_mcc` |
| Blend/content uniformity, granule size, dissolution | NOT | stated as the group's question (README section 8) |
| Sterile route, capsules | NOT | no unit |
| Compressed air, vacuum, nitrogen, steam networks; effluent load | NOT | |

## 3. Blockers for tomorrow, ranked by how much they hurt a student

| # | Blocker | Hurts | Fix size | State |
|---|---|---|---|---|
| 1 | `breakEven {}` stopped the run on both base cases (itemised working capital x the s = 0 search point) with a message about the working capital | the one deliverable 14 of 14 reports compute could not be produced on the base cases | 10 lines, `EconomicsPass.cpp` | FIXED tonight |
| 2 | Renaming the API: `component 'X' not loaded`, no file named; the cause is eleven stale estimate files in `0/` | the first thing every group does, and the first wall they hit | 15 lines, `StreamStateIO.cpp` | FIXED tonight (message); the estimates still have to be deleted by hand -- `choupo-init0 --force` regenerates them, worth saying in the README |
| 3 | Prices are per kg of a result stream; a formula change silently changes the price per tablet | a wrong NPV with no warning, the old reports' own error class | a `pricePerItem` + `itemMass` form in `constant/economics`, or an announcement when the product stream's mass per item moved -- engine, half a day | NOT fixed; documented in the student path |
| 4 | A heat-bound dryer (74 % wet granules) is announced, not refused, and the plan's drying time does not move | a wrong plant that passes with exit 0 | a `solidDryer` option to REFUSE below a declared outlet moisture (one key, the announcement already exists) -- engine, hours | NOT fixed; documented |
| 5 | The `0/` feed files do not follow the formula: twelve files to rewrite by hand in kmol/h for a dose change | an hour of error-prone arithmetic per iteration | a per-tablet `formulation { ... }` table from which `choupo-init0` writes the inlets -- a tool slice, a general-day | NOT fixed; the student path gives the formula and the measured numbers |
| 6 | `runCase` refuses to overwrite a log (exit 1) and the terminal shows no answers | confusion at the second run | prose (student path, README) | documented |
| 7 | Neither base case declared `breakEven`, `sensitivity` (donepezil) or `workingCapitalMethods` | the student must know the grammar to get the deliverables | add the three blocks to both postDicts; new KPI rows appended | DONE on the commander's decision (same night): both postDicts declare them, goldens append-recorded (donepezil01 +25 rows, apalutamide01 +10), no existing row moved |
| 8 | The 0-pipe `pipeRack` default announcement on a plant with no outdoor pipe | noise that reads as a defect | one condition in the layout announcement | NOT fixed |
| 9 | The browser draws no clean-utilities, cleaning, break-even or WC-methods section | half the HVAC/water story is log-only in the GUI | GUI sections reading published KPIs and sheets -- a general-day | NOT fixed |
| 10 | `machineUtilisation.ts` infers the machine kind from keys; `kind` and `announceAbove` not published on the sheet | fragile table | engine: two sheet values (C208 follow-up) | NOT fixed |

## 4. What was fixed tonight (three commits, one file each)

1. `src/io/DesignSheetWriter.cpp`: a cost factor key of 20 characters or
   more keeps its space (`hvacPricePerSupplyAir 12;`).  Verified on a rerun;
   `check_design_sheet` OK.
2. `src/postProcessing/EconomicsPass.cpp`: the NPV break-even search reads a
   refusal of the s = 0 copy as the negative sign it is and goes on; at any
   positive scale a refusal still stops the run.  donepezil01 + `breakEven
   {}` now prints x = 1.1911 and s = 1.2843; `check_economic_extensions`,
   `check_cost_provenance`, `check_debt_financing`,
   `check_economic_sensitivity`, `check_estimate_class`,
   `check_unit_duty_allocation` OK.
3. `src/streams/StreamStateIO.cpp`: a component named in a `0/` file and
   absent from the package names the stream and the remedy (delete the stale
   estimate and `choupo-init0`, or declare the component).  Verified on a
   stale `0/finalBlend`.
4. Docs: `docs/pif-student-path.md` (new), this review, a section in
   `docs/ai/packs/batch-plant.md` on adapting a tablet case and the traps
   measured, and a paragraph in the donepezil01 README on the break-even,
   the sensitivity and the price per kg.
5. On the commander's decision, both base cases now DECLARE `breakEven {}`
   and `workingCapitalMethods { ... }` (and donepezil01 a `sensitivity {}`
   on the price, the discount rate and the labour rate), each end an
   author-set assumption with `source`/`reason`; the goldens were
   append-recorded (`bin/runTests --record-append`): donepezil01 +25 rows,
   apalutamide01 +10, no existing row moved (the base NPVs are unchanged,
   -18 672 735 and 128 116 741 EUR).  One lesson from doing it: `relative`
   sensitivity ends are DEVIATIONS from the base (`( -0.3 0.3 )` is +-30 %),
   not multipliers -- the first draft wrote `( 0.7 1.3 )` and got 1.7x and
   2.3x the price; the engine's own table header ("`relative` ends are
   fractions of the base value") reads either way.

Validation: `bin/runTests --scope` on donepezil01, apalutamide01 and
economics04: PASS 7 / FAIL 0 (no golden moved; the fixes change no printed
number of a passing run); `--fast` after the loader change (see the commit);
the GUI tests above.  A full sweep was not run: the three changes live in a
sheet's text format, in a search branch only `breakEven {}` reaches, and in
an exception path only a failing run reaches.

## 5. What could not be checked

* The browser in a display, and what www.choupo.org serves (bundle commit).
* A parenteral or a capsule route (no unit to try).
* Whether any price, rating or air-change rate is realistic -- every one is an
  author-set placeholder and says so; the review checked that it says so.
