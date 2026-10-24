# Benchmark D -- methanol from CO2, the full plant as the reference sample ships it

**Sample:** "Methanol Synthesis by CO2 Hydrogenation" (`PlatformFiles/Common/
samples/Methanol Synthesis by CO2 Hydrogenation.dwxmz`) of the reference
simulator, DWSIM, read at commit `1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766`
(GPL-3.0); the file says `BuildVersion 6.5.2.0`, `SavedOn 2021-05-28`.  Its
stored state is in `reference` (written by `read_sample.py`); no file of
theirs is copied and no parameter of their property package is read.

**What it is:** a hydrogen feed (with 3.7 % water, 3.2 % CO2, 3.3 % CO) and a
CO2 feed (with 11 % argon, 5 % H2, 4 % CO), the CO2 compressed in four
stages with three water intercoolers, the hydrogen in one, mixed, mixed
again with the recycle, reacted in a 20 m3 packed PFR on Vanden Bussche &
Froment's (1996) kinetics, the effluent heating the recycle in a
feed/effluent exchanger, condensed to a vapour fraction of 0.9 against
cooling water, separated at 73 bar, the vapour purged (44 %) and recycled
(56 %), the liquid let down to 10 bar and to 1 atm, vented in a flash,
pumped to a methanol/water shortcut column and its distillate to a second
one.  Every unit of the sample is bound to its Peng-Robinson package.

## How this case is built

* **Thermodynamics:** phi-phi PR78 (`PengRobinson`; methanol, omega 0.565,
  is on the 1978 branch and the run announces it).  The fifteen GAS PAIRS
  (H2, CO2, CO, water, N2, Ar) come from E-PPR78 (Xu, Lasala, Privat &
  Jaubert, Int. J. Greenh. Gas Control 56 (2017) 126, DOI
  10.1016/j.ijggc.2016.11.015; `constant/parameters/PPR78/xu2017.dat`, 21
  pairs transcribed and checked, with Table 2's data windows), evaluated
  ONCE at **510.15 K** -- the one temperature any unit of this plant
  declares (the reactor's) -- by `kijTables/` and written as the set
  `constant/parameters/PengRobinson/eppr78_510.15K.dat` (route P).  **Stated
  default:** every unit reads that set; eleven of the fifteen pairs are
  EXTRAPOLATED in T beyond the data their parameters were fitted on (H2+CO
  to 125 K, H2+CO2 to 303 K, CO+water to 478 K; only the water pairs with
  H2, CO2, N2 and Ar were fitted up to ~700 K) -- the set marks each, and
  every run repeats it with the window.
* **The methanol pairs** (H2-, CO-, CO2-methanol) are **Choupo's own
  regression** to Brunner, Hultenschmidt & Schlichtharle, J. Chem.
  Thermodyn. 19 (1987) 273 -- PPR78 has no methanol group.  `kijFits/`
  fits a constant kij per pair to the liquid-branch bubble pressures
  (`constant/experiments/`, transcribed and checked) inside a declared
  window -- REVISED once, after the first run, and the revision is recorded
  with its reason in `kijFits/system/propsDict` and in each dataset's
  `selection`: T <= 0.9 Tc(methanol), the methanol-rich branch x_gas <= 0.5,
  p <= 0.75 of the measured mixture critical pressure where the authors
  print one, p <= 20 MPa -- with the `P_bubble` residual built for
  this (relative, DEV.md 4c C123), the **373.15 K isotherm held out** for
  every gas (the isotherm nearest the separator's 360 K), a **band of 5 %**
  declared before the fit with its origin, and the verdict written into
  each pair record.  Whatever the verdict, the pair is used case-locally
  and announced (Vitor: "sim a tudo").  **The verdicts, measured 2026-10-21** (each record under
  `constant/parameters/PengRobinson/` carries its evidence, band and
  verdict; t95 intervals from the identifiability pass):

  | pair | kij | fitted on | held out | held-out AAD | band | verdict |
  |---|---|---|---|---|---|---|
  | H2-methanol | -0.2046 +/- 0.0578 | 298, 323 K (6 points) | 373.15 K | 30.82 % of p | 5 % | notValidated |
  | CO-methanol | -0.1745 +/- 0.0265 | 298, 323, 398, 423, 448 K (15) | 373.15 K | 21.37 % | 5 % | notValidated |
  | CO2-methanol | 0.0601 +/- 0.0071 | 298, 323, 423 K (21) | 373.15 K | 20.04 % | 5 % | notValidated |
  | methanol-water | -0.0760 +/- 0.0039 | 15-95 kPa isobars | 101.32 kPa | 0.21 % of T (0.75 K) | 0.55 % | validated |

  Every gas pair MISSED its band, and the parity tables say why rather
  than noise: on each gas the residual changes SIGN between isotherms (CO:
  +6 to +12 % at 298 K, -4 to -6 % at 323 K, -23 to -29 % from 398 K up),
  so one CONSTANT kij is a compromise between isotherms and the held-out
  one sits on the wrong side of it.  The data want a kij(T), which route P
  does not provide.  The pairs are used anyway, case-locally, and every run
  announces each as an unvalidated record.  Methanol-water was added after
  the plant's first run: at kij = 0, PR78 bends the methanol-water bubble
  curve through a minimum at 1 atm (340.0 K at x = 0.13, 341.8 K at
  x = 0.37) and the first column refused (R_min 5.22 against the sample's
  reflux 1.5); the two series and their partition are curate04's.
* **Methanol-water** is Choupo's own regression too (`kijFits/`, the fourth
  fit): two MEASURED isobaric series the corpus already carries
  (curate04's, located through ThermoML), partitioned as curate04
  partitions them, band 0.55 % of T declared before the fit by curate04's
  rule.  Added after the plant's first run: at kij = 0 the first column
  refused (R_min 5.22 against the sample's reflux 1.5).
* **Every other pair is kij = 0, announced:** methanol-N2, methanol-Ar,
  methanol-O2 and the six O2 pairs.  No primary source for them was read
  (the 2017 table's O2 pairs were outside the transcription); O2 and N2
  are each <= 1e-4 of either feed.
* **Kinetics:** Vanden Bussche & Froment, J. Catal. 161 (1996) 1, written
  in `constant/reactions` as `type expression` with every parameter cited
  to Table 2 (pressures in bar, rates per kg of catalyst), K1* and K3* as
  the article prints them after Graaf et al. (1986), the fitted window
  (180-280 C, 15-51 bar) declared and announced: this reactor is inside the
  T window and above the P window.
* **Workarounds** (each stated in `system/flowsheetDict`):
  1. the sample's PFR runs in its "outlet temperature" mode (489.0 K in,
     510.15 K out); Vitor's decision: ISOTHERMAL at 510.15 K.  Choupo's
     `pfr` reads its isothermal T from its feed, so the reactor-feed mixer
     declares 510.15 K (its isothermal form, duty published) and the
     reactor's duty is the isothermal heat of reaction; their sum is
     compared with the sample's reactor duty;
  2. the sample's effluent condenser is specified by the hot outlet's
     vapour fraction (0.9); Choupo's `phaseChanger` with `outletQuality
     0.9` lands it, the cooling-water side is not modelled, the duty is
     compared;
  3. the sample's recycle compressor COMP-054 (7299999.99996 -> 7300000 Pa,
     stored work -0.00122 kW) does no work but FIXES THE LOOP PRESSURE at
     73 bar (the sample's mixers take the minimum inlet pressure, so the
     78 bar make-up meets the loop at 73 bar); a Choupo compressor refuses
     P_out <= P_in, so a valve V54 to 73 bar stands in its place.  A first
     mapping that called it a no-op ran the loop at 78 bar -- measured,
     +14 % methanol at the reactor outlet;
  4. the sample's VALV-083 (101325 -> 101325 Pa) is a no-op and is omitted;
  5. Choupo's `shortcutColumn` runs at its feed's pressure; the sample's
     pump discharges at 2 bar into a column at 1 atm, so a let-down valve
     sits between pump and column;
  6. the sample fixes each shortcut column by the light key's mole
     fraction in the bottoms and the heavy key's in the distillate (0.01 /
     0.01 and 0.1 / 0.001); Choupo's takes recoveries, which are the
     sample's own stored product balances: COL85 LK 0.986955 (1.229284 of
     1.245532 mol/s), HK 0.007702 (0.012430 of 1.613849); COL78 LK 0.998967,
     HK 0.098992;
  7. the hydrogen feed is stored two-phase (vapour fraction 0.9656) and the
     sample's compressor ignores the phase; a Choupo compressor REFUSES
     liquid in its suction (2026-10-21, DEV.md 4c), so a knock-out drum
     KO5 -- NOT in the sample -- separates the feed at its own (T, P), its
     vapour to C5 and its condensed water out as `koWater`.  This departure
     moves every number downstream of the make-up (findings below).
  8. STAGE COUNTS: the reference counts its condenser as stage 1, so a
     rigorous reference column maps to `nStages - 1` in Choupo (DEV.md 4c
     C123, G28's finding on case B).  Both columns here are SHORTCUT
     columns on both sides -- N is a RESULT of Fenske-Underwood-Gilliland,
     not an input -- so no stage count is mapped; the N the two programs
     publish are compared as they are, and whether the sample's N includes
     its condenser is not stated by the sample.
  9. the recycle TEARS are authored seeds (`0/s40`, `0/s43`: the make-up's
     composition, round flows and temperatures, never the sample's loop);
  10. the bed integrates in 5000 RK4 steps (200 overshot CO2 to zero on the
     first pass, where the rate law has no value).

## Findings on the reference side (stated neutrally, from `reference`)

* **A 184.69 K distillate.**  MSTR-070, the first column's distillate
  (98.9 % methanol, 1 % water, 9.3e-4 CO2 at 1 atm), is stored at 184.69 K;
  methanol's normal boiling point is 337.7 K.  The second column's
  distillate (99.8 % methanol) is stored at 332.81 K.
* **Exchanger efficiencies above 100 %.**  The intercoolers HE-012 and
  HE-019 store `ThermalEfficiency` 100.004 % and 100.002 % (their duty
  9.35404 kW against their own `MaxHeatExchange` 9.35364 kW); HE-026 stores
  99.9994 %.
* **One adsorption constant spelled two ways.**  The methanol-synthesis
  denominator carries the ratio group as 3453.38 and the RWGS denominator
  as 3454.38 (Table 2 of the article: 3453.38).
* **The kinetics differ from the article in three more places**
  (`constant/reactions` header): the methanol numerator's exponent is
  40000/RT where Table 2 prints B = 36696; the RWGS rate constant's is
  -98084/RT, which is the LOWER 95 % bound of Table 1 (Table 2: -94765);
  and the methanol denominator closes a parenthesis before sqrt(p_H2) --
  `(1 + a p_H2O/p_H2 + sqrt(K_H2)) sqrt(p_H2) + K_H2O p_H2O` -- where eq. [3]
  reads `1 + a p_H2O/p_H2 + sqrt(K_H2 p_H2) + K_H2O p_H2O`.  The sample
  carries six reaction definitions in six sets ("Original", "Aspen",
  equilibrium, two mixed); its PFR runs the "Original set".
* **A compressor with negative work**: COMP-054 (above).
* **The reactor outlet is 16.6 % from methanol-synthesis equilibrium** (1 -
  Q/K = 0.166 with the article's K1* on ideal partial pressures, the drive
  its own rate law carries) at its stored 73 bar and 510.15 K.
* **The second column's stored N_min, 4.55, implies a mean methanol/water
  volatility of 7.35** at the recoveries its own products carry (Fenske);
  a measured 1 atm series gives 2.43 at 97 % methanol (Choupo's findings).
* **The hydrogen compressor's stored outlet (512.88 K) is below an
  isentropic outlet** for its ratio (Choupo: 520.90 K at 7.26) while its
  stored work implies 75 % efficiency (Choupo's findings).
* **The hydrogen feed is two-phase at the compressor** (above).
* **The recycle blocks:** REC-050 converged after 10 iterations, REC-059
  after 1.
* The sample stores no enthalpy per stream (`H_kW None` throughout), so no
  first law can be read off its state; `compare.py` prints its flow
  balance.

## Comparison

Run `python3 -I benchmarks/dwsim/compare.py methanol01_co2_hydrogenation`
(needs `make all`; the three fits take a few minutes).

Measured 2026-10-24 (re-measured after the knock-out drum KO5, workaround 7):

```
Benchmark D -- methanol from CO2, the plant as the reference sample ships it (PR78 + E-PPR78 + fitted methanol pairs)
---------------------------------------------------------------------------------------------------------------------
                                                                              reference        Choupo  Choupo - ref         rel %
H2 compressed s6  F [mol/s]                                                     16.3218       15.7595       -0.5623       -3.4452
H2 compressed s6  T [K]                                                        512.8782      596.1777       83.2995       16.2416
H2 compressed s6  vapour fraction                                                1.0000        1.0000             0             0
CO2 compressed s31  F [mol/s]                                                    2.0417        2.0417   -4.3615e-10   -2.1363e-08
CO2 compressed s31  T [K]                                                      425.5632      436.5762       11.0130        2.5879
CO2 compressed s31  vapour fraction                                              1.0000        1.0000             0             0
make-up s33  F [mol/s]                                                          18.3635       17.8012       -0.5623       -3.0622
make-up s33  T [K]                                                             498.0680      568.7016       70.6336       14.1815
make-up s33  vapour fraction                                                     1.0000        1.0000             0             0
reactor feed s40  F [mol/s]                                                     33.8640       32.1498       -1.7143       -5.0622
reactor feed s40  T [K]                                                        489.0078      510.1500       21.1422        4.3235
reactor feed s40  vapour fraction                                                1.0000        1.0000             0             0
reactor outlet  F [mol/s]                                                       30.5938       28.4694       -2.1243       -6.9436
reactor outlet  T [K]                                                          510.1500      510.1500    1.9895e-12    3.8999e-13
reactor outlet  vapour fraction                                                  1.0000        1.0000             0             0
reactor outlet  x_methanol                                                       0.0651        0.0793        0.0142       21.8369
reactor outlet  x_water                                                          0.0606        0.0517       -0.0089      -14.6348
reactor outlet  x_H2                                                             0.7636        0.7672        0.0036        0.4733
reactor outlet  x_CO2                                                            0.0761        0.0651       -0.0110      -14.4222
reactor outlet  x_CO                                                             0.0088        0.0089    9.0810e-05        1.0286
reactor outlet  x_Ar                                                             0.0256        0.0275        0.0019        7.4394
after feed/effluent HX s42  F [mol/s]                                           30.5938       28.4694       -2.1243       -6.9436
after feed/effluent HX s42  T [K]                                              454.2682      454.9444        0.6761        0.1488
after feed/effluent HX s42  vapour fraction                                      1.0000        1.0000             0             0
condenser outlet s46  F [mol/s]                                                 30.5938       28.4694       -2.1243       -6.9436
condenser outlet s46  T [K]                                                    360.2376      362.3509        2.1134        0.5867
condenser outlet s46  vapour fraction                                            0.9000        0.9000   -7.5027e-06   -8.3363e-04
HP separator vapour  F [mol/s]                                                  27.5346       25.6225       -1.9121       -6.9444
HP separator vapour  T [K]                                                     360.2376      362.3509        2.1134        0.5867
HP separator vapour  vapour fraction                                             1.0000        1.0000             0             0
after V54 (COMP-054) s55  F [mol/s]                                             27.5346       25.6225       -1.9121       -6.9444
after V54 (COMP-054) s55  T [K]                                                360.2374      362.3509        2.1136        0.5867
after V54 (COMP-054) s55  vapour fraction                                        1.0000        1.0000    1.0582e-06    1.0582e-04
HP separator liquid  F [mol/s]                                                   3.0591        2.8469       -0.2122       -6.9367
HP separator liquid  T [K]                                                     360.2376      362.3509        2.1134        0.5867
HP separator liquid  x_methanol                                                  0.4458        0.5316        0.0858       19.2580
HP separator liquid  x_water                                                     0.5398        0.4576       -0.0822      -15.2300
HP separator liquid  x_H2                                                        0.0028        0.0039        0.0011       39.4854
HP separator liquid  x_CO2                                                       0.0113        0.0065       -0.0048      -42.7333
HP separator liquid  x_CO                                                    3.0311e-05    6.1855e-05    3.1544e-05      104.0692
HP separator liquid  x_Ar                                                    3.0734e-04    3.5959e-04    5.2256e-05       17.0030
purge  F [mol/s]                                                                12.1795       11.2739       -0.9056       -7.4356
purge  T [K]                                                                   360.3004      362.3509        2.0505        0.5691
purge  vapour fraction                                                           1.0000        1.0000    1.0479e-06    1.0479e-04
purge  x_methanol                                                                0.0229        0.0291        0.0062       27.0456
purge  x_water                                                                   0.0074        0.0066   -7.3398e-04       -9.9704
purge  x_H2                                                                      0.8474        0.8521        0.0046        0.5460
purge  x_CO2                                                                     0.0840        0.0716       -0.0124      -14.7268
purge  x_CO                                                                      0.0099        0.0099    1.4821e-05        0.1499
purge  x_Ar                                                                      0.0283        0.0305        0.0023        7.9926
recycle s43  F [mol/s]                                                          15.5012       14.3486       -1.1526       -7.4356
recycle s43  T [K]                                                             360.3004      362.3509        2.0505        0.5691
recycle s43  vapour fraction                                                     1.0000        1.0000    1.0479e-06    1.0479e-04
recycle heated s44  F [mol/s]                                                   15.5012       14.3486       -1.1526       -7.4356
recycle heated s44  T [K]                                                      478.2962      480.5269        2.2307        0.4664
recycle heated s44  vapour fraction                                              1.0000        1.0000             0             0
vent  F [mol/s]                                                                  0.1986        0.1532       -0.0454      -22.8579
vent  T [K]                                                                    342.0700      341.0908       -0.9792       -0.2863
vent  vapour fraction                                                            1.0000        1.0000             0             0
vent  x_methanol                                                                 0.5949        0.6421        0.0471        7.9221
vent  x_water                                                                    0.1887        0.1604       -0.0283      -14.9803
vent  x_H2                                                                       0.0431        0.0724        0.0294       68.2188
vent  x_CO2                                                                      0.1681        0.1172       -0.0509      -30.2718
vent  x_CO                                                                   4.6668e-04        0.0011    6.8141e-04      146.0113
vent  x_Ar                                                                       0.0047        0.0067        0.0019       41.0775
column feed liquid s64  F [mol/s]                                                2.8605        2.6937       -0.1668       -5.8313
column feed liquid s64  T [K]                                                  342.0700      341.0908       -0.9792       -0.2863
column feed liquid s64  x_methanol                                               0.4354        0.5253        0.0899       20.6518
column feed liquid s64  x_water                                                  0.5642        0.4745       -0.0897      -15.8970
column feed liquid s64  x_H2                                                 1.3145e-06    3.0854e-06    1.7709e-06      134.7238
column feed liquid s64  x_CO2                                                4.0387e-04    1.6706e-04   -2.3681e-04      -58.6353
column feed liquid s64  x_CO                                                 1.3911e-08    7.3551e-08    5.9640e-08      428.7182
column feed liquid s64  x_Ar                                                 5.8571e-07    8.6902e-07    2.8331e-07       48.3703
COL85 distillate s70  F [mol/s]                                                  1.2429        1.4070        0.1640       13.1963
COL85 distillate s70  T [K]                                                    184.6920      341.0914      156.3995       84.6812
water product  F [mol/s]                                                         1.6175        1.2868       -0.3308      -20.4483
water product  T [K]                                                           369.5383      341.0914      -28.4469       -7.6980
water product  x_methanol                                                        0.0100        0.0143        0.0043       43.4631
water product  x_water                                                           0.9900        0.9857       -0.0044       -0.4436
water product  x_H2                                                          1.7486e-36             0   -1.7486e-36     -100.0000
water product  x_CO2                                                         9.3064e-22             0   -9.3064e-22     -100.0000
water product  x_CO                                                          1.4825e-38             0   -1.4825e-38     -100.0000
water product  x_Ar                                                          6.4943e-33             0   -6.4943e-33     -100.0000
METHANOL PRODUCT  F [mol/s]                                                      1.2304        1.3967        0.1662       13.5103
METHANOL PRODUCT  T [K]                                                        332.8123      335.6902        2.8779        0.8647
METHANOL PRODUCT  vapour fraction                                            7.4809e-09             0   -7.4809e-09     -100.0000
METHANOL PRODUCT  x_methanol                                                     0.9980        0.9990    9.3171e-04        0.0934
METHANOL PRODUCT  x_water                                                        0.0010    6.9774e-04   -3.0226e-04      -30.2258
METHANOL PRODUCT  x_H2                                                       3.0558e-06    5.9509e-06    2.8951e-06       94.7428
METHANOL PRODUCT  x_CO2                                                      9.3885e-04    3.2220e-04   -6.1665e-04      -65.6811
METHANOL PRODUCT  x_CO                                                       3.2339e-08    1.4186e-07    1.0952e-07      338.6604
METHANOL PRODUCT  x_Ar                                                       1.3616e-06    1.6761e-06    3.1450e-07       23.0981
COL78 bottoms s80  F [mol/s]                                                     0.0125        0.0103       -0.0022      -17.5188
COL78 bottoms s80  T [K]                                                       360.3568      335.6902      -24.6666       -6.8450
COL78 bottoms s80  vapour fraction                                           1.4850e-04             0   -1.4850e-04     -100.0000
C5 H2 compressor [kW]                                                          129.7398      140.0004       10.2606        7.9086
C10 [kW]                                                                         8.7568        8.7549       -0.0018       -0.0209
C16 [kW]                                                                         8.4324        8.4623        0.0299        0.3547
C23 [kW]                                                                         8.4138        8.5202        0.1064        1.2642
C27 [kW]                                                                         7.8207        8.2012        0.3806        4.8664
HX12 duty [kW]                                                                   9.3540        9.2771       -0.0769       -0.8226
HX19 duty [kW]                                                                   8.8004        8.6579       -0.1425       -1.6194
HX26 duty [kW]                                                                   9.5905        9.0817       -0.5089       -5.3060
HX41 feed/effluent duty [kW]                                                    57.4173       52.8775       -4.5398       -7.9067
condenser PC45 duty [kW] (ref HE-045)                                         -205.7461     -188.8039       16.9421        8.2345
reactor duty [kW] (ref: outlet-T mode; Choupo: M39 heat + isothermal PFR)      -96.2826     -151.5602      -55.2776      -57.4119
   of which M39 (489 -> 510.15 K)                                                    --      -19.4701            --            --
   of which PFR (isothermal)                                                         --     -132.0901            --            --
pump P66 [kW]                                                                    0.0105        0.0106    7.6515e-05        0.7258
COL85 N (shortcut)                                                              10.5870       11.8706        1.2836       12.1245
COL85 N_min                                                                      6.4598        7.1479        0.6881       10.6516
COL85 R_min                                                                      0.6977        0.7022        0.0044        0.6375
COL78 N (shortcut)                                                               5.9499       13.4925        7.5426      126.7692
COL78 N_min                                                                      4.5542        9.2078        4.6537      102.1845
COL78 R_min                                                                      0.0574        0.4392        0.3818      665.0628
Every reference number is the sample's stored state; its reactor runs in outlet-T mode (489 -> 510.15 K).

Plant balances (each side on its own stored numbers)
  reference: feeds 18.363472 mol/s, products 15.238568 mol/s (-17.0170 %) -- a flow balance only; the sample stores no enthalpy per stream
             recycle block rEC050: converged true after 10.0 iteration(s)
             recycle block rEC059: converged true after 1.0 iteration(s)
  Choupo: first-law residual 0.6245 kW (energy exchanged (the larger of: sum of |declared duties and work|, and |Q boundary|)); converged True
```

## Findings on Choupo's side

RE-MEASURED 2026-10-24, after the knock-out drum KO5 (workaround 7).  The
drum is a DEPARTURE from the sample, and it moves this whole comparison:
it takes 0.5623 mol/s of condensed water (93 % of the feed's water) out of
the hydrogen before C5, water the sample's plant carries into its loop.
Everything downstream of the make-up therefore compares two plants with
different feeds, and the numbers below are read with that in mind.  The
figures of 2026-10-21, before the drum, are in git history.

* **Upstream of the make-up the two programs still solve the same
  problem.**  The CO2 train is untouched by the drum: the four CO2
  compressors agree within 0.02-4.9 %, the three intercooler duties within
  0.8-5.3 %.  The hydrogen to C5 is 0.5623 mol/s lighter (the drum's
  water), so the make-up s33 is 3.1 % below the sample's.
* **With less water in the loop, the bed makes more methanol and less
  water.**  The reactor outlet carries 0.0793 methanol against the sample's
  0.0651 (+21.8 %) and 0.0517 water against 0.0606 (-14.6 %), on a loop
  flow 6.9 % lower; the methanol product is 1.3967 against 1.2304 mol/s
  (+13.5 %) at 99.90 % against 99.80 % methanol, and the water product
  1.2868 against 1.6175 (-20.4 %).  Before the drum the product was 1.7 %
  BELOW the sample's: most of today's gap is the departure, not a model
  difference.  Whether the bed is still at equilibrium (1 - Q/K was 0.0008
  at Choupo's outlet before the drum, 0.166 at the sample's stored one)
  has NOT been re-measured.
* **The reactor duty differs by 57 %, and most of it is the boundary of
  the comparison, not the reaction.**  The sample's -96.28 kW is an
  outlet-T reactor's: it includes heating its 489 K feed to 510.15 K.
  Choupo's -151.56 kW is M39's -19.47 kW (its 569 K make-up -- see C5 --
  COOLED to the declared 510.15 K) plus the isothermal bed's -132.09 kW.
* **C5, the hydrogen compressor: 140.00 against 129.74 kW (+7.9 %), outlet
  596.2 against 512.9 K.**  Choupo's number is the compression of the
  drum's VAPOUR (isentropic outlet 522.3 K at a ratio of 7.26, work
  105.00 kW isentropic, / 0.75).  The sample's stored outlet, 512.9 K, is
  BELOW Choupo's isentropic outlet while its stored work implies 75 %
  efficiency -- consistent in size with the latent heat of the 3.4 %
  liquid water of its two-phase feed being paid inside the compressor
  (~24 kW), which is a reading of the numbers, not a fact the sample
  states.
* **The compressor refuses liquid in its suction (2026-10-21 decision,
  DEV.md 4c), which is why KO5 exists.**  Until then the unit computed the
  two-phase hydrogen feed as a vapour at its overall composition, in
  silence, and the energy report, which resolves the feed, found C5
  leaving 24.93 kW that no term accounted for -- the plant's whole
  first-law residual was -24.14 kW.  With the drum the plant closes at
  +0.62 kW (0.121 % of the energy it exchanges).
* **The separator runs 2.1 K hotter (362.35 against 360.24 K), because the
  vapour-fraction specification follows the composition:** with 13.1 %
  methanol and water in the effluent against 12.6 %, vf = 0.9 is reached
  at a higher T, so more methanol leaves in the purge (0.0291 against
  0.0229).
* **CO2 in the HP liquid is 0.0065 against the sample's 0.0113**, and lower
  in the vent and the products with it.  On a CO2-methanol kij whose
  held-out AAD is 20 % (notValidated), the comparison cannot say which is
  nearer the truth; it says the CO2 numbers downstream of the separator
  are the least certain of this case on both sides.
* **The shortcut columns publish both products at the FEED's bubble
  point** (src/unitOperations/distillation/ShortcutColumn.cpp, the streams
  block: `dist.T = Tref; bot.T = Tref`), so COL85's water product leaves at
  341.09 K (the sample: 369.54 K, the water's boiling point) and COL78's
  bottoms at 335.69 K (the sample: 360.36 K).  The method's "constant
  alpha at the feed bubble point" is stated; that the product temperatures
  are that one point too is not.
* **COL85 agrees (N_min 7.15 against 6.46, R_min 0.702 against 0.698, N
  11.87 against 10.59).  COL78 does not (N_min 9.21 against 4.55, R_min
  0.439 against 0.057), and the measurement sides with Choupo:** at the
  recoveries the sample's own products carry, Fenske gives its N_min only
  for a mean methanol/water volatility of 7.35; Choupo's at the feed bubble
  point was 2.67 before KO5 (not re-measured), and the measured held-out series (101.32 kPa) gives 2.43
  at x_methanol = 0.969 (y 0.987).
* **Workarounds this run added, each in the dict where it acts:** the
  recycle tears are AUTHORED seeds (0/s40, 0/s43: the make-up's composition,
  round flows and temperatures -- init0's propagated seed was 90 % water
  and the feed/effluent exchanger refused it); the bed integrates in 5000
  RK4 steps (200 overshot CO2 to zero near the inlet on the first pass,
  where the rate law has no value); the valve V54 in COMP-054's place
  WARNS on every pass that its outlet equals its inlet (true, and the
  point of it).
* **Engine defects found and fixed on the way** (each with a gate arm in
  bin/curate/check_ppr78_route.py): the `phaseChanger`'s vapour-fraction
  search was centred on the DOMINANT component's Antoine saturation T,
  which for a 73 % H2 effluent is no temperature at which anything
  condenses, and failed (arm h); the `fitParameters` identifiability
  Jacobian took a branch jump of the bubble pressure as a slope and printed
  sigma 0.0000 (arm g); `BubblePoint::pressure` read a one-root cubic at
  the 0.01 bar floor as "does not boil" (DEV.md 4c C123); and a pair record
  whose own verdict is `notValidated` is now said by every run that uses it
  (arm i).
* **Named, not fixed:** the multi-reaction `pfr` summary prints `F_out`
  1000 times too small (0.1089 "kmol/h" beside its own KPI
  F_out_kmol_h 108.87; PFR.cpp multiplies mol/s by 3.6/1000) and
  `tau = 0.00 s` for a gas-basis law beside its KPI tau_gas_s 1078 s.
