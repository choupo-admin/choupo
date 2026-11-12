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
  `q_max b c/(1 + b c)` with `b = 1/K_L`); Freundlich `q = K_F c^(1/n)`.
* Straight-line fits: ordinary least squares of `1/q` on `1/c` (Langmuir:
  `q_max = 1/intercept`, `K_L = slope/intercept`, refused by name when the intercept or
  slope is not positive) and of `log10 q` on `log10 c` (Freundlich).  The linear model has
  no transformation; its fit is `K = sum(c q)/sum(c^2)`.
* Direct fit: minimise `S = sum w_i^2 (q_model - q_i)^2` with `w_i = 1` (absolute
  residuals, the default) or `w_i = 1/q_i` (relative).  Levenberg-Marquardt with
  Marquardt's diagonal scaling, in `ln q_max`, `ln K_L`, `ln K_F` and `1/n` (positive
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
  `|1/n - 1|/se(1/n) < 2` (no curvature beyond the scatter).
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
| `carbon` | an organic solute from water on activated carbon | Freundlich, K_F = 12 mg/g (L/mg)^(1/n), 1/n = 0.35 | 0.01 to 100 mg/L, 12 | 5 % multiplicative |
| `resin` | a metal ion on a chelating resin | Langmuir, q_max = 1.8 mmol/g, K_L = 0.15 mmol/L | 0.02 to 20 mmol/L, 10 | 3 % |
| `dilute` | a trace solute far below saturation | Langmuir, q_max = 80 mg/g, K_L = 400 mg/L | 1 to 30 mg/L, 9 | 4 % |

What the page shows on them (direct fits, absolute residuals, as measured by the tests and
by running the page):

* `carbon`: Freundlich RMS 1.10 mg/g against Langmuir 4.97 and linear 11.9; Freundlich
  recovers K_F = 11.89 +- 0.45 and 1/n = 0.3468 +- 0.0099.  The Langmuir straight-line fit
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

## 7. To check against the source

Added 2026-11-12 by the builder of the `batch-adsorption` page, at the
coordinator's request.  One row per equation the page states from a published
work.  `unchecked` means written from the published form as remembered; no
row here has been read back against the work it names.  The reviewing session
holds the books and checks each row.

| What | Published work | Where on the page | Status |
|---|---|---|---|
| Langmuir isotherm, site balance `k_a c (1 - θ) = k_d θ` and `q = q_max c/(K_L + c)` (equivalently `q_max b c/(1 + b c)`, `b = 1/K_L`) | Langmuir, J. Am. Chem. Soc. 40 (1918) 1361-1403, doi:10.1021/ja02242a004 (written there for gases, in pressure) | `gui/src/ui/methods/adsorptionIsothermsLesson.ts` step 2; `gui/src/case/adsorptionIsotherms.ts` `isothermQ` | unchecked |
| Freundlich isotherm `q = K_F c^(1/n)` | Freundlich, Z. Phys. Chem. 57U (1907) 385-470, doi:10.1515/zpch-1907-5723 | lesson step 2; `isothermQ` | unchecked |
| Linear (Henry) isotherm `q = K c` and the Langmuir low-c limit `q_max/K_L` | Ruthven, *Principles of Adsorption and Adsorption Processes*, Wiley 1984 | lesson step 2 | unchecked (the limit is also derived on the page) |
| Double-reciprocal linearisation `1/q = 1/q_max + (K_L/q_max)(1/c)` | Bolster & Hornberger, Soil Sci. Soc. Am. J. 71 (2007) 1796-1806, doi:10.2136/sssaj2006.0304 | lesson step 3; `linearisedFit` | unchecked (also derived on the page; the noise-free recovery test holds the algebra) |
| Logarithmic linearisation `log q = log K_F + (1/n) log c` | Kinniburgh, Environ. Sci. Technol. 20 (1986) 895-904, doi:10.1021/es00151a008 | lesson step 3; `linearisedFit` | unchecked (the noise-free recovery test holds the algebra) |
| Levenberg-Marquardt step with Marquardt's diagonal scaling | Marquardt, J. SIAM 11 (1963) 431-441, doi:10.1137/0111030 | lesson step 3; `directFit` | unchecked |
