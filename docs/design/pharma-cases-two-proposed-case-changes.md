# Two proposed changes to the pharmaceutical plant cases — proposal, nothing applied

**Status: section 1 RULED AND APPLIED (2026-11-13, DEV.md 4c C389 (4)):
candidate B was chosen and applied to `donepezil02_two_strengths`, and the
engine now announces a declared product clean shorter than its train's
campaign changeover (`productCleanShort`, `check_batch_plan` arm (o)); the
62 rows below are the rows that moved, value for value.  Section 2 is still
a proposal.  This note stays as the record of the measurement.**
Each change below was applied to a scratch copy of its case OUTSIDE the
tree, run, and compared with that case's own `expected` golden by
`bin/runTests <scratch copy>` (the copy carries the golden unchanged, so the
FAIL lines are exactly the rows the change moves).  The row lists are for
the coordinator who records goldens; which values the cases declare is the
case owner's decision.  Source: the review by measurement of 2026-11-13,
`docs/reviews/2026-11-13-pharmaceutical-plant-cases/`, findings PH-03 and
PH-04.  Measured on branch `fix/pharma-cases`, cut from main at b4eba1aa1d.

---

## 1. PH-03 — `donepezil02_two_strengths`: a product change costs less time than continuing one product

### 1.1 What the case does today

The train's campaign `changeover` is declared as "a full clean of the suite
and its line clearance, between campaigns of ONE product" (24 h on both
trains, `system/postDict`).  The clean between two DIFFERENT products is
declared per stage as `productChangeover` (2-6 h on the granulation stages,
3-6 h on the tableting stages) and, for the coat's colour, `changeoverTo`
(3-12 h).  The engine's multiproduct rule,
`src/postProcessing/BatchPlanPass.H:207-214`:

```
      after each campaign: the train's `changeover` if the product's next
              campaign follows; after its LAST, the clean before the next
              product in the order (the last wraps to the first):
              C_i = max_j c_ij, c_ij = `changeoverTo { <next> }` at stage j
              if the product declares one, else the stage's
              `productChangeover` -- every stage cleaned at once, once the
              campaign has left the train
```

So the product clean REPLACES the 24 h changeover after a product's last
campaign.  With the declared values that clean is 6 h on granulation and
12 h / 6 h on tableting: changing product costs less time than continuing
the same product, which inverts the lesson the comment beside the 24 h
teaches.  The run publishes it (`The year: 15 campaigns, 2 product changes,
324 h of changeovers` on granulation, 330 h on tableting) and announces
nothing.  No decision moves (occupancies change by about one point); the
lesson does.

### 1.2 The proposal

Raise the declared product cleans so that a product change costs AT LEAST
the campaign changeover.  Two candidates, both measured; the choice is the
case owner's:

* **A — a floor.**  Every `productChangeover` and every `changeoverTo`
  becomes `max(declared, 24 h)`.  Simple, but it ERASES the colour
  direction the case teaches (12 h after the yellow 10 mg, 6 h after the
  white 5 mg both become 24 h).
* **B — the campaign clean plus the product's own.**  Every
  `productChangeover` and every `changeoverTo` becomes `declared + 24 h`
  (granulation 26-30 h, coating 36 h before the white 5 mg and 30 h before
  the yellow 10 mg).  It keeps the direction, and it says in the numbers
  what the comments say in words: a product change is the full clean AND
  the line clearance of a different strength.

Each new value keeps its `source` "author-set assumption"; neither is a
cleaning-validation result.

An engine-side companion is NOT proposed here (it is the engine owner's):
the batch plan could announce a declared product clean shorter than the
train's campaign changeover.

### 1.3 Rows of `expected` each candidate moves

62 rows, all of kind `batch`, the same rows for both candidates; no
`stream`, `kpi`, `equipment`, `utility`, `layout` or `boundary` row moves
(the cleaning water counts cleans, not hours, and the economics reads the
equivalent hours, not the trains' required time).  Both runs exit 0.

| row | expected | candidate A | candidate B |
|---|---|---|---|
| `batch.train:granulation.requiredTime` | 880.25 | 916.25 | 928.25 |
| `batch.train:granulation.occupancy` | 0.229232 | 0.238607 | 0.241732 |
| `batch.train:granulation.changeoverHours` | 324 | 360 | 372 |
| `batch.train:tableting.requiredTime` | 2079 | 2109 | 2127 |
| `batch.train:tableting.occupancy` | 0.541406 | 0.549219 | 0.553906 |
| `batch.train:tableting.changeoverHours` | 330 | 360 | 378 |
| `batch.productTrain:strength10:granulation.productChangeover` | 6 | 24 | 30 |
| `batch.productTrain:strength10:granulation.requiredTime` | 661 | 679 | 685 |
| `batch.productTrain:strength5:granulation.start` | 661 | 679 | 685 |
| `batch.productTrain:strength5:granulation.productChangeover` | 6 | 24 | 30 |
| `batch.productTrain:strength5:granulation.requiredTime` | 219.25 | 237.25 | 243.25 |
| `batch.productTrain:strength10:tableting.productChangeover` | 12 | 24 | 36 |
| `batch.productTrain:strength10:tableting.requiredTime` | 1341 | 1353 | 1365 |
| `batch.productTrain:strength5:tableting.start` | 1341 | 1353 | 1365 |
| `batch.productTrain:strength5:tableting.productChangeover` | 6 | 24 | 30 |
| `batch.productTrain:strength5:tableting.requiredTime` | 738 | 756 | 762 |
| `batch.stage:binderPreparation.occupancy` | 0.172135 | 0.183594 | 0.184635 |
| `batch.stage:binderPreparation.busyHours` | 661 | 705 | 709 |
| `batch.stage:binderPreparation.productChangeover` | 2 | 24 | 26 |
| `batch.stage:granulation.occupancy` | 0.166732 | 0.176107 | 0.179232 |
| `batch.stage:granulation.busyHours` | 640.25 | 676.25 | 688.25 |
| `batch.stage:granulation.productChangeover` | 6 | 24 | 30 |
| `batch.stage:drying.occupancy` | 0.211133 | 0.221029 | 0.223633 |
| `batch.stage:drying.busyHours` | 810.75 | 848.75 | 858.75 |
| `batch.stage:drying.productChangeover` | 5 | 24 | 29 |
| `batch.stage:milling.occupancy` | 0.179622 | 0.191081 | 0.192122 |
| `batch.stage:milling.busyHours` | 689.75 | 733.75 | 737.75 |
| `batch.stage:milling.productChangeover` | 2 | 24 | 26 |
| `batch.stage:finalBlending.occupancy` | 0.150195 | 0.161133 | 0.162695 |
| `batch.stage:finalBlending.busyHours` | 576.75 | 618.75 | 624.75 |
| `batch.stage:finalBlending.productChangeover` | 3 | 24 | 27 |
| `batch.stage:compression.occupancy` | 0.435677 | 0.446094 | 0.448177 |
| `batch.stage:compression.busyHours` | 1673 | 1713 | 1721 |
| `batch.stage:compression.productChangeover` | 4 | 24 | 28 |
| `batch.stage:suspensionPreparation.occupancy` | 0.278776 | 0.288411 | 0.291276 |
| `batch.stage:suspensionPreparation.busyHours` | 1070.5 | 1107.5 | 1118.5 |
| `batch.stage:suspensionPreparation.productChangeover` | 3 | 24 | 27 |
| `batch.stage:coating.occupancy` | 0.280599 | 0.288411 | 0.293099 |
| `batch.stage:coating.busyHours` | 1077.5 | 1107.5 | 1125.5 |
| `batch.stage:coating.productChangeover` | 6 | 24 | 30 |
| `batch.stage:packaging.occupancy` | 0.480729 | 0.491146 | 0.493229 |
| `batch.stage:packaging.busyHours` | 1846 | 1886 | 1894 |
| `batch.stage:packaging.productChangeover` | 4 | 24 | 28 |
| `batch.productStage:strength10:binderPreparation.changeoverAfter` | 2 | 24 | 26 |
| `batch.productStage:strength10:granulation.changeoverAfter` | 6 | 24 | 30 |
| `batch.productStage:strength10:drying.changeoverAfter` | 5 | 24 | 29 |
| `batch.productStage:strength10:milling.changeoverAfter` | 2 | 24 | 26 |
| `batch.productStage:strength10:finalBlending.changeoverAfter` | 3 | 24 | 27 |
| `batch.productStage:strength10:compression.changeoverAfter` | 4 | 24 | 28 |
| `batch.productStage:strength10:suspensionPreparation.changeoverAfter` | 8 | 24 | 32 |
| `batch.productStage:strength10:coating.changeoverAfter` | 12 | 24 | 36 |
| `batch.productStage:strength10:packaging.changeoverAfter` | 4 | 24 | 28 |
| `batch.productStage:strength5:binderPreparation.changeoverAfter` | 2 | 24 | 26 |
| `batch.productStage:strength5:granulation.changeoverAfter` | 6 | 24 | 30 |
| `batch.productStage:strength5:drying.changeoverAfter` | 5 | 24 | 29 |
| `batch.productStage:strength5:milling.changeoverAfter` | 2 | 24 | 26 |
| `batch.productStage:strength5:finalBlending.changeoverAfter` | 3 | 24 | 27 |
| `batch.productStage:strength5:compression.changeoverAfter` | 4 | 24 | 28 |
| `batch.productStage:strength5:suspensionPreparation.changeoverAfter` | 3 | 24 | 27 |
| `batch.productStage:strength5:coating.changeoverAfter` | 6 | 24 | 30 |
| `batch.productStage:strength5:packaging.changeoverAfter` | 4 | 24 | 28 |
| `batch.idleTrain:granulation.value` | 0.229232 | 0.238607 | 0.241732 |

How it was produced: the case copied to a scratch directory, every
`productChangeover <h> h;` and `changeoverTo { <product> <h> h; }` in its
`system/postDict` rewritten by the rule of the candidate (9 + 4 entries),
then `bin/runTests <copy>`; each table cell is the run's value as that
harness prints it.

---

## 2. PH-04 — `apalutamide01_tablets`: a passive heater raises the loop's pressure

### 2.1 What the case does today

In the nitrogen loop the `blower` is declared by its hardware only
(`W_shaft 1000; eta 0.70;`), and its own comment in `system/flowsheetDict`
says "the pressure it reaches is a RESULT": this run's `blowerOut` is at
1.0695 bar.  The next unit, the `gasHeater` (`phaseChanger`), declares
`operation { outletT 393.15 K;  P 1.10 bar; }`, so `dryingGas` leaves a
heater with no work input at 1.1000 bar, 0.03 bar ABOVE its inlet.  The
`exhaustCooler` declares 1.10 bar too; the `solventCondenser` and the
`condensatePot` declare 1.0 bar.  None of the four pressures carries a
source.  The unit accepts a declared outlet pressure without comparing it
with its inlet, `src/unitOperations/heatTransfer/PhaseChanger.cpp:159-162`:

```
    // ---- Outlet pressure: held from inlet unless set explicitly ----------
    const scalar P_out = operDict->found("P")
                       ? operDict->lookupScalar("P", Dims::pressure)
                       : P_in;
```

### 2.2 The proposal for the CASE

Declare the loop's pressures so that no passive unit raises the pressure:

* drop `P 1.10 bar;` from `gasHeater` and from `exhaustCooler`, so each
  holds its inlet pressure (the blower's 1.0695 bar, carried through the
  dryer);
* keep `P 1.0 bar;` on `solventCondenser` and `condensatePot`: the
  condenser then takes the loop's whole drop, 0.0695 bar, which the
  blower's rise covers — the drop the blower's own comment says it stands
  for (dryer, cyclone and filter, condenser).

A later refinement, not measured here, is to give each unit its own
declared drop and let the blower's work be sized on their sum; that is a
case-design decision.  Dropping the condenser's and the pot's 1.0 bar too
would move the condensation (K = Psat / P) and the recovery; this
candidate does not.

### 2.3 Rows of `expected` the candidate moves

15 rows: the two declared pressures as published, and 13 spray-dryer KPIs
that depend on the gas density (velocity, residence time, Reynolds,
Sherwood and Nusselt numbers, the wet bulb).  No stream row moves beyond
its tolerance (the golden pins stream F and T, not P), the drying gas
still enters at 393.15 K and the exhaust leaves at 319.256 K in both runs,
the recycle still converges in 19 Wegstein iterations
(`|Δtear|2 = 9.891e-09`), and `C_UT` (2 052 EUR/yr) and the NPV
(128 116 779 EUR) are unchanged.  The run exits 0.

| row | expected | candidate |
|---|---|---|
| `kpi.SD.Nu` | 2.36718 | 2.36243 |
| `kpi.SD.Re` | 0.444851 | 0.433422 |
| `kpi.SD.Sh` | 2.43111 | 2.42553 |
| `kpi.SD.T_wetbulb` | 284.039 | 283.501 |
| `kpi.SD.h` | 914.989 | 912.552 |
| `kpi.SD.k_c` | 0.458217 | 0.469555 |
| `kpi.SD.residenceTime` | 11.546 | 11.3749 |
| `kpi.SD.rho_gas` | 1.15541 | 1.12426 |
| `kpi.SD.tau_dry_constant` | 0.0454107 | 0.0453499 |
| `kpi.SD.thermalEfficiency` | 0.677248 | 0.673918 |
| `kpi.SD.v_gas` | 0.1117 | 0.114886 |
| `kpi.SD.v_particle` | 0.216526 | 0.219782 |
| `kpi.SD.v_terminal` | 0.104825 | 0.104895 |
| `kpi.exhaustCooler.P` | 110000 | 106949 |
| `kpi.gasHeater.P` | 110000 | 106949 |

How it was produced: the case copied to a scratch directory, the two
`P 1.10 bar;` entries removed from `system/flowsheetDict`, then
`bin/runTests <copy>` and a direct `choupoSolve` run of the copy for the
recycle line and the stream table.

### 2.4 For the engine's owner (a separate line, not implemented)

The announcement the unit could make: a `phaseChanger` (or any unit with no
work input) whose DECLARED outlet pressure is ABOVE its inlet pressure is a
pressure raised by a unit that does no work; the unit could say so, naming
both pressures and the remedy (omit `P` to hold the inlet's, or declare the
rise on a unit that does work).  Whether it announces or refuses is the
engine owner's decision.
