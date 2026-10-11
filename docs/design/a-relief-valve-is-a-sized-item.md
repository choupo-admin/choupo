# A relief valve is a sized item

*DEV.md 4c C62, 2026-10-11.  Vítor: "Podes por o dimensionamento das válvulas
de alívio de pressão nesta fase?" -- the green-ammonia basic design (FEL-3).*

## The decision, on a stated default

The engine had no relief model of any kind (C61).  A pressure-relief valve is
built here as a **sizing-pass item**: a physical object the plant buys,
protecting another physical object, sized from the converged state like every
other item.  It changes no stream and no balance.  The commander recorded this
default in C62; Vítor may reverse it.  What it is not: a unit that relieves, a
relief header, a flare, a depressuring calculation.

## The shape

* **One entry per protected unit, after that unit's own entry** in
  `sizing { units ( ... ); }`: `type reliefValve`, `unitName` the PROTECTED
  unit, `material` the valve body.  The valve is one more item of that unit,
  tagged `psv` (`design/<unit>/psv`) -- the 1:N model `ColumnSize` and
  `CatalystBedSize` established.  `protects <tag>;` only where the unit
  realises several items (a catalyst bed: `shell`).
* **The set pressure has one home**: the protected item's published
  `pressureDesign`, gauge as `VesselMechanics` reads it -- one valve, set at
  the MAWP.  The relief entry reads it and never types it; an entry declared
  before the item it protects is refused naming the remedy.
* **The scenarios are declared**, because credibility is the designer's
  judgement.  Implemented: `blockedOutlet` (the named outlet, or the only one;
  that stream's own flow, temperature and composition at P1; vapour or
  liquid, two-phase refused) and `fire` (wetted area from the protected
  vessel's own D and H and the level its declared `inventory {}` holds; F and
  the drainage declared; the liquid's bubble point at P1 and the latent heat
  of the incipient vapour).  Named and refused with the reason: `tubeRupture`,
  `controlValveFailure`/`gasBlowby`, `coolingFailure`/`refluxFailure`,
  `runawayReaction`, `thermalExpansion`.
* **Accumulation**: 10 % or 3 psi for a single non-fire device, 21 % for fire;
  P1 = MAWP x (1 + a) + 1 atm.  The 16 % multiple-device allowance is not
  offered: one device per protected item.
* **Fluid properties are the case's**: Z the package's EoS vapour root at
  (T, P1, y), k = Cp_ig/(Cp_ig - R), M the mole-fraction mean of the record
  MW -- the calls `propertyPoint` makes.  Liquid density through
  `phaseDensity` (one home).  The bubble-point search is seeded at the main
  component's saturation temperature at P1, and says so: from the default
  seed `BubblePoint::compute` falls into a spurious root (it evaluates the
  vapour fugacity at y = x, a liquid-like EoS root below the boiling range --
  measured on LetdownHP's ammonia at 27.6 bar, a false crossing near 250 K
  and no convergence).
* **Coefficients** (`KdVapour` 0.975, `KdLiquid` 0.65, `Kb`, `Kc`, `Kw`, `Kv`
  1, `backPressure` 0 gauge): `designDefault` entries, announced when taken,
  silent when declared.
* **Governing** = the largest area, published as the REQUIRED effective area.
  **No API 526 orifice letter is selected** (the commander's ruling, same
  day): the letter areas are a TABLE of API 526, a no-grant standard, and a
  shipped table is not relicensed by its courier (C16) -- the MIT licence of
  `fluids` covers its code, not the table.  The equations stay: facts with a
  citation.  `check_source_licence` refuses the table by its VALUES anywhere
  in the source tree.
* **Not costed**: `EquipmentSizing::notCostedBecause`.  The costing pass lists
  such an item under NOT COSTED and does not count it as a failure, so the
  total neither moves nor reads INCOMPLETE.  This differs on purpose from the
  tray stack's refusal: an item the model could price but lacks an input for
  is INCOMPLETE; an item no correlation in the engine covers is out of scope,
  said once by the sizer that knows it.

## One arithmetic, two implementations, one gate

`src/postProcessing/sizing/ReliefArithmetic.H` mirrors
`gui/src/ui/methods/overpressure.ts` function by function.
`bin/curate/check_relief_valve.py` compiles a probe against the header and
requires the numbers the EduTool's test pins (API 520 Examples 1, 2 and 5 to
1e-9) and every shared constant to be equal; it recomputes every valve of the
worked case from its own published inputs; and it fires the refusals on a
small fixture.  Seven by-hand sabotages, one of which survived because it left
the remedy the arm reads -- recorded in the gate.

## Traps paid for

* **A sheet key as long as the pad ran into its value.**  `setw` is a
  minimum, so `blocked_LetdownGas_P1_abs25.21325 bar;` was written -- a line
  no dictionary parser reads as two tokens.  `DesignSheetWriter::entry` now
  adds a space when the key fills the pad; every shorter key is unchanged.
* **A relief valve is not an inventory holder**: listing ten valves under the
  inventory table's "NOT DECLARED" padded a list whose point is equipment
  whose holdup nobody declared.  They are left out.

## What the sources are, and are not

API 520, API 521 and ASME VIII were NOT read.  Every equation and
percentage arrived through the open `fluids` library (MIT) and the DIERS fire
document, as the C61 EduTool records.  `docs/design/process-safety-audit.md`
classes the API standards as no-grant sources: their EQUATIONS are facts and
are carried with a citation (the C61 posture); their TABLES are not.  The
first build of this slice added the fourteen API 526 orifice areas through
`fluids` and selected a letter; it was REMOVED the same day on that rule.

## Not done

Tube rupture; a control valve failing open; two-phase relief (omega method);
the 25 ft (7.6 m) wetted-height limit of API 521 (not read: the whole wetted
surface counts, which over-states Q); a supercritical or gas-filled vessel in
a fire; a relief header, knock-out drum and flare; any cost.  The relieved
stream is carried to P1 at its own temperature, not re-flashed there.
`CompressorSize` publishes `pressureDesign` with a SILENT default of 1.0 bar
when the case declares none -- a relief valve protecting such a compressor
would be set at it; every compressor in the worked case declares its own.
