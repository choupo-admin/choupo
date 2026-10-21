# Benchmark A -- Cavett's recycle train as the reference sample ships it

**Sample:** "Cavett's Problem" (`PlatformFiles/Common/samples/Cavett's
Problem.dwxmz`) of the reference simulator, DWSIM, read at commit
`1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766` (2026-07-17; GPL-3.0); the file
says `BuildVersion 8.8.0.0`, `SavedOn 2024-07-09`.  Its stored state is in
`reference`, written by `read_sample.py`; no file of theirs is copied and no
parameter of their property package is read (benchmarks/README.md).

**What it is:** Cavett's (1963) four-flash recycle train -- the problem the
corpus case `tutorials/steady/flowsheets/cavett01_recycle_train` carries on
its PRIMARY specification (Rosen & Pauls 1977; Rosen 2005) -- as the sample
wires and specifies it: four gas-liquid separators at the primary's four
temperatures, THREE COMPRESSORS lifting each recycled vapour to the stage
above (75 % isentropic efficiency, discharge pressure the stage's), THREE
VALVES letting each liquid down, three recycle blocks, and the sample's
reading of the primary's pressures.  The corpus cavett01 (SRK, kij = 0, the
primary's psia) is untouched and is a different case.

## How this case is built

* **Pressures as the sample reads them.**  The primary gives 800 / 270 /
  49 / 13 **psia**.  The sample stores 5617161 / 1962938 / 439196 / 190985 Pa,
  which are (800 / 270 / 49 / 13 **+ 14.7**) psi x 6894.757 Pa/psi to the
  pascal: it read the primary's psia as **psig**.  This case uses the
  sample's pascals (the comparison is with the sample); the dict says so.
* **Thermodynamics:** phi-phi PR78 (Choupo's `PengRobinson`, the 1978
  two-branch slope since 2026-10-21) with the PPR78 group-contribution kij
  of Jaubert, Privat & Mutelet (AIChE J. 56 (2010) 3225, DOI
  10.1002/aic.12232) -- Vitor's ruling for this case ("Usa o PR78"; route
  P, "kij a T declarada").  The table and the group decompositions are a
  cited record, `constant/parameters/PPR78/jaubert2010.dat` (28 group
  pairs, read from the page image by two readers; the PDF text layer drops
  minus signs).  The `ppr78Kij` props op in `kijTables/` evaluates Eq. 7
  ONCE at each separator's declared temperature on Choupo's own PR78 a_i(T)
  and b_i and writes a kij SET record per separator
  (`constant/parameters/PengRobinson/ppr78_<unit>_<T>K.dat`, 105 pairs each,
  every intermediate beside each value); the flowsheet declares them.  The
  global package carries the 322.03 K set (SEP0's); SEP1, SEP2 and SEP3
  carry their own through a `thermo {}` override.  **Stated default:** a
  compressor, valve or mixer declares no temperature and reads the
  inherited 322.03 K set.  No component of this case has omega > 0.491
  (n-decane, the heaviest, is 0.4884), so the 1978 branch is not exercised.
* **Tc, Pc, omega are the catalogue's** (`data/standards/components/`); the
  sample's are its databank's.  A kij from Eq. 7 moves with the critical
  constants it is evaluated on, so the two programs' kij matrices differ
  before anything else does.
* **The compressors declare `P_out`** -- the form built for this case
  (DEV.md 4c C123; the shaft power is the result).  **The tears are the two
  mixer outlets** (cavett01's choice); Newton on the tears.

## Findings on the reference side (stated neutrally, from `reference`)

* **The feed is not the primary's.**  The sample has 15 compounds and NO
  n-undecane; its n-decane mole fraction, 0.0741, is within 0.0007 of the
  primary's n-decane + n-undecane (0.0304 + 0.0444).  Its total, 5908.21
  mol/s, is neither the primary's 27340.6 lbmol/h (3444.9 mol/s) nor that
  number read as kmol/h (7594.6 mol/s); the ratio to the latter is 0.7779.
  This case runs the sample's feed as stored (0/s2).
* **psig for psia**, above.
* **Each recycle block reports `converged true` after `iterationsTaken 1`,
  and one of them passes on a state that is not its source's.**  Stream "10"
  (VALV-000's outlet) and stream "1" (the recycle block's outlet) carry the
  same T, P, F and composition and different states: vapour fraction
  0.38562 against 0.38906, enthalpy -55 676.26 against -55 655.88 kW
  (20.39 kW apart).
* **One vessel, two outlet temperatures.**  SEP-001 is declared at
  310.92 K; its vapour (stream "8") is stored at 310.920 K and its liquid
  (stream "9") at 309.954 K.
* **The stored state's own balances** are printed by `compare.py` (feed
  against the two products, component by component; the first law over
  the stored stream enthalpies and duties).

## Comparison

Run `python3 -I benchmarks/dwsim/compare.py recycle01_cavett_as_shipped`
(needs `make all`).  The table it prints is reproduced below.

Measured 2026-10-21 on this branch:

```
Benchmark A -- Cavett as the reference sample ships it (psig, compressors, valves; PR78 + PPR78)
------------------------------------------------------------------------------------------------
                                          reference        Choupo  Choupo - ref         rel %
GAS PRODUCT s8  F [mol/s]                 2731.8759     2744.7181       12.8422        0.4701
GAS PRODUCT s8  T [K]                      310.9203      310.9200   -2.7802e-04   -8.9418e-05
GAS PRODUCT s8  x_CH4                        0.2373        0.2361       -0.0011       -0.4829
GAS PRODUCT s8  x_ethane                     0.1784        0.1775   -8.9595e-04       -0.5022
GAS PRODUCT s8  x_propane                    0.1010        0.1038        0.0027        2.6887
GAS PRODUCT s8  x_nButane                    0.0213        0.0208   -5.1095e-04       -2.3976
GAS PRODUCT s8  x_nDecane                6.9981e-06    7.2239e-06    2.2584e-07        3.2271
GAS PRODUCT s8  vapour fraction              1.0000        1.0000    2.8860e-06    2.8861e-04
LIQUID PRODUCT s18  F [mol/s]             3176.3360     3163.4938      -12.8422       -0.4043
LIQUID PRODUCT s18  T [K]                  302.5999      302.6000    6.1103e-05    2.0193e-05
LIQUID PRODUCT s18  x_CH4                1.3827e-04    1.5917e-04    2.0905e-05       15.1188
LIQUID PRODUCT s18  x_ethane                 0.0101        0.0102    8.8901e-05        0.8801
LIQUID PRODUCT s18  x_propane                0.0692        0.0667       -0.0025       -3.5908
LIQUID PRODUCT s18  x_nButane                0.0865        0.0873    7.1113e-04        0.8217
LIQUID PRODUCT s18  x_nDecane                0.1378        0.1384    5.6402e-04        0.4092
LIQUID PRODUCT s18  vapour fraction      7.3805e-07             0   -7.3805e-07     -100.0000
SEP0 vapour s5  F [mol/s]                 3022.0577     3030.9456        8.8878        0.2941
SEP0 vapour s5  T [K]                      322.0311      322.0300       -0.0011   -3.3832e-04
SEP0 vapour s5  vapour fraction              1.0000        1.0000    2.5204e-06    2.5204e-04
SEP0 liquid s6  F [mol/s]                 4558.3581     4440.0801     -118.2780       -2.5948
SEP0 liquid s6  T [K]                      322.0300      322.0300             0             0
recycle s1 (V0 out)  F [mol/s]             290.1818      286.2274       -3.9544       -1.3627
recycle s1 (V0 out)  T [K]                 281.6487      289.5182        7.8696        2.7941
recycle s1 (V0 out)  vapour fraction         0.3891        0.4583        0.0692       17.7881
recycle s3 (C1 out)  F [mol/s]            1382.0221     1276.5864     -105.4358       -7.6291
recycle s3 (C1 out)  T [K]                 395.8009      395.4587       -0.3422       -0.0865
recycle s3 (C1 out)  vapour fraction         1.0000        1.0000             0             0
recycle s20 (C2 out)  F [mol/s]            328.3001      310.2638      -18.0363       -5.4938
recycle s20 (C2 out)  T [K]                341.3598      341.3446       -0.0152       -0.0044
recycle s20 (C2 out)  vapour fraction        1.0000        1.0000             0             0
tear s4 (M0 out)  F [mol/s]               7580.4159     7471.0257     -109.3902       -1.4431
tear s4 (M0 out)  T [K]                    331.1571      322.0300       -9.1271       -2.7561
tear s4 (M0 out)  x_CH4                      0.1012        0.1023        0.0011        1.1126
tear s4 (M0 out)  x_ethane                   0.1140        0.1134   -5.5825e-04       -0.4897
tear s4 (M0 out)  x_propane                  0.1176        0.1177    5.8085e-05        0.0494
tear s4 (M0 out)  x_nButane                  0.0605        0.0602   -3.4837e-04       -0.5757
tear s4 (M0 out)  x_nDecane                  0.0578        0.0587    8.4567e-04        1.4621
tear s4 (M0 out)  vapour fraction            0.4328             0       -0.4328     -100.0000
tear s12 (M1 out)  F [mol/s]              4886.6582     4750.3439     -136.3143       -2.7895
tear s12 (M1 out)  T [K]                   308.2359      308.7000        0.4641        0.1506
tear s12 (M1 out)  x_CH4                     0.0202        0.0204    2.7596e-04        1.3688
tear s12 (M1 out)  x_ethane                  0.0782        0.0770       -0.0012       -1.5494
tear s12 (M1 out)  x_propane                 0.1372        0.1359       -0.0013       -0.9224
tear s12 (M1 out)  x_nButane                 0.0854        0.0857    2.6928e-04        0.3152
tear s12 (M1 out)  x_nDecane                 0.0897        0.0922        0.0026        2.8690
tear s12 (M1 out)  vapour fraction           0.2809             0       -0.2809     -100.0000
SEP0 duty [kW] (Choupo: M0 + SEP0)      -1.2415e+04   -1.0650e+04     1764.4635       14.2125
SEP1 duty [kW]                          -2.1764e+04   -2.1189e+04      575.5628        2.6445
SEP2 duty [kW] (Choupo: M1 + SEP2)         534.4752    -3643.0843    -4177.5595     -781.6189
SEP3 duty [kW]                             885.4112     -539.8142    -1425.2253     -160.9676
C0 shaft power [kW]                      1.0937e+04    1.0971e+04       34.3166        0.3138
C1 shaft power [kW]                       7297.8067     6734.8614     -562.9453       -7.7139
C2 shaft power [kW]                        924.8358      873.6615      -51.1743       -5.5333
C0 outlet T [K]                            403.9520      403.6294       -0.3226       -0.0799
C1 outlet T [K]                            395.8009      395.4587       -0.3422       -0.0865
C2 outlet T [K]                            341.3598      341.3446       -0.0152       -0.0044
V0 outlet T [K]                            281.6487      289.5182        7.8696        2.7941
V1 outlet T [K]                            305.8955      310.0542        4.1587        1.3595
V2 outlet T [K]                            301.6530      303.1705        1.5175        0.5031
Duties: + heating, - cooling, both sides.  Every reference number is the sample's stored state.

Plant balances (each side on its own stored numbers)
  reference: feed 5908.2119 mol/s, products 5908.2119 mol/s (-0.0000 %); worst component imbalance 0.0468 mol/s
             first law  H_feed + sum(duties) + sum(W) - H_products = +17.489 kW
             recycle block rEC000: converged true after 1.0 iteration(s)
             recycle block rEC001: converged true after 1.0 iteration(s)
             recycle block rEC002: converged true after 1.0 iteration(s)
  Choupo: first-law residual -67.3135 kW (energy exchanged (the larger of: sum of |declared duties and work|, and |Q boundary|)); converged True

Variant adiabaticMixers (the mixers as the sample has them): exit 0, converged True
  Choupo, adiabatic mixers: first-law residual -4.9965e+04 kW (energy exchanged (the larger of: sum of |declared duties and work|, and |Q boundary|)); converged True
  M1: H_in -946696.5406 kW, H_out -906492.7790 kW, remaining imbalance 40203.7615 kW (the engine's own report)
  M0: H_in -1498141.5644 kW, H_out -1488456.8995 kW, remaining imbalance 9684.6649 kW (the engine's own report)
```

## Findings on Choupo's side

* **The products agree to half a per cent** (gas 2744.72 against 2731.88
  mol/s, +0.47 %; liquid 3163.49 against 3176.34, -0.40 %), the separator
  temperatures exactly (they are declared), the compositions to a few per
  cent; the largest relative gap is methane in the liquid product (+15 % of
  a 1.4e-4 mole fraction).  C0, the largest compressor, agrees to 0.31 %
  (10 971 against 10 937 kW) and every compressor outlet T to 0.35 K.
* **The valves are where the two programs part, and the cause is
  measured.**  V0, V1, V2 outlets are 7.87, 4.16 and 1.52 K warmer here.  The
  sample's own stored stream 9 (SEP1 liquid, 309.95 K, 56.17 bar) let down
  through Choupo's valve to 19.63 bar on this case's thermodynamics lands at
  288.61 K, vf 0.462 (the sample: 281.65 K, vf 0.389); with every kij set to
  0 it lands at 293.22 K, vf 0.406 -- so the gap is the cubic and its
  parameters (Choupo's catalogue Tc/Pc/omega and PPR78 against the sample's
  own databank and pair set), not the valve, and the kij alone moves the
  outlet by 4.6 K.  A warmer V1 outlet (4440 mol/s) is what turns the
  SEP2-stage duty from the sample's +534 kW to -3643 kW here: the mixture
  must be cooled to SEP2's 308.7 K instead of warmed.  The recycles follow
  (s3 -7.6 %, s20 -5.5 %), and C1 and C2 with them (-7.7 %, -5.5 %).
* **First law: -67.31 kW over a plant exchanging 54.6 MW (0.12 %), and
  ALL of it is attributed** by the engine's own report
  (reports/balances/energyBalance_byUnit.csv): +68.35 kW are the declared
  model-boundary steps at SEP1, SEP2 and SEP3 (7.76 + 25.31 + 35.28 kW) --
  each of those separators computes on its OWN kij set (route P, the kij at
  its own temperature) while its inlet was priced on the inherited 322.03 K
  set, and the ledger reproduces each step; and -1.04 kW are the three
  compressors (C0 -1.59 kW): the P_out form finds the outlet T from the
  enthalpy to the isentropic core's 1 J/mol tolerance, times 3031 mol/s.
  The sample's own stored state closes at +17.49 kW.
* **THE ADIABATIC MIXER CREATES ENERGY (a Choupo defect, enumerated in
  CLAUDE.md 6 and not fixed here).**  Run as built (`variants/
  adiabaticMixers`, which compare.py also runs), Choupo's adiabatic `mixer`
  merges each compressor's hot vapour into a liquid-dominant stream on its
  liquid sensible datum and publishes the outlet single-phase; the plant's
  own report finds M0 creating 9 684.66 kW and M1 40 203.76 kW, a plant
  residual of -49 965 kW.  The main case declares each mixer at its
  separator's temperature (the workaround in system/flowsheetDict), which
  prices the duty on the report's own surface (DEV.md 4c C74) and closes.
* **Stated, not hidden:** the tears s4 and s12 are published at the mixers'
  declared temperatures with the mixer's phase LABEL, vf 0 -- a mixer does
  not flash (src/unitOperations/mixer/Mixer.cpp, "DOMINANT IS A LABEL") --
  while the separator and the energy report resolve the same (T, P, z)
  two-phase; the sample's adiabatic mixers store them two-phase (0.433,
  0.281) at 331.16 and 308.24 K.  The sample's separator duty is compared
  with Q(mixer) + Q(separator): the same energy over the same boundary.
