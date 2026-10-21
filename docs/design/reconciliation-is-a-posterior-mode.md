# Reconciliation is a posterior mode

*DEV.md 4c C121, 2026-10-20.  Vítor: "Há outra coisa que os meus alunos não
sabem: reconciliação de dados em controlo de processos e como Bayes pode
ajudar!"  Scope approved the same day: four pages (no Kalman filter),
synthetic data, the "Hydraulics & control" shelf.  Kind: ADR.  Status:
built on a branch (`claude/c121-data-reconciliation`).*

## 1. What existed, measured

The engine already held the arithmetic.  `streams/AnalysisReconciler`
(slice A2 of [`aqueous-analysis-inlet-scope.md`](aqueous-analysis-inlet-scope.md)
§9) solves `min Σ((x−m)/σ)²` under declared linear laws through
`solver/ActiveSetQP`, generic over its rows and thermo-free by construction,
and publishes per-row corrections with an exact per-constraint attribution.
What did not exist anywhere in `src/`: a flowsheet (plant flow)
reconciliation, a gross-error test, a posterior covariance, or anything
Bayesian.

## 2. The decisions

**One operation, one weighted least squares.**  A props-bench op,
`dataReconciliation` (`src/propertyOps/DataReconciliation.{H,cpp}`, registered
explicitly in `PropertyOperation::registerBuiltins`), reads a declared network
(streams with each meter's σ, nodes with their in/out streams, an optional
`syntheticTruth`), one snapshot of readings, an optional per-flow prior, an
optional `exclude` and an exercise-only `syntheticDrift`, and hands the
problem to `analysis::reconcileWeightedLeastSquares`.  It writes no QP of its
own; a source arm of the gate refuses one.

**The statistics are computed beside the answer, in closed form**, because
the reconciler returns the answer and not its distribution: each balance's
residual and its standard deviation `sqrt((A C Aᵀ)_kk)`; the global test
(the objective against χ² with ν = the number of independent balances left);
the measurement test `a_j / sqrt(V_jj)`, `V = C Aᵀ (A C Aᵀ)⁻¹ A C`, against the
two-sided normal critical value at the Šidák level `1 − (1 − α)^(1/N)`; the
posterior covariance `C − V`.  α is REQUIRED -- the false-alarm probability a
plant accepts is a decision, not a constant.  The χ² tail is the regularised
incomplete gamma function by its series and its continued fraction (as given
in Abramowitz & Stegun's *Handbook of Mathematical Functions*), every quantile
by bisection; hand-rolled, no library.

**The Bayesian reading is the point, and it costs nothing.**  With Gaussian
meters the likelihood is `∏ exp(−(m_j − x_j)²/2σ_j²)`; with a flat prior on the
balance subspace the posterior is that likelihood on `A x = 0`, its mode is the
weighted least squares, and its covariance is `C − V` exactly.  So the op
publishes one answer and the page reads it twice.

**A non-flat prior is EXACT, by completing the square.**  For a flow with a
reading `(m, σ)` and a prior `(x₀, s)`:

    (x − m)²/σ² + (x − x₀)²/s² = (x − m*)²/σ*² + (m − x₀)²/(σ² + s²)

with `1/σ*² = 1/σ² + 1/s²`, `m* = σ*²(m/σ² + x₀/s²)`.  The second term is
free of x, so the posterior mode and covariance are those of the same
reconciliation on the pseudo-measurements `(m*, σ*)`.  It is published apart
as the prior-data conflict (χ², one degree of freedom per flow with both).
The gate proves the exactness by a route that never forms a
pseudo-measurement: one KKT solve over all flows with the reading and the
prior stacked as two measurements of the same flow.  The prior is DIAGONAL by
construction and the run says so: a reconciled estimate carried over from
yesterday is correlated, and that information is not carried.

**A meter out of service is a projection, not a large σ.**  The unmeasured
columns `A_u` are eliminated exactly -- the rows of `P` span the left null
space of `A_u` (Gaussian elimination on `[A_u | I]`), each projected balance
is named after the node balances it combines (`reactor+separator`), and the
unmeasured flows are read back as `−(A_uᵀA_u)⁻¹A_uᵀA_m x̂_m` with covariance
`L Σ Lᵀ`.  An excluded meter's reading gets its offset from that estimate and
its test `(m − x̂)/sqrt(σ² + Σ_jj)` -- which on the witness EQUALS the
measurement test the same meter scored in service, the identity page 3 is
built on.  An unobservable set (a flow that could circulate round the
excluded streams) and a set that leaves no redundancy are refused by name.

**The Gaussian statistics are refused where they do not hold.**  When the
reconciler's non-negativity bound binds, the posterior is a truncated
Gaussian; the op refuses rather than publish tests and a covariance that
assume otherwise.

## 3. A defect found in the one home, and fixed there

The first probe that planted F6 30 t/h low gave a NEGATIVE reading, and the
reconciler returned F6 = −18.27 t/h with no bound flagged.  The active-set
solver starts at the step d = 0, i.e. at the measurement, and an active-set
method needs a feasible start; a negative measurement violates its own bound
there.  The laboratory analysis never passes a negative value, so it never
showed.  Fixed in `AnalysisReconciler.cpp`: when any row is negative, the
problem is shifted (`u = v + u₀`, `u₀_r = −m_r/σ_r` on those rows), which puts
the start on the bound; the gradient of `½|v + u₀|²` is `u`, so the KKT
identity the attribution rests on is unchanged.  With every measurement ≥ 0,
`u₀ = 0` and the solver sees the same problem as before: `analysis01` and
`analysis02` were run with a build of `main` and with this branch and are
byte-identical (stdout, `converged/`, every report), and
`check_aqueous_analysis` / `check_aqueous_reconciliation` pass.  The reconciler
also publishes `multiplierAsWritten` -- its sigma-space multiplier divided by
the norm it scaled the row by, i.e. the λ of `x = m − C Aᵀ λ` -- so a caller
can show the textbook statement without knowing the scaling (it was computed
and discarded as `(void)rowScale[k]`).

## 4. Rejected alternatives

* **A second weighted least squares** -- in the op (the closed form is three
  lines) or in TypeScript.  Either would be a second home for the method,
  printed beside the first under the same heading.  The op computes only what
  the answer does not carry; the page computes nothing.
* **The prior as extra QP rows.**  The reconciler has one row per quantity;
  two measurements of one flow are not expressible there, and the completed
  square is exact anyway.
* **An excluded meter as a huge σ.**  Inexact by construction, and it leaves
  the conditioning to luck.  The projection is the exact statement.
* **Publishing the tests when a bound binds.**  They would be wrong, quietly.
* **A fifth page on the Kalman filter** -- set aside by Vítor's ruling; the
  limits block names it.
* **A composition (bilinear) balance in the witness.**  The commission allowed
  one optionally; it needs an iterative reconciliation the engine does not
  build, and a page that reconciled it by the linear method would teach a
  wrong answer.  Named as not done.

## 5. The witness and the page

`tutorials/props/reconciliation/reconcile01_recycle_loop`: an invented
recycle loop (mixer, reactor, separator, purge splitter; seven metered
streams; four balances), every number synthetic and said so.  Four
operations: `honest`; `drifted` (F3 planted +15 t/h); `driftedWithout` (F3
excluded); `yesterday` (a 2 % prior per flow).  Golden: 234 `diag` rows and 44
hand-declared `csv` rows (the cells no diagnostic carries).

The EduTool "Data reconciliation, and how Bayes helps"
(`gui/src/ui/methods/DataReconciliationTool.tsx`, lesson
`dataReconciliationLesson.ts`, readers `dataReconciliationRun.ts`) runs the
witness in the browser.  Page 3's knobs plant the drift on any meter and size
by overriding the propsDict and re-running the engine; the gate runs both
ends of the knob's range on every meter, so a range that pressed a flow
against zero fails a gate instead of a student.

## 6. Gates

`check_data_reconciliation` -- arms (a)-(i); five by-hand sabotages recorded in
its docstring, all caught.  `gui/tests/dataReconciliationLesson.test.ts` holds
the page to the witness and every `file:line` the lesson cites to its line.

## 7. Not done

A component or energy balance (bilinear); a correlated prior; serial
elimination or generalised-likelihood-ratio tests for several gross errors at
once; any real plant's data; dynamic (recursive) estimation.
