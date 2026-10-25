# Parity with an open reaction library — thermodynamics, kinetics, reactors, transport

**Kind: STUDY + PROPOSAL (DEV.md §4c C160, phase 0).  Status: AWAITING
Vítor's scope ruling.  Decides nothing; no engine code rides with it.**

Vítor's programme text of 2026-10-25 asks for a parity programme against
Cantera 3.2 (an open-source chemical-kinetics, thermodynamics and transport
library, BSD-3-Clause), used ONLY as an external numerical oracle: an
inventory of what Choupo has, a parity matrix against the library's own 3.2
documentation and examples, the confirmed gaps, a scope, an architecture, a
phased plan, oracle cases with quantitative tolerances that keep three error
classes apart, and the risks.  This record is that phase 0.

Everything below about Choupo was READ in the tree at `origin/main`
`cda97b378` and carries the `file:line` it was read at.  Everything about the
library was read on its 3.2 documentation pages on 2026-10-25 and carries the
page.  A capability is called ABSENT only after a search for it returned
nothing; the search is named.

---

## 0. The answer in one page

* **Choupo is already deep where a process simulator must be deep**, and in
  several places deeper than the library: non-ideal liquid thermodynamics
  (NRTL, UNIQUAC, Wilson, UNIFAC, COSMO-SAC), PC-SAFT with association,
  three electrolyte engines plus eNRTL, IAPWS-IF97, reactive and multiphase
  flash, Gibbs and reaction-subset equilibrium reactors, LHHW, a written
  rate-law grammar, catalyst-pellet effectiveness, packed-bed pressure drop
  and cooled multitubular beds.  None of that is breadth for its own sake;
  it is the process line.
* **Its gas-phase detailed kinetics is a working island, not a capability.**
  The CHEMKIN-style rate forms (modified Arrhenius, third body,
  Lindemann/Troe fall-off) and the stiff integrator exist, but ONLY inside
  `batchReactor`, and that vessel is constant-volume only and never computes
  its own pressure.  The `cstr` and `pfr` cannot reach those forms and form
  their concentrations on a LIQUID basis.  So the library's canonical
  example — an adiabatic constant-pressure ignition — has no Choupo
  counterpart today, and neither does a gas jet-stirred reactor or a gas PFR
  with mass-action kinetics.
* **The thermo datum needed for a tight oracle is mostly not on the
  catalogue's own form.**  `NASA7` is implemented, but in the standard
  catalogue only `graphite.dat` uses it; of the 605 component records, 355
  declare `chemsepCp16` and 161 a 4-term cubic `polynomial` (88 declare no
  ideal-gas Cp at all), the cubic being a 250–1500 K refit even for flame
  radicals.  The 1e-10 NASA-7 oracle the
  programme asks for therefore holds for case-local NASA-7 records, which is
  where combustion lives today — and that is a property of the DATA, not a
  defect of the code.
* **Recommended scope:** thermodynamics, homogeneous gas kinetics, the ideal
  reactors (batch const-V and const-P, gas CSTR, gas PFR), rate
  sensitivities, and the transport the process units read — the commander's
  default — with two departures argued in §4: heterogeneous MICROkinetics
  (surface species, coverages, sticking) is recommended as the LAST and
  OPTIONAL phase rather than in-scope by default, because LHHW plus the
  pellet already answer the process question; and multicomponent /
  thermal-diffusion transport is recommended OUT with the flames, because
  nothing in a process unit reads it.  1-D flames and plasma OUT.
  Electrochemistry: no parity work; a Butler–Volmer electrolyser is a
  separate unit-operation commission if Vítor wants one.
* **Nine phases**, each landable alone, the first being a behaviour-preserving
  extraction of the rate forms into the one kinetics factory (§6).
* **Oracle tolerances** run from 1e-10 relative (a NASA-7 Cp, same
  polynomial, the gap is the gas constant's truncation) through 1e-8
  (equilibrium, once the Gibbs tolerances are declared) to 0.5 % (an ignition
  delay, two different integrators) and a few percent where the two codes
  use legitimately different transport correlations (§7).  Every tolerance
  names which of the three error classes it bounds.
* **Licence:** the library is BSD-3 and stays out of the runtime, exactly as
  it already is in `bin/curate/import_gibbs_nasa.py:47`.  One licence
  question is RESERVED for Vítor and blocks nothing in phase 1: the tree
  ships the GRI-Mech 3.0 H/O subset verbatim (three tutorials) while the
  2026-06-21 kinetics record found GRI-Mech to carry no redistribution grant
  (§7.6).

---

## 1. Inventory of Choupo, measured

`IMPLEMENTED` — usable by a case today.  `PARTIAL` — exists with a stated
limit that matters for parity.  `ABSENT` — searched for and not found.

### 1.1 Pure-component and mixture thermodynamics

| capability | status | evidence |
|---|---|---|
| Ideal-gas Cp forms | IMPLEMENTED: `polynomial`, `RowlinsonBondi`, `chemsepCp16`, `NASA7` | `src/thermo/heatCapacity/HeatCapacityModel.cpp:66-82` |
| NASA-7 polynomial | IMPLEMENTED, with a datum convention: Cp from a1–a5 per range; H and S are the SENSIBLE integrals from 298.15 K; **a6, a7 are read and not used** — the formation datum lives in `standardThermochemistry {dHf_298; s_298;}` | `src/thermo/heatCapacity/NASA7Cp.H:38-50` |
| NASA-7 in the standard catalogue | PARTIAL: 1 of 605 records (`graphite.dat`); 355 `chemsepCp16`, 161 `polynomial`, 88 with no `idealGasHeatCapacity` block (counted with `grep` over `data/standards/components/*.dat`, 2026-10-25) | e.g. `data/standards/components/C2H3.dat:24-31` — a GRI-Mech 3.0 radical refitted to a cubic, "the window is the FIT's range (250-1500 K)" |
| NASA-7 in combustion cases | IMPLEMENTED case-locally for the majors only: H2, N2, O2, water carry `model NASA7`; the radicals keep the catalogue cubic | `tutorials/batch/combustion/ignition01_h2o2/constant/components/O2.dat`; `.../ignition02_h2air_slack/constant/components/OH.dat` (`model polynomial`, `Trange (250 3000)`) |
| NASA-9, Shomate, constant-cp, piecewise-Gibbs | ABSENT (`grep -ri "NASA9\|Shomate"` over `src/`: 0 files) | — |
| h, s, g of the ideal gas on the elements datum | IMPLEMENTED, one home | `src/thermo/Component.cpp:1477-1517` (`h_pure_ig` delegates to `h_formation(T,"gas")`) |
| Standard pressure | 1 bar | `src/core/Constants.H:51` (`Pref = 1.0e5`) |
| Gas constant | `R = 8.314462618` J/(mol K) — CODATA 2018 truncated at 10 significant digits | `src/core/Constants.H:47` |
| Cubic EoS | IMPLEMENTED: `idealGas`, `SRK`, `PR` (`PengRobinson` alias) | `src/thermo/equationOfState/EquationOfState.cpp:67-86`; PR constants `OMEGA_A = 0.45724`, `OMEGA_B = 0.07780` at `src/thermo/equationOfState/PR.cpp:48-49` |
| Original Redlich-Kwong | ABSENT (SRK only) | same registry |
| PC-SAFT (+ association) | IMPLEMENTED | `src/thermo/equationOfState/PCSAFT.{H,cpp}`; CLAUDE.md §6 |
| Activity models | IMPLEMENTED: `ideal`, `NRTL`, `Wilson`, `UNIFAC`, `UNIQUAC`, `cosmoSAC` | `src/thermo/activityCoefficient/ActivityModel.cpp:82-115` |
| Margules / Redlich-Kister as solution models | ABSENT as activity models (Margules appears only inside Henry's law, `src/thermo/henrysLaw/HenrysLaw.cpp`) | — |
| Electrolytes | IMPLEMENTED: Davies, `pitzerHMW` (Harvie–Møller–Weare), `edwardsPitzer`, salt-level `pitzer`, eNRTL single/multi-salt/mixed-solvent, speciation | `src/thermo/electrolyte/` (`PitzerHMW.H`, `EdwardsPitzer.H`, `ENRTL*.H`, `SpeciationSolver.H`) |
| Pure-fluid reference EoS | PARTIAL: IAPWS-IF97 water only (`IF97`) | `src/thermo/pureFluid/PureFluidModel.cpp:197`; `src/thermo/iapws/IF97.H` |
| Phase equilibrium | IMPLEMENTED: isothermal / adiabatic flash, Michelsen stability, LL Gibbs minimisation, VLLE, reactive VLE, organic second liquid | `src/unitOperations/flash/`, `src/solver/StabilityTest.H`, `src/thermo/electrolyte/ReactiveVLE.H` |
| Gibbs minimisation | IMPLEMENTED: `elementPotential` (ideal gas + ideal liquid), `directMin` (non-ideal liquids), pure solid phases (graphite) | `src/unitOperations/reactor/gibbsMethod/GibbsMethod.H:28-50`; `GibbsReactor.H` ("PURE SOLID PHASES (2026-09-27, C14)") |
| Equilibrium specification pairs | PARTIAL: `isothermal` (TP) and `adiabatic` (HP) only | `src/unitOperations/reactor/GibbsReactor.cpp:181-182` |
| Gibbs gas fugacity | ideal gas, φ = 1 | `src/unitOperations/reactor/GibbsReactor.H` ("φ_i = 1 assumption") |
| Gibbs convergence controls | PARTIAL: hard-coded — element-potential Newton `1.0e-8`, adiabatic outer Newton on T `1.0e-2`; not declared through `solver/Convergence.H` | `src/unitOperations/reactor/gibbsMethod/GibbsMethod.cpp:128`; `GibbsReactor.cpp:513` |
| Reaction-subset equilibrium (Kp per reaction) | IMPLEMENTED (`equilibriumReactor`) | `src/unitOperations/reactor/EquilibriumReactor.H:28-50` |
| Equilibrium constant Kc | IMPLEMENTED, one home: `Kp = exp(-Σν g°/RT)`, `Kc = Kp (P°/R_u T)^Σν` | `src/thermo/reaction/Reaction.cpp:107-150` |
| Standard reaction thermochemistry bench | IMPLEMENTED (`reactionGibbs` props op) | `src/propertyOps/ReactionGibbs.H` |

### 1.2 Homogeneous kinetics

| capability | status | evidence |
|---|---|---|
| Rate-law factory | IMPLEMENTED: `Arrhenius`, `LHHW`, `expression` | `src/thermo/reaction/ReactionRate.cpp:112-114` |
| Power law with declared orders (non-integer allowed) | IMPLEMENTED; a reactant with no order REFUSES | `src/thermo/reaction/Reaction.H:128-150` (`forwardOrder`) |
| Reverse rate by detailed balance | IMPLEMENTED (`reversible true`) | `src/thermo/reaction/RateLaw.cpp:148,190` |
| Explicit reverse Arrhenius | IMPLEMENTED in `RateLaw` (`A_rev`, `Ea_rev`) | `src/thermo/reaction/RateLaw.cpp:79-82` |
| Modified Arrhenius `A T^b exp(-Ea/RT)` | PARTIAL: only in `batchReactor`'s own reader; the factory's `Arrhenius` has no `b` | `src/thermo/reaction/Reaction.H:80`; caller `src/unitOperations/batch/BatchReactor.cpp:447`; `RateLaw.H` members (`A_`, `Ea_`, no `b`) |
| Third body `[M] = Σ ε_j c_j` | PARTIAL: `batchReactor` only | `Reaction.H:86`; `BatchReactor.cpp:457-459` |
| Lindemann / Troe fall-off | PARTIAL: `batchReactor` only | `Reaction.cpp:69-100`; `BatchReactor.cpp:462-464` |
| Who reads the CHEMKIN forms | `batchReactor` alone; `cstr`/`pfr` multi-reaction paths take every law through the factory, which has none of them | `src/thermo/reaction/ReactionRate.H:55-66`; `BatchReactor.H:140` (`enum class RateForm { Arrhenius, ModArrhenius, ThirdBody, Falloff, Factory }`) |
| SRI, Tsang, chemically-activated, PLOG, Chebyshev, Blowers–Masel, linear-Burke | ABSENT (`grep -riE "\bSRI\b|PLOG|Blowers"` over `src/`: 0; "Chebyshev" only in the cooling tower's Merkel integration, `src/unitOperations/heatTransfer/CoolingTower.cpp`) | — |
| DUPLICATE reactions | IMPLEMENTED by convention: two entries, rates add | `tutorials/batch/combustion/ignition01_h2o2/constant/reactions` (header: "both members of each GRI DUPLICATE pair (their rates add)") |
| CHEMKIN unit conversion (cm-mol-s, cal, kcal) | IMPLEMENTED, announced, `batchReactor` only | `BatchReactor.cpp:372-393` |
| Written rate laws (`expression`) | IMPLEMENTED (C67): formula over declared parameters with units, tables, dimension-checked | `src/thermo/reaction/ExpressionRate.H`; `src/core/Formula` |
| Mechanism import | PARTIAL: one-off curation scripts, no general tool — `bin/curate/gri_subset_to_choupo.py` (GRI H/O subset only, a regex reader), `bin/import_nasa.py` (thermo) | those files |
| Stiff ODE integration | IMPLEMENTED: `RK4`, `EulerSI`, `Rosenbrock23` (adaptive, per-component `atol`, FD Jacobian, announces its stiffness) | `src/solver/ODE/ODEIntegrator.H:28-50`; `Rosenbrock23.cpp:45-49`; `Jacobian.H:28-42` |
| Analytic Jacobian | ABSENT (FD only) | `src/solver/ODE/Jacobian.H` |
| Per-reaction rate of progress published | ABSENT (`BatchReactor` publishes no `kpis()`; the driver publishes `n_i`, `T`, `P` only) | `src/applications/choupoBatch/main.cpp:1433-1441`; `BatchUnitOperation.H:162` |
| Ignition-delay KPI | ABSENT (`grep -i "ignition\|tau_ign"` in `BatchReactor.cpp`: comments only) | — |

### 1.3 Heterogeneous kinetics

| capability | status | evidence |
|---|---|---|
| LHHW (adsorption-weighted numerator, vacant-site denominator, site exponent) | IMPLEMENTED | `src/thermo/reaction/RateLaw.H:30-70` |
| Catalyst-mass basis (`catalystLoading`) | IMPLEMENTED, η = 1 ANNOUNCED | `src/unitOperations/reactor/CatalystPellet.{H,cpp}` |
| Pellet effectiveness (Thiele, three geometries, closed-form oracle) | IMPLEMENTED as a bench; the reactors' second caller is named, not built | `src/unitOperations/reactor/pellet/PelletDiffusion.H:30-58` |
| Adsorption isotherms | IMPLEMENTED (Henry, Langmuir, extended Langmuir) for adsorbers — equilibrium, not reacting surfaces | `src/thermo/adsorbent/IsothermModel.H:29,158,186` |
| Surface species, site density, coverages, sticking, coverage-dependent rates | ABSENT (`grep -ri "sticking\|siteDensity"` over `src/`: 0; "coverage" only in adsorbent and ion-transport code) | — |

### 1.4 Transport

| capability | status | evidence |
|---|---|---|
| Gas viscosity | IMPLEMENTED: `Chung`, `ChapmanEnskog` (Svehla σ, ε/k; Neufeld Ω(2,2)*), dilute gas | `src/thermo/transport/TransportModel.cpp:63-66`; `ChungViscosity.H:32,100`; `ChapmanEnskog.H:32,117` |
| Gas thermal conductivity | IMPLEMENTED: `Eucken`, `modifiedEucken` | `ThermalConductivityModel.cpp:68-71` |
| Gas mixture rules | IMPLEMENTED: Wilke (μ), Wassiljewa with Mason–Saxena φ_ij (λ), one home | `src/thermo/transport/GasMixingRules.H:31-45` |
| Gas binary diffusivity | PARTIAL: `Fuller` only; Chapman–Enskog D_ij ABSENT because Ω(1,1)* "is NOT in" the tree | `DiffusivityModel.cpp:65`; `NeufeldOmega.H:50-51` |
| Mixture-averaged diffusion D_km, multicomponent (Stefan–Maxwell), thermal diffusion | ABSENT (`grep -riE "Stefan-Maxwell|Maxwell-Stefan|mixtureAveraged|Soret|thermalDiffusion"` over `src/`: 0) | — |
| Liquid viscosity / conductivity / diffusivity | IMPLEMENTED: `chemsepEq101`, `Andrade`, `Vogel`; `chemsepEq16`, `SatoRiedel`; `WilkeChang`, Stokes–Einstein | `LiquidViscosityModel.cpp:69-73`; `LiquidConductivityModel.cpp:67-69`; `LiquidDiffusivityModel.cpp:65` |
| Water transport | IMPLEMENTED (IAPWS) | `src/thermo/iapws/IAPWSTransport.H` |
| High-pressure gas corrections | ABSENT (every gas model says "dilute (low-pressure) gas") | `ChungViscosity.H:100`, `Fuller.H:84` |
| Effective diffusivity in a pellet (Knudsen, Bosanquet, tortuosity declared) | IMPLEMENTED | `src/unitOperations/reactor/pellet/EffectiveDiffusivity.H:59-71` |

### 1.5 Reactors

| capability | status | evidence |
|---|---|---|
| Batch, constant volume, isothermal or adiabatic | IMPLEMENTED: energy basis `liquidDH` (per-reaction ΔH, liquid Cp) or `gasConstantV` (dU = 0, heat from formation data, gas Cv) | `src/unitOperations/batch/BatchReactor.cpp:134-145, 540-556` |
| Batch, constant pressure (gas) | ABSENT (energy bases are exactly `liquidDH`, `gasConstantV`; anything else refuses) | `BatchReactor.cpp:141-145` |
| Pressure of the const-V gas vessel | ABSENT: `state_.P` is read once from `0/` and never updated; the published `P_final` is the declared initial P | `BatchReactor.cpp:63`; `src/applications/choupoBatch/main.cpp:1438`; `ignition01_h2o2/expected` (`P_final 500000` with `T_final 2641.48`) |
| Declared P consistent with n, T, V | NOT CHECKED: `ignition01_h2o2` declares 5.0 bar for n R T / V = 4.57 bar | `tutorials/batch/combustion/ignition01_h2o2/0/internalStates/bomb` (n = 5e-5 kmol, V = 1e-3 m3, T = 1100 K) |
| Steady CSTR, multi-reaction | IMPLEMENTED, LIQUID concentration basis (`F_i/Q`, `Q = F Σ z_i Vliq_i`) | `src/unitOperations/reactor/CSTR.cpp:519, 238-241` |
| PFR, multi-reaction | IMPLEMENTED: isothermal / adiabatic / jacketed, Ergun, cooled multitubular, gas beds through written laws in partial pressures; LIQUID concentration basis for concentration laws; fixed-step RK4 (`nSteps`) | `src/unitOperations/reactor/PFR.H:28-110`; `PFR.cpp:104, 560` |
| Dynamic CSTR (time-integrated flowsheet) | IMPLEMENTED (`n_i/V`) | `src/unitOperations/dynamic/DynamicCSTR.cpp:147` |
| Reactor networks | IMPLEMENTED in Choupo's own form: steady flowsheets with tears, `choupoSemiContinuous`/`choupoCtrl` time-integrated flowsheets with quasi-steady units | CLAUDE.md §10 (fifth class), `src/dynamicDriver/` |
| Walls, pistons, valves between vessels, mass-flow controllers | ABSENT as objects (`grep -ri piston` over `src/`: 0); jackets and controllers exist | — |
| Parameter sensitivity of a KPI | PARTIAL: finite differences by an outer `sweep` over a dict path (`reactions.myRxn.kinetics.A`); no forward or adjoint sensitivities | CLAUDE.md §11; `src/outerDriver/SweepDriver.H` |

### 1.6 One-dimensional flames, electrochemistry, plasma

| capability | status | evidence |
|---|---|---|
| Laminar flames (free, burner, counterflow) | ABSENT ("flame" in `src/` only as the adiabatic flame T of the Gibbs reactor) | `GibbsReactor.cpp:753` |
| Electrochemistry in process units | IMPLEMENTED for electrodialysis: Nernst, Faraday, predicted limiting current, batch rig | `src/unitOperations/electrochem/` |
| Butler–Volmer | PARTIAL: documented-but-unused stub; the ED stack says "no Butler-Volmer in v1" | `Electrochem.H:120-134`; `ElectrodialysisStack.cpp:879` |
| Electrolyser / fuel cell / battery | ABSENT (the green-ammonia plants take H2 as a boundary feed) | `tutorials/plant/greenAmmoniaPEQ_baseCase/system/flowsheetDict:7-18` |
| Plasma | ABSENT (`grep -ri plasma` over `src/`: 0) | — |

### 1.7 Found on the way (measured, not fixed — no engine code in phase 0)

1. **A unit slip in the batch reactor's energy ledger.**  `state_.P` is in
   pascal (it is published as `P_final 500000` for a declared `5.0 bar`), yet
   `BatchReactor.cpp:811` and `:858` price the inventory at
   `P_Pa = state_.P * 1.0e5`, i.e. 5e10 Pa.  Harmless where the priced H does
   not depend on P (an ideal gas; a liquid priced without a Poynting term),
   silent wherever it does.  Phase 3 fixes it.
2. **The const-V vessel never computes its pressure** (row above), so the
   pressure rise that IS a bomb calorimeter's measurement is published as
   the initial value, and a declared P that disagrees with n R T/V by 9 % is
   accepted.  Phase 3.
3. **Record molar masses are not the formula's.**  In
   `ignition01_h2o2/constant/components/`, O2 is 31.999 against
   2 × 15.999 = 31.998, HO2 33.0067 against 33.006, H2O2 34.0147 against
   34.014.  The run's element closure is 8.5e-14 while its MASS closure is
   4.75e-6 (`ignition01_h2o2/expected`), which is exactly that inconsistency
   integrated over the reaction.  An oracle comparing mass fractions must
   use molar masses computed from the formula, as the library does, or carry
   a 1e-5 relative offset of known cause.
4. **The ignition01 README contradicts itself**: it says the rates are GRI-Mech
   3.0 verbatim and, two sentences later, that they are "hand-chosen,
   illustrative values" whose canonical copy lives under `data/proposed/`, a
   tier retired on 2026-07-13 (CLAUDE.md §7).  The first statement is the
   true one (`constant/reactions` header).
5. **A NASA-7 record carries its formation datum twice.**  The `low`/`high`
   arrays hold a6/a7, `NASA7Cp` ignores them, and `standardThermochemistry`
   carries `dHf_298`/`s_298`.  The two agree only where a curator checked
   (`data/standards/components/graphite.dat:31-39` records such a check, and
   two transcription errors it caught).  Rule 1 of the record skill: one
   quantity, one home.  §5.2 proposes the verification that holds them
   together.

---

## 2. Parity matrix against the library's 3.2 documentation

Pages read: Science reference
[thermo](https://cantera.org/3.2/reference/thermo/index.html),
[species thermo](https://cantera.org/3.2/reference/thermo/species-thermo.html),
[phase thermo](https://cantera.org/3.2/reference/thermo/phase-thermo.html),
[reaction rates](https://cantera.org/3.2/reference/kinetics/reaction-rates.html),
[rate constants](https://cantera.org/3.2/reference/kinetics/rate-constants.html),
[transport](https://cantera.org/3.2/reference/transport/index.html),
[`MixTransport.h`](https://cantera.org/3.2/cxx/d5/d57/MixTransport_8h_source.html),
[reactors](https://cantera.org/3.2/reference/reactors/index.html),
[plug flow reactor](https://cantera.org/3.2/reference/reactors/pfr.html),
[`ThermoPhase.equilibrate`](https://cantera.org/3.2/python/thermo.html),
[species YAML](https://cantera.org/3.2/yaml/species.html), and the
[Python examples gallery](https://cantera.org/3.2/examples/python/index.html).

`=` parity · `~` partial · `—` absent · `+` Choupo has, the library does not

### 2.1 Thermodynamics

| library capability (3.2 page) | Choupo | mark |
|---|---|---|
| NASA-7 (species-thermo) | `NASA7Cp`, datum held separately (§1.1) | `=` (formulation note §7.1) |
| NASA-9 (species-thermo) | — | `—` |
| Shomate (species-thermo) | — (a cubic without the E/t² term is `polynomial`) | `—` |
| Constant cp, piecewise Gibbs (species-thermo) | — | `—` |
| T-dependent density / molar volume (species-thermo) | liquid `Vliq` + volumetric models (`AqueousVolumetric`, `PricedDensity`) | `~` |
| Ideal gas mixture (phase-thermo) | `idealGas` EoS + `h_pure_ig` | `=` |
| Redlich–Kwong / Peng–Robinson mixtures (phase-thermo) | SRK, PR (+ kij, PPR78) — no original RK | `~` |
| Pure-fluid phases: water, N2, CH4, H2, O2, HFC-134a, CO2, heptane (phase-thermo) | IAPWS-IF97 water only | `~` |
| Liquid water IAPWS-95 (phase-thermo) | IF97 (a different, industrial formulation) | `~` |
| Ideal molal / ideal condensed solutions (phase-thermo) | ideal solution, molality-based aqueous models | `=` |
| Debye–Hückel; HMW electrolyte (phase-thermo) | Davies; `pitzerHMW`; plus `edwardsPitzer`, eNRTL | `=` `+` |
| Margules, Redlich–Kister (phase-thermo) | — as activity models | `—` |
| Tabulated binary solution, lattice (deprecated in 3.2) | — | `—` (not wanted) |
| Ideal surface, coverage-dependent surface thermo, edge (phase-thermo) | — | `—` |
| Electron cloud, plasma phase (phase-thermo) | — | `—` |
| Equilibrium TP, HP, SP, TV, UV, SV; element-potential / Gibbs / VCS solvers (`equilibrate`) | TP, HP; element-potential and direct minimisation; pure solids | `~` |
| — | NRTL, UNIQUAC, Wilson, UNIFAC, COSMO-SAC, PC-SAFT + association, reactive VLE, LLE/VLLE flash, stability test, eNRTL | `+` |

### 2.2 Homogeneous kinetics (rate-constants, reaction-rates)

| library | Choupo | mark |
|---|---|---|
| Mass action, declared (incl. fractional, negative) orders | `order` per species; reactant without one refuses | `=` |
| Modified Arrhenius | `batchReactor` only | `~` |
| Three-body, default efficiency 1, explicit-collider channels | `batchReactor` only (efficiencies default 1; explicit colliders as separate entries) | `~` |
| Lindemann, Troe fall-off | `batchReactor` only | `~` |
| Tsang F_cent, SRI fall-off, chemically-activated | — | `—` |
| PLOG, Chebyshev | — | `—` |
| Linear-Burke mixture rule | — | `—` |
| Blowers–Masel | — | `—` |
| Reverse from thermodynamics / explicit reverse | both (§1.2) | `=` |
| Custom rate expressions (example "Custom reaction rates") | `expression` — written in the case, units checked, runs in the browser | `=` `+` |
| Mechanism input in YAML / converted CHEMKIN (`ck2yaml`) | native dicts; GRI-subset script only | `~` |
| Reaction path diagram, mechanism reduction, sub-mechanism extraction (kinetics examples) | — | `—` |

### 2.3 Heterogeneous kinetics

| library | Choupo | mark |
|---|---|---|
| Interface reactions with coverage dependence (rate-constants "Surface Reactions") | — | `—` |
| Sticking reactions | — | `—` |
| Reacting surfaces in reactors (reactors/interactions) | — | `—` |
| — | LHHW, catalyst-mass basis, Thiele effectiveness, Ergun beds, wall heat transfer | `+` |

### 2.4 Transport

| library | Choupo | mark |
|---|---|---|
| Mixture-averaged: Wilke viscosity (`MixTransport.h`) | Wilke | `=` |
| Mixture-averaged: conductivity ½(Σxλ + 1/Σ(x/λ)) (`MixTransport.h`) | Wassiljewa / Mason–Saxena | `~` (legitimately different rule) |
| Mixture-averaged diffusion coefficients | — | `—` |
| Multicomponent (Dixon-Lewis), thermal diffusion | — | `—` |
| Unity Lewis number | — | `—` |
| High-pressure (Lucas / Takahashi), Chung high-pressure | dilute-gas Chung only | `~` |
| Ionized gas | — | `—` |
| Water | IAPWS transport | `=` |
| Dusty-gas porous media (transport example) | pellet effective diffusivity (Knudsen/Bosanquet) | `~` |
| — | liquid viscosity / conductivity / diffusivity families with windows, citations, anchors | `+` |

### 2.5 Reactors (reactors index; pfr)

| library | Choupo | mark |
|---|---|---|
| Control-volume reactor (const V) | `batchReactor` `gasConstantV` — P not computed | `~` |
| Ideal-gas constant-pressure reactor | — | `—` |
| Mole-based reactor variants + sparse preconditioning | dense FD Jacobian; packed mole state | `~` |
| Plug flow reactor, ideal-gas DAE with surface chemistry | `pfr` liquid basis for concentration laws; gas beds via `expression`; RK4 fixed step; Ergun; cooled tubes | `~` `+` |
| Reservoirs, flow devices, walls (interactions) | flowsheet streams, jackets, controllers | `~` |
| `ReactorNet` sensitivity analysis | FD sweeps | `~` |
| `ExtensibleReactor` | case `code/` user units (local only) | `~` |

### 2.6 One-dimensional flames, electrochemistry, plasma

| library | Choupo | mark |
|---|---|---|
| Free, burner, counterflow, impinging-jet, ion flames; grid refinement; flame-speed sensitivity | — | `—` |
| Electrochemical interface reactions; battery, SOFC examples | ED-specific electrochemistry; BV stub | `—` (process ED `+`) |
| Plasma phase, EEDF, electron-collision and two-temperature rates | — | `—` |

### 2.7 The examples gallery, one by one

The 3.2 Python gallery lists 68 examples in five groups.  Counterpart, or
the phase of §6 that would give one, or `out` with the scope reason of §4.

**Thermodynamics (15).**  Mixing using Quantity objects — `mixer` (`=`).
Critical state properties — `phaseEnvelope`, `purePhaseDiagram` props ops
(`=`).  Converging-diverging nozzle — out (compressible flow).  Equilibrium
with charged species and multiple condensed phases — speciation + Gibbs with
solids (`~`).  Rankine cycle (two) — `tutorials/steady/power/rankine01_water`
(`=`).  Adiabatic flame temperature including solid carbon — `gibbsReactor`
`adiabatic` with `graphite` (`=`, the C14 slice).  EEDF — out (plasma).
Sound speeds (two), isentropic flow (one) — ABSENT (`grep -ri
"speedOfSound|soundSpeed"`: 0); a props-op candidate, not parity-critical.
Vapor dome — `purePhaseDiagram` (`=`).  Equivalence ratio — mentioned in
`gibbs03_methane_combustion/system/controlDict`, no helper (`~`).  Surface
with coverage-dependent thermo — phase 9.  Non-ideal equations of state —
EoS comparison cases (`tutorials/props/compare/compare_eos_co2`) (`=`).

**Kinetics (11).**  Reaction path diagram, interactive path diagrams —
phase 7 (the rate-of-progress ledger; the drawn diagram is a GUI matter).
CVD diamond growth — phase 9.  Shock-tube species profiles — `ignition02`
(const V) now; const-P after phase 3.  Extracting a sub-mechanism — phase 5
importer.  Mechanism reduction — out (research tool).  Blowers–Masel — out.
Jet-stirred reactor — phase 6.  Lithium-ion battery, SOFC — out.  Custom
reaction rates — `expression` (`=`).

**Transport (3).**  Dusty-gas porous media — `~` (pellet diffusivity).
Parallel transport evaluation — out (performance).  High-pressure transport —
out unless a dense-gas unit needs it.

**Reactor networks (22).**  Mixing two streams — `mixer` (`=`).  CSTR with
periodic behaviour, CSTR — `dynamicCSTR` liquid (`~`); gas after phase 6.
Combustor residence time — phase 6.  Constant-pressure adiabatic kinetics
(and the SciPy variant) — phase 3.  … with sensitivity analysis — phases 3+7.
Plasma reactor, nanosecond pulse — out.  Moving piston, walls and heat
transfer, wall inertia, diesel engine — out (device dynamics; Choupo's
vessels exchange through streams and jackets).  PFR with surface chemistry,
silicon-nitride deposition — phase 9.  Sparse preconditioned integration —
out (performance at mechanism sizes Choupo does not teach).  Soot precursors
with time-varying mass flow — choupoSemiContinuous form after phase 6 (`~`).
PFR as a chain of CSTRs, PFR modelling approaches — phase 6, and the
approach §7.4 uses as the PFR oracle.  Ignition with Redlich–Kwong — out
(real-gas kinetics, §4).  Packed-bed catalytic membrane reactor — `~` (Ergun
bed + membrane units exist separately).  Reactor cascade in porous media —
out.

**1-D reacting flows (17).**  All out by default (§4).

---

## 3. Confirmed gaps (measured only)

In the recommended scope (§4):

* **G1 — the rate forms have two homes.**  Modified Arrhenius, third body
  and fall-off live in `batchReactor`'s private reader
  (`BatchReactor.H:140`); `cstr`, `pfr` and `dynamicCSTR` cannot reach them
  (`ReactionRate.H:55-66`).  This is the arity defect CLAUDE.md §5 names
  ("the copies agreed until one of them was fixed"), at the scale of a
  family.
* **G2 — no `b` exponent in the factory's `Arrhenius`** (`RateLaw.H`).
* **G3 — no SRI / Tsang / PLOG / Chebyshev** pressure dependence.
* **G4 — no constant-pressure gas batch**, and the const-V batch publishes no
  pressure trajectory and checks no declared pressure (§1.7 items 1–2).
* **G5 — no ideal-gas concentration basis in `cstr` / `pfr`** for
  mass-action laws (`CSTR.cpp:519`, `PFR.cpp:560`); the PFR's fixed-step
  RK4 cannot carry a stiff gas mechanism.
* **G6 — no ignition-delay KPI and no per-reaction rate of progress.**
* **G7 — no rate-constant sensitivity** beyond hand-built sweeps.
* **G8 — Gibbs equilibrium: TP and HP only, tolerances hard-coded**
  (`GibbsMethod.cpp:128`, `GibbsReactor.cpp:513`); no UV (the end state of
  the bomb, and its natural oracle).
* **G9 — NASA-7 datum held twice** (§1.7 item 5); **no NASA-9**.
* **G10 — no general mechanism importer** (CHEMKIN-format or the library's
  YAML → Choupo dicts) — the GRI-subset regex script is the only route.
* **G11 — transport: no Chapman–Enskog binary diffusivity, no
  mixture-averaged D_km**; the library's conductivity mixing rule is not
  available as an alternative.
* **G12 — no analytic kinetics Jacobian** (a performance and a teaching
  gap, not a correctness one).

Outside the recommended scope, recorded so the decision is taken with the
whole picture: surface microkinetics (G13), 1-D flames (G14), plasma (G15),
battery / fuel-cell / electrolyser electrochemistry (G16), high-pressure and
multicomponent gas transport (G17), real-gas kinetics in reactors (G18),
Blowers–Masel / linear-Burke (G19), mechanism reduction and path diagrams as
drawings (G20), additional reference pure-fluid EoS (G21), NASA-9-only
species data, Shomate, Margules/Redlich–Kister (G22).

---

## 4. Recommended scope, argued

**The test is Choupo's own (CLAUDE.md §1, §10): does a student of process
simulation SEE something, in a glass box, that a process unit uses?**
Parity is not an objective; the library is a yardstick.

**IN — thermodynamics** (G8, G9).  Every reactor, flash and balance stands on
it; equilibrium is the first oracle anything else is checked against.  UV
equilibrium is small and closes a loop the bomb opens.  NASA-9 is in because
NASA's own NASA-9 compilation (McBride, Zehe & Gordon, NASA TP-2002-211556)
is a US-government work — the clean data route for the high-temperature
species the 4-term catalogue refits cannot carry above 1500 K.

**IN — homogeneous kinetics** (G1–G3, G10, G12).  G1 first, because it is
an existing defect (two homes), not a feature.  SRI, PLOG and Chebyshev are
in because modern open mechanisms for pyrolysis and partial oxidation —
steam crackers, reformers, a methane-to-syngas converter, all process units —
are written in them; a parity programme that cannot read the mechanism file
cannot be pointed at the process.  Blowers–Masel and linear-Burke are OUT:
each is a research form with no process witness.

**IN — ideal reactors** (G4–G6).  Constant-pressure batch is the library's
canonical example and the shock-tube's analogue; the gas CSTR (jet-stirred
reactor) and the gas PFR are the two continuous reactors of every reaction
engineering course.  Choupo's PFR already outdoes the library's in process
detail (Ergun, which the library's momentum equation omits —
[pfr](https://cantera.org/3.2/reference/reactors/pfr.html) carries no wall
friction; cooled tubes; sizing); what it lacks is the gas basis and a stiff
march.

**IN — sensitivity** (G7).  "Which reaction controls this?" is the most
glass-box question kinetics has; a central-difference coefficient per
reaction is readable arithmetic, unlike a CVODES forward-sensitivity system.

**IN, NARROWED — transport** (G11).  The commander's default puts transport
in; the evidence says most of it is already there (§1.4).  The remaining
items a process unit READS are the binary Chapman–Enskog diffusivity and
the mixture-averaged D_km (the pellet's `D_eff`, the membrane and drying
films), and the library's conductivity rule as a declared alternative so a
student can see two rules disagree.  **I disagree with the default on
multicomponent and thermal-diffusion transport**: only a flame or a
reacting boundary layer reads them, and both are out.  High-pressure
corrections: out until a dense-gas unit asks.

**OPTIONAL, LAST — surface microkinetics** (G13).  The commander's default
is "heterogeneous where process reactors need it".  Measured: the process
reactors in the corpus — ammonia, methanol, shift, reforming, oxidation beds
— are all written as LHHW or written laws, and LHHW plus the pellet answers
the design question (how big a bed, what conversion, what hot spot).  Mean-
field microkinetics (site balances, coverages, sticking) is what one does to
DERIVE an LHHW law, which is research, and its DAE (algebraic coverages)
adds a new numerical class.  It is pedagogically strong for one lesson
(why the LHHW denominator exists) and expensive for the engine.  Recommended
as phase 9, **Vítor's call**, with one witness (CO oxidation on Pt) if taken.

**OUT — 1-D flames and plasma** (G14, G15).  Agreed with the commander.  A
flame is a boundary-value problem with multicomponent transport, grid
refinement and a flame-speed eigenvalue: a second engine, combustion
research, breadth by the project's own definition.  Plasma likewise.

**OUT of C160 — electrochemistry** (G16).  The only electrochemistry a
process unit in the corpus reads is electrodialysis, which is done.  A
water electrolyser (the green-ammonia plants' missing unit) needs
Butler–Volmer, Nernst at temperature, ohmic and transport overpotentials and
a heat balance — a UNIT, best commissioned on its own; the BV stub
(`Electrochem.H:120-134`) is where it would start.  Batteries and SOFCs:
out.

**OUT — real-gas kinetics** (G18).  The library's Redlich–Kwong ignition
example is a high-pressure combustion research case; Choupo's high-pressure
reactors (ammonia at 150 bar) already take fugacity coefficients through
written laws (C67).

---

## 5. Architecture for the in-scope gaps — no second home

### 5.1 Kinetics: the factory becomes the only home of every rate form

* `ReactionRate` (`src/thermo/reaction/ReactionRate.H`) gains registered
  types `modifiedArrhenius`, `thirdBody`, `falloff` (`Lindemann`, `Troe`,
  later `SRI`, `Tsang`), `plog`, `chebyshev` — each a small class beside
  `RateLaw`, registered in `ReactionRate::registerBuiltins()` (explicit, no
  macros).  The arithmetic already exists in `Reaction::{modifiedArrhenius
  Rate, thirdBodyConcentration, falloffRate}`; it MOVES to its callers' one
  factory, `Reaction` keeps the shared helpers.
* `Arrhenius` gains an optional `b` (absent = 0, byte-identical, the
  `b == 0 ⇒ no pow` guard of the 2026-06-21 plan).
* The CHEMKIN unit conversion (`BatchReactor.cpp:372-393`) moves into the
  same family, so a `units { A "cm3/mol/s"; Ea "cal/mol"; }` block means the
  same in every reactor.
* `batchReactor` and `dynamicCSTR` stop owning rate words: their
  `RateForm::Factory` branch becomes the only branch.  The `RateState`
  already carries T, P, concentrations, mole fractions (`ReactionRate.H`
  `struct RateState`); third bodies need only the concentration vector it
  carries.
* Grammar: unchanged for every existing word (the `kinetics { type
  thirdBody; A; b; Ea; thirdBody { H2 2.4; water 15.4; } units {...} }` form
  already in `ignition01_h2o2/constant/reactions`).  New forms follow it:
  `plog { points ( { P 1 atm; A; b; Ea; } ... ); }`,
  `chebyshev { Trange (...); Prange (...); coefficients ( ( ... ) ... ); }`.
  Every key has another value, and none duplicates a fact elsewhere.

### 5.2 Thermodynamics

* **One datum, verified (G9).**  `standardThermochemistry` stays the ONE
  home of the formation datum.  A `NASA7` (and `NASA9`) block keeps a6/a7 as
  part of the SOURCE's transcription, and the builder COMPUTES H(298.15) and
  S(298.15) from them and REFUSES a record whose two disagree beyond the
  datum's stated precision — the arity sin made impossible by a check, not by
  deleting the source's numbers.  (The alternative, stripping a6/a7, loses
  the transcription audit `graphite.dat` documents; Vítor's call, default:
  verify.)
* **NASA-9** as a `HeatCapacityModel` beside `NASA7Cp`, the same
  sensible-integral contract.
* **Equilibrium**: `gibbsReactor` gains `mode constantVolume` (UV, the bomb's
  end state) through the same outer Newton that carries HP today; its two
  hard-coded tolerances become a declared `solverDict` triple through
  `src/solver/Convergence.H` (the normalised-residual home), announced when
  defaulted.  No new equilibrium solver.

### 5.3 Reactors

* **Batch** (`BatchReactor.cpp`): `energy gasConstantP` beside
  `gasConstantV` — dH = 0 at fixed P, V follows from the ideal gas, the same
  `h_pure_ig` surface; for `gasConstantV` P(t) = n R T / V is COMPUTED and
  published, and a declared initial P that disagrees with n R T/V beyond a
  stated tolerance REFUSES naming both numbers (the stream rule of CLAUDE.md
  §3: a state is fixed by two variables, the third is a consequence).  The
  §1.7 unit slip is fixed in the same slice.  `ignitionDelay { criterion
  maxdTdt | Tincrease <dT>; }` declared — the definition is the case's, and
  published with it.
* **Gas basis for `cstr` / `pfr`** (G5): the `RateOffer.concentrationBasis`
  already NAMES the basis (`PFR.cpp:560`); the new value is `c_i = y_i P /
  (Z R T)` with Z from the package's EoS (1 for `idealGas`), chosen by the
  phase the reactor's fluid is resolved to — not a new key where the stream's
  declared phase already says it.  The PFR march gains `integrator
  Rosenbrock23;` through `src/solver/ODE/ODEIntegrator`, the same factory the
  batch uses — no second integrator.
* **Steady gas CSTR** (JSR): the existing `cstr` multi-reaction Newton, gas
  basis; for stiff mechanisms its seed is a pseudo-transient march with the
  same ODE factory, ANNOUNCED (the no-silent-crutch credo).
* **Rate of progress** (G6): every reactor publishes `q_<reaction>` profiles
  through its existing `profile_` columns (`PFR.cpp:241-253` is the
  precedent); the batch through a new `kpis()`/profile on the unit.

### 5.4 Sensitivity

A `sensitivity` OuterDriver (factory in `src/outerDriver/OuterDriver.H`,
beside `sweep`/`gridSweep`): for each declared reaction, central differences
on `ln A_j` (a `rateMultiplier` read by the factory, ANNOUNCED when ≠ 1),
normalised coefficients `∂ln y/∂ln k_j`, a ranked table.  It reuses the pure
simulator functor every driver already uses (CLAUDE.md §4).

### 5.5 Transport

* Ω(1,1)* in `src/thermo/transport/NeufeldOmega.H` beside Ω(2,2)*, its eight
  coefficients TRANSCRIBED FROM THE PRIMARY (Neufeld, Janzen & Aziz,
  J. Chem. Phys. 57 (1972) 1100) by a curation act — never from memory and
  never from a secondary — then `ChapmanEnskog` registered as a
  `DiffusivityModel` with Svehla's σ, ε/k (already the public-domain home,
  CLAUDE.md §6).
* `D_km = (1 - Y_k) / Σ_{j≠k} x_j / D_kj` in `GasMixingRules.H`, the one home
  of the gas mixing rules.
* The library's conductivity rule as a declared `mixingRule` alternative in
  the same header.

### 5.6 The mechanism importer and the oracle bridge (curation plane only)

* `bin/curate/mechanism_to_choupo.py` — CHEMKIN-format or the library's
  YAML IN, Choupo `constant/reactions` + component dicts OUT, verbatim
  numbers, units declared, every form it cannot express REFUSED by name (no
  silent skip), NASA-7 thermo carried with the §5.2 verification.  It writes
  under a case's `constant/` or `data/local/`, never `data/standards/`.
  Generalises `gri_subset_to_choupo.py`.
* `bin/curate/oracle_cantera.py` — the reverse bridge: reads a Choupo case
  (its components and reactions), writes the library's YAML from THE SAME
  numbers, runs the library, writes a reference file.  Each Choupo Cp form
  is mapped to an EXACT library form or REFUSED: `NASA7` → NASA-7;
  `polynomial` (a cubic in J/(mol K)) → a one-range NASA-7 with
  a1..a4 = c/R, a5 = 0, a6/a7 from the record's datum — an identity, not a
  refit; `chemsepCp16` → refused.  This is what makes an oracle comparison
  test the CODE and not two copies of data.
* Posture, already established by `bin/curate/verify_against_nasa.py:3-11`:
  a TOOL needing the library, never a gate.  The references it writes are
  frozen into the witness case (`constant/oracle/` with the library version,
  the script's hash and the date), and the GATE in `bin/runTests` compares
  Choupo against the frozen file — it never needs the library, so it can
  never skip.

Nothing in the runtime reads the library, a library file or a tool output
except the frozen anchors a gate reads (I17/I18 layering, CLAUDE.md §6: "a
tool may read the runtime, nothing in the runtime may read a tool").

---

## 6. Phased plan

Each phase lands alone, ordered by what it unblocks and by scientific
weight.  Each names the goldens it may move; the list is shown to Vítor
before any `--record` (CLAUDE.md §10).

| phase | content | gaps | moves goldens? |
|---|---|---|---|
| **P1 Kinetics, one home** | rate forms into `ReactionRate`; `b` in `Arrhenius`; units conversion moved; batch/dynamic CSTR through the factory; `oracle_cantera.py` (kinetics half) | G1, G2 | NO — a behaviour-preserving extraction; every reactor golden byte-identical is its acceptance |
| **P2 Thermo exactness** | NASA-7 datum verification; NASA-9; Gibbs tolerances declared; UV mode; oracle thermo + equilibrium half | G8, G9 | refusals possible on records whose datum disagrees with a6/a7 (measured first, listed) |
| **P3 Gas batch** | `gasConstantP`; computed P(t); declared-P check; the 1e5 slip; ignition-delay KPI; rate-of-progress profile | G4, G6 | `P_final` rows of const-V gas cases move (they were wrong); listed |
| **P4 Pressure-dependent forms** | SRI, Tsang, PLOG, Chebyshev, chemically-activated (if a witness needs it) | G3 | NO (additive) |
| **P5 Mechanism importer** | `mechanism_to_choupo.py`; the GRI-Mech 3.0 oracle run from a LOCAL copy | G10 | NO |
| **P6 Gas steady reactors** | gas concentration basis in `cstr`/`pfr`; stiff PFR march; gas JSR | G5 | NO for liquid cases (basis unchanged where the fluid is liquid) |
| **P7 Sensitivity + reaction path** | `sensitivity` driver; ranked ROP ledger | G7 | NO |
| **P8 Transport** | Ω(1,1)*, CE diffusivity, D_km, conductivity rule alternative | G11 | NO (additive models) |
| **P9 Surface microkinetics** (optional, Vítor) | surface species, coverages, sticking in `cstr`/`pfr` | G13 | NO |

G12 (analytic Jacobian) rides with P3 or P6 when the FD Jacobian is
measured to be the cost.

**"Zero FAIL on the full suite before each phase" and §0.4.**  Compatible,
and the mechanism is the one §0.4 already prescribes: each phase reaches
its branch validated by the targeted checks its slice requires (the build,
the cases it touches, the gates that read the touched files, `--fast` for
a factory registration); before it lands, a written reason (what changed,
which shared path it reaches — P1 reaches every reactor, so it needs the
sweep by §10's own rule) goes to Vítor, who authorises and RUNS
`bin/runTests` on his PC, and the phase merges only on his FAIL 0.  This
container could not run it anyway (1.3 GB free; no build was attempted for
this record).  The programme's rule and §0.4 then say the same thing.

---

## 7. Oracle cases and quantitative acceptance

### 7.0 The three error classes, kept apart by construction

1. **Implementation** — the same formula, the same numbers, a different
   answer: a bug.  Tested by feeding BOTH codes the identical inputs through
   §5.6's exact mapping and comparing the quantity the formula produces.
   Tolerances are set by floating point and by the one known constant
   difference, the gas constant: Choupo's `R = 8.314462618`
   (`Constants.H:47`) against the library's 8314.46261815324 J/(kmol K),
   relative difference **1.84e-11**.
2. **Numerical method** — the same equations integrated or solved by
   different algorithms (Rosenbrock23 against CVODES BDF; a Newton against
   a minimiser).  Tested by first proving Choupo's OWN convergence (halve
   the tolerance, the answer moves less than a stated fraction), then
   comparing with the library run far tighter than Choupo.
3. **Legitimate formulation difference** — two codes that chose different
   correct models (Neufeld's Ω fit against Monchick–Mason tables; one
   conductivity mixing rule against another; a continuous-H NASA-7 against
   a per-range a6).  Never "tolerated": the oracle PREDICTS the difference
   from its cause, asserts the prediction, and only then compares.

A tolerance that cannot say which class it bounds is not accepted.

### 7.1 Thermodynamics

| oracle | case | acceptance | class and justification |
|---|---|---|---|
| T1a Cp°(T), NASA-7 | the H/O species with case-local NASA-7, 300–3000 K, 50 points | 1e-10 relative | (1): same polynomial times R; R contributes 1.84e-11, Horner vs power sums ~1e-15 |
| T1b H°(T), S°(T) below T_common | same | 1e-10 relative + 1e-4 J/mol (H), 1e-7 J/(mol K) (S) absolute | (1): the absolute floor is the stored datum's rounding (`dHf_298` written to 4 decimals, `C2H3.dat:20`), so the oracle records carry the datum to 10 significant digits |
| T1c H°, S° above T_common | same | after subtracting the predicted offset δH = H_high(T_c) − H_low(T_c), δS likewise, computed FROM THE COEFFICIENTS: 1e-10 relative | (3): Choupo integrates Cp across T_common (`NASA7Cp.H:42-44`), continuous by construction; the library evaluates the high range's own a6/a7, so it inherits the source's discontinuity at T_c. The difference is a property of the data and is predicted, not tolerated |
| T1d convention | every record | S at 1 bar vs 1 atm decided FROM THE SOURCE DOCUMENT, never from the library's label | (3): the library's default reference pressure is 1 atm ([species YAML](https://cantera.org/3.2/yaml/species.html)); Choupo's is 1 bar. A wrong correction is exactly R ln(1.01325) = 0.1094 J/(mol K) in S and (1.01325)^Σν in Kc — the error `verify_against_nasa.py:42-61` already made once and recorded |
| T2 mixture h, s, cp, cv, ρ at (T, P, x) | ideal gas, 9 species | 1e-10 relative | (1) |
| T3a TP equilibrium | H2/O2/N2 at 1, 10 bar, 1500–3500 K; CH4/air with graphite | majors (x > 1e-6): 1e-8 relative; traces: 1e-8 relative or 1e-14 absolute | (2)+(1): requires P2's declared tolerances — the current element-balance Newton stops at 1e-8 (`GibbsMethod.cpp:128`), which bounds the trace species at no better than that, and the oracle records' datum at 10 digits (T1b: s rounding 5e-5 J/(mol K) × 2000 K = 0.1 J/mol ⇒ δln K 6e-6 otherwise) |
| T3b HP adiabatic flame T | same feeds | 1e-6 K after P2; today the outer Newton tolerance is 1e-2 (`GibbsReactor.cpp:513`) and the oracle MEASURES the T error it allows before P2, so the improvement is a number | (2) |
| T3c UV end state | the bomb of `ignition02` | T and x as T3a, and equal to the batch's own t → ∞ state to the batch's integration tolerance | (2) |
| T4 PR mixture Z, ln φ, h^R | CH4/CO2/N2 at 50 bar, kij = 0 | 1e-8 relative IF both use the same Ω_a, Ω_b; otherwise predicted first | (3) until measured: Choupo uses 0.45724 / 0.07780 (`PR.cpp:48-49`), the exact roots are 0.4572355… / 0.0777960…, a 1e-5 / 5e-5 relative difference in a and b. Which form the library uses must be READ in its source before the tolerance is fixed |

### 7.2 Kinetics

| oracle | case | acceptance | class and justification |
|---|---|---|---|
| K1 forward k(T, P) per form | every reaction of `ignition02` (Ó Conaire 2004, 21 entries incl. Troe), 300–3000 K, 0.01–100 atm; P4's forms on synthetic records | 2e-9 relative | (1): exp(−Ea/RT) amplifies the R difference by Ea/RT ≤ ~50 over the grid ⇒ ≤ 9.2e-10; factor 2 margin |
| K2 Kc(T) | same | 1e-8 relative | (1): Δln Kc = Δ(Σν g°)/RT, bounded by T1 with the datum at 10 digits; P° matched per T1d |
| K3 net production rates ω̇_k at fixed states | 20 states along an ignition trajectory | 1e-8 × Σ_r |ν_kr| q_f,r (scaled by the forward magnitude, not by ω̇) | (1): near equilibrium ω̇ is a difference of near-equal rates; a relative test on it measures cancellation, the 2026-08-09 `column13` lesson (CLAUDE.md §5) |
| K4 GRI-Mech 3.0, 53 species / 325 reactions | LOCAL only (§7.6), run through P5's importer | K1–K3 tolerances on every reaction the importer accepted; every refusal listed | (1) |

### 7.3 Batch reactors

| oracle | case | acceptance | class and justification |
|---|---|---|---|
| R1 const-V ignition | `ignition02` (Ó Conaire, shipped), and K4's GRI locally; T0 1000–1400 K | τ: 0.5 % relative; T_final, x_final: T3c | (2): Choupo self-convergence ≤ 0.1 % (rtol and rtol/10); τ located on accepted steps with a declared maximum step through the run-up ≤ 0.2 %; library at rtol 1e-10, atol 1e-20 negligible. The state is fixed by (T0, n/V, x) — never by P, which the two codes would derive differently until P3 (§1.7 item 2) |
| R2 const-P ignition | the same mixtures after P3 | as R1 | (2) |
| R3 trajectories | T(t), x_k(t) at 50 instants normalised by τ | majors 1e-3 relative; radicals 1e-2 relative where x > 1e-8 | (2): pointwise errors near ignition are a time-shift times a steep gradient; normalising t by each code's own τ separates the shift from the shape |
| R4 sensitivities ∂ln τ/∂ln k_j | R2's case, after P7 | the top-10 reactions in the same order; values within 2 % | (2): central FD at δ = 1e-3 on ln A has truncation O(δ²) and integrator noise O(rtol/δ); the band follows from both at rtol 1e-8 |

### 7.4 Flow reactors

| oracle | case | acceptance | class and justification |
|---|---|---|---|
| R5 isothermal gas PFR | a dilute H2 oxidation and an ammonia decomposition, low Mach | x_k(z) at 20 stations: 1e-6 relative after P6 | (2)+(3): the library's PFR is a DAE with axial momentum ([pfr](https://cantera.org/3.2/reference/reactors/pfr.html)); Choupo's march keeps P constant absent Ergun. The acceleration term is O(ρu²/P), held below 1e-7 by the case's velocity; and the cleaner oracle is the library's constant-pressure reactor integrated in time and mapped z = ∫u dt (the gallery's "PFR modelling approaches"), which IS the ideal constant-P PFR |
| R6 adiabatic gas PFR | the same with heat release | 1e-5 relative | (2) |
| R7 gas JSR | H2/O2 and a methane mechanism at τ_res 0.1–2 s | steady x: 1e-6 relative | (2): Choupo's Newton at 1e-10 against the library's steady-state march at a tolerance tight enough to be the reference |

### 7.5 Transport

| oracle | case | acceptance | class and justification |
|---|---|---|---|
| Tr1 pure μ | N2, O2, H2, H2O, CH4, CO2, 300–2000 K, IDENTICAL σ, ε/k (Svehla's, given to both) | 0.5 % | (3): Neufeld's Ω(2,2)* fit (Choupo) against the library's tables and its ln T polynomial fit of μ(T); both deviations are documented by their authors as fractions of a percent — the oracle first measures the library's fit residual by evaluating it at its own fit nodes |
| Tr2 mixture μ (Wilke) | 4-species mixtures | 1e-10 relative given Tr1's pure μ fed to both | (1): same rule (`GasMixingRules.H:40`; [`MixTransport.h`](https://cantera.org/3.2/cxx/d5/d57/MixTransport_8h_source.html)) |
| Tr3 pure λ | same species | predicted, not toleranced: Choupo's modified Eucken against the library's polyatomic model are different correct models; the comparison PUBLISHES the spread per species | (3) |
| Tr4 mixture λ | same | given equal pure λ: the library's rule reproduced to 1e-10 by P8's declared alternative; the Wassiljewa/Mason–Saxena result published beside it | (1) for the alternative, (3) for the default |
| Tr5 D_ij, D_km | after P8 | D_ij 0.5 % (class 3, Ω(1,1)* fit vs table); D_km from equal D_ij 1e-10 (class 1) | as stated |

### 7.6 Licences and provenance of the oracle itself

* **The library**: BSD-3-Clause, copyright Caltech (2001-2009), Sandia (2009),
  the Cantera Developers (2011-2026), read in
  [`License.txt`](https://raw.githubusercontent.com/Cantera/cantera/main/License.txt)
  on 2026-10-25.  Never linked, vendored or required at run time; used from
  `bin/curate` only, as it is today (`import_gibbs_nasa.py:47`,
  `verify_against_nasa.py:3-11`).  Its OUTPUTS frozen as anchors are
  numbers computed from inputs this project supplies; the anchor file
  records the library version (`ct.__version__`, pinned exactly), the
  script hash and the input case's hash.
* **The library's bundled mechanisms**: its `data/README.md` now says only
  that "Input files distributed with Cantera are provided for illustration
  purposes only" — no grant.  The oracle never takes a mechanism FROM the
  library; §5.6's bridge writes the library's input from Choupo's own case.
* **Ó Conaire et al. 2004** (`ignition02`): transcribed from the paper's
  Table I (`ignition02_h2air_slack/constant/reactions:1-20`) — rate
  constants as facts read from a primary, the posture CLAUDE.md §10 accepts.
  The shipped oracle witnesses use it.
* **GRI-Mech 3.0 — RESERVED for Vítor.**  The 2026-06-21 kinetics record
  (`docs/chemkin-kinetics-plan.md:26, 125-131`) found GRI-Mech and the other
  famous mechanisms "freely available, all-rights-reserved, cite-to-use",
  with no redistribution grant, and ruled it fetch-and-cite.  The tree
  nevertheless ships its H/O subset VERBATIM in `ignition01_h2o2`,
  `ignition01_h2o2_eulersi` and `ignition01_h2o2_rk4`
  (`bin/curate/gri_subset_to_choupo.py` reads `thirdParty/grimech30.dat`),
  and 17 standards component records name GRI-Mech 3.0 in their provenance,
  some generated from its thermo file by `bin/import_nasa.py` (e.g.
  `C2H3.dat:3-4`).  The terms page
  could not be re-read today (combustion.berkeley.edu returned 503).  Whether
  Arrhenius triplets transcribed from a mechanism file are facts or the
  file's expression is a legal reading with two defensible answers; it is
  not resolved here and blocks nothing in P1–P4.  Until it is ruled, K4 and
  R1's GRI runs are LOCAL only: the user's own copy in `thirdParty/`
  (gitignored), the comparison printed, nothing GRI-derived committed.
* **NASA TM-4513 and NASA TP-2002-211556**: US-government works, public
  domain — the clean thermo routes (the former already named in
  `import_gibbs_nasa.py:5-8`).
* **Burcat / ReSpecTh**: NonCommercial compilation, EXCLUDED, enforced by
  `check_source_licence` (CLAUDE.md §7).  Its NASA-7 file must not enter as
  oracle input either: an oracle input is a value's origin.
* **Transport parameters**: Svehla 1962 (public domain, already the home);
  the GRI-Mech transport file falls under the GRI ruling above.

---

## 8. Risks

**Numerical.**

* **Stiffness and positivity.**  Rosenbrock23 is L-stable but second order;
  mechanisms of a few hundred species make the dense FD Jacobian
  (n + 1 evaluations, dense LU) the cost.  GRI-scale: 53 species ⇒ 54
  evaluations and a 54² LU per step — acceptable; a 1000-species mechanism
  is not, and is out of scope rather than a reason for a sparse solver.
* **Trace radicals and tolerances.**  The per-component `atol` already
  exists (`Rosenbrock23.cpp:45-49`); an ignition oracle with a scalar atol
  would under-resolve exactly the species that IS the ignition (the
  2026-06-21 plan's §5 warning).  The oracle cases declare their vectors.
* **Near-equilibrium cancellation** (K3) — scaled tolerances, §7.2.
* **The PFR's fixed RK4 on a stiff gas mechanism** blows up or lies quietly
  (`PFR.cpp:363-379` already refuses one such case); P6 must not ship the
  gas basis without the stiff march.
* **Hard-coded Gibbs tolerances** (§1.1) would make T3 look like a code
  defect when it is a tolerance; P2 first.

**Scientific.**

* **Reverse-rate consistency.**  k_r = k_f / Kc is thermodynamically
  consistent only with the mechanism's OWN thermo.  Choupo's catalogue
  thermo is not the mechanism's: a mechanism imported with its rates and
  run on the catalogue's cubic radicals (as `ignition02` does today) has
  reverse rates the authors never fitted.  P5's importer must carry the
  mechanism's thermo into the case and say so; the oracle compares with the
  thermo BOTH codes were given, never with the library's default file.
* **Kc on a liquid.**  `Reaction::equilibrium` uses `g_pure_ig` and the gas
  standard concentration for every reactor (`Reaction.cpp:107-150`), which
  is exact for an ideal gas and a formulation choice for a liquid-phase
  reversible reaction.  Outside this programme's gas scope; named so that a
  liquid oracle is not mistaken for a gas one.
* **Pressure-dependent forms**: PLOG interpolation outside its pressure
  table and Chebyshev outside its (T, P) box are extrapolation — refused or
  announced (I4), never silent; PLOG duplicate entries at one pressure SUM
  and must stay positive ([rate constants](https://cantera.org/3.2/reference/kinetics/rate-constants.html)).
* **Unit conventions**: cm-mol-s with the molecularity-dependent power of
  10 (`BatchReactor.cpp:374`), cal = 4.184 J (`BatchReactor.cpp:393`),
  third-body reactions whose A carries one more concentration power, fall-off
  low-pressure A in a different unit from the high-pressure one — each is a
  silent factor-of-1000 trap, which is why K1 runs over every reaction, not
  a sample.
* **1 atm vs 1 bar** — T1d.
* **Molar masses** — §1.7 item 3.
* **Explicit-collider channels**: a third-body reaction whose efficiency for
  a species is zero because that species has its own channel; an importer
  that defaults the missing efficiency to 1 double-counts it.

**Programme.**

* **P1 touches every batch reactor golden.**  It is an extraction and must be
  byte-identical; the full sweep is its acceptance, so it waits for Vítor's
  run (§6).
* **Scope creep by parity.**  A matrix invites filling every `—`.  The
  matrix is a map; §4 is the decision, and it is Vítor's.

---

## 9. What this record does NOT decide

* the scope (§4) — Vítor;
* the GRI-Mech 3.0 licence reading (§7.6) — Vítor;
* whether a6/a7 are verified or stripped (§5.2) — Vítor, default verify;
* whether phase 9 (microkinetics) or an electrolyser unit is commissioned.

## 10. Alternatives considered and rejected

* **Link the library into the runtime** (Python or C++).  Rejected: a heavy
  dependency (CLAUDE.md §10 "Never import a heavy dep"), a black box where
  the project's value is the glass box, and a WASM build that would carry it
  to the browser.
* **Vendor the library's mechanisms or GRI-Mech into `data/standards/`.**
  Rejected: no redistribution grant (§7.6).
* **Compare against the library's own data files.**  Rejected: it would test
  two copies of data, not the code; §5.6 writes the library's input from
  Choupo's case so the numbers are one.
* **Refit Choupo polynomials into NASA-7 for the comparison.**  Rejected: a
  refit residual says more about the fit than about either code (the same
  reason `verify_against_nasa.py` does not compare Cp); the cubic maps onto
  a one-range NASA-7 EXACTLY.
* **A skip-when-absent oracle gate.**  Rejected: a check that cannot run
  must not pass (CLAUDE.md §6); the gate reads frozen anchors and always runs.
* **1-D flames for completeness.**  Rejected for C160 (§4).
