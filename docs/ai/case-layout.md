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
│   └── outerDict            OPTIONAL  outer driver (sweep /
│                                       optimization / DesignSpec)
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
`tutorials/plant/ammoniaStaged04_kinetic`.

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
Worked case: `tutorials/plant/ammoniaStaged03_approach`.

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
`tutorials/plant/greenAmmoniaIndustrialN2` (all six exchangers).

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
(pressurised storage) is refused.  This is a postDict ITEM, not the
`storageTank` UNIT (`docs/ai/unit-ops.md`): the unit is a buffer inside the
flowsheet that reports a holdup and is not sized or costed; the item is the
tank the plant buys.  Worked case: `tutorials/plant/greenAmmoniaIndustrialN2`.

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
beside it for comparison.  Worked case: `tutorials/plant/greenAmmoniaIndustrialN2`.

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
