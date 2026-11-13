# A machine has one size: the installed one

**Status: BUILT 2026-11-13** (DEV.md 4c C389 (4), review finding PH-06).
The design was written and committed before the code; it records the
alternatives rejected.  Built as designed; the sizer's refusal of an
overfilled machine now also names the fill at the installed size.

## 1. What was wrong

`apalutamide01_tablets` carried TWO sizes for its final blender and its
coating pan.  The batch plan sizes each batch stage from the lot and the
stage's TARGET fill, `V = m_lot / (rho_bulk phi) / N_ip`: 1.333 m3 and
0.812 m3.  A declared quote with `scaling {}` was priced on that number
(356 520 and 706 191 EUR).  The `ratedMachine` check of the same units
declares the machines BOUGHT -- a 1.2 m3 bin and a 1.0 m3 pan
(`rating { nominalVolume; maxFill; }`) -- and the same quotes give 334 680
and 800 000 EUR on those.  The machine checked was not the machine priced.

## 2. The ruling (Vitor, 2026-11-13, DEV.md 4c C389 (4))

A machine has ONE size, the INSTALLED one its rated-machine block declares
(equipment is bought in catalogue sizes).  What the plan computes from the
lot and the target fill is a REQUIREMENT held against it; the fill at the
installed size is a RESULT, published and checked against the declared
range; the quote is priced on the installed size.

## 3. The design

* **The home of the installed size is the `ratedMachine` sizer**
  (`src/postProcessing/sizing/RatedMachineSize.cpp`), the one reader of the
  declaration.  For `kind batchVolume` it already published `V_nominal`,
  `maxFill`, the plan's target fill (`fillPlan`) and the lot's working
  volume.  It now also publishes, on the same sheet:
    - `V_required` -- the plan's volume per unit, `S B / N_ip`, read from the
      plan's stage (the REQUIREMENT, at the target fill, not recomputed);
    - `V_installed` -- the declared `nominalVolume` (the size);
    - `fill_installed` -- the lot's working volume over the installed volume
      of the machines that hold it, `(m_lot / rho_bulk) / (N V_nominal)`
      (the RESULT), and in a multiproduct plan `fill_installed_<product>`.
  `fill_installed x N x V_installed = m_lot / rho_bulk` by construction.
* **The range is the declared one.**  The rating declares an UPPER bound,
  `maxFill`; above it the lot does not fit the machine bought and the sizer
  REFUSES (the existing utilisation refusal: `utilisation = fill_installed /
  maxFill`), an impossible plan.  Near it the existing `announceAbove`
  announcement speaks, a poor plan.  NO LOWER BOUND is declared anywhere and
  none is invented: a machine filled far below its target is published
  (`fill_installed` beside `fillPlan`) and the sheet's basis says that no
  minimum fill is checked.
* **The quote reads the installed size from the sizing record.**  In
  `DeclaredQuote.cpp` a `scaling {}` quote on a unit whose sizing record is a
  `batchVolume` rated machine (`machineKind`, written by the sizer) is priced
  on `V_installed` and on the machines the sizer installed (`installed`), and
  its printed arithmetic and result JSON say `installed size` and name the
  machine; any other scaling quote reads the plan's stage as before, byte
  for byte.  One function, `installedVolumeOf` (in `core/ResultRecords.H`,
  beside `EquipmentSizing`), is the one reader of the installed size for
  every consumer.
* **The batch-plan table.**  The plan runs BEFORE the sizer (it must: the
  sizer reads the plan), so its console table and its CSVs carry the
  requirement and now say so (`required`).  The result's `batchPlan.stages`
  record, written at emission after every pass, draws the installed size
  through the same function (`volumeInstalledPerUnit`, `installedBy`) for a
  stage whose unit has one; a stage without one gains no key.

## 4. Rejected

* **The plan reads the rating block.**  The plan would parse a sizing
  entry the sizer also parses: two readers of one declaration, and the plan
  would size equipment the sizing pass exists to size.
* **The sizer overwrites the plan's `volumePerUnit`.**  The same field
  would mean the requirement on the console (printed first) and the
  installed size in the JSON: one name for two numbers.
* **A copy of the installed size on the plan's stage record** stamped by
  the sizer: a second home for a number the sizing record already holds.
* **The rate machines too** (roller compactor, mill, screen, tablet press,
  packaging line, rated by `capacity`, stations x speed, packs a minute).
  Their quotes also scale with the plan's REQUIRED rate, not the rated one;
  the ruling and the finding name the batch machines, and moving every rate
  quote of the solid-dose train to the nameplate rating (several-fold for
  the compactor) is a change of the case's costing basis that is Vitor's.
  Named, not built.
* **A lower fill bound** chosen by the engine: none is declared, and a
  number invented here would be a default nobody declared.

## 5. Gate

`check_tablet_machines` arm (g): for every `batchVolume` rated machine of
the shipped cases, `V_required` equals the plan's stage volume per unit,
`V_installed` the declared `nominalVolume`, `fill_installed` the lot's
working volume over the installed volume (and the product of the three
holds); every scaled quote on such a unit is recomputed by hand from the
DECLARED nominal volume, reference size, exponent and installed count and
equals the published C_p; the printed arithmetic names the installed size; a
probe whose lot overfills the installed bin refuses naming the fill; a
scaled quote on a unit with no rated machine (the vessel of a plain stage)
still reads the plan.  `check_batch_plan` arm (b) reads the same rule, and
its arm (j) compares the one-product probe with a witness twin whose rated
machines are removed (the probe cannot carry one).  Sabotages S19-S21 in
the gate's docstring.

## 6. What moved

Every scaled quote on a batch machine of the three tablet plants:
apalutamide01 (blender 1.19 -> 1.2 m3, final blender 1.333 -> 1.2, coating
pan 0.812 -> 1.0), donepezil01 and donepezil02 (granulator 1.11 -> 1.2,
fluid-bed dryer 1.34 -> 1.5, coating pan 0.61 -> 1.0; the final blender
already sized 1.0 = 1.0), and every capital and economics figure downstream.
