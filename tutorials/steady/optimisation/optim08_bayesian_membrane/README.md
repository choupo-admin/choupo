# optim08_bayesian_membrane -- Bayesian optimisation, one tool for an expensive simulation

The problem is that of `optim04_membrane_recovery_scaling` (maximise brackish-RO water
recovery over the feed pressure and the number of modules, subject to the gypsum and
calcite wall-scaling limits), solved by the OPT-IN method `method bayesian;`.

## What Bayesian optimisation is, in five lines

1. Every simulation result is kept.
2. A Gaussian process (a smooth statistical model of the function, with an error band)
   is fitted to the results, one for the objective and one for each constraint.
3. The next simulation is where the model says the gain is largest: the *expected
   improvement* over the best feasible value so far, times the *probability that every
   constraint holds*.
4. The run prints that prediction (mean and 95 % band) BEFORE the simulation and the
   outcome after it, so you see when the model was wrong.
5. It pays off when one simulation is expensive and the response is smooth; it has NO
   multipliers (no shadow prices, no KKT certificate), so finish with `method sqp`
   from its best point.

Theory: Theory Guide, "Bayesian optimisation for an expensive simulation".
Options: `options { budget 20; seed 1; eiTol 0; }` (`nInit`, default 2n+2 start points,
the first being the declared `initial`).  Failed evaluations never enter the model as
numbers.

## Run it

```
runCase tutorials/steady/optimisation/optim08_bayesian_membrane       # bayesian
runCase tutorials/steady/optimisation/optim04_membrane_recovery_scaling   # sqp, same start
```

The history is `optimization_history.csv` in each case.  Simulations to come within a
fraction `tol` of the best known feasible value `f* = 0.3974520224` (best of a 862-point
grid of this case): the first feasible row with `(f* - best)/f* <= tol`.

## ONE run per method, from the same start (feed 14 bar, 5 modules)

| method | simulations run | to 1e-2 of f* | to 1e-3 of f* | best value |
|---|---|---|---|---|
| `bayesian` (seed 1, budget 20) | 20 | 19 | not within 20 | 0.394105 |
| `sqp` (central differences, optim04) | 25 | 25 (its second iteration) | 25 | 0.3974514 |

Read it plainly: from a good start, `sqp` is as cheap here and lands on the optimum with
its certificate and its shadow prices.  Over five seeds of the Bayesian method (budget 30,
same start) it came within 1e-2 after 19, 22, 20, 27 and 18 simulations (median 20) and
within 1e-3 on one seed of five (24).  In a separate comparison from random starts in the box
(protocol `docs/audits/2026-11-24-c499-protocol.md`, results
`docs/audits/2026-11-24-c499-results.md`, median of five seeds) the Bayesian method needed
15 simulations to 1e-2 against 25 for `sqp` with central differences, and reached 1e-3 on
only 2 of 5 seeds (`sqp`: median 53).  This case costs about 0.01 s per simulation, so the
count is the only thing it shows; it is not a case where the method is needed.

## When it is the WRONG tool: the reactive MTBE column (column19)

On `tutorials/steady/distillation/column19_mtbe_reactive_mesh` (reactive full-MESH column,
about 20 s per simulation; minimise the reboiler duty over the boil-up ratio [2, 6] and the
pressure [5, 9] bar with conversion >= 0.985; best known 4654.55 kW) the Bayesian method
needed 23 simulations to come within 1e-2 against 22 for `sqp` (median of five seeds), so it
was NOT cheaper.  14 to 18 of its 25 simulations FAILED: the space-filling start spends its
budget in the part of the box where the column does not converge (a failed run is counted,
shown, and never used as a number).  The method pays off only where the whole box can be
simulated.  Source: `docs/audits/2026-11-24-c499-results.md`, table (b).
