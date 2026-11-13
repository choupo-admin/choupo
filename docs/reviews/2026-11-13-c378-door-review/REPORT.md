# Review by measurement: the property door, C378 slice 0 (a working branch)

Date: 2026-11-13.  Reviewed: branch c378-slice0 at f6c01ac421, 15 commits
past main, a general's WORKING branch (goldens not re-recorded, no full
sweep).  Read-only: nothing was pushed to it.  `run_cases.sh`,
`probe_friedel_sigma.sh` and `probe_ratchet.sh` regenerate the tables.

## 1. The three questions put by the laptop session

**Inventory.**  Every unit of the cloud's earlier count is real and is in
the slice's table, except five thermo-layer volume readers (WilkeChang,
SaturatedVapour's Poynting term, Wilson, SolubilityParameter) and
CrystallisationSaturation, which the plan files as model parameters or
bench readers; a student is told of them nowhere.  An independent census
found further readers the table does not print (`inventory.tsv`): the
electrodialysis kinematic viscosity, a bare `/1000.0` in the stack's
energy per cubic metre, the pellet diffusivity, a declared surface tension
in the pipe's two-phase models and the column's efficiency fallback, the
Williams-Otto density, the laboratory-analysis inlet density, and every
unit wrapped by `quasiSteady`.

**Printed sources against the code beside them** (`sources.tsv`).  Most are
true.  Two are not (DR-01, DR-03) and one prints a value that is not used
(DR-02).

**Can a student read it** (three named cases).  aceticAcid02_plant: yes --
unit, value, state and source, and an explicit `[twice]` line where one
liquid is given two densities (787.27 and 785.12 kg/m3).
membrane27_swro_energy_recovery: the numbers and sources are readable, but
the same seawater is priced at 1030.94 kg/m3 by the pump and 1000.00 by the
module with NO `[twice]` line, and the pressure exchanger prints a molar
volume that cannot be compared with a density by eye (DR-08: the check
sees only density lines that carry an exact state).
crystalliser08: readable, but the component whose volume was taken as zero
(NaCl) is not named (DR-05).

## 2. Does the slice move no number?

As far as measured, no: `check_property_route_bench` OK (4975 blocks bit
for bit; the door compared with the old call 134 343 times, 0
disagreements); fourteen single cases pass against their own `expected`.
No `expected` file carries a `source` row yet, so `check_property_sources_
pinned` fails as designed at this stage.  Not verified: byte identity with
main.

## 3. Sabotage

Relabelling the pump's source to another class: the run's own `[mismatch]`
line shows it, no gate fails.  Relabelling within a class: nothing sees it.
Tagging the door's Rackett route as the flat 25 C volume, "no temperature
effect": nothing sees it (the printed density then varies 783-813 kg/m3
over 356-380 K under that label) -- DR-11.  The ratchet gate, fed 18 probe
lines, catches 4 and misses 14 (direct package calls, a literal in a
ternary fallback or a comma list, a brace initialiser, `->Vliq()`, a
kinematic `nu = 1e-6`, a bare `/1000.0`): DR-09.

## 4. Findings (`findings.tsv`, each reproduced twice by the review)

* **DR-01 (S1)** the table labels the pure-fluid water surface tension
  "the pure-fluid formulation IF97" and the viscosity likewise.  IF97
  defines no surface tension: the value is IAPWS R1-76, and the viscosity
  is R12-08 evaluated on the IF97 density -- read by the commander in
  `PureFluidModel.cpp` (`IF97WaterFluid::sigma` returns the R1-76 kernel,
  `mu` the R12-08 kernel); the package's own log line says "IAPWS R1-76".
  The label is made in `LiquidPropertyDoor.cpp`.
* **DR-03 (S1)** the electrodialysis units use a kinematic viscosity of
  1e-6 m2/s (`ElectrodialysisStack.cpp`, the water value, "announced" only
  as a fall-back), or the pure solvent's package viscosity through
  Stokes-Einstein; the table lists only the 1000 kg/m3 density.  ed01's log
  prints Sc = 595.2381 = 1e-6/1.68e-9.
* **DR-02 (S2)** a condensing unit prints a surface tension under "values
  as used" that its film model never reads.
* **DR-04 (S2)** no table and no result block under choupoSemiContinuous.
* **DR-05 (S2)** the crystalliser does not name the zeroed component.
* **DR-06 (S2)** one tank printed as two consumers.
* **DR-07 (S2)** a declared surface tension is not recorded in the pipe's
  Friedel/Beggs-Brill models nor in the column's efficiency fallback.
* **DR-08 (S2)** the twice-check is blind to constants and molar volumes.
* **DR-09 (S2)** the ratchet gate misses 14 of 18 patterns, and its own
  "not checked" line understates this.
* **DR-11 (S2)** a label can change within its class with no gate failing.
* **DR-10, DR-12, DR-13, DR-14 (S3)** the spray dryer's density wording;
  aliases and dynamic/batch unit types with no declared-sources rows;
  unprinted readers; "does not say so" labels that now appear on lines
  where the run does say so.

## 5. What the review agrees with

The door is a pure wrapper (the route bench proves it); pairing each
constant with its description in one object so they cannot be edited apart;
the per-unit table with value, state and source; the `[twice]` detection
where it works; the reclassification of the antisolvent and thermo-layer
volume reads as model parameters; the two-sided ratchet in principle.

## 6. Not examined

The GUI; the Theory and Tutorials Guide text; the tightened `approximations
{}` block; the `source` golden reader end to end (no rows recorded); the
large plants; a case where the door refuses a value; byte identity with
main.
