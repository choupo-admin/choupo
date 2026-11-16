# Water's catalogue vapour pressure moves to the IAPWS equation: every moved golden row (2026-11-16)

Reason for the whole slice, as written in the commit: water's catalogue Psat moves from an Antoine fit (+2.5 % at 100 C)
to the IAPWS saturation equation (Wagner model, IAPWS SR1-86 Eq. 1); every case that prices water's vapour pressure
can move.  Each case's rows below were rewritten BY SCRIPT from the full sweep's own mismatch lines (only the rows
reported beyond their tolerance; every other row of every `expected` is byte-for-byte unchanged).  A CONTROL was run
for every case: the case's OLD sealed water.dat with ONLY its vaporPressure block replaced by the new one reproduces
every moved row to 1e-6, so the Psat change alone explains each row; the rest of the refreshed water record
(viscosity, surface tension, conductivity, constants) moved nothing.

111 cases, 1602 rows.

## absorption01_CO2_water  (tutorials/steady/absorption/absorption01_CO2_water)
1 rows; largest relative move 0.000971
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.scrubber.K_water` | 0.00633349747995 | 0.00633964897245 | 0.000971 |

## aceticWater01_txy_association  (tutorials/props/compare/aceticWater01_txy_association)
1 rows; largest relative move 0.0018
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `diag.bp_water.T_bubble` | 372.453622433 | 373.124295805 | 0.0018 |

## acetone01_ipa_water_azeotrope  (tutorials/props/compare/acetone01_ipa_water_azeotrope)
4 rows; largest relative move 0.0374
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `diag.bp_water.T_bubble` | 372.453622433 | 373.124295805 | 0.0018 |
| `diag.azeo_luyben_x.T_bubble` | 355.985436578 | 356.121657004 | 0.000383 |
| `aad.luyben2011_1atm.txy_unifac.T_bubble.aadAbs` | 2.54695253333 | 2.45165895333 | 0.0374 |
| `aad.luyben2011_1atm.txy_unifac.T_bubble.aadRelPct` | 0.715599058426 | 0.690726238937 | 0.0348 |

## acetone03_luyben_reaction_section  (tutorials/steady/flowsheets/acetone03_luyben_reaction_section)
2 rows; largest relative move 0.00111
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.separator.K_water` | 0.0701527919587 | 0.0700747412159 | 0.00111 |
| `boundary.global.Q_boundary_kW` | -127.71501232 | -127.733955038 | 0.000148 |

## acetone04_acetone_water_vle  (tutorials/props/compare/acetone04_acetone_water_vle)
2 rows; largest relative move 0.0018
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `diag.bp_water.T_bubble` | 372.453622433 | 373.124295805 | 0.0018 |
| `diag.dilute_acetone.T_bubble` | 363.623849515 | 364.006127027 | 0.00105 |

## acetone05_luyben_absorber  (tutorials/steady/absorption/acetone05_luyben_absorber)
2 rows; largest relative move 0.00109
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.absorber.A_water` | 8.0125706439 | 8.021328015 | 0.00109 |
| `kpi.absorber.K_water` | 0.0627155235376 | 0.0626470531905 | 0.00109 |

## acetone06_luyben_column_C1  (tutorials/steady/distillation/acetone06_luyben_column_C1)
12 rows; largest relative move 0.0172
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.C1.Q_condenser_kW` | -1008.41512564 | -1008.19449427 | 0.000219 |
| `kpi.C1.T_bottom` | 353.606283382 | 353.827071154 | 0.000624 |
| `kpi.C1.x_B_HK` | 0.883650489877 | 0.884017538595 | 0.000415 |
| `utility.C1.heating.steamLP.T` | 353.606283382 | 353.827071154 | 0.000624 |
| `utility.C1.cooling.coolingWater.duty_kW` | -1008.41512564 | -1008.19449427 | 0.000219 |
| `utility.C1.cooling.coolingWater.kg_s` | 24.1247637713 | 24.1194855088 | 0.000219 |
| `utility.C1.cooling.coolingWater.eur_h` | 1.45211778092 | 1.45180007174 | 0.000219 |
| `stream.acetoneProduct.acetone` | 0.973123011145 | 0.973584845487 | 0.000475 |
| `stream.acetoneProduct.water` | 0.0268769883467 | 0.0264151539894 | 0.0172 |
| `stream.B1.acetone` | 0.0213780788578 | 0.0210110301512 | 0.0172 |
| `stream.B1.T` | 353.606283382 | 353.827071154 | 0.000624 |
| `boundary.global.Q_boundary_kW` | 32.7448712027 | 32.958539016 | 0.00653 |

## acetone07_luyben_column_C2  (tutorials/steady/distillation/acetone07_luyben_column_C2)
22 rows; largest relative move 0.103
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.C2.Q_condenser_kW` | -121.100002882 | -121.004235238 | 0.000791 |
| `kpi.C2.Q_reboiler_kW` | 127.189514012 | 127.723059417 | 0.00419 |
| `kpi.C2.T_bottom` | 366.17478554 | 366.993811838 | 0.00224 |
| `kpi.C2.T_top` | 355.876498071 | 356.030209984 | 0.000432 |
| `kpi.C2.x_B_HK` | 0.987071195421 | 0.988106713126 | 0.00105 |
| `kpi.C2.x_D_LK` | 0.579745774066 | 0.585852945885 | 0.0105 |
| `utility.C2.heating.steamLP.duty_kW` | 127.189514012 | 127.723059417 | 0.00419 |
| `utility.C2.heating.steamLP.T` | 366.17478554 | 366.993811838 | 0.00224 |
| `utility.C2.heating.steamLP.kg_s` | 0.0581836752115 | 0.058427749047 | 0.00419 |
| `utility.C2.heating.steamLP.eur_h` | 5.49458700534 | 5.51763616681 | 0.00419 |
| `utility.C2.cooling.coolingWater.duty_kW` | -121.100002882 | -121.004235238 | 0.000791 |
| `utility.C2.cooling.coolingWater.T` | 355.876498071 | 356.030209984 | 0.000432 |
| `utility.C2.cooling.coolingWater.kg_s` | 2.89712925554 | 2.8948381636 | 0.000791 |
| `utility.C2.cooling.coolingWater.eur_h` | 0.174384004149 | 0.174246098743 | 0.000791 |
| `stream.ipaRecycle.isopropanol` | 0.579745774066 | 0.585852945885 | 0.0105 |
| `stream.ipaRecycle.water` | 0.419568067294 | 0.413460608525 | 0.0146 |
| `stream.waterProduct.isopropanol` | 0.0129281878798 | 0.0118927188274 | 0.0801 |
| `stream.waterProduct.water` | 0.987071195421 | 0.988106713126 | 0.00105 |
| `stream.ipaRecycle.T` | 355.832266988 | 355.984757788 | 0.000429 |
| `stream.waterProduct.T` | 366.17478554 | 366.993811838 | 0.00224 |
| `boundary.global.Q_boundary_kW` | 6.08951113089 | 6.71882417836 | 0.103 |
| `boundary.global.H_products_kW` | -3184.91884593 | -3184.28953288 | 0.000198 |

## acetonePlant  (tutorials/plant/acetonePlant)
93 rows; largest relative move 0.0102
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.B1.F` | 0.0118886310495 | 0.0118844450395 | 0.000352 |
| `stream.F1.F` | 0.0195922435717 | 0.0195897021967 | 0.00013 |
| `stream.Rout.F` | 0.0255039699356 | 0.0255114457881 | 0.000293 |
| `stream.acetoneProduct.F` | 0.00761339770397 | 0.00761512816678 | 0.000227 |
| `stream.columnFeed.F` | 0.0195020287535 | 0.0194995732063 | 0.000126 |
| `stream.flashGas.F` | 0.0119965351595 | 0.0120064016226 | 0.000822 |
| `stream.flashLiquid.F` | 0.0135074347761 | 0.0135050441655 | 0.000177 |
| `stream.offgas.F` | 0.0114672819195 | 0.0114772991469 | 0.000874 |
| `stream.ventGas.F` | 9.0214818139e-05 | 9.01289904414e-05 | 0.000951 |
| `stream.waterProduct.F` | 0.0102552977162 | 0.0102511117062 | 0.000408 |
| `kpi.C1.B` | 0.0118886310495 | 0.0118844450395 | 0.000352 |
| `kpi.C1.D` | 0.00761339770397 | 0.00761512816678 | 0.000227 |
| `kpi.C1.Q_condenser_kW` | -989.113133395 | -989.246520318 | 0.000135 |
| `kpi.C1.Q_reboiler_kW` | 987.199802932 | 987.462999871 | 0.000267 |
| `kpi.C1.T_bottom` | 353.887068025 | 354.050955149 | 0.000463 |
| `kpi.C1.x_B_HK` | 0.899571136164 | 0.899462654978 | 0.000121 |
| `kpi.C2.B` | 0.0102552977162 | 0.0102511117062 | 0.000408 |
| `kpi.C2.Q_condenser_kW` | -119.117798039 | -119.067044582 | 0.000426 |
| `kpi.C2.Q_reboiler_kW` | 126.78886977 | 127.097744361 | 0.00244 |
| `kpi.C2.T_bottom` | 365.506032775 | 366.175606709 | 0.00183 |
| `kpi.C2.T_top` | 353.046029496 | 353.174995719 | 0.000365 |
| `kpi.C2.x_B_HK` | 0.98525933624 | 0.986003223655 | 0.000755 |
| `kpi.C2.x_D_LK` | 0.499321951767 | 0.504407565527 | 0.0102 |
| `kpi.M2.F_out` | 0.0195922435717 | 0.0195897021967 | 0.00013 |
| `kpi.absorber.A_H2` | 1.52563532237e-05 | 1.52438160581e-05 | 0.000822 |
| `kpi.absorber.A_acetone` | 0.136962575732 | 0.136850024425 | 0.000822 |
| `kpi.absorber.A_isopropanol` | 7.21698734377 | 7.21105666266 | 0.000822 |
| `kpi.absorber.A_water` | 12.7990784377 | 12.8025378875 | 0.00027 |
| `kpi.absorber.F_cleanGas` | 0.0114672819195 | 0.0114772991469 | 0.000874 |
| `kpi.absorber.K_water` | 0.0361820328101 | 0.0361425306868 | 0.00109 |
| `kpi.absorber.L_over_V` | 0.463096675974 | 0.462716118467 | 0.000822 |
| `kpi.absorber.V_in` | 0.0119965351595 | 0.0120064016226 | 0.000822 |
| `kpi.absorber.dT_rise` | 4.55506534081 | 4.54977150065 | 0.00116 |
| `kpi.absorber.recovery_acetone` | 0.0978398827743 | 0.0977854260595 | 0.000557 |
| `kpi.reactor.F_out_kmol_h` | 91.8142917681 | 91.841204837 | 0.000293 |
| `kpi.reactor.Q_kW` | 828.062715045 | 828.614205 | 0.000666 |
| `kpi.reactor.Q_reaction_kW` | 459.760132838 | 460.124336343 | 0.000792 |
| `kpi.reactor.Q_sensible_kW` | 368.302582207 | 368.489868657 | 0.000509 |
| `kpi.reactor.extent_kmol_h` | 33.9742917681 | 34.001204837 | 0.000792 |
| `kpi.separator.F_alpha` | 0.0135074347761 | 0.0135050441655 | 0.000177 |
| `kpi.separator.F_beta` | 0.0119965351595 | 0.0120064016226 | 0.000822 |
| `kpi.separator.F_in` | 0.0255039699356 | 0.0255114457881 | 0.000293 |
| `kpi.separator.K_acetone` | 0.331936061687 | 0.331756642633 | 0.000541 |
| `kpi.separator.K_isopropanol` | 0.0951288003682 | 0.0951079231833 | 0.000219 |
| `kpi.separator.K_water` | 0.0701451473577 | 0.0701279636111 | 0.000245 |
| `kpi.separator.V_over_F` | 0.470379128809 | 0.470628035836 | 0.000529 |
| `kpi.vaporiser.Q_sensible_kW` | 162.12381842 | 162.186341004 | 0.000386 |
| `kpi.vent.F_alpha` | 0.0195020287535 | 0.0194995732063 | 0.000126 |
| `kpi.vent.F_beta` | 9.0214818139e-05 | 9.01289904414e-05 | 0.000951 |
| `kpi.vent.F_in` | 0.0195922435717 | 0.0195897021967 | 0.00013 |
| `kpi.vent.K_acetone` | 1.4047068585 | 1.4038741607 | 0.000593 |
| `kpi.vent.K_isopropanol` | 0.409923347855 | 0.409698768199 | 0.000548 |
| `kpi.vent.K_water` | 0.201221297092 | 0.200790602604 | 0.00214 |
| `kpi.vent.Q` | 1984.19246751 | 1981.44056513 | 0.00139 |
| `kpi.vent.Q_kW` | 1.98419246751 | 1.98144056513 | 0.00139 |
| `kpi.vent.V_over_F` | 0.004604619058 | 0.00460083514983 | 0.000822 |
| `utility.C1.heating.steamLP.duty_kW` | 987.199802932 | 987.462999871 | 0.000267 |
| `utility.C1.heating.steamLP.T` | 353.887068025 | 354.050955149 | 0.000463 |
| `utility.C1.heating.steamLP.kg_s` | 0.451601007745 | 0.451721408907 | 0.000267 |
| `utility.C1.heating.steamLP.eur_h` | 42.6470314866 | 42.6584015944 | 0.000267 |
| `utility.C1.cooling.coolingWater.duty_kW` | -989.113133395 | -989.246520318 | 0.000135 |
| `utility.C1.cooling.coolingWater.kg_s` | 23.6629936219 | 23.6661846966 | 0.000135 |
| `utility.C1.cooling.coolingWater.eur_h` | 1.42432291209 | 1.42451498926 | 0.000135 |
| `utility.C2.heating.steamLP.duty_kW` | 126.78886977 | 127.097744361 | 0.00244 |
| `utility.C2.heating.steamLP.T` | 365.506032775 | 366.175606709 | 0.00183 |
| `utility.C2.heating.steamLP.kg_s` | 0.058000397882 | 0.0581416945843 | 0.00244 |
| `utility.C2.heating.steamLP.eur_h` | 5.47727917407 | 5.4906225564 | 0.00244 |
| `utility.C2.cooling.coolingWater.duty_kW` | -119.117798039 | -119.067044582 | 0.000426 |
| `utility.C2.cooling.coolingWater.T` | 353.046029496 | 353.174995719 | 0.000365 |
| `utility.C2.cooling.coolingWater.kg_s` | 2.84970808706 | 2.84849388953 | 0.000426 |
| `utility.C2.cooling.coolingWater.eur_h` | 0.171529629176 | 0.171456544198 | 0.000426 |
| `utility.vent.heating.steamLP.duty_kW` | 1.98419246751 | 1.98144056513 | 0.00139 |
| `utility.vent.heating.steamLP.kg_s` | 0.000907681824113 | 0.000906422948366 | 0.00139 |
| `utility.vent.heating.steamLP.eur_h` | 0.0857171145965 | 0.0855982324135 | 0.00139 |
| `closure.absorber.raw_kW` | -11.2056595982 | -11.1922236398 | 0.0012 |
| `closure.absorber.remaining_kW` | -11.2056595982 | -11.1922236398 | 0.0012 |
| `stream.B1.T` | 353.887068025 | 354.050955149 | 0.000463 |
| `stream.ipaRecycle.T` | 347.052950952 | 347.12626959 | 0.000211 |
| `stream.waterProduct.T` | 365.506032775 | 366.175606709 | 0.00183 |
| `boundary.global.Q_boundary_kW` | 636.23777908 | 637.187274627 | 0.00149 |
| `boundary.global.H_products_kW` | -5237.55663533 | -5236.59370383 | 0.000184 |
| `utility.reactor.heating.hitecSalt.duty_kW` | 828.062715045 | 828.614205 | 0.000666 |
| `utility.reactor.heating.hitecSalt.kg_s` | 4.70490179003 | 4.70803525568 | 0.000666 |
| `utility.reactor.heating.hitecSalt.eur_h` | 44.7153866124 | 44.74516707 | 0.000666 |
| `kpi.M1.Q_kW` | -5.93473815952 | -5.97471934054 | 0.00674 |
| `kpi.M2.Q_kW` | 10.6139514352 | 10.6174798006 | 0.000332 |
| `utility.M1.cooling.coolingWater.duty_kW` | -5.93473815952 | -5.97471934054 | 0.00674 |
| `utility.M1.cooling.coolingWater.kg_s` | 0.141979381807 | 0.142935869391 | 0.00674 |
| `utility.M1.cooling.coolingWater.eur_h` | 0.00854602294971 | 0.00860359585038 | 0.00674 |
| `utility.M2.heating.steamLP.duty_kW` | 10.6139514352 | 10.6174798006 | 0.000332 |
| `utility.M2.heating.steamLP.kg_s` | 0.00485542151654 | 0.00485703559041 | 0.000332 |
| `utility.M2.heating.steamLP.eur_h` | 0.458522701999 | 0.458675127387 | 0.000332 |
| `kpi.C2.Q_reboiler_ownEnvelope_kW` | 131.215998769 | 131.535415815 | 0.00243 |

## analysis01_water_analysis_inlet  (tutorials/steady/flash/analysis01_water_analysis_inlet)
1 rows; largest relative move 0.00871
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.flash01.p_eq_sum_atm` | 0.0747733964818 | 0.0754246980804 | 0.00871 |

## analysis02_weighted_least_squares  (tutorials/steady/flash/analysis02_weighted_least_squares)
1 rows; largest relative move 0.00871
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.flash01.p_eq_sum_atm` | 0.074797651023 | 0.0754489530345 | 0.00871 |

## apalutamide01_tablets  (tutorials/batch/plant/apalutamide01_tablets)
8 rows; largest relative move 0.00494
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.coatedTablets.F` | 1.30795218923e-05 | 1.30835012051e-05 | 0.000304 |
| `stream.packagedTablets.F` | 1.30795218923e-05 | 1.30835012051e-05 | 0.000304 |
| `kpi.coatingDryer.X_equilibrium` | 0.0150798455407 | 0.0151363044065 | 0.00374 |
| `kpi.coatingDryer.X_final` | 0.0150798455407 | 0.0151363044065 | 0.00374 |
| `kpi.coatingDryer.exhaust_humidity` | 0.163910584839 | 0.164178163175 | 0.00163 |
| `kpi.coatingDryer.moisture_pct_wb` | 1.4855822039 | 1.49106128318 | 0.00369 |
| `kpi.coatingDryer.water_activity` | 0.0599366053793 | 0.0602325749826 | 0.00494 |
| `kpi.coatingDryer.water_removed` | 0.000341790219562 | 0.00034171853224 | 0.00021 |

## basis01_two_unit_chain  (tutorials/steady/thermo/basis01_two_unit_chain)
9 rows; largest relative move 0.00902
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.offgas.F` | 0.000157729586982 | 0.000157842535996 | 0.000716 |
| `kpi.speciator.F_beta` | 0.000157729586982 | 0.000157842535996 | 0.000716 |
| `kpi.speciator.K_water` | 0.0721940189402 | 0.0728450581125 | 0.00902 |
| `kpi.speciator.V_over_F` | 0.00568964442019 | 0.00569371873332 | 0.000716 |
| `kpi.transporter.dT` | 17.6565552166 | 17.6635294065 | 0.000395 |
| `kpi.transporter.vf_out` | 0.013041276551 | 0.0130273047062 | 0.00107 |
| `closure.transporter.raw_kW` | -2.98539520384 | -2.97059884957 | 0.00496 |
| `closure.transporter.step_kW` | -2.98539521322 | -2.970598858 | 0.00496 |
| `boundary.global.residual_kW` | 2.98539520384 | 2.97059884957 | 0.00496 |

## bubbleT01_ethanol_water  (tutorials/steady/flash/bubbleT01_ethanol_water)
3 rows; largest relative move 0.00784
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.bubble01.T_bubble` | 354.424819099 | 354.569618412 | 0.000409 |
| `kpi.bubble01.y_ethanol` | 0.581915403358 | 0.585192810284 | 0.00563 |
| `kpi.bubble01.y_water` | 0.418084596646 | 0.414807189719 | 0.00784 |

## bubbleT02_uniquac_ethanol_water  (tutorials/steady/flash/bubbleT02_uniquac_ethanol_water)
3 rows; largest relative move 0.00759
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.bubble02.T_bubble` | 353.469206954 | 353.60989006 | 0.000398 |
| `kpi.bubble02.y_ethanol` | 0.582711434226 | 0.585878966126 | 0.00544 |
| `kpi.bubble02.y_water` | 0.417288565785 | 0.414121033882 | 0.00759 |

## column03_azeotrope_mesh  (tutorials/steady/distillation/column03_azeotrope_mesh)
17 rows; largest relative move 0.147
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.column.T_bottom` | 357.713408954 | 357.985972981 | 0.000762 |
| `kpi.column.T_top` | 351.388958309 | 351.435510341 | 0.000132 |
| `kpi.column.x_B_HK` | 0.868205515068 | 0.870009265504 | 0.00208 |
| `kpi.column.x_D_LK` | 0.804616545214 | 0.810027796534 | 0.00673 |
| `utility.column.heating.steamLP.duty_kW` | 1000.15110633 | 1000.37401274 | 0.000223 |
| `utility.column.heating.steamLP.T` | 357.713408954 | 357.985972981 | 0.000762 |
| `utility.column.heating.steamLP.kg_s` | 0.457525666208 | 0.457627636204 | 0.000223 |
| `utility.column.heating.steamLP.eur_h` | 43.2065277935 | 43.2161573505 | 0.000223 |
| `utility.column.cooling.coolingWater.duty_kW` | -996.886037701 | -996.630281947 | 0.000257 |
| `utility.column.cooling.coolingWater.T` | 351.388958309 | 351.435510341 | 0.000132 |
| `utility.column.cooling.coolingWater.kg_s` | 23.8489482704 | 23.8428297117 | 0.000257 |
| `utility.column.cooling.coolingWater.eur_h` | 1.43551589429 | 1.435147606 | 0.000257 |
| `stream.bottoms.T` | 357.713408954 | 357.985972981 | 0.000762 |
| `stream.distillate.T` | 351.340302025 | 351.383500053 | 0.000123 |
| `kpi.column.Q_condenser_kW` | -996.886037701 | -996.630281947 | 0.000257 |
| `kpi.column.Q_reboiler_kW` | 1000.15110633 | 1000.37401274 | 0.000223 |
| `boundary.global.Q_boundary_kW` | 3.26506862929 | 3.74373079487 | 0.147 |

## column05_reactive_methylacetate  (tutorials/steady/distillation/column05_reactive_methylacetate)
12 rows; largest relative move 0.0129
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.rdColumn.Q_condenser_kW` | -0.803941040437 | -0.803780128286 | 0.0002 |
| `kpi.rdColumn.T_bottom` | 363.715464674 | 364.067809125 | 0.000969 |
| `kpi.rdColumn.conversion` | 0.955249509215 | 0.955756035723 | 0.00053 |
| `kpi.rdColumn.reactionExtent` | 8.17269024551e-06 | 8.17702386118e-06 | 0.00053 |
| `kpi.rdColumn.x_B_HK` | 0.880736147028 | 0.881593409688 | 0.000973 |
| `kpi.rdColumn.x_D_LK` | 0.0077369543553 | 0.00763734743622 | 0.0129 |
| `utility.rdColumn.heating.steamLP.T` | 363.715464674 | 364.067809125 | 0.000969 |
| `utility.rdColumn.cooling.coolingWater.duty_kW` | -0.803941040437 | -0.803780128286 | 0.0002 |
| `utility.rdColumn.cooling.coolingWater.kg_s` | 0.0192330392449 | 0.0192291896719 | 0.0002 |
| `utility.rdColumn.cooling.coolingWater.eur_h` | 0.00115767509823 | 0.00115744338473 | 0.0002 |
| `stream.bottoms.T` | 363.715464674 | 364.067809125 | 0.000969 |
| `boundary.global.Q_boundary_kW` | 0.0310200388804 | 0.0312388399546 | 0.00705 |

## column13_sour_water_stage_identity  (tutorials/steady/distillation/column13_sour_water_stage_identity)
28 rows; largest relative move 1.11
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.recombine.T_out` | 483.325341357 | 483.02243918 | 0.000627 |
| `kpi.tower.Q_condenser_kW` | -64.9479690347 | -65.1965414008 | 0.00383 |
| `kpi.tower.Q_reboiler_kW` | 112.940913074 | 112.102917671 | 0.00742 |
| `kpi.tower.T_bottom` | 371.482225858 | 370.94166387 | 0.00146 |
| `kpi.tower.T_top` | 354.631541425 | 354.394743853 | 0.000668 |
| `kpi.tower.x_B_HK` | 0.994105151535 | 0.993994635483 | 0.000111 |
| `kpi.tower.x_D_LK` | 0.302829934302 | 0.300011554806 | 0.00931 |
| `utility.tower.heating.steamLP.duty_kW` | 112.940913074 | 112.102917671 | 0.00742 |
| `utility.tower.heating.steamLP.T` | 371.482225858 | 370.94166387 | 0.00146 |
| `utility.tower.heating.steamLP.kg_s` | 0.0516655595033 | 0.0512822130242 | 0.00742 |
| `utility.tower.heating.steamLP.eur_h` | 4.87904744481 | 4.84284604338 | 0.00742 |
| `utility.tower.cooling.coolingWater.duty_kW` | -64.9479690347 | -65.1965414008 | 0.00383 |
| `utility.tower.cooling.coolingWater.T` | 354.631541425 | 354.394743853 | 0.000668 |
| `utility.tower.cooling.coolingWater.kg_s` | 1.55377916351 | 1.55972587083 | 0.00383 |
| `utility.tower.cooling.coolingWater.eur_h` | 0.09352507541 | 0.0938830196172 | 0.00383 |
| `kpi.restage.H_residual` | 0.000529574463144 | 0.00111782108434 | 1.11 |
| `kpi.restage.T_drop` | 115.985556191 | 116.144926713 | 0.00137 |
| `kpi.restage.T_feed` | 483.325341357 | 483.02243918 | 0.000627 |
| `kpi.restage.T_out` | 367.339785165 | 366.877512467 | 0.00126 |
| `stream.bottoms.T` | 371.482225858 | 370.94166387 | 0.00146 |
| `stream.checkLiquid.T` | 367.339785165 | 366.877512467 | 0.00126 |
| `stream.checkVapour.T` | 367.339785165 | 366.877512467 | 0.00126 |
| `stream.distillate.T` | 354.631541425 | 354.394743853 | 0.000668 |
| `stream.stageLiquid.T` | 367.339784921 | 366.877511916 | 0.00126 |
| `stream.stageMix.T` | 483.325341357 | 483.02243918 | 0.000627 |
| `stream.stageVapour.T` | 367.339784921 | 366.877511916 | 0.00126 |
| `boundary.global.Q_boundary_kW` | 47.9929440396 | 46.90637627 | 0.0226 |
| `boundary.global.H_products_kW` | -7598.91609631 | -7600.00266376 | 0.000143 |

## compare_vle_etoh_water  (tutorials/props/compare/compare_vle_etoh_water)
12 rows; largest relative move 0.766
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.consistency_etoh_water.gamma2_inf` | 2.27627 | 2.30420701981 | 0.0123 |
| `diag.consistency_etoh_water.gd_max_resid` | 0.0964023 | 0.0878280139478 | 0.0889 |
| `diag.consistency_etoh_water.gd_mean_resid` | 0.05208 | 0.0454735026079 | 0.127 |
| `diag.consistency_etoh_water.herington_D` | 12.0482 | 9.6253632834 | 0.201 |
| `aad.etoh_water_1atm.txy_ideal.T_bubble.aadAbs` | 5.35404 | 5.495826575 | 0.0265 |
| `aad.etoh_water_1atm.txy_ideal.y_eq_ethanol.aadAbs` | 0.087966 | 0.087393041525 | 0.00651 |
| `aad.etoh_water_1atm.txy_nrtl.T_bubble.aadAbs` | 0.349277 | 0.163160359583 | 0.533 |
| `aad.etoh_water_1atm.txy_nrtl.y_eq_ethanol.aadAbs` | 0.00232279 | 0.00410257749958 | 0.766 |
| `aad.etoh_water_1atm.txy_unifac.T_bubble.aadAbs` | 0.407352 | 0.2279614175 | 0.44 |
| `aad.etoh_water_1atm.txy_unifac.y_eq_ethanol.aadAbs` | 0.00483698 | 0.00526699668542 | 0.0889 |
| `aad.etoh_water_1atm.txy_wilson.T_bubble.aadAbs` | 0.275964 | 0.141945682083 | 0.486 |
| `aad.etoh_water_1atm.txy_wilson.y_eq_ethanol.aadAbs` | 0.00502164 | 0.00545467599 | 0.0862 |

## convDryer01_sugar_curve  (tutorials/steady/drying/convDryer01_sugar_curve)
14 rows; largest relative move 0.0602
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.drySolidCo.F` | 0.0020068905978 | 0.00201143277735 | 0.00226 |
| `stream.drySolidCounter.F` | 0.00151236672392 | 0.0015141010881 | 0.00115 |
| `stream.exhaustCo.T` | 359.690122884 | 359.747924592 | 0.000161 |
| `kpi.co.T_air_out` | 359.690122884 | 359.747924592 | 0.000161 |
| `kpi.co.X_equilibrium_inlet_air` | 0.00109945367934 | 0.00116558884515 | 0.0602 |
| `kpi.co.X_final` | 0.0234175246423 | 0.0235896417981 | 0.00735 |
| `kpi.co.Y_air_out` | 0.039322268557 | 0.039296318912 | 0.00066 |
| `kpi.co.position_critical` | 0.063567386389 | 0.0635778661608 | 0.000165 |
| `kpi.co.water_removed_kg_s` | 0.0839460851632 | 0.0838642577987 | 0.000975 |
| `kpi.counter.X_equilibrium_inlet_air` | 0.00109945367934 | 0.00116558884515 | 0.0602 |
| `kpi.counter.X_final` | 0.00467849377657 | 0.00474421417056 | 0.014 |
| `kpi.counter.Y_air_out` | 0.0421475023105 | 0.0421375938218 | 0.000235 |
| `kpi.counter.position_critical` | 0.123692940501 | 0.123659242406 | 0.000272 |
| `kpi.counter.water_removed_kg_s` | 0.0928549327511 | 0.0928236881805 | 0.000336 |

## coolingTower01_merkel  (tutorials/steady/heat/coolingTower01_merkel)
8 rows; largest relative move 0.00113
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.tower01.Q_kW` | 36.4315830585 | 36.4378292572 | 0.000171 |
| `kpi.tower01.Y_out` | 0.0366432593178 | 0.0366495938867 | 0.000173 |
| `kpi.tower01.approach_K` | 7.75695115581 | 7.76574670718 | 0.00113 |
| `kpi.tower01.evaporation_kg_s` | 0.0120283876424 | 0.0120315916057 | 0.000266 |
| `kpi.tower01.evaporation_pct_of_L` | 2.40367446642 | 2.40431472554 | 0.000266 |
| `kpi.tower01.makeup_kg_s` | 0.0120283876424 | 0.0120315916057 | 0.000266 |
| `kpi.tower01.range_K` | 17.3713508623 | 17.3743291822 | 0.000171 |
| `kpi.tower01.H_closure_gap_kW` | -1.39277111799 | -1.39299192773 | 0.000159 |

## crystalliser09_KHT_KCl_series  (tutorials/steady/crystallisation/crystalliser09_KHT_KCl_series)
36 rows; largest relative move 0.0291
Reason: water's saturation pressure moved (IAPWS vs Antoine); every row listed is a function of it

| row | golden | now | relative move |
|---|---|---|---|
| `stream.KCl_cake.F` | 0.00138951804787 | 0.00139624609486 | 0.00484 |
| `stream.finalLiquor.F` | 0.0541131192255 | 0.0541054689986 | 0.000141 |
| `stream.stillage.F` | 0.0305020081144 | 0.0304943578874 | 0.000251 |
| `kpi.cryst2.Q_kW` | -19.1913358464 | -19.292025259 | 0.00525 |
| `kpi.cryst2.Q_removed` | 19191.3358464 | 19292.025259 | 0.00525 |
| `kpi.cryst2.antisolvent_xfrac` | 0.431233032533 | 0.433633590307 | 0.00557 |
| `kpi.cryst2.c_sat` | 0.0139690955498 | 0.0136704927645 | 0.0214 |
| `kpi.cryst2.cakeLiquidFlow` | 0.000273742707959 | 0.000274616719341 | 0.00319 |
| `kpi.cryst2.crystal_flow` | 0.0831821673655 | 0.0836185915746 | 0.00525 |
| `kpi.cryst2.crystal_mol` | 0.00111577533991 | 0.00112162937552 | 0.00525 |
| `kpi.cryst2.gamma_pm_sat` | 11.5346545617 | 11.7866045125 | 0.0218 |
| `kpi.cryst2.liquorFlow` | 0.0543867412405 | 0.0543800857179 | 0.000122 |
| `kpi.cryst2.m_sat` | 0.187376367182 | 0.183371018022 | 0.0214 |
| `kpi.cryst2.soluteInCake_mass` | 0.00011448542122 | 0.000112659395907 | 0.0159 |
| `kpi.cryst2.solute_dissolved` | 0.0227454359149 | 0.0223090117058 | 0.0192 |
| `kpi.cryst2.yield` | 0.785273760469 | 0.789393783916 | 0.00525 |
| `kpi.recovery.B` | 0.0305020081144 | 0.0304943578874 | 0.000251 |
| `kpi.recovery.Q_condenser_kW` | -2776.31597578 | -2774.62106495 | 0.00061 |
| `kpi.recovery.Q_reboiler_kW` | 3153.66021927 | 3152.91535171 | 0.000236 |
| `kpi.recovery.T_bottom` | 358.019009224 | 358.218175109 | 0.000556 |
| `kpi.recovery.T_top` | 351.369759441 | 351.41267783 | 0.000122 |
| `kpi.recovery.x_B_HK` | 0.00027929569942 | 0.000279360458511 | 0.000232 |
| `kpi.recovery.x_D_LK` | 0.188895175204 | 0.183397199675 | 0.0291 |
| `utility.recovery.heating.steamLP.duty_kW` | 3153.66021927 | 3152.91535171 | 0.000236 |
| `utility.recovery.heating.steamLP.T` | 358.019009224 | 358.218175109 | 0.000556 |
| `utility.recovery.heating.steamLP.kg_s` | 1.44266249738 | 1.44232175284 | 0.000236 |
| `utility.recovery.heating.steamLP.eur_h` | 136.238121473 | 136.205943194 | 0.000236 |
| `utility.recovery.cooling.coolingWater.duty_kW` | -2776.31597578 | -2774.62106495 | 0.00061 |
| `utility.recovery.cooling.coolingWater.T` | 351.369759441 | 351.41267783 | 0.000122 |
| `utility.recovery.cooling.coolingWater.kg_s` | 66.4190424828 | 66.3784943768 | 0.00061 |
| `utility.recovery.cooling.coolingWater.eur_h` | 3.99789500512 | 3.99545433353 | 0.00061 |
| `stream.recoveredEthanol.T` | 351.329374323 | 351.370338782 | 0.000117 |
| `stream.stillage.T` | 358.019009224 | 358.218175109 | 0.000556 |
| `utility.cryst2.cooling.refrigerationNH3.duty_kW` | -19.1913358464 | -19.292025259 | 0.00525 |
| `utility.cryst2.cooling.refrigerationNH3.kg_s` | 0.0140089389981 | 0.0140824384069 | 0.00525 |
| `utility.cryst2.cooling.refrigerationNH3.eur_h` | 1.09436673531 | 1.10010844837 | 0.00525 |

## cstr07_lhhw_methylAcetate  (tutorials/steady/reactors/cstr07_lhhw_methylAcetate)
5 rows; largest relative move 0.165
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.reactor.Q_kW` | -0.0517242743531 | -0.0602505397729 | 0.165 |
| `boundary.global.Q_boundary_kW` | -0.0517242743531 | -0.0602505397729 | 0.165 |
| `utility.reactor.cooling.coolingWater.duty_kW` | -0.0517242743531 | -0.0602505397729 | 0.165 |
| `utility.reactor.cooling.coolingWater.kg_s` | 0.00123742283141 | 0.00144140047304 | 0.165 |
| `utility.reactor.cooling.coolingWater.eur_h` | 7.44829550685e-05 | 8.6760777273e-05 | 0.165 |

## curate02_vle_heldout_ethanol_water  (tutorials/props/curation/curate02_vle_heldout_ethanol_water)
9 rows; largest relative move 0.345
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.nrtl_etoh_water_heldout.aad_heldout_pct` | 0.0736714746429 | 0.0729370366247 | 0.00997 |
| `diag.nrtl_etoh_water_heldout.chi2` | 0.809699405251 | 0.811043497706 | 0.00166 |
| `diag.nrtl_etoh_water_heldout.chi2_in_sample` | 0.809699405251 | 0.811043497706 | 0.00166 |
| `diag.nrtl_etoh_water_heldout.chi2_reduced` | 0.202424851313 | 0.202760874427 | 0.00166 |
| `diag.nrtl_etoh_water_heldout.cond_JtJ` | 394331596992 | 396995377673 | 0.00676 |
| `diag.nrtl_etoh_water_heldout.iter` | 29 | 39 | 0.345 |
| `diag.nrtl_etoh_water_heldout.max_abs_resid` | 0.582462818864 | 0.582297035374 | 0.000285 |
| `diag.nrtl_etoh_water_heldout.rms` | 0.31813900367 | 0.318402947871 | 0.00083 |
| `diag.nrtl_etoh_water_heldout.aad_heldout_K` | 0.263003227581 | 0.260383041549 | 0.00996 |

## curate03_thermoml_fixture_bubble  (tutorials/props/curation/curate03_thermoml_fixture_bubble)
9 rows; largest relative move 0.214
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.thermoml_fixture_bubble.aad_heldout_pct` | 0.0528782856338 | 0.0518717443424 | 0.019 |
| `diag.thermoml_fixture_bubble.chi2` | 0.669244065892 | 0.668630561203 | 0.000917 |
| `diag.thermoml_fixture_bubble.chi2_in_sample` | 0.669244065892 | 0.668630561203 | 0.000917 |
| `diag.thermoml_fixture_bubble.chi2_reduced` | 0.223081355297 | 0.222876853734 | 0.000917 |
| `diag.thermoml_fixture_bubble.cond_JtJ` | 272780104374 | 267417339528 | 0.0197 |
| `diag.thermoml_fixture_bubble.iter` | 42 | 51 | 0.214 |
| `diag.thermoml_fixture_bubble.max_abs_resid` | 0.656169896008 | 0.649129438234 | 0.0107 |
| `diag.thermoml_fixture_bubble.rms` | 0.309202676456 | 0.309060918915 | 0.000458 |
| `diag.thermoml_fixture_bubble.aad_heldout_K` | 0.187890937011 | 0.184326962291 | 0.019 |

## curate04_nrtl_methanol_water  (tutorials/props/curation/curate04_nrtl_methanol_water)
35 rows; largest relative move 0.136
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.fit_nrtl.aad_heldout_K` | 0.534750672125 | 0.572376293018 | 0.0704 |
| `diag.fit_nrtl.aad_heldout_pct` | 0.150061425821 | 0.160338943448 | 0.0685 |
| `diag.fit_nrtl.chi2` | 315.937277131 | 326.08576689 | 0.0321 |
| `diag.fit_nrtl.chi2_in_sample` | 315.937277131 | 326.08576689 | 0.0321 |
| `diag.fit_nrtl.chi2_reduced` | 6.07571686791 | 6.2708801325 | 0.0321 |
| `diag.fit_nrtl.cond_JtJ` | 116.915709849 | 115.116247905 | 0.0154 |
| `diag.fit_nrtl.max_abs_resid` | 2.0802446823 | 2.02486563763 | 0.0266 |
| `diag.fit_nrtl.rms` | 0.499954438109 | 0.499424961799 | 0.00106 |
| `diag.fit_nrtl_start2.aad_heldout_K` | 0.534753318817 | 0.572383689605 | 0.0704 |
| `diag.fit_nrtl_start2.aad_heldout_pct` | 0.150062184661 | 0.160341034767 | 0.0685 |
| `diag.fit_nrtl_start2.chi2` | 315.937277146 | 326.085766981 | 0.0321 |
| `diag.fit_nrtl_start2.chi2_in_sample` | 315.937277146 | 326.085766981 | 0.0321 |
| `diag.fit_nrtl_start2.chi2_reduced` | 6.07571686819 | 6.27088013424 | 0.0321 |
| `diag.fit_nrtl_start2.cond_JtJ` | 116.915338093 | 115.115964549 | 0.0154 |
| `diag.fit_nrtl_start2.max_abs_resid` | 2.08025416732 | 2.02488610964 | 0.0266 |
| `diag.fit_nrtl_start2.rms` | 0.499955023532 | 0.499426146457 | 0.00106 |
| `diag.fit_nrtl_ab.aad_heldout_K` | 0.642790492472 | 0.685466799062 | 0.0664 |
| `diag.fit_nrtl_ab.aad_heldout_pct` | 0.181111499184 | 0.192522486995 | 0.063 |
| `diag.fit_nrtl_ab.chi2` | 250.105616829 | 253.280374706 | 0.0127 |
| `diag.fit_nrtl_ab.chi2_in_sample` | 250.105616829 | 253.280374706 | 0.0127 |
| `diag.fit_nrtl_ab.chi2_reduced` | 5.00211233657 | 5.06560749412 | 0.0127 |
| `diag.fit_nrtl_ab.cond_JtJ` | 1363048966.78 | 1543105205.26 | 0.132 |
| `diag.fit_nrtl_ab.iter` | 23 | 24 | 0.0435 |
| `diag.fit_nrtl_ab.max_abs_corr` | 0.996116814509 | 0.996436310445 | 0.000321 |
| `diag.fit_nrtl_ab.max_abs_resid` | 1.99015240828 | 2.00534043282 | 0.00763 |
| `diag.fit_nrtl_ab.rms` | 0.452817919327 | 0.455879491101 | 0.00676 |
| `aad.heldout_methanol_water.txy_ideal.T_bubble.aadAbs` | 2.76898470769 | 2.99159253077 | 0.0804 |
| `aad.heldout_methanol_water.txy_ideal.T_bubble.aadRelPct` | 0.785129315239 | 0.846260140736 | 0.0779 |
| `aad.heldout_methanol_water.txy_ideal.y_eq_methanol.aadAbs` | 0.0391786762785 | 0.0381764860354 | 0.0256 |
| `aad.heldout_methanol_water.txy_unifac.T_bubble.aadAbs` | 0.362893076923 | 0.317660876923 | 0.125 |
| `aad.heldout_methanol_water.txy_unifac.T_bubble.aadRelPct` | 0.100062975675 | 0.0883513303676 | 0.117 |
| `aad.heldout_methanol_water.txy_unifac.y_eq_methanol.aadAbs` | 0.0113641883769 | 0.0115123486846 | 0.013 |
| `aad.heldout_methanol_water.txy_nrtl.T_bubble.aadAbs` | 0.5344192 | 0.607346 | 0.136 |
| `aad.heldout_methanol_water.txy_nrtl.T_bubble.aadRelPct` | 0.149976924709 | 0.170062644183 | 0.134 |
| `aad.heldout_methanol_water.txy_nrtl.y_eq_methanol.aadAbs` | 0.0125012797346 | 0.0123317162346 | 0.0136 |

## curate06_nrtl_isopropanol_water  (tutorials/props/curation/curate06_nrtl_isopropanol_water)
37 rows; largest relative move 0.313
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.fit_nrtl.aad_heldout_K` | 0.84147821571 | 0.830836677901 | 0.0126 |
| `diag.fit_nrtl.aad_heldout_pct` | 0.234200546209 | 0.23134450316 | 0.0122 |
| `diag.fit_nrtl.chi2` | 90.1257883215 | 105.030011718 | 0.165 |
| `diag.fit_nrtl.chi2_in_sample` | 90.1257883215 | 105.030011718 | 0.165 |
| `diag.fit_nrtl.chi2_reduced` | 3.33799216005 | 3.89000043399 | 0.165 |
| `diag.fit_nrtl.cond_JtJ` | 39.3738330039 | 37.9170024181 | 0.037 |
| `diag.fit_nrtl.max_abs_corr` | 0.89819126525 | 0.895867108304 | 0.00259 |
| `diag.fit_nrtl.max_abs_resid` | 1.65678230014 | 1.94409551294 | 0.173 |
| `diag.fit_nrtl.rms` | 0.516945264664 | 0.625952373531 | 0.211 |
| `diag.fit_nrtl_start2.aad_heldout_K` | 0.841476020612 | 0.830834364252 | 0.0126 |
| `diag.fit_nrtl_start2.aad_heldout_pct` | 0.234199936071 | 0.23134386021 | 0.0122 |
| `diag.fit_nrtl_start2.chi2` | 90.1257882628 | 105.030011651 | 0.165 |
| `diag.fit_nrtl_start2.chi2_in_sample` | 90.1257882628 | 105.030011651 | 0.165 |
| `diag.fit_nrtl_start2.chi2_reduced` | 3.33799215788 | 3.89000043152 | 0.165 |
| `diag.fit_nrtl_start2.cond_JtJ` | 39.3738291745 | 37.9169980339 | 0.037 |
| `diag.fit_nrtl_start2.iter` | 21 | 22 | 0.0476 |
| `diag.fit_nrtl_start2.max_abs_corr` | 0.898191467398 | 0.895867319088 | 0.00259 |
| `diag.fit_nrtl_start2.max_abs_resid` | 1.65678866314 | 1.94410239747 | 0.173 |
| `diag.fit_nrtl_start2.rms` | 0.51694731422 | 0.625954615911 | 0.211 |
| `aad.heldout_isopropanol_water.txy_ideal.T_bubble.aadAbs` | 8.2092275275 | 8.48717568 | 0.0339 |
| `aad.heldout_isopropanol_water.txy_ideal.T_bubble.aadRelPct` | 2.30460069399 | 2.38213076919 | 0.0336 |
| `aad.heldout_isopropanol_water.txy_ideal.y_eq_isopropanol.aadAbs` | 0.160996512172 | 0.160613087601 | 0.00238 |
| `aad.heldout_isopropanol_water.txy_unifac.T_bubble.aadAbs` | 1.26628338125 | 1.12665912563 | 0.11 |
| `aad.heldout_isopropanol_water.txy_unifac.T_bubble.aadRelPct` | 0.351662595057 | 0.312648249592 | 0.111 |
| `aad.heldout_isopropanol_water.txy_unifac.y_eq_isopropanol.aadAbs` | 0.0183657229763 | 0.0181957789325 | 0.00925 |
| `aad.heldout_isopropanol_water.txy_nrtl.T_bubble.aadAbs` | 0.83278075625 | 0.77809158375 | 0.0657 |
| `aad.heldout_isopropanol_water.txy_nrtl.T_bubble.aadRelPct` | 0.231820487051 | 0.216895914652 | 0.0644 |
| `aad.heldout_isopropanol_water.txy_nrtl.y_eq_isopropanol.aadAbs` | 0.0114374751906 | 0.0111346056938 | 0.0265 |
| `aad.fitset_isopropanol_water.txy_ideal_fitP.T_bubble.aadAbs` | 7.83560783793 | 8.13572504828 | 0.0383 |
| `aad.fitset_isopropanol_water.txy_ideal_fitP.T_bubble.aadRelPct` | 2.20147204951 | 2.28494191833 | 0.0379 |
| `aad.fitset_isopropanol_water.txy_ideal_fitP.y_eq_isopropanol.aadAbs` | 0.144260486037 | 0.143733358872 | 0.00365 |
| `aad.fitset_isopropanol_water.txy_unifac_fitP.T_bubble.aadAbs` | 0.484681882759 | 0.379747472414 | 0.217 |
| `aad.fitset_isopropanol_water.txy_unifac_fitP.T_bubble.aadRelPct` | 0.135813070691 | 0.106266286148 | 0.218 |
| `aad.fitset_isopropanol_water.txy_unifac_fitP.y_eq_isopropanol.aadAbs` | 0.00812801427931 | 0.00778663448966 | 0.042 |
| `aad.fitset_isopropanol_water.txy_nrtl_fitP.T_bubble.aadAbs` | 0.366145544828 | 0.480637793103 | 0.313 |
| `aad.fitset_isopropanol_water.txy_nrtl_fitP.T_bubble.aadRelPct` | 0.101604073314 | 0.133272454992 | 0.312 |
| `aad.fitset_isopropanol_water.txy_nrtl_fitP.y_eq_isopropanol.aadAbs` | 0.0152087051138 | 0.0133633709069 | 0.121 |

## curate09_nrtl_propanol_water  (tutorials/props/curation/curate09_nrtl_propanol_water)
37 rows; largest relative move 0.667
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.fit_nrtl.aad_heldout_K` | 0.205309666797 | 0.20382695687 | 0.00722 |
| `diag.fit_nrtl.aad_heldout_pct` | 0.0565382893231 | 0.056142172489 | 0.00701 |
| `diag.fit_nrtl.chi2` | 213.201326383 | 214.93937809 | 0.00815 |
| `diag.fit_nrtl.chi2_in_sample` | 213.201326383 | 214.93937809 | 0.00815 |
| `diag.fit_nrtl.chi2_reduced` | 8.8833885993 | 8.95580742041 | 0.00815 |
| `diag.fit_nrtl.cond_JtJ` | 45.7035038408 | 43.303742578 | 0.0525 |
| `diag.fit_nrtl.max_abs_corr` | 0.919864189194 | 0.915578164305 | 0.00466 |
| `diag.fit_nrtl.max_abs_resid` | 1.46662361676 | 1.71308429363 | 0.168 |
| `diag.fit_nrtl.rms` | 0.523472296852 | 0.597142956001 | 0.141 |
| `diag.fit_nrtl_start2.aad_heldout_K` | 0.205308592238 | 0.203827615667 | 0.00721 |
| `diag.fit_nrtl_start2.aad_heldout_pct` | 0.0565379938953 | 0.0561423535545 | 0.007 |
| `diag.fit_nrtl_start2.chi2` | 213.201326384 | 214.939378147 | 0.00815 |
| `diag.fit_nrtl_start2.chi2_in_sample` | 213.201326384 | 214.939378147 | 0.00815 |
| `diag.fit_nrtl_start2.chi2_reduced` | 8.88338859933 | 8.95580742278 | 0.00815 |
| `diag.fit_nrtl_start2.cond_JtJ` | 45.7034832005 | 43.3037572897 | 0.0525 |
| `diag.fit_nrtl_start2.iter` | 9 | 15 | 0.667 |
| `diag.fit_nrtl_start2.max_abs_corr` | 0.919864456948 | 0.915578008484 | 0.00466 |
| `diag.fit_nrtl_start2.max_abs_resid` | 1.46663406349 | 1.71307967344 | 0.168 |
| `diag.fit_nrtl_start2.rms` | 0.523474733091 | 0.597141490823 | 0.141 |
| `aad.heldout_propanol_water.txy_ideal.T_bubble.aadAbs` | 8.93180384737 | 9.24275360526 | 0.0348 |
| `aad.heldout_propanol_water.txy_ideal.T_bubble.aadRelPct` | 2.46933143379 | 2.55536277776 | 0.0348 |
| `aad.heldout_propanol_water.txy_ideal.y_eq_1Propanol.aadAbs` | 0.138186309791 | 0.138780949591 | 0.0043 |
| `aad.heldout_propanol_water.txy_unifac.T_bubble.aadAbs` | 0.359317242105 | 0.580673789474 | 0.616 |
| `aad.heldout_propanol_water.txy_unifac.T_bubble.aadRelPct` | 0.0992838908439 | 0.160475429174 | 0.616 |
| `aad.heldout_propanol_water.txy_unifac.y_eq_1Propanol.aadAbs` | 0.0160006499421 | 0.0147429473526 | 0.0786 |
| `aad.heldout_propanol_water.txy_nrtl.T_bubble.aadAbs` | 0.206144552632 | 0.298545631579 | 0.448 |
| `aad.heldout_propanol_water.txy_nrtl.T_bubble.aadRelPct` | 0.0567675932733 | 0.0822554962392 | 0.449 |
| `aad.heldout_propanol_water.txy_nrtl.y_eq_1Propanol.aadAbs` | 0.0106899161579 | 0.00865109815789 | 0.191 |
| `aad.fitset_propanol_water.txy_ideal_fitP.T_bubble.aadAbs` | 8.48628981538 | 8.83632401154 | 0.0412 |
| `aad.fitset_propanol_water.txy_ideal_fitP.T_bubble.aadRelPct` | 2.34571699145 | 2.44232843933 | 0.0412 |
| `aad.fitset_propanol_water.txy_ideal_fitP.y_eq_1Propanol.aadAbs` | 0.145369779033 | 0.145757118676 | 0.00266 |
| `aad.fitset_propanol_water.txy_unifac_fitP.T_bubble.aadAbs` | 0.405730934615 | 0.654341461538 | 0.613 |
| `aad.fitset_propanol_water.txy_unifac_fitP.T_bubble.aadRelPct` | 0.111800265475 | 0.180361648805 | 0.613 |
| `aad.fitset_propanol_water.txy_unifac_fitP.y_eq_1Propanol.aadAbs` | 0.0163234048962 | 0.0152709733038 | 0.0645 |
| `aad.fitset_propanol_water.txy_nrtl_fitP.T_bubble.aadAbs` | 0.366813911538 | 0.477753823077 | 0.302 |
| `aad.fitset_propanol_water.txy_nrtl_fitP.T_bubble.aadRelPct` | 0.100681661466 | 0.131069137752 | 0.302 |
| `aad.fitset_propanol_water.txy_nrtl_fitP.y_eq_1Propanol.aadAbs` | 0.0154641508769 | 0.0146105383615 | 0.0552 |

## curate10_nrtl_acetonitrile_water  (tutorials/props/curation/curate10_nrtl_acetonitrile_water)
30 rows; largest relative move 0.325
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.fit_nrtl.aad_heldout_K` | 0.495564366362 | 0.476238263444 | 0.039 |
| `diag.fit_nrtl.aad_heldout_pct` | 0.136733099834 | 0.131782214769 | 0.0362 |
| `diag.fit_nrtl.chi2` | 27.5888548619 | 31.4334106745 | 0.139 |
| `diag.fit_nrtl.chi2_in_sample` | 27.5888548619 | 31.4334106745 | 0.139 |
| `diag.fit_nrtl.chi2_reduced` | 1.6228738154 | 1.84902415733 | 0.139 |
| `diag.fit_nrtl.cond_JtJ` | 15.0626260021 | 14.8059623436 | 0.017 |
| `diag.fit_nrtl.max_abs_corr` | 0.940389969107 | 0.939558056084 | 0.000885 |
| `diag.fit_nrtl.max_abs_resid` | 1.15866160924 | 1.53534314939 | 0.325 |
| `diag.fit_nrtl.rms` | 0.522782372071 | 0.651268411946 | 0.246 |
| `diag.fit_nrtl_start2.aad_heldout_K` | 0.495564324364 | 0.476238164435 | 0.039 |
| `diag.fit_nrtl_start2.aad_heldout_pct` | 0.136733090737 | 0.131782191217 | 0.0362 |
| `diag.fit_nrtl_start2.chi2` | 27.5888548704 | 31.4334106898 | 0.139 |
| `diag.fit_nrtl_start2.chi2_in_sample` | 27.5888548704 | 31.4334106898 | 0.139 |
| `diag.fit_nrtl_start2.chi2_reduced` | 1.62287381591 | 1.84902415822 | 0.139 |
| `diag.fit_nrtl_start2.cond_JtJ` | 15.062647914 | 14.8059969761 | 0.017 |
| `diag.fit_nrtl_start2.max_abs_corr` | 0.940389955895 | 0.939558034398 | 0.000885 |
| `diag.fit_nrtl_start2.max_abs_resid` | 1.15865840253 | 1.53533772672 | 0.325 |
| `diag.fit_nrtl_start2.rms` | 0.522780936658 | 0.651265944231 | 0.246 |
| `aad.heldout_acetonitrile_water.txy_ideal.T_bubble.aadAbs` | 10.6530257058 | 10.9530875767 | 0.0282 |
| `aad.heldout_acetonitrile_water.txy_ideal.T_bubble.aadRelPct` | 3.02313114429 | 3.10712749659 | 0.0278 |
| `aad.heldout_acetonitrile_water.txy_ideal.y_eq_acetonitrile.aadAbs` | 0.176620157585 | 0.175765357332 | 0.00484 |
| `aad.heldout_acetonitrile_water.txy_nrtl.T_bubble.aadAbs` | 0.500391219167 | 0.552005644167 | 0.103 |
| `aad.heldout_acetonitrile_water.txy_nrtl.T_bubble.aadRelPct` | 0.138086956527 | 0.153235079664 | 0.11 |
| `aad.heldout_acetonitrile_water.txy_nrtl.y_eq_acetonitrile.aadAbs` | 0.0209194552967 | 0.0196640871292 | 0.06 |
| `aad.fitset_acetonitrile_water.txy_ideal_fitP.T_bubble.aadAbs` | 8.90255287368 | 9.20631488421 | 0.0341 |
| `aad.fitset_acetonitrile_water.txy_ideal_fitP.T_bubble.aadRelPct` | 2.51043115178 | 2.5952070224 | 0.0338 |
| `aad.fitset_acetonitrile_water.txy_ideal_fitP.y_eq_acetonitrile.aadAbs` | 0.193767431218 | 0.193056608143 | 0.00367 |
| `aad.fitset_acetonitrile_water.txy_nrtl_fitP.T_bubble.aadAbs` | 0.410744126316 | 0.519118263158 | 0.264 |
| `aad.fitset_acetonitrile_water.txy_nrtl_fitP.T_bubble.aadRelPct` | 0.114613270968 | 0.144374624987 | 0.26 |
| `aad.fitset_acetonitrile_water.txy_nrtl_fitP.y_eq_acetonitrile.aadAbs` | 0.0140261205684 | 0.0145939319737 | 0.0405 |

## curate13_synthetic_lle_butanol_water  (tutorials/props/curation/curate13_synthetic_lle_butanol_water)
10 rows; largest relative move 0.4
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.fit_mixed.cond_JtJ` | 29.8172762939 | 28.2473359909 | 0.0527 |
| `diag.fit_mixed.iter` | 5 | 4 | 0.2 |
| `diag.fit_mixed.max_abs_corr` | 0.750661460302 | 0.702358438144 | 0.0643 |
| `diag.fit_mixed_start2.cond_JtJ` | 29.8172762966 | 28.2188862395 | 0.0536 |
| `diag.fit_mixed_start2.iter` | 5 | 3 | 0.4 |
| `diag.fit_mixed_start2.max_abs_corr` | 0.750661460292 | 0.7009863022 | 0.0662 |
| `diag.fit_mixed.fit.0.value` | 150 | 147.340500476 | 0.0177 |
| `diag.fit_mixed.fit.1.value` | 1050 | 1085.51010329 | 0.0338 |
| `diag.fit_mixed_start2.fit.0.value` | 150 | 147.187583011 | 0.0187 |
| `diag.fit_mixed_start2.fit.1.value` | 1050 | 1086.56696597 | 0.0348 |

## curate14_nrtl_butanol_water  (tutorials/props/curation/curate14_nrtl_butanol_water)
94 rows; largest relative move 0.552
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.fit_binodal.aad_heldout_K` | 0.376320388878 | 0.484496587317 | 0.287 |
| `diag.fit_binodal.aad_heldout_pct` | 0.102898498545 | 0.132477465634 | 0.287 |
| `diag.fit_binodal.bubble_aad_fit` | 0.245855038585 | 0.354096906963 | 0.44 |
| `diag.fit_binodal.bubble_aad_heldout` | 0.376320388878 | 0.484496587317 | 0.287 |
| `diag.fit_binodal.bubble_max_fit` | 0.375302576021 | 0.492798374221 | 0.313 |
| `diag.fit_binodal.bubble_max_heldout` | 0.506233276606 | 0.623597734929 | 0.232 |
| `diag.fit_binodal.chi2` | 186.974832041 | 209.846056268 | 0.122 |
| `diag.fit_binodal.chi2_in_sample` | 186.974832041 | 209.846056268 | 0.122 |
| `diag.fit_binodal.chi2_reduced` | 7.47899328162 | 8.39384225073 | 0.122 |
| `diag.fit_binodal.cond_JtJ` | 291.796362448 | 300.556001186 | 0.03 |
| `diag.fit_binodal.iter` | 19 | 21 | 0.105 |
| `diag.fit_binodal.lle_aad_dx` | 0.00491413103118 | 0.00576355104154 | 0.173 |
| `diag.fit_binodal.lle_aad_dx_heldout` | 0.00562471119648 | 0.00750735122454 | 0.335 |
| `diag.fit_binodal.lle_max_abs_dx` | 0.0297521483656 | 0.0312348262426 | 0.0498 |
| `diag.fit_binodal.lle_rel_aad_lean` | 0.0693865567489 | 0.0712533993618 | 0.0269 |
| `diag.fit_binodal.lle_rel_aad_lean_heldout` | 0.0524351091439 | 0.0559744522972 | 0.0675 |
| `diag.fit_binodal.lle_rel_aad_rich` | 0.0185040076936 | 0.0227546284114 | 0.23 |
| `diag.fit_binodal.lle_rel_aad_rich_heldout` | 0.0222587294401 | 0.0315969101917 | 0.42 |
| `diag.fit_binodal.lle_rel_max_lean` | 0.172821088382 | 0.1722388632 | 0.00337 |
| `diag.fit_binodal.lle_rel_max_lean_heldout` | 0.166162890077 | 0.163892312717 | 0.0137 |
| `diag.fit_binodal.lle_rel_max_rich` | 0.0576502642334 | 0.0736847564518 | 0.278 |
| `diag.fit_binodal.lle_rel_max_rich_heldout` | 0.115123005695 | 0.118720037102 | 0.0312 |
| `diag.fit_binodal.max_abs_resid` | 0.375302576021 | 0.492798374221 | 0.313 |
| `diag.fit_binodal.rms` | 0.277851336052 | 0.38029293517 | 0.369 |
| `diag.fit_binodal_start2.aad_heldout_K` | 0.376307191198 | 0.48447008573 | 0.287 |
| `diag.fit_binodal_start2.aad_heldout_pct` | 0.102894889861 | 0.13247021922 | 0.287 |
| `diag.fit_binodal_start2.bubble_aad_fit` | 0.245841851832 | 0.354070416939 | 0.44 |
| `diag.fit_binodal_start2.bubble_aad_heldout` | 0.376307191198 | 0.48447008573 | 0.287 |
| `diag.fit_binodal_start2.bubble_max_fit` | 0.375268254126 | 0.492754821099 | 0.313 |
| `diag.fit_binodal_start2.bubble_max_heldout` | 0.506198932859 | 0.623554158679 | 0.232 |
| `diag.fit_binodal_start2.chi2` | 186.974830181 | 209.846055497 | 0.122 |
| `diag.fit_binodal_start2.chi2_in_sample` | 186.974830181 | 209.846055497 | 0.122 |
| `diag.fit_binodal_start2.chi2_reduced` | 7.47899320724 | 8.3938422199 | 0.122 |
| `diag.fit_binodal_start2.cond_JtJ` | 291.773416283 | 300.55913575 | 0.0301 |
| `diag.fit_binodal_start2.iter` | 29 | 30 | 0.0345 |
| `diag.fit_binodal_start2.lle_aad_dx` | 0.00491462221268 | 0.00576362712983 | 0.173 |
| `diag.fit_binodal_start2.lle_aad_dx_heldout` | 0.00562513860494 | 0.00750762177002 | 0.335 |
| `diag.fit_binodal_start2.lle_max_abs_dx` | 0.029754711712 | 0.0312354305352 | 0.0498 |
| `diag.fit_binodal_start2.lle_rel_aad_lean` | 0.0693865175845 | 0.0712538964168 | 0.0269 |
| `diag.fit_binodal_start2.lle_rel_aad_lean_heldout` | 0.0524344116078 | 0.0559746502761 | 0.0675 |
| `diag.fit_binodal_start2.lle_rel_aad_rich` | 0.0185061429993 | 0.0227550082867 | 0.23 |
| `diag.fit_binodal_start2.lle_rel_aad_rich_heldout` | 0.0222607416352 | 0.0315982187159 | 0.419 |
| `diag.fit_binodal_start2.lle_rel_max_lean` | 0.172823718658 | 0.172241297497 | 0.00337 |
| `diag.fit_binodal_start2.lle_rel_max_lean_heldout` | 0.166161866065 | 0.163886498511 | 0.0137 |
| `diag.fit_binodal_start2.lle_rel_max_rich` | 0.0576552311889 | 0.0736897671901 | 0.278 |
| `diag.fit_binodal_start2.lle_rel_max_rich_heldout` | 0.115126016083 | 0.118721330362 | 0.0312 |
| `diag.fit_binodal_start2.max_abs_resid` | 0.375268254126 | 0.492754821099 | 0.313 |
| `diag.fit_binodal_start2.rms` | 0.277829821515 | 0.380262046632 | 0.369 |
| `diag.report_homogeneous_bubble.aad_heldout_K` | 2.18080043373 | 1.92264146904 | 0.118 |
| `diag.report_homogeneous_bubble.aad_heldout_pct` | 0.586229383445 | 0.517647606931 | 0.117 |
| `diag.report_homogeneous_bubble.bubble_aad_fit` | 0.245855038585 | 0.354096906963 | 0.44 |
| `diag.report_homogeneous_bubble.bubble_aad_heldout` | 2.18080043373 | 1.92264146904 | 0.118 |
| `diag.report_homogeneous_bubble.bubble_max_fit` | 0.375302576021 | 0.492798374221 | 0.313 |
| `diag.report_homogeneous_bubble.bubble_max_heldout` | 3.21803858471 | 2.93976127417 | 0.0865 |
| `diag.report_homogeneous_bubble.chi2` | 186.974832041 | 209.846056268 | 0.122 |
| `diag.report_homogeneous_bubble.chi2_in_sample` | 186.974832041 | 209.846056268 | 0.122 |
| `diag.report_homogeneous_bubble.chi2_reduced` | 7.47899328162 | 8.39384225073 | 0.122 |
| `diag.report_homogeneous_bubble.cond_JtJ` | 291.796362448 | 300.556001186 | 0.03 |
| `diag.report_homogeneous_bubble.iter` | 19 | 21 | 0.105 |
| `diag.report_homogeneous_bubble.lle_aad_dx` | 0.00491413103118 | 0.00576355104154 | 0.173 |
| `diag.report_homogeneous_bubble.lle_max_abs_dx` | 0.0297521483656 | 0.0312348262426 | 0.0498 |
| `diag.report_homogeneous_bubble.lle_rel_aad_lean` | 0.0693865567489 | 0.0712533993618 | 0.0269 |
| `diag.report_homogeneous_bubble.lle_rel_aad_rich` | 0.0185040076936 | 0.0227546284114 | 0.23 |
| `diag.report_homogeneous_bubble.lle_rel_max_lean` | 0.172821088382 | 0.1722388632 | 0.00337 |
| `diag.report_homogeneous_bubble.lle_rel_max_rich` | 0.0576502642334 | 0.0736847564518 | 0.278 |
| `diag.report_homogeneous_bubble.max_abs_resid` | 0.375302576021 | 0.492798374221 | 0.313 |
| `diag.report_homogeneous_bubble.rms` | 0.277851336052 | 0.38029293517 | 0.369 |
| `diag.fit_twoStage.aad_heldout_K` | 0.278221798331 | 0.200982804753 | 0.278 |
| `diag.fit_twoStage.aad_heldout_pct` | 0.076075084308 | 0.0549553769968 | 0.278 |
| `diag.fit_twoStage.bubble_aad_fit` | 0.170275906096 | 0.131073496386 | 0.23 |
| `diag.fit_twoStage.bubble_aad_heldout` | 0.278221798331 | 0.200982804753 | 0.278 |
| `diag.fit_twoStage.bubble_max_fit` | 0.318040263623 | 0.201712056229 | 0.366 |
| `diag.fit_twoStage.bubble_max_heldout` | 0.448955145231 | 0.332400546047 | 0.26 |
| `diag.fit_twoStage.chi2` | 289.402180411 | 230.873633063 | 0.202 |
| `diag.fit_twoStage.chi2_in_sample` | 289.402180411 | 230.873633063 | 0.202 |
| `diag.fit_twoStage.chi2_reduced` | 11.5760872164 | 9.23494532251 | 0.202 |
| `diag.fit_twoStage.cond_JtJ` | 1333.91409292 | 597.11165323 | 0.552 |
| `diag.fit_twoStage.iter` | 19 | 21 | 0.105 |
| `diag.fit_twoStage.lle_aad_dx` | 0.0141077777171 | 0.00797008241706 | 0.435 |
| `diag.fit_twoStage.lle_aad_dx_heldout` | 0.0143293005006 | 0.0101183904854 | 0.294 |
| `diag.fit_twoStage.lle_max_abs_dx` | 0.0774993483765 | 0.0398048420291 | 0.486 |
| `diag.fit_twoStage.lle_rel_aad_lean` | 0.07306466583 | 0.0751840015501 | 0.029 |
| `diag.fit_twoStage.lle_rel_aad_lean_heldout` | 0.0566014272042 | 0.0569398052862 | 0.00598 |
| `diag.fit_twoStage.lle_rel_aad_rich` | 0.0554815230348 | 0.0328706698336 | 0.408 |
| `diag.fit_twoStage.lle_rel_aad_rich_heldout` | 0.0565532617385 | 0.0444467451925 | 0.214 |
| `diag.fit_twoStage.lle_rel_max_lean` | 0.150780563065 | 0.153154071915 | 0.0157 |
| `diag.fit_twoStage.lle_rel_max_lean_heldout` | 0.203041986661 | 0.193253252423 | 0.0482 |
| `diag.fit_twoStage.lle_rel_max_rich` | 0.150169253559 | 0.109958127152 | 0.268 |
| `diag.fit_twoStage.lle_rel_max_rich_heldout` | 0.19131601041 | 0.121460073887 | 0.365 |
| `diag.fit_twoStage.max_abs_corr` | 0.998390894079 | 0.998586868287 | 0.000196 |
| `diag.fit_twoStage.max_abs_resid` | 0.318040263623 | 0.201712056229 | 0.366 |
| `diag.fit_twoStage.minimax_max_scaled_final` | 6.03122252259 | 6.12616287658 | 0.0157 |
| `diag.fit_twoStage.minimax_max_scaled_start` | 6.91284353529 | 6.88955452802 | 0.00337 |
| `diag.fit_twoStage.rms` | 0.225451080175 | 0.14889616379 | 0.34 |

## designSpec01_triple_equal_areas  (tutorials/steady/optimisation/designSpec01_triple_equal_areas)
23 rows; largest relative move 0.0216
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `stream.cond1.F` | 0.136219356305 | 0.136235771033 | 0.000121 |
| `stream.utilitySteam_200kPa.F` | 0.136219356305 | 0.136235771033 | 0.000121 |
| `kpi.effect1.A` | 109.204790334 | 109.318572186 | 0.00104 |
| `kpi.effect1.A_m2` | 109.204790334 | 109.318572186 | 0.00104 |
| `kpi.effect1.F_cond` | 2.45399170384 | 2.45428741515 | 0.000121 |
| `kpi.effect1.F_cond_kg_h` | 8834.37013383 | 8835.43469456 | 0.000121 |
| `kpi.effect1.F_steam` | 2.45399170384 | 2.45428741515 | 0.000121 |
| `kpi.effect1.F_steam_kg_h` | 8834.37013383 | 8835.43469456 | 0.000121 |
| `kpi.effect1.P` | 93250.9310648 | 91235.9537811 | 0.0216 |
| `kpi.effect1.dT` | 21.8790758673 | 21.8589372403 | 0.00092 |
| `kpi.effect1.duty` | 5540786.45139 | 5541454.12816 | 0.000121 |
| `kpi.effect1.duty_kW` | 5540.78645139 | 5541.45412816 | 0.000121 |
| `kpi.effect2.A` | 109.204790334 | 109.318572186 | 0.00104 |
| `kpi.effect2.A_m2` | 109.204790334 | 109.318572186 | 0.00104 |
| `kpi.effect2.P` | 51804.4612644 | 51155.2009726 | 0.0125 |
| `kpi.effect2.dT` | 15.1244741884 | 15.1093783299 | 0.000998 |
| `kpi.effect3.A` | 109.204790334 | 109.318572186 | 0.00104 |
| `kpi.effect3.A_m2` | 109.204790334 | 109.318572186 | 0.00104 |
| `kpi.effect3.T_boil` | 327.55288294 | 327.617828602 | 0.000198 |
| `kpi.effect3.T_sat_pure` | 327.053372803 | 327.118318579 | 0.000199 |
| `kpi.effect3.dT` | 27.6216806042 | 27.5919694274 | 0.00108 |
| `stream.L3.T` | 327.55288294 | 327.617828602 | 0.000198 |
| `stream.V3.T` | 327.55288294 | 327.617828602 | 0.000198 |

## donepezil01_tablets  (tutorials/batch/plant/donepezil01_tablets)
28 rows; largest relative move 0.00494
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.coatedTablets.F` | 0.000238250706177 | 0.000238322639252 | 0.000302 |
| `stream.driedGranules.F` | 0.000230579635669 | 0.000230652295341 | 0.000315 |
| `stream.finalBlend.F` | 0.000231053203001 | 0.000231125862673 | 0.000314 |
| `stream.milledGranules.F` | 0.000230579635669 | 0.000230652295341 | 0.000315 |
| `stream.packagedTablets.F` | 0.000238250706177 | 0.000238322639252 | 0.000302 |
| `stream.tabletCores.F` | 0.000228742670971 | 0.000228814604047 | 0.000314 |
| `stream.tabletRejects.F` | 2.31053203001e-06 | 2.31125862673e-06 | 0.000314 |
| `kpi.coatingDryer.X_equilibrium` | 0.0366995665089 | 0.0368304629086 | 0.00357 |
| `kpi.coatingDryer.X_final` | 0.0366995665089 | 0.0368304629086 | 0.00357 |
| `kpi.coatingDryer.X_initial` | 1.2686995664 | 1.2688304628 | 0.000103 |
| `kpi.coatingDryer.drySolid_flow` | 0.0102633257093 | 0.0102646215837 | 0.000126 |
| `kpi.coatingDryer.exhaust_humidity` | 0.231138377766 | 0.231374135647 | 0.00102 |
| `kpi.coatingDryer.moisture_pct_wb` | 3.54003876287 | 3.55221651236 | 0.00344 |
| `kpi.coatingDryer.water_activity` | 0.0599366053793 | 0.0602325749826 | 0.00494 |
| `kpi.coatingPan.F_out` | 0.00069720375845 | 0.000697275691525 | 0.000103 |
| `kpi.finalBlender.F_out` | 2.03716716692e-05 | 2.04443313415e-05 | 0.00357 |
| `kpi.finalBlender.Q_kW` | -1.33784678112 | -1.33805503825 | 0.000156 |
| `kpi.fluidBedDryer.X_equilibrium` | 0.0366995665089 | 0.0368304629086 | 0.00357 |
| `kpi.fluidBedDryer.X_final` | 0.0366995665089 | 0.0368304629086 | 0.00357 |
| `kpi.fluidBedDryer.drySolid_flow` | 0.010366995666 | 0.01036830463 | 0.000126 |
| `kpi.fluidBedDryer.exhaust_humidity` | 0.248345491905 | 0.248529455256 | 0.000741 |
| `kpi.fluidBedDryer.moisture_pct_wb` | 3.54003876287 | 3.55221651236 | 0.00344 |
| `kpi.fluidBedDryer.water_activity` | 0.0599366053793 | 0.0602325749826 | 0.00494 |
| `kpi.fluidBedDryer.water_removed` | 0.0129530043349 | 0.0129516953709 | 0.000101 |
| `utility.finalBlender.cooling.chilledWater.duty_kW` | -1.33784678112 | -1.33805503825 | 0.000156 |
| `utility.finalBlender.cooling.chilledWater.kg_s` | 0.0637069895773 | 0.0637169065832 | 0.000156 |
| `utility.finalBlender.cooling.chilledWater.eur_h` | 0.0192649936482 | 0.0192679925508 | 0.000156 |
| `kpi.economics.sens_labourRate_IRR_low` | 0.00394786834717 | 0.00394924163818 | 0.000348 |

## donepezil02_two_strengths  (tutorials/batch/plant/donepezil02_two_strengths)
31 rows; largest relative move 0.00494
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.coatedTablets.F` | 0.000238250706177 | 0.000238322639252 | 0.000302 |
| `stream.driedGranules.F` | 0.000230579635669 | 0.000230652295341 | 0.000315 |
| `stream.finalBlend.F` | 0.000231053203001 | 0.000231125862673 | 0.000314 |
| `stream.milledGranules.F` | 0.000230579635669 | 0.000230652295341 | 0.000315 |
| `stream.packagedTablets.F` | 0.000238250706177 | 0.000238322639252 | 0.000302 |
| `stream.tabletCores.F` | 0.000228742670971 | 0.000228814604047 | 0.000314 |
| `stream.tabletRejects.F` | 2.31053203001e-06 | 2.31125862673e-06 | 0.000314 |
| `kpi.coatingDryer.X_equilibrium` | 0.0366995665089 | 0.0368304629086 | 0.00357 |
| `kpi.coatingDryer.X_final` | 0.0366995665089 | 0.0368304629086 | 0.00357 |
| `kpi.coatingDryer.X_initial` | 1.2686995664 | 1.2688304628 | 0.000103 |
| `kpi.coatingDryer.drySolid_flow` | 0.0102633257093 | 0.0102646215837 | 0.000126 |
| `kpi.coatingDryer.exhaust_humidity` | 0.231138377766 | 0.231374135647 | 0.00102 |
| `kpi.coatingDryer.moisture_pct_wb` | 3.54003876287 | 3.55221651236 | 0.00344 |
| `kpi.coatingDryer.water_activity` | 0.0599366053793 | 0.0602325749826 | 0.00494 |
| `kpi.coatingPan.F_out` | 0.00069720375845 | 0.000697275691525 | 0.000103 |
| `kpi.finalBlender.F_out` | 2.03716716692e-05 | 2.04443313415e-05 | 0.00357 |
| `kpi.finalBlender.Q_kW` | -1.33784678112 | -1.33805503825 | 0.000156 |
| `kpi.fluidBedDryer.X_equilibrium` | 0.0366995665089 | 0.0368304629086 | 0.00357 |
| `kpi.fluidBedDryer.X_final` | 0.0366995665089 | 0.0368304629086 | 0.00357 |
| `kpi.fluidBedDryer.drySolid_flow` | 0.010366995666 | 0.01036830463 | 0.000126 |
| `kpi.fluidBedDryer.exhaust_humidity` | 0.248345491905 | 0.248529455256 | 0.000741 |
| `kpi.fluidBedDryer.moisture_pct_wb` | 3.54003876287 | 3.55221651236 | 0.00344 |
| `kpi.fluidBedDryer.water_activity` | 0.0599366053793 | 0.0602325749826 | 0.00494 |
| `kpi.fluidBedDryer.water_removed` | 0.0129530043349 | 0.0129516953709 | 0.000101 |
| `utility.finalBlender.cooling.chilledWater.duty_kW` | -1.33784678112 | -1.33805503825 | 0.000156 |
| `utility.finalBlender.cooling.chilledWater.kg_s` | 0.0637069895773 | 0.0637169065832 | 0.000156 |
| `utility.finalBlender.cooling.chilledWater.eur_h` | 0.0192649936482 | 0.0192679925508 | 0.000156 |
| `batch.dosage:strength10.fluidMassFraction` | 0.00632238862457 | 0.00634479562208 | 0.00354 |
| `batch.dosage:strength10:water.perUnit` | 1.83494685051e-06 | 1.8414500334e-06 | 0.00354 |
| `batch.dosage:strength5.fluidMassFraction` | 0.00632238862457 | 0.00634479562208 | 0.00354 |
| `batch.dosage:strength5:water.perUnit` | 9.17473425255e-07 | 9.20725016699e-07 | 0.00354 |

## dryer01_sucrose_tray  (tutorials/batch/drying/dryer01_sucrose_tray)
13 rows; largest relative move 0.00399
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.campaign.mass_kg_external_out` | 0.560831925217 | 0.560738660881 | 0.000166 |
| `kpi.campaign.moles_kmol_external_out` | 0.0311313863568 | 0.031126209319 | 0.000166 |
| `kpi.campaign.moles_kmol_final` | 0.00801707164323 | 0.00802224868102 | 0.000646 |
| `kpi.dryer.R_constant` | 0.000700569891048 | 0.000700811876659 | 0.000345 |
| `kpi.dryer.X_equilibrium` | 0.0157978541807 | 0.0158609464806 | 0.00399 |
| `kpi.dryer.X_final` | 0.0195840385972 | 0.0196306707648 | 0.00238 |
| `kpi.dryer.latentDuty_kW` | 0.864476040155 | 0.864785718328 | 0.000358 |
| `kpi.dryer.latentEnergy_kJ` | 1384.0896336 | 1383.877191 | 0.000153 |
| `kpi.dryer.n_water_final` | 0.00217419247362 | 0.00217936951141 | 0.00238 |
| `kpi.dryer.t_critical` | 1027.73485145 | 1027.38009265 | 0.000345 |
| `kpi.dryer.totalMoles_final` | 0.00801707164323 | 0.00802224868102 | 0.000646 |
| `ledger.dryer->(external_boundary).material.external.dn.water` | 0.0311313863568 | 0.031126209319 | 0.000166 |
| `ledger.dryer->(external_boundary).material.external.H_kJ` | -7525.88406515 | -7524.63253765 | 0.000166 |

## dryer02_characteristic_curves  (tutorials/batch/drying/dryer02_characteristic_curves)
42 rows; largest relative move 0.004
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.campaign.mass_kg_external_out` | 2.17930775135 | 2.17896631527 | 0.000157 |
| `kpi.campaign.moles_kmol_external_out` | 0.120971842984 | 0.120952890106 | 0.000157 |
| `kpi.campaign.moles_kmol_final` | 0.0356219890164 | 0.0356409418936 | 0.000532 |
| `kpi.concave.R_constant` | 0.000700569891048 | 0.000700811876659 | 0.000345 |
| `kpi.concave.X_equilibrium` | 0.0157978541807 | 0.0158609464806 | 0.00399 |
| `kpi.concave.X_final` | 0.0157978163337 | 0.0158609443687 | 0.004 |
| `kpi.concave.latentDuty_kW` | 0.864476040155 | 0.864785718328 | 0.000358 |
| `kpi.concave.latentEnergy_kJ` | 1402.77783867 | 1402.48421337 | 0.000209 |
| `kpi.concave.n_water_final` | 0.0017538513929 | 0.00176085977872 | 0.004 |
| `kpi.concave.t_critical` | 1027.734787 | 1027.37997268 | 0.000345 |
| `kpi.concave.totalMoles_final` | 0.00759673056251 | 0.00760373894833 | 0.000923 |
| `kpi.convex.R_constant` | 0.000700569891048 | 0.000700811876659 | 0.000345 |
| `kpi.convex.X_equilibrium` | 0.0157978541807 | 0.0158609464806 | 0.00399 |
| `kpi.convex.X_final` | 0.0399468178605 | 0.0399743248097 | 0.000689 |
| `kpi.convex.latentDuty_kW` | 0.864476040155 | 0.864785718328 | 0.000358 |
| `kpi.convex.n_water_final` | 0.00443483964281 | 0.0044378934257 | 0.000689 |
| `kpi.convex.t_critical` | 1027.73498034 | 1027.38033247 | 0.000345 |
| `kpi.convex.totalMoles_final` | 0.0102777188124 | 0.0102807725953 | 0.000297 |
| `kpi.linear.R_constant` | 0.000700569891048 | 0.000700811876659 | 0.000345 |
| `kpi.linear.X_equilibrium` | 0.0157978541807 | 0.0158609464806 | 0.00399 |
| `kpi.linear.X_final` | 0.0195840385972 | 0.0196306707648 | 0.00238 |
| `kpi.linear.latentDuty_kW` | 0.864476040155 | 0.864785718328 | 0.000358 |
| `kpi.linear.latentEnergy_kJ` | 1384.0896336 | 1383.877191 | 0.000153 |
| `kpi.linear.n_water_final` | 0.00217419247362 | 0.00217936951141 | 0.00238 |
| `kpi.linear.t_critical` | 1027.73485145 | 1027.38009265 | 0.000345 |
| `kpi.linear.totalMoles_final` | 0.00801707164323 | 0.00802224868102 | 0.000646 |
| `kpi.measured.R_constant` | 0.000700569891048 | 0.000700811876659 | 0.000345 |
| `kpi.measured.X_equilibrium` | 0.0157978541807 | 0.0158609464806 | 0.00399 |
| `kpi.measured.X_final` | 0.0350174561796 | 0.035050907068 | 0.000955 |
| `kpi.measured.latentDuty_kW` | 0.864476040155 | 0.864785718328 | 0.000358 |
| `kpi.measured.latentEnergy_kJ` | 1307.9126813 | 1307.7643245 | 0.000113 |
| `kpi.measured.n_water_final` | 0.00388758882867 | 0.00389130249935 | 0.000955 |
| `kpi.measured.t_critical` | 1027.73488369 | 1027.38015266 | 0.000345 |
| `kpi.measured.totalMoles_final` | 0.00973046799828 | 0.00973418166896 | 0.000382 |
| `ledger.linear->(external_boundary).material.external.dn.water` | 0.0311313863568 | 0.031126209319 | 0.000166 |
| `ledger.linear->(external_boundary).material.external.H_kJ` | -7525.88406515 | -7524.63253765 | 0.000166 |
| `ledger.concave->(external_boundary).material.external.dn.water` | 0.0315517274375 | 0.0315447190517 | 0.000222 |
| `ledger.concave->(external_boundary).material.external.H_kJ` | -7627.49978522 | -7625.80553689 | 0.000222 |
| `ledger.convex->(external_boundary).material.external.dn.water` | 0.0288707391876 | 0.0288676854047 | 0.000106 |
| `ledger.convex->(external_boundary).material.external.H_kJ` | -6979.38194948 | -6978.64371008 | 0.000106 |
| `ledger.measured->(external_boundary).material.external.dn.water` | 0.0294179900017 | 0.029414276331 | 0.000126 |
| `ledger.measured->(external_boundary).material.external.H_kJ` | -7111.67757341 | -7110.77980887 | 0.000126 |

## economics01_esterification_dcf  (tutorials/steady/economics/economics01_esterification_dcf)
31 rows; largest relative move 0.0219
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liqProd.F` | 0.129368656485 | 0.129542520874 | 0.00134 |
| `stream.vapProd.F` | 0.00952023240395 | 0.00934636801472 | 0.0183 |
| `kpi.economics.NPV` | -987325825.394 | -988665800.428 | 0.00136 |
| `kpi.economics.revenue` | 17896317.1173 | 17618365.4993 | 0.0155 |
| `kpi.heater.T_out` | 362.465321952 | 362.585819911 | 0.000332 |
| `kpi.heater.dT` | 12.4653219518 | 12.5858199107 | 0.00967 |
| `kpi.heater.vf_out` | 0.0177457104718 | 0.0173573801594 | 0.0219 |
| `kpi.separator.F_alpha` | 0.129368656485 | 0.129542520874 | 0.00134 |
| `kpi.separator.F_beta` | 0.00952023240395 | 0.00934636801472 | 0.0183 |
| `kpi.separator.K_aceticAcid` | 0.222416792071 | 0.223408147273 | 0.00446 |
| `kpi.separator.K_ethanol` | 1.53398960565 | 1.54082210982 | 0.00445 |
| `kpi.separator.K_ethylAcetate` | 1.47956160512 | 1.48493170916 | 0.00363 |
| `kpi.separator.K_water` | 0.690970994315 | 0.681746547413 | 0.0133 |
| `kpi.separator.Q` | 257777.2866 | 253223.694131 | 0.0177 |
| `kpi.separator.Q_kW` | 257.7772866 | 253.223694131 | 0.0177 |
| `kpi.separator.T` | 362.465321952 | 362.585819911 | 0.000332 |
| `kpi.separator.V_over_F` | 0.0685456733084 | 0.067293849706 | 0.0183 |
| `utility.heater.heating.steamLP.T` | 362.465321952 | 362.585819911 | 0.000332 |
| `utility.separator.heating.steamLP.duty_kW` | 257.7772866 | 253.223694131 | 0.0177 |
| `utility.separator.heating.steamLP.T` | 362.465321952 | 362.585819911 | 0.000332 |
| `utility.separator.heating.steamLP.kg_s` | 0.117921906038 | 0.115838835376 | 0.0177 |
| `utility.separator.heating.steamLP.eur_h` | 11.1359787811 | 10.9392635865 | 0.0177 |
| `stream.hotStream.T` | 362.465321952 | 362.585819911 | 0.000332 |
| `stream.liqProd.T` | 362.465321952 | 362.585819911 | 0.000332 |
| `stream.vapProd.T` | 362.465321952 | 362.585819911 | 0.000332 |
| `boundary.global.Q_boundary_kW` | 459.393698027 | 454.840105558 | 0.00991 |
| `kpi.economics.C_UT` | 191089.641656 | 189538.739061 | 0.00812 |
| `kpi.economics.grossMargin_RM` | -159893500.233 | -160171451.851 | 0.00174 |
| `kpi.economics.grossMargin_RM_UT` | -160084589.874 | -160360990.59 | 0.00173 |
| `kpi.economics.taxCreditOnLoss` | 427050534.925 | 427630227.342 | 0.00136 |
| `kpi.economics.taxCreditOnLoss_NPV` | 262406178.227 | 262762374.123 | 0.00136 |

## economics02_irr_sweep  (tutorials/steady/economics/economics02_irr_sweep)
30 rows; largest relative move 0.022
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liqProd.F` | 0.128173541272 | 0.128395691332 | 0.00173 |
| `stream.vapProd.F` | 0.0107153476172 | 0.0104931975572 | 0.0207 |
| `kpi.economics.NPV` | -974250173.835 | -976007642.584 | 0.0018 |
| `kpi.economics.revenue` | 20623275.0447 | 20258667.8877 | 0.0177 |
| `kpi.heater.T_out` | 361.876883354 | 362.010322297 | 0.000369 |
| `kpi.heater.dT` | 11.8768833537 | 12.0103222972 | 0.0112 |
| `kpi.heater.vf_out` | 0.0197100051593 | 0.0192760710627 | 0.022 |
| `kpi.separator.F_alpha` | 0.128173541272 | 0.128395691332 | 0.00173 |
| `kpi.separator.F_beta` | 0.0107153476172 | 0.0104931975572 | 0.0207 |
| `kpi.separator.K_aceticAcid` | 0.194031676959 | 0.194999470999 | 0.00499 |
| `kpi.separator.K_ethanol` | 1.50642703273 | 1.51390612904 | 0.00496 |
| `kpi.separator.K_ethylAcetate` | 1.45882471738 | 1.46473144652 | 0.00405 |
| `kpi.separator.K_water` | 0.67788714787 | 0.669408657325 | 0.0125 |
| `kpi.separator.Q` | 289208.789253 | 283106.031744 | 0.0211 |
| `kpi.separator.Q_kW` | 289.208789253 | 283.106031744 | 0.0211 |
| `kpi.separator.T` | 361.876883354 | 362.010322297 | 0.000369 |
| `kpi.separator.V_over_F` | 0.0771505028438 | 0.0755510224119 | 0.0207 |
| `utility.heater.heating.steamLP.T` | 361.876883354 | 362.010322297 | 0.000369 |
| `utility.separator.heating.steamLP.duty_kW` | 289.208789253 | 283.106031744 | 0.0211 |
| `utility.separator.heating.steamLP.T` | 361.876883354 | 362.010322297 | 0.000369 |
| `utility.separator.heating.steamLP.kg_s` | 0.13230045254 | 0.129508706196 | 0.0211 |
| `utility.separator.heating.steamLP.eur_h` | 12.4938196957 | 12.2301805714 | 0.0211 |
| `stream.hotStream.T` | 361.876883354 | 362.010322297 | 0.000369 |
| `stream.liqProd.T` | 361.876883354 | 362.010322297 | 0.000369 |
| `stream.vapProd.T` | 361.876883354 | 362.010322297 | 0.000369 |
| `kpi.economics.C_UT` | 201950.799658 | 199872.268802 | 0.0103 |
| `kpi.economics.grossMargin_RM` | -157166542.305 | -157531149.462 | 0.00232 |
| `kpi.economics.grossMargin_RM_UT` | -157368493.105 | -157731021.731 | 0.0023 |
| `kpi.economics.taxCreditOnLoss` | 421383028.941 | 422143335.126 | 0.0018 |
| `kpi.economics.taxCreditOnLoss_NPV` | 258924023.209 | 259391198.446 | 0.0018 |

## economics04_building_royalty_breakeven  (tutorials/steady/economics/economics04_building_royalty_breakeven)
26 rows; largest relative move 0.0197
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 4.2141939629e-05 | 4.22961617655e-05 | 0.00366 |
| `kpi.dryer.X_equilibrium` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.X_final` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.duty` | 43739.0083213 | 43733.2230723 | 0.000132 |
| `kpi.dryer.moisture_pct_wb` | 1.54492513453 | 1.56915540893 | 0.0157 |
| `kpi.dryer.powder_flow` | 0.0112863590131 | 0.0112891373249 | 0.000246 |
| `kpi.dryer.water_activity` | 0.0767347478428 | 0.0782484301622 | 0.0197 |
| `kpi.dryer.water_evaporated` | 0.0164921771243 | 0.0164893988125 | 0.000168 |
| `kpi.dryer.water_residual` | 0.000174365797166 | 0.000177144108956 | 0.0159 |
| `kpi.economics.IRR` | 0.376288261414 | 0.376572227478 | 0.000755 |
| `kpi.economics.NPV` | 6943518.91646 | 6951153.48248 | 0.0011 |
| `kpi.economics.WCm_sales` | 640667.912108 | 640825.622421 | 0.000246 |
| `kpi.economics.WCm_spread` | 176114.84509 | 175941.654169 | 0.000983 |
| `kpi.economics.breakEven_npv_fraction` | 0.702975761243 | 0.70274445256 | 0.000329 |
| `kpi.economics.breakEven_operating_fraction` | 0.637282331746 | 0.637072845637 | 0.000329 |
| `kpi.economics.breakEven_operating_sales` | 6214478.74745 | 6216008.53748 | 0.000246 |
| `kpi.economics.grossMargin_RM` | 5224046.83498 | 5225623.93811 | 0.000302 |
| `kpi.economics.grossMargin_RM_UT` | 5224046.83498 | 5225623.93811 | 0.000302 |
| `kpi.economics.paybackYears` | 3.141912047 | 3.13930778176 | 0.000829 |
| `kpi.economics.revenue` | 6406679.12108 | 6408256.22421 | 0.000246 |
| `kpi.economics.royalty_total` | 1153202.24179 | 1153486.12036 | 0.000246 |
| `equipment.dryer.values.W_evap` | 0.0164921771243 | 0.0164893988125 | 0.000168 |
| `equipment.dryer.cost.purchased` | 115997.992255 | 115986.267079 | 0.000101 |
| `equipment.dryer.cost.bareModule` | 511319.149859 | 511267.465286 | 0.000101 |
| `equipment.dryer.cost.totalModule` | 603356.596834 | 603295.609037 | 0.000101 |
| `kpi.economics.breakEven_price_powder` | 15.4376071108 | 15.4337147119 | 0.000252 |

## edwards03_table8_vle  (tutorials/props/electrolyte/edwards03_table8_vle)
24 rows; largest relative move 0.013
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `diag.table8_row1.P_atm` | 1.10768 | 1.10215304445 | 0.00499 |
| `diag.table8_row1.p_water_atm` | 0.425102 | 0.419571158847 | 0.013 |
| `diag.table8_row1.y_H2Saq` | 0.0870409 | 0.0874777699483 | 0.00502 |
| `diag.table8_row1.y_NH3aq` | 0.529183 | 0.531839020076 | 0.00502 |
| `diag.table8_row1.y_water` | 0.383776 | 0.380683209976 | 0.00806 |
| `diag.table8_row2.P_atm` | 15.5163 | 15.5111995942 | 0.000329 |
| `diag.table8_row2.p_water_atm` | 0.390265 | 0.385187136007 | 0.013 |
| `diag.table8_row2.y_H2Saq` | 0.97005 | 0.970367098231 | 0.000327 |
| `diag.table8_row2.y_NH3aq` | 0.00479849 | 0.00480006188039 | 0.000328 |
| `diag.table8_row2.y_water` | 0.025152 | 0.0248328398888 | 0.0127 |
| `diag.table8_row3.P_atm` | 16.5527 | 16.5483595672 | 0.000262 |
| `diag.table8_row3.p_water_atm` | 0.339296 | 0.334881149348 | 0.013 |
| `diag.table8_row3.y_H2Saq` | 0.967075 | 0.967333202696 | 0.000267 |
| `diag.table8_row3.y_NH3aq` | 0.012427 | 0.0124302809296 | 0.000264 |
| `diag.table8_row3.y_water` | 0.0204979 | 0.0202365163742 | 0.0128 |
| `diag.table8_row1.y_NH3aq` | 0.543 | 0.531839020076 | 0.00502 |
| `diag.table8_row1.y_H2Saq` | 0.064 | 0.0874777699483 | 0.00502 |
| `diag.table8_row1.P_atm` | 1.08 | 1.10215304445 | 0.00499 |
| `diag.table8_row2.y_NH3aq` | 0.0053 | 0.00480006188039 | 0.000328 |
| `diag.table8_row2.y_H2Saq` | 0.961 | 0.970367098231 | 0.000327 |
| `diag.table8_row2.P_atm` | 12.91 | 15.5111995942 | 0.000329 |
| `diag.table8_row3.y_NH3aq` | 0.016 | 0.0124302809296 | 0.000264 |
| `diag.table8_row3.y_H2Saq` | 0.953 | 0.967333202696 | 0.000267 |
| `diag.table8_row3.P_atm` | 12.64 | 16.5483595672 | 0.000262 |

## envelope04_water_benzene_two_liquids  (tutorials/props/molecular/envelope04_water_benzene_two_liquids)
2 rows; largest relative move 0.105
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `diag.envelope.dew_points` | 38 | 42 | 0.105 |
| `diag.envelope.dew_stopped_bar` | 39 | 43 | 0.103 |

## esterification2sector  (tutorials/steady/flowsheets/esterification2sector)
19 rows; largest relative move 0.0128
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liquid.F` | 0.0145761682868 | 0.014742407187 | 0.0114 |
| `stream.vapor.F` | 0.0132016094909 | 0.0130353705908 | 0.0126 |
| `utility.SEPARATION.flash.cooling.coolingWater.duty_kW` | -218.366919746 | -217.60231525 | 0.0035 |
| `utility.SEPARATION.flash.cooling.coolingWater.kg_s` | 5.22408898914 | 5.20579701554 | 0.0035 |
| `utility.SEPARATION.flash.cooling.coolingWater.eur_h` | 0.314448364435 | 0.313347333959 | 0.0035 |
| `closure.SEPARATION.flash.raw_kW` | 689.239003919 | 682.07994094 | 0.0104 |
| `closure.SEPARATION.flash.step_kW` | 689.239003919 | 682.07994094 | 0.0104 |
| `boundary.global.Q_boundary_kW` | -236.782988943 | -236.018384446 | 0.00323 |
| `boundary.global.H_products_kW` | -9928.04720584 | -9934.44166432 | 0.000644 |
| `boundary.global.residual_kW` | -689.239003919 | -682.07994094 | 0.0104 |
| `kpi.SEPARATION.flash.F_alpha` | 0.0145761682868 | 0.014742407187 | 0.0114 |
| `kpi.SEPARATION.flash.F_beta` | 0.0132016094909 | 0.0130353705908 | 0.0126 |
| `kpi.SEPARATION.flash.K_aceticAcid` | 0.120967085945 | 0.11999345522 | 0.00805 |
| `kpi.SEPARATION.flash.K_ethanol` | 1.43060042114 | 1.43255086324 | 0.00136 |
| `kpi.SEPARATION.flash.K_ethylAcetate` | 2.31601776198 | 2.32073047552 | 0.00203 |
| `kpi.SEPARATION.flash.K_water` | 0.794915980372 | 0.784740353526 | 0.0128 |
| `kpi.SEPARATION.flash.Q` | -218366.919746 | -217602.31525 | 0.0035 |
| `kpi.SEPARATION.flash.Q_kW` | -218.366919746 | -217.60231525 | 0.0035 |
| `kpi.SEPARATION.flash.V_over_F` | 0.475257941674 | 0.469273341268 | 0.0126 |

## eval_nrtl_catalogue  (tutorials/props/molecular/eval_nrtl_catalogue)
5 rows; largest relative move 0.0644
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.catalogue_as_assembled.aad` | 2.0400 | 1.97303598491 | 0.0328 |
| `diag.catalogue_as_assembled.chi2` | 60.1945 | 56.3165263378 | 0.0644 |
| `diag.catalogue_as_assembled.max_abs_resid` | 3.4379 | 3.32629923189 | 0.0325 |
| `diag.catalogue_as_assembled.rms` | 2.3393 | 2.26267191889 | 0.0328 |
| `diag.catalogue_as_assembled.sse` | 60.1945 | 56.3165263378 | 0.0644 |

## eval_nrtl_pinned  (tutorials/props/molecular/eval_nrtl_pinned)
15 rows; largest relative move 0.155
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.scaffold_as_is.aad` | 2.0400 | 1.97303598491 | 0.0328 |
| `diag.scaffold_as_is.chi2` | 60.1945 | 56.3165263378 | 0.0644 |
| `diag.scaffold_as_is.max_abs_resid` | 3.4379 | 3.32629923189 | 0.0325 |
| `diag.scaffold_as_is.rms` | 2.3393 | 2.26267191889 | 0.0328 |
| `diag.scaffold_as_is.sse` | 60.1945 | 56.3165263378 | 0.0644 |
| `diag.rough_paper_values.aad` | 1.5942 | 1.66657402796 | 0.0454 |
| `diag.rough_paper_values.chi2` | 61.7621 | 71.3306667523 | 0.155 |
| `diag.rough_paper_values.max_abs_resid` | 5.5866 | 6.03704113423 | 0.0806 |
| `diag.rough_paper_values.rms` | 2.3695 | 2.54648896883 | 0.0747 |
| `diag.rough_paper_values.sse` | 61.7621 | 71.3306667523 | 0.155 |
| `diag.scaffold_again.aad` | 2.0400 | 1.97303598491 | 0.0328 |
| `diag.scaffold_again.chi2` | 60.1945 | 56.3165263378 | 0.0644 |
| `diag.scaffold_again.max_abs_resid` | 3.4379 | 3.32629923189 | 0.0325 |
| `diag.scaffold_again.rms` | 2.3393 | 2.26267191889 | 0.0328 |
| `diag.scaffold_again.sse` | 60.1945 | 56.3165263378 | 0.0644 |

## evapDryer01_nacl  (tutorials/steady/drying/evapDryer01_nacl)
1 rows; largest relative move 0.0172
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.dryer.exhaust_humidity` | 0.0392946211155 | 0.0399691339581 | 0.0172 |

## evaporator01_brine  (tutorials/steady/evaporation/evaporator01_brine)
1 rows; largest relative move 0.0239
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.evap.P` | 102416.441006 | 99970.4489641 | 0.0239 |

## evaporator02_triple_effect_sugar  (tutorials/steady/evaporation/evaporator02_triple_effect_sugar)
3 rows; largest relative move 0.021
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.effect1.P` | 85795.6465841 | 83994.8064821 | 0.021 |
| `kpi.effect2.P` | 43719.9850074 | 43198.7770652 | 0.0119 |
| `kpi.effect3.P` | 10134.3574354 | 10120.9963497 | 0.00132 |

## evaporator06_nacl_pitzer  (tutorials/steady/evaporation/evaporator06_nacl_pitzer)
3 rows; largest relative move 0.0346
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.evap.BPE` | 4.88457261559 | 4.98845806146 | 0.0213 |
| `kpi.evap.P` | 153069.461258 | 147768.765035 | 0.0346 |
| `kpi.evap.T_sat_pure` | 384.15442701 | 384.050541564 | 0.00027 |

## evaporator07_nacl_enrtl  (tutorials/steady/evaporation/evaporator07_nacl_enrtl)
3 rows; largest relative move 0.0346
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.evap.BPE` | 3.71832264007 | 3.79828662 | 0.0215 |
| `kpi.evap.P` | 159256.516849 | 153741.566902 | 0.0346 |
| `kpi.evap.T_sat_pure` | 385.320676985 | 385.240713005 | 0.000208 |

## evaporator08_naoh_dilution_heat  (tutorials/steady/evaporation/evaporator08_naoh_dilution_heat)
3 rows; largest relative move 0.0289
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.evap.BPE` | 6.36789487997 | 6.48661215257 | 0.0186 |
| `kpi.evap.P` | 108257.142103 | 105125.258575 | 0.0289 |
| `kpi.evap.T_sat_pure` | 374.277882295 | 374.159165023 | 0.000317 |

## evaporator09_nacl_sucrose_brine  (tutorials/steady/evaporation/evaporator09_nacl_sucrose_brine)
3 rows; largest relative move 0.0346
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.evap.BPE` | 4.74289696456 | 4.8439058511 | 0.0213 |
| `kpi.evap.P` | 153810.197907 | 148483.850454 | 0.0346 |
| `kpi.evap.T_sat_pure` | 384.296102661 | 384.195093774 | 0.000263 |

## evaporator11_naoh_olsson_50wt  (tutorials/steady/evaporation/evaporator11_naoh_olsson_50wt)
1 rows; largest relative move 0.00101
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.evap.T_sat_pure` | 319.620697416 | 319.299051881 | 0.00101 |

## evidence01_methanol_water_points  (tutorials/props/compare/evidence01_methanol_water_points)
9 rows; largest relative move 0.135
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `aad.heldout_je200341c.txy_nrtl_points.T_bubble.aadAbs` | 0.534750769231 | 0.605276307692 | 0.132 |
| `aad.heldout_je200341c.txy_nrtl_points.T_bubble.aadRelPct` | 0.150061454094 | 0.16950008204 | 0.13 |
| `aad.heldout_je200341c.txy_nrtl_points.y_eq_methanol.aadAbs` | 0.0125426852538 | 0.0124198888692 | 0.00979 |
| `aad.heldout_je200341c.txy_unifac_points.T_bubble.aadAbs` | 0.366152846154 | 0.316871461538 | 0.135 |
| `aad.heldout_je200341c.txy_unifac_points.T_bubble.aadRelPct` | 0.10093737486 | 0.0881351667579 | 0.127 |
| `aad.heldout_je200341c.txy_unifac_points.y_eq_methanol.aadAbs` | 0.0115561777 | 0.0117136936 | 0.0136 |
| `aad.heldout_je200341c.txy_ideal_points.T_bubble.aadAbs` | 2.768434 | 2.99097946154 | 0.0804 |
| `aad.heldout_je200341c.txy_ideal_points.T_bubble.aadRelPct` | 0.784976912726 | 0.846090697004 | 0.0779 |
| `aad.heldout_je200341c.txy_ideal_points.y_eq_methanol.aadAbs` | 0.0391370889462 | 0.0381325520769 | 0.0257 |

## fitNRTL01_ethanol_water  (tutorials/steady/optimisation/fitNRTL01_ethanol_water)
7 rows; largest relative move 0.625
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.fit_NRTL_ethanol_water.chi2` | 1.04279 | 1.0396443664 | 0.00302 |
| `diag.fit_NRTL_ethanol_water.chi2_reduced` | 0.14897 | 0.148520623771 | 0.00302 |
| `diag.fit_NRTL_ethanol_water.cond_JtJ` | 3.55369e+11 | 319326124535 | 0.101 |
| `diag.fit_NRTL_ethanol_water.iter` | 24 | 39 | 0.625 |
| `diag.fit_NRTL_ethanol_water.max_abs_resid` | 0.625729 | 0.625301496356 | 0.000683 |
| `diag.fit_NRTL_ethanol_water.rms` | 0.307894 | 0.30742986878 | 0.00151 |
| `diag.fit_NRTL_ethanol_water.chi2_in_sample` | 1.04279 | 1.0396443664 | 0.00302 |

## fitNRTL02_thermoml_isobars  (tutorials/steady/optimisation/fitNRTL02_thermoml_isobars)
20 rows; largest relative move 4
Reason: a regression / evaluation against measured VLE now sees water's saturation curve with the IAPWS values: fitted parameters, objective, iteration counts, condition numbers and held-out errors move; the shipped NRTL pair of the case is unchanged

| row | golden | now | relative move |
|---|---|---|---|
| `diag.fit_NRTL_across_isobars.aad_heldout_K` | 0.385655690401 | 0.389541953707 | 0.0101 |
| `diag.fit_NRTL_across_isobars.aad_heldout_pct` | 0.108817419527 | 0.109639705335 | 0.00756 |
| `diag.fit_NRTL_across_isobars.chi2` | 0.930325161527 | 0.9368073478 | 0.00697 |
| `diag.fit_NRTL_across_isobars.chi2_in_sample` | 0.930325161527 | 0.9368073478 | 0.00697 |
| `diag.fit_NRTL_across_isobars.chi2_reduced` | 0.0226908575982 | 0.0228489597024 | 0.00697 |
| `diag.fit_NRTL_across_isobars.cond_JtJ` | 5604973889.67 | 5625032957.65 | 0.00358 |
| `diag.fit_NRTL_across_isobars.iter` | 19 | 18 | 0.0526 |
| `diag.fit_NRTL_across_isobars.max_abs_resid` | 0.367751438189 | 0.369911086672 | 0.00587 |
| `diag.fit_NRTL_across_isobars.rms` | 0.143784187164 | 0.144284237054 | 0.00348 |
| `diag.score_catalogue_pair_at_101kPa.aad` | 0.0821377062998 | 0.070647026756 | 0.14 |
| `diag.score_catalogue_pair_at_101kPa.chi2` | 0.315166181683 | 0.214060725751 | 0.321 |
| `diag.score_catalogue_pair_at_101kPa.max_abs_resid` | 0.275278717435 | 0.26996542683 | 0.0193 |
| `diag.score_catalogue_pair_at_101kPa.max_resid_x1` | 0.018 | 0.09 | 4 |
| `diag.score_catalogue_pair_at_101kPa.rms` | 0.122506789255 | 0.100962210222 | 0.176 |
| `diag.score_catalogue_pair_at_101kPa.sse` | 0.315166181683 | 0.214060725751 | 0.321 |
| `diag.score_catalogue_pair_at_vacuum.aad` | 0.137773764829 | 0.138317919298 | 0.00395 |
| `diag.score_catalogue_pair_at_vacuum.chi2` | 1.17981827153 | 1.21674421107 | 0.0313 |
| `diag.score_catalogue_pair_at_vacuum.max_abs_resid` | 0.3948141285 | 0.418088015777 | 0.0589 |
| `diag.score_catalogue_pair_at_vacuum.rms` | 0.161920300802 | 0.164434668625 | 0.0155 |
| `diag.score_catalogue_pair_at_vacuum.sse` | 1.17981827153 | 1.21674421107 | 0.0313 |

## flash02_ethanol_water  (tutorials/steady/flash/flash02_ethanol_water)
9 rows; largest relative move 0.144
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liquid.F` | 0.00562323865754 | 0.00643042362384 | 0.144 |
| `stream.vapor.F` | 0.0221545391202 | 0.0213473541539 | 0.0364 |
| `kpi.flash02.F_alpha` | 0.00562323865754 | 0.00643042362384 | 0.144 |
| `kpi.flash02.F_beta` | 0.0221545391202 | 0.0213473541539 | 0.0364 |
| `kpi.flash02.V_over_F` | 0.797563408329 | 0.768504749542 | 0.0364 |
| `kpi.flash02.K_ethanol` | 2.22741301451 | 2.16208087469 | 0.0293 |
| `kpi.flash02.K_water` | 0.585036155702 | 0.582904908811 | 0.00364 |
| `boundary.global.H_feeds_kW` | -6774.85012165 | -6808.45853615 | 0.00496 |
| `boundary.global.H_products_kW` | -6774.85012165 | -6808.45853615 | 0.00496 |

## flash03_wilson_ethanol_water  (tutorials/steady/flash/flash03_wilson_ethanol_water)
9 rows; largest relative move 0.135
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liquid.F` | 0.0063767199082 | 0.00724069092308 | 0.135 |
| `stream.vapor.F` | 0.0214010578696 | 0.0205370868547 | 0.0404 |
| `kpi.flash03.F_alpha` | 0.0063767199082 | 0.00724069092308 | 0.135 |
| `kpi.flash03.F_beta` | 0.0214010578696 | 0.0205370868547 | 0.0404 |
| `kpi.flash03.V_over_F` | 0.770438083305 | 0.739335126769 | 0.0404 |
| `kpi.flash03.K_ethanol` | 2.07217514574 | 2.02169806812 | 0.0244 |
| `kpi.flash03.K_water` | 0.595724316445 | 0.593071305515 | 0.00445 |
| `boundary.global.H_feeds_kW` | -6806.11246283 | -6842.05328338 | 0.00528 |
| `boundary.global.H_products_kW` | -6806.11246283 | -6842.05328338 | 0.00528 |

## flash08_co2_water_package  (tutorials/steady/flash/flash08_co2_water_package)
1 rows; largest relative move 0.000971
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.node.K_water` | 0.0312533801141 | 0.0312837353695 | 0.000971 |

## flash09_nh3_water_reactive  (tutorials/steady/flash/flash09_nh3_water_reactive)
10 rows; largest relative move 0.135
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liquid.F` | 0.0224533469429 | 0.0217329980362 | 0.0321 |
| `stream.vapor.F` | 0.00532443083488 | 0.00604477974158 | 0.135 |
| `kpi.flash01.F_alpha` | 0.0224533469429 | 0.0217329980362 | 0.0321 |
| `kpi.flash01.F_beta` | 0.00532443083488 | 0.00604477974158 | 0.135 |
| `kpi.flash01.V_over_F` | 0.191679510056 | 0.217612070697 | 0.135 |
| `kpi.flash01.pH` | 9.899823444 | 9.88028972111 | 0.00197 |
| `kpi.flash01.K_NH3` | 12.1788620031 | 12.1600672871 | 0.00154 |
| `kpi.flash01.K_water` | 0.819273620158 | 0.834840144763 | 0.019 |
| `boundary.global.H_feeds_kW` | -7305.71522163 | -7276.70528544 | 0.00397 |
| `boundary.global.H_products_kW` | -7305.71522163 | -7276.70528544 | 0.00397 |

## flash10_acetic_water_reactive  (tutorials/steady/flash/flash10_acetic_water_reactive)
1 rows; largest relative move 0.0178
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.flash01.p_eq_sum_atm` | 0.82834475465 | 0.843095021026 | 0.0178 |

## flash11_acetic_T_sweep  (tutorials/steady/flash/flash11_acetic_T_sweep)
1 rows; largest relative move 0.0151
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.flash01.p_eq_sum_atm` | 0.376340696323 | 0.382028651 | 0.0151 |

## flash12_nh3_acetic_ethanol_reactive  (tutorials/steady/flash/flash12_nh3_acetic_ethanol_reactive)
1 rows; largest relative move 0.0168
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.flash01.p_eq_sum_atm` | 0.556859777803 | 0.566228627594 | 0.0168 |

## flash13_acetic_ethanol_vacuum_flash  (tutorials/steady/flash/flash13_acetic_ethanol_vacuum_flash)
21 rows; largest relative move 0.172
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liquid.F` | 0.0116941006641 | 0.0105394252349 | 0.0987 |
| `stream.vapor.F` | 0.0160836771137 | 0.0172383525429 | 0.0718 |
| `kpi.flash01.F_alpha` | 0.0116941006641 | 0.0105394252349 | 0.0987 |
| `kpi.flash01.F_beta` | 0.0160836771137 | 0.0172383525429 | 0.0718 |
| `kpi.flash01.Q` | 671656.06605 | 720111.853336 | 0.0721 |
| `kpi.flash01.Q_kW` | 671.65606605 | 720.111853336 | 0.0721 |
| `kpi.flash01.V_over_F` | 0.579012376094 | 0.620580691544 | 0.0718 |
| `kpi.flash01.dimer_share` | 0.0870838206127 | 0.0884675415315 | 0.0159 |
| `kpi.flash01.pH` | 5.00900567054 | 5.05952446459 | 0.0101 |
| `kpi.flash01.p_dimer_atm` | 0.000508532811379 | 0.000526416483833 | 0.0352 |
| `kpi.flash01.p_ethanol_atm` | 0.125966249287 | 0.118851193995 | 0.0565 |
| `kpi.flash01.p_mono_atm` | 0.0053310457441 | 0.00542397475255 | 0.0174 |
| `utility.flash01.heating.steamLP.duty_kW` | 671.65606605 | 720.111853336 | 0.0721 |
| `utility.flash01.heating.steamLP.kg_s` | 0.307253461139 | 0.329419878013 | 0.0721 |
| `utility.flash01.heating.steamLP.eur_h` | 29.0155420534 | 31.1088320641 | 0.0721 |
| `kpi.flash01.K_NH3` | 0.0242448463003 | 0.0284106989397 | 0.172 |
| `kpi.flash01.K_aceticAcid` | 0.286299868819 | 0.273316189645 | 0.0453 |
| `kpi.flash01.K_ethanol` | 10.347348951 | 10.471459489 | 0.012 |
| `kpi.flash01.K_water` | 0.861317907423 | 0.875875557105 | 0.0169 |
| `boundary.global.Q_boundary_kW` | 671.65606605 | 720.111853336 | 0.0721 |
| `boundary.global.H_products_kW` | -7169.253971 | -7120.79818371 | 0.00676 |

## flash14_calcite_carbonate_basis  (tutorials/steady/flash/flash14_calcite_carbonate_basis)
5 rows; largest relative move 0.00902
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.vapor.F` | 0.000583627756178 | 0.000584045726593 | 0.000716 |
| `kpi.flash01.F_beta` | 0.000583627756178 | 0.000584045726593 | 0.000716 |
| `kpi.flash01.V_over_F` | 0.0212202124813 | 0.0212354095327 | 0.000716 |
| `kpi.flash01.K_CO2` | 1777.46971454 | 1777.1624554 | 0.000173 |
| `kpi.flash01.K_water` | 0.0722230740086 | 0.0728743748926 | 0.00902 |

## flash16_calcite_precipitation  (tutorials/steady/flash/flash16_calcite_precipitation)
5 rows; largest relative move 0.00902
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.vapor.F` | 0.000583584558179 | 0.000584003584922 | 0.000718 |
| `kpi.flash01.F_beta` | 0.000583584558179 | 0.000584003584922 | 0.000718 |
| `kpi.flash01.V_over_F` | 0.0212148279253 | 0.0212300606455 | 0.000718 |
| `kpi.flash01.K_CO2` | 1772.76543056 | 1772.58263253 | 0.000103 |
| `kpi.flash01.K_water` | 0.0722361438845 | 0.072887567804 | 0.00902 |

## flash17_two_liquids_reactive  (tutorials/steady/flash/flash17_two_liquids_reactive)
23 rows; largest relative move 10.3
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liquid.F` | 0.0165443840142 | 0.0161378327944 | 0.0246 |
| `stream.vapor.F` | 0.007927838208 | 0.00833438942784 | 0.0513 |
| `kpi.flash01.F_alpha` | 0.0165443840142 | 0.0161378327944 | 0.0246 |
| `kpi.flash01.F_beta` | 0.007927838208 | 0.00833438942784 | 0.0513 |
| `kpi.flash01.Q` | 86.8677617756 | 1.11747281266 | 0.987 |
| `kpi.flash01.Q_kW` | 0.0868677617756 | 0.00111747281266 | 0.987 |
| `kpi.flash01.V_over_F` | 0.323952526093 | 0.340565288765 | 0.0513 |
| `kpi.flash01.dimer_share` | 0.0232924752345 | 0.023366179852 | 0.00316 |
| `kpi.flash01.pH` | 2.89048667096 | 2.88978424746 | 0.000243 |
| `kpi.flash01.p_benzene_atm` | 0.232354234286 | 0.232243891084 | 0.000475 |
| `kpi.flash01.p_dimer_atm` | 1.50693710023e-06 | 1.5167179234e-06 | 0.00649 |
| `kpi.flash01.p_ethanol_atm` | 0.0490830598763 | 0.0485182887025 | 0.0115 |
| `kpi.flash01.p_mono_atm` | 6.31893686833e-05 | 6.33941033148e-05 | 0.00324 |
| `utility.flash01.heating.steamLP.duty_kW` | 0.0868677617756 | 0.00111747281266 | 0.987 |
| `utility.flash01.heating.steamLP.kg_s` | 3.97382258809e-05 | 5.11195248242e-07 | 0.987 |
| `utility.flash01.heating.steamLP.eur_h` | 0.0037526873087 | 4.82748255068e-05 | 0.987 |
| `kpi.flash01.K_aceticAcid` | 0.119086919066 | 0.116920015246 | 0.0182 |
| `kpi.flash01.K_benzene` | 37.5457208913 | 423.883833144 | 10.3 |
| `kpi.flash01.K_ethanol` | 2.08936340481 | 2.09683264489 | 0.00357 |
| `kpi.flash01.K_water` | 0.214213497436 | 0.212351880372 | 0.00869 |
| `boundary.global.H_feeds_kW` | -4808.16305819 | -4793.24845983 | 0.0031 |
| `boundary.global.Q_boundary_kW` | 0.0868677617756 | 0.00111747281266 | 0.987 |
| `boundary.global.H_products_kW` | -4808.07619059 | -4793.24734236 | 0.00308 |

## flash18_water_analysis_basis  (tutorials/steady/flash/flash18_water_analysis_basis)
1 rows; largest relative move 0.00739
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.flash01.p_eq_sum_atm` | 0.0881612782912 | 0.0888124185691 | 0.00739 |

## flash19_organic_and_precipitate  (tutorials/steady/flash/flash19_organic_and_precipitate)
6 rows; largest relative move 0.00901
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.vapor.F` | 0.000803092054611 | 0.00080386887007 | 0.000967 |
| `kpi.flash01.F_beta` | 0.000803092054611 | 0.00080386887007 | 0.000967 |
| `kpi.flash01.V_over_F` | 0.0283360913124 | 0.0283635002671 | 0.000967 |
| `kpi.flash01.K_CO2` | 1726.75504396 | 1726.46512037 | 0.000168 |
| `kpi.flash01.K_benzene` | 18.0678927558 | 18.0765973252 | 0.000482 |
| `kpi.flash01.K_water` | 0.0732111598691 | 0.0738708974988 | 0.00901 |

## flash20_ethanol_water_pcsaft  (tutorials/steady/flash/flash20_ethanol_water_pcsaft)
11 rows; largest relative move 0.278
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liqNRTL.F` | 0.0135537277127 | 0.0141361533423 | 0.043 |
| `stream.vapNRTL.F` | 0.014224050065 | 0.0136416244355 | 0.0409 |
| `kpi.flashNRTL.F_alpha` | 0.0135537277127 | 0.0141361533423 | 0.043 |
| `kpi.flashNRTL.F_beta` | 0.014224050065 | 0.0136416244355 | 0.0409 |
| `kpi.flashNRTL.K_ethanol` | 3.89559152547 | 3.81686845499 | 0.0202 |
| `kpi.flashNRTL.K_water` | 0.602023174315 | 0.594376193524 | 0.0127 |
| `kpi.flashNRTL.V_over_F` | 0.512065802342 | 0.491098479677 | 0.0409 |
| `closure.flashNRTL.raw_kW` | -42.8609974295 | -54.7525149473 | 0.277 |
| `closure.flashNRTL.step_kW` | -42.8609974295 | -54.7525149473 | 0.277 |
| `boundary.global.H_products_kW` | -14057.8085273 | -14069.7069277 | 0.000846 |
| `boundary.global.residual_kW` | 42.8567133915 | 54.7521690997 | 0.278 |

## flash21_brine_co2_pitzer  (tutorials/steady/flash/flash21_brine_co2_pitzer)
4 rows; largest relative move 0.00902
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.vapor.F` | 0.000587353772572 | 0.00058774120073 | 0.00066 |
| `kpi.flash01.F_beta` | 0.000587353772572 | 0.00058774120073 | 0.00066 |
| `kpi.flash01.K_water` | 0.0696646141595 | 0.0702928017108 | 0.00902 |
| `kpi.flash01.V_over_F` | 0.0211447358126 | 0.0211586832263 | 0.00066 |

## gibbs07_wgs_cooled  (tutorials/steady/gibbs/gibbs07_wgs_cooled)
20 rows; largest relative move 0.0532
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.condensate.F` | 3.76244802832e-05 | 3.96249087882e-05 | 0.0532 |
| `stream.gas.F` | 0.000240153299998 | 0.000238152869176 | 0.00833 |
| `kpi.wgs.F_condensate_kmol_h` | 0.135448129019 | 0.142649671637 | 0.0532 |
| `kpi.wgs.F_out_kmol_h` | 0.864551879994 | 0.857350329034 | 0.00833 |
| `kpi.wgs.N_liq_mol_s` | 0.0376244802832 | 0.0396249087882 | 0.0532 |
| `kpi.wgs.lambda_C` | 50085.9480936 | 50226.3884709 | 0.0028 |
| `kpi.wgs.lambda_H` | -24736.1727481 | -24724.0041247 | 0.000492 |
| `kpi.wgs.lambda_O` | -261102.548343 | -261160.599908 | 0.000222 |
| `kpi.wgs.liquidFraction` | 0.135448127799 | 0.142649671542 | 0.0532 |
| `kpi.wgs.y_CO` | 2.22116336462e-05 | 2.28494695715e-05 | 0.0287 |
| `kpi.wgs.y_CO2` | 0.289144934707 | 0.291573236207 | 0.0084 |
| `kpi.wgs.y_H2` | 0.289144934706 | 0.291573236207 | 0.0084 |
| `kpi.wgs.y_water` | 0.421687918954 | 0.416830678116 | 0.0115 |
| `kpi.wgs.Q_kW` | 2.24929156612 | 2.20687686277 | 0.0189 |
| `boundary.global.H_feeds_kW` | -64.2741918385 | -64.3166143058 | 0.00066 |
| `boundary.global.Q_boundary_kW` | 2.24929156612 | 2.20687686277 | 0.0189 |
| `boundary.global.H_products_kW` | -62.0249002724 | -62.109737443 | 0.00137 |
| `utility.wgs.heating.steamLP.duty_kW` | 2.24929156612 | 2.20687686277 | 0.0189 |
| `utility.wgs.heating.steamLP.kg_s` | 0.00102895314095 | 0.00100955025744 | 0.0189 |
| `utility.wgs.heating.steamLP.eur_h` | 0.0971693956562 | 0.0953370804718 | 0.0189 |

## gibbs08_wgs_cooled_reactiveflash  (tutorials/steady/gibbs/gibbs08_wgs_cooled_reactiveflash)
20 rows; largest relative move 0.0532
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.condensate.F` | 3.76244802827e-05 | 3.9624908788e-05 | 0.0532 |
| `stream.gas.F` | 0.000240153299999 | 0.000238152869176 | 0.00833 |
| `kpi.wgs.F_condensate_kmol_h` | 0.135448129018 | 0.142649671637 | 0.0532 |
| `kpi.wgs.F_out_kmol_h` | 0.864551879995 | 0.857350329035 | 0.00833 |
| `kpi.wgs.N_liq_mol_s` | 0.0376244802827 | 0.039624908788 | 0.0532 |
| `kpi.wgs.lambda_C` | 50085.9480935 | 50226.3884709 | 0.0028 |
| `kpi.wgs.lambda_H` | -24736.1727482 | -24724.0041247 | 0.000492 |
| `kpi.wgs.lambda_O` | -261102.548343 | -261160.599908 | 0.000222 |
| `kpi.wgs.liquidFraction` | 0.135448127797 | 0.142649671541 | 0.0532 |
| `kpi.wgs.y_CO` | 2.2211633646e-05 | 2.28494695714e-05 | 0.0287 |
| `kpi.wgs.y_CO2` | 0.289144934706 | 0.291573236207 | 0.0084 |
| `kpi.wgs.y_H2` | 0.289144934706 | 0.291573236207 | 0.0084 |
| `kpi.wgs.y_water` | 0.421687918955 | 0.416830678116 | 0.0115 |
| `kpi.wgs.Q_kW` | 2.24929156621 | 2.20687686277 | 0.0189 |
| `boundary.global.H_feeds_kW` | -64.2741918385 | -64.3166143058 | 0.00066 |
| `boundary.global.Q_boundary_kW` | 2.24929156621 | 2.20687686277 | 0.0189 |
| `boundary.global.H_products_kW` | -62.0249002723 | -62.109737443 | 0.00137 |
| `utility.wgs.heating.steamLP.duty_kW` | 2.24929156621 | 2.20687686277 | 0.0189 |
| `utility.wgs.heating.steamLP.kg_s` | 0.00102895314099 | 0.00100955025744 | 0.0189 |
| `utility.wgs.heating.steamLP.eur_h` | 0.0971693956602 | 0.0953370804718 | 0.0189 |

## gibbs09_wgs_cooled_directmin  (tutorials/steady/gibbs/gibbs09_wgs_cooled_directmin)
20 rows; largest relative move 0.924
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.condensate.F` | 3.77682013579e-05 | 3.97705286908e-05 | 0.053 |
| `stream.gas.F` | 0.00024000957642 | 0.000238007249087 | 0.00834 |
| `kpi.wgs.F_condensate_kmol_h` | 0.135965524888 | 0.143173903287 | 0.053 |
| `kpi.wgs.F_out_kmol_h` | 0.864034475112 | 0.856826096713 | 0.00834 |
| `kpi.wgs.N_liq_mol_s` | 0.0377682013579 | 0.0397705286908 | 0.053 |
| `kpi.wgs.liquidFraction` | 0.135965524888 | 0.143173903287 | 0.053 |
| `kpi.wgs.x_CO` | 7.94354975652e-07 | 6.01696875611e-08 | 0.924 |
| `kpi.wgs.x_CO2` | 0.000257403452617 | 0.000255913323744 | 0.00579 |
| `kpi.wgs.x_H2` | 0.000397591162816 | 0.000373896033917 | 0.0596 |
| `kpi.wgs.y_CO` | 2.17407050554e-05 | 2.31507299207e-05 | 0.0649 |
| `kpi.wgs.y_CO2` | 0.289277935639 | 0.291708569668 | 0.0084 |
| `kpi.wgs.y_H2` | 0.289255875529 | 0.291688854996 | 0.00841 |
| `kpi.wgs.y_water` | 0.421444448128 | 0.416579424606 | 0.0115 |
| `kpi.wgs.Q_kW` | 2.2453837395 | 2.20288686543 | 0.0189 |
| `boundary.global.H_feeds_kW` | -64.2741918385 | -64.3166143058 | 0.00066 |
| `boundary.global.Q_boundary_kW` | 2.2453837395 | 2.20288686543 | 0.0189 |
| `boundary.global.H_products_kW` | -62.028808099 | -62.1137274404 | 0.00137 |
| `utility.wgs.heating.steamLP.duty_kW` | 2.2453837395 | 2.20288686543 | 0.0189 |
| `utility.wgs.heating.steamLP.kg_s` | 0.0010271654801 | 0.00100772500706 | 0.0189 |
| `utility.wgs.heating.steamLP.eur_h` | 0.0970005775463 | 0.0951647125864 | 0.0189 |

## heatExchanger03_pure_water_plateau  (tutorials/steady/heat/heatExchanger03_pure_water_plateau)
11 rows; largest relative move 1.56
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.condensate.T` | 572.172481697 | 584.147413687 | 0.0209 |
| `stream.wetFeed.T` | 515.579742002 | 523.503611318 | 0.0154 |
| `stream.wetSteam.T` | 572.172481734 | 584.147413666 | 0.0209 |
| `kpi.boilerHX.LMTD` | 133.007049666 | 137.156254076 | 0.0312 |
| `kpi.boilerHX.T_cold_out` | 515.579742002 | 523.503611318 | 0.0154 |
| `kpi.boilerHX.T_hot_out` | 572.172481734 | 584.147413666 | 0.0209 |
| `kpi.trimCooler.T_in` | 572.172481734 | 584.147413666 | 0.0209 |
| `kpi.trimCooler.T_out` | 572.172481697 | 584.147413687 | 0.0209 |
| `kpi.trimCooler.dT` | -3.72660906578e-08 | 2.08617620956e-08 | 1.56 |
| `kpi.trimCooler.vf_out` | 0.416118946631 | 0.39463003701 | 0.0516 |
| `utility.trimCooler.cooling.coolingWater.T` | 572.172481697 | 584.147413687 | 0.0209 |

## hxy01_ethanol_water_1atm  (tutorials/props/scan/hxy01_ethanol_water_1atm)
3 rows; largest relative move 0.0018
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `diag.hxy.T_bubble_pure2_K` | 372.453622433 | 373.124295805 | 0.0018 |
| `diag.hxy.h_liquid_pure2_J_per_mol` | -280791.66824 | -280741.0324 | 0.00018 |
| `diag.hxy.lambda_max_J_per_mol` | 45052.6104262 | 45082.0315001 | 0.000653 |

## landscape07_sugar_nitrogen_all_pathways  (tutorials/props/gibbs/landscape07_sugar_nitrogen_all_pathways)
1 rows; largest relative move 0.000713
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `diag.sugarNitrogen.metric_T25C_P1atm` | 1.27109422855e-06 | 1.27200010837e-06 | 0.000713 |

## marcilla01_lls_tie_triangle  (tutorials/steady/flash/marcilla01_lls_tie_triangle)
1 rows; largest relative move 0.00191
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.flash01.p_eq_sum_atm` | 0.0415604200493 | 0.0416398096132 | 0.00191 |

## marcilla02_lls_ternary_invariant  (tutorials/steady/flash/marcilla02_lls_ternary_invariant)
1 rows; largest relative move 0.00247
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.flash01.p_eq_sum_atm` | 0.032687682758 | 0.0327682915498 | 0.00247 |

## model1_lumped_evaporator  (tutorials/steady/thermoTest/model1_lumped_evaporator)
1 rows; largest relative move 0.0334
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.evap.P` | 170383.713139 | 164685.877532 | 0.0334 |

## model2_pitzer_evaporator  (tutorials/steady/thermoTest/model2_pitzer_evaporator)
3 rows; largest relative move 0.0346
Reason: boiling pressure = water's saturation pressure at the brine temperature: the IAPWS value is 2-3 % lower than Antoine at 373-380 K

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.evap.BPE` | 4.88457261559 | 4.98845806146 | 0.0213 |
| `kpi.evap.P` | 153069.461258 | 147768.765035 | 0.0346 |
| `kpi.evap.T_sat_pure` | 384.15442701 | 384.050541564 | 0.00027 |

## model5_nrtl_flash  (tutorials/steady/thermoTest/model5_nrtl_flash)
9 rows; largest relative move 0.172
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liquid.F` | 0.0170966158658 | 0.0189285598126 | 0.107 |
| `stream.vapor.F` | 0.010681161912 | 0.00884921796519 | 0.172 |
| `kpi.flash.F_alpha` | 0.0170966158658 | 0.0189285598126 | 0.107 |
| `kpi.flash.F_beta` | 0.010681161912 | 0.00884921796519 | 0.172 |
| `kpi.flash.V_over_F` | 0.384521828832 | 0.318571846747 | 0.172 |
| `kpi.flash.K_ethanol` | 1.4838682811 | 1.45034938624 | 0.0226 |
| `kpi.flash.K_water` | 0.647356121192 | 0.650061126046 | 0.00418 |
| `boundary.global.H_feeds_kW` | -7253.87753456 | -7329.56636461 | 0.0104 |
| `boundary.global.H_products_kW` | -7253.87753456 | -7329.56636461 | 0.0104 |

## olsson01_naoh_high_concentration  (tutorials/props/electrolyte/olsson01_naoh_high_concentration)
29 rows; largest relative move 0.0382
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `diag.olsson_table.BPE_exact_w10_T025` | 1.80251536263 | 1.80328427316 | 0.000427 |
| `diag.olsson_table.BPE_exact_w10_T060` | 2.31236655437 | 2.32765250363 | 0.00661 |
| `diag.olsson_table.BPE_exact_w10_T100` | 2.95757816867 | 3.00848834389 | 0.0172 |
| `diag.olsson_table.BPE_exact_w10_T150` | 3.83884180122 | 3.95460087892 | 0.0302 |
| `diag.olsson_table.BPE_exact_w10_T200` | 4.76628928396 | 4.94829026885 | 0.0382 |
| `diag.olsson_table.BPE_exact_w20_T025` | 5.47798679216 | 5.47936033439 | 0.000251 |
| `diag.olsson_table.BPE_exact_w20_T060` | 6.55134596354 | 6.59080452994 | 0.00602 |
| `diag.olsson_table.BPE_exact_w20_T100` | 7.62135422178 | 7.74563628303 | 0.0163 |
| `diag.olsson_table.BPE_exact_w20_T150` | 8.73317537575 | 8.98805178435 | 0.0292 |
| `diag.olsson_table.BPE_exact_w20_T200` | 9.6003506946 | 9.96035298372 | 0.0375 |
| `diag.olsson_table.BPE_exact_w30_T060` | 14.5490653749 | 14.6216332356 | 0.00499 |
| `diag.olsson_table.BPE_exact_w30_T100` | 16.1413199627 | 16.3784696947 | 0.0147 |
| `diag.olsson_table.BPE_exact_w30_T150` | 17.5851083915 | 18.0673102339 | 0.0274 |
| `diag.olsson_table.BPE_exact_w30_T200` | 18.4224764065 | 19.0892078453 | 0.0362 |
| `diag.olsson_table.BPE_exact_w40_T025` | 24.2500408758 | 24.2458974063 | 0.000171 |
| `diag.olsson_table.BPE_exact_w40_T060` | 26.1712934159 | 26.2672930404 | 0.00367 |
| `diag.olsson_table.BPE_exact_w40_T100` | 28.1664169639 | 28.5189894199 | 0.0125 |
| `diag.olsson_table.BPE_exact_w40_T150` | 30.3514164723 | 31.106284719 | 0.0249 |
| `diag.olsson_table.BPE_exact_w40_T200` | 32.1857648338 | 33.2808718961 | 0.034 |
| `diag.olsson_table.BPE_exact_w50_T025` | 37.3357639969 | 37.3317806375 | 0.000107 |
| `diag.olsson_table.BPE_exact_w50_T060` | 39.5174604383 | 39.6142918452 | 0.00245 |
| `diag.olsson_table.BPE_exact_w50_T100` | 42.182045604 | 42.6109664193 | 0.0102 |
| `diag.olsson_table.BPE_exact_w50_T150` | 45.6178439707 | 46.6144323751 | 0.0218 |
| `diag.olsson_table.BPE_exact_w50_T200` | 49.148298756 | 50.6808430267 | 0.0312 |
| `diag.olsson_vs_parker.BPE_exact_m15_T025` | 21.0504423554 | 21.04711861 | 0.000158 |
| `diag.olsson_vs_parker.BPE_exact_m20_T025` | 30.2098151432 | 30.205668968 | 0.000137 |
| `diag.olsson_vs_parker.BPE_exact_m6_T025` | 5.13555231144 | 5.13691779292 | 0.000266 |
| `diag.olsson_vs_geankoplis.BPE_exact_w20_T060` | 6.55134596354 | 6.59080452994 | 0.00602 |
| `diag.olsson_vs_geankoplis_hL.BPE_exact_w50_T090` | 41.4745656468 | 41.8000106461 | 0.00785 |

## optim02_process_cost  (tutorials/steady/optimisation/optim02_process_cost)
23 rows; largest relative move 0.0506
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liqProd.F` | 0.000262296730579 | 0.000262607029314 | 0.00118 |
| `stream.vapProd.F` | 1.54810471987e-05 | 1.51707484634e-05 | 0.02 |
| `kpi.heater.T_out` | 362.682528249 | 362.794290106 | 0.000308 |
| `kpi.heater.dT` | 12.6825282488 | 12.7942901059 | 0.00881 |
| `kpi.heater.vf_out` | 0.007219298656 | 0.00685403996057 | 0.0506 |
| `kpi.separator.F_alpha` | 0.000262296730579 | 0.000262607029314 | 0.00118 |
| `kpi.separator.F_beta` | 1.54810471987e-05 | 1.51707484634e-05 | 0.02 |
| `kpi.separator.K_aceticAcid` | 0.235790490417 | 0.236729310603 | 0.00398 |
| `kpi.separator.K_ethanol` | 1.54288379713 | 1.54924667955 | 0.00412 |
| `kpi.separator.K_ethylAcetate` | 1.48593939965 | 1.49093244094 | 0.00336 |
| `kpi.separator.K_water` | 0.695229837072 | 0.685632421297 | 0.0138 |
| `kpi.separator.Q` | 494.081604694 | 486.120712153 | 0.0161 |
| `kpi.separator.Q_kW` | 0.494081604694 | 0.486120712153 | 0.0161 |
| `kpi.separator.T` | 362.682528249 | 362.794290106 | 0.000308 |
| `kpi.separator.V_over_F` | 0.0557317699153 | 0.0546146944683 | 0.02 |
| `utility.heater.heating.steamLP.T` | 362.682528249 | 362.794290106 | 0.000308 |
| `utility.separator.heating.steamLP.duty_kW` | 0.494081604694 | 0.486120712153 | 0.0161 |
| `utility.separator.heating.steamLP.T` | 362.682528249 | 362.794290106 | 0.000308 |
| `utility.separator.heating.steamLP.kg_s` | 0.000226020862166 | 0.000222379099795 | 0.0161 |
| `utility.separator.heating.steamLP.eur_h` | 0.0213443253228 | 0.021000414765 | 0.0161 |
| `stream.hotStream.T` | 362.682528249 | 362.794290106 | 0.000308 |
| `stream.liqProd.T` | 362.682528249 | 362.794290106 | 0.000308 |
| `stream.vapProd.T` | 362.682528249 | 362.794290106 | 0.000308 |

## optim05_reactor_npv  (tutorials/steady/optimisation/optim05_reactor_npv)
30 rows; largest relative move 0.046
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liqProd.F` | 0.128191237075 | 0.128480705112 | 0.00226 |
| `stream.vapProd.F` | 0.0106976518142 | 0.0104081837773 | 0.0271 |
| `kpi.economics.NPV` | -653680097.68 | -656416145.131 | 0.00419 |
| `kpi.economics.revenue` | 86662663.8339 | 86095524.3552 | 0.00654 |
| `kpi.heater.T_out` | 361.239318114 | 361.381490655 | 0.000394 |
| `kpi.heater.dT` | 8.73931811369 | 8.8814906553 | 0.0163 |
| `kpi.heater.vf_out` | 0.0103556925435 | 0.00987959391943 | 0.046 |
| `kpi.separator.F_alpha` | 0.128191237075 | 0.128480705112 | 0.00226 |
| `kpi.separator.F_beta` | 0.0106976518142 | 0.0104081837773 | 0.0271 |
| `kpi.separator.K_aceticAcid` | 0.166946426022 | 0.167875666505 | 0.00557 |
| `kpi.separator.K_ethanol` | 1.47454691512 | 1.48238565376 | 0.00532 |
| `kpi.separator.K_ethylAcetate` | 1.43419628947 | 1.44041678452 | 0.00434 |
| `kpi.separator.K_water` | 0.662832322744 | 0.655010321276 | 0.0118 |
| `kpi.separator.Q` | 332771.501606 | 324428.657807 | 0.0251 |
| `kpi.separator.Q_kW` | 332.771501606 | 324.428657807 | 0.0251 |
| `kpi.separator.T` | 361.239318114 | 361.381490655 | 0.000394 |
| `kpi.separator.V_over_F` | 0.0770230930621 | 0.0749389231968 | 0.0271 |
| `utility.heater.heating.steamLP.T` | 361.239318114 | 361.381490655 | 0.000394 |
| `utility.separator.heating.steamLP.duty_kW` | 332.771501606 | 324.428657807 | 0.0251 |
| `utility.separator.heating.steamLP.T` | 361.239318114 | 361.381490655 | 0.000394 |
| `utility.separator.heating.steamLP.kg_s` | 0.152228500277 | 0.148412011806 | 0.0251 |
| `utility.separator.heating.steamLP.eur_h` | 14.3757288694 | 14.0153180173 | 0.0251 |
| `stream.hotStream.T` | 361.239318114 | 361.381490655 | 0.000394 |
| `stream.liqProd.T` | 361.239318114 | 361.381490655 | 0.000394 |
| `stream.vapProd.T` | 361.239318114 | 361.381490655 | 0.000394 |
| `kpi.economics.C_UT` | 182854.320553 | 180012.841395 | 0.0155 |
| `kpi.economics.grossMargin_RM` | -91127153.5161 | -91694292.9948 | 0.00622 |
| `kpi.economics.grossMargin_RM_UT` | -91310007.8366 | -91874305.8362 | 0.00618 |
| `kpi.economics.taxCreditOnLoss` | 282687223.001 | 283870876.366 | 0.00419 |
| `kpi.economics.taxCreditOnLoss_NPV` | 173701783.691 | 174429087.443 | 0.00419 |

## perUnitThermo01_srk_nrtl  (tutorials/steady/thermo/perUnitThermo01_srk_nrtl)
14 rows; largest relative move 0.172
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liquid.F` | 0.00854830793289 | 0.00946427990629 | 0.107 |
| `stream.vapor.F` | 0.005340580956 | 0.00442460898259 | 0.172 |
| `kpi.flash.F_alpha` | 0.00854830793289 | 0.00946427990629 | 0.107 |
| `kpi.flash.F_beta` | 0.005340580956 | 0.00442460898259 | 0.172 |
| `kpi.flash.K_ethanol` | 1.4838682811 | 1.45034938624 | 0.0226 |
| `kpi.flash.K_water` | 0.647356121192 | 0.650061126046 | 0.00418 |
| `kpi.flash.Q` | -413177.313739 | -451021.728762 | 0.0916 |
| `kpi.flash.Q_kW` | -413.177313739 | -451.021728762 | 0.0916 |
| `kpi.flash.V_over_F` | 0.384521828832 | 0.318571846747 | 0.172 |
| `utility.flash.cooling.coolingWater.duty_kW` | -413.177313739 | -451.021728762 | 0.0916 |
| `utility.flash.cooling.coolingWater.kg_s` | 9.88462473059 | 10.7899935111 | 0.0916 |
| `utility.flash.cooling.coolingWater.eur_h` | 0.594975331784 | 0.649471289417 | 0.0916 |
| `boundary.global.Q_boundary_kW` | -416.177313739 | -454.021728762 | 0.0909 |
| `boundary.global.H_products_kW` | -3626.93876728 | -3664.78318231 | 0.0104 |

## pfr_polyesterification  (tutorials/steady/reactors/pfr_polyesterification)
6 rows; largest relative move 0.00283
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.reactor.Q_kW` | -41.5396166744 | -41.6570319562 | 0.00283 |
| `boundary.global.Q_boundary_kW` | -41.5396166744 | -41.6570319562 | 0.00283 |
| `boundary.global.H_products_kW` | -235.151929275 | -235.269344556 | 0.000499 |
| `utility.reactor.cooling.coolingWater.duty_kW` | -41.5396166744 | -41.6570319562 | 0.00283 |
| `utility.reactor.cooling.coolingWater.kg_s` | 0.993770733836 | 0.996579711872 | 0.00283 |
| `utility.reactor.cooling.coolingWater.eur_h` | 0.0598170480111 | 0.059986126017 | 0.00283 |

## polycaprolactonePlant  (tutorials/plant/polycaprolactonePlant)
28 rows; largest relative move 0.0962
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.condensate.F` | 0.000284422479659 | 0.000284144014829 | 0.000979 |
| `stream.condensateRecycle.F` | 5.01922022927e-05 | 5.01430614404e-05 | 0.000979 |
| `stream.overhead.F` | 0.000334614681951 | 0.000334287076269 | 0.000979 |
| `stream.polymerMelt.F` | 0.000265730981876 | 0.000266009767806 | 0.00105 |
| `stream.reactorFeed.F` | 0.000327969981121 | 0.000327920839218 | 0.00015 |
| `kpi.Devolatiliser.F_alpha` | 0.000265730981876 | 0.000266009767806 | 0.00105 |
| `kpi.Devolatiliser.F_beta` | 0.000334614681951 | 0.000334287076269 | 0.000979 |
| `kpi.Devolatiliser.Q` | 2195.02758655 | 2198.49094759 | 0.00158 |
| `kpi.Devolatiliser.Q_kW` | 2.19502758655 | 2.19849094759 | 0.00158 |
| `kpi.Devolatiliser.V_over_F` | 0.557370032155 | 0.556869621369 | 0.000898 |
| `kpi.Mixer.F_out` | 0.000327969981121 | 0.000327920839218 | 0.00015 |
| `kpi.Reactor.Mn_kg_kmol` | 5408.64200674 | 5409.39924894 | 0.00014 |
| `kpi.Reactor.Mw_kg_kmol` | 10703.1440135 | 10704.6584979 | 0.000141 |
| `kpi.Reactor.Xn` | 47.3860347532 | 47.3926690813 | 0.00014 |
| `kpi.Reactor.Xw` | 93.7720695065 | 93.7853381626 | 0.000141 |
| `utility.Devolatiliser.heating.steamHP.duty_kW` | 2.19502758655 | 2.19849094759 | 0.00158 |
| `utility.Devolatiliser.heating.steamHP.kg_s` | 0.00128064619985 | 0.00128266683057 | 0.00158 |
| `utility.Devolatiliser.heating.steamHP.eur_h` | 0.142237787608 | 0.142462213404 | 0.00158 |
| `kpi.Devolatiliser.K_water` | 107.337073481 | 97.0060425466 | 0.0962 |
| `kpi.Reactor.Q_kW` | -42.3597775728 | -42.3538316737 | 0.00014 |
| `boundary.global.Q_boundary_kW` | -38.0202339379 | -38.0314521127 | 0.000295 |
| `utility.Reactor.cooling.coolingWater.duty_kW` | -42.3597775728 | -42.3538316737 | 0.00014 |
| `utility.Reactor.cooling.coolingWater.kg_s` | 1.01339180796 | 1.01324956157 | 0.00014 |
| `utility.Reactor.cooling.coolingWater.eur_h` | 0.0609980797048 | 0.0609895176101 | 0.00014 |
| `kpi.Mixer.Q_kW` | 2.14451604828 | 2.12388861342 | 0.00962 |
| `utility.Mixer.heating.steamHP.duty_kW` | 2.14451604828 | 2.12388861342 | 0.00962 |
| `utility.Mixer.heating.steamHP.kg_s` | 0.0012511762242 | 0.00123914154809 | 0.00962 |
| `utility.Mixer.heating.steamHP.eur_h` | 0.138964639929 | 0.13762798215 | 0.00962 |

## process01_reactor_flash  (tutorials/steady/flowsheets/process01_reactor_flash)
16 rows; largest relative move 0.0569
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liqProd.F` | 0.000215411937156 | 0.00021895871194 | 0.0165 |
| `stream.vapProd.F` | 6.23658406214e-05 | 5.88190658382e-05 | 0.0569 |
| `kpi.separator.F_alpha` | 0.000215411937156 | 0.00021895871194 | 0.0165 |
| `kpi.separator.F_beta` | 6.23658406214e-05 | 5.88190658382e-05 | 0.0569 |
| `kpi.separator.K_aceticAcid` | 0.30621920344 | 0.304781793833 | 0.00469 |
| `kpi.separator.K_ethanol` | 1.65757688082 | 1.65833584708 | 0.000458 |
| `kpi.separator.K_ethylAcetate` | 1.57152489695 | 1.57224448012 | 0.000458 |
| `kpi.separator.K_water` | 0.749803032883 | 0.735683883798 | 0.0188 |
| `kpi.separator.Q` | 2801.23582766 | 2669.95942065 | 0.0469 |
| `kpi.separator.Q_kW` | 2.80123582766 | 2.66995942065 | 0.0469 |
| `kpi.separator.V_over_F` | 0.224517026237 | 0.211748637018 | 0.0569 |
| `utility.separator.heating.steamLP.duty_kW` | 2.80123582766 | 2.66995942065 | 0.0469 |
| `utility.separator.heating.steamLP.kg_s` | 0.00128144365401 | 0.00122139040286 | 0.0469 |
| `utility.separator.heating.steamLP.eur_h` | 0.121013387755 | 0.115342246972 | 0.0469 |
| `boundary.global.Q_boundary_kW` | 2.65292162295 | 2.52164521593 | 0.0495 |
| `boundary.global.H_products_kW` | -101.479073276 | -101.610348446 | 0.00129 |

## process02_reactor_hx_flash  (tutorials/steady/flowsheets/process02_reactor_hx_flash)
24 rows; largest relative move 0.0149
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liqProd.F` | 0.000251528388336 | 0.000251756534558 | 0.000907 |
| `stream.vapProd.F` | 2.62493894422e-05 | 2.60212432198e-05 | 0.00869 |
| `kpi.heater.T_out` | 363.748275638 | 363.848773097 | 0.000276 |
| `kpi.heater.dT` | 13.7482756377 | 13.8487730972 | 0.00731 |
| `kpi.heater.vf_out` | 0.0526017461309 | 0.052299650785 | 0.00574 |
| `kpi.separator.F_alpha` | 0.000251528388336 | 0.000251756534558 | 0.000907 |
| `kpi.separator.F_beta` | 2.62493894422e-05 | 2.60212432198e-05 | 0.00869 |
| `kpi.separator.Q` | 429.857547333 | 424.330796617 | 0.0129 |
| `kpi.separator.Q_kW` | 0.429857547333 | 0.424330796617 | 0.0129 |
| `kpi.separator.T` | 363.748275638 | 363.848773097 | 0.000276 |
| `kpi.separator.V_over_F` | 0.0944978019919 | 0.0936764755912 | 0.00869 |
| `utility.heater.heating.steamLP.T` | 363.748275638 | 363.848773097 | 0.000276 |
| `stream.hotStream.T` | 363.748275638 | 363.848773097 | 0.000276 |
| `stream.liqProd.T` | 363.748275638 | 363.848773097 | 0.000276 |
| `stream.vapProd.T` | 363.748275638 | 363.848773097 | 0.000276 |
| `boundary.global.Q_boundary_kW` | 1.28154334262 | 1.2760165919 | 0.00431 |
| `kpi.separator.K_aceticAcid` | 0.279259110189 | 0.280219087005 | 0.00344 |
| `kpi.separator.K_ethanol` | 1.59105391106 | 1.59688813989 | 0.00367 |
| `kpi.separator.K_ethylAcetate` | 1.52127519169 | 1.52581389875 | 0.00298 |
| `kpi.separator.K_water` | 0.718212692476 | 0.707537088234 | 0.0149 |
| `utility.separator.heating.steamLP.duty_kW` | 0.429857547333 | 0.424330796617 | 0.0129 |
| `utility.separator.heating.steamLP.T` | 363.748275638 | 363.848773097 | 0.000276 |
| `utility.separator.heating.steamLP.kg_s` | 0.000196641146996 | 0.000194112898727 | 0.0129 |
| `utility.separator.heating.steamLP.eur_h` | 0.0185698460448 | 0.0183310904138 | 0.0129 |

## process03_recycle  (tutorials/steady/flowsheets/process03_recycle)
39 rows; largest relative move 0.0794
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liqOut.F` | 0.00036181229398 | 0.00038108289226 | 0.0533 |
| `stream.liqProd.F` | 0.000144724917592 | 0.000152433156904 | 0.0533 |
| `stream.mixed.F` | 0.000494865187554 | 0.000506427768199 | 0.0234 |
| `stream.reactorOut.F` | 0.000494865187554 | 0.000506427768199 | 0.0234 |
| `stream.recycle.F` | 0.000217087376388 | 0.000228649735356 | 0.0533 |
| `stream.vapProd.F` | 0.000133052893574 | 0.000125344875939 | 0.0579 |
| `kpi.mixer01.F_out` | 0.000494865187554 | 0.000506427768199 | 0.0234 |
| `kpi.mixer01.T_out` | 356.07011552 | 356.255490467 | 0.000521 |
| `kpi.reactor.Da_kTau` | 3.62948957741 | 3.58932353973 | 0.0111 |
| `kpi.reactor.F_in_kmol_h` | 1.78151467519 | 1.82313996552 | 0.0234 |
| `kpi.reactor.F_out_kmol_h` | 1.78151467519 | 1.82313996552 | 0.0234 |
| `kpi.reactor.Q_kW` | -0.241551034906 | -0.24180206548 | 0.00104 |
| `kpi.reactor.T` | 356.07011552 | 356.255490467 | 0.000521 |
| `kpi.reactor.X_limiting` | 0.783993465526 | 0.782102963249 | 0.00241 |
| `kpi.reactor.k` | 0.00538724595224 | 0.00545393568074 | 0.0124 |
| `kpi.reactor.minus_r_ethanol` | 5.92453587019 | 5.93652309688 | 0.00202 |
| `kpi.reactor.tau_s` | 673.718929781 | 658.116220989 | 0.0232 |
| `kpi.reactor.xi_mol_per_s` | 0.118490717404 | 0.118730461938 | 0.00202 |
| `kpi.separator.F_alpha` | 0.00036181229398 | 0.00038108289226 | 0.0533 |
| `kpi.separator.F_beta` | 0.000133052893574 | 0.000125344875939 | 0.0579 |
| `kpi.separator.F_in` | 0.000494865187554 | 0.000506427768199 | 0.0234 |
| `kpi.separator.Q` | 5316.45211347 | 5027.2790727 | 0.0544 |
| `kpi.separator.Q_kW` | 5.31645211347 | 5.0272790727 | 0.0544 |
| `kpi.separator.V_over_F` | 0.268866949869 | 0.247507904997 | 0.0794 |
| `utility.separator.heating.steamLP.duty_kW` | 5.31645211347 | 5.0272790727 | 0.0544 |
| `utility.separator.heating.steamLP.kg_s` | 0.00243204579756 | 0.0022997616984 | 0.0544 |
| `utility.separator.heating.steamLP.eur_h` | 0.229670731302 | 0.217178455941 | 0.0544 |
| `kpi.separator.K_aceticAcid` | 0.208371959794 | 0.20568217925 | 0.0129 |
| `kpi.separator.K_ethanol` | 1.62946039343 | 1.62998018347 | 0.000319 |
| `kpi.separator.K_ethylAcetate` | 1.55534202753 | 1.55583820168 | 0.000319 |
| `kpi.separator.K_water` | 0.735858901118 | 0.722319036316 | 0.0184 |
| `stream.mixed.T` | 356.07011552 | 356.255490467 | 0.000521 |
| `stream.reactorOut.T` | 356.07011552 | 356.255490467 | 0.000521 |
| `boundary.global.Q_boundary_kW` | 5.07490107857 | 4.78547700722 | 0.057 |
| `boundary.global.H_products_kW` | -99.0571192118 | -99.3466124394 | 0.00292 |
| `utility.reactor.cooling.coolingWater.duty_kW` | -0.241551034906 | -0.24180206548 | 0.00104 |
| `utility.reactor.cooling.coolingWater.T` | 356.07011552 | 356.255490467 | 0.000521 |
| `utility.reactor.cooling.coolingWater.kg_s` | 0.00577873289249 | 0.00578473840861 | 0.00104 |
| `utility.reactor.cooling.coolingWater.eur_h` | 0.000347833490265 | 0.000348194974291 | 0.00104 |

## process04_research_workflow  (tutorials/steady/flowsheets/process04_research_workflow)
9 rows; largest relative move 0.144
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liquid.F` | 0.00562323865754 | 0.00643042362384 | 0.144 |
| `stream.vapor.F` | 0.0221545391202 | 0.0213473541539 | 0.0364 |
| `kpi.flash01.F_alpha` | 0.00562323865754 | 0.00643042362384 | 0.144 |
| `kpi.flash01.F_beta` | 0.0221545391202 | 0.0213473541539 | 0.0364 |
| `kpi.flash01.V_over_F` | 0.797563408329 | 0.768504749542 | 0.0364 |
| `kpi.flash01.K_ethanol` | 2.22741301451 | 2.16208087469 | 0.0293 |
| `kpi.flash01.K_water` | 0.585036155702 | 0.582904908811 | 0.00364 |
| `boundary.global.H_feeds_kW` | -6774.85012165 | -6808.45853615 | 0.00496 |
| `boundary.global.H_products_kW` | -6774.85012165 | -6808.45853615 | 0.00496 |

## proxy01_gas_loop  (tutorials/steady/flowsheets/proxy01_gas_loop)
57 rows; largest relative move 0.00851
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.cooledGas.F` | 0.000389167893131 | 0.000389124905766 | 0.00011 |
| `stream.dryGas.F` | 0.000371302500749 | 0.000371157100007 | 0.000392 |
| `stream.expandedProduct.F` | 0.000259911750525 | 0.000259809970005 | 0.000392 |
| `stream.mixed.F` | 0.000555954133044 | 0.000555892722523 | 0.00011 |
| `stream.productGas.F` | 0.000259911750525 | 0.000259809970005 | 0.000392 |
| `stream.productWater.F` | 1.78653923817e-05 | 1.79678057587e-05 | 0.00573 |
| `stream.reacted.F` | 0.000555954133044 | 0.000555892722523 | 0.00011 |
| `stream.recycle1.F` | 0.000166786239913 | 0.000166767816757 | 0.00011 |
| `stream.recycle2.F` | 0.000111390750225 | 0.000111347130002 | 0.000392 |
| `stream.toFlash.F` | 0.000389167893131 | 0.000389124905766 | 0.00011 |
| `kpi.F1.F_alpha` | 1.78653923817e-05 | 1.79678057587e-05 | 0.00573 |
| `kpi.F1.F_beta` | 0.000371302500749 | 0.000371157100007 | 0.000392 |
| `kpi.F1.F_in` | 0.000389167893131 | 0.000389124905766 | 0.00011 |
| `kpi.F1.T` | 357.338497491 | 357.656863407 | 0.000891 |
| `kpi.F1.V_over_F` | 0.95409335483 | 0.953825094481 | 0.000281 |
| `kpi.HX1.C_hot` | 14.0603619285 | 14.0586677891 | 0.00012 |
| `kpi.HX1.C_r` | 0.0111737975591 | 0.0111724512232 | 0.00012 |
| `kpi.HX1.LMTD` | 205.552741369 | 205.922695241 | 0.0018 |
| `kpi.HX1.NTU` | 5.12077856646 | 5.12139564572 | 0.000121 |
| `kpi.HX1.Q` | 7012.07167898 | 7011.25394803 | 0.000117 |
| `kpi.HX1.Q_kW` | 7.01207167898 | 7.01125394803 | 0.000117 |
| `kpi.HX1.T_hot_out` | 357.338497491 | 357.656863407 | 0.000891 |
| `kpi.M1.F_out` | 0.000555954133044 | 0.000555892722523 | 0.00011 |
| `kpi.M1.T_out` | 711.982197173 | 712.065703254 | 0.000117 |
| `kpi.R1.F_in_kmol_h` | 2.00143487896 | 2.00121380108 | 0.00011 |
| `kpi.R1.F_out_kmol_h` | 2.00143487896 | 2.00121380108 | 0.00011 |
| `kpi.R1.N_in_mol_s` | 0.555954133044 | 0.555892722523 | 0.00011 |
| `kpi.R1.N_out_mol_s` | 0.555954133044 | 0.555892722523 | 0.00011 |
| `kpi.R1.Q_kW` | -1.58011282437 | -1.58161432177 | 0.00095 |
| `kpi.R1.lambda_C` | 17047.8167171 | 17052.3375723 | 0.000265 |
| `kpi.R1.y_CO` | 0.174125372797 | 0.174183966979 | 0.000337 |
| `kpi.R1.y_water` | 0.154455161163 | 0.154401112833 | 0.00035 |
| `kpi.T1.F` | 0.000259911750525 | 0.000259809970005 | 0.000392 |
| `kpi.T1.P_out` | 246633.01905 | 246730.494212 | 0.000395 |
| `kpi.T1.T_in` | 357.338497491 | 357.656863407 | 0.000891 |
| `kpi.T1.T_out` | 310.718839082 | 311.025571999 | 0.000987 |
| `kpi.T1.T_out_isen` | 298.854932088 | 299.158736086 | 0.00102 |
| `kpi.T1.dS_gen` | 1.26231764938 | 1.26154855572 | 0.000609 |
| `kpi.T1.dT` | -46.6196584089 | -46.6312914074 | 0.00025 |
| `kpi.T1.dT_isen` | -58.4835654029 | -58.498127321 | 0.000249 |
| `kpi.T1.ratio` | 2.02730357 | 2.02650264855 | 0.000395 |
| `stream.cooledGas.T` | 357.338497491 | 357.656863407 | 0.000891 |
| `stream.dryGas.T` | 357.338497491 | 357.656863407 | 0.000891 |
| `stream.expandedProduct.T` | 310.718839082 | 311.025571999 | 0.000987 |
| `stream.mixed.T` | 711.982197173 | 712.065703254 | 0.000117 |
| `stream.productGas.T` | 357.338497491 | 357.656863407 | 0.000891 |
| `stream.productWater.T` | 357.338497491 | 357.656863407 | 0.000891 |
| `stream.recycle2.T` | 357.338497491 | 357.656863407 | 0.000891 |
| `kpi.F1.K_CO` | 27126.8100186 | 27228.5342648 | 0.00375 |
| `kpi.F1.K_CO2` | 1199.02979184 | 1206.01920057 | 0.00583 |
| `kpi.F1.K_H2` | 19417.2507075 | 19444.3731969 | 0.0014 |
| `kpi.F1.K_water` | 0.113822921557 | 0.113516734961 | 0.00269 |
| `boundary.global.Q_boundary_kW` | -1.98011282437 | -1.98161432177 | 0.000758 |
| `boundary.global.residual_kW` | 1.02906864675 | 1.02031010226 | 0.00851 |
| `utility.R1.cooling.coolingWater.duty_kW` | -1.58011282437 | -1.58161432177 | 0.00095 |
| `utility.R1.cooling.coolingWater.kg_s` | 0.0378017422099 | 0.0378376632003 | 0.00095 |
| `utility.R1.cooling.coolingWater.eur_h` | 0.0022753624671 | 0.00227752462335 | 0.00095 |

## psychro01_n2_water  (tutorials/props/heat/psychro01_n2_water)
3 rows; largest relative move 0.00612
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `diag.airWater.Y_adiabatic_last` | 0.0150791 | 0.0151001801258 | 0.0014 |
| `diag.airWater.Y_sat_first` | 0.00390022 | 0.00390281704274 | 0.000666 |
| `diag.airWater.Y_sat_last` | 0.158606 | 0.157636066911 | 0.00612 |

## pxy01_ethanol_water_70C  (tutorials/props/scan/pxy01_ethanol_water_70C)
6 rows; largest relative move 0.00507
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `diag.pxy_peak.P_bubble` | 72691.5686997 | 72629.0555014 | 0.00086 |
| `diag.pxy_peak.y_eqT_ethanol` | 0.899366997305 | 0.900141099421 | 0.000861 |
| `diag.txy_point.T_bubble` | 353.500724827 | 353.628296718 | 0.000361 |
| `diag.txy_point.y_eq_ethanol` | 0.617673423159 | 0.620744779714 | 0.00497 |
| `diag.pxy_point.P_bubble` | 101325 | 100814.341518 | 0.00504 |
| `diag.pxy_point.y_eqT_ethanol` | 0.617673423159 | 0.620802146388 | 0.00507 |

## recipe01_react_then_distill  (tutorials/batch/recipes/recipe01_react_then_distill)
32 rows; largest relative move 0.149
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.campaign.energy_Q_ledger_kJ` | 26.3188405082 | 26.9996656078 | 0.0259 |
| `kpi.campaign.energy_dH_vessels_kJ` | 26.318841196 | 26.9996661928 | 0.0259 |
| `kpi.campaign.energy_residual_kJ` | 6.87760234541e-07 | 5.84978579354e-07 | 0.149 |
| `kpi.campaign.utility_coolingWater_eur` | 0.000233213479993 | 0.00023301111585 | 0.000868 |
| `kpi.campaign.utility_coolingWater_kJ` | 583.033699984 | 582.527789626 | 0.000868 |
| `kpi.campaign.utility_coolingWater_kg` | 13.9481746408 | 13.9360715221 | 0.000868 |
| `kpi.campaign.utility_coolingWater_peak_kW` | 0.715989416182 | 0.715329140232 | 0.000922 |
| `kpi.campaign.utility_coolingWater_t_peak_s` | 771 | 770 | 0.0013 |
| `kpi.campaign.utility_cost_eur_total` | 0.00754544396589 | 0.00754734057865 | 0.000251 |
| `kpi.campaign.utility_steamLP_eur` | 0.0073122304859 | 0.0073143294628 | 0.000287 |
| `kpi.campaign.utility_steamLP_kJ` | 609.352540492 | 609.527455233 | 0.000287 |
| `kpi.campaign.utility_steamLP_kg` | 0.278752305806 | 0.278832321699 | 0.000287 |
| `kpi.campaign.utility_steamLP_peak_kW` | 27.2826831135 | 27.579875224 | 0.0109 |
| `kpi.receiver.T_final` | 366.920990797 | 367.197509794 | 0.000754 |
| `kpi.receiver.n_aceticAcid_final` | 0.00112228666205 | 0.00113188888585 | 0.00856 |
| `kpi.receiver.n_ethanol_final` | 0.00217003339306 | 0.00217228440541 | 0.00104 |
| `kpi.receiver.n_ethylAcetate_final` | 0.00684209119495 | 0.00684949708019 | 0.00108 |
| `kpi.receiver.n_water_final` | 0.0058655887681 | 0.00584632964596 | 0.00328 |
| `kpi.still.E_condenser_seg1_kJ` | -568.228270795 | -567.722360437 | 0.00089 |
| `kpi.still.E_condenser_total_kJ` | -568.228270795 | -567.722360437 | 0.00089 |
| `kpi.still.E_reboiler_seg0_kJ` | 609.352540492 | 609.527455233 | 0.000287 |
| `kpi.still.E_reboiler_total_kJ` | 609.352540492 | 609.527455233 | 0.000287 |
| `kpi.still.T_final` | 378.400308055 | 378.954212817 | 0.00146 |
| `kpi.still.n_aceticAcid_final` | 0.00109132138215 | 0.00108171915834 | 0.0088 |
| `kpi.still.n_ethanol_final` | 4.35746511388e-05 | 4.13236387842e-05 | 0.0517 |
| `kpi.still.n_ethylAcetate_final` | 0.000194300760854 | 0.000186894875616 | 0.0381 |
| `kpi.still.n_water_final` | 0.00117080318771 | 0.00119006230984 | 0.0164 |
| `ledger.still->receiver.material.continuous.dn.aceticAcid` | 0.00112228666205 | 0.00113188888585 | 0.00856 |
| `ledger.still->receiver.material.continuous.dn.ethanol` | 0.00217003339306 | 0.00217228440541 | 0.00104 |
| `ledger.still->receiver.material.continuous.dn.ethylAcetate` | 0.00684209119495 | 0.00684949708019 | 0.00108 |
| `ledger.still->receiver.material.continuous.dn.water` | 0.0058655887681 | 0.00584632964596 | 0.00328 |
| `ledger.still->receiver.material.continuous.H_kJ` | -5961.19069706 | -5963.85309612 | 0.000447 |

## recipe03_conditional_partial  (tutorials/batch/recipes/recipe03_conditional_partial)
14 rows; largest relative move 0.0166
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.campaign.energy_Q_ledger_kJ` | 12.1085092677 | 12.3093052734 | 0.0166 |
| `kpi.campaign.utility_coolingWater_eur` | 0.000121943609494 | 0.000121914837055 | 0.000236 |
| `kpi.campaign.utility_coolingWater_kJ` | 304.859023735 | 304.787092637 | 0.000236 |
| `kpi.campaign.utility_coolingWater_kg` | 7.29327807979 | 7.29155724011 | 0.000236 |
| `kpi.campaign.utility_coolingWater_peak_kW` | 0.739209811086 | 0.738846355541 | 0.000492 |
| `kpi.campaign.utility_cost_eur_total` | 0.00392555400553 | 0.00392707161197 | 0.000387 |
| `kpi.still.E_condenser_seg1_kJ` | -291.365871365 | -291.293940267 | 0.000247 |
| `kpi.still.E_condenser_total_kJ` | -291.365871365 | -291.293940267 | 0.000247 |
| `kpi.still.E_reboiler_seg0_kJ` | 316.967533003 | 317.09639791 | 0.000407 |
| `kpi.still.E_reboiler_total_kJ` | 316.967533003 | 317.09639791 | 0.000407 |
| `kpi.campaign.utility_steamLP_eur` | 0.00380361039603 | 0.00380515677492 | 0.000407 |
| `kpi.campaign.utility_steamLP_kJ` | 316.967533003 | 317.09639791 | 0.000407 |
| `kpi.campaign.utility_steamLP_kg` | 0.144998871456 | 0.145057821551 | 0.000407 |
| `kpi.campaign.utility_steamLP_peak_kW` | 16.0913599231 | 16.1770225806 | 0.00532 |

## recycle_autoinit_tear  (tutorials/steady/flowsheets/recycle_autoinit_tear)
39 rows; largest relative move 0.0794
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `stream.liqOut.F` | 0.00036181229203 | 0.000381082870079 | 0.0533 |
| `stream.liqProd.F` | 0.000144724916812 | 0.000152433148032 | 0.0533 |
| `stream.mixed.F` | 0.000494865185146 | 0.00050642774094 | 0.0234 |
| `stream.reactorOut.F` | 0.000494865185146 | 0.00050642774094 | 0.0234 |
| `stream.recycle.F` | 0.000217087375218 | 0.000228649722048 | 0.0533 |
| `stream.vapProd.F` | 0.000133052893116 | 0.00012534487086 | 0.0579 |
| `kpi.mixer01.F_out` | 0.000494865185146 | 0.00050642774094 | 0.0234 |
| `kpi.mixer01.T_out` | 356.070115473 | 356.255490033 | 0.000521 |
| `kpi.reactor.Da_kTau` | 3.6294895858 | 3.58932365284 | 0.0111 |
| `kpi.reactor.F_in_kmol_h` | 1.78151466652 | 1.82313986738 | 0.0234 |
| `kpi.reactor.F_out_kmol_h` | 1.78151466652 | 1.82313986738 | 0.0234 |
| `kpi.reactor.Q_kW` | -0.241551034355 | -0.241802058832 | 0.00104 |
| `kpi.reactor.T` | 356.070115473 | 356.255490033 | 0.000521 |
| `kpi.reactor.X_limiting` | 0.783993465918 | 0.78210296862 | 0.00241 |
| `kpi.reactor.k` | 0.00538724593549 | 0.00545393552375 | 0.0124 |
| `kpi.reactor.minus_r_ethanol` | 5.9245358552 | 5.93652292002 | 0.00202 |
| `kpi.reactor.tau_s` | 673.718933433 | 658.116260672 | 0.0232 |
| `kpi.reactor.xi_mol_per_s` | 0.118490717104 | 0.1187304584 | 0.00202 |
| `kpi.separator.F_alpha` | 0.00036181229203 | 0.000381082870079 | 0.0533 |
| `kpi.separator.F_beta` | 0.000133052893116 | 0.00012534487086 | 0.0579 |
| `kpi.separator.F_in` | 0.000494865185146 | 0.00050642774094 | 0.0234 |
| `kpi.separator.Q` | 5316.45209767 | 5027.27889281 | 0.0544 |
| `kpi.separator.Q_kW` | 5.31645209767 | 5.02727889281 | 0.0544 |
| `kpi.separator.V_over_F` | 0.268866950252 | 0.24750790829 | 0.0794 |
| `utility.separator.heating.steamLP.duty_kW` | 5.31645209767 | 5.02727889281 | 0.0544 |
| `utility.separator.heating.steamLP.kg_s` | 0.00243204579033 | 0.00229976161611 | 0.0544 |
| `utility.separator.heating.steamLP.eur_h` | 0.229670730619 | 0.217178448169 | 0.0544 |
| `kpi.separator.K_aceticAcid` | 0.20837195961 | 0.205682176947 | 0.0129 |
| `kpi.separator.K_ethanol` | 1.62946039346 | 1.62998018391 | 0.000319 |
| `kpi.separator.K_ethylAcetate` | 1.55534202756 | 1.5558382021 | 0.000319 |
| `kpi.separator.K_water` | 0.735858901135 | 0.722319036509 | 0.0184 |
| `stream.mixed.T` | 356.070115473 | 356.255490033 | 0.000521 |
| `stream.reactorOut.T` | 356.070115473 | 356.255490033 | 0.000521 |
| `boundary.global.Q_boundary_kW` | 5.07490106331 | 4.78547683397 | 0.057 |
| `boundary.global.H_products_kW` | -99.0571187407 | -99.3466071274 | 0.00292 |
| `utility.reactor.cooling.coolingWater.duty_kW` | -0.241551034355 | -0.241802058832 | 0.00104 |
| `utility.reactor.cooling.coolingWater.T` | 356.070115473 | 356.255490033 | 0.000521 |
| `utility.reactor.cooling.coolingWater.kg_s` | 0.0057787328793 | 0.00578473824958 | 0.00104 |
| `utility.reactor.cooling.coolingWater.eur_h` | 0.000347833489471 | 0.000348194964719 | 0.00104 |

## solidDryer01_sugar  (tutorials/steady/drying/solidDryer01_sugar)
7 rows; largest relative move 0.0612
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.drySolid.F` | 0.00283583138708 | 0.00283932200713 | 0.00123 |
| `kpi.solidDryer.X_equilibrium` | 0.00109945367934 | 0.00116558884515 | 0.0602 |
| `kpi.solidDryer.X_final` | 0.00109945367934 | 0.00116558884515 | 0.0602 |
| `kpi.solidDryer.moisture_pct_wb` | 0.109824620851 | 0.116423182952 | 0.0601 |
| `kpi.solidDryer.water_activity` | 0.00431158404412 | 0.00457544545839 | 0.0612 |
| `kpi.solidDryer.water_removed` | 0.189112936127 | 0.189050052607 | 0.000333 |
| `kpi.solidDryer.exhaust_humidity` | 0.175354451046 | 0.176952939149 | 0.00912 |

## solidDryer02_starved_air  (tutorials/steady/drying/solidDryer02_starved_air)
6 rows; largest relative move 0.0612
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.drySolid.F` | 0.0109196509746 | 0.0109209985142 | 0.000123 |
| `kpi.solidDryer.X_equilibrium` | 0.00109902098433 | 0.00116513056915 | 0.0602 |
| `kpi.solidDryer.X_final` | 0.154259849734 | 0.154285380944 | 0.000166 |
| `kpi.solidDryer.moisture_pct_wb` | 13.3643953543 | 13.3663116151 | 0.000143 |
| `kpi.solidDryer.water_activity` | 0.00430985941091 | 0.00457361528064 | 0.0612 |
| `kpi.solidDryer.water_removed` | 0.0434777958363 | 0.0434586503325 | 0.00044 |

## sprayDryer01_sugar  (tutorials/steady/drying/sprayDryer01_sugar)
9 rows; largest relative move 0.0197
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 4.2141939629e-05 | 4.22961617655e-05 | 0.00366 |
| `kpi.dryer.duty` | 43739.0083213 | 43733.2230723 | 0.000132 |
| `kpi.dryer.powder_flow` | 0.0112863590131 | 0.0112891373249 | 0.000246 |
| `kpi.dryer.water_evaporated` | 0.0164921771243 | 0.0164893988125 | 0.000168 |
| `kpi.dryer.X_equilibrium` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.X_final` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.moisture_pct_wb` | 1.54492513453 | 1.56915540893 | 0.0157 |
| `kpi.dryer.water_activity` | 0.0767347478428 | 0.0782484301622 | 0.0197 |
| `kpi.dryer.water_residual` | 0.000174365797166 | 0.000177144108956 | 0.0159 |

## sprayDryer02_residence_sweep  (tutorials/steady/drying/sprayDryer02_residence_sweep)
9 rows; largest relative move 0.0197
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 4.21419396495e-05 | 4.22961617852e-05 | 0.00366 |
| `kpi.dryer.X_equilibrium` | 0.0156916759905 | 0.015941704202 | 0.0159 |
| `kpi.dryer.X_final` | 0.0156916760249 | 0.015941704235 | 0.0159 |
| `kpi.dryer.duty` | 43739.0083205 | 43733.2230716 | 0.000132 |
| `kpi.dryer.moisture_pct_wb` | 1.54492513774 | 1.56915541202 | 0.0157 |
| `kpi.dryer.powder_flow` | 0.0112863590135 | 0.0112891373253 | 0.000246 |
| `kpi.dryer.water_activity` | 0.0767347478357 | 0.0782484301553 | 0.0197 |
| `kpi.dryer.water_evaporated` | 0.0164921771239 | 0.0164893988121 | 0.000168 |
| `kpi.dryer.water_residual` | 0.000174365797535 | 0.00017714410931 | 0.0159 |

## sprayDryer03_pressure_nozzle  (tutorials/steady/drying/sprayDryer03_pressure_nozzle)
9 rows; largest relative move 0.0197
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 4.2141939629e-05 | 4.22961617655e-05 | 0.00366 |
| `kpi.dryer.X_equilibrium` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.X_final` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.duty` | 43739.0083213 | 43733.2230723 | 0.000132 |
| `kpi.dryer.moisture_pct_wb` | 1.54492513453 | 1.56915540893 | 0.0157 |
| `kpi.dryer.powder_flow` | 0.0112863590131 | 0.0112891373249 | 0.000246 |
| `kpi.dryer.water_activity` | 0.0767347478428 | 0.0782484301622 | 0.0197 |
| `kpi.dryer.water_evaporated` | 0.0164921771243 | 0.0164893988125 | 0.000168 |
| `kpi.dryer.water_residual` | 0.000174365797166 | 0.000177144108956 | 0.0159 |

## sprayDryer04_profiles  (tutorials/steady/drying/sprayDryer04_profiles)
9 rows; largest relative move 0.0197
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 4.2141939629e-05 | 4.22961617655e-05 | 0.00366 |
| `kpi.dryer.X_equilibrium` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.X_final` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.duty` | 43739.0083213 | 43733.2230723 | 0.000132 |
| `kpi.dryer.moisture_pct_wb` | 1.54492513453 | 1.56915540893 | 0.0157 |
| `kpi.dryer.powder_flow` | 0.0112863590131 | 0.0112891373249 | 0.000246 |
| `kpi.dryer.water_activity` | 0.0767347478428 | 0.0782484301622 | 0.0197 |
| `kpi.dryer.water_evaporated` | 0.0164921771243 | 0.0164893988125 | 0.000168 |
| `kpi.dryer.water_residual` | 0.000174365797166 | 0.000177144108956 | 0.0159 |

## sprayDryer05_whey  (tutorials/steady/drying/sprayDryer05_whey)
7 rows; largest relative move 0.0281
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 8.71255906462e-05 | 8.75689559798e-05 | 0.00509 |
| `kpi.dryer.X_equilibrium` | 0.0151904301947 | 0.0155355539342 | 0.0227 |
| `kpi.dryer.X_final` | 0.0151904301947 | 0.0155355539342 | 0.0227 |
| `kpi.dryer.moisture_pct_wb` | 1.49631337559 | 1.52978926971 | 0.0224 |
| `kpi.dryer.powder_flow` | 0.0234946338488 | 0.0235026210753 | 0.00034 |
| `kpi.dryer.water_activity` | 0.0349606827777 | 0.03594405601 | 0.0281 |
| `kpi.dryer.water_residual` | 0.000351553348825 | 0.00035954057531 | 0.0227 |

## sprayDryer06_rea  (tutorials/steady/drying/sprayDryer06_rea)
6 rows; largest relative move 0.0204
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 4.63936287663e-05 | 4.64501191995e-05 | 0.00122 |
| `kpi.dryer.X_equilibrium` | 0.0154493313057 | 0.0157046494569 | 0.0165 |
| `kpi.dryer.X_final` | 0.0225846049486 | 0.0226761884418 | 0.00406 |
| `kpi.dryer.moisture_pct_wb` | 2.20858057508 | 2.2173380683 | 0.00397 |
| `kpi.dryer.water_activity` | 0.0752768260654 | 0.0768130515172 | 0.0204 |
| `kpi.dryer.water_residual` | 0.000250959976974 | 0.000251977652128 | 0.00406 |

## sprayDryer07_design  (tutorials/steady/drying/sprayDryer07_design)
10 rows; largest relative move 0.0197
Reason: water activity / equilibrium moisture / saturation humidity are p_w / Psat(T): Psat is lower by up to 2.5 % at the dryer temperatures

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 4.2141939629e-05 | 4.22961617655e-05 | 0.00366 |
| `kpi.dryer.X_equilibrium` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.X_final` | 0.0156916759917 | 0.0159417042031 | 0.0159 |
| `kpi.dryer.duty` | 43739.0083213 | 43733.2230723 | 0.000132 |
| `kpi.dryer.moisture_pct_wb` | 1.54492513453 | 1.56915540893 | 0.0157 |
| `kpi.dryer.powder_flow` | 0.0112863590131 | 0.0112891373249 | 0.000246 |
| `kpi.dryer.water_activity` | 0.0767347478428 | 0.0782484301622 | 0.0197 |
| `kpi.dryer.water_evaporated` | 0.0164921771243 | 0.0164893988125 | 0.000168 |
| `kpi.dryer.water_residual` | 0.000174365797166 | 0.000177144108956 | 0.0159 |
| `equipment.dryer.values.W_evap` | 0.0164921771243 | 0.0164893988125 | 0.000168 |

## still02_ethanol_water_azeo  (tutorials/batch/still/still02_ethanol_water_azeo)
18 rows; largest relative move 0.0645
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.still.T_final` | 372.446750369 | 373.117313962 | 0.0018 |
| `kpi.campaign.energy_H_external_kJ` | -249.391762836 | -249.365160058 | 0.000107 |
| `kpi.campaign.energy_Q_ledger_kJ` | 0.490652916203 | 0.522318304026 | 0.0645 |
| `kpi.campaign.utility_coolingWater_eur` | 1.48721879865e-05 | 1.48670675768e-05 | 0.000344 |
| `kpi.campaign.utility_coolingWater_kJ` | 37.1804699663 | 37.1676689421 | 0.000344 |
| `kpi.campaign.utility_coolingWater_kg` | 0.889484927424 | 0.889178682824 | 0.000344 |
| `kpi.campaign.utility_coolingWater_peak_kW` | 0.0622319844566 | 0.0621904880372 | 0.000667 |
| `kpi.campaign.utility_cost_eur_total` | 0.000466925662577 | 0.00046714691453 | 0.000474 |
| `kpi.campaign.utility_steamLP_eur` | 0.00045205347459 | 0.000452279846953 | 0.000501 |
| `kpi.campaign.utility_steamLP_kJ` | 37.6711228825 | 37.6899872461 | 0.000501 |
| `kpi.campaign.utility_steamLP_kg` | 0.0172329015931 | 0.0172415312196 | 0.000501 |
| `kpi.campaign.utility_steamLP_peak_kW` | 0.0659540685704 | 0.0661149342734 | 0.00244 |
| `kpi.campaign.utility_steamLP_t_peak_s` | 475 | 473 | 0.00421 |
| `kpi.still.E_condenser_seg1_kJ` | -37.1804699663 | -37.1676689421 | 0.000344 |
| `kpi.still.E_condenser_total_kJ` | -37.1804699663 | -37.1676689421 | 0.000344 |
| `kpi.still.E_reboiler_seg0_kJ` | 37.6711228825 | 37.6899872461 | 0.000501 |
| `kpi.still.E_reboiler_total_kJ` | 37.6711228825 | 37.6899872461 | 0.000501 |
| `ledger.still->(external_boundary).material.external.H_kJ` | -249.391762836 | -249.365160058 | 0.000107 |

## stripper01_NH3_water  (tutorials/steady/absorption/stripper01_NH3_water)
2 rows; largest relative move 0.00395
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.stripper.K_water` | 0.170562530402 | 0.169888686608 | 0.00395 |
| `kpi.stripper.S_water` | 0.170562530402 | 0.169888686608 | 0.00395 |

## stripper01_sour_water  (tutorials/steady/distillation/stripper01_sour_water)
18 rows; largest relative move 0.0554
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.tower.Q_condenser_kW` | -55.8692544947 | -56.1458929372 | 0.00495 |
| `kpi.tower.Q_reboiler_kW` | 76.3532639151 | 75.4947043288 | 0.0112 |
| `kpi.tower.T_bottom` | 370.531146763 | 369.971236497 | 0.00151 |
| `kpi.tower.T_top` | 355.393273713 | 355.21718458 | 0.000495 |
| `kpi.tower.x_B_HK` | 0.990834326335 | 0.99058035773 | 0.000256 |
| `kpi.tower.x_D_LK` | 0.333953827521 | 0.329545861231 | 0.0132 |
| `utility.tower.heating.steamLP.duty_kW` | 76.3532639151 | 75.4947043288 | 0.0112 |
| `utility.tower.heating.steamLP.T` | 370.531146763 | 369.971236497 | 0.00151 |
| `utility.tower.heating.steamLP.kg_s` | 0.0349283000527 | 0.0345355463535 | 0.0112 |
| `utility.tower.heating.steamLP.eur_h` | 3.29846100113 | 3.261371227 | 0.0112 |
| `utility.tower.cooling.coolingWater.duty_kW` | -55.8692544947 | -56.1458929372 | 0.00495 |
| `utility.tower.cooling.coolingWater.T` | 355.393273713 | 355.21718458 | 0.000495 |
| `utility.tower.cooling.coolingWater.kg_s` | 1.33658503576 | 1.34320318032 | 0.00495 |
| `utility.tower.cooling.coolingWater.eur_h` | 0.0804517264724 | 0.0808500858296 | 0.00495 |
| `stream.bottoms.T` | 370.531146763 | 369.971236497 | 0.00151 |
| `stream.distillate.T` | 355.393273713 | 355.21718458 | 0.000495 |
| `boundary.global.Q_boundary_kW` | 20.4840094204 | 19.3488113915 | 0.0554 |
| `boundary.global.H_products_kW` | -7683.78643709 | -7684.92163512 | 0.000148 |

## stripper02_sour_water_h2s  (tutorials/steady/distillation/stripper02_sour_water_h2s)
24 rows; largest relative move 0.358
Reason: tray / flash / reactor-effluent temperatures and K-values follow the water curve; duties and utility costs priced from them follow; small residuals move with them

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.tower.Q_condenser_kW` | -56.7703732241 | -56.9921007837 | 0.00391 |
| `kpi.tower.Q_reboiler_kW` | 80.8786864139 | 79.8597607305 | 0.0126 |
| `kpi.tower.T_bottom` | 372.031545213 | 371.451137452 | 0.00156 |
| `kpi.tower.T_top` | 356.430868413 | 356.19446911 | 0.000663 |
| `kpi.tower.x_B_HK` | 0.984357974045 | 0.98415481082 | 0.000206 |
| `kpi.tower.x_D_LK` | 0.302803507696 | 0.298944114931 | 0.0127 |
| `utility.tower.heating.steamLP.duty_kW` | 80.8786864139 | 79.8597607305 | 0.0126 |
| `utility.tower.heating.steamLP.T` | 372.031545213 | 371.451137452 | 0.00156 |
| `utility.tower.heating.steamLP.kg_s` | 0.0369984841784 | 0.036532369959 | 0.0126 |
| `utility.tower.heating.steamLP.eur_h` | 3.49395925308 | 3.44994166356 | 0.0126 |
| `utility.tower.cooling.coolingWater.duty_kW` | -56.7703732241 | -56.9921007837 | 0.00391 |
| `utility.tower.cooling.coolingWater.T` | 356.430868413 | 356.19446911 | 0.000663 |
| `utility.tower.cooling.coolingWater.kg_s` | 1.3581429001 | 1.36344738717 | 0.00391 |
| `utility.tower.cooling.coolingWater.eur_h` | 0.0817493374427 | 0.0820686251286 | 0.00391 |
| `csv.reports/unitOperations/tower/profile.csv.1:pH` | 8.2089848 | 8.2130876 | 0.0005 |
| `csv.reports/unitOperations/tower/profile.csv.1:m_HCO3` | 0.14620364 | 0.1485803 | 0.0163 |
| `csv.reports/unitOperations/tower/profile.csv.7:pH` | 7.6090598 | 7.6355899 | 0.00349 |
| `csv.reports/unitOperations/tower/profile.csv.7:m_HS` | 0.28854884 | 0.28899549 | 0.00155 |
| `csv.reports/unitOperations/tower/profile.csv.7:m_HCO3` | 5.6325275e-06 | 7.6463758e-06 | 0.358 |
| `csv.reports/unitOperations/tower/profile.csv.7:m_H2Saq` | 0.008247863 | 0.0078624833 | 0.0467 |
| `stream.bottoms.T` | 372.031545213 | 371.451137452 | 0.00156 |
| `stream.distillate.T` | 356.430868413 | 356.19446911 | 0.000663 |
| `boundary.global.Q_boundary_kW` | 24.1083131582 | 22.8676599467 | 0.0515 |
| `boundary.global.H_products_kW` | -7644.60969283 | -7645.85034604 | 0.000162 |

## temperature02_engineers_ladder  (tutorials/props/thermo/temperature02_engineers_ladder)
1 rows; largest relative move 0.0241
Reason: K_water = gamma Psat / P (or the pure-water saturation point itself): Psat is lower than Antoine above ~330 K, so water is less volatile / its boiling point is the IAPWS one (373.124 K)

| row | golden | now | relative move |
|---|---|---|---|
| `diag.rung_water.Psat_water` | 103925.90139 | 101417.993818 | 0.0241 |

## Not recorded, and why

* `curate14_nrtl_butanol_water`: the row `diag.fit_twoStage.fd_one_side_rows` (golden 2) is no longer produced by the run
  (the two-stage fit no longer needs its finite-difference one-sided rows on the new water curve); the row was REMOVED, the other 93
  moved rows are above.
* `edwards02_table7_vle`: NOT recorded.  Its three ANCHOR rows (the paper's own predictions, Edwards et al. 1978 Table 7)
  now disagree with the model by more than their bands (y_CO2aq row 1: 0.508 vs 0.494, band 0.025; P row 2: 1.896 vs 1.98 atm,
  band 0.04; P row 3: 1.883 vs 1.97, band 0.04), because water's Psat at 100 C drops 2.5 %.  An anchor is never refreshed and
  widening a band is a decision; the case stays red until one is taken.
* The 14 pair-curation cases under `data/curation/pairs/*-water` (13Dioxolane, 13Propanediol, 1Methoxy2Propanol,
  1Methoxy2PropylAcetate, 2Amino2Methyl1Propanol, 2Methoxyethanol, 2Methyl2Propanol, dimethylSulfoxide, ethyleneGlycol,
  furfural, methylDiEthanolAmine, nPropylPropionate, tetraethyleneGlycol, triethyleneGlycol): NOT recorded.  Their fits ran
  on water's old Psat and now refit to different NRTL/Wilson/UNIQUAC parameters (e.g. 13Dioxolane b_ij 237.15 -> 238.84, bubble
  max error 0.94 -> 1.22 K, fit grade clean -> warning); the shipped records under `data/standards/parameters/` (24 of them,
  see `check_regressed_pairs`) are the product of those fits.  Recording the cases would freeze a fit that disagrees with the
  shipped record; re-promoting the 24 records is a curation slice of its own with its own moved goldens.
