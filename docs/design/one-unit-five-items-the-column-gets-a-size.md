# One unit, five items: the column gets a size, a cost and a specification sheet

*Task #79, authorised by Vítor 2026-09-07.  Shipped the same day.*

## What was missing

The distillation column was the only major unit operation in Choupo with **no
sizer, no cost and no specification sheet**.  `SizingPass` picks a sizer by the
unit TYPE name, found nothing registered for `distillationColumn`, caught the
refusal by name and listed the column under `notSized`.  Honest — and useless to
a student who has to hand in a design project, because the column is usually the
most expensive thing in it.

Measured before deciding (2026-09-07):

* `EquipmentSize::registerBuiltins()` registered **eight** sizers; none for a
  column.
* **30 tutorial cases declare a `distillationColumn`; zero shipped a
  `system/postDict`.**  No column had ever been through sizing or costing.
* `TrayHydraulics` already computed the hydraulics — Souders & Brown with Fair's
  capacity parameter, `Stage::diameterRequired` per tray — and its whole answer
  reached the reader as a console table and **died there**: no KPI beyond the
  global diameter, no result block, no golden, no sizer.  A column cannot be
  sized from a printed table.

## The shape: 1:N, and it was built for exactly this

`DesignSheetWriter`'s own header chose `design/<SECTOR>/<unit>/<equipmentTag>`
as 1:N with N = 1 and said, in its own words, *"the day a column yields five,
the directory gains siblings and nothing above it changes."*  This is that day,
and that promise is what the slice was held to.

    design/column09/shell        the tower          costed as a vertical vessel
    design/column09/trays        the tray stack     NOT COSTED
    design/column09/condenser    shell-and-tube
    design/column09/reboiler     shell-and-tube
    design/column09/refluxDrum   a drum             costed as a vessel

What it cost above the writer: `EquipmentSize::size()` returns a
`std::vector<EquipmentSizing>` instead of one record (every other sizer gained
`return { d };`), and `EquipmentSizing` gained `equipmentTag` plus **`itemId()`,
the ONE home for how an item is identified** — the unit's own name where a unit
realises one piece of equipment, `<unit>/<tag>` where it realises several.
`result.sizings` and `result.costs` are keyed on it.  Nobody splits it: a reader
that wants the unit reads `unitName`, a reader that wants the item reads
`equipmentTag`, and both travel as data on the record.  That is why every case
that predates this change is byte-identical: with one item the id IS the unit
name.

## NOT NEW PHYSICS — where each number comes from

* **The diameter** is the tray hydraulics'.  `TrayHydraulics` now also applies
  its own rule ("the widest tray sets it") to each SECTION and publishes
  `diameter_rectifying` / `diameter_stripping`; the rule stays in one place.
* **The tray COUNT** comes from the pass that ENUMERATES trays, and this is the
  defect the slice paid for.  The sizer first computed `nStages - 2` — "the
  condenser and the reboiler are stages, not trays" — and it was **wrong by
  one**: this solver's stage list carries the reboiler and NOT the condenser, so
  the hydraulics rates 14 trays where that rule says 13, and the tower came out
  half a tray spacing short.  `TrayHydraulics` decides what is a tray by asking
  whether the stage carries vapour traffic, which is the FACT rather than a rule
  about the fact.  It publishes `nTrays` and nothing re-derives it.
* **The two duties** are the column's own `Q_condenser_kW` / `Q_reboiler_kW`,
  published by both solver paths since long before this.  U and the approach
  temperature do NOT follow from a converged column — they are a choice about
  the SERVICE — so the case declares them and a missing one refuses the item by
  name.  No default U is ever substituted: a default U would be priced into the
  capital cost as though somebody had chosen it.
* **The exchanger rule has one home.**  `ShellTubeHX::sizeFromDuty` was
  extracted so `ColumnSize` reaches `A = Q/(U·LMTD)`, the shell weight, the
  basis sentence and the five declared units through the same code a heater
  does.
* **The vessel WALL has one home** (`src/postProcessing/sizing/VesselMechanics.H`).  The ASME
  thin-wall formula and the shell weight were written out identically in
  `StirredTank.cpp` and `VesselSize.cpp`; the column needed them twice more.
  No number moved.
* **The drum** needed a LIQUID volumetric flow, and `VesselSize` could not
  serve: its volumetric flow is the IDEAL-GAS `N R T / P`, which on a
  condensate is wrong by about three orders of magnitude.  A sizer holds no
  thermo package, so the COLUMN publishes `Q_condensate_m3_s` — the vapour
  leaving the top tray, condensed, priced at the liquid density of the top-tray
  temperature.  The state it was evaluated at is in the sizer's basis sentence,
  so it travels with the number instead of being remembered.

## THE TWO SECTION DIAMETERS, AND THE SWAGE RULE

The flooding diameter follows the vapour VOLUMETRIC flow, and the two sections
differ in temperature, pressure, vapour molar mass and usually in the vapour
molar flow itself.  On the witness the rectifying trays need **1.210 m** and the
stripping trays **1.316 m** — 8.1 % apart.

**Whether to swage is ECONOMIC, not thermodynamic**, and the engine does not
decide it.  Below roughly 15–20 % difference the transition cone, its
fabrication and its inspection cost more than the plate a narrower section
saves, so the tower is built straight at the larger diameter.  Choupo publishes
both diameters and their difference, states which way the band points, and
prices no transition — because it has no correlation for one.  Both numbers are
on the specification sheet (`D_rectifying`, `D_stripping`, `swageGap`) and both
are pinned by golden rows.

The two paragraphs Vítor asked for went into `docs/designGuide.tex` §"Diameter
from vapour load (flooding)" in the same commit, with the PDF rebuilt.

## THE TRAYS ARE SIZED AND NOT COSTED, AND THE RUN SAYS SO

`Guthrie` holds eight coefficient sets and every coefficient in that file is
Turton's.  The shell, the two exchangers and the drum all reach a set that is
already there — Turton prices a tower as a vertical vessel — so **the column
sizer brought no new data into the tree**.  The trays do not, and no set fits
them: trays are bought by the tray, not by a volume, an area or a shaft power.

Writing K1/K2/K3 for a sieve tray is a CURATION act inside what Vítor reserved,
and an invented set converts *uncosted* into *falsely costed*, which no reader
and no gate can detect.  So `Guthrie` REFUSES `sieveTrays` by name and says
exactly what a coefficient set would need.  The console prints
`TOTALS (EUR) -- INCOMPLETE` and names `column09/trays`.

**A column costed by Choupo today is missing its tray cost.**  That sentence is
the point, not an apology for it.

## Two defects this slice found in machinery it did not write

**The golden `equipment` kind resolved on the UNIT.**  `get_equipment` matched
`"unit": "<name>"` and `exit`ed at the first hit; the generator named its rows
the same way.  With five items under one unit, `--record-append` deduplicated
them into ONE row per key and the checker answered every row from whichever line
came first — a silently wrong number under a name that matched all five.  The
JSON now carries `"item"` (and `"tag"`), the generator names rows by it, and
`check_equipment_pinned` reads it.  For a unit that realises one item the item
id IS the unit name, so **every golden written before this change still
resolves**.

**`check_design_sheet` arm (j) had never been able to fire.**  The
crystalliser-volume recomputation — the load-bearing arm of the 2026-09-05
slice, and the only arm anywhere that can see a size that is WRONG rather than
merely inconsistent — read `sheet["header"]["equipmentType"]`, a key the sheet
does not write (it writes `equipment`).  Every tuple carried a `None` type, the
filter `ty == "crystalliser"` matched nothing, and the arm returned in silence.
One word, and it was sabotage-verified afterwards in both directions.  That is
the `check_true_ions` shape this project retired a gate over, found again.

Also fixed on the way: **`sizing.csv` was not a CSV.**  The `basis` column is a
SENTENCE, written unquoted; the column sizer's own basis carries a comma and
shifted every numeric column after it by one.  `DesignReport` now quotes a field
that needs it (RFC 4180, and ONLY when it needs it, so every CSV already written
is byte-for-byte what it was) and the gate reads the quoting back with Python's
own `csv` rather than a second hand-rolled splitter.

## The witness

`tutorials/steady/distillation/column09_tray_hydraulics` — the natural
candidate, because it already declared the `hydraulics {}` block the diameter
comes from.  It gains a `system/postDict` (sizing + costing) and the
`design`/`economics` report objects, and its golden gains 57 rows: the new KPIs
and 53 `equipment` rows across the five items.  Without a case declaring the
pass, the capability would exist and no student would ever meet it.

The two end allowances (`disengagementHeight`, `sumpHeight`) are deliberately
left UNDECLARED there, so the case also demonstrates what an announced engine
default looks like: `[assumed]` at its site, in the end-of-run caveat block, and
`assumed ( disengagementHeight sumpHeight )` on the shell's sheet.

## NOT DONE, said plainly

* **No tray cost.**  See above; it is a curation decision, not a coding one.
* ~~**No column SCHEMATIC** (task #134).~~  SHIPPED the same day, once the cost
  existed: the order was deliberate — drawing first would have given a student
  a picture of a column whose cost did not exist yet.  See
  [`the-column-draws-itself.md`](the-column-draws-itself.md).
* **The sheets of one unit all carry the UNIT's ports.**  A condenser's own
  inlet is the overhead vapour, which is internal to the unit and is not a
  stream this flowsheet carries — the engine has no model of the connections
  inside a unit.  Each multi-item sheet SAYS so rather than leaving a reader to
  work it out from five identical port blocks.
* **Only ONE case declares the pass.**  The other 29 column cases are unchanged
  and size nothing.
* **The brief said four cases carry a `hydraulics {}` block; three do.**
  `column14_klemola_c4_splitter` declares none, and its own header says why —
  Ballast V-1 valve trays are not the sieve tray this pass models, and rating
  them with a sieve correlation would be a number with no source behind it.

## Gates

* `check_design_sheet` — new arm (m): the five items exist at their own
  addresses and each names itself; the two exchanger areas, the tower height,
  the per-section diameters and the swage gap are RECOMPUTED from the case
  declaration and the run's own KPIs; the trays carry no `cost {}` and the total
  says INCOMPLETE.  Seven sabotages, all fired — after the first attempt proved
  NOTHING, because the arm re-runs the case and `design/` is regenerated whole,
  so every sheet edited beforehand was destroyed before it was read.  The
  sabotage has to land BETWEEN the run and the check.
* `check_equipment_pinned` — unchanged in claim, now resolving on the item; it
  covers all 53 of the column's published keys in both directions.
