# Dense against sparse: why the trajectories differ (2026-11-22, branch `densesparse-diag`)

Question (ruled a defect): on `nox03_millerbowman_large`, seulex, rtol 1e-8, `linearSolver dense` and `sparse`
differ by 7.7e-3 of a column max in `trajectory.csv` (n_NO2); Rodas4 1.9e-4; nox02 seulex 0.17 (n_NH).
Base 3e225b8a9.  No engine code was changed.  Everything below is runnable from the tree after `make all`
(scripts in this directory; they write only under `build/`).

## Verdict in one paragraph

The linear solvers are not the cause, and neither is the step controller.  The two runs take the **identical step
sequence** (same t, h to 5 digits; 104 steps, 95 accepted, 9 rejected, 635 factorisations), and the states at the
step ENDS agree to 1e-8 relative or better.  The difference is made in the `trajectory.csv` rows that lie
**between** step ends, which `choupoBatch` fills with a cubic Hermite interpolant (`src/applications/choupoBatch/
main.cpp` 1773-1796: `yw = h00 yPrev + h10 h fPrev + h01 yNew + h11 h fNew`).  On a stiff network the derivative
`f(y)` at a step end changes by ~ (stiffness x step) times the relative change of `y`, and it enters multiplied by
`h`: a 1e-8 difference of a trace species at the step end becomes 1e-2 in the interior.  The interpolant is also
simply wrong by that much: both runs' grids are 4e-2 away from a tight reference (nox03 seulex) -- the dense/sparse
gap is two draws of the interpolant's noise.  The gap is a property of the dense output, not of dense or sparse.

## Measurements

All with `integrator seulex` (and Rodas4 where stated), rtol 1e-8, atol 1e-15 (the case's), analytic Jacobian.

| H | test (script) | number | verdict |
|---|---|---|---|
| H1 | `h1.py`: grid vs step ends, nox03 seulex | grid dev 7.67e-3 (n_NO2), rows at t=1 ms. Fresh runs to E = 1..30 ms (single write = a step end, no dense output): 0 relative difference at csv precision for species above 1e-6 of max, all 30 times | **H1 holds** |
| H1 | `h1b.py`: free stepping (no cap), write 1e-3 / 1e-4 / 1e-5 | grid dev 1.8e-2 / 2.5e-2 / 2.5e-2, steps identical (75 or 84) -- finer writing does not shrink it | the gap does not come from "few interpolation points" |
| H1 | `h1c.py` (b): 1e-5 grid over 3 ms, 66 step ends | rows on a step end: max dev 7.7e-6; interior rows: max 2.5e-2, median 7e-10 | the gap lives in the interior rows |
| H1 | `h1d.py`: grid against a tight Rodas4 reference (rtol 1e-11) at the 30 grid times | seulex: dense grid 4.0e-2, sparse grid 4.0e-2, gap 1.8e-2 | each grid is as wrong as the gap: it is interpolation error |
| H1 | `h1e.py`: rtol sweep, grid dev vs step-end dev | seulex grid dev at rtol 1e-6/-8/-10/-12: 1.2e-2 / 7.7e-3 / 2.4e-3 / 1.0e-3; step ends 0 at every rtol. Rodas4: 1.7e-3 / 1.9e-4 / 1.7e-5 / 7.3e-7 | grid gap decays with the step (the interpolant's order), step ends do not move |
| H1 | `h1f.py`: perturb T0 by 1e-12..1e-9 K (8e-16..8e-13 relative), same solver | same 104 steps; grid dev 2e-8..1e-7; step ends 0 | the interpolant amplifies a round-off-size change by ~1e5; a 1e-8 step-end difference (below) gives 1e-3..1e-2 |
| H2 | `h2.cpp` on 15 dumped W (every 40th factorisation of the dense run, `dumpW.cpp`) and 40 dumped right-hand sides | cond_1(W) 1e19..1e25 (unscaled, near the conservation modes); error against a long-double full-pivot solve: dense <= 3.6e-13, sparse <= 2.5e-13 of \|x\|; dense vs sparse <= 6e-13 (typically 1e-15); backward error ~1e-27 for both | **H2 rejected**: the solves agree beyond round-off by a factor 1e6 below the tolerance. The dense path is NOT equilibrated in the solve (`LU.cpp` 55-67 equilibrates only the pivot TEST); it does not need to be |
| H3 | `h3.py`, `h3b.py`: stats and step history | dense and sparse: identical (t, h) lists; steps/accepted/rejected/Jacobians/factorisations/rhs identical (nox03 seulex 104/95/9/92/635/3032; Rodas4 732/728/4; nox02 84/83/1/76/644/7222). Separation first appears in the interior of the first interpolated step (row t=1 ms) | **H3 rejected**: no accept/reject or order flip differs |
| H3 | `h3b.py` | difference at the 66 accepted step ends of the 3 ms window, species above 1e-12 kmol: worst 9.6e-9 (n_CH2OH 1.0375749e-10, t=2.38 ms) | the solvers differ at 1e-8 relative on trace species at step ends: inside rtol, as expected |
| H4 | `h4.py`, nox02 seulex | worst grid dev 9.0e-2 on T900.n_NH whose column max is **4.7e-31 kmol** (atol 1e-17: 14 decades below the floor, uncontrolled). Among entries above 1e-9 kmol the worst grid dev is 1.05e-9. Step ends: 0 above 1e-9 kmol | **H4 holds for nox02**: the 0.17 is a species at 1e-31 kmol where either run is noise. Not a positivity clip: step ends agree on all controlled species |

Numbers for nox03's other columns: the worst grid columns are all radicals below 2e-7 kmol (n_NO2 2.1e-10, NNH 6e-14,
N 3e-12, NH 2e-13, H2O2 4e-11); the bulk species agree to < 1e-6.

## Root cause

`src/applications/choupoBatch/main.cpp` lines 1773-1796 (the dense-output callback, `freeStep` runs of
`batchReactor`s; C471).  It interpolates the WHOLE vector with a cubic Hermite built from the accepted ends and the
derivative `f(y)` at both.  Two defects, one location:

1. **Error floor**: for a step with lambda*h >> 1 the cubic (error ~ (lambda h)^4/384 times the solution's scale)
   is wrong by 1e-2..4e-2 in trace species on nox03/seulex.  It is not controlled by rtol, which controls step ENDS only.
2. **Sensitivity**: `h * f(y_end)` multiplies the end-state difference by lambda*h.  The two linear solvers, equally
   valid solutions to rtol, differ at 1e-8 relative on trace species at a step end (H3); the Hermite turns that into
   1e-2.  Any change that perturbs the last bits (a compiler flag, a thread count, a platform) would move the grid in
   the same way: so would `linearSolver auto` choosing the other path at 100 rows.

Seulex makes both worse than Rodas4 because it takes very large steps (95 steps for 30 ms against 728), so lambda*h
and the interpolation error are larger; Rodas4 at rtol 1e-12 has a 7e-7 gap.

## Rodas4's 1.9e-4: the same cause

Same step history for dense and sparse (732/728/4), step ends 0 at csv precision, grid dev 1.89e-4 (n_NO).
Against the tight reference the dense grid is 1.9e-4 away and the sparse grid 6e-5: the gap is the Hermite noise.
The gap shrinks 1.9e-4 -> 1.7e-5 -> 7.3e-7 as rtol goes 1e-8 -> 1e-10 -> 1e-12, as the step does (`h1e.py Rodas4`).

## Recommended fix (not applied; `choupoBatch/main.cpp` and `AdaptiveTimeStep.H` are another general's)

In order of preference:

1. **The integrators' own dense output** (Hairer & Wanner): seulex's extrapolated polynomial (`contex` of seulex.f: the
   degree-k polynomial through the extrapolation tableau, error of the order of the step's local error), and Rodas4's
   cubic from its stage values (`contr5` of rodas.f, 3rd order, built from the stages not from f at the end).  Both
   interpolate with the accuracy the step already has, are conservative of linear invariants only if built on the whole
   vector (keep the whole-vector rule), and do not multiply an end-state difference by lambda*h.  Expected effect:
   grid dev dense-vs-sparse falls to the level of the step-end difference, ~1e-8 (the rtol), for both integrators; nox02's
   n_NH-type rows stay noisy at 1e-31 unless item 3.  Needs the integrator to hand the callback the polynomial (an
   `AdaptiveTimeStep.H` interface change).
2. **Land on the write grid** (cheap, no new numerics): where a write is requested, cap the step so each write is a step
   end.  The measurement above is exactly this case: dense vs sparse agree at every step end (30/30 fresh runs).  Cost: at most
   one extra step per write (nox03: +30 on 95).  Loses the C471 speed-up for fine write grids, the reason dense output exists.
3. **Trace species**: report/compare against an atol-relative metric (`|a-b| / max(colmax, atol_scale)`) in the check tools,
   so a 1e-31 kmol column cannot headline a comparison.  Does not change any run.

Not recommended: equilibrating the dense solve (H2 shows both solves are already at 1e-15 normwise), or tightening rtol
(the seulex grid gap falls only 7.7e-3 -> 1.0e-3 across four decades of rtol).

Goldens: item 2 or 1 changes the interpolated rows of every free-stepping batch case whose write interval is shorter than
a natural step (23 adaptive batch cases, 13 of them without a `deltaTmax`; the nox02/nox03 families, the ignition cases);
rows at step ends and every final state do not move.  Count them with the byte-compare harness of the fair-timing review
before deciding.  Item 3 moves nothing.

## Scripts

| file | what |
|---|---|
| `common.py` | run a case in `build/scratch_densesparse/` with a chosen integrator / linearSolver / rtol / end / write grid / T0 |
| `h1.py h1b.py h1c.py h1d.py h1e.py h1f.py` | H1 tests (grid vs step ends, finer grids, interior vs end rows, error against a reference, rtol sweep, perturbation) |
| `h3.py h3b.py` | step statistics, step history, step-end differences |
| `h4.py` | nox02 |
| `dumpW.cpp` | LD_PRELOAD shim: writes every 40th dense W and its right-hand sides from a dense-solver seulex run (see the file for the build line) |
| `h2.cpp` | the W x = b comparison (build line in the file) |

Run: `python3 h1.py seulex nox03`, `python3 h1e.py Rodas4`, `python3 h4.py seulex 1e-8`; for H2 run `choupoBatch` under
the shim on a copy of nox03 with `integrator seulex; linearSolver dense;` and `DUMPW_DIR=build/dumpW`, then `build/h2 build/dumpW`.
