# SparseLU speed (2026-11-22, branch `sparselu-speed`, C473 e)

Question: callgrind on nox03 (seulex, rtol 1e-8) charged `SparseLU::factor` 243 M Ir (17 %) for 635 factors,
~383 k Ir each for a 52 x 52 matrix.  Overhead, or arithmetic?

## Where the 383 k went (measured before any change)

* The matrix is nearly dense: n = 52, 2145 of 2704 entries in the pattern, 2530 in L + U (94 % of dense),
  38 101 multiply-adds per factor (dense n^3/3 = 46.9 k).
* 383 k / 38.1 k = about 10 Ir per multiply-add: the inner loop `w[Li[s]] -= Lx[s] * ujk` (index load, two
  value loads, multiply, subtract, store, loop) is the cost.  The symbolic stage is already once per pattern,
  `factor()` already allocates nothing, no maps.  The row equilibration and the column gather are about 2 k
  entries (under 5 %).  There was no overhead to remove, only the shape of the loop.
* `solve`: 27 k Ir per call (2 x 2530 indexed updates) and one result vector allocated per call.

## What changed (bit-identical)

`src/solver/SparseLU.cpp`, `SparseLU.H`:

* `buildRuns` (called by `analyse`, once per pattern): each column's row list of L and of U is split into runs
  of consecutive rows (nox03: 50 of 52 L columns, 81 runs for 1238 entries).  A column uses the run form only
  when it has at most half as many runs as rows; else the indexed loop is unchanged.  The pattern is what is
  analysed, so a new pattern (`analysedFor()` differs: Rosenbrock23/Seulex re-analyse then) rebuilds the runs;
  nothing is cached across patterns.
* `subColumn`: `y[row] -= x[s] * a` over a column, by runs, four rows at a time with `__restrict`.  Every
  element receives the same multiply and the same subtract, in the same order (no reduction, no fused
  multiply-add at -O2 without -mfma): the factor and solve are bit for bit those of the indexed loop.
* `solve(b, x)`: into a caller's vector; `solve(b)` calls it.  (Callers in Rosenbrock23/Seulex unchanged.)
* The acceptance (backward error <= 1e-12, pivot tolerance 1e-12) is untouched.

Not done: fusing the backward-error solve with the Sherman-Morrison solve.  With the run kernels each solve is
one pass over about 20 runs; the saving would be a few percent of 5 % of the run, and a failed check would
make the second solve wasted work.

## Ir (callgrind, nox03, rtol 1e-8, same binary tree except SparseLU.cpp)

| | before | after |
|---|---|---|
| factor, per call (635 calls, seulex) | 382.6 k | 273.0 k |
| solve, per call (3845 calls, seulex) | 27.2 k | 17.8 k |
| whole run, seulex | 1 406.4 M | 1 301.1 M (-7.5 %) |
| whole run, Rodas4 | 2 247.1 M | 2 114.2 M (-5.9 %) |
| factor total, seulex / Rodas4 | 242.9 M / 281.6 M | 173.3 M / 200.8 M |
| solve total, seulex / Rodas4 | 104.5 M / 139.2 M | 68.3 M / 91.1 M |

Micro-benchmark (the dumped W of nox03, 3000 factors, wall): factor 45.7 -> 27.4 us, two solves 7.0 -> 3.9 us.
Unrolling by eight was worse than four (runs are short); `-ftree-vectorize` did not change the Ir (the loop is
not vectorised at -O2; making it SIMD would need a build flag or intrinsics: not done).

## Dense against sparse (coordinator's question; no default changed)

`linearSolver dense` against `sparse` declared, rtol 1e-8, callgrind Ir (whole run), after this change:

| case | integrator | sparse | dense | dense / sparse |
|---|---|---|---|---|
| nox03 (52 rows) | seulex | 1.301 G | 1.395 G | 1.07 |
| nox03 | Rodas4 | 2.116 G | 2.299 G | 1.09 |
| nox02 (17 vessels) | seulex | 7.41 G | 73.2 G | 9.9 |
| nox02 | Rodas4 | 15.2 G | 133.4 G | 8.8 |

Dense does not win, even on nox03 where the L + U is 94 % of dense: sparse is now 7-9 % cheaper in Ir, and
the block-diagonal nox02 is ten times cheaper sparse.  No density rule for `auto` is justified by these
numbers; a rule "fill above X -> dense" would only matter at fill near 100 % and on a single small vessel.
Deviation dense from sparse (trajectory.csv, max over columns of |difference| / column maximum): nox03 seulex
7.7e-3 (n_NO2), nox03 Rodas4 1.9e-4 (n_NO), nox02 seulex 0.17 (n_NH, a trace species at the atol floor);
nox02 Rodas4 printed no difference.  They are solutions to rtol 1e-8 that differ in the last accepted steps,
so any golden of a case switched to dense would move.

## Byte identity

`docs/reviews/2026-11-22-fair-timing/bytecompare.py all`, before (the `libchoupo.so` of the base commit,
selected with LD_LIBRARY_PATH) against after: 666 cases, 44 091 files hashed (stdout, stderr, exit code and
every written file), 0 moved.  (17 cases exit non-zero in both runs: the corpus's deliberate EXPECTED-FAILs;
their output is also identical.)  A bench of the dumped nox03 W also gave the same hash for the full inverse
(52 unit-vector solves, three perturbations) before and after.
