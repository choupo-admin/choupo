# Benchmark C -- acetone from water with MIBK, 4 counter-current stages

The reference simulator's sample **"Liquid-Liquid Extraction"** (its file
`PlatformFiles/Common/samples/Liquid-Liquid Extraction.dwxmz`, read at
commit `1abf72d1b6b41d3e9a8cc770d3cc4e8fc76e5766` of
github.com/DanWBR/dwsim; the file itself says BuildVersion 8.8.0.0, SavedOn
2024-07-09T11:06:56-03:00): 1000 mol/s of water at 40 mol % acetone
extracted with 277.33 mol/s (100 t/h) of pure MIBK in a 4-stage
counter-current column, everything at 298.15 K and 1 atm.

**Status: BLOCKED on the engine.**  Choupo does not produce an answer for
this problem today -- its liquid-liquid flash misses splits the problem
needs (findings C1-C3).  Everything else is in place, so the comparison
fills in the day the engine is fixed; an engine change was outside this
commission and was not made.

| file | what it is |
|---|---|
| `system/`, `constant/`, `0/` | the problem as a Choupo case: one `extractor`, 4 stages |
| `constant/parameters/NRTL/` | the curated LLE set (three pair records, one fit) -- below |
| `measurements/` | Choi & Rhim's measured tie lines (Table 5) and their NRTL's calculated ones (Table 6) |
| `reference` | the sample's stored solved state, written by `../read_sample.py` (no parameter of the sample is read) |
| `variants/unifac/` | the same case on Choupo's predictive UNIFAC |
| `variants/stageCascade/` | the same cascade written as four mixers + four LL flashes with three tears |
| `../compare.py` | runs all three in scratch copies and prints them beside `reference`, then checks the NRTL set against the article |

```
make all
python3 -I benchmarks/dwsim/compare.py extraction01_water_acetone_mibk
```

## Properties

**Choupo's UNIFAC does not describe water/MIBK well enough to start from.**
Measured first, as the commission asked (a binary g_mix scan at 298.15 K,
`propertyScanBinary` with UNIFAC on both liquids): UNIFAC does open a gap,
but its water-rich branch sits at x_MIBK = 1e-4 -- the LL flash's simplex
floor -- and its organic branch at x_water 0.204.  Choi & Rhim measured
0.0038 and 0.1177.  So, as Vitor approved (DEV.md 4c C123), an LLE set was
curated from a primary source:

* **J. S. Choi, J. N. Rhim, "Liquid-Liquid Equilibria for Ternary Systems
  with Solvent - Water - Acetone", Hwahak Konghak (J. Korean Inst. Chem.
  Eng.) 24(3) (1986) 185-194** (no DOI assigned; the journal's page
  https://www.kiche.or.kr/journal/kcer/view/all/24/3/185 serves the full
  text).  Binodal curves, ten tie lines (Table 5) and a plait point for
  MIBK + water + acetone at 25 C, measured by cloud-point titration and
  refractometry, and a ternary NRTL set the authors fitted to those tie lines
  only (Table 3, RMSD 1.410 mol %).  Read on the article's page images;
  nothing came from a databank or from the sample.
* The set is converted, by arithmetic only, into three case-local pair
  records (`b_ij = (g_ij - g_jj)/R`, a = 0, the article's alphas; each record
  shows the table row and the conversion), `reviewStatus interim`.  It is a
  25 C LIQUID-LIQUID set -- no VLE entered the fit -- and valid only as a
  set; its validity window is 298.15 K and every run says so.
* **No regression was needed**, so `fitParameters` was not used: a held-out
  check against a second study would have been the next step, and the open
  questions below come first.
* **Transcription check** (`compare.py`, first tie-line table): a flash of
  the case's NRTL at the midpoint of each of the authors' CALCULATED tie
  lines returns that line to within 0.0034 mole fraction on lines 1-9.
  Line 10, nearest the plait point, does not (0.10): evaluated independently
  (a 40-line NRTL in Python, not committed), the authors' printed line 10
  does not satisfy equal activities under their printed parameters
  (ln-activity residual 0.07 for MIBK) and its midpoint is stable -- the
  4-figure parameters cannot reproduce the line printed nearest the plait.
* **Model against measurement** (second table): the set reproduces the
  measured lines in the middle of the diagram (line 3: 0.0034) and misses
  the binary edge -- water in MIBK 0.013 against 0.118 measured, as the
  authors' own calculated line 1 already shows (0.022 at 7 % acetone).

## The comparison (measured 2026-10-20, this tree)

```
                                reference  extractor NRTL  extractor UNIFAC  stage cascade NRTL
extract  F [mol/s]               911.3171      3.4934e-15        1.3483e-15                   0
extract  x_acetone                 0.4386          0.3399            0.2573                   0
extract  x_water                   0.2591          0.3858            0.3859                   0
extract  x_MIBK                    0.3023          0.2743            0.3568                   0
extract  T [K]                   296.5428        298.1500          298.1500            298.1500
raffinate  F [mol/s]             366.0142       1569.2061          644.5900              1.2789
raffinate  x_acetone           9.3760e-04          0.3248            0.2625              0.0337
raffinate  x_water                 0.9941          0.4478            0.3835              0.9637
raffinate  x_MIBK                  0.0049          0.2274            0.3539              0.0026
raffinate  T [K]                 284.7003        298.1500          298.1500            298.1500
acetone recovery to extract        0.9991         -0.2740            0.5770              0.9999
converged                             yes              NO                NO                  NO
```

Every Choupo column is marked NO and none of its numbers is an answer.  The
two `extractor` runs exit 0 publishing a cascade that created (NRTL) or lost
(UNIFAC) a quarter to a half of its throughput; the stage cascade exits 1.

## Findings on the reference side

* **R1. The column is adiabatic and cools by 13.4 K.**  Its stages leave at
  296.54, 295.82, 290.79 and 284.70 K from 298.15 K feeds -- the 284.7 K
  raffinate is real in its own model (the stage table and the stream agree)
  and its first law closes on its stored enthalpy flows to -0.54 kW.  The
  cooling is what its energy balance makes of the excess enthalpy its
  activity model assigns; Choupo's `extractor` is isothermal by construction
  (`src/unitOperations/separation/Extractor.H`, "EXPLICIT ASSUMPTIONS"), so
  even a converged Choupo run would leave at 298.15 K and the stage
  temperatures cannot be compared.  An adiabatic Choupo extractor would be
  new physics (Vitor's).
* **R2.** Its absorber, run in "Extractor" mode, stores two specifications
  (a stream ratio of 5 and a product flow of 29.38 mol/s) whose stored
  calculated values (0.858 and 6.04 mol/s) do not match: in that mode they
  are not used.
* **R3.** Its package is a modified (Dortmund) UNIFAC -- a different group
  model from Choupo's, so a UNIFAC-to-UNIFAC comparison would not be like
  with like either.

## Findings on Choupo's side

* **C1. The LL flash returns one liquid on strongly unstable feeds.**  The
  Gibbs minimisation (`src/unitOperations/flash/IsothermalFlash.cpp`, the LL
  branch) takes four Nelder-Mead starts, three of them biased toward the
  `alphaRich` component (`:693-696`), and when none goes below the feed's
  Gibbs energy it returns "single liquid (Gibbs min finds no improvement over
  feed)" (`:744`) -- even when the TPD test that sent it there had found the
  feed unstable.  Measured on this NRTL set: the feed (water 0.362,
  acetone 0.269, MIBK 0.369) returns ONE liquid with `alphaRich MIBK;
  betaRich water;` and splits with the hints swapped; an independent
  tangent-plane test gives it tm = -0.20.  Inside the stage cascade the
  flash returned one liquid at (water 0.455, acetone 0.0004, MIBK 0.545),
  tm = -0.44, a nearly binary water/MIBK mixture.  The fix belongs in the
  engine (a minimiser that cannot return "stable" against its own TPD, or
  a Newton polish on equal activities -- the reactive path's "Gibbs decides,
  the Newton solves").
* **C2. The `extractor` publishes a non-converged cascade at exit 0.**  It
  passes `(iSolvent, iCarrier)` as the stage flash's `(alphaRich, betaRich)`
  (`Extractor.cpp:575-576` against the signature at `:79-84`), which is the
  order under which C1 bites here; a stage that "does not split" sends its
  whole inlet to the raffinate; and after 60 sweeps without improvement it
  publishes `converged 0`, mass closure 0.229 (NRTL) / 0.495 (UNIFAC), with
  a warning and exit 0.  A result this far from closing should refuse.
* **C3. The TPD advisory fires on correct answers.**  "converged phase ...
  is TPD-unstable (tm = -0.18 ... -0.33)" is printed for the very phases
  that reproduce the authors' tie lines to 1e-3; an independent TPD on the
  same phases finds no instability beyond its grid resolution (-2.5e-4).
  Not root-caused.

## Tolerances

None is set, because there is no Choupo answer to hold.  When there is one:
the reference stores four-figure stage temperatures and its own first law
closes to 0.5 kW, but its stages are adiabatic and Choupo's isothermal (R1),
and the two activity models differ (R3), so flows and recoveries are the
comparable quantities; stage temperatures are not.
