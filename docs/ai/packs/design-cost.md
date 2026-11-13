# Pack: equipment sizing, costing and economics (CAPEX, OPEX, NPV)

budget: 3250 words (~5200 tokens)

Read this pack when the design must say how BIG the equipment is, what it
COSTS and whether the plant pays: vessels, exchangers, columns, machines;
capital (FCI, TCI), operating cost, revenue, NPV, IRR, payback, sensitivity.
Binary: `choupoSolve` (steady) or any case with a converged balance.  All of
it is `system/postDict` plus prices in `constant/economics`.  Batch plants
(lots, machine utilisation, clean utilities): pack `batch-plant`.  Plot plan:
pack `layout`.

## 1. The chain and the rule that governs it

* `postDict` blocks run in FILE ORDER: `sizing`, then `costing`, then
  `economics` (needs both).  Each reads the converged balance; none re-runs it.
* Sizing is NOT a design optimiser: it turns the balance and a few DECLARED
  rules (U, residence time, pressure, wall) into a size.  Every declared
  number is the student's; a default that was used is ANNOUNCED
  (`assumed ( ... )` on the design sheet), a declared value announces nothing.
* The estimate is AACE class 5 by default (-50 %/+100 %): it says where its
  numbers come from and carries no more accuracy than that.
* A SIZER that cannot size is refused as an ITEM, never as the run: it prints
  `<unit>  FAILED: <reason>` in the Sizing table, the unit is then absent from
  costing, the totals read INCOMPLETE and the caveat block carries
  `incomplete-sizing`; the run still exits 0 (the documented contract, held by
  `check_design_sheet` arm (n)).  So read the Sizing table and grep the log
  for `FAILED`, `INCOMPLETE`.  A REQUIRED economics price that is missing
  (`labourRate`, a product price, a `rawMaterials` entry for a boundary
  inlet) is different: the run FAILS (`EconomicsPass: REQUIRED PRICE MISSING
  -- <name>`, then `ERROR: the 'economics' post-processing pass ...`, exit 2)
  and no appraisal is made.  Every boundary inlet the plant consumes needs a
  `rawMaterials` entry, priced or declared free with `price 0;` and its
  `provenance`; utility-circuit supplies are exempt.

## 2. `sizing { units ( ... ) }`

```
sizing
{
    units ( { unitName <flowsheet unit>; type <sizer>; material SS316;
              designRules { ... } } ... );
    storage ( ... );  gasStorage ( ... );  liquefiedGasStorage ( ... );   // optional lists
}
```
`material` is a record in `data/standards/assets/` (`SS316`, `SS304`,
`carbonSteel`, `aluminium`); it gives the material factor F_M.  `type` is the
SIZER, not always the unit type.
| `type` | for | `designRules` (units: bar, m, W/m2K, K) |
|---|---|---|
| `vessel` | drums, separators, tanks sized from a volume | ONE of `volume 5 m3;` \| `residenceTime 300 s;` (needs the unit's flow KPI: `flowKey <kpi>;`) \| `spaceVelocity` (+ `spaceVelocityBasis normal|actual;`); `L_over_D`, `pressureDesign`, `corrosionAllow` m, `jointEfficiency`; batch plant: `volume fromBatchPlan;` |
| `stirredTank` | `cstr` | takes the unit's `V_R`; `pressureDesign` required; `L_over_D`, `corrosionAllow`, `jointEfficiency` |
| `shellTubeHX` | any exchanger/heater with a duty `Q_kW` | route 1 `U` + `LMTD`; route 2 `U` + `utility <name>` (LMTD from the unit's terminal T and the utility record); route 3 neither (a rated exchanger passes its own area); route 4 `design { ... }` (Kern bundle, tube count solved); `pressureDesign` |
| `distillationColumn` | column | `trayMaterial` (REQUIRED to cost the trays), `traySpacing`, `refluxDrum`, `residenceTime`, `pressureDesign`; returns 5 items: shell, trays, condenser, reboiler, drum |
| `evaporator` `crystalliser` `sprayDryer` `cyclone` `compressor` | the same-named units | `pressureDesign` + their own keys (read the sizer .cpp) |
| `pfr` | catalyst bed | passes the bed's `V_R`; catalyst charge costed from a DECLARED bulk density and unit price |
| `ratedMachine` | a machine with a vendor rating | pack `batch-plant` (kinds `batchVolume massRate tabletPress packagingLine`); `kind volumeRate` rates a PUMP: `rating { maxFlowPerUnit 500 m3/h; origin literature|assumed; source; reason; [pressureRating] }`, `installed { count }`, `spare { count }`, `perTrain yes;` (no batch plan) |
| `reliefValve` | protects a sized item | API 520 area for declared `blockedOutlet`/`fire` scenarios; NOT costed |
| `storage` list | atmospheric tanks | `{ stream <s>; material; storageTime 21 day; fillFraction 0.9; maxTankVolume 30000; }` or `{ unit <storageTank unit>; material; maxTankVolume; }`; a gas is refused |

* Not sized: pumps (except `volumeRate`), valves, mixers, splitters, solid
  handling placeholders.  Say so in DESIGN.md; they are not in the capital
  unless you quote them (§3).
* Hand estimate first: exchanger A = Q / (U x LMTD); vessel V = flow x
  residence time (+ 20-50 % margin); compare with the table printed.
* Output: the Sizing table (size, wall, weight), `design/<unit>/<item>` (one
  dictionary per physical item, regenerated each run: inlets, outlets, sizes with
  units, `basis`, `assumed`), `sizing.csv`; each item's plant TAG (`P-101A`) and the equipment list (§2b).

### 2b. The plant tag and the equipment list

Every sized item gets a TAG, the name it answers to in the design sheet, the
cost table and the list (Turton's `XX-YZZ A/B` form, ONE rule in
`src/postProcessing/sizing/EquipmentTag.cpp`, generated unless you declare it):

* `XX` the kind letters (our own convention, not a standard): `P` pump (a
  `ratedMachine` of kind `volumeRate`), `C` compressor, `E` exchanger
  (`shellTubeHX`; a column's condenser and reboiler), `EV` evaporator, `V`
  vessel (drum, reflux drum, gas store), `T` tower shell, `TR` tray stack, `R`
  reactor (`stirredTank`, a `pfr`/`converterShell` shell), `CAT` catalyst
  charge, `TK` tank, `D` spray dryer, `CR` crystalliser, `CY` cyclone, `PX`
  pressure exchanger, `MB` membrane bank, `PSV` relief valve, `PH` header pipe,
  `AH` air handling, `WG` water generator, `M` process machine (kinds
  `batchVolume`, `massRate`), `TP` tablet press, `PK` packaging line.
* `Y` the sector number in the order the flowsheet declares its top-level
  sectors; `1` for a flat case; `0` for an item of a sectored plant that
  belongs to no sector.
* `ZZ` a running number within (sector, letters) in declaration order
  (flowsheet unit order, then the order the sizing produced the items).
* The suffix: N identical parallel items (`perTrain yes;` trains, a tank bank,
  the vessels of a gas store) share ONE number and take `A`, `B`, ...
  (`P-102A` .. `P-102F`); one item standing for several machines in parallel
  (`installed { count 3; }` plus `spare`) is `A/B` (two) or `A-D` (more).
* Declare it: `tag P-201;` in the `sizing` entry (also in a `storage` /
  `gasStorage` / `liquefiedGasStorage` entry).  It wins and the run says
  `[tag] ...` once; on a train family it is the base and the letters follow.
  A unit that realises several items (a column) needs
  `itemTags { shell T-101; condenser E-101; reboiler E-102; trays TR-101;
  refluxDrum V-101; }` (the item words of its sheets); `tag` there is refused.
  A generated number skips the numbers you declared.  Two items with the same
  final tag REFUSE: `tag: items 'A' and 'B' would both be tagged 'V-901'`.

What it writes: a `tag` line on every `design/` sheet; a `tag` column in
`sizing.csv` and `costs.csv`; `"tagNo"` per item (and the `equipmentList`
block) in the result JSON; the golden `equipment` kind pins `tagNo`.  THE
EQUIPMENT LIST is `reports/equipment/equipmentList.csv`, regenerated whole each
run, one row per item: `tag,item,unit,sector,equipment,installed,sizeKey,
sizeValue,sizeUnit,dimensions,pressureDesign,pressureUnit,material,currency,
purchased,bareModule,totalModule,costNote,tagBy` (design temperature is not in
it: no sheet carries one).  The app prints it from Reports (Open equipment list,
A3 landscape).  RUN (`tutorials/plant/swro01_campoDalias`, six trains):

```
tag,item,unit,...,equipment,installed,...
P-101A-D,IntakePump,IntakePump,,ratedMachine,4,utilisation,0.782,...   // 3 running + 1 spare
P-102A,HPpump/train1,HPpump,,ratedMachine,1,utilisation,0.499,...      // ... P-102F = train6
PX-101A,PX/train1,PX,,pressureExchanger,1,...,pressureDesign 75 bar
TK-101,Remineralisation/tank1,...                                      // one tank: no letter
```
and `tutorials/batch/plant/donepezil01_tablets` (flat; `M-101` granulator ..
`TP-101` tablet press, `V-101` binder tank with `D 0.434 m; H 0.652 m`, `E-101`
air heater with 21.6 m2 and its cost).

## 3. `costing`

```
costing
{
    method Turton;  year 2026;  cepci 820;  cepci2001 397;  usdToEur 0.92;
    quotes ( { unit <u>|item <tag>; value 400000; currency EUR; year 2026;
               basis installed|purchased; kind equipment|facility;
               source "..."; reason "..."; } );             // optional
}
```
* Method `Turton` (the only one; `Guthrie` is refused by name): C_p from the
  size by a log-quadratic of Turton et al. Appendix A (2001 USD) x CEPCI
  ratio x EUR/USD; C_BM = C_p (B1 + B2 F_M F_P); C_TM = 1.18 C_BM.  Every
  coefficient is printed under the table.  Prices of YOUR year: set `cepci`
  (target-year CEPCI index) yourself and cite it.
* A size OUTSIDE the correlation's range is costed anyway and ANNOUNCED
  `[validity] ... OUTSIDE the correlation range [10, 1000] -- cost
  EXTRAPOLATED` (a 2.9 m2 exchanger is).  Do not hide it: scale the case or
  quote the item.
* Items with no correlation (rated machines, a building, a catalyst, trays
  without `trayMaterial`) are listed under `NOT COSTED` and the total says
  `-- INCOMPLETE` if one that SHOULD have cost failed.  A `quotes` entry
  prices them: `basis installed` is the final price (no factor), `purchased`
  needs your `bareModuleFactor`; `kind facility` (a building) skips the
  `siteFactor` term; a `scaling { referenceSize; exponent; exponentSource; }`
  block rescales a quote (six-tenths rule).  A quote on a unit whose sizer
  REFUSED stops the run: `That refusal is the finding; a quote would hide it`.
* Pressure vessel banks (`gasStorage`) are priced by steel mass x your
  `steelPrice`; no price = the cost refuses by name.

## 4. `economics`

```
economics
{
    method discountedCashFlow;  projectLife 10;  constructionPeriod 1;
    discountRate 0.10;  taxRate 0.21;  depreciation straightLine;  depreciableLife 7;
    salvageFraction 0.0;
    taxOnLoss credit;               // default; `none` = stand-alone (a loss year pays no tax, earns no credit)
    workingCapital 0.15;            // x FCI; or a block { rawMaterialStock 60 day; receivables 60 day; payables 30 day; minimumCash 15 day; }
    streamFactor 0.90;              // operating fraction of the year; batch plant: fromBatchPlan
    siteFactor 0.50;  contingencyFee 1.18;  N_np 2;
    estimateClass 5;  accuracyBand ( -50 100 );
    refuseOnMissingPrice 1;
    [sensitivity { ... }]  [land { price 80; source; reason; }]  [financing { ... }]
    [buildings { ... }] [breakEven {}] [royalty { ... }] [workingCapitalMethods { ... }]
    [capitalSchedule (...)] [rampUp (...)] [startupCostFraction 0.1]
    [operatingCrew {...}]  [particulateSteps {...}]
}
```
* Prices live ONLY in `constant/economics` (EUR/kg of the stream, dated,
  with `provenance { origin; method; }`): `products ( { stream; price;
  costYear; provenance } )`, `rawMaterials ( ... )`, `labourRate` (EUR/h) and
  `labourRateYear`.  At least one product and `labourRate` MUST be
  priced or the appraisal does not run (`refuseOnMissingPrice 1`; `0` =
  defaulted but loud).  CAUTION (measured): a raw-material INLET with no
  `rawMaterials` entry is NOT refused and NOT announced; its cost is simply
  absent from C_RM.  Price EVERY boundary inlet yourself (`price 0` for
  ambient air) and compare the printed C_RM with a hand sum.  Utilities are priced from their records (steam LP/MP/
  HP, cooling water, electricity...) and shown as `C_UT`.
* Printed ladder: FCI = 1.18 sum C_BM + 0.50 sum C_BM(base) (+ land);
  WC; TCI = FCI + WC; COM_d = 0.180 FCI + 2.73 C_OL + 1.23 (C_RM + C_UT +
  C_WT) (depreciation not included); revenue; NPV; IRR; discounted and simple
  payback; cash flow in `reports/economics/cashFlow.csv` (+ `.ods`).  Labour
  = Turton's N_OL = sqrt(6.29 + 31.7 P^2 + 0.23 N_np) operators per shift
  (P = particulate steps, 0 absent, announced) x 4.5 positions x wage; or
  `operatingCrew` (pack `batch-plant`).
* A LOSS YEAR: `taxOnLoss credit` (the default) makes its tax a CREDIT, tau x
  the loss -- the owner is assumed to have other taxable profit (a group);
  the run announces the credit's total and its share of the NPV whenever a
  year is a loss.  `taxOnLoss none;` is the stand-alone reading: no tax, no
  credit, no carry-forward (not modelled).  Say which reading your NPV is.
* Honest reading: only COSTED items are in the capital, so a plant with two
  items has a tiny FCI and an absurd IRR.  Warnings are checks:
  `IRR = 757 % is EXTREME ... verify the project SCALE`; `(no sign change of
  NPV(i) ... project never breaks even)`.  A positive NPV with C_UT and
  labour dominating is the point of the exercise: read COM_d line by line.
* `sensitivity { <input> { relative|absolute ( lo hi ); } }`: one input moved
  ALONE, same flowsheet: `FCI` (`relative accuracyBand;`), `price.<stream>`,
  `utility.<name>`, `labourRate`, `discountRate`, `taxRate`, `streamFactor`,
  `land.price`, `financing.rate`.  An unknown input or an undeclared price
  refuses by name.  It is a tornado, NOT an uncertainty analysis; table in
  `reports/economics/sensitivity.csv`.
* Optional: `land { price; source; reason; }` prices the plot area of the
  layout (non-depreciable); `financing { debtFraction; basis; rate; graceYears;
  termYears; repayment annuity|linear; source; reason; }` adds equity NPV/IRR.
* Opt-in extensions (every number is the CASE's, none is shipped; witness
  `tutorials/steady/economics/economics04_building_royalty_breakeven`):
  - `buildings { price <EUR per m2>; gradePrice { A|B|C|D|CNC <EUR per m2>; };
    source; reason; }`: the building cost from the rooms of the layout's
    `building {}`: area = the sum of every declared room's floor area on every
    floor (walls, corridors and stairwells not listed as rooms are NOT counted:
    a lower bound), priced at the room's grade price else `price`.  It is an
    installed FACILITY (like a `kind facility` quote): contingencyFee x C_BM
    enters FCI, nothing enters the siteFactor base, it is depreciated with the
    plant.  Refused: no `building {}` declared, no source or reason, a room
    whose grade has no price.  KPIs `building_area_m2`, `building_C_BM`,
    `building_inFCI`, `building_area_m2_grade<g>`.
  - `breakEven {}` (or `breakEven on;`): the OPERATING break-even
    x = F/(R - V), fixed F = 0.180 FCI + 2.73 C_OL + depreciation, variable
    V = 1.23 (C_RM + C_UT + C_WT) (the classification is printed), and the NPV
    break-even s (the production fraction at which NPV = 0, found by the same
    `appraise` on a copy); they differ (capital charge, tax, working capital,
    ramp-up, royalty window, discounting) and the output says so.  KPIs
    `breakEven_operating_fraction`, `breakEven_npv_fraction`.  No verdict.
    `price ( <stream> ... );` inside the block adds, per priced stream, the
    price at which NPV = 0 (KPI `breakEven_price_<stream>`).
  - `royalty { rate <fraction>; basis sales|costOfManufacture; expiry <year>;
    source; reason; }`: a cost of operating years 1..expiry only, deducted
    before the tax; refused without `expiry` (a royalty with no end), source
    or reason; `royalty.rate` is a sensitivity input; KPIs `royalty_total`,
    `royalty_years`; a `royalty_<cur>` column in cashFlow.csv.
  - `workingCapitalMethods { fractionOfSales; fractionOfFixedCapital; source;
    reason; }`: the itemised build-up (if `workingCapital {}` is declared), a
    fraction of annual sales and a fraction of fixed capital side by side with
    the spread and the method the appraisal USES (the case's own
    `workingCapital`); a method without its input is named, not defaulted.
    KPIs `WCm_itemised`, `WCm_sales`, `WCm_fixedCapital`, `WCm_spread`,
    `WCm_used`.
* KPIs `economics.NPV`, `.IRR`, `.FCI`, `.COM_d` feed a sweep or optimisation.

## 5. Example: heat an ethanol-water feed and flash it

Case: feed 200 + 800 kmol/h at 25 degC; a `heater` with `Q 1500 kW` (a
heater takes Q, not an outlet T); an `isothermalFlash` at 1.013 bar; size the
exchanger against LP steam and the drum from a declared volume; cost; appraise.

`system/controlDict`
```
application  choupoSolve;
description  "Heat an ethanol-water feed and flash it: a sized exchanger and drum, costed, appraised and placed on a plot plan";
verbosity    2;
reports { streamTable {} massBalance {} energyBalance {} }
```
`constant/thermoPhysPropDict`
```
recordType    thermophysicalPropertySystem;
schemaVersion 2;
components ( ethanol water );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel { model NRTL; }  standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
```
`system/flowsheetDict`
```
units
(
    {   name heater;  type heater;
        in feed;  outputs ( hotFeed );
        operation { Q 1500 kW; } }
    {   name flashDrum;  type isothermalFlash;
        in hotFeed;  outputs ( liquidProduct vapourProduct );
        operation { P 1.013 bar; } }
);
```
`0/feed`
```
componentMolarFlows { ethanol 200 kmol/h;  water 800 kmol/h; }
T 25 degC;
P 1.5 bar;
phase liquid;
```
`constant/economics`
```
products
(
    { stream vapourProduct;  price 0.25;  costYear 2026;
      provenance { origin "assumed"; method "a placeholder, not a market price"; } }
    { stream liquidProduct;  price 0.01;  costYear 2026;
      provenance { origin "assumed"; method "a placeholder, not a market price"; } }
);
rawMaterials
(
    { stream feed;  price 0.10;  costYear 2026;
      provenance { origin "assumed"; method "a placeholder, not a market price"; } }
);
labourRate      42.0;
labourRateYear  2026;
```
`system/postDict`
```
sizing
{
    units
    (
        { unitName heater;  type shellTubeHX;  material SS316;
          designRules { utility steamLP;  U 800;  pressureDesign 4; } }
        { unitName flashDrum;  type vessel;  material SS316;
          designRules { volume 5 m3;  L_over_D 3;  pressureDesign 3;
                        corrosionAllow 0.0015;  jointEfficiency 1.0; } }
    );
}
costing
{
    method    Turton;
    year      2026;
    cepci     820;
    cepci2001 397;
    usdToEur  0.92;
}
economics
{
    method              discountedCashFlow;
    projectLife         10;
    constructionPeriod  1;
    discountRate        0.10;
    taxRate             0.21;
    depreciation        straightLine;
    depreciableLife     7;
    salvageFraction     0.0;
    workingCapital      0.15;
    streamFactor        0.90;
    siteFactor          0.50;
    contingencyFee      1.18;
    N_np                2;
    estimateClass       5;
    accuracyBand        ( -50 100 );
    refuseOnMissingPrice 1;
    sensitivity
    {
        FCI                 { relative accuracyBand; }
        labourRate          { relative ( -0.2 0.2 ); }
        price.vapourProduct { relative ( -0.2 0.2 ); }
    }
}
```

Run: `bin/choupo-init0 <case>; choupoSolve <case>` (the `ethanol`, `water`
records and `steamLP`/`SS316` come from the catalogue).  Result as run: exit 0; hotFeed 363.3 K at 1.5 bar, liquid 439 and vapour 561
kmol/h after the flash at 1.013 bar; heater A = 29.2 m2 (LMTD 64.1 K against
steamLP at 400.3 K, U 800), 894 kg, C_p 32 394 EUR, C_BM 216 812; drum V = 5
m3, wall 2.9 mm, 361 kg, C_p 13 873 EUR, C_BM 108 223; FCI 465 062 EUR;
COM_d 28.9 M EUR/yr (raw material 18.6 M, utilities 2.7 M, labour 0.96 M);
revenue 30.5 M EUR/yr; NPV 7.0 M EUR, IRR 229 % with the warning `IRR is
EXTREME (>200%) ... verify the project SCALE` (the capital is two items),
discounted payback 0.48 yr; `design/heater/shellTubeHX` and
`design/flashDrum/vessel` written; the sensitivity table ranks
`price.vapourProduct`, `FCI` and `labourRate` by NPV swing.
Do not swap the drum for an `adiabaticFlash` here: on this feed (363.3 K,
1.5 bar, liquid, let down to 1.013 bar) it stalls at V/F 0.015 with an energy
residual of 0.64 J/mol and the run stops with `ERROR: Flowsheet: unit
'flashDrum' failed to converge` (measured; an engine limit near the bubble
point, not a case error).  Use `isothermalFlash` at the heater outlet T.
Variants run: `residenceTime 300 s` on the drum -> `flashDrum FAILED: Vessel:
unit 'flashDrum' has no 'N_out_mol_s' KPI needed to size it ... give the volume
directly`, exit 0; `constant/economics` without `labourRate` -> `REQUIRED PRICE
MISSING -- labourRate`, exit 2 and no appraisal; a 1.5 kW heater -> `[validity] WARNING ...
OUTSIDE the correlation range [10, 1000] -- cost EXTRAPOLATED`.

## 6. What a student should still decide (write it in DESIGN.md)

* Which items are sized, which are quoted, which are left out of the capital.
* U and LMTD (or the `design {}` route), residence times, design pressures,
  materials, corrosion allowance: each with a reason.
* Every price and its year; the discount rate; the operating fraction.
* The accuracy class and what moves the answer most (the tornado).

<!-- RUN: scratch case plotMini (this example, verbatim); CHOUPO_HOME=/home/vitor/Choupo bin/choupo-init0 . ; choupoSolve .  -> exit 0, converged. -->
<!-- SOURCES (src/postProcessing unless noted)
 sizer types registered: sizing/EquipmentSize.cpp:78-139; lists units/storage/gasStorage/liquefiedGasStorage and trains: SizingPass.cpp:219-262.
 vessel keys: sizing/VesselSize.H:20-33, .cpp (volume, residenceTime, spaceVelocity, flowKey, flowUnit; measured FAILED text).
 shellTubeHX routes: sizing/ShellTubeHX.H:31-60.  stirredTank pass-through V_R: sizing/StirredTank.cpp:114 (basis).
 column keys: sizing/ColumnSize.cpp (design, pressureDesign, refluxDrum, residenceTime, trayMaterial, traySpacing).
 storage keys: sizing/StorageTankSize.H:30-70, .cpp:108-146.  ratedMachine volumeRate: sizing/RatedMachineSize.cpp:110-260.
 costing: CostingPass.cpp:133 (quotes), :246 (INCOMPLETE), :320; costing/Turton.cpp; DeclaredQuote.H; Guthrie refused: DEV.md 4c C38 item 2.
 economics ladder and keys: EconomicsPass.H:28-120, EconomicsPass.cpp key reads (workingCapital, streamFactor, siteFactor, contingencyFee, N_np, estimateClass, accuracyBand, refuseOnMissingPrice, land, financing, sensitivity, capitalSchedule, rampUp, startupCostFraction, langFactor measured by the dict audit message).
 missing price and quiet exit: measured (EconomicsPass message, exit 0).
-->
