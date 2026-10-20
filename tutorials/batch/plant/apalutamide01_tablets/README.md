# `apalutamide01_tablets` — apalutamide 60 mg film-coated tablets: a drug-product plant

A BASE CASE for a pharmaceutical-industry project group (DEV.md 4c C97,
phase A; re-based on a sourced design basis in C110).  The plant makes
**film-coated tablets of apalutamide**: the active pharmaceutical ingredient
(API) is **bought**, everything else is made on site — the spray-dried solid
dispersion, the granules, the tablets, the coat and the packs.
**It runs (a few seconds from a cold start), it converges, its mass and
energy balances close, and it is deliberately NOT optimised** — every number
a group would change is a plain key, and every one says where it came from.

```bash
source etc/bashrc
runCase tutorials/batch/plant/apalutamide01_tablets
```

The case is sealed: everything it reads is in its own `constant/`.

**Its design basis is a dossier**, not a guess:
[`docs/design/apalutamide-design-basis-dossier.md`](../../../../docs/design/apalutamide-design-basis-dossier.md)
("the dossier" below) — the EMA and FDA assessment reports, the label, the
originator's patent, the originator's published sales, generic-price
evidence and a red-team review, every number with its source, page and a
confidence word (*stated*, *derived*, *estimate*, *not found*).  Read it
before you change anything: most of what you will be asked to defend is
already argued there, and what is NOT is listed in its section 6 as the
questions only a supplier or the originator can answer.

**Read section 3 before anything else.**  Half of this plant is physics
Choupo computes (the spray dryer, the nitrogen loop, the solvent recovery,
the coating dryer, the heat exchangers); the other half is a **mass balance
with no equipment model at all** (blending, compaction, milling, screening,
tableting, packaging).  The two halves look alike in the stream table.  They
are not alike.

## 0. The business case, and why the patent decides it

The amorphous dispersion this plant makes — apalutamide in HPMCAS, 1:3,
spray dried — is **claimed by an active patent family of the originator**
(US 12,303,493 B2, Aragon Pharmaceuticals / Janssen: claim 1 the dispersion,
claim 4 the 1:3 ratio, claim 10 spray drying, claims 18 and 20 the 60 mg and
240 mg tablets; anticipated expiry 3 Dec 2035, an assumption by Google
Patents, not a legal conclusion; the European counterparts and their SPCs
were NOT verified — dossier section 3.6).  A plant that copies this
formulation and sells before then infringes, unless the patents fall.

So the case declares its business case, as Vitor ruled (DEV.md 4c C99
addendum): **a generic entrant to the European market at loss of
exclusivity.**  Three consequences, each in the case:

- the plant is built to **launch when exclusivity ends**: year 0 of the
  cash flow is the end of construction = the launch, and the NPV is
  discounted to that year, not to today (`system/postDict`, `economics`);
- the **price** is a generic's, with 2-4 competitors (section 2);
- the **volume** is a declared market share of the estimated European
  demand (section 2).

The other two business cases the dossier names — a contract manufacturer
for the originator (paid a toll fee per tablet, which was NOT found), and a
non-infringing design-around (a formulation project, not a plant design) —
are yours to argue if you prefer them.

## 1. What is known about the product, and from where

| Fact | Source (dossier section) | Confidence |
|---|---|---|
| 60 mg film-coated tablet, oblong, 17 mm × 9 mm, 240 mg daily (4 tablets); also a 240 mg tablet since 2023 | EU SmPC 1, 3, 4.2; EPAR line extension EMA/317740/2023 (1.1) | stated |
| Core excipients: colloidal anhydrous silica, croscarmellose sodium, HPMCAS, magnesium stearate, microcrystalline cellulose, silicified microcrystalline cellulose; coat: iron oxides, macrogol (PEG), partially hydrolysed PVA, talc, titanium dioxide | EU SmPC 6.1; US prescribing information (DailyMed, setid d1cda4f7-…), section 11 (1.2) | stated |
| The process: preparation of an intermediate, pre-blending, granulation, post-granulation blending and lubrication, film coating, packaging; ONE intermediate, the amorphous dispersion, held up to 12 months; bulk coated tablets held up to 12 months | CHMP assessment report EMA/879617/2018, 2.2.3, pp. 15-17 (1.3) | stated |
| The intermediate is spray dried with HPMCAS | *Materials* 16 (2023) 6616, section 3.1 (a secondary review); consistent with the patent (1.3) | stated (secondary) |
| **The quantitative formula** (the table in section 2) — dispersion 1:3 apalutamide : HPMCAS-**LG**, 700 mg core, 21 mg Opadry II coat | US 12,303,493 B2, Examples 3.1-3.3 (1.4) | stated **in the originator's patent example — consistent with, but not confirmed as, the registered formula**, which every regulator redacts |
| **The spray-drying solvent**: the patent's scale-up example uses dichloromethane / methanol 40:60 at 5 wt % solids; its acetone examples (laboratory, HPMCAS-LF) are also 5 wt % | US 12,303,493 B2, Ex. 3.1, 4.1, 6.1 (1.4, 4.2) | stated (patent); the COMMERCIAL solvent is **not found** |
| Apalutamide C21H15F4N5O2S, 477.43 g/mol, Form B, non-hygroscopic, mp 194-196 °C | EPAR-2018 2.2.2 (1.3); molar mass recomputed here from the formula | stated |
| Hazard: Repr. 1B (H360), STOT RE 2 (H373); **no exposure limit published** | the supplier's SDS (MedKoo, rev. 11 Jun 2020) (2) | stated; OEL **not found** |
| Commercial batch sizes | redacted everywhere (1.3) | **not found** |

**Why acetone, then** (Vitor's ruling, DEV.md 4c C99 addendum: "acetone,
cited from the patent").  Choupo's spray dryer carries ONE volatile solvent;
DCM/methanol is a mixture and would need the engine extended.  Acetone is
exemplified in the same patent, it is an ICH Q3C **Class 3** solvent (limit
5 000 ppm, against DCM's 600 and methanol's 3 000, both Class 2), and it is
modelled here at the patent's 5 wt % solids.  Say in your report that the
originator's own scale-up example uses DCM/MeOH, and what that would change:
a Class 2 residual-solvent limit, DCM's toxicity and emissions, methanol's
flammability.

**Why the 60 mg tablet, not the 240 mg.**  The 240 mg tablet has a
different core (no plain MCC) and coat, and its composition and weight are
**not found** (dossier 1.5): it was about a third of US Medicare claims in
2024 (derived).  The 60 mg is designed because its recipe is public; a
240 mg line needs the composition first.

The TGA's AusPAR for apalutamide (2019), which the first version of this
case cited, could not be opened by the dossier's session: read it before
your next revision.

## 2. The production basis

| Quantity | Value | Source |
|---|---|---|
| Demand: European volume | about 13.9 million patient-days a year = **55 million 60 mg tablets** (range 42-69 M) | dossier 3.3: J&J's 2025 Erleada International sales (2 121 MUSD) × a 53.3 % European share (an **estimate**, J&J's company-wide one) × 0.92 EUR/USD / 75 EUR net per patient-day — *derived from estimates* |
| Market share | **25 %** of that volume | dossier 4.1: a typical 3-4-entrant generic share — an **estimate** |
| **Production** `Q` | **14.0 million tablets a year = 10 156 kg** of packaged tablets (0.72546 g each, the run's) | derived (the dossier's 15 M is the capacity WITH a reject margin; the 1 % press rejects are in the flowsheet).  Declared ONCE, in the batch plan (`system/postDict`, `production`) |
| Flowsheet basis | **15 625 tablets/h pressed**, 15 468.75 accepted | the patent's PSD-3 dryer at its 75 kg/h of 5 wt % solution = 3.75 kg/h of dispersion / 240 mg (Ex. 3.1).  The steady flowsheet is the material balance PER UNIT OF PRODUCT; this rate is the dryer's, a basis for everything else (section 2a) |
| Lot | **400 kg of final blend**, about 571 000 tablets (137 kg of dispersion) | dossier 4.3, an **estimate** (the commercial lot is redacted) |
| Core, per tablet | dispersion 240 mg (60 API + 180 HPMCAS-LG, **1:3**); **intragranular** (560 mg): the dispersion, MCC 295.5, croscarmellose 17.5, silica 7.0; **extragranular** (140 mg): silicified MCC 116.9, croscarmellose 17.5, silica 2.1, magnesium stearate 3.5 = **700 mg** | US 12,303,493 B2 Ex. 3.2 (dossier 1.4) — the patent's split, ingredient for ingredient |
| Coat | **21.0 mg** (a 3.0 % weight gain) of Opadry II 85F, sprayed as a **20 wt %** suspension in water (84 mg of water a tablet) | Ex. 3.3 (dossier 1.4).  Its SPLIT — PVA 40 %, PEG 20 %, TiO2 24.2 %, talc 14.8 %, iron oxide 1 % — is the case's **estimate**: the shade's composition is proprietary (ask Colorcon) |
| Spray solution | **5 wt %** solids in acetone (1 g per 19 g) | Ex. 4.1, 6.1 (dossier 4.2) |
| Selling price | **4.0 EUR per tablet, net ex-factory** (5 513.8 EUR/kg of `packagedTablets`); 8.8 EUR at 2 competitors, run as a sensitivity | dossier 4.4: the originator's German ex-factory price (≈ 19.13 EUR/tablet, back-calculated from the pharmacy price with the statutory margins) less the FDA's median generic cut at 4 competitors (79 %) or 2 (54 %) — US evidence applied to Europe, an **estimate** |
| API price | **7 776 EUR/kg** | dossier 3.5: Pharmaoffer's average recorded price, 8 452 USD/kg × 0.92 — small pre-generic lots; a tonne-scale quotation was **not found** |

The raw-material flows in `0/` are these per-tablet masses times the
flowsheet basis rate (each `0/` file says which).  **If you change the rate or the
formula, every `0/<feed>` file changes with it — they do not follow each
other**; nor does the price per kg in `constant/economics`, which divides the
tablet price by the run's tablet mass.

For comparison, the first version of this case made 50 million tablets a
year — about 90 % of the estimated European volume — sold at 1.00 EUR, on a
580 mg core nobody's product uses (the dossier's red team, section 5).

## 2a. The batch plan — how the plant actually runs (DEV.md 4c C99)

A real oral-solid-dose plant does not run at a steady rate.  Dispensing,
blending, compaction, compression, coating and packaging are done in
**lots** (here 400 kg of final blend), each released by quality control
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
  because its hardware is modelled: 137 kg of dispersion per lot at
  3.75 kg/h is 36.6 h;
- each stage's **cycle** is charge + process + discharge + clean; a tank that
  empties through the stage it feeds is held for that stage's whole run
  (`dischargeTime throughFedStage;`);
- each **train** — stages between two intermediate stores — is paced by its
  slowest stage (the **limiting cycle time**, `T_L = max t / N_op`); two
  trains here, decoupled by the dispersion store (the EPAR's 12-month hold of
  the intermediate): the spray dryer (round the clock, 7 lots per campaign,
  48 h changeover) and the solid-dose suite (two shifts, 6 lots per campaign,
  24 h changeover);
- the **lots a year** are `ceil(Q / B)`, each train's **required hours** are
  its campaigns (the first lot's pass through every stage, then one lot every
  `T_L`, then the changeover), and each stage's **occupancy** is its busy
  hours over its train's available hours.

The base case (the production and the lot from the dossier; every time,
density and fill an assumption, said so in its `source`):

| | sprayDrying train | solidDose train |
|---|---|---|
| Available hours | 7 920 h (330 days x 24 h) | 3 840 h (2 shifts, 5 days, 48 weeks) |
| Limiting stage, `T_L` | the solution tank, 42.6 h (it is held while it feeds the 36.6 h dryer) | the packaging line, 10 h |
| Campaigns, hours needed | 4 of 7 lots, 1 256 h (15.9 %) | 5 of 6 lots, 444 h (11.6 %) |

Lot `B` = 410.4 kg of product, **25 lots a year**.  Equipment per lot: the
solution tank 4.29 m3 and the coating-suspension tank 0.074 m3 (both SIZED
from the plan: `volume fromBatchPlan;`), the bin blender 1.19 m3 and the
final blender 1.33 m3 (the dossier's 1 000-1 200 L IBC class), the coater
0.81 m3, the compactor 125 kg/h (with its 15 % fines), the press 100 kg/h
(about 143 000 tablets an hour, inside the dossier's 80 000-150 000 for this
tooling) and the packaging line 51 kg/h.

**The run ANNOUNCES that both trains are idle most of the year** — and that
is the dossier's own finding, not a defect of the case: 14 million tablets
is 25 lots, the dispersion is about 915 hours of spraying on a PSD-3
(25 lots x 36.6 h; the dossier's estimate is 960 h for 15 M tablets), and a
commercial press does a lot in an afternoon.  What a real company does with
such a line is your question: fewer available hours (fewer shifts), smaller
equipment with more lots, or a SHARED line making other products between
these campaigns (multiproduct campaigns and changeover cleaning are the
next thing the batch plan learns).

**What feeds on the plan.**  The two preparation tanks take their volume from
it; the solid-dose machines' quotes **scale** with their stage's size (each
`value` is the price of one machine of a declared `referenceSize`, scaled by
the six-tenths rule — a convention, with its exponent declared); and the
economics takes the year's flows from it (`streamFactor fromBatchPlan;`: the
annual flows are the hourly flows x `Q / r_P` = 905 "equivalent hours" —
which is also exactly the spray dryer's operating hours, the one step that
runs at the flowsheet's rate).  The production `Q` therefore has ONE home.

**What you must defend** (section 9, question 3): every time, bulk
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
  apiFeed (BOUGHT) -----------------------------+-> [solutionPrep 25 C] -> sprayFeed --> [SD pressure nozzle]
  hpmcasFeed (LG) ------------------------------+                                       |   |
  n2Makeup -> [n2Mix] -> [blower 1 kW] -> [gasHeater -> 120 C] -> dryingGas ----------> |   |
                 ^                                                            asdPowder  exhaustGas 46 C
                 |                                                                 |      |
                 |                                   [exhaustCooler -> 35 C, cooling water]
                 |                                   [solventCondenser -> -10 C, NH3 refrigeration]
                 |                                   [condensatePot] --> recoveredSolvent -> [recoveredTank 7 d] -> recoveredAcetone
                 +--- gasRecycle (TEAR) <-- [purgeSplit 5 %] --> purgeGas (vent)
DRY GRANULATION, TABLETING, COATING, PACKAGING
  asdPowder + MCC + croscarmellose + silica -> [blender 25 C] -> [rollerCompactor] -> [mill] -> [screen]
                                                      ^------- finesRecycle 15 % (TEAR) ---------+
  granules + silicified MCC + croscarmellose + silica + MgSt -> [finalBlender] -> [tabletPress 1 % rejects] -> tabletCores
  water + PVA + PEG + talc + TiO2 + iron oxide -> [coatingSuspensionPrep 25 C] -> coatingSuspension
  tabletCores + coatingSuspension -> [coatingPan] -> [coatingDryer] <- coatingAir (60 C) <- [airHeater] <- coatingAirIn
  coatedTablets -> [packagingLine] -> packagedTablets
```

| Unit(s) | Choupo type | What Choupo COMPUTES |
|---|---|---|
| `SD` | `sprayDryer` | **physics**: atomisation (a pressure nozzle, the patent's), droplet and particle size, drying kinetics, residence time, and the adiabatic energy balance that fixes the exhaust temperature |
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
What the dossier sourced is marked *(dossier)*; the rest is the case's.

| Where | Assumption | Value |
|---|---|---|
| `0/*Feed` | formulation and rate *(dossier)*; the coat's split (the case's estimate) | section 2 |
| `flowsheetDict` `acetoneTank`, `recoveredTank` | hold times | 14 d (delivery + safety stock), 7 d (QC of recovered solvent) |
| `solutionPrep`, `coatingSuspensionPrep` | jacketed tanks at | 25 C |
| `blower` | shaft power, efficiency | 1 kW, 0.70 (the pressure it reaches is a result) |
| `gasHeater` | drying-gas inlet | 120 C (the patent gives none) |
| `0/n2Makeup` | nitrogen make-up 22.5 kg/h with a 5 % purge, so the loop holds 450 kg/h of nitrogen | set so that the exhaust leaves at **46 C**, the patent's PSD-3 outlet *(dossier)* |
| `SD` | a pressure nozzle *(dossier)* at an atomising pressure of 30 bar, sized by the class-average curve; chamber 1.2 m x 2.5 m; spray-solution viscosity 0.02 Pa s | the pressure, the chamber and the viscosity are NOT in any document read — the viscosity of an HPMCAS solution in acetone must be measured |
| `exhaustCooler`, `solventCondenser` | outlet temperatures | 35 C, **-10 C** (the recovery knob; the patent's PSD-3 condenser runs at -9 C *(dossier)*) |
| `purgeSplit` | purge fraction | 5 % |
| `blender` | declared at 25 C | the dispersion is HELD (secondary drying, QC release) before blending, so it is at room temperature; the heat it gave the room is the blender's published duty |
| `screen`, `tabletPress` | splits | 15 % fines back to the compactor; 1 % rejects |
| `airHeater`, `0/coatingAirIn` | coating air | 60 C; 10 kmol/h of dry air, 38 % RH at 25 C |
| `constant/components/*.dat` | every property of the API, the polymer and every excipient | molar mass from the formula where there is one, a NOMINAL 1 kg/mol for the polymers with no single formula; particle density, solid heat capacity and the cellulose's sorption isotherm AUTHOR-SET; the formation enthalpies are PLACEHOLDERS that cancel (no reaction) — each record says so in its `provenance` |
| `constant/economics` | the tablet's price and the API's *(dossier)*; every other price | the rest are round figures, not market data; the recovered acetone is NOT sold (dossier red team, item 11) |
| `system/postDict` | the batch plan (production and lot *(dossier)*; trains, every stage's times, density and fill), design rules, cost index, economic parameters | on their lines |
| `system/layoutDict` | every position, size, distance, zone, the wind; the room grade (CNC throughout *(dossier)*) | on their lines |

## 5. Base-case result (not optimised)

Mass balance 100.000 %; first law closes (residual below 0.001 kW).

| | |
|---|---|
| Spray dryer: acetone evaporated | 71.25 kg/h (all of it: the powder leaves bone-dry, see 8) |
| Spray dryer: drying gas in / exhaust out | 393.15 K / 319.2 K (**46.1 C**, the patent's 46 C); wet bulb 284.0 K |
| Spray dryer: gas heater duty | 18.14 kW (MP steam) |
| Droplet / particle size | 66.4 µm / 20.7 µm (Sauter); residence 11.5 s |
| Exhaust cooler / solvent condenser | 1.93 kW (cooling water) / 18.48 kW (ammonia refrigeration) |
| Acetone recovered | 68.58 kg/h of 71.25 (**96.3 %**), 99.8 mol % acetone |
| Acetone lost in the purge | 2.67 kg/h, to a vent treatment the plant does not model |
| Coated tablets | 11.222 kg/h = 15 468.75 tablets/h at the flowsheet basis (0.72546 g each: 700 mg core, 21 mg coat); they keep 0.069 kg/h of water, 0.61 % of their mass (1.49 % on the cellulose, the isotherm's basis) |
| Coating dryer | exhaust 321.6 K; 1.230 kg/h of the coat's 1.299 kg/h of water evaporated |
| Batch plan (section 2a) | lot 410.4 kg of product (400 kg of blend), 25 lots a year; `T_L` 42.6 h (spray drying, the solution tank) and 10 h (solid dose, packaging); both trains announced idle most of the year |
| Fixed capital (the solvent section + the quoted solid-dose train, scaled with the batch plan, and the building, see 6) | 23.75 MEUR (of it, 15.78 MEUR of bare-module cost is QUOTED placeholders) |
| Land (the layout's plot, 16 056 m2 at 80 EUR/m2) | 1.28 MEUR |
| Operating labour (the DECLARED crew, 11 a shift, see 6) | 49.5 operating positions, 4.07 MEUR/yr (Turton's correlation, for comparison: 152.5 positions, 12.55 MEUR/yr) |
| Revenue / raw materials / COM_d | 56.0 / 6.88 / 23.9 MEUR/yr (10 156 kg of tablets: 905 equivalent hours of the flowsheet) |
| NPV (10 %, 10 yr, at launch) / IRR | **+128.2 MEUR / 70.8 %** (discounted payback 1.6 yr); at the 2-competitor price, 8.8 EUR a tablet, +447.6 MEUR / 162 % — **not decision-grade, see 6** |

**Why it now makes money, and why that is not the end of the argument.**  A
tablet sells for 4.0 EUR and costs about 1.70 EUR to make (COM_d per kg of
product), of which the API is 0.47 EUR — the earlier 1.00 EUR price, the
"6+ competitors" floor, could never pay for a 0.60 EUR API and a GMP
building.  But the NPV is computed at launch, years from today, on a
price-erosion curve measured in the US, a market share that is an estimate,
a capital that is two-thirds placeholders and a crew nobody has staffed: the
group's job is to replace each of those, and to say which one the NPV is
most sensitive to (the run prints the price's own sensitivity bar).

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
| `packagingLine` | 1 500 000 at 50 kg/h | equipment | 51.3 kg/h: 1 523 280 |
| `tabletPress` | 1 000 000 at 100 kg/h | equipment | 100 kg/h: 1 000 000 |
| `coatingPan` (with the `coatingDryer`, its drying half) | 800 000 at 1 m3 | equipment | 0.81 m3: 706 191 |
| `rollerCompactor` | 600 000 at 100 kg/h | equipment | 125.5 kg/h: 687 570 |
| `blender` / `finalBlender` | 300 000 at 1 m3 each | equipment | 1.19 m3: 332 196 / 1.33 m3: 356 520 |
| `mill` (with the `screen`) | 150 000 at 100 kg/h | equipment | 125.5 kg/h: 171 893 |
| `productionBuilding` (the GMP building, 62 m x 36 m) | 11 000 000 | facility | not scaled |

**The machines scale with the batch plan** (`scaling { referenceSize;
exponent; exponentSource; }` on each quote): the item costs units x value x
(the stage's size per unit / referenceSize)^0.6, so a larger lot buys larger
machines and the capital follows.  The 0.6 is the six-tenths rule, a
convention (cited by title only) — declared on each quote, never defaulted.

**Every one of these numbers is an AUTHOR-SET PLACEHOLDER** — a round figure
of the right order, so that the train and its building are not zero in the
capital — and each says so in its `source` and `reason`, which the run
prints beside it.  The dossier found the machines' SIZES (section 4.3: a
1 000-1 200 L IBC blender, a 100-400 kg/h roller compactor, a rotary press
of 80 000-150 000 tablets an hour with D tooling, a perforated coater of
150-400 kg) but **no prices**, and lists the quotations to ask for (its
section 6, question 5).  For the building it found ONE public benchmark
(section 4.5): Mayne Pharma's oral-solid-dose plant with potent-compound
containment, 80 MUSD for about 11 700 m2, about 6 800 USD (6 260 EUR) per m2
**all-in, building and equipment**; a building-only cost per m2 was **not
found**.  The case's 11 MEUR over the building's 2 232 m2 of footprint is
4 930 EUR/m2, below that all-in figure as a building alone should be — of
the right order, and still a placeholder.  Replace each with a vendor's
dated quotation (vendor, reference and date in `source`).  A quote is
entered as its **installed**
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

**Still NOT in the capital:** the secondary dryer the patent uses (a vacuum
tray dryer with a nitrogen sweep at 40 C — no price was found, and no unit
models it, see 8), the warehouse and the offices/QC laboratory as
priced items (the `siteFactor` term is Turton's estimate of such auxiliary
facilities — replace it with quotes if you have them), vent treatment for
the purge, dust collection, cleaning-in-place, validation and
qualification.  **Not in the operating cost:** the disposal of the
recovered acetone (it is no longer sold — the dossier's red team, item 11 —
and a contractor's price was not found).

**The labour: a declared crew, and Turton's correlation beside it.**  Two
numbers are printed, and you should be able to explain both.

- **The crew that prices the labour** is DECLARED in `system/postDict`
  (`operatingCrew`, DEV.md 4c C98): solvent section 2, dispensing 1, dry
  granulation 2, compression 1, coating 1, packaging 3, material handling 1
  — **11 operators a shift**, x 4.5 positions per operator-per-shift (the
  cover for round-the-clock operation) = 49.5 positions, x 42 EUR/h x
  1960 h = **4.07 MEUR/yr**.  Every number is an AUTHOR-SET ASSUMPTION for
  ONE line: replace it with your own staffing plan (operators per room per
  shift).  And ask whether the 4.5 is right: the batch plan needs the
  solid-dose suite for 444 h a year and the spray dryer for 1 256 h — the
  crew is NOT derived from the plan (the plan gives you the hours; the
  staffing is your judgement), and a line this idle is not staffed round
  the clock.
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

So the NPV is an appraisal of the whole plant on a SOURCED price, a SOURCED
volume and a SOURCED formula, but on PLACEHOLDER quotes and a placeholder
crew: none of it is decision-grade until the quotes and the staffing are
yours.  COM_d also carries Turton's 1.23 x C_RM and 2.73 x C_OL factors —
check whether those continuous-plant factors describe a drug-product plant.

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
| Staff entrance (south) | lobby → gowning → clean corridor | CNC | +15 → +25 → +35 Pa |
| Receipt and dispensing (south-west, from the warehouse) | goods-in, a sink material airlock, the dispensary (contained) with a bubble personnel airlock and a sink exit | CNC | +15; sinks +5/+10; dispensary +20; bubble +45 |
| Solvent suite (east) | the solution room and the spray-drying suite (both contained, each through a bubble personnel airlock, the solution room also through a sink for the API kits), the nitrogen-loop room (opens only to outside) | CNC | rooms +15, bubbles +45, sink +5; loop room −5 |
| Contained train (north) | the dispersion through a sink into blending → roller compaction → milling → final blending → compression, a contained personnel corridor (bubble airlock from the clean corridor) and a contained return corridor for waste | CNC, contained | rooms +15, suite corridor +25, bubble +45 |
| Coating and packaging (south) | coating preparation → coating → primary packaging → cascade airlock → secondary packaging → the warehouse | CNC | +25, +25, +30, +20, +15 |
| Waste | return corridor → sink airlock → waste room → outside (west) | CNC | +15, +5, +15 |
| Technical floor | AHU plant (the coater's air heater), utilities, electrical (an ignition source, at the west end) | CNC | +5 |

Grades: **every room is CNC** (controlled, not classified).  An oral-solid-
dose suite is not sterile, and EU GMP Annex 1 — the sterile annex, whose
A–D vocabulary the engine speaks — does not apply to it; calling OSD rooms
"grade D" invites a reviewer's objection (dossier section 2, red-team item
10).  What applies, and what the building is argued from: EU GMP Part I
Chapter 3 (3.6 cross-contamination by design, 3.12 ventilation, 3.13 a
separate weighing room, 3.14 dust), Chapter 5 (5.18-5.21, the health-based
exposure limit) and WHO TRS 1010 Annex 8, the HVAC guideline for
non-sterile products (4.4 positive to outside, 4.5 the manufacturer decides
the cleanliness level, 7.5 air from the corridor to the cubicle, 7.7 the
corridor above the dust rooms and the rooms above atmospheric) — and the
cascade above satisfies 7.7.  A company may add its own ISO 8 at-rest target
(common practice, an estimate).  The 10 Pa step is the case's design value:
WHO 7.4-7.6 asks for an individually assessed differential and gives no
number.  With every room CNC, the engine's cascade rule (which asks a step
only between rooms of different grades) has nothing to compare; the AIRLOCK
rules (a bubble above its neighbours, a sink below, a cascade airlock
between) and the CONTAINMENT rules still check every pressure.
**Containment** is declared on
every room where the API is an open powder (dispensing, the solution room,
the spray-drying suite, the granulation and compression train): the
supplier's SDS classifies apalutamide Repr. 1B and STOT RE 2 and publishes
**no exposure limit**, so an internal band OEB 3-4 is ASSUMED until the
supplier gives its figure (question 2 of section 9).  Coating and packaging are not contained (tablets, not powder).  The
suite's powder discharge is also a combustible **dust** (a zone 22
question): the engine's grammar carries one zone per room, so that one is
yours.  Not modelled: air-change rates, HVAC sizing, door and corridor
widths, travel distances, the access clearance round each item inside its
room.

## 8. What Choupo does not model here — say it in your report

- **Secondary drying.** The spray-dried powder leaves bone-dry because no
  sorption isotherm of acetone on HPMCAS is declared.  Every real dispersion
  keeps some solvent: the patent dries it again in a vacuum tray dryer with
  a nitrogen sweep at 40 C (Ex. 3.1), to the residual-solvent limit — for
  acetone, ICH Q3C Class 3, **5 000 ppm** (a release test).  Neither the
  step nor its equipment is in this case.
- **The amorphous state.** Nothing checks that the dispersion stays
  amorphous (that the API does not crystallise), nor the glass transition of
  the wet dispersion against the dryer's 46 C outlet — the reason the patent
  runs that cool.
- **The spray dryer's approximations for an organic solvent**, announced on
  the run: the wet bulb is solved with the Lewis relation Le = 1, while
  acetone in nitrogen has Le = 1.6; the atomiser is the pressure nozzle's
  class-average curve, which reads the pressure only (not the viscosity,
  which is a declared guess); the surface tension is a corresponding-states
  estimate.
- **The oxygen in the loop.** The nitrogen loop exists to keep the acetone
  below its flammable limit; nothing here computes the oxygen it tolerates.
- **Solvent recycle.** The recovered acetone goes to a tank, not back to the
  solution tank: reusing it in a GMP process needs its quality proven, and
  closing that loop needs a make-up controlled to a specification (an outer
  `designSpec`) — your question.  Until then it is neither sold nor reused
  in the appraisal, and its disposal is not priced.
- **The 240 mg tablet**, whose composition is not public (section 1).

## 9. The questions the group must answer

1. **The solvent.** The originator's scale-up example uses DCM/methanol
   40:60; this case uses the patent's acetone example.  Argue the choice:
   the ICH Q3C classes and limits, the toxicity and emissions of DCM, the
   flammability of each, what the condenser and the hazardous areas become.
   Choupo's spray dryer takes ONE volatile solvent: a solvent MIXTURE would
   need the engine extended.  And the solution's viscosity at 5 wt %: measure
   it (or find it), switch the atomiser to `correlation wangLefebvre;`, and
   see what the droplet size does.
2. **Containment.** The SDS says Repr. 1B and STOT RE 2 and publishes no
   exposure limit; this case assumes an internal band OEB 3-4.  Ask the API
   supplier for the OEL/OEB, the PDE (for cleaning validation) and the wipe
   limit.  Which steps handle the API as a powder (dispensing, solution
   preparation, the dried dispersion, blending, compaction, tableting)?  What
   containment does that band require, and where does it put the walls of
   the building?
3. **The batch plan** (section 2a).  Defend every stage's times, bulk
   density and fill, the lot size, the shifts of each train and the campaign
   length.  Both trains are idle most of the year: would you staff fewer
   shifts, buy smaller equipment, or share the line with other products?
   What does each change do to the equipment sizes, the capital, the hours
   and the labour?
4. **The market.** The volume and the price both rest on estimates (the
   European share of J&J's International sales, a 25 % market share, the
   FDA's US price-erosion curve).  Run the NPV at 2 and at 4 competitors
   (the run prints both), at a share you can defend, and in the year your
   patent attorney says exclusivity ends in the EU.
5. **Recovery vs refrigeration.** Change the condenser temperature and the
   purge fraction; what do the recovery, the refrigeration duty and the
   vent load do?
6. **The capital and the labour** of section 6: replace each quoted
   placeholder with a quotation (the dossier's section 6 lists them), the
   API price with a dated DMF-holder quotation at your tonnage, and the
   declared crew with your staffing plan; compare it with the correlation
   the run prints, and say what the NPV does.

## 10. Engine notes made while building this case (DEV.md 4c C97)

Four engine gaps were met and fixed so the case could run, each a small
change with every earlier case unchanged: the spray dryer and the solid
dryer kept only ONE solid of a powder and lost the others; a mixer of
powders alone was refused; the ideal-gas entropy and heat capacity of a
mixture refused a powder absent from the gas; a vessel of declared volume
asked for a flow it did not use.  The spray dryer now also announces the
Lewis-number approximation for a non-aqueous solvent.
