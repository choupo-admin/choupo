# Liquid properties: where a unit's density, viscosity, surface tension and diffusivity come from

For an assistant helping a student author or read a case.  This page says
what the engine does TODAY (C378 slice 0).  The property kernel is being
reorganised slice by slice; a key that is planned but not listed here does
NOT exist yet, and the engine refuses it.  Theory Guide: "Where a unit takes
its liquid properties from".

## 1. Read the table first

Every run prints, just before its result block, one line per unit:

```
[liquid properties] Where each unit took its liquid properties from in this run (values as used; nothing is changed by this table)
  methanolPump (pump)   liquid density   787.27 kg/m3 at 300.0 K, 1.01 bar   computed by the unit itself, not by the property kernel: each component's 25 C molar volume, with no temperature or pressure effect
  methanolTank (storageTank)   liquid density   785.12 kg/m3 at 300.0 K, 1.01 bar   property kernel: ideal mixing of liquid volumes, each component's 25 C molar volume scaled to temperature by Rackett; pressure not applied
  [twice] the same liquid (300.0 K, 1.01 bar, one composition) is given two densities: ...
```

* The number is the one the unit computed with.  A range and a count mean
  the unit took several (trays, iterations).
* "property kernel" means the case's thermophysical package priced it.
  "computed by the unit itself" means the unit did NOT ask the package: its
  number does not follow the case's property choices.
* `[twice]`: two units priced the same liquid state at two densities.  Say
  so to the student; do not average them, and do not size on one silently.
* `[mismatch]`: a unit took a number from a kind of source its type does not
  declare.  It is an engine finding; report it.
* `[constant]`: a unit took a CONSTANT liquid density (1000 kg/m3) while
  another unit of the run computed one; the line names both.  It does not
  say they price the same stream -- check the flowsheet.
* "Parameters of thermodynamic models ...": models that read a component's
  stored 25 C volume as a parameter (Wilson, the Poynting correction,
  Wilke-Chang, the mixed-solvent activity model, Hildebrand, Hansen).  The
  volume a record stores is the same datum, with the same caveats (section 4).
* A pure-fluid line names the formulation behind THAT property: IAPWS-IF97
  gives the density, IAPWS R12-08 the viscosity (on the IF97 density), IAPWS
  R1-76 the surface tension.
* The result JSON carries the same in `propertySources` (`used`,
  `declared`, `declaredNotUsed`, `mismatches`, `pricedTwice`); a golden pins
  each unit's source with a row of kind `source`.

## 2. What each unit uses today

| unit | liquid density | viscosity / surface tension / diffusivity |
|---|---|---|
| valve, storageTank, pipe, heatExchanger (geometry), phaseChanger (geometry), hydrocyclone, cakeFilter, thickener, sedimentingCentrifuge, dynamicTank, dynamicCSTR, every sizing pass | property kernel | property kernel (pipe and column: a value declared in the unit wins) |
| distillationColumn (tray rating, computed efficiency, packing) | property kernel | kernel or declared; liquid diffusivity is the column's OWN Wilke-Chang, whatever model the case selects |
| pump, pressureExchanger | the unit's own: 25 C molar volumes, no T or P; a dissolved ion keeps its mass, adds no volume | -- |
| cstr, pfr (liquid), crystalliser (MSMPR, FVM) | the unit's own: 25 C molar volumes, no T or P (crystalliser: a component without one adds nothing, unannounced) | -- |
| sprayDryer | the unit's own: the solvent's 25 C molar volume, else 1000 kg/m3 | kernel if the case selects a model, else its own defaults (1 mPa s, 72 mN/m) |
| spiralWoundModule | `rho_feed` if declared, else 1000 kg/m3 | declared, else kernel, else 1 mPa s and 1.6e-9 m2/s |
| electrodialysisStack, batchElectrodialysis | 1000 kg/m3 (the dilute carrier) | kinematic viscosity: the solvent's kernel viscosity / 1000 kg/m3 if a model is declared, else the constant 1e-6 m2/s |
| batchDiafilter | `rho` if declared, else 1000 kg/m3 (announced) | -- |

## 3. What the engine accepts, and what it refuses

* Liquid density needs, per component, a `Vliq` (25 C) or the critical
  constants; with neither it refuses by name.  Above a component's critical
  temperature it refuses; several kernel consumers then leave that component
  out of the volume and keep its mass, and the table says so.
* `pureFluids { water { method IF97; } }` (or `method Helmholtz; equation
  IAPWS95;`) prices PURE water by that formulation, with pressure.  A liquid
  that mixes water with anything else is refused while it is selected.
  The phase asked is honoured (every pure-fluid formulation: IF97 and the
  Helmholtz records of water, CO2, N2, CH4): below the critical
  temperature, a LIQUID density asked at P > p_sat(T) (1 + 1e-6) is the
  liquid branch at (T, P); asked at or below that, it is the SATURATED
  LIQUID at T, never the vapour root, and a liquid asked more than 1e-6
  below p_sat is announced once per run.  A VAPOUR density is symmetric
  (at or above p_sat (1 - 1e-6): the saturated vapour at T).  At or above
  the critical temperature, and below the triple point, the phase asked
  changes nothing.  Theory Guide `sec:pure-fluid-density-phase`.
  The same rule serves the ENTHALPY and ENTROPY a unit asks with the phase
  it holds (`H_real` / `S_real` with a phase: the pump's suction as liquid,
  the compressor's and turbine's inlets as vapour); without a phase, or on a
  route that is not a pure fluid, nothing changes.  A wet turbine exhaust
  still reads the stable phase at (T, P).  The energy report's pure streams
  at a carried vf of exactly 0 or 1 are priced, INSIDE the band only, on the
  saturated branch that vf names (outside the band: (T, P) as before;
  0 < vf < 1: the existing split).  Theory Guide `sec:pure-fluid-caloric-phase`; witness gate
  `check_pure_fluid_phase_asked`.
* Viscosity, surface tension and diffusivity need a `transport {}` model;
  a unit without one either refuses or uses the default the table names.
* `approximations {}`: the words are `idealBinaryPair`,
  `componentOutsideActivityModel`, `idealMolecularVLE`; each block needs a
  non-empty `reason "...";`, and any other word is refused.
* There is NO key today to declare a measured density, a solution
  correlation, `massWithoutVolume` or `neglectedIn`.  Do not write them.

## 4. Known deviations -- do not size on them silently

Measured (docs/design/thermophysical-property-routes.md section 1.2 and its
numerical review):

* a record whose `Vliq` is not a 25 C liquid value is read as one: CO2
  +31.8 % at 298.15 K, ethane +71 %, HCl +45 %; liquid N2 at 90 K and CH4 at
  120 K are refused;
* water without `pureFluids`: +2.0 % at 273.16 K, -3.5 % at 373.16 K,
  -6.5 % at 573.16 K, no 4 C maximum, -2.1 % at 500 bar;
* water-ethanol viscosity with no interaction parameter: -59.7 % at
  x = 0.30, 298.15 K;
* Brock-Bird surface tension of water at 25 C: +49 %.

When a student's design depends on one of these numbers, say which line of
the table it comes from and that the value is known to be off.
