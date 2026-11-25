# The three optimisation methods on the shipped cases (C494, 2026-11-24)

What was run: every shipped optimisation case under each method that applies,
on scratch copies (the shipped cases are not edited), with the binary of this
branch.  One run per cell; `simulations` is the driver's own count of
simulator calls (a repeated MADS point served from its cache is not counted;
each run adds one replay pass at the optimum, not counted here).  The
objective is in the user's sense (a `maximise` case prints the value to be
maximised).  A constraint is "satisfied" when the final replay's KPI meets it
to 1e-6.  `optim03` does not exist in the tree (the numbering skips it).

Settings, so the table can be rerun.  nelderMead: as shipped.  sqp: as shipped
where the case ships it; elsewhere `maxIter 40; fdStep 1e-3; fdMode central`
(the setting `optim04` ships).  mads: `maxIter 1000; maxEvaluations 1000;
tolX 1e-3; seed 0` (`optim07` ships its own, `maxEvaluations 300`).  The
variables, bounds, objective and constraints are the case's, unchanged: in
particular `feedStage` (optim01), `nMods` (optim04) are continuous as shipped.

| case | problem | method | final objective | constraints | simulations | failed evaluations | stopped on |
|---|---|---|---|---|---|---|---|
| optim01 | min V_strip over R, feedStage (no constraint) | nelderMead (shipped) | 0.03618773 | n/a | 8 | 0 | tolF |
| | | sqp | 0.03618773 | n/a | 25 | 0 | KKT |
| | | mads | 0.03618773 | n/a | 42 | 0 | poll size |
| optim02 | min total module cost over V_R, Q (no constraint) | nelderMead (shipped) | 878085.5 | n/a | 17 | 0 | tolF |
| | | sqp | 878085.4 | n/a | 63 | 0 | KKT |
| | | mads | 878085.4 | n/a | 70 | 2 (objective not finite at V_R = 0.01 and 0.002 with Q = 0) | poll size |
| optim04 | max water recovery, 2 wall-scaling constraints | nelderMead | n/a (refuses constraints) | | | | |
| | | sqp (shipped) | 0.3974514 | satisfied | 25 | 0 | KKT |
| | | mads | 0.397396 | satisfied | 138 | 0 | poll size |
| optim05 | max NPV, V_R <= 12, FCI cap | nelderMead | n/a (refuses constraints) | | | | |
| | | sqp (shipped) | -656434000 | satisfied | 16 | 0 | KKT |
| | | mads | -656440300 | satisfied | 271 | 0 | poll size |
| optim06 / optim07 | min V_strip over nStages (integer) and R, x_D_LK >= 0.98 | nelderMead | n/a (refuses constraints) | | | | |
| | | sqp, nStages enumerated (optim06, shipped) | 0.03479 (N = 14, R = 2.8994) | satisfied | 74 | 2 (N = 8: feedStage 8 not above the bottom stage) | N = 9..11 stopped on a local infeasibility inside R <= 6 |
| | | mads, one run (optim07) | 0.03482054 (N = 14, R = 2.9016) | satisfied | 126 (+27 cache hits) | 0 | poll size |
| ctrl16 | max J_combined of a dynamic campaign, 10 schedule values (no constraint) | nelderMead (shipped) | 546.8126 | n/a | 530 | 0 | tolF |
| | | sqp (central FD, maxIter 40) | 548.2831 | n/a | 1680 | 0 | maxIter reached, KKT NOT met |
| | | mads (as the others, no constraint) | 6497.0 | n/a | 415 | 0 | poll size -- **INVALID, see below** |
| | | mads + `balance.mass_closure_rel <= 1e-6` | 547.1600 | satisfied | 1000 | 0 | evaluation budget (not converged) |

Seed sensitivity of MADS (seeds 1, 2, 3 beside the seed 0 of the table;
objective and simulations only, feasibility not re-extracted): optim01
0.03618773 in 43/45/39; optim02 878085.4 in 71/64/89; optim04 0.397347,
0.397407, 0.397396 in 180/120/134 (seed 0: 0.397396 in 138); optim05
-656434200, -656436900, -656449700 in 258/182/207 (seed 0: -656440300 in
271); optim07 0.0348010, 0.0347937, 0.0347912 in 146/149/173 (seed 0:
0.03482054 in 126).

## What the table shows, and no more

* On the five smooth cases (optim01, 02, 04, 05, 06) every method that applies
  reaches the same optimum: to the printed precision on the two unconstrained
  cases; on optim04 MADS is 1.4e-4 relative below the SQP and on optim05 1e-5
  below (both maximisations, the SQP the better); on the mixed column optim07
  is 0.09 % above optim06 (a minimisation, the SQP-in-enumeration the better).
* The simulation counts on these smooth cases rank nelderMead (8 and 17) below
  the SQP (25 and 63) below MADS (42 and 70) on the two unconstrained cases;
  the SQP (25, 16) below MADS (138, 271) on the two constrained continuous
  cases; and the enumeration of optim06 (74) below the single MADS run (126)
  on the mixed case.  Here MADS cost more simulations than the method it is
  compared with in every case where both ran.  The seed moves its count by tens of percent (optim05: 182 to 271)
  and its optimum in the fifth significant digit or later.
* optim01 and optim02 end on a bound (R at its floor; Q at its cap), so they
  test the methods on a boundary optimum, not an interior one.  optim06/07
  end at nStages = 14, the upper bound of the integer variable.
* ctrl16: MADS without a constraint found J = 6497, twelve times the published
  collocation optimum the case cites (551.8), at a point where the plant's own
  mass balance is broken (`balance.mass_closure_rel` 0.98; 4.3e6 kg of
  residual against 0.97e6 kg fed): the objective, an integral of the plant,
  rewards a region of the model that is not physical, and MADS found it where
  the simplex and the SQP, started in the physical region, did not (that its
  polling reaches farther from the start is a possible reason, not tested).  Not an optimum, not reported as one.  With the
  closure as a constraint MADS ends at 547.16, level with the other two, but
  it spent the whole 1000-simulation budget without meeting its poll-size
  tolerance.  The cause of the unphysical region (which schedule values open
  it) was not investigated: registered as a finding for the case, whose
  objective should carry the closure as a constraint under any method that
  can leave the physical region.  The SQP on ctrl16 stopped at its iteration
  cap of 40 without a KKT certificate, at 548.28.
* Failures: the two failed MADS evaluations on optim02 are the objective
  reading not finite at two corners of the box (Q = 0); the extreme barrier
  rejected them and the run went on.  The two failed evaluations of optim06
  are N = 8, which the unit refuses by name.  No other run had a failed
  evaluation.
* What the table does NOT show: any case with a non-smooth response, which is
  the problem MADS is for.  The only non-smooth evidence is the self-check
  (CB3, below), not a flowsheet.  The comparison with COBYLA the backlog item
  named was not made (no COBYLA in the tree).  One run per cell, one start
  per case: no statement about robustness to the start.

## Self-check results (run before every MADS run)

`solver::verifyMADS`, deterministic (two runs of the same seed are compared):

| problem | published optimum (source read) | MADS | evaluations |
|---|---|---|---|
| HS35, smooth, one active constraint, box [0,3]^3 added | f* = 0.11111111 (Schittkowski, "An updated set of 306 test problems ...", row 35) | 0.11249744 (|df| = 1.4e-3, tolerance 5e-3) | 580 |
| CB3, non-smooth max of three, box [-5,5]^2 | f* = 2 (arXiv:2009.01037 Table 1; the chained form of arXiv:2404.16273 gives 2(n-1)) | 2.00038691 (|df| = 3.9e-4, tolerance 2e-3) | 145 |

The objective and constraint of HS35 are those of the SQP self-check (the
Hock and Schittkowski book was not read; the published value is read from
Schittkowski's table).  The CB3 definition is read from arXiv:2404.16273
(chained CB3 I, n = 2).

## Byte identity of the existing cases

The six shipped optimisation cases (optim01, 02, 04, 05, 06, ctrl16), run
with the binary before and after this branch, give byte-identical stdout
(paths normalised): 29853, 35980, 159134, 48380, 63153 and 83812 bytes.
