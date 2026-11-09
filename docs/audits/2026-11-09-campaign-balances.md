# Campaign balances: every time-integrated shipped case (2026-11-09, DEV.md 4c C258)

Why: the owner opened `batch15_mesh_study` and the Global balances view read
mass closure 4.16E-2 and worst element closure 1.13E-1 (He).  The suite had
called it PASS: a golden pins what a run prints, and `check_mass_closure`
reads steady cases only.  This audit reads the closure of EVERY time-integrated
shipped case from the engine's own published result block.

How it was taken.  83 cases whose controlDict declares `application`
choupoBatch (56), choupoCtrl (21) or choupoSemiContinuous (6), each run from
this worktree's own binaries (`./choupoBatch`, `./choupoCtrl`,
`./choupoSemiContinuous`; never `runCase`); 3 carry a declared opt-out
marker (batch12, ignition01 eulersi and rk4: no answer to read).  "Before" is
the closure each golden PINS, which is exactly what the engine printed before
this slice (the goldens were recorded from it); "live" is the same key read
from the run of this tree after the fixes below.  `mass` is the worst of
`mass_closure_rel` / `closure_worst_rel` / `solute_closure_rel`, `element` is
`element_worst_closure_rel`; energy shows `(energy_closure_rel, claimed)`
with `None, 0` meaning the engine REFUSED the claim (nothing shown as closed).
Tolerance used by the new gate: 1e-3 for mass/element (the steady band is
0.5 %, built for recycle tears; a campaign has none, the engine itself calls
a campaign non-converged above 1e-6, and the worst honest shipped residual
is 1.4e-4), the steady energy gate's own BAND for energy.

Classes: A = a declared modelling assumption that creates matter (now a NAMED
STREAM); B = a ledger defect (matter leaves or enters with no record);
C = numerical or curation; E = an ENERGY claim that does not close.

## Findings

* Before: five cases showed a violated mass balance on screen, and all five
  were pinned by their golden: batch13 and batch15 (mass 4.16 %, He 11.3 %),
  batch19 (0.11 %, 0.31 %), dryer01 and dryer02 (21.6 % / 21.0 %, element 31 %).
  batch17 (1.4e-4) carried the same cause below any threshold.
* Class A (adsorbers, constant velocity): the declared closure fabricates
  carrier at the net uptake rate.  The engine announced it, but only in the
  log.  Now the carrier is booked as the named inlet `carrierMakeUp`.
  The fix lives in `FixedBedAdsorber::takeDatumAmendments`; the old
  `declaredMaterialResidual` discount is deleted for this unit.
* Class B (dryers): the unit's own header called the air "a declared
  environment, not a ledgered stream" and reported the evaporated water as a
  predicted "declared residual".  That is a ledger defect, not a model choice:
  the water physically leaves.  Now it is an external outlet stream of the
  campaign (`BatchDryer::takeContinuousDischarge`).
* Class E (energy, NOT mass): three adsorber cases CLAIM their energy balance
  and show a closure that is not closed: batch16 and batch24_blowdown_inert
  (closure 1.0 on 1e-4 kJ and 0.1 kJ of vessel enthalpy with Q = 0 and nothing
  leaving: an isothermal bed whose T is held by a wall duty nobody ledgers) and
  batch25_blowdown_thermal (0.079, cause not established here).  These need
  a physics decision (a wall-duty stream, heat being a stream) and are NAMED in
  the gate as ENERGY_OPEN, two-sided, so they cannot hide and cannot linger once
  fixed.  They are the only exemption the gate has.
* Class C: batch04 (1.8e-5), ignition01/02 (5.4e-6): total mass drifts while
  every element closes at 1e-13; catalogue MWs against the stoichiometry,
  the engine's own printed NOTE.  Far inside the tolerance.

## The table

| case | binary | pinned mass (before) | pinned worst element (before) | live mass / worst element (this tree) | live energy (closure, available) | class | what was done / why |
|---|---|---|---|---|---|---|---|
| adsorber/batch09_adsorber_co2 | Batch | 0.00e+00 | 0.00e+00 | 0.00e+00 / 0.00e+00 | (None, 0) | - |  |
| adsorber/batch10_adsorber_co2_n2 | Batch | 0.00e+00 | 0.00e+00 | 0.00e+00 / 0.00e+00 | (None, 0) | - |  |
| adsorber/batch11_adsorber_henry | Batch | 0.00e+00 | 0.00e+00 | 0.00e+00 / 0.00e+00 | (None, 0) | - |  |
| adsorber/batch12_adsorber_refused_P | Batch | - | - | opt-out |  | - |  |
| adsorber/batch13_breakthrough_co2 | Batch | 4.16e-02 | 1.13e-01 | 5.08e-14 / 8.86e-14 | (None, 0) | A | BOOKED as the named inlet stream `carrierMakeUp`; constant velocity kept (the lesson is the breakthrough front vs the closed-form t_st = (L/u) R_f, which assumes constant u) |
| adsorber/batch14_transport_only | Batch | 3.58e-15 | 5.88e-15 | 3.58e-15 / 5.88e-15 | (None, 0) | - |  |
| adsorber/batch15_mesh_study | Batch | 4.16e-02 | 1.13e-01 | 4.92e-15 / 8.73e-15 | (None, 0) | A | BOOKED as `carrierMakeUp`; constant velocity kept (the mesh study compares cell counts against the same closed-form front and the batch13 reference, all at constant u; switching to Ergun would change the physics being refined, not just the balance) |
| adsorber/batch16_ergun_profile | Batch | 0.00e+00 | 1.57e-15 | 1.23e-15 / 1.34e-15 | (1, 1) | E | OPEN (named in the gate: ENERGY_OPEN), needs a physics decision (a wall-duty stream) |
| adsorber/batch17_dilute_ergun_limit | Batch | 1.39e-04 | 1.39e-04 | 2.66e-13 / 5.33e-13 | (None, 0) | A | BOOKED as `carrierMakeUp`; the case IS the comparison of the two closures |
| adsorber/batch18_ergun_conservation | Batch | 2.36e-15 | 5.39e-15 | 1.96e-15 / 2.87e-15 | (6.84496930982e-08, 1) | - |  |
| adsorber/batch19_feed_switch_purge | Batch | 1.12e-03 | 3.07e-03 | 1.43e-14 / 2.52e-14 | (None, 0) | A | BOOKED as `carrierMakeUp`; constant velocity kept (concentration-swing witness anchored on constant u) |
| adsorber/batch20_thermal_breakthrough | Batch | 1.65e-15 | 2.16e-15 | 1.10e-15 / 2.10e-15 | (5.72667243624e-05, 1) | - |  |
| adsorber/batch21_tsa_hot_purge | Batch | 6.04e-16 | 2.48e-15 | 3.41e-15 / 5.54e-15 | (0.000161681511556, 1) | - |  |
| adsorber/batch22_wall_cooled | Batch | 5.50e-16 | 4.05e-15 | 2.02e-15 / 3.78e-15 | (0.000269160261219, 1) | - |  |
| adsorber/batch23_tsa_cycles | Batch | 5.99e-16 | 2.12e-15 | 2.14e-15 / 4.04e-15 | (0.000251144605702, 1) | - |  |
| adsorber/batch24_blowdown_inert | Batch | 5.71e-16 | 4.29e-16 | 5.71e-16 / 4.29e-16 | (1, 1) | E | OPEN (ENERGY_OPEN) |
| adsorber/batch24_tsa_until_css | Batch | 1.39e-16 | 1.70e-16 | 1.39e-16 / 4.81e-16 | (0.000241476620069, 1) | - |  |
| adsorber/batch25_blowdown_thermal | Batch | 4.27e-16 | 4.27e-16 | 2.85e-16 / 4.27e-16 | (0.0791469572456, 1) | E | OPEN (ENERGY_OPEN), cause UNVERIFIED |
| combustion/ignition01_h2o2 | Batch | 5.41e-06 | 8.47e-14 | 5.41e-06 / 1.30e-13 | (None, 0) | C/curation | none |
| combustion/ignition01_h2o2_eulersi | Batch | - | - | opt-out |  | - |  |
| combustion/ignition01_h2o2_rk4 | Batch | - | - | opt-out |  | - |  |
| combustion/ignition02_h2air_slack | Batch | 5.47e-06 | 3.44e-15 | 5.47e-06 / 2.06e-15 | (None, 0) | C/curation | none |
| combustion/nox01_zeldovich_postflame | Batch | 2.16e-10 | 3.28e-15 | 1.96e-10 / 1.12e-14 | (None, 0) | - |  |
| crystallisation/batch13_nacl_pitzer | Batch | 3.50e-16 | 9.09e-16 | 3.50e-16 / 9.09e-16 | (None, 0) | - |  |
| crystallisation/batch14_nacl_pitzer_antisolvent | Batch | 1.36e-16 | 6.05e-16 | 1.36e-16 / 6.05e-16 | (None, 0) | - |  |
| drying/dryer01_sucrose_tray | Batch | 2.16e-01 | 3.19e-01 | 0.00e+00 / 0.00e+00 | (None, 0) | B | evaporated water booked as an external OUTLET stream of the campaign (BatchDryer::takeContinuousDischarge) |
| drying/dryer02_characteristic_curves | Batch | 2.10e-01 | 3.10e-01 | 5.47e-15 / 8.25e-15 | (None, 0) | B | same fix |
| electrodialysis/edbatch01_constant_current | Batch | 1.40e-15 | 8.53e-14 | 1.40e-15 / 8.53e-14 | (None, 0) | - |  |
| electrodialysis/edbatch02_constant_voltage | Batch | 0.00e+00 | 3.04e-15 | 0.00e+00 / 3.04e-15 | (None, 0) | - |  |
| electrodialysis/edbatch03_multiionic_split | Batch | 0.00e+00 | 1.45e-15 | 0.00e+00 / 1.45e-15 | (None, 0) | - |  |
| membrane/diafilter01_nf_desalting | Batch | 0.00e+00 | 1.24e-16 | 1.10e-16 / 1.24e-16 | (None, 0) | - |  |
| membrane/diafilter02_fouling_decline | Batch | 3.70e-16 | 4.17e-16 | 3.70e-16 / 1.39e-16 | (None, 0) | - |  |
| membrane/diafilter03_dspmde_batch | Batch | 1.03e-12 | 1.03e-12 | 1.12e-12 / 1.12e-12 | (None, 0) | - |  |
| reactor/batch01_first_order | Batch | 4.52e-16 | 3.75e-16 | 4.52e-16 / 3.75e-16 | (0, 1) | - |  |
| reactor/batch01b_first_order_eulersi | Batch | 5.66e-16 | 4.50e-16 | 5.66e-16 / 4.50e-16 | (0, 1) | - |  |
| reactor/batch02_adiabatic | Batch | 2.26e-16 | 3.75e-16 | 2.26e-16 / 3.75e-16 | (None, 0) | - |  |
| reactor/batch03_consecutive | Batch | 5.55e-16 | - | 5.55e-16 / - | (None, 0) | - |  |
| reactor/batch04_reversible_wgs | Batch | 1.83e-05 | 1.95e-15 | 1.83e-05 / 1.95e-15 | (0, 1) | C/curation | none |
| reactor/batch04_transient_dirs | Batch | 2.26e-16 | 3.75e-16 | 2.26e-16 / 3.75e-16 | (None, 0) | - |  |
| reactor/batch05_crystalliser | Batch | 5.07e-15 | 6.82e-15 | 5.07e-15 / 6.82e-15 | (1.82948567578e-11, 1) | - |  |
| reactor/batch06_adaptive_runaway | Batch | 4.52e-16 | 3.75e-16 | 2.26e-16 / 3.00e-16 | (None, 0) | - |  |
| reactor/batch07_lhhw_methylAcetate | Batch | 1.82e-15 | 2.13e-15 | 1.30e-15 / 1.63e-15 | (0, 1) | - |  |
| reactor/batch08_isothermal_duty | Batch | 1.11e-15 | - | 1.11e-15 / - | (None, 0) | - |  |
| reactor/batch26_cooling_failure | Batch | 1.97e-15 | - | 1.97e-15 / - | (None, 0) | - |  |
| reactor/batch27_semibatch_dosing | Batch | 5.92e-16 | - | 5.92e-16 / - | (None, 0) | - |  |
| reactor/batch28_dosing_vessel_limit | Batch | 1.78e-15 | - | 1.78e-15 / - | (None, 0) | - |  |
| recipes/recipe01_react_then_distill | Batch | 2.26e-16 | 5.00e-16 | 0.00e+00 / 2.50e-16 | (4.96790834653e-11, 1) | - |  |
| recipes/recipe02_setpoint_ramp | Batch | 4.52e-16 | 3.75e-16 | 4.52e-16 / 3.75e-16 | (0, 1) | - |  |
| recipes/recipe03_conditional_partial | Batch | 0.00e+00 | 2.50e-16 | 2.26e-16 / 3.00e-16 | (1.24930712749e-15, 1) | - |  |
| recipes/recipe04_charge_enthalpy | Batch | 0.00e+00 | 0.00e+00 | 0.00e+00 / 0.00e+00 | (2.13028428746e-12, 1) | - |  |
| still/still01_benzene_toluene | Batch | 0.00e+00 | 2.67e-16 | 0.00e+00 / 2.67e-16 | (4.58362894565e-16, 1) | - |  |
| still/still02_ethanol_water_azeo | Batch | 8.31e-16 | 1.36e-15 | 8.31e-16 / 1.36e-15 | (1.13740334008e-16, 1) | - |  |
| still/still03_with_receiver | Batch | 0.00e+00 | 2.67e-16 | 0.00e+00 / 2.67e-16 | (3.00056993907e-11, 1) | - |  |
| still/still04_rectifier_benzene_toluene | Batch | 0.00e+00 | 0.00e+00 | 0.00e+00 / 0.00e+00 | (7.08707897844e-10, 1) | - |  |
| still/still05_rectifier_constant_xD | Batch | 0.00e+00 | 0.00e+00 | 0.00e+00 / 0.00e+00 | (8.89386285064e-10, 1) | - |  |
| still/still06_ledger_mixed_validity | Batch | 2.12e-16 | - | 2.12e-16 / - | (None, 0) | - |  |
| ctrl/ctrl01_cstr_temp_control | Ctrl | 1.77e-15 | - | 1.77e-15 / - | (None, 0) | - |  |
| ctrl/ctrl02_disturbance_rejection | Ctrl | 2.79e-14 | - | 2.79e-14 / - | (None, 0) | - |  |
| ctrl/ctrl03_adaptive_disturbance | Ctrl | 2.66e-14 | - | 2.93e-14 / - | (None, 0) | - |  |
| ctrl/ctrl05_disturbance_transient | Ctrl | 2.79e-14 | - | 2.79e-14 / - | (None, 0) | - |  |
| ctrl/ctrl06_sine_disturbance | Ctrl | 5.73e-14 | - | 5.73e-14 / - | (None, 0) | - |  |
| ctrl/ctrl07_lhhw_inhibition | Ctrl | 7.71e-16 | - | 7.71e-16 / - | (None, 0) | - |  |
| ctrl/ctrl08_prbs_ident | Ctrl | 6.74e-14 | - | 6.74e-14 / - | (None, 0) | - |  |
| ctrl/ctrl09_stream_disturbance | Ctrl | 2.06e-14 | - | 2.06e-14 / - | (None, 0) | - |  |
| ctrl/ctrl10_brine_concentration | Ctrl | 3.78e-16 | 7.17e-16 | 3.78e-16 / 7.17e-16 | (7.85289304221e-11, 1) | - |  |
| ctrl/ctrl11_esterification_jacket | Ctrl | 1.31e-14 | 1.33e-14 | 1.60e-14 / 1.61e-14 | (1.59809574171e-07, 1) | - |  |
| ctrl/ctrl12_williams_otto | Ctrl | 4.01e-10 | - | 4.01e-10 / - | (None, 0) | - |  |
| ctrl/ctrl13_williams_otto_step | Ctrl | 1.45e-09 | - | 1.45e-09 / - | (None, 0) | - |  |
| ctrl/ctrl14_williams_otto_pi | Ctrl | 2.05e-09 | - | 2.05e-09 / - | (None, 0) | - |  |
| ctrl/ctrl16_williams_otto_optimal | Ctrl | 1.14e-07 | - | 1.14e-07 / - | (None, 0) | - |  |
| ctrl/ctrl17_signal_shapes | Ctrl | 2.99e-14 | - | 2.99e-14 / - | (None, 0) | - |  |
| ctrl/ctrl17_step_reaction_curve | Ctrl | 9.92e-14 | - | 9.92e-14 / - | (None, 0) | - |  |
| ctrl/ctrl18_rtd_pulse_cstr | Ctrl | 4.74e-14 | - | 4.74e-14 / - | (None, 0) | - |  |
| ctrl/ctrl19_freq_response_cstr | Ctrl | 2.91e-15 | - | 2.91e-15 / - | (None, 0) | - |  |
| ctrl/ctrl20_bode_cstr | Ctrl | 5.86e-15 | - | 5.86e-15 / - | (None, 0) | - |  |
| ctrl/ctrl21_tank_level_control | Ctrl | 2.33e-14 | 2.33e-14 | 2.33e-14 / 2.33e-14 | (3.7609444182e-14, 1) | - |  |
| ctrl/ctrl22_reactor_level_and_temperature | Ctrl | 1.65e-14 | 1.66e-14 | 1.65e-14 / 1.66e-14 | (2.51445476769e-10, 1) | - |  |
| unsteady/unsteady01_startup_transient | SemiContinuous | 1.77e-14 | - | 1.77e-14 / - | (None, 0) | - |  |
| unsteady/unsteady02_tanks_in_series | SemiContinuous | 2.16e-16 | - | 2.16e-16 / - | (None, 0) | - |  |
| unsteady/unsteady03_nf_feed_and_bleed_startup | SemiContinuous | 7.67e-10 | 4.81e-08 | 7.67e-10 / 4.81e-08 | (None, 0) | - |  |
| unsteady/unsteady04_uf_feed_and_bleed_startup | SemiContinuous | 1.94e-10 | 1.28e-08 | 1.94e-10 / 1.28e-08 | (None, 0) | - |  |
| unsteady/unsteady05_tank_valve_drain | SemiContinuous | 6.62e-08 | 6.62e-08 | 6.62e-08 / 6.62e-08 | (6.61927451875e-08, 1) | - |  |
| unsteady/unsteady06_reactor_fill_and_react | SemiContinuous | 6.34e-15 | 6.34e-15 | 6.34e-15 / 6.34e-15 | (4.02406944735e-14, 1) | - |  |
