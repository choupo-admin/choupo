# When the fast obeys the slow: the `fast-and-slow` EduTool

*Slice record, 2026-11-13.  Commissioned by Vítor the same day ("Eu acho que
isto é tremendamente importante e devia de ser dado de uma forma tão
compelling com case studies que os alunos deviam de querer ler mais aquilo que
um livro de aventura!"), sharpened the same day: the page must come back to
the charge on why engineering correlations are usually so simple.*

## 1. The student's task

> My model is heavy and stiff: which variables can I stop integrating and
> replace by an algebraic relation, and how wrong will I be?

The page answers that first, in its opening panel: the ones whose time scale
is short against the slow one; divide the two, ε = τ_fast/τ_slow; replace each
fast part by the relation that makes its own rate zero; the error falls with
ε, roughly in proportion to it.  Then it lets the student test the answer on
three case studies, each a mystery (a guess before any run), a reveal (the
engine runs BOTH models), a breakage (a slider that makes the fast part slower
until the reduction fails), the cost of the full model, and "what is left when
the fast part obeys": the reduced law, counted against the full one, with its
validity window at a tolerance the student sets.

The opening states the puzzle before any ratio: a plant has more fast motions
than anybody could list, yet the formulas engineers design with have two or
three variables and fit within a design tolerance.  The sister page
`correlation-simplicity` argues that dimensional analysis alone does not
explain that and names scale separation as one mechanism, shown there on a
two-variable toy integrated in the browser; this page shows the mechanism on
running process models, with the engine computing both sides.  The closing
section ("So this is why correlations are simple") puts the three reduced laws
beside the effectiveness factor (`thiele`), a film coefficient or friction
factor (`correlation-simplicity`), the module solved quasi-steady inside a
tank's start-up (`unsteady03`), and the engine's refusal of a loop with no
vessel (quoted verbatim from `src/dynamicDriver/DynamicDriver.cpp:819-822`,
never fired by the page), and ties the price of each simple law to the
validity window the engine attaches to a correlation object
(`FrictionFactorCorrelation.H:128`, `:133`).

## 2. The three case studies, measured

Both models of every case are engine runs of shipped tutorial cases; the page
rewrites one declared number of the FULL case per slider stop and draws the
difference of the two engine curves.  Every stop below was run natively on
this tree before the page shipped (scripts kept out of the tree); every stop
exits 0.  "Gap" is the largest |full − reduced| over the run.

### 2.1 A small tank behind a big one (`unsteady07` / `unsteady08`)

`choupoSemiContinuous`, feed 1e-3 kmol/s, big tank 1 kmol (τ_s = 1000 s),
small tank ε kmol (τ_f = 1000 ε s); both start full of A, the feed steps to
the tracer B.  Reduced: the small tank is a `storageTank` (outlet = inlet)
wrapped as `quasiSteady`, solved at the SAME INSTANT on the big tank's outlet.
Compared quantity: the tracer mole fraction leaving the plant.  Fixed RK4,
Δt = 0.25 s, 5000 s: both runs take 20 000 steps (the driver publishes no
count; the page shows the declared one).

| ε | gap (engine) | ε^(1/(1−ε)) (closed form) | explicit RK4 needs at least |
|---|---|---|---|
| 0.01 | 0.00966 | 0.00954 | 180 |
| 0.02 | 0.01858 | 0.01847 | 90 |
| 0.05 | 0.04281 | 0.04270 | 36 |
| 0.1 | 0.07752 | 0.07742 | 18 |
| 0.2 | 0.13383 | 0.13375 | 9 |
| 0.5 | 0.25006 | 0.25000 | 4 |
| 1 | 0.36793 | 0.36788 | 2 |
| 2 | 0.50003 | 0.50000 | 1 |

The engine sits about 1 % above the closed form at small ε: that is the
router's one-step-explicit hand-off between the two vessels (0.25 s, a 40th of
the smallest τ_f), stated in the case header.  The explicit bound is the
stability limit only; accuracy of the hand-off is what forces the 0.25 s
step.

### 2.2 A fast equilibrium feeding a slow step (`batch30` / `batch31`)

`choupoBatch`, isothermal, A ⇌ B (k_f, k_r = k_f/4), B → C (k = 1e-3 1/s),
10 mol of A, 6000 s, adaptive Rosenbrock23 (rtol 1e-6, 20 s write interval,
so at least 300 steps).  Reduced: one `expression` law, pool → C at
k K/(1+K) c_pool, K = 4.  Compared quantity: n_C over the charge.  Steps are
COUNTED from the step history the engine prints at verbosity 3.

| k_f/k | gap | accepted steps, full (reduced: 319) | explicit RK4 needs at least |
|---|---|---|---|
| 1 | 0.30181 | 413 | 4 |
| 2 | 0.19442 | 446 | 6 |
| 5 | 0.09743 | 473 | 14 |
| 10 | 0.05418 | 485 | 28 |
| 30 | 0.01983 | 490 | 82 |
| 100 | 0.00623 | 491 | 270 |
| 300 | 0.00211 | 485 | 809 |
| 1000 | 0.00063 | 480 | 2694 |
| 3000 | 0.00021 | 476 | 8080 |
| 10000 | 0.00006 | 475 | 26931 |

### 2.3 A reactive intermediate (`batch32` / `batch33`)

`choupoBatch`, A → I (k_1 = 1e-3 1/s) → P (k_2), 5000 s, the same integrator.
Reduced: one `expression` law, A → P at k_1 c_A.  Compared quantity: n_P over
the charge.

| k_2/k_1 | gap | max n_I / n_0 | accepted steps, full (reduced: 274) | explicit RK4 needs at least |
|---|---|---|---|---|
| 1 | 0.36789 | 0.36788 | 359 | 2 |
| 2 | 0.25000 | 0.24999 | 382 | 4 |
| 5 | 0.13375 | 0.13375 | 400 | 9 |
| 10 | 0.07742 | 0.07742 | 412 | 18 |
| 30 | 0.02964 | 0.02964 | 411 | 54 |
| 100 | 0.00952 | 0.00952 | 415 | 180 |
| 300 | 0.00327 | 0.00327 | 412 | 539 |
| 1000 | 0.00098 | 0.00098 | 401 | 1796 |
| 3000 | 0.00033 | 0.00033 | 386 | 5386 |
| 10000 | 0.00010 | 0.00010 | 367 | 17954 |

The gap equals the largest amount of intermediate in transit (a closed
vessel), and equals the two-tank gap at the same ε: the two cases are the
same pair of linear equations.  That coincidence is the page's reveal in
case 3.

### 2.4 What the cost measurement found

The stiff integrator's count barely moves with the ratio (it spends a few
steps on the first moment, then strides on the slow clock), while the
explicit bound grows in proportion to the fast rate and passes the stiff
count above a ratio of about 300.  So, with a stiff integrator, the
reduction's gain here is not speed: it is the fast constants the reduced law
no longer needs (k_f and k_r in case 2, k_2 in case 3), which is exactly the
correlation argument.  The page says this rather than claiming a speed-up it
did not measure.

## 3. What the page does and does not compute

The engine computes every curve.  The page: divides mole numbers by their
total (a fraction), subtracts two engine curves on a common grid (refusing two
grids that differ), counts step-history lines, and draws two closed forms as
labelled CHECKS (the linear gap ε^(1/(1−ε)) and the RK4 real-axis stability
limit 2.785).  No run starts on opening: each case runs on its own button, the
window sweep on another.  No named result enters the page (no source was
needed for the arithmetic of two time scales), and it carries no reference
block.

## 4. Rejected

* **The reduced models as page formulas** (the sister page's Haken model is
  integrated in TypeScript).  Rejected: the point is that the reduced model is
  a case the engine runs, so the student sees the same grammar carry both.
* **The semi-continuous driver's adaptive step count as the cost of case 1.**
  Measured: the routed hand-off is held on the driver grid, so the adaptive
  integrator takes at least one step per driver step and its count is the
  floor; it would have shown a number that measures the declaration.  The page
  shows the declared fixed count and says the driver publishes none.
* **A tank case with the fast tank first.**  It cancels the hand-off delay
  between the two models but makes the master the feed, not a slow variable;
  the slow-first order shows slaving and costs a 1 % delay error, stated.
* **Adding an integrator step count to the engine's KPIs.**  Not done: the
  brief allowed it only after reporting, and the printed step history already
  publishes the count for the reactors.  Recorded as the proposal: a
  `stepsAccepted` KPI on adaptive runs would let a golden pin it.

## 5. Phase 2 (named, not built)

Batch electrodialysis (the film at the membrane against the emptying tank),
and a cascade control loop (a fast inner loop slaved to a slow outer one).
