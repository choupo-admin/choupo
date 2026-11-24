# Homogeneity of degree one, measured (C491 (2)), 2026-11-24

A MEASUREMENT, not a gate.  Nothing under `src/` was edited and no shipped case
was touched: every run is a scratch copy under `build/homog/` (gitignored).
Tool: `bin/curate/homogeneity_probe.py` (a measurement tool, not wired into
`bin/runTests`).  Engine: the `Choupo-dev` binary of this branch (no `src/`
difference from the commit the binary reports, 393700bd3c).

## The rule

A steady flowsheet whose units are specified only by INTENSIVE quantities (T, P,
split fractions, ratios, conversions) is homogeneous of degree one in its feeds.
Double every feed's flow: every EXTENSIVE result (stream flows, enthalpy flows,
duties, powers, extents) doubles, and every INTENSIVE result (T, P, compositions,
vapour fractions, per-mole enthalpies, ratios) is unchanged.

A unit with a DECLARED SIZE or a declared extensive quantity breaks this by design
(area, volume, packing height or diameter, `W_shaft`, `Q`, a fixed product rate, a
fixed reflux flow).  Such a case is NOT JUDGED and the declared quantity is named.

## Method

1. Each case's `system/flowsheetDict` was read first and its declared extensive
   quantities listed; the classification was written down before the cases were
   run (`ops.py` printed every unit's `type` and `operation` block).
2. A scratch copy (plain `cp -r`; the engine finds the catalogue through
   `CHOUPO_HOME`, `Database.cpp:78`) had the flow of every FEED stream of `0/`
   multiplied by 2: the entries of `componentMolarFlows` (also inside `phases {}`)
   and `componentMassFlows`; T, P, phase and composition untouched (a
   two-variable stream stays two-variable).  Feeds are the streams with no
   producing unit.
3. Base and x2 were run with `choupoSolve`; the result JSON between
   `<<<Choupo:result-begin>>>` and `<<<Choupo:result-end>>>` was compared key by
   key: `streams` (F, F_mass, H_kW, solids flows are extensive; T, P, vf, H [J/mol],
   composition intensive), `kpis` and `globalEnergyBoundary`.
4. A KPI is classified by name; a name the tool cannot classify is listed as
   UNCLASSIFIED with its observed ratio (it is never counted as a violation).  The
   energy-closure residual (`residual_kW`) is solver noise, not a result: it is
   printed as a fraction of the enthalpy flow and not judged.

## Tolerance and its reason

* No recycle: relative deviation <= 1e-8.  The solvers' own stopping criteria are
  1e-8 (the Newton on the Gibbs reactor, `GibbsMethod.cpp:128`, and the flash
  composition loop, 1.4e-8 in model5); because every convergence test in these
  paths is relative, scaling the feed reproduces the iteration sequence and the
  observed deviation is rounding, 1e-11 to 1e-12.
* A recycle loop (ammoniaReactor01-03): 1e-4, ten times `recycleTol 1e-5` in the
  case's `solverDict`, because the converged fixed point is only defined to that
  tolerance and the tear seed in `0/` enters it.

## Scope

`tutorials/FASTSET`, the steady entries (the 35 cases under `tutorials/steady/`
that are flowsheets, plus `fitNRTL01`, a `choupoProps` fit, which has no feeds).
Then, as an extension, 7 more steady cases outside FASTSET whose specification is
intensive, and a scale sweep k = 1e-6 ... 1e6 on 14 eligible cases.

## Verdicts (FASTSET, steady)

HOMOGENEOUS 17 · VIOLATION 0 · NOT JUDGED 18 · FAILED TO RUN 1 (refused by design).
Totals 36.  `unsteady01_startup_transient` is not a steady case and is out of scope.

### Flash and phase equilibria

| case | declared extensive quantity | verdict | max dev ext / int |
|---|---|---|---|
| flash01_benzene_toluene | none (T, P) | HOMOGENEOUS | 3.0e-12 / 0 |
| thermoTest/model5_nrtl_flash | none (T, P) | HOMOGENEOUS | 2.7e-12 / 0 |
| absorption/extraction01_waterButanol | none (LL flash at T, P) | HOMOGENEOUS | 3.7e-12 / 0 |
| flash15_refused_salt_basis_rank | none, but the case REFUSES: the declared basis has 1 degree of freedom (`reactive electrolyteGammaPhi`) | FAILED TO RUN, both copies, the same refusal (by design) | n/a |

### Separation, solids, drying, crystallisation

| case | declared extensive quantity | verdict | max dev ext / int |
|---|---|---|---|
| distillation/shortcut01_benzene_toluene | none (key recoveries, `refluxFactor`) | HOMOGENEOUS (D, B double; R, N_min, N, feed stage unchanged) | 4.6e-12 / 0 |
| crystallisation/crystalliser01_sugar | none (`operatingTemperature`) | HOMOGENEOUS | 3.5e-12 / 0 |
| drying/evapDryer02_energy_limited | none; both feeds (hotGas, wetSolid) doubled | HOMOGENEOUS | 4.2e-12 / 0 |
| gas-solid/gasSolidSplitter04_lognormal_psd | none (`solidsRecovery`, `gasCarryover`) | HOMOGENEOUS (PSD untouched, solids mass doubles) | 4.0e-12 / 0 |
| solids/mill02_bond_crosscheck | `specificEnergy` is kWh per TONNE: intensive, so `W_shaft` follows the mass flow | HOMOGENEOUS (two feeds; `W_shaft` 3.64 to 7.28 kW; d50, Sv, Bond ratios unchanged) | 1.5e-12 / 0 |
| separation/tsa02_refused_capacity | `mAdsPerColumn 1 kg`, `tCycle 300 s` | NOT JUDGED | n/a |
| solids/pneumaticConveyor01_sand | `geometry { D, L, dz }` fixed: velocity, hence dP, depend on flow | NOT JUDGED | n/a |

### Reactors and the ammonia family

| case | declared extensive quantity | verdict | max dev ext / int |
|---|---|---|---|
| reactors/aceticAcid01_gibbsReactor | none (T, P, approach) | HOMOGENEOUS | 4.2e-12 / 1.4e-11 |
| gibbs/gibbs10_ammonia_fugacity | none | HOMOGENEOUS | 2.7e-12 / 0 |
| reactors/conversion02_parallel_selectivity | none (conversions) | HOMOGENEOUS (extents double) | 2.4e-12 / 0 |
| reactors/ammoniaRoutes01_screening | none; SIX feeds all doubled | HOMOGENEOUS | 4.9e-12 / 0 |
| reactors/ammoniaReactor01_fixedConversion | none; recycle, tol 1e-4 | HOMOGENEOUS (seeds unscaled) | 8.4e-10 / 2.8e-9 |
| reactors/ammoniaReactor02_equilibrium | none; recycle, tol 1e-4 | HOMOGENEOUS (seeds unscaled: 9.0e-6 / 9.0e-6; seeds scaled: 2.6e-8 / 2.5e-8) | see text |
| reactors/ammoniaReactor03_equilibriumApproach | none; recycle, tol 1e-4 | HOMOGENEOUS (seeds unscaled) | 2.6e-6 / 2.6e-6 |
| userops/userOp01_yield_reactor | none (`conversion 0.8`); built with the case's `code/` (the manual `g++` of `bin/buildCode`, against the same engine objects) | HOMOGENEOUS | 2.5e-12 / 0 |
| reactors/ammoniaReactor04_kineticSizing | `pfr V_R $V_bed` (an outerDict sweeps it) | NOT JUDGED | n/a |
| flowsheets/esterification2sector | `cstr V_R 0.5` with kinetics | NOT JUDGED | n/a |
| economics/economics01_esterification_dcf | `cstr V_R 5.0`, `heater Q 3e5 W` | NOT JUDGED | n/a |
| thermo/liquidDensity01_water | `cstr V_R 1` with a reaction, `pump dP, eta` | NOT JUDGED (measured anyway: homogeneous 3.2e-12, because the declared reaction `absentAcid` has zero rate; the declared V_R is inert here, not intensive) | n/a |

### Flowsheets (sectors)

| case | declared extensive quantity | verdict | max dev ext / int |
|---|---|---|---|
| flowsheets/plant01_two_sectors | none (two flashes in two sectors, nested `fa`, `fb`) | HOMOGENEOUS | 4.3e-12 / 0 |
| flowsheets/esterification2sector | see above | NOT JUDGED | n/a |

### Heat, power, rotating, utilities (all declare a size or a duty)

| case | declared extensive quantity | verdict |
|---|---|---|
| heat/hx01_heater | `Q 100 kW` | NOT JUDGED (control, below) |
| thermo/air01_heater_expand | `Q 5 kW` | NOT JUDGED |
| power/rankine01_water | `turbine W_shaft -10 kW`, `heater Q -5 kW` | NOT JUDGED |
| rotating/turbine01_air | `W_shaft -10 kW` | NOT JUDGED |
| utilities/utility02_hitec_csp_heater | `heatExchanger area 0.85 m2` | NOT JUDGED |
| evaporation/evaporator01_brine | `area 20 m2` | NOT JUDGED |
| hydraulics/pipe01_water_line | `D, L, dz, fittings` fixed: dP depends on flow | NOT JUDGED |

### Membranes and electrodialysis

| case | declared extensive quantity | verdict |
|---|---|---|
| membranes/membrane01_RO_NaCl_seawater | `area 35`, `length 1` | NOT JUDGED |
| electrodialysis/ed01, ed02 | `current`, `membraneArea`, `N_cellpairs` | NOT JUDGED |
| electrodialysis/ed03_stack_record | `current 2.0` and the stack record's area | NOT JUDGED |
| optimisation/fitNRTL01_ethanol_water | a `choupoProps` fit: no feeds, no flowsheet | NOT JUDGED (out of the property's domain) |

## Extension: seven more steady cases outside FASTSET

All seven HOMOGENEOUS at 1e-8 (no recycle), maximum extensive deviation: rotating/pump02_pressure_spec
1.8e-12 (`P_out`, `eta`: `W` follows the flow) · heat/phasechange01_partial_condenser
2.7e-12 · heat/phasechange02_saturated_mixture 2.1e-12 (two feeds) ·
absorption/absorber01_NH3_water 4.2e-12 (two feeds, `stages 6`; A_NH3 unchanged) ·
heat/mheatx01_two_hot_one_cold 4.8e-12 (three feeds; the unit's `imbalance` is
-3.29 and -6.59 kW, its relative form 2.3e-5 is unchanged) · gas-solid/gasSolidSplitter01_ideal
4.0e-12 · heat/coolingTower01_merkel 4.0e-12 (three feeds; `merkelNumber` is an NTU,
intensive).  Not run, declared sizes:
columns with `distillateRate`, compressor01 and 02 (`W_shaft`), cyclones (`bodyDiameter`),
bag filters (`filterArea`), `psa`/`tsa` beds, `hx02` (`area`), `convectiveDryer` (`area`).

## Control: the tool does flag a violation

`hx01_heater` (`Q 100 kW` declared) with the feed doubled: `T_out` 338.34 -> 319.17 K,
`dT` 38.34 -> 19.17 K (ratio 0.5), `Q_per_mol` 3600 -> 1800 J/mol, while `Q`
stays 100 kW: twelve keys flagged.  That is the declared quantity doing what a declared
quantity does, and the reason such a case is NOT JUDGED.

## Violations

None at k = 2 on the 17 + 7 eligible cases.

## What the scale sweep found (k = 1e-6 and 1e6, tolerance 1e-4, tear seeds scaled)

At k = 2 the property is exact to rounding.  Pushing the scale to the extremes
(14 eligible cases, base flow x k) shows where it stops being true: only the
Gibbs reactor family, and only at scales far from any shipped plant.

| case | k = 1e-6 | k = 1e6 |
|---|---|---|
| 11 of the 14 (k = 1e-6), 12 of the 14 (k = 1e6) | 1e-16 | 1e-16 |
| aceticAcid01_gibbsReactor | CONVERGED, but trace mole fractions move: y(dimethyl ether) +8.1 %, y(methyl acetate) +8.1 %, y(water) -7.5 % | FAILED: `unit 'reactor' failed to converge`, |F| stuck at 1.7e-6 |
| gibbs10_ammonia_fugacity | converged, H_products and Q off by 3e-3 and 2e-4 | 1e-16 |
| ammoniaReactor02_equilibrium | 4.3e-5 | FAILED to converge |

Intermediate scales (aceticAcid01, k = 1e-3 ... 1e4): at most 2e-10 up to k = 10 and
2.8e-9 from k = 100 up, so the failure is a cliff beyond about 1e5, not a drift.
ammoniaReactor02 at k = 1e3 deviates by 1.4e-5 (k = 10: 2.4e-8).

Cause (read, not patched): the element-potential Newton of the Gibbs reactor works on an
ABSOLUTE residual in mol/s.  `GibbsMethod.cpp:76-92` builds `r[j] = sum A n - b[j]` and
`r[M] = N_tot - exp(ln_N)` in moles, `GibbsMethod.cpp:128` sets `ndo.tolerance = 1.0e-8`,
and `NewtonND.cpp:666` stops on `normF < opts.tolerance` with `normF = normL2(Fx)`
(`NewtonND.cpp:643`), unscaled.  Two consequences, one per end of the scale:
* feeds of the order 1e7-1e8 mol/s: the rounding floor of the sum is ~1e-8, the line search
  finds no step (`newtonND: ... best trial |F| = 0.000002`) and the reactor reports NOT
  converged;
* feeds of the order 1e-5 mol/s: 1e-8 is a relative tolerance of 1e-3, the Newton stops
  early and the trace species, whose amounts are below that, carry the error.
The reactive-flash residual, `ReactiveFlash.cpp:104-114`, is in logarithms and is scale-free;
that route did not show up.  A relative residual (divide by the element totals `b`, or by
`N0`) would close it; that is a fix for a slice of its own, not made here.

## Findings worth keeping

1. No undeclared extensive default was found inside any FASTSET unit: every eligible
   case is exactly homogeneous at k = 2 (deviation 1e-12), including the six-feed
   routes case, the two-sector plant, the mill (whose `specificEnergy` is per tonne,
   so the power scales) and the user-written `yieldReactor`.
2. The only scale dependence is the absolute tolerance of the Gibbs Newton above.
3. A recycle case is homogeneous only to its `recycleTol`: ammoniaReactor02 with its tear
   seed left at the base value deviates by 9.0e-6 (about `recycleTol 1e-5`); with the seed
   scaled too, 2.6e-8.  The answer depends on the seed at the level of the tolerance.
4. The energy-closure residual is not homogeneous: ammoniaReactor02 `residual_kW`
   0.00194 -> 0.00209 (seeds unscaled), 0.00194 -> 0.00388 (seeds scaled).  It is solver
   noise, 3e-8 of the enthalpy flow, and not a property of the flowsheet.
5. `coolingTower01_merkel` closes its energy balance to 1.56 kW of 8 MW (2e-4), and the
   residual doubles with the feed: a systematic share, not noise (not examined further).
6. A case can declare an extensive quantity and not feel it: `liquidDensity01_water`
   declares `V_R 1` on a CSTR and is homogeneous because the reaction in it has zero rate.

## Reproducing

```
python3 bin/curate/homogeneity_probe.py tutorials/steady/flash/flash01_benzene_toluene feed
python3 bin/curate/homogeneity_probe.py tutorials/steady/reactors/ammoniaReactor02_equilibrium makeup --seeds --tol=1e-4
python3 bin/curate/homogeneity_probe.py tutorials/steady/reactors/aceticAcid01_gibbsReactor feed --k=1e6
```
