# `donepezil02_two_strengths` — donepezil hydrochloride 5 mg and 10 mg tablets: ONE plant, TWO products, in campaigns

## Mission

1. **Explain the base result.**  The plant makes 150 million tablets
   (34 828 kg) in 115 lots and loses money: NPV −28.96 M EUR.  Find the term
   of COM_d that makes the loss (compare 2.73 C_OL with 1.23 (C_RM + C_UT) in
   the Economic Appraisal), and use the **Bases** table of the batch plan so
   that 300 kg, 305.9 kg, 168 h, 928 h, 2127 h and 3840 h each mean one thing.
2. **Find the constraint that matters.**  Two different words: the
   **limiting stage (sets T_L)** of each train — drying (4.25 h a lot) on
   granulation, packaging (11 h a 10 mg lot, 20 h a 5 mg lot) on tableting —
   and the machine with the **least capacity margin**, the granulator at
   92.8 % of its bowl.  Say which one limits the lot and which one the year.
3. **Propose one improvement and justify it with a new run.**  Change ONE
   declaration (the crew, the lot, `outOfPhase 2` on packaging, the campaign
   length), run again, and show the number that moved and the one that did not.

A BASE CASE for a pharmaceutical-industry project group (DEV.md 4c C249).
It takes the plant of `donepezil01_tablets` (wet granulation, an aqueous
coat, the API bought) and asks the question that case could not answer:
**how is a year divided between two strengths made on the same equipment,
and what does it cost to change from one to the other?**  The answer is a
**multiproduct batch plan** — single-product campaigns in a declared order,
a clean between products that depends on the **direction** of the change,
and a Gantt chart of the year.  **It runs (in seconds), it is deliberately
NOT optimised**, and every number a group would change is a plain key, said
to be an assumption where it is declared.

```bash
source etc/bashrc
runCase tutorials/batch/plant/donepezil02_two_strengths
```

The case is sealed: everything it reads is in its own `constant/`.  The
flowsheet, the components and the building are `donepezil01_tablets`'
own, unchanged (read that README for the chemistry, the dryers and the
questions about content uniformity); this one is about **the plan**.

## 1. The two products, and where each fact comes from

| Fact | Source | Verified? |
|---|---|---|
| **10 mg**: 10 mg of donepezil hydrochloride, 174.33 mg of lactose; **yellow**, debossed ARICEPT / 10 | UK SmPC, *ARICEPT 10 mg film coated tablets*, Eisai Ltd, emc, sections 2 and 3 | read for `donepezil01_tablets` |
| **5 mg**: 5 mg of donepezil hydrochloride, 87.17 mg of lactose (half the 10 mg figures); **white**, debossed ARICEPT / 5 | UK SmPC, *ARICEPT 5 mg film coated tablets*, Eisai Ltd, emc; the Irish (HPRA) SmPC | read for `donepezil01_tablets` |
| The 5 mg tablet is **the 10 mg tablet at half the weight** (one common blend pressed at two weights: 140 mg core against 280 mg) | an inference from the two SmPCs' lactose ratio, labelled so in `donepezil01_tablets` README section 1 | **inference** |
| The 5 mg coat has **no yellow iron oxide** | the SmPCs' colours; the 1 % pigment share is the 10 mg coat's author-set composition | inference |
| **Demand**: 90 million 10 mg and 60 million 5 mg tablets a year | **author-set market assumption**, not a market study.  150 million is `donepezil01_tablets`' total, split 3:2 as a dose-escalation pair is (start on 5 mg, most maintained on 10 mg) | **NOT verified** |
| **Prices**: 0.10 EUR a 10 mg tablet, 0.06 EUR a 5 mg tablet | author-set placeholders (`constant/economics`) | **NOT verified** |
| **Every time, density, fill, clean and crew number** | author-set assumptions, said so in each `source` | **NOT verified** |

## 2. The production basis

| Quantity | 10 mg | 5 mg |
|---|---|---|
| Packed tablet | 0.29023 g | 0.145115 g (half) |
| Year | 90 million = **26 121 kg** | 60 million = **8 707 kg** |
| Lot | 300 kg of final blend, **1.07 million cores** | the SAME 300 kg bin, **2.14 million cores** |
| Lots a year | **86** | **29** |
| Press and packaging time per lot | 7 h / 9 h | **14 h / 18 h** (same tablets an hour, twice the tablets) |

**One steady flowsheet serves both**, because the 5 mg tablet is the same
blend at half the weight: a kilogram of either carries the same kilograms of
every ingredient, and the batch plan reads its balance **per kg of product**
(`BatchPlanPass.H:189-193`).  The one thing that would differ — the 10 mg
coat's 1 % yellow iron oxide, 0.03 % of the tablet — is ignored here and
said so; a group that wants it declares a `massPerProduct` for the coating
suspension and the plan announces `ownBalance`.

## 3. The campaign plan (run it and read the BATCH PLAN block)

Two trains decoupled by the final-blend store, as in `donepezil01_tablets`;
`lotsPerCampaign 8` and a 24 h full clean between campaigns of ONE product.
Between the two products every stage has its own clean (`productChangeover`):
the train's 24 h campaign clean PLUS the product's own part (a rinse check,
the press tooling, the printed packaging), never less, so changing product
never costs less time than continuing one; a product clean declared below
the campaign changeover is announced.  The train waits for the slowest.  **The Gantt of the year**
(`campaignOrder ( strength10 strength5 )`):

| | granulation train | tableting train |
|---|---|---|
| 10 mg: lots, campaigns, hours | 86 lots, 11 campaigns, 685 h | 86 lots, 11 campaigns, 1 365 h |
| limiting stage, `T_L` | fluid-bed dryer, 4.25 h | packaging line, 11 h |
| clean, 10 mg then 5 mg | **30 h** = 24 + 6 (granulator) | **36 h** = 24 + 12 (the coating pan) |
| 5 mg: lots, campaigns, hours | 29 lots, 4 campaigns, 243 h | 29 lots, 4 campaigns, 762 h |
| limiting stage, `T_L` | fluid-bed dryer, 4.25 h (the lot is the same) | packaging line, **20 h** |
| clean, 5 mg then 10 mg (the year repeats) | 30 h = 24 + 6 | **30 h** = 24 + 6 |
| **The year** | 15 campaigns, 2 product changes, **928 h = 24.2 %** of 3 840 h | 15 campaigns, 2 product changes, **2 127 h = 55.4 %** |

The tableting train is paced by the **packaging line for both products, but
at 11 h a lot for one and 20 h for the other**: the limiting stage is a
property of the product, not only of the plant.  Equipment is sized for the
product that needs the most (the plan names it, `sizing by`): here the 10 mg
for every stage, because the 5 mg lot is the same mass and only takes longer.

**The clean depends on the direction (colour carry-over).**  A trace of
yellow iron oxide left in the coating-suspension tank, the spray lines and the
perforated pan shows as specks on a white tablet; a trace of white pigment in
a yellow coat does not show.  So the clean *before the white 5 mg* is the
long one — the 24 h campaign clean plus 8 h at the suspension tank and 12 h
at the pan (32 h and 36 h) — and the clean before the yellow 10 mg the short
one, 24 h plus 3 h and 6 h.  It is declared on the product that has just
finished, `changeoverTo { strength5 36 h; }`
(`BatchPlanPass.H:173-177` shows the grammar).  The hours are author-set
placeholders, **not cleaning-validation results**: in a real plant they are
the time to clean **and prove** the equipment clean (swab or rinse sampling
against a limit set for the product that follows — EU GMP *Annex 15*,
cleaning validation, cited by title).  Both strengths contain the **same
API**, so the clean is about line clearance (no strength mixed up) and the
coat's colour, not about one drug contaminating another: a different API in
the second campaign would need a far longer one.

### The decision, and why the order matters less than it looks

`campaignOrder` is the student's decision; the engine never takes it.
**With two products, in this plan, it does not change the year at all.**
Swap it to `( strength5 strength10 )` and the hours are identical (928.2 h and
2 127 h): the plan wraps the clean after the last campaign round to the
first product, so both directions are paid once whichever product goes first,
and only the Gantt chart — who is made first — changes.  **The order becomes
a decision with three or more products, and then only through the
direction-dependent cleans** (`BatchPlanPass.H:219-224`): a campaign order in
which the products that stain follow the ones that do not.  Add a third
product to see it (the 23 mg tablet exists; its data is not in this case).
What justifies one order over the other here is not the clean but the
business: make the high-volume 10 mg first so its stock is built while the
5 mg waits, and end the year on the product whose next clean is the short one.

**What this plan does not do**, said (`BatchPlanPass.H:286-297`): one
rotation a year (each product's campaigns back to back, so the 10 mg stock is
built over 17 weeks of the year; several rotations trade changeovers for
inventory and are not built); the two products never overlap on a train (the
next waits until the whole train is clean — a GMP line clearance, and
conservative); no mixed-product campaigns; no optimiser of the order; the
intermediate store is not sized.

## 4. Where each deliverable appears

| Deliverable | Where |
|---|---|
| The multiproduct plan: lots, campaigns, `T_L`, limiting stage, clean per direction, occupancy | the `=== BATCH PLAN` block of the log; `reports/batchPlan/{products,productTrains,productStages,stages,trains}.csv`; the GUI's **Batch plan** section |
| **The Gantt chart of the year**, every campaign, lot and clean | `reports/batchPlan/gantt.csv` (222 bars); the GUI's Batch plan section draws it |
| **The bases**: the declared lot, the lot's product mass, the balance's rate, the equivalent hours, each train's year and its available hours, the hours every annual flow cost uses — each with its definition | the `BASES` lines under the BATCH PLAN block; `batchPlan.bases` in the result; the GUI's Batch plan section |
| **Each strength per tablet** (`dosageUnit` in each product): mg of every ingredient, tablets per lot and per year, the moisture by mass | the `DOSAGE FORM` tables in the log; `batchPlan.dosage`; the GUI's Batch plan section and the `packagedTablets` stream view |
| The two preparation vessels sized on the plan, the two air heaters, **the seven machines checked against a rating for each strength**, **the cleaning water and effluent per product**, **the air of each grade and the purified water** | `Equipment Sizing` block; the `cleaning of the machines` table; `Clean utilities` blocks; `design/<unit>/` sheets; `reports/equipment/equipmentList.csv` |
| Costing from declared, labelled quotes that scale with the plan | `Costing` block (`costing { quotes }` in `system/postDict`) |
| Economics: capital, the declared **operating crew** (10 operators a shift), NPV, **working capital** (`reports/economics/workingCapital.csv`), **land** (priced on the layout's plot), cash flow | the `Economics` block; `reports/economics/cashFlow.csv` |
| **Sensitivity** to the blended price | the table under the economics; `reports/economics/sensitivity.csv` |
| The **GMP building** (33 rooms on 2 floors: grades, pressure cascade, airlocks, routes) and the site, with 0 findings | `system/layoutDict`; the `[building]` and `[layout]` lines; the GUI's Layout section |

**The three tools of `donepezil01_tablets`, now over two products** (DEV.md
4c C249 d; each ANNOUNCES that it ran over 2 products):

| Tool | What it does for two strengths | Numbers (run it) |
|---|---|---|
| `cleaning ( ... )` in the plan | counts the cleans **per product**: a clean after every lot of each strength, at each campaign changeover of a product and at each **product** changeover; water and effluent summed | 780 cleans a year, 454.5 m3 of purified water, 431.8 m3 of effluent (97 + 33 cleans a machine for the 10 mg and the 5 mg at a one-instance machine, i.e. 86 + 29 lots plus the changeovers); per-product rows in the log and `kpis.cleaning` |
| `ratedMachine` sizers | checks **each machine against each strength's lot and operating time**; the refusal names the strength that does not fit; `itemMassByProduct` gives the 5 mg its half-weight tablet | the granulator is the tightest (92.8 % for both strengths: the same 300 kg bin), then the dryer (89.1 %), the blender (85.7 %), the press (77.3 %: 14 h for the 5 mg at the same tablets an hour) |
| `cleanUtilities` | the **HVAC is room-based**, so it does not depend on the product mix and is computed once; the **purified water** is drawn per lot of each strength and summed (86 + 29 lots) | 3.14 m3 a lot (the same bin for both), 470 m3 a year, peak 1.33 m3 h-1, generator 1.67 m3 h-1, tank 5.3 m3 |

The building is priced as `donepezil01_tablets` prices it: 5 240 EUR/m2 for
the shell plus the two `hvacGrade` supply-air quotes (the earlier all-in
6 000 EUR/m2 is gone).  What is still not computed for a plan of several
products: the wait for QC release between campaigns and any optimisation of
the order (`BatchPlanPass.H`, WHAT IS NOT DONE).  And, as in
`donepezil01_tablets` (its section 6), the running energy of the clean
utilities is sized and NOT priced: the printed `C_UT` = 1 051 EUR/yr is the
two air heaters' steam and the final blender's chilled water, while the
same run sizes a 51.5 kW HVAC fan (about 452 MWh, 45 kEUR a year if the
building is ventilated all 8 760 h — an assumption), 134 kW of winter
heating and 90 kW of summer cooling (design-day peaks), and 470 m3 a year
of purified water, none of which reaches the bill.

## 5. What the group changes for its own drug

1. **The products.**  Copy the folder; change `products ( ... )` — a name, a
   `perYear` in kg, and the `source` of each.  A product with its own lot or
   its own tablet weight declares `lot { ... }` and the `stages` that differ
   (here the press and packaging times); one with its own mass balance
   declares `massPerProduct`.
2. **The demand.**  Replace the 90 / 60 million with a market study; redo the
   blended price in `constant/economics` (its header shows the division).
3. **The cleans.**  `productChangeover` per stage, and `changeoverTo` where
   the direction matters (colour, a potent API after a non-potent one, an
   allergen), each the train's campaign clean plus the product's own part.
   Replace every hour with your cleaning-validation protocol's.
4. **The order.**  Try both; then add a third product and watch the year move.
5. **The lot and the campaign length.**  `lot`, `lotsPerCampaign`, the
   trains' `changeover` — and read which stage limits, and for which product.
6. **The economics.**  Every price, quote and crew number is a placeholder to
   replace with a dated quotation or your staffing plan (README of
   `donepezil01_tablets`, section 9).

## 6. The questions the group must answer

1. Is the clean before the white product really longer than the one after it
   — and by how much, for *your* pigment and *your* pan?  What does the
   cleaning-validation limit for a visible residue look like?
2. The granulation suite is idle 76 % of the year even with both strengths.
   What else would the site make on it, and what would that do to the clean?
3. The packaging line limits the tableting train for both products.  Add a
   second line (out of phase: `outOfPhase 2`) or lengthen the shifts: which
   moves the year more?
4. With one rotation a year the 10 mg stock is built over 17 weeks.  What
   inventory does that mean, and what does a second rotation cost in cleans?
5. Is a 3:2 split right?  Move it and watch the year and the NPV move.
6. Would a third strength change the order?  Which?

## 7. Engine notes

Built without any engine change: the multiproduct plan is C110 G2
(`src/postProcessing/BatchPlanPass.{H,cpp}`), and the gate that recomputes
every number it publishes is `bin/curate/check_batch_plan.py`, on a
three-product fixture.  This is the first shipped case that declares
`products`.  The golden `expected` pins the streams; the plan's numbers are
pinned by the batch rows of the same file.
