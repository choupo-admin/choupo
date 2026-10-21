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
     sample's compressor ignores the phase; Choupo's compressor computes on
     the vapour root of the overall composition, silently -- which the run
     shows is NOT the same reading (findings below: 24.93 kW at C5).
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

Measured 2026-10-21 on this branch:

```
Benchmark D -- methanol from CO2, the plant as the reference sample ships it (PR78 + E-PPR78 + fitted methanol pairs)
---------------------------------------------------------------------------------------------------------------------
                                                                              reference        Choupo  Choupo - ref         rel %
H2 compressed s6  F [mol/s]                                                     16.3218       16.3218    5.2701e-11    3.2289e-10
H2 compressed s6  T [K]                                                        512.8782      593.8761       80.9979       15.7928
H2 compressed s6  vapour fraction                                                1.0000        1.0000             0             0
CO2 compressed s31  F [mol/s]                                                    2.0417        2.0417   -4.3615e-10   -2.1363e-08
CO2 compressed s31  T [K]                                                      425.5632      436.5762       11.0130        2.5879
CO2 compressed s31  vapour fraction                                              1.0000        1.0000             0             0
make-up s33  F [mol/s]                                                          18.3635       18.3635   -3.3350e-10   -1.8161e-09
make-up s33  T [K]                                                             498.0680      567.9608       69.8928       14.0328
make-up s33  vapour fraction                                                     1.0000        1.0000             0             0
reactor feed s40  F [mol/s]                                                     33.8640       33.6047       -0.2593       -0.7658
reactor feed s40  T [K]                                                        489.0078      510.1500       21.1422        4.3235
reactor feed s40  vapour fraction                                                1.0000        1.0000             0             0
reactor outlet  F [mol/s]                                                       30.5938       30.2405       -0.3533       -1.1547
reactor outlet  T [K]                                                          510.1500      510.1500    1.9895e-12    3.8999e-13
reactor outlet  vapour fraction                                                  1.0000        1.0000             0             0
reactor outlet  x_methanol                                                       0.0651        0.0706        0.0055        8.3878
reactor outlet  x_water                                                          0.0606        0.0634        0.0028        4.5586
reactor outlet  x_H2                                                             0.7636        0.7583       -0.0053       -0.6913
reactor outlet  x_CO2                                                            0.0761        0.0735       -0.0026       -3.3545
reactor outlet  x_CO                                                             0.0088        0.0081   -6.9994e-04       -7.9285
reactor outlet  x_Ar                                                             0.0256        0.0259    3.0647e-04        1.1972
after feed/effluent HX s42  F [mol/s]                                           30.5938       30.2405       -0.3533       -1.1547
after feed/effluent HX s42  T [K]                                              454.2682      457.5850        3.3167        0.7301
after feed/effluent HX s42  vapour fraction                                      1.0000        1.0000             0             0
condenser outlet s46  F [mol/s]                                                 30.5938       30.2405       -0.3533       -1.1547
condenser outlet s46  T [K]                                                    360.2376      367.1976        6.9600        1.9321
condenser outlet s46  vapour fraction                                            0.9000        0.9000   -7.5025e-06   -8.3361e-04
HP separator vapour  F [mol/s]                                                  27.5346       27.2165       -0.3182       -1.1555
HP separator vapour  T [K]                                                     360.2376      367.1976        6.9600        1.9321
HP separator vapour  vapour fraction                                             1.0000        1.0000             0             0
after V54 (COMP-054) s55  F [mol/s]                                             27.5346       27.2165       -0.3182       -1.1555
after V54 (COMP-054) s55  T [K]                                                360.2374      367.1976        6.9602        1.9321
after V54 (COMP-054) s55  vapour fraction                                        1.0000        1.0000    1.0582e-06    1.0582e-04
HP separator liquid  F [mol/s]                                                   3.0591        3.0241       -0.0351       -1.1472
HP separator liquid  T [K]                                                     360.2376      367.1976        6.9600        1.9321
HP separator liquid  x_methanol                                                  0.4458        0.4397       -0.0061       -1.3648
HP separator liquid  x_water                                                     0.5398        0.5519        0.0121        2.2492
HP separator liquid  x_H2                                                        0.0028        0.0026   -1.5627e-04       -5.5870
HP separator liquid  x_CO2                                                       0.0113        0.0055       -0.0058      -51.7039
HP separator liquid  x_CO                                                    3.0311e-05    3.6052e-05    5.7409e-06       18.9403
HP separator liquid  x_Ar                                                    3.0734e-04    2.3769e-04   -6.9648e-05      -22.6618
purge  F [mol/s]                                                                12.1795       11.9752       -0.2043       -1.6772
purge  T [K]                                                                   360.3004      367.1976        6.8972        1.9143
purge  vapour fraction                                                           1.0000        1.0000    1.0479e-06    1.0479e-04
purge  x_methanol                                                                0.0229        0.0295        0.0067       29.1759
purge  x_water                                                                   0.0074        0.0091        0.0017       23.1474
purge  x_H2                                                                      0.8474        0.8423       -0.0051       -0.6036
purge  x_CO2                                                                     0.0840        0.0811       -0.0029       -3.4539
purge  x_CO                                                                      0.0099        0.0090   -8.6092e-04       -8.7065
purge  x_Ar                                                                      0.0283        0.0288    4.9681e-04        1.7580
recycle s43  F [mol/s]                                                          15.5012       15.2412       -0.2600       -1.6772
recycle s43  T [K]                                                             360.3004      367.1976        6.8972        1.9143
recycle s43  vapour fraction                                                     1.0000        1.0000    1.0479e-06    1.0479e-04
recycle heated s44  F [mol/s]                                                   15.5012       15.2412       -0.2600       -1.6772
recycle heated s44  T [K]                                                      478.2962      478.8625        0.5662        0.1184
recycle heated s44  vapour fraction                                              1.0000        1.0000             0             0
vent  F [mol/s]                                                                  0.1986        0.1638       -0.0348      -17.5255
vent  T [K]                                                                    342.0700      344.4775        2.4074        0.7038
vent  vapour fraction                                                            1.0000        1.0000             0             0
vent  x_methanol                                                                 0.5949        0.6358        0.0408        6.8636
vent  x_water                                                                    0.1887        0.2115        0.0228       12.0927
vent  x_H2                                                                       0.0431        0.0487        0.0057       13.1570
vent  x_CO2                                                                      0.1681        0.0989       -0.0692      -41.1592
vent  x_CO                                                                   4.6668e-04    6.6515e-04    1.9846e-04       42.5259
vent  x_Ar                                                                       0.0047        0.0044   -3.4390e-04       -7.2775
column feed liquid s64  F [mol/s]                                                2.8605        2.8603   -2.8908e-04       -0.0101
column feed liquid s64  T [K]                                                  342.0700      344.4775        2.4074        0.7038
column feed liquid s64  x_methanol                                               0.4354        0.4285       -0.0070       -1.5977
column feed liquid s64  x_water                                                  0.5642        0.5714        0.0073        1.2868
column feed liquid s64  x_H2                                                 1.3145e-06    1.3079e-06   -6.5969e-09       -0.5019
column feed liquid s64  x_CO2                                                4.0387e-04    1.0095e-04   -3.0292e-04      -75.0049
column feed liquid s64  x_CO                                                 1.3911e-08    2.4914e-08    1.1003e-08       79.0927
column feed liquid s64  x_Ar                                                 5.8571e-07    3.7360e-07   -2.1211e-07      -36.2141
COL85 distillate s70  F [mol/s]                                                  1.2429        1.2224       -0.0205       -1.6529
COL85 distillate s70  T [K]                                                    184.6920      344.4732      159.7812       86.5123
water product  F [mol/s]                                                         1.6175        1.6378        0.0203        1.2568
water product  T [K]                                                           369.5383      344.4732      -25.0652       -6.7828
water product  x_methanol                                                        0.0100        0.0098   -2.3918e-04       -2.3918
water product  x_water                                                           0.9900        0.9902    1.9378e-04        0.0196
water product  x_H2                                                          1.7486e-36             0   -1.7486e-36     -100.0000
water product  x_CO2                                                         9.3064e-22             0   -9.3064e-22     -100.0000
water product  x_CO                                                          1.4825e-38    7.8913e-24    7.8913e-24    5.3228e+16
water product  x_Ar                                                          6.4943e-33             0   -6.4943e-33     -100.0000
METHANOL PRODUCT  F [mol/s]                                                      1.2304        1.2098       -0.0206       -1.6753
METHANOL PRODUCT  T [K]                                                        332.8123      336.6193        3.8070        1.1439
METHANOL PRODUCT  vapour fraction                                            7.4809e-09             0   -7.4809e-09     -100.0000
METHANOL PRODUCT  x_methanol                                                     0.9980        0.9987    6.8669e-04        0.0688
METHANOL PRODUCT  x_water                                                        0.0010        0.0010    3.0048e-05        3.0048
METHANOL PRODUCT  x_H2                                                       3.0558e-06    3.0921e-06    3.6388e-08        1.1908
METHANOL PRODUCT  x_CO2                                                      9.3885e-04    2.3866e-04   -7.0019e-04      -74.5797
METHANOL PRODUCT  x_CO                                                       3.2339e-08    5.8902e-08    2.6563e-08       82.1394
METHANOL PRODUCT  x_Ar                                                       1.3616e-06    8.8327e-07   -4.7831e-07      -35.1290
COL78 bottoms s80  F [mol/s]                                                     0.0125        0.0126    8.8906e-05        0.7111
COL78 bottoms s80  T [K]                                                       360.3568      336.6193      -23.7375       -6.5872
COL78 bottoms s80  vapour fraction                                           1.4850e-04             0   -1.4850e-04     -100.0000
C5 H2 compressor [kW]                                                          129.7398      144.5379       14.7981       11.4060
C10 [kW]                                                                         8.7568        8.7549       -0.0018       -0.0209
C16 [kW]                                                                         8.4324        8.4623        0.0299        0.3547
C23 [kW]                                                                         8.4138        8.5202        0.1064        1.2642
C27 [kW]                                                                         7.8207        8.2012        0.3806        4.8664
HX12 duty [kW]                                                                   9.3540        9.2771       -0.0769       -0.8226
HX19 duty [kW]                                                                   8.8004        8.6579       -0.1425       -1.6194
HX26 duty [kW]                                                                   9.5905        9.0817       -0.5089       -5.3060
HX41 feed/effluent duty [kW]                                                    57.4173       53.4217       -3.9956       -6.9589
condenser PC45 duty [kW] (ref HE-045)                                         -205.7461     -200.1540        5.5921        2.7180
reactor duty [kW] (ref: outlet-T mode; Choupo: M39 heat + isothermal PFR)      -96.2826     -141.3223      -45.0398      -46.7787
   of which M39 (489 -> 510.15 K)                                                    --      -18.5509            --            --
   of which PFR (isothermal)                                                         --     -122.7714            --            --
pump P66 [kW]                                                                    0.0105        0.0104   -9.2790e-05       -0.8801
COL85 N (shortcut)                                                              10.5870       11.2624        0.6754        6.3793
COL85 N_min                                                                      6.4598        6.6151        0.1553        2.4043
COL85 R_min                                                                      0.6977        0.7434        0.0457        6.5528
COL78 N (shortcut)                                                               5.9499       13.5526        7.6027      127.7789
COL78 N_min                                                                      4.5542        9.2356        4.6814      102.7930
COL78 R_min                                                                      0.0574        0.4432        0.3858      671.9011
Every reference number is the sample's stored state; its reactor runs in outlet-T mode (489 -> 510.15 K).

Plant balances (each side on its own stored numbers)
  reference: feeds 18.363472 mol/s, products 15.238568 mol/s (-17.0170 %) -- a flow balance only; the sample stores no enthalpy per stream
             recycle block rEC050: converged true after 10.0 iteration(s)
             recycle block rEC059: converged true after 1.0 iteration(s)
  Choupo: first-law residual -24.1435 kW (energy exchanged (the larger of: sum of |declared duties and work|, and |Q boundary|)); converged True
```

## Findings on Choupo's side

* **The plant agrees to a few per cent where the two programs solve the
  same problem.**  Make-up flows are the sample's (to 1e-9); the loop
  flows are 0.8-1.7 % lower here, the methanol product 1.2098 against
  1.2304 mol/s (-1.7 %) at 99.87 % against 99.80 % methanol, the column
  feed 2.8603 against 2.8605 mol/s, the four CO2 compressors within 0.02-
  4.9 %, the three intercooler duties within 0.8-5.3 %, the condenser duty
  -200.15 against -205.75 kW (2.7 %).
* **The reactor outlet carries more methanol here (0.0706 against 0.0651,
  +8.4 %), and the cause is measured: the sample's bed is not at
  equilibrium and this one is.**  With the article's K1* (Graaf 1986) on
  ideal partial pressures -- the very drive term both rate laws use --
  1 - Q/K for methanol synthesis is 0.166 at the sample's stored outlet
  (73 bar, 510.15 K) and 0.0008 at Choupo's; the shift is at equilibrium in
  both (0.003, -6e-6).  Choupo's bed runs the article's kinetics (the
  sample's three changes are findings on its side) isothermally at
  510.15 K from its inlet, where the sample's heats from 489 K; the rate at
  Choupo's outlet is 4e-5 of its inlet rate.
* **The reactor duty differs by 47 %, and most of it is the boundary of
  the comparison, not the reaction.**  The sample's -96.28 kW is an
  outlet-T reactor's: it includes heating its 489 K feed to 510.15 K.
  Choupo's -141.32 kW is M39's -18.55 kW (its 568 K make-up -- see C5 --
  COOLED to the declared 510.15 K) plus the isothermal bed's -122.77 kW;
  the bed alone makes 8 % more methanol than the sample's.
* **C5, the hydrogen compressor: 144.54 against 129.74 kW (+11.4 %), outlet
  593.9 against 512.9 K.**  Choupo's number is an ideal-gas-like H2
  compression (isentropic outlet 520.9 K at a ratio of 7.26, work
  108.40 kW isentropic, / 0.75).  The sample's stored outlet, 512.9 K, is
  BELOW Choupo's isentropic outlet while its stored work implies 75 %
  efficiency -- consistent in size with the latent heat of the 3.4 %
  liquid water of its two-phase feed being paid inside the compressor
  (~24 kW), which is a reading of the numbers, not a fact the sample
  states.
* **Choupo's compressor ignores a two-phase feed, silently, and the energy
  report catches it (a Choupo defect, NOT fixed here).**  The unit
  computes the hydrogen feed as a vapour at its overall composition
  (src/unitOperations/rotating/Compressor.cpp: the outlet is "gas-phase by
  construction"; the inlet is priced on the same vapour surface); the
  report resolves the feed two-phase and finds C5 leaving 24.93 kW that no
  term accounts for -- the plant's whole first-law residual, -24.14 kW, is
  that number less COL78's -0.77 kW.  This is the family CLAUDE.md 6 names
  ("the state a unit computes with is not the state its streams carry");
  the compressor is not on its enumerated list.  A refusal would stop this
  case; a wet-compression model is new physics -- the decision is not this
  slice's.
* **The separator runs 7 K hotter (367.20 against 360.24 K), because the
  vapour-fraction specification follows the composition:** with more
  methanol and water in the effluent (13.4 % against 12.6 %), vf = 0.9 is
  reached at a higher T, so more methanol leaves in the purge (0.0295
  against 0.0229) -- which is why the product is 1.7 % LOWER although the
  reactor makes 8 % more.
* **CO2 in the HP liquid is half the sample's (0.0055 against 0.0113)**, and
  in the vent and the products with it.  At 7 K hotter and on a CO2-
  methanol kij whose held-out AAD is 20 % (notValidated), the comparison
  cannot say which is nearer the truth; it says the CO2 numbers downstream
  of the separator are the least certain of this case on both sides.
* **The shortcut columns publish both products at the FEED's bubble
  point** (src/unitOperations/distillation/ShortcutColumn.cpp, the streams
  block: `dist.T = Tref; bot.T = Tref`), so COL85's water product leaves at
  344.47 K (the sample: 369.54 K, the water's boiling point) and COL78's
  bottoms at 336.62 K (the sample: 360.36 K).  The method's "constant
  alpha at the feed bubble point" is stated; that the product temperatures
  are that one point too is not.
* **COL85 agrees (N_min 6.62 against 6.46, R_min 0.743 against 0.698, N
  11.26 against 10.59).  COL78 does not (N_min 9.24 against 4.55, R_min
  0.443 against 0.057), and the measurement sides with Choupo:** at the
  recoveries the sample's own products carry, Fenske gives its N_min only
  for a mean methanol/water volatility of 7.35; Choupo's at the feed bubble
  point is 2.67, and the measured held-out series (101.32 kPa) gives 2.43
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
