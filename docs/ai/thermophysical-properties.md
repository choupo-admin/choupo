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
  pump01 (pump)   liquid density   997.14 kg/m3 at 298.1 K, 3 bar   property kernel: the Helmholtz reference equation IAPWS95 of water (taken because a record names the fluid), liquid branch at the temperature and pressure; ...
  P1 (pipe)   liquid density   996.93 .. 996.95 kg/m3 (13 values) at 298.2 K, 3.45 .. 4.8 bar   property kernel: ideal mixing of liquid volumes, each component's 25 C molar volume scaled to temperature by Rackett; pressure not applied
  [hypothesis] massWithoutVolume (NaCl) in Booster (pump): largest share 0.034 of the declared bound 0.05
```

* The number is the one the unit computed with.  A range and a count mean
  the unit took several (trays, iterations).
* "property kernel" means the case's thermophysical package priced it.
  "computed by the unit itself" means the unit did NOT ask the package: its
  number does not follow the case's property choices.
* `[hypothesis]`: a declared `massWithoutVolume` was used by that unit; the
  largest share it stood at and the bound.  A pump and a pipe on one water
  can differ (above: the pump on the methods, the pipe on the older route,
  2e-4 apart) until every unit has moved.
* `[twice]`: two units priced the same liquid state at two densities.  Say
  so to the student; do not average them, and do not size on one silently.
* `[two methods]`: one liquid composition was priced by two methods in the
  run (say, the pump on the kernel's methods and a pipe on the older route),
  each with its range.  The same advice holds.
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
* The time-integrated binaries (choupoCtrl, choupoSemiContinuous) declare and
  check exactly as choupoSolve does: a `[mismatch]` can appear there, and a
  steady unit wrapped by `quasiSteady` is declared under its own type.  Each
  line names the case's unit (a `dynamicTank`, a `dynamicCSTR` with
  `volumeMode variable`, a Williams-Otto plant), never a message text.
* A pore-model membrane (`transport DSPM-DE`) reads each ion's D0 from its
  species record: the table shows that read as a `liquid diffusivity` line of
  the unit, scaled by Stokes-Einstein, left at its 25 C curation value (the
  unit runs at 25 C), or marked NOT temperature-corrected (no viscosity model).
* The result JSON carries the same in `propertySources` (`used`,
  `declared`, `declaredNotUsed`, `mismatches`, `pricedTwice`); a golden pins
  each unit's source with a row of kind `source`.

## 2. What each unit uses today

| unit | liquid density | viscosity / surface tension / diffusivity |
|---|---|---|
| valve, storageTank, pipe, heatExchanger (geometry), phaseChanger (geometry), hydrocyclone, cakeFilter, thickener, sedimentingCentrifuge, dynamicTank, dynamicCSTR, every sizing pass | property kernel | property kernel (pipe and column: a value declared in the unit wins) |
| distillationColumn (tray rating, computed efficiency, packing) | property kernel | kernel or declared; liquid diffusivity is the column's OWN Wilke-Chang, whatever model the case selects |
| pump, cstr | the property kernel's METHODS (section 3b): at the pump's inlet / the CSTR's feed state, the method of the constituent set (reference equation with pressure, additive volumes, a solution law, the case's measurement); a component with no volume refused unless `massWithoutVolume` is declared | -- |
| pressureExchanger | the unit's own: 25 C molar volumes, no T or P; a dissolved ion keeps its mass, adds no volume | -- |
| pfr (liquid), crystalliser (MSMPR, FVM) | the unit's own: 25 C molar volumes, no T or P (crystalliser: a component without one adds nothing, unannounced) | -- |
| sprayDryer | the unit's own: the solvent's 25 C molar volume, else 1000 kg/m3 | kernel if the case selects a model, else its own defaults (1 mPa s, 72 mN/m) |
| spiralWoundModule | `rho_feed` if declared, else 1000 kg/m3 | declared, else kernel, else 1 mPa s and 1.6e-9 m2/s |
| electrodialysisStack, batchElectrodialysis | 1000 kg/m3 (the dilute carrier) | kinematic viscosity: the solvent's kernel viscosity / 1000 kg/m3 if a model is declared, else the constant 1e-6 m2/s |
| batchDiafilter | `rho` if declared, else 1000 kg/m3 (announced) | -- |

## 3. What the engine accepts, and what it refuses

* Liquid density needs, per component, a `Vliq` (at `VliqT`, 25 C when the
  record writes none) or the critical constants; with neither it refuses
  by name.  With both, the record's volume is anchored at `VliqT` and
  Rackett carries it in temperature.  `VliqT` without `Vliq`, at or
  above `Tc`, below `triplePoint.T`, or written in another dimension, is
  refused at load.  Above a component's critical
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
  below p_sat is announced (once on the console, and in every pass's
  result JSON `advisories` and caveat block).  A VAPOUR density is symmetric
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
  0 < vf < 1: the existing split).  The units that price or classify an
  AUTHORED inlet with their own flash -- `phaseChanger`, `heatExchanger`,
  `pipe` -- take a DECLARED phase as the state (one home,
  `flashState::declaredInletEnthalpy` / `declaredSinglePhase`): a pinned
  inlet is priced on the branch its vf names, exactly as the report prices
  it, and never re-flashed at (T, P).  Theory Guide `sec:pure-fluid-caloric-phase`; witness gate
  `check_pure_fluid_phase_asked`.
* Viscosity, surface tension and diffusivity need a `transport {}` model;
  a unit without one either refuses or uses the default the table names.
* `approximations {}`: the words are `idealBinaryPair`,
  `componentOutsideActivityModel`, `idealMolecularVLE`, `massWithoutVolume`
  (`components`, `maxMassFraction` mandatory); each block needs a
  non-empty `reason "...";`, and any other word is refused.
* For the PUMP and the CSTR only (C378 pilot, section 3b): a measured
  density (`volumetric { liquid { measured { ... } } }`), a solution
  record's density law and `approximations { massWithoutVolume { ... } }`
  exist.  Every other unit ignores them.  `neglectedIn` does not exist.

## 3b. The liquid density as methods (C378 pilot)

The pump and the CSTR take their liquid density from the kernel's METHODS
(`src/thermo/liquidProperty/`), through `liquidProperty::density`; every
other unit stays on the slice-0 wrapper (section 2).  The method is chosen
once per constituent set (the components with x > 0), at the set's first
request, and frozen for the run -- never by T, P or the amounts:

| method | kind | what it answers |
|---|---|---|
| `recordVolume` (its id names the route: `recordVolume.anchoredRackett`, `.flatVliq`, `.bareRackett`) | leaf | the record's `Vliq` on its route (anchored on Rackett at `VliqT`; flat; Rackett alone, an estimate); no pressure |
| `pureFluid` | leaf / one-constituent set | the case's `pureFluids` selection, liquid branch, with pressure |
| `referenceEquation` | leaf / one-constituent set | a Helmholtz record in `parameters/Helmholtz/` whose `fluid` is the component (water, CO2, CH4, N2 today), by that fact, with pressure; case-local copy first |
| `idealMixing` | set | additive volumes over one leaf per constituent; no excess volume.  Its id `idealMixing[...]` is the slice-0 door's `liquidVolume.idealMix[...]` under another name: ONE arithmetic, two ids until the wrapper consumers migrate |
| `massWithoutVolume` | leaf | the declared hypothesis: mass kept, no volume, bounded by `maxMassFraction`; honoured for EVERY listed component, even one whose record has a volume (and a set with a listed constituent is mixed by additive volumes, never by its solution law).  Read by the density only: the pump's heat capacity does not read it |
| `solutionLaw` | set | a solution record's own density law for exactly the set (form `polynomialTSqrtX`: NaOH-water) |
| `measured` | set | the case's measurement marked `use method`, constant inside its hard box |

Precedence for a set: a marked measurement; a record law for exactly the set
(one constituent: `pureFluids`, else a reference equation; two or more: a
solution record); `idealMixing`; refusal naming every method passed over and
the remedy.  A declared Henry solute has no pure-liquid leaf.  The run prints
each resolution once per method and unit (`[liquid density] <unit>: <set> by
<method> (origin ...; evidence); passed over: ...`), and every refusal ends in
its remedy.  The resolution is kept per WORLD (the components' names,
pure-fluid selections, Henry status and volume routes): a unit's own
`thermo {}` that changes one of them is a second world, not a contradiction.

### The grammar the pilot reads

A solution record, `parameters/solution/<set>.dat` (set sorted
case-insensitively; case-local `constant/parameters/solution/` first):

```
solute      NaOH;
solvent     water;
liquidDensity
{
    returns           solutionDensity;     // kg/m3 of the solution
    form              polynomialTSqrtX;    // rho = b1 + b2 t + b3 t^2, b_j = sum c_jk x^(k/2)
    variable          w[water];            // the composition variable: a mass fraction
    temperatureOrigin 273.15 K;            // t = T - origin
    b1 ( ...6 numbers... );  b2 ( ... );  b3 ( ... );
    domain ( { T ( 273.15 283.15 ); w[water] ( 0.800 1 ); } ... );   // K; HARD
    pressure          notCarried;
    provenance { origin literature; citation "..."; uncertainty "..."; maxDeviation 2.41 kg/m3; read "..."; }
}
```

A measurement of the case, `constant/experiments/<name>.dat`:

```
provenance  { source "..."; citation "..."; }
system      ( NaOH water );                 // the set the columns describe
property    liquidDensity;
solvent     water;                          // the constituent whose fraction is the rest
columns     ( { name T; unit K; } { name P; unit kPa; } { name w[NaOH]; unit -; } { name rho; unit kg/m3; } );
data        ( 303.15 100 0.200 1213.8 );    // ONE point
uncertainty 2.0;                            // kg/m3, expanded
box         { T ( 301.65 304.65 ); P ( 50e3 1500e3 ); w[NaOH] ( 0.199 0.201 ); }   // K, Pa, -
```

marked in `constant/thermoPhysPropDict` (top level):

```
volumetric { liquid { measured
{
    NaOH20_303K { use method; replaces { method solutionLaw; record NaOH-water; } reason "..."; }
    NaOH20_333K { use check; }
} } }
```

and the hypothesis, in the one `approximations` block:

```
approximations { massWithoutVolume { components ( NaCl ); maxMassFraction 0.05; reason "..."; } }
```

Every key of these blocks is one the reader knows; an unknown key is
refused, naming the keys the block reads.  A measurement whose columns or
solvent name no component of the case, or whose `system` contradicts its
columns, is refused (it could never be used); a `massWithoutVolume` name
that is not a component of the case is refused.

Refusals and their remedies: a set no method prices names every method
passed over ("no solution record covers this set ...
parameters/solution/ethanol-NaCl-water.dat ...; idealMixing needs a volume
for every constituent: 'NaCl' has no liquid volume ...") -- remedy a
solution record, a volume in the record, or the hypothesis; a marked
measurement outside its box is a domain error, never handed over; `use
method` without `replaces` where a catalogue method applies, or naming one
that does not apply, is refused; a box wider than the uncertainty needs a
`reason`; the hypothesis above its bound is a domain error naming the
bound; a law outside its bands is a domain error naming the bands.  A domain
error is a rejectable trial (`PropertyDomainTrial`): a recycle solver may
reject the step; a converged state fails with the remedy.

The liquid branch of the two pure-fluid leaves is the engine's one band
(1e-6 of p_sat): a ONE-constituent set asked as a liquid more than the band
below p_sat(T) is a VAPOUR and is refused ("pure water at 373.15 K and 1 bar
is a VAPOUR -- its saturation pressure there is p_sat(T) = 101418 Pa");
remedy: a pressure at or above p_sat(T).  A leaf inside a mixture below its
own p_sat is the saturated liquid at T, announced once per method and unit.
At or above the critical temperature there is no liquid (refused).  For a pure set
priced by `referenceEquation` (no `pureFluids`), the package's own
saturation line (`ThermoPackage::Psat`) decides the phase: between the
reference's line and the package's, the reference's saturated liquid,
announced with both pressures; below both, refused.  Where the package's
line is ABOVE the reference's (water above about 311 K), a state between them
is priced as the reference's compressed liquid and announced once.  Below a
reference record's own `Tmin` (IAPWS-95: 251.165 K) the reference leaf
refuses.  Additive volumes whose leaves differ say so in the pressure column
("pressure applied to water; not applied to ethanol").  The
props bench key `rho_liquid_kernel` (choupoProps, `propertyScan1D`) asks the
same methods for the state's composition.

## 4. Known deviations -- do not size on them silently

Measured (docs/design/thermophysical-property-routes.md section 1.2 and its
numerical review):

* CLOSED in the catalogue (C378, 2026-11-13): twenty records whose `Vliq`
  is a boiling-point (or 273 K, 465 K) volume now carry `VliqT`; CO2 at
  298.15 K went from +31.8 % to +2.1 % against its reference equation,
  liquid N2 at 90 K (+0.5 %) and CH4 at 120 K (+1.5 %) are priced instead of
  refused.  STILL OPEN: a SEALED case keeps its frozen copy of each record
  until its seal is refreshed; propane, propylene, H2O2, HCHO, HCN and NO2
  carry a `Vliq` whose temperature no source states (pinned debt);
* the units that read `Vliq` themselves (pressure exchanger, liquid PFR,
  crystallisers, spray dryer) take the stored datum flat, at
  whatever `VliqT` it belongs to; their table line names the records that
  state one ("molar volume at the temperature its record states (CH4 at
  111.66 K; any other at 25 C)") and says "25 C" only when none does;
* water without `pureFluids`: +2.0 % at 273.16 K, -3.5 % at 373.16 K,
  -6.5 % at 573.16 K, no 4 C maximum, -2.1 % at 500 bar;
* water-ethanol viscosity with no interaction parameter: -59.7 % at
  x = 0.30, 298.15 K;
* Brock-Bird surface tension of water at 25 C: +49 %.

When a student's design depends on one of these numbers, say which line of
the table it comes from and that the value is known to be off.
