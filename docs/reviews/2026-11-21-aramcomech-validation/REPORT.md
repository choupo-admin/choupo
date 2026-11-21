# AramcoMech 1.3 whole, against Cantera and against experiment (2026-11-21)

Measurement slice of the CHEMKIN line, branch `ckforms` (a general's report; numbers measured on
this branch's build).  The mechanism files are a LOCAL measurement copy under
`thirdParty/mechanisms/aramcomech13/` (gitignored); nothing of the mechanism is in this tree --
only numbers our own runs produced, the measured points of a journal table (cited value by value,
`petersen1999_table2.tsv`) and the scripts.

## 1. Sources

- Mechanism: AramcoMech 1.3 (`AramcoMech_1.3_C4_chem.dat`, `AramcoMech_1.3_therm.dat`), W. K.
  Metcalfe, S. M. Burke, S. S. Ahmed, H. J. Curran, "A Hierarchical and Comparative Kinetic
  Modeling Study of C1-C2 Hydrocarbon and Oxygenated Fuels", Int. J. Chem. Kinet. 45 (2013)
  638-675, doi:10.1002/kin.20802.  253 species, 1542 reactions.
- Experiment: E. L. Petersen, D. F. Davidson, R. K. Hanson, "Ignition Delay Times of Ram
  Accelerator CH4/O2/Diluent Mixtures", J. Propulsion and Power 15(1) (1999) 82-91,
  doi:10.2514/2.5394.  Table 1 (mixtures, p. 84) and Table 2 (117 measured points, p. 86) read
  from the page images at 300 dpi (the text extraction garbles the columns).
- Reference code: Cantera 3.2.0, `ck2yaml` of the same two files, `IdealGasReactor` /
  `IdealGasConstPressureReactor`, rtol 1e-10, atol 1e-20, advanced to the same instants as
  Choupo's output grid.
- Choupo: `bin/curate/chemkin_to_choupo.py` (the NASA-7 file re-referenced from 1 atm to 1 bar,
  so K_c equals CHEMKIN's and Cantera's), `choupoBatch`, adiabatic `batchReactor`, `energy
  gasConstantV` (constant V) or `gasConstantP` (constant P), Rodas4, the analytic Jacobian (the
  default), `linearSolver auto` (sparse at 254 rows) unless stated; rtol 1e-7 (the vessel's own).

## 2. Import: 1542 of 1542

Before this branch: 1501 of 1542 written, 41 refused by name (38 `bothSides`, 3 single colliders
`(+AR)`, `(+HE)`, `(+H2O)`).  Verified: the files carry no SRI, FORD or RORD line.  After the four
forms (Theory Guide `sec:chemkin-forms`): 1542 written, 0 refused; 253 of 253 species.

The forms on a six-reaction NUMERICAL fixture (made-up species, continuous thermo; one reaction
text read by both codes; `scripts/fixture_forms.py`), the net rate at the initial state
(Choupo's rateOfProduction at t = 0 against Cantera's net_rates_of_progress), 1200 K, 2 atm:

| reaction | form | Choupo r [kmol/m3/s] | Cantera | rel diff |
|---|---|---|---|---|
| A + B + D <=> C + D | D on both sides (Cantera: three-body on D) | 9.302304881668542 | 9.302304096288212 | 8.4e-08 |
| A + B (+E) <=> C (+E) | single collider | 24.13455469636968 | 24.13455265930057 | 8.4e-08 |
| A + B (+M) <=> C (+M) | SRI, 5 numbers, eff D 2 | 9.407644772036766 | 9.407643977933098 | 8.4e-08 |
| F + D <=> C + D | D on both sides | -4.185404926828914e7 | -4.185390021465842e7 | 3.6e-06 |
| A + B => C | FORD A 1.5, E 0.5 | 1.413957370425623e-3 | 1.413957369796042e-3 | 4.5e-10 |
| A + B (+M) <=> C (+M) | SRI, 3 numbers | 23.92687520867085 | 23.92687318956046 | 8.4e-08 |

The irreversible FORD reaction agrees to 4.5e-10 (the gas-constant digits: Choupo R =
8.314462618, Cantera 8.31446261815324).  Every REVERSIBLE reaction of the fixture carries the
same 3.5e-6 relative difference in its reverse rate (the reverse/net ratio is 0.024 for the four
A + B <=> C reactions, 1.00003 for F + D <=> C + D: 8.4e-8 / 0.024 = 3.6e-6 / 1.00003 = 3.5e-6) --
i.e. in K_c, identical whatever the form, so it is the thermochemistry path (g(T) of the six
fixture records), not any of the four forms; the forward parts agree to the gas-constant digits.
NOT CHASED in this slice.  The adiabatic constant-V trajectory of the fixture (1200 -> 1506.67 K
in 2 ms, 1001 points) agrees to 1.5e-5 K.

## 3. AramcoMech 1.3 against Cantera (Phase B)

Stoichiometric CH4/air (CH4:O2:N2 = 1:2:7.52) at (i) 1 atm, 1400 K and (ii) 10 atm, 1300 K, and
(iii) one Petersen condition, mixture 2 (3CH4 + 2O2 + 10N2) at 114.4 atm, 1244 K (measured 254
us).  Three definitions of tau, the same code (`scripts/ignition.py`) on both trajectories: max
dT/dt (parabolic vertex on the grid), the T0 + 400 K crossing, and Petersen's t_F (the steepest
pressure rise extrapolated to the initial pressure; constant V only).  Grids: 2 us, 1 us, 0.1 us.

| case | mode | tau max dT/dt, Choupo / Cantera [us] | rel | tau T0+400 K [us] | tau dP/dt tangent [us] | T_final Choupo / Cantera [K] | max abs dT [K] | wall dense / sparse / Cantera [s] |
|---|---|---|---|---|---|---|---|---|
| i_V: 1400 K, 1 atm, CH4:1,O2:2,N2:7.52 | V | 5198.57 / 5198.56 | 3.8e-07 | 5185.43 / 5185.43 | 5192.55 / 5192.54 | 2890.9497 / 2890.9497 | 0.397 | 47.0 / 33.0 / 4.4 |
| i_P: 1400 K, 1 atm, CH4:1,O2:2,N2:7.52 | P | 5856.93 / 5856.93 | -3.2e-08 | 5843.93 / 5843.93 | - | 2708.3804 / 2708.3804 | 0.015 | 50.8 / 36.9 / 5.4 |
| ii_V: 1300 K, 10 atm, CH4:1,O2:2,N2:7.52 | V | 2291.59 / 2291.59 | 2.6e-07 | 2284.71 / 2284.70 | 2289.99 / 2289.99 | 3056.0080 / 3056.0081 | 0.845 | 58.7 / 38.7 / 5.0 |
| ii_P: 1300 K, 10 atm, CH4:1,O2:2,N2:7.52 | P | 2642.40 / 2642.40 | 3.6e-07 | 2634.43 / 2634.43 | - | 2812.1206 / 2812.1207 | 0.413 | 58.1 / 42.3 / 6.5 |
| iii_V: 1244 K, 114.4 atm, CH4:3,O2:2,N2:10 | V | 272.08 / 272.08 | -7.2e-06 | 266.03 / 266.03 | 266.50 / 266.51 | 2084.9587 / 2084.9591 | 0.213 | 65.6 / 45.8 / 5.7 |
| iii_P: 1244 K, 114.4 atm, CH4:3,O2:2,N2:10 | P | 328.55 / 328.55 | -6.0e-06 | 319.39 / 319.39 | - | 1941.9496 / 1941.9500 | 0.060 | 67.2 / 48.6 / 5.5 |

Final mole fractions (Choupo / Cantera), the eight largest:

- i_V: N2 0.678994 / 0.678994, H2O 0.143165 / 0.143165, CO2 0.0459829 / 0.045983, CO 0.0443087 / 0.0443086, OH 0.0258685 / 0.0258686, O2 0.023893 / 0.023893, H2 0.0192321 / 0.0192322, H 0.0104935 / 0.0104935; worst relative 5.7e-06
- i_P: N2 0.686165 / 0.686165, H2O 0.15281 / 0.15281, CO2 0.0535433 / 0.0535434, CO 0.037702 / 0.0377019, O2 0.020951 / 0.020951, OH 0.0200541 / 0.0200542, H2 0.0159476 / 0.0159477, H 0.00740574 / 0.00740571; worst relative 5.9e-06
- ii_V: N2 0.690581 / 0.690581, H2O 0.158662 / 0.158662, CO2 0.0569999 / 0.057, CO 0.0348324 / 0.0348323, OH 0.0198826 / 0.0198827, O2 0.0180894 / 0.0180894, H2 0.0128967 / 0.0128968, H 0.00430406 / 0.00430405; worst relative 6.1e-06
- ii_P: N2 0.696804 / 0.696804, H2O 0.16701 / 0.16701, CO2 0.0654035 / 0.0654035, CO 0.0272566 / 0.0272565, O2 0.0146743 / 0.0146743, OH 0.0140167 / 0.0140168, H2 0.00994997 / 0.00995003, H 0.00269291 / 0.00269291; worst relative 6.3e-06
- iii_V: N2 0.5558 / 0.5558, H2 0.204702 / 0.204702, CO 0.121147 / 0.121147, H2O 0.0813026 / 0.0813029, CH4 0.0186811 / 0.0186811, CO2 0.00991307 / 0.00991319, C2H2 0.00651308 / 0.00651319, C2H4 0.00132344 / 0.00132346; worst relative 2.1e-05
- iii_P: N2 0.586418 / 0.586418, H2 0.140188 / 0.140187, H2O 0.125284 / 0.125285, CO 0.0806872 / 0.0806869, CH4 0.0286388 / 0.0286389, C2H2 0.0189888 / 0.018989, CO2 0.0142414 / 0.0142412, C2H4 0.00296126 / 0.00296129; worst relative 1.3e-05

Acceptance (tau within 0.5 %, T_final within 0.1 K): met on all six with three orders of margin.
The max |dT| along the trajectory sits on the ignition ramp, where T climbs ~1000 K within a few
grid steps: a tau shift of 1e-6 relative moves T there by that much.  Wall time includes Choupo
writing one state directory per output instant (4000-5000 of them); "dense" and "sparse" are
`linearSolver dense | sparse`, trajectories identical to the 9 written digits.  Cantera is 6-11x
faster on the same grid (it writes nothing).

## 4. Against experiment: Petersen, Davidson & Hanson 1999 (Phase C)

Their ignition time (p. 83, Fig. 1): t_F - t_C, the arrival of the ignition front at the
sidewall port, located by extrapolating the steepest pressure rise, corrected to the endwall by
Eq. (1) (p. 84); some points are endwall pressure (d) or HeNe extinction (g).  The closest
consistent model definition, used in BOTH codes: the constant-volume adiabatic reactor started at
(T5, P5), tau = the tangent at max dP/dt extrapolated to P5 (`tau_dPdt_tangent`).  Every one of
the 117 points of Table 2 was run (the mechanism has CH4, O2, N2, AR and HE: it covers all seven
mixtures); grid endTime = 5 tau_measured, 2500 steps (rerun with endTime x4 when not ignited).

| mixture | P5 [atm] | T5 [K] | measured [us] (diag) | Choupo [us] | Cantera [us] | Choupo/meas | Choupo/Cantera - 1 | Choupo max dT/dt [us] |
|---|---|---|---|---|---|---|---|---|
| 1 | 50.5 | 1203 | 694 | 1234.4 | 1234.4 | 1.78 | 5.3e-08 | 1236.0 |
| 1 | 50 | 1232 | 555 | 912.7 | 912.7 | 1.64 | -3.5e-07 | 914.1 |
| 1 | 49 | 1268 | 406 | 626.2 | 626.2 | 1.54 | 3.0e-09 | 627.3 |
| 1 | 44.4 | 1285 | 415 | 572.9 | 572.9 | 1.38 | -1.1e-07 | 574.0 |
| 1 | 48.9 | 1319 | 261 | 356.1 | 356.1 | 1.36 | 5.1e-06 | 357.2 |
| 1 | 47.3 | 1359 | 206 | 237.7 | 237.7 | 1.15 | 5.7e-07 | 238.4 |
| 1 | 100.9 | 1137 | 661 | 953.2 | 953.2 | 1.44 | 2.1e-05 | 955.6 |
| 1 | 98.8 | 1169 | 541 | 741.5 | 741.5 | 1.37 | -1.7e-07 | 742.8 |
| 1 | 96.2 | 1198 | 440 | 590.7 | 590.7 | 1.34 | -1.7e-07 | 591.8 |
| 1 | 94.7 | 1207 | 392 | 554.1 | 554.1 | 1.41 | -1.1e-05 | 555.4 |
| 1 | 98.2 | 1268 | 241 | 292.2 | 292.2 | 1.21 | 3.1e-07 | 292.9 |
| 1 | 100 | 1292 | 191 | 224.6 | 224.6 | 1.18 | -1.2e-07 | 225.2 |
| 1 | 94.5 | 1312 | 169 | 194.7 | 194.7 | 1.15 | 7.2e-08 | 195.2 |
| 1 | 94.7 | 1361 | 114 | 117.6 | 117.6 | 1.03 | 7.8e-07 | 118.0 |
| 1 | 161.2 | 1198 | 253 | 302.1 | 302.1 | 1.19 | -4.1e-06 | 302.8 |
| 1 | 150.8 | 1250 | 177 | 207.8 | 207.8 | 1.17 | -1.3e-06 | 208.3 |
| 2 | 39.8 | 1325 | 654 | 606.1 | 606.1 | 0.93 | -9.5e-07 | 617.9 |
| 2 | 47.5 | 1346 | 361 (d) | 399.3 | 399.3 | 1.11 | 2.1e-07 | 408.5 |
| 2 | 38.4 | 1383 | 391 | 355.3 | 355.3 | 0.91 | -3.2e-06 | 364.6 |
| 2 | 34.5 | 1431 | 250 | 249.6 | 249.6 | 1.00 | -2.9e-06 | 257.7 |
| 2 | 35.6 | 1536 | 102 | 90.8 | 90.8 | 0.89 | -6.3e-06 | 95.6 |
| 2 | 91 | 1167 | 572 | 575.2 | 575.2 | 1.01 | -3.8e-06 | 585.1 |
| 2 | 80.9 | 1196 | 681 (d) | 625.7 | 625.7 | 0.92 | -1.4e-05 | 636.0 |
| 2 | 77.7 | 1203 | 622 | 647.3 | 647.3 | 1.04 | -9.7e-07 | 657.6 |
| 2 | 83 | 1206 | 541 | 568.4 | 568.4 | 1.05 | -9.6e-06 | 577.9 |
| 2 | 91.8 | 1363 | 152 (d) | 150.2 | 150.2 | 0.99 | -3.5e-06 | 154.7 |
| 2 | 92.9 | 1418 | 95 (d) | 91.3 | 91.3 | 0.96 | -3.0e-06 | 94.8 |
| 2 | 106 | 1179 | 414 | 415.4 | 415.4 | 1.00 | -8.9e-06 | 423.2 |
| 2 | 132.2 | 1182 | 280 | 275.4 | 275.4 | 0.98 | -4.9e-06 | 281.3 |
| 2 | 102.8 | 1182 | 419 | 433.8 | 433.8 | 1.04 | -6.6e-06 | 441.8 |
| 2 | 114 | 1156 | 421 | 399.1 | 399.1 | 0.95 | -4.0e-06 | 407.0 |
| 2 | 114.4 | 1244 | 254 | 266.4 | 266.4 | 1.05 | -2.4e-06 | 272.0 |
| 2 | 120 | 1380 | 77 | 91.4 | 91.4 | 1.19 | -3.0e-06 | 94.5 |
| 2 | 178.4 | 1209 | 170 | 144.2 | 144.2 | 0.85 | -6.7e-06 | 148.0 |
| 2 | 163 | 1254 | 157 | 137.9 | 137.9 | 0.88 | -4.4e-06 | 141.4 |
| 2 | 164 | 1372 | 71 | 63.5 | 63.5 | 0.89 | -3.2e-06 | 65.7 |
| 2 | 262.5 | 1176 | 98 | 88.7 | 88.7 | 0.90 | -9.1e-06 | 91.3 |
| 2 | 263.6 | 1239 | 70 | 63.9 | 63.9 | 0.91 | -4.2e-06 | 66.0 |
| 2 | 256.2 | 1301 | 55 | 50.1 | 50.1 | 0.91 | -7.7e-06 | 51.8 |
| 3 | 47.3 | 1358 | 327 | 313.3 | 313.3 | 0.96 | 2.0e-06 | 316.3 |
| 3 | 41.4 | 1362 | 360 | 350.7 | 350.7 | 0.97 | 2.2e-06 | 354.0 |
| 3 | 36.7 | 1381 | 425 | 331.7 | 331.7 | 0.78 | -7.1e-06 | 335.0 |
| 3 | 43.3 | 1402 | 265 | 225.1 | 225.1 | 0.85 | -1.4e-06 | 227.6 |
| 3 | 48.2 | 1409 | 214 | 186.9 | 186.9 | 0.87 | -8.2e-06 | 189.2 |
| 3 | 42.2 | 1414 | 238 | 205.8 | 205.8 | 0.86 | -1.3e-05 | 208.4 |
| 3 | 40.4 | 1418 | 234 | 207.6 | 207.6 | 0.89 | -8.5e-06 | 210.2 |
| 3 | 39.5 | 1454 | 182 | 150.5 | 150.5 | 0.83 | -2.5e-06 | 152.7 |
| 3 | 44.3 | 1486 | 115 | 99.1 | 99.1 | 0.86 | -3.0e-06 | 100.8 |
| 3 | 39.3 | 1511 | 106 | 89.1 | 89.1 | 0.84 | -4.0e-06 | 90.8 |
| 3 | 72.1 | 1290 | 431 | 349.3 | 349.3 | 0.81 | -4.8e-06 | 351.9 |
| 3 | 76.1 | 1334 | 259 | 219.8 | 219.8 | 0.85 | 2.5e-06 | 222.1 |
| 3 | 74 | 1366 | 194 | 170.2 | 170.2 | 0.88 | 1.8e-06 | 172.2 |
| 3 | 76.5 | 1408 | 124 | 111.4 | 111.4 | 0.90 | -3.2e-06 | 112.9 |
| 3 | 75.7 | 1466 | 74 | 66.8 | 66.8 | 0.90 | -1.9e-06 | 68.0 |
| 3 | 92 | 1227 | 504 (d) | 384.8 | 384.8 | 0.76 | -3.2e-05 | 387.9 |
| 3 | 86.9 | 1273 | 445 (d) | 306.9 | 306.9 | 0.69 | 8.8e-07 | 309.2 |
| 3 | 84.1 | 1316 | 330 (d) | 225.9 | 225.9 | 0.68 | -2.1e-06 | 227.9 |
| 3 | 85 | 1390 | 152 (d) | 115.4 | 115.4 | 0.76 | -9.3e-06 | 117.0 |
| 3 | 84.4 | 1437 | 80 (d) | 76.4 | 76.4 | 0.96 | -2.7e-06 | 77.6 |
| 3 | 113 | 1149 | 533 (d) | 386.4 | 386.4 | 0.72 | -2.0e-05 | 389.3 |
| 3 | 116.8 | 1238 | 282 (d) | 241.4 | 241.4 | 0.86 | 2.1e-06 | 243.3 |
| 3 | 103.1 | 1286 | 233 (d) | 215.0 | 215.0 | 0.92 | 3.3e-06 | 217.0 |
| 3 | 117.4 | 1323 | 155 (d) | 133.7 | 133.7 | 0.86 | -9.9e-06 | 135.2 |
| 3 | 145 | 1186 | 261 (d) | 210.8 | 210.8 | 0.81 | -3.8e-05 | 212.9 |
| 3 | 139.6 | 1216 | 227 (d) | 197.7 | 197.7 | 0.87 | -1.5e-05 | 199.4 |
| 3 | 148.2 | 1293 | 130 (d) | 116.7 | 116.7 | 0.90 | -1.2e-06 | 117.9 |
| 3 | 134.9 | 1317 | 135 (d) | 114.2 | 114.2 | 0.85 | -5.1e-07 | 115.4 |
| 4 | 51.5 | 1191 | 847 | 752.8 | 752.7 | 0.89 | 5.3e-06 | 758.2 |
| 4 | 46.6 | 1265 | 530 | 517.8 | 517.8 | 0.98 | -1.5e-06 | 521.9 |
| 4 | 44.9 | 1362 | 221 | 223.6 | 223.6 | 1.01 | -9.8e-08 | 226.5 |
| 4 | 71.3 | 1215 | 411 (d) | 377.7 | 377.7 | 0.92 | 1.5e-06 | 381.0 |
| 4 | 64.3 | 1283 | 288 (d) | 281.4 | 281.4 | 0.98 | 2.0e-07 | 284.3 |
| 4 | 60.4 | 1346 | 190 (d) | 179.4 | 179.4 | 0.94 | -7.5e-07 | 181.8 |
| 4 | 125.5 | 1089 | 331 | 309.9 | 309.9 | 0.94 | -8.1e-06 | 312.6 |
| 4 | 128 | 1156 | 231 | 182.0 | 182.0 | 0.79 | 4.1e-06 | 184.2 |
| 5 | 55.3 | 1196 | 738 | 606.4 | 606.4 | 0.82 | 5.7e-06 | 608.8 |
| 5 | 54.4 | 1258 | 453 | 404.4 | 404.4 | 0.89 | -5.5e-06 | 406.2 |
| 5 | 59.6 | 1371 | 151 | 132.5 | 132.5 | 0.88 | -4.9e-06 | 133.5 |
| 5 | 86.6 | 1242 | 228 | 217.5 | 217.5 | 0.95 | -4.5e-06 | 218.6 |
| 5 | 82.8 | 1272 | 200 | 192.6 | 192.6 | 0.96 | -9.1e-06 | 193.7 |
| 5 | 128.4 | 1041 | 433 (d) | 505.5 | 505.5 | 1.17 | -1.2e-06 | 506.9 |
| 5 | 139.9 | 1138 | 194 (d) | 170.3 | 170.3 | 0.88 | 6.8e-06 | 171.3 |
| 5 | 138.5 | 1186 | 182 (d) | 128.9 | 128.9 | 0.71 | -6.7e-06 | 129.7 |
| 5 | 122.8 | 1249 | 142 (d) | 115.7 | 115.7 | 0.81 | -1.6e-05 | 116.5 |
| 5 | 133 | 1250 | 118 (d) | 100.4 | 100.4 | 0.85 | -3.4e-06 | 101.1 |
| 5 | 136 | 1304 | 89 (d) | 71.1 | 71.1 | 0.80 | -1.9e-06 | 71.6 |
| 5 | 129.7 | 1327 | 81 (d) | 65.7 | 65.7 | 0.81 | -9.0e-06 | 66.3 |
| 5 | 176.6 | 1150 | 120 | 110.5 | 110.5 | 0.92 | -2.8e-05 | 111.3 |
| 5 | 188.7 | 1230 | 71 | 61.1 | 61.1 | 0.86 | 3.7e-06 | 61.6 |
| 5 | 194 | 1235 | 67 | 56.8 | 56.8 | 0.85 | 3.9e-06 | 57.3 |
| 5 | 169.7 | 1268 | 72 | 60.4 | 60.4 | 0.84 | 1.9e-06 | 60.8 |
| 6 | 20.3 | 1453 | 466 (g) | 222.2 | 222.2 | 0.48 | -1.5e-06 | 245.6 |
| 6 | 13.8 | 1520 | 420 (g) | 166.6 | 166.6 | 0.40 | 4.7e-07 | 192.0 |
| 6 | 18.6 | 1523 | 333 (g) | 121.9 | 121.9 | 0.37 | -6.8e-08 | 140.5 |
| 6 | 13.8 | 1529 | 391 (g) | 152.6 | 152.6 | 0.39 | -3.1e-07 | 176.9 |
| 6 | 15.2 | 1548 | 345 (g) | 116.0 | 116.0 | 0.34 | 2.3e-07 | 136.3 |
| 6 | 12 | 1607 | 265 (g) | 82.3 | 82.3 | 0.31 | -1.9e-09 | 101.4 |
| 6 | 57.2 | 1456 | 86 | 70.5 | 70.5 | 0.82 | 1.5e-06 | 77.6 |
| 6 | 51.2 | 1547 | 58 | 35.1 | 35.1 | 0.61 | -3.6e-07 | 40.7 |
| 6 | 79 | 1324 | 185 | 145.1 | 145.1 | 0.78 | -2.0e-06 | 153.1 |
| 6 | 72.8 | 1367 | 135 | 115.1 | 115.1 | 0.85 | 3.0e-09 | 122.6 |
| 6 | 68.4 | 1395 | 111 | 98.0 | 98.0 | 0.88 | 1.1e-06 | 105.3 |
| 6 | 90.7 | 1128 | 332 | 288.5 | 288.5 | 0.87 | -4.9e-06 | 302.7 |
| 6 | 91.3 | 1203 | 315 | 217.8 | 217.8 | 0.69 | -1.1e-05 | 228.4 |
| 6 | 81.6 | 1290 | 249 | 175.8 | 175.8 | 0.71 | -2.3e-06 | 184.6 |
| 7 | 35.5 | 1272 | 875 | 1331.1 | 1331.1 | 1.52 | 1.2e-06 | 1343.7 |
| 7 | 29.5 | 1338 | 591 | 830.7 | 830.7 | 1.41 | -6.5e-07 | 841.0 |
| 7 | 28.9 | 1398 | 418 | 457.3 | 457.3 | 1.09 | -2.5e-06 | 465.2 |
| 7 | 27 | 1458 | 260 | 269.6 | 269.6 | 1.04 | -1.4e-06 | 276.0 |
| 7 | 49.5 | 1342 | 379 | 441.5 | 441.5 | 1.16 | -3.3e-06 | 448.1 |
| 7 | 47.1 | 1469 | 149 | 137.2 | 137.2 | 0.92 | -2.5e-06 | 141.1 |
| 7 | 57.2 | 1296 | 529 | 576.4 | 576.4 | 1.09 | 4.3e-07 | 583.6 |
| 7 | 61.5 | 1366 | 181 (d) | 270.4 | 270.4 | 1.49 | -9.0e-07 | 275.3 |
| 7 | 60.5 | 1391 | 152 (d) | 217.3 | 217.3 | 1.43 | -1.7e-06 | 221.7 |
| 7 | 76.4 | 1347 | 233 | 247.7 | 247.7 | 1.06 | -4.3e-06 | 252.1 |
| 7 | 92.5 | 1340 | 128 | 206.3 | 206.3 | 1.61 | -1.7e-06 | 210.0 |
| 7 | 106.6 | 1358 | 111 | 146.2 | 146.2 | 1.32 | -1.9e-06 | 149.2 |

| mixture | points | mean ln(model/measured) | geometric mean ratio | scatter (sd of ln) | max abs ln |
|---|---|---|---|---|---|
| 1 | 16 | +0.279 | 1.32 | 0.146 | 0.576 |
| 2 | 23 | -0.032 | 0.97 | 0.082 | 0.171 |
| 3 | 28 | -0.171 | 0.84 | 0.090 | 0.379 |
| 4 | 8 | -0.075 | 0.93 | 0.077 | 0.238 |
| 5 | 16 | -0.139 | 0.87 | 0.108 | 0.345 |
| 6 | 14 | -0.568 | 0.57 | 0.392 | 1.169 |
| 7 | 12 | +0.218 | 1.24 | 0.182 | 0.477 |
| all | 117 | -0.079 | 0.92 | 0.295 | 1.169 |
| all but HeNe extinction (g) | 111 | -0.030 | 0.97 | 0.210 | 0.576 |

Choupo against Cantera on the same definition: worst |tau_C/tau_K - 1| = 3.8e-05 over 117 points.

Reading the table.  Choupo and Cantera agree on every point to 3.8e-5 (the model, not the code, is
what differs from the measurement).  Over the 111 points measured by pressure, the model is 3 %
faster than the measurement on the geometric mean, scatter 0.21 in ln tau (a factor 1.23).  By
mixture: the stoichiometric-diluent baseline mixtures 2 (N2) and 4 are within 3-7 %, the argon
mixtures 3 and 5 13-16 % fast, the lean mixture 1 (phi = 0.4, argon) 32 % SLOW -- most at its
lowest temperatures (x1.78 at 1203 K) -- and mixture 7 (N2/He) 24 % slow.  Mixture 6 (6CH4 + 2O2 +
4He, phi = 6) is the outlier: its six HeNe-extinction points (g, 12-20 atm, 1453-1607 K) read
0.31-0.48, which is expected of a diagnostic that sees soot (the extinction of a laser by
particles, p. 83) rather than the pressure rise the model defines -- they are a different
quantity, kept in the table and in the 117-point row, separated in the last row; its eight
pressure points read 0.61-0.88 (mean 0.77).

**Stated limitations.**  (1) The ideal-gas reactor at 35-260 atm: Petersen et al. state (p. 84)
that a Peng-Robinson treatment moved T5 by at most 3 K and P5 by 1.5 atm at 260 atm, 1300 K,
against the ideal gas; neither code here carries a real-gas reactor, so that much is outside the
model.  (2) The PLOG tables of AramcoMech end at 100 atm (the end value is used above it, by both
codes).  (3) No facility effect (the slow rise of T5 and P5 over the induction, up to ~15 K
average, p. 84) is modelled.  (4) The measured uncertainty is +-10 us in tau (p. 85) and ~5 K in
T5 (p. 84).

**What Metcalfe et al. 2013 say about this data.**  The paper does not cite Petersen, Davidson &
Hanson 1999.  Its Table I (p. 640) gives the shock-tube validation range of the mechanism as
833-2500 K, 0.65-260 atm, phi 0.06-6.0 -- the upper limits are those of this dataset (mixture 2
at 260 atm, mixture 6 at phi = 6) -- with the comparisons in the Supporting Information, which was
not available here; their shock-tube simulations are "zero-dimensional ... Constant volume and
homogeneous, adiabatic", with "the simulated ignition delay time ... defined to be consistent with
the particular diagnostic used" (p. 640), which is what was done above.  They also note (p. 640)
that Chemkin Pro needs ~1 ppb of argon for H + O2 (+Ar) <=> HO2 (+Ar) to converge when argon is
absent; Choupo and Cantera need none ([M] = c_AR = 0 gives k = 0).  So no published statement of
the mechanism's agreement with these 117 points was found to compare the scatter against.

## 5. Findings and what remains

1. The four forms read as Cantera reads them: forward rates equal to the gas-constant digits,
   AramcoMech trajectories equal to ~1e-5 in tau and 0.0004 K in T_final.
2. A 3.5e-6 relative difference in K_c on the six-species fixture, common to every reversible
   reaction there whatever its form: the thermochemistry path, not chased here.  (On the
   AramcoMech runs it is invisible at 0.0004 K.)
3. FORD orders whose sum is not an integer are refused (the engine converts a cm A only for an
   integer molecularity; `check_vessel_kinetic_orders` pins that refusal); Cantera converts by the
   real sum.  A global mechanism such as Jones-Lindstedt (CH4^0.5 O2^1.25) would need it.
4. Not verified here: a real ~1000-species mechanism; SRI and FORD on a real mechanism (AramcoMech
   has neither); both-sides species and single colliders in `dynamicCSTR`; the ideal-gas limit at
   the high-pressure points.

## Files

- `petersen1999_table2.tsv` -- the 117 measured points, with page numbers and footnote marks.
- `phaseB.jsonl`, `petersen.jsonl` -- the run records (our numbers only).
- `scripts/ignition.py` (the tau definitions), `ct_run.py` (Cantera on a grid), `run_pair.py`
  (one condition in both codes), `petersen_runs.py` (Table 2), `fixture_forms.py` (the four
  forms on a numerical fixture), `summarise.py` (the tables above).
