# Pack: a batch plant (tablets): batch plan, machines, clean utilities, quotes, crew

budget: 5400 words (~8640 tokens)

Read this pack when the plant runs in LOTS (tablets, capsules, fine
chemicals): how many lots a year, which step paces the plant, whether a
machine of a given rating takes the lot, the air and purified water of the
building, the money.  Binary: `choupoSolve`.  A batch plant adds
`system/postDict` (and `system/layoutDict` for the building) to the §3 case.
Read `layout` for the building grammar and `design-cost` for costing and
economics in general.

## 1. The idea: a steady balance per kg of product, plus a plan on top

* `flowsheetDict` is the MATERIAL BALANCE PER UNIT OF PRODUCT at a basis
  rate you choose (kg/h).  The rate is a basis, not a capacity.  Solids
  (powders, granules, tablets) are `mixer` / `splitter` units: they move
  mass, they model NO machine.  Nothing in the balance knows a lot.
* `batchPlan` (postDict) turns that balance into lots: lot size B, lots a
  year N = ceil(Q/B), the cycle of every stage, the limiting cycle T_L, the
  campaigns, the busy hours of every unit, a Gantt.  It never re-runs the
  flowsheet.
* `sizing` (postDict) sizes the vessels FROM the plan (`volume
  fromBatchPlan;`) and checks every machine against its vendor rating
  (`ratedMachine`).
* `costing { quotes }` prices machines Choupo has no correlation for: YOUR
  quote, with its source.  `economics` prices the year's production
  (`streamFactor fromBatchPlan;`).
* `cleanUtilities` sizes the HVAC and the purified water from the building
  (`layoutDict building {}`) and the plan.  The supply air of each grade is
  PRICED by a `costing { quotes }` entry of the form `hvacGrade <G>;
  valuePerSupplyAir <EUR per m3/h>;` -- with none, the grade REFUSES by
  name and the capital total reads INCOMPLETE.
* postDict blocks run IN FILE ORDER.  Write: batchPlan, sizing,
  cleanUtilities, costing, economics (cleanUtilities BEFORE costing, so its
  supply air can be priced).  The layout is checked automatically before
  `economics` / `cleanUtilities`.
* A pass that refuses prints `ERROR:` and exits 2 (batchPlan, a quote on a
  refused unit).  A SIZER that refuses is printed as `FAILED` in the Sizing
  table and the run still exits 0 (the item is refused, never the run; the
  totals read INCOMPLETE): read that table.  A missing REQUIRED economics
  price (`labourRate`, a product price, a boundary inlet with no
  `rawMaterials` entry -- priced, or free with `price 0;` and a
  `provenance`) prints `REQUIRED PRICE MISSING` and the run FAILS, exit 2,
  with no appraisal.  Grep the log for `FAILED` and `INCOMPLETE` before
  trusting a number.

## 2. `batchPlan`

```
batchPlan
{
    product   <stream>;                    // a flowsheet stream (the one that is sold)
    production { perYear 20000 kg; source "..."; reason "..."; }   // Q, with unit
    lot { rule declared; stream <s>; mass 50 kg; source "..."; reason "..."; }
    lowUtilisation 0.25;                   // optional; default 0.25, announced
    trains ( { train <t>; availableTime 3840 h; lotsPerCampaign 8;
               changeover 24 h; source "..."; reason "..."; } );
    stages ( { stage <s>; train <t>; type batch|semicontinuous; units ( <u> ... );
               holds <stream>; ... source "..."; reason "..."; } ... );
    cleaning ( { unit <u>; waterPerLotClean 0.4 m3; waterPerChangeover 1.2 m3;   // optional
                 effluentFraction 0.95; source "..."; reason "..."; } ... );
}
```
* Every time, mass and density carries its unit; a bare number is refused.
  Every block carries `source` and `reason` (what the number is, why).
* `lot`: `rule declared` (`stream` + `mass`: the lot IS that mass of that
  stream) or `rule largestEquipment` (every batch stage then needs
  `maxVolume`; the smallest stage sets the lot).  `maxVolume` under `declared`
  is refused.
* Stages are listed in RECIPE order; a stage feeds the next unless you write
  `feeds <stage>|none;`.  A stage feeding an earlier one is refused.
* `holds` = the stream whose mass the stage handles per lot (read from the
  balance; it must carry mass).  `units` = flowsheet units that realise it;
  a unit may be in ONE stage; a rated machine's unit must be listed.
* `type batch`: `bulkDensity <kg/m3>; fillFraction <0..1];` (required),
  `chargeTime`, `processTime`, `dischargeTime`, `cleanTime` (hours).
  Vessel size V = (kg per lot) / (bulkDensity x fillFraction).
  `dischargeTime throughFedStage;` = the vessel empties through the stage it
  feeds (held for that stage's processing time).
* `type semicontinuous` (press, mill, packaging line): `chargeTime`,
  `operatingTime <h>` (or `fromFlowsheet` for a unit that fixes its own rate),
  `dischargeTime`, `cleanTime`; no density.
* Parallel units: `inPhase n;` (a bigger lot) / `outOfPhase n;` (shorter
  limiting cycle).  Several products: `products ( ... )` + `campaignOrder (
  ... )` + a `productChangeover` per stage (`cleaning`, `ratedMachine` and
  `cleanUtilities` then run per product and say so; see their sections).
* A sold unit: `dosageUnit { name tablet; mass 0.29023 g; source "..."; reason
  "..."; }` inside each product (or in the plan for one product) makes the
  result's `batchPlan.dosage` give mg of every ingredient per unit (the product
  stream's own composition x that mass), units per lot and per year, and the
  fluid (moisture) share by mass.  Every plan also publishes `batchPlan.bases`:
  the declared lot, the lot's product mass, r_P, H_eq, each train's year and
  available hours, and the hours every annual flow cost uses -- each with its
  definition (log: `BASES`).  The stage that sets T_L is the **limiting stage**;
  the machine nearest its rating is the **least capacity margin** -- two things.
* Cycle t_j = charge + process + discharge + clean.  T_L = max t_j/N_op.
  Occupancy = (N t_j/N_op + campaigns x changeover) / availableTime.
* REFUSED (exit 2, with the numbers and remedies): a stage busy more hours
  than its train's `availableTime`; a train whose campaigns do not fit.
  Message: `stage 'X' is busy ... h a year ... occupancy 316 %.  The plan
  cannot be run.  Remedies: an out-of-phase unit (...), a larger lot, or more
  available hours.`  ANNOUNCED: a stage busy < `lowUtilisation` of the cycle
  (oversized), an idle train.
* `cleaning` (optional, DEV.md 4c C210): one entry per WET-cleaned machine
  (`unit` must be in a stage; once each; dry-cleaned machines are left out).
  YOU declare the purified water of ONE clean of ONE instance -- after a lot
  (`waterPerLotClean`) and at a campaign changeover (`waterPerChangeover`),
  both volumes WITH a unit (0 m3 allowed) -- and `effluentFraction` (0..1) of
  it that leaves as effluent.  THE PLAN counts the cleans: a clean after
  every lot of each of the N_ip instances the lot is split over, and of every
  installed instance (N_ip x N_op) at each changeover, so cleans a year =
  N x N_ip + campaigns x N_ip x N_op.  A positive `waterPerLotClean` needs the
  stage's `cleanTime` > 0 and a positive `waterPerChangeover` the train's
  `changeover` > 0 (refused otherwise).  With `products ( ... )` the cleans are
  counted per product (its lots, its campaign changeovers, one product
  changeover) and published also as `<unit>_<product>_*_year` and
  `product_<p>_*_year` (no per-campaign keys).  Published (a table in the log and `kpis.cleaning`):
  per machine `<unit>_cleans_year`, `<unit>_water_m3_year`,
  `<unit>_effluent_m3_year`; per train, for a FULL campaign,
  `train_<t>_cleans_campaign`, `train_<t>_water_m3_campaign`,
  `train_<t>_effluent_m3_campaign`; totals `cleans_year`, `water_m3_year`,
  `effluent_m3_year`.  The effluent is a VOLUME (its load is not computed,
  announced).  `cleanUtilities { purifiedWater }` reads these cleans (section
  5): do NOT also declare them as a `uses` lump.  Absent: the water of
  cleaning is not counted by the plan, announced once.
* Published: `reports/batchPlan/gantt.csv`, the table in the log, the
  result JSON `batchPlan`.

## 3. `ratedMachine` (in `sizing { units ( ... ) }`)

```
{ unitName press; type ratedMachine; material SS316;
  designRules
  {
      kind tabletPress;                       // batchVolume|massRate|tabletPress|packagingLine
      rating { <keys of the kind>; source "..."; reason "..."; }   // the VENDOR's number
      installed { count 2; source "..."; reason "..."; }           // optional: machines in parallel
      announceAbove 0.85;                      // optional, default 0.85
      shift { length 8 h; source "..."; reason "..."; }            // optional: lot spans shifts?
  } }
```
| kind | rating keys | capacity | load |
|---|---|---|---|
| `batchVolume` (blender, granulator, pan) | `nominalVolume` m3, `maxFill` | N x V x maxFill | lot working volume = mass per lot / plan bulkDensity |
| `massRate` (mill, roller compactor) | `capacity` kg/h | N x capacity | mass per lot / the stage's operatingTime |
| `tabletPress` | `stations`, `turretSpeed` rpm (plain number), `compressionsPerRevolution`, `itemMass` (e.g. `0.28 g`) | N x stations x rpm x 60 x compressions tablets/h | tablets/h = lot mass / itemMass / operatingTime |
| `packagingLine` | `packsPerMinute` (plain), `itemsPerPack`, `itemMass` | N x packs/min x 60 packs/h | packs/h from the mass |
* The stage's unit must be in the batch plan and the stage must be of the right
  type (`batchVolume` needs a batch stage, the others a semicontinuous one).
* Utilisation = load / capacity, printed in the Sizing table and the design
  sheet.  ABOVE 1 it REFUSES (shown as `FAILED`): `the machine does NOT fit
  the lot -- utilisation 1.02881 ... 2 machine(s) of this rating would carry
  it: declare installed { count 2; ...}` (a second machine is a decision you
  state), or a bigger machine, or a longer stage.  Above `announceAbove`: an
  announcement.  `installed.count` differing from the plan's units: announced.
* Several products: the fit is checked for EACH product (its lot, its stage
  override); the refusal names the product; `utilisation` is the binding
  product's and `utilisation_<p>` carries each.  A strength with its own tablet
  weight: `rating { itemMass 0.28 g; itemMassByProduct { strength5 0.14 g; } }`.
* `ratedMachine` is NOT costed (no correlation) and NOT placed on the plot
  plan; the money is a `quote`, the place is a room.  A `quote` on a unit
  whose sizer refused STOPS the run (`That refusal is the finding`).
* Pumps: `kind volumeRate` (no batch plan): see `design-cost`.
* Hand estimate before you run: load = lot mass / itemMass / hours; capacity
  = stations x rpm x 60.  A 55-station press at 60 rpm makes 198 000 tablets/h.

## 4. `costing { quotes }`, `economics` for a batch plant

* `costing { method Turton; year 2026; cepci 820; cepci2001 397; usdToEur
  0.92; quotes ( { unit <u>|item <tag>; value 400000; currency EUR; year
  2026; basis installed|purchased; kind equipment|facility; source "...";
  reason "..."; } ... ); }`.  `basis purchased` needs the case's own
  `bareModuleFactor`.  `kind facility` (a building) is not multiplied by
  `siteFactor`.  Optional `scaling { referenceSize 1 m3; exponent 0.6;
  exponentSource "..."; }`.  Quote one price per machine; a vessel sized by
  the plan (`type vessel`) is costed by Turton, no quote.
* `economics { ... streamFactor fromBatchPlan; ... }`: the year's flows are
  Q, not hours x rate.  A numeric `streamFactor` beside a batch plan is
  REFUSED.  Prices of streams: `constant/economics` (`products`,
  `rawMaterials`, `labourRate`).  `refuseOnMissingPrice 1`.  A raw-material inlet
  with no price is silently left out of C_RM: price every inlet, compare C_RM.
* Crew: `operatingCrew { areas ( { area "x"; operatorsPerShift n; } ... );
  source; reason; }` replaces the correlation; `particulateSteps { count n;
  source; reason; }` feeds Turton's N_OL = sqrt(6.29 + 31.7 P^2 + 0.23 N_np)
  (printed as a comparison once a crew is declared; `N_np` = non-particulate
  steps).  Absent both, P = 0 is announced.
  The crew is multiplied by 4.5 (round the clock); on two shifts declare
  `operatorCover { positionsPerShift n; source; reason; }`.
* Solid-dose units are placeholders: say so in DESIGN.md (no compaction
  force, no blend uniformity, no granule size).

## 5. `cleanUtilities` (needs `building {}` in `layoutDict`)

```
cleanUtilities
{
    hvac
    {
        air { density 1.2 kg/m3; heatCapacity 1006 J/kg/K; source; reason; }
        changesPerHour ( { grade D; perHour 20; source; reason; } { grade CNC; perHour 6; source; reason; } );
        fan { pressureRise 1000 Pa; efficiency 0.6; source; reason; }
        outdoor { winter 2 degC; summer 32 degC; source; reason; }
        supply { temperature 20 degC; freshAirFraction 0.2; source; reason; }
        unserved { rooms ( plantRoom ); source; reason; }       // optional
    }
    purifiedWater
    {
        fluid { density 998 kg/m3; source; reason; }
        uses ( { name n; stream <flowsheetWaterStream> | volumePerLot 0.5 m3;    // exactly ONE of the two
                 stage <planStage>; drawTime 0.5 h; when start|end; source; reason; } );
        generator { margin 0.25; source; reason; }
        storage { holdTime 4 h; source; reason; }
    }
}
```
* HVAC per room: V = plan area x floor height; supply = ACH(grade) x V; fan
  power = flow x dP / eta; sensible duty to bring `freshAirFraction` from the
  outdoor design T to the supply T (heating in winter, cooling in summer).
  EVERY grade present (A B C D CNC) needs a declared rate or the run REFUSES
  by name.  Rates are YOURS: no standard table is shipped; choose them from
  your contamination argument and cite it.  NOT in it (announced): humidity,
  latent load, room heat gain, filter pressure drop beyond `fan`.
* Purified water: demand per lot from the declared streams (kg per lot from
  the balance / density) + `volumePerLot`; each use is drawn over `drawTime`
  at the start or end of its stage; the PEAK is the largest overlap in the
  plan's Gantt (first campaign, trains started together); generator =
  peak x (1+margin); storage = peak x holdTime.  With `batchPlan { cleaning }`
  declared, the plan's cleans join the SAME ledger with no `uses` entry: the
  lot demand includes the lot cleans (drawn over the stage's `cleanTime`,
  ending with its bar), the year (`V_year`) adds the changeover cleans (drawn
  over the train's changeover bar), and the generator also publishes
  `V_cleaning_lot` and `V_cleaning_changeover_year`.  Published under `design/hvac`
  and `design/purifiedWater`.  Not costed, not placed.
* HVAC COST (DEV.md 4c C210).  The grade items are PRICED, not correlated:
  declare in `costing { quotes ( ... ) }` one entry per grade that is SERVED
  (a grade whose rooms are all `unserved` has no item, and a quote for it is
  refused: `no supply air was sized for that grade`):
  `{ hvacGrade D;  valuePerSupplyAir 12;  currency EUR;  year 2026;
  basis installed;  kind facility;  source "..."; reason "..."; }` -- the item's
  price is `valuePerSupplyAir` (currency per m3/h) x the supply air the pass
  sized for that grade; `value` beside it is refused; every other key is a
  quote's (year/cepci, installed|purchased + bareModuleFactor, kind
  equipment|facility, source, reason).  Without the quote the grade prints
  `FAILED: no cost is declared for the supply air of this grade` and the
  capital total reads INCOMPLETE; nothing is defaulted.  The `hvac/total`
  item is the sum and is not priced twice.  Published: `kpis.hvac`
  (`C_BM_grade<G>`, `Q_supply_grade<G>`, `C_BM_total`, `C_TM_total`,
  `Q_supply_total`).  Do NOT also leave the HVAC inside your building quote.
* Declare at least `hvac` or `purifiedWater`.  The batch plan must exist and
  be single-product.
* A `layoutDict` (hence the building, hence `cleanUtilities`) needs at least
  ONE SIZED item in the run, or the run stops: `ERROR: layoutDict: the case
  declares a layout, and a layout places SIZED items -- this run sized
  nothing`.  Size at least one vessel (the example's binder tank, `type vessel;
  designRules { volume fromBatchPlan; ... }`) and place it, or list it in a
  room's `equipment`.  `items ( )` empty is not enough.

## 6. Minimal example (RUN; copy, then change)

`bin/choupo-init0` estimates a stream that carries ONLY solids too (powders
blended and pressed with no liquid): the solid molar flows of the producing
unit's inlets are summed (split equally over its outlets) and T is their
flow-weighted mean.  Where a unit's inlets carry no material at all it writes
nothing and REFUSES by name (`NO ESTIMATE  0/<stream>`): write that file
yourself, in the authored form shown for `0/lactoseFeed` below (molar flows
twice: overall and inside `phases { solid {} }`; T; P).  The estimate is a
seed the solver overwrites; a press with rejects or a splitter still needs
its split fixed by the solve, not by init0.

A four-unit tablet line: binder tank, blender, press (1 % rejects), blister
line, with a 3-room suite.  Solids are declared in `phases { solid { ... } }`
in MOLAR flows (mass flows there fail the phase check).  `bin/choupo-init0`
writes the intermediate streams.  Component records are case-local:
`role nonvolatile;` with MW, `solid { rho_p }`, `standardThermochemistry`,
`solidHeatCapacity` (the others in `data/standards/components/` are the
catalogue's; excipients are not in it).

`system/controlDict`
```
application  choupoSolve;
description  "Minimal tablet line: dispense, blend, press (1 % rejects), pack, with a batch plan";
verbosity    2;
reports { streamTable {} massBalance {} energyBalance {} }
```
`constant/thermoPhysPropDict`
```
recordType    thermophysicalPropertySystem;
schemaVersion 2;
components ( water lactoseMonohydrate magnesiumStearate );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
```
`constant/components/lactoseMonohydrate.dat`
```
name        lactoseMonohydrate;
formula     C12H24O12;
role        nonvolatile;
MW          360.31;
solid { rho_p 1540.0; }
volatility { class nonvolatile; provenance { citation "assumed: a powder, vapour pressure taken as nil"; status assumed; } }
standardThermochemistry { dHf_298 -2000000.0; s_298 400.0; referenceState pureSolid; }
solidHeatCapacity { model polynomial; coefficients ( 400.0 ); Trange ( 250 420 ); }
reviewStatus interim;
```
(`magnesiumStearate.dat`: same shape, MW 591.257, rho_p 1050, dHf_298 -1000000,
cp 1005.14.  `SS316` is in the catalogue (no local asset file needed).)

`system/flowsheetDict`
```
units
(
    {   name binderPrep;  type mixer;
        inputs ( granWater lactoseBinder );  outputs ( binderSolution );
        operation { T 298.15 K; } }
    {   name blender;  type mixer;
        inputs ( lactoseFeed mgstFeed binderSolution );  outputs ( finalBlend );
        operation { T 298.15 K; } }
    {   name tabletPress;  type splitter;
        in finalBlend;  outputs ( tabletCores tabletRejects );
        operation { fractions ( 0.99 0.01 ); } }
    {   name packagingLine;  type splitter;
        in tabletCores;  outputs ( packagedTablets );
        operation { fractions ( 1.0 ); } }
);
```
`0/lactoseFeed`
```
componentMolarFlows { lactoseMonohydrate 0.249785 kmol/h; }
T 298.15 K;  P 1.01325 bar;
phases { solid { componentMolarFlows { lactoseMonohydrate 0.249785 kmol/h; } } }
```
The other inlets, same form: `0/lactoseBinder` (1 kg/h of lactose, solid),
`0/mgstFeed` (1 kg/h of magnesium stearate = 0.0016913 kmol/h, solid), and
`0/granWater`: `componentMassFlows { water 10 kg/h; }  T 298.15 K;  P 1.01325
bar;  phase liquid;`.
`constant/economics`
```
products
(
    { stream packagedTablets;  price 400;  costYear 2026;
      provenance { origin "assumed"; method "0.20 EUR per 0.5 g tablet, a placeholder, not a market price"; } }
);
rawMaterials
(
    { stream lactoseFeed;    price 3;    costYear 2026; provenance { origin "assumed"; method "round figure"; } }
    { stream lactoseBinder;  price 3;    costYear 2026; provenance { origin "assumed"; method "round figure"; } }
    { stream mgstFeed;       price 8;    costYear 2026; provenance { origin "assumed"; method "round figure"; } }
    { stream granWater;      price 0.02; costYear 2026; provenance { origin "assumed"; method "round figure"; } }
);
labourRate      42.0;       // EUR/h loaded operating labour, assumed
labourRateYear  2026;
```
`system/postDict`
```
batchPlan
{
    product   packagedTablets;
    production { perYear 20000 kg;  source "assumed";  reason "a small line; the group's market study replaces it"; }
    lot { rule declared;  stream finalBlend;  mass 50 kg;  source "assumed";  reason "one blender load is the QC-released lot"; }
    trains
    (
        { train solidDose;  availableTime 3840 h;  lotsPerCampaign 8;  changeover 24 h;
          source "assumed";  reason "two day shifts; eight lots between full cleans"; }
    );
    cleaning
    (
        { unit binderPrep;  waterPerLotClean 0.1 m3;  waterPerChangeover 0.3 m3;  effluentFraction 0.95;
          source "assumed";  reason "a rinse of the binder tank after each lot"; }
        { unit blender;     waterPerLotClean 0.4 m3;  waterPerChangeover 1.0 m3;  effluentFraction 0.95;
          source "assumed";  reason "the wash of the bin blender after a lot; a full clean at a changeover"; }
    );
    stages
    (
        { stage binderPreparation;  train solidDose;  type batch;
          units ( binderPrep );  holds binderSolution;
          bulkDensity 1020 kg/m3;  fillFraction 0.8;
          chargeTime 0.5 h;  processTime 1 h;  cleanTime 1 h;  dischargeTime throughFedStage;
          source "assumed";  reason "one tank of binder per lot, held until the blender has taken it"; }
        { stage blending;  train solidDose;  type batch;
          units ( blender );  holds finalBlend;
          bulkDensity 500 kg/m3;  fillFraction 0.6;
          chargeTime 0.5 h;  processTime 0.5 h;  dischargeTime 0.25 h;  cleanTime 1 h;
          source "assumed";  reason "bin blender, lubricant blended in last"; }
        { stage compression;  train solidDose;  type semicontinuous;
          units ( tabletPress );  holds finalBlend;
          chargeTime 0.5 h;  operatingTime 1.5 h;  dischargeTime 0 h;  cleanTime 1 h;
          source "assumed";  reason "rotary press set up for the lot, then run"; }
        { stage packaging;  train solidDose;  type semicontinuous;
          units ( packagingLine );  holds packagedTablets;
          chargeTime 0.5 h;  operatingTime 2 h;  dischargeTime 0 h;  cleanTime 0.5 h;
          source "assumed";  reason "blister line"; }
    );
}
sizing
{
    units
    (
        { unitName binderPrep;  type vessel;  material SS316;
          designRules { volume fromBatchPlan;  L_over_D 1.5;  pressureDesign 2;
                        corrosionAllow 0.0015;  jointEfficiency 1.0; } }
        { unitName blender;  type ratedMachine;  material SS316;
          designRules
          {
              kind batchVolume;
              rating { nominalVolume 0.2 m3;  maxFill 0.6;
                       source "assumed, not a vendor data sheet";  reason "a 200 L bin blender"; }
          } }
        { unitName tabletPress;  type ratedMachine;  material SS316;
          designRules
          {
              kind tabletPress;
              rating { stations 27;  turretSpeed 50;  compressionsPerRevolution 1;  itemMass 0.5 g;
                       source "assumed, not a vendor data sheet";  reason "a small rotary press"; }
              shift { length 8 h;  source "the plan's two day shifts";  reason "a lot spanning shifts is a staffing question"; }
          } }
        { unitName packagingLine;  type ratedMachine;  material SS316;
          designRules
          {
              kind packagingLine;
              rating { packsPerMinute 40;  itemsPerPack 28;  itemMass 0.5 g;
                       source "assumed, not a vendor data sheet";  reason "a blister line"; }
          } }
    );
}
cleanUtilities
{
    hvac
    {
        air { density 1.2 kg/m3;  heatCapacity 1006 J/kg/K;  source "assumed";  reason "dry air near 20 degC"; }
        changesPerHour
        (
            { grade D;   perHour 20;  source "assumed";  reason "an order of magnitude for a graded oral-solid-dose room"; }
            { grade CNC; perHour 6;   source "assumed";  reason "an order of magnitude for a controlled-not-classified room"; }
        );
        fan { pressureRise 1000 Pa;  efficiency 0.6;  source "assumed";  reason "a medium centrifugal fan and its filters, lumped"; }
        outdoor { winter 2 degC;  summer 32 degC;  source "assumed";  reason "a temperate site"; }
        supply { temperature 20 degC;  freshAirFraction 0.2;  source "assumed";  reason "a recirculating air-handling unit"; }
        unserved { rooms ( plantRoom );  source "layoutDict";  reason "plant rooms are not conditioned by the plant they house"; }
    }
    purifiedWater
    {
        fluid { density 998 kg/m3;  source "assumed";  reason "water near 20 degC"; }
        uses
        (
            { name binderWater;  stream granWater;  stage binderPreparation;  drawTime 0.5 h;  when start;
              source "flowsheet stream granWater, read from the balance";  reason "the granulating liquid"; }
        );
        generator { margin 0.25;  source "assumed";  reason "a quarter above the peak draw"; }
        storage { holdTime 4 h;  source "assumed";  reason "four hours of peak draw without the generator"; }
    }
}
costing
{
    method    Turton;
    year      2026;
    cepci     820;
    cepci2001 397;
    usdToEur  0.92;
    quotes
    (
        { hvacGrade D;  valuePerSupplyAir 12;  currency EUR;  year 2026;  basis installed;  kind facility;
          source "assumed, author-set, to be replaced by a quote";  reason "air-handling, ducting, terminal filters and controls per m3/h of supply air of a graded room"; }
        { unit blender;  value 80000;  currency EUR;  year 2026;  basis installed;  kind equipment;
          source "author-set placeholder, not a quotation";  reason "a bin blender, installed"; }
        { unit tabletPress;  value 400000;  currency EUR;  year 2026;  basis installed;  kind equipment;
          source "author-set placeholder, not a quotation";  reason "a small rotary press"; }
        { unit packagingLine;  value 600000;  currency EUR;  year 2026;  basis installed;  kind equipment;
          source "author-set placeholder, not a quotation";  reason "a blister line"; }
    );
}
economics
{
    method              discountedCashFlow;
    projectLife         10;
    constructionPeriod  1;
    discountRate        0.10;
    taxRate             0.21;
    // taxOnLoss credit;   -- the default: a loss year's tax is a CREDIT (a group's
    //                        reading, announced when it bites); `none` = stand-alone
    depreciation        straightLine;
    depreciableLife     7;
    salvageFraction     0.0;
    streamFactor        fromBatchPlan;
    siteFactor          0.50;
    contingencyFee      1.18;
    N_np                2;
    particulateSteps { count 3;  source "assumed";  reason "blending, tableting, packaging"; }
    operatingCrew
    {
        areas ( { area "blending"; operatorsPerShift 1; } { area "compression"; operatorsPerShift 1; } { area "packaging"; operatorsPerShift 2; } );
        source "assumed";  reason "one line, two shifts";
    }
    estimateClass       5;
    accuracyBand        ( -50 100 );
    refuseOnMissingPrice 1;
    workingCapital { rawMaterialStock 60 day;  receivables 60 day;  payables 30 day;  minimumCash 15 day; }
}
```
`system/layoutDict`
```
items
(
    {   item "binderPrep";  x 4 m;  y 9 m;  orientation vertical; }          // stands in a room: z comes from its floor
    {   nonProcess "productionBuilding";  kind productionBuilding;
        x 10 m;  y 6 m;  z 0 m;  orientation alongX;
        footprint { length 20 m;  width 12 m;  height 5 m; }
        source "assumed, not a building design";  reason "the GMP building as the site sees it";
        ignition "presses, motors and people: treated as an ignition source"; }
);
building
{
    name "tablet suite";
    source "assumed, not a building design";  reason "dispense/blend, press, pack, one corridor";
    envelope productionBuilding;
    cascade { minimumStep 10 Pa;  source "assumed";  reason "a design step between grades"; }
    floors ( { floor ground;  elevation 0 m;  height 4 m; } );
    rooms
    (
        { room corridor;      floor ground; xMin 0 m;  xMax 20 m; yMin 5 m; yMax 7 m;   grade D; pressure 35 Pa; relativeTo outside; }
        { room blendingRoom;  floor ground; xMin 0 m;  xMax 8 m;  yMin 7 m; yMax 12 m;  grade D; pressure 25 Pa; relativeTo outside;
          equipment ( binderPrep ); }
        { room pressRoom;     floor ground; xMin 8 m;  xMax 14 m; yMin 7 m; yMax 12 m;  grade D; pressure 25 Pa; relativeTo outside; }
        { room packRoom;      floor ground; xMin 14 m; xMax 20 m; yMin 7 m; yMax 12 m;  grade D; pressure 25 Pa; relativeTo outside; }
        { room plantRoom;     floor ground; xMin 0 m;  xMax 20 m; yMin 0 m; yMax 5 m;   grade CNC; pressure 5 Pa; relativeTo outside; }
    );
    connections
    (
        { between ( corridor outside );       type door; }
        { between ( corridor blendingRoom );  type door; }
        { between ( corridor pressRoom );     type door; }
        { between ( corridor packRoom );      type door; }
        { between ( plantRoom outside );      type door; }
        { between ( plantRoom corridor );     type door; }
    );
}
```

Run: `bin/choupo-init0 <case>; choupoSolve <case>`.  Result as run: exit 0;
mass closure 100.000 %; lot B = 49.5 kg of product, N = 405 lots a year, 51
campaigns, T_L = 3 h set by `binderPreparation`, train occupancy 69.5 %;
binder tank 0.0066 m3; utilisation blender 0.833, press 0.823 (66 667
tablets/h on 81 000), blister line 0.737; HVAC 4 rooms 560 m3, 11 200 m3/h,
fan 5.19 kW, heating 13.5 kW, cooling 9.0 kW; cleaning 912 cleans a year (456 per
wet-cleaned machine: 405 lots + 51 campaigns), 268.8 m3 of purified water and
255.4 m3 of effluent a year; purified water 0.505 m3 a lot, peak 0.5 m3/h,
generator 0.625 m3/h, tank 2.0 m3; HVAC capital 134 400 EUR (11 200 m3/h of
grade D at the quoted 12 EUR per m3/h); FCI 2.00 M EUR, NPV 14.5 M EUR.
Variants run: 100 000 kg/yr -> `ERROR: batchPlan: stage 'binderPreparation' is
busy 1.214e+04 h ... occupancy 316 %`, exit 2; blender `nominalVolume 0.1 m3`
-> `FAILED ... utilisation 1.66667 ... 2 machine(s)` then the quote on it stops
the run with exit 2; `constant/economics` without `labourRate` ->
`REQUIRED PRICE MISSING -- labourRate`, exit 2, no appraisal.

## 7. What a student should still decide (write it in DESIGN.md)

* Lot size, campaign length, changeover and clean times (they dominate the
  busy hours); ratings from a vendor data sheet; the shift pattern.
* ACH per grade from your own risk argument (an OSD plant borrows A/B/C/D
  from EU GMP Annex 1, written for sterile products: say so).
* Left out: granulation, blending, compression and coating physics (no force,
  uniformity or granule size), dust zones, containment, the water plant's cost.

## 8. Adapting a shipped tablet case to another drug: the traps, measured

Measured on 2026-11-08 by turning a copy of
`tutorials/batch/plant/donepezil01_tablets` into a 500 mg tablet with a 600 kg
lot (the full route is `docs/pif-student-path.md`).  In the order they bite:

* **Renaming or removing a component leaves STALE ESTIMATES in `0/`.**  The
  internal streams' files (`0/finalBlend`, `0/wetMass`, `0/tabletCores`, ...
  their header says "An ESTIMATE, not an input") still carry the old name and
  the run refuses: `ERROR: stream state 'finalBlend': component 'X' is not in
  the package ... delete it and run bin/choupo-init0 <case>`.  Delete every
  estimate file (or run `bin/choupo-init0 <case> --force`, which regenerates
  them) and run init0 before the solve.  Do this after EVERY change of a feed
  file too: the estimates are seeds, the solve overwrites them, but a stale
  seed naming a component that no longer exists is refused before the solve.
* **`runCase` refuses a second run while `log.<app>` exists** (exit 1, the
  old log kept): `runCase -f <case>`.
* **The feed files do not follow the formula.**  A dose, a coat or a basis
  rate changed means every `0/<feed>` rewritten: kmol/h = mg per item x 1e-6
  x items per hour / MW, written twice for a solid (overall and in `phases {
  solid {} }`); water inlets as `componentMassFlows { water ... kg/h; }
  phase liquid;`; the drying air as N2 / O2 / water in kmol/h.  Write a
  script; `0/` files are flat text.
* **A price is per kg of a RESULT stream.**  `price` in `constant/economics`
  is EUR/kg of `packagedTablets`, whose kg/h moves with the formula, the
  coat and the reject split; nothing recomputes it.  After every change:
  price per kg = price per item x accepted items per hour / kg per hour of
  the product stream (read from the stream table), and say so in the
  `provenance`.
* **A bigger lot refuses the machines, with the remedy**: `ratedMachine
  '<unit>': the machine does NOT fit the lot -- utilisation 1.86886 ... 2
  machine(s) of this rating would carry it: declare installed { count 2; ... }
  or a larger machine, or a longer stage`; a quote on a refused unit stops
  the run (exit 2).  Raise the rating (a vendor's data sheet) or declare the
  second machine.
* **More water to dry is ANNOUNCED, not refused.**  Doubling the binder water
  on the base case's 250 kmol/h of air gave `[SolidDryer] WARNING: the hot
  air cannot pay for drying ... X_final = 2.832 kg/kg (73.90 wt% wet) ...
  [heat-bound]` and an NPV at exit 0.  Read the dryer blocks; scale the air
  (`0/fbdAirIn`, `0/coatingAirIn`) or the inlet temperature until the verdict
  is `[isotherm-reached]`.  The batch plan's drying time is DECLARED and does
  not move with it.
* **The deliverables the base cases do not declare**: `breakEven {}`,
  `workingCapitalMethods { ... }` and (donepezil01) `sensitivity { ... }` --
  add them to `economics` (pack `design-cost`, section 4).  Until 2026-11-08
  `breakEven {}` beside an itemised `workingCapital { ... }` stopped the run
  at the s = 0 search point; fixed.
* **A route change is a list of deletions in five files.**  Direct
  compression from the wet-granulation case: the units in `flowsheetDict`
  (and the final blender's `inputs` re-wired to the powders), their `0/`
  files, their stages / cleaning entries / sizing entries / quotes / water
  `uses` in `postDict`, their `items` and room `equipment` listings in
  `layoutDict`, their inlet prices in `constant/economics`; then init0.  It
  ran at the first attempt; the rooms of the removed train stay in the
  building (and in the HVAC) until you remove them.
* **No unit models a capsule filler, a filling line, a lyophiliser or a
  sterilising filter**: a group with such a product declares `splitter`
  placeholders rated as `massRate` machines, quotes them, and says in its
  report that nothing of the machine is modelled.

<!-- RUN: scratch case tabletMini (this example, verbatim); CHOUPO_HOME=/home/vitor/Choupo bin/choupo-init0 . ; choupoSolve .  -> exit 0, converged. -->
<!-- SOURCES (src/postProcessing unless noted)
 batchPlan: header grammar and method BatchPlanPass.H:36-150 (declaration), BatchPlanPass.cpp: product :950-956, production :966-985, lowUtilisation :995,
  trains :1012-1043 (availableTime :1029, lotsPerCampaign :1032), lot rule declared|largestEquipment :240-265 and :1052, stages :1210-1440 (type :1237, units :1245-1263, holds :1270, bulkDensity/fillFraction :1290-1297, maxVolume :1303, batch vs semicontinuous keys :1314-1360, throughFedStage :1384-1434), refusals :1739-1775.
  every time/mass/density needs a unit: :98-131; source+reason required: :85.
 ratedMachine: sizing/RatedMachineSize.H:31-110 and .cpp: kind list :294-302, rating block :305-310 (source/reason :81), installed :316, batchVolume keys :368-370, massRate :404, tabletPress :416-427, packagingLine :446-448, refusal :481, announceAbove :500, shift :512.
 hvacGrade quote: costing/DeclaredQuote.cpp (identity block, `hvacGrade`/`valuePerSupplyAir`), CostingPass.cpp (airHandling refusal, HVAC KPIs).
 cleanUtilities: CleanUtilitiesPass.H:31-70 and .cpp: hvac :120-170 (grades A B C D CNC :148), unserved :170-180, purifiedWater :300-366 (uses :319-366), run :460-464.
 postDict order and layout-before-economics: src/applications/choupoSolve/main.cpp:1498-1514.
 quotes: CostingPass.cpp:133; economics keys: EconomicsPass.H:28-120, fromBatchPlan DEV.md 4c C99.
 Sizer failure printed, exit 0: measured (plotMini flashDrum). Missing price exit 0: measured.
-->
