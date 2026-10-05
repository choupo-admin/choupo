# What water.dat does not say

*2026-09-27.  Commissioned by Vítor: "water is very important -- a gap in
its properties is unacceptable".  An INVENTORY first, then the fills that
move no golden, then a MEASURED list for the fills that would.  Nothing in
this record flips a catalogue value that a case reads today.*

## 1. The question, and the answer that changed its shape

`data/standards/components/water.dat` is the most-read record in the tree
(`check_gate_selftest.py` says so in its own words).  The question was: over
the range the corpus uses water, which of the properties a unit reads off
that record would a chemical-engineering student be right to distrust?

One fact, measured before anything else, changes what "the blast radius of
editing water.dat" means:

* 425 corpus cases; **264** name `water` in a `thermoPhysPropDict`.
* **263** of those carry their OWN copy at `constant/components/water.dat`
  under a sealed `constant/propertyManifest` (262 sealed; one ADOPTED copy,
  `ignition01_h2o2_rk4`, which a re-import never refreshes).
* **One** reads the catalogue record: `props/electrolyte/overlay01_nacl_ksp`,
  a live-overlay demo, and it reads no vapour pressure, heat capacity or
  transport property of water.

So an edit to the catalogue record moves (almost) no golden TODAY.  It moves
them the day each case is RE-IMPORTED (`bin/choupo-import`), and the
importer's `validate_staged_agrees` then REFUSES the re-seal of every case
whose golden the edit moves.  A catalogue flip is therefore not free just
because the suite stays green: it leaves 263 mirrors reporting drift
(`check_seal_drift`, informational) and blocks their re-seal until the moved
rows are re-recorded.  That is the decision the brief reserves for Vítor, and
it is why the vapour-pressure route below is built as an OPT-IN and measured
on staged copies rather than flipped.

Method, for every number below: census `docs/design`-external scratch
scripts over the tree at `741b759aa`; property comparisons against IAPWS
releases read from their own PDFs (§6) or against the IAPWS kernels already
in the tree (`src/thermo/iapws/IF97.cpp`, whose `verify()` returns 2.9e-9
against the release tables, and `src/thermo/iapws/IAPWSTransport.cpp`,
2.9e-6 against R12-08 / R15-11 / R1-76); golden movements by running
`bin/runTests` on staged COPIES of corpus cases (§4).  No corpus file was
edited to measure anything.

## 2. The inventory

Lines of `water.dat` are those at `741b759aa` (the record was edited by this
slice).  "Readers" are the call sites that take the value off a `Component`.
"Primary" is the source that would fill the gap; every one named here is
reachable online and was read for this record except where it says
otherwise.

| # | Property (water.dat @741b759aa) | Readers (file:line) | Measured against the primary | Primary, licence class | Blast radius | Disposition |
|---|---|---|---|---|---|---|
| 1 | `vaporPressure` Antoine (5.40221, 1838.675, -31.737), `Trange (273 373)`, :52-57 | `ThermoPackage.cpp:711, 796, 811, 1020` (K-values, bubble/dew, Raoult) and 23 `.cpp` files that call `Psat_Pa` | vs IAPWS SR1-86(1992) Eq. 1: -0.07 % at 273.16 K, -0.10 % at 298.15 K, +0.49 % at 333.15 K, **+2.47 % at 373.15 K** (inside its own window), +6.4 % at 423 K, +18 % at 573 K.  The fit's own normal boiling point is **372.45 K**, not the Tb 373.15 the record declares | IAPWS SR1-86(1992), Eq. 1 (six coefficients, reducing constants in its Sec. 2).  "Unrestricted publication allowed in all countries" (cover page) | Every water VLE case.  Sample run: 38 of 102 staged cases move, 268 rows (§4) | NOT flipped.  `Wagner` model added (opt-in, §3.2); list in §4 |
| 2 | `liquidHeatCapacity` constant 75.5 J/(mol K), `Trange (273 373)`, :66-71 | `Component.cpp:1134` (the liquid leg of `h_formation`), `Hliq_pure`, and 23 unit call sites of `cpLiquid()` | vs IF97 region 1 on psat(T): -0.69 % at 273.16 K, within 0.3 % over 298-348 K, -0.61 % at 373 K, **-6.7 % at 473 K, -27 % at 573 K** | IAPWS-95 (the scientific formulation; IF97 in the tree is its industrial companion).  Free on iapws.org | Every case with liquid water above ~400 K (boilers, evaporators, the Rankine and steam cases) | NOT flipped; no candidate built (§5) |
| 3 | The latent heat.  There is NO Hvap(T) block in the grammar: `Component::Hvap_latent` (`Component.cpp:1286`) is Watson on the record's own Tc/Tb/HvapTb with n = 0.38 | `Evaporator.cpp:383` (since 2026-10-05 only the boiling-point rise and the no-datum path), `SprayDryer.cpp:290, 314, 327, 416, 496`, `CoolingTower.cpp:160, 187`, `SolidDryer.cpp:154`, `EvaporativeDryer.cpp:141`, `BatchDryer.cpp:310`, and `h_formation`'s crossing (`Component.cpp:1134`) | Watson vs SR1-86 h''-h' (Eqs. 1-3, 6, 7): **+1.33 % at 298.15 K**, +0.02 % at 373.15 K, -0.62 % at 401.63 K, -2.1 % at 473 K, -2.65 % at 523 K.  AND the enthalpy SURFACE carries a SECOND latent heat, h_ig(T) - h_liq(T) = Watson(298.15) + int(Cp_ig - 75.5): +1.98 % at 373 K, **+2.66 % at 401.63 K**, +7.0 % at 473 K, +14.5 % at 523 K.  The two are 3.30 % apart at 401.63 K -- exactly the evaporator residual CLAUDE.md §6 reserved, until Vítor ruled the evaporator's duty onto the SURFACE's latent heat on 2026-10-05 (DEV.md 4c C35 item 3) | SR1-86(1992) Eqs. 1-7 (the same release as #1) | The evaporator, dryer and cooling-tower families; every energy balance that vaporises water | Named, NOT built: it needs a record grammar for Hvap(T) and a decision on which of the two surfaces is THE latent heat -- architecture, Vítor's |
| 4 | The LIQUID formation datum.  Only the ideal-gas datum is stored (:45-51) | `Component::h_formation(T,"liquid")` crossing at `Component.cpp:1134`; `ReactionGibbs.cpp:83-89` reads a `pureLiquid` rung when one is declared | Derived through Watson at 298.15 K: -286.40 kJ/mol, against the CODATA Key Value for H2O(l), **-285.830 +/- 0.040 kJ/mol** (0.57 kJ/mol).  CODATA H2O(g) -241.826 +/- 0.040 agrees with the record; s_298(g) 188.834 is inside CODATA's 188.835 +/- 0.010 | CODATA Key Values for Thermodynamics (Cox, Wagman & Medvedev, Hemisphere 1989), table at codata.info.  A published consensus value; cited as the primary | Every liquid-water energy balance on the formation datum (the error is the Watson term, not the datum) | NOT stored -- and it may not be: see §5.1.  Recorded as cross-checks in the record's header |
| 5 | No `liquidThermalConductivity` block (345 other records carry one) | `ChemSepCond16.cpp:42` (refused water by name), reached through `ThermoPackage.cpp:1783-1800` by `HeatExchanger.cpp:231`, `PhaseChanger.cpp:764, 1206`, `PropertyEvaluator.cpp:248` | -- (absent) | IAPWS R15-11 (2011).  "Publication in whole or in part is allowed in all countries provided that attribution is given" (cover page) | ZERO: no corpus case selects `chemsepEq16` with water; the one that asks for water's liquid k selects the predictive `SatoRiedel`, which reads no block | **FILLED** (§3.1) |
| 6 | No `lennardJones` block (no catalogue component carries one) | `ChapmanEnskog.cpp:63-115` (refuses by name without it) | Svehla 1962 Table I(a), H2O: sigma 2.641 A, eps/k 809.1 K, method 1 (least-squares fit to viscosity data) | Svehla, NASA TR R-132 (1962), US-government work, public domain; transcription `bin/curate/svehla1962/` | ZERO today (the witness `transport02_chapman_enskog` carries its own blocks) | NOT promoted: promotion is Vítor's review (CLAUDE.md §6).  The fragment was generated to `data/local/lennardJones/water.dat` by `bin/curate/propose_lennard_jones.py` (gitignored) |
| 7 | Liquid density: a single `Vliq 1.807e-5` (:36) | `ThermoPackage.cpp:1942-1978` (Vliq x Rackett(T)/Rackett(298.15)), `Pump.cpp:75`, `CSTR.cpp:181, 530`, `PFR.cpp:387, 822` (constant, no T dependence), `SprayDryer.cpp:341` | At 298.15 K Vliq agrees with SR1-86 Eq. 2 (997.0 kg/m3).  The Rackett SHAPE does not fit water: engine density **+1.99 % high at 273.16 K** (it cannot see water's density maximum), **-3.5 % at 373 K**, -5.9 % at 473 K, -6.6 % at 573 K | SR1-86(1992) Eq. 2 (saturated-liquid density) | Pumps, pipes, volumetric reactors | Named, NOT built: no per-component liquid-density correlation exists in the grammar |
| 7b | A SECOND home for water's Vliq in code: `src/thermo/electrolyte/SolventProperties.H:78` returns `1.807e-5 * rhoWaterKell(25.0) / rhoWaterKell(t)` -- the record's number, typed again | The electrolyte solvent properties | Agrees today because both say 1.807e-5 | -- | The day the record's Vliq moves, this does not | Named (arity), not fixed |
| 8 | Surface tension: no record block; the generic `BrockBird` (`BrockBird.cpp:57-63`) from Tc/Pc/Tb | `ThermoPackage.cpp:1824-1833` routes water to IAPWS R1-76 ONLY when the case flags `pureFluids { water { method IF97; } }` | BrockBird on water vs R1-76: **+48 % at 298 K**, +35 % at 373 K, +21 % at 473 K (corresponding states cannot see hydrogen bonding) | IAPWS R1-76(2014), already in the tree | 7 cases declare `surfaceTension { model BrockBird; }` with water: the six spray dryers and `pipe02_airwater_twophase` | Named, NOT flipped: the fix exists as an opt-in (`pureFluids ... IF97`), switching those seven cases to it moves their goldens |
| 9 | `liquidViscosity { andrade; vogel; }` (:145-149), "re-citation pending" | `Andrade.cpp:44`, `Vogel.cpp:40`, reached by the membrane, ED, pipe and spray-dryer units | vs IAPWS R12-08 on the saturated liquid: **Andrade -12 % at 273 K, +4 % at 323 K, -16 % at 423 K, -27 % at 473 K**; Vogel within 0.3 % over 298-373 K, +2.2 % at 473 K, +9 % at 573 K | IAPWS R12-08 (2008), already in the tree | Vogel: 11 water cases (the ED family, the pipes); Andrade: 2 (`props/compare/...`) | Named.  Vogel is sound where the corpus uses it; Andrade is a two-parameter form and should not be read outside ~290-360 K |
| 10 | `idealGasHeatCapacity` polynomial (:59-64), source "pending" | `Component.cpp` gas leg, every `h_pure_ig` | vs IF97 region 2 at p = 1 Pa (the ideal-gas limit): +0.21 % at 298 K, +0.59 % at 373 K, +0.32 % at 573 K, -0.42 % at 1073 K | IAPWS-95 ideal-gas part | Every gas-phase water enthalpy | Sound to 0.6 %; the citation is still pending |
| 11 | Critical and normal-boiling constants (:30-35) | Every cubic EoS, AmbroseWalton, BrockBird, Rackett, Watson | Pc 220.64 bar = SR1-86 pc (agrees).  Tc 647.14 vs SR1-86 **647.096 K** (ITS-90).  Tb 373.15 vs 373.1243 K.  HvapTb 40660 vs 40653.5 J/mol (SR1-86 Table 1).  omega 0.3449 vs 0.3443 (from SR1-86 at Tr = 0.7) | SR1-86(1992) Sec. 2 and Table 1 | Every case (the constants feed everything) | NOT changed: recorded as cross-checks in the record header |
| 12 | `ebulioscopic { K_b 0.512; K_f 1.853; }` (:135-139), "re-citation pending" | `Evaporator.cpp:335`, `FreezingPoint.cpp:142` (anchors: the engine derives K_b = 0.51294 from the record's own Tb/MW/HvapTb) | -- | No primary found in the tree; not searched further | The anchors only | Still pending |
| 13 | No `solidHeatCapacity` for ice | `Component.cpp` solid leg falls back to the LIQUID Cp, announced (`[thermo] ... Cp_liquid fallback`) | Ice Cp is roughly half the liquid's | IAPWS R10-06 (ice Ih) -- not read for this record | The ice / freezing cases | Named; adding it moves their goldens |

## 3. What was built

### 3.1 The liquid thermal conductivity (additive; no golden moves)

`water.dat` gains `liquidThermalConductivity { chemsepEq16 { A..E; Tmin;
Tmax; } }` and a structured `provenance { liquidThermalConductivity { origin
regressed; method; validity; uncertainty; notes; } }`.  The coefficients are
DERIVED, not transcribed: a least-squares fit of form 16 to IAPWS R15-11
background conductivity on the saturated-liquid line, 273.16-573.15 K,
300 points, density from IF97 region 1 at psat(T) -- both kernels already in
the tree and verified against their releases' own tables on every run.

Form 16 is over-parameterised for water: with A free the least-squares
optimum runs A to minus infinity (A = -500 still improving), the form
degenerating into a polynomial in the exponent.  So A is FIXED by the
curator at -1 W/(m K) and B..E are the weighted linear solution for
ln(k - A).  The scan that chose it (max relative deviation over
273.16-573.15 K): A = 0: 0.99 %; -0.5: 0.74 %; **-1: 0.64 %**; -2: 0.56 %;
-5: 0.49 %.  -1 was taken as the smallest-magnitude offset under the
formulation's own stated uncertainty on this line (0.7 %, R15-11 Sec. 2.5).
Residual: RMS 0.14 %, max 0.64 % at 273.16 K; to 623 K the same form reaches
2-3 % and the window therefore stops at 573.15 K, where the kernel's omitted
critical enhancement also starts to matter.

Verified through the engine (a scratch `choupoProps` case selecting
`chemsepEq16`): 0.5592 W/(m K) at 273.16 K, 0.6054 at 298.15 K, 0.6777 at
373.12 K, 0.6584 at 473.15 K, 0.5487 at 573.15 K; before this block the same
case REFUSED water by name.

### 3.2 A `Wagner` vapour-pressure model (engine; opt-in; no golden moves)

`src/thermo/vaporPressure/Wagner.{H,cpp}`, registered `Wagner` in
`VaporPressureModel::registerBuiltins()` (the explicit factory, §5 of
CLAUDE.md).  It evaluates
ln(Psat/Pr) = (Tr/T) sum a_i tau^e_i with DECLARED exponents (the form is a
family: SR1-86 uses 1, 1.5, 3, 3.5, 4, 7.5; handbook four-term forms use
1, 1.5, 2.5, 5 or 1, 1.5, 3, 6) and DECLARED reducing constants in a
REQUIRED `reducing { T; P; }` block.  The component's own Tc/Pc, which
`Component::readFromDict` injects into every vapour-pressure sub-dict, are
never substituted: water.dat's Tc is 647.14 K, the equation reduces by
647.096 K, and the correct coefficients at the wrong reduced temperature are
a silently wrong curve.  Above Tr it returns Pr (as `AmbroseWalton` returns
Pc); at a trial T <= 0 it returns the equation's own limit, 0 (a MESH
iteration asks for one -- §4).  The base class announces both excursions.

Verified through the engine against the release's own Table 1: 611.657 Pa
at 273.16 K, 101325.015 Pa at 373.1243 K, 22.064 MPa at 647.096 K
(relative 1.1e-7, 1.5e-7, 0).  Independently, SR1-86 Eq. 1 and the tree's
IF97 region-4 equation agree to 1.8e-4 over 273.16-623.15 K.

HOW A CASE OPTS IN, today, with no further code: a case-local partial
overlay (`constant/components/water.dat` with `overlayOf water;` and the
`vaporPressure { model Wagner; ... }` block of §4), or, in a sealed case, an
ADOPTED record.  The overlay route was run end to end (the `[overlay]` line
names the five leaves it replaced).

NOT built, said plainly: no witness case in `tutorials/` exercises `Wagner`
yet (adding one needs its golden recorded, which this slice may not do), so
nothing in `bin/runTests` holds the model to its Table 1 today.  That is the
first thing to add when the flip is authorised.

### 3.3 The record's header now says what it measured

The header's old warning ("accurate for 273-373 K only") was false inside
its own window; it now quotes the measured deviations and names the two
opt-in routes.  A cross-check block records each constant against SR1-86 and
CODATA, and states that the liquid datum is DERIVED (and that the derivation,
not the datum, is 0.57 kJ/mol off).  No value moved.

## 4. The vapour-pressure flip, measured and NOT taken

Staging: 102 of the 264 water cases -- every FASTSET water case plus every
water case in the families where water sits hottest (`steady/evaporation`,
`power`, `utilities`, `distillation`, `absorption`, `drying`, `heat`,
`flash`, `props/steam`) -- were copied to a scratch directory.  In each copy
the `vaporPressure` block of `constant/components/water.dat` was replaced by

```
vaporPressure
{
    model         Wagner;
    reducing      { T 647.096 K;  P 22.064 MPa; }
    exponents     (1 1.5 3 3.5 4 7.5);
    coefficients  (-7.85951783 1.84408259 -11.7866497 22.6807411 -15.9618719 1.80122502);
    Trange        (273.16 647.096);
}
```

and the manifest's two hashes for that record recomputed, exactly as a
re-import would leave it (the ADOPTED copy was left as authored, since a
re-import never touches it).  An unflipped control copy of the same 102
was run the same way (§4.2).

Result: **62 PASS / 38 FAIL / 2 EXPECTED-FAIL; 268 golden rows move across
37 cases, and one case stops converging.**  Largest move per case:

| Case | Rows moved | Largest relative move | Row (golden -> flipped) |
|---|---|---|---|
| ChemicalPlantTutorial | 15 | 1.09 % | `boundary.global.residual_kW` 34.4126 -> 34.7885 |
| absorption01_CO2_water | 1 | 0.097 % | `kpi.scrubber.K_water` 0.0063335 -> 0.0063396 |
| acetone05_luyben_absorber | 2 | 0.11 % | `kpi.absorber.A_water` 8.01257 -> 8.02133 |
| acetone06_luyben_column_C1 | 12 | 1.72 % | `stream.acetoneProduct.water` 0.026877 -> 0.026415 |
| acetone07_luyben_column_C2 | 22 | 10.4 % | `boundary.global.Q_boundary_kW` -6.0458 -> -5.4165 |
| bubbleT01_ethanol_water | 3 | 0.78 % | `kpi.bubble01.y_water` 0.418085 -> 0.414807 |
| bubbleT02_uniquac_ethanol_water | 3 | 0.76 % | `kpi.bubble02.y_water` 0.417289 -> 0.414121 |
| column03_azeotrope_mesh | 13 | 2.76 % | `boundary.global.Q_boundary_kW` -17.3603 -> -16.8817 |
| **column05_reactive_methylacetate** | -- | -- | **does not converge** (MESH, 80 Newton iterations, exit 2) |
| coolingTower01_merkel | 7 | 0.11 % | `kpi.tower01.approach_K` 7.75695 -> 7.76575 |
| dryer01_sucrose_tray | 14 | 0.40 % | `kpi.dryer.X_equilibrium` 0.0157979 -> 0.0158609 |
| economics01_esterification_dcf | 27 | 2.05 % | `utility.separator.heating.steamLP.eur_h` 13.9008 -> 13.6156 |
| esterification2sector | 11 | 8.8 % | `closure.SEPARATION.flash.remaining_kW` 6.676e-05 -> 7.265e-05 |
| evapDryer01_nacl | 1 | 1.72 % | `kpi.dryer.exhaust_humidity` 0.039295 -> 0.039969 |
| evaporator01_brine | 1 | 2.39 % | `kpi.evap.P` 102416 -> 99970 |
| evaporator02_triple_effect_sugar | 3 | 2.14 % | `kpi.effect1.P` 87941 -> 86061 |
| evaporator06_nacl_pitzer | 1 | 3.14 % | `kpi.evap.P` 154247 -> 149400 |
| evaporator07_nacl_enrtl | 1 | 3.22 % | `kpi.evap.P` 160657 -> 155477 |
| evaporator08_naoh_dilution_heat | 1 | 2.52 % | `kpi.evap.P` 110574 -> 107787 |
| evaporator09_nacl_sucrose_brine | 1 | 3.15 % | `kpi.evap.P` 155034 -> 150146 |
| fitNRTL01_ethanol_water | 7 | 62.5 % | `diag.fit_NRTL_ethanol_water.iter` 24 -> 39 |
| flash02_ethanol_water | 9 | 14.4 % | `stream.liquid.F` 0.0056232 -> 0.0064304 |
| flash03_wilson_ethanol_water | 9 | 13.5 % | `stream.liquid.F` 0.0063767 -> 0.0072407 |
| flash08_co2_water_package | 1 | 0.097 % | `kpi.node.K_water` 0.0312534 -> 0.0312837 |
| flash20_ethanol_water_pcsaft | 11 | 27.8 % | `closure.flashNRTL.raw_kW` -42.861 -> -54.756 |
| greenAmmoniaIndustrialN2 | 1 | 0.013 % | `stream.KoWater.F` 0.00124972 -> 0.00124956 |
| lithiumBrinePlant | 3 | 18.3 % | `stream.product.F` 0.0065342 -> 0.0077271 |
| model5_nrtl_flash | 9 | 17.2 % | `stream.vapor.F` 0.0106812 -> 0.0088492 |
| psychro01_n2_water | 3 | 0.61 % | `diag.airWater.Y_sat_last` 0.158606 -> 0.157636 |
| solidDryer01_sugar | 6 | 6.1 % | `kpi.solidDryer.water_activity` 0.0043116 -> 0.0045754 |
| sprayDryer01_sugar | 10 | 2.4 % | `kpi.dryer.water_activity` 0.062606 -> 0.064111 |
| sprayDryer02_residence_sweep | 9 | 2.4 % | (as sprayDryer01) |
| sprayDryer03_pressure_nozzle | 10 | 2.4 % | (as sprayDryer01) |
| sprayDryer04_profiles | 10 | 2.4 % | (as sprayDryer01) |
| sprayDryer05_whey | 8 | 3.1 % | `kpi.dryer.water_activity` 0.030279 -> 0.031227 |
| sprayDryer06_rea | 10 | 2.4 % | (as sprayDryer01) |
| sprayDryer07_design | 11 | 2.4 % | (as sprayDryer01) |
| stripper01_NH3_water | 2 | 0.40 % | `kpi.stripper.K_water` 0.170563 -> 0.169889 |

### 4.1 Why each family moves (the physical reason, row by row)

* **Evaporators (`kpi.evap.P`, `kpi.effect1.P`)** -- the unit sets the
  boiling pressure from water's saturation curve at the brine temperature.
  At 373-380 K the Antoine fit is 2.4-3.2 % HIGH (§2 row 1), so the IAPWS
  pressure is 2.4-3.2 % LOWER.  The move equals the Antoine error at the
  case's own temperature, to the digit printed.
* **Ethanol-water flashes and bubble points (`V_over_F`, `F`, `y_water`,
  `K_water`)** -- K_water = gamma Psat / P, and at 350-360 K Antoine is
  +1.0-1.3 % high, so water is less volatile under IAPWS: less vapour, more
  liquid.  The large RELATIVE moves on stream flows (13-17 %) are the
  lever of a flash sitting close to its dew point, not a large property
  change.  `K_ethanol` moves too in an isothermal flash because the liquid
  composition, and with it gamma, moves.
* **Absorbers and strippers (`K_water`, `A_water`)** -- the same Psat at
  ~300-330 K, where the two curves are within 0.1-0.4 %.
* **Dryers, cooling tower, psychrometrics (`water_activity`,
  `X_equilibrium`, `exhaust_humidity`, `approach_K`, `Y_sat_last`)** --
  saturation humidity and equilibrium moisture are ratios p_w / Psat; the
  spray dryers' 2.4 % is Antoine's error at their wet-bulb/outlet
  temperature.
* **Columns and plants (`Q_boundary_kW`, reboiler/condenser duties, the
  economics' steam cost, `closure.*`)** -- the tray temperatures move with
  the water curve, and every duty priced from them follows.  The large
  relative moves are on SMALL numbers (a 6 kW boundary residual, a
  7e-5 kW closure remainder), not on the duties themselves.
* **`fitNRTL01` (`iter` 24 -> 39)** -- a regression against VLE data now
  fits an NRTL pair on a different pure-component curve; the iteration
  count and the fitted parameters move.  This is the case to read with most
  care: a fitted binary is only as good as the Psat it was fitted with, and
  the pair stored in the tree was fitted on the Antoine curve.
* **`flash20_ethanol_water_pcsaft` (`closure.flashNRTL.raw_kW`)** -- its
  NRTL comparison flash moves (Psat); its PC-SAFT flash does not read Psat.
* **`column05_reactive_methylacetate` stops converging.**  Its MESH Newton
  steps a trial temperature through 245 K and to or below 0 K (the run
  announces both); with Antoine it recovers, with the IAPWS equation (whose
  honest limits are 0 at T <= 0 and Pr above Tr) it ends at |F| = 98 after
  80 iterations.  Undiagnosed; named here because a flip without it would
  turn a passing case into a failing one.

### 4.2 The control, and what the sample does not cover

The control -- the same 102 copies staged the same way, UNFLIPPED -- ran
100 PASS / 0 FAIL / 2 EXPECTED-FAIL, so every one of the 38 failures above
is the flip and none is the staging.  (The flipped run was taken before the
`T <= 0` guard of §3.2 existed; `column05` then CRASHED on a refusal, and
re-run with the guard it fails to converge instead.  No other staged case
reached that branch, or it would have crashed too.)

The sample is 102 of 264 cases, deliberately the hot ones.  The other 162
(most of `props/electrolyte`, `steady/membranes`, `steady/crystallisation`,
`steady/reactors`, `steady/gibbs`) were not staged.  Many of them evaluate
water's Psat only below 313 K, where the two curves agree to 0.1 %, but "not
measured" is what this record can say about them.  The full list needs a
corpus-wide staged run, which §0.4 of CLAUDE.md puts behind Vítor's
authorisation.

## 5. What this record deliberately did not do

### 5.1 It did not store the liquid formation datum -- and the brief asked it to

The brief listed "the liquid standardThermochemistry datum" as the likely
additive fill.  The grammar supports a `pureLiquid { ... }` sub-block
(`Component.cpp` "ADDITIONAL RUNGS", read by `ReactionGibbs.cpp:83-89`),
and CLAUDE.md §6 ("THE REFERENCE RUNG") still calls water's liquid datum "a
MISSING SECOND DATUM".  But the record-form contract forbids it:
`check_record_form` refuses a component carrying more than one formation
datum ("ONE per component, in its natural phase; the others derive through
hvap/hfus"), and `check_logk_crosscheck.py`'s own docstring records that
exactly this block WAS added to water.dat on 2026-08-07, caught by that
gate, and removed.  The contract is the one that holds; CLAUDE.md §6 and the
Component.cpp comment are stale on this point (named, not edited here).

It would also have introduced an inconsistency the gate exists to prevent:
`ReactionGibbs` reads the rung only AT 298.15 K and takes the Watson
crossing everywhere else, so a stored -285.830 would make water's liquid
enthalpy jump by 0.57 kJ/mol between 298.15 K and 298.16 K in that op.  The
0.57 kJ/mol is the DERIVATION's error (row 3), and the remedy is a better
latent heat, not a second datum.

### 5.2 It did not fix the latent heat, the liquid Cp, the density or Tc

Each is a correct-looking change that moves goldens across the families in
§4 once the mirrors are re-imported, and the latent heat needs grammar
(architecture).  The measurements in §2 are what a decision would be taken
on.  A liquid-Cp candidate is NOT built: fitting a polynomial to IF97's
cp on the saturation line is straightforward, but choosing its window
(the saturated-liquid cp rises 36 % between 373 and 573 K) and whether it
should be paired with an Hvap(T) block so the two latent heats of row 3
become one are the same decision.

## 6. Sources read for this record

* IAPWS SR1-86(1992), *Revised Supplementary Release on Saturation
  Properties of Ordinary Water Substance*, St. Petersburg, September 1992:
  Sec. 2 (reducing constants), Eq. 1 (vapour pressure), Eqs. 2-7, Sec. 6
  (validity 273.16-647.096 K), Table 1 (verification values).  Cover page:
  "Unrestricted publication allowed in all countries."
* IAPWS R15-11, *Release on the IAPWS Formulation 2011 for the Thermal
  Conductivity of Ordinary Water Substance*, Plzen, September 2011: Sec. 2.5
  (0.7 % uncertainty on the saturated-liquid line), Table 4.  Cover page:
  publication allowed provided attribution is given to IAPWS.
* CODATA Key Values for Thermodynamics (J. D. Cox, D. D. Wagman,
  V. A. Medvedev, Hemisphere, New York, 1989), as tabulated by CODATA:
  H2O(l) -285.830 +/- 0.040 kJ/mol, 69.95 +/- 0.03 J/(mol K); H2O(g)
  -241.826 +/- 0.040 kJ/mol, 188.835 +/- 0.010 J/(mol K).
* Svehla, R. A., NASA TR R-132 (1962), Table I(a), via the tree's own
  transcription `bin/curate/svehla1962/`.
* IAPWS-IF97 (R7-97(2012)), R12-08, R1-76(2014): through the kernels in
  `src/thermo/iapws/`, not re-read for this record.
