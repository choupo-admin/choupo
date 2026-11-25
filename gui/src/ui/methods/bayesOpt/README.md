# Bayesian-optimisation card (C499 prototype)

A standalone card that teaches Bayesian optimisation (BO).  It is written to be
dropped into the `optimizers` EduTool, which lives on another branch; nothing
here edits the registry, `lessonReferences.json`, an existing lesson or `src/`.

| file | what it is |
|---|---|
| `gp.ts` | pure math: RBF kernel, Cholesky GP (GPML Algorithm 2.1), expected improvement (Jones et al. eq. 15), the two test functions, the EI step, a one-variable gradient SKETCH |
| `bayesOptLesson.ts` | lesson as data: `BAYES_STEPS` (6), `BAYES_LIMITS` (7), `BAYES_QUIZ` (4), `BAYES_REFERENCES`, `ENGINE_STATUS` |
| `BayesOptCard.tsx` | the interactive card, `export function BayesOptCard()` |
| `../../../../tests/bayesOpt.test.ts` | 29 tests: hand-computed GP values, EI values, band shrinkage, the loop, the dip failure, lesson structure, one static render |

## What the card shows

1. When one evaluation is the expensive thing (problem statement).
2. The GP prior and the RBF kernel (length-scale slider).
3. Conditioning on the calls (eqs. 2.25, 2.26, Algorithm 2.1; 95 % band; noise slider).
4. Expected improvement (eqs. 14, 15 of Jones et al.), drawn under the plot.
5. The workbench: setting selector (smooth / narrow dip), Next-point button, reset, two sliders, counters of calls for BO and for a gradient SKETCH at an equal budget, a cost-per-call selector (1 ms / 1 min / 1 h) turning counts into wall time; then the loop and the fair count.
6. When BO is the wrong tool: cheap calls, many variables, a narrow feature, no multipliers.
Then LIMITS, a 4-question quiz and the references.

The card states, in a yellow alert and in the first LIMIT, that the engine does
not offer the method yet, that an opt-in `method bayesian;` is being built and
measured against `sqp`, and that the card will cite it if offered.  Update that
sentence (`ENGINE_STATUS`) when the engine lands the method, citing the measured
case.

## Plugging it into `optimizers` (not done here)

1. **Registry** (`gui/src/ui/methods/registry.ts`): the card is a section of the
   `optimizers` tool, not a tool of its own.  Import `BayesOptCard` in the
   tool's component and render it as one card/section; if the tool is lazy, the
   card is a pure React component with only Mantine and local imports.
2. **Lesson data**: either keep `BAYES_STEPS`/`BAYES_LIMITS`/`BAYES_QUIZ` here,
   or merge them into the tool's lesson module.  If the tool's `LessonQuiz`
   already exists, pass it `BAYES_QUIZ` with `lesson={BAYES_STEPS}` (step
   numbers are local to this card, 1..6).  Chapter slugs come from the step
   titles (`chapterSlug`), which are unique.
3. **References**: the card draws `BAYES_REFERENCES` itself because
   `LessonReferences` needs a `MethodToolId`.  When plugged in, delete that
   block and add these entries to `lessonReferences.json` under
   `lessons.optimizers.references` (verification fields as below), and let
   `LessonReferences` draw them:

```json
{
  "text": "Rasmussen, C. E.; Williams, C. K. I. (2006). Gaussian Processes for Machine Learning. MIT Press. ISBN 026218253X.",
  "url": "https://gaussianprocess.org/gpml/",
  "note": "Algorithm 2.1 (p. 19), eqs. (2.25), (2.26) (p. 17), eq. (2.31): the Gaussian-process predictor and the squared-exponential kernel.",
  "verified": { "method": "pdf", "evidence": "gaussianprocess.org/gpml/chapters/RW2.pdf read: Algorithm 2.1 on book p. 19 (lines 2-6: Cholesky, alpha, mean eq. 2.25, v, variance eq. 2.26); eqs. (2.25) and (2.26) on p. 17; kernel with noise as eq. (2.31); running footer 'ISBN 026218253X. (c) 2006 Massachusetts Institute of Technology'", "date": "2026-11-24" }
},
{
  "text": "Jones, D. R.; Schonlau, M.; Welch, W. J. (1998). Efficient Global Optimization of Expensive Black-Box Functions. Journal of Global Optimization 13(4), 455–492.",
  "doi": "10.1023/A:1008306431147",
  "note": "Eqs. (14) and (15): the definition and the closed form of the expected improvement.",
  "verified": { "method": "crossref", "evidence": "api.crossref.org/works/10.1023/A:1008306431147: authors, title, container, volume 13, issue 4, pages 455-492, year 1998 matched; full text (stat.ubc.ca/~will/docs/JonSchWel1998_global_optimization.pdf) read: eq. (14) E[I(x)] = E max(fmin - Y, 0), eq. (15) the closed form, section 4.1, journal pp. 471-472", "date": "2026-11-24" }
},
{
  "text": "Shahriari, B.; Swersky, K.; Wang, Z.; Adams, R. P.; de Freitas, N. (2016). Taking the Human Out of the Loop: A Review of Bayesian Optimization. Proceedings of the IEEE 104(1), 148–175.",
  "doi": "10.1109/JPROC.2015.2494218",
  "note": "Further reading: the method, its acquisition functions and its difficulties in many variables.",
  "verified": { "method": "crossref", "evidence": "api.crossref.org/works/10.1109/JPROC.2015.2494218: authors, title, container, volume 104, issue 1, pages 148-175, year 2016 matched", "date": "2026-11-24" }
},
{
  "text": "Nocedal, J.; Wright, S. J. (2006). Numerical Optimization, 2nd ed. Springer. ISBN 978-0-387-30303-1.",
  "doi": "10.1007/978-0-387-40065-5",
  "note": "The quasi-Newton, finite-difference and backtracking ideas the gradient sketch borrows.",
  "verified": { "method": "crossref", "evidence": "api.crossref.org/works/10.1007/978-0-387-40065-5: authors, title, publisher Springer, year 2006, ISBNs 9780387303031 (print) and 9780387400655 (electronic) matched; the edition number is not in the Crossref record", "date": "2026-11-24" }
}
```

   Hold them to `bin/curate/check_lesson_references.py` after adding (a
   `pdf` verification there refers to the project's literature folder; use
   `web` for the GPML entry if the gate wants a stored file).
4. **Guides (CLAUDE.md rule 4d)**: the card is NOT done until the Theory
   Guide has a labelled section (kernel, eqs. 2.25-2.26, EI eq. 15, with the
   equation numbers above), the block's Theory link opens it
   (`gui/src/case/modelDocs.ts`), and the Tutorials Guide and
   `docs/ai` carry it; PDFs rebuilt.  None of that was done in this slice.
5. **Gates a plugged-in card meets**: `check_lesson_symbols` (every formula
   symbol is glossed: check the `\bar f_*`, `\mathbb{V}`, `\mathbf{k}_*`
   tokens), `check_lesson_absence_claims`, `check_lesson_typed_numbers`,
   `check_lesson_knob_domains` (the two sliders need declared validity:
   ell 0.01..0.5 on x scaled to 0..1; noise 0.001..0.5), and the lesson test
   files.  This prototype ran none of them (the machine was loaded and
   the card is outside the registry).

## What could not be verified

* The MIT Press page for GPML returned HTTP 403; the book was verified from
  the authors' own chapter PDF (equations, algorithm, ISBN, copyright line).
* The Springer page for Jones et al. redirected to a login; the paper was
  verified by Crossref and by its full-text PDF on the author's university page.
* Nocedal & Wright's edition ("2nd ed.") rests on the ISBN, not on a page read.
* The claim in step 6 that BO suits "a handful of variables, not hundreds" and
  that the model needs exponentially more points is the author's reasoning, not
  a quoted result; the Shahriari review is given as further reading for it and
  its text was not read for this slice.
* No screen has been seen by an architect; the card was rendered only as static
  markup in a test.  The gradient method and the 801-point grid are sketches.

## Plugged in (C499, 2026-11-25)

The card is now step 7 to 12 of the `optimizers` tool (`<BayesOptCard inTool />` in `OptimizersTool.tsx`; its limits and quiz are folded into `OPT_LIMITS_ALL` / `OPT_QUIZ_ALL`, its steps shifted by `BAYES_STEP_OFFSET`).  Three of the four references are in `lessonReferences.json` under `optimizers`; Nocedal and Wright was already there under the same DOI.  The engine status sentence now states the measured result.  Standalone (`<BayesOptCard />`) still draws its own limits, quiz and references.
