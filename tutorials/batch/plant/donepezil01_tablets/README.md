# `donepezil01_tablets` — donepezil hydrochloride 10 mg film-coated tablets: a drug-product plant

A BASE CASE for a pharmaceutical-industry project group (DEV.md 4c C104,
built on the stated defaults of C110).  The plant makes **film-coated
tablets of donepezil hydrochloride** by **wet granulation**: the active
pharmaceutical ingredient (API) is **bought**, everything else is made on
site — the granules, the tablets, the coat and the packs.
**It runs (in seconds), its mass and energy balances close, and it is
deliberately NOT optimised** — every number a group would change is a plain
key, said to be an assumption where it is declared.

```bash
source etc/bashrc
runCase tutorials/batch/plant/donepezil01_tablets
```

The case is sealed: everything it reads is in its own `constant/`.

**It is the simpler sibling of `apalutamide01_tablets`** (the same folder,
the same grammar, read that case's README for anything not repeated here).
There is **no spray drying, no organic solvent, no nitrogen loop, no
solvent recovery and no hazardous area (ATEX)**: an aqueous binder, an
aqueous coat, two hot-air dryers.  What is harder here is not the
chemistry but the **dose**: 10 mg of API in a 280 mg core (section 8).

**Read section 3 before anything else.**  Two units of this plant are
physics Choupo computes (the fluid-bed dryer and the coating dryer, with
their air heaters); the rest is a **mass balance with no equipment model at
all** (granulation, milling, blending, tableting, packaging).  The two look
alike in the stream table.  They are not alike.

## 1. What is known about the product, and from where

| Fact | Source | Verified? |
|---|---|---|
| The product: **ARICEPT 10 mg film coated tablets** (Eisai), each containing **10 mg of donepezil hydrochloride, equivalent to 9.12 mg of donepezil free base**, and **174.33 mg of lactose** | UK Summary of Product Characteristics, *ARICEPT 10 mg film coated tablets*, Eisai Ltd, PL 10555/0007, electronic medicines compendium (emc), revised 13/12/2022 — sections 1 and 2 | read for this case |
| Core excipients: **lactose monohydrate, maize starch, microcrystalline cellulose, hyprolose (hydroxypropyl cellulose), magnesium stearate** | the same SmPC, section 6.1 | read for this case |
| Film coat: **talc, macrogol (PEG), hypromellose, titanium dioxide (E171), yellow iron oxide (E172)** | the same SmPC, section 6.1 | read for this case |
| The 10 mg tablet is **yellow**, round, biconvex, debossed ARICEPT / 10; the 5 mg is **white**, debossed ARICEPT / 5 | section 3 of each SmPC | read for this case |
| The **5 mg** strength: 5 mg of donepezil hydrochloride (4.56 mg free base) and **87.17 mg of lactose** — half the 10 mg figures | UK SmPC, *ARICEPT 5 mg film coated tablets*, Eisai Ltd, emc; the Irish (HPRA) SmPC of the 5 mg tablet writes "lactose monohydrate 87.17 mg" | read for this case |
| Packs: PVC/aluminium blisters (shelf life 4 years) and HDPE bottles (3 years); do not store above 30 °C | the 10 mg SmPC, sections 6.3–6.5 | read for this case |
| Donepezil hydrochloride is C24H29NO3·HCl, 415.96 g/mol | recomputed here from the formula with standard atomic weights; 10 mg × 379.49/415.96 = 9.12 mg reproduces the SmPC's free-base figure | yes |
| **The manufacturing route** (wet granulation with an aqueous HPC binder, fluid-bed drying, aqueous film coating) | — | **NOT verified.**  A stated default of this case (DEV.md 4c C110); a binder in the core is *consistent* with it, nothing more |
| **Every quantity other than the API and the lactose** (starch, cellulose, binder, lubricant, the core weight, the coat composition and weight gain) | — | **NOT verified.**  Assumptions |
| **Production and price** | — | **NOT verified.**  Author-set assumptions, said so where they are declared (section 2) |
| Every process condition (temperatures, air flows, times, rejects) | — | **NOT verified.**  Assumptions |

Two inferences, labelled as such: the lactose of the two strengths is in the
ratio 2:1, which is what ONE common blend pressed at two tablet weights would
give (a dose-proportional pair); and the yellow iron oxide is the only
ingredient the two strengths do not share — so the two products can share
the whole granulation and differ only from the press on.

**Where the group must look** for what this case could not verify: ARICEPT
was not authorised through the EMA's centralised procedure as far as this
case could find, so there is no EPAR to read; the **national SmPCs and
public assessment reports** (MHRA, HPRA, the other national agencies) and
the public assessment reports of the **generic** donepezil products
(written for each generic's authorisation, and which may describe its
manufacturing route) are where the formulation and the process are
described; the **Ph. Eur. monographs** of the excipients for their grades.
Replace each assumption with what you find, and cite it.

## 2. The production basis (all assumptions except where marked)

| Quantity | Value | Why |
|---|---|---|
| Production | **43 535 kg** of packaged tablets a year, **150 million** of 10 mg | an author-set assumption, not a market study.  Declared ONCE, in the batch plan (`system/postDict`, `production`) |
| Flowsheet basis | **720 000 tablets/h pressed**, 712 800 accepted | the steady flowsheet is the material balance PER UNIT OF PRODUCT; this rate is chosen as the fluid bed's own DRYING rate (one 300 kg lot dried in 1.5 h), so its air heater is sized for the duty it really has (section 6) |
| Lot | **300 kg of final blend**, about 1.06 million cores | a commercial wet-granulation lot, granulated and dried in one load (section 2a) |
| Core, per tablet | donepezil HCl **10.00 (SmPC)**, lactose monohydrate **174.33 (SmPC)**, maize starch 50.00, MCC 36.87, HPC 7.40 (binder), Mg stearate 1.40 (extragranular) = **280.00 mg** | the API and the lactose are the reference product's; the rest is a plausible wet-granulation formula, nobody's product.  The API is **3.6 % w/w** of the core |
| Binder solution | HPC 7.40 mg in 66.60 mg of purified water (**10 wt %**), 23.9 % of the dry intragranular mass | a granulation liquid of the right order for a lactose/starch blend; the endpoint is a group question |
| Coat | **3 % weight gain** (8.40 mg): HPMC 60 %, TiO2 25 %, macrogol 7.5 %, talc 6.5 %, yellow iron oxide 1 % | the SmPC's coat ingredients; the proportions are of the order of a hypromellose coat |
| Coating suspension | **12 wt %** solids in water | |
| Drying air | 250 kmol/h of dry air (about 7 270 kg/h) at 38 % RH, heated to **60 °C**, for each dryer | of the order for a fluid bed of this lot |

The raw-material flows in `0/` are these per-tablet masses times the
flowsheet basis rate (each `0/` file says which).  **If you change the rate
or the formula, every `0/<feed>` file changes with it — they do not follow
each other.**

**The 5 mg tablet is NOT run.**  This case plans ONE product.  The two
strengths would share both trains in campaigns, with a changeover clean
between products; that plan needs a **multiproduct batch plan** (product
campaigns and changeover cleaning in `batchPlan`), which is being built
separately (DEV.md 4c C110, A2).  Until it lands, a group can run the 5 mg
tablet as its own copy of this case (halve every core feed at the same
tablet count, white coat: drop `feOxFeed`) and add the two plans' hours by
hand — and say that it did.

## 2a. The batch plan — how the plant actually runs (DEV.md 4c C99)

The steady flowsheet is the **material balance per unit of product**; the
`batchPlan {}` block of `system/postDict` designs the batch plant on it
(`src/postProcessing/BatchPlanPass.H` states the method; the
`apalutamide01_tablets` README, section 2a, walks through it).  **Two
trains**, decoupled by the **final-blend store** — the blend waits in its
bin for quality-control release (blend uniformity, section 8) before it is
pressed:

| | granulation train | tableting train |
|---|---|---|
| Stages | binder preparation, high-shear granulation, fluid-bed drying, milling, final blending | compression, coating-suspension preparation, coating, packaging |
| Available hours | 3 840 h (2 shifts, 5 days, 48 weeks) | 3 840 h (the same) |
| Limiting stage, `T_L` | the **fluid-bed dryer**, 4.25 h | the **packaging line**, 11 h |
| Campaigns, hours needed | 18 of 8 lots, 1 121 h (**29.2 %**) | 18 of 8 lots, 2 239 h (**58.3 %**) |

Lot `B` = 305.9 kg of product, **143 lots a year**.  Equipment per lot: the
binder tank 0.097 m3 and the coating-suspension tank 0.100 m3 (both SIZED
from the plan: `volume fromBatchPlan;`), the granulator bowl 1.11 m3, the
fluid-bed bowl 1.34 m3, the bin blender 1.00 m3, the coater 0.61 m3, the
mill 149 kg/h, the press 42.9 kg/h (about 150 000 tablets an hour) and the
packaging line 34.0 kg/h.

**The granulation suite is idle 70 % of its time.**  That is the lesson of
this plan, not a defect of it: a dedicated line for ONE generic strength
does not fill a wet-granulation suite.  A real site fills it with other
products (the 5 mg strength first) — which is exactly what the multiproduct
plan is for.  **What you must defend** (question 3 of section 9): every
stage's times, bulk density and fill fraction, the lot size, the shifts of
each train and the campaign length.

## 3. The flowsheet — what is physics and what is a placeholder

```
WET GRANULATION
  granWater + hpcFeed -> [binderPrep 25 C] -> binderSolution --+
  apiFeed (BOUGHT) + lactose + starch + MCC --------------------+-> [granulator] -> wetMass
  fbdAirIn -> [fbdAirHeater -> 60 C, LP steam] -> fbdAir                              |
  wetMass + fbdAir -> [fluidBedDryer] -> driedGranules + fbdExhaust
  driedGranules -> [mill] -> milledGranules
FINAL BLEND, TABLETING, COATING, PACKAGING
  milledGranules + Mg stearate -> [finalBlender 25 C] -> finalBlend -> [tabletPress 1 % rejects] -> tabletCores
  water + HPMC + macrogol + talc + TiO2 + yellow iron oxide -> [coatingSuspensionPrep 25 C] -> coatingSuspension
  tabletCores + coatingSuspension -> [coatingPan] -> [coatingDryer] <- coatingAir (60 C) <- [coatingAirHeater] <- coatingAirIn
  coatedTablets -> [packagingLine] -> packagedTablets
```

| Unit(s) | Choupo type | What Choupo COMPUTES |
|---|---|---|
| `fluidBedDryer`, `coatingDryer` | `solidDryer` | **physics**: the water the hot air takes off, the outlet temperature (adiabatic, on the package's enthalpy), and the moisture the solid keeps — the maize starch's sorption isotherm at the exhaust air's water activity; which of isotherm / heat / saturation binds is announced |
| `fbdAirHeater`, `coatingAirHeater` | `phaseChanger` | **physics**: the duties, on the package's enthalpy |
| `binderPrep`, `coatingSuspensionPrep`, `finalBlender` | `mixer` at a declared 25 °C | mixing, and the small duty that temperature implies |
| `granulator`, `coatingPan` | `mixer` | **mass and energy balance only** |
| `mill`, `tabletPress`, `packagingLine` | `splitter` | **mass balance only** (the press's 1 % rejects are a declared split) |

**The placeholders model NOTHING of the machine**: no granule growth or
endpoint, no granule size, no blend uniformity, no compaction force, no
tablet hardness or dissolution, no coating uniformity.  Choupo has no model
of any of these machines and none was invented.  The coating pan is drawn
as TWO boxes — a mixer where the spray lands on the cores, and a dryer
where the hot air takes the water off — which is the mass and energy
balance of ONE machine.

**Nothing dissolves in this model.**  The HPC is carried through the binder
tank as a solid, the HPMC and the macrogol through the coating suspension;
the heat of solution is neglected.  **The isotherm is the starch's alone**:
the dryers read ONE sorption isotherm, so the lactose, the cellulose and the
binder ride through dry (said on the run) — the granules really hold more
water than the 0.65 % computed here.

## 4. Every assumption and its reason

The reason for each is on its line in the file named; this is the index.

| Where | Assumption | Value |
|---|---|---|
| `0/*Feed`, `0/granWater`, `0/coatWater` | formulation and rate | section 2 |
| `0/fbdAirIn`, `0/coatingAirIn` | drying air | 250 kmol/h dry air, 38 % RH at 25 °C, each |
| `flowsheetDict` `fbdAirHeater`, `coatingAirHeater` | air inlet temperature | 60 °C |
| `binderPrep`, `coatingSuspensionPrep` | stirred tanks at | 25 °C |
| `finalBlender` | declared at 25 °C | the granules are cooled in the fluid bed's cool-down step and held before blending; the heat they give up is the blender's published duty |
| `tabletPress` | split | 1 % rejects |
| `constant/components/*.dat` (11 case-local solids) | every property of the API and every excipient | molar mass from the formula where there is one, a NOMINAL 1 kg/mol for HPC and HPMC; particle density, solid heat capacity and the starch's GAB isotherm AUTHOR-SET; the formation enthalpies are PLACEHOLDERS that cancel (no reaction) — each record says so in its `provenance` |
| `constant/economics` | every price | API 500 EUR/kg, tablet 0.10 EUR — round figures, not market data |
| `system/postDict` | the batch plan (production, lot, trains, every stage's times, density and fill), design rules, cost index, quotes, crew, economic parameters | on their lines |
| `system/layoutDict` | every position, size, road and room | on their lines |

## 5. Base-case result (not optimised)

Mass balance 100.000 %; first law closes (residual below 0.0001 kW).

| | |
|---|---|
| Fluid-bed dryer | air in 333.15 K, exhaust **316.7 K** at a_w 0.25; 46.6 kg/h of the granulation liquid's 48.0 kg/h evaporated; the granules keep 1.32 kg/h, **0.65 %** of their mass (0.037 kg per kg of starch, the isotherm's basis) — `isotherm-reached` |
| Coating dryer | exhaust **317.6 K**; all 43.9 kg/h of the coat's water evaporated; the tablets keep 1.31 kg/h (0.63 %) |
| Air heaters | 72.1 kW each (LP steam), 21.6 m2 each |
| Coated tablets | 206.88 kg/h = 712 800 tablets/h at the flowsheet basis (**0.2902 g** each) |
| Batch plan (section 2a) | lot 305.9 kg of product (300 kg of blend), 143 lots a year; `T_L` 4.25 h (granulation, the fluid bed) and 11 h (tableting, packaging) |
| Fixed capital (the two heaters, the two tanks, the quoted machines scaled with the batch plan, and the building, see 6) | 19.75 MEUR (of it, 14.19 MEUR of bare-module cost is QUOTED placeholders; the building alone 9.5) |
| Land (the layout's plot, 12 321 m2 at 80 EUR/m2) | 0.99 MEUR |
| Operating labour (the DECLARED crew, 10 a shift) | 45 operating positions, 3.70 MEUR/yr (Turton's correlation, for comparison: 152.5 positions, 12.55 MEUR/yr) |
| Revenue / raw materials / COM_d | 15.0 / 0.93 / 14.8 MEUR/yr (150 million tablets: 210 equivalent hours of the flowsheet) |
| NPV (10 %, 10 yr) / IRR | −18.6 MEUR / none (the plant never breaks even) — **not decision-grade, see 6** |

**The two dryers are over-aired.**  Each exhaust leaves at a quarter of
saturation and 17 K below its inlet: most of the heat bought goes out of
the stack.  Halve the air and watch the exhaust temperature, the heater
duty and which limit binds (question 4).

## 6. Sizing, cost and economics

Sized and costed (Turton): the two air heaters (shell-and-tube against LP
steam, U author-set) and the two preparation tanks (their volume from the
batch plan: one lot each).  The run announces that both tanks are **below
their correlation's range** (they are small) — those costs are
extrapolations.

**The coater's air heater is oversized.**  The flowsheet basis is the fluid
bed's drying rate; the coater coats a lot in 4 h, not 1.5 h, so its real
air flow is a little over a third of what the basis gives it.  Its heater
is sized (and priced) at the basis rate — say so, or scale it.

**Quoted, not correlated (DEV.md 4c C98).**  Choupo has no sizer and no cost
correlation for the solid-dose machines or the GMP building, and it does not
invent one; `system/postDict` DECLARES a price for each, in `costing {
quotes ( ... ); }`, scaled with the batch plan by the six-tenths rule
(declared on each quote):

| item | quote (installed, 2026 EUR), at its reference size | kind | scaled to (batch plan) |
|---|---|---|---|
| `granulator` (high shear, with its dosing pump and wet mill) | 700 000 at 1 m3 | equipment | 1.11 m3: 746 634 |
| `fluidBedDryer` (with its air handling; the heater is costed apart) | 900 000 at 1 m3 | equipment | 1.34 m3: 1 070 930 |
| `mill` | 150 000 at 100 kg/h | equipment | 149 kg/h: 190 743 |
| `finalBlender` | 300 000 at 1 m3 | equipment | 1.00 m3: 300 000 |
| `tabletPress` | 1 000 000 at 100 kg/h | equipment | 42.9 kg/h: 601 470 |
| `coatingPan` (with the `coatingDryer`, its drying half) | 800 000 at 1 m3 | equipment | 0.61 m3: 594 236 |
| `packagingLine` | 1 500 000 at 50 kg/h | equipment | 34.0 kg/h: 1 189 791 |
| `productionBuilding` (the GMP building, 44 m x 36 m) | 9 500 000 | facility | not scaled |

**Every one of these numbers is an AUTHOR-SET PLACEHOLDER** — a round figure
of the right order — and each says so in its `source` and `reason`, which
the run prints beside it.  Replace each with a vendor's dated quotation.
The arithmetic (installed vs purchased, the contingency, the auxiliary
facilities) is that of the apalutamide case, README section 6.

**The labour: a declared crew, and Turton's correlation beside it.**  The
crew (`operatingCrew`) is dispensing 1, granulation and drying 2, milling
and blending 1, compression 1, coating 1, packaging 3, material handling 1
— **10 operators a shift**, × 4.5 positions per operator-per-shift = 45
positions, × 42 EUR/h × 1960 h = **3.70 MEUR/yr**.  **Ask whether the 4.5
is right**: it is the cover for round-the-clock operation, and both trains
here run TWO day shifts.  Turton's correlation (P = 6 particulate steps
declared) is printed beside it for comparison: 33.9 a shift.

**Why the NPV is negative, and what it teaches.**  The gross margin
R − C_RM is large (the API and the excipients cost little per tablet); what
sinks the plant is the **fixed cost of a dedicated GMP line** — the
building, the machines and above all the labour, which `COM_d` multiplies by
Turton's 2.73 — carried by ONE generic product at a placeholder price.  A
generic site does not build a building for one product: put the 5 mg
strength and other products through the same suite (the idle 70 % of
section 2a), find the real price and the market share, and decide whether
those continuous-plant factors describe a drug-product plant.  None of it is
decision-grade until the quotes, the staffing and the prices are yours.

## 7. Plant layout

`system/layoutDict` places the sized items on a plot plan and declares the
GMP building they stand in.  **Every process item stands in a room of the
production building** — the binder tank in the granulation room, the
coating-suspension tank in the coating-preparation room, the two air
heaters in the air-handling plant on the technical floor above the rooms
they serve.  **Nothing stands outdoors**: there is no solvent, so there is
no tank farm, no pipe rack and no hazardous area on this site.  The engine
routes no pipe (every stream is indoors, a solid, or comes from a supply
the case does not model) and raises **no finding** on the plot or in the
building.  Two gates (the main one by the offices, a locked emergency one
on the north side) answer the single-entrance question the apalutamide
case leaves open.

**The GMP interior** (`building {}` at the end of `system/layoutDict`;
grammar in `docs/ai/case-layout.md`), 33 rooms on two floors in a
44 m × 36 m × 10 m envelope:

| Area | Rooms | Grade | Pressure to outside |
|---|---|---|---|
| Staff entrance (south) | lobby → gowning → clean corridor | CNC → D | +15 → +25 → +35 Pa |
| Receipt and dispensing (south-west, from the warehouse) | goods-in, a sink material airlock, the dispensary (contained) with a bubble personnel airlock and a sink exit | CNC, D | +15; sinks +5/+10; dispensary +20; bubble +45 |
| Contained suite (north) | the kits through a sink into granulation → drying → milling → final blending → compression, a contained personnel corridor (bubble airlock from the clean corridor) and a contained return corridor for waste | D, contained | rooms +15, suite corridor +25, bubble +45 |
| Coating and packaging (south) | coating preparation → coating → primary packaging → cascade airlock → secondary packaging → the warehouse | D → CNC | +25, +25, +30, +20, +15 |
| Waste | return corridor → sink airlock → waste room → outside (west) | D → CNC | +15, +5, +15 |
| Technical floor | AHU plant (both air heaters), utilities (purified water, compressed air, dust collection), electrical | CNC | +5 |

Grades: an oral-solid-dose suite is not sterile; the product-exposed rooms
are grade D **by analogy** with EU GMP Annex 1 and the rest CNC — the
case's statement, to replace with the company's risk assessment.
**Containment** is declared on every room where the API is an open powder,
**as a precaution**: the exposure band of donepezil hydrochloride is not
known to this case — confirm it from the supplier's safety data sheet
(question 2).  **Combustible dust** (lactose, starch, the API) is not
assessed: the engine can carry a dust zone per room, and the case declares
none because nobody has done that assessment (question 6).

## 8. The critical quality question: blend content uniformity

**A low-dose tablet lives or dies by how evenly its API is spread.**  Here
10 mg of donepezil hydrochloride sits in a 280 mg core — 3.6 % w/w, and
the same blend gives the 5 mg tablet at half the weight.  Every tablet of a
lot of a million must carry its dose within the pharmacopoeia's limits, and
nothing in this flowsheet can tell you whether it does: the granulator and
the blender are `mixer` boxes that conserve mass and **know nothing about
uniformity**.  It is therefore stated here as **the group's question, not
as a calculation**:

- How is the API distributed — dry-blended with the fillers before the
  binder is added (as this case's topology implies), geometrically diluted,
  or **dissolved or suspended in the granulation liquid**?  (Donepezil
  hydrochloride's solubility in water is something to look up: if it
  dissolves in the binder solution, what does that do to uniformity, and to
  the drying?)
- Which pharmacopoeial test applies — **uniformity of dosage units** (Ph.
  Eur. 2.9.40; content uniformity rather than mass variation at this dose)
  — and how is **blend uniformity** sampled before the lot is released to
  the press (sampling thief, stratified sampling of the cores)?
- Where can uniformity be LOST after the blender — segregation in the bin,
  in the press hopper, by vibration in transport — and what in the layout
  and the batch plan prevents it?
- What does that mean for the lot size, the blending time, and the hold
  time of the final blend in section 2a?

**What else Choupo does not model here** — say it in your report: the
granule size and the drying kinetics (the dryers dry to equilibrium, enough
residence assumed); the fluid bed's cool-down step; the impeller's work in
the granulator; the moisture held by the lactose, the cellulose and the
binder; the purified-water plant; dust collection and the filters' pressure
drops.

## 9. The questions the group must answer

1. **The process.** What route does the reference product, or a generic,
   actually use (wet or dry granulation, direct compression)?  The public
   assessment reports of the generic donepezil products are where to look.
   If not wet granulation, what changes in this flowsheet and in the
   building?
2. **Containment.** Find the occupational exposure limit or band for
   donepezil hydrochloride in your API supplier's safety data sheet.  Does
   it justify the contained suite declared here, or can the bubbles and
   sinks become cascades?
3. **The batch plan** (section 2a).  Defend every stage's times, bulk
   density and fill, the lot size and the shifts.  Which stage limits each
   train, and what would you change?  Plan the 5 mg strength beside the
   10 mg one (the two-strength campaign plan): what does the shared
   granulation suite's occupancy become?
4. **The dryers.** Change each dryer's air flow and inlet temperature; what
   do the exhaust temperature, the heater duty and the binding limit do?
   Replace the starch's isotherm with a measured one of your granules —
   what loss on drying do you then get?
5. **The capital and the labour** of section 6: replace each quoted
   placeholder with a quotation and the declared crew with your staffing
   plan, find the price and the market share, and say what the NPV does.
6. **Combustible dust and the coat.** Which rooms need a dust-explosion
   assessment (the fluid bed, the mill, the blenders)?  Titanium dioxide
   (E171) is under regulatory review in medicines in the EU: what would a
   coat without it be?
7. **Content uniformity** — section 8.

## 10. Engine notes

The case was built without any engine change: every grammar it uses
(`solidDryer` on a sorption isotherm, `batchPlan`, declared quotes and crew,
the GMP `building {}` with equipment indoors) was already in place from the
apalutamide case (DEV.md 4c C97–C100).
