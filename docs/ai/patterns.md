# Patterns — recipes for common case shapes

Each recipe is a working `flowsheetDict` snippet you can adapt.  When
a user asks "how do I do X?", point them at the closest one, then at
the corresponding tutorial in `case-layout.md`.

## 1. Recycle with a tear stream  (process03_recycle)

A reactor-flash chain where the flash's liquid returns to the
reactor.  The recycle is a CYCLE; we tear one stream and solve it.

```
streams
{
    freshFeed { F 100 kmol/h; T 350 K; P 1 bar;
                molarComposition { ethanol 0.5; aceticAcid 0.5; } }
}

tearStreams   (recycle );             # one or more tear stream names
recycleSolver Newton;                  # default; alt: Wegstein
recycleTol    1e-8;                    # relative tol, default 1e-5

units
(
    { name mixer1;  type mixer;
      inputs (freshFeed  recycle );  outputs (mixed ); }

    { name reactor; type cstr;
      in mixed;  outputs (reacted );
      operation { V_R 0.004; }
      reaction  esterification_etac; }

    { name flash1;  type isothermalFlash;
      in reacted;  outputs (vapor  recycle );
      operation { T 350 K; P 1 bar; } }
);
```

Initial guess for the tear: write the stream into `streams {... }`
with a reasonable starting composition.  Newton converges quadratically.
For counter-current cases with multiple tears + over-shoot, switch to
`recycleSolver Wegstein;` with damping (`evaporator05_counter_current`).

## 2. Sweep — vary one parameter, plot a KPI  (sensitivity01_column_reflux)

`system/outerDict`:

```
type    sweep;

parameter
{
    target    units[0].operation.refluxRatio;
    range     ( 1.5  5.0 );
    nPoints   10;
}

responses
(
    column01.T_top
    column01.x_D_LK
    column01.V_strip          # the swept response(s): <unit>.<kpi>
);

report
{
    format   csv;
    file     sweep_results.csv;
}
```

The simulator runs the case `nPoints` times across `range`, extracting
each `<unit>.<kpi>` in `responses` per pass and writing one row to
`sweep_results.csv` (parameter value + each response column).
Plot it in any tool (GUI's PropsView shows scan CSVs as a multi-line
plot natively).

## 3. DesignSpec — manipulate $variables so named targets are met
(designSpec01_triple_equal_areas)

`system/flowsheetDict` declares the manipulated `$variables` once:

```
variables { A 100 m2; F_steam 400 kmol/h; }

units
(
    { name effect1; type evaporator;  inputs (feed steam );
      outputs (liq1 V_1 cond1 );
      operation { area $A m2; U 1000; Tref 298.15; } }
...
);
```

`system/outerDict`:

```
type      designSpec;

manipulate
(
    { variable A;        initial 100.0  m2;     min 20.0  m2;      max 500.0  m2;     }
    { variable F_steam;  initial 400.0  kmol/h; min 100.0 kmol/h;  max 1500.0 kmol/h; }
);

targets
(
    { path  L3.F_mass;   value 4500.0 kg/h;  tol 1.0 kg/h; }   # <stream>.<field>
    { path  effect3.P;   value 15000 Pa;     tol 50 Pa;    }   # <unit>.<kpi>
);

options
{
    maxIter   40;
    tolF      1.0;
    fdStep    1.0e-4;
}

report   { file designspec_history.csv; }
```

`manipulate` names the case `$variables` to vary (bare `variable`
name, NOT a path — the driver writes `variables.<name>`); `targets`
gives the residuals to zero (`<stream>.<field>` or `<unit>.<kpi>`).
The Newton-ND iterates the simulator with new $A, $F_steam values
until every target is within `tol`.  Reports run on the final pass
(replay mode).

## 4. fitParameters — regress thermo parameters to experimental data
(the canonical fit engine, runs under **choupoProps**)

`fitParameters` is a `propsDict` operation under **choupoProps** (NOT an
outerDict, NOT a flowsheet).  It regresses any dotted thermoPackage
parameters by Levenberg–Marquardt against a dataset and is the one engine
the GUI runs and visualises.  `system/propsDict`:

```
operations
(
    {
        name        fit_nrtl;
        type        fitParameters;
        parameters
        (
            { path activityModel.pairs[0].a_ij; initial -0.5; min -5; max 5; }
            { path activityModel.pairs[0].b_ij; initial 200;  min -1500; max 1500; }
            { path activityModel.pairs[0].a_ji; initial  2.5; min -5; max 5; }
            { path activityModel.pairs[0].b_ji; initial -400; min -1500; max 1500; }
        );
        residual { kind T_bubble; P 1.01325 bar; data ( 0.05 361.95  0.10 359.95  ... ); }
        options  { maxIter 40; tolerance 1e-4; fdStep 1e-3; lambda0 1e-3; }
        output
        {
            fit_log   fit_history.csv;   // χ² + parameter trajectory per iter
            parity    parity.csv;        // model vs experiment at the optimum
            proposal  auto;              // OPT-IN promote: write a proposal .dat
        }
    }
);
```

`residual.kind` is currently `T_bubble` only (each (x_1, T_exp) row → the
model bubble-T residual; drives NRTL/Wilson binary-pair regression).

**Identifiability statistics (what the GUI Fit view shows).**  After the LM
loop, fitParameters forms JᵀJ at the optimum and reports per-parameter
standard errors, 95 % (Student-t) confidence intervals, the parameter
**correlation matrix**, a condition-number proxy, and a verdict
(`identifiable`/`invertible`/`well_conditioned`).  This is the point: a fit
can CONVERGE to a low χ² yet have meaningless parameters.  The shipped
ethanol-water fit does exactly that — χ² is tiny but max|correlation| = 1.000
between a_ij and b_ij, because NRTL τ = a + b/T is linear in both a and b/T at
a single pressure, so the two cannot be separated.  The GUI badges this RED
("converged — but the data don't pin all parameters individually") and names
the culprit pairs; the engine NEVER certifies a fit as good — the engineer
judges from the evidence.

**Promote (opt-in).**  `output { proposal auto; }` writes
`constant/binaryPairs/<model>/<pair>.fit-<date>.dat` with the fitted values, a
`provenance { source fitted; ... }` block, and — if the fit is not
individually identifiable — a loud header warning.  Promotion is then a
deliberate `mv` (or, in the GUI, a reviewed download-to-disk); the GUI never
writes data files itself.

**Legacy `fitBinaryPair`** (outerDict under choupoSolve, tutorial
`steady/fitNRTL01_ethanol_water`) still works but is **superseded** —
fitParameters does everything it did plus the statistics and the GUI Fit
view.  Prefer fitParameters for new cases.

## 5. Computed $variables — post-processing arithmetic
(evaporator02_triple_effect_sugar)

In any dict (typically controlDict or flowsheetDict):

```
variables
{
    # Inputs (plain numbers):
    A       100.0;

    # Computed (post-solve arithmetic over KPIs / stream fields / other vars):
    Q_total       { compute "effect1.duty + effect2.duty + effect3.duty"; unit kW; }
    water_evap    { compute "effect1.F_vap_mass + effect2.F_vap_mass + effect3.F_vap_mass"; unit kg/h; }
    economy       { compute "water_evap / effect1.F_steam"; }
}

reports
{
    streamTable {}
    massBalance {}
    computed    {}        # emits reports/computed/values.csv
}
```

Identifiers in `compute` resolve as `<unit>.<kpi>`, `<stream>.<field>`
(`T`, `P`, `F`, `vf`), an earlier computed var, or a plain `$variable`.
Order matters — references resolve sequentially.

## 6. Batch recipe — react then transfer to distill
(recipe01_react_then_distill)

In `system/flowsheetDict`:

```
units
(
    { name reactor;  type batchReactor;
      initial { T 350 K; P 1 bar; V 0.001; totalMoles 0.0185;
                molarComposition { ethanol 0.5; aceticAcid 0.5; } }
      operation { mode isothermal; T_setpoint 350 K; }
      reaction  esterification_etac; }

    { name still;  type batchStill;
      initial { T 350 K; P 1 bar; V 0.001; totalMoles 0; }
      operation { mode constantRate;  F_vap 2.0e-5 kmol/s;  P 1 bar; } }
);

recipe
(
    { time 400;  action transfer;     from reactor;  to still; fraction 1.0; }
    { time 800;  action setParameter; unit still;    key F_vap;  value 0; }
);
```

In `system/controlDict`:

```
application   choupoBatch;
startTime     0;
endTime       1200;     // s
deltaT        1.0;
writeInterval 30;
```

For condition-triggered events:

```
{ when { unit reactor; quantity x_ethanol; op lt; value 0.30; }
  action transfer; from reactor; to still; fraction 0.5; }
```

Quantities: `T`, `total`, `n_<comp>`, `x_<comp>`.
Operators: `gt`, `ge`, `lt`, `le`.

## 7. Multi-effect cascade with $variables + Newton-on-tears
(evaporator05_counter_current)

Counter-current backward feed: vapour flows hot → cold, liquid flows
cold → hot.  TWO tear streams (V_1 + V_2), damped Wegstein.

```
variables { A 17; F_steam 1500 kg/h; }

tearStreams    (V_1  V_2 );
recycleSolver  Wegstein;
recycleQmin    -0.7;            # extra damping for counter-current

streams
{
    feed   { F 5000 kg/h; T 298.15 K; P 1 bar;
             massComposition { water 0.85; sucrose 0.15; } }
    steam  { F $F_steam; T 393.15 K; P 200 kPa; state saturatedVapour;
             molarComposition { water 1.0; } category LP_steam_200kPa; }
    V_1    { F 1500 kg/h; T 372.0 K; P 100 kPa;
             molarComposition { water 1.0; } }   # initial guess
    V_2    { F 1500 kg/h; T 350.0 K; P  40 kPa;
             molarComposition { water 1.0; } }
}

units
(
    { name effect3; type evaporator;  inputs (feed V_2 );
      outputs (liq3 V_3 cond3 );
      operation { area $A m2; U 800; Tref 298.15; } }

    { name effect2; type evaporator;  inputs (liq3 V_1 );
      outputs (liq2 V_2_out cond2 );      # V_2_out IS the tear V_2
      operation { area $A m2; U 800; Tref 298.15; } }
...
);
```

Wrap in a DesignSpec on `$A, $F_steam` if you want to design for a
final product concentration + a specific operating pressure.

## 8. Fractal multi-sector "plant"
(plant/ChemicalPlantTutorial)

A plant is a TREE of folders.  Any `flowsheetDict` is ONE of two kinds:

- **LEAF** — one piece of hardware.  Has `type` (+ optional `model`,
  `reaction`, `thermo {}`), an `operation {}` block, a `boundary {}`
  (its ports), and a default `streams {}` (so it can run alone).
- **COMPOSITE** — a SECTOR or the PLANT.  Has `children (...)` (NOT
  `units`), a `boundary {}`, default `streams {}`, and `connections (...)`
  wiring the children together.  May add `tearStreams`/`recycleSolver`
  for an internal recycle.

Each name in `children (...)` is a SUBFOLDER holding its own
`system/flowsheetDict`.  Names follow `case-layout.md`: SECTORS in
`CAPS`, units / streams in `PascalCase`, components lowercase.

### The folder tree

```
tutorials/plant/MyPlant/
├── MyPlant.cho
├── system/
│   ├── controlDict                 application choupoSolve; ...
│   └── flowsheetDict               PLANT (composite): children + connections + boundary
├── constant/
│   └── thermoPackage               GLOBAL thermo -- CASCADES DOWN to every sector
├── REACTION/                       a SECTOR (composite)
│   ├── REACTION.cho
│   ├── system/flowsheetDict        children ( Mix Reactor ) + boundary + streams + connections
│   ├── constant/reactions          sector-particular (cascades down to its leaves)
│   ├── Mix/system/flowsheetDict    LEAF: type mixer
│   └── Reactor/system/flowsheetDict LEAF: type conversionReactor
└── SEPARATION/                     another SECTOR (composite)
    ├── SEPARATION.cho
    ├── system/flowsheetDict        children ( ... ) + ...
    └── Flash/system/flowsheetDict  LEAF: type flash
```

### A LEAF (one unit -- runs alone, or wired by its parent)

```
# REACTION/Reactor/system/flowsheetDict      (LEAF)
type        conversionReactor;
reaction    hda;                       # resolved from REACTION/constant/reactions (cascade)
operation   { conversion 0.75;  T 900 K; }
boundary    { inlets ( Feed );  outlets ( Product ); }   # <- its ports

streams      # DEFAULT feed for an isolated run; a parent connection OVERRIDES it
{
    Feed { F 400 kmol/h;  T 900 K;  P 35 bar;
           molarComposition { toluene 0.25;  H2 0.7125;  CH4 0.0375; } }
}
```

The boundary inlet/outlet NAMES are the leaf's PORTS.  Wire them from
outside as `LeafName/PortName` (e.g. `Reactor/Feed`, `Reactor/Product`).
(In a flat `units (...)` list a unit names its ports with `in`/`outputs`;
the fractal-leaf equivalent is this `boundary { inlets/outlets }` block.)
The unit reads its feed F / T / P / composition FROM the connected inlet
stream — you never write a `feed {}` or `composition {}` block yourself.

### A SECTOR (composite -- wires its leaves; runs alone too)

```
# REACTION/system/flowsheetDict              (SECTOR -- composite)
children    ( Mix  Reactor );                # -> ./Mix/..., ./Reactor/...
boundary    { inlets ( TolueneIn  H2In );  outlets ( Product ); }

streams      # defaults for an isolated sector run; the PLANT cables these in
{
    TolueneIn { F 100 kmol/h; T 900 K; P 35 bar; molarComposition { toluene 1.0; } }
    H2In      { F 300 kmol/h; T 900 K; P 35 bar; molarComposition { H2 0.95; CH4 0.05; } }
}

connections                                  # { from <source>; to <dest>; }
(
    { from TolueneIn;       to Mix/TolueneIn; }   # sector inlet  -> leaf port
    { from H2In;            to Mix/H2In;      }
    { from Mix/Mixed;       to Reactor/Feed;  }   # leaf out      -> leaf in
    { from Reactor/Product; to Product;       }   # leaf out      -> sector outlet
);
```

A connection's `to` end OVERRIDES that destination's default stream with
the source.  `from`/`to` are either this node's own boundary names
(`TolueneIn`, `Product`) or a child's port (`Mix/Mixed`, `Reactor/Feed`).

### Run any level

```
runCase tutorials/plant/MyPlant                  # the whole plant
runCase tutorials/plant/MyPlant/REACTION         # just one sector
runCase tutorials/plant/MyPlant/REACTION/Reactor # just one unit
```

A child runs in isolation because `thermoPackage`, `controlDict`,
`constant/reactions`, and `constant/components` **CASCADE UP** the folder
tree — a child inherits an ancestor's copy whenever it omits its own.  So
the SAME folder both runs standalone and assembles into the plant.

### Recycle inside a sector

List the tear and seed it, exactly as a flat case (§1, §7):

```
tearStreams   ( Recycle );
recycleSolver Newton;
streams { Recycle { F 150 kmol/h; T 310 K; P 1 bar;
                    molarComposition { ... } } }   # the initial guess
connections ( ... { from Splitter/Recycle; to Recycle; } ... );  # loop closes
```

### Curation phase (structure before streams)

A composite with `children` but **NO `connections`** is "in curation":
the sectors exist as thermo regions but are not wired.  The engine prints
a notice and does NOT simulate — curate the per-sector thermo
(`choupoProps`) first, then add `connections` to assemble and simulate.
This is the deliberate first state of a new plant.

## 9. User unit op in `case/code/`
(userOp01_yield_reactor)

A case may ship its own C++ unit op:

```
case/
├── code/
│   ├── YieldReactor.{H,cpp}     # the new unit
│   └── registerUserTypes.cpp    # explicit factory registration
├── system/
│   └── flowsheetDict            # uses `type yieldReactor;`
└──...
```

The student's `registerUserTypes()` calls
`UnitOperation::registerType("yieldReactor", []{ return std::make_unique<YieldReactor>(); });`.
`bin/buildCode <case>` compiles it into a per-case binary linked
against `libchoupo.so`.  Glass-box; no dlopen, no macro magic.

## 10. Heat integration — drive one unit with another's rejected heat
(heatlink01_condenser_to_heater)

A forward heat-link wires a *producer*'s rejected duty into a
*consumer* as its energy input.  Here a column's condenser duty
(~1.28 MW) heats a cold process stream through a `heater` — no
utility consumed, the heat is re-used.

```
streams
{
    feed        { F 100 kmol/h;  T 370 K; P 1.01325 bar;
                  molarComposition { benzene 0.5; toluene 0.5; } }
    coldProcess { F 1500 kmol/h; T 320 K; P 1.01325 bar;
                  molarComposition { benzene 1.0; } }
}

units
(
    # PRODUCER listed FIRST so it solves before the consumer reads its KPI.
    { name column01;  type distillationColumn;
      in feed;  outputs (distillate  bottoms );
      operation { nStages 15; feedStage 8; refluxRatio 2.0;
                  distillateRate 50 kmol/h; feedQuality 1.0; P 1.01325 bar; } }

    { name preheater; type heater;
      in coldProcess;  outputs (warmedProcess );
      operation { }                       # Q is supplied by the heat-link
      energyInputs
      (
          { from column01.condenser;  kind heat;  target Q; }
      ) }
);
```

The column exposes two implicit heat ports — `column01.condenser`
(cold, at the top) and `column01.reboiler` (hot, at the base).  The
consumer names the port in `energyInputs.from` and the operation key
to receive the resolved scalar in `target` (here the heater's `Q`).

**Ordering rule (forward heat-link):** the producer MUST be listed
*before* the consumer in the `units (...)` list, so its KPI exists when
the consumer's `solve()` reads it.  This is the energy-wire analogue of
a tear stream, but with no iteration — it is a one-pass forward
dependency.

For the full energy model — work wires (`W = scalar wire`) vs heat
carriers (`Q` carried-or-allocated), the column reboiler/condenser
heat ports, allocation-by-temperature-level, and the `utilityAllocation`
report — see `docs/ai/energy.md`.

## 11. Convergence aids — bounds + honest auto-init  (the "no silent crutch" credo)

When a hard recycle wanders out of the physical region mid-iteration (a
flash flips, a tear flow goes negative, T runs away), help it — but
*honestly*.  Choupo's rule: **every aid is explicit and the solver
announces when it acts; it never silently props itself up** (the
cautionary tale is ASCEND, demoed as a mystical solver while a hidden
`1 kg/s` guess kept it from breaking).

**Initial guesses live on the stream.**  A tear's `streams {}` block IS
its guess (`process03_recycle`).  Omit it and the solver auto-seeds from
the feed aggregate and SAYS so — and nudges you to write a real guess:

```
[init] tear 'recycle': no guess supplied -- seeded from the feed aggregate
       (F=1.000 kmol/h, T=350.0 K).  An explicit guess ... will converge faster.
```

**Bounds cage the iterate (optional).**  Add a `bounds {}` to the tear
stream (syntax: `docs/ai/dict-syntax.md`).  Flow uses a fraction of a
frozen feed reference (ratio scale → ×); temperature uses a signed K
offset (interval scale → ±):

```
recycle
{
    F  2.0 kmol/h;  T 350 K;  P 1 bar;  molarComposition { ethanol 0.5; water 0.5; }
    bounds
    {
        F  { reference feedTotal;  min 0.1;    max 8; }       // 0.1× .. 8× the feed
        T  { reference feedMax;    min -50 K;  max +100 K; }  // feedMax ± K
    }
}
```

The cage shapes the SEARCH; after convergence the solver checks the
PHYSICAL value and WARNs if it lies outside the cage — a bound active at
the solution is a SIGNAL that your spec, not the solver, is the
constraint.  It never fakes the answer:

```
[bound] tear 'recycle': F caged to your max 0.600 kmol/h during the recycle solve
[bound] WARNING: tear 'recycle': converged F = 0.679 kmol/h EXCEEDS your max 0.600
        -- the bound excludes the physical solution; widen it or revisit the spec.
```

**Ratings speak.**  A membrane warns if the feed exceeds its catalogue
`P_max`/`T_max`; vessel sizing warns (it no longer aborts) above the
material's pressure rating — WARN-only, never a clamp.

All of these advisories ride in the result JSON and surface in the GUI
(amber run-complete toast + a list in the Streams summary band), so a
student who never opens the Log still sees them.  Bounds are aids, not
requirements — a case runs without any.

## 12. Compare several models on ONE plot — the `experimental {}` overlay  (choupoProps)

This is the **"see, then decide"** pillar: to choose between thermo models
(ideal vs NRTL vs Wilson, …) you OVERLAY their predictions on the **same axes**
and look.  It takes **TWO pieces** in `system/propsDict` — and forgetting the
second is the usual mistake (you get N separate plots instead of one overlay).

**Piece 1 — one scan `operation` per model.**  Each `propertyScan1D` sweeps the
SAME variable and emits the SAME properties, differing only in its `thermo {}`
override.  For a VLE comparison emit the **(x, T_bubble, y_eq) trio** — that
trio is what unlocks the T-x-y / x-y / T-x / T-y toggle:

```
operations
(
    { name txy_ideal;  type propertyScan1D;
      vary { variable x[methanol]; from 0; to 1; n 51; }
      state { P 1.01325 bar; composition { methanol 0.5; aceticAcid 0.5; } }
      thermo { activityModel { model ideal; } }
      properties ( T_bubble  y_eq_methanol );  output { file txy_ideal.csv; } }

    { name txy_nrtl;   type propertyScan1D;
      vary { variable x[methanol]; from 0; to 1; n 51; }
      state { P 1.01325 bar; composition { methanol 0.5; aceticAcid 0.5; } }
      thermo { activityModel { model NRTL; pairs ( { i methanol; j aceticAcid; a_ij ..; b_ij ..; a_ji ..; b_ji ..; alpha 0.3; } ); } }
      properties ( T_bubble  y_eq_methanol );  output { file txy_nrtl.csv; } }
);
```

**Piece 2 — an `experimental {}` entry that OVERLAYS them.**  This is the part
that actually puts both curves on one figure.  `models ( … )` lists the scan
ops by name; `dataset` is OPTIONAL (add it to draw real lab points on top):

```
experimental
(
    {
        name      txy_compare;       // the title of the combined plot
        component methanol;          // the axis component
        kind      txy;               // VLE comparison -> the T-x-y/x-y toggle
        models    ( txy_ideal  txy_nrtl );   // <-- the ops from Piece 1, overlaid
        // dataset "constant/experiments/<file>";   // OPTIONAL: lab points as markers
        // source  "DECHEMA Vol.I";                 // OPTIONAL: citation
    }
);
```

In the GUI this appears as **one** entry under **"Comparisons (data vs
models)"** in the Props navigator; opening it draws every model curve together,
with a **T-x-y / x-y / T-x / T-y** toggle (top-right) — **x-y is the
McCabe-Thiele diagram**.  Add a third model (`txy_wilson`) just by writing its
scan op and adding its name to `models ( … )`.

**The common mistake (and how to recognise it):** declaring the scan
`operations` but NO `experimental {}` block.  Then each model shows as its OWN
entry under "Property estimates", one at a time — never overlaid.  If you wrote
two `txy_*` scans and they only appear separately, you are missing Piece 2.

**If the curves come out nearly coincident, that is a RESULT, not a bug** —
the binary is close to ideal (or the placeholder pair parameters are weak), and
*seeing* the two curves almost touch is exactly how the student decides NRTL is
not worth it here.  Promote a model only when the overlay shows it earns its
keep.

**Piece 3 — the AAD validation number (automatic).**  When an `experimental {}`
entry has BOTH a `dataset` AND `models`, the engine QUANTIFIES the overlay: for
each (model, shared property column) it interpolates the model curve onto the
MEASURED abscissa and reports an average absolute deviation (AAD).  It prints a
ranked table (verbosity ≥ 2) and emits a `validation` array in the run JSON.
Rules that keep the number honest (a wrong AAD is worse than none):
- the dataset must be the self-describing `columns ( {name; unit;} … )` format
  (so values are canonical SI and each column's kind is known) — the legacy
  2-column format is refused (no validation emitted);
- the model's abscissa column must NAME-match the dataset's (else
  `status: abscissaMismatch`, no number) — e.g. a Psat-vs-T scan cannot be
  scored against an x-abscissa VLE dataset;
- metric by unit: temperature → mean |ΔT| in **K**; mole fraction → mean |Δ|
  (absolute); other dimensional → relative **%** (with a near-zero guard);
- measured points outside the model's scanned range are EXCLUDED and counted
  (never extrapolated); the used/total point count is always shown.

Example: ethanol-water at 1 atm gives ideal T_bubble AAD ≈ 5.4 K vs NRTL ≈ 0.35 K
(and y AAD 0.088 vs 0.0023) — the azeotrope is why NRTL wins, now as a number.

**Worked example with REAL lab data:**
`tutorials/props/compare/compare_vle_etoh_water` — ethanol/water T-x-y at 1 atm, the
ideal and NRTL bubble/dew curves overlaid with measured VLE points (Carey &
Lewis 1932, in `constant/experiments/etoh_water_vle_1atm.dat`).  The ideal
curve misses the azeotrope; NRTL lands on the data at x ≈ 0.894, 78 °C — the
canonical "see the data, pick the model".  The dataset uses the self-describing
`columns ( {name; unit;} … ) + data ( … )` form, so the engine echoes x, T AND
y to `exp_<name>.csv` and every T-x-y / x-y view gets its measured points.

**Kinetics overlay** (`kind kinetics`): the same pattern fits CHEMICAL KINETICS.
`tutorials/props/compare/compare_kinetics_order` -- two `kinetics1D` ops (order 1, order
2) each regress their own k from one measured c(t) set; the `experimental {}`
entry (`kind kinetics`, `models ( rate_order1 rate_order2 )`, `dataset`) overlays
both fitted curves on the measured points.  The data are second-order, so the
order-1 curve misses the tail (R^2 0.97) and order-2 lands on it (R^2 0.999) --
the data picks the order.

## 13. Create a component from its groups — `estimateComponent` (choupoProps)

When a component is missing from the catalogue AND the literature, ESTIMATE its
pure-component constants from the molecular groups it is built from, by the
Joback group-contribution method.  This is the CREATE stage of the props
lifecycle (create → curate → wire → simulate).

```
operations
(
    {
        name        estimate_acetone;
        type        estimateComponent;
        component   acetone;
        groups      ( { group CH3; count 2; } { group ketone; count 1; } );
        reference   { source "NIST"; Tb 329.2 K; Tc 508.1 K; Pc 47.0 bar; omega 0.307; }
    }
);
```

It sums each group's tabulated contribution and reports MW, Tb, Tc, Pc, Vc,
omega (Lee-Kesler), dHf, dGf, Hvap, and the ideal-gas Cp(T) polynomial.  The GUI
shows an **estimate card** (estimated vs reference, dev% coloured); the per-group
build-up is in the run log.  The optional `reference {}` block validates the
estimate against known values — glass-box: you see the estimate grow from groups
AND see its error.

**Groups available** (tokenizer-safe keys — the full Joback Table 2-2, 40 groups):
- hydrocarbons: `CH3 CH2 CH C` (alkane sp3), `eCH2 eCH eC` (alkene sp2),
  `alleneC` (=C=), `yneCH yneC` (alkyne sp), `rCH2 rCH rC` (saturated ring),
  `arCH arC` (aromatic ring)
- halogens: `F Cl Br I`
- oxygen: `OH` (alcohol), `OHar` (phenol), `ether` (-O-), `etherRing` (ring -O-),
  `ketone` (>C=O), `ketoneRing` (ring >C=O), `aldehyde` (-CHO), `acid` (-COOH),
  `ester` (-COO-), `Oother` (=O, other)
- nitrogen: `NH2` (primary amine), `NH` (secondary), `rNH` (ring >NH),
  `N` (tertiary), `eN` (=N- nonring), `reN` (ring =N-), `CN` (nitrile),
  `NO2` (nitro)
- sulfur: `SH` (thiol), `S` (-S-), `rS` (ring -S-)

So N/S/halogen species (acetonitrile = `CH3`+`CN`, chloroform = `CH`+3·`Cl`,
methylamine = `CH3`+`NH2`, thiophene = ring) are now estimable.  Caveat: the
`eN` group lacks Vc/Cp/dGf contributions in the source table (its Gf and Cp
estimates are unreliable — the run log flags it).

**Honest limits** (printed): Joback is weak on Tb of strongly H-bonding species
(ethanol's Tb ~14 K low) and gives NO Antoine / vapour-pressure parameters —
those need a fit or a corresponding-states correlation, a separate step.

Tutorials: `estimate_acetone` (validated vs NIST), `estimate_ethanol_benzene`
(the method's spread — ethanol weak, benzene good).  Theory: `docs/propsGuide.pdf`.
