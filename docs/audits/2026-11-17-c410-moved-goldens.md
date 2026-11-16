# C410: the phiPhi liquid on the cubic's liquid root -- every moved golden row (2026-11-17)

Reason for the whole slice, as written in the commit: under a phiPhi package a liquid-phase stream's enthalpy and
entropy are the ideal-gas value plus the departures at the cubic's LIQUID root (`H_residualLiquid`, `S_residualLiquid`),
routed by `H_stream_formation` / `S_stream_formation`; before, the liquid was priced on the formation-datum surface
(liquid Cp, ideal mixing, no pressure term).  The rows below were rewritten from the scoped run's own mismatch lines (only
rows reported beyond their tolerance; every other row of every `expected` is byte-for-byte unchanged).  NO ANCHOR ROW moved:
flash09's K_N2 and K_CH4 anchors, and every anchor of the 19 props cases of the scope, agree with the cited primary.
Columns 19 and 20 (MTBE) are gamma-phi with an SRK VAPOUR, not phiPhi, so they are byte-identical (duties 164.0 and 2760.5 kW,
measured before and after).

6 cases, 80 rows.

## column08_radfrac_multidraw  (tutorials/steady/distillation/column08_radfrac_multidraw)
24 rows; largest relative move 0.1252
Reason: the radfrac column's liquid stage and product streams, on a phiPhi SRK package at 16 bar, are now priced on the SRK LIQUID root (H_ig + H_R at Z_L) instead of the formation-datum liquid (liquid Cp, ideal mixing, no pressure).  The liquid departure at 16 bar is large and negative, so the latent heat the column prices grows: reboiler 1685.0 -> 1831.8 kW (+8.7 %), condenser 812.9 -> 850.5 kW (+4.6 %), and with them the two product temperatures and the two key compositions.  The feed rows (`feed_feed1_q`, `feed_feed2_q`) are the feeds' thermal condition q, which reads the same liquid enthalpy.  Energy closure of the column stays 0 (`none`), mass untouched.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.radfrac.Q_condenser_kW` | -812.89254219 | -850.501210504 | 0.04627 |
| `kpi.radfrac.Q_reboiler_kW` | 1684.99879662 | 1831.8346548 | 0.08714 |
| `kpi.radfrac.T_bottom` | 449.386733804 | 450.046937595 | 0.001469 |
| `kpi.radfrac.T_top` | 326.652515723 | 326.384554449 | 0.0008203 |
| `kpi.radfrac.x_B_HK` | 0.679712328017 | 0.693563932213 | 0.02038 |
| `kpi.radfrac.x_D_LK` | 0.917556602934 | 0.920842424571 | 0.003581 |
| `utility.radfrac.heating.steamHP.duty_kW` | 1684.99879662 | 1831.8346548 | 0.08714 |
| `utility.radfrac.heating.steamHP.T` | 449.386733804 | 450.046937595 | 0.001469 |
| `utility.radfrac.heating.steamHP.kg_s` | 0.983079811333 | 1.06874834002 | 0.08714 |
| `utility.radfrac.heating.steamHP.eur_h` | 109.187922021 | 118.702885631 | 0.08714 |
| `utility.radfrac.cooling.coolingWater.duty_kW` | -812.89254219 | -850.501210504 | 0.04627 |
| `utility.radfrac.cooling.coolingWater.T` | 326.652515723 | 326.384554449 | 0.0008203 |
| `utility.radfrac.cooling.coolingWater.kg_s` | 19.4471900045 | 20.3469189116 | 0.04627 |
| `utility.radfrac.cooling.coolingWater.eur_h` | 1.17056526075 | 1.22472174313 | 0.04627 |
| `stream.bottoms.T` | 449.386733804 | 450.046937595 | 0.001469 |
| `stream.distillate.T` | 322.701065543 | 322.567588254 | 0.0004136 |
| `stream.drawC5.T` | 423.096002008 | 422.943218704 | 0.0003611 |
| `boundary.global.H_feeds_kW` | -8790.44935655 | -8838.78951265 | 0.005499 |
| `boundary.global.Q_boundary_kW` | 872.106254434 | 981.333444296 | 0.1252 |
| `boundary.global.H_products_kW` | -7918.34310212 | -7857.45606836 | 0.007689 |
| `kpi.radfrac.Q_reboiler_ownEnvelope_kW` | 1684.99879662 | 1831.8346548 | 0.08714 |
| `kpi.radfrac.feed_feed1_q` | 1.4723799797 | 1.52679344826 | 0.03696 |
| `kpi.radfrac.feed_feed2_q` | 1.86029630562 | 2.03266244954 | 0.09266 |
| `boundary.global.residual_denom_kW` | 2497.89133881 | 2682.3358653 | 0.07384 |

## cavett01_recycle_train  (tutorials/steady/flowsheets/cavett01_recycle_train)
29 rows; largest relative move 0.4134
Reason: a hydrocarbon separation train (SRK both phases, 262-330 K, high pressure): every flash's liquid outlet is now on the SRK liquid root, whose departure at these states is large.  The duties move with the latent heat: FL1 cooling -208.4 -> -268.1 MW (+28.6 %), FL2 114.8 -> 162.2 MW, FL3 45.8 -> 60.9 MW, FL4 26.9 -> 29.8 MW; the two mixer outlet temperatures (M2 269.7 -> 262.5 K, M3 273.6 -> 269.1 K) and vapour fractions follow because the mixers are adiabatic on the new liquid enthalpy.  Boundary energy residual 0.081 -> 0.147 kW on 1.6 GW of enthalpy, inside its band; mass and element closures unchanged.  The utility rows are those duties priced.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.FL1.Q` | -208420193.113 | -268130475.661 | 0.2865 |
| `kpi.FL1.Q_kW` | -208420.193113 | -268130.475661 | 0.2865 |
| `kpi.FL2.Q` | 114762848.094 | 162205631.653 | 0.4134 |
| `kpi.FL2.Q_kW` | 114762.848094 | 162205.631653 | 0.4134 |
| `kpi.FL3.Q` | 45760732.2954 | 60919167.9127 | 0.3313 |
| `kpi.FL3.Q_kW` | 45760.7322954 | 60919.1679127 | 0.3313 |
| `kpi.FL4.Q` | 26852004.0748 | 29796176.5393 | 0.1096 |
| `kpi.FL4.Q_kW` | 26852.0040748 | 29796.1765393 | 0.1096 |
| `kpi.M2.T_out` | 269.666635289 | 262.510574529 | 0.02654 |
| `kpi.M2.vf` | 0.778762687055 | 0.727976107774 | 0.06521 |
| `kpi.M3.T_out` | 273.62376734 | 269.148783773 | 0.01635 |
| `kpi.M3.vf` | 0.616867160373 | 0.583171491728 | 0.05462 |
| `utility.FL1.cooling.coolingWater.duty_kW` | -208420.193113 | -268130.475661 | 0.2865 |
| `utility.FL1.cooling.coolingWater.kg_s` | 4986.12902183 | 6414.60468087 | 0.2865 |
| `utility.FL1.cooling.coolingWater.eur_h` | 300.125078082 | 386.107884951 | 0.2865 |
| `utility.FL4.heating.steamLP.duty_kW` | 26852.0040748 | 29796.1765393 | 0.1096 |
| `utility.FL4.heating.steamLP.kg_s` | 12.2836249199 | 13.6304558734 | 0.1096 |
| `utility.FL4.heating.steamLP.eur_h` | 1160.00657603 | 1287.1948265 | 0.1096 |
| `stream.mixed2.T` | 269.666635289 | 262.510574529 | 0.02654 |
| `stream.mixed3.T` | 273.62376734 | 269.148783773 | 0.01635 |
| `boundary.global.H_feeds_kW` | -1589255.047 | -1598589.30324 | 0.005873 |
| `boundary.global.Q_boundary_kW` | -21044.6086486 | -15209.4995556 | 0.2773 |
| `boundary.global.H_products_kW` | -1610296.81759 | -1613798.94992 | 0.002175 |
| `utility.FL2.heating.steamLP.duty_kW` | 114762.848094 | 162205.631653 | 0.4134 |
| `utility.FL2.heating.steamLP.kg_s` | 52.4990155964 | 74.2020272886 | 0.4134 |
| `utility.FL2.heating.steamLP.eur_h` | 4957.75503765 | 7007.28328741 | 0.4134 |
| `utility.FL3.heating.steamLP.duty_kW` | 45760.7322954 | 60919.1679127 | 0.3313 |
| `utility.FL3.heating.steamLP.kg_s` | 20.9335463382 | 27.8678718722 | 0.3313 |
| `utility.FL3.heating.steamLP.eur_h` | 1976.86363516 | 2631.70805383 | 0.3313 |

## hda  (tutorials/plant/hda)
18 rows; largest relative move 8.7912
Reason: the plant runs on phiPhi SRK; its liquids (the HP flash liquid, the reactor and mixer liquid sides) are now priced on the SRK liquid root: HPFlash cooling -21794.3 -> -21798.7 kW (0.02 %), Reactor +20491.7 -> +20502.5 kW (0.05 %), Mixer steam 359.3 -> 349.5 kW (-2.7 %).  The shortcut Column keeps an ideal package (declared model boundary), so the plant's liquid entering it is re-priced there: that step, `closure.Column.step_kW`, grows from -0.25 to +1.91 kW and the plant-boundary residual from 0.31 to -1.84 kW (0.2 % of the 947 kW exchanged), all of it the declared and ledgered model-boundary step.  The plant's mass and element closures are unchanged.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.HPFlash.Q` | -21794274.4634 | -21798715.4912 | 0.0002038 |
| `kpi.HPFlash.Q_kW` | -21794.2744634 | -21798.7154912 | 0.0002038 |
| `kpi.Reactor.Q_kW` | 20491.7323049 | 20502.490468 | 0.000525 |
| `utility.HPFlash.cooling.coolingWater.duty_kW` | -21794.2744634 | -21798.7154912 | 0.0002038 |
| `utility.HPFlash.cooling.coolingWater.kg_s` | 521.394125918 | 521.500370603 | 0.0002038 |
| `utility.HPFlash.cooling.coolingWater.eur_h` | 31.3837552273 | 31.3901503073 | 0.0002038 |
| `kpi.Reactor.Q_sensible_kW` | 21829.8037789 | 21840.5619419 | 0.0004928 |
| `boundary.global.H_feeds_kW` | 284.677143979 | 284.236097306 | 0.001549 |
| `boundary.global.Q_boundary_kW` | -943.199177576 | -946.686879457 | 0.003698 |
| `boundary.global.H_products_kW` | -658.835249224 | -660.606845646 | 0.002689 |
| `boundary.global.residual_kW` | 0.313215627146 | -1.84393650474 | 6.887 |
| `kpi.Mixer.Q_kW` | 359.342980873 | 349.538143799 | 0.02729 |
| `utility.Mixer.heating.steamLP.duty_kW` | 359.342980873 | 349.538143799 | 0.02729 |
| `utility.Mixer.heating.steamLP.kg_s` | 0.164383797289 | 0.159898510429 | 0.02729 |
| `utility.Mixer.heating.steamLP.eur_h` | 15.5236167737 | 15.1000478121 | 0.02729 |
| `closure.Column.raw_kW` | -0.313215627081 | 1.84393650481 | 6.887 |
| `closure.Column.step_kW` | -0.245376094095 | 1.91177603779 | 8.791 |
| `closure.Column.remaining_kW` | -0.313215627081 | 1.84393650481 | 6.887 |

## flash09_n2ch4_stryjek  (tutorials/steady/flash/flash09_n2ch4_stryjek)
2 rows; largest relative move 0.0051
Reason: the case's flash at 149.82 K and 20.6 bar (N2 + CH4, SRK both phases): its liquid and vapour streams are the same states, but the liquid outlet is now priced on the SRK liquid root, so the boundary enthalpy of feeds and products both move by -0.085 kW (0.5 %).  No unit duty, T, P, split or K-value moved (the two anchored K rows are unchanged); the first-law residual stays 8e-6 kW.

| row | golden | now | relative move |
|---|---|---|---|
| `boundary.global.H_feeds_kW` | -16.753311708 | -16.8384404517 | 0.005081 |
| `boundary.global.H_products_kW` | -16.7533203639 | -16.838448456 | 0.005081 |

## flash10_ch4propane_pcsaft  (tutorials/steady/flash/flash10_ch4propane_pcsaft)
2 rows; largest relative move 0.0073
Reason: the CH4 + propane flash on PC-SAFT: the liquid outlet (and the feed, which is two-phase at its condition) are now priced on the PC-SAFT liquid root, moving the boundary enthalpy of feeds and products together by -0.197 kW (0.7 %).  No duty, T, P, split moved; the first-law residual stays 3e-5 kW.

| row | golden | now | relative move |
|---|---|---|---|
| `boundary.global.H_feeds_kW` | -26.7848153024 | -26.9814513517 | 0.007341 |
| `boundary.global.H_products_kW` | -26.7848396566 | -26.9814797347 | 0.007341 |

## flash20_ethanol_water_pcsaft  (tutorials/steady/flash/flash20_ethanol_water_pcsaft)
5 rows; largest relative move 0.0282
Reason: the PC-SAFT flash's liquid on the PC-SAFT liquid root: the feeds' and products' boundary enthalpies move by +22.8 and +24.3 kW (0.16 %) and the open model-boundary step of the NRTL flash against it (`flashNRTL`, the pinned open debt of check_energy_closure) SHRINKS from 54.75 to 53.21 kW, since the PC-SAFT side's liquid moved with its own equation of state and the NRTL side's did not.  The gate's pin is re-pinned by hand (bin/curate/check_energy_closure.py).  The PC-SAFT unit itself still closes at 0.0003 kW.

| row | golden | now | relative move |
|---|---|---|---|
| `closure.flashNRTL.raw_kW` | -54.7525149473 | -53.2095471482 | 0.02818 |
| `closure.flashNRTL.step_kW` | -54.7525149473 | -53.2095471482 | 0.02818 |
| `boundary.global.H_feeds_kW` | -14014.9475299 | -13992.149776 | 0.001627 |
| `boundary.global.H_products_kW` | -14069.7069277 | -14045.358991 | 0.001731 |
| `boundary.global.residual_kW` | 54.7521690997 | 53.2092150331 | 0.02818 |

