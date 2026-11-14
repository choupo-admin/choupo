# Review: the EduTool "One flux, many units" (C401)

Date 2026-11-14.  Subject: `origin/c401/one-flux-many-units` at 798797a02.
Rows MT-01..MT-06 in docs/reviews/LEDGER.tsv.

Verdict: no wrong formula, table, number or exercise answer found (no S1,
no S2).  Six lesser rows (1 S3, 5 S4).  The page may ship as built; the rows
are wording and test-coverage notes.

## What was done

The five sources in ~/Choupo-Literature (Treybal 1980; Seader et al. 2016,
4th ed.; Sander 2015; Taylor & Kooijman 2014; Missen, Mims & Saville 1999)
were extracted and every cited equation and table compared symbol by symbol,
by text layer and by page image where the text layer garbled the equations.
Every exercise and the curved-line demonstration were recomputed in an
independent script (not the page's module).  Every code line cited was read,
and the Henry records and their README.  The page's test file: 27/27 pass.
Printed page = PDF page minus 15 (Treybal) or minus 18 (Missen), so every
cited page number checks.  (`--maxWorkers=2` fails in this vitest with
"minThreads and maxThreads must not conflict"; `--pool=forks
--poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1` works.)

## Claim 1, formulas and tables as printed: HOLDS

* Treybal: Eqs. 3.3-3.6 (p. 48) and Table 3.1 (p. 49) (the prime marks the
  equimolar coefficient, F = k'_y, as the notation table says); Eqs. 5.1,
  5.4-5.11 (pp. 109-110) and 5.12-5.19 (pp. 110-111) (m' the chord from the
  bulk liquid to the interface, m'' from the interface to x*); the p. 114
  quotation is verbatim; the chapter-8 nomenclature entry for m is on p. 334.
* Seader: Eqs. 3-179 to 3-203 and Table 3.12 (pp. 76-78), including the
  Henry footnote on p. 76 listing three other forms (H_A a solubility c/p in
  chapter 3, Eq. 3-182; H' a volatility p/c in chapter 6, Eq. 6-128); Eqs.
  6-128, 6-130, 6-131, 6-132 (pp. 181-182) and Figure 6.45; Example 3.18
  (pp. 79-80): data, fit 56.3, K_x 9.66 / 9.69 / 9.71, N 0.00942 / 0.00945 /
  0.00947, 8.85 and the 0.02 resistance ratio all agree with the page.
* Sander: Eqs. 1-16, 19; Tables 1-4 (pp. 4400-4403); the "meaningless unless
  the type is specified" quotation (p. 4401); Table 6: O2 H^cp 1.3e-5, d ln
  H/d(1/T) 1500 (Sander et al. 2011 row) on p. 4408; NH3 5.9e-1, 4200 on p.
  4410; the "1.2e-5 to 1.3e-5" spread of O2 rows is accurate; Table 1's
  1.83089 reproduces with M_w = 0.0180153 and rho = 997.
* Taylor & Kooijman: Eqs. 3.8; 3.44 and 3.45 (p. 111); 3.58 and 3.59; 3.68
  (p. 115); 3.77-3.82 (p. 117); the film orientation of 3.82 matches the
  page's use.
* Missen: Eqs. 9.2-3, 6, 8, 13, 14 (p. 241: H_A a volatility p/c); 9.2-26a,
  9.2-39/46/47/48, 9.2-49 to 9.2-54 and 9.2-55 (pp. 251-253); the "about 3 /
  about 0.1" criterion on p. 253; the Example 9-6 table (p. 253): Ha 3.4 /
  26, E_i 4.1 / 187, E 2.5 / 24.3 (second-order) and 3.4 / 26
  (pseudo-first-order), and the 74 % and 94 % statements; section 9.2.3.2 is
  the bulk-reaction case, as the limits box says.
* Unit factors in the converters (kmol/(m2 h atm), lbmol/(ft2 h atm), bar
  L/mol, M/atm and the others): all correct.
* Henry directions: Hcp, Hcc, Hxp and Hbp are solubilities; KHpc, KHpx and
  KHcc volatilities, with the right inverse relations; toHcp and fromHcp are
  mutually consistent.

## Claim 2, exercise answers (independent recomputation: all agree)

1. k_x = 9.9, k_y = 8.106 (book 8.1), k_c(gas) = 0.02985 m/s, k_y^s = 8.859
   (book 8.85, from the rounded 8.1; the page says so).
2. H^xp = 2.349e-10 1/Pa, K_H^px = 4.257e9 Pa (42014 atm), H^cc = 0.03223,
   m = 42014, x = 5.00e-6, 8.85 mg/L.
3. K_x = 9.662, liquid share 97.6 % (the book's 0.02 is the gas/liquid ratio
   on another basis; consistent), N = 0.00942.
4. K_G = 8.551e-6, K_L = 1.449e-5, gas share 85.5 %, N = 8.66e-3 mol/(m2 s),
   p_i = 146.8 Pa, c_i = 86.6 mol/m3, and k_L c_i = N.
5. Ha 3.354, c_Ai 27.78, E_i 4.10, E_pfo 3.362, E_vkh 2.470, ratio 73.5 %
   (book: 3.4 / 4.1 / 2.5 / 3.4 / 74 %).
6. Ha 25.98, E_i 187.0, E_pfo 25.98, E_vkh 24.30, ratio 93.5 % (book: 26 /
   187 / 24.3 / 26 / 94 %); fluxes 0.0111 (without reaction), 0.289 and 0.270
   mol/(m2 s).

Curved line (Seader Example 3.18): exact interface x_i = 0.0019543, y_i =
0.08383, N = 0.009447; average-slope estimate 0.009421 (-0.28 %); slope at
x* 0.009448 (+0.005 %); the chord m'' reproduces the exact flux; the straight
29.74 line 0.01767 (+87 %), so the ">80 %" claim holds; with k_y x 0.01 the
slope-at-x* error is +6 %, so "slope choices drift apart" is true.  The data
are consistent across exercises.

## Claim 3, code citations: HOLDS

All 13 lines say what the lesson claims: PackingRBF.cpp:127, 129, 133 (k_G
and k_L velocities, a_e in m2/m3); RateBasedSegment.cpp:424, 425, 426 (the
molar-density products), 541 (interface equilibrium), 559 and 560 (explicit
bulk-flow term with the film-average composition), 635 (the first guess
1/(1/beta_V + m/beta_L)); HenrysLaw.cpp:50 (H_ref read as a pressure) and
:163 (van 't Hoff, sign correct for the volatility, opposite to Sander Eq. 19
as the page says); ThermoPackage.cpp:1277 (K = H(T)/P).  Residual wording in
MT-04.

## Claim 4, limits stated truthfully: HOLDS

The five limits (binary film only, low flux, dilute Henry, film-model
reaction, not the engine) match what the filed sources print; "the filed
sources do not print penetration or surface-renewal E for a reacting film" is
consistent with the Missen pages read; "the engine's absorbers are
equilibrium stages with Henry's law" is consistent with docs/ai/unit-ops.md.

## Claim 5, Henry record naming: CORRECT

README.md: H_xp = p_i/x_i [Pa]; O2-water.dat: H_ref 4.40e9 Pa and the profile
line p_i = H_xp * x_i.  The stored quantity is Sander's K_H^px; Sander's own
H^xp = x/p is its inverse.  The O2 record is 3.4 % above Sander's rounded
first-row conversion and inside his spread.  The data's own naming is the
trap (MT-05).

## Rows

* **MT-01 (S4)** (oneFluxManyUnits.ts, exercise `convert-henry`):
  three-digit answers (4.26e9 Pa, 8.85 mg/L) from a two-significant-figure
  datum; the unrounded value behind 1.3e-5 is about 1.26e-5 (Choupo's record
  header says 8.5 mg/L); water vapour over saturated air is ignored (about 8.7
  mg/L).  The arithmetic is right.
* **MT-02 (S4)** (docs/eduToolsGuide.tex, try-it box): "five orders of
  magnitude" between ammonia and oxygen is 4.7 (m = 4.2e4 vs 0.926).
* **MT-03 (S3)** (gui/tests/oneFluxManyUnits.test.ts): the lesson's prose
  numbers ("within a percent", "9.69 to 9.71", "1.09", "about 4x10^4") are
  held by no test; all are correct today.
* **MT-04 (S4)** (lesson step 7 and OFMU_ENGINE_SCOPE; RateBasedSegment.cpp
  :425, :541): beta is dimensionless (divided by Vref), so "k_y = c_G k_c"
  names only the first factors; line 541 sits inside `if (!limitMode)`, with a
  linearised branch the page does not mention while saying the interface "is
  in equilibrium".
* **MT-05 (S4)** (not the page; data/standards/conventions/Sander-Hxp-v1.dat
  and data/standards/parameters/Henry/README.md): the profile's source string
  ("H_xp form") and the README name the stored p/x after Sander's symbol, whose
  H^xp is the inverse; the README says Sander tabulates ln H_xp = A + B/T, but
  his Table 6 tabulates H^cp and d ln H^cp/d(1/T).
* **MT-06 (S4)** (OneFluxManyUnitsTool.tsx reaction panel): the
  pseudo-first-order flux is printed unflagged when E_pfo exceeds E_i (with
  Missen's data at c_B = 0.01 mol/L: Ha 1.06, E_i 1.31, E_pfo 1.35, above the
  instantaneous limit); the van Krevelen-Hoftijzer value is bounded and the
  ratio line shows it.

## Pedagogy

Sound for an undergraduate: the unit traps are handled (the prime inversion
between Treybal and Seader, the two meanings of Seader's H, the two meanings
of k_c, the dimensionless Henry forms); answers are hidden until asked; the
page says its own arithmetic, not the engine's, produces every number.  Only
the MT-01 precision and the MT-06 flag could mislead.

## Not reached

No browser view (the tests render static markup only); the eduToolsGuide PDF
was not rebuilt or compared (the .tex was read); the lessonReferences.json
verifications were not re-run; no full `--gui` run.

(Written into the tree by the coordinator from the reviewer's hand-back: the
harness refuses report files written by a subagent.)
