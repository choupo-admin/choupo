# An unconverged seed is announced, and a step nothing improves is not "the last good iterate"

*Kind: ADR.  Status: BUILT 2026-11-01 on a general's branch (DEV.md 4c
C184 defects A and B), not merged.  Gate: `check_distillation_seed`.*

---

## 1. The two defects, read and then reproduced

An external review (relayed 2026-10-27) of a failed dimethyl-ether plant
named two defects in the distillation path.  The line references in DEV.md
C184 were stale by a few lines; both were re-read at the current sources
and run.

**A -- `src/unitOperations/distillation/DistillationColumn.cpp`, the
`model fullMESH` block.**  The block started on the model word alone.  The
CMO (constant-molal-overflow) MESH Newton that precedes it can finish with
`res.converged == false`, and its iterate seeded the rigorous Newton all the
same; the only later use of the CMO flag was `if (!resF.converged)
res.converged = false`, so a full MESH that converged from a failed seed was
still published with the CMO's flag and the CMO's residual.

**B -- `src/solver/NewtonND.cpp`, after the backtracking loop.**  The loop
exits on `alpha < minAlpha` holding the last trial it evaluated.  The guard
below it caught only an EMPTY or NON-FINITE trial; a finite trial that did
not reduce `||F||` was assigned to `x` (`x = std::move(xNew)`), under a
comment promising "the last GOOD iterate".

| # | repro | before | after |
|---|---|---|---|
| B1 | probe: `F(x) = x - 1` for `x >= 2.9999`, else 50; from `x0 = 3`, `|F| = 2` | stop message "last good iterate returned": **x = 2.99976, \|F\| = 50** | **x = 3, \|F\| = 2**, `stalledSteps` = 1 |
| B2 | `column06_fullMESH` copy, declared interior of 10 K on every stage (a SEED, never an answer) | full MESH `NOT converged in 3 iters, \|\|F\|\| = 1.17e+55` | `NOT converged in 3 iters, \|\|F\|\| = 2.70e+05` (best iterate) |
| A1 | same case | CMO phase 77 iterations, `\|F\| = 4.586e+04`, **no word about it**; published residual 4.586e+04 (the CMO's) | announced (15 stages, 77 iterations, `\|F\|`); published residual 2.696e+05 (the full MESH's own) |

## 2. Corpus reach (measured)

All 33 corpus cases that contain a `distillationColumn` were run with an
instrument printing each non-improving step (removed before the commit).

* **B is reached by two cases**, and both CONVERGE through it:
  `acetone06_luyben_column_C1` (2 floor-damped steps in 15 iterations,
  `simultaneous`, 66 stages) and `stripper02_sour_water_h2s` (12 in 43,
  `simultaneous`, reactive speciation).  The steps are taken at `alpha =
  6.1e-5`, i.e. at the floor; the iteration slides through the noise of the
  finite-difference Jacobian.  Every other distillation case takes none.
* **A is reached by NO corpus case.**  Only `column06`, `column07` and
  `column08` declare `fullMESH`; their CMO phase converges.  Sixteen
  distillation cases turned into `fullMESH` copies and about forty
  perturbed specs (distillate rate, reflux, stage count, pressure on
  `column03`, `column06`, `acetone06`) all converged their CMO phase too.
  The only reproduction is the constructed one above (a declared interior
  that is garbage, plus `acetone06` at 60 kmol/h distillate or 0.02 bar).

## 3. The choice, and why

**B -- count, limit, announce; return the BEST iterate.**  The brief asked
for the step to be rejected or damped.  A strict rejection (stop at the
first non-improving trial) was considered and refused because it would turn
the two converging cases above into failures at exit 1 -- measured, not
guessed: `acetone06` makes its two floor-damped steps in iterations 1 and 2.
The step IS damped (to `alpha ~ minAlpha`), and what was wrong was that it
was silent, unbounded, and that the stop messages lied.  Now:

* each such step is counted (`NDResult::stalledSteps`) and announced once on
  the `AdvisoryLog`; the columns print the count at verbosity >= 2;
* the allowance is `NDOptions::maxStalledSteps`, default **25** in total
  over one solve (`0` is strict).  25 is a bound, not a theorem: the corpus
  maximum is 12;
* every UNCONVERGED exit (singular solve, no evaluable step, exhausted
  allowance, `maxIter`) returns the best iterate seen, which is what each
  message always said.  A converged exit is unchanged.
* the path with `backtracking = false` takes a full step by design and is
  not changed.

**A -- an ANNOUNCED seed, not a refusal.**  Seeds are the student's to own
and the solver announces what it does to converge (CLAUDE.md, no silent
crutch).  The full MESH solves different rows (it adds the energy and total
balances), may be rescued from an imperfect seed, and its verdict is on the
equations the case declared; refusing would discard a run it might save.
So: the failed bootstrap is announced (stage count, iterations, `|F|`
against 1e-9), the rigorous Newton still runs, and **the verdict and the
published residual are the full MESH's own** after a failed seed.  After a
converged seed nothing changes (`else if (!resF.converged)`).

## 4. Not done

* The singular-Jacobian diagnostic naming the stage and the equation
  (C184 P0): it does not fall out cheaply -- the linear solve throws a row
  index of the flattened `n+2`-unknown block system and the mapping to a
  physical equation needs the residual's layout, which differs between the
  CMO and the full MESH.
* P1-P3 of C184 (admissible iterates, thermodynamic initial profile,
  continuation).
* A corpus case where the CMO seed fails and the full MESH converges (none
  exists; the verdict change is covered by the source arm and by the
  published-residual check on the failing witness).

## 5. Gate

`check_distillation_seed`: (a) a probe against the solver sources alone;
(b) the garbage-seeded `column06` end to end, and the shipped one silent;
(c) `acetone06` still converges and announces its steps; (d) a source arm.
Sabotages (by hand, restored and touched between): restoreBest bypassed ->
(a) x = 2.99976, |F| = 50; the stall test disabled -> (a) three arms and (d);
`cmoSeedFailed = false` (engine rebuilt) -> (b) "seeded the full MESH
without the announcement".
