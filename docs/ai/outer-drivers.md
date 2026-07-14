# Outer drivers — the `system/outerDict` reference

An outer driver wraps the simulator and runs it repeatedly with modified
inputs.  Drop a `system/outerDict` into the case and `choupoSolve` switches
from one pass to the driver loop automatically — nothing else changes.
One driver per case; `type` selects it.  Registered types
(`OuterDriver::registerBuiltins`):

| `type` | what it does |
|---|---|
| `sweep` | vary ONE dict scalar over a range, record responses → CSV |
| `designSpec` | Newton-ND on case `$variables` until named targets are met |
| `optimization` | Nelder-Mead min/max of a KPI / stream field / cost |
| `fitBinaryPair` | **RETIRED** — the factory throws with a pointer to `fitParameters` (choupoProps), the canonical fit engine |

## Which driver for which question

| Question | Tool |
|---|---|
| "What if T were 360 K?" (one point) | edit the dict, rerun — no driver |
| "How does V/F trend with T?" | `sweep` |
| "What area gives exactly 4500 kg/h?" (meet a spec) | `designSpec` |
| "Which reflux minimises V_strip?" (best value) | `optimization` |
| "Fit NRTL to my bubble-T data" | `fitParameters` under **choupoProps** |

The unit-op schemas keep saying *"for 'I need P_out = X' wrap the unit in a
DesignSpec outerDict"* — §3 below is that pattern, spelled out.

## Path syntax (what `target` / `path` accept)

Drivers mutate the flowsheetDict between passes via
`Dictionary::setScalarAtPath(path, value)` — dot-and-bracket notation:

```
units[0].operation.refluxRatio       # the first unit's reflux (0-indexed list)
units[2].operation.T                 # third unit
reactions.myRxn.kinetics.A           # an Arrhenius prefactor
variables.A                          # a top-level $variable
streams.feed.F                       # a feed flow
```

Each pass re-reads the case from disk, writes the new value at that path,
and runs — the case on disk is never modified.  **Values written this way are
RAW canonical SI** (K, Pa, kmol/s …): a sweep `range` carries no unit suffix,
so write it in the SI units of the target (e.g. `( 360.0 385.0 )` for a T in
K).  *Reading* results back uses a different, dotted RESULT path:

```
<unitName>.<kpiName>        # e.g. flash01.V_over_F  (any KPI the unit reports)
<streamName>.<field>        # field ∈ F, T, P, vf  (+ F_mass in designSpec only)
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
(1×1), `tutorials/steady/optimisation/designSpec01_triple_equal_areas` (2×2).

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
  `variables.<name>`), plus `initial` and optional `min`/`max` — all with
  unit suffixes, converted to SI on read.  The variable MUST exist in the
  flowsheetDict's `variables {}` block or the driver refuses loudly.
* `targets` entries are either a **value spec**
  `{ path <result-path>; value <X> <unit>; tol <X> <unit>; }` or an
  **equality** `{ lhs <pathA>; rhs <pathB>; tol <X>; }` (enforces
  resp(A) = resp(B) — e.g. equal areas, equal duties).
* dim(manipulate) must equal dim(targets) — it is a square Newton-ND.
* Target stream fields: `F` (kmol/s), `F_mass` (kg/s), `T`, `P`, `vf`.
* After convergence the simulator is replayed once at the design point, so
  the case ends with the full converged output (and `reports{}` run on it).

## 3. `type optimization;` — Nelder-Mead min/max

Canonical cases: `tutorials/steady/optimisation/optim01_column_reflux`
(KPI objective), `optim02_process_cost` (cost objective via postDict).

```
type    optimization;
method  nelderMead;                        // the only method (SQP is roadmap)

variables                                  // 1..n knobs, RAW dict paths
(
    { path units[0].operation.refluxRatio;  min 3.0;  max 5.0;  initial 4.0; }
    { path units[0].operation.feedStage;    min 6;    max 12;   initial 8;   }
);

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
* No constraints beyond the box — a purity floor etc. needs a penalty term
  in the objective (exercise) or the roadmap SQP.

## 4. Parameter estimation

**Canonical: `fitParameters` under choupoProps** — a `propsDict` operation,
NOT an outerDict.  Levenberg-Marquardt on dotted property-package parameters
vs experimental data, with identifiability statistics and an opt-in
promote-proposal writer.  Full recipe + the identifiability lesson:
`patterns.md` §4; tutorial `tutorials/props/old/fitNRTL01_ethanol_water`.

**RETIRED `fitBinaryPair`** — the factory throws, naming `fitParameters`
(choupoProps) as the replacement; `fitNRTL01_ethanol_water` was migrated to
fitParameters keeping its golden.  There is no runnable grammar to document
(historical note only).

Known limitation (CLAUDE.md §14): it requires the `pairs` INLINE in
`constant/propertyDict` (it mutates them in-memory) — a case using
external pair files (`constant/binaryPairs/...`) will not fit.  It is
slated for retirement; prefer `fitParameters` for anything new.

## The sweep CSV becomes a one-click plot in the GUI

When the case runs from the GUI's Assistant console, any `.csv` written
inside the case (the sweep/designSpec/optimization `report` file) is offered
as a **one-click plot chip** above the console input.  After authoring a
sweep for a student, tell them: run the case, then click the chip to see the
trend — no external plotting tool needed.
