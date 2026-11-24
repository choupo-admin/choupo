# Inner solves inside the recycle loop: is an inexact-tolerance scheme worth building? (2026-11-24, measurement only)

Date 2026-11-24, tree at eb2077e79a (`src/` unchanged, no case or engine file edited).  Author: a general, for the architect.  Question: OpenFOAM passes a looser `relTol` to the intermediate iterations of an outer loop and the full tolerance to the Final one.  Would the same, applied to the units' own inner solves (column Newton, flash, Gibbs, valve, heat exchanger) on every recycle iteration except the last, save enough wall time on the slowest recycle plants to justify the build?

## Rule and method

**Plants chosen.**  `build/suiteTimings.csv` holds only nine rows and none is a plant, so the rule was: time ten candidates once with the main checkout's `choupoSolve` (CHOUPO_HOME on the main checkout, one run at a time, on a machine shared with other generals): `tutorials/plant/*` with tears and the recycle cases of `tutorials/steady/flowsheets`.  Wall seconds, single run: aceticAcid02_plant 62.6, greenAmmonia03_basicDesign 47.6, greenAmmoniaPEQ_baseCase 21.8, acetonePlant 4.2, cavett01_recycle_train 1.0, ammonia02_full_plant 0.9, process05_isomerization_recycle 0.3, ammonia01_synthesis_loop 0.2, hda 0.2, polycaprolactonePlant 0.1.  The first six were measured in full (they cover Wegstein x2 and Newton-on-tears x4, and two columns-in-recycle); process05 (Newton, column in the loop, 0.3 s) was used for one probe only.

**Instrument.**  A scratch copy of the tree (`/tmp/claude-0/gen-recyc/tree`, never committed) with timing probes: a wall-clock record around every `unit->solve(...)` in `Flowsheet.cpp` (line 1211 of the committed file) tagged with the sweep number, the recycle iteration number (set where the loop prints its row) and whether it is the final pass; counters in `newtonND` (iterations, residual evaluations, and the iteration at which the residual first fell under 100 x its tolerance), in the 1-D Newton (`newton1D`, `newton1DSafeguarded`, same three numbers) and at the end of `IsothermalFlash::solve` (composition-outer passes).  `perf` is not installed; valgrind exists but a 20-50x slowdown on a 60 s case was not needed.  Overhead: one `steady_clock` pair and a vector push per unit solve; the instrumented walls (54.6 to 73 s for aceticAcid02) sit inside the load noise of the shared machine (plain run 62.6 s), so no overhead is claimable or detectable.  Walls below are therefore indicative; the shares, the iteration counts and the results are what the measurement stands on.

**Definitions.**  "Early" = a solve in a recycle iteration before the last two, final pass excluded.  *Upper bound (the brief's)*: for every such solve, the time of its tolerance-iterations beyond the first two, `sec x (n-2)/n`, summed over units with a tolerance-driven inner iteration (column Newton; valve outlet-temperature Newton; flash composition passes; heat-exchanger bisection counted by its flash calls; Gibbs).  *x100 estimate*: the same solves, but only the iterations a 100 x looser tolerance would skip: `sec x (n - n100)/n` with `n100` the iteration at which the unit's own residual first fell under 100 x its tolerance (measured; for bisection, log2(100) = 6.6 halvings).  The upper bound is a ceiling on any tolerance scheme; the x100 figure is what 100 x looser actually removes.

**Results compared.**  For the probes: every number under `converged/` (all streams, all internal states), against the unprobed base run of the same binary, largest relative change.

## One table per plant

Unit shares are of wall time; `iter/solve` is the mean tolerance iterations per unit solve over the loop (not the final pass).

### aceticAcid02_plant, Wegstein, 46 recycle iterations (tear |delta| 8.1e-3 -> 9.7e-7)

| unit | share of wall | iter/solve | upper bound | x100 estimate |
|---|---|---|---|---|
| distillationColumn (simultaneous MESH) | 67.7 % | 6.0 Newton | 42.3 % | 10.6 % |
| valve (outlet T Newton with a nested flash) | 28.9 % | 21.5 Newton | 24.6 % | 8.1 % |
| flashes, mixers, phase changers, Gibbs, tanks | 2.8 % | | 1.0 % | 0.1 % |
| **total** | 99.1 % in unit solves | | **67.9 %** | **18.7 %** |

Inner iterations, early / middle / last third of the recycle: column 6.0 / 6.0 / 6.0 (one solve = 0.79 s); valve 22.8 / 20.6 / 21.0.  The column is seeded from scratch every time (`DistillationColumn.cpp:1206`: "linear T between the guesses, feed composition on every stage"), ends at ||F|| = 3e-11 against its 1e-9, and costs the same at the first and the 45th recycle iteration.

### acetonePlant, Wegstein, 4 recycle iterations

| unit | share of wall | iter/solve | upper bound | x100 estimate |
|---|---|---|---|---|
| distillationColumn C1 | 82 % (with C2) | 83 Newton (a recovery search, per the case's own solverDict) | 38.5 % | 1.8 % |
| distillationColumn C2 | | 6-8 | | |
| mixer, flashes, reactor, absorber | 9 % | | 0.8 % | 0 |
| **total** | 91 % | | **39.3 %** | **1.8 %** |

C1 does 83 iterations at every recycle iteration (83 / 83 / 83); the count is the recovery search, not a tolerance.

### greenAmmonia03_basicDesign, Newton-on-tears, 12 variables, 5 iterations (the plant runs two recycle solves, 264 sweeps)

| unit | share of wall | iter/solve | upper bound | x100 estimate |
|---|---|---|---|---|
| pfr x3 beds (fixed-step RK4, `nSteps` 100, no tolerance) | **93.1 %** | none | **0 (not tolerance-iterated)** | 0 |
| heatExchanger (bisection, 165 flash calls / solve) | 2.3 % | | 1.6 % | 0.6 % |
| flashes, compressors, mixers, phase changers | 2.5 % | | 1.0 % | 0.4 % |
| **total** | 97.4 % | | **2.5 %** | **0.9 %** |

### greenAmmoniaPEQ_baseCase, Newton-on-tears, 12 variables, 5 iterations (132 sweeps)

| unit | share of wall | upper bound | x100 estimate |
|---|---|---|---|
| pfr x3 beds | **92.5 %** | **0 (no tolerance)** | 0 |
| heatExchanger | 2.3 % | 1.9 % | 0.7 % |
| flashes, compressors, mixers, phase changers | 2.0 % | 0.9 % | 0.4 % |
| **total** | 96.7 % | **2.8 %** | **1.0 %** |

### cavett01_recycle_train, Newton-on-tears, 36 variables, 7 iterations (520 sweeps)

| unit | share of wall | iter/solve | upper bound | x100 estimate |
|---|---|---|---|---|
| mixer (adiabatic temperature Newton with nested flashes) | 60.8 % | 187 | 51.3 % | 23.8 % |
| isothermalFlash x4 | 24.5 % | 9.8 outer passes | 16.4 % | 0 (no estimate) |
| **total** | 85.3 % | | **67.7 %** | **23.8 %** |

Wall 1.1 s: too small for any of this to matter to a user.

### ammonia02_full_plant, Newton-on-tears, 14 variables, 2 iterations (58 sweeps)

| unit | share of wall | iter/solve | upper bound | x100 estimate |
|---|---|---|---|---|
| heatExchanger | 60.5 % | 48 | 51.6 % | 18.2 % |
| gibbsReactor | 6.1 % | 221 | 3.1 % | 0.2 % |
| flashes, tanks, compressors | 6.2 % | | 1.7 % | 0.3 % |
| **total** | 72.8 % | | **56.2 %** | **18.7 %** |

Wall 1.3 s.

## What the numbers say

1. **The upper bound is large only where it is not a bound on anything real.**  On the two plants where wall time is worth saving after the ammonia pair (aceticAcid02, 55-70 s; acetonePlant), 68 % and 39 % of the wall are "iterations beyond the first two".  But the column does 6 Newton iterations from a cold seed at every recycle iteration, early or late: those iterations are spent crossing from the seed to the neighbourhood of the solution, which no tolerance shortens.  A looser tolerance cuts the quadratic tail only: the measured n100 says one iteration of six (10.6 %, valve 8.1 %), i.e. the x100 column.
2. **The two slowest ammonia plants spend 92-93 % of their wall in a PFR that has no tolerance at all**: a fixed-step RK4 of `nSteps` (default 100, `PFR.cpp:172`), three beds per sweep, 396 solves in PEQ.  An inexact-tolerance scheme reaches 1 % of those plants.
3. **For Newton-on-tears the tear-level cost is the Jacobian, not the units.**  `sweeps per iteration = 2n + 2` (central differences, `NewtonND.H`: fdStep 1e-7 x max(|x|, 1), line 184, plus the base point plus one re-sweep): 26 for 12 variables, 74 for 36, 28 for 14; 24 of every 26 sweeps are perturbations.  `Flowsheet.cpp:4005` (`residual(tr.x)`) re-sweeps once per iteration only to place the streams for the convergence plot and the closure residuals: 1 sweep in 26.
4. **Wegstein on aceticAcid02 crawls**: 46 iterations, the tear step falling about 10 % per iteration from the third on, with the q factor clamped at 0 (plain substitution) in most updates (the run's own "q clamped" lines).  No inner tolerance touches that; it is 46 sweeps of 1.2 s.

## The probes (scratch build; the unit's tolerance multiplied on every sweep but the final pass)

| probe | recycle iterations | wall / work | largest relative change in `converged/` |
|---|---|---|---|
| aceticAcid02, column tolerance x100, Wegstein | 46 -> 46 | column Newton 6 -> 5 per solve; column time 49.3 -> 41.9 s (-15 %); wall 71.4 -> 64.8 s (-9 %, same-load back-to-back, noisy) | **0** (byte-identical) |
| aceticAcid02, column and valve x100 | 46 -> 46 | wall 59.8 s | **0** (byte-identical) |
| acetonePlant, column x100 / x1e4 | 4 -> 4 | no change (C1's 83 iterations are the recovery search) | 1.6e-8 / 6.5e-6 (flows above 1e-6 of their file's maximum; a 1e-21 trace moves 17 %) |
| ammonia02 (Newton), Gibbs x100 / x1e4 / x1e6 | 2 -> 2 -> 2 -> 2 | within noise | 3.2e-9 / 9.5e-8 / 1.3e-5 |
| cavett01 (Newton, 36 variables), flash x100 / x1e4 / x1e6 | 7 -> 7 -> 7 -> 7 | within noise | 1.1e-8 / 4.6e-9 / 4.6e-9 |
| process05 (Newton, column), column x100 | 2 -> 2 | within noise | 2.7e-8 |
| process05, column x1e4 and x1e6 | **run refused** | | "unit 'column' failed to converge" |
| greenAmmoniaPEQ (Newton), PFR `nSteps` / 4 on all but the final pass | 5 -> 5 | **20.4 -> 5.2 s (3.9x)** | 1.0e-8 |
| PEQ, `nSteps` / 2, / 10, / 25 (4 steps) | 5 -> 5 each | 10.3, 3.7, 3.5 s | 5.9e-10, 4.1e-7, 1.8e-5 |

**The FD-Jacobian pitfall was not triggered, and is not cleared.**  Loosening a solver's *tolerance* by up to 10^6 did not degrade newtonOnTears on Gibbs (ammonia02) or on the flashes (cavett01): the iteration counts held and the results moved at most 1.3e-5.  The reason is the quadratic tail: a Newton stopped by a looser tolerance usually lands below it (the achieved residual was not recorded here; the results moved at most 1.3e-5), so the noise the tear Jacobian sees stays small.  The arithmetic of the margin is unfavourable all the same: the perturbation is h = 1e-7 x scale, the inner tolerances are 1e-9 relative, so the noise is already about 1 % of the perturbation at full tolerance and would be about 100 % at x100 if the solves really stopped at the loose tolerance.  A scheme that limits iterations (an iteration cap, not a tolerance) would meet it at once.  Second finding: a solver-level override is not enough, because units hold their own acceptance tests: the column refuses at x1e4 (`DistillationColumn.cpp:4037`, "against 1e-9"), so an inexact scheme needs the tolerance passed down through each unit's own acceptance test.

**The PFR probe is a different scheme from the one asked about** (coarse steps, then the full grid for the final pass, i.e. multi-fidelity on the unit's discretisation, not on a tolerance), and is reported because it is where the time is.  It is one plant whose beds sit near equilibrium, where RK4 on 25 steps is already accurate to 1e-8; a kinetically limited PFR (steep early profile) will not agree to that, and the tears converge to the coarse model's fixed point, so the final pass is not entered at a fixed point of the fine model.  Whether a plant with a rate-limited bed keeps the property is not measured here.

## Recommendation

1. **Do not build the OpenFOAM-style relTol scheme for the recycle loops now.**  Its ceiling is 40-68 % on paper on the two column plants and 3 % on the two ammonia plants, but what a looser tolerance actually removes is 10-19 % of one plant's wall (a cold-seeded column's last Newton step), at the price of every unit's acceptance test being rewired, and it buys nothing where the time is (PFR RK4, Jacobian sweeps, a Wegstein that takes 46 iterations).
2. **If one is built anyway**: only for Wegstein, directSubstitution and dominantEigenvalue (no Jacobian to poison); the tolerance travels through each unit's own acceptance test; the schedule is tied to the tear residual with a floor of 100 x the unit's full tolerance; the final pass and the last two recycle iterations at full tolerance.  For newtonOnTears: **no loosening in any sweep that belongs to a Jacobian column** (2n of the 2n+2 sweeps), and none in the base-point sweep; the guard in one line: inner noise <= 1 % of fdStep x scale, which is at or below today's 1e-9, so Newton has no room.  Measured nowhere to be wrong, but the margin says so.
3. **Better levers, in the order this measurement supports (each a slice of its own, none started):**
   - Coarse-then-fine PFR steps on the first Newton or Wegstein sweeps: 3.9x on PEQ for a 1e-8 change; needs a rate-limited PFR case before it is trusted.
   - Warm-starting the column from the previous recycle iteration's profile (every solve is seeded from the linear-T guess today): not measured here, a hypothesis the six iterations per solve make plausible.
   - Newton-on-tears: Jacobian reuse (Broyden or a frozen J for the last iterations) removes 24 of 26 sweeps per iteration; drop the re-sweep at `Flowsheet.cpp:4005` when no plot or writer needs it (1 of 26).
   - aceticAcid02's Wegstein (46 iterations, q clamped): try dominantEigenvalue or a Newton with a column seed from the last profile.
4. What this audit did not measure: valgrind or perf attribution below the unit level; any plant with a membrane, absorber or rate-based segment in the loop; the effect on the plants' closures (the results compared are the streams and states, not the reports).
