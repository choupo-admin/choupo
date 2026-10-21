# A batch plant on a steady balance

*DEV.md 4c C99, 2026-10-19.  Vítor, on the apalutamide tablet plant: "Este
processo é batch ou é contínuo?" ... "Faz como for melhor!  Neste caso tem de
ficar realista!".  Kind: ADR.  Status: shipped on a branch, the witness's
moved golden rows awaiting Vítor's approval.*

## 1. The finding

`tutorials/batch/plant/apalutamide01_tablets` was a steady state at the campaign
rate (12 800 tablets/h pressed, `streamFactor 0.45`), and every item was
sized for that hourly rate.  A real oral-solid-dose plant runs dispensing,
blending, compaction, compression, coating and packaging as LOTS released by
QC, and its spray drying in CAMPAIGNS.  Sizing a 350 kg-lot blender for
7.4 kg/h of blend is not a design: it is a rate that no machine in the plant
ever sees.

## 2. The decision

**The steady flowsheet stays, and it is read as the MATERIAL BALANCE PER
UNIT OF PRODUCT.**  A new post-processing pass, `batchPlan`
(`src/postProcessing/BatchPlanPass.{H,cpp}`, registered explicitly beside
`sizing`/`costing`/`economics`/`pinchPass`), designs the BATCH PLANT on the
converged balance by the classical single-product method:

* a **stage** groups the flowsheet units of one recipe step and names the
  stream it handles (`holds`); its mass per kg of product `f = r_holds / r_P`
  is READ from the run through the one home of a stream's mass
  (`overallMassFlow`, now public in `result/ResultEmitter.H`);
* a **batch** stage's size factor `S = f / (rho phi)` (declared bulk density
  and fill) gives one vessel `V = S B / N_ip`; a **semicontinuous** stage's
  rate is `R = f B / t_op / N_ip`;
* the stage cycle is charge + process + discharge + clean, a vessel that
  empties through the stage it feeds being held for that stage's processing
  time (`dischargeTime throughFedStage;`);
* a **train** -- stages between two intermediate stores -- is paced by
  `T_L = max t_j / N_op`; lots a year `N = ceil(Q / B)`; a campaign spans the
  first lot's pass and then one lot every `T_L`, plus the changeover; each
  stage's occupancy is its busy hours over its train's available hours; the
  first campaign's Gantt is published as data.

Every input is DECLARED with its unit and a source/reason per block; no
number is wired in C++ but two stated defaults, each said where it is used:
`lowUtilisation 0.25` (announced when undeclared) and the 1 % band within
which a declared operating time agrees with a rated machine's own rate.

**One home for the year's flows.**  The production `Q` is declared once, in
the plan.  The economics reads it with `streamFactor fromBatchPlan;`: every
annual flow is the hourly flow x `Q / r_P`, the "equivalent hours".  A
numeric `streamFactor` beside a batch plan is REFUSED -- two homes for the
same hours disagree the day either moves.  The equivalent hours are not the
hours any train runs (those are the plan's, per train); they are the factor
that scales the per-unit balance to a year, which is why utilities and raw
materials stay right: energy per kg of product is the flowsheet's.

**Three consumers, each opt-in.**  `designRules { volume fromBatchPlan; }`
on a `vessel` (one lot, one vessel; a stage of several vessels is refused
there, because a sized item is costed as one); a declared quote's
`scaling { referenceSize; exponent; exponentSource; }` (`C_p = value x units
x (size per unit / referenceSize)^n`, the reference size's DIMENSIONS
compared with the stage's size kind); and the economics above.

**A rated unit's capacity is the flowsheet's rate.**  For a unit whose
throughput its declared hardware fixes -- today the `sprayDryer`, the one
list in `BatchPlanPass.cpp` -- the flowsheet's rate of the held stream IS
the machine's capacity, so `operatingTime fromFlowsheet;` derives the time
per lot, and a declared time more than 1 % off is ANNOUNCED.  For a
placeholder (`mixer`, `splitter`) the flowsheet rate is a basis, and
`fromFlowsheet` is refused.

**Refuse vs announce.**  An impossible plan refuses with its numbers and
remedies: a stage busier than its train's year (`outOfPhase N+1` and the
hours it would take), a train whose campaigns do not fit.  A defendable but
poor plan is announced: a stage that never limits and is busy less than
`lowUtilisation` of the cycle, a train idle most of its year, a capacity
mismatch.

## 3. Rejected

* **Moving the case to `choupoBatch`.**  It reads no postDict -- no sizing,
  costing, economics or layout -- so the move is an architecture change for
  no physics gain: the solid-dose steps are mass-balance placeholders in
  either binary.
* **The engine deriving the lot or the times.**  A lot is a regulatory and
  an equipment choice; a blend time is the product's.  Both are declared.
* **A numeric `streamFactor` cross-checked against the plan.**  A
  cross-check keeps two homes and refuses one of them; deriving keeps one.
* **Re-integrating campaigns with time-varying lots.**  Every lot is
  identical and every campaign repeats the first: the method's own
  assumption, said in the header.
* **Sizing N parallel vessels through the sizing pass.**  A sized item is one
  vessel and the layout places it by its id; N items would ripple into the
  plot plan.  A stage of several vessels is priced by a scaling quote.
* **Citing a textbook as the source of the arithmetic.**  The method is the
  one taught in batch-process chapters (Biegler, Grossmann & Westerberg;
  Seider et al.), CITED BY TITLE ONLY because neither was read for this
  slice; the arithmetic is stated in full in the pass's header and rests on
  nothing but itself.

## 4. The witness

`apalutamide01_tablets`: production 30 000 kg/yr (about 50 million tablets),
a lot of 350 kg of final blend (B = 358.2 kg of product, 84 lots a year), two
trains decoupled by the dispersion store -- spray drying (7 920 h, 7 lots per
campaign, 48 h changeover; limited by the solution tank held while it feeds
the 47.1 h dryer, `T_L` 53.1 h, 63.6 % of its hours) and the solid-dose suite
(3 840 h on two shifts, 6 lots per campaign, 24 h changeover; limited by the
packaging line, `T_L` 10 h, 36.7 %).  The final blender is announced (22.5 %
of the cycle).  The preparation tanks take their volume from the plan, the
seven machine quotes scale with their stages, and the economics takes the
year from it: FCI 23.06 -> 22.54 MEUR, NPV -45.5 -> -44.6 MEUR.  Every number
is an author-set assumption for the group (README section 2a).

## 5. Not done

The intermediate store between trains is not sized; several products are
made in single-product campaigns since section 6 (no overlapping campaigns,
no rotations, no optimiser of the order); no QC release times; the
labour and the utility schedule do not follow the plan (the economics takes
the year's FLOWS from it, its labour from the declared crew); no GUI drawing
of the Gantt (the data is published in the JSON and
`reports/batchPlan/gantt.csv`).

Gate: `bin/curate/check_batch_plan.py` (recomputes every published number
from the declared postDict and the published stream masses; fourteen
refusals; five by-hand sabotages in its docstring).  Golden kind `batch`.

## 6. Several products on the same stages (DEV.md 4c C110, G2)

*2026-10-20.  Vítor delegated the backlog ("Resolve tudo e delego em ti fazeres
como achares melhor"); item A2 of it.  Status: shipped on a branch, on the
stated default below; NO case moves -- every one-product plan is byte-identical,
and no tutorial uses the multiproduct form yet (the donepezil case, C104, is
being built to).*

**The finding.**  A drug-product plant makes several products -- one API at
four strengths, a 5 mg and a 10 mg tablet -- in CAMPAIGNS on one set of
equipment, and cleans between them: a short clean between two lots of one
product, a long one (cleaning validation, line clearance) between two
products.  Section 5 said the pass made one product only.

**The decision, and the default it rests on.**  `products ( ... )` in place of
`production {}` (both together are refused -- two homes for the year's demand),
`campaignOrder ( ... )` declaring the order of the campaigns, and on every
stage a `productChangeover` beside its `cleanTime`.  The method is the
classical one for a multiproduct plant run in SINGLE-PRODUCT CAMPAIGNS, taught
beside the single-product method in the same chapters (cited by title only, as
in section 3): each product has its own size factors, lot, lots a year and
limiting cycle; each stage is sized for the product that needs the most
(`V_j = max_i S_ij B_i`, published with the product's name as
`sizingProduct`); the year is the sum of each product's campaigns and of the
cleans between them.  The arithmetic is in `BatchPlanPass.H`.  The stated
defaults, each one Vítor may reverse:

* **A product's balance is the flowsheet's** -- the ONE steady balance, read
  per kg of product -- because the commonest case is a dose-proportional
  family of strengths, where the kg of each intermediate per kg of tablets is
  the same and only the demand, the lot and the times differ.  Where it is
  not, `massPerProduct { <stream> <kg/kg>; }` declares a stream's own, and the
  plan ANNOUNCES it (`ownBalance`): the economics' `streamFactor
  fromBatchPlan;` prices every product's raw materials and utilities on the
  flowsheet's one balance, and saying so is the honest alternative to a
  second flowsheet the binary cannot run.
* **What a product may change at a stage is what is the product's**: its
  charge, process (or operating), discharge and between-lot clean times, and
  a batch stage's bulk density and fill.  The equipment -- units, `holds`,
  `feeds`, in/out of phase, the train -- is the stage's, shared.
* **Campaigns are back to back, one rotation a year, in the declared
  order** (the last product wraps to the first): after each campaign the
  train's `changeover` when the same product follows; after a product's LAST
  campaign, the clean before the NEXT product -- and that clean REPLACES the
  same-product changeover, it is not added to it.
* **The campaigns of two products never overlap on a train.**  Every stage
  is cleaned at once once the campaign has left the train, so the train waits
  `max_j c_j`, and each stage is charged its OWN `c_j` in its busy hours.  It
  is conservative, it is the line clearance a GMP suite performs, and it is
  the same non-overlapping shape the one-product plan has always used for its
  `changeover` -- so one product declared through `products` reproduces the
  one-product plan, which the gate holds to 1e-9.
* **The order matters only through `changeoverTo`.**  With a clean that
  depends on the stage alone, every cyclic order costs the same; a clean that
  depends on which product comes NEXT (`changeoverTo { <product> <time>; }`
  inside a product's stage block -- low to high potency, light to dark coat)
  is what makes the order a decision, and the gate proves the year moves with
  it.  A `changeoverTo` the current order does not use is kept and read (the
  student may reorder); `changeoverAfter` in the result says which clean each
  product's last campaign took.  No optimiser: the order is the student's.

**The Gantt.**  For one product it is unchanged (the first campaign).  For
several it is the YEAR of each train in the declared order: every campaign
(kind `campaign`), every changeover (`changeover`, `productChangeover`),
each stage's own clean at a product change (`stageClean`), and the lots of
each product's first campaign (`lot`), timed from the start of the year;
the last bar of each train ends at its required time.

**Rejected.**

* *Overlapping campaigns* (stage 1 starts the next product while stage 5
  finishes the last) -- a shorter year, and a schedule a flow-shop algorithm
  must build; not a default to take silently.  Named, not built.
* *Several rotations a year* (A B A B ...) -- trades changeovers for
  inventory, a real lesson; it needs the inventory it trades against, which
  nothing sizes.  Named, not built.
* *A full changeover matrix at the plan level* -- `changeoverTo` inside the
  product's own stage block is the same matrix, kept beside everything else
  that product changes at that stage.
* *Deriving each product's times from a rate the engine does not have* (a
  press in tablets per hour, a tablet mass per strength) -- the times are
  declared, as for one product.

**What it found.**  The probe in the gate -- a copy of the witness making
three strengths (20 000, 8 000 and 1 500 kg a year; the second with its own
300 kg lot, its own coat and faster press and blister times, the third on a
slower bottle line) -- makes 56, 27 and 5 lots (88 against the one-product
plan's 84 for 29 500 kg against 30 000), and the solid-dose suite needs
1 394 h a year against the one-product plan's 1 410.5 h: the second strength's
shorter cycle pays for 338 h of changeovers -- 312 h between campaigns of one
product (the train's 24 h) and 26 h for the three product changes, 8 + 10 +
8 h, the 10 h because the second strength's dark coat needs it at the coater
before the third.  Its press and its blister line are SIZED by the second
strength (it asks them for the highest rate), and the scaled quotes follow.  In the order B A C the same
year is 1 392 h: the two hours the coat costs when it is followed by the
third strength.  That is the whole lesson of sequencing in this method, and
it is only visible because the clean depends on what comes next.

Gate: `check_batch_plan` arms (h)-(l) -- a three-product probe built in the
gate from a copy of the witness (no new tutorial), recomputed independently
(per product, per (product, stage), per (product, train), the aggregates, the
year's Gantt, the findings); the declared order moving the year by exactly the
clean `changeoverTo` adds; one product through `products` against the
one-product plan; twenty refusals; the golden rows of every new record.
