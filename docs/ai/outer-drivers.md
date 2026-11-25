# Outer drivers — the `system/outerDict` reference

An outer driver wraps the simulator and runs it repeatedly with modified
inputs.  Drop a `system/outerDict` into the case and `choupoSolve` switches
from one pass to the driver loop automatically — nothing else changes.
One driver per case; `type` selects it.  Registered types
(`OuterDriver::registerBuiltins`):

| `type` | what it does |
|---|---|
| `sweep` | vary ONE dict scalar over a range, record responses → CSV |
| `gridSweep` | 2-D grid over two parameter{} blocks, long-form CSV |
| `paretoSweep` | Pareto front by epsilon-constraint over the SQP, one constrained optimisation per point |
| `designSpec` | Newton-ND on case `$variables` until named targets are met |
| `optimization` | Nelder-Mead or SQP min/max of a KPI / stream field / cost |
| `fitBinaryPair` | **RETIRED** — the factory throws with a pointer to `fitParameters` (choupoProps), the canonical fit engine |

## Which driver for which question

| Question | Tool |
|---|---|
| "What if T were 360 K?" (one point) | edit the dict, rerun — no driver |
| "How does V/F trend with T?" | `sweep` |
| "What area gives exactly 4500 kg/h?" (meet a spec) | `designSpec` |
| "Which reflux minimises V_strip?" (best value) | `optimization` |
| "Fit NRTL to my bubble-T data" | `fitParameters` under **choupoProps** |
| "How exposed is the NPV to the H2 price, the capital band, the discount rate?" | NO driver — the postDict's `economics { sensitivity {} }` block (`docs/ai/case-layout.md`): a driver mutates the FLOWSHEET, and prices, rates and the FCI live in the economics pass |

The unit-op schemas keep saying *"for 'I need P_out = X' wrap the unit in a
DesignSpec outerDict"* — §3 below is that pattern, spelled out.

## Path syntax (what `target` / `path` accept)

Drivers mutate the flowsheetDict between passes via
`Dictionary::setScalarAtPath(path, value)` — dot-and-bracket notation:

```
units[0].operation.refluxRatio       // the first unit's reflux (0-indexed list)
units[2].operation.T                 // third unit
reactions.myRxn.kinetics.A           // an Arrhenius prefactor
variables.A                          // a top-level $variable
streams.feed.F                       // a feed flow
```

Each pass re-reads the case from disk, writes the new value at that path,
and runs — the case on disk is never modified.  **Values written this way are
RAW canonical SI** (K, Pa, kmol/s …): a sweep `range` carries no unit suffix,
so write it in the SI units of the target (e.g. `( 360.0 385.0 )` for a T in
K).  *Reading* results back uses a different, dotted RESULT path:

```
<unitName>.<kpiName>        // e.g. flash01.V_over_F  (any KPI the unit reports)
<streamName>.<field>        // field ∈ F, T, P, vf  (+ F_mass in designSpec only)
```

KPI names are whatever the unit op publishes (run the case once at
verbosity 3 and read them off, or see `unit-ops.md`).  Stream fields come
back in canonical SI (F kmol/s, T K, P Pa).

## 1. `type sweep;` — trend over one parameter

Canonical case: `tutorials/steady/flash/flash06_sweep_T`.

```
type        sweep;

parameter
{
    target    units[0].operation.T;        // any scalar dict path
    range     ( 360.0  385.0 );            // (min max), raw SI of the target
    nPoints   26;                          // >= 2, evenly spaced
}

responses                                  // word list of result paths
(
    flash01.V_over_F       // <unit>.<kpi>
    flash01.Q_kW
    flash01.F_alpha
);

report
{
    format    csv;                         // csv is the only format
    file      sweep_flashT.csv;            // default: sweep_results.csv
}
```

Runs the simulator `nPoints` times; the CSV gets one row per point
(`point, <target>, <response>...`).  A point that fails to converge is
reported and written as `nan` — the sweep continues (exit code 1 if any
point failed).  Sweep responses accept stream fields `F, T, P, vf` only
(no `F_mass`, no compositions — use a unit KPI for those).

## 2. `type designSpec;` — meet N specs with N knobs

Canonical cases: `tutorials/steady/rotating/compressor02_designspec_pout`
(1×1), `tutorials/steady/optimisation/designSpec01_triple_equal_areas` (2×2). A rigorous column held on two key purities (the reflux ratio and the distillate rate as the two unknowns, `column.x_D_LK` and `column.x_B_HK` as the targets) is `tutorials/steady/distillation/column21_design_curve_ethanol_water` (2×2).

**The `$variable` pattern (required).**  The driver does NOT manipulate raw
dict paths.  Each knob is a case-level `$variable`, declared in the
flowsheetDict and referenced by the unit:

```
// system/flowsheetDict
variables
{
    W_shaft   10.0  kW;        // initial guess; the DesignSpec iterates it
}

units
(
    { name compressor;  type compressor;  in feed;  outputs ( out );
      operation { W_shaft  $W_shaft;  eta 0.75; } }
);
```

```
// system/outerDict
type         designSpec;

manipulate                                  // the knobs (bare $variable NAMES)
(
    { variable W_shaft;  initial 10.0 kW;  min 1.0 kW;  max 100.0 kW; }
);

targets                                     // the specs — SAME COUNT as knobs
(
    { path  compressor.P_out;   value 8.0 bar;   tol 200 Pa; }
);

options                                     // optional (defaults shown)
{
    maxIter      30;
    tolF         1.0;       // on the tol-scaled residual (resp-value)/tol
    fdStep       1.0e-3;    // relative FD step for the Jacobian
}

report  { file designspec_history.csv; }    // optional; iteration history
```

* `manipulate` entries take a bare `variable` name (the driver writes
  `variables.<name>`), plus optional `initial`, `min` and `max` — all with
  unit suffixes, converted to SI on read.  `initial` is OPTIONAL: left out,
  the Newton starts at the variable's CURRENT value in the case (ONE home
  for a starting point, DEV.md 4c C435).  Write it only to start somewhere
  else; the run prints, per variable, `start: case value` or `start:
  outerDict initial (the case holds <value>)`.  A `streams.` channel has no
  case value to start from and still needs `initial`.  The variable MUST exist in the
  flowsheetDict's `variables {}` block or the driver refuses loudly.
* `targets` entries are either a **value spec**
  `{ path <result-path>; value <X> <unit>; tol <X> <unit>; }` or an
  **equality** `{ lhs <pathA>; rhs <pathB>; tol <X>; }` (enforces
  resp(A) = resp(B) — e.g. equal areas, equal duties), or a **largest-of**
  `{ largestOf ( <pathA> <pathB> ... ); value <X>; tol <X>; }` — the LARGEST
  of the named quantities must equal `value`.  With quantities that each
  fall as the knob grows, it solves the SMALLEST knob at which every one is
  within the bound without naming in advance which one binds (e.g. a
  converter's one diameter against every bed's `dP_over_allowable`,
  `tutorials/plant/ammoniaPEQ03_basicDesign`).  The run names the one it
  found largest at the design point, and says so when a second sits within
  `tol` of it (the kink of max()).  At least two quantities; `path`/`lhs`/
  `rhs` beside it are refused.
* dim(manipulate) must equal dim(targets) — it is a square Newton-ND.
* Target stream fields: `F` (kmol/s), `F_mass` (kg/s), `T`, `P`, `vf`.
* After convergence the simulator is replayed once at the design point, so
  the case ends with the full converged output (and `reports{}` run on it).

## 3. `type optimization;` — Nelder-Mead / SQP / MADS / Bayesian min/max

Canonical cases: `tutorials/steady/optimisation/optim01_column_reflux`
(KPI objective), `optim02_process_cost` (cost objective via postDict).

```
type    optimization;
method  nelderMead;                        // | `sqp` (smooth, constrained, shadow prices) | `mads` (derivative-free, constrained, integers native) | `bayesian` (opt-in, Gaussian process, for an EXPENSIVE simulation; no multipliers)

variables                                  // 1..n knobs, RAW dict paths
(
    { path units[0].operation.refluxRatio;  min 3.0;  max 5.0;  initial 4.0; }
    { path units[0].operation.feedStage;    min 6;    max 12;   initial 8;   }
);
//  `initial` is OPTIONAL (C435): left out, the start is the value the case
//  already holds at that path, printed as `start: case value`.  Give it only
//  to start elsewhere; the run then prints both when they differ.

objective
{
    kind     kpi;             // kpi | stream | cost | costTotal
    path     column01.V_strip;
    sense    minimise;        // minimise (default) | maximise
}

options                       // optional (defaults shown)
{
    maxIter     80;
    tolX        5e-3;
    tolF        1e-4;
    simplexInit 0.15;         // initial simplex size, fraction of [min,max]
}

report  { file optimization_history.csv; }
```

* `objective.kind` decides how `path` is read:
  `kpi` → `<unit>.<kpi>`; `stream` → `<stream>.{F,T,P,vf}`;
  `cost` → `<unit>.{purchasedCost,bareModuleCost,totalModuleCost}`;
  `costTotal` → path is just the cost field name, summed over all units.
  The cost kinds REQUIRE a `system/postDict` with a sizing + costing chain.
* Bounds are hard box constraints; an evaluation that fails to converge gets
  an infinite penalty (the simplex contracts away from it) — announced, not
  hidden.  Inner-pass chatter is silenced; the optimum is replayed once at
  full verbosity at the end.
* Beyond the box, a `constraints ( { kpi <path>; atMost|atLeast|equals <rhs>;
  tol <x>; } ... );` block is SHIPPED — `method sqp;` only (Nelder-Mead stays
  unconstrained: give it a penalty term in the objective, or switch to sqp
  or mads).

### `method mads;` (C494) — nonsmooth, constrained, integer

Mesh Adaptive Direct Search with the progressive barrier (`src/solver/MADS.H` says
what was read and every deviation).  Same `variables`, `objective` and
`constraints` grammar; differences:

* `integer true;` on a variable is searched NATIVELY (mesh floor of 1) — no
  enumeration, and any number of integer variables.  Give an `initial` (default: the
  lower bound).
* `options { maxEvaluations 1000; tolX 1e-3; seed 0; initialPollSize 0.1; tau 0.5; maxIter 200; }`
  — `tolX` is the final poll size as a fraction of each variable's range; `seed` is the
  Halton index offset of the poll directions (same seed, same run); a repeated point is
  not re-simulated (cache) and not counted.
* A constraint is relaxable: an infeasible trial point is kept while its violation is
  below a falling threshold; the end prints `ACTIVE` for constraints within 1e-3 of their
  bound.  There are NO Lagrange multipliers (use `sqp` for shadow prices on a smooth
  problem).
* CLOSURE GUARD (all three methods): an evaluation whose run publishes a mass/element closure above 0.1 % is a FAILED evaluation, and a replay above it is not reported as an optimum (exit non-zero).  A steady optimum's closure is held by the run's own balance reports, not by the guard.
* Before every run a self-check (HS35 smooth, CB3 non-smooth, vs published optima) runs and
  is announced; a miss aborts the run.
* On a smooth problem MADS costs more simulations than `sqp` (measured, table in
  `docs/audits/2026-11-24-optimizer-comparison.md`); choose it for what `sqp` cannot take.
* Witness: `tutorials/steady/optimisation/optim07_mads_mixed_column` (stages integer +
  reflux continuous + purity constraint, one run, against `optim06`'s enumeration).

### `method bayesian;` (C499) — an expensive simulation, few runs

A Gaussian-process surrogate of the objective and of each constraint (`src/solver/BayesOpt.H` says
what was read), the next simulation chosen by expected improvement times the probability of
feasibility; the budget counts SIMULATIONS.  Same `variables`, `objective` and `constraints`
(inequalities only: an equality is refused by name).

* `options { budget 40; seed 499; eiTol 1e-4; nInit 0; }` — `nInit` 0 means 2n+2 start points
  (the declared `initial` plus a seeded Halton design).  Same seed, same run.
* A FAILED evaluation (non-convergence, non-zero exit, the closure guard) is never a number in
  a model; the run counts it and steers away from it.
* It prints, per simulation, the next point, the prediction BEFORE the run (mean and 95 % band),
  the expected improvement and the probability of feasibility, and after the run the outcome and
  the coverage of the band.  A self-check (Branin, a constrained 2-D problem) runs first.
* NO multipliers: no shadow prices, no KKT certificate.  Finish with `method sqp` from its best
  point.
* MEASURED (median of five seeds, simulations to within 1 % of the best known value): optim04
  (0.01 s per simulation) 15 against 25 for `sqp`, but 0.1 % reached on 2 of 5 seeds; the reactive
  MTBE column column19 (about 20 s per simulation) 23 against 22, with 14 to 18 of its 25 runs
  failed.  It is the WRONG tool where part of the box does not converge.
  `docs/audits/2026-11-24-c499-results.md`.
* Witness: `tutorials/steady/optimisation/optim08_bayesian_membrane`.

## 4. Parameter estimation

**Canonical: `fitParameters` under choupoProps** — a `propsDict` operation,
NOT an outerDict.  Levenberg-Marquardt on dotted property-package parameters
vs experimental data, with identifiability statistics and an opt-in
promote-proposal writer.  Full recipe + the identifiability lesson:
`patterns.md` §4; tutorial `tutorials/steady/optimisation/fitNRTL01_ethanol_water`.

**RETIRED `fitBinaryPair`** — the factory throws, naming `fitParameters`
(choupoProps) as the replacement; `fitNRTL01_ethanol_water` was migrated to
fitParameters keeping its golden.  There is no runnable grammar to document
(historical note only).

## The sweep CSV becomes a one-click plot in the GUI

When the case runs from the GUI's Assistant console, any `.csv` written
inside the case (the sweep/designSpec/optimization `report` file) is offered
as a **one-click plot chip** above the console input.  After authoring a
sweep for a student, tell them: run the case, then click the chip to see the
trend — no external plotting tool needed.
