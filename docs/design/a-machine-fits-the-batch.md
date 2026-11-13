# A machine fits the batch, and the building's air and water are sized from the building

*DEV.md 4c C195, 2026-11-02.  Vítor: "vê o que falta de importante ao Choupo
para servir de apoio aos meus dois grupos" -- the two pharmaceutical project
groups of 2026-27 (base cases `apalutamide01_tablets`, `donepezil01_tablets`).
Gaps (1) and (2) of the survey of 19 old reports: the solid-dose machines the
two cases carry as mass balance only, and the clean utilities.*

## The decision, on a stated default

Both items are **declared-rating checks with no new physics**, built as the
sizing-pass shape the engine already has (a rating sizer that READS the unit's
own size and the batch plan, like `CatalystBedSize`) plus one small
post-processing pass.  The commander's default; Vítor may reverse it.

## Item 1 -- `type ratedMachine`: does the machine fit the lot and the shift

A blender, roller compactor, mill, screen, tablet press, coating pan and
packaging line are `mixer`/`splitter` units: they move mass and model no
machine (README section 3 of both cases).  The question 14 of the 19 reports
answered in Excel -- *does a machine of this vendor rating take this lot in
this time* -- was therefore computed nowhere.  `RatedMachineSize`
(`src/postProcessing/sizing/`) answers it:

* **A rating is the case's fact, with a source and a reason.**  `rating { ...;
  source "..."; reason "..."; }`; a missing key refuses by name, no default is
  taken, no machine catalogue is shipped.
* **Four kinds**, a declared word that refuses an unknown one:
  `batchVolume` (nominal volume x maximum fill against the lot's working
  volume), `massRate` (kg/h against the mass per lot over the stage's
  operating time), `tabletPress` (stations x rpm x 60 x compressions per
  revolution against tablets per hour) and `packagingLine` (packs per minute
  x 60 against packs per hour).  The count kinds take the mass of one item
  (`itemMass`) from the case.
* **Everything the load needs is READ**, never re-derived: the stage, its
  operating time, cycle, bulk density and mass per lot from `result.batchPlan`;
  the mass a rate machine handles from its inlet streams through
  `overallMassFlow`, scaled by the plan's own lot hours (lot size over product
  rate).  A unit in no stage, a multiproduct plan or a stage of the wrong type
  refuses by name.
* **Utilisation = load / (machines x rating).**  Above 100 % the sizer
  *refuses* and names the count that would carry the lot; `installed { count
  N; source; reason; }` is the declared second unit that makes it legal.
  Above 0.85 (a stated threshold, `announceAbove` to own another) it
  *announces*.  An optional `shift { length; ... }` announces a lot that
  spans shifts (a rate machine: the run time at the rating; a batch machine:
  the plan's cycle).
* **Not costed, not placed.**  No Turton set exists for a process machine and
  none is invented, so `notCostedBecause` says the case's declared quote is
  the money; and the machine stands in a room, so the plot plan skips it
  (`notPlacedBecause`).  The second is a new field of `EquipmentSizing`, and
  the reason it exists is measured: without it a sized `mill` stops being a
  junction on the pipe rack (the router reads "sized and unplaced" as "has an
  item") and `layout summary unplaced` moves from 0.
* **A quote beside a not-costed item is legal.**  `DeclaredQuote` refused a
  `unit` quote for any unit the sizing pass touched ("would price it twice");
  it now counts only the units a correlation prices.

## Item 2 -- `cleanUtilities`: HVAC and purified water from the building

A post-processing pass declared after `economics` in `postDict`.  It runs
after the layout (`main.cpp` checks the layout before the first of
`economics` and `cleanUtilities`), so it reads **`result.building`**, the
rooms exactly as `BuildingLayout::evaluate` parsed them -- one parse, no
second reader of the rooms.

* **HVAC.**  Per room: volume = plan area x height; supply = the grade's
  declared air changes per hour x volume; fan power = flow x declared
  pressure rise / efficiency; the sensible heating (winter) and cooling
  (summer) duty to bring the declared fresh-air share from the declared
  outdoor design temperature to the declared supply temperature.  Published
  as one item per grade present and one total.  `unserved { rooms (...); }`
  names the plant rooms the air plant does not serve (each must be a room).
  **Every run announces what is not here**: humidity, latent load, room heat
  gain, the return-air state.
* **Purified water.**  Demand per lot = declared water streams (kg per lot
  from the balance, over a declared density) + declared volumes per lot; the
  peak is the largest sum of the declared draws that overlap in the plan's
  Gantt; the generator is rated at peak x (1 + margin); the storage tank holds
  a declared hold time of the peak.
* **The air-change rates are the case's, one per grade, with a source and a
  reason.**  The published tables are no-grant standards; none is shipped and
  none is typed here as if sourced.  The shipped cases declare them as
  author-set assumptions, said so.  A grade present with no declared rate
  refuses by name.

## What was rejected

* **A machine catalogue** (vendor ratings by model) or a **table of air
  changes by grade** shipped in the engine: the first is vendor data nobody
  here may redistribute or keep current, the second is a no-grant standard.
  Both are the case's declarations.
* **HVAC inside `SizingPass`.**  The sizing pass runs before the layout, so it
  cannot see `result.building`; reading the layout dictionary a second time
  from a sizer would have been a second parser of the rooms.  A pass after the
  layout reads the record the layout already produced.
* **One item per room.**  Twenty-five sheets for one air plant is noise; an
  air-handling unit serves a grade zone.  The per-room table is printed on the
  run, and a gate recomputes it from the dictionaries.
* **Machine physics** (Johanson roller compaction, Heckel/Kawakita compaction,
  blend uniformity): a separate phase (DEV.md C195), not smuggled into a
  rating check.
* **Costing the new items.**  Pricing a `ratedMachine` or an air plant by a
  correlation this engine does not have would convert *unpriced* into *falsely
  priced*; the quotes already in both cases carry the money.

## What it measured on the two cases

See the commit message and `check_tablet_machines` (the numbers are recomputed
from the dictionaries every run).  The point a student takes away: the 400 kg
final-blend lot of apalutamide runs a 1.2 m3 bin at 95 %, and the press that
the batch plan assumes at 143 000 tablets an hour has 12 % margin on a
162 000 tablets/h nameplate (utilisation 0.88) -- all are *ratings the group
must replace*, and the check turns that replacement into a visible
consequence.

## Consequences found while building it

* A rated machine and its quote share a name.  The result JSON emits that as
  ONE `equipment` line, as the quote's was before the sizing existed: `basis`
  keeps the quote's words (the golden pins them, so no existing row moves) and
  the sizer's rule travels as `sizingBasis`; the quote's `source`/`reason`
  ride on the merged line.
* A rate of events (tablets an hour, revolutions a minute) had no unit word,
  and the design sheet refuses a value whose unit the dict grammar does not
  know.  `1/s`, `1/min` and `1/h` are registered (`core/Units.cpp`, mirrored
  in `gui/src/dict/units.ts`).
* Only a declared `installed` count above the plan's can exercise the
  installed-count arithmetic, since both shipped cases run one machine per
  stage; the gate does it on a fixture.

## Item 3 -- the press rated on dwell time, and the force a tablet needs (C270)

*DEV.md 4c C270, 2026-11-09 and 2026-11-13.  Vitor, on his class
demonstration of choosing a rotary press: the press must be rated on the
formulation's dwell time, with an optional overall equipment effectiveness
that does not count the rejects twice; and, reading what the apalutamide case
says of its press: "Mas não há um modelo de design que entra com
propriedades mecânicas dos excipientes?!" -- then "Avança com os dois, um
único material ajustado."*

Two checks were added to the `tabletPress` kind, as optional blocks of the
press's `designRules`, each with `source` and `reason`; absent, the run says
the press was NOT checked for dwell time and for compaction force, and no
number of the three shipped plants moved.

* **`dwell { punchFlat; pitchCircle; minimumDwellTime; }`.**  Kinematics:
  t = L / (pi D n), n_max = L / (pi D t_min).  The dwell-limited capacity is
  published beside the catalogue's, the utilisation uses the lower, and a
  binding limit is announced (stderr, the caveat block, the item, its basis).
* **`effectiveness { availability; performance; quality; }`.**  OEE scales
  the capacity.  Its quality factor already counts the rejected tablets, so
  quality below 1 on a press whose flowsheet splits off a reject stream is
  announced as rejects counted twice, with both numbers.
* **`compaction { heckel {}; ryshkewitch {}; targetTensileStrength;
  punchTipArea; maxCompressionForce; [trueDensity]; }`.**  ONE fitted
  material.  The Ryshkewitch-Duckworth curve inverted gives the porosity at
  the target strength, the Heckel line inverted the pressure at that solid
  fraction, the punch tip area the force; a true density adds the
  flat-faced tablet's thickness.  The forward and inverse forms live in ONE
  header, `src/propertyOps/CompactionLaws.H`, which the `compactionFit`
  bench also calls, so the constants the bench fits are read by the press
  with no second transcription (both bench witnesses' goldens unmoved).
  Refused: a target at or above sigma_0, a non-positive constant, a solid
  fraction the line reaches only below zero pressure, `K` beside `Py`.
  Announced: a pressure outside the Heckel window, the two curves on
  different bases (in-die / out-of-die), a force above `announceAbove` of
  the maximum.

**The batch plan is not re-timed.**  C270 said "the batch plan uses the
lower".  Taken as the smallest step that changes no existing number: the
SIZER rates the press on the lower capacity and refuses a press that no
longer fits the plan's declared operating time; the plan's own stage time
stays the case's declaration.  Whether the plan should derive its operating
time from the rated press is Vitor's decision (it would move every plant's
Gantt).

**Witness.**  `tutorials/batch/plant/tabletPress01_dwell_and_force`: the
bench's own MCC constants (compaction01_mcc, op mcc_inDie, held to its
golden by the gate), a 2 MPa target, an 11.28 mm flat-faced punch: 29.7 MPa,
2.97 kN; a 75 rpm catalogue press that runs at 50.9 rpm for a 10 ms dwell.

### What was rejected

* **A mixture rule** for the Heckel or Ryshkewitch-Duckworth constants of a
  blend.  The bench's own witness found the published ternary data does not
  follow a simple average, and Vitor ruled "um único material ajustado": the
  case declares the curves of the formulation as measured, or of the
  excipient that dominates it, and every run says no mixture rule exists.
* **Computing the minimum dwell time.**  It is a property of the
  formulation, measured (a compaction simulator); an open study found pure
  MCC insensitive between 10 and 130 ms and a starch sensitive.  No model
  here predicts it, so it is declared.
* **A hardness model** beyond the fitted strength curve: no capping,
  lamination or breaking-force prediction.  The target is a tensile
  strength, the quantity the fitted curve carries.
* **Re-timing the batch plan** (above): it would move every shipped
  plant's numbers, and that is the owner's call.

## Gate

`bin/curate/check_tablet_machines.py` (`tablet-machines-gate` in `bin/runTests`):
independent recomputation of every utilisation, the room volumes, supply
flows, fan powers, duties, the water demand and the peak from the case
dictionaries; the refusals fired on copies of a shipped case; the quote
legality; and the layout summary unchanged.  Since C270, arm (f): the dwell, effectiveness and compaction numbers
recomputed from the witness's declaration, its four constants held to the
bench's golden, the refusals and announcements fired on copies, and the
negative on the three shipped plants.
