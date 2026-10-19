# `apalutamide01_tablets` — apalutamide 60 mg film-coated tablets: a drug-product plant

A BASE CASE for a pharmaceutical-industry project group (DEV.md 4c C97,
phase A).  The plant makes **film-coated tablets of apalutamide**: the
active pharmaceutical ingredient (API) is **bought**, everything else is made
on site — the spray-dried solid dispersion, the granules, the tablets, the
coat and the packs.
**It runs (a few seconds from a cold start), it converges, its mass and
energy balances close, and it is deliberately NOT optimised** — every number
a group would change is a plain key, said to be an assumption where it is
declared.

```bash
source etc/bashrc
runCase tutorials/plant/apalutamide01_tablets
```

The case is sealed: everything it reads is in its own `constant/`.

**Read section 3 before anything else.**  Half of this plant is physics
Choupo computes (the spray dryer, the nitrogen loop, the solvent recovery,
the coating dryer, the heat exchangers); the other half is a **mass balance
with no equipment model at all** (blending, compaction, milling, screening,
tableting, packaging).  The two halves look alike in the stream table.  They
are not alike.

## 1. What is known about the product, and from where

| Fact | Source | Verified? |
|---|---|---|
| The tablet core is an **amorphous solid dispersion (ASD)** of apalutamide in **HPMCAS** (hypromellose acetate succinate), made by **spray drying** | Australian Public Assessment Report for Apalutamide, TGA, 2019 — <https://www.tga.gov.au/sites/default/files/auspar-apalutamide-190325.pdf>; review: *Materials* 16 (2023) 6616, doi:10.3390/ma16206616 | read by the commander for this case |
| Core excipients: colloidal anhydrous silica, croscarmellose sodium, HPMCAS, magnesium stearate, microcrystalline cellulose, silicified microcrystalline cellulose | US prescribing information, as reproduced by RxList | read by the commander |
| Film coat: polyvinyl alcohol, polyethylene glycol, talc, titanium dioxide, iron oxides | US prescribing information (RxList) | read by the commander |
| Apalutamide is C21H15F4N5O2S, 477.43 g/mol | AusPAR (above); the molar mass recomputed here from the formula with standard atomic weights: 477.43 | yes |
| **The spray-drying SOLVENT** | — | **NOT verified.**  Acetone is an assumption of this case |
| **The drug : polymer ratio, the tablet weight, the amount of each excipient, the coat composition and weight gain** | — | **NOT verified.**  Every one is an assumption of this case |
| Every process condition (temperatures, flows, hold times, rejects) | — | **NOT verified.**  Assumptions |

**Where the group must look** for what this case could not verify: the
**EMA European Public Assessment Report** for the product (its assessment
report; the quality part follows the CTD, and the manufacture of the
finished product is module **3.2.P.3**), the TGA AusPAR above in full, and
the **patents** on the solid dispersion and its process.  Replace each
assumption with what you find, and cite it.

## 2. The production basis (all assumptions)

| Quantity | Value | Why |
|---|---|---|
| Production | **30 000 kg** of packaged tablets a year, about **50 million** of 60 mg | a mid-sized generic line; replace with your market study.  Declared ONCE, in the batch plan (`system/postDict`, `production`) |
| Flowsheet basis | **12 800 tablets/h pressed**, 12 672 accepted | the steady flowsheet is the material balance PER UNIT OF PRODUCT; this rate is a basis, not the plant's pace (section 2a) |
| Lot | **350 kg of final blend**, about 603 000 tablets | a commercial solid-dose lot; QC releases lot by lot (section 2a) |
| Core, per tablet | ASD 240 mg (60 API + 180 HPMCAS, **1:3**), MCC 150, silicified MCC 150, croscarmellose 30 (20 intra- + 10 extragranular), silica 5, Mg stearate 5 (2.5 + 2.5) = **580 mg** | a plausible dry-granulation formula, nobody's product |
| Coat | **3 % weight gain** (17.4 mg): PVA 40 %, PEG 20 %, TiO2 24.2 %, talc 14.8 %, iron oxide 1 % | of the order of a PVA-based coat |
| Spray solution | **10 wt %** solids in acetone | an ASD spray solution must stay sprayable (viscosity) |
| Coating suspension | **20 wt %** solids in water | |

The raw-material flows in `0/` are these per-tablet masses times the
flowsheet basis rate (each `0/` file says which).  **If you change the rate or the
formula, every `0/<feed>` file changes with it — they do not follow each
other.**

## 2a. The batch plan — how the plant actually runs (DEV.md 4c C99)

A real oral-solid-dose plant does not run at a steady rate.  Dispensing,
blending, compaction, compression, coating and packaging are done in
**lots** (here 350 kg of final blend), each released by quality control
before the next step uses it; the closed-loop spray dryer is started up,
inerted and run for days in **campaigns**.  So the steady flowsheet is kept
as what it is exactly right for — the **material balance per unit of
product** — and the `batchPlan {}` block of `system/postDict` designs the
batch plant on it (`src/postProcessing/BatchPlanPass.H` states the method;
`docs/ai/case-layout.md` the grammar):

- each **stage** groups the flowsheet units of one recipe step and names the
  stream it handles (`holds`); its mass per kg of product, `f`, is READ from
  the converged flowsheet, never typed;
- a **batch** stage (blender, coater, tanks) is sized by its **size factor**
  `S = f / (rho phi)` (bulk density and fill fraction declared): one vessel
  holds `V = S B`, `B` the lot in kg of product;
- a **semicontinuous** stage (compactor, press, packaging line, spray dryer)
  is sized by its **rate**, the lot's mass over its operating time; the spray
  dryer's operating time is its OWN rate (`operatingTime fromFlowsheet;`),
  because its hardware is modelled: 145 kg of dispersion per lot at
  3.07 kg/h is 47 h;
- each stage's **cycle** is charge + process + discharge + clean; a tank that
  empties through the stage it feeds is held for that stage's whole run
  (`dischargeTime throughFedStage;`);
- each **train** — stages between two intermediate stores — is paced by its
  slowest stage (the **limiting cycle time**, `T_L = max t / N_op`); two
  trains here, decoupled by the dispersion store: the spray dryer (round the
  clock, 7 lots per campaign, 48 h changeover) and the solid-dose suite (two
  shifts, 6 lots per campaign, 24 h changeover);
- the **lots a year** are `ceil(Q / B)`, each train's **required hours** are
  its campaigns (the first lot's pass through every stage, then one lot every
  `T_L`, then the changeover), and each stage's **occupancy** is its busy
  hours over its train's available hours.

The base case (every number an assumption, said so in its `source`):

| | sprayDrying train | solidDose train |
|---|---|---|
| Available hours | 7 920 h (330 days x 24 h) | 3 840 h (2 shifts, 5 days, 48 weeks) |
| Limiting stage, `T_L` | the solution tank, 53.1 h (it is held while it feeds the 47.1 h dryer) | the packaging line, 10 h |
| Campaigns, hours needed | 12 of 7 lots, 5 040 h (63.6 %) | 14 of 6 lots, 1 410 h (36.7 %) |

Lot `B` = 358.2 kg of product, **84 lots a year**.  Equipment per lot: the
solution tank 2.26 m3 and the coating-suspension tank 0.065 m3 (both SIZED
from the plan: `volume fromBatchPlan;`), the bin blender 1.27 m3, the final
blender 1.17 m3, the coater 0.71 m3, the compactor 80.6 kg/h, the press
87.5 kg/h (about 150 000 tablets an hour) and the packaging line 44.8 kg/h.
The run **announces** that the final blender is busy 22.5 % of the solid-dose
cycle — it never limits, and in practice blending and final blending share
one blender (with interchangeable bins): merging the two stages is your
call.

**What feeds on the plan.**  The two preparation tanks take their volume from
it; the solid-dose machines' quotes **scale** with their stage's size (each
`value` is the price of one machine of a declared `referenceSize`, scaled by
the six-tenths rule — a convention, with its exponent declared); and the
economics takes the year's flows from it (`streamFactor fromBatchPlan;`: the
annual flows are the hourly flows x `Q / r_P` = 3 948 "equivalent hours" —
which is also exactly the spray dryer's operating hours, the one step that
runs at the flowsheet's rate).  The production `Q` therefore has ONE home.

**What you must defend** (README section 9, question 3): every time, bulk
density and fill fraction of every stage, the lot size (a regulatory as well
as an equipment choice), the available hours of each train (how many shifts),
the campaign length and changeover, and which steps are grouped in a stage.
Try `outOfPhase 2;` on the solution tank (two tanks, one being prepared while
the other feeds the dryer — the sizing pass then refuses one sized vessel for
two, and tells you to price the pair by a scaling quote), or a larger lot,
and watch the limiting stages move.  **Not modelled:** the size of the
dispersion store between the trains, QC release times, and any second
product sharing the line.

## 3. The flowsheet — what is physics and what is a placeholder

```
SOLUTION AND SPRAY DRYING (closed nitrogen loop)
  acetoneFeed -> [acetoneTank 14 d] ------------+
  apiFeed (BOUGHT) -----------------------------+-> [solutionPrep 25 C] -> sprayFeed --> [SD]
  hpmcasFeed -----------------------------------+                                       |   |
  n2Makeup -> [n2Mix] -> [blower 1 kW] -> [gasHeater -> 120 C] -> dryingGas ----------> |   |
                 ^                                                            asdPowder  exhaustGas
                 |                                                                 |      |
                 |                                   [exhaustCooler -> 35 C, cooling water]
                 |                                   [solventCondenser -> -10 C, NH3 refrigeration]
                 |                                   [condensatePot] --> recoveredSolvent -> [recoveredTank 7 d] -> recoveredAcetone
                 +--- gasRecycle (TEAR) <-- [purgeSplit 5 %] --> purgeGas (vent)
DRY GRANULATION, TABLETING, COATING, PACKAGING
  asdPowder + MCC + SMCC + croscarmellose + silica + MgSt -> [blender 25 C] -> [rollerCompactor] -> [mill] -> [screen]
                                                                  ^------- finesRecycle 15 % (TEAR) ---------+
  granules + croscarmellose + MgSt -> [finalBlender] -> [tabletPress 1 % rejects] -> tabletCores
  water + PVA + PEG + talc + TiO2 + iron oxide -> [coatingSuspensionPrep 25 C] -> coatingSuspension
  tabletCores + coatingSuspension -> [coatingPan] -> [coatingDryer] <- coatingAir (60 C) <- [airHeater] <- coatingAirIn
  coatedTablets -> [packagingLine] -> packagedTablets
```

| Unit(s) | Choupo type | What Choupo COMPUTES |
|---|---|---|
| `SD` | `sprayDryer` | **physics**: atomisation (rotary), droplet and particle size, drying kinetics, residence time, and the adiabatic energy balance that fixes the exhaust temperature |
| `blower`, `gasHeater`, `exhaustCooler`, `solventCondenser`, `airHeater` | `compressor`, `phaseChanger` | **physics**: duties and the blower's work, on the package's enthalpy |
| `condensatePot` | `isothermalFlash` | **physics**: how much acetone stays in the nitrogen at -10 C (Raoult) — the recovery |
| `coatingDryer` | `solidDryer` | **physics**: the water the hot air takes off the coated tablets, the outlet temperature, and the moisture the tablets keep (a sorption isotherm) |
| `acetoneTank`, `recoveredTank` | `storageTank` | the holdup (inventory) a hold time implies |
| `solutionPrep`, `coatingSuspensionPrep`, `blender` | `mixer` at a declared 25 C | mixing, and the small duty that temperature implies |
| `rollerCompactor`, `finalBlender`, `coatingPan` | `mixer` | **mass and energy balance only** |
| `mill`, `screen`, `tabletPress`, `packagingLine` | `splitter` | **mass balance only** (the screen's 15 % fines and the press's 1 % rejects are declared splits) |

**The placeholders model NOTHING of the machine**: no blend uniformity, no
ribbon density or solid fraction, no particle-size reduction, no
compaction force, no tablet hardness or dissolution, no coating uniformity.
Choupo has no model of any of these machines and none was invented.  The
coating pan is drawn as TWO boxes — a mixer where the spray lands on the
cores, and a dryer where the hot air takes the water off — which is the
mass and energy balance of ONE machine.

**Nothing dissolves in this model.**  The API and the HPMCAS are carried
through the solution tank as solids (the spray dryer reads dissolved and
suspended solids alike); the PVA and the PEG likewise through the coating
suspension.  The heat of solution is therefore neglected.

## 4. Every assumption and its reason

The reason for each is on its line in the file named; this is the index.

| Where | Assumption | Value |
|---|---|---|
| `0/*Feed` | formulation and rate | section 2 |
| `flowsheetDict` `acetoneTank`, `recoveredTank` | hold times | 14 d (delivery + safety stock), 7 d (QC of recovered solvent) |
| `solutionPrep`, `coatingSuspensionPrep` | jacketed tanks at | 25 C |
| `blower` | shaft power, efficiency | 1 kW, 0.70 (the pressure it reaches is a result) |
| `gasHeater` | drying-gas inlet | 120 C |
| `SD` | rotary wheel 0.05 m at 25 000 rpm; chamber 1.2 m x 2.5 m; spray-solution viscosity 0.02 Pa s | a pilot-to-small production dryer; the viscosity of a 10 % HPMCAS solution is NOT in any record — measure it |
| `exhaustCooler`, `solventCondenser` | outlet temperatures | 35 C, **-10 C** (the recovery knob) |
| `purgeSplit`, `0/n2Makeup` | purge 5 %, make-up 15 kg/h N2 | so the loop holds 300 kg/h of nitrogen |
| `blender` | declared at 25 C | the ASD is HELD (secondary drying, QC release) before blending, so it is at room temperature; the heat it gave the room is the blender's published duty |
| `screen`, `tabletPress` | splits | 15 % fines back to the compactor; 1 % rejects |
| `airHeater`, `0/coatingAirIn` | coating air | 60 C; 10 kmol/h of dry air, 38 % RH at 25 C |
| `constant/components/*.dat` | every property of the API, the polymer and every excipient | molar mass from the formula where there is one, a NOMINAL 1 kg/mol for the polymers with no single formula; particle density, solid heat capacity and the cellulose's sorption isotherm AUTHOR-SET; the formation enthalpies are PLACEHOLDERS that cancel (no reaction) — each record says so in its `provenance` |
| `constant/economics` | every price | API 10 000 EUR/kg, tablet 1.00 EUR — round figures, not market data |
| `system/postDict` | the batch plan (production, lot, trains, every stage's times, density and fill), design rules, cost index, economic parameters | on their lines |
| `system/layoutDict` | every position, size, distance, zone, the wind | on their lines |

## 5. Base-case result (not optimised)

Mass balance 100.000 %; first law closes (residual below 0.0001 kW).

| | |
|---|---|
| Spray dryer: acetone evaporated | 27.65 kg/h (all of it: the powder leaves bone-dry, see 8) |
| Spray dryer: drying gas in / exhaust out | 393.15 K / 347.0 K; wet bulb 284.0 K |
| Spray dryer: gas heater duty | 11.78 kW (MP steam) |
| Droplet / particle size | 90.6 µm / 35.5 µm (Sauter); residence 9.2 s |
| Exhaust cooler / solvent condenser | 4.27 kW (cooling water) / 8.91 kW (ammonia refrigeration) |
| Acetone recovered | 25.86 kg/h of 27.65 (**93.5 %**), 99.8 mol % acetone |
| Acetone lost in the purge | 1.79 kg/h, to a vent treatment the plant does not model |
| Coated tablets | 7.599 kg/h = 12 672 tablets/h at the flowsheet basis (0.5997 g each); they keep 0.029 kg/h of water, 0.38 % of their mass (1.49 % on the cellulose, the isotherm's basis) |
| Coating dryer | exhaust 325.0 K; 0.853 kg/h of the coat's 0.882 kg/h of water evaporated |
| Batch plan (section 2a) | lot 358.2 kg of product (350 kg of blend), 84 lots a year; `T_L` 53.1 h (spray drying, the solution tank) and 10 h (solid dose, packaging) |
| Fixed capital (the solvent section + the quoted solid-dose train, scaled with the batch plan, and the building, see 6) | 22.54 MEUR (of it, 15.31 MEUR of bare-module cost is QUOTED placeholders) |
| Land (the layout's plot, 16 056 m2 at 80 EUR/m2) | 1.28 MEUR |
| Operating labour (the DECLARED crew, 11 a shift, see 6) | 49.5 operating positions, 4.07 MEUR/yr (Turton's correlation, for comparison: 152.5 positions, 12.55 MEUR/yr) |
| Revenue / raw materials / COM_d | 50.1 / 31.1 / 53.5 MEUR/yr (30 000 kg of tablets: 3 948 equivalent hours of the flowsheet) |
| NPV (10 %, 10 yr) / IRR | −44.6 MEUR / none (the plant never breaks even) — **not decision-grade, see 6** |

## 6. Sizing, cost and economics — what is in the capital and the labour, and what is not

Sized and costed (Turton): the spray dryer, the blower, four exchangers, the
condensate pot, the two preparation tanks (their volume from the batch plan:
one lot each) and the two acetone tanks.  The
run announces that almost every one is **below its correlation's range**
(the plant is small) — those costs are extrapolations.

**Quoted, not correlated (DEV.md 4c C98).**  Choupo has no sizer and no cost
correlation for the solid-dose machines or the GMP building, and it does not
invent one.  So `system/postDict` DECLARES a price for each, in
`costing { quotes ( ... ); }`:

| item | quote (installed, 2026 EUR), at its reference size | kind | scaled to (batch plan) |
|---|---|---|---|
| `tabletPress` | 1 000 000 at 100 kg/h | equipment | 87.5 kg/h: 923 007 |
| `packagingLine` | 1 500 000 at 50 kg/h | equipment | 44.8 kg/h: 1 403 991 |
| `coatingPan` (with the `coatingDryer`, its drying half) | 800 000 at 1 m3 | equipment | 0.71 m3: 651 819 |
| `rollerCompactor` | 600 000 at 100 kg/h | equipment | 80.6 kg/h: 527 086 |
| `blender` / `finalBlender` | 300 000 at 1 m3 each | equipment | 1.27 m3: 345 992 / 1.17 m3: 329 071 |
| `mill` (with the `screen`) | 150 000 at 100 kg/h | equipment | 80.6 kg/h: 131 771 |
| `productionBuilding` (the GMP building, 50 m x 36 m) | 11 000 000 | facility | not scaled |

**The machines scale with the batch plan** (`scaling { referenceSize;
exponent; exponentSource; }` on each quote): the item costs units x value x
(the stage's size per unit / referenceSize)^0.6, so a larger lot buys larger
machines and the capital follows.  The 0.6 is the six-tenths rule, a
convention (cited by title only) — declared on each quote, never defaulted.

**Every one of these numbers is an AUTHOR-SET PLACEHOLDER** — a round figure
of the right order, so that the train and its building are not zero in the
capital — and each says so in its `source` and `reason`, which the run
prints beside it.  Replace each with a vendor's dated quotation (vendor,
reference and date in `source`).  A quote is entered as its **installed**
cost (`basis installed;`, so it is the bare-module cost C_BM); an ex-works
quote is `basis purchased;` with your own `bareModuleFactor` and its
`bareModuleFactorSource` — Choupo supplies no installation factor for an
item it has no correlation for.  In the fixed capital each quote is a module
like any other: `contingencyFee` (1.18) applies to it, and for a machine
(`kind equipment;`) so does the auxiliary-facilities estimate (`siteFactor`
x its base); the building (`kind facility;`) does NOT drive that estimate,
because it IS a facility.  The costing table prints each quote's arithmetic;
`reports/economics/costs.csv` carries it in the same columns as the
correlated items.

**Still NOT in the capital:** the warehouse and the offices/QC laboratory as
priced items (the `siteFactor` term is Turton's estimate of such auxiliary
facilities — replace it with quotes if you have them), vent treatment for
the purge, dust collection, cleaning-in-place, validation and
qualification.

**The labour: a declared crew, and Turton's correlation beside it.**  Two
numbers are printed, and you should be able to explain both.

- **The crew that prices the labour** is DECLARED in `system/postDict`
  (`operatingCrew`, DEV.md 4c C98): solvent section 2, dispensing 1, dry
  granulation 2, compression 1, coating 1, packaging 3, material handling 1
  — **11 operators a shift**, x 4.5 positions per operator-per-shift (the
  cover for round-the-clock operation) = 49.5 positions, x 42 EUR/h x
  1960 h = **4.07 MEUR/yr**.  Every number is an AUTHOR-SET ASSUMPTION for
  ONE line: replace it with your own staffing plan (operators per room per
  shift).  And ask whether the 4.5 is right: the batch plan runs the
  solid-dose suite on two shifts (36.7 % of its 3 840 h) and only the spray
  dryer round the clock — the crew is NOT derived from the plan (the plan
  gives you the hours; the staffing is your judgement).
- **Turton's correlation, printed beside it as a COMPARISON that enters no
  total**: `N_OL = (6.29 + 31.7 P^2 + 0.23 N_np)^0.5` operators per shift,
  `P` the processing steps that handle PARTICULATE SOLIDS (declared:
  `particulateSteps { count 6; }` — spray drying, blending, roller
  compaction, milling and screening, tableting, coating) and `N_np` the
  others (5).  It gives 33.9 a shift, 152.5 positions, 12.55 MEUR/yr.
  Why it is not used: it is a regression over CONTINUOUS chemical plants,
  and it grows with the number of steps — with `P` SQUARED — while a
  campaign drug-product suite is staffed room by room: one press operator
  runs one press whatever the plant around it.  The gap between the two
  numbers is the lesson; defend the one you use.

A case that declares no crew is staffed by the correlation, and one that
does not declare `P` takes 0 — said by the run where the flowsheet holds a
dryer, crystalliser, cyclone or filter.

So the NPV is now an appraisal of the whole plant on PLACEHOLDER quotes, a
placeholder crew and placeholder prices: none of it is decision-grade until
the quotes, the staffing and the prices are yours.  Note where it goes
negative: the gross margin R - C_RM is 18.9 MEUR/yr, and COM_d also carries
Turton's 1.23 x C_RM and 2.73 x C_OL factors — check whether those
continuous-plant factors describe a drug-product plant either.

## 7. Plant layout

`system/layoutDict` places the sized items on a plot plan and declares the
GMP building they stand in (DEV.md 4c C100: a pharmaceutical process is not
run on equipment standing in the rain).  **Every process item stands in a
room of the GMP production building**; only the **bulk solvent** stays
outdoors, as it does in industry:

| Where | What | Why there |
|---|---|---|
| Spray-drying suite (ground floor, **double height** 0–10 m, north wall) | `SD`, the spray dryer | Contained (the dispersion is discharged as an open powder), hazardous area **zone 2** (acetone in a closed, inerted loop); the chamber's explosion vent is ducted out through the north wall.  Double height for the atomiser platform above the chamber (the engine's chamber is 1.2 m × 2.5 m; the room is 10 m). |
| Nitrogen-loop technical room (ground floor, north-east corner) | `gasHeater`, `blower`, `exhaustCooler`, `solventCondenser`, `condensatePot` | Beside the suite (the gas ducts pass through the wall they share), on two outside walls, entered from outside for maintenance, **zone 2**, held 5 Pa below outside by its extract so a leak goes to the extract and not into the building. |
| Solution-preparation room (ground floor, south-east corner) | `solutionPrep` | Contained (the API and HPMCAS are tipped into the acetone under a downflow booth), **zone 1** (the open manway), on the east wall where the acetone line comes in. |
| Coating-preparation room (ground floor, beside coating) | `coatingSuspensionPrep` | The film-coating suspension, piped through the wall to the pan coater. |
| AHU plant (technical floor, 5.5 m) | `airHeater` | The coil of the coater's air-handling unit, above the coating room. |
| **Tank farm, outdoors**, east of the building and downwind of it, in one bund | `acetoneTank/tank1`, `recoveredTank/tank1` | Bulk flammable liquid is stored outside, away from the people, with its hazardous-area zones declared.  The bund is not an item (a wall round two items would overlap both): its capacity is yours to size. |

The two solvent lines leave the farm on a short pipe rack, cross the east
road on its upper tier (7.2 m, above the roads' 5 m headroom) and **enter
the building through its east wall** at 4.5 m: the fresh acetone into the
solution room, the condensate out of the nitrogen-loop room.  Those two
outdoor legs are declared in `pipes {}`, each ending (or beginning) ON the
wall — the engine draws a pipe with an end indoors only up to that **wall
penetration**.

**Pipes indoors are not drawn.**  The router draws pipes in the open only: a
stream whose two ends stand indoors (the solution to the dryer, the whole
nitrogen loop, the coating suspension) is listed by the engine as "inside
the building: indoor piping is not routed".  The nitrogen make-up (from a
supply the case does not model — a liquid-nitrogen tank and vaporiser
outside) and the purge (to a vent treatment it does not model) have one end
indoors and none outdoors that the layout reaches: listed with that reason.
**Solids are not piped** either: the bought powders, the spray-dried
dispersion, the blends, granules and tablet cores are listed as "solids
only: moved in containers or by conveyor".

**One finding is left on purpose**: the site has ONE entrance
(`singleEntrance`: a fire brigade arriving while that road is blocked has no
second way in — where would you put a second gate, and which road serves
it?).  The earlier exercise (a coating-suspension tank 4 m outside the
building) is gone: the tank now stands in its room, where it belongs.  In
its place, **a question the engine does not check**: the spray dryer's
explosion vent discharges through the north wall of its suite, 1 m from the
paved edge of the north road — how large is the vent, how far do the flame
and the pressure reach, and may that road stay where it is while the dryer
runs?  (Vent sizing and the hazard distance are in the explosion-venting
standards, cited by title only: EN 14491, NFPA 68.)

**The GMP interior** (`building {}` at the end of `system/layoutDict`;
grammar in `docs/ai/case-layout.md`).  Its `envelope` is the
`productionBuilding` box (62 m × 36 m × 10 m), so every room must fit inside
it, the rooms count toward the plot, and the items the rooms list stand
inside it — each on its room's floor (an item indoors declares no `z`) and
classified by its room (its hazardous area is the room's `atex {}`).  Two
floors: the production floor (0–5 m) and a technical floor (5.5–10 m) for
the air-handling units, utilities and switchgear (the switchgear at the
west end, away from the classified rooms).  The engine raises **no finding**
on it.

| Area | Rooms | Grade | Pressure to outside |
|---|---|---|---|
| Staff entrance (south) | lobby → gowning → clean corridor | CNC → D | +15 → +25 → +35 Pa |
| Receipt and dispensing (south-west, from the warehouse) | goods-in, a sink material airlock, the dispensary (contained) with a bubble personnel airlock and a sink exit | CNC, D | +15; sinks +5/+10; dispensary +20; bubble +45 |
| Solvent suite (east) | the solution room and the spray-drying suite (both contained, each through a bubble personnel airlock, the solution room also through a sink for the API kits), the nitrogen-loop room (opens only to outside) | D, CNC | rooms +15, bubbles +45, sink +5; loop room −5 |
| Contained train (north) | the dispersion through a sink into blending → roller compaction → milling → final blending → compression, a contained personnel corridor (bubble airlock from the clean corridor) and a contained return corridor for waste | D, contained | rooms +15, suite corridor +25, bubble +45 |
| Coating and packaging (south) | coating preparation → coating → primary packaging → cascade airlock → secondary packaging → the warehouse | D → CNC | +25, +25, +30, +20, +15 |
| Waste | return corridor → sink airlock → waste room → outside (west) | D → CNC | +15, +5, +15 |
| Technical floor | AHU plant (the coater's air heater), utilities, electrical (an ignition source, at the west end) | CNC | +5 |

Grades: an oral-solid-dose suite is not sterile; EU GMP Annex 1, whose A–D
vocabulary the engine speaks, is written for sterile products, so the
product-exposed rooms are grade D **by analogy** and the rest CNC — the
case's statement, to replace with the company's risk assessment.  The 10 Pa
step is Annex 1's guidance value, borrowed.  **Containment** is declared on
every room where the API is an open powder (dispensing, the solution room,
the spray-drying suite, the granulation and compression train), on the
assumption that it is a potent compound: **its exposure band is not known —
confirm it from the supplier's safety data sheet** (question 2 of section
9).  Coating and packaging are not contained (tablets, not powder).  The
suite's powder discharge is also a combustible **dust** (a zone 22
question): the engine's grammar carries one zone per room, so that one is
yours.  Not modelled: air-change rates, HVAC sizing, door and corridor
widths, travel distances, the access clearance round each item inside its
room.

## 8. What Choupo does not model here — say it in your report

- **Secondary drying.** The spray-dried powder leaves bone-dry because no
  sorption isotherm of acetone on HPMCAS is declared.  Every real ASD keeps
  some solvent and needs a secondary dryer to bring it below its limit.
- **The amorphous state.** Nothing checks that the dispersion stays
  amorphous (that the API does not crystallise), nor the glass transition of
  the dispersion against the dryer's outlet temperature.
- **The spray dryer's approximations for an organic solvent**, announced on
  the run: the wet bulb is solved with the Lewis relation Le = 1, while
  acetone in nitrogen has Le = 1.6; the spray solution's viscosity is a
  declared guess; the surface tension is a corresponding-states estimate.
- **The oxygen in the loop.** The nitrogen loop exists to keep the acetone
  below its flammable limit; nothing here computes the oxygen it tolerates.
- **Solvent recycle.** The recovered acetone goes to a tank, not back to the
  solution tank: reusing it in a GMP process needs its quality proven, and
  closing that loop needs a make-up controlled to a specification (an outer
  `designSpec`) — your question.

## 9. The questions the group must answer

1. **The solvent.** What does the reference product actually use (EPAR
   3.2.P.3, the patents)?  If not acetone, what changes — the solvent
   record, the condenser temperature, the hazardous areas, the residual-
   solvent limit (look up its ICH Q3C class)?  Choupo's spray dryer takes
   ONE volatile solvent: a solvent MIXTURE would need the engine extended.
2. **Containment.** Find the occupational exposure limit or band for
   apalutamide in your API supplier's safety data sheet.  Which steps handle
   the API as a powder (dispensing, solution preparation, the dried
   dispersion, blending, compaction, tableting)?  What containment does that
   band require, and where does it put the walls of the building?
3. **The batch plan** (section 2a).  Defend every stage's times, bulk
   density and fill, the lot size, the shifts of each train and the campaign
   length.  Which stage limits each train, and what would you buy or change
   to move it (a second solution tank out of phase, a faster packaging line,
   one blender for both blends)?  What does each change do to the equipment
   sizes, the capital and the hours?
4. **Recovery vs refrigeration.** Change the condenser temperature and the
   purge fraction; what do the recovery, the refrigeration duty and the
   vent load do?
5. **The capital and the labour** of section 6: replace each quoted
   placeholder with a quotation and the declared crew with your staffing
   plan, compare it with the correlation the run prints, and say what the
   NPV does.

## 10. Engine notes made while building this case (DEV.md 4c C97)

Four engine gaps were met and fixed so the case could run, each a small
change with every earlier case unchanged: the spray dryer and the solid
dryer kept only ONE solid of a powder and lost the others; a mixer of
powders alone was refused; the ideal-gas entropy and heat capacity of a
mixture refused a powder absent from the gas; a vessel of declared volume
asked for a flow it did not use.  The spray dryer now also announces the
Lewis-number approximation for a non-aqueous solvent.
