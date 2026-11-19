# C390: the pressure term of the generic liquid enthalpy -- moved goldens

What changed: the liquid leg of `H_stream_formation` / `S_stream_formation` on a
package that does not price its liquid on the equation of state gains, per
component, `INT_{psat(T)}^{P} v (1 - alpha T) dP` (entropy `-INT (dv/dT) dP`);
the pump solves the stream balance `H(T_out, P_out) = H(T_in, P_in) + w_real`.
Before it, the ammonia reference equation (Gao et al. 2023) was curated (a
separate commit): it moved NO golden row of the 31 ammonia steady/plant cases
(scope run, 36 PASS / 0 FAIL, before the term existed).

## The datum offset every liquid carries (explains the `H_feeds` rows)

The term is measured from the component's own saturated liquid, and the
formation-datum liquid is the saturated liquid at 1 atm-ish.  A feed at
298.15 K and 1 bar sits P - psat = 100000 - 3170 Pa above its saturation
pressure, so its enthalpy gains `v (1 - alpha T) (P - psat)` = 1.8068e-5 x
(1 - 2.573e-4 x 298.15) x 96830 = 1.61 J/mol (the review predicted 1.75
J/mol for water).  At 10 mol/s that is +0.0161 kW (pump01/02), at 55.5 mol/s
+0.0894 kW (liquidDensity01).  Every moved `H_feeds_kW` / `H_products_kW` row
below carries this and the effect of the pump itself.

## pump01_water  (re-recorded)

| row | before | after | why |
|---|---|---|---|
| `kpi pump01 T_out`, `stream out T` | 299.077152 K | 299.219103 K | only ~80 of the 200 J/mol heat the liquid now; the other ~120 J/mol (`v (1-aT) dP` = 120.03 J/mol, hand calculation in `c390_pump_handcheck.py`) is stored as pressure.  The old closed form had treated the useful part as `eta w` = 130 J/mol and lost it. |
| `kpi pump01 dT` | 0.927152 K | 1.069103 K | same.  Independent check: the IAPWS-95 enthalpy balance (the independent Python implementation of the reference equation) gives 1.071478 K; the engine is 0.222 % below it. |
| `boundary global H_feeds_kW` | -2864.01591733 | -2863.99976314 | +0.0161 kW: the datum offset above |
| `boundary global H_products_kW` | -2863.31591733 | -2861.99976314 | +1.3162 kW = the 1.3 kW of useful work now carried (+ the 0.0161 offset) |
| `boundary global residual_kW` | 1.3 | 9.1e-13 | the open first law is closed |
| `boundary global noBoundary`, `residual_denom_kW` | (absent) | false, 2 | rows the golden writer now emits; appended |

## pump02_pressure_spec  (re-recorded)

`T_out`, `stream out T`: 298.523701 -> 298.578585 K; `dT` 0.373701 -> 0.428585 K;
`H_feeds_kW` -2864.01591733 -> -2863.99976314 (the datum offset);
`H_products_kW` -2863.73377302 -> -2863.19363652 (+0.5400 kW: the useful work
0.5240 kW now carried + the offset); `residual_kW` 0.523982 -> -4.5e-13.  New rows
as above.

## liquidDensity01_water, liquidDensity02_waterEthanol  (re-recorded)

Every row of these two goldens is rewritten, because the golden writer
right-pads the value column to the longest value and the new values are
longer; the VALUES that did not move are identical to the digit.  Moved:

| row | 01 before -> after | 02 before -> after | why |
|---|---|---|---|
| `stream product T`, `stream pumped T`, `P1 T_out`, `R1 T`, `R1 T_out` | 298.170513 -> 298.174194 | 298.178514 -> 298.196458 | pump discharge T on the stream balance |
| `P1 dT` | 0.0205128 -> 0.0241939 | 0.0285143 -> 0.0464584 | same; the IAPWS-95 route gives 0.024238 K for 01 (engine -0.18 %) |
| `R1 k_absentAcid` | 1.741733e-06 -> 1.742167e-06 | 1.742676e-06 -> 1.744792e-06 | the rate constant of the reactor evaluated at the (slightly warmer) feed temperature |
| `R1 tau_s` | 997.131976 -> 997.131030 | 888.292693 -> 888.278282 | the reactor's volumetric flow at the warmer feed |
| `boundary global H_feeds_kW` | -15897.951248 -> -15897.861577 | -11357.799746 -> -11357.721628 | datum offset (+0.0897 / +0.0781 kW) |
| `boundary global H_products_kW` | -15897.865280 -> -15897.575017 | -11357.703251 -> -11357.399978 | the offset + the useful work now carried (+0.2008 / +0.2252 kW) |
| `boundary global residual_kW` | 0.200592 -> -6.2e-11 | 0.225155 -> 1.3e-09 | first law closed |
| `boundary global noBoundary`, `residual_denom_kW` | (absent) | appended | |

`check_energy_closure`: the four cases leave KNOWN_OPEN (all close at 0.0000 %).

## The ammonia family: 19 cases, 490 moved rows, EVERY ROW COVERED BY A NAMED CAUSE (re-recorded case by case)

`bin/runTests --scope` on the 32 steady/plant cases that name ammonia (plus column14),
with the term built (reference-equation route, backward second-order slope, see the
slice report), gave 19 cases with moved rows, 490 rows in all.  Every row is
assigned to ONE cause below by its key (a rule per key family); no row is left without one (0 unmatched).  The causes
are physical, and a cause that repeats in 12 plants with the same row count is one cause:
the let-down flash (K1) moves exactly 6 rows in each of the 12 plants that carry it.
After this the goldens were re-recorded with `bin/runTests --record <case>`, one case at a
time (the record guard refuses a mass, element or energy closure above tolerance).
One consequence of K1 is not a moved row but a changed SHAPE: the let-down unit's duty was a
heat demand met by `steamLP` and is now a cooling duty met by `refrigerationNH3`, so in 12
plants the four `utility <unit> heating.steamLP.*` rows are DELETED from the golden (the
run no longer publishes them; the scope run named them MISSING) and the four
`utility <unit> cooling.refrigerationNH3.*` rows are APPENDED (`--record-append`).

| cause | rows | what it is |
|---|---|---|
| K1 | 72 | the isothermal let-down flash: the liquid warms on throttling, so the unit's duty changes sign (+13.8 to -226 kW) and its steam-heating utility disappears |
| K2 | 44 | the valve itself and its drum: the compressed liquid leaves warmer (valve dT, T_out, densities, vapour fraction) and the flash K-values and splits follow the temperature |
| K3 | 92 | the product separator / storage flash and the chiller: their inlet liquid and the let-down heat enter their duty, and the refrigeration / steam utility that serves them |
| K4 | 194 | the loop and the plant boundary: the changed duties feed the tear and the heat exchangers' duties, sizes and the cooling-water use (water cooler, chiller, boundary Q, pinch, layout) |
| K5 | 11 | the datum offset: every liquid above its own psat carries v (1 - alpha T) (P - psat), +1.6 J/mol for water at 1 bar, in the plant boundary enthalpies |
| K6 | 50 | the economics that price those duties and equipment (utility cost, purchased and total module cost, NPV, IRR, payback, break-evens, sensitivities) |
| K7 | 27 | columns and strippers at pressure: the compressed feed / reflux liquid carries the term, so the reboiler and condenser duties (and their utilities) and the minor key move in the fourth digit |

### K1 (72 rows): the isothermal let-down flash: the liquid warms on throttling, so the unit's duty changes sign (+13.8 to -226 kW) and its steam-heating utility disappears

- **ammonia01_synthesis_loop** (6): `kpi.letdown.Q`, `kpi.letdown.Q_kW`, `utility.letdown.heating.steamLP.T`, `utility.letdown.heating.steamLP.duty_kW`, `utility.letdown.heating.steamLP.eur_h`, `utility.letdown.heating.steamLP.kg_s`
- **ammonia02_full_plant** (6): `kpi.letdown.Q`, `kpi.letdown.Q_kW`, `utility.letdown.heating.steamLP.T`, `utility.letdown.heating.steamLP.duty_kW`, `utility.letdown.heating.steamLP.eur_h`, `utility.letdown.heating.steamLP.kg_s`
- **ammonia03_quench_converter** (6): `kpi.letdown.Q`, `kpi.letdown.Q_kW`, `utility.letdown.heating.steamLP.T`, `utility.letdown.heating.steamLP.duty_kW`, `utility.letdown.heating.steamLP.eur_h`, `utility.letdown.heating.steamLP.kg_s`
- **ammoniaReactor01_fixedConversion** (6): `kpi.letdown.Q`, `kpi.letdown.Q_kW`, `utility.letdown.heating.steamLP.T`, `utility.letdown.heating.steamLP.duty_kW`, `utility.letdown.heating.steamLP.eur_h`, `utility.letdown.heating.steamLP.kg_s`
- **ammoniaReactor02_equilibrium** (6): `kpi.letdown.Q`, `kpi.letdown.Q_kW`, `utility.letdown.heating.steamLP.T`, `utility.letdown.heating.steamLP.duty_kW`, `utility.letdown.heating.steamLP.eur_h`, `utility.letdown.heating.steamLP.kg_s`
- **ammoniaReactor03_equilibriumApproach** (6): `kpi.letdown.Q`, `kpi.letdown.Q_kW`, `utility.letdown.heating.steamLP.T`, `utility.letdown.heating.steamLP.duty_kW`, `utility.letdown.heating.steamLP.eur_h`, `utility.letdown.heating.steamLP.kg_s`
- **ammoniaReactor04_kineticSizing** (6): `kpi.letdown.Q`, `kpi.letdown.Q_kW`, `utility.letdown.heating.steamLP.T`, `utility.letdown.heating.steamLP.duty_kW`, `utility.letdown.heating.steamLP.eur_h`, `utility.letdown.heating.steamLP.kg_s`
- **economics03_startup_years** (6): `kpi.letdown.Q`, `kpi.letdown.Q_kW`, `utility.letdown.heating.steamLP.T`, `utility.letdown.heating.steamLP.duty_kW`, `utility.letdown.heating.steamLP.eur_h`, `utility.letdown.heating.steamLP.kg_s`
- **greenAmmonia02_feasibility150bar** (6): `kpi.LetdownHP.Q`, `kpi.LetdownHP.Q_kW`, `utility.LetdownHP.heating.steamLP.T`, `utility.LetdownHP.heating.steamLP.duty_kW`, `utility.LetdownHP.heating.steamLP.eur_h`, `utility.LetdownHP.heating.steamLP.kg_s`
- **greenAmmonia02_feasibility50bar** (6): `kpi.LetdownHP.Q`, `kpi.LetdownHP.Q_kW`, `utility.LetdownHP.heating.steamLP.T`, `utility.LetdownHP.heating.steamLP.duty_kW`, `utility.LetdownHP.heating.steamLP.eur_h`, `utility.LetdownHP.heating.steamLP.kg_s`
- **greenAmmonia03_basicDesign** (6): `kpi.LetdownHP.Q`, `kpi.LetdownHP.Q_kW`, `utility.LetdownHP.heating.steamLP.T`, `utility.LetdownHP.heating.steamLP.duty_kW`, `utility.LetdownHP.heating.steamLP.eur_h`, `utility.LetdownHP.heating.steamLP.kg_s`
- **greenAmmoniaPEQ_baseCase** (6): `kpi.LetdownHP.Q`, `kpi.LetdownHP.Q_kW`, `utility.LetdownHP.heating.steamLP.T`, `utility.LetdownHP.heating.steamLP.duty_kW`, `utility.LetdownHP.heating.steamLP.eur_h`, `utility.LetdownHP.heating.steamLP.kg_s`

### K2 (44 rows): the valve itself and its drum: the compressed liquid leaves warmer (valve dT, T_out, densities, vapour fraction) and the flash K-values and splits follow the temperature

- **letdown01_ammonia_flashing** (44): `kpi.DrumHP.F_beta`, `kpi.DrumHP.K_Ar`, `kpi.DrumHP.K_H2`, `kpi.DrumHP.K_N2`, `kpi.DrumHP.K_NH3`, `kpi.DrumHP.T`, `kpi.DrumHP.V_over_F`, `kpi.DrumLP.F_alpha`, `kpi.DrumLP.F_beta`, `kpi.DrumLP.K_Ar`, `kpi.DrumLP.K_H2`, `kpi.DrumLP.K_N2`, `kpi.DrumLP.K_NH3`, `kpi.DrumLP.T`, `kpi.DrumLP.V_over_F`, `kpi.ValveHP.Q_out`, `kpi.ValveHP.T_out`, `kpi.ValveHP.dT`, `kpi.ValveHP.rho_L_out`, `kpi.ValveHP.rho_V_out`, `kpi.ValveHP.rho_out`, `kpi.ValveHP.vf`, `kpi.ValveHP.volumeRatio`, `kpi.ValveHP.x_mass_out`, `kpi.ValveLP.Q_in`, `kpi.ValveLP.Q_out`, `kpi.ValveLP.T_in`, `kpi.ValveLP.T_out`, `kpi.ValveLP.dT`, `kpi.ValveLP.rho_V_out`, `kpi.ValveLP.rho_in`, `kpi.ValveLP.rho_out`, `kpi.ValveLP.vf`, `kpi.ValveLP.volumeRatio`, `kpi.ValveLP.x_mass_out`, `stream.FlashGas.F`, `stream.FlashGas.T`, `stream.LetdownGas.F`, `stream.LetdownGas.T`, `stream.LetdownLiquid.T`, `stream.ProductNH3.F`, `stream.ProductNH3.T`, `stream.ThrottledHP.T`, `stream.ThrottledLP.T`

### K3 (92 rows): the product separator / storage flash and the chiller: their inlet liquid and the let-down heat enter their duty, and the refrigeration / steam utility that serves them

- **ammonia01_synthesis_loop** (5): `kpi.separator.Q`, `kpi.separator.Q_kW`, `utility.separator.cooling.refrigerationNH3.duty_kW`, `utility.separator.cooling.refrigerationNH3.eur_h`, `utility.separator.cooling.refrigerationNH3.kg_s`
- **ammonia02_full_plant** (5): `kpi.separator.Q`, `kpi.separator.Q_kW`, `utility.separator.cooling.refrigerationNH3.duty_kW`, `utility.separator.cooling.refrigerationNH3.eur_h`, `utility.separator.cooling.refrigerationNH3.kg_s`
- **ammonia03_quench_converter** (5): `kpi.separator.Q`, `kpi.separator.Q_kW`, `utility.separator.cooling.refrigerationNH3.duty_kW`, `utility.separator.cooling.refrigerationNH3.eur_h`, `utility.separator.cooling.refrigerationNH3.kg_s`
- **ammoniaReactor01_fixedConversion** (5): `kpi.separator.Q`, `kpi.separator.Q_kW`, `utility.separator.cooling.refrigerationNH3.duty_kW`, `utility.separator.cooling.refrigerationNH3.eur_h`, `utility.separator.cooling.refrigerationNH3.kg_s`
- **ammoniaReactor02_equilibrium** (5): `kpi.separator.Q`, `kpi.separator.Q_kW`, `utility.separator.cooling.refrigerationNH3.duty_kW`, `utility.separator.cooling.refrigerationNH3.eur_h`, `utility.separator.cooling.refrigerationNH3.kg_s`
- **ammoniaReactor03_equilibriumApproach** (5): `kpi.separator.Q`, `kpi.separator.Q_kW`, `utility.separator.cooling.refrigerationNH3.duty_kW`, `utility.separator.cooling.refrigerationNH3.eur_h`, `utility.separator.cooling.refrigerationNH3.kg_s`
- **ammoniaReactor04_kineticSizing** (5): `kpi.separator.Q`, `kpi.separator.Q_kW`, `utility.separator.cooling.refrigerationNH3.duty_kW`, `utility.separator.cooling.refrigerationNH3.eur_h`, `utility.separator.cooling.refrigerationNH3.kg_s`
- **economics03_startup_years** (5): `kpi.separator.Q`, `kpi.separator.Q_kW`, `utility.separator.cooling.refrigerationNH3.duty_kW`, `utility.separator.cooling.refrigerationNH3.eur_h`, `utility.separator.cooling.refrigerationNH3.kg_s`
- **greenAmmonia02_feasibility150bar** (13): `kpi.Chiller.Q`, `kpi.Chiller.Q_kW`, `kpi.Chiller.Q_sensible_kW`, `kpi.Separator.Q`, `kpi.Separator.Q_kW`, `kpi.StorageFlash.Q`, `kpi.StorageFlash.Q_kW`, `utility.Chiller.cooling.refrigerationNH3.duty_kW`, `utility.Chiller.cooling.refrigerationNH3.eur_h`, `utility.Chiller.cooling.refrigerationNH3.kg_s`, `utility.Separator.heating.steamLP.duty_kW`, `utility.Separator.heating.steamLP.eur_h`, `utility.Separator.heating.steamLP.kg_s`
- **greenAmmonia02_feasibility50bar** (13): `kpi.Chiller.Q`, `kpi.Chiller.Q_kW`, `kpi.Chiller.Q_sensible_kW`, `kpi.Separator.Q`, `kpi.Separator.Q_kW`, `kpi.StorageFlash.Q`, `kpi.StorageFlash.Q_kW`, `utility.Chiller.cooling.refrigerationNH3.duty_kW`, `utility.Chiller.cooling.refrigerationNH3.eur_h`, `utility.Chiller.cooling.refrigerationNH3.kg_s`, `utility.Separator.heating.steamLP.duty_kW`, `utility.Separator.heating.steamLP.eur_h`, `utility.Separator.heating.steamLP.kg_s`
- **greenAmmonia03_basicDesign** (13): `kpi.Chiller.Q`, `kpi.Chiller.Q_kW`, `kpi.Chiller.Q_sensible_kW`, `kpi.Separator.Q`, `kpi.Separator.Q_kW`, `kpi.StorageFlash.Q`, `kpi.StorageFlash.Q_kW`, `utility.Chiller.cooling.refrigerationNH3.duty_kW`, `utility.Chiller.cooling.refrigerationNH3.eur_h`, `utility.Chiller.cooling.refrigerationNH3.kg_s`, `utility.Separator.heating.steamLP.duty_kW`, `utility.Separator.heating.steamLP.eur_h`, `utility.Separator.heating.steamLP.kg_s`
- **greenAmmoniaPEQ_baseCase** (13): `kpi.Chiller.Q`, `kpi.Chiller.Q_kW`, `kpi.Chiller.Q_sensible_kW`, `kpi.Separator.Q`, `kpi.Separator.Q_kW`, `kpi.StorageFlash.Q`, `kpi.StorageFlash.Q_kW`, `utility.Chiller.cooling.refrigerationNH3.duty_kW`, `utility.Chiller.cooling.refrigerationNH3.eur_h`, `utility.Chiller.cooling.refrigerationNH3.kg_s`, `utility.Separator.heating.steamLP.duty_kW`, `utility.Separator.heating.steamLP.eur_h`, `utility.Separator.heating.steamLP.kg_s`

### K4 (194 rows): the loop and the plant boundary: the changed duties feed the tear and the heat exchangers' duties, sizes and the cooling-water use (water cooler, chiller, boundary Q, pinch, layout)

- **ammonia01_synthesis_loop** (1): `boundary.global.Q_boundary_kW`
- **ammonia02_full_plant** (10): `boundary.global.Q_boundary_kW`, `kpi.pinch.Q_C_min_kW`, `kpi.pinch.Q_cold_total_kW`, `kpi.pinch.Q_cool_current_kW`, `kpi.pinch.Q_heat_current_kW`, `kpi.pinch.Q_hot_total_kW`, `kpi.pinch.Q_recovery_max_kW`, `kpi.pinch.candidates_admissible`, `kpi.pinch.candidates_total`, `kpi.pinch.violation_heat_below_pinch_kW`
- **ammonia03_quench_converter** (1): `boundary.global.Q_boundary_kW`
- **ammoniaReactor01_fixedConversion** (1): `boundary.global.Q_boundary_kW`
- **ammoniaReactor02_equilibrium** (1): `boundary.global.Q_boundary_kW`
- **ammoniaReactor03_equilibriumApproach** (1): `boundary.global.Q_boundary_kW`
- **ammoniaReactor04_kineticSizing** (1): `boundary.global.Q_boundary_kW`
- **column13_sour_water_stage_identity** (2): `boundary.global.Q_boundary_kW`, `kpi.restage.H_residual`
- **column14_klemola_c4_splitter** (1): `boundary.global.Q_boundary_kW`
- **economics03_startup_years** (1): `boundary.global.Q_boundary_kW`
- **greenAmmonia02_feasibility150bar** (26): `equipment.Chiller.cost.bareModule`, `equipment.Chiller.cost.purchased`, `equipment.Chiller.cost.totalModule`, `equipment.Chiller.values.A`, `equipment.Chiller.values.Q_kW`, `equipment.Chiller.values.weight`, `equipment.WaterCooler.cost.bareModule`, `equipment.WaterCooler.cost.purchased`, `equipment.WaterCooler.cost.totalModule`, `equipment.WaterCooler.values.A`, `equipment.WaterCooler.values.Q_kW`, `equipment.WaterCooler.values.weight`, `kpi.WaterCooler.Q`, `kpi.WaterCooler.Q_kW`, `kpi.WaterCooler.Q_sensible_kW`, `kpi.pinch.Q_cold_total_kW`, `kpi.pinch.Q_cool_current_kW`, `kpi.pinch.Q_heat_current_kW`, `kpi.pinch.Q_hot_total_kW`, `kpi.pinch.Q_recovery_max_kW`, `kpi.pinch.candidates_admissible`, `kpi.pinch.candidates_total`, `kpi.pinch.violation_heat_below_pinch_kW`, `utility.WaterCooler.cooling.coolingWater.duty_kW`, `utility.WaterCooler.cooling.coolingWater.eur_h`, `utility.WaterCooler.cooling.coolingWater.kg_s`
- **greenAmmonia02_feasibility50bar** (8): `equipment.Chiller.cost.bareModule`, `equipment.Chiller.cost.purchased`, `equipment.Chiller.cost.totalModule`, `equipment.Chiller.values.A`, `equipment.Chiller.values.Q_kW`, `equipment.Chiller.values.weight`, `kpi.pinch.candidates_admissible`, `kpi.pinch.candidates_total`
- **greenAmmonia03_basicDesign** (61): `equipment.Chiller.basis`, `equipment.Chiller.cost.bareModule`, `equipment.Chiller.cost.purchased`, `equipment.Chiller.cost.totalModule`, `equipment.Chiller.values.A`, `equipment.Chiller.values.A_required`, `equipment.Chiller.values.Nu_tube`, `equipment.Chiller.values.Q_kW`, `equipment.Chiller.values.R_film_tube`, `equipment.Chiller.values.Re_tube`, `equipment.Chiller.values.U`, `equipment.Chiller.values.U_clean`, `equipment.Chiller.values.baffleSpacing`, `equipment.Chiller.values.dP_tube`, `equipment.Chiller.values.h_tube`, `equipment.Chiller.values.mdot_shell`, `equipment.Chiller.values.mdot_utility`, `equipment.Chiller.values.nTubes`, `equipment.Chiller.values.overdesign`, `equipment.Chiller.values.shellID`, `equipment.Chiller.values.tubesPerPass`, `equipment.Chiller.values.u_tube`, `equipment.Chiller.values.weight`, `equipment.WaterCooler.basis`, `equipment.WaterCooler.cost.bareModule`, `equipment.WaterCooler.cost.purchased`, `equipment.WaterCooler.cost.totalModule`, `equipment.WaterCooler.values.A`, `equipment.WaterCooler.values.A_required`, `equipment.WaterCooler.values.Nu_tube`, `equipment.WaterCooler.values.Q_kW`, `equipment.WaterCooler.values.R_film_tube`, `equipment.WaterCooler.values.Re_tube`, `equipment.WaterCooler.values.U`, `equipment.WaterCooler.values.U_clean`, `equipment.WaterCooler.values.baffleSpacing`, `equipment.WaterCooler.values.dP_shell`, `equipment.WaterCooler.values.dP_tube`, `equipment.WaterCooler.values.h_tube`, `equipment.WaterCooler.values.mdot_shell`, `equipment.WaterCooler.values.mdot_utility`, `equipment.WaterCooler.values.nTubes`, `equipment.WaterCooler.values.overdesign`, `equipment.WaterCooler.values.shellID`, `equipment.WaterCooler.values.tubesPerPass`, `equipment.WaterCooler.values.u_tube`, `equipment.WaterCooler.values.weight`, `kpi.WaterCooler.Q`, `kpi.WaterCooler.Q_kW`, `kpi.WaterCooler.Q_sensible_kW`, `kpi.pinch.Q_cold_total_kW`, `kpi.pinch.Q_cool_current_kW`, `kpi.pinch.Q_heat_current_kW`, `kpi.pinch.Q_hot_total_kW`, `kpi.pinch.Q_recovery_max_kW`, `kpi.pinch.candidates_admissible`, `kpi.pinch.candidates_total`, `kpi.pinch.violation_heat_below_pinch_kW`, `utility.WaterCooler.cooling.coolingWater.duty_kW`, `utility.WaterCooler.cooling.coolingWater.eur_h`, `utility.WaterCooler.cooling.coolingWater.kg_s`
- **greenAmmoniaPEQ_baseCase** (77): `equipment.Chiller.basis`, `equipment.Chiller.cost.bareModule`, `equipment.Chiller.cost.purchased`, `equipment.Chiller.cost.totalModule`, `equipment.Chiller.values.A`, `equipment.Chiller.values.A_required`, `equipment.Chiller.values.Nu_tube`, `equipment.Chiller.values.Q_kW`, `equipment.Chiller.values.R_film_tube`, `equipment.Chiller.values.Re_tube`, `equipment.Chiller.values.U`, `equipment.Chiller.values.U_clean`, `equipment.Chiller.values.baffleSpacing`, `equipment.Chiller.values.dP_tube`, `equipment.Chiller.values.h_tube`, `equipment.Chiller.values.mdot_shell`, `equipment.Chiller.values.mdot_utility`, `equipment.Chiller.values.nTubes`, `equipment.Chiller.values.overdesign`, `equipment.Chiller.values.shellID`, `equipment.Chiller.values.tubesPerPass`, `equipment.Chiller.values.u_tube`, `equipment.Chiller.values.weight`, `equipment.WaterCooler.basis`, `equipment.WaterCooler.cost.bareModule`, `equipment.WaterCooler.cost.purchased`, `equipment.WaterCooler.cost.totalModule`, `equipment.WaterCooler.values.A`, `equipment.WaterCooler.values.A_required`, `equipment.WaterCooler.values.Nu_shell`, `equipment.WaterCooler.values.Nu_tube`, `equipment.WaterCooler.values.Q_kW`, `equipment.WaterCooler.values.R_film_shell`, `equipment.WaterCooler.values.R_film_tube`, `equipment.WaterCooler.values.Re_shell`, `equipment.WaterCooler.values.Re_tube`, `equipment.WaterCooler.values.U`, `equipment.WaterCooler.values.U_clean`, `equipment.WaterCooler.values.baffleSpacing`, `equipment.WaterCooler.values.dP_tube`, `equipment.WaterCooler.values.h_shell`, `equipment.WaterCooler.values.h_tube`, `equipment.WaterCooler.values.mdot_shell`, `equipment.WaterCooler.values.mdot_utility`, `equipment.WaterCooler.values.nTubes`, `equipment.WaterCooler.values.overdesign`, `equipment.WaterCooler.values.shellID`, `equipment.WaterCooler.values.tubesPerPass`, `equipment.WaterCooler.values.u_shell`, `equipment.WaterCooler.values.u_tube`, `equipment.WaterCooler.values.weight`, `kpi.WaterCooler.Q`, `kpi.WaterCooler.Q_kW`, `kpi.WaterCooler.Q_sensible_kW`, `kpi.pinch.Q_cold_total_kW`, `kpi.pinch.Q_cool_current_kW`, `kpi.pinch.Q_heat_current_kW`, `kpi.pinch.Q_hot_total_kW`, `kpi.pinch.Q_recovery_max_kW`, `kpi.pinch.candidates_admissible`, `kpi.pinch.candidates_total`, `kpi.pinch.violation_heat_below_pinch_kW`, `layout.Chiller.dy`, `layout.Chiller.dz`, `layout.WaterCooler.dy`, `layout.WaterCooler.dz`, `layout.access`, `layout.pipe`, `layout.utility`, `utility.WaterCooler.cooling.coolingWater.duty_kW`, `utility.WaterCooler.cooling.coolingWater.eur_h`, `utility.WaterCooler.cooling.coolingWater.kg_s`
- **stripper01_sour_water** (1): `boundary.global.Q_boundary_kW`
- **stripper02_sour_water_h2s** (1): `boundary.global.Q_boundary_kW`

### K5 (11 rows): the datum offset: every liquid above its own psat carries v (1 - alpha T) (P - psat), +1.6 J/mol for water at 1 bar, in the plant boundary enthalpies

- **absorber01_NH3_water** (1): `boundary.global.residual_kW`
- **ammonia01_synthesis_loop** (1): `boundary.global.H_products_kW`
- **ammoniaReactor01_fixedConversion** (1): `boundary.global.H_products_kW`
- **ammoniaReactor02_equilibrium** (1): `boundary.global.H_products_kW`
- **ammoniaReactor03_equilibriumApproach** (1): `boundary.global.H_products_kW`
- **ammoniaReactor04_kineticSizing** (1): `boundary.global.H_products_kW`
- **greenAmmonia03_basicDesign** (1): `boundary.global.residual_denom_kW`
- **greenAmmoniaPEQ_baseCase** (1): `boundary.global.residual_denom_kW`
- **letdown01_ammonia_flashing** (2): `boundary.global.H_feeds_kW`, `boundary.global.H_products_kW`
- **stripper01_NH3_water** (1): `boundary.global.residual_kW`

### K6 (50 rows): the economics that price those duties and equipment (utility cost, purchased and total module cost, NPV, IRR, payback, break-evens, sensitivities)

- **ammonia02_full_plant** (6): `kpi.economics.COM_d`, `kpi.economics.C_UT`, `kpi.economics.IRR`, `kpi.economics.NPV`, `kpi.economics.grossMargin_RM_UT`, `kpi.economics.paybackYears`
- **economics03_startup_years** (27): `kpi.economics.COM_d`, `kpi.economics.C_UT`, `kpi.economics.IRR`, `kpi.economics.NPV`, `kpi.economics.equity_IRR`, `kpi.economics.equity_NPV`, `kpi.economics.equity_paybackYears`, `kpi.economics.grossMargin_RM_UT`, `kpi.economics.paybackYears`, `kpi.economics.sens_financing_debtFraction_IRR_high`, `kpi.economics.sens_financing_debtFraction_IRR_low`, `kpi.economics.sens_financing_debtFraction_NPV_high`, `kpi.economics.sens_financing_debtFraction_NPV_low`, `kpi.economics.sens_financing_debtFraction_equityNPV_high`, `kpi.economics.sens_financing_debtFraction_equityNPV_low`, `kpi.economics.sens_financing_debtFraction_payback_high`, `kpi.economics.sens_financing_debtFraction_payback_low`, `kpi.economics.sens_financing_rate_IRR_high`, `kpi.economics.sens_financing_rate_IRR_low`, `kpi.economics.sens_financing_rate_NPV_high`, `kpi.economics.sens_financing_rate_NPV_low`, `kpi.economics.sens_financing_rate_equityNPV_high`, `kpi.economics.sens_financing_rate_equityNPV_low`, `kpi.economics.sens_financing_rate_payback_high`, `kpi.economics.sens_financing_rate_payback_low`, `kpi.economics.taxCreditOnLoss`, `kpi.economics.taxCreditOnLoss_NPV`
- **greenAmmonia02_feasibility150bar** (6): `kpi.economics.C_UT`, `kpi.economics.FCI`, `kpi.economics.TCI`, `kpi.economics.WC_fractionRule`, `kpi.economics.sens_FCI_value_high`, `kpi.economics.sens_FCI_value_low`
- **greenAmmonia02_feasibility50bar** (1): `kpi.economics.C_UT`
- **greenAmmonia03_basicDesign** (4): `kpi.economics.C_UT`, `kpi.economics.FCI`, `kpi.economics.TCI`, `kpi.economics.WC_fractionRule`
- **greenAmmoniaPEQ_baseCase** (6): `kpi.economics.C_UT`, `kpi.economics.FCI`, `kpi.economics.TCI`, `kpi.economics.WC_fractionRule`, `kpi.economics.breakEven_operating_fixed`, `kpi.economics.breakEven_price_H2Feed`

### K7 (27 rows): columns and strippers at pressure: the compressed feed / reflux liquid carries the term, so the reboiler and condenser duties (and their utilities) and the minor key move in the fourth digit

- **column13_sour_water_stage_identity** (4): `kpi.tower.Q_reboiler_kW`, `utility.tower.heating.steamLP.duty_kW`, `utility.tower.heating.steamLP.eur_h`, `utility.tower.heating.steamLP.kg_s`
- **column14_klemola_c4_splitter** (15): `kpi.splitter.L_rect`, `kpi.splitter.L_strip`, `kpi.splitter.Q_condenser_kW`, `kpi.splitter.Q_reboiler_kW`, `kpi.splitter.Q_reboiler_ownEnvelope_kW`, `kpi.splitter.R_internal`, `kpi.splitter.V_rect`, `kpi.splitter.V_strip`, `stream.distillate.nButane`, `utility.splitter.cooling.coolingWater.duty_kW`, `utility.splitter.cooling.coolingWater.eur_h`, `utility.splitter.cooling.coolingWater.kg_s`, `utility.splitter.heating.steamLP.duty_kW`, `utility.splitter.heating.steamLP.eur_h`, `utility.splitter.heating.steamLP.kg_s`
- **stripper01_sour_water** (4): `kpi.tower.Q_reboiler_kW`, `utility.tower.heating.steamLP.duty_kW`, `utility.tower.heating.steamLP.eur_h`, `utility.tower.heating.steamLP.kg_s`
- **stripper02_sour_water_h2s** (4): `kpi.tower.Q_reboiler_kW`, `utility.tower.heating.steamLP.duty_kW`, `utility.tower.heating.steamLP.eur_h`, `utility.tower.heating.steamLP.kg_s`


## The three steps behind the rows (architect's order 2026-11-19)

1. **Pins.**  A reference equation (`parameters/Helmholtz/`) is CONSUMED when its `fluid`
   is one of the case's components (by name or alias): `PinCheck.cpp consumed()`,
   `noteLoadedAlias`.  The directory has NO set line (a set line would have put one line
   into every manifest that scans it), so a new equation for another fluid touches no
   manifest and a new one for one of the case's fluids is a consumed, unpinned record, a
   drift said by name.  The Gao2023 lines added to the flash01, pump01, pump02 and
   liquidDensity01/02 manifests were REVERTED (those cases consume no ammonia equation);
   `check_pins_fresh`, `check_case_records` and `check_shadow_identity` pass with flash01's
   manifest as it stands on main.  Only cases that consume the ammonia equation pin it
   (the re-pinned manifests of the ammonia family, whose other four Helmholtz pins are
   harmless extras: "not consumed" is not a drift).
2. **Speed**, measured by profiling letdown01 (`CHOUPO_C390_TIMING=1`, kept as a
   debugging aid): three findings.  (a) 244 of 280 leg evaluations were "unpriced" and
   cost 0.13 s of the 0.32 s: the central difference `v(T + 0.5 K)` crossed the
   saturation line next to the bubble point, the kernel refused ("pure NH3 is a
   VAPOUR") and the TERM WAS SILENTLY DROPPED there, an exception per call.  A real
   defect (it made the term vanish exactly where a flash lives), fixed with a BACKWARD
   second-order slope (T, T-dT, T-2dT are liquid whenever P > psat(T)); the term is now
   present at every liquid state above psat.  (b) a component with no saturation line or no
   liquid volume is classified once, for good.  (c) for a fluid with a reference
   equation (or a case's pure-fluid selection) the integral at fixed T IS the equation's
   own `h(T, P) - h(T, p_low)` and `s(T, P) - s(T, p_low)`: no finite difference of the
   volume, one saturation per T instead of three (the engine's psat below the equation's
   own line is carried by the slope there).  The remaining cost is one saturation solve per
   new T (1.4 ms for ammonia), and near the bubble point the 4 K Lagrange grid cannot be
   used (a node above the bubble temperature has no term), so a flash AT its bubble point
   pays it on every temperature the outlet search visits.  The interpolation error where
   the grid is used was measured: 8 K spacing 8e-4 J/mol, 4 K 4e-5 J/mol (the grid is 4 K).
   Wall-clock before (main) / after, one run each on a loaded machine, seconds:

   | case | before | after | ratio |
   |---|---|---|---|
   | letdown01_ammonia_flashing | 0.053 | 0.153 | 2.9 |
   | ammoniaReactor01_fixedConversion | 0.051 | 0.078 | 1.5 |
   | ammonia01_synthesis_loop | 0.057 | 0.088 | 1.5 |
   | absorber01_NH3_water | 0.043 | 0.226 | 5.3 |
   | ammonia03_quench_converter | 0.377 | 0.759 | 2.0 |
   | ammonia02_full_plant | 0.210 | 0.575 | 2.7 |
   | column14_klemola_c4_splitter | 19.79 | 19.70 | 1.0 |
   | pump01_water | 0.098 | 0.161 | 1.6 |

   (the first build of the term: letdown01 7-20x, greenAmmonia03 more than 80 minutes
   unfinished, then 7 min).  THE 1.3x TARGET IS NOT REACHED on the small cases: their
   runtime is 40-100 ms, of which a single saturation solve of the reference equation per
   new temperature is already a third; the floor is the saturation, not the leg.
   Candidate (not built): a ln(psat) interpolation inside the Helmholtz model.
3. **The `waterCooler` flag.**  `flashState::bisectIncreasing` stopped at a bracket of
   1e-10 relative (1e-8 K at 300 K), which on a 57 400 kW duty leaves ~1e-4 kW in the
   outlet enthalpy; it now stops at 1e-13 relative (3e-11 K, still 500 ulp), so
   `H_closure_gap_kW` is below the gate's 1e-4 kW threshold.  `check_energy_closure` passes
   on the 36 cases of the scope with nothing pinned.  The arithmetic of the search is
   otherwise unchanged (same midpoint, same rule); it is shared with the heater.

The pump goldens re-recorded in step 2 of the first commit were re-checked on the final
build (reference-equation route for water, backward slope): they still pass within 1e-4.
