# C390 on the batch branch (integ/batch-1119b): the 20 failures, by cause

The fast tier of origin/integ/batch-1119b ran 68 PASS / 20 FAIL.  Each of the 20 is
classified below; cause (b) is a defect, found and fixed FIRST, and only then was any
case of cause (a) re-recorded.

## THE DEFECT (b): a pressure in pascal multiplied by 1e5 again

`still01_benzene_toluene` (a batch still at 1.013 bar) moved `energy_H_external_kJ`
38.75 -> 520.7 kJ and `E_reboiler_total_kJ` +30.33 -> -467.9 kJ.  At 1 atm a liquid near its
boiling point has P close to psat, so the term must be tiny: 520 kJ on 0.9 mol was 550 kJ/mol.

Cause: the batch vessel state's pressure is in PASCAL (the dictionary reader converts
`P 1.013 bar` to SI; `BatchState::P` was documented as "bar" and `BatchStill::P_op_`
likewise), and FIVE places that price a batch package multiplied it by 1e5 again: a liquid
at 1.0e10 Pa.  Nothing read the pressure of a liquid until the liquid enthalpy gained its
pressure term (C390) -- a vapour on an ideal gas is independent of P -- so the error was
silent for as long as the liquid had none.  Sites, all fixed:

- `BatchStill::phaseH_` (the pot, the condensate and the latent heat of the still's ledger);
- `BatchUnitOperation.cpp:181` (pricing a package at a recipe charge: recipe04's
  `cold.T_final` 317 -> 345 K came from here);
- `BatchReactor.cpp` (two sites: the vessel's enthalpy and the holdup pricing);
- `choupoBatch/main.cpp:952` (the campaign ledger's external boundary).

`BatchDiafilter` was the one producer that handed its package in BAR (`P_perm_ / 1e5`); it
now hands Pa like every other batch unit (diafilter01's `externalIntake.H_kJ` +1.15e6
instead of -8.68e5 kJ came from this).  `BatchState::P` and `BatchStill::P_op_` are
documented as Pa.  After the fix still01's reboiler is 30.328 kJ (golden 30.3295, -4e-5),
recipe04's `T_final` is the golden's and diafilter01 passes untouched.

## The 20

(Scope on the 19 cases + the bench gate: PASS after the recording below; mass, element,
campaign and energy closure held: `campaign_closure` and `energy_closure` PASS.)

| # | case | cause | rows moved after the fix, and the size check |
|---|---|---|---|
| 1 | batch13_nacl_pitzer | pin | none: the term prices water through its reference equation, so the run now consumes `IAPWS95` (a relevant record): pinned |
| 2 | diafilter01_nf_desalting | (b) | none after the fix (before it: `externalIntake.H_kJ` through the bar/Pa mismatch) |
| 3 | apalutamide01_tablets | pin + (a) | 15 rows, all <= 3e-4 relative (blender -0.028031 -> -0.028039 kW, exhaust cooler -1.93632 -> -1.93734 kW): acetone / water liquids at 1 atm carry the 1-3 J/mol datum offset |
| 4 | recipe04_charge_enthalpy | pin + (b) | 1 row, `energy_dH_vessels_kJ` 5.8e-10 -> 2.8e-14: a float zero (a balance residual of order 1e-10 kJ), no physics; the (b) rows (`cold.T_final`, `hot->cold H_kJ`) are back on the golden |
| 5 | still01_benzene_toluene | (b) + (a) | 2 rows: `energy_Q_ledger_kJ` 0.94278 -> 0.94222 (-6e-4) and `utility_steamLP_peak_kW` (-2e-4): the offset on 0.9 mol |
| 6 | ChemicalPlantTutorial | pin + (a) | 64 rows, every one <= 3e-4 relative: the plant's liquids at 1 atm to a few bar (evaporators, crystalliser, spray dryer) carry the datum offset; the rows are that propagated through 3 evaporation / drying duties and the crystal sizing |
| 7 | aceticAcid01_gibbsReactor | pin + (a) | 5 rows: reactor Q -4577.907 -> -4577.435 kW (1e-4): methanol liquid at 30 bar, 460 K, psat ~ 26 bar |
| 8 | esterification2sector | (a) | 5 rows: reactor Q -18.4161 -> -18.4308 kW (8e-4 of a small duty), the pinned open residual -682.080 -> -682.074 (3e-6 relative) |
| 9 | hda | pin | none |
| 10 | tartaricAcid | pin | none |
| 11 | extraction01_waterButanol | pin | none |
| 12 | crystalliser01_sugar | pin | none |
| 13 | evapDryer02_energy_limited | pin | none |
| 14 | economics01_esterification_dcf | (a) | 10 rows: reactor Q -98.384 -> -98.470 kW (9e-4), separator V/F 0.067294 -> 0.067301, revenue +1.0e-4: 1 atm liquids, ~0.6 J/mol on 139 mol/s |
| 15 | evaporator01_brine | pin | none |
| 16 | hx01_heater | pin + (a) | 1 row: `heater01.dT` 38.3387 -> 38.3513 K (3e-4): ethanol-water from 300 K at 1 atm, term 1.6-3.6 J/mol at the inlet, ~1.1 at the outlet |
| 17 | pipe01_water_line | pin | none |
| 18 | model5_nrtl_flash | pin | none |
| 19 | utility02_hitec_csp_heater | pin + (a) | 3 rows: `boilerOut.T` 517.401 -> 518.164 K (+0.763 K), LMTD, `T_cold_out`.  SIZE CHECK: water at 48 bar, 393.15 K carries v(1-aT)(P-psat) = 58.37 J/mol (the IAPWS-95 `h(T,P)-h(T,psat)`), the outlet at 517.4 K 1.00 J/mol; the 57.4 J/mol difference over a cp of ~75 J/mol/K is 0.76 K, the observed shift |
| 20 | property-route-bench-gate | (c) | 6 NH3 route blocks RELABELLED: the liquid-density door now resolves ammonia through the Gao2023 reference equation (`density.pureFluid.Helmholtz.Gao2023`, viscosity and surface tension likewise, and `NH3+N2` density) instead of the record's Rackett route; re-recorded with `check_property_route_bench.py --record` for that reason |

Pins: 14 manifests gained the `IAPWS95` line (batch13, apalutamide01, recipe04, aceticAcid01,
hda, tartaricAcid, extraction01, crystalliser01, evapDryer02, evaporator01, hx01, pipe01,
model5, utility02): these cases price liquid water, and with the term the run reads water's
reference equation (the density door's own rule: a record that names the fluid).

NOT covered here: the three `--gui` failures (gui-tests, check_intro_trace,
check_pinch) of the same batch were not examined in this round.
