# Adsorption isotherms from laboratory data -- an EduTool on the page's own arithmetic, and a proposal for the engine

Status: the EduTool `adsorption-isotherms` is built
(gui/src/ui/methods/AdsorptionIsothermsTool.tsx, the lesson in
gui/src/ui/methods/adsorptionIsothermsLesson.ts, the arithmetic in
gui/src/case/adsorptionIsotherms.ts, tests in gui/tests/adsorptionIsotherms.test.ts).
The engine changes proposed in section 5 are NOT built; they are a proposal for the
maintainers to decide.

## 1. What the page is for

It supports a university course unit on adsorption.  The student's task, in one sentence:
*"I have laboratory equilibrium points (c, q) for a solute on an adsorbent; which isotherm
describes them, with what parameters, and how far can I trust it?"*  The page answers in
six steps: what an isotherm is and what its shape does to a bed (leading to the
`breakthrough` page); the linear, Langmuir and Freundlich models, each derived or stated
with its assumptions and its limits; the classical straight-line fits beside a direct
least-squares fit on q; residuals, RMS, largest relative error, standard errors and a
diagnostic of whether the measured range can separate the models; the single-stage batch
balance as an operating line on the fitted isotherm; and the limits.

## 2. What the engine can and cannot do here (measured 2026-11-12)

* `src/thermo/adsorbent/IsothermModel.cpp`, `IsothermModel::registerBuiltins`, registers
  two isotherm models: `henry` and `langmuir`.  Both are written in the PARTIAL PRESSURE
  of a gas (`pressureBasis partialPressureBar` or Pa in the records under
  `data/standards/parameters/adsorption/equilibria/`), with a van't Hoff temperature
  dependence.
* `src/propertyOps/FitParameters.cpp`, `runIsothermFit` (`fitParameters` with
  `residual.kind isotherm`), regresses Henry or Langmuir to a (T, p, q) dataset by an
  analytic-Jacobian Levenberg-Marquardt in transformed parameters, with identifiability
  modes (single-temperature, Henry-regime) and an SVD condition number.  Its dataset reader
  (`readIsoData`) requires columns named `T`, `p` and `q` and converts `p` as a pressure.
* There is no Freundlich isotherm anywhere in `src/` or `gui/` (searched case-insensitively).
* `batchAdsorber` and `fixedBedAdsorber` work on a gas phase.

Each claim above was re-read in `src/` on 2026-11-12 (integration review), with its line:

| claim | where |
|---|---|
| the engine registers exactly two isotherm models, `henry` and `langmuir` | `src/thermo/adsorbent/IsothermModel.cpp:227` (`registerBuiltins`), `:236` (`henry`), `:242` (`langmuir`) |
| both are in a partial pressure; any other basis is refused | `src/thermo/adsorbent/IsothermModel.cpp:54` (`pressureBasis` read), `:74-79` (only `partialPressureBar` and `partialPressurePa` accepted) |
| `fitParameters` with `residual.kind isotherm` runs `runIsothermFit` | `src/propertyOps/FitParameters.cpp:313` (dispatch), `:2352` (`runIsothermFit`) |
| its dataset must name columns `T`, `p` and `q`, and `p` is converted as a PRESSURE | `src/propertyOps/FitParameters.cpp:2255-2257` (names), `:2261-2262` (refusal), `:2274-2281` (`convP`: `Pa` or a non-affine pressure unit) |
| the loading is read only in `mol/kg` or `mmol/g`; a `mg/g` column is refused | `src/propertyOps/FitParameters.cpp:2283-2290` (`convQ`) |
| there is no Freundlich model | no match for `freundlich` (case-insensitive) in `src/`, `data/` or `docs/ai/` |
| the adsorber units are gas-phase | `src/unitOperations/batch/BatchAdsorber.H:149` (state is the GAS phase only), `src/unitOperations/batch/FixedBedAdsorber.H:34-39` (every gas species integrated, c in mol/m3 of gas) |

So a liquid-phase point (c in mg/L, q in mg/g) has no honest route through the engine:
passing a concentration through a column the engine converts as a pressure would be a
units lie, and Freundlich would still be missing.  The page therefore does its own
arithmetic, and every result panel is marked with the word `page`; the synthetic examples
and the batch inputs carry `assumption`.  The registry's `origins` is
`["page", "assumption"]`.

This is a departure from the Methods workspace's "zero physics in TypeScript" guard-rail
(docs/ai/gui-credo.md section 9), taken with the project owner's approval of the scope:
what the page computes is statistics on the student's own points plus three closed-form
algebraic isotherms printed on the page, not a thermodynamic model the engine owns.  The
day the engine carries a liquid-phase isotherm (section 5), the fits should move there.

## 3. The page's arithmetic

All in gui/src/case/adsorptionIsotherms.ts.

* Models: linear `q = K c`; Langmuir `q = q_max c/(K_L + c)` (equivalently
  `q_max b c/(1 + b c)` with `b = 1/K_L`); Freundlich `q = K_F c^n` (n the exponent, as Geankoplis and the course slides write it).
* Straight-line fits: ordinary least squares of `1/q` on `1/c` (Langmuir:
  `q_max = 1/intercept`, `K_L = slope/intercept`, refused by name when the intercept or
  slope is not positive) and of `log10 q` on `log10 c` (Freundlich).  The linear model has
  no transformation; its fit is `K = sum(c q)/sum(c^2)`.
* Direct fit: minimise `S = sum w_i^2 (q_model - q_i)^2` with `w_i = 1` (absolute
  residuals, the default) or `w_i = 1/q_i` (relative).  Levenberg-Marquardt with
  Marquardt's diagonal scaling, in `ln q_max`, `ln K_L`, `ln K_F` and `n` (positive
  parameters stay positive without a clamp), started from the straight-line fit (or from
  `1.2 max q` and the median c when that fit is refused).  The linear model is solved in
  closed form.
* Standard errors: `Cov = s^2 (J^T W J)^-1`, `s^2 = S/(N - p)`, J in the natural
  parameters at the answer.  Stated on the page with its assumptions (independent errors,
  equal size after weighting, local linearity); a singular `J^T W J` prints infinity.
* Diagnostics (rules of thumb, thresholds written in each sentence): decades spanned
  `log10(c_max/c_min)`; the fraction of the fitted Langmuir plateau at the highest and
  lowest point, `theta = c/(K_L + c)` (below 10 % at the top: the models cannot be told
  apart, only `q_max/K_L` is fixed; below 50 %: `q_max` is read from curvature; above
  50 % at the bottom: no point in the Henry region); fewer than one decade; and
  `|n - 1|/se(n) < 2` (no curvature beyond the scatter).
* Batch: `V c0 + M q0 = V c + M q` with `q = q*(c)` at the target `c = c0 (1 - removal)`,
  so `M = V (c0 - c)/(q*(c) - q0)`.  Amounts are converted to one basis (mg or mmol);
  a mass concentration with a molar loading refuses (the page does not know the molar
  mass), as does a target the adsorbent cannot reach (`q*(c) <= q0`).  A target outside the
  measured range is flagged, with the three models' loadings at that c printed side by side.
* Paste parser: two columns, separated by whitespace, tab, semicolon or a single comma; a
  decimal comma is read inside a whitespace-separated token; `#` starts a comment; a first
  text line is a header, skipped aloud.  Refused by line: a count other than two, a
  non-number, zero or negative values.  Refused overall: fewer than four points, fewer than
  three distinct concentrations.

## 4. The example datasets are synthetic

No measured isotherm was shipped: textbook and handbook tables are no-grant sources and
are not copied (the licence policy of CLAUDE.md section 10).  Each example is GENERATED by
the page from stated parameters and stated noise, with a seeded generator (mulberry32 and
Box-Muller), so the numbers are identical everywhere and the truth is known; each is
labelled synthetic on the page, with its generating parameters printed.

| id | shaped like | generating model and parameters | c range, points | noise |
|---|---|---|---|---|
| `carbon` | an organic solute from water on activated carbon | Freundlich, K_F = 12 mg/g (L/mg)^n, n = 0.35 | 0.01 to 100 mg/L, 12 | 5 % multiplicative |
| `resin` | a metal ion on a chelating resin | Langmuir, q_max = 1.8 mmol/g, K_L = 0.15 mmol/L | 0.02 to 20 mmol/L, 10 | 3 % |
| `dilute` | a trace solute far below saturation | Langmuir, q_max = 80 mg/g, K_L = 400 mg/L | 1 to 30 mg/L, 9 | 4 % |

What the page shows on them (direct fits, absolute residuals, as measured by the tests and
by running the page):

* `carbon`: Freundlich RMS 1.10 mg/g against Langmuir 4.97 and linear 11.9; Freundlich
  recovers K_F = 11.89 +- 0.45 and n = 0.3468 +- 0.0099.  The Langmuir straight-line fit
  (1/q on 1/c) gives q_max = 13.5 mg/g against 58.5 for the direct fit -- the clearest
  demonstration of how the double-reciprocal form weights the lowest concentrations.
* `resin`: Langmuir RMS 0.045 mmol/g against Freundlich 0.249; q_max = 1.786 +- 0.026,
  K_L = 0.148 +- 0.011; the highest point is at 99 % of the fitted plateau; no range
  warning.
* `dilute`: all three fit about equally (RMS 0.065 to 0.087 mg/g); Langmuir q_max =
  64 +- 29 mg/g and K_L = 330 +- 160 mg/L; the highest point is at 8 % of the plateau and the
  page says the models cannot be told apart and that only q_max/K_L is fixed.

## 5. Proposal for the engine (not built)

1. A liquid-phase isotherm record: `pressureBasis` generalised to a declared
   `concentrationBasis` (mass or molar concentration, with its unit), so a record can say
   `q` against `c` without pretending `c` is a pressure.
2. A `freundlich` isotherm model in `IsothermModel::registerBuiltins`, with its refusals
   stated: no Henry limit (`henryLimit` undefined, refused by name where a caller asks
   for it) and no saturation.
3. `fitParameters` `residual.kind isotherm` extended to read a `c` column with a
   concentration unit and to fit `freundlich`, with the existing identifiability modes
   (the Henry-regime mode is exactly the `dilute` example's situation).
4. Then the page would write a props case and run it in the browser like the other
   adsorption pages, and its own fitting code would become a cross-check rather than the
   source of the numbers.

## 6. Validation (2026-11-12)

* gui/tests/adsorptionIsotherms.test.ts (37 tests): noise-free recovery of every model's
  parameters to 1e-8 relative under both weightings, and from a poor start; straight-line
  fits against a hand calculation (sums written out); standard errors against a
  central-difference Jacobian and a written-out 2x2 inverse, and the gradient of S at the
  answer; the paste parser's readings and refusals; the batch balance against a hand value
  (Langmuir 10 mg/g, K_L 2 mg/L, 1 L from 10 to 1 mg/L: q* = 3.333 mg/g, M = 2.7 g) and its
  refusals; reproducibility of the synthetic sets and each set's noisy fit within three
  standard errors of its own truth; the page rendered with no engine.
* Gates: check_lesson_symbols, check_lesson_references, check_method_tools,
  check_edutool_form, check_doctrine, check_guide_pdf_fresh, check_feature_documented.
* NOT validated: any comparison with measured isotherms (none is shipped); the page's
  diagnostic thresholds are rules of thumb, not tests of significance.

## 7. Source check -- every published form the page states, against the book it came from

Read on 2026-11-12 in the library copies named below (page numbers are the books' printed
numbers; Ruthven is a scan read as images, the others by text with the equation images
rendered where the text layer drops them).  The branch was first written from memory; this
table is what reading did to it.

Works read: **G** Geankoplis, Hersel & Lepek, *Transport Processes and Separation Process
Principles*, 5th ed., Pearson 2018, ch. 28 (the course text; the lecture slides, slides
20 to 23, reproduce its Example 28.1-1 equations and the balance in the same symbols);
**W** Wankat, *Separation Process Engineering*, 2nd ed., Prentice Hall/Pearson 2007,
ch. 17; **dH** de Haan, Eral & Schuur, *Industrial Separation Processes: Fundamentals*,
2nd ed., De Gruyter 2020, ch. 6; **S** Seader, Henley & Roper, *Separation Process
Principles with Applications Using Process Simulators*, 4th ed., Wiley 2016, ch. 15
(present in this edition); **R** Ruthven, *Principles of Adsorption and Adsorption
Processes*, Wiley 1984; **ST** Schmidt-Traub, Schulte & Seidel-Morgenstern, *Preparative
Chromatography*, 3rd ed., Wiley-VCH 2020, ch. 2.

| # | form the page states | where I read it | page (file:line) | verdict |
|---|---|---|---|---|
| 1 | linear (Henry) `q = K c` | G Eq. (28.1-1) p. 1348, K in m3/kg; W (17-5b), (17-6b) p. 615-616 (`K' = q_max K`); dH (6.7) p. 165; ST (2.39) p. 31 (`q = H c`); R (2.29) p. 50 (`K'`) | gui/src/case/adsorptionIsotherms.ts:85-87; lesson step 2 `formula` | matches |
| 2 | Freundlich `q = K_F c^n` | G Eq. (28.1-2) p. 1348: `q = K c^n`, "slope is the dimensionless exponent n", dimensions of K depend on n. S Eq. (15-19) p. 463 writes `q = k p^(1/n)`, n in 1 to 5. W Table 17-2 p. 618 lists acetic acid `q = 3.646 c^(1/3.277)`. Not found in R or dH or ST | adsorptionIsotherms.ts:85-87, `PARAM_NAMES` :72-76; lesson step 2 | **differs, corrected**: the branch wrote the exponent `1/n` (as S does) against the course text and slides, which write `n`; now `n`, with the other convention named in the lesson, the guides and here. The `K_F` units `(q)(c)^(-n)` were right |
| 3 | Langmuir `q = q_max c/(K_L + c)` | G Eq. (28.1-3) p. 1348: `q = q_o c/(K + c)`, K in kg/m3; W (17-6a) p. 615 `q_max K_c c/(1 + K_c c)`; dH (6.11) p. 167 `q_max b' c/(1 + b' c)`; S (15-24) p. 464; ST (2.42) p. 32; R (2.28) p. 50 | adsorptionIsotherms.ts:85-87; lesson step 2 | matches. `q_max`, `K_L` are the page's names for G's `q_o`, `K`: `q_0` is already the loading as charged in the batch balance (slide 23, G Eq. 28.2-1), so G's `q_o` would collide; `K_L = 1/b` |
| 4 | Langmuir site balance `k_a c (1 - theta) = k_d theta`, `K_L = k_d/k_a` | R (2.27) p. 50 (`Theta/(1-Theta) = k_a p/k_d = b p`); dH (6.8)-(6.9) p. 166; S (15-21) p. 464; W text p. 616 | lesson step 2 derivation (adsorptionIsothermsLesson.ts:104-112) | matches. Langmuir (1918) itself is not in hand (Crossref metadata only) |
| 5 | Henry limit of Langmuir, slope `q_max/K_L` for `c << K_L` | R (2.29) p. 50; dH (6.7) and its footnote p. 165 (`q_max b = H`); ST (2.43) p. 32 (`b = H/q_sat`); W (17-5b) | lesson step 2 (:115); isotherm diagnostics :370-380 | matches |
| 6 | Langmuir line `1/q = 1/q_max + (K_L/q_max)(1/c)`, plotted `1/q` against `1/c` | G p. 1348 under (28.1-3): "slope is K/q_o and the intercept is 1/q_o"; R (2.32) p. 50, second form `1/q = 1/q_s + (1/(b q_s))(1/p)` | adsorptionIsotherms.ts:213-226; lesson step 3 (:161) | matches. This is the form the course text uses; it is called here the double-reciprocal form (the Lineweaver-Burk form of enzyme kinetics, a name no book in hand uses) |
| 7 | the other Langmuir line, `c/q` against `c`: slope `1/q_max`, intercept `K_L/q_max` | W Example 17-1 p. 619 (`p/q` against `p`); dH (6.12) p. 167 (`c/q`, intercept `1/(q_max b)`); S (15-25) p. 464; R (2.32) first form | NOT drawn by the page; named in the lesson step 3 note | matches. The branch did not mention it; the lesson now says so, because four of the five books use it and each form weights the points differently. A first draft of that sentence gave intercept `1/(q_max K_L)`; the books give `1/(q_max b) = K_L/q_max`, corrected before it shipped |
| 8 | Freundlich line `log q = log K_F + n log c` | G p. 1348 under (28.1-2): log-log plot, slope is n; S (15-20) p. 463 `log q = log k + (1/n) log p` | adsorptionIsotherms.ts:228-236; lesson step 3 (:163) | matches after row 2's correction (S writes `1/n` for the same slope) |
| 9 | batch balance `V c_0 + M q_0 = V c + M q` | G Eq. (28.2-1) p. 1350: `q_F M + c_F S = q M + c S`, S the feed volume; slide 23: `V c_A0 + M q_A0 = V c_A + M q_A`, the page's symbols | lesson step 1 (:59) and step 5; adsorptionIsotherms.ts:607-609 | matches |
| 10 | operating line of slope `-V/M`, final state at its intersection with the isotherm | G p. 1350: "when q in (28.2-1) is plotted versus c the result is a straight line ... the intersection of both lines gives the final equilibrium values" (slope `-S/M` follows from 28.2-1) | lesson step 5 (:255); the batch plot in AdsorptionIsothermsTool.tsx | matches |
| 11 | dose `M = V (c_0 - c)/(q*(c) - q_0)` | algebra on row 9; not printed in the books in hand. Held by gui/tests/adsorptionIsothermsSources.test.ts against G Example 28.2-1: Freundlich `q = 0.199 c^0.229`, 1.0 m3 at 0.21 kg/m3, final `c = 0.062` gives `M = 1.405 kg` (the example uses 1.40 kg) | adsorptionIsotherms.ts:609-632 | matches |
| 12 | favourable isotherm concave, front sharpens (constant pattern); linear or unfavourable front widens with bed length | G sec. 28.3C p. 1354 | lesson step 1 note | matches |
| 13 | loading falls with temperature (adsorption exothermic) | G p. 1348; W (17-7a) p. 616; S Eq. (15-17) | lesson limit `one-temperature` | matches |
| 14 | a liquid-phase isotherm is an empirical fit: the Langmuir mechanism is rarely true there | dH p. 167 ("the physical meaning of q_max and b' is lost ... both parameters can be treated as empirical constants"); R sec. 4.7 p. 121 (vapour-phase models become unreliable near saturation for liquids) | lesson step 2 note | matches |
| 15 | direct least squares on q; `s^2 = S/(N - p)`, `Cov = s^2 (J'WJ)^-1` | no book in hand states it (Kinniburgh 1986 is the page's citation; not in hand). Checked numerically instead: an independent numpy program reproduces every standard error of the three shipped sets to 4 digits (section 8) | adsorptionIsotherms.ts:337-352; lesson step 4 | not found in any source in hand; the formula is the standard nonlinear-regression result and is reproduced by an independent computation |
| 16 | Levenberg-Marquardt step `(J'WJ + lambda diag(J'WJ)) delta = -J'W r` | Marquardt (1963) is cited but not in hand | adsorptionIsotherms.ts:280-335; lesson step 3 | not found in any source in hand; the diagonal scaling is Marquardt's, the update is checked by the vanishing of `J'r` at the answer (test) |
| 17 | RMS `sqrt(sum r^2/N)`, `e_max = max |r/q|`; weights `w = 1` or `1/q` | the page's own definitions | adsorptionIsotherms.ts:189-197 | not a published form; stated as definitions |
| 18 | diagnostic thresholds (10 % and 50 % of the plateau, one decade, two standard errors) | none | adsorptionIsotherms.ts:370-405 | not found in any source in hand; the page says they are rules of thumb (section 3). Soundness discussed in section 8 |

Counts: 18 rows; matches 13 (rows 1, 3 to 6, 8 to 14, with row 7 matching a form the page
now names); differs 1, corrected (row 2: the exponent's convention); not found in any source
in hand 3 (rows 15, 16, 18) plus 1 stated as definition (17).  Freundlich `q = K c^n` is
absent from R, dH and ST.

References on the branch (gui/src/ui/methods/lessonReferences.json and the Theory Guide
`\bibitem`s): Langmuir 1918, Freundlich 1907, Kinniburgh 1986, Bolster & Hornberger 2007,
Foo & Hameed 2010 and Marquardt 1963 are journal articles that are NOT in the library; their
records carry `verified: crossref` evidence.  I re-checked authors, title, container, volume,
pages and year of the first five against api.crossref.org on 2026-11-12 and they agree
(that is a registry check, not a reading of the works: what each paper says is not verified
here).  Ruthven (1984) is in hand: the copyright page reads John Wiley & Sons, 1984, ISBN
0-471-86606-7 (= 978-0-471-86606-0), "A Wiley-Interscience publication".  Five books were
added to the Theory Guide bibliography from their own title and copyright pages.

## 8. Review of the arithmetic and the statistics (2026-11-12)

* **Hand recomputation of the `resin` set** (ten generated points, c from 0.02 to 20 mmol/L;
  the points are listed in the test).  Straight line, `1/q` on `1/c`: slope 0.0767344,
  intercept 0.586224, so `q_max = 1/0.586224 = 1.7058` and `K_L = 0.0767344/0.586224 =
  0.13090`.  Direct least squares on q (independent numpy Levenberg-Marquardt, central
  difference Jacobian, SSR 0.02054, `s^2 = 0.02054/8`): `q_max = 1.7863 +- 0.0264`, `K_L = 0.14776 +-
  0.0112`, RMS 0.04532.  The page prints 1.786 +- 0.026, 0.148 +- 0.011 and RMS 0.045 (this
  note's section 4), and its test file now pins both routes to 2e-4 relative.  The generating
  values are 1.8 and 0.15.  The same program reproduces the other two sets: `carbon`
  Freundlich `K_F = 11.887 +- 0.447`, `n = 0.3468 +- 0.0099`, straight line `q_max = 13.49`
  and direct `58.49` for Langmuir; `dilute` Langmuir direct `64.3 +- 29.4`, `K_L = 328 +- 161`,
  straight line `q_max = 123.8`, `K_L = 642`.  The older test file's hand values (the four
  points c = 1, 2, 4, 8) were re-derived by hand and are right: slope 0.24290, intercept
  0.086439.
* **The diagnostic** computes `theta = c/(K_L + c)` at the highest and lowest measured c from
  the DIRECT Langmuir fit, and `|n - 1|/se(n)` from the direct Freundlich fit, and attaches a
  sentence at fixed thresholds.  Its central claim, that points all below 10 % of the fitted
  plateau cannot separate the three models and fix only `q_max/K_L`, is sound: at `c << K_L`
  Langmuir is `(q_max/K_L) c (1 - c/K_L + ...)`, so a curvature term below a tenth of the
  signal is inside typical scatter (the `dilute` set shows it: `q_max` 64 +- 29).  Two
  limits, both said on the page: `theta` is taken from the fitted plateau, so where Langmuir
  fits badly (the `carbon` set, `K_L` 10 +- 3.5 mg/L) the number describes a bad fit; and
  `|n - 1|/se < 2` is a local-linearity z-score, not a hypothesis test, with no correction
  for having tried three models.  Neither is a defect; both are rules of thumb as stated.
* **Units.**  `K` has units of q over c; Langmuir `q_max` in q and `K_L` in c; Freundlich
  `K_F` in `(q)(c)^(-n)` and `n` dimensionless (G p. 1348: "the dimensions of K depend on the
  value of n").  Amounts are converted to one basis before the balance; `g/L` with `kg/kg`
  and `mg/L` with `mg/g` give the same dose (tested), and a mass concentration with a molar
  loading is refused, the page not knowing the molar mass.
* **Outside the measured range** the page shades `c < c_min` and `c > c_max` on every plot
  and flags a batch target in it with the three models' loadings side by side
  (AdsorptionIsothermsTool.tsx:133, :180, :231, :659); the statement is sound, and is the
  reason to prefer the two-parameter models only where the plateau was measured.
* **Findings and what was changed** are in the integration report; the code and text
  changes are: the exponent notation (row 2), a false sentence in the guide's *Try it*
  (the `carbon` set's double-reciprocal R-squared is 0.846, not "excellent"; the high-R-squared
  example is the `dilute` set, 0.999 with `q_max` 124 against 64 +- 29), the note on the
  other Langmuir line (row 7), and the five book entries.
