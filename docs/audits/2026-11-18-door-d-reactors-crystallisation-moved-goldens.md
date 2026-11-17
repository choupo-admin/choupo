# C421 door family D (reactors, crystallisation, pressure exchanger, Williams-Otto) -- every moved golden row (2026-11-18)

Reason for the slice: PFR, the crystalliser (MSMPR, FVM and the mixed-solvent antisolvent volume), the pressure exchanger, the Williams-Otto plant and the catalyst pellet's liquid diffusivity stop reading each component's stored 25 C molar volume (or a typed constant, or the package's liquid diffusivity directly) and ask the property door at the unit's own T, P and composition (DEV.md 4c C421; C402 open item `PFR/crystalliser volume`).  The rows below were read from the scoped run's own mismatch lines (only rows beyond their tolerance; every other row of every `expected` is unchanged).  The `before` value is the committed golden, recorded at the merge-base of this branch, which passed.  A `source.*` row whose value is MISSING is the old bypass word the unit no longer publishes: the door's own `liquidDensity` / `vapourVolume` row replaces it in the property table.

20 cases, 1147 rows.

## ctrl12_williams_otto  (tutorials/ctrl/ctrl12_williams_otto)
1 rows
Reason: The six wo_* records now carry the benchmark's pure-substance density as `Vliq` = MW / rho0 (rho0 = 50 lb/ft3, Schmid et al. 2020, arXiv:2004.07614, sec. 3, eq. 3.14), without the dummy Tc, Pc, omega, so the door's route is `idealMix[flatVliq]`: a constant, additive volume, the paper's own V = Sum m_i / rho0i.  The plant asks the door for rho0 and uses it in V and in k_i = a_i / rho (it cancels).  The only row that moves is the SOURCE LABEL of the density (was `constant.benchmark.WilliamsOtto`, the unit's typed constant); every numeric row is inside its tolerance, the trajectory unchanged.  NOT a measured/adopted record: the benchmark's density is stated per PURE SUBSTANCE and the plant's holdup passes through constituent sets with a species at zero (a `measured` record matches ONE constituent set), so a pure-substance volume is the faithful form.

| row | golden | now | relative move |
|---|---|---|---|
| `source.plant.liquidDensity` | 'constant.benchmark.WilliamsOtto' | 'liquidVolume.idealMix[flatVliq]' |  |

## ctrl13_williams_otto_step  (tutorials/ctrl/ctrl13_williams_otto_step)
1 rows
Reason: as ctrl12_williams_otto.

| row | golden | now | relative move |
|---|---|---|---|
| `source.plant.liquidDensity` | 'constant.benchmark.WilliamsOtto' | 'liquidVolume.idealMix[flatVliq]' |  |

## ctrl14_williams_otto_pi  (tutorials/ctrl/ctrl14_williams_otto_pi)
1 rows
Reason: as ctrl12_williams_otto.

| row | golden | now | relative move |
|---|---|---|---|
| `source.plant.liquidDensity` | 'constant.benchmark.WilliamsOtto' | 'liquidVolume.idealMix[flatVliq]' |  |

## ctrl16_williams_otto_optimal  (tutorials/ctrl/ctrl16_williams_otto_optimal)
1 rows
Reason: as ctrl12_williams_otto.

| row | golden | now | relative move |
|---|---|---|---|
| `source.plant.liquidDensity` | 'constant.benchmark.WilliamsOtto' | 'liquidVolume.idealMix[flatVliq]' |  |

## ChemicalPlantTutorial  (tutorials/plant/ChemicalPlantTutorial)
17 rows
Reason: CONCENTRATION/Cryst (MSMPR, sucrose liquor at 313.15 K, 1.53 bar): Q was F Sum z_i Vliq_i at the stored 25 C volumes; it is F M / rho, rho = 1448.21 kg/m3 from the door (ideal mixing: water by the IAPWS95 reference equation at 313 K and 1.53 bar, sucrose at its flat 25 C volume, the record having no critical constants).  Only water's temperature and pressure effect enters, so Q +0.13 %, tau 2068.3 -> 2065.6 s; mu3, growth, nucleation, magma density follow through the PBE closure (largest 1.75e-3).  The old `liquidVolume` bypass source row (missingIsZero) is gone: the door's density row replaces it.

| row | golden | now | relative move |
|---|---|---|---|
| `equipment.CONCENTRATION.Cryst.values.residenceTime` | 2068.29508265 | 2065.63492648 | 0.001286 |
| `equipment.CONCENTRATION.Cryst.values.throughput` | 0.000483490005072 | 0.000484112650877 | 0.001288 |
| `kpi.CONCENTRATION.Cryst.L_dominant` | 0.000199029603536 | 0.000198908762482 | 0.0006072 |
| `kpi.CONCENTRATION.Cryst.L_meanMass` | 0.000265372804714 | 0.00026521168331 | 0.0006072 |
| `kpi.CONCENTRATION.Cryst.L_meanNumber` | 6.63432011785e-05 | 6.63029208275e-05 | 0.0006072 |
| `kpi.CONCENTRATION.Cryst.crystal_flow` | 0.150073535531 | 0.150004111931 | 0.0004626 |
| `kpi.CONCENTRATION.Cryst.crystal_mol` | 0.000438430764895 | 0.000438227948042 | 0.0004626 |
| `kpi.CONCENTRATION.Cryst.growthRate` | 3.20762746743e-08 | 3.20980827627e-08 | 0.0006799 |
| `kpi.CONCENTRATION.Cryst.magmaDensity` | 310.396355575 | 309.85373272 | 0.001748 |
| `kpi.CONCENTRATION.Cryst.mu3` | 0.372838598546 | 0.372186816586 | 0.001748 |
| `kpi.CONCENTRATION.Cryst.n0` | 3.20762746743e+15 | 3.20980827627e+15 | 0.0006799 |
| `kpi.CONCENTRATION.Cryst.nucleationRate` | 102888739.698 | 103028691.704 | 0.00136 |
| `kpi.CONCENTRATION.Cryst.residenceTime` | 2068.29508265 | 2065.63492648 | 0.001286 |
| `kpi.CONCENTRATION.Cryst.supersaturation` | 1.32076274674 | 1.32098082763 | 0.0001651 |
| `kpi.CONCENTRATION.Cryst.throughput` | 0.000483490005072 | 0.000484112650877 | 0.001288 |
| `kpi.CONCENTRATION.Cryst.yield` | 0.263045306672 | 0.262923622644 | 0.0004626 |
| `source.CONCENTRATION.Cryst.liquidVolume` | MISSING (expected 'bypass.recordVliq25C.missingIsZero') -- the run published no  |  |  |

## polycaprolactonePlant  (tutorials/plant/polycaprolactonePlant)
37 rows
Reason: Reactor (pfr, concentration law): Q was F Sum z_i Vliq_i at the 25 C volumes, so a reactor at 480 K read the liquid at room-temperature density; it is now F M / rho, rho the door's liquid density at the feed T (Rackett carries the temperature, anchored at each Vliq): tau_s 5643 -> 4887 s (-13 %, the melt is less dense hot).  The chain length is a steep function of conversion near full conversion (Carothers), so Mn, Mw, Xn, Xw move by 40 % for a conversion change of 1.4 points (X_limiting 0.9789 -> 0.9646); Da, F_out, the downstream flash feed, duties and the boundary follow.

| row | golden | now | relative move |
|---|---|---|---|
| `stream.condensate.F` | 0.000284144014829 | 0.000282146440977 | 0.00703 |
| `stream.condensateRecycle.F` | 5.01430614404e-05 | 4.97905484076e-05 | 0.00703 |
| `stream.overhead.F` | 0.000334287076269 | 0.000331936989384 | 0.00703 |
| `stream.polymerMelt.F` | 0.000266009767806 | 0.000264337600027 | 0.006286 |
| `stream.reactorFeed.F` | 0.000327920839218 | 0.000327568331784 | 0.001075 |
| `stream.reactorOut.F` | 0.000600345663827 | 0.000596274589411 | 0.006781 |
| `kpi.Devolatiliser.F_alpha` | 0.000266009767806 | 0.000264337600027 | 0.006286 |
| `kpi.Devolatiliser.F_beta` | 0.000334287076269 | 0.000331936989384 | 0.00703 |
| `kpi.Devolatiliser.F_in` | 0.000600345663827 | 0.000596274589411 | 0.006781 |
| `kpi.Devolatiliser.Q` | 2198.49094759 | 2229.59446156 | 0.01415 |
| `kpi.Devolatiliser.Q_kW` | 2.19849094759 | 2.22959446156 | 0.01415 |
| `kpi.Devolatiliser.V_over_F` | 0.556869621369 | 0.556684781272 | 0.0003319 |
| `kpi.Mixer.F_out` | 0.000327920839218 | 0.000327568331784 | 0.001075 |
| `kpi.Reactor.Da_kTau` | 3.85832756436 | 3.34122944983 | 0.134 |
| `kpi.Reactor.F_out_kmol_h` | 2.16124438978 | 2.14658852188 | 0.006781 |
| `kpi.Reactor.Mn_kg_kmol` | 5409.39924894 | 3224.89352358 | 0.4038 |
| `kpi.Reactor.Mw_kg_kmol` | 10704.6584979 | 6335.64704716 | 0.4081 |
| `kpi.Reactor.PDI` | 1.97889673603 | 1.96460658339 | 0.007221 |
| `kpi.Reactor.X_limiting` | 0.978896736028 | 0.964606583391 | 0.0146 |
| `kpi.Reactor.Xn` | 47.3926690813 | 28.2538419798 | 0.4038 |
| `kpi.Reactor.Xw` | 93.7853381626 | 55.5076839597 | 0.4081 |
| `kpi.Reactor.p_conversion` | 0.978896736028 | 0.964606583391 | 0.0146 |
| `kpi.Reactor.tau_s` | 5643.40513537 | 4887.06858636 | 0.134 |
| `utility.Devolatiliser.heating.steamHP.duty_kW` | 2.19849094759 | 2.22959446156 | 0.01415 |
| `utility.Devolatiliser.heating.steamHP.kg_s` | 0.00128266683057 | 0.00130081357151 | 0.01415 |
| `utility.Devolatiliser.heating.steamHP.eur_h` | 0.142462213404 | 0.144477721109 | 0.01415 |
| `kpi.Reactor.Q_kW` | -42.3538316737 | -41.6981355626 | 0.01548 |
| `boundary.global.Q_boundary_kW` | -38.0314521127 | -37.3958497715 | 0.01671 |
| `boundary.global.H_products_kW` | -231.632546576 | -231.008163885 | 0.002696 |
| `utility.Reactor.cooling.coolingWater.duty_kW` | -42.3538316737 | -41.6981355626 | 0.01548 |
| `utility.Reactor.cooling.coolingWater.kg_s` | 1.01324956157 | 0.997563051737 | 0.01548 |
| `utility.Reactor.cooling.coolingWater.eur_h` | 0.0609895176101 | 0.0600453152101 | 0.01548 |
| `kpi.Mixer.Q_kW` | 2.12388861342 | 2.07269132949 | 0.02411 |
| `utility.Mixer.heating.steamHP.duty_kW` | 2.12388861342 | 2.07269132949 | 0.02411 |
| `utility.Mixer.heating.steamHP.kg_s` | 0.00123914154809 | 0.00120927148745 | 0.02411 |
| `utility.Mixer.heating.steamHP.eur_h` | 0.13762798215 | 0.134310398151 | 0.02411 |
| `source.Reactor.liquidVolume` | MISSING (expected 'bypass.recordVliq25C') -- the run published no such word |  |  |

## swro01_campoDalias  (tutorials/plant/swro01_campoDalias)
871 rows
Reason: PX (pressureExchanger): v = M/rho of each inlet from the door's density at its own T, P, composition, instead of Sum z_i Vliq_i with the dissolved salt given NO volume.  The case's splitter fraction was tuned (to 1e-5) so that the exchanger's two volumes balanced on the old reading; on the true densities the imbalance was +3.96 %, so the fraction was RETUNED by secant iteration on the run's own `flowImbalance` to 0.526017 (was 0.520922; toHPpump 0.473983 from 0.479078): flowImbalance 1.7e-7, the design intent of the header (`a balanced exchanger`) restored.  Every downstream row (HP pump flow, RO feeds, trains, energy) follows from the new split; the RO1 pass pressure drop, permeate flows and SEC move with it.  The `basis` text rows of the train equipment embed the header densities (4-digit changes of rho printed in a string).

| row | golden | now | relative move |
|---|---|---|---|
| `stream.boosted.F` | 80.3145649406 | 81.1042942618 | 0.009833 |
| `stream.brine.F` | 81.8932425461 | 81.8814232255 | 0.0001443 |
| `stream.conc2.F` | 9.81369537562 | 9.85493786982 | 0.004203 |
| `stream.conc2a.F` | 22.4440725189 | 22.4771057845 | 0.001472 |
| `stream.disinfected.F` | 63.2017707292 | 63.188311927 | 0.0002129 |
| `stream.feed1.F` | 155.703546625 | 155.744781481 | 0.0002648 |
| `stream.feed2.F` | 73.0154661048 | 73.0432497968 | 0.0003805 |
| `stream.hpFeed.F` | 74.5941437102 | 73.8203787605 | 0.01037 |
| `stream.perm1.F` | 73.0154661048 | 73.0432497968 | 0.0003805 |
| `stream.perm2.F` | 63.2017707292 | 63.188311927 | 0.0002129 |
| `stream.perm2a.F` | 50.5713935859 | 50.5661440123 | 0.0001038 |
| `stream.perm2b.F` | 12.6303771433 | 12.6221679147 | 0.00065 |
| `stream.product.F` | 63.2017707292 | 63.188311927 | 0.0002129 |
| `stream.pxHPout.F` | 80.3145649406 | 81.1042942618 | 0.009833 |
| `stream.remin.F` | 63.2017707292 | 63.188311927 | 0.0002129 |
| `stream.roFeed.F` | 154.908708651 | 154.924673022 | 0.0001031 |
| `stream.spentBrine.F` | 82.6880765925 | 82.701532543 | 0.0001627 |
| `stream.toHPpump.F` | 74.5941437102 | 73.8203787605 | 0.01037 |
| `stream.toPX.F` | 81.1094029152 | 81.9244027201 | 0.01005 |
| `kpi.Booster.F` | 80.3145649406 | 81.1042942618 | 0.009833 |
| `kpi.Booster.W_hydraulic` | 351083.263865 | 354530.952322 | 0.00982 |
| `kpi.Booster.W_shaft` | 438854.079832 | 443163.690403 | 0.00982 |
| `kpi.Booster.W_shaft_kW` | 438.854079832 | 443.163690403 | 0.00982 |
| `kpi.Disinfection.holdupMass_NaCl_kg` | 3.76607214585 | 3.75912080409 | 0.001846 |
| `kpi.Disinfection.holdupMass_boron_kg` | 0.0868933113139 | 0.086742615596 | 0.001734 |
| `kpi.Disinfection.holdupMass_kg` | 2049446.36664 | 2049009.93336 | 0.000213 |
| `kpi.Disinfection.holdupMass_water_kg` | 2049442.51368 | 2049006.08749 | 0.0002129 |
| `kpi.Disinfection.holdupVolume_m3` | 2055.70357606 | 2055.26580994 | 0.000213 |
| `kpi.Disinfection.massFlow_kg_s` | 1138.5813148 | 1138.33885187 | 0.000213 |
| `kpi.Disinfection.vesselVolume_m3` | 2418.47479536 | 2417.9597764 | 0.000213 |
| `kpi.Disinfection.volumetricFlow_m3_s` | 1.14205754225 | 1.14181433886 | 0.000213 |
| `kpi.FeedMix.F_out` | 155.703546625 | 155.744781481 | 0.0002648 |
| `kpi.HPpump.F` | 74.5941437102 | 73.8203787605 | 0.01037 |
| `kpi.HPpump.W_hydraulic` | 7556951.21676 | 7478562.28333 | 0.01037 |
| `kpi.HPpump.W_shaft` | 9215794.16678 | 9120197.9065 | 0.01037 |
| `kpi.HPpump.W_shaft_kW` | 9215.79416678 | 9120.1979065 | 0.01037 |
| `kpi.Join.F_out` | 154.908708651 | 154.924673022 | 0.0001031 |
| `kpi.PX.F_HPout` | 80.3145649406 | 81.1042942618 | 0.009833 |
| `kpi.PX.F_LPout` | 82.6880765925 | 82.701532543 | 0.0001627 |
| `kpi.PX.Q_HPin_m3h` | 5221.3166554 | 5329.63529181 | 0.02075 |
| `kpi.PX.Q_HPout_m3h` | 5169.10348885 | 5276.33893889 | 0.02075 |
| `kpi.PX.Q_LPin_m3h` | 5221.26781437 | 5329.63619396 | 0.02076 |
| `kpi.PX.Q_LPout_m3h` | 5273.48098093 | 5382.93254688 | 0.02076 |
| `kpi.PX.boosterDuty_kW` | 347.331292103 | 354.532400101 | 0.02073 |
| `kpi.PX.dissipation_kW` | 430.518127946 | 439.449756439 | 0.02075 |
| `kpi.PX.feedSalinityIncrease` | 0.0178781453307 | 0.0177109695901 | 0.009351 |
| `kpi.PX.flowImbalance` | -9.35415958288e-06 | 1.69270632289e-07 | 1.018 |
| `kpi.PX.leakageFlow_m3h` | 52.213166554 | 53.2963529181 | 0.02075 |
| `kpi.PX.mixedBrineFlow_m3h` | 103.382069777 | 105.526778778 | 0.02075 |
| `kpi.PX.recoveredPower_kW` | 7702.24075728 | 7862.03175599 | 0.02075 |
| `kpi.PX.salinity_HPout` | 0.033705805123 | 0.0336915659863 | 0.0004225 |
| `kpi.PX.salinity_LPin` | 0.0331137919383 | 0.0331052400858 | 0.0002583 |
| `kpi.Pass2Pump.F` | 73.0154661048 | 73.0432497968 | 0.0003805 |
| `kpi.Pass2Pump.W_hydraulic` | 1284953.03256 | 1285441.98038 | 0.0003805 |
| `kpi.Pass2Pump.W_shaft` | 1606191.2907 | 1606802.47547 | 0.0003805 |
| `kpi.Pass2Pump.W_shaft_kW` | 1606.1912907 | 1606.80247547 | 0.0003805 |
| `kpi.ProductMix.F_out` | 63.2017707292 | 63.188311927 | 0.0002129 |
| `kpi.ProductTank.holdupMass_NaCl_kg` | 45.1928657502 | 45.109449649 | 0.001846 |
| `kpi.ProductTank.holdupMass_boron_kg` | 1.04271973577 | 1.04091138715 | 0.001734 |
| `kpi.ProductTank.holdupMass_kg` | 24593356.3997 | 24588119.2003 | 0.000213 |
| `kpi.ProductTank.holdupMass_water_kg` | 24593310.1641 | 24588073.0499 | 0.0002129 |
| `kpi.ProductTank.holdupVolume_m3` | 24668.4429127 | 24663.1897193 | 0.000213 |
| `kpi.ProductTank.massFlow_kg_s` | 1138.5813148 | 1138.33885187 | 0.000213 |
| `kpi.ProductTank.vesselVolume_m3` | 29021.6975443 | 29015.5173168 | 0.000213 |
| `kpi.ProductTank.volumetricFlow_m3_s` | 1.14205754225 | 1.14181433886 | 0.000213 |
| `kpi.RO1.Gamma_NaCl_avg` | 0.0992768049856 | 0.0993168960778 | 0.0004038 |
| `kpi.RO1.Gamma_NaCl_elem1` | 0.183928076106 | 0.183984170664 | 0.000305 |
| `kpi.RO1.Gamma_NaCl_elem2` | 0.154406488999 | 0.154466356396 | 0.0003877 |
| `kpi.RO1.Gamma_NaCl_elem3` | 0.121689323412 | 0.121743523061 | 0.0004454 |
| `kpi.RO1.Gamma_NaCl_elem4` | 0.0902615270314 | 0.0903046677647 | 0.000478 |
| `kpi.RO1.Gamma_NaCl_elem5` | 0.063808702765 | 0.0638398665992 | 0.0004884 |
| `kpi.RO1.Gamma_NaCl_elem6` | 0.0435089184302 | 0.0435299430213 | 0.0004832 |
| `kpi.RO1.Gamma_NaCl_elem7` | 0.0288694710445 | 0.0288830175789 | 0.0004692 |
| `kpi.RO1.Gamma_boron_avg` | 0.091334344671 | 0.0913709817072 | 0.0004011 |
| `kpi.RO1.Gamma_boron_elem1` | 0.168627222016 | 0.168678084196 | 0.0003016 |
| `kpi.RO1.Gamma_boron_elem2` | 0.141824546033 | 0.141879023794 | 0.0003841 |
| `kpi.RO1.Gamma_boron_elem3` | 0.112003442176 | 0.112052962977 | 0.0004421 |
| `kpi.RO1.Gamma_boron_elem4` | 0.0832416067879 | 0.0832811789199 | 0.0004754 |
| `kpi.RO1.Gamma_boron_elem5` | 0.0589441132575 | 0.0589727947485 | 0.0004866 |
| `kpi.RO1.Gamma_boron_elem6` | 0.0402431776844 | 0.0402625773217 | 0.0004821 |
| `kpi.RO1.Gamma_boron_elem7` | 0.0267270170069 | 0.0267395397451 | 0.0004685 |
| `kpi.RO1.J_w_avg` | 3.56015456355e-06 | 3.56153044602e-06 | 0.0003865 |
| `kpi.RO1.J_w_avg_elem1` | 7.82630190745e-06 | 7.82908633878e-06 | 0.0003558 |
| `kpi.RO1.J_w_avg_elem2` | 5.89503813604e-06 | 5.89736733597e-06 | 0.0003951 |
| `kpi.RO1.J_w_avg_elem3` | 4.22754343548e-06 | 4.22929829267e-06 | 0.0004151 |
| `kpi.RO1.J_w_avg_elem4` | 2.91377886206e-06 | 2.91498887827e-06 | 0.0004153 |
| `kpi.RO1.J_w_avg_elem5` | 1.9509523889e-06 | 1.95173347264e-06 | 0.0004004 |
| `kpi.RO1.J_w_avg_elem6` | 1.28006733994e-06 | 1.28054951257e-06 | 0.0003767 |
| `kpi.RO1.J_w_avg_elem7` | 8.27399874968e-07 | 8.27689291206e-07 | 0.0003498 |
| `kpi.RO1.Re_in_elem6` | 89.7644181872 | 89.7544577279 | 0.000111 |
| `kpi.RO1.Re_in_elem7` | 86.0939858787 | 86.0826647159 | 0.0001315 |
| `kpi.RO1.Re_min` | 83.7215206666 | 83.7093837723 | 0.000145 |
| `kpi.RO1.c_ret_elem1` | 0.681883555437 | 0.681734214209 | 0.000219 |
| `kpi.RO1.c_ret_elem2` | 0.78112154966 | 0.780988529299 | 0.0001703 |
| `kpi.RO1.c_ret_elem3` | 0.872183979789 | 0.872076493626 | 0.0001232 |
| `kpi.RO1.dP_elem1` | 16225.6026929 | 16227.774865 | 0.0001339 |
| `kpi.RO1.dP_elem4` | 8720.33610657 | 8719.44141157 | 0.0001026 |
| `kpi.RO1.dP_elem5` | 7729.8582899 | 7728.6140267 | 0.000161 |
| `kpi.RO1.dP_elem6` | 7101.46851923 | 7100.0281656 | 0.0002028 |
| `kpi.RO1.dP_elem7` | 6704.43481453 | 6702.88660139 | 0.0002309 |
| `kpi.RO1.feedFlowPerVessel` | 0.00200240504115 | 0.00200261121531 | 0.000103 |
| `kpi.RO1.feedFlow_elem1` | 0.00200240504115 | 0.00200261121531 | 0.000103 |
| `kpi.RO1.feedFlow_elem6` | 0.00115830129614 | 0.00115817966553 | 0.000105 |
| `kpi.RO1.feedFlow_elem7` | 0.00111093880457 | 0.00111079933357 | 0.0001255 |
| `kpi.RO1.recovery_elem1` | 0.144612685558 | 0.14464924211 | 0.0002528 |
| `kpi.RO1.recovery_elem2` | 0.253539903854 | 0.253608280071 | 0.0002697 |
| `kpi.RO1.recovery_elem3` | 0.331655521772 | 0.331748278305 | 0.0002797 |
| `kpi.RO1.recovery_elem4` | 0.385495686814 | 0.385605256471 | 0.0002842 |
| `kpi.RO1.recovery_elem5` | 0.421544956021 | 0.421665245517 | 0.0002854 |
| `kpi.RO1.recovery_elem6` | 0.445197758827 | 0.445324521767 | 0.0002847 |
| `kpi.RO1.recovery_elem7` | 0.460486271763 | 0.460616807928 | 0.0002835 |
| `kpi.RO1.u_crossflow_inlet` | 0.160645864292 | 0.160662404914 | 0.000103 |
| `kpi.RO1.water_recovery` | 0.460486271763 | 0.460616807928 | 0.0002835 |
| `kpi.RO2a.Gamma_NaCl_avg` | 0.208473183881 | 0.20828883292 | 0.0008843 |
| `kpi.RO2a.Gamma_NaCl_elem1` | 0.15222567475 | 0.15216703248 | 0.0003852 |
| `kpi.RO2a.Gamma_NaCl_elem2` | 0.162111148859 | 0.162033286928 | 0.0004803 |
| `kpi.RO2a.Gamma_NaCl_elem3` | 0.175174953697 | 0.175071768493 | 0.000589 |
| `kpi.RO2a.Gamma_NaCl_elem4` | 0.193141787312 | 0.193002314679 | 0.0007221 |
| `kpi.RO2a.Gamma_NaCl_elem5` | 0.218246173336 | 0.218051712924 | 0.000891 |
| `kpi.RO2a.Gamma_NaCl_elem6` | 0.25446499932 | 0.254180900055 | 0.001116 |
| `kpi.RO2a.Gamma_NaCl_elem7` | 0.309572300807 | 0.309126994929 | 0.001438 |
| `kpi.RO2a.Gamma_boron_avg` | 0.198070353684 | 0.19789680563 | 0.0008762 |
| `kpi.RO2a.Gamma_boron_elem1` | 0.144975258425 | 0.144919688277 | 0.0003833 |
| `kpi.RO2a.Gamma_boron_elem2` | 0.154337840072 | 0.154264110494 | 0.0004777 |
| `kpi.RO2a.Gamma_boron_elem3` | 0.166700676141 | 0.166603059067 | 0.0005856 |
| `kpi.RO2a.Gamma_boron_elem4` | 0.183685000092 | 0.183553222579 | 0.0007174 |
| `kpi.RO2a.Gamma_boron_elem5` | 0.207380708956 | 0.207197304562 | 0.0008844 |
| `kpi.RO2a.Gamma_boron_elem6` | 0.241493443783 | 0.241226184186 | 0.001107 |
| `kpi.RO2a.Gamma_boron_elem7` | 0.293229057844 | 0.292811781979 | 0.001423 |
| `kpi.RO2a.J_w_avg` | 1.0072109408e-05 | 1.00710639482e-05 | 0.0001038 |
| `kpi.RO2a.J_w_avg_elem4` | 9.94064956147e-06 | 9.93947795672e-06 | 0.0001179 |
| `kpi.RO2a.J_w_avg_elem5` | 9.63698993484e-06 | 9.63557301093e-06 | 0.000147 |
| `kpi.RO2a.J_w_avg_elem6` | 9.38219922857e-06 | 9.38061948936e-06 | 0.0001684 |
| `kpi.RO2a.J_w_avg_elem7` | 9.14988490604e-06 | 9.14830264799e-06 | 0.0001729 |
| `kpi.RO2a.Re_in_elem1` | 285.203722223 | 285.312244994 | 0.0003805 |
| `kpi.RO2a.Re_in_elem2` | 253.496181924 | 253.605151666 | 0.0004299 |
| `kpi.RO2a.Re_in_elem3` | 223.336311751 | 223.44677983 | 0.0004946 |
| `kpi.RO2a.Re_in_elem4` | 194.44819083 | 194.561106292 | 0.0005807 |
| `kpi.RO2a.Re_in_elem5` | 166.599209277 | 166.715407252 | 0.0006975 |
| `kpi.RO2a.Re_in_elem6` | 139.60093786 | 139.72110561 | 0.0008608 |
| `kpi.RO2a.Re_in_elem7` | 113.31646906 | 113.44106271 | 0.0011 |
| `kpi.RO2a.Re_inlet` | 285.203722223 | 285.312244994 | 0.0003805 |
| `kpi.RO2a.Re_max` | 285.203722223 | 285.312244994 | 0.0003805 |
| `kpi.RO2a.Re_min` | 87.6828347201 | 87.8118613207 | 0.001472 |
| `kpi.RO2a.c_ret_elem1` | 0.00209141799891 | 0.00209108624646 | 0.0001586 |
| `kpi.RO2a.c_ret_elem2` | 0.00237169716644 | 0.00237116869768 | 0.0002228 |
| `kpi.RO2a.c_ret_elem3` | 0.00272132063741 | 0.0027204821416 | 0.0003081 |
| `kpi.RO2a.c_ret_elem4` | 0.00317262296095 | 0.0031712784065 | 0.0004238 |
| `kpi.RO2a.c_ret_elem5` | 0.00378119575073 | 0.00377898185883 | 0.0005855 |
| `kpi.RO2a.c_ret_elem6` | 0.0046508129702 | 0.00464699157933 | 0.0008217 |
| `kpi.RO2a.c_ret_elem7` | 0.0059981575107 | 0.00599102446572 | 0.001189 |
| `kpi.RO2a.dP_elem1` | 48540.2643985 | 48573.7508535 | 0.0006899 |
| `kpi.RO2a.dP_elem2` | 39425.8469718 | 39456.8738607 | 0.000787 |
| `kpi.RO2a.dP_elem3` | 31465.2477878 | 31494.0418202 | 0.0009151 |
| `kpi.RO2a.dP_elem4` | 24524.3527042 | 24551.011936 | 0.001087 |
| `kpi.RO2a.dP_elem5` | 18505.201168 | 18529.6961992 | 0.001324 |
| `kpi.RO2a.dP_elem6` | 13342.1278497 | 13364.2955759 | 0.001661 |
| `kpi.RO2a.dP_elem7` | 8999.79532753 | 9019.3225041 | 0.00217 |
| `kpi.RO2a.dP_feed` | 184802.836208 | 184988.99275 | 0.001007 |
| `kpi.RO2a.feedFlowPerVessel` | 0.00407212055612 | 0.00407367007147 | 0.0003805 |
| `kpi.RO2a.feedFlow_elem1` | 0.00407212055612 | 0.00407367007147 | 0.0003805 |
| `kpi.RO2a.feedFlow_elem2` | 0.00361940231797 | 0.00362095821136 | 0.0004299 |
| `kpi.RO2a.feedFlow_elem3` | 0.00318878161519 | 0.00319035889812 | 0.0004946 |
| `kpi.RO2a.feedFlow_elem4` | 0.00277631886712 | 0.00277793109016 | 0.0005807 |
| `kpi.RO2a.feedFlow_elem5` | 0.00237869288466 | 0.0023803519719 | 0.0006975 |
| `kpi.RO2a.feedFlow_elem6` | 0.00199321328726 | 0.00199492905146 | 0.0008608 |
| `kpi.RO2a.feedFlow_elem7` | 0.00161792531812 | 0.00161970427188 | 0.0011 |
| `kpi.RO2a.recovery_elem1` | 0.111175057787 | 0.11113120409 | 0.0003945 |
| `kpi.RO2a.recovery_elem2` | 0.216923573051 | 0.216834244761 | 0.0004118 |
| `kpi.RO2a.recovery_elem3` | 0.318212997662 | 0.318076564517 | 0.0004287 |
| `kpi.RO2a.recovery_elem4` | 0.415858923655 | 0.415673844437 | 0.0004451 |
| `kpi.RO2a.recovery_elem5` | 0.510522033964 | 0.510287034429 | 0.0004603 |
| `kpi.RO2a.recovery_elem6` | 0.602682362709 | 0.602396796141 | 0.0004738 |
| `kpi.RO2a.recovery_elem7` | 0.692560692979 | 0.692225402655 | 0.0004841 |
| `kpi.RO2a.u_crossflow_inlet` | 0.302189923784 | 0.302304912503 | 0.0003805 |
| `kpi.RO2a.water_recovery` | 0.692560692979 | 0.692225402655 | 0.0004841 |
| `kpi.RO2b.Gamma_NaCl_avg` | 0.144433196882 | 0.14398879417 | 0.003077 |
| `kpi.RO2b.Gamma_NaCl_elem1` | 0.125629438758 | 0.125418729486 | 0.001677 |
| `kpi.RO2b.Gamma_NaCl_elem2` | 0.129393939635 | 0.129130007308 | 0.00204 |
| `kpi.RO2b.Gamma_NaCl_elem3` | 0.134347076625 | 0.134020335285 | 0.002432 |
| `kpi.RO2b.Gamma_NaCl_elem4` | 0.140869408629 | 0.140464345479 | 0.002875 |
| `kpi.RO2b.Gamma_NaCl_elem5` | 0.149273268288 | 0.148769279779 | 0.003376 |
| `kpi.RO2b.Gamma_NaCl_elem6` | 0.159961071845 | 0.159330648222 | 0.003941 |
| `kpi.RO2b.Gamma_NaCl_elem7` | 0.173438550208 | 0.1726452201 | 0.004574 |
| `kpi.RO2b.Gamma_boron_avg` | 0.137720842618 | 0.137299115605 | 0.003062 |
| `kpi.RO2b.Gamma_boron_elem1` | 0.119872760763 | 0.119672387961 | 0.001672 |
| `kpi.RO2b.Gamma_boron_elem2` | 0.123449420202 | 0.123198531535 | 0.002032 |
| `kpi.RO2b.Gamma_boron_elem3` | 0.128154013311 | 0.127843553475 | 0.002423 |
| `kpi.RO2b.Gamma_boron_elem4` | 0.134346658013 | 0.133961978102 | 0.002863 |
| `kpi.RO2b.Gamma_boron_elem5` | 0.142321694294 | 0.141843368291 | 0.003361 |
| `kpi.RO2b.Gamma_boron_elem6` | 0.152457571936 | 0.151859711013 | 0.003921 |
| `kpi.RO2b.Gamma_boron_elem7` | 0.165228587988 | 0.164476951623 | 0.004549 |
| `kpi.RO2b.J_w_avg` | 7.54535942033e-06 | 7.54045740335e-06 | 0.0006497 |
| `kpi.RO2b.J_w_avg_elem1` | 8.83768735891e-06 | 8.83543447125e-06 | 0.0002549 |
| `kpi.RO2b.J_w_avg_elem2` | 8.31156417281e-06 | 8.30814366297e-06 | 0.0004115 |
| `kpi.RO2b.J_w_avg_elem3` | 7.85454453952e-06 | 7.85008716767e-06 | 0.0005675 |
| `kpi.RO2b.J_w_avg_elem4` | 7.45481127468e-06 | 7.44947228906e-06 | 0.0007162 |
| `kpi.RO2b.J_w_avg_elem5` | 7.10069709532e-06 | 7.09467752945e-06 | 0.0008477 |
| `kpi.RO2b.J_w_avg_elem6` | 6.77989112061e-06 | 6.77347126214e-06 | 0.0009469 |
| `kpi.RO2b.J_w_avg_elem7` | 6.47832038047e-06 | 6.47191544091e-06 | 0.0009887 |
| `kpi.RO2b.Re_in_elem1` | 263.04850416 | 263.435583962 | 0.001472 |
| `kpi.RO2b.Re_in_elem2` | 238.285290487 | 238.678690137 | 0.001651 |
| `kpi.RO2b.Re_in_elem3` | 214.996274796 | 215.39926554 | 0.001874 |
| `kpi.RO2b.Re_in_elem4` | 192.987828826 | 193.403315577 | 0.002153 |
| `kpi.RO2b.Re_in_elem5` | 172.099436084 | 172.529888796 | 0.002501 |
| `kpi.RO2b.Re_in_elem6` | 152.20327182 | 152.65059719 | 0.002939 |
| `kpi.RO2b.Re_in_elem7` | 133.206006395 | 133.671325779 | 0.003493 |
| `kpi.RO2b.Re_inlet` | 263.04850416 | 263.435583962 | 0.001472 |
| `kpi.RO2b.Re_max` | 263.04850416 | 263.435583962 | 0.001472 |
| `kpi.RO2b.Re_min` | 115.053742651 | 115.537013998 | 0.0042 |
| `kpi.RO2b.c_ret_elem1` | 0.00661807999313 | 0.00660903265752 | 0.001367 |
| `kpi.RO2b.c_ret_elem2` | 0.0073297156963 | 0.00731807551607 | 0.001588 |
| `kpi.RO2b.c_ret_elem3` | 0.00815943492343 | 0.0081442305734 | 0.001863 |
| `kpi.RO2b.c_ret_elem4` | 0.00914241061853 | 0.00912222913998 | 0.002207 |
| `kpi.RO2b.c_ret_elem5` | 0.0103285284764 | 0.010301265417 | 0.00264 |
| `kpi.RO2b.c_ret_elem6` | 0.0117903094948 | 0.0117527453065 | 0.003186 |
| `kpi.RO2b.c_ret_elem7` | 0.0136360660285 | 0.0135831272321 | 0.003882 |
| `kpi.RO2b.dP_elem1` | 43009.9416868 | 43124.4045056 | 0.002661 |
| `kpi.RO2b.dP_elem2` | 36229.6944402 | 36338.5756045 | 0.003005 |
| `kpi.RO2b.dP_elem3` | 30281.4948996 | 30385.4732009 | 0.003434 |
| `kpi.RO2b.dP_elem4` | 25058.3801373 | 25157.823912 | 0.003968 |
| `kpi.RO2b.dP_elem5` | 20475.1665473 | 20570.1484435 | 0.004639 |
| `kpi.RO2b.dP_elem6` | 16464.9870336 | 16555.2899498 | 0.005485 |
| `kpi.RO2b.dP_elem7` | 12976.5176878 | 13061.6343682 | 0.006559 |
| `kpi.RO2b.dP_feed` | 184496.182432 | 185193.349985 | 0.003779 |
| `kpi.RO2b.feedFlowPerVessel` | 0.00375515144466 | 0.00376067830788 | 0.001472 |
| `kpi.RO2b.feedFlow_elem1` | 0.00375515144466 | 0.00376067830788 | 0.001472 |
| `kpi.RO2b.feedFlow_elem2` | 0.0034016439503 | 0.00340726092903 | 0.001651 |
| `kpi.RO2b.feedFlow_elem3` | 0.00306918138339 | 0.00307493518251 | 0.001875 |
| `kpi.RO2b.feedFlow_elem4` | 0.00275499960181 | 0.00276093169581 | 0.002153 |
| `kpi.RO2b.feedFlow_elem5` | 0.00245680715082 | 0.00246295280424 | 0.002501 |
| `kpi.RO2b.feedFlow_elem6` | 0.00217277926701 | 0.00217916570307 | 0.002939 |
| `kpi.RO2b.feedFlow_elem7` | 0.00190158362219 | 0.00190822685258 | 0.003494 |
| `kpi.RO2b.recovery_elem1` | 0.0941393441958 | 0.0939770301834 | 0.001724 |
| `kpi.RO2b.recovery_elem2` | 0.182674406446 | 0.182345595456 | 0.0018 |
| `kpi.RO2b.recovery_elem3` | 0.266341280129 | 0.265842098214 | 0.001874 |
| `kpi.RO2b.recovery_elem4` | 0.345750181576 | 0.345077509267 | 0.001946 |
| `kpi.RO2b.recovery_elem5` | 0.421387046826 | 0.420539188769 | 0.002012 |
| `kpi.RO2b.recovery_elem6` | 0.493606676 | 0.492584396655 | 0.002071 |
| `kpi.RO2b.recovery_elem7` | 0.562613963465 | 0.56142214252 | 0.002118 |
| `kpi.RO2b.u_crossflow_inlet` | 0.278667812807 | 0.279077958418 | 0.001472 |
| `kpi.RO2b.water_recovery` | 0.562613963465 | 0.56142214252 | 0.002118 |
| `kpi.Remineralisation.holdupMass_NaCl_kg` | 1.88303607293 | 1.87956040204 | 0.001846 |
| `kpi.Remineralisation.holdupMass_boron_kg` | 0.0434466556569 | 0.043371307798 | 0.001734 |
| `kpi.Remineralisation.holdupMass_kg` | 1024723.18332 | 1024504.96668 | 0.000213 |
| `kpi.Remineralisation.holdupMass_water_kg` | 1024721.25684 | 1024503.04375 | 0.0002129 |
| `kpi.Remineralisation.holdupVolume_m3` | 1027.85178803 | 1027.63290497 | 0.000213 |
| `kpi.Remineralisation.massFlow_kg_s` | 1138.5813148 | 1138.33885187 | 0.000213 |
| `kpi.Remineralisation.vesselVolume_m3` | 1209.23739768 | 1208.9798882 | 0.000213 |
| `kpi.Remineralisation.volumetricFlow_m3_s` | 1.14205754225 | 1.14181433886 | 0.000213 |
| `equipment.Booster/train1.values.Q_plant` | 5224.94162024 | 5276.31739228 | 0.009833 |
| `equipment.Booster/train1.values.Q_train` | 870.823603374 | 879.386232047 | 0.009833 |
| `equipment.Booster/train1.values.flowPerPump` | 870.823603374 | 879.386232047 | 0.009833 |
| `equipment.Booster/train1.values.shaftPowerPerPump` | 73.1423466386 | 73.8606150671 | 0.00982 |
| `equipment.Booster/train1.values.shaftPowerPlant` | 438.854079832 | 443.163690403 | 0.00982 |
| `equipment.Booster/train1.values.shaftPowerTrain` | 73.1423466386 | 73.8606150671 | 0.00982 |
| `equipment.Booster/train1.values.utilisation` | 0.544264752109 | 0.549616395029 | 0.009833 |
| `equipment.Disinfection/tank1.values.V_R` | 2418.47479536 | 2417.9597764 | 0.000213 |
| `equipment.Disinfection/tank1.values.V_stored` | 2055.70357606 | 2055.26580994 | 0.000213 |
| `equipment.Disinfection/tank1.values.V_tanks` | 2418.47479536 | 2417.9597764 | 0.000213 |
| `equipment.Disinfection/tank1.values.massFlow` | 1138.5813148 | 1138.33885187 | 0.000213 |
| `equipment.Disinfection/tank1.inventory.volume` | 2418.47479536 | 2417.9597764 | 0.000213 |
| `equipment.Disinfection/tank1.inventory.remin.volume` | 2055.70357606 | 2055.26580994 | 0.000213 |
| `equipment.Disinfection/tank1.inventory.remin.mass` | 2049446.36664 | 2049009.93336 | 0.000213 |
| `equipment.Disinfection/tank1.inventory.mass.NaCl` | 3.76607214585 | 3.75912080409 | 0.001846 |
| `equipment.Disinfection/tank1.inventory.mass.boron` | 0.0868933113139 | 0.086742615596 | 0.001734 |
| `equipment.Disinfection/tank1.inventory.mass.water` | 2049442.51368 | 2049006.08749 | 0.0002129 |
| `equipment.Disinfection/tank1.inventory.mass.total` | 2049446.36664 | 2049009.93336 | 0.000213 |
| `equipment.HPpump/train1.values.Q_plant` | 4852.76268849 | 4802.42454545 | 0.01037 |
| `equipment.HPpump/train1.values.Q_train` | 808.793781415 | 800.404090908 | 0.01037 |
| `equipment.HPpump/train1.values.flowPerPump` | 808.793781415 | 800.404090908 | 0.01037 |
| `equipment.HPpump/train1.values.shaftPowerPerPump` | 1535.96569446 | 1520.03298442 | 0.01037 |
| `equipment.HPpump/train1.values.shaftPowerPlant` | 9215.79416678 | 9120.1979065 | 0.01037 |
| `equipment.HPpump/train1.values.shaftPowerTrain` | 1535.96569446 | 1520.03298442 | 0.01037 |
| `equipment.HPpump/train1.values.utilisation` | 0.505496113385 | 0.500252556818 | 0.01037 |
| `equipment.PX/train1.values.Q_HP` | 870.219442567 | 888.272548635 | 0.02075 |
| `equipment.PX/train1.values.Q_HPout` | 861.517248141 | 879.389823149 | 0.02075 |
| `equipment.PX/train1.values.Q_LP` | 870.211302395 | 888.272698994 | 0.02076 |
| `equipment.PX/train1.values.Q_LPout` | 878.913496821 | 897.15542448 | 0.02076 |
| `equipment.PX/train1.values.boosterPower` | 57.8885486838 | 59.0887333502 | 0.02073 |
| `equipment.PX/train1.values.flowPerRotor` | 145.035217066 | 126.896099856 | 0.1251 |
| `equipment.PX/train1.values.rotors` | 6 | 7 | 0.1667 |
| `equipment.PX/train1.values.rotorsPlant` | 36 | 42 | 0.1667 |
| `equipment.PX/train1.values.salinityIncrease` | 0.0178781453307 | 0.0177109695901 | 0.009351 |
| `equipment.Pass2Pump/train1.values.Q_plant` | 4749.65440761 | 4751.46173683 | 0.0003805 |
| `equipment.Pass2Pump/train1.values.Q_train` | 791.609067936 | 791.910289472 | 0.0003805 |
| `equipment.Pass2Pump/train1.values.flowPerPump` | 791.609067936 | 791.910289472 | 0.0003805 |
| `equipment.Pass2Pump/train1.values.shaftPowerPerPump` | 267.698548449 | 267.800412578 | 0.0003805 |
| `equipment.Pass2Pump/train1.values.shaftPowerPlant` | 1606.1912907 | 1606.80247547 | 0.0003805 |
| `equipment.Pass2Pump/train1.values.shaftPowerTrain` | 267.698548449 | 267.800412578 | 0.0003805 |
| `equipment.Pass2Pump/train1.values.utilisation` | 0.49475566746 | 0.49494393092 | 0.0003805 |
| `equipment.ProductTank/tank1.values.V_R` | 9673.89918144 | 9671.83910561 | 0.000213 |
| `equipment.ProductTank/tank1.values.V_stored` | 24668.4429127 | 24663.1897193 | 0.000213 |
| `equipment.ProductTank/tank1.values.V_tanks` | 29021.6975443 | 29015.5173168 | 0.000213 |
| `equipment.ProductTank/tank1.values.massFlow` | 1138.5813148 | 1138.33885187 | 0.000213 |
| `equipment.ProductTank/tank1.inventory.volume` | 9673.89918144 | 9671.83910561 | 0.000213 |
| `equipment.ProductTank/tank1.inventory.disinfected.volume` | 8222.81430422 | 8221.06323977 | 0.000213 |
| `equipment.ProductTank/tank1.inventory.disinfected.mass` | 8197785.46657 | 8196039.73343 | 0.000213 |
| `equipment.ProductTank/tank1.inventory.mass.NaCl` | 15.0642885834 | 15.0364832163 | 0.001846 |
| `equipment.ProductTank/tank1.inventory.mass.boron` | 0.347573245255 | 0.346970462384 | 0.001734 |
| `equipment.ProductTank/tank1.inventory.mass.water` | 8197770.05471 | 8196024.34998 | 0.0002129 |
| `equipment.ProductTank/tank1.inventory.mass.total` | 8197785.46657 | 8196039.73343 | 0.000213 |
| `equipment.ProductTank/tank2.values.V_R` | 9673.89918144 | 9671.83910561 | 0.000213 |
| `equipment.ProductTank/tank2.values.V_stored` | 24668.4429127 | 24663.1897193 | 0.000213 |
| `equipment.ProductTank/tank2.values.V_tanks` | 29021.6975443 | 29015.5173168 | 0.000213 |
| `equipment.ProductTank/tank2.values.massFlow` | 1138.5813148 | 1138.33885187 | 0.000213 |
| `equipment.ProductTank/tank2.inventory.volume` | 9673.89918144 | 9671.83910561 | 0.000213 |
| `equipment.ProductTank/tank2.inventory.disinfected.volume` | 8222.81430422 | 8221.06323977 | 0.000213 |
| `equipment.ProductTank/tank2.inventory.disinfected.mass` | 8197785.46657 | 8196039.73343 | 0.000213 |
| `equipment.ProductTank/tank2.inventory.mass.NaCl` | 15.0642885834 | 15.0364832163 | 0.001846 |
| `equipment.ProductTank/tank2.inventory.mass.boron` | 0.347573245255 | 0.346970462384 | 0.001734 |
| `equipment.ProductTank/tank2.inventory.mass.water` | 8197770.05471 | 8196024.34998 | 0.0002129 |
| `equipment.ProductTank/tank2.inventory.mass.total` | 8197785.46657 | 8196039.73343 | 0.000213 |
| `equipment.ProductTank/tank3.values.V_R` | 9673.89918144 | 9671.83910561 | 0.000213 |
| `equipment.ProductTank/tank3.values.V_stored` | 24668.4429127 | 24663.1897193 | 0.000213 |
| `equipment.ProductTank/tank3.values.V_tanks` | 29021.6975443 | 29015.5173168 | 0.000213 |
| `equipment.ProductTank/tank3.values.massFlow` | 1138.5813148 | 1138.33885187 | 0.000213 |
| `equipment.ProductTank/tank3.inventory.volume` | 9673.89918144 | 9671.83910561 | 0.000213 |
| `equipment.ProductTank/tank3.inventory.disinfected.volume` | 8222.81430422 | 8221.06323977 | 0.000213 |
| `equipment.ProductTank/tank3.inventory.disinfected.mass` | 8197785.46657 | 8196039.73343 | 0.000213 |
| `equipment.ProductTank/tank3.inventory.mass.NaCl` | 15.0642885834 | 15.0364832163 | 0.001846 |
| `equipment.ProductTank/tank3.inventory.mass.boron` | 0.347573245255 | 0.346970462384 | 0.001734 |
| `equipment.ProductTank/tank3.inventory.mass.water` | 8197770.05471 | 8196024.34998 | 0.0002129 |
| `equipment.ProductTank/tank3.inventory.mass.total` | 8197785.46657 | 8196039.73343 | 0.000213 |
| `equipment.Remineralisation/tank1.values.V_R` | 1209.23739768 | 1208.9798882 | 0.000213 |
| `equipment.Remineralisation/tank1.values.V_stored` | 1027.85178803 | 1027.63290497 | 0.000213 |
| `equipment.Remineralisation/tank1.values.V_tanks` | 1209.23739768 | 1208.9798882 | 0.000213 |
| `equipment.Remineralisation/tank1.values.massFlow` | 1138.5813148 | 1138.33885187 | 0.000213 |
| `equipment.Remineralisation/tank1.inventory.volume` | 1209.23739768 | 1208.9798882 | 0.000213 |
| `equipment.Remineralisation/tank1.inventory.perm2.volume` | 1027.85178803 | 1027.63290497 | 0.000213 |
| `equipment.Remineralisation/tank1.inventory.perm2.mass` | 1024723.18332 | 1024504.96668 | 0.000213 |
| `equipment.Remineralisation/tank1.inventory.mass.NaCl` | 1.88303607293 | 1.87956040204 | 0.001846 |
| `equipment.Remineralisation/tank1.inventory.mass.boron` | 0.0434466556569 | 0.043371307798 | 0.001734 |
| `equipment.Remineralisation/tank1.inventory.mass.water` | 1024721.25684 | 1024503.04375 | 0.0002129 |
| `equipment.Remineralisation/tank1.inventory.mass.total` | 1024723.18332 | 1024504.96668 | 0.000213 |
| `layout.unbundedLiquid:Remineralisation/tank1:.value` | 1027.85178803 | 1027.63290497 | 0.000213 |
| `layout.unbundedLiquid:Disinfection/tank1:.value` | 2055.70357606 | 2055.26580994 | 0.000213 |
| `layout.unbundedLiquid:ProductTank/tank1:.value` | 8222.81430422 | 8221.06323977 | 0.000213 |
| `layout.unbundedLiquid:ProductTank/tank2:.value` | 8222.81430422 | 8221.06323977 | 0.000213 |
| `layout.unbundedLiquid:ProductTank/tank3:.value` | 8222.81430422 | 8221.06323977 | 0.000213 |
| `utility.Booster.power.electricity.duty_kW` | 461.951662981 | 466.488095161 | 0.00982 |
| `utility.Booster.power.electricity.eur_h` | 46.2321224311 | 46.6861285637 | 0.00982 |
| `utility.HPpump.power.electricity.duty_kW` | 9700.83596503 | 9600.20832263 | 0.01037 |
| `utility.HPpump.power.electricity.eur_h` | 970.85966338 | 960.788848929 | 0.01037 |
| `utility.Pass2Pump.power.electricity.duty_kW` | 1690.72767442 | 1691.37102681 | 0.0003805 |
| `utility.Pass2Pump.power.electricity.eur_h` | 169.208025656 | 169.272412363 | 0.0003805 |
| `equipment.RO1/train1.brine.values.flow` | 927.58468981 | 927.450219857 | 0.000145 |
| `equipment.RO1/train1.brine.values.flowPlant` | 5565.50813886 | 5564.70131914 | 0.000145 |
| `equipment.RO1/train1.brine.values.pressureDropPerMetre` | 40.4253743376 | 40.4142281237 | 0.0002757 |
| `equipment.RO1/train1.brine.values.reynolds` | 726798.3345 | 726692.972408 | 0.000145 |
| `equipment.RO1/train1.brine.values.velocity` | 1.62007888636 | 1.61984402702 | 0.000145 |
| `equipment.RO1/train1.feed.values.pressureDropPerMetre` | 31.0686584761 | 31.074401092 | 0.0001848 |
| `equipment.RO1/train1.permeate.values.flow` | 791.694104555 | 791.995351707 | 0.0003805 |
| `equipment.RO1/train1.permeate.values.flowPlant` | 4750.16462733 | 4751.97211024 | 0.0003805 |
| `equipment.RO1/train1.permeate.values.pressureDropPerMetre` | 53.898305217 | 53.9373833905 | 0.000725 |
| `equipment.RO1/train1.permeate.values.requiredInsideDiameter` | 0.374168753011 | 0.374239933628 | 0.0001902 |
| `equipment.RO1/train1.permeate.values.reynolds` | 697879.808416 | 698145.358424 | 0.0003805 |
| `equipment.RO1/train1.permeate.values.velocity` | 1.75002819662 | 1.75069409903 | 0.0003805 |
| `equipment.RO2a/train1.brine.values.flow` | 243.41159721 | 243.769779983 | 0.001472 |
| `equipment.RO2a/train1.brine.values.flowPlant` | 1460.46958326 | 1462.6186799 | 0.001472 |
| `equipment.RO2a/train1.brine.values.frictionFactor` | 0.0159068887917 | 0.015904340495 | 0.0001602 |
| `equipment.RO2a/train1.brine.values.pressureDropPerMetre` | 60.1733384192 | 60.340892184 | 0.002785 |
| `equipment.RO2a/train1.brine.values.requiredInsideDiameter` | 0.207471976426 | 0.207624568929 | 0.0007355 |
| `equipment.RO2a/train1.brine.values.reynolds` | 343289.095493 | 343794.250523 | 0.001472 |
| `equipment.RO2a/train1.brine.values.velocity` | 1.37742787207 | 1.37945477194 | 0.001472 |
| `equipment.RO2a/train1.feed.values.flow` | 791.736722686 | 792.037986055 | 0.0003805 |
| `equipment.RO2a/train1.feed.values.flowPlant` | 4750.42033612 | 4752.22791633 | 0.0003805 |
| `equipment.RO2a/train1.feed.values.pressureDropPerMetre` | 53.901206647 | 53.9402869242 | 0.000725 |
| `equipment.RO2a/train1.feed.values.requiredInsideDiameter` | 0.37417882392 | 0.374250006453 | 0.0001902 |
| `equipment.RO2a/train1.feed.values.reynolds` | 697879.808416 | 698145.358424 | 0.0003805 |
| `equipment.RO2a/train1.feed.values.velocity` | 1.75012240337 | 1.75078834163 | 0.0003805 |
| `equipment.RO2a/train1.permeate.values.flow` | 548.325125689 | 548.268206284 | 0.0001038 |
| `equipment.RO2a/train1.permeate.values.flowPlant` | 3289.95075413 | 3289.60923771 | 0.0001038 |
| `equipment.RO2a/train1.permeate.values.pressureDropPerMetre` | 52.2608187767 | 52.2505132568 | 0.0001972 |
| `equipment.RO2a/train1.permeate.values.reynolds` | 552370.427123 | 552313.087825 | 0.0001038 |
| `equipment.RO2a/train1.permeate.values.velocity` | 1.58310483764 | 1.58294050195 | 0.0001038 |
| `equipment.RO2b/train1.brine.values.flow` | 106.465310625 | 106.912503885 | 0.0042 |
| `equipment.RO2b/train1.brine.values.flowPlant` | 638.791863751 | 641.475023309 | 0.0042 |
| `equipment.RO2b/train1.brine.values.frictionFactor` | 0.0173669960104 | 0.0173595608769 | 0.0004281 |
| `equipment.RO2b/train1.brine.values.pressureDropPerMetre` | 161.628926394 | 162.919805398 | 0.007987 |
| `equipment.RO2b/train1.brine.values.requiredInsideDiameter` | 0.137212246189 | 0.137500115037 | 0.002098 |
| `equipment.RO2b/train1.brine.values.reynolds` | 250249.761439 | 251300.909681 | 0.0042 |
| `equipment.RO2b/train1.brine.values.velocity` | 1.67352893371 | 1.68055836757 | 0.0042 |
| `equipment.RO2b/train1.feed.values.flow` | 243.41159721 | 243.769779983 | 0.001472 |
| `equipment.RO2b/train1.feed.values.flowPlant` | 1460.46958326 | 1462.6186799 | 0.001472 |
| `equipment.RO2b/train1.feed.values.frictionFactor` | 0.0159068887917 | 0.015904340495 | 0.0001602 |
| `equipment.RO2b/train1.feed.values.pressureDropPerMetre` | 60.1733384192 | 60.340892184 | 0.002785 |
| `equipment.RO2b/train1.feed.values.requiredInsideDiameter` | 0.207471976426 | 0.207624568929 | 0.0007355 |
| `equipment.RO2b/train1.feed.values.reynolds` | 343289.095493 | 343794.250523 | 0.001472 |
| `equipment.RO2b/train1.feed.values.velocity` | 1.37742787207 | 1.37945477194 | 0.001472 |
| `equipment.RO2b/train1.permeate.values.flow` | 136.946286964 | 136.857276475 | 0.00065 |
| `equipment.RO2b/train1.permeate.values.flowPlant` | 821.677721786 | 821.143658851 | 0.00065 |
| `equipment.RO2b/train1.permeate.values.pressureDropPerMetre` | 61.8078228379 | 61.7322024719 | 0.001223 |
| `equipment.RO2b/train1.permeate.values.requiredInsideDiameter` | 0.155619473604 | 0.155568891667 | 0.000325 |
| `equipment.RO2b/train1.permeate.values.reynolds` | 241424.048287 | 241267.130893 | 0.00065 |
| `equipment.RO2b/train1.permeate.values.velocity` | 1.21087102825 | 1.21008400273 | 0.00065 |
| `kpi.RO1.split_I` | 0.591592934846 | 0.591436461522 | 0.0002645 |
| `kpi.RO1.split_permeate_acid_kmol_s` | 5.56968453905e-05 | 5.57120556953e-05 | 0.0002731 |
| `kpi.RO1.split_permeate_acid_mg_L` | 0.467068418838 | 0.467015484898 | 0.0001133 |
| `kpi.RO1.split_permeate_base_kmol_s` | 2.11462900055e-07 | 2.11525428178e-07 | 0.0002957 |
| `kpi.RO1.split_retentate_acid_kmol_s` | 0.00114992664504 | 0.00114973949218 | 0.0001628 |
| `kpi.RO1.split_retentate_base_kmol_s` | 0.000138874366092 | 0.000138854901505 | 0.0001402 |
| `kpi.RO2a.split_I` | 0.00193714313792 | 0.00193693634752 | 0.0001068 |
| `kpi.RO2a.split_permeate_acid_kmol_s` | 2.34609815301e-06 | 2.34423804835e-06 | 0.0007929 |
| `kpi.RO2a.split_permeate_acid_mg_L` | 0.0277554578238 | 0.0277363308621 | 0.0006891 |
| `kpi.RO2a.split_permeate_base_kmol_s` | 4.10388704547e-07 | 4.10062322665e-07 | 0.0007953 |
| `kpi.RO2a.split_permeate_base_mg_L` | 0.00485509370775 | 0.00485173605279 | 0.0006916 |
| `kpi.RO2a.split_retentate_acid_kmol_s` | 7.54102217362e-06 | 7.54351511591e-06 | 0.0003306 |
| `kpi.RO2a.split_retentate_base_kmol_s` | 4.56107992594e-05 | 4.56257656365e-05 | 0.0003281 |
| `kpi.RO2b.split_I` | 0.00612928209758 | 0.006122055487 | 0.001179 |
| `kpi.RO2b.split_permeate_acid_kmol_s` | 1.44725040537e-06 | 1.44255375031e-06 | 0.003245 |
| `kpi.RO2b.split_permeate_acid_mg_L` | 0.0685658169545 | 0.0683877350342 | 0.002597 |
| `kpi.RO2b.split_permeate_base_kmol_s` | 2.61948383798e-07 | 2.6108685905e-07 | 0.003289 |
| `kpi.RO2b.split_permeate_base_mg_L` | 0.0124102262252 | 0.0123774514009 | 0.002641 |
| `kpi.RO2b.split_retentate_acid_kmol_s` | 7.08736527754e-06 | 7.09080439892e-06 | 0.0004852 |
| `kpi.RO2b.split_retentate_base_kmol_s` | 4.43552573663e-05 | 4.43748357442e-05 | 0.0004414 |
| `source.PX.liquidVolume` | MISSING (expected 'bypass.recordVliq25C.ionsNoVolume') -- the run published no s |  |  |

(Rows for trains 2-6 repeat train 1's six-fold, and the `basis` text rows embed the header densities; omitted here, 417 of 871 shown.)

## crystalliser02_msmpr  (tutorials/steady/crystallisation/crystalliser02_msmpr)
11 rows
Reason: MSMPR: Q = F M / rho with rho = 1416.27 kg/m3 the door's liquor density at T_op = 293.15 K (water by IAPWS95 at 293 K, sucrose at its flat 25 C volume) instead of the stored 25 C volumes: tau 3822.9 -> 3824.5 s (+0.04 %); the PBE closure moves mu3, magma density and nucleation rate by under 6e-4.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.cryst.L_dominant` | 0.000223952804481 | 0.000223993715904 | 0.0001827 |
| `kpi.cryst.L_meanMass` | 0.000298603739308 | 0.000298658287872 | 0.0001827 |
| `kpi.cryst.L_meanNumber` | 7.46509348269e-05 | 7.4664571968e-05 | 0.0001827 |
| `kpi.cryst.growthRate` | 1.95272330048e-08 | 1.95228202707e-08 | 0.000226 |
| `kpi.cryst.magmaDensity` | 302.920529908 | 303.07343562 | 0.0005048 |
| `kpi.cryst.mu3` | 0.363858865651 | 0.36404253131 | 0.0005048 |
| `kpi.cryst.n0` | 1.95272330048e+15 | 1.95228202707e+15 | 0.000226 |
| `kpi.cryst.nucleationRate` | 38131282.8823 | 38114051.1321 | 0.0004519 |
| `kpi.cryst.residenceTime` | 3822.91412248 | 3824.47673711 | 0.0004087 |
| `kpi.cryst.throughput` | 0.00130790277778 | 0.00130736839147 | 0.0004086 |
| `source.cryst.liquidVolume` | MISSING (expected 'bypass.recordVliq25C.missingIsZero') -- the run published no  |  |  |

## crystalliser03_pbe_size_independent  (tutorials/steady/crystallisation/crystalliser03_pbe_size_independent)
9 rows
Reason: as crystalliser02_msmpr (FVM model, same liquor): tau +0.04 %, moments and rates under 6e-4.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.cryst.L_meanMass` | 0.000298633437171 | 0.000298686721037 | 0.0001784 |
| `kpi.cryst.L_meanNumber` | 7.48298114726e-05 | 7.48434203498e-05 | 0.0001819 |
| `kpi.cryst.growthRate_L0` | 1.90635340048e-08 | 1.90593043374e-08 | 0.0002219 |
| `kpi.cryst.magmaDensity` | 305.975808641 | 306.128756491 | 0.0004999 |
| `kpi.cryst.mu3` | 0.367528772918 | 0.367712489192 | 0.0004999 |
| `kpi.cryst.nucleationRate` | 36341832.8751 | 36325708.1827 | 0.0004437 |
| `kpi.cryst.residenceTime` | 3822.91412248 | 3824.47673711 | 0.0004087 |
| `kpi.cryst.throughput` | 0.00130790277778 | 0.00130736839147 | 0.0004086 |
| `source.cryst.liquidVolume` | MISSING (expected 'bypass.recordVliq25C.missingIsZero') -- the run published no  |  |  |

## crystalliser04_size_dependent_growth  (tutorials/steady/crystallisation/crystalliser04_size_dependent_growth)
9 rows
Reason: as crystalliser02_msmpr (FVM, size-dependent growth).

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.cryst.L_meanMass` | 0.000329374475484 | 0.000329435332382 | 0.0001848 |
| `kpi.cryst.L_meanNumber` | 7.45169890057e-05 | 7.45304748352e-05 | 0.000181 |
| `kpi.cryst.growthRate_L0` | 1.83025070562e-08 | 1.8298315566e-08 | 0.000229 |
| `kpi.cryst.magmaDensity` | 310.990159301 | 311.144905116 | 0.0004976 |
| `kpi.cryst.mu3` | 0.373551857401 | 0.373737733335 | 0.0004976 |
| `kpi.cryst.nucleationRate` | 33498176.4542 | 33482835.2551 | 0.000458 |
| `kpi.cryst.residenceTime` | 3822.91412248 | 3824.47673711 | 0.0004087 |
| `kpi.cryst.throughput` | 0.00130790277778 | 0.00130736839147 | 0.0004086 |
| `source.cryst.liquidVolume` | MISSING (expected 'bypass.recordVliq25C.missingIsZero') -- the run published no  |  |  |

## crystalliser07_nacl_antisolvent_cooled  (tutorials/steady/crystallisation/crystalliser07_nacl_antisolvent_cooled)
17 rows
Reason: the mixed-solvent activity term's antisolvent molar volume is M/rho of PURE ETHANOL from the door at T_op = 278.15 K (810.76 kg/m3) instead of the record's 25 C Vliq (787.5): V_ethanol -2.9 %, gamma_pm_sat 8.19 -> 8.11, m_sat +0.99 %, and the saturation (c_sat, solute dissolved, yield) follows.  crystalliser06 (T_op = 25 C) is byte-identical, the proof the move is the temperature.

| row | golden | now | relative move |
|---|---|---|---|
| `stream.crystals.F` | 0.00231987381407 | 0.00230996081827 | 0.004273 |
| `stream.motherLiquor.F` | 0.0421245706304 | 0.0421344836262 | 0.0002353 |
| `kpi.cryst.Q_removed` | 82721.44242 | 82689.5136962 | 0.000386 |
| `kpi.cryst.c_sat` | 0.0398065230351 | 0.0402012446425 | 0.009916 |
| `kpi.cryst.cakeLiquidFlow` | 0.000380305320939 | 0.000378621377672 | 0.004428 |
| `kpi.cryst.crystal_flow` | 0.113348382739 | 0.112867476908 | 0.004243 |
| `kpi.cryst.crystal_mol` | 0.00193956849313 | 0.00193133944059 | 0.004243 |
| `kpi.cryst.gamma_pm_sat` | 8.19184523863 | 8.11141244733 | 0.009819 |
| `kpi.cryst.liquorFlow` | 0.0425048759513 | 0.0425131050038 | 0.0001936 |
| `kpi.cryst.m_sat` | 0.681152002654 | 0.687906308051 | 0.009916 |
| `kpi.cryst.soluteInCake_mass` | 0.000433927361343 | 0.000436205308804 | 0.00525 |
| `kpi.cryst.solute_dissolved` | 0.0484979505946 | 0.048978856425 | 0.009916 |
| `kpi.cryst.yield` | 0.700345694612 | 0.697374321579 | 0.004243 |
| `kpi.cryst.Q_kW` | -82.72144242 | -82.6895136962 | 0.000386 |
| `utility.cryst.cooling.refrigerationNH3.duty_kW` | -82.72144242 | -82.6895136962 | 0.000386 |
| `utility.cryst.cooling.refrigerationNH3.kg_s` | 0.0603834798148 | 0.0603601730711 | 0.000386 |
| `utility.cryst.cooling.refrigerationNH3.eur_h` | 4.71710753256 | 4.71528682901 | 0.000386 |

## crystalliser08_nacl_antisolvent_msmpr  (tutorials/steady/crystallisation/crystalliser08_nacl_antisolvent_msmpr)
1 rows
Reason: NaCl in a water-ethanol liquor has no density law: the door REFUSED the set {ethanol, NaCl, water}; the case now DECLARES `massWithoutVolume ( NaCl )` (bound 0.15, the run reaches 0.117) -- the reading the unit made silently before.  Only the source word moves (the old `bypass.recordVliq25C.missingIsZero` row is replaced by the door's density row); every numeric row is inside its tolerance (T_op = 25 C, the antisolvent at its anchor).

| row | golden | now | relative move |
|---|---|---|---|
| `source.cryst.liquidVolume` | MISSING (expected 'bypass.recordVliq25C.missingIsZero') -- the run published no  |  |  |

## crystalliser09_KHT_KCl_series  (tutorials/steady/crystallisation/crystalliser09_KHT_KCl_series)
18 rows
Reason: as crystalliser07: the second crystalliser (cryst2, KCl + ethanol antisolvent) at T_op = 278.15 K: V_ethanol from the door -2.9 %, gamma_pm_sat 11.79 -> 11.68, m_sat and the saturation follow (under 1 %).

| row | golden | now | relative move |
|---|---|---|---|
| `stream.KCl_cake.F` | 0.00139624609486 | 0.00139274278205 | 0.002509 |
| `stream.stillage.F` | 0.0304943578874 | 0.0304978611981 | 0.0001149 |
| `kpi.cryst2.Q_kW` | -19.292025259 | -19.2439023898 | 0.002494 |
| `kpi.cryst2.Q_removed` | 19292.025259 | 19243.9023898 | 0.002494 |
| `kpi.cryst2.c_sat` | 0.0136704927645 | 0.0137983050247 | 0.009349 |
| `kpi.cryst2.cakeLiquidFlow` | 0.000274616719341 | 0.000273911247759 | 0.002569 |
| `kpi.cryst2.crystal_flow` | 0.0836185915746 | 0.0834100097131 | 0.002494 |
| `kpi.cryst2.crystal_mol` | 0.00112162937552 | 0.00111883153429 | 0.002494 |
| `kpi.cryst2.gamma_pm_sat` | 11.7866045125 | 11.6774264243 | 0.009263 |
| `kpi.cryst2.m_sat` | 0.183371018022 | 0.185085445195 | 0.009349 |
| `kpi.cryst2.soluteInCake_mass` | 0.000112659395907 | 0.000113414768529 | 0.006705 |
| `kpi.cryst2.solute_dissolved` | 0.0223090117058 | 0.0225175935673 | 0.00935 |
| `kpi.cryst2.yield` | 0.789393783916 | 0.787424685635 | 0.002494 |
| `kpi.recovery.B` | 0.0304943578874 | 0.0304978611981 | 0.0001149 |
| `kpi.recovery.x_B_HK` | 0.000279360458511 | 0.000279332083049 | 0.0001016 |
| `utility.cryst2.cooling.refrigerationNH3.duty_kW` | -19.292025259 | -19.2439023898 | 0.002494 |
| `utility.cryst2.cooling.refrigerationNH3.kg_s` | 0.0140824384069 | 0.0140473105584 | 0.002494 |
| `utility.cryst2.cooling.refrigerationNH3.eur_h` | 1.10010844837 | 1.09736428988 | 0.002494 |

## membrane27_swro_energy_recovery  (tutorials/steady/membranes/membrane27_swro_energy_recovery)
107 rows
Reason: PX: v = M/rho from the door (see swro01_campoDalias): the volumetric balance of the exchanger now counts the salt's volume: flowImbalance +0.0062 -> -0.0170 (the case's flows are not retuned: the imbalance is published, never corrected), booster duty +5.6 % and the energy rows downstream.

| row | golden | now | relative move |
|---|---|---|---|
| `stream.boosted.F` | 0.129878887298 | 0.132899414015 | 0.02326 |
| `stream.brine.F` | 0.133104266691 | 0.13485326648 | 0.01314 |
| `stream.permeate.F` | 0.119696575607 | 0.120968102534 | 0.01062 |
| `stream.pxHPout.F` | 0.129878887298 | 0.132899414015 | 0.02326 |
| `stream.roFeed.F` | 0.252800842298 | 0.255821369015 | 0.01195 |
| `stream.spentBrine.F` | 0.135858424598 | 0.134586898732 | 0.009359 |
| `kpi.Booster.F` | 0.129878887298 | 0.132899414015 | 0.02326 |
| `kpi.Booster.P_in` | 5335848.73324 | 5332433.68415 | 0.00064 |
| `kpi.Booster.W_hydraulic` | 385.276070191 | 402.437989387 | 0.04454 |
| `kpi.Booster.W_shaft` | 481.595087739 | 503.047486733 | 0.04454 |
| `kpi.Booster.W_shaft_kW` | 0.481595087739 | 0.503047486733 | 0.04454 |
| `kpi.Booster.dP` | 164151.266764 | 167566.315849 | 0.0208 |
| `kpi.Booster.dT` | 0.00992873584812 | 0.0101352584317 | 0.0208 |
| `kpi.Booster.head_m` | 16.3977426298 | 16.7390139606 | 0.02081 |
| `kpi.Join.F_out` | 0.252800842298 | 0.255821369015 | 0.01195 |
| `kpi.PX.F_HPout` | 0.129878887298 | 0.132899414015 | 0.02326 |
| `kpi.PX.F_LPout` | 0.135858424598 | 0.134586898732 | 0.009359 |
| `kpi.PX.P_HPin` | 5411851.79466 | 5409844.33205 | 0.0003709 |
| `kpi.PX.P_HPout` | 5335848.73324 | 5332433.68415 | 0.00064 |
| `kpi.PX.P_recovered_bar` | 51.3584873324 | 51.3243368415 | 0.0006649 |
| `kpi.PX.Q_HPin_m3h` | 8.48585406628 | 8.77770920672 | 0.03439 |
| `kpi.PX.Q_HPout_m3h` | 8.35856625528 | 8.64604356862 | 0.03439 |
| `kpi.PX.Q_LPin_m3h` | 8.5383129819 | 8.62857594409 | 0.01057 |
| `kpi.PX.Q_LPout_m3h` | 8.66560079289 | 8.76024158219 | 0.01092 |
| `kpi.PX.boosterDuty_kW` | 0.381130344205 | 0.402440463184 | 0.05591 |
| `kpi.PX.dP_HP_bar` | 0.760030614215 | 0.774106479012 | 0.01852 |
| `kpi.PX.dissipation_kW` | 0.529242746157 | 0.546797284324 | 0.03317 |
| `kpi.PX.feedSalinityIncrease` | 0.0271912141375 | 0.0268581744017 | 0.01225 |
| `kpi.PX.flowImbalance` | 0.00618192526212 | -0.0169899980864 | 3.748 |
| `kpi.PX.leakageFlow_m3h` | 0.127287810994 | 0.131665638101 | 0.03439 |
| `kpi.PX.mixedBrineFlow_m3h` | 0.250756987658 | 0.259381307059 | 0.03439 |
| `kpi.PX.recoveredPower_kW` | 11.9245366427 | 12.3264570128 | 0.03371 |
| `kpi.PX.salinity_HPout` | 0.0338643488239 | 0.0338533691994 | 0.0003242 |
| `kpi.PX.salinity_brine` | 0.0619795964083 | 0.0619115960835 | 0.001097 |
| `kpi.PX.specificEnergy_kWh_m3` | 0.0633174075545 | 0.0632424854195 | 0.001183 |
| `kpi.RO.Gamma_NaCl_avg` | 0.104028318195 | 0.103981946726 | 0.0004458 |
| `kpi.RO.Gamma_NaCl_elem1` | 0.270547056136 | 0.269106289251 | 0.005325 |
| `kpi.RO.Gamma_NaCl_elem2` | 0.181603773203 | 0.181410642887 | 0.001063 |
| `kpi.RO.Gamma_NaCl_elem3` | 0.113088797918 | 0.113439345661 | 0.0031 |
| `kpi.RO.Gamma_NaCl_elem4` | 0.06794204038 | 0.0683742652701 | 0.006362 |
| `kpi.RO.Gamma_NaCl_elem5` | 0.041277003197 | 0.0415994955945 | 0.007813 |
| `kpi.RO.Gamma_NaCl_elem6` | 0.0266324866731 | 0.0268176231241 | 0.006952 |
| `kpi.RO.Gamma_NaCl_elem7` | 0.0187811329602 | 0.0188697481661 | 0.004718 |
| `kpi.RO.J_w_avg` | 4.31311891962e-06 | 4.35892926756e-06 | 0.01062 |
| `kpi.RO.J_w_avg_elem1` | 1.2851233001e-05 | 1.292836779e-05 | 0.006002 |
| `kpi.RO.J_w_avg_elem2` | 7.59756123189e-06 | 7.6785823575e-06 | 0.01066 |
| `kpi.RO.J_w_avg_elem3` | 4.31916438002e-06 | 4.38340962373e-06 | 0.01487 |
| `kpi.RO.J_w_avg_elem4` | 2.449334116e-06 | 2.4933910596e-06 | 0.01799 |
| `kpi.RO.J_w_avg_elem5` | 1.43632276761e-06 | 1.46398647759e-06 | 0.01926 |
| `kpi.RO.J_w_avg_elem6` | 9.06909755995e-07 | 9.23450127549e-07 | 0.01824 |
| `kpi.RO.J_w_avg_elem7` | 6.31307184812e-07 | 6.41317436996e-07 | 0.01586 |
| `kpi.RO.Re_in_elem1` | 187.13439721 | 189.370249852 | 0.01195 |
| `kpi.RO.Re_in_elem2` | 150.2849613 | 152.299653278 | 0.01341 |
| `kpi.RO.Re_in_elem3` | 128.499826313 | 130.282208118 | 0.01387 |
| `kpi.RO.Re_in_elem4` | 116.115118091 | 117.713288946 | 0.01376 |
| `kpi.RO.Re_in_elem5` | 109.091933583 | 110.563779002 | 0.01349 |
| `kpi.RO.Re_in_elem6` | 104.97344287 | 106.365967416 | 0.01327 |
| `kpi.RO.Re_in_elem7` | 102.372983215 | 103.718081179 | 0.01314 |
| `kpi.RO.Re_inlet` | 187.13439721 | 189.370249852 | 0.01195 |
| `kpi.RO.Re_max` | 187.13439721 | 189.370249852 | 0.01195 |
| `kpi.RO.Re_min` | 100.562782307 | 101.879177741 | 0.01309 |
| `kpi.RO.c_ret_elem1` | 0.726549157383 | 0.725495749213 | 0.00145 |
| `kpi.RO.c_ret_elem2` | 0.849309099154 | 0.847694504932 | 0.001901 |
| `kpi.RO.c_ret_elem3` | 0.939404795286 | 0.937724409852 | 0.001789 |
| `kpi.RO.c_ret_elem4` | 0.999341499132 | 0.997828478583 | 0.001514 |
| `kpi.RO.c_ret_elem5` | 1.03797721729 | 1.03664437794 | 0.001284 |
| `kpi.RO.c_ret_elem6` | 1.06375221191 | 1.06252607866 | 0.001153 |
| `kpi.RO.c_ret_elem7` | 1.08229623726 | 1.08110838427 | 0.001098 |
| `kpi.RO.dP_elem1` | 21152.9230606 | 21613.8213254 | 0.02179 |
| `kpi.RO.dP_elem2` | 15361.4364297 | 15721.1397041 | 0.02342 |
| `kpi.RO.dP_elem3` | 12370.2965173 | 12662.8431725 | 0.02365 |
| `kpi.RO.dP_elem4` | 10798.4314358 | 11049.7519483 | 0.02327 |
| `kpi.RO.dP_elem5` | 9936.54553914 | 10163.3904103 | 0.02283 |
| `kpi.RO.dP_elem6` | 9429.15412846 | 9641.58988703 | 0.02253 |
| `kpi.RO.dP_elem7` | 9099.41800974 | 9303.13010012 | 0.02239 |
| `kpi.RO.dP_feed` | 88148.2051207 | 90155.6665476 | 0.02277 |
| `kpi.RO.feedFlowPerVessel` | 0.00228420785446 | 0.00231150011789 | 0.01195 |
| `kpi.RO.feedFlow_elem1` | 0.00228420785446 | 0.00231150011789 | 0.01195 |
| `kpi.RO.feedFlow_elem2` | 0.00183441469942 | 0.00185900724524 | 0.01341 |
| `kpi.RO.feedFlow_elem3` | 0.00156850005631 | 0.00159025686273 | 0.01387 |
| `kpi.RO.feedFlow_elem4` | 0.00141732930301 | 0.0014368375259 | 0.01376 |
| `kpi.RO.feedFlow_elem5` | 0.00133160260895 | 0.00134956883881 | 0.01349 |
| `kpi.RO.feedFlow_elem6` | 0.00128133131208 | 0.00129832931209 | 0.01327 |
| `kpi.RO.feedFlow_elem7` | 0.00124958947062 | 0.00126600855763 | 0.01314 |
| `kpi.RO.recovery_elem1` | 0.19691428438 | 0.195757235376 | 0.005876 |
| `kpi.RO.recovery_elem2` | 0.313328665233 | 0.312023888548 | 0.004164 |
| `kpi.RO.recovery_elem3` | 0.379509487177 | 0.378396083662 | 0.002934 |
| `kpi.RO.recovery_elem4` | 0.417039650596 | 0.416150218481 | 0.002133 |
| `kpi.RO.recovery_elem5` | 0.439047847778 | 0.438317436349 | 0.001664 |
| `kpi.RO.recovery_elem6` | 0.452944061907 | 0.452300024632 | 0.001422 |
| `kpi.RO.recovery_elem7` | 0.462617328473 | 0.4620106494 | 0.001311 |
| `kpi.RO.u_crossflow_inlet` | 0.193725557674 | 0.196040237113 | 0.01195 |
| `kpi.RO.water_recovery` | 0.462617328473 | 0.4620106494 | 0.001311 |
| `equipment.PX.values.P_HPin` | 54.1185179466 | 54.0984433205 | 0.0003709 |
| `equipment.PX.values.P_HPout` | 53.3584873324 | 53.3243368415 | 0.00064 |
| `equipment.PX.values.P_recovered` | 51.3584873324 | 51.3243368415 | 0.0006649 |
| `equipment.PX.values.Q_HP` | 8.48585406628 | 8.77770920672 | 0.03439 |
| `equipment.PX.values.Q_HPout` | 8.35856625528 | 8.64604356862 | 0.03439 |
| `equipment.PX.values.Q_LP` | 8.5383129819 | 8.62857594409 | 0.01057 |
| `equipment.PX.values.Q_LPout` | 8.66560079289 | 8.76024158219 | 0.01092 |
| `equipment.PX.values.boosterPower` | 0.381130344205 | 0.402440463184 | 0.05591 |
| `equipment.PX.values.dP_HP` | 0.760030614215 | 0.774106479012 | 0.01852 |
| `equipment.PX.values.flowPerRotor` | 8.5383129819 | 8.62857594409 | 0.01057 |
| `equipment.PX.values.salinityIncrease` | 0.0271912141375 | 0.0268581744017 | 0.01225 |
| `utility.Booster.power.electricity.duty_kW` | 0.50694219762 | 0.529523670245 | 0.04454 |
| `utility.Booster.power.electricity.eur_h` | 0.0507347751378 | 0.0529947289182 | 0.04454 |
| `source.PX.liquidVolume` | MISSING (expected 'bypass.recordVliq25C.ionsNoVolume') -- the run published no s |  |  |

## ladder01_wgs_three_rungs  (tutorials/steady/reactors/ladder01_wgs_three_rungs)
4 rows
Reason: kinetic rung (pfr, gas feed at 600 K, 10 bar): the unit priced the gas on the components' 25 C LIQUID volumes (Q about 186 times too small); a gas feed is now on the equation of state's vapour volume (the CSTR's own rule), the door refusing the liquid of CO above its Tc.  The case was written for that bug (A = 60, `V_R a shape`); re-based as cstr02 was: V_R 1e-3 -> 1e-2 m3 and A 60 -> 1.0e6 (the CSTR sibling's 1.0e7 sticks the explicit RK4 at zero conversion on the fifth-of-feed, r dV / F > 2.8).  tau_s 336 -> 18.04 s, X_limiting 0.841432775 (the equilibrium limit, 0.84143 before).  Header and the GUI lesson's `volume-is-a-shape` limit rewritten.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.kinetic.Da_kTau` | 0.00218785948598 | 1.95782735005 | 893.9 |
| `kpi.kinetic.V_R` | 0.001 | 0.01 | 9 |
| `kpi.kinetic.tau_s` | 336.008960239 | 18.0408532567 | 0.9463 |
| `source.kinetic.liquidVolume` | MISSING (expected 'bypass.recordVliq25C') -- the run published no such word |  |  |

## pfr01_first_order  (tutorials/steady/reactors/pfr01_first_order)
9 rows
Reason: liquid feed at 350 K: Q = F M / rho, rho the door's 849.71 kg/m3 at 350 K instead of the 25 C volume sum (rho_old = 849.71 x tau_old/tau_new = 915 kg/m3 at 25 C): tau_s 310.3 -> 288.3 s (-7.1 %), Da and conversion follow, duty -4 %.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.reactor.Da_kTau` | 1.10929132154 | 1.0304964512 | 0.07103 |
| `kpi.reactor.Q_kW` | -0.195860880897 | -0.187959558935 | 0.04034 |
| `kpi.reactor.X_limiting` | 0.670207404765 | 0.643170231942 | 0.04034 |
| `kpi.reactor.tau_s` | 310.291329081 | 288.250802334 | 0.07103 |
| `boundary.global.Q_boundary_kW` | -0.195860880897 | -0.187959558935 | 0.04034 |
| `utility.reactor.cooling.coolingWater.duty_kW` | -0.195860880897 | -0.187959558935 | 0.04034 |
| `utility.reactor.cooling.coolingWater.kg_s` | 0.0046856670071 | 0.00449664016592 | 0.04034 |
| `utility.reactor.cooling.coolingWater.eur_h` | 0.000282039668491 | 0.000270661764867 | 0.04034 |
| `source.reactor.liquidVolume` | MISSING (expected 'bypass.recordVliq25C') -- the run published no such word |  |  |

## pfr02_reversible_wgs  (tutorials/steady/reactors/pfr02_reversible_wgs)
4 rows
Reason: as ladder01: gas feed, vapour volume from the equation of state; V_R 2e-3 -> 1e-2 m3, A 60 -> 1.0e6; tau_s 268.8 -> 7.216 s; X_limiting = X_eq.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.wgs.Da_kTau` | 0.00175028758879 | 0.783130940019 | 446.4 |
| `kpi.wgs.V_R` | 0.002 | 0.01 | 4 |
| `kpi.wgs.tau_s` | 268.807168191 | 7.2163413027 | 0.9732 |
| `source.wgs.liquidVolume` | MISSING (expected 'bypass.recordVliq25C') -- the run published no such word |  |  |

## pfr03_series_selectivity  (tutorials/steady/reactors/pfr03_series_selectivity)
4 rows
Reason: liquid feed at 350 K (rho 346.34 kg/m3 from the door): tau_s 225 -> 207.8 s (-7.6 %), yield of the intermediate and F_out follow (1.1 %).

| row | golden | now | relative move |
|---|---|---|---|
| `stream.product.F` | 0.000176612457804 | 0.000178626670345 | 0.0114 |
| `kpi.reactor.F_out_kmol_h` | 0.635804848095 | 0.643056013241 | 0.0114 |
| `kpi.reactor.tau_s` | 225 | 207.806618642 | 0.07642 |
| `source.reactor.liquidVolume` | MISSING (expected 'bypass.recordVliq25C') -- the run published no such word |  |  |

## pfr04_adiabatic  (tutorials/steady/reactors/pfr04_adiabatic)
7 rows
Reason: as pfr01 (same feed): tau_s -7.1 %, the adiabatic rise 6.62 -> 6.37 K.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.reactor.T_max` | 356.618955495 | 356.36564966 | 0.0007103 |
| `kpi.reactor.T_out` | 356.618955495 | 356.36564966 | 0.0007103 |
| `kpi.reactor.dT_rise` | 6.61895549509 | 6.36564966041 | 0.03827 |
| `kpi.reactor.hotSpot_dT` | 6.61895549509 | 6.36564966041 | 0.03827 |
| `kpi.reactor.tau_s` | 310.291329081 | 288.250802334 | 0.07103 |
| `stream.reactorOut.T` | 356.618955495 | 356.36564966 | 0.0007103 |
| `source.reactor.liquidVolume` | MISSING (expected 'bypass.recordVliq25C') -- the run published no such word |  |  |

## pfr_polyesterification  (tutorials/steady/reactors/pfr_polyesterification)
18 rows
Reason: liquid melt at 450 K (rho 927.87 kg/m3 from the door, rho at 25 C was 1070): tau_s 5830 -> 5055 s (-13 %); conversion 0.9814 -> 0.9684 and the chain length (Carothers, steep near full conversion) Mn, Mw, Xn, Xw -41 %; duty -1.3 %.

| row | golden | now | relative move |
|---|---|---|---|
| `stream.polymerMelt.F` | 0.000550395491925 | 0.000546790479579 | 0.00655 |
| `kpi.reactor.Da_kTau` | 3.98587252785 | 3.45604624962 | 0.1329 |
| `kpi.reactor.F_out_kmol_h` | 1.98142377093 | 1.96844572648 | 0.00655 |
| `kpi.reactor.Mn_kg_kmol` | 6144.41174045 | 3617.2596382 | 0.4113 |
| `kpi.reactor.Mw_kg_kmol` | 12174.6834809 | 7120.37927639 | 0.4151 |
| `kpi.reactor.PDI` | 1.98142377093 | 1.96844572648 | 0.00655 |
| `kpi.reactor.X_limiting` | 0.981423770929 | 0.968445726485 | 0.01322 |
| `kpi.reactor.Xn` | 53.8322388335 | 31.6914284054 | 0.4113 |
| `kpi.reactor.Xw` | 106.664477667 | 62.3828568109 | 0.4151 |
| `kpi.reactor.p_conversion` | 0.981423770929 | 0.968445726485 | 0.01322 |
| `kpi.reactor.tau_s` | 5829.95951417 | 5055.00604287 | 0.1329 |
| `kpi.reactor.Q_kW` | -41.6570319562 | -41.1109470654 | 0.01311 |
| `boundary.global.Q_boundary_kW` | -41.6570319562 | -41.1109470654 | 0.01311 |
| `boundary.global.H_products_kW` | -235.269344556 | -234.723259666 | 0.002321 |
| `utility.reactor.cooling.coolingWater.duty_kW` | -41.6570319562 | -41.1109470654 | 0.01311 |
| `utility.reactor.cooling.coolingWater.kg_s` | 0.996579711872 | 0.983515480032 | 0.01311 |
| `utility.reactor.cooling.coolingWater.eur_h` | 0.059986126017 | 0.0591997637741 | 0.01311 |
| `source.reactor.liquidVolume` | MISSING (expected 'bypass.recordVliq25C') -- the run published no such word |  |  |
