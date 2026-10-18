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
| Tablets a year | about **50 million** of 60 mg | a mid-sized generic line; replace with your market study |
| Operating hours | stream factor **0.45** (3942 h/yr) | a campaign plant; the plant is solved ONCE at its campaign rate (steady state) and the year is that rate times these hours |
| Campaign rate | **12 800 tablets/h pressed**, 12 672 accepted | 50 million / 3942 h, before the 1 % press rejects |
| Core, per tablet | ASD 240 mg (60 API + 180 HPMCAS, **1:3**), MCC 150, silicified MCC 150, croscarmellose 30 (20 intra- + 10 extragranular), silica 5, Mg stearate 5 (2.5 + 2.5) = **580 mg** | a plausible dry-granulation formula, nobody's product |
| Coat | **3 % weight gain** (17.4 mg): PVA 40 %, PEG 20 %, TiO2 24.2 %, talc 14.8 %, iron oxide 1 % | of the order of a PVA-based coat |
| Spray solution | **10 wt %** solids in acetone | an ASD spray solution must stay sprayable (viscosity) |
| Coating suspension | **20 wt %** solids in water | |

The raw-material flows in `0/` are these per-tablet masses times the
campaign rate (each `0/` file says which).  **If you change the rate or the
formula, every `0/<feed>` file changes with it — they do not follow each
other.**

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
| `system/postDict` | design rules, cost index, economic parameters | on their lines |
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
| Coated tablets | 7.599 kg/h = 12 672 tablets/h (0.5997 g each); they keep 0.029 kg/h of water, 0.38 % of their mass (1.49 % on the cellulose, the isotherm's basis) |
| Coating dryer | exhaust 325.0 K; 0.853 kg/h of the coat's 0.882 kg/h of water evaporated |
| Fixed capital (solvent section ONLY, see 6) | 2.26 MEUR |
| Land (the layout's plot, 16 056 m2 at 80 EUR/m2) | 1.28 MEUR |
| Revenue / raw materials / COM_d | 50.0 / 31.1 / 41.4 MEUR/yr |
| NPV (10 %, 10 yr) / IRR | 31.3 MEUR / 41 % — **not decision-grade, see 6** |

## 6. Sizing, cost and economics — and why they are a LOWER BOUND

Sized and costed (Turton): the spray dryer, the blower, four exchangers, the
condensate pot, the two preparation tanks and the two acetone tanks.  The
run announces that almost every one is **below its correlation's range**
(the plant is small) — those costs are extrapolations.

**What the capital does NOT contain**, and is in real life most of it:
- the solid-dose machines — blenders, roller compactor, mill, tablet press,
  coater, packaging line: Choupo has no sizer or cost correlation for them
  and none was invented.  Get vendor quotations;
- the **GMP building** — clean rooms, HVAC, the quality-control laboratory,
  the warehouse.  Usually the largest single capital item of a drug-product
  plant;
- vent treatment for the purge, dust collection, cleaning systems.

**The labour is also understated, and the reason is in the engine**: Turton's
operator count is `N_OL = (6.29 + 31.7 P^2 + 0.23 N_np)^0.5`, where `P` counts
the PARTICULATE-solids steps; Choupo's implements only the `N_np` term
(`src/postProcessing/EconomicsPass.cpp`, `N_OL_per_shift`).  This plant has six
particulate steps (spray drying, blending, compaction, milling, tableting,
coating): with `P = 6` the formula gives about 34 operators a shift instead
of 2.7.  Work it out by hand and put it in your appraisal.

So the NPV above says only that the solvent section is cheap next to the
API.  An appraisal you can defend adds the items above.

## 7. Plant layout

`system/layoutDict` places the sized items on a plot plan: the offices and
quality-control laboratory by the gate, the warehouse, the **GMP production
building** (one declared box — its interior is phase B), and **downwind**
of them all the **solvent area** (solution tank, spray dryer, nitrogen loop,
condenser) with the acetone tanks south of the pipe rack.  Hazardous-area
zones are declared on everything that holds acetone; every number is an
assumption with its reason.  Two findings are left on purpose for the
group: a separation (the coating-suspension tank by the building — read the
file's header), and a site with ONE entrance (`singleEntrance`: a fire
brigade arriving while that road is blocked has no second way in — where
would you put a second gate, and which road serves it?).

**What the drawing gets wrong, and why:** the router draws EVERY material
stream as a pipe on the rack, and puts every unsized mixer and splitter on
the rack as a junction.  So the powders after the spray dryer, and the
bought powders, appear as pipes.  In the plant they move in closed
containers inside the building and arrive by truck.  Read those lines as
"material goes from here to there".

**Where the GMP interior plugs in (phase B):** the `productionBuilding` item.
Rooms, cleanliness grades, the pressure cascade and the flows of people,
material and waste will be declared for it; nothing is drawn inside it
today.

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
3. **Campaign sizing.** The plant is solved at ONE rate.  A tablet press
   does in hours what this rate does in a day; a spray dryer of this size
   may need a whole campaign.  For each step, how many hours a year does it
   run, and how many machines (or shifts) does each need?  (Phase C will
   ask Choupo the same question.)
4. **Recovery vs refrigeration.** Change the condenser temperature and the
   purge fraction; what do the recovery, the refrigeration duty and the
   vent load do?
5. **The capital and the labour** of section 6, by hand, and the NPV with
   them.

## 10. Engine notes made while building this case (DEV.md 4c C97)

Four engine gaps were met and fixed so the case could run, each a small
change with every earlier case unchanged: the spray dryer and the solid
dryer kept only ONE solid of a powder and lost the others; a mixer of
powders alone was refused; the ideal-gas entropy and heat capacity of a
mixture refused a powder absent from the gas; a vessel of declared volume
asked for a flow it did not use.  The spray dryer now also announces the
Lewis-number approximation for a non-aqueous solvent.
