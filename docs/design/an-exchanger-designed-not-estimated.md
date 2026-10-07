# An exchanger designed, not estimated

*2026-10-07, DEV.md 4c C48.  Vítor, verbatim: "Eu estive a ver e os
permutadores não estão dimensionados de forma detalhada."*

## 1. What was there

The six exchangers of `tutorials/plant/greenAmmoniaIndustrialN2` were sized by
`ShellTubeHX` as A = Q/(U·LMTD) with a TYPED U (300–500 W/m²/K, C44 slice 1):
no tubes, no shell, no film coefficients, no fouling, no pressure drop.  Five
are `phaseChanger` coolers against no second stream; the FEHE is a rated
`heatExchanger` on a declared 2000 m² and U 550.  A Kern procedure already
existed — inside the two-stream unit (`model geometry;` rates a bundle,
`model design;` sizes one) — reachable by no sizer, and without fouling.

Premises of the commission, measured before building on them:

* True: the sizer routes, `sizeFromDuty` shared with `ColumnSize`, the Kern
  code inside `HeatExchanger.cpp`, the layering (postProcessing may include
  unitOperations), `thermoForPost` as the only route to the case thermo, the
  case components (N2 H2 NH3 Ar, no water), the Chiller's utility
  (`refrigerationNH3`, mechanism `evaporation`, 239.82 K, a latent
  `dutyPerKg`).
* **Not stated and false:** that the case's package could give a gas
  viscosity and conductivity.  It declared no `transport {}`, and its
  formulation, `diluteSolution`, REFUSED a transport block ("the gammaPhi
  wiring exists; extending it is a per-formulation act").
* **Found on the way, pre-existing:** the case's SEAL did not carry the
  utility records its C44 sizing names.  `bin/choupo-import` validates a
  seal by running the case with the catalogue hidden; there, every cooler's
  sizing failed (`UtilityCatalogue: unknown utility 'coolingWater'. Loaded:
  (none)`) at exit 0, so the validation passed a sealed case that could not
  size its exchangers.  And the importer itself crashed (a Python
  traceback) on any golden carrying an `equipment <unit> basis` row: it
  parsed the row's value as a float before reaching the branch that skips
  kinds it does not compare.

## 2. One kernel

The Kern arithmetic moved, verbatim, out of `HeatExchanger.cpp` into
`src/unitOperations/heatTransfer/htc/ShellTubeDesign.{H,cpp}` (namespace
`shellTubeDesign`): the Kern equivalent diameter, Sinnott's bundle table, the
shell from a tube count (bundle + 12 mm), the tube and shell films through a
`HeatTransferCorrelation`, the overall coefficient on the outside area with
the wall, the eps-NTU relation, the Kern pressure drops and the tube-count
search.  The unit calls it; the sizer calls it.  New in the kernel: per-side
fouling (zero default — `x + 0.0 == x`, so the unit is bit for bit what it
was), the 1-2 LMTD correction, validity flags on the two friction factors.

Proof of "moved, not rewritten": result JSON, stdout (normalised for the
working path and the commit hash) and `design/` byte-identical against a
build of the parent commit on all 14 `heatExchanger` cases (the geometry and
design witnesses `hxWorkflow1_design_from_duty`, `hxWorkflow2_rate_designed`,
`heatExchanger02_geometry_U` among them) and on every case with a sizing
postDict except the green-ammonia one.

The unit gains OPTIONAL `foulingTubeSide` / `foulingShellSide` (m2.K/W) in
its `geometry {}`; absent, nothing new is computed, printed or published.
Exercised by hand only (hxWorkflow2 fouled: U 4132.2 -> 1205.5 W/m²/K,
exactly 1/(1/4132.2 + 2.375e-4 + 3.5e-4)); no witness ships it.

## 3. The design route

`shellTubeHX` gains a fourth route, selected by a `design {}` block in the
designRules (grammar in `docs/ai/case-layout.md`).  The author declares the
bundle (tube OD/ID/length, pitch, pattern, tube passes, optional shells in
series, baffle spacing as a FRACTION of the shell ID — the shell ID is the
unknown, so an absolute spacing would be chosen before its scale exists),
the two correlations, the fouling on each side; the run finds the smallest N
(rounded up, the unit's own search) with

    U(N) · F · LMTD · n_shells · π d_o L N  ≥  |Q|

U from the two films, the tube wall (the item's MATERIAL record's
conductivity) and the declared fouling.  The INSTALLED area is costed.
Declaring `U` or `LMTD` beside `design {}` is refused (two homes).

**Fouling is DECLARED or refused.**  A design on a fouling nobody chose is
the hidden default this project refuses; `0` is a legal, visible "clean"
declaration.  The unit, by contrast, keeps clean-by-absence, because its
witnesses must not move.

**F.**  One 1-2 shell: Bowman, Mueller & Nagle (Trans. ASME 62, 1940), in the
R-S form R = (T1−T2)/(t2−t1), S = (t2−t1)/(T1−t1),
F = √(R²+1) ln[(1−S)/(1−RS)] / {(R−1) ln[(2−S(R+1−√(R²+1)))/(2−S(R+1+√(R²+1)))]},
the R = 1 limit taken analytically; an isothermal side (a boiling utility)
gives F = 1 exactly; one tube pass is counter-current, F = 1.  A 1-2 shell
that cannot deliver the terminal temperatures (a log argument ≤ 0) is
refused by name, naming `tubePasses 1;` and `shellsInSeries`.  F < 0.75 is
announced (the customary floor; not a cited number).  Shells in series are
built for ONE tube pass only — n 1-1 shells counter-current are one
exchanger n times as long; the F of 1-2 shells in series is not built.

**Where the properties come from.**
* Process side: the case's own package (`thermoForPost`) at the MEAN of its
  terminal temperatures, its inlet pressure and composition; density on the
  package's phase route (SRK vapour here); heat capacity the central
  difference of the package's own enthalpy (the surface the duty was priced
  on); viscosity and conductivity from the package's declared `transport {}`.
  The case gained `transport { vapour { viscosity { model Chung; }
  thermalConductivity { model Eucken; } } }`, and `ThermoPackageBuilder` now
  wires transport on `diluteSolution` too (the gammaPhi mapping moved to one
  helper, `v2TransportDict`, both formulations call it).  These are
  DILUTE-gas models; at 150 bar the real gas is more viscous and conductive,
  and every sheet's basis says so.
* Utility side: the system the utility's OWN record declares — a new
  optional `thermophysicalSystem {}` in `data/standards/utilities/<name>.dat`
  (`coolingWater` carries IF97 water: IAPWS density, enthalpy, R12-08
  viscosity, R15-11 conductivity), built against the case's own database
  through a new on-demand hook `SimulationResult::thermoForSystem`
  (choupoSolve only).  The record that says what the utility IS is the one
  home of how its fluid is priced, for every case.  Mass flow = |Q| /
  `dutyPerKg`, the record's own datum.  The sealed case therefore needs
  `water.dat`; `bin/choupo-import` grew the seal (water, the mirrored
  utilities, and the assets/species/chemistry records the C44/C48 runs read)
  — and the sealed run reproduces the unsealed one exactly (the only JSON
  difference is `seal.verdict`).
* A utility that BOILS or CONDENSES has no single-phase film: its
  coefficient must be declared (`utilitySideFilm`), said on the sheet, and
  no utility-side pressure drop is computed.  No boiling correlation is
  wired into the design (Rohsenow exists in `htc/` but needs a surface
  constant, a surface tension and a wall-superheat iteration; that is new
  physics, not this slice).

**A condensing process side (WaterCooler, Chiller).**  Not priced as
single-phase in silence.  v1: the film is the GAS film of the outlet's own
equilibrium vapour (`flashState::equilibriumAt`), at the outlet temperature,
carrying only the vapour's mass flow — the smallest gas flow on the path — and
the condensate film, whose coefficient is higher, is not credited: the design
OVER-SIZES, and says so on the sheet and in the caveat block.  The pressure
drop is the whole INLET flow priced as gas (the largest volumetric flow); a
two-phase pressure drop is not modelled.  A boiling process side, or a total
condenser, is refused by name.  Why not refuse the route for a two-phase
outlet: the WaterCooler condenses 5 % of its moles and the Chiller 13 %; the
gas film genuinely controls both, and a safe-side design with its error
direction stated is more useful to a student than no design.

**The FEHE.**  Designed from its own duty and both streams with the same
kernel, HotEffluent in the tubes.  Its ends cross (hot out 336 K, cold out
651 K), so one tube pass over four 6.1 m shells in counter-current series.
Result: 1837 m² at U 468 W/m²/K, against the unit's declared 2000 m² at U
550 — published beside the design as `A_rated` / `U_rated`.  The unit's
model and the loop's answer are NOT moved (every process KPI is byte-
identical).  The DESIGNED area is costed: it is the hardware that delivers
the duty the loop converged on, on computed films and declared fouling; the
declared 2000 m² rests on a typed U the design does not confirm.  The four
shells are costed as ONE item at their total area — four shells of A/4 would
cost more (the correlation is sublinear); said in the basis.

## 4. The design, per exchanger

Author-set: tubes 25.4 × 2.77 mm (ID 19.86 mm), 6.096 m, pitch 31.75 mm;
square pitch with water on the shell, triangular elsewhere; baffles 1.0 × the
shell ID (at 0.4, the first trial, the water side lost 1.2–4.7 bar); fouling
0.0002 m²K/W process gas, 0.00035 tower water, 0.0002 refrigerant
(TEMA-typical orders of magnitude, no table read); Chiller boiling film 2500
W/m²/K (typed).

| item | passes × shells | N | shell ID m | h_tube / h_shell W/m²K | U (clean) | F | A req / inst m² | utility kg/s | dP tube / shell kPa |
|---|---|---|---|---|---|---|---|---|---|
| N2Cooler | 2 × 1 | 174 | 0.555 | 858 / 3984 | 414.9 (554.1) | 0.899 | 84.4 / 84.6 | 47.3 water | 55.6 / 18.8 |
| Intercooler | 2 × 1 | 382 | 0.778 | 1917 / 4674 | 645.5 (1059.9) | 0.896 | 185.5 / 185.8 | 123.9 water | 25.2 / 32.4 |
| Aftercooler | 2 × 1 | 396 | 0.790 | 1888 / 4741 | 642.4 (1051.7) | 0.897 | 192.4 / 192.6 | 131.2 water | 10.9 / 34.4 |
| WaterCooler | 2 × 1 | 1464 | 1.388 | 1475 / 2954 | 533.6 (788.5) | 0.902 | 711.9 / 712.1 | 171.6 water | 5.8 / 6.4 |
| Chiller | 4 × 1 | 2204 | 1.594 | 1571 / 2500 decl. | 536.8 (710.7) | 1 | 1071.6 / 1072.1 | 14.8 NH3 | 19.4 / — |
| FEHE | 1 × 4 | 944 per shell | 1.072 | 1358 / 1829 | 468.2 (595.2) | 1 | 1835.9 / 1836.8 | — | 12.4 / 149.3 |

Announced on every run (sheet basis + caveat block): the tube-side friction
factor 0.079 Re^-0.25 used above its stated Re 1e5 on every gas side; the
Gnielinski Pr window (0.5) left on the hydrogen-rich gases (Pr 0.46–0.49,
the Chung/Eucken pair's own value).  Two condensing designs; the FEHE and
the Chiller above the cost correlation's 1000 m² ceiling.

## 5. The goldens

53 rows MOVE and are left unrecorded for Vítor (the list, old -> new, with
the reason for each, is in the C48 report): per exchanger `values.A`,
`values.U`, `values.weight`, `cost.purchased/bareModule/totalModule` and the
`basis` sentence (6 × 7 = 42), and 11 economics KPIs that follow the capital
(FCI −0.84 %, TCI, COM_d, NPV, WC, WC_net, WC_fractionRule, WC_minimumCash,
WC_processInventory, WC_productStock, productionCostPerKg).  No process KPI,
stream, balance or utility row moved.  235 NEW rows (the sheets' new keys)
were appended with `--record-append`.

## 6. Gate

`check_design_sheet` arm (s) recomputes every design sheet from its own other
numbers, the case, the material and utility records and the run's KPIs (the
list and five sabotages are in the gate's docstring).  Arm (p) — routes 2
and 3 — now runs an ESTIMATE TWIN of the case (designs taken out, the C44 U
values given back), since no shipped case exercises those routes any more.

## 7. NOT done, said

* No boiling film correlation; the Chiller's shell side is typed.
* No condensation film model (the condensing duties are on the gas film).
* No dense-gas transport correction.
* N is not proven MINIMAL by the gate (only A ≥ A_required).
* The unit applies no dP to its outlets (unchanged), and the sizer's dPs
  are published, not applied.
* 1-2 shells in series (Bowman's N-shell F) are not built.
* The exchangers' held inventory is still NOT DECLARED (C44 slice 3); the
  design now has the geometry a tube-side volume would need.
* The unit's optional fouling has no shipped witness.

## 8. Addendum (C51, 2026-10-07): the sheet says what flows where

The GUI's exchanger datasheet could not draw this design: it read the
unit's KPIs and `geometry {}`, which a design on the sizer's sheet does not
fill, and the GUI parser refused the sheet whole, because `m2.K/W` and
`W/m/K` were added to `src/core/Units.cpp` and not to its mirror
`gui/src/dict/units.ts`.  Both are fixed (DEV.md 4c C51).  The route now
also writes an `exchanger {}` block on the sheet -- each side's role,
streams or utility (with the record's supply and return T), regime, film
computed or declared, correlation; the tube pattern; the controlling
resistance; and which `sizing {}` keys the case declared or were read from
the unit or a record -- so the datasheet draws the engine's decisions
instead of parsing the basis.  Sheet-only: the result JSON, the basis and
every golden row are unchanged.  `check_design_sheet` arm (k) now holds
every sizer unit word to the GUI mirror as well.


## Appendix: the 53 golden rows that move, AWAITING VÍTOR (2026-10-07)

Not recorded.  `bin/runTests` on this branch fails greenAmmoniaIndustrialN2 on
exactly these rows and on nothing else (the 65 other cases the change can
reach -- every gammaPhi case declaring transport, every diluteSolution case,
every heatExchanger case, every case sizing a shellTubeHX or a column -- PASS,
measured 2026-10-07 on the branch with main merged in).  When Vítor approves
the list, `bin/runTests --record tutorials/plant/greenAmmoniaIndustrialN2`
re-pins them and the branch can merge.

```
equipment Aftercooler basis                  (old sentence) -> (design sentence)  the basis sentence of the design route replaces the A = Q/(U*LMTD) / pass-through sentence
equipment Aftercooler values.A                        221.561 -> 192.63           (-13.06 %)  the designed, INSTALLED area (n_shells pi d_o L N, smallest N meeting U F LMTD A >= |Q|) replaces A = Q/(U_typed LMTD) (FEHE: replaces the unit's rated 2000 m2, now published as A_rated)
equipment Aftercooler values.U                            500 -> 642.414          (+28.48 %)  U is COMPUTED (films + wall + declared fouling, dirty) instead of typed (FEHE: instead of the unit's own 550)
equipment Aftercooler values.weight                   6646.84 -> 5778.9           (-13.06 %)  the sheet weight is 30 kg/m2 x A x rho_mat/7850 -- follows A
equipment Aftercooler cost.purchased                  61907.9 -> 58100.8          (-6.15 %)  Turton purchased cost on the new A
equipment Aftercooler cost.bareModule                  260771 -> 244735           (-6.15 %)  Turton bare-module cost on the new A
equipment Aftercooler cost.totalModule                 307710 -> 288787           (-6.15 %)  Turton total-module cost on the new A
equipment Chiller basis                      (old sentence) -> (design sentence)  the basis sentence of the design route replaces the A = Q/(U*LMTD) / pass-through sentence
equipment Chiller values.A                             1150.5 -> 1072.11          (-6.81 %)  the designed, INSTALLED area (n_shells pi d_o L N, smallest N meeting U F LMTD A >= |Q|) replaces A = Q/(U_typed LMTD) (FEHE: replaces the unit's rated 2000 m2, now published as A_rated)
equipment Chiller values.U                                500 -> 536.8            (+7.36 %)  U is COMPUTED (films + wall + declared fouling, dirty) instead of typed (FEHE: instead of the unit's own 550)
equipment Chiller values.weight                       35174.4 -> 32777.9          (-6.81 %)  the sheet weight is 30 kg/m2 x A x rho_mat/7850 -- follows A
equipment Chiller cost.purchased                       161050 -> 153372           (-4.77 %)  Turton purchased cost on the new A
equipment Chiller cost.bareModule                 1.23565e+06 -> 1.17674e+06      (-4.77 %)  Turton bare-module cost on the new A
equipment Chiller cost.totalModule                1.45806e+06 -> 1.38855e+06      (-4.77 %)  Turton total-module cost on the new A
equipment FEHE basis                         (old sentence) -> (design sentence)  the basis sentence of the design route replaces the A = Q/(U*LMTD) / pass-through sentence
equipment FEHE values.A                                  2000 -> 1836.79          (-8.16 %)  the designed, INSTALLED area (n_shells pi d_o L N, smallest N meeting U F LMTD A >= |Q|) replaces A = Q/(U_typed LMTD) (FEHE: replaces the unit's rated 2000 m2, now published as A_rated)
equipment FEHE values.U                                   550 -> 468.171          (-14.88 %)  U is COMPUTED (films + wall + declared fouling, dirty) instead of typed (FEHE: instead of the unit's own 550)
equipment FEHE values.weight                          61146.5 -> 56156.8          (-8.16 %)  the sheet weight is 30 kg/m2 x A x rho_mat/7850 -- follows A
equipment FEHE cost.purchased                          242012 -> 226662           (-6.34 %)  Turton purchased cost on the new A
equipment FEHE cost.bareModule                    2.30053e+06 -> 2.15462e+06      (-6.34 %)  Turton bare-module cost on the new A
equipment FEHE cost.totalModule                   2.71462e+06 -> 2.54245e+06      (-6.34 %)  Turton total-module cost on the new A
equipment Intercooler basis                  (old sentence) -> (design sentence)  the basis sentence of the design route replaces the A = Q/(U*LMTD) / pass-through sentence
equipment Intercooler values.A                          238.5 -> 185.82           (-22.09 %)  the designed, INSTALLED area (n_shells pi d_o L N, smallest N meeting U F LMTD A >= |Q|) replaces A = Q/(U_typed LMTD) (FEHE: replaces the unit's rated 2000 m2, now published as A_rated)
equipment Intercooler values.U                            450 -> 645.458          (+43.44 %)  U is COMPUTED (films + wall + declared fouling, dirty) instead of typed (FEHE: instead of the unit's own 550)
equipment Intercooler values.weight                   7154.99 -> 5574.59          (-22.09 %)  the sheet weight is 30 kg/m2 x A x rho_mat/7850 -- follows A
equipment Intercooler cost.purchased                  64082.9 -> 57185.6          (-10.76 %)  Turton purchased cost on the new A
equipment Intercooler cost.bareModule                  242410 -> 216319           (-10.76 %)  Turton bare-module cost on the new A
equipment Intercooler cost.totalModule                 286044 -> 255257           (-10.76 %)  Turton total-module cost on the new A
equipment N2Cooler basis                     (old sentence) -> (design sentence)  the basis sentence of the design route replaces the A = Q/(U*LMTD) / pass-through sentence
equipment N2Cooler values.A                           104.998 -> 84.6404          (-19.39 %)  the designed, INSTALLED area (n_shells pi d_o L N, smallest N meeting U F LMTD A >= |Q|) replaces A = Q/(U_typed LMTD) (FEHE: replaces the unit's rated 2000 m2, now published as A_rated)
equipment N2Cooler values.U                               300 -> 414.859          (+38.29 %)  U is COMPUTED (films + wall + declared fouling, dirty) instead of typed (FEHE: instead of the unit's own 550)
equipment N2Cooler values.weight                      3149.95 -> 2539.21          (-19.39 %)  the sheet weight is 30 kg/m2 x A x rho_mat/7850 -- follows A
equipment N2Cooler cost.purchased                     45562.9 -> 42323.1          (-7.11 %)  Turton purchased cost on the new A
equipment N2Cooler cost.bareModule                     160377 -> 148973           (-7.11 %)  Turton bare-module cost on the new A
equipment N2Cooler cost.totalModule                    189245 -> 175789           (-7.11 %)  Turton total-module cost on the new A
equipment WaterCooler basis                  (old sentence) -> (design sentence)  the basis sentence of the design route replaces the A = Q/(U*LMTD) / pass-through sentence
equipment WaterCooler values.A                        685.302 -> 712.147          (+3.92 %)  the designed, INSTALLED area (n_shells pi d_o L N, smallest N meeting U F LMTD A >= |Q|) replaces A = Q/(U_typed LMTD) (FEHE: replaces the unit's rated 2000 m2, now published as A_rated)
equipment WaterCooler values.U                            500 -> 533.614          (+6.72 %)  U is COMPUTED (films + wall + declared fouling, dirty) instead of typed (FEHE: instead of the unit's own 550)
equipment WaterCooler values.weight                   20559.1 -> 21364.4          (+3.92 %)  the sheet weight is 30 kg/m2 x A x rho_mat/7850 -- follows A
equipment WaterCooler cost.purchased                   114377 -> 117164           (+2.44 %)  Turton purchased cost on the new A
equipment WaterCooler cost.bareModule                  481784 -> 493523           (+2.44 %)  Turton bare-module cost on the new A
equipment WaterCooler cost.totalModule                 568506 -> 582357           (+2.44 %)  Turton total-module cost on the new A
kpi economics COM_d                               4.43893e+08 -> 4.43831e+08      (-0.01 %)  follows FCI (Turton COM_d carries FCI terms)
kpi economics FCI                                  4.1577e+07 -> 4.12297e+07      (-0.84 %)  sum of the six exchanger cost moves
kpi economics NPV                                -4.12426e+08 -> -4.11744e+08     (-0.17 %)  follows FCI and COM_d
kpi economics TCI                                 9.28176e+07 -> 9.24638e+07      (-0.38 %)  follows FCI
kpi economics WC                                  5.12406e+07 -> 5.1234e+07       (-0.01 %)  = WC_net
kpi economics WC_fractionRule                     6.23655e+06 -> 6.18446e+06      (-0.84 %)  0.15 x FCI, printed for comparison
kpi economics WC_minimumCash                      1.82422e+07 -> 1.82396e+07      (-0.01 %)  15 days of COM_d
kpi economics WC_net                              5.12406e+07 -> 5.1234e+07       (-0.01 %)  gross - payables; its cost-valued terms move
kpi economics WC_processInventory                     12380.7 -> 12379.1          (-0.01 %)  process inventory valued at COST (COM_d per kg)
kpi economics WC_productStock                     2.83767e+07 -> 2.83727e+07      (-0.01 %)  product stock valued at COST (COM_d per kg)
kpi economics productionCostPerKg                     1.14485 -> 1.14468          (-0.01 %)  COM_d / production
```
