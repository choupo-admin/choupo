# C421 door slice B (the spray dryer): every moved golden row (2026-11-18)

Reason for the whole slice, as written in the commit: the spray dryer (`src/unitOperations/heatTransfer/SprayDryer.cpp`) and its atomiser (`atomizer/Atomizer.H`) no longer price the feed's liquid themselves. The viscosity was the typed `operation.liquidViscosity` with a water default of 1 mPa s, the surface tension the typed `operation.surfaceTension` with a 0.072 N/m water fallback, the droplet density the SOLVENT's stored 25 C molar volume (the dissolved solids not counted), and the wheel's windage a typed 1.8e-5 Pa s of air. They are now the door's (`liquidProperty::evaluate`) at the feed's own T and composition, read from the case's property dictionary (a model or a `measured` table of the solution), and the air's viscosity is the vapour model's. A property word typed in `operation` (any depth) is refused by name; a package with no viscosity or surface tension for the feed refuses by name with the line to write. The sugar cases read the NBS tables of aqueous sucrose (Swindells, Snyder, Hardy & Golden 1958, Supplement to NBS Circular 440, doi 10.6028/NBS.CIRC.440sup): Table 132 p. 6 for 20-35 C (`kind measured` for 30/40/50 wt %), the 20 wt % row and the 40 C column as `kind adopted`; every value was transcribed from the page image and read a second time against it (Table 130, p. 4, repeats the 20 and 25 C columns).

10 cases, 283 rows beyond tolerance. The golden of `sugarPlantEconomicsSweep` is not pinned (the case has none; it was run and ends with the sweep's exit code only).

## sprayDryer01_sugar  (tutorials/steady/drying/sprayDryer01_sugar)
23 rows beyond their tolerance (of 58 in the golden); 10 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: The feed (40 wt % sucrose, 25 C) used to be atomised with water's viscosity (1 mPa s, a typed default) and water's liquid density (997 kg/m3, the solvent's Vliq). It now reads the NBS table of aqueous sucrose (Swindells et al. 1958, `kind measured`): mu_L = 5.164 mPa s (x5.16) and the solution's density 1177.9 kg/m3 (x1.18). The surface tension is unchanged (Brock-Bird on water, 0.1065 N/m). The rotary wheel's d32 goes as mu^0.2 rho^-0.5 (Friedman-Gluckert-Marshall): 5.164^0.2 x (1177.9/997)^-0.5 = 1.386 x 0.920 = 1.275, and 60.40 um x 1.275 = 77.0 um (printed 77.17). The powder particle d_p = d32 (x_solid rho_L / rho_s)^(1/3) gains a further (1.18)^(1/3) = 1.057: 38.09 -> 51.45 um (x1.35). The coarser droplets are heavier (v_terminal x1.93, Re x2.46), so Nu, Sh and h, k_c move with Re (h falls 1160 -> 965 W/m2K since h = Nu k/d and d grew), the constant-rate time grows (0.081 -> 0.147 s), the residence time falls (7.10 -> 6.37 s, the particles fall faster) and the PSD (d10, d50, d90) scales with d32. T_out moves 0.014 K (the drying completes to the same isotherm moisture; the powder moisture row is unchanged within tolerance). The wheel's windage uses the Chung gas viscosity of the inlet air at 473 K (it was a typed 1.8e-5 Pa s): atomiserPower 183.96 -> 185.06 W (+0.6 %, the rest is the liquid kinetic energy, unchanged). `source` rows: the density now comes from the door (`liquidVolume.idealMix[...]`), the viscosity from the table (`stated.swindellsSucroseWaterViscosity`), the surface tension unchanged. `boundary global noBoundary` is a row the golden writer now emits and the earlier recording did not hold.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.dryer.Nu` | 2.24583682227 | 2.38590233638 | 0.05871 |
| `kpi.dryer.Re` | 0.203916784363 | 0.502474668837 | 0.5942 |
| `kpi.dryer.Sh` | 2.22885536787 | 2.35924574687 | 0.05527 |
| `kpi.dryer.d_droplet` | 6.04023981348e-05 | 7.71710714938e-05 | 0.2173 |
| `kpi.dryer.d_droplet_micron` | 60.4023981348 | 77.1710714938 | 0.2173 |
| `kpi.dryer.d_particle` | 3.80926671659e-05 | 5.144987068e-05 | 0.2596 |
| `kpi.dryer.d_particle_micron` | 38.0926671659 | 51.44987068 | 0.2596 |
| `kpi.dryer.h` | 1160.14265154 | 964.703266302 | 0.1685 |
| `kpi.dryer.k_c` | 1.58035151458 | 1.3093732558 | 0.1715 |
| `kpi.dryer.rho_liquid` | 996.956281129 | 1177.88742133 | 0.1536 |
| `kpi.dryer.tau_dry_constant` | 0.0809790962102 | 0.147015674238 | 0.4492 |
| `kpi.dryer.v_terminal` | 0.0871314379491 | 0.168056128093 | 0.4815 |
| `kpi.dryer.atomiserPower` | 183.957161449 | 185.061314778 | 0.005966 |
| `kpi.dryer.d10_micron` | 13.9073566639 | 18.7839748459 | 0.2596 |
| `kpi.dryer.d50_micron` | 29.9626677268 | 40.4690848519 | 0.2596 |
| `kpi.dryer.d90_micron` | 51.5024153736 | 69.5617505369 | 0.2596 |
| `kpi.dryer.residenceTime` | 7.09972562813 | 6.36790399146 | 0.1031 |
| `kpi.dryer.t_constant_rate` | 0.0728804835709 | 0.132312830501 | 0.4492 |
| `kpi.dryer.v_particle` | 0.704252567197 | 0.785187717451 | 0.1031 |
| `boundary.global.residual_kW` | -7.27595761418e-11 | -7.19069248589e-11 | - |
| `source.dryer.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett+flatVliq] | - |
| `source.dryer.liquidViscosity` | default.water1e-3 | stated.swindellsSucroseWaterViscosity | - |
| `boundary.global.noBoundary` | (absent) | false | - |

## sprayDryer02_residence_sweep  (tutorials/steady/drying/sprayDryer02_residence_sweep)
32 rows beyond their tolerance (of 53 in the golden); 9 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: Same feed, same table and density as sprayDryer01 (mu_L x5.16, rho_L x1.18). In addition this case had NO surface-tension model: sigma fell silently to the typed 0.072 N/m. It now states `surfaceTension { model StoredCorrelation; }` (water's own record law) and the dryer prints sigma = 0.07149 N/m at 25 C (-0.7 %, a factor 0.999 in d32). d32 58.08 -> 74.15 um (x1.277 = 1.386 mu x 0.920 rho x 0.999 sigma). The residence-time and PSD rows follow as in sprayDryer01; X_final 0.015942 -> 0.016288 (the larger, faster particle leaves a little wetter, still near the isotherm), duty -0.02 %.

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 4.22961617852e-05 | 4.25098885318e-05 | 0.005028 |
| `kpi.dryer.Nu` | 2.23180639411 | 2.36348983167 | 0.05572 |
| `kpi.dryer.Re` | 0.181305061943 | 0.44580392664 | 0.5933 |
| `kpi.dryer.Sh` | 2.21579410729 | 2.33838140832 | 0.05242 |
| `kpi.dryer.X_equilibrium` | 0.015941704202 | 0.015929427472 | 0.0007701 |
| `kpi.dryer.X_final` | 0.015941704235 | 0.0162882025873 | 0.02127 |
| `kpi.dryer.atomiserPower` | 183.957161449 | 185.061314778 | 0.005966 |
| `kpi.dryer.d10_micron` | 13.3730431044 | 18.0494540549 | 0.2591 |
| `kpi.dryer.d50_micron` | 28.8115172938 | 38.8865984793 | 0.2591 |
| `kpi.dryer.d90_micron` | 49.5237188069 | 66.8416365861 | 0.2591 |
| `kpi.dryer.d_droplet` | 5.80817687636e-05 | 7.41534058004e-05 | 0.2167 |
| `kpi.dryer.d_droplet_micron` | 58.0817687636 | 74.1534058004 | 0.2167 |
| `kpi.dryer.d_particle` | 3.66291662953e-05 | 4.94379961955e-05 | 0.2591 |
| `kpi.dryer.d_particle_micron` | 36.6291662953 | 49.4379961955 | 0.2591 |
| `kpi.dryer.duty` | 43733.2230716 | 43725.2059297 | 0.0001833 |
| `kpi.dryer.h` | 1198.95825162 | 994.530834235 | 0.1705 |
| `kpi.dryer.k_c` | 1.63386270857 | 1.35060720596 | 0.1734 |
| `kpi.dryer.moisture_pct_wb` | 1.56915541202 | 1.60271491353 | 0.02094 |
| `kpi.dryer.powder_flow` | 0.0112891373253 | 0.0112929876126 | 0.0003409 |
| `kpi.dryer.residenceTime` | 0.216833980275 | 0.195881029278 | 0.09663 |
| `kpi.dryer.rho_liquid` | 996.956281129 | 1177.88742133 | 0.1536 |
| `kpi.dryer.t_constant_rate` | 0.0678116372185 | 0.123325824875 | 0.4501 |
| `kpi.dryer.tau_dry_constant` | 0.0753469903799 | 0.137030016109 | 0.4501 |
| `kpi.dryer.thermalEfficiency` | 0.689001912885 | 0.688870087428 | 0.0001913 |
| `kpi.dryer.v_particle` | 0.697686087256 | 0.77231599119 | 0.09663 |
| `kpi.dryer.v_terminal` | 0.0805649580073 | 0.155169906334 | 0.4808 |
| `kpi.dryer.water_activity` | 0.0782484301553 | 0.0781738801022 | 0.0009527 |
| `kpi.dryer.water_evaporated` | 0.0164893988121 | 0.0164855485248 | 0.0002335 |
| `kpi.dryer.water_residual` | 0.00017714410931 | 0.000180994396651 | 0.02127 |
| `source.dryer.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett+flatVliq] | - |
| `source.dryer.liquidViscosity` | default.water1e-3 | stated.swindellsSucroseWaterViscosity | - |
| `source.dryer.surfaceTension` | fallback.water0.072 | StoredCorrelation/Butler | - |

## sprayDryer03_pressure_nozzle  (tutorials/steady/drying/sprayDryer03_pressure_nozzle)
21 rows beyond their tolerance (of 58 in the golden); 10 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: The pressure nozzle's class-average design curve d32 = 9575 dP^(-1/3) reads the pressure only, so d_droplet does NOT move (60.40 um, unchanged). What moves is the droplet density, 997 -> 1177.9 kg/m3: the powder particle d_p = d32 (x_s rho_L/rho_s)^(1/3) is x1.057 (38.04 -> 40.21 um), the PSD scales with it, and with the larger particle Re, Nu, Sh, h, k_c, v_terminal, v_particle and the drying times move. The nozzle's hydraulic power W = Q dP / eta uses Q = m/rho_L: 159.2 W x (997/1177.9) = 134.8 W. The viscosity enters nothing in this atomiser (its source row now reads the table). T_out +0.014 K as in sprayDryer01.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.dryer.Nu` | 2.24532614778 | 2.26666977271 | 0.009416 |
| `kpi.dryer.Re` | 0.203070475508 | 0.239942366707 | 0.1537 |
| `kpi.dryer.Sh` | 2.2283799688 | 2.24824929168 | 0.008838 |
| `kpi.dryer.d10_micron` | 13.8880902434 | 14.681995497 | 0.05407 |
| `kpi.dryer.d50_micron` | 29.9211592383 | 31.631586309 | 0.05407 |
| `kpi.dryer.d90_micron` | 51.4310670065 | 54.3710964545 | 0.05407 |
| `kpi.dryer.d_particle` | 3.80398958622e-05 | 4.02144261714e-05 | 0.05407 |
| `kpi.dryer.d_particle_micron` | 38.0398958622 | 40.2144261714 | 0.05407 |
| `kpi.dryer.h` | 1161.48790589 | 1172.55102613 | 0.009435 |
| `kpi.dryer.k_c` | 1.58220633085 | 1.59638324902 | 0.008881 |
| `kpi.dryer.residenceTime` | 7.10215851723 | 6.94634503812 | 0.02194 |
| `kpi.dryer.rho_liquid` | 996.956281129 | 1177.88742133 | 0.1536 |
| `kpi.dryer.t_constant_rate` | 0.0726952248732 | 0.085086673804 | 0.1456 |
| `kpi.dryer.tau_dry_constant` | 0.0807732512272 | 0.0945416606284 | 0.1456 |
| `kpi.dryer.v_particle` | 0.704011321047 | 0.719803000363 | 0.02194 |
| `kpi.dryer.v_terminal` | 0.0868901917994 | 0.102671411005 | 0.1537 |
| `kpi.dryer.atomiserPower` | 159.219110425 | 134.762023381 | 0.1536 |
| `boundary.global.residual_kW` | -7.27595761418e-11 | -7.19069248589e-11 | - |
| `source.dryer.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett+flatVliq] | - |
| `source.dryer.liquidViscosity` | default.water1e-3 | stated.swindellsSucroseWaterViscosity | - |
| `boundary.global.noBoundary` | (absent) | false | - |

## sprayDryer04_profiles  (tutorials/steady/drying/sprayDryer04_profiles)
23 rows beyond their tolerance (of 58 in the golden); 10 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: Same feed and atomiser as sprayDryer01: identical atomiser rows (d32 77.17 um, d_p 51.45 um) and the same reading of every moved row; the axial profile (profile.csv, not pinned) follows the larger particle.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.dryer.Nu` | 2.24583682227 | 2.38590233638 | 0.05871 |
| `kpi.dryer.Re` | 0.203916784363 | 0.502474668837 | 0.5942 |
| `kpi.dryer.Sh` | 2.22885536787 | 2.35924574687 | 0.05527 |
| `kpi.dryer.d10_micron` | 13.9073566639 | 18.7839748459 | 0.2596 |
| `kpi.dryer.d50_micron` | 29.9626677268 | 40.4690848519 | 0.2596 |
| `kpi.dryer.d90_micron` | 51.5024153736 | 69.5617505369 | 0.2596 |
| `kpi.dryer.d_droplet` | 6.04023981348e-05 | 7.71710714938e-05 | 0.2173 |
| `kpi.dryer.d_droplet_micron` | 60.4023981348 | 77.1710714938 | 0.2173 |
| `kpi.dryer.d_particle` | 3.80926671659e-05 | 5.144987068e-05 | 0.2596 |
| `kpi.dryer.d_particle_micron` | 38.0926671659 | 51.44987068 | 0.2596 |
| `kpi.dryer.h` | 1160.14265154 | 964.703266302 | 0.1685 |
| `kpi.dryer.k_c` | 1.58035151458 | 1.3093732558 | 0.1715 |
| `kpi.dryer.residenceTime` | 7.09972562813 | 6.36790399146 | 0.1031 |
| `kpi.dryer.rho_liquid` | 996.956281129 | 1177.88742133 | 0.1536 |
| `kpi.dryer.t_constant_rate` | 0.0728804835709 | 0.132312830501 | 0.4492 |
| `kpi.dryer.tau_dry_constant` | 0.0809790962102 | 0.147015674238 | 0.4492 |
| `kpi.dryer.v_particle` | 0.704252567197 | 0.785187717451 | 0.1031 |
| `kpi.dryer.v_terminal` | 0.0871314379491 | 0.168056128093 | 0.4815 |
| `kpi.dryer.atomiserPower` | 183.957161449 | 185.061314778 | 0.005966 |
| `boundary.global.residual_kW` | -7.27595761418e-11 | -7.19069248589e-11 | - |
| `source.dryer.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett+flatVliq] | - |
| `source.dryer.liquidViscosity` | default.water1e-3 | stated.swindellsSucroseWaterViscosity | - |
| `boundary.global.noBoundary` | (absent) | false | - |

## sprayDryer05_whey  (tutorials/steady/drying/sprayDryer05_whey)
23 rows beyond their tolerance (of 58 in the golden); 12 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: The feed is 16.7 wt % of sucrose-equivalent solids (whey solids modelled as sucrose), BELOW the NBS table's lowest measured solution. The case stands the 20 wt % row of Table 132 (`kind adopted`, 25 C: 1.695 mPa s) over it with an authorised box w 0.15-0.20, the edge value held and announced (about +14 % over what Table 131 gives for 16.7 %: 1.70 against 1.945 mPa s at 20 C). mu_L 1.0 -> 1.695 mPa s (x1.695), rho_L 997 -> 1065.1 kg/m3 (x1.068): d32 x (1.695^0.2 = 1.112) x (1.068^-0.5 = 0.968) = 1.077 (72.90 -> 78.37 um); d_p x1.099 (34.33 -> 37.74 um, the density adds its cube root). Residence 1.6015 -> 1.5938 s. Sigma unchanged.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.dryer.Nu` | 2.33731434528 | 2.38869631689 | 0.02151 |
| `kpi.dryer.Re` | 0.384509154435 | 0.510573250149 | 0.2469 |
| `kpi.dryer.Sh` | 2.31430911286 | 2.36218680635 | 0.02027 |
| `kpi.dryer.d10_micron` | 12.5346918443 | 13.7772137447 | 0.09019 |
| `kpi.dryer.d50_micron` | 27.0053336421 | 29.6822816593 | 0.09019 |
| `kpi.dryer.d90_micron` | 46.4190946954 | 51.020463638 | 0.09019 |
| `kpi.dryer.d_droplet` | 7.28954057578e-05 | 7.83746258522e-05 | 0.06991 |
| `kpi.dryer.d_droplet_micron` | 72.8954057578 | 78.3746258522 | 0.06991 |
| `kpi.dryer.d_particle` | 3.43328970408e-05 | 3.77362018056e-05 | 0.09019 |
| `kpi.dryer.d_particle_micron` | 34.3328970408 | 37.7362018056 | 0.09019 |
| `kpi.dryer.h` | 978.856819022 | 930.449855526 | 0.04945 |
| `kpi.dryer.k_c` | 1.29356579402 | 1.22805605759 | 0.05064 |
| `kpi.dryer.residenceTime` | 1.60154455209 | 1.59376211561 | 0.004859 |
| `kpi.dryer.rho_liquid` | 996.956281129 | 1065.10727035 | 0.06399 |
| `kpi.dryer.t_constant_rate` | 0.163958025655 | 0.198145450148 | 0.1725 |
| `kpi.dryer.tau_dry_constant` | 0.18217016775 | 0.220155065592 | 0.1725 |
| `kpi.dryer.v_particle` | 6.24397241211 | 6.27446210578 | 0.004859 |
| `kpi.dryer.v_terminal` | 0.129577913589 | 0.160036501895 | 0.1903 |
| `kpi.dryer.atomiserPower` | 1350.59258432 | 1352.54065955 | 0.00144 |
| `boundary.global.residual_kW` | -2.57614374277e-10 | -2.56250132225e-10 | - |
| `source.dryer.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett+flatVliq] | - |
| `source.dryer.liquidViscosity` | default.water1e-3 | stated.swindellsSucrose20pctViscosity | - |
| `boundary.global.noBoundary` | (absent) | false | - |

## sprayDryer06_rea  (tutorials/steady/drying/sprayDryer06_rea)
37 rows beyond their tolerance (of 58 in the golden); 6 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: Same feed and the same d32/d_p moves as sprayDryer01 (the wheel at 5 000 rpm: 138.8 -> 177.3 um). BUT this case sits on a knife edge by design (README: the residence time was set comparable to the drying time): with the coarser spray the 0.5 m chamber no longer dried the powder (X_final 0.0227 -> 0.614 kg/kg, 38 wt % moisture, T_out 366.7 -> 399.2 K, thermal efficiency 0.69 -> 0.48, water_evaporated 0.0164 -> 0.0098 kg/s) for the REA and the characteristic curve alike, so the lesson (the two kinetics differ only where residence ~ drying time) was lost. I RETUNED THE HARDWARE, the case's own design variable: chamberHeight 0.5 -> 1.2 m, which gives residence 0.80 s against 0.55 s of constant-rate drying and restores the regime (REA 2.04 wt %, characteristic curve 1.60 wt %, against 2.2 and 1.6 before; the isotherm 1.57). The rows below are therefore the sum of the property change (d32, d_p, rho_L, Re, h, k_c, drying times) and the taller chamber (residence 0.464 -> 0.798 s). The flowsheetDict header and the README say so.

| row | golden | now | relative move |
|---|---|---|---|
| `stream.powder.F` | 4.64501191995e-05 | 4.53280872767e-05 | 0.02416 |
| `kpi.dryer.Nu` | 2.85605353642 | 3.34378998524 | 0.1459 |
| `kpi.dryer.Re` | 2.47264038599 | 6.09287343847 | 0.5942 |
| `kpi.dryer.Sh` | 2.79692067766 | 3.25096634918 | 0.1397 |
| `kpi.dryer.T_out` | 366.680124094 | 366.581887294 | 0.0002679 |
| `kpi.dryer.X_equilibrium` | 0.0157046494569 | 0.015768358737 | 0.00404 |
| `kpi.dryer.X_final` | 0.0226761884418 | 0.0208571263981 | 0.08022 |
| `kpi.dryer.chamberHeight` | 0.5 | 1.2 | 0.5833 |
| `kpi.dryer.d10_micron` | 31.9507154443 | 43.1542420116 | 0.2596 |
| `kpi.dryer.d50_micron` | 68.8361342582 | 92.9735423953 | 0.2596 |
| `kpi.dryer.d90_micron` | 118.321479636 | 159.810936825 | 0.2596 |
| `kpi.dryer.d_droplet` | 0.000138768270751 | 0.000177292565757 | 0.2173 |
| `kpi.dryer.d_droplet_micron` | 138.768270751 | 177.292565757 | 0.2173 |
| `kpi.dryer.d_particle` | 8.75139682218e-05 | 0.00011820076363 | 0.2596 |
| `kpi.dryer.d_particle_micron` | 87.5139682218 | 118.20076363 | 0.2596 |
| `kpi.dryer.duty` | 43579.5769282 | 43619.5213329 | 0.0009157 |
| `kpi.dryer.h` | 642.190008823 | 588.496771216 | 0.08361 |
| `kpi.dryer.k_c` | 0.863209008856 | 0.785356359202 | 0.09019 |
| `kpi.dryer.moisture_pct_wb` | 2.2173380683 | 2.04309945621 | 0.07858 |
| `kpi.dryer.powder_flow` | 0.0113629531929 | 0.011343757463 | 0.001689 |
| `kpi.dryer.residenceTime` | 0.464126772447 | 0.797690564283 | 0.4182 |
| `kpi.dryer.rho_liquid` | 996.956281129 | 1177.88742133 | 0.1536 |
| `kpi.dryer.tau_dry_constant` | 0.336090911991 | 0.553667841583 | 0.393 |
| `kpi.dryer.thermalEfficiency` | 0.686473805426 | 0.687194027182 | 0.001048 |
| `kpi.dryer.v_gas` | 0.617409386398 | 0.617337166647 | 0.000117 |
| `kpi.dryer.v_particle` | 1.077291873 | 1.50434272853 | 0.2839 |
| `kpi.dryer.v_terminal` | 0.459882486604 | 0.887005561888 | 0.4815 |
| `kpi.dryer.water_activity` | 0.0768130515172 | 0.0771979587905 | 0.004986 |
| `kpi.dryer.water_evaporated` | 0.0164155829444 | 0.0164347786744 | 0.001168 |
| `kpi.dryer.water_residual` | 0.000251977652128 | 0.000231764247041 | 0.08022 |
| `stream.exhaustAir.T` | 366.680124094 | 366.581887294 | 0.0002679 |
| `stream.powder.T` | 366.680124094 | 366.581887294 | 0.0002679 |
| `kpi.dryer.atomiserPower` | 10.8807825475 | 10.9035472201 | 0.002088 |
| `boundary.global.residual_kW` | -5.47970557818e-11 | -5.89466253587e-11 | - |
| `source.dryer.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett+flatVliq] | - |
| `source.dryer.liquidViscosity` | default.water1e-3 | stated.swindellsSucroseWaterViscosity | - |
| `boundary.global.noBoundary` | (absent) | false | - |

## sprayDryer07_design  (tutorials/steady/drying/sprayDryer07_design)
27 rows beyond their tolerance (of 70 in the golden); 10 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: Same feed and atomiser as sprayDryer01 (d32 77.17 um, d_p 51.45 um) in the design chain: the atomiser and kinetics rows move as in sprayDryer01. The design block INVERTS the atomiser for the wheel speed that reaches the target droplet size: with a spray 1.275 x coarser at the same speed, and d32 proportional to N^-0.6, the speed needed rises by 1.275^(1/0.6) = 1.50: design_wheelSpeed_rpm 39 751 -> 59 798 (x1.504), and the chamber (diameter, height) and residence time that the design derives from the droplet follow (x1.21, x1.21, 0.243 -> 0.441 s). (A feed ~5 times more viscous than water does need a much faster wheel; 60 000 rpm is beyond the 20-30 000 rpm of industrial wheels, which is the model telling the student the target is not reachable with a wheel.)

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.dryer.Nu` | 2.24583682227 | 2.38590233638 | 0.05871 |
| `kpi.dryer.Re` | 0.203916784363 | 0.502474668837 | 0.5942 |
| `kpi.dryer.Sh` | 2.22885536787 | 2.35924574687 | 0.05527 |
| `kpi.dryer.d10_micron` | 13.9073566639 | 18.7839748459 | 0.2596 |
| `kpi.dryer.d50_micron` | 29.9626677268 | 40.4690848519 | 0.2596 |
| `kpi.dryer.d90_micron` | 51.5024153736 | 69.5617505369 | 0.2596 |
| `kpi.dryer.d_droplet` | 6.04023981348e-05 | 7.71710714938e-05 | 0.2173 |
| `kpi.dryer.d_droplet_micron` | 60.4023981348 | 77.1710714938 | 0.2173 |
| `kpi.dryer.d_particle` | 3.80926671659e-05 | 5.144987068e-05 | 0.2596 |
| `kpi.dryer.d_particle_micron` | 38.0926671659 | 51.44987068 | 0.2596 |
| `kpi.dryer.h` | 1160.14265154 | 964.703266302 | 0.1685 |
| `kpi.dryer.k_c` | 1.58035151458 | 1.3093732558 | 0.1715 |
| `kpi.dryer.residenceTime` | 7.09972562813 | 6.36790399146 | 0.1031 |
| `kpi.dryer.rho_liquid` | 996.956281129 | 1177.88742133 | 0.1536 |
| `kpi.dryer.t_constant_rate` | 0.0728804835709 | 0.132312830501 | 0.4492 |
| `kpi.dryer.tau_dry_constant` | 0.0809790962102 | 0.147015674238 | 0.4492 |
| `kpi.dryer.v_particle` | 0.704252567197 | 0.785187717451 | 0.1031 |
| `kpi.dryer.v_terminal` | 0.0871314379491 | 0.168056128093 | 0.4815 |
| `kpi.dryer.atomiserPower` | 183.957161449 | 185.061314778 | 0.005966 |
| `equipment.dryer.values.design_chamberDiameter_m` | 0.324651592984 | 0.410672979649 | 0.2095 |
| `equipment.dryer.values.design_chamberHeight_m` | 1.62325796492 | 2.05336489824 | 0.2095 |
| `equipment.dryer.values.design_residence_s` | 0.242937288631 | 0.441047022715 | 0.4492 |
| `equipment.dryer.values.design_wheelSpeed_rpm` | 39751.5114383 | 59798.1241699 | 0.3352 |
| `boundary.global.residual_kW` | -7.27595761418e-11 | -7.19069248589e-11 | - |
| `source.dryer.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett+flatVliq] | - |
| `source.dryer.liquidViscosity` | default.water1e-3 | stated.swindellsSucroseWaterViscosity | - |
| `boundary.global.noBoundary` | (absent) | false | - |

## ChemicalPlantTutorial  (tutorials/plant/ChemicalPlantTutorial)
67 rows beyond their tolerance (of 315 in the golden); 28 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: The plant's spray dryer (DRYING/SD) is fed the crystalliser's magma: 76 wt % dissolved sucrose at 313.15 K. It used to atomise it as water (1 mPa s, 997 kg/m3, sigma a typed 0.072 N/m). It now reads, through the variant `sdMagma` (so that no other unit of the plant is handed a viscosity table): the 40 C column of Table 132 (`kind adopted`: above 35 C the NBS table rests on other authors) 389.5 mPa s, HELD at 75 wt % (the feed is 76: an understatement of the viscosity, announced), the solution's 1403.5 kg/m3, and sigma 0.06902 N/m from the record law (-4.1 % against 0.072). mu_L x389.5, rho_L x1.408: d32 x (389.5^0.2 = 3.31) x (1.408^-0.5 = 0.843) x (0.959^0.1 = 0.996) = 2.77 (110.8 -> 306.5 um); d_p 88.5 -> 274.5 um. The big droplets fall 10 x faster (v_terminal 0.30 -> 3.27 m/s), the chamber residence falls 1.27 -> 0.72 s and the drying (tau_dry_constant x5.2) is not finished: the powder leaves wetter (X_final 0.0296 -> 0.0342, moisture 2.87 -> 3.31 wt %), so less water evaporates in SD (W_evap 0.1137 -> 0.1110 kg/s, duty -1.5 %) and the belt dryer BD downstream removes more (water_removed +25 %, exhaust humidity up, its T_out 355.7 -> 353.3 K). Sizing and cost follow the duty and the evaporation (SD purchased 361,968 -> 356,876 EUR, -1.4 %) and with them COM, FCI, TCI, NPV (-28.76 -> -28.70 MEUR). The FERMENTATION rows that move do so by less than 4e-5 relative (inside the golden's 1e-4): the plant-wide recycle converges to a neighbouring point once the dryer's downstream flows change. Closures: every mass, element and energy closure held (`bin/runTests --scope` lines).

| row | golden | now | relative move |
|---|---|---|---|
| `stream.DryerVapour.F` | 0.0422569468232 | 0.0424009739564 | 0.003397 |
| `stream.Stack.F` | 0.0896493543722 | 0.0894967468786 | 0.001702 |
| `stream.DryPowder.T` | 355.72461915 | 353.290465851 | 0.006843 |
| `stream.DryerVapour.T` | 355.72461915 | 353.290465851 | 0.006843 |
| `stream.Dust.T` | 349.176573174 | 350.997807263 | 0.005189 |
| `stream.Exhaust.F` | 0.0896493543722 | 0.0894967468786 | 0.001702 |
| `stream.Exhaust.T` | 349.176573174 | 350.997807263 | 0.005189 |
| `stream.ExhaustClean.F` | 0.0896493543722 | 0.0894967468786 | 0.001702 |
| `stream.ExhaustClean.T` | 349.176573174 | 350.997807263 | 0.005189 |
| `stream.Powder.T` | 355.72461915 | 353.290465851 | 0.006843 |
| `stream.RecoveredDust.T` | 349.176573174 | 350.997807263 | 0.005189 |
| `stream.Stack.T` | 349.176573174 | 350.997807263 | 0.005189 |
| `stream.WetPowder.F` | 0.00260411268378 | 0.00275139290586 | 0.05353 |
| `stream.WetPowder.T` | 349.176573174 | 350.997807263 | 0.005189 |
| `equipment.DRYING.SD.values.W_evap` | 0.113687148219 | 0.111033895018 | 0.02334 |
| `equipment.DRYING.SD.cost.purchased` | 361968.50169 | 356875.966298 | 0.01407 |
| `equipment.DRYING.SD.cost.bareModule` | 1595557.15545 | 1573109.25944 | 0.01407 |
| `equipment.DRYING.SD.cost.totalModule` | 1882757.44343 | 1856268.92614 | 0.01407 |
| `kpi.DRYING.BD.T_out` | 355.72461915 | 353.290465851 | 0.006843 |
| `kpi.DRYING.BD.X_initial` | 0.0295984092079 | 0.0342489680115 | 0.1358 |
| `kpi.DRYING.BD.exhaust_humidity` | 0.14832607846 | 0.17026446889 | 0.1288 |
| `kpi.DRYING.BD.water_removed` | 0.0105752926244 | 0.0132285458251 | 0.2006 |
| `kpi.DRYING.SD.Nu` | 2.62159541583 | 5.39482517407 | 0.5141 |
| `kpi.DRYING.SD.Re` | 1.30730089975 | 38.9937437072 | 0.9665 |
| `kpi.DRYING.SD.Sh` | 2.57898648491 | 5.16211763448 | 0.5004 |
| `kpi.DRYING.SD.T_out` | 349.176573174 | 350.997807263 | 0.005189 |
| `kpi.DRYING.SD.X_equilibrium` | 0.0295984092079 | 0.0275276947026 | 0.06996 |
| `kpi.DRYING.SD.X_final` | 0.0295984092079 | 0.0342489680115 | 0.1358 |
| `kpi.DRYING.SD.atomiserPower` | 4285.6632691 | 4286.62527558 | 0.0002244 |
| `kpi.DRYING.SD.d10_micron` | 32.3182809544 | 100.221476198 | 0.6775 |
| `kpi.DRYING.SD.d50_micron` | 69.6280347979 | 215.921893929 | 0.6775 |
| `kpi.DRYING.SD.d90_micron` | 119.682666527 | 371.145158727 | 0.6775 |
| `kpi.DRYING.SD.d_droplet` | 0.000110778024594 | 0.00030651957558 | 0.6386 |
| `kpi.DRYING.SD.d_droplet_micron` | 110.778024594 | 306.51957558 | 0.6386 |
| `kpi.DRYING.SD.d_particle` | 8.85207411822e-05 | 0.000274509630259 | 0.6775 |
| `kpi.DRYING.SD.d_particle_micron` | 88.5207411822 | 274.509630259 | 0.6775 |
| `kpi.DRYING.SD.duty` | 302755.491679 | 298326.432135 | 0.01463 |
| `kpi.DRYING.SD.h` | 734.316336034 | 546.132673002 | 0.2563 |
| `kpi.DRYING.SD.k_c` | 0.996807393733 | 0.721114010431 | 0.2766 |
| `kpi.DRYING.SD.moisture_pct_wb` | 2.87475281072 | 3.31148196139 | 0.1319 |
| `kpi.DRYING.SD.powder_flow` | 0.587410113498 | 0.590063366699 | 0.004497 |
| `kpi.DRYING.SD.residenceTime` | 1.2720333684 | 0.723600835148 | 0.4311 |
| `kpi.DRYING.SD.rho_liquid` | 996.956281129 | 1403.45969978 | 0.2896 |
| `kpi.DRYING.SD.t_constant_rate` | 0.0250835403386 | 0.131385188883 | 0.8091 |
| `kpi.DRYING.SD.tau_dry_constant` | 0.0727911198864 | 0.381272934609 | 0.8091 |
| `kpi.DRYING.SD.thermalEfficiency` | 0.798837607505 | 0.787102267765 | 0.01469 |
| `kpi.DRYING.SD.v_gas` | 3.62695774941 | 3.63528226044 | 0.00229 |
| `kpi.DRYING.SD.v_particle` | 3.93071449557 | 6.9098869945 | 0.4311 |
| `kpi.DRYING.SD.v_terminal` | 0.303756746159 | 3.27460473407 | 0.9072 |
| `kpi.DRYING.SD.water_activity` | 0.174749605453 | 0.158563254894 | 0.09263 |
| `kpi.DRYING.SD.water_evaporated` | 0.113687148219 | 0.111033895018 | 0.02334 |
| `kpi.DRYING.SD.water_residual` | 0.0168865887483 | 0.019539841949 | 0.1358 |
| `kpi.economics.COM_d` | 9054433.52387 | 9048154.77604 | 0.0006934 |
| `kpi.economics.FCI` | 30357875.1987 | 30323047.0489 | 0.001147 |
| `kpi.economics.NPV` | -28759952.8799 | -28698379.7524 | 0.002141 |
| `kpi.economics.TCI` | 34911556.4785 | 34871504.1063 | 0.001147 |
| `kpi.economics.WC` | 4553681.2798 | 4548457.05734 | 0.001147 |
| `kpi.economics.taxCreditOnLoss` | 6252099.17483 | 6233602.51445 | 0.002958 |
| `kpi.economics.taxCreditOnLoss_NPV` | 4000665.33884 | 3988829.48244 | 0.002958 |
| `source.DRYING.SD.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett+flatVliq] | - |
| `source.DRYING.SD.liquidViscosity` | default.water1e-3 | stated.swindellsSucroseWaterViscosity40C | - |
| `source.DRYING.SD.surfaceTension` | fallback.water0.072 | StoredCorrelation/Butler | - |
| `boundary.global.noBoundary` | (absent) | false | - |
| `boundary.global.residual_denom_kW` | (absent) | 1043.49438753 | - |
| `closure.DRYING.SD.raw_kW` | (absent) | 5.45696821064e-11 | - |
| `closure.DRYING.SD.step_kW` | (absent) | 0 | - |
| `closure.DRYING.SD.remaining_kW` | (absent) | 5.45696821064e-11 | - |

## economics04_building_royalty_breakeven  (tutorials/steady/economics/economics04_building_royalty_breakeven)
26 rows beyond their tolerance (of 317 in the golden); 17 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: Same feed and atomiser as sprayDryer01 (the dryer is the same unit with the same data): d32 77.17 um, d_p 51.45 um, the same kinetic and PSD moves, and the same design inversion as sprayDryer07 (the wheel speed the design needs for the target droplet size 39 751 -> 59 798 rpm, x1.504 = 1.275^(1/0.6); chamber and residence follow). No economics row moves beyond tolerance.

| row | golden | now | relative move |
|---|---|---|---|
| `kpi.dryer.Nu` | 2.24583682227 | 2.38590233638 | 0.05871 |
| `kpi.dryer.Re` | 0.203916784363 | 0.502474668837 | 0.5942 |
| `kpi.dryer.Sh` | 2.22885536787 | 2.35924574687 | 0.05527 |
| `kpi.dryer.atomiserPower` | 183.957161449 | 185.061314778 | 0.005966 |
| `kpi.dryer.d10_micron` | 13.9073566639 | 18.7839748459 | 0.2596 |
| `kpi.dryer.d50_micron` | 29.9626677268 | 40.4690848519 | 0.2596 |
| `kpi.dryer.d90_micron` | 51.5024153736 | 69.5617505369 | 0.2596 |
| `kpi.dryer.d_droplet` | 6.04023981348e-05 | 7.71710714938e-05 | 0.2173 |
| `kpi.dryer.d_droplet_micron` | 60.4023981348 | 77.1710714938 | 0.2173 |
| `kpi.dryer.d_particle` | 3.80926671659e-05 | 5.144987068e-05 | 0.2596 |
| `kpi.dryer.d_particle_micron` | 38.0926671659 | 51.44987068 | 0.2596 |
| `kpi.dryer.h` | 1160.14265154 | 964.703266302 | 0.1685 |
| `kpi.dryer.k_c` | 1.58035151458 | 1.3093732558 | 0.1715 |
| `kpi.dryer.residenceTime` | 7.09972562813 | 6.36790399146 | 0.1031 |
| `kpi.dryer.rho_liquid` | 996.956281129 | 1177.88742133 | 0.1536 |
| `kpi.dryer.t_constant_rate` | 0.0728804835709 | 0.132312830501 | 0.4492 |
| `kpi.dryer.tau_dry_constant` | 0.0809790962102 | 0.147015674238 | 0.4492 |
| `kpi.dryer.v_particle` | 0.704252567197 | 0.785187717451 | 0.1031 |
| `kpi.dryer.v_terminal` | 0.0871314379491 | 0.168056128093 | 0.4815 |
| `equipment.dryer.values.design_chamberDiameter_m` | 0.324651592984 | 0.410672979649 | 0.2095 |
| `equipment.dryer.values.design_chamberHeight_m` | 1.62325796492 | 2.05336489824 | 0.2095 |
| `equipment.dryer.values.design_residence_s` | 0.242937288631 | 0.441047022715 | 0.4492 |
| `equipment.dryer.values.design_wheelSpeed_rpm` | 39751.5114383 | 59798.1241699 | 0.3352 |
| `source.dryer.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett+flatVliq] | - |
| `source.dryer.liquidViscosity` | default.water1e-3 | stated.swindellsSucroseWaterViscosity | - |
| `boundary.global.noBoundary` | (absent) | false | - |

## apalutamide01_tablets  (tutorials/batch/plant/apalutamide01_tablets)
4 rows beyond their tolerance (of 1518 in the golden); 146 more moved within their own tolerance (below 1e-4 relative) and are not listed.

Reason: The dryer atomised with a typed `operation.liquidViscosity 0.02` (an AUTHOR-SET guess for an HPMCAS solution) and the solvent's Vliq. In this model nothing dissolves (the API and the HPMCAS ride in the solid phase of every stream), so the liquid is acetone: the property dictionary now gives its own record law for the viscosity (`source ... liquidViscosity perConstituent`; the typed guess is gone and was never read by the class-average pressure-nozzle curve), and the density comes from the door (`liquidVolume.idealMix[anchoredRackett]`: acetone at 25 C, the same value as the solvent's Vliq). No number moves beyond its tolerance; the 146 rows that move within it do so below 1e-4 relative (the powder's PSD, the loop's tanks) through the Rackett temperature dependence of the density now applied at the feed's T. Only the `source` labels and the two rows the golden writer now emits (`noBoundary`, `residual_denom_kW`) differ.

| row | golden | now | relative move |
|---|---|---|---|
| `source.SD.liquidDensity` | bypass.solventVliq25C | liquidVolume.idealMix[anchoredRackett] | - |
| `source.SD.liquidViscosity` | declared.case | perConstituent | - |
| `boundary.global.noBoundary` | (absent) | false | - |
| `boundary.global.residual_denom_kW` | (absent) | 42.4792355907 | - |

