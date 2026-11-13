# The density pilot: measured data, today's baseline and proposed thresholds (C378)

Kind: STUDY (data and measurement).  Status: OPEN -- proposals for the
architect to read and rule on BEFORE the pilot of
[`thermophysical-property-routes.md`](thermophysical-property-routes.md)
section 4.2 runs; nothing is built, no file under `src/`, `gui/`, `bin/` or
`data/standards/` moved.  Branch `c378-pilot-data`, cut from `origin/main`
3e6c37270.  Runs: `choupoProps` and `choupoSolve` printing commit a2b744c46 on
scratch cases built from the shipped component records and
`tutorials/steady/rotating/pump01_water` (no shipped case edited).  The data,
the scripts and every baseline table are in
[`data/curation/batches/density_pilot/`](../../data/curation/batches/density_pilot/README.md);
each number below is reproduced by a script there.

Where the points live: the per-point data files are not in git (the mirror reserves bulk import); `data/curation/batches/density_pilot/scripts/build_data.py` and `extract_iapws95_table.py` regenerate them byte for byte from the mirror and the water article; the batch README lists each file with its DOI, points and ranges.

The reviewer's objection this note is written against: a threshold fitted by
the slice that is then judged on it, or a law compared with its own fit.
Each demonstration therefore says (a) where the number comes from, (b) what
would make the demonstration unable to fail.

## 1. The result in one table

Stated uncertainty is the expanded uncertainty printed per point in the
article's table.  "Today" is the engine at a2b744c46.  AAD is the mean
absolute relative deviation; bias is signed (engine minus measured).

| demo | held to (points; T; P; stated U) | today | proposed PASS | FAIL |
|---|---|---|---|---|
| D1 water | Wagner & Pruss 2002 Tables 13.1/13.2, 187 printed states, 273.16-375 K, 0.1-100 MPa; their stated uncertainty <= 0.0001 % at ambient pressure, 0.001-0.02 % in the liquid (abstract, p. 387) | no `pureFluids`: AAD 1.79 % at 1 bar (max 3.51 %, low, at 372.756 K), 3.42 % at 50 MPa (max 5.75 %); the pump reads one constant, 996.96 kg/m3, at every T and P | unit's value equals the home's to 1e-9 relative; home within 0.001 % (Helmholtz) or 0.005 % (IF97) of the printed table; maximum between 275 and 280 K; 500 bar differs from 1 bar | any unit at 996.96 at 500 bar; 373.15 K at 1 bar priced as a liquid |
| D2 water + ethanol | Pecar & Dolecek 2005: 795 mixture points + 15 pure, 298.15/323.15/348.15 K, 0.1-40 MPa, U 0.02-0.12 %; Rehman & Ansari 2008: 108 points, 268-323 K, 101 kPa, U 0.35-0.49 % | additive volumes: AAD 2.89 %, max 5.07 % at 0.1 MPa (Pecar); 2.52 %, max 4.07 % (Rehman, 298-323 K); 5.0 % AAD at 40 MPa | at 0.1 MPa: Pecar AAD <= 2.0 %, max <= 3.6 %; Rehman 298.15-323.15 K AAD <= 2.3 %, max <= 3.7 %; the evidence the run prints equals the harness's AAD to 0.05 percentage points | an unequal-T leaf datum; printed evidence differing from the harness; 0.1 MPa evidence claimed at 40 MPa |
| D3 NaOH | Galindo-Luna 2019: 186 points, 303.15-353.15 K, 0.1 MPa, w 0.20-0.50, U 2.0-2.2 kg/m3; Hnedkovsky 2007: 116 points (80 in the correlation's window), 323-573 K, 2-10 MPa, U 1.5-2.7 kg/m3 | the property bench: NaN with a stated reason; the pump leaves NaOH's volume out: AAD 14.95 % on set A, max 34.4 % | the law (Olsson 1997) reproduced by the record to 1e-6 relative; against set A AAD <= 0.10 %, max <= 0.30 %; against set B at <= 2 MPa AAD <= 0.20 %, max <= 0.30 %; B at 10 MPa reported WITH the statement that the law has no pressure term | the law used where the declared point applies; the point used beyond +-3 K of its T |
| D3b point | Galindo-Luna 303.15 K, w = 0.20, 1213.8 +- 2.0 kg/m3 | the pump route: 1246.2 kg/m3 (+2.7 %) | flow 8.2386e-4 m3/s, residence time 1213.8 s, from the declared point, by the harness | a value from the law while the point applies |
| D4 CO2 in water | Hebach 2004 (205 points, 281-333 K, 1.1-30.7 MPa, no composition stated, U 0.3 %); McBride-Wright 2015 (98 points, 275-449 K, 15-101 MPa, x_CO2 0.9-2.7 %, U 0.06-0.08 %); Efika 2016 (273 points, 293-450 K, up to 64 MPa, no composition) | the bench: 1015 kg/m3 for CO2 as a liquid at 293.15 K; REFUSED at 313.15 K (text in 3.4); the pump: CO2 at one flat 47 cm3/mol at every T | one method at 293.15 and 313.15 K; CO2's volume non-zero; the increment over pure water 1.55-1.71 % (293 K), 1.14-1.33 % (313 K), P >= 10 MPa, reproduced to 0.3 percentage points | a method change at 304 K; CO2's volume zero |
| D5 NaCl + water + ethanol | Galleguillos 2003: 21 saturated + 53 unsaturated points, 298.15 and 313.15 K, 101 kPa, U up to 29 kg/m3 | the bench refuses (NaCl has no `Vliq`); the PUMP ANSWERS (NaCl left out, announced): AAD 4.1 % / 1.8 %; the CSTR refuses (read, not run) | a refusal naming {ethanol, NaCl, water}, the record kind and the remedy, on the pump AND the CSTR | any number |

## 2. How the data entered, and what is reserved

* D1: the printed values of Tables 13.1 and 13.2 of the IAPWS-95 article, read
  from `Handbooks-DataCompilations/wagner2002-iapws95.pdf` with the journal
  page of every row (486-488, 496-498, 513-514, 521, 525, 528).  The table prints
  the 0.1 MPa and 0.101325 MPa isobars and the saturated liquid on a 2 K grid;
  it does NOT print 298.15 K (5 K grid at 295 and 300 K, 298 K on the
  saturation list), so the "298.15 K, 500 bar" value of the pilot table (1018.4)
  is the engine's own, bracketed by the printed 1019.40 (295 K) and 1017.85 K
  (300 K) at 50 MPa (linear interpolation 1018.42; both brackets are in the data file).
* D2-D5: the ThermoML mirror as a finding aid; each file names the article and
  carries `transcribedNotCheckedAgainstArticle`.  The reading of the archive's
  copy was done by `scripts/thermoml_blocks.py`; no value was typed.
* ONE CHOICE of home, with its reason: a batch directory, not a case's
  `constant/experiments`, because five demonstrations share nine sets before any
  pilot case exists (batch README).
* RULED (architect): `thirdParty/thermoml/README.md` reserves BULK import, so the 1 870 ThermoML points and the 187 printed IAPWS-95 rows are NOT in git; they are regenerated by the batch scripts. Kept: 12 printed anchors and the one D3b point.

## 3. The demonstrations

### 3.1 D1 -- water

**Datasets.** `d1_water_iapws95.tsv`: 187 printed densities.  The pilot's
claim "999.8 / 1000.0 / 958.3 kg/m3 at 273.16 / 277.16 / 373.16 K" is NOT what
the article prints at 1 bar: the saturated liquid is 999.793 (273.16 K, p. 486),
999.914 (276 K) and 999.919 (278 K); 0.1 MPa isobar 999.937 at 275 K and 999.910
at 280 K (p. 496), 958.632 at 372.756 K (the normal-boiling point at 0.1 MPa).  Water at
373.15 K and 1 bar is a VAPOUR (boiling point 372.756 K, 373.124 K at 101.325
kPa): there is no liquid density to print there, and the engine's generic route
nevertheless returns a liquid value (924.6).  The domain of D1 at 1 bar ends
at 372.756 K.

**Baseline.** Three routes on the same 187 states
(`baseline/d1_water.tsv`, deviation from the printed value):

| route | saturated liquid, 273.16-374 K | 1 bar, 273-372.756 K | 10 / 25 / 50 / 100 MPa |
|---|---|---|---|
| generic (no `pureFluids`) | AAD 1.74 %, max 3.55 % | AAD 1.79 %, max 3.51 % | AAD 2.03 / 2.48 / 3.42 / 5.24 %; max 7.60 % (100 MPa, 375 K) |
| `method IF97` | AAD 0.0008 %, max 0.0016 % | 0.0008 %, 0.0016 % | AAD <= 0.0009 %, max 0.0018 % |
| `method Helmholtz` (IAPWS95) | 0.0000 %, 0.0001 % | 0.0000 %, 0.0001 % | AAD <= 0.0003 %, max 0.0005 % |

IF97 refuses below 273.15 K (supercooled rows at 10-100 MPa) by name; the
Helmholtz route covers them.  The generic route has no density maximum: it
falls monotonically from 1019.7 kg/m3 at 273.16 K.  The PUMP route is one
constant, v = 1.8070e-5 m3/mol = 996.96 kg/m3, identical at 277.15 K, 298.15 K,
353.15 K and at 500 bar (scratch pump, `baseline/probes.txt`): against the
table -0.30 % at 277 K (999.92), -0.01 % at 298 K (997.05), +2.6 % at 353.15 K
(971.8 interpolated between the printed 350 and 355 K) and -2.1 % at 500 bar
(1018.4).

**Proposed PASS** (all):
1. For a pump and a CSTR fed 1 kg/s of water, the volumetric flow and the
   residence time equal 1/rho and V rho/m_dot with rho the home's value, to 1e-9
   relative (wiring; the script computes the reference, not the unit).
2. The home's value is within 0.001 % of the printed table on the Helmholtz
   route (the table's own rounding, six figures, is 0.0005 % at ~1000 kg/m3;
   observed maximum 0.0005 %) and within 0.005 % on the IF97 route (observed
   maximum 0.0018 %, which is IF97's own difference from IAPWS-95, not an
   error of the wiring), at the 187 states of the file that the route covers.
3. At 1 bar the density at 277.15 K exceeds the values at 273.16 K and 283.15 K
   (the table: 999.843 / 999.937 at 275 K / 999.517 at 285 K, p. 496).
4. 298.15 K at 1 bar and at 500 bar give different densities and the second
   lies within 0.005 % of the bracketed 1018.4.
**FAIL.** Any unit reading 996.96 at 500 bar; a state above 372.756 K at 1 bar
priced as a liquid without a stated domain error; any deviation beyond the
limits.

**Why these numbers.** The article states <= 0.0001 % at ambient pressure and
0.001-0.02 % in the liquid region; 0.001 % is the tightest figure the table's
digits can carry and the Helmholtz route observes 0.0005 %; the loosest
defensible figure is the article's 0.02 %.  The IF97 figure is the measured
difference between two published formulations, so it is a DESCRIPTION of the
route, not a tolerance fitted to the pilot.

**What would make D1 unable to fail.** The Helmholtz record is a transcription
of the same equation the table was computed from; a unit that reaches the
record passes by construction, and an error INSIDE the equation is caught by
the record's own load check against the release's verification values, which
this demonstration does not repeat.  D1 can fail, and only, by wiring (the
unit does not read the home), by the domain (a state outside the stated
window) and by the route selection (a case with no `pureFluids`).  The negative
control is the baseline above: the generic route misses by 3.5 % at 1 bar and
5.8 % at 50 MPa, so the thresholds separate a wired unit from an unwired one by
four orders of magnitude.  The table states (5 K grid) are not the load-time
verification states of the release's Tables 6-8, so the comparison is not
against the record's own check values.

### 3.2 D2 -- water + ethanol

**Datasets.** (1) Pecar & Dolecek, Fluid Phase Equilib. 230 (2005) 36-44, DOI
10.1016/j.fluid.2004.11.019: vibrating tube, 795 mixture points (53
compositions x 3 temperatures x 5 pressures) and 15 pure-ethanol points;
298.15, 323.15 and 348.15 K (three isotherms, not a continuous range), 0.1, 10,
20, 30, 40 MPa, x_ethanol 0.003-0.95; U 0.2-0.9 kg/m3.  (2) Rehman & Ansari, J.
Chem. Eng. Data 53 (2008) 2072-2088, DOI 10.1021/je800150h: the binary block
of a ternary study, 9 compositions x 12 temperatures, 268.1-323.15 K, 101 kPa;
U 2.8-4.6 kg/m3.  No independent 0.1 MPa binary set reaches 348 K: the other ethanol + water blocks of the mirror at about 0.1 MPa end at 328.15 K (Wang et al., J. Chem. Eng. Data 2009, DOI 10.1021/je800942u: the ethanol-rich end, w_water 0.15-0.25, 303.15-328.15 K, 18 points, U 0.8-0.9 kg/m3; Pires et al., DOI 10.1021/je600565m: 298.15 and 318.15 K, 18 points; neither extracted here) or are dilute-solute volumes at 0.4-30 MPa (Hyncica et al., DOI 10.1016/j.jct.2004.07.019). The two laboratories agree: Rehman's
points against Pecar's excess volume interpolated in x (298.15 and 323.15 K,
18 points): mean 0.14 %, max 0.71 % (at x = 0.1, where Pecar's grid is coarse
and Rehman's U is 3.8-4.6 kg/m3; `baseline/d2_crosscheck.tsv`).

**Baseline** (`baseline/d2_summary.txt`; ideal mixing of volumes, each
component by its own route, `ThermoPackage::density` step (3)): 0.1 MPa,
Pecar, 159 points: AAD 2.89 %, bias -2.89 %, max 5.07 % (348.15 K, x = 0.25);
by isotherm 1.76 % (298.15 K), 2.94 % (323.15 K), 3.97 % (348.15 K).  The
engine is LOW everywhere.  Rehman at 298.15-323.15 K (54 points): AAD 2.52 %,
max 4.07 %.  Pressure is ignored in the liquid branch: Pecar AAD 3.46 / 4.01 /
4.52 / 5.00 % at 10 / 20 / 30 / 40 MPa.  DECOMPOSITION of the 0.1 MPa error:
(i) the excess volume the data show and the engine cannot: with the reference
pure volumes (IAPWS-95 water, the article's measured ethanol) additive volumes
still miss by AAD 1.75 %, max 3.42 % (Pecar), 2.10 % / 3.45 % (Rehman); the
minimum V^E is -1.078 cm3/mol at x_ethanol = 0.40, 298.15 K; (ii) the pure
leaves at their own temperature: the engine's water at 348.15 K is 949.5 kg/m3
against 974.8 (-2.6 %) and its ethanol 725.3 against 739.4 (-1.9 %); ethanol
alone is wrong by AAD 3.1 % over the 15 pure points, 6.85 % at 40 MPa.

**Proposed PASS.** At 0.1 MPa: Pecar AAD <= 2.0 % and max <= 3.6 %; Rehman at
298.15 and 323.15 K AAD <= 2.3 % and max <= 3.7 %; the AAD printed as the
method's evidence equals the harness's AAD on the same set within 0.05
percentage points.  Each leaf's datum is printed with the temperature it is
stated at.  **FAIL.** A `Vliq` used at a temperature other than the one it was
stated at; evidence printed without the comparison; the 0.1 MPa evidence
printed as covering 40 MPa (the law ignores pressure: 5 % at 40 MPa).

**Why these numbers.** They are the FLOOR the method cannot go below (the
excess volume alone, 1.75 / 3.42 % and 2.10 / 3.45 %) plus 0.2-0.25
percentage points, so a method with correct leaves passes and one with a leaf at
the wrong temperature (today: 2.89 / 5.07 %) fails.  They are computed
from the two measured sets and the reference equation, not from any pilot run.
Both sets are independent of each other (different laboratories, different
instruments, mean disagreement 0.14 %).

**What would make D2 unable to fail.** The method has no adjustable parameter,
so there is nothing to fit.  It could not fail if the thresholds were set at the
engine's baseline; they are set at the physics floor.  It could still pass for
the wrong reason if the pilot improves the water leaf only for PURE water (the
pure-fluid route needs x >= 0.999): inside a mixture the water leaf is the
generic route and carries -2.6 % at 348 K.  The 348.15 K isotherm (Pecar only,
no second laboratory) is where that leaf error is largest (AAD 3.97 % today),
which is why Pecar's 0.1 MPa bound covers 348.15 K and Rehman's stops at
323.15 K.

### 3.3 D3 -- aqueous NaOH

**The transcription, checked.** The 18 coefficients of Table IV and the
window of Table III of Olsson, Jernqvist & Aly, Int. J. Thermophys. 18(3)
(1997) 779-793 in `naoh-water-olsson1997.md` section 1.2 were compared digit
by digit with the page image of p. 785 (300 dpi crop of Table IV; p. 783 for
Table III; p. 786 for the accuracy statement): ALL 18 coefficients agree, the
six window bands agree, the accuracy (0.48 kg/m3, 0.04 %; max 2.41 kg/m3,
0.23 %; 156 data of Krey) agrees.  The check values evaluate as written
(997.61 kg/m3 at x = 1, 20 degC; 1522.92 kg/m3 at 50 wt %, 20 degC).  Two
locational remarks, not errors: Eqs. (6)-(9) are on p. 785 together with
Table IV (the section says "pp. 784-785"); the paper defines x as the mass
fraction of WATER, which the script uses.  No transcription error found.

**Datasets.** Galindo-Luna et al., J. Chem. Eng. Data 64 (2019) 5302-5311, DOI
10.1021/acs.jced.9b00536: 186 points, 31 mass fractions (0.20-0.50 NaOH) x 6
temperatures (303.15-353.15 K), 0.1 MPa, U 2.0-2.2 kg/m3 (0.14-0.17 %).
Hnedkovsky et al., J. Chem. Eng. Data 52 (2007) 2237-2244, DOI
10.1021/je700265d: 116 points, 0.1-8.2 mol/kg (0.4-24.7 wt %), 323.15-573.15 K,
2 and 10 MPa, U 1.5-2.7 kg/m3 (0.20-0.21 %).

**Evaluation** (`scripts/olsson_density.py`, `baseline/d3_olsson_*.tsv`):

| set | in window | AAD | bias | max | points beyond the stated U |
|---|---|---|---|---|---|
| A, 303-353 K, 0.1 MPa | 186 of 186 | 0.055 % (0.75 kg/m3) | -0.031 % | 0.206 % (2.81 kg/m3, 303.15 K, w = 0.34) | 6 of 186 |
| B, all in-window (T <= 473.15 K) | 80 of 116 | 0.353 % | -0.353 % | 0.875 % (473.15 K, 10 MPa) | 52 of 80 |
| B at 2 MPa (323.15 K) | 23 | 0.120 % | -0.120 % | 0.200 % | 0 of 23 |
| B at 10 MPa | 57 | 0.448 % | -0.448 % | 0.875 % | 52 of 57 |

Set A supports the law at the level the paper states (0.055 % against the
paper's 0.04 % mean from Krey; max 0.206 % against its 0.23 %), with the bias
largest at 303.15 K (-0.088 %) and none at 333-343 K.  Set B shows what the
law is NOT: it has no pressure argument, and the deviation is a negative bias
that grows with both pressure step and temperature (323 K: -0.12 % at 2 MPa,
-0.40 % at 10 MPa; 473 K: -0.65 % at 10 MPa), the sign and size of the
compressibility of water.  An estimate with the engine's IAPWS-95 route
(`scripts/olsson_pressure_check.py`: factor rho_w(T,P)/rho_w(T,P_ref),
P_ref = max(0.1 MPa, p_sat)) takes B to AAD 0.136 %, bias +0.067 %, max 0.329 %.
That estimate is an ESTIMATE (water stands in for a 0.4-25 wt % solution) and
the thresholds do not rest on it.  The 36 points at 523 and 573 K lie beyond
the correlation's 200 degC limit and are excluded by the window.

**Today.** The property bench: `rho_liquid_NaOH` NaN, "needs either a `Vliq`
in its record or the critical constants Tc and Pc for Rackett; it declares
neither."  The pump leaves NaOH's volume out as a dissolved ion (announced) and
gives 1246.2 kg/m3 at 20 wt %, 303.15 K (+2.7 % against 1213.8), AAD 14.95 % over
set A, max 34.4 % at 50 wt %.

**Proposed PASS.** (a) The record's law reproduces the transcribed correlation
at the 302 measured states to 1e-6 relative (a harness with its own copy of
the 18 constants, not read from the record).  (b) Against set A: AAD <= 0.10 %
and max <= 0.30 % (the paper's stated maximum 0.23 % and the laboratory's U
0.17 % combined in quadrature give 0.29 %; AAD 0.10 % is twice the paper's
0.04 % with room for the laboratory difference).  (c) Against set B at <= 2 MPa
and <= 473.15 K: AAD <= 0.20 %, max <= 0.30 %; at 10 MPa the run prints the
pressure statement ("law carries no pressure term; measured at 10 MPa")
and the comparison is reported, not scored.  **FAIL.** The point used beyond
+-3 K of its temperature (the density changes 0.59 kg/m3 per K at 20 wt %, so
3.4 K equals the point's own U of 2.0 kg/m3; 30 K away the measured value
differs by 17.7 kg/m3, 1.46 %, 8.9 U); the law used where the point applies; a
state outside Table III's window priced without a domain error.

**What would make D3 unable to fail.** The law is the paper's, fitted by its
authors to Krey (1972); neither of the two measured sets is Krey's, and
neither is a set the slice fitted (the slice fits nothing).  Set A is
independent of the law's fit (a 2019 laboratory, a different decade and
instrument); that is what makes (b) a test.  Set B at 10 MPa could not fail
the law FAIRLY, which is why it is reported and not scored; scoring it would
make the threshold depend on a pressure the law does not carry, and the
demonstration would fail for a reason the pilot may not fix.  (a) alone is a
wiring check; it cannot fail if the transcription were wrong, which is why the
18 constants were checked against the page image above rather than against the
record.

### 3.4 D3b -- one measured point, by hand

**The brief asks for a point of the 9b00536 set near 10 wt %.**  The set
starts at 20 wt % (0.20-0.50).  No NaOH + water set in the mirror has 10 wt %
at about 303 K (the only other binary set is Hnedkovsky's, 323 K and above:
10.69 wt %, 1102.25 kg/m3 at 323.15 K, 2 MPa, U 2.24).  Proposed point: **303.15
K, 0.1 MPa, w_NaOH = 0.20, rho = 1213.8 kg/m3, U = 2.0 kg/m3 (0.165 %, 95 %
level per the archive)** from Galindo-Luna et al. 2019.  The same set holds
the same composition at 313.15 / 323.15 / 333.15 / 343.15 / 353.15 K (1208.0,
1202.1, 1196.1, 1190.0, 1184.4), so "a run 30 K away" is 333.15 K, 1196.1
kg/m3, with the law at 1196.16 there (+0.005 %) and 1212.7 at 303.15 K
(-0.09 %).

**By hand**, a feed of 1 kg/s into a vessel of 1 m3:

* volumetric flow Q = m_dot / rho = 1 / 1213.8 = 8.2386e-4 m3/s = 0.8239 L/s =
  2.966 m3/h;
* residence time tau = V / Q = 1 / 8.2386e-4 = 1213.8 s = 20.23 min (numerically
  rho V / m_dot);
* the stated U moves rho to 1211.8-1215.8, so Q to 8.2250e-4-8.2522e-4 m3/s and
  tau to 1211.8-1215.8 s (+-0.165 %);
* the law at this state: 1212.7 kg/m3, tau = 1212.7 s (-0.09 %, inside U);
* what the pump route gives today: v from water alone: rho = 1246.2, Q =
  8.025e-4 m3/s, tau = 1246 s (+2.7 %); and a flat 1000 kg/m3 would give 1000 s
  (-17.6 %).

A student checking the printed volumetric flow and residence time with a
calculator and the point's density can reproduce both to four figures, which
is the threshold: **the printed Q and tau equal 1/rho and rho V/m_dot of the
declared point to 1e-6 relative** (the declared value wins at its state, tier 1),
and a run at 333.15 K reports the point "not at its conditions" and uses the law.

### 3.5 D4 -- CO2 dissolved in water

**Datasets.** Hebach, Oberhof & Dahmen, J. Chem. Eng. Data 49 (2004) 950-953,
DOI 10.1021/je034260i: 205 points (aqueous phase above 900 kg/m3), 281-333 K,
1.07-30.7 MPa; the isotherms at 293 K (53 aqueous points within 0.7 K of
293.15 K) and 313 K (15 points) the demonstration asks for are in it; NO
composition is stated per point (the phase is CO2-saturated); U 2.95-3.1 kg/m3
(0.30 %).  McBride-Wright, Maitland & Trusler, J. Chem. Eng. Data 60 (2015)
171-180, DOI 10.1021/je5009125: 98 points, x_CO2 = 0.0086, 0.0168, 0.0271 STATED,
274.7-449.2 K, 15-101 MPa; U 0.6-0.8 kg/m3; its isotherms are 274.7, 296.2,
323.4, 348.3 K ... not 293 and 313 K.  Efika et al., J. Chem. Thermodyn. 93
(2016) 347-359, DOI 10.1016/j.jct.2015.06.034: 273 points in four blocks
(the aqueous phase is block 1 "Liquid" and block 3 "Liquid mixture 1"; blocks 2
and 4 are the gas and the CO2-rich liquid), 293-450 K, up to 64 MPa; no
composition stated.  McBride-Wright and Efika share an author (Trusler's
laboratory): they are NOT independent of each other.

**Today** (`baseline/d4_summary.txt`, `baseline/probes.txt`):
* the property bench, CO2 as a liquid constituent: 1014.98 kg/m3 at 293.15 K,
  20 MPa; at 313.15 K REFUSED: "ThermoPackage::density: no liquid molar volume
  for component 'CO2' at T = 313.150000 K: it is above its critical temperature
  (Tc = 304.130000 K), where Rackett -- a saturated-liquid correlation --
  describes no liquid.  A gas dissolved in a liquid occupies its partial molar
  volume, which this density route does not model (a Henry pair's `v_inf` is
  that datum, read today only for the Poynting correction).  Ask for the density
  over the components that have a liquid volume, and say which were left out."
* the PUMP does not refuse: it sums the record's flat `Vliq` (47 cm3/mol, "at
  273 K") at every T: v = 1.8649e-5 m3/mol at 293.15 and at 313.15 K for water
  + 2 % CO2.  Against McBride-Wright it is +0.32 % bias, AAD 3.4 %, max 10.5 %
  (449 K), the small bias being two large errors that cancel.
* against McBride-Wright (stated x): the bench mixture at 296 K misses by AAD
  3.1 % (pressure ignored, 20-100 MPa); leaving CO2 out (water alone, generic
  route) 3.0 %; pure water on IAPWS-95 is -0.84 % LOW at the stated
  compositions, i.e. dissolved CO2 raises the density by 0.84 % at x = 1-3 % and
  a method that prices CO2 at zero misses that.  From 323 K up the bench mixture
  is refused at every point (T above Tc).
* the effect to be reproduced, Hebach, pure water on IAPWS-95 at the same (T, P)
  subtracted from the measured density: +1.55-1.71 % (mean +1.64 %) at 293 K,
  P >= 10 MPa; +1.14-1.33 % (mean +1.24 %) at 313 K, P >= 10 MPa; +0.15-1.54 %
  below 10 MPa (the composition is smaller at low pressure) (`baseline/d4a_*.tsv`).

**Proposed PASS.** One method answers at 293.15 K and 313.15 K (no switch at
304.13 K); CO2's volume contribution is printed and non-zero; on the set that
did NOT supply `v_inf` the density at P >= 10 MPa lies within 0.5 % of the
measurement (Hebach U 0.30 % + 0.2 percentage points; McBride-Wright
alternative: 0.25 %), and the increment over pure water is reproduced to 0.3
percentage points (about a fifth of the effect).  **FAIL.** A method change at
304 K; CO2's volume silently zero (or left out); a refusal at 313.15 K that does not name
the remedy.

**What would make D4 unable to fail, and a design dependency.**
(1) CIRCULARITY: `v_inf` entered from one of the three articles and judged on
the same article is a law compared with its own fit.  The test set must be a
different article from the one that supplied the value; Hebach (KIT) is the
one independent of the other two; McBride-Wright and Efika are one laboratory.
(2) COMPOSITION: Hebach and Efika state none, so the mixture density can be
computed only with a composition from a solubility model, itself not under test;
the pilot's pass depends on that model's CO2 mole fraction (about 2 % at 293 K,
20 MPa).  McBride-Wright states it and is the only set on which D4 needs no
second model, but at 296.2 and 323.4 K and from 15 MPa.
(3) PRESSURE AND THE WATER LEAF: inside a mixture the water leaf is the generic
route and ignores pressure (-2 % at 20 MPa), which is larger than the CO2 effect
(+1.6 %); a "within 0.5 %" threshold cannot be met by a CO2 term alone and will
fail unless the pilot also carries pressure for the water leaf.  That is a
true finding the demonstration should surface, not a flaw in the threshold.

### 3.6 D5 -- NaCl + water + ethanol

**Datasets.** Galleguillos, Taboada & Graber, J. Chem. Eng. Data 48 (2003)
405-410, DOI 10.1021/je020173z: 21 points of NaCl-SATURATED ethanol + water
(298.15 and 313.15 K, w_ethanol 0-0.90, the saturation w_NaCl 0.002-0.27 joined
from the article's composition block) and 53 unsaturated points (w_ethanol
0.097-0.63, w_NaCl 0-0.20), 101 kPa; U 0.7-29 kg/m3 (0.06-3.7 %; the large
ones at high ethanol / low density).  No binary NaCl-water density set is in
the mirror's index; the ternary study's own w_ethanol = 0 rows are the nearest
(1197.78 kg/m3 saturated at 298.15 K).

**Today.**
* the bench: `rho_liquid_NaCl` NaN, "needs either a `Vliq` in its record or the
  critical constants Tc and Pc for Rackett; it declares neither." -- a refusal
  for a DIFFERENT reason from the one D5 asks for (it names a missing `Vliq`,
  not a missing solution record);
* the PUMP answers: "[pump] dissolved ion(s) (NaCl) carry no liquid molar
  volume: the volume flow is the solvent's (dilute-solution reading ... ion mole
  fraction 0.0278 neglected)" and prices 30 water + 5 ethanol + 1 NaCl kmol/h at
  v = 2.3183e-5 m3/mol.  Against the data: AAD 4.1 % (saturated; max +14.8 % at
  313.15 K, w_ethanol 0, w_NaCl 0.269) and 1.8 % (unsaturated);
* the CSTR refuses a component with `Vliq <= 0` ("has Vliq <= 0 -- needed for
  liquid concentration", CSTR.cpp:245 and :660; read, not run).

**Proposed PASS.** On the pump AND the CSTR AND the bench: a refusal whose
text names {ethanol, NaCl, water}, says that no solution record covers that
constituent set (NaCl-water records are binary aqueous), and names the set that
could fill `ethanol-NaCl-water.dat` (Galleguillos 2003); no number.  **FAIL.**
Any number, by any consumer; a refusal for another reason.

**What would make D5 unable to fail.** (1) A refusal test passes for ANY
refusal: the bench refuses today for the wrong reason, so the text must be
asserted, not the exit status.  (2) The pump does not refuse today: it answers
with a 1.8-4.1 % error under an announcement, so D5 as written FAILS on the
pump now; the pilot must change the pump's reading of a dissolved ion to a
refusal for a ternary, a behaviour change reaching existing cases with dissolved
ions (the pilot's own listing of moved cases covers it).  (3) The data do not
enter the pass condition at all; they are the evidence that the remedy exists.

## 4. What in the brief did not hold, and what was not found

* D1 "273.16-373.15 K at 1 bar": 373.15 K at 1 bar is vapour (boiling point
  372.756 K).  The liquid domain ends there.
* D1 pilot-table values "999.8 / 1000.0 / 958.3 at 273.16 / 277.16 / 373.16 K"
  are the engine's IAPWS-95 on the SATURATION line, not 1 bar, and the maximum
  is not at 277.16 K (the printed maximum lies between 275 and 280 K); at 298.15
  K the table prints no row.
* D2 "ranges 298.15-348.15 K": three isotherms.  The second independent set
  stops at 323.15 K; none reaches 348 K at 0.1 MPa.
* D3b "near 10 wt % in the 9b00536 set": the set is 20-50 wt %.
* D3 "stated 0.04 % mean of the first set" (pilot table): that is the paper's
  figure on Krey's data, not on Galindo-Luna's set, where the law's AAD is
  0.055 %.
* D4 "at 293 and 313 K": only Hebach has them; McBride-Wright has 296.2 and
  323.4 K.
* D5 "REFUSED": the pump answers today (3.6).
* The IAPWS stated uncertainty is the article's abstract (p. 387); the page and
  section of its detailed figures (Sec. 6.3.2, p. 432) were not read for this
  note.
* Not read from the articles: every ThermoML value is
  `transcribedNotCheckedAgainstArticle`; only the Olsson Table IV page was
  checked against its image.  No data were missing; the Efika blocks 2 and 4
  (gas, CO2-rich liquid) are held in the file with their phase labels and are not
  used.
* The CSTR was not run, only read.  No full sweep was run (no engine file changed).

## 5. Reproduction

See the batch README.  Gates run before the commit: `check_doctrine`,
`check_origin_vocabulary`, `check_source_licence`, `check_decision_index
--write`, `check_doc_references`, `check_process_prose`.
