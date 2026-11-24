# Optimizer benchmark: protocol (2026-11-24, DEV.md 4c C496)

Written and committed BEFORE any result of the bench exists (commit order is
the evidence: this file's commit precedes the results commit).  The bench is
built before the method it will judge: a noise-aware active-set SQP is being
built beside today's `sqp`, and this protocol fixes the ruler.  A measurement
tool, not a gate; no code of the bench is a dependency of Choupo.

**Rule of change.**  No problem is added or dropped, no tolerance, budget,
level or seed moved, after the first result is read.  A change is a NEW
dated protocol file; results taken under the old one stay under the old one.

## 1. What is compared

| code | version / source | derivatives | role |
|---|---|---|---|
| Choupo `sqp` | `src/solver/SQP.cpp` at the tree's HEAD | forward finite differences, step 1e-5 relative (the driver's own default) | subject |
| Choupo `nelderMead` | `src/solver/NelderMead.cpp` | none | subject |
| SciPy SLSQP | PyPI `scipy` | the code's own 2-point differences | external |
| SciPy trust-constr | PyPI `scipy` | the code's own 2-point differences | external |
| SciPy COBYLA | PyPI `scipy` | none | external |
| COBYQA | PyPI `cobyqa` (through its own package, not SciPy's wrapper) | none | external |
| IPOPT, finite differences | `cyipopt` over the system IPOPT library | IPOPT's own `finite-difference-values` gradient and Jacobian approximation, limited-memory Hessian | external |
| NOMAD | PyPI `PyNomadBBO` | none | external |
| OpenSQP | LSDO `modOpt` (installed from its repository, because the PyPI name `modopt` belongs to a different package) | the finite differences `modOpt` supplies | external |

Rules for every code: **all get numerical derivatives or none; nobody gets an
analytic one; each runs with its defaults** except that iteration limits are
set so large that the evaluation budget (section 5) is what ends a run.  The
finite-difference step of each code is recorded in the results file.  A code
that does not install is NAMED with the error and never replaced.  Versions
and licences are read from the installed package metadata and printed in the
results.  The external programs live in a throw-away virtual environment
outside the repository.

Choupo's own two codes meet the analytic problems through a pipe: a small C++
program (`bin/curate/optbench/choupo_pipe_driver.cpp`, no edit under `src/`)
links `solver::sqp` and `solver::nelderMead` unchanged and asks the same
Python counting function for every value.  Its option mapping is the
`OptimizationDriver`'s (read at `src/outerDriver/OptimizationDriver.cpp`,
`runSqp` / `runNelderMead`).

## 2. Problem set A: Hock-Schittkowski subset (analytic)

**Source, named.**  K. Schittkowski, "306 Test Problems for Nonlinear
Programming with Optimal Solutions" (Report, Department of Computer Science,
University of Bayreuth, 2008, with the 2010/2011 updates stated in the source
header of the code), the author's own published Fortran collection
(`test_probs_src.zip` and `test_problems.pdf`, read from the author's site,
klaus-schittkowski.de, on 2026-11-24).  It reproduces the problems of W. Hock
and K. Schittkowski, *Test Examples for Nonlinear Programming Codes*, Lecture
Notes in Economics and Mathematical Systems 187, Springer, 1981.  The original
book was not available to the bench; the definitions are the author's own
code, not a transcription by the bench.  Where that collection differs from
the printed book (the author rescaled some constraints, for example HS71 is
divided by 25 and 40, and he gives start points and bounds in his frame), the
collection governs and the results say "the 2008 collection".

**How the definitions are used and checked.**  The Fortran file `PROB.FOR`
and its interface `CONV.FOR` are compiled unmodified into a shared library
(`gfortran -std=legacy`) and called through `ctypes`.  Nothing is transcribed.
Each problem's published optimum is checked against its own definition: the
function and constraints are evaluated at the collection's solution vector
and must reproduce its stated optimal value to 1e-6 relative with a constraint
and bound violation below 1e-6.  The start point, the bounds and the
constraint ordering are the collection's (inequalities are `g >= 0`, as the
collection writes them; equalities `h = 0`).  A variable the collection leaves
unbounded receives the box start +- 1e5, which is the rule of the author's own
test frame (`TESTP.FOR`), applied to every code, so that no code sees an
infinite bound.

**Selection rule (applied mechanically, before any run).**

1. problem number 1 to 119 (the 1981 book);
2. n <= 10 variables;
3. not skipped by the author's own test frame (`TESTP.FOR` skips 58, 82, 94, 115);
4. the check above passes (this removes 85, 99, 105, 106, 112, whose stored
   solution does not reproduce the stored value to 1e-6 under the collection's
   own code; they are named in the results as excluded by this rule);
5. every third surviving problem, in order of number, starting with the first
   (a fixed thinning, stated here because 106 problems times nine codes times
   many conditions does not fit the machine).

All problems of the collection are smooth by construction.  The rule uses no
information about how any code behaves on a problem.  The list of the problems
that result is printed by the driver and is reproduced in the results.

**Conditions.**  Each problem runs CLEAN, and with ADDITIVE noise at three
fixed levels sigma in {1e-8, 1e-6, 1e-4} (section 4), three seeds per level.
That is ten runs per problem and code (one clean, nine noisy).

## 3. Problem set B: the four Choupo flowsheets (black box)

`optim01_column_reflux` (2 variables, no constraint), `optim02_process_cost`
(2 variables, cost through the post-processing chain),
`optim04_membrane_recovery_scaling` (2 variables, 2 inequality constraints),
`optim05_reactor_npv` (2 variables, 2 inequality constraints), exactly as
shipped in `tutorials/steady/optimisation/`: same variables, same bounds,
same objective, same constraint right-hand sides, same sense.

* A wrapper, `choupoSolve` called as a subprocess on a scratch COPY of the
  case inside the tree (so the catalogue references keep their depth), writes
  the decision variables into the copy (the paths the case's own `outerDict`
  writes; `streams.feed.P` channel variables as the case's `variables {}`
  or stream file, see the driver) and reads the objective and the constraints
  from the result JSON printed between `<<<Choupo:result-begin>>>` and
  `<<<Choupo:result-end>>>`.  The case's `outerDict` is removed from the copy
  so the single pass runs; the post chain runs as the case's own driver runs
  it.
* **Noise is as it really is.**  No noise is added.  A failed evaluation (the
  flowsheet does not converge, or the process throws) is returned as a
  non-finite value and counted.
* **Starts**: A, the case's own tutorial start; B and C, the box points at
  fractions (0.2, 0.8) and (0.8, 0.2) of the variable ranges.  Integer-valued
  variables are treated as continuous, as the shipped case does.
* **Reference value.**  There is no published optimum for these cases.  The
  reference of a flowsheet problem is the best feasible value reached by ANY
  run of ANY code of this bench on it (the convention of Moré and Wild for
  black-box problems), stated as such.  "Solved" on set B is therefore
  relative to the bench, and the results say so.
* **Noise measurement (the table of the results).**  At one point per case
  (the tutorial start), the response (objective and each constraint) is
  evaluated at 25 points spaced along each variable around the point, at
  offsets of 1e-9, 1e-8, ..., 1e-3 of the variable's range, both signs, plus 5
  repeated evaluations at the point itself; the table reports the
  repeatability (spread of the repeats), the local linear fit's residual
  standard deviation per offset, and the finite-difference slope at each
  offset.  This table is a measurement, not a ranking.
* Choupo's own `sqp` and `nelderMead` run on set B through their own
  `outerDict` (`method sqp` with the case's constraints; `method nelderMead`
  with a penalty-free unconstrained problem, which is what the driver allows).
  The other codes run on the wrapper.  Their counter is the wrapper's; the
  driver's counter is the number of simulator calls it reports.  The results
  state that these two counters are not one counter outside every code; this
  is a known limit of set B, and is why set B supports no ranking claim
  between Choupo's own `outerDict` runs and the wrapper runs beyond what the
  counts show.

## 4. Noise model (set A)

For a problem with objective f and constraints c_i (the collection's scaling),
the returned values are

    f~(x)   = f(x)   + sigma * s_f * xi_0,    s_f = max(1, |f(x_start)|)
    c~_i(x) = c_i(x) + sigma * xi_i

with xi independent standard normal draws, a new draw for every returned value
at every evaluation, from a `numpy.random.default_rng(seed)`; the levels are
sigma in {1e-8, 1e-6, 1e-4}; the seeds are 11, 22, 33 (one generator per run,
seeded with the seed plus a hash fixed by the problem number, so that the
three seeds are three different noise realisations on each problem and all
codes of a (problem, level, seed) cell see the SAME seed but not necessarily
the same sequence, since each code asks at different points; this is stated
rather than hidden).  The true, noise-free value is always computed beside
the noisy one by the counting function and is used ONLY to judge a point; no
code sees it.

## 5. One counter, outside every code; the budget

Every code calls one Python function (`counted(x)`), which clips x into the
box (a point a code proposes outside the bounds is evaluated at its clip and
the clip is what is judged), counts ONE evaluation per call, whatever the
call was for (a finite-difference perturbation counts the same as any other
call, for every code), evaluates the problem, adds the noise, appends
(count, x, true f, true constraint violation) to the run's history, and
raises an exception that ends the run when the count reaches the budget.
Non-finite values are returned to the code as 1e20 (objective) and -1e20
(constraint) and recorded as such.  The budget is 100 * (n + 1) evaluations on
set A (n the number of variables) and 100 on set B.

## 6. What "solved" means

Judged on the HISTORY, on the TRUE values, at the points the code evaluated
(the best-so-far, as Moré and Wild's profiles do): a run has solved
problem p to tolerance tau at the first evaluation count t such that some
evaluated point x up to t has

    |f_true(x) - f*| <= tau * max(1, |f*|)      and
    cv_true(x)       <= 1e-4,

with f* the collection's published optimal value (set A) or the bench's
reference (set B), and cv the maximum of: the largest inequality violation
max(0, -c_i), the largest equality residual |h_j|, and the bound violation
(zero, since points are clipped).  tau takes three values: 1e-2, 1e-4, 1e-6.
A run that never reaches it has t = infinity.

## 7. Profiles and the rule for a winner

Performance profiles (Dolan and Moré 2002) and data profiles (Moré and Wild
2009), computed from the t of section 6, per noise condition (clean, and each
of the three levels with the three seeds pooled as three replicates of the
problem set) and per tau.  The data profile of a code is the fraction of
(problem, replicate) cells it has solved by kappa * (n + 1) evaluations, for
kappa up to 100; the performance profile uses t divided by the best code's t
on the same cell.  The headline number per cell of the results grid is the
data-profile value at kappa = 100 (the full budget) and the area under the
data profile over kappa in [0, 100] on a log axis.

**Winner.**  Code A is declared a winner in a condition when, against EVERY
other code, the difference in the fraction solved at kappa = 100 is positive,
its paired bootstrap 95 % interval over problems (10 000 resamples, replicates
resampled within problem) excludes zero, AND the difference exceeds the
largest seed-to-seed range of the two codes' fractions in that condition (the
three seeds, taken one at a time).  On the clean condition there are no
seeds; there the bootstrap interval alone applies, and a difference below one
problem in the set is never a win.  Where no code satisfies this the results
say "no winner", and say who is statistically level with whom.  A winner on
set A in one condition is never extended to another.  Set B has three starts
and four problems and carries no winner declaration; it is reported as a table
of reached values and counts.

## 8. What is reported whatever the outcome

The installed versions and licences; the codes that failed to install with
the error; per condition the tables and the profiles; where Choupo's codes
lose first (the first noise level or tolerance at which a code of this bench
solves strictly more of the cells than Choupo's `sqp` outside the bootstrap
interval); the count of failed evaluations per code; what the bench cannot
say.

## 9. Tooling and its limits

* One driver script, `bin/curate/optimizer_bench.py`, reproduces the bench;
  it is a measurement tool, not a gate, not in `bin/runTests`, and its
  packages are external to Choupo.
* One optimisation process runs at a time on the machine; no suite is run.
* No analytic derivative of any problem is ever supplied to any code.
