# The batch write grid from each integrator's own dense output (C473 h / C476)

The defect it fixes is diagnosed in `../2026-11-22-densesparse/README.md`. The
free-stepping batch driver filled its write grid with a cubic Hermite through
h·f(y) at both step ends. On a stiff system that Hermite multiplies a step-end
difference by about λh (1e5 to 1e6) and is itself wrong by that much. On nox03
with seulex at rtol 1e-8, the interior rows sat 4e-2 from a tight reference,
while the step ends were right to about 1e-8.

## What the code now does

The batch write grid comes from each integrator's own dense output:

| integrator | interpolant | source |
|---|---|---|
| Rodas4 | the stage-based continuous extension | Hairer & Wanner II §IV.7; rodas.f CONTRO, coefficients checked digit by digit (`../2026-11-23-rodas4-verify/README.md`) |
| Rosenbrock23 | `ntrp23s` | Shampine & Reichelt 1997, SIAM J. Sci. Comput. 18(1) 1-22 |
| seulex | y0 plus extrapolated right-end derivative data (as seulex.f's CONTEX), with a left end only where two columns support it, capped at order 4 | Hairer & Wanner II §IV.9; Hairer & Ostermann 1990 |
| RK4, EulerSI | cubic Hermite (unchanged) | - |

The pieces:
- The interface is `ODEDenseOutput` and `ODEControls::onDense` in
  `src/solver/ODE/ODEIntegrator.H`, plus `AdaptiveTimeStepper::denseAt` in
  `AdaptiveTimeStep.H`. A dense object is built only when the writer will
  read it.
- A round-off negative is clipped with the integrator's own predicate. When
  that fails, the whole vector falls back to the straight line between the
  step ends, which conserves atoms. The fallbacks are counted and announced.
- The declared key is `solver { denseOutput integrator | hermite; }`, default
  `integrator`. `hermite` restores the old interpolant. A mismatch between
  vessels is refused by name.
- The interpolant is NOT error-controlled. Controlling it took 695 accepted
  steps instead of 95 on nox03 and moved every step end, so it was not adopted.

## Grid error

nox03, 1 ms write grid, case atol 1e-15. Each figure is the worst
|deviation| / column max against a tight Rodas4 rtol-1e-12 reference, for
the dense and sparse linear solver (`gridtable.py`).

| integrator, rtol | Hermite (before) | own dense output (after) |
|---|---|---|
| seulex 1e-6 | 1.5 / 1.5 | 1.4e-3 / 1.1e-3 |
| seulex 1e-8 | 4.0e-2 / 4.0e-2 | 2.4e-4 / 6.8e-5 |
| seulex 1e-10 | 9.2e-2 / 9.2e-2 | 2.2e-4 / 4.1e-5 |
| Rodas4 1e-6 | 1.3e-3 / 1.7e-4 | 1.4e-4 / 1.4e-4 |
| Rodas4 1e-8 | 1.9e-4 / 6.1e-5 | 6.1e-5 / 6.1e-5 |
| Rodas4 1e-10 | 1.2e-4 / 3.9e-5 | 3.9e-5 / 3.9e-5 |
| Rosenbrock23 1e-8 | 4.18e-3 | 4.18e-3 (its step end dominates) |

Step-end level from single-write runs at rtol 1e-8 (`stependlevel.py`):
seulex 8.6e-5, Rodas4 5.8e-5, Rosenbrock23 4.18e-3.

nox02 against Cantera 3.2 at rtol 1e-10, worst of 17 vessels over species above
x = 1e-6 (`nox02_cantera.py`):
- seulex: 3.4e-4 → 5.9e-5;
- Rosenbrock23: unchanged at 8.7e-6;
- Rodas4: unchanged at 3.9e-8.

On non-stiff steps at loose tolerance, seulex's interpolant stays about 4x
the Hermite's, within rtol. Gate arm (i) bounds it on batch06, but it would
not have caught the earlier left-end defect.

## Moved rows (`moved_rows.py` → `moved_rows.tsv`)

Over the whole corpus (666 cases, 44097 files; `bc_dense.py` on one binary,
`hermite` declared for "before"), files moved in 8 cases only. Final states
are unchanged, and no golden pins an interpolated row.

Rows are classed as better, level or worse within a factor 2 of their own
error.

| case | rows moved | worst error old → new | better / level / worse |
|---|---|---|---|
| nox03_millerbowman_large_seulex | 29 of 31 | 4.0e-2 → 6.8e-5 | 11 / 9 / 9 |
| nox02_millerbowman_denox | 19 of 21 | 4.4e-2 → 1.9e-3 | 18 / 1 / 0 |
| nox03_millerbowman_large | 29 of 31 | 4.18e-3 → 4.18e-3 | 0 / 29 / 0 |
| batch06_adaptive_runaway | 59 of 61 | 6.8e-7 → 6.8e-7 | 0 / 58 / 1 |
| batch30 | 192 of 301 | changes <= 7.6e-8 | 0 / 192 / 0 |
| batch31 | 270 of 301 | changes <= 3.7e-8 | 0 / 270 / 0 |
| batch32 | 239 of 251 | changes <= 2.5e-7 | 0 / 239 / 0 |
| batch33 | 187 of 251 | changes <= 4.9e-8 | 0 / 187 / 0 |

Only nox02 and nox03_seulex are materially better; the rest are level. The
worse rows in nox03_seulex had tiny old errors and now sit about 1e-4.

## Other evidence

- nox02 at 1, 2 and 4 threads: stdout, stderr and 404 files are byte-identical
  (`threads_identity.py`).
- The cost is about the same: 104 steps and 3032 right-hand sides either way,
  and evaluating the dense output costs no right-hand sides.
- Opus review: its S1 (the seulex left end degraded non-stiff steps) is fixed,
  along with its S2s (the clip predicate, counted fallbacks, the evidence
  restated per row).
