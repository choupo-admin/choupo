# Case layout — the folders + files a case is made of

Every Choupo case is a directory of plain-text dictionaries -- the case files
are the source of truth.

## The canonical tree

```
<caseName>/
├── <caseName>.cho           GUI marker -- empty or GUI layout metadata
├── system/
│   ├── controlDict          REQUIRED   meta-control (which binary,
│   │                                   verbosity, reports{}, time)
│   ├── flowsheetDict        REQUIRED for solve/batch/ctrl --
│   │                                   topology (units + connections)
│   ├── propsDict            REQUIRED for choupoProps INSTEAD of
│   │                                   flowsheetDict
│   ├── solverDict           OPTIONAL  per-unit-op solver options
│   ├── outerDict            OPTIONAL  outer driver (sweep /
│   │                                   optimization / DesignSpec)
│   └── layoutDict           OPTIONAL  the plot plan of the SIZED items
│                                       (bin/choupo-layout --draft)
├── constant/
│   ├── thermoPhysPropDict   REQUIRED; the thermophysical system (v2
│   │                          grammar).  Declares `recordType
│   │                          thermophysicalPropertySystem;`, the component
│   │                          list, and the equilibrium formulation with its
│   │                          model slots (see thermo.md)
│   ├── propertyManifest     record-ownership registry (bin/choupo-import);
│   │                          `sealed true;` = self-contained, no catalogue
│   │                          fallback at runtime
│   ├── reactions            OPTIONAL  named-reaction library
│   ├── crystallisation      OPTIONAL  per-kinetic-pair library
│   ├── dryingKinetics       OPTIONAL  drying-curve library
│   ├── components/          OPTIONAL  case-local component overlays
│   │   └── <name>.dat       partial overlay over standards (axiom 4)
│   └── parameters/          OPTIONAL  case-local NRTL/Wilson pair files
│       └── <model>/<pair>.dat
├── 0/                      REQUIRED for solve/batch/ctrl; one COMPLETE
│   └── <stream>          state file for every graph stream
├── code/                    OPTIONAL (case-local user unit op)
│   ├── MyUnit.{H,cpp}       compiled by bin/buildCode into a per-case binary
│   ├── registerUserTypes.cpp explicit factory registration
│   └── options              (opt) extra INCLUDE/LIBS/FLAGS for student deps
├── reports/                 GENERATED on each run (gitignored)
│   ├── streams/streamTable.csv
│   ├── balances/{massBalance,energyBalance}*.csv
│   ├── utilities/summary.csv
│   ├── unitOperations/<unit>/profile.csv     (if a profile was emitted)
│   ├── design/sizing.csv                     (if a `design{}` report)
│   ├── economics/costs.csv                   (if a `economics{}` report)
│   └── report.ods           coloured spreadsheet (multi-sheet)
├── converged/               GENERATED: the solved state.  A state view is a
│                              RESTARTABLE SNAPSHOT and carries BOTH halves:
│   ├── <LEVEL>/<stream>        a stream -- ONE file, flat, the boundary of the
│   │                          snapshot, at the LOWEST level of the case that
│   │                          contains every ENDPOINT of it (a sector, or the
│   │                          plant's own level `MAIN/`; flat in a flat case)
│   └── internalStates/<SECTOR>/<unit>   a unit's INTERIOR -- ONE file per
│                              unit, what it holds between those boundaries,
│                              one BLOCK per kind: `stageProfile {}`,
│                              `axialProfile {}`, `sizeDistribution {}`,
│                              `swingTable {}` (or `profile {}` for an axis
│                              with no declared kind).  Under its own root so
│                              a unit and a stream sharing a name never
│                              collide (identity is kind + sector + name).
│                              A PROJECTION of the same record as
│                              `unitOperations/<unit>/profile.csv` above; a
│                              temperature-swept construction (van Heerden,
│                              Merkel) is an ANALYSIS, not equipment state, and
│                              gets no file.  Rewritten whole every run, never
│                              edited (gitignored) -- but COPY a unit's file
│                              into `0/internalStates/` at the same address
│                              and the next run STARTS from it.
├── design/                  GENERATED: the EQUIPMENT SPECIFICATION SHEETS,
│   └── <SECTOR>/<unit>/<equipmentTag>     one dictionary per physical item --
│                              inlets, outlets, sizing (each value with its
│                              declared unit) and cost.  Written whenever a
│                              `sizing {}` PASS ran; rewritten whole every run,
│                              never edited (gitignored).  This is the page a
│                              project is audited from; `reports/design/sizing.csv`
│                              above is the whole-plant TABLE, a different file.
├── <t>/                     GENERATED by choupoBatch / choupoCtrl /
│                              choupoSemiContinuous at every writeInterval,
│                              BY DEFAULT (`solutionControl { write false; }`
│                              turns them off): the LAYOUT OF `0/` at time t
│                              -- one file per stream, `internalStates/<unit>`
│                              per vessel (gitignored).  Rename one `0/` and
│                              the case starts from t.
└── trajectory.csv           GENERATED by choupoBatch / choupoCtrl
                              (gitignored)
```

## The views repeat the plant

A sectored case is **a plant and its sectors** — two levels, plus each
unit's own folder.  (Older records use the name this layout was formerly called, "fractal";
it was retired 2026-10-09 because it promised a recursion no case has.  Say
"a plant and its sectors" or "a sectored case".)

Read a sectored case as **PLANT → SECTOR → UNIT / STREAM**, and read the
top-level folders that are not `system/` or `constant/` as **views of that
same geography**.  The nine-line language a student needs:

```
constant        what we know         (thermo, components, reactions, kinetics -- at EVERY level)
system          how we solve         (controlDict, flowsheetDict, solverDict -- at EVERY level)
MAIN/SECTORS    where we are in the plant
0               where we started     (streams, AND under internalStates/ what is inside each unit; authored)
converged       where we ended       (the same two halves, solved)      [run output]
design          how big the equipment is (one sheet per item)           [run output]
iterations      how the solver got there (numerical history, never physical time)  [run output]
postProcessing  what we report       (with `reportsLayout postProcessing;`; else reports/)  [run output]
```

`0/` and `converged/` carry the plant's WHOLE geography —
`MAIN/ CONCENTRATION/ DRYING/ FERMENTATION/`, the same list the plant's
`sectors ( … )` declares — because every sector has streams.  A DERIVATIVE
view carries only the levels it has something to say about, and says so by
being absent: the flagship's `design/` has three (its `MAIN` holds one
splitter, and a splitter realises no sized item), and `iterations/` repeats
the geography INSIDE each instant (`iterations/000000/MAIN/`), not at its own
root, where the levels are the instants.  So the geography a student learns
once is the STATE views' — do not read a missing `design/MAIN/` as a defect,
and do not create one.  `system/` and `constant/` exist at every level of
the case (the plant's, a sector's, a unit's) and never inside the
geography.  Record:
[`../design/main-is-a-sector-and-the-views-repeat-the-plant.md`](../design/main-is-a-sector-and-the-views-repeat-the-plant.md).
**A state view carries the streams AND each unit's interior**, the way an
OpenFOAM time directory carries a field's `boundaryField` and its
`internalField` in one file: inside `0/` and `converged/`, the streams are
files flat under their sectors, and `internalStates/<SECTOR>/<unit>` is ONE
file per unit with one block per kind — the view shows the boundary
directly; the interior is namespaced inside the same view.  What the
interior IS (a field over a coordinate of
the equipment or its inventory, never a construction over a swept parameter)
is in
[`../design/internal-states-are-a-projection-of-profiles.md`](../design/internal-states-are-a-projection-of-profiles.md);
why it lives inside the state view, and what a case gains by DECLARING one in
`0/`, is in
[`../design/a-state-directory-is-a-restartable-snapshot.md`](../design/a-state-directory-is-a-restartable-snapshot.md).
Witnesses: `tutorials/steady/distillation/column16_declared_interior` and
`tutorials/steady/absorption/extract02_declared_interior`.

**The time-integrated classes use the SAME layout (2026-09-30, task #186).**
A `choupoBatch`, `choupoCtrl` or `choupoSemiContinuous` case keeps its
starting state in `0/` exactly as a steady case does: ONE file per stream at
`0/<stream>` (the canonical `componentMolarFlows` + `T` + `P` grammar), named
by the stream the unit declares (`in <stream>;` / `inputs ( ... );` /
`outputs ( ... );`), and ONE file per vessel at `0/internalStates/<unit>`
carrying a `holdup {}` block:

```
recordType  internalState;
unit        "reactor";
equipment   dynamicCSTR;

holdup
{
    T           320.0 K;
    P           1.013 bar;
    V           0.001 m3;
    holdupMolar { compA 0.012 kmol; compB 0.0 kmol; }   // per species
    //  or, as an author usually writes a charge:
    //  totalMoles 0.012;  molarComposition { compA 1.0; compB 0.0; }
}
```

Any key the vessel's own start reads rides in the same block (a
recirculating ED rig's `concentrate {}`, `start steadyState;`); the
inventory is stated ONCE (both spellings together are refused).  Every
stream a unit CONSUMES must have its file (for a routed stream: its value
until the first step overwrites it); a file naming no stream of the topology
is an ORPHAN and refused; a product's file is allowed (a time directory
carries one) and is read but not used, because its value is its producer's
outlet.  The retired shape -- `0/internalState` with every holdup and
`0/streamFaces` with `"<unit>.<port>"` faces -- is REFUSED by name; there is
no dual reader, and `bin/curate/migrate_state_layout.py <case>` converts a
case in one shot.  Every `writeInterval` the run writes a `<t>/` with the
same layout; a vessel whose state is MORE than its holdup (a crystal
population, an adsorbed loading, an axial bed profile) writes
`notRestored "<what>";` in its record, and a restart from that record is
refused rather than re-invented.  Witness:
`tutorials/unsteady/unsteady02_tanks_in_series`.  `bin/choupo-init0`
materialises the interior of every unit that reads one (its OWN seed — see
below), and a case that declares an interior tree must declare one for EVERY
unit that reads one: a snapshot that restores half a plant is not a restart.

## The `.cho` marker

A file named `<caseName>.cho` inside the case folder.  It is the GUI's
"openable entity" (mirrors ParaView's `.foam` file, where the extension is
the project's name -- here `.cho`, short for Choupo).  Always there.  If you
scaffold a case for a user, create it empty:

```sh
touch <caseName>/<caseName>.cho
```

The solver never reads it.  It starts empty; when the student arranges the
flowsheet in the GUI, the GUI stores its layout metadata here (a
`choupoLayout` JSON with node positions) -- GUI state lives in the marker,
never in the dicts the C++ solver reads.

## The four standard `controlDict` keys

```
application   choupoSolve;          // | choupoBatch | choupoSemiContinuous | choupoCtrl | choupoProps
description   "one-line label";      // printed in the run header
verbosity     3;                     // 0 silent, 3 default (Newton iters visible)
reports
{
    streamTable {}
    massBalance {}
    energyBalance {}
    spreadsheet {}                   // writes a coloured.ods
    //... see CLAUDE.md for the rest (utilities/profiles/design/economics/computed)
}
```

For `choupoBatch` / `choupoSemiContinuous` / `choupoCtrl` (time-dependent), add:

```
startTime       0;        // s
endTime         3600;     // s
deltaT          1.0;      // s   (RK4 step; in choupoCtrl this is the controller SAMPLE time)
writeInterval   60;       // s   (trajectory snapshot interval)
```

**Opt-in adaptive time-stepping** (default is the fixed-RK4 `deltaT` loop).
Add `timeStepping adaptive;` to switch the fixed step for the stiff,
error-controlled Rosenbrock23 integrator — like OpenFOAM's `adjustTimeStep`,
but the criterion is the integrator's LOCAL ERROR (`rtol`/`atol`), not a
Courant number (there is no mesh in these 0-D holdup problems).  The step
starts LOW (`deltaT0`) and grows/shrinks automatically to hold the tolerance;
trajectory rows still land on the clean `writeInterval` grid.  Absent or
`timeStepping fixed;` keeps the classic RK4 path byte-identical.

```
timeStepping    adaptive;          // default: fixed
timeSteppingControl
{
    rtol        1.0e-6;            // relative local-error tolerance
    atol        1.0e-9;            // absolute floor (broadcast to all rows)
    deltaT0     1.0e-3;            // s   initial (LOW) step — it grows from here
    deltaTmax   10.0;             // s   cap on the step (the spiritual maxCo)
    maxGrowth   2.0;              // per-accepted-step growth limit
}
```

In `choupoCtrl` the digital controller still samples on the fixed `deltaT`
grid; the adaptive integrator sub-steps the plant BETWEEN samples with the
manipulated variable held.  Worked examples: `tutorials/batch/reactor/
batch06_adaptive_runaway` and `tutorials/ctrl/ctrl03_adaptive_disturbance`.

**Chaining dynamic units (tanks-in-series, since 2026-08-24).**  `choupoCtrl`
units may declare the SAME `in <stream>;` / `outputs ( <stream> );` topology
every steady flowsheet uses; matching names form a route, and at every
accepted driver step the downstream unit's inlet is overwritten with
the upstream outlet at the step's START (one-step-explicit: a transport
delay of one driver step, announced by `[routing]` lines at startup).  The
stream's file `0/<stream>` is the t = 0 state of a routed inlet and the
whole state of an unconnected one.  Forward series/parallel routing only: a
self-loop, two producers of one stream name, and a controller actuating a
ROUTED inlet field all refuse by name.  Worked example:
`tutorials/unsteady/unsteady02_tanks_in_series` (three equal tanks, impulse in
tank 1, Erlang-3 moments at tank 3 against Levenspiel closed forms).
Only units with a clean packed-ODE form (`batchReactor`, `dynamicCSTR`) take
the adaptive sweep; any other vessel takes one fixed sub-step per interval.

For display preferences (units shown in printed output):

```
units
{
    pressure   bar;       // default Pa
    flow       kmol/h;    // default kmol/s
}
```

Affine units (`degC`, `degF`) are REJECTED as display units — no single
multiplicative factor fits the formatter; temperatures print in `K`.

These do NOT change what the solver computes; they change what the
text output reads.

## Naming convention

Choupo uses three case styles to make the **hierarchy visible to a
human reading the dict in a text editor** — without colour, badges or
tooltips.  Decided 2026-05-27.

| Level | Style | Examples |
|---|---|---|
| **SECTOR** (a sub-flowsheet folder of the plant) | `UPPER_CASE` | `CONCENTRATION`, `DRYING`, `REACTION_SECTION` |
| **Unit operation** (a single piece of hardware) | `PascalCase` | `Evap1`, `Cryst`, `Reactor`, `Heater1`.  2-letter abbreviations stay all-caps: `BD`, `CY`, `SD`. |
| **Stream** (process stream between units) | `PascalCase` | `RawJuice`, `Magma`, `Cond1`, `EvapVapour` |
| **Plant / case root folder** | `PascalCase` | `ChemicalPlantTutorial`, `EthyleneOxidation` |
| **Component** (chemical species) | as-shipped (lowercase / chemical symbol) | `water`, `sucrose`, `N2`, `ethanol`, `CO2` |
| **Dict keys** (`controlDict`, `flowsheetDict`, `connections`, `operation`, `composition`,...) | `camelCase` | unchanged |

Reading any flowsheetDict, the eye picks up three sharp levels:

```
sectors     ( MAIN  CONCENTRATION  DRYING );  // members -- the buildings

operation   { area 60 m2;  U 2200 W/m2/K; }   // hardware values

// stream STATE is never in this dict: the domain inlet RawJuice is an
// authored 0/MAIN/RawJuice file (componentMolarFlows + T + P) -- at the
// plant's own level, because a plant inlet's other endpoint is the
// plant's own boundary

connections {                                 // NAMED edges: key = stream id
    RawJuice  { to MAIN/RawJuice; }
    Magma     { from CONCENTRATION/Magma;  to DRYING/Magma; }
    Vap1      { from Evap1/Vap1;           to Evap2/Steam; }
}
```

**A plant-level unit lives in a sector — conventionally `MAIN/`** (2026-09-05),
and **`MAIN/` is the DOMAIN'S OWN LEVEL rather than a sector like the others**
(amended 2026-09-07).  In a sectored case every folder in CAPS is a level of the
plant's geography, so a unit that belongs to no specialised sector (the
flagship's `JuiceSplitter`, which splits the raw juice between two lines) goes
in `MAIN/` rather than beside the sectors at the root.  The plant's geography is
then ONE list — `MAIN · CONCENTRATION · DRYING · FERMENTATION` — and every view
repeats it.

**Where each stream's state file goes follows from ONE rule: a stream lives at
the LOWEST LEVEL whose subtree contains every one of its endpoints.**  A stream
between two units of one sector lives in that sector; a stream CROSSING two
sectors, and a plant-boundary inlet, live at the plant's own level, `0/MAIN/`
and `converged/MAIN/`.  A stream is an EDGE, and an edge between two subgraphs
belongs to neither — it belongs to the graph that contains both.  A plant
OUTLET does not rise: `Powder { from DRYING/DryPowder; }` is the plant's LABEL
for a stream DRYING owns, and a label never gets a file of its own.

The convention is for humans: the engine never infers "sector" from capital
letters (a member with a `type` is a leaf, whatever its name), and a FLAT case
has no `MAIN/` — its units are the plant, so its state files stay flat.
`choupoSolve --manifest <case>` prints where every stream's file goes; a file at
the wrong address makes the run REFUSE, naming the move.  Records:
[`../design/main-is-a-sector-and-the-views-repeat-the-plant.md`](../design/main-is-a-sector-and-the-views-repeat-the-plant.md)
and
[`../design/a-stream-belongs-to-the-graph-that-contains-both-ends.md`](../design/a-stream-belongs-to-the-graph-that-contains-both-ends.md).

No special characters in identifiers: only letters, digits, and
underscore.  Symbols like `@`, `&`, `#`, `?` break shell expansion,
URL encoding, and tooling — and the case-style distinction already
carries the hierarchy.

**Exception**: a number of older `tutorials/props/` cases keep their
pre-convention names — no `NN` index, plain lowercase words
(`compare_vle_etoh_water`, `enthalpy_naoh_water`, `h_surface_identity`).
They are kept as regression fodder and are not renamed.  Authoring new
cases follows the convention above.

## Tutorial layout

Cases live under `tutorials/<discipline>/<name>/`.  A top-level folder is
a DISCIPLINE a student studies, not a binary (ruled 2026-09-20); the
binary is the case's own `controlDict.application`, which `runCase` reads:

```
tutorials/
├── steady/       steady-state process simulation  (choupoSolve; the largest
│                 collection, sub-foldered by OPERATION: flash/, distillation/,
│                 membranes/, electrodialysis/, ...)
├── unsteady/     transient process simulation, no control loop
│                 (choupoSemiContinuous; choupoBatch later)
├── ctrl/         process control: the design of control loops (choupoCtrl)
├── batch/        batch processes: recipes, vessels, campaigns (choupoBatch)
├── props/        thermophysical properties and the props bench (choupoProps)
└── plant/        integrated plant design: nested-folder plant tutorials
                  (composite + leaf nodes)
```

`bin/runCase` reads each case's `controlDict.application` field and
dispatches automatically:

```sh
runCase tutorials/steady/flash/flash01_benzene_toluene
runCase tutorials/batch/reactor/batch05_crystalliser
runCase tutorials/props/scan/scan2d01_co2_compressibility
```

The shipped tutorials are indexed in `docs/tutorials-catalogue.md`.  Common
starters to compare against when answering "write me a case for X":

| If user wants | Quote this tutorial |
|---|---|
| Vapour-liquid flash | `flash01_benzene_toluene` |
| NRTL flash + Wegstein | `flash02_ethanol_water` |
| Dissolved gas / Henry world (inline property manifest) | `flash08_co2_water_package` |
| φ-φ world (`eos.SRK` both phases + kijPairs) | `flash09_n2ch4_stryjek` |
| Bubble-T point | `bubbleT01_ethanol_water` |
| Adiabatic CSTR | `cstr04_adiabatic` |
| PFR | `pfr01_first_order` |
| Reactor + flash chain | `process01_reactor_flash` |
| Recycle (with tear) | `process03_recycle` |
| Wang-Henke column | `column01_benzene_toluene` |
| Azeotrope column (MESH) | `column03_azeotrope_mesh` |
| Shortcut FUG | `shortcut01_benzene_toluene` |
| Absorber (NH3-water) | `absorber01_NH3_water` |
| Stripper | `stripper01_NH3_water` |
| Heat exchanger (eps-NTU) | `heatExchanger01_water_water` |
| Compressor | `compressor01_air` |
| DesignSpec (size area) | `designSpec01_triple_equal_areas` |
| Triple-effect evaporator | `evaporator02_triple_effect_sugar` |
| Counter-current evaporator | `evaporator05_counter_current` |
| Gibbs reactor (WGS) | `gibbs01_water_gas_shift` |
| Membrane (RO seawater) | `membrane01_RO_NaCl_seawater` |
| Membrane train (3 elements) | `membrane05_train` |
| Pitzer osmotic | `membrane06_pitzer` |
| Cyclone | `cyclone01_dust_removal` |
| Bag filter | `bagFilter01_dust` |
| Spray dryer | `sprayDryer01_sugar` |
| Solid dryer | `solidDryer01_sugar` |
| Crystalliser (steady, equilibrium) | `crystalliser01_sugar` |
| Crystalliser (steady, MSMPR) | `crystalliser02_msmpr` |
| Crystalliser (batch dynamic) | `batch05_crystalliser` |
| Sweep | `sensitivity01_column_reflux` |
| Optimisation (Nelder-Mead) | `optim01_column_reflux` |
| Fit NRTL pair | `fitNRTL01_ethanol_water` |
| Property point (enthalpy-surface audit) | `h_surface_identity` |
| 1D property scan | `phase01_water_full` |
| 2D property scan (Z(T,P)) | `scan2d01_co2_compressibility` |
| Batch reactor (isothermal) | `batch01_first_order` |
| Adiabatic batch | `batch02_adiabatic` |
| Rayleigh batch distillation | `still01_benzene_toluene` |
| Batch recipe (transfer) | `recipe01_react_then_distill` |
| Dynamic CSTR + PID | `ctrl01_cstr_temp_control` |
| Disturbance rejection | `ctrl02_disturbance_rejection` |
| Multi-sector plant | `plant/ChemicalPlantTutorial/` |
| User unit op (case/code/) | `userOp01_yield_reactor` |

## Optional dicts are TRULY optional

A minimal case has only:

```
case/
├── case.cho
├── system/
│   ├── controlDict
│   └── flowsheetDict     (or propsDict)
├── constant/
│   ├── thermoPhysPropDict   (the declared thermophysical system)
│   ├── propertyManifest     (sealed record registry, bin/choupo-import)
│   └── components/          (the case's own property records)
└── 0/
    └── <stream>          (one complete state file per graph stream)
```

Don't add `solverDict` / `outerDict` / `reactions` unless you need
them.  Don't write empty stubs — and, more generally, **no juice-less
files**: every file must carry its own explanatory content.  The
`thermoPhysPropDict` declares the whole thermophysical system inline (there
is no selector into a shared catalogue); a content-free placeholder or an
empty role overlay is forbidden the same way.

## `system/postDict` — the post-processing chain

Optional; steady only.  Under an outer driver the chain is applied the way
the LOADED DRIVER states on the run header's `postDict:` line -- `designSpec`
and `optimization` on the representative pass (the replay at the answer),
`sweep` per converged point, `gridSweep` not at all (2026-09-26; before that
a `designSpec` case silently ran no chain under a header that said it did).
Each TOP-LEVEL key names a pass type and its
sub-dict is that pass's configuration; the passes run in order after
convergence and augment the result (they never change the solution):

```
batchPlan { ... }                 // the batch plant on the balance (C99) --
                                  //   ABOVE sizing/costing/economics, which may read it
sizing    { ... }                 // equipment sizes from the converged duties
costing   { method Turton; ... }  // cost from the sizes (case-sensitive; the former name `Guthrie` is refused, naming `Turton`)
economics { ... }                 // cash-flow aggregation over the costed plant
pinchPass { dTmin 20 K; }         // pinch TARGETS (P1): the Linnhoff-Flower
                                  // problem table printed cascade by cascade,
                                  // KPIs pinch.Q_H_min_kW / Q_C_min_kW /
                                  // T_pinch_K, and
                                  // reports/pinch/compositeCurves.csv
```

`pinchPass` extracts every duty-carrying unit's segment from the
converged result (CP = |Q|/|ΔT| between its process-side inlet/outlet
temperatures; a near-isothermal duty enters as a `latentWidth` slice,
default 1 K).  It only TARGETS — it never rewrites the network — and its
method hypotheses (constant CP per segment, the latent slice, first
non-utility stream pairing) are stated in `src/postProcessing/PinchPass.H`.
Its `dTmin` is the process–process approach of the targeting exercise, a
separate declaration from the `utilityAllocation` report's duty-to-utility
approach.  Exemplar: `tutorials/steady/heat/pinch01_four_stream_classic`.
The `sizing`/`costing`/`economics` chain: `docs/ai/outer-drivers.md` §cost
objectives and `tutorials/steady/flowsheets/process02_with_design`.

**ONE UNIT MAY BE SEVERAL PIECES OF EQUIPMENT.**  A `distillationColumn` is one
mathematical operation and FIVE physical objects -- a shell, a tray stack, a
condenser, a reboiler and a reflux drum -- and it is sized and costed as all
five, with one specification sheet each under `design/<unit>/<item>`.  Its
`designRules {}`:

```
{
    unitName    myColumn;
    type        distillationColumn;
    material    carbonSteel;
    designRules
    {
        traySpacing     0.50;       // m -- the same one `hydraulics {}` declares
        pressureDesign  2.0;        // bar

        condenser  { U 500.0; LMTD 48.0; pressureDesign 2.0; }   // W/m2/K, K, bar
        reboiler   { U 800.0; LMTD 17.0; pressureDesign 2.0; }
        refluxDrum { residenceTime 300.0; pressureDesign 2.0; }  // s, bar
    }
}
```

The DIAMETER is the answer the unit's own `hydraulics {}` block computed, so a
column that declares none is refused by name -- there is no separate diameter
correlation.  U, the approach temperature and the drum residence time do NOT
follow from a converged column and are yours; an item whose sub-block is absent
is ANNOUNCED and simply not built, because a default U would be priced into the
capital cost as though you had chosen it.  **The tray stack is costed by the
tray** (since 2026-10-05): Turton's sieve-tray set prices one tray from the
tower cross-section, times the tray count, times F_BM for the trays' material
CLASS and a quantity factor F_q for fewer than 20 trays.  Declare the class in
the column's designRules -- `trayMaterial carbonSteel;` (or `stainlessSteel`,
`nickelAlloy`); it is never read off the construction material's name, because
trays are often a different metal from the shell.  Without it the trays refuse
by name and the capital total reads `TOTALS (EUR) -- INCOMPLETE`.  Worked case:
`tutorials/steady/distillation/column09_tray_hydraulics`.

**A PLUG-FLOW CATALYST BED IS A SHELL AND A CATALYST CHARGE (2026-09-26).**
`type pfr` sizes the unit's OWN `V_R` -- the volume the PFR integrated, which
is the outer driver's answer when a `designSpec` solves it -- and never
rebuilds it from a throughput; its `designRules {}`:

```
{
    unitName    converter;
    type        pfr;
    material    SS316;                  // the SHELL's material
    designRules
    {
        pressureDesign        220.0;    // bar -- REQUIRED, refused by name if absent
        L_over_D              6.0;      // else the engine default, ANNOUNCED
        catalystBulkDensity   2500.0;   // kg/m3 -- optional; enables m_catalyst_kg
        catalystPrice         15.0;     // EUR per kg, today's money -- optional; enables the cost line
    }
}
```

Two items under `design/<unit>/`: `shell` (a straight cylinder of the bed
volume at L/D, ASME wall at `pressureDesign`, costed as a `vessel` on the
existing Turton vessel set) and `catalystCharge` (`m = V_R x catalystBulkDensity`,
costed at `catalystPrice x m` with NO price index, NO material or module
factor and NO contingency -- the costing table prints the shape word
`declared-unit-price` and the price beside it).  Absent the density the charge
publishes no mass and its basis says `mass not derivable`; absent the price
the charge is REFUSED BY NAME at costing time and the total reads `TOTALS
(EUR) -- INCOMPLETE` naming it.  The basis reads *catalyst volume V_R read
from the unit* and nothing more: the sizing pass cannot see the outer driver,
so whether the volume was solved or typed is said in the case, not by the
sizer.  There is no Turton set for a catalyst bed and none is invented; a
density or a price you cannot source is declared as an assumption in a
comment, in those words.  Worked case:
`tutorials/plant/ammoniaReactor04_kineticSizing`.

**A PRESSURE-RELIEF VALVE IS ONE MORE ITEM OF THE UNIT IT PROTECTS
(2026-10-11, DEV.md 4c C62).**  `type reliefValve` sizes a relief valve on the
DECLARED credible scenarios of an item already sized above it:

```
{
    unitName    LetdownHP;              // the PROTECTED unit
    type        reliefValve;
    material    SS304;                  // the valve body
    designRules
    {
        // protects  shell;             // only where the unit realises several items (a `pfr` bed)
        scenarios
        (
            { scenario blockedOutlet;  outlet LetdownGas; }      // `outlet` only if the unit has several
            { scenario blockedOutlet;  outlet LetdownLiquid; }
            { scenario fire;  environmentFactor 1.0;  drainage adequate; }   // both REQUIRED
        );
        // KdVapour 0.975; KdLiquid 0.65; Kb 1; Kc 1; Kw 1; Kv 1;   else each ANNOUNCED
        // backPressure 0.5 bar;                                    // GAUGE; else 0, announced
    }
}
```

The entry must come AFTER the protected unit's own sizing entry: the SET
PRESSURE is that item's published `pressureDesign` (gauge -- the MAWP, one
valve set at it), read and never typed.  `blockedOutlet` relieves the named
outlet's own flow at its own temperature and composition at P1 = MAWP x 1.10
(or + 3 psi) + 1 atm -- a vapour by the API 520 gas equation (critical or
subcritical against the back pressure), a liquid by the liquid one; a
two-phase stream is refused.  `fire` reads the wetted area from the protected
vessel's own D and H and the liquid level from its declared `inventory {}`
(the held liquid's `fraction` and `stream`), Q = C F A^0.82 (API 521), P1 =
MAWP x 1.21 + 1 atm, the liquid's bubble point at P1 on the case's package,
and the latent heat of the incipient vapour; a liquid at or above its main
component's critical point at P1 is refused.  Z and k = Cp_ig/(Cp_ig - R)
come from the case's package.  Governing = the largest area, published as
the REQUIRED effective area; NO API 526 orifice letter is selected (its
area table is a no-grant standard's, not reproduced -- `check_source_licence`
refuses it).  Named and refused: `tubeRupture`,
`controlValveFailure`, `coolingFailure`, `runawayReaction`,
`thermalExpansion`.  NOT COSTED: the costing table lists the valve as NOT
COSTED and the capital total does not move.  Sheet: `design/<unit>/psv`,
with a `relief {}` block naming each scenario's stream, phase and regime and
the governing one.  Worked case: `tutorials/plant/greenAmmonia03_basicDesign`.
A valve may also protect a SECTOR's own item (`unitName CONVERTER;`, below):
its `blockedOutlet` streams are the sector's outlets, read from the topology.

**ONE PRESSURE SHELL AROUND A SECTOR'S EQUIPMENT -- `type converterShell`
(DEV.md 4c C69).**  A multibed converter is one pressure vessel holding its
beds and interbed exchangers, while the flowsheet still computes each as its
own block.  Group the blocks as ONE SECTOR (the case's sector mechanism) and
size the shell with one entry that names the sector, AFTER every member's own
entry:

```
{ unitName CONVERTER;  type converterShell;  material SS316;
  designRules { pressureDesign 167;     // bar g, REQUIRED
                // H <length>;   optional, never below the stack; NO D (see below)
              } }
{ unitName CONVERTER;  type reliefValve;  material SS316;     // ONE valve on ONE shell
  designRules { scenarios ( { scenario blockedOutlet; } ); } }
```

The members are the sector's units, read from the topology (never listed
again); each must already be sized and publish a geometry -- a vessel shell's
`D`/`H` or an exchanger DESIGN's `shellID`/`tubeLength` -- or it is refused by
name.  **ONE diameter, the shell's:** every bed is a `pfr` of declared
`diameter`, all reading one plant variable (`diameter $D_converter;` in each
bed folder, `D_converter <m>;` in the plant's `variables {}`); a bed at its own
`L_over_D`, two diameters, a `D` in these designRules (a second home) and an
exchanger wider than the converter are refused.  The diameter lives in the
flowsheet because the beds need it DURING the solve (each bed's Ergun drop
moves the pressure the gas reacts at, and the stream table carries it); choose
it there -- the witness's DesignSpec solves it as the smallest at which every
bed's Ergun drop is within its `allowable`, with a `largestOf` target over the
beds' `dP_over_allowable` (`docs/ai/outer-drivers.md`), so no bed is named in
advance as the binding one.  The shell then BRACKETS that smallest diameter on
the solved beds (each bed's drop scaled from its own, viscous ~ D^-4 and
inertial ~ D^-6 by its published `ergunInertialShare_bed`, the axial state held
fixed -- exact at the solved D), on [0.1, 10] m, names the binding bed and
says whether the converter's diameter sits at it, above it (a narrower one
would do) or below it (a bed exceeds its allowable, a warning); no root in the
bracket is refused by name.  It publishes `D_smallestAdmissible`.  The shell stacks the members axially (H the sum; no head space,
annulus or plenum), its wall is ASME thin-wall at its own `pressureDesign`
(not below a member's, refused), priced on the Turton vessel set.  The members' own vessel shells become internal baskets: NOT
costed, each naming the shell.  A member exchanger keeps its Turton exchanger
cost (no bundle-only correlation exists, so its shell share counts twice --
said on the basis).  Sheets: `design/<SECTOR>/shell`, `design/<SECTOR>/psv`.

**A VESSEL SIZED BY SPACE VELOCITY DECLARES WHICH GAS VOLUME (2026-10-05).**
`type vessel` builds its volume from ONE of `volume` (m3, author-set),
`residenceTime` (s, on the ACTUAL gas flow at the unit's T and P) or
`spaceVelocity` (1/h) -- and a `spaceVelocity` REQUIRES its basis beside it:

```
designRules
{
    spaceVelocity       20000;      // 1/h: Nm3 of gas per m3 of catalyst per hour
    spaceVelocityBasis  normal;     // or `actual` -- REQUIRED, no default
    flowKey             N_in_mol_s; // GHSV is quoted on the INLET gas
    pressureDesign      220.0;      // bar
}
```

`normal` is gas at 273.15 K and 101325 Pa as an ideal gas (the basis published
GHSVs use); `actual` is gas at the unit's own T and P.  At 700 K and 200 bar
the two differ by 77x, so the engine does not guess: a missing basis is
refused by name with that ratio quoted, and any other word (`standard`
included -- it means 15, 20 or 25 degC depending on the source) is refused
naming the two accepted.  The run prints the conversion beside the volume.
Worked case: `tutorials/plant/ammoniaReactor03_equilibriumApproach`.

**A SHELL-AND-TUBE EXCHANGER CAN BE DESIGNED, NOT ONLY ESTIMATED (2026-10-07).**
`type shellTubeHX` has four routes, chosen by what `designRules` declares:
`U` + `LMTD` (A = Q/(U LMTD), both typed); `U` + `utility <name>` (the LMTD
computed from the unit's own temperatures and the utility record); nothing (a
rated `heatExchanger`'s own area passed through); and a `design {}` block --
a Kern thermal and hydraulic DESIGN, in which U is a RESULT (declaring `U` or
`LMTD` beside it is refused):

```
designRules
{
    utility        coolingWater;     // one-stream unit: the utility on the other side
    pressureDesign 34;               // bar
    design
    {
        method         Kern;                       // the only accepted word
        processSide    tube;                       // tube | shell (one-stream units)
        // tubeStream  <inlet>;                    // INSTEAD, on a two-stream heatExchanger
        tubeOD 25.4 mm;  tubeID 19.86 mm;  tubeLength 6.096 m;
        tubePitch 31.75 mm;  tubePattern square;   // or triangular
        tubePasses     2;                          // 1, 2, 4, 6 or 8
        shellsInSeries 1;                          // optional; > 1 only with 1 tube pass
        baffleSpacingRatio 1.0;                    // baffle spacing / shell ID
        tubeSide  { model Gnielinski; }            // REQUIRED: no default correlation
        shellSide { model Kern; }
        fouling { tubeSide 0.0002 m2.K/W;  shellSide 0.00035 m2.K/W; }   // REQUIRED; 0 = clean, said
        // utilitySideFilm 2500 W/m2/K;            // REQUIRED for a boiling/condensing utility
    }
}
```

The run finds the smallest number of tubes with U F LMTD (n_shells pi d_o L N)
>= |Q| and writes N, the shell ID (Sinnott bundle + 12 mm), the baffles, both
films, the five resistances whose sum is 1/U, U clean and dirty, F (one 1-2
shell, Bowman-Mueller-Nagle; 1 for one pass or an isothermal utility), the
area required and installed, the utility flow (|Q| over the record's
`dutyPerKg`) and both Kern pressure drops; the INSTALLED area is costed.  The
process side is priced by the case's own package at the mean of its terminal
temperatures -- so that package must declare gas or liquid `transport {}`
models -- and a sensible utility by the `thermophysicalSystem {}` its own
record in `data/standards/utilities/` declares (`coolingWater` carries IF97
water; a SEALED case then needs `water.dat`, which `bin/choupo-import` adds).
A process side that partly CONDENSES is designed on the gas film of the vapour
that leaves (the condensate film is not credited: the area is on the safe
side) and says so; one that boils, or condenses totally, is refused by name.
Every correlation used outside its window is announced.  On a two-stream
`heatExchanger` the unit's own declared area and U are published beside the
design as `A_rated` / `U_rated` and move nothing.  Worked case:
`tutorials/plant/greenAmmoniaPEQ_baseCase` (all six exchangers).

**A STORAGE TANK IS ATTACHED TO A BOUNDARY STREAM (2026-10-07).**  A raw
material or a product tank is equipment the plant buys, and no flowsheet unit
is one, so it is declared in `sizing {}` beside `units`, naming the stream it
stores:

```
storage
(
    { name          NH3Storage;
      stream        ProductNH3;     // a LIQUID stream; a gas is refused by name
      material      SS304;
      storageTime   21 day;         // the unit is REQUIRED: a bare 21 is 21 SECONDS
      fillFraction  0.90;           // working level / tank volume
      maxTankVolume 30000;          // m3 per tank; more volume -> more tanks
    }
);
```

`V = storageTime x mdot / (rho_liquid x fillFraction)`, split into equal tanks
of at most `maxTankVolume`, one item and one sheet each
(`design/NH3Storage/tank1`, `tank2`, ...).  `mdot` is the stream's own mass
flow and `rho` its liquid density at the state it carries, on the case's own
package, announced on the run.  Every key is required -- a default storage
time is a design basis nobody chose.  Each tank is costed on the CAPCOST 2017
**atmospheric API fixed-roof** row (90 to 30 000 m3, no material or pressure
factor); a liquid stored below 0 degC is a REFRIGERATED tank that costs more,
and the run says LOWER BOUND on every such tank.  A stream above 1.5 bar
(pressurised storage) is refused, naming `liquefiedGasStorage` below.  This is a postDict ITEM, not the
`storageTank` UNIT (`docs/ai/unit-ops.md`): the unit is a buffer inside the
flowsheet that reports a holdup and has no sizer of its own; the item is the
tank the plant buys.  Worked case: `tutorials/plant/greenAmmoniaPEQ_baseCase`.

**A TANK A `storageTank` UNIT HOLDS IS LINKED, AND ITS HOLD TIME HAS ONE HOME
(2026-10-18).**  When the stream is held by a flowsheet `storageTank` unit,
that unit already declares `residenceTime` and `fillFraction`, so the entry
names the unit instead of repeating them:

```
storage
(
    { unit          methanolTank;   // the flowsheet storageTank unit
      material      SS316;
      maxTankVolume 30000;
    }
);
```

The tank is sized on the unit's published `residenceTime_s` and
`fillFraction` KPIs and on the unit's own inlet stream, and its items are the
unit's (`design/methanolTank/tank1`, which is how the plot plan pipes the
unit's streams to the tank).  `storageTime`, `fillFraction`, `stream` or
`name` declared beside `unit` each REFUSE by name, naming the line to delete;
so does an entry WITHOUT `unit` whose `name` is a storageTank unit's (the
implicit link a name match would make).  An entry with no `unit` -- a store no
flowsheet unit holds, like `NH3Storage` above -- declares its own keys exactly
as before.  Worked case: `tutorials/plant/aceticAcid02_plant`.

**A GAS IS STORED IN PRESSURE VESSELS (2026-10-18, DEV.md 4c C89).**  The tank
above refuses a gas; a gas buffer -- the hydrogen a green-ammonia plant keeps
against an intermittent electrolyser -- is its own list in `sizing {}`:

```
gasStorage
(
    { name            H2Buffer;
      stream          H2Feed;       // a VAPOUR stream; a liquid is refused by name
      material        carbonSteel;  // a construction-material record
      autonomy        2 h;          // REQUIRED, with its unit
      reason          "why that many hours";
      maxPressure     100 bar;      // ABSOLUTE: full, and the design pressure
      minPressure     32 bar;       // ABSOLUTE: what downstream needs
      temperature     313.15 K;
      maxVesselVolume 400;          // m3 per vessel; more volume -> more vessels
      L_over_D 3;  corrosionAllow 0.003;  jointEfficiency 1.0;  // optional, announced if absent
      steelPrice      8;            // EUR per kg of SHELL steel, INSTALLED -- required to cost
      steelPriceReason "why that price";
    }
);
```

`V_total = autonomy x mdot / (rho(maxPressure, T) - rho(minPressure, T))` --
only the gas between a full and an emptied vessel is given back -- with both
densities from the case's OWN package (vapour route: its equation of state;
an ideal-gas case gets an ideal-gas buffer and the run says so; a density that
is not finite refuses, never an ideal-gas fallback).  Split into equal STANDING
vessels of at most `maxVesselVolume` (`design/H2Buffer/vessel1`, ...), each
wall by the ASME thin-wall rule at `maxPressure` read as GAUGE, rated against
the material record, and COSTED BY ITS STEEL MASS: its published `weight` (the
cylindrical shell only, rho pi D H t -- no heads, nozzles or supports) x the
declared `steelPrice`, with NO index, NO module factor and NO 1.18 -- so the
price must be an INSTALLED price per kg of shell steel, the rest folded in
(the `declared-unit-price` shape the catalyst charge uses).  The Turton vessel
cost (the vertical set) is printed beside it as an announced EXTRAPOLATED
comparison -- its F_P and the wall over the radius -- and enters no total.
No `steelPrice` or no `steelPriceReason`: the vessels stay sized, their cost
refuses by name and the total reads INCOMPLETE.  Each vessel's inventory is its full charge at `maxPressure`, so a store
on a priced raw material is that raw material's stock in the working capital.
Every key is required; `maxPressure <= minPressure`, a `minPressure` BELOW the
stream's own pressure (the gas could not flow back into the line it buffers)
and a unitless autonomy, pressure or temperature refuse by name.  NOT INCLUDED,
said on every run: the charging compressor from the stream's pressure to
`maxPressure` and its power, and any renewable-power profile behind the hours.
Each vessel is placed on a plot plan like any vessel, from its own D and H.
Worked case: `tutorials/plant/greenAmmoniaPEQ_baseCase`.

A gas store a flowsheet `storageTank` unit holds is LINKED to it exactly as a
tank is (`unit T101;` in place of `name`, `stream` and `autonomy`, which then
REFUSE by name; `reason` becomes optional): the autonomy is the unit's
`residenceTime_s`, the stream its inlet.  The unit's own `vesselVolume_m3`
is printed beside the store's, because it holds the gas AT THE LINE STATE --
a volume a vessel kept at the line's pressure can give none of back.  No
shipped case declares one: `ammonia02_full_plant` did (T101, half an hour of
25 bar syngas on a 100 -> 27 bar swing, about 14 MEUR of steel) until Vitor
ruled that the syngas arrives by pipeline (DEV.md 4c C93); the link is held by
`check_design_sheet` arm (w) on a probe.

**A PRESSURISED LIQUID IS STORED IN PRESSURE VESSELS (2026-10-18, DEV.md 4c
C92).**  A liquid that must stay above its bubble pressure -- liquid ammonia,
LPG -- is neither an atmospheric tank nor a gas store:

```
liquefiedGasStorage
(
    { unit            T201;         // or: name; stream; storageTime <n> day; fillFraction;
      material        carbonSteel;
      designPressure  22 bar;       // ABSOLUTE; refused below the liquid's bubble pressure
      temperature     250 K;        // the storage temperature
      reason          "why that pressure and temperature";
      maxVesselVolume 700;          // m3 per vessel
      L_over_D 6;  corrosionAllow 0.003;  jointEfficiency 1.0;  // optional, announced if absent
      steelPrice      8;            // EUR per kg of SHELL steel, INSTALLED -- required to cost
      steelPriceReason "why that price";
    }
);
```

`V_total = storageTime x mdot / (rho_liquid(T) x fillFraction)` (linked: the
unit's hold time, fill fraction and inlet), split into the same vessel bank
as the gas store: equal vessels, the wall at `designPressure` as GAUGE, rated
against the material, COSTED BY THE STEEL MASS with the Turton comparison
printed beside it.  The run computes the liquid's BUBBLE PRESSURE at `T` on
the case's own K-values -- every dissolved component counted -- and prints the
main component's own vapour pressure beside it; a `designPressure` below the
bubble pressure REFUSES (the liquid would boil in the vessel).  A storage
temperature other than the stream's is priced at the declared one and the gap
ANNOUNCED (nothing in the flowsheet warms or cools it).  NOT INCLUDED, said on
every run: boil-off, vapour return and relief.  The inventory is the liquid at
its working level.  The plot plan decides the orientation: a bullet lies
(`orientation alongX;` or `alongY;`), its length the published `H`.  Worked
case: `tutorials/plant/ammonia02_full_plant` (T201, two days of let-down
liquid at 250 K, whose bubble pressure is the let-down drum's 20 bar because
of the dissolved H2, N2 and Ar -- ammonia alone would boil at 1.7 bar).

**WHAT AN ITEM HOLDS (2026-10-07).**  A `units ( ... )` entry may declare, beside
its `designRules {}`, the material it holds while the plant runs -- the
in-process inventory a working capital is built from:

```
inventory
{
    held
    (
        { stream RawLiquid;     fraction 0.25; }   // the liquid level
        { stream UnreactedGas;  fraction 0.75; }   // the vapour space
    );
    // volume 2.5;   // m3 -- ONLY for an item whose sizer publishes no V_R
}
```

Per held phase `m = V x fraction x rho x w`: V the item's own `V_R`, rho and w
the density and mass fractions of the NAMED stream at the state it carries
(the phase is READ off that stream's vapour fraction; a two-phase stream is
refused -- name a drum's vapour and liquid outlets, each one phase).  Fractions
may sum to less than 1 (the rest is internals, catalyst or empty space, said);
above 1, a declared `volume` beside a sized `V_R`, or a sizer with no volume and
no declared one, each refuse the INVENTORY by name and keep the item's size.  A
storage tank holds its own working level automatically.  An item with no block
is listed as NOT DECLARED -- never as zero.  Published on the design sheet
(`inventory {}`), in `reports/inventory/inventory.csv`, and in the result JSON
(`equipment[].inventory`, pinned by the golden `equipment` kind as
`inventory.<key>`).

**THE WORKING CAPITAL MAY BE BUILT UP INSTEAD OF A FRACTION (2026-10-07).**  In
the postDict's `economics {}` block, `workingCapital 0.15;` (or no key) keeps
the fraction of FCI.  Declared as a BLOCK it builds the working capital from
what the plant holds and owes:

```
workingCapital
{
    rawMaterialStock   0 day;   // days of purchases in stock (raw materials with no tank)
    receivables       30 day;   // days of sales customers owe
    payables          30 day;   // days of raw-material purchases owed
    minimumCash       15 day;   // days of COM_d kept as cash
}
```

Every key is required and needs its unit (a bare number is seconds).  GROSS
(current assets, *capital circulante*) = raw-material stock + process inventory
(the items' held inventories) + product stock (storage items on a priced product
stream) + receivables + minimum cash; NET (*fundo de maneio*) = gross - payables,
and the NET is the cash flow's WC (year 0 out, last year back).  Everything held
is valued at COST: a component a priced raw material brings in at that price, any
other at COM_d per kg of product -- never at the sales price.  Published as
`kpis.economics.WC_*` (pinned by the `kpi` kind), the `economics.workingCapital`
object, and `reports/economics/workingCapital.csv`, with 0.15 x FCI printed
beside it for comparison.  Worked case: `tutorials/plant/greenAmmoniaPEQ_baseCase`.

**THE START-UP YEARS: CONSTRUCTION, RAMP-UP, START-UP COST (2026-10-11).**  Four
opt-in keys in the same `economics {}` block; a case declaring none of them (and
`constructionPeriod 1;` or no such key) keeps the one-year timeline, FCI and WC
at year 0 and full production from year 1:

```
constructionPeriod  3;                  // whole years
capitalSchedule     ( 0.3 0.5 0.2 );    // FCI share spent at the END of each
                                        // construction year; must sum to 1
rampUp              ( 0.6 0.85 );       // production fraction of the first
                                        // operating years; 1 thereafter
startupCostFraction 0.10;               // start-up cost x FCI, operating year 1
```

Year 0 is the END of construction (start-up): construction year k of N spends
its fraction at t = k - N <= 0 (compounded to start-up by 1/(1+i)^t), the WC is
invested at t = 0, operation runs years 1..`projectLife` -- the placement of
CAPCOST 2017, the costing program of Turton et al.; the run also prints the NPV
at the START of construction (its year 0).  `constructionPeriod` above 1 with
no `capitalSchedule` REFUSES (a split nobody chose moves the NPV).  The ramp-up
scales the revenue and the variable group of COM_d, 1.23 (C_RM + C_UT + C_WT);
0.180 FCI and 2.73 C_OL stay.  The WC is invested in full at t = 0 and does
NOT follow the ramp-up (announced).  The start-up cost is an expense of year 1,
deducted from its taxable income, not depreciated.  The year-by-year table is
printed in the run and written to `reports/economics/cashFlow.csv` (two more
columns, `productionFraction` and `startupCost_<cur>`, only when any key is
declared).  Worked case: `tutorials/steady/economics/economics03_startup_years`
(its postDict checks the cash flow by hand).

**THE ECONOMIC SENSITIVITY: ONE INPUT AT A TIME (2026-10-12).**  An opt-in
`sensitivity {}` block in the same `economics {}` block prices the plant again
with each declared input moved ALONE to two ends -- a tornado -- on the same
converged run (no re-solve: every input enters after the flowsheet) and through
the same cash-flow arithmetic as the base appraisal.  Absent, nothing is
computed, printed or published.

```
sensitivity
{
    FCI                 { relative accuracyBand; }      // the declared band's -30/+50 %
    price.ProductNH3    { relative ( -0.20 0.20 ); }    // fractions of the base EUR/kg
    utility.electricity { relative ( -0.20 0.20 ); }    // a factor on that utility's bill
    discountRate        { absolute ( 0.08 0.12 ); }     // values of the input
    streamFactor        { absolute ( 0.85 0.95 ); }
}
```

Each entry says EXPLICITLY whether its two numbers are `relative` (fractions of
the base value) or `absolute` (values of the input), low end first.  Inputs:
`FCI` (relative only; `relative accuracyBand;` reads the block's own
`accuracyBand`, so the capital band reaches the NPV -- it moves WC, the 0.180
FCI of COM_d, depreciation, salvage and start-up cost with it), `price.<stream>`
(a stream `constant/economics` prices), `utility.<name>` (relative only; a
utility a duty of this run is allocated to -- a steam CREDIT scales too),
`labourRate`, `discountRate`, `taxRate`, `streamFactor`.  An unknown input, a
price the case does not declare, a utility with no bill, a bare list, both or
neither form, or an end outside what the input can be (a stream factor above 1)
each REFUSE by name.  Published: a console table sorted by NPV swing, headed by
the statement that a sensitivity is NOT an uncertainty analysis (no probability,
no correlation between inputs); `kpis.economics.sens_<input>_NPV_low/_high`,
`_IRR_low/_high`, `_payback_low/_high`, `_value_low/_high` (the input's value
at each end; the input's `.` written `_`; NaN where there is no IRR or
payback); `reports/economics/sensitivity.csv`; and the result's
`economics.sensitivity` block, which the GUI draws as a tornado in Reports.  Worked
cases: `tutorials/plant/greenAmmonia02_feasibility150bar` and `...50bar`.  An
outer `sweep` still varies only FLOWSHEET paths -- this block is how a price, a
rate or the capital is varied.

**THE LAND (2026-10-17, DEV.md 4c C82).**  An opt-in `land {}` block in the same
`economics {}` block prices the plot as land; absent, nothing changes.

```
land
{
    price   50;          // currency per m2 (the costing's), bare or [0 -2 0 0 0]
    source  "...";       // where the price comes from
    reason  "...";       // why it is this plant's
    // area 25000 m2;    // ONLY where the case has no system/layoutDict
}
```

The AREA has one home: where the case declares a plot plan it is the plot area
the layout PUBLISHES (`plot { margin; }` included, see `system/layoutDict`
below), and an `area` beside it REFUSES; with no layout, `area` must be
declared; with neither, the land REFUSES by name (under an outer driver the
layout is checked after the post-processing chain, so declare `area` there).
The land is NON-DEPRECIABLE capital, bought at the START of construction (t =
-constructionPeriod, one row more in the cash flow) and RECOVERED at its
purchase value, untaxed, at the end of the last operating year -- the
placement of CAPCOST 2017 ('Cash Flow Analysis' C49 and I63).  It is NOT in TCI
(still FCI + WC).  `land.price` is a sensitivity input (`relative` or
`absolute`).  Published: a console line beside the capital, a `land` column and
footer lines in `reports/economics/cashFlow.csv` (and the .ods),
`kpis.economics.land` / `landArea`, the result's `economics.land` object and a
`land` cell on each cash-flow row.  Worked cases:
`tutorials/plant/ammonia02_full_plant`, `greenAmmoniaPEQ_baseCase` (a round
placeholder price, said so).

**THE PARTICULATE STEPS IN THE LABOUR (2026-10-19, DEV.md 4c C98).**  The
operator count is Turton's `N_OL = (6.29 + 31.7 P^2 + 0.23 N_np)^0.5` per
shift (x 4.5 positions), `N_np` the non-particulate processing steps and `P`
the steps that handle PARTICULATE SOLIDS (transport, size control,
particulate removal, drying a powder, tableting...).  Which steps count is
the case's judgement, so `P` is DECLARED in the same `economics {}` block:

```
particulateSteps
{
    count   6;          // a whole number, 0 or more
    source  "...";      // which steps were counted
    reason  "...";      // why it is this plant's
}
```

Absent, `P = 0` -- and where the flowsheet holds a unit whose type handles
particulate solids (`sprayDryer`, `solidDryer`, `convectiveDryer`,
`evaporativeDryer`, `crystalliser`, `pneumaticConveyor`, `cyclone`,
`bagFilter`, `gasSolidSplitter`) the run ANNOUNCES the undeclared zero (its
site, the caveat block, the result JSON's advisories), naming those units.
A declared count announces nothing.  The console line prints the P term
either way.  A flat `particulateSteps 6;`, a fractional or negative count,
or a missing `source`/`reason` REFUSE by name.  `P` enters SQUARED: at P = 6
the formula staffs about 34 operators a shift.  Worked case:
`tutorials/batch/plant/apalutamide01_tablets`.

**A DECLARED OPERATING CREW IN PLACE OF THE CORRELATION (2026-10-19, DEV.md
4c C98 round 2).**  Turton's correlation is a regression over continuous
chemical plants; a campaign suite, a batch line or a pilot plant is staffed
room by room.  In the same `economics {}` block:

```
operatingCrew
{
    areas
    (
        { area "solvent section"; operatorsPerShift 2; }
        { area "packaging";       operatorsPerShift 3; }
    );
    source  "...";      // where the numbers come from
    reason  "...";      // why they are this plant's
}
```

Declared, the labour is `SUM operatorsPerShift` x the same 4.5 positions per
operator-per-shift x the same wage (`labourRate` x `operatorAnnualHours`) the
correlation route uses; the console prints the crew area by area and then
Turton's N_OL -- with the declared `particulateSteps`, or P = 0 said so -- as
a COMPARISON that enters no total, with its C_OL.  `particulateSteps` and
`operatingCrew` may coexist: P then drives only the comparison, and an
undeclared P beside a crew is not announced (it prices nothing).  REFUSED by
name: a flat scalar, an empty `areas`, an entry with no `area`, a duplicate
area, a fractional or non-positive `operatorsPerShift`, a missing
`source`/`reason`.  Absent the block, nothing changes.  Published on every
appraisal: `kpis.economics.operatorsPerShift` (the count that priced the
labour), `operatingPositions`, `C_OL`; beside a declared crew also
`operatorsPerShift_correlation` and `C_OL_correlation` -- all pinned by the
`kpi` kind.  Worked case: `tutorials/batch/plant/apalutamide01_tablets`.

**A DECLARED QUOTE FOR AN ITEM NO CORRELATION PRICES (2026-10-19, DEV.md 4c
C98).**  In the postDict's `costing {}` block, beside the price index:

```
quotes
(
    { unit tabletPress;          // a flowsheet unit with NO sized item
      // item productionBuilding; // OR: something that is not a unit (exactly one)
      value    1000000;          // in `currency`, money of `year`
      currency EUR;              // EUR | USD (x the costing's usdToEur)
      year     2026;             // the costing year: no index applied;
      // cepci 800;              //   another year: REQUIRED, C x CEPCI/cepci
      basis    installed;        // installed (= C_BM) | purchased
      // bareModuleFactor 2.5;  bareModuleFactorSource "...";  // purchased only, REQUIRED there
      kind     equipment;        // equipment | facility
      source   "...";            // vendor, reference, date -- or "placeholder"
      reason   "...";
    }
);
```

**A quote may SCALE with its stage of the batch plan** (DEV.md 4c C99):
`scaling { referenceSize 1 m3; exponent 0.6; exponentSource "..."; }` --
`value` is then the price of ONE machine of `referenceSize` (WITH its unit: a
volume for a batch stage, a mass rate for a semicontinuous one), and
`C_p = value x CEPCI/cepci x rate x units x (size per unit /
referenceSize)^exponent`, the size per unit and the number of units being the
ones the batch plan published for the stage that groups the unit (the scale
is the `S` column of `costs.csv` and the `quoteScale` factor).  REFUSED: no
batch plan ran before the costing, the unit in no stage, an `item` quote, a
reference size with no unit or of the other kind, a missing exponent or
`exponentSource` (the six-tenths rule is a convention, never a default).

`C_p = value x CEPCI/cepci x rate`; `C_BM = C_p` (installed) or
`bareModuleFactor x C_p` (purchased: the CASE's factor -- Choupo supplies
none); `C_TM = 1.18 C_BM`.  In the FCI the quote's C_BM is a module's
(`contingencyFee` applies); for `kind equipment` it also drives the
`siteFactor` auxiliary-facilities term, for `kind facility` (a building) it
does not.  Shape word `declared-quote`: a row in the costing table (equipment
column `quote`), its arithmetic and its source/reason in the provenance
block, a row of `reports/economics/costs.csv` (`K1_or_CpRef` = value,
`K2_or_SRef` = the quote year's index, `K3_or_n` = the currency rate), and an
entry of the result's `equipment` list (`type declaredQuote`, `cost.source`,
`cost.reason`) pinned by the golden `equipment` kind.  REFUSED by name: a
`unit` that is sized or whose sizer refused, a `unit` that does not exist,
an `item` named like a unit or a sized item, both or neither of
`unit`/`item`, a duplicate, a missing `source`/`reason`/`value`/`year`, a
non-positive value, an unknown `currency`/`basis`/`kind`, another year with
no `cepci` (or a `cepci` on the costing year), a purchased quote with no
factor or factor source, a factor below 1, a factor beside `installed`.  A
quote writes no specification sheet and is placed on no plot plan.  Worked
case: `tutorials/batch/plant/apalutamide01_tablets`.

**THE BATCH PLANT, DESIGNED ON THE STEADY BALANCE (2026-10-19, DEV.md 4c
C99).**  A plant that runs in LOTS (and some machines in CAMPAIGNS) keeps its
steady flowsheet as the material balance PER UNIT OF PRODUCT, and a
`batchPlan {}` pass designs the batch plant on it by the single-product
method: size factors, the lot, lots a year, the limiting cycle of each
train, parallel units, campaigns, occupancy.  Every time, mass, volume and
density carries its unit (a bare number is refused: raw SI reads 3 as 3 s):

```
batchPlan
{
    product   packagedTablets;                 // the product stream
    production { perYear 30000 kg; source "..."; reason "..."; }   // Q
    lot { rule declared;  stream finalBlend;  mass 350 kg;         // B from a stream's mass,
          // rule largestEquipment;            //   or min N_ip Vmax / S (every batch stage's maxVolume)
          source "...";  reason "..."; }
    lowUtilisation 0.25;                       // optional; the stated default, announced when used
    trains
    (
        { train solidDose;  availableTime 3840 h;  lotsPerCampaign 6;  changeover 24 h;
          source "...";  reason "..."; }
    );
    stages                                     // in RECIPE order
    (
        { stage blending;  train solidDose;  type batch;          // batch | semicontinuous
          units ( blender );  holds intraBlend;                   // its mass READ from the flowsheet
          bulkDensity 450 kg/m3;  fillFraction 0.6;               // batch: S = f / (rho phi)
          chargeTime 1 h;  processTime 0.5 h;  dischargeTime 0.5 h;  cleanTime 1 h;
          // feeds <stage> | none;   default the next stage of its train
          // inPhase 1;  outOfPhase 1;   units sharing one lot / taking alternate lots
          source "...";  reason "..."; }
        { stage sprayDrying;  train sprayDrying;  type semicontinuous;
          units ( SD ... );  holds asdPowder;
          chargeTime 0 h;  operatingTime fromFlowsheet;   // the RATED unit's own rate (a spray dryer)
          dischargeTime 0 h;  cleanTime 0 h;  ... }
    );
}
```

`f_j = r_holds / r_P` (the flowsheet's own masses); a batch stage's vessel is
`V = S_j B / N_ip`, a semicontinuous stage's machine `R = f_j B / t_op / N_ip`;
`t_j = charge + process + discharge + clean` (`dischargeTime
throughFedStage;`: a vessel that empties through the stage it feeds is held
for that stage's processing time); `T_L = max t_j / N_op` per train; lots a
year `N = ceil(Q / B)`; a campaign spans the first lot's pass and then one lot
every `T_L`, plus the changeover; occupancy = busy hours / available hours.
Published as the result's `batchPlan` block (`batchPlan`, `train:<t>`,
`stage:<s>`, `gantt:<train>:<stage>:<lot>` -- the first campaign's Gantt --
and findings), `reports/batchPlan/{stages,trains,gantt}.csv`, pinned by the
golden `batch` kind.  REFUSED: a stage busier than its train's year (remedy:
`outOfPhase`), a train whose campaigns do not fit, and every malformed
declaration by name.  ANNOUNCED: a stage that never limits and is busy less
than `lowUtilisation` of the cycle, a train idle most of its year, a declared
operating time on a rated stage more than 1 % off the machine's own rate.
Consumers: `designRules { volume fromBatchPlan; }` on a `vessel` (one lot,
one vessel -- a stage of several units is refused there), a scaling quote
(above), and `economics { streamFactor fromBatchPlan; }` (the year's flows =
hourly flows x Q / r_P; a NUMBER beside a batch plan is refused as a second
home for the hours).  Method: `src/postProcessing/BatchPlanPass.H`.  Worked
case: `tutorials/batch/plant/apalutamide01_tablets`.

## `system/layoutDict` — the plot plan (DEV.md 4c C75)

Optional; absent, nothing changes.  It places the SIZED items of the run (it
needs a `sizing {}` pass) on a plot plan and the engine checks it after
sizing.  Start it with `bin/choupo-layout --draft <case>` (never overwrites
without `--force`) and move every item to where you can defend it.

```
items
(
    { item "converter"; x 40 m; y -6 m; z 0 m; orientation vertical; }
    { item "makeupComp"; x 6 m; y -8 m; z 0 m; orientation alongX;
      footprint { length 8 m; width 4 m; height 4 m; }
      release { source "..."; reason "...";
                zones ( { zone 2; radius 7.5 m; height 6 m; } ); } }
    { nonProcess "controlRoom"; kind controlRoom; x -30 m; y -40 m; z 0 m;
      orientation alongX; footprint { length 15 m; width 10 m; height 4 m; }
      source "..."; reason "...";            // optional, both or neither
      ignition "why it ignites"; }
    { nonProcess "gate"; kind gate; x -19 m; y -63 m; z 0 m; orientation alongX;
      footprint { length 4 m; width 3 m; height 3 m; } source "..."; reason "..."; }
);
areas { <SECTOR> { xMin 0 m; xMax 40 m; yMin -10 m; yMax 10 m; } }   // sectored cases only
separation ( { source "..."; reason "..."; measure edgeToEdge;
               distances ( { between ( vessel compressor ); distance 9 m; } ); } );
wind { from 225 deg; planNorth 0 deg; halfAngle 30 deg; reach 60 m;
       source "..."; reason "..."; }
plot { margin 10 m; reason "..."; }   // optional; absent: 0 m, announced
```

* `item` is the design sheet's id (`converter`, `column09/shell`,
  `DRYING.SD`); `(x, y)` the plan centre, `z` the base, plan `+y` north.
* The footprint is the item's OWN size when its sizer published a diameter
  and a length (`D`/`H`, `shellID`/`tubeLength`,
  `chamberDiameter`/`chamberHeight`); otherwise declare `footprint {}` -- and
  never declare one on an item that has its own.
* Angles MUST carry `deg` (the raw form would be radians).
* Choupo ships NO spacing or zoning table (the published ones grant no
  redistribution): every distance, zone and angle is yours, with its source.
* REFUSED: an unknown, duplicate or internal item (trays, a catalyst charge,
  a relief valve), two footprints that overlap, an area for an unknown sector.
  ANNOUNCED (caveat block + result JSON): a pair closer than its declared
  separation, an item outside its sector's area, an ignition source inside a
  zone or downwind of a release, a rule naming no placed kind, unplaced items.
* THE PIPES (C80): the engine routes every material stream and publishes its
  length -- from the TOP of its source item (or a junction: an unsized
  mixer, splitter or valve, drawn on the rack; or the rack's west end for a
  plant inlet) up to its lane on the rack, along plan x, and down to the top
  of its target (or the rack's east end for a plant outlet; with a `fence {}`,
  on to that stream's crossing ON the fence).  Declare the rack, every key,
  or the engine uses a stated default and says so:
  ```
  pipeRack { y -2 m; elevation 7 m; laneSpacing 0.6 m; lanesPerTier 6;
             tierSpacing 1.2 m; xStart -14 m; xEnd 100 m; reason "..."; }
  pipes { rawLiquid { waypoints ( { x 56 m; y -6 m; z 10 m; } ... ); } }   // optional override
  ```
  A waypoint route must be orthogonal (one axis per segment).  A stream the
  layout cannot reach (an unsized tank, an unplaced item) is listed as not
  routed, with the reason, the units at its two ends and the point of the end
  it does reach; the 3D view marks it there (a dashed stub and a warning), so
  a missing pipe never looks like a finished drawing; one that reaches
  neither end is not marked at all (no point of the plan is its) and is
  listed in words beside the view and in the pipe register.
  SOLIDS ARE NOT PIPED (C97): a stream with no fluid phase that carries a
  solid -- a powder, granules, tablets -- is listed as not routed, "solids
  only: moved in containers or by conveyor", with `solids` set and no
  point marked, and a mixer, splitter or valve all of whose streams are
  such is not put on the rack; a slurry or a wet cake is still a pipe.
  A `pipes` override on a solids stream is refused.  INDOOR PIPING IS NOT
  ROUTED (C100): a stream both of whose ends stand inside the declared
  building (an item a room lists, or a junction piped only to such items) is
  listed "inside the building: indoor piping is not routed", `indoor` set,
  no point marked; a stream with ONE end indoors is drawn only where you
  declare its outdoor leg as `pipes { <stream> { waypoints ( ... ); } }`
  whose end on the indoor side lies ON the building's wall (the `envelope`
  item's side face, between its base and top) -- the WALL PENETRATION, that
  end's kind `wallPenetration` -- and otherwise is listed, `indoor`, marked
  at its end in the open.  An override with both ends indoors, or with one
  end indoors and no `envelope` declared, or whose penetration is off the
  wall, is refused.  The router does not
  steer round items: a pipe that runs THROUGH a placed item (its plan path
  inside the footprint, below the item's top) is ANNOUNCED as `pipeClash`,
  by name -- move the item or give the pipe waypoints.  No pressure drop and
  no cost yet.
* THE PLOT (C82): the engine publishes the plot area -- the axis-aligned
  envelope of every declared sector area, every placed footprint, every
  routed pipe and (C97) every room of a declared `building {}`, grown on
  every side by your margin:
  ```
  plot { margin 5 m; reason "the fence and a clear strip inside it"; }
  ```
  Absent, the margin is 0 m and that is ANNOUNCED (the area is then a lower
  bound).  Published beside it: the footprints' own plan area and its share
  of the plot, per sector the declared area (or the envelope of the sector's
  footprints), and the union of the declared sector areas -- two areas that
  claim the same ground are announced.  The economics prices this plot area
  as land when it declares `land { price; ... }`.
* SITE BUILDINGS AND ROADS (C90).  A non-process item's `kind` is your word;
  the 3D view draws `controlRoom`, `warehouse`, `canteen`, `gate` (with a
  barrier across its road) and `weighbridge` (a deck with ramps) by kind,
  any other word as a box.  `gate` is the road network's ENTRANCE and a
  `weighbridge` is DRIVABLE (a road runs over its deck; declare one only
  where the case says trucks are weighed).  Roads are declared:
  ```
  roads
  {
      source "..."; reason "...";
      headroom 5 m;                                  // vehicle clearance
      access { distance 20 m; source "..."; reason "..."; }
      noTraffic ( 1 );                               // optional: zones closed to vehicles
      network
      (
          { road "entrance"; width 7 m; reason "...";
            waypoints ( { x -12 m; y -66 m; } { x -12 m; y -31 m; } ); }
      );
  }
  ```
  Centre lines at grade, each segment along one plan axis.  REFUSED: a road
  through a footprint, under a rack or a pipe lower than the headroom, a
  diagonal segment, a waypoint with `z`, a road named twice, no `access`.
  ANNOUNCED: a road in a closed zone, a road no gate reaches, no gate, a gate
  or a site building no road serves within the access distance, a process
  item beyond it (fire and maintenance access), a weighbridge no road
  crosses.  Published: each road's length, the network's length and paved
  area (counted once where roads meet), each crossing under the rack, and
  per item the nearest road a gate reaches; the roads are inside the plot
  envelope, so the land cost sees them.  The draft tool never draws roads.
* THE FENCE (C93).  Declared, never drawn by hand: the engine takes the plot
  rectangle and moves it `inset` inward (absent: 0 m, announced).
  ```
  fence
  {
      source "..."; reason "...";
      inset 0 m;                                       // optional
      crossings
      (
          { stream makeup; from "adjacent industrial park: syngas pipeline"; }
          { stream cwOut;  to "site cooling-water return"; side north; at 57 m; }
      );
  }
  ```
  With a fence, the routed pipes enter the plot envelope as the rack's plan
  band (a pipe's run past the rack ends is the fence's job, so the plot no
  longer grows to hold it).  The fence opens at each `gate` item, on the side
  nearest it, centred on the road that serves it and as wide as that road.
  REFUSED: a road that meets the fence anywhere but at a gate opening (the
  fence is a line a road cannot pass, as a footprint is), an item standing
  across or outside the fence, a negative inset, a crossing for a stream that
  does not cross the battery limit, an outlet labelled `from` (or an inlet
  `to`), `side north|south` without `at` (or `at` on west/east, where the
  lane fixes the point), an `at` outside the fence, a stream declared twice.
  Every boundary pipe crosses the fence at a published point: west for an
  inlet and east for an outlet at its lane's y and height (the stated
  default), or where `side`/`at` put it (the pipe leaves its lane there), or
  at the end of a waypoint override, which must then end on the fence.  A
  crossing with no `from`/`to` label is ANNOUNCED, never refused.  Published
  and pinned by the `layout` golden kind: the fence line and its length, each
  opening, each crossing (point, side, label).  The 3D view draws a
  chain-link fence with posts, open at the gates, and at each crossing the
  pipeline carried on outside with a sign naming where it comes from or goes
  to.
* TRUCKS, CARS AND THE SITE (C96).  A road may declare `cornerRadius <m>;`
  (the centre-line radius of its corners and of every junction a truck turns
  at; absent, a square corner) and `oneWay yes;` (traffic only in the order
  of its waypoints).  Inside `roads {}`:
  ```
  designVehicle { turningDiameter 25 m; source "..."; reason "..."; }
  turningAreas ( { area "end"; x 160 m; y -31 m; diameter 26 m; reason "..."; } );   // optional
  truckRoutes
  (
      { route "deliveries"; from gate; to gate;
        roads ( entrance main yardLink yard entrance );   // in the order driven
        serves ( warehouse laydown );                    // optional: stops it must pass
        reason "..."; }
  );
  ```
  The engine walks the route from the `from` gate's fence opening (its road
  point with no fence) along each road to where it meets the next (the
  nearest meeting along the road; a road named TWICE in a row is driven to
  its far end and back -- a dead end visited) to the `to` gate, and publishes
  the path, its length, every corner (the smaller of the two roads' radii,
  the pavement's outer edge = radius + half the narrower road, the design
  vehicle's half turning diameter) and a verdict word.  ANNOUNCED: a
  reversal with no turning area holding it (`routeReverses`) or one smaller
  than the truck turns (`turningAreaTooSmall`), a corner whose outer edge is
  short of the vehicle's (`sharpCorner`), two corners closer than their two
  radii (`cornersTooClose`), a one-way road driven backwards (`wrongWay`), a
  weighbridge the route misses when one is placed, a `serves` stop it does
  not pass, a route that starts or ends at an item that is not a gate.
  REFUSED: routes with no `designVehicle`, an unknown road or item, two
  consecutive roads that do not meet, a turning area through a footprint, a
  negative radius.  Every road is carried on from its end to its gate's
  fence opening (the APPROACH, published per opening and counted in the
  paved area), so a road the plot margin stops short reaches its gate.
  A non-process item of kind `carPark` declares its bays:
  ```
  parking { bays 22; bay { width 2.5 m; length 5 m; } aisle 6 m; angle 90 deg;
            arrangement doubleLoaded;   // or driveThrough
            entry reverse;              // or forward
            source "..."; reason "..."; }
  ```
  The rows run along the item's length between two end aisles; a declared
  count the footprint cannot hold is REFUSED with the capacity, and bays a
  car leaves by reversing (`doubleLoaded` + `entry forward`) are ANNOUNCED.
  Kinds with a meaning: `musterPoint` and `firePumpHouse` inside a release's
  zone or downwind of it are ANNOUNCED (`exposedInZone`, `exposedDownwind`);
  a site with ONE `gate` and a road network is ANNOUNCED (`singleEntrance`).
  Drawn by kind: `office`, `carPark` (its bays painted on), `laydown`,
  `musterPoint`, `fireWaterTank`, `firePumpHouse`, `windsock` (the sock
  turned downwind).  The 3D view rounds each route corner to its radius,
  paves the fillets and paints the direction arrows; it walks nothing.
* SECONDARY CONTAINMENT (C134).  A bund or an impounding area is a DECLARED
  REGION round the items it holds, not a placed item (the overlap rule does
  not apply to it):
  ```
  bunds
  (
      { name "tankFarm"; kind bund;          // bund | impounding
        items ( "NH3Storage/tank1" "NH3Storage/tank2" );
        region { xMin 100 m; xMax 216 m; yMin -72 m; yMax 0 m; }   // or polygon ( { x; y; } ... );
        wall { height 3 m; }                 // impounding: the catch area's kerb
        // pit { x; y; length; width; depth; }   impounding only: the REMOTE pit
        capacityRule
        {
            basis  vesselVolume;             // vesselVolume (sized V_R) | heldLiquid (inventory)
            terms  ( { fraction 1.1; of largest; } );   // the largest term governs
            allowances ( { name rain; depth 100 mm; reason "..."; } );   // or volume <m3>
            source "..."; reason "...";      // the guideline YOU read, by title
        }
        drain  closedValve;                  // closedValve | sumpPump | openToSewer
        source "..."; reason "..."; }
  );
  ```
  NET VOLUME: a bund's area x wall height less what the enclosed footprints
  occupy below the wall's top (floor at grade; a lying cylinder's circular
  segment); an impounding area's pit, length x width x depth.  REQUIRED:
  the largest declared term (a fraction of the largest or of the total
  basis volume of the enclosed items that hold LIQUID by their sizing's own
  inventory) plus the allowances (a `depth` falls on the catch area and the
  pit).  REFUSED: a listed item outside the wall, a placed item inside it
  and not listed, a wall through a footprint, an item indoors, an item in
  two containments, two containments sharing a floor, a pit under an item
  or a road, a containment across the fence, no `capacityRule` (no code's
  table is shipped).  ANNOUNCED: `bundCapacity` (short of the rule),
  `bundHoldsNothing`, `bundDrainOpen`, `pitNotRemote`, `roadCrossesBund`,
  `pipeThroughBund` (a pipe below the wall's top), and on EVERY layout
  `unbundedLiquid` (an item in the open holding liquid that no containment
  encloses), and `bundNotChecked` (a listed item whose sizer refused is
  left unplaced as C79 rules; the wall is published, its verdict is
  `notChecked` and no volume is invented).  Published in `layout.bunds` and pinned by the `layout` golden
  kind (`containment`, `verdict`, `area`, `wallHeight`, `displacedVolume`,
  `netVolume`, `requiredVolume`); the outline and the pit enter the plot.
  The draft carries none.  The 3D view draws the wall on the outline (its
  thickness drawing) and the pit as a recess.
* THE GMP INTERIOR (C97).  A pharmaceutical plant is a building before it is
  a plot plan: `building {}` in the same `layoutDict` declares its floors,
  its rooms (a box on a floor, a cleanliness `grade` -- EU GMP Annex 1's
  `A`/`B`/`C`/`D`, or `CNC`, controlled not classified -- and a `pressure`
  relative to a room or to `outside`), its airlocks (ROOMS with a `role` and
  a `regime`), the openings between rooms and the flows through them.  The
  items placed in `items ( ... )` are put in their rooms by `equipment`:
  an item a room lists STANDS IN IT (C100) -- it declares no `z` (its base
  is the room's floor, read from the building; a declared `z` is refused),
  must fit the room in plan and height (a tall item needs a room with its
  own `height`, a double-height suite), and is classified by its ROOM: a
  `release` or `ignition` on it is refused -- declare the room's `atex {}`
  or `ignition`.  On the site it is represented by its building: the
  separation table spaces items in the open (a rule whose kind only items
  indoors carry is a `deadRule` that says so), road access and pipe clashes
  are the building's, and its ground is the building's footprint, not
  counted again.
  ```
  building
  {
      name "OSD block"; source "..."; reason "...";
      envelope productionBuilding;   // optional: the non-process item that IS the building
      cascade { minimumStep 10 Pa; source "EU GMP Annex 1 (2022) para 4.14 (guidance value)"; reason "..."; }
      atexSeparation { distance 6 m; source "..."; reason "..."; }   // needed when ATEX and ignition rooms both exist
      floors ( { floor ground; elevation 0 m; height 6 m; }
               { floor upper;  elevation 7 m; height 4 m; } );
      rooms
      (
          { room corridor; floor ground; xMin 8 m; xMax 64 m; yMin 6 m; yMax 10 m;
            grade D; pressure 25 Pa; relativeTo outside; }
          { room gowning; floor ground; xMin 16 m; xMax 20 m; yMin 0 m; yMax 6 m;
            grade D; role gowning; regime cascade; pressure 10 Pa; relativeTo lobby; }
          { room sdIn; floor ground; xMin 19 m; xMax 22 m; yMin 10 m; yMax 20 m;
            grade D; role materialAirlock; regime sink; pressure -20 Pa; relativeTo dispensing; }
          { room sprayDrying; floor ground; xMin 22 m; xMax 34 m; yMin 10 m; yMax 20 m;
            grade D; pressure 15 Pa; relativeTo outside; containment yes;
            equipment ( dryer ); occupancy 1;                     // optional: height 9 m;
            atex { zone 1; source "..."; reason "solvent evaporated here"; } }
          { room electrical; floor upper; ...; grade CNC; pressure 0 Pa; relativeTo outside;
            ignition "switchgear"; }
          ...
      );
      connections
      (
          { between ( lobby outside ); type door; }     // a door: one floor, a shared wall
          { between ( lobby electrical ); type stair; } // stair | lift: two floors, plans overlapping
          ...
      );
      flows
      (
          { flow "product"; kind material; reason "...";
            path ( outside warehouse MAL dispensing sdIn sprayDrying sdOut blending ... outside ); }
          { flow "operators"; kind personnel; path ( outside lobby gowning corridor compression ); }
          { flow "rejects"; kind waste; path ( compression corridor wasteAL wasteRoom outside ); }
      );
      shared ( { room corridor; flows ( personnel material ); reason "closed containers"; } );  // optional
  }
  ```
  `role` is `room` (default), `personnelAirlock`, `materialAirlock` or
  `gowning` (a changing room: a personnel airlock where garments change); an
  airlock declares `regime cascade | bubble | sink` and a plain room may not.
  `containment yes|no`, `atex { zone 0|1|2|20|21|22; source; reason; }`,
  `ignition "<why>"`, `occupancy <n>`, `equipment ( <item ids> )` and a pair
  `source`/`reason` are optional.  REFUSED: rooms sharing a volume (a room
  may declare its own `height`, a double-height suite, and must then clear
  the floor above), floors sharing a height, a door between rooms with no
  shared wall or to `outside` from a room with no exterior wall, a stair or
  lift on one floor or between rooms whose plans do not overlap, an
  equipment item not placed, assigned twice, not fitting its room, or
  standing in a room that does not list it, a flow name with a space (it is
  the flow's id in the result and the golden: write `apiToSolution` and say
  the rest in `reason`), a road through a room below the
  roads' headroom, a room across the fence, a `relativeTo` chain that closes
  on itself, every unknown word or missing key, an `envelope` that names no
  placed non-process item, a room outside the envelope's box.  `envelope`
  names the plot plan's non-process item that is the building as the SITE
  sees it (its separations, road access, ignition); the rooms are its
  interior, it is the one item a room may stand inside without listing it,
  and the 3D view draws it as glass, with the items its rooms list standing
  inside it on their floors.  The envelope does not clash with the items
  its rooms list and still clashes with anything else: an item overlapping
  it that no room lists is REFUSED, naming the `equipment` it needs.
  The rooms count toward the plot (THE PLOT, above), so a room is never
  beyond it.  ANNOUNCED (stderr, the
  caveat block under PLANT LAYOUT, the result JSON's `building.findings`):
  `cascade` (two connected rooms of different grade, or two across a
  cascade airlock, whose cleaner side is not higher by the declared step),
  `airlockRegime` (a bubble not above every neighbour by the step, a sink
  not below, a cascade airlock not strictly between, an airlock opening on
  fewer than two spaces), `gradeChangeWithoutAirlock`, `wrongAirlock`
  (people through a material airlock, material or waste through a
  personnel one, unless `shared`), `ungownedEntry` (a person entering a
  graded room cleaner than the last gowning room passed since CNC or
  outside), `containmentAccess` (a contained room opened directly or
  through a cascade airlock), `containmentNotNegative` (not below a
  neighbour by the step; a sink airlock excepted), `flowBreak` (a step with
  no door, stair or lift), `materialRevisit`, `flowCrossing` and
  `wasteMeetsMaterial` (a room two flows both pass THROUGH -- not their
  first or last room -- not declared `shared`), `atexIgnition`,
  `atexSeparationUndeclared`, `noEscape` (no way out through doors and
  stairs; a lift is not an exit).
  Published (top-level `building` block, pinned by the `layout` golden
  kind): each room's area, grade, role, regime and pressure resolved to
  outside, each connection's pressure difference, each flow's path, every
  finding.  No grade, step or separation is shipped: they are the case's,
  with their source.  The GUI draws it under Reports, "Plant layout (3D)":
  rooms as translucent boxes tinted by grade, labelled with their pressure,
  airlocks dashed, flow arrows by kind with a toggle each, and a plan per
  floor.  Record: `docs/design/a-gmp-interior-is-declared-and-checked.md`;
  gate `check_gmp_layout`.
* Worked cases: `tutorials/plant/ammonia02_full_plant` (declared rack,
  roads, two gates, offices, car park, weighbridge, the one-way truck loop,
  laydown, muster points, fire water, windsock, warehouse, canteen, the
  fence and its labelled crossings),
  `greenAmmoniaPEQ_baseCase` and `aceticAcid02_plant` (declared racks),
  `apalutamide01_tablets` (a GMP building in its `productionBuilding`
  envelope with every process item in a room -- a double-height spray-drying
  suite, the nitrogen loop's technical room, the solution and coating-
  suspension rooms, the AHU plant -- and only the bulk-solvent tank farm
  outdoors, its two lines declared to their wall penetrations; powders and
  tablets not piped).  The
  stated default rack is exercised by `check_plant_layout` on a copy of
  ammonia02 with its `pipeRack` removed.  The
  GUI draws the result in Reports, "Plant layout (3D)", with the pipe
  register.  Record:
  `docs/design/a-plant-layout-is-declared-and-checked.md`.

## Where a numerical option lives — the four homes are INTENTIONAL

Settled 2026-08-04 (Vítor, option A of
`docs/design/solverdict-consolidation-scope.md`).  Numerical settings sit
in four places, and that is a decision, not fragmentation left unfixed:

| Home | What belongs there | Read by |
|---|---|---|
| `system/solverDict` | **steady flowsheet numerics** — recycle solver, tear tolerances, acceleration | `choupoSolve` |
| a unit's `solver { }` | **that unit's own integrator choice** and its tolerances | every binary, per unit |
| `system/controlDict` | **time control** — start/end/write, and the adaptive error tolerances that govern stepping | `choupoBatch`, `choupoSemiContinuous`, `choupoCtrl` |
| `system/outerDict` | the **outer driver's** own numerics (sweep, optimiser, estimator) | all five |

The organising idea is *whose* number it is.  A tear tolerance belongs to
the flowsheet; an integrator belongs to the unit that integrates; a time
step belongs to the run's clock.  Moving them into one file would put
three different owners' settings in one place and make the reader ask, of
every key, which one it governs.

**The trap this leaves, and what the engine does about it.**  A
`system/solverDict` in a batch or ctrl case is read by nobody — those
binaries take their numerics from `controlDict` and from each unit's
`solver { }`.  Silently ignoring it would let an author tune a number that
never reaches the solver.  So `choupoBatch`, `choupoSemiContinuous` and `choupoCtrl` **announce a
present-but-unread `solverDict` by name**, state what it cost (nothing —
the run continues on the defaults), and carry on; the steady binary does
the same for a transient `timeStepping` key it will not use.  Same posture
as the unread-dict-keys announcement: *a declared value that nothing reads
is a result you did not compute.*

Alternatives B (one home for all the binaries) and C (move only the
adaptive error tolerances) were scoped with file-and-line evidence and
**not** taken — both change the grammar of existing cases to buy tidiness,
and the four-home story is teachable as long as it is written down, which
this section is.  Revisit only if a concrete case proves it is not.

## Materialising `0/` — `bin/choupo-init0`

You author the DOMAIN INLETS (and any recycle-tear seed, `solverDict
tearStreams`); the tool writes every remaining stream file by explicit
propagation, announced and inspectable:

```
bin/choupo-init0 <caseDir>            // writes the missing 0/ files
bin/choupo-init0 <caseDir> --force    // regenerates existing internal/outlet estimates
```

Rules: an inlet file is never touched; an unseeded recycle is a hard error
naming the file to author; `incomplete 0/ + choupoSolve` stays FATAL — this
tool is the sanctioned way out.

**It materialises the INTERIOR half too** (2026-09-07). A state directory is a
restartable snapshot, so a unit that *reads* an interior gets one written at
`0/internalStates/<SECTOR>/<unit>` beside the stream files. What lands there is
the unit's **own** seed — the guess it would otherwise have made in silence,
moved onto disk where you can read it, edit it and own it — never a better one
chosen for you. A unit that reads no interior gets **no** file, and the run
reports the count either way — the line counts FILES, and says which zero it
is, because the two zeros mean different things:

```
[init0] interiors: 1 written, 0 kept
[init0] interiors: 0 written, 0 kept -- no unit here starts from a declared interior
[init0] interiors: 0 written, 0 kept -- the unit(s) named above read one and
        publish no seed yet
```

A unit type that reads an interior but has not published its seed yet is named
on its own line rather than skipped in silence; it goes on seeding itself at
run time, and says so.

## Validating a case without running it — `bin/choupo-lint`

The companion to `choupo-init0`, and the cheap step in the authoring loop
(write → **lint** → fix → run).  It runs the whole load-and-compose path —
dict grammar, thermo package (every component resolved), flattening the sectors
(all topology cabling), the `0/` completeness contract, tear resolution —
plus the checks a run only surfaces mid-execution (unknown unit type,
duplicate unit names, two producers of one stream), then stops before
anything solves or writes.  Strictly read-only.

```
bin/choupo-lint <caseDir>     // exit 0 = will run as declared; 1 = findings; 2 = load refusal
```

It also prints the topology-inferred stream ROLES (no producer → INLET;
producer+consumer → INTERNAL; producer only → OUTLET, tears flagged) so you
can confirm the graph says what you think it says before spending a solve.
A case shipping its own `code/` gets a warning, not a refusal, for types
only `bin/buildCode`'s case-local binary registers.

## Declaring a UTILITY CIRCUIT (`utilities` in the flowsheetDict)

A plant that models its cooling water as an explicit pair of streams puts that
water into its own material balance — and a cooling-water flow is typically
one or two orders of magnitude larger than the process material, so the
plant-level closure stops being a statement about the process.  Measured on
`tutorials/plant/ammonia02_full_plant`: the cooling water is **99.2 % of the
mass in the balance**, so a 1 % loss of syngas would move the reported closure
by 0.008 % — invisible at the four decimals the report prints.

A case may therefore DECLARE that a pair of boundary streams is an auxiliary
circuit.  The block is TOPOLOGY, so it lives in `system/flowsheetDict` beside
`units ( ... )` — not in `0/<stream>` (that is state, and it is rewritten in
`converged/`) and not on a unit port (a stream is an EDGE; declaring its role
at one endpoint is the producer rule replaced on 2026-09-07):

```
utilities
(
    {
        name     CW1;                              // this circuit's name
        service  coolingWater;                     // data/standards/utilities/<service>.dat
        supply   cw;                               // the stream entering the plant
        return   cwOut;                            // the stream leaving it
        note     "closed cooling-water circuit";   // OPTIONAL, free text
    }
);
```

What it changes, and what it does NOT:

* `reports/balances/massBalance.csv` gains rows — one per circuit, a
  `PROCESS_TOTAL` and a `process_closure_pct`.  `TOTAL` and `closure_pct` do
  not move: they are still the TOTAL scope, over every boundary stream.
* the run ANNOUNCES how much mass was excluded and what share of the total it
  was, so the narrowing is seen and never discovered.
* **nothing else.**  The separation is PRESENTATION, never validation scope:
  the per-unit balances, the element balance, the energy balance and every
  explicitly modelled boundary keep covering all streams, utilities included.

Absent the block, a case behaves exactly as before.

The criterion is *"transfers matter across the process boundary"*, never
*"contacts the process"* — and the engine checks it rather than taking your
word: the declaration REFUSES by name when `supply` and `return` are the same
stream, when a stream is claimed by two circuits, when `service` is not a
record in the utility catalogue, when `supply` is not a plant boundary inlet
or `return` not a plant boundary outlet, when the two ends are not one unit's
utility side, and when the pair does not conserve component-wise.

That last refusal is about the DECLARATION, not about your plant.  A cooling
tower with makeup, evaporation, drift and blowdown is perfectly legitimate and
simply does not conserve across two streams: model those streams explicitly
and they stay in the process material balance, where they belong.  There is no
`reason` key — the claim is verifiable, and the engine verifies it, so prose
would be friction rather than rigour; `note` is offered and never required.

## The sequential-plan contract (tears + declaration order)

The solver executes the units **in the order you declare them** — it never
reorders.  The engine detects material cycles itself; what you declare is the
**cut**: which stream the recycle iteration tears.  The contract, enforced
before anything runs (both by `choupoSolve` and `choupo-lint`):

* every material input must be a **domain inlet**, an **output of an EARLIER
  unit**, or a **declared tear**;
* every declared tear must point **backwards** (consumer declared before its
  producer) and close a **real cycle**.

Violations refuse with a named, remedy-bearing finding: `MISSING TEAR` (shows
the cycle and the `tearStreams` line to paste), `INVALID ORDER` (shows a valid
declaration order to paste), `FORWARD TEAR` / `OFF-CYCLE TEAR` / `UNKNOWN
TEAR` / `INLET TEAR` (a tear that cuts nothing real).  A valid recycle plan is
announced: `[plan] material recycle: tear 'recycle' cuts mixer -> reactor ->
separator -> split --recycle--> mixer`.  A recycle that does not converge
exits **1** and `converged/` is not written.  The tear's initial guess lives
in its `0/` file, like any other stream.  Declare `tearStreams` in
`system/solverDict` (the numerical home); the flowsheetDict is still read for
older cases.
