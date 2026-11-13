# A tablet-plant project in Choupo: the path a PIF group follows

Written 2026-11-08 for the pharmaceutical-plant design project (PIF) groups,
against the engine at commit `5a912a62c` plus the three fixes of the readiness
review (`docs/reviews/2026-11-08-pif-readiness.md`).  Every number below was
measured on a run that day; every file and key named exists.  Read it with
the case's own README open -- the README is the narrative, this page is the
route.

## 0. What you get, in one paragraph

Two worked tablet plants are shipped: `tutorials/batch/plant/donepezil01_tablets`
(wet granulation, fluid-bed drying, aqueous film coat, 150 M tablets a year,
NPV negative -- the simpler one, start here) and
`tutorials/batch/plant/apalutamide01_tablets` (spray-dried dispersion from
acetone with solvent recovery, roller compaction, a sourced market and price).
One run of either gives you: the material balance per unit of product, the
batch plan (lot size, lots a year, the pacing step of each train, a Gantt of
the first campaign, cleans and effluent per year), whether each machine fits
the lot (utilisation against a rating YOU declare), the GMP building checked
(grades, pressure cascade, airlocks, flows), the HVAC supply air by room grade
and the purified-water generator and tank, every sized item costed, the
capital, the operating cost, the cash flow, NPV, IRR, payback, working capital
built up, a tornado sensitivity, a break-even and a plot plan in 3D.  What it
does NOT give you is in section 5: read it before you plan your report.

## 1. Open it and run it (10 minutes)

Command line, from the repository root:

```bash
source etc/bashrc
runCase tutorials/batch/plant/donepezil01_tablets      # about 15 s
less tutorials/batch/plant/donepezil01_tablets/log.choupoSolve
```

* `runCase` REFUSES to overwrite an existing `log.choupoSolve`: a second run
  prints `'...log.choupoSolve' exists; pass -f to overwrite` and exits 1
  with the OLD log untouched.  Rerun with `runCase -f <case>`.  (Measured:
  this is the first trap met, and it looks like a failure of the case.)
* The terminal shows only the end of the caveat block.  The answers are in
  the log (1 478 lines for donepezil01) and in the files of section 2.

Browser: `bin/runGui` serves the app; pick the tutorial `batch/plant/
donepezil01_tablets` in the case tree, press Run, open the **Reports**
workspace.  Your OWN copy of the case opens through *File / Open Case... /
Browse local folder...* (Chromium; Firefox and Safari take a folder through
a file dialog, or a `.zip` of the case).  The browser runs the same C++ as
the terminal (WebAssembly), including the batch plan, the sizing, the
building and the economics.  The sections you will use: *Batch plan* (the
Gantt and the per-machine utilisation table, bottleneck first), *Equipment
design*, *Equipment sheets* (every `design/` sheet, including
`hvac/gradeD`, `purifiedWater/generator`, `tabletPress/ratedMachine`),
*Plant layout (3D)*, the GMP building plan, *Economic appraisal* (capital,
operating cost, cash flow, payback), *Economic sensitivity (tornado)* once
you declare one, and *PFD (PDF)*.  NOT in the browser (log and files only):
the clean-utilities tables, the cleaning table, the break-even block and the
three working-capital methods -- read those in the log.

## 2. Where each deliverable of a PIF report appears

Paths are relative to the case directory after a run (`reports/`, `design/`
and `log.choupoSolve` are run outputs: regenerated whole, never edit them).

| Deliverable (the synthesis of 18 reports) | Where it appears | Status today |
|---|---|---|
| Material balance per unit of product (PFD + stream table) | log `Flowsheet summary`; `reports/streams/streamTable.csv`; GUI canvas and *PFD (PDF)* | produced |
| Batch plan: lot, lots/year, cycle per stage, limiting stage, campaigns, occupancy | log `BATCH PLAN (single product ...)`; `reports/batchPlan/{stages,trains}.csv` | produced |
| Gantt with machine utilisation | `reports/batchPlan/gantt.csv` (first campaign, both trains); GUI *Batch plan* draws it and the utilisation table | produced (one product; multiproduct campaigns exist in the grammar but `ratedMachine` then refuses) |
| Equipment list matched to batch size | log `Equipment Sizing` (`ratedMachine` rows: utilisation, refused above 1, announced above 0.85); `reports/equipment/equipmentList.csv` (tags, sizes, costs); `design/<unit>/ratedMachine` | produced for the FIT; the machines' sizes are the batch plan's, their prices are YOUR quotes |
| GMP rooms and air grades | log `[building]` table (room, grade, pressure, area); findings when a rule breaks; GUI building plan | produced (grades and pressures are declared; the engine checks the cascade, airlocks, containment, flows, escape) |
| HVAC: air changes x volume per room, fan, heating/cooling | log `Clean utilities: HVAC`; `design/hvac/grade<G>`, `design/hvac/total`; priced per m3/h by the `hvacGrade` quotes | produced, SENSIBLE only (no latent load, no room gains) |
| Purified water: demand, peak, generator, tank | log `Clean utilities: purified water`; `design/purifiedWater/{generator,storage}` | produced; not costed (a quote carries it) |
| Cleaning water and effluent | log `BATCH PLAN: cleaning of the machines`; `kpis.cleaning` | produced as VOLUMES; no load (API, COD) |
| CAPEX (FCI, TCI), with every quote's arithmetic | log `Equipment Costing` + `Economic Appraisal`; `reports/economics/*.csv`; `reports/report.ods` | produced |
| OPEX (COM_d: labour, raw materials, utilities) | log `Economic Appraisal`; crew declared and Turton's correlation beside it | produced |
| NPV, IRR, payback, cash flow | log; `reports/economics/cashFlow.csv` and `.ods` | produced |
| Working capital | built up (stock, receivables, cash, payables) in the log and `reports/economics/workingCapital.csv`; three methods side by side with `workingCapitalMethods {}` | produced |
| Sensitivity | `economics { sensitivity { ... } }` -> log `Economic sensitivity (one input at a time)` + `reports/economics/sensitivity.csv` + GUI *Economic sensitivity (tornado)* | produced; BOTH base cases declare one since 2026-11-08 (donepezil01: price +-30 %, discount rate 8-15 %, labour rate +-20 %; apalutamide01: the price at 2 vs 4 competitors) |
| Break-even | `economics { breakEven {} }` -> log `BREAK-EVEN (two answers, two questions)` (log only, not drawn by the GUI) | produced; both base cases declare it since 2026-11-08 (donepezil01: x = 1.19, s = 1.28; apalutamide01: x = 0.40, s = 0.43) |
| Working capital by three methods | `economics { workingCapitalMethods { ... } }` -> log `WORKING CAPITAL BY THREE METHODS` (log only) | produced; both base cases declare it since 2026-11-08 (donepezil01 spread x1.40, apalutamide01 x3.02 between the three) |
| Staffing | `operatingCrew { areas (...) }` priced; Turton's N_OL printed as a comparison | half: the crew is YOUR table; nothing derives it from the Gantt |
| Layout | `system/layoutDict`: plot plan (roads, gates, buildings), the GMP interior with equipment in rooms; GUI 3D and plan | produced; the drawing is yours to declare, the engine checks and draws it |
| Market forecast, patent window | EduTools *Patent expiry and generic entry* and *Demand forecast* (GUI, Methods); `royalty { ... expiry }` in the economics | half: the EduTools give a volume ramp and a price; the economics takes ONE price |
| Compaction (Heckel, Kawakita) | `tutorials/props/powder/compaction01_mcc` (props bench on literature data) | half: outside the plant case; no press force model |

## 3. Adapt it to YOUR drug (the files and keys), with a worked example

The example below was actually run on 2026-11-08: a copy of donepezil01
turned into **metformin hydrochloride 500 mg film-coated tablets**, 600 mg
core, 600 kg lots, 100 million tablets a year (61 800 kg), still wet
granulation.  Each step names the files it touched and what the engine said.

### 3.1 Copy the case

```bash
cp -r tutorials/batch/plant/donepezil01_tablets tutorials/batch/plant/<myDrug>_tablets
cd tutorials/batch/plant/<myDrug>_tablets
rm expected log.choupoSolve; mv donepezil01_tablets.cho <myDrug>_tablets.cho
```

### 3.2 The API record and the component list

* New file `constant/components/<yourApi>.dat`, copied from
  `donepezilHydrochloride.dat`: change `name`, `formula`, `MW` (recompute it
  from the formula), `rho_p`, the heat capacity; keep `role nonvolatile;`
  and the `provenance` block saying what is assumed.  Excipients not in the
  case: same shape (`docs/ai/packs/batch-plant.md` section 6 shows a minimal
  record).  The catalogue `data/standards/components/` has NO excipients.
* `constant/thermoPhysPropDict`: replace the old name in `components ( ... )`.
* Delete the old record.  The seal (`constant/propertyManifest`) hash-checks
  only the records imported from the catalogue (water, N2, O2, SS316, the
  utilities), never your own: adding or editing a case-local record is free.

**What happened on the run:** `ERROR: ThermoPackage: component
'donepezilHydrochloride' not loaded`, exit 2 -- although no file I had
written carried the name.  The INTERNAL streams' files in `0/`
(`finalBlend`, `wetMass`, `driedGranules`, `tabletCores`, ...) are
ESTIMATES of the converged base case and still listed the old API.  Remedy:
delete every `0/<stream>` whose header says "An ESTIMATE, not an input"
(eleven files) and run `bin/choupo-init0 <case>`, which rewrites them from
your inlets (`[init0] 0/ materialised: 30 graph streams == 30 state files
(11 written, 19 kept)`).  Since 2026-11-08 the message names the stream
file and this remedy.

### 3.3 The formula, the dose and the basis rate: every `0/<feed>` file

The flowsheet is the balance per unit of product at a BASIS rate you choose
(the base case: 720 000 tablets/h pressed, the fluid bed's own drying rate for
one 300 kg lot in 1.5 h).  Each inlet file carries that feed's flow at the
basis, and **they do not follow each other**: change the dose or the lot and
you rewrite all of them.  For a solid the file wants MOLAR flow, written
twice (overall and inside `phases { solid { ... } }`):

```
componentMolarFlows { metforminHydrochloride 2.012640382 kmol/h; }
T 298.15 K;  P 1.01325 bar;
phases { solid { componentMolarFlows { metforminHydrochloride 2.012640382 kmol/h; } } }
```

with kmol/h = (mg per tablet x 1e-6 x tablets per hour) / MW.  Water inlets
(`granWater`, `coatWater`) take `componentMassFlows { water 120.0 kg/h; }
... phase liquid;`.  The drying air (`fbdAirIn`, `coatingAirIn`) is N2 / O2 /
water in kmol/h.  A ten-line script that writes the twelve feed files from a
per-tablet table is the right tool; the example's numbers (666 667 tablets/h
pressed, 600 mg core: API 500, lactose 5, starch 10, MCC 60, HPC 20 as a 10
wt % binder, Mg stearate 5; a 3 % HPMC coat as a 12 wt % suspension) gave
API 333.3 kg/h = 2.01264 kmol/h, binder water 120.0 kg/h, coat water 88.0
kg/h.  Then delete the estimate files and run `bin/choupo-init0` again.

### 3.4 The batch plan, the machines and the money: `system/postDict`

| What you change | Key | The example |
|---|---|---|
| Production | `batchPlan { production { perYear ... kg; } }` | 61800 kg (100 M x 0.618 g) |
| Lot | `batchPlan { lot { mass ... kg; } }` (kg of `finalBlend`) | 600 kg |
| Times, densities, fills, shifts, campaigns | each `stages ( { ... } )` entry and `trains ( ... )` | unchanged (defend them) |
| The pressed tablet and the packed tablet | `ratedMachine` ratings `itemMass` of `tabletPress` and `packagingLine` | 0.6 g and 0.618 g |
| Machine ratings (vendor data sheets) | `rating { nominalVolume; maxFill }`, `capacity`, `stations; turretSpeed`, `packsPerMinute` | granulator 1.2 -> 2.5 m3, fluid bed 1.5 -> 3.0 m3, blender 1.0 -> 2.0 m3, pan 1.0 -> 1.5 m3 |
| Prices of the machines and the building | `costing { quotes ( ... ) }` (`value` at `referenceSize`, six-tenths scaling declared) | unchanged placeholders |
| HVAC price per m3/h, air changes per grade | `quotes` entries `hvacGrade D/CNC`; `cleanUtilities { hvac { changesPerHour } }` | unchanged |
| Crew | `economics { operatingCrew { areas ( ... ) } }` | unchanged |
| Break-even, WC methods, sensitivity | `economics { breakEven {}  workingCapitalMethods { fractionOfSales 0.15; fractionOfFixedCapital 0.15; source; reason; }  sensitivity { price.packagedTablets { relative ( -0.3 0.3 ); } discountRate { absolute ( 0.08 0.15 ); } labourRate { relative ( -0.2 0.2 ); } } }` | added |

**What happened on the run with the 600 kg lot and the OLD ratings:** four
machines refused, each with its remedy -- `granulator FAILED: the machine
does NOT fit the lot -- utilisation 1.86886 (1.34558 m3 against 0.72 m3 for 1
machine(s)).  2 machine(s) of this rating would carry it: declare installed {
count 2; ... } or a larger machine, or a longer stage in the batch plan`; the
quote on a refused unit then stops the run (exit 2, no economics).  Raising
the ratings as in the table gave utilisations 0.90 / 0.90 / 0.60 / 0.86 /
0.72 / 0.81 / 0.63 and the run completed.

**What happened to the dryers:** with 120 kg/h of binder water and the base
case's 250 kmol/h of air at 60 C both dryers printed
`[SolidDryer] WARNING: the hot air cannot pay for drying to the isotherm's
equilibrium moisture ... X_final = 2.832 kg/kg (73.90 wt% wet) ...
[heat-bound]` -- and the run still exited 0 with an NPV.  Wet granules going
to the press is not refused, it is announced: READ the dryer blocks.  Scaling
`0/fbdAirIn` to 700 kmol/h of dry air (N2 553, O2 147, water 8.4) and
`0/coatingAirIn` to 500 kmol/h brought both back to `[isotherm-reached]`.
The air heaters' duties and areas, and their LP-steam cost, follow.

### 3.5 Prices: `constant/economics`

Prices are EUR per kg OF THE STREAM.  The tablet price is therefore
`EUR per tablet x accepted tablets per hour / kg per hour of packagedTablets`,
and the kg/h is a RESULT of the run (it moved from 206.9 to 413.6 kg/h in the
example).  Nothing warns you: the example's first run sold 0.618 g tablets at
the 0.29 g tablet's price per kg, i.e. 0.213 EUR a tablet instead of the
intended 0.03.  Recompute the division after every change of formula, coat or
reject fraction (0.03 x 660 000 / 413.6 = 47.87 EUR/kg here), and say so in
the `provenance`.  Price EVERY inlet (`price 0;` with a provenance for air):
an unpriced inlet is left out of C_RM silently.

### 3.6 The building and the plot: `system/layoutDict`

Rooms are boxes with a grade, a pressure and a floor; airlocks are rooms with
a `role` and a `regime`; doors and flows are declared; the sized items that
stand in a room are listed in its `equipment ( ... )`.  Grammar:
`docs/ai/packs/layout.md` section 4.  The example kept the base case's 33
rooms.  Removing a unit (section 3.7) means removing it from its room's
`equipment` list and from `items ( ... )`, or the layout refuses by name.

### 3.7 A different route: direct compression (tried)

Deleting `binderPrep`, `granulator`, `fbdAirHeater`, `fluidBedDryer` and
`mill` from `flowsheetDict` and feeding the five powders to `finalBlender`
took, in the SAME commit of edits: the nine `0/` files of the removed
streams deleted; the four stages, the three cleaning entries, the five
sizing entries, the three quotes and the `binderWater` use removed from
`postDict` (`N_np 1`, `particulateSteps 3`); the two items and their room
listings removed from `layoutDict`; the three inlet prices removed from
`constant/economics`.  Then `bin/choupo-init0` and a run: it went through at
the first attempt (lot 613 kg of product, 101 lots, the blending train paced
by the final blender at 2.25 h and idle 86 % of the year -- announced, FCI
18.5 M EUR).  The granulation rooms are still in the building and still
served by the HVAC: delete or rename them yourself.  Capsules or a sterile
product: no unit models a capsule filler, a filling line, a lyophiliser or
sterilising filtration (section 5); you can still declare them as
`ratedMachine` placeholders of kind `massRate` with a `splitter` in the
flowsheet, quote them, and say in your report that nothing of the machine is
modelled.

### 3.8 Read the result, and what you must still write down

Grep the log for `FAILED`, `INCOMPLETE`, `WARNING` and `ERROR` before
quoting any number; the caveat block at the end repeats every announcement.
Every assumption you kept from the base case is an AUTHOR-SET PLACEHOLDER
and says so on its line (`source`, `reason`): your report replaces each with
a cited figure or defends it.

## 4. The example's end state (for calibration)

Metformin 500 mg, wet granulation, 600 kg lots, 100 M tablets/yr at 0.03 EUR:
lot 592 kg of product, 105 lots, T_L 4.25 h (fluid bed) / 11 h (packaging),
trains 22 % / 44 % occupied; FCI 24.1 M EUR; revenue 2.96 M EUR/yr against
COM_d 14.9 M EUR/yr; NPV -80 M EUR; operating break-even at x = 7.15 of
nameplate; the tornado (price, discount rate, labour rate) as declared in 3.4 -- `relative` ends are DEVIATIONS from the base (-0.3 0.3 is +-30 %), not multipliers; the probe first wrote 0.7 1.3 and got 1.7x and 2.3x the price.  The lesson is the apalutamide README's: a dedicated GMP line does
not pay on a commodity generic; the base case's donepezil at 0.10 EUR gives
NPV -18.7 M and breaks even (NPV) at 1.28 x nameplate.

## 5. What Choupo does NOT do yet -- do it by hand, and say so

* **No machine physics**: granulation end-point, granule size, blend and
  content uniformity, hardness, dissolution, coating uniformity.  The
  machines are mass-balance boxes checked for FIT only; the tablet press is
  also checked for dwell time and for the compaction force a target
  strength needs WHEN the case declares the formulation's fitted curves and
  dwell need (DEV.md 4c C270, `tutorials/batch/plant/tabletPress01_dwell_and_force`).
  The compaction bench (`tutorials/props/powder/compaction01_mcc`) fits
  Heckel / Kawakita / Ryshkewitch to literature data, outside the plant.
* **Multiproduct campaigns with rated machines**: the plan accepts
  `products ( ... )`, but `ratedMachine` refuses a multiproduct plan.
* **Staffing from the Gantt**: the crew is a table you declare; the 4.5
  positions per operator-per-shift is round-the-clock cover (both trains
  here run two shifts -- question it).
* **HVAC beyond the sensible first estimate**: humidity, latent load, room
  heat gains, pressure-cascade leakage, filters.  Compressed air, vacuum,
  nitrogen, steam networks: not sized.  Purified-water plant: sized, not
  costed.  Effluent: a volume, no load, no treatment.
* **A sterile route**: filling line, isolator/RABS, lyophiliser, sterilising
  filtration, F0 -- nothing.  Capsules: no filler model.
* **The economics**: one price per product for the whole life (the EduTool's
  price ramp must be collapsed to one discounted-weighted price); one
  break-even under full production (not under a ramp-up); the sensitivity is
  a tornado, not an uncertainty analysis; no depreciation by asset class.
* **The layout**: pipes indoors are not routed; door widths, travel
  distances and access clearances are not checked; the drawing is a plan you
  declare, not a generated one.
* **Market and regulatory**: the patent-expiry and demand-forecast EduTools
  are calculators on declared curves, not a freedom-to-operate analysis.
