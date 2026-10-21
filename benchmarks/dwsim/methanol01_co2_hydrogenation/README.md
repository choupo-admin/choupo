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
  default:** every unit reads that set; thirteen of the fifteen pairs are
  EXTRAPOLATED in T beyond the data their parameters were fitted on (H2+CO
  to 125 K, H2+CO2 to 303 K; only the water pairs reach 700 K) -- the set
  marks each, and every run repeats it with the window.
* **The methanol pairs** (H2-, CO-, CO2-methanol) are **Choupo's own
  regression** to Brunner, Hultenschmidt & Schlichtharle, J. Chem.
  Thermodyn. 19 (1987) 273 -- PPR78 has no methanol group.  `kijFits/`
  fits a constant kij per pair to the liquid-branch bubble pressures
  (`constant/experiments/`, 301 rows transcribed and checked, the p <= 20 MPa
  window declared before the fit) with the `P_bubble` residual built for
  this (relative, DEV.md 4c C123), the **373.15 K isotherm held out** for
  every gas (the isotherm nearest the separator's 360 K), a **band of 5 %**
  declared before the fit with its origin, and the verdict written into
  each pair record.  Whatever the verdict, the pair is used case-locally
  and announced (Vitor: "sim a tudo").  FIT_VERDICTS_PLACEHOLDER
* **Every other pair is kij = 0, announced:** methanol-water, methanol-N2,
  methanol-Ar, methanol-O2 and the six O2 pairs.  No primary source for
  them was read (Brunner has no water; the 2017 table's O2 pairs were
  outside the transcription).  O2 is 1e-4 of the CO2 feed; methanol-water
  is the one of these that reaches a product (the columns) and is a stated
  gap.
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
     stored work -0.00122 kW) is a no-op and is omitted;
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
     sample's compressor ignores the phase; Choupo's compressor prices the
     feed on the vapour root of the overall composition -- the same reading.
  8. STAGE COUNTS: the reference counts its condenser as stage 1, so a
     rigorous reference column maps to `nStages - 1` in Choupo (DEV.md 4c
     C123, G28's finding on case B).  Both columns here are SHORTCUT
     columns on both sides -- N is a RESULT of Fenske-Underwood-Gilliland,
     not an input -- so no stage count is mapped; the N the two programs
     publish are compared as they are, and whether the sample's N includes
     its condenser is not stated by the sample.

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
* **The hydrogen feed is two-phase at the compressor** (above).
* **The recycle blocks:** REC-050 converged after 10 iterations, REC-059
  after 1.
* The sample stores no enthalpy per stream (`H_kW None` throughout), so no
  first law can be read off its state; `compare.py` prints its flow
  balance.

## Comparison

Run `python3 -I benchmarks/dwsim/compare.py methanol01_co2_hydrogenation`
(needs `make all`; the three fits take a few minutes).

COMPARISON_TABLE_PLACEHOLDER

## Findings on Choupo's side

CHOUPO_FINDINGS_PLACEHOLDER
