# OpenFOAM's 0-D chemistry cell against Choupo's chemistry (2026-11-20)

Vítor's question: "is our CHEMKIN solver at OpenFOAM's level?", narrowed to
what OpenFOAM does in ONE cell: the reaction rates, thermo and standard state,
ODE solver, Jacobian and linear solve, per-cell reduction and tabulation, and
the CHEMKIN reader.  CFD coupling, load balancing and turbulence-chemistry
interaction are out of scope.  Read by a general (source reading only: nothing
of OpenFOAM was built or run); section 5 was verified by the commander.

## 0. What was read

- OpenFOAM-dev, commit `af6c9e8f1a7f5872256bb288c3905002a5e435ab` (2026-11-17),
  a shallow sparse clone under `thirdParty/` (never committed, deleted after
  reading).  Paths read: `src/thermophysicalModels/{chemistryModel,specie}`,
  `src/ODE`, `src/OpenFOAM/global/constants`, `etc/configDict`,
  `applications/utilities/thermophysical/chemkinToFoam`,
  `applications/solvers/chemFoam`, `applications/test/ODE`, `test/chemistry`.
  OpenFOAM paths below are relative to that tree.
- Choupo: branch `claude/choupo-simulator-new-session-s494v2` at `adc05ffa4`.

## 1. The 0-D problem each side integrates

- **OpenFOAM's cell** (`Standard_chemistryModel.C:74-151`): state (Y_1..Y_N,
  T) at a FIXED pressure for the chemistry step; dT/dt = -sum(dY_i/dt h_a,i)/c_p
  (constant-pressure adiabatic); T clamped to the thermo window (:91), negative
  Y clamped to 0 (:86).
- **chemFoam** (the 0-D tool): `constantProperty pressure | volume |
  temperature` (`createInitialFields.H:17-29`).  "Constant volume" keeps the
  chemistry step isobaric and corrects energy and pressure afterwards
  (`hEqn.H`, `pEqn.H`): an operator split, first order in the outer step (code
  reading, not measured).
- **Choupo** (`batchReactor`, `energy gasConstantV`): state (n_i, T) at fixed
  V; dT/dt = -sum(u_i dn_i/dt)/C_v,tot -- the constant-volume adiabatic ODE
  integrated directly.  Choupo has NO constant-pressure gas vessel (the Energy
  enum holds LiquidDH and GasConstantV only, `BatchReactor.H`).
- Like for like: chemFoam `constantProperty volume` against `gasConstantV` --
  the same physics, different numerical paths.  OpenFOAM's default isobaric
  cell has no Choupo counterpart.

## 2. Comparison

| capability | OpenFOAM | Choupo | verdict |
|---|---|---|---|
| reader sections | ELEMENTS (isotopes), SPECIES, THERMO / THERMO ALL, REACTIONS (`chemkinLexer.L`); a transport file for Sutherland coefficients (`chemkinReader.C:878-881`) | the same sections, no transport file (`bin/curate/chemkin_to_choupo.py`) | OpenFOAM ahead on transport; level otherwise |
| units | cal, kcal, J, K; per-reaction UNITS; `EVOLTS`, `MOLES`, `MOLECULES` matched and consumed with an EMPTY action (`chemkinLexer.L:181, 704-705`); R = 1.987316 cal/mol/K (:303) | cal, kcal, J, kJ, K, eV; MOLECULES REFUSED by name; no per-reaction UNITS; R = 8.314462618 J/mol/K, cal = 4.184 J | Choupo safer on MOLECULES; OpenFOAM reads per-reaction UNITS |
| rate keywords | M, LOW, HIGH, TROE, SRI, LT, RLT, JAN, FIT1, PLOG, REV, DUP, FORD, RORD, UNITS; HV/EXCI/MOME/XSMI fatal; unknown keywords fatal; no CHEB | DUP, LOW, TROE, REV (written as two irreversible reactions), efficiencies; SRI, PLOG, FORD/RORD, MOLECULES, REV on (+M) REFUSED by name in `mechanismImport.txt` | OpenFOAM reads more forms; Choupo refuses more explicitly |
| rate forms at run time | Arrhenius, third body, Lindemann/Troe/SRI fall-off, chemically activated, Landau-Teller, Janev, PLOG, FIT1, LH, Michaelis-Menten, surface (`reaction/reactionRates/*`); no Chebyshev | modified Arrhenius, third body, Lindemann/Troe fall-off (`ElementaryRate`, `Reaction.cpp`); plus LHHW, `expression` and case-registered laws | OpenFOAM ahead on CHEMKIN-family forms; Choupo ahead on user-written laws; Chebyshev missing in both |
| reverse | detailed balance (`Reversible_reaction.C:171-173`); explicit REV as its own class | detailed balance; explicit REV only through the importer's two irreversible reactions | OpenFOAM ahead (REV with a temperature exponent) |
| standard state of K_c | K_c = K_p (pStd/RT)^dn (`thermoI.H:171-175`), pStd = 1e5 Pa (`etc/configDict:181`); chemkinToFoam has no 1 atm -> pStd step | P0 = 1 bar; the importer re-references every NASA-7 record from 1 atm (a7 + ln 1.01325); measured against Cantera | see section 5 |
| thermo window | warns and CLAMPS T outside [Tlow, Thigh] (`janafThermoI.H:100-115`) | evaluates the polynomial outside and announces once | different policies |
| ODE solvers | Euler, EulerSI, Trapezoid, RKF45, RKCK45, RKDP45, Rosenbrock12/23/34, rodas23, rodas34, SIBS, seulex (`src/ODE/ODESolvers`); its README ranks seulex best | RK4 (fixed), EulerSI, Rosenbrock23, Rodas4 | OpenFOAM ahead in breadth (no extrapolation method in Choupo) |
| step control | safety 0.9, scale in [0.2, 10], max norm of err/(absTol + relTol max\|y\|) (`adaptiveSolver.C`, `ODESolver.C:40-67`) | safety 0.9 (Rodas4) / 0.8, growth cap 4, floor 0.2, per-component atol, per-row positivity rejection | level; Choupo rejects negative species, OpenFOAM clamps afterwards |
| Jacobian | always analytic (`Standard_chemistryModel.C:156-350`); default `fast` (dc/dY diagonal only), `exact` opt-in; fall-off T and concentration terms compiled OUT (`FallOff_reactionRate.H:44`); a debug-only check that prints and refuses nothing (`ODESystem.C:42-106`) | finite difference by default; analytic opt-in, exact for mass action, third body and Lindemann, Troe by a scalar difference in [M], T column by one directional difference; AUDITED against a dense difference and refused by name on disagreement | different bets: OpenFOAM always analytic but approximate on fall-off and never audited; Choupo exact where claimed and audited, but off by default |
| linear solve | dense LU (`rodas34.C:138-286`) | dense LU | level (neither sparse) |
| mechanism reduction | DRG, DRGEP, PFA, EFA, DAC per cell (`standard/reduction/*`), tolerance 1e-4: dropped species are not integrated in that step | none (the rates of production and path flux are printed as analysis, not used to drop species) | OpenFOAM ahead |
| tabulation | ISAT (Pope 1997), tolerance 1e-4: the cell's answer may be an interpolation | none | OpenFOAM ahead |
| glass box | rate fields as function objects; no path flux, no sensitivity in the code read | rates of production per reaction at chosen instants and element path flux, printed and documented; no sensitivity | Choupo ahead on path flux; neither has sensitivity |
| validation shipped | `test/chemistry/{h2,gri,nc7h16,ic8h18,ic8h18_TDAC}`, 10 to 874 species, graphs against CHEMKIN-II output (pass/fail not checked) | one real mechanism (LLNL H2, 10 species) against Cantera 3.2.0 with numbers on the page (`docs/reviews/2026-11-19-chemkin-real-mechanism/REPORT.md`): tau 79.20/79.20 us, T_final equal to 1 mK | OpenFOAM ahead in range; Choupo ahead in a quantified comparison for one mechanism |

## 3. Verdict (the general's judgement, separated from the facts above)

**Behind.**  (1) Rate-form breadth: SRI, PLOG (common in pyrolysis
mechanisms), chemically activated, Landau-Teller, FIT1, Janev; REV with a
temperature exponent only as two irreversibles.  (2) No constant-pressure gas
vessel.  (3) Solver breadth (no seulex).  (4) No mechanism reduction or
tabulation -- they matter beyond the sizes Choupo has run.  (5) Validation
scale: one 10-species mechanism.

**Level.**  NASA-7, Lindemann/Troe algebra, detailed balance, third-body
efficiencies, the Rosenbrock step control, dense LU; neither offers
sensitivity analysis.

**Ahead.**  An analytic Jacobian that is exact where it claims to be and
audited (OpenFOAM's default is approximate on fall-off and unchecked); named
refusals instead of silently consumed input; printed rates of production and
path flux; user-written rate laws; a true constant-volume ODE; the
standard-state handling (section 5).

Overall: on the 0-D core Choupo is level and checks itself better; it is behind
on breadth of rate forms and on everything that makes large mechanisms cheap.

## 4. Not verified

No OpenFOAM run, so no accuracy or speed comparison on the same mechanism;
whether `test/chemistry/*/validation` has pass/fail thresholds; Choupo above
10 species.

## 5. The standard state, verified by the commander

- OpenFOAM: `Kc = Kp * (pStd/(RR*T))^nm` (`thermoI.H:171-175`) with
  `pStd 1e5 [kg m^-1 s^-2]` (`etc/configDict:181`, read through
  `fundamentalConstants.C:171-178`), i.e. 1 bar.
- A CHEMKIN-II NASA-7 file is referenced to 1 atm, and the general's search of
  `chemkinToFoam` found no 1 atm -> pStd conversion (the only atm/101325 is
  PLOG's pressure, `chemkinReader.C:664`).
- So, by code reading, a mechanism imported with chemkinToFoam carries the
  error Choupo measured and fixed on 2026-11-19: every reverse rate taken from
  the thermochemistry with dn != 0 is off by 1.01325^dn (on the LLNL H2
  mechanism, +1.26 K in the final temperature and -0.07 to -0.9 % in the
  radicals).  NOT measured on OpenFOAM: whether its janaf entropy is
  re-referenced somewhere this reading did not reach is the one thing a run
  would settle.
