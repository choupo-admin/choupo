# C201 item 1 -- moved golden rows (NOT re-recorded)

Branch commit a9d82ffe7 (+ the follow-up that carries this file).  37 acetic-acid cases run with `bin/runTests`: 3 PASS, 34 FAIL, 455 value rows moved (plus the cooling-utility rows that vanish).  No golden was re-recorded.  Every row below traces to the one change -- the liquid acetic acid is bridged to the datum's ideal-gas monomer through the DERIVED heat (calorimetric 28.2 + dimer dissociation 25.9 = 54.1 kJ/mol at 298.15 K) -- but NOT every row traces to the two reasons first expected (the removed dimer heat of a liquid reaction; the reactive-flash double count).  The rows of the third kind are listed first.

## Group 1 -- NOT one of the two expected reasons: acetic-acid vaporisation priced to the ideal-gas MONOMER in units whose vapour carries no dimer

Rows: 182 (0 of them cooling-utility rows that vanish because Q turned slightly positive).  Cases: 14.  Largest finite relative move: `column05_reactive_methylacetate` `boundary.global.Q_boundary_kW` -0.163206 -> 0.049171678048 (1.3 x; ratios above 1e6 are a value that was ~0 before).

Reason: `Component::datumBridge298` now makes the liquid-to-vapour heat of acetic acid 54.1 kJ/mol (to the datum's ideal-gas monomer) instead of the calorimetric 28.2.  Any unit that vaporises or condenses acetic acid against a vapour model WITHOUT a dimer (the flash separators of the process/economics/optim chains, the aceticAcid02 columns, condenser and letdown valve, the methyl-acetate reactive column, the esterification2sector separation flash) now charges the monomer-basis heat.  The sign is right for the datum and, for a real dimerised vapour, too large: this is the "vaporisation duties rise" half of docs/design/one-record-two-vapours-acetic-acid.md section 4.1, predicted there and measured here.  It is NOT the removed dimer heat of a liquid reaction and NOT the reactive-flash double count; it is the price of bridging to the datum's own vapour while most vapour models in the corpus have no dimer.  Making association a property of the vapour model (section 5, piece 2 of that record) would reverse it.  Largest moves: aceticAcid02_plant lightsColumn condenser -36.5 -> -75.1 kW (+106 %), plant condenser -308.7 -> -457.1 kW (+48 %), letdown vf 0.165 -> 0.086, column05 reboiler 0.640 -> 0.852 kW (+33 %).

Cases (rows): aceticAcid02_plant (43), column05_reactive_methylacetate (15), economics01_esterification_dcf (21), economics02_irr_sweep (21), esterification2sector (10), optim02_process_cost (15), optim05_reactor_npv (17), process01_reactor_flash (5), process02_reactor_hx_flash (9), process02_with_design (9), process03_recycle (5), recipe01_react_then_distill (4), recipe02_setpoint_ramp (3), recycle_autoinit_tear (5)

## Group 2 -- the removed ~24 kJ/mol dimer heat in the LIQUID acetic-acid enthalpy (liquid-phase esterification heat and everything priced on it)

Rows: 231 (62 of them cooling-utility rows that vanish because Q turned slightly positive).  Cases: 27.  Largest finite relative move: `batch02_adiabatic` `kpi.reactor.n_aceticAcid_final` 9.87885e-31 -> 0.00737809491987 (7.47e+27 x; ratios above 1e6 are a value that was ~0 before).

Reason: The feed and reactor liquids of every esterification case carry acetic acid 23.9 kJ/mol lower (-460.4 -> -486.3), so the liquid reaction heat goes from -25.7 to +0.18 kJ/mol at 350 K: reactor Q_kW, dHrxn, the cooling-water utility rows (they VANISH when Q turns slightly positive), H_feeds (-100.85 -> -104.45 kW on the 0.139 mol/s acid feed = the 3.6 kW of removed dimer heat), the adiabatic/jacketed temperature rises (cstr04 +104 -> -0.39 K, pfr04 +104.5 -> -0.49 K, cstr06 +44.3 -> -13.0 K, cstr05 multiplicity gone), the batch campaign ledgers and utility timings, the runaway of batch02/04/06 (T 320 -> 428 K becomes 320 -> 320.1 K, n_acid_final 1e-31 -> 7e-3 mol), ctrl11's jacket trajectory, and the economics/NPV rows that price the cooling water.

Cases (rows): batch01_first_order (10), batch01b_first_order_eulersi (10), batch02_adiabatic (5), batch04_transient_dirs (5), batch06_adaptive_runaway (5), batch07_lhhw_methylAcetate (9), cstr01_first_order (8), cstr04_adiabatic (6), cstr05_multiplicity (7), cstr06_jacketed (12), cstr07_lhhw_methylAcetate (8), ctrl11_esterification_jacket (12), economics01_esterification_dcf (8), economics02_irr_sweep (5), esterification2sector (4), optim02_process_cost (5), optim05_reactor_npv (5), pfr01_first_order (9), pfr04_adiabatic (8), process01_reactor_flash (8), process02_reactor_hx_flash (8), process02_with_design (8), process03_recycle (8), recipe01_react_then_distill (16), recipe02_setpoint_ramp (12), recipe03_conditional_partial (22), recycle_autoinit_tear (8)

## Group 3 -- detailed-balance rate constants and extents that follow the liquid Gibbs energy of acetic acid

Rows: 6 (0 of them cooling-utility rows that vanish because Q turned slightly positive).  Cases: 3.  Largest finite relative move: `cstr05_multiplicity` `kpi.reactor.k_esterification_etac` 0.406108 -> 1.16475156872e-05 (1 x; ratios above 1e6 are a value that was ~0 before).

Reason: `k_esterification_etac` is the reverse constant derived by detailed balance from the liquid Gibbs energy; it moves with the new g_formation of acetic acid (the entropy leg now uses the monomer partial pressure) and with the temperature the adiabatic/jacketed CSTRs now settle at.

Cases (rows): cstr04_adiabatic (2), cstr05_multiplicity (2), cstr06_jacketed (2)

## Group 4 -- the vapour double count in the reactive flashes (association heat priced twice)

Rows: 20 (0 of them cooling-utility rows that vanish because Q turned slightly positive).  Cases: 4.  Largest finite relative move: `flash13_acetic_ethanol_vacuum_flash` `utility.flash01.heating.steamLP.eur_h` 28.7632 -> 28.9283137232 (0.00574 x; ratios above 1e6 are a value that was ~0 before).

Reason: flash10/12/13/17 are reactive flashes that price the dimer's association heat INTO the duty on top of a liquid derived from the apparent (already associated) HvapTb -- the "latent double count" of section 6 of docs/design/one-record-two-vapours-acetic-acid.md.  With the liquid bridged to the monomer datum the association heat is counted once.  flash13 Q 665.82 -> 669.64 kW (+0.57 %), flash10/12 H_feeds +0.4 %/+0.18 %, flash17 +0.014 %.

Cases (rows): flash10_acetic_water_reactive (2), flash12_nh3_acetic_ethanol_reactive (2), flash13_acetic_ethanol_vacuum_flash (8), flash17_two_liquids_reactive (8)

## Group 5 -- Gibbs reactor and the aceticAcid02 reactor side (same liquid-acid enthalpy shift)

Rows: 16 (0 of them cooling-utility rows that vanish because Q turned slightly positive).  Cases: 2.  Largest finite relative move: `aceticAcid02_plant` `boundary.global.Q_boundary_kW` -3019.62 -> -3733.48808272 (0.236 x; ratios above 1e6 are a value that was ~0 before).

Reason: aceticAcid01 (Gibbs reactor, reactor duty -3927 -> -4630 kW) and the reactor/boundary side of aceticAcid02_plant (-3819 -> -4389 kW) read the liquid acid leaving the reactor on the same shifted enthalpy surface.

Cases (rows): aceticAcid01_gibbsReactor (6), aceticAcid02_plant (10)

## Passing unchanged

compare_kinetics_order, rate01_arrhenius_recovery, flash11_acetic_T_sweep: they price no acetic-acid enthalpy a golden pins.

## Gate pins moved in the same commit

`check_energy_closure` KNOWN_OPEN esterification2sector 170.979 -> 325.522 %: the residual is one model-boundary step (-808.0 -> -869.1 kW) and the percentage grew because the reactor duty in the denominator collapsed (group 2).

## Stale prose found and fixed / listed

Rows are assigned to groups by their key and case (a mechanical classification, not a per-row proof); the group reasons were checked against the largest moves of each.

FIXED (READMEs that quoted the old heat): cstr01_first_order, pfr01_first_order, batch01_first_order, process01_reactor_flash, aceticAcid01_gibbsReactor.

LISTED, NOT TOUCHED (the teaching point IS the exotherm; redesign is the coordinator's call): batch02_adiabatic, batch04_transient_dirs, batch06_adaptive_runaway (thermal runaway 320 -> 428 K; now 320 -> 320.1 K), cstr04_adiabatic (+104 K rise; now -0.39 K), cstr05_multiplicity (three steady states; now one, T_out 300.0 K), cstr06_jacketed (cooling jacket; now T_out 337 K, below the 350 K feed), pfr04_adiabatic (self-heating tube; now -0.49 K).  Their READMEs / headers / controlDict descriptions, and hand-written prose in docs/userGuide.tex (lines ~1610-1615, cstr05/cstr04/pfr04), docs/eduToolsGuide.tex (~879, cstr05) and docs/designGuide.tex (~247, batch06), still describe the exotherm.  The generated docs/tutorialsGuide-*.tex files quote the old goldens and READMEs and must be regenerated after the goldens are re-recorded.
