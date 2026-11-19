# EduTools batches O and P, and the whole sweep

Read-only on main, 2026-11-19, at Vitor's request.  Evidence with file:line:
[edutools-o.md](edutools-o.md) (caseAssembly, runLog, plantRun = running-cost
economics, operatorPanels, dataSources = property-data sources,
databaseToParameters, correlationSimplicity) and
[edutools-p.md](edutools-p.md) (frontEndLoading, campaignPlan, demandForecast,
ipStrategy, patentExpiry, sinesPta, siteProcessPrice).

## Wrong

1. **databaseToParameters step 6 (and Tool :513): "severe fits are no longer
   promoted; 17 old ones remain".**  `bin/curate/pairs_c283.py:170` now reads
   `NOT_PROMOTED_GRADES = ("refused",)` (C333 reversed the rule), and the
   catalogue holds 79 severe NRTL records.
2. **databaseToParameters step 1: "curated pairs fix a = 0 and alpha =
   0.30"**, contradicted by `nButanol-water.dat` (alpha 0.446, a +-4.1, the
   record the page's own LLE row cites), `ethanol-water.dat` (a != 0) and
   `1Propanol-water.dat` (alpha 0.40).
3. **runLog step 4:** flash13's normalised final residual is 4.4550e-16 at
   `runLogLesson.ts:139` and 1.8432e-13 at `:150`; the second is stale.
4. **correlationSimplicity step 14:** "16 % by 1e5, 42 % by 1e7" is relative
   to Gnielinski, while the spread the page defines and plots
   (`CorrelationSimplicityTool.tsx:789-791`) gives 19.6 % and 71.7 %.  The
   12 % at Pr 0.7 uses the plot's basis: two denominators in one sentence.
5. **frontEndLoading: "no part of the engine reads a vendor quotation"**
   (`frontEndLoading.ts:339`), false since C98 (`DeclaredQuote.H:24-56`).
6. **demandForecast: the "factor that would fill the plant" column is
   Q/mean(M s phi)** (`DemandForecastTool.tsx:381`,
   `demandForecastMath.ts:384`).  Step 6 and the note below (`:393`) define
   Q/mean(M s), so the two disagree by phi; `demandForecast.test.ts:170` pins
   the column.

## Suspect, the most useful

- **dataSources:** CODATA is classed no-grant ("local only"), yet the Burcat
  exercise and the picker tell the student to take values from it.  The
  picker says "fit one laboratory, hold out another" while
  databaseToParameters says fit all.
- **demandForecast step 7:** it does not say that years after the pasted
  `rampUp` run at full production (`EconomicsPass.cpp:1027-1030`), or that a
  list longer than `projectLife` is refused.
- **patentExpiry:** "erosion twice as deep" goes from 79 % to 89.5 %.
- **siteProcessPrice:** Y = m_P/(n_L M_P) assumes 1:1 stoichiometry.
- **campaignPlan step 6:** the second tank returns the limit to the dryer only
  above 3.5 h; between 3 and 3.5 h the press paces.
- **runLog:** "both end blocks always print" fails at verbosity 0.
- **caseAssembly:** `layoutDict` and `constant/reactions` are missing from the
  optional list.
- **correlationSimplicity step 3:** "64" should be 32 once the conventional 2
  is dropped.

## Verified

- Every citation in plantRun, dataSources, databaseToParameters and the batch
  plan.
- The operatorPanels numbers.
- The AACE band arithmetic.
- sinesPta and the patentExpiry market figures (FDA 2019 / EC 2009 pages).
- The ipStrategy legal references (the Portuguese CPI articles were not
  checked).
- No competitor named and no unsourced figure.

## The whole sweep (75 lessons, 2026-11-19)

All 75 lessons are now reviewed, in docs/reviews/2026-11-19-* (rate-based,
adsorption, units-correlations-edutools, batch-cd ... batch-op): about 80
wrong statements, every one demonstrated.  The classes recur, so fixing them
one by one will not stop them:

1. **Prose `file:line` citations drift.**  They do in almost every batch, and
   no gate reads the prose.  The fix is a gate that resolves every citation in
   lesson prose and Tool text against a needle string, as `EM_CITATIONS`
   already does for one lesson.
2. **"We do not have X" sentences outlive X** (boron, glucose Cp, vendor
   quotes, severe fits, weighting, falling-rate tables).  This is the BURY THE
   ABSENCE rule of CLAUDE.md §10, missed at the lesson layer.  A capability
   commit should grep `gui/src/ui/methods/` for its absence phrases.
3. **A correction reaches the Lesson and not the Tool**, or the reverse
   (processSafety C259, bund, demandForecast), and the ban-tests check only
   one file.  Ban-tests should scan both.
4. **Typed numbers drift from the goldens** (limitingReactant, runLog,
   psychro).  A lesson number taken from a witness should be read from its
   `expected`, or pinned by a test that reads it.
5. **Sliders leave the model's domain** (Levenspiel into the vapour, merkel
   and drying into supersaturation, McCabe q > 1, saltMixing past the Pitzer
   range).  The knob ranges should come from the validity the engine
   declares.
