# A failed computation is not a result

*Kind: ADR.  Status: BUILT 2026-10-27 on branch `claude/c178-solver-failures`
(DEV.md 4c C178), not merged.  Gate: `check_solver_failures`.*

---

## 1. The three defects, reproduced before they were fixed

An external review (relayed by Vítor, 2026-10-27) named three places where
the line between "a valid result" and "a failed computation" was not drawn.
Each was reproduced first, by a small program compiled against the sources
of `main` at `65b541ead`:

| # | repro | `main` answered | the answer |
|---|---|---|---|
| 1 | `AdaptiveTimeStepper::advance` on dy/dt = y², y(0) = 1, asked to t = 2 | **returned** `ok = 0` after 18 457 sub-steps, the unit's state already set to y = 9.5e153 -- a caller sets t = 2 next | refuse: the solution blows up at t = 1 |
| 2 | `activeSetQP`: min x²/2 s.t. x ≥ 1 | x = 0, `converged = 1`, "KKT satisfied" | x = 1, λ = 1 |
| 3 | `sqp`: min x on [-1, 1], the model evaluable only for x ≤ 0, from x = 0 | x = 0, `converged = 1`, "KKT conditions satisfied" | x = -1 |

and two consequences found while measuring their reach:

| # | repro | `main` answered |
|---|---|---|
| 2b | the A2 reconciliation (`reconcileWeightedLeastSquares`), two quantities measured 1 and 1 under enforced a + b = 1, a - b = 3 | **published** b = -1 as reconciled (no non-negative composition exists) |
| 2c | `sqp`: min x on [0, 2] s.t. x² ≥ 1, from x = 0.1 (feasible; the first linearisation asks for d ≥ 4.95) | x = 1, converged -- after evaluating the model at x = 5.05, **3.05 outside its declared box** |

## 2. Why each happened

1. `advance()` returns the integrator's `ODEStats`, and neither time loop
   read it: `choupoBatch/main.cpp` and `dynamicDriver/DynamicDriver.cpp`
   (behind `choupoCtrl` and `choupoSemiContinuous`) set `t = tNext`, routed
   the outlets, fired the recipe events and wrote the `<t>/` directory over
   a state that stopped short.  The partial state had already been
   scattered into every unit.
2. Nocedal & Wright's Algorithm 16.3 assumes a FEASIBLE start.  The QP an
   SQP iteration hands over starts at d = 0, which violates every constraint
   the iterate violates.  A violated row was neither in the working set nor
   a blocking row of the ratio test, and on a zero step the only test was
   the sign of the ACTIVE multipliers -- so an infeasible point was
   certified.  Its LICQ recovery relied on Gaussian elimination THROWING on
   a singular KKT matrix; with B far from the identity it leaves a round-off
   pivot instead, and the loop cycled to its cap.  Where it did throw, the
   recovery dropped the binding row and FORBADE it, then certified a point
   that violated it -- which is how the reconciliation published b = -1 and
   how the SQP stepped out of its box (the dropped row was the box bound).
3. The SQP's finite-difference lambda differenced the perturbed responses
   without reading `ok`, while the base point and the line search both
   checked it.  `OptimizationDriver`'s evaluator returns `ok = false` with
   whatever f/h/g held when the simulator threw, so the derivative was taken
   against a placeholder.  A response whose h/g were never sized would have
   been read out of bounds.

## 3. The rule, and what was built

**A failed computation is refused by name, or -- where a standard,
announced remedy exists -- remedied aloud.  It is never handed back as a
result.**

1. **The integration.**  `ODEStats` carries `tReached` and `failure` (the
   cause in words: maxSteps, the step below its floor and what drove it
   there, a non-finite or negative state on a fixed step) -- set by
   Rosenbrock23, RK4 and EulerSI.  `AdaptiveTimeStepper::advance` throws
   `IntegrationFailure` on `!st.ok` BEFORE the scatter, naming the interval,
   the time reached and its share of the interval, the cause, the
   statistics, the units (`OdeUnit` gained a `name`) and the remedies.  The
   refusal lives in the one function both loops call, so a caller cannot
   forget to read it; the time is not advanced, nothing is routed, no event
   fires, no trajectory row or time directory is written, and under an
   `outerDict` the throw is a FAILED evaluation (the sweep marks the point
   `nan` and counts it; Nelder-Mead takes +inf; the SQP evaluator `ok =
   false`).  The per-interval runaway guard became declarable,
   `timeSteppingControl { maxSteps N; }` (default: the integrator's own
   2 000 000, unchanged), printed in the header when declared -- so a
   student can watch the guard fire, and so the gate can drive all three
   binaries into the refusal.
2. **The QP.**  At every pass the MOST violated inactive row (scaled by its
   norm) joins the working set -- one per pass, so of two parallel violated
   rows the binding one enters -- and the KKT solve drives its residual to
   zero exactly as it drives an equality's.  This is the posture the solver
   already took for equalities, extended, instead of a separate phase-1 LP:
   no new machinery, and the termination argument is the existing one once
   the point is feasible.  A violated row never blocks the ratio test.  A
   linearly dependent working set is found BEFORE the solve (modified
   Gram-Schmidt, twice) and recovered as before.  "KKT satisfied" now
   requires primal feasibility of EVERY row -- equalities, active and
   inactive inequalities, and rows the LICQ recovery forbade -- within a
   tolerance scaled to the row's own terms; otherwise the result is
   `converged = false`, `infeasible = true`, the violated row named.  The
   reconciliation refuses such a result as a contradiction in the
   `enforce ( ... )` list.
3. **The SQP.**  A response is *usable* only if `ok`, finite and sized
   (`h.size() == nEq`, `g.size() == nIneq`); the base point, every finite
   difference and every line-search trial go through that one test.  A
   forward point that fails -> the backward difference; under central
   differences one side failing -> the one-sided difference on the other;
   each ANNOUNCED in the iteration trace and counted (`fdOneSided`, printed
   by `OptimizationDriver` only when nonzero).  Both sides failing -> the
   SQP stops unconverged naming the variable, the point and the step.  An
   INFEASIBLE QP is answered by Powell's relaxation: the residuals the step
   must remove (every equality, every violated inequality) are scaled by
   the largest θ ∈ [0, 1] for which the QP is consistent -- the set of such
   θ is an interval containing 0, so bisection finds it -- the merit's
   directional derivative uses θ, the trace announces θ and
   `OptimizationDriver` counts the relaxed iterations.  θ = 0 with a
   vanishing step is reported as a LOCAL INFEASIBILITY, unconverged.

   The brief allowed either a named refusal or a restoration step "if it
   can be justified simply".  A refusal was built first and MEASURED: it
   stopped `optim06_integer_stages` at N = 9, 10 and 11 with the
   linearisation at R near the box edge -- which led straight to the
   finding in §4.  The relaxation was kept because an inconsistent
   linearisation is an ordinary SQP event, not a modelling error, and its
   cost is a few QP solves beside one simulator call.  The attribution of
   the relaxation to Powell (1978) is from memory of that paper (the one
   `SQP.H` already cites for the damped BFGS) and was not read back here.

## 4. What the corpus said

Measured with `bin/runTests --scope` over every choupoBatch, choupoCtrl and
choupoSemiContinuous case (79), every `method sqp` outerDict (4), the
reconciliation cases (`analysis01`, `analysis02`, `reconcile01`) and
`basis01`: 89 PASS, 3 EXPECTED-FAIL (unchanged), **1 FAIL**.

* **No time-integrated corpus case reaches `ok = false`.**  The refusal
  fires on none of them; the 79 time cases and their goldens are unmoved.
* **`optim06_integer_stages` moves one golden row:
  `kpi enumeration values_converged_feasible` 6 -> 3**, NOT re-recorded.
  On `main` the SQP "converged" at N = 9, 10, 11 with reflux ratios
  **73.19, 14.26 and 6.75 -- all outside the declared variable range
  R ∈ [1.5, 6.0]** (`system/outerDict`).  These were false certificates of
  exactly defect 2's shape: the QP dropped the binding box row, stepped
  past it, and certified.  Within R ≤ 6 those stage counts cannot meet
  x_D_LK ≥ 0.98 (at R = 6.0 the scaled violation is still 4.4e-2), and the
  SQP now says so -- a local infeasibility, announced.  The best value
  (N = 14) and every pinned number of its replay are unchanged.  Whether
  the case should widen its reflux range to show the trade at 9-11 stages
  is a pedagogical decision and Vítor's.
* `optim04`, `optim05`, `pareto01`: no one-sided difference, no relaxed
  step; their consoles' SQP sections are unchanged.

## 5. What was enumerated, and what was not done

* Every `->integrate(` outside `src/solver/ODE`: `BatchReactor` and
  `FixedBedAdsorber` already refused on `!st.ok`; **`BatchAdsorber`
  discarded it** and committed the partial loadings -- it refuses now.  The
  gate's source arm holds every such call site to reading `.ok`.
* `stepper.advance(` is called from exactly the two time loops.
* NOT covered: a unit's own fixed-step `step()` (inline RK4 in the dynamic
  units), which has no `ok` to read -- a non-finite state there reaches the
  suite's NaN guard, not a named refusal.  NOT built: an elastic (Sℓ1QP)
  mode or a second-order correction; a phase-1 LP for the QP.
  Integrator quirk observed and left: Rosenbrock23 shrinks an ACCEPTED step
  below `hMin` without stopping (the floor is tested only on rejection), so
  the dy/dt = y² refusal reports a last step of 2e-157 s against a floor of
  2e-13 s; the refusal is right, the step history near a singularity is
  longer than it need be.
* The LICQ recovery can still forbid a row that a later step would have
  needed (two opposite rows active at one point, then one dropped by its
  multiplier): the result is then a FALSE "infeasible", reported
  unconverged -- the safe direction -- never a false certificate.

Gate: `check_solver_failures` (probe arm, three binaries end to end, an
outer-driver arm, a source arm; six by-hand sabotages in its docstring).
