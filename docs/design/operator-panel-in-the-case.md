# An operator panel kept in the case

**Kind:** ADR · **Status:** PARTLY BUILT (DEV.md 4c C371): S1 the engine
(99adc853e0), S2 the read-only GUI workspace (e31b30c286) and S5 the EduTool
lesson (aa5393aef3) are on `main`; S1b, S3 and S4 are not built (§9 says
which piece is where) · **Gate (S1):** `bin/curate/check_panel.py` (`check_panel`
in `bin/runTests`) · **Witness (S1):** `edbatch01_constant_current`

Read at `origin/main` 034ae5055 on 2026-11-12, before anything was built.
Every statement about the engine or the GUI as it was then carries the
`file:line` it was read at; the §2 table is that reading and is left as it
was.  Corrected after the landing (2026-11-13, review notes on S1): the
status, the refusals and facts of §5, where the block is published and the
slice table of §9 now say what the tree does, and each sentence that
describes a piece not built says so.
Run numbers come from one run of `edbatch01_constant_current` with the
primary checkout's build of 2026-11-10 (41 written instants, 0 to 2000 s).
Everything said about industrial practice (alarm management, operator
displays) is **not verified against a source in hand**: the standards are
not in the literature folder, and none is named here as if read.

## 1. What is asked, and what this record builds on

A panel is the **human-in-the-loop exercise**: it is good when a person can
tell from it what the process is doing, and no engine can grade that.  It is
DECLARED in the case (`system/panelDict`), DRAFTED by the engine from what the
case declares with a reason per element, TUNED by the student, LOCKED when
final, and grows from the simplest panel that works.  **The engine reports
FACTS about a declared panel, never a grade.**

Built on, not re-derived: the prior analysis
`docs/reviews/2026-11-12-control-panel-wine-electrodialysis/` (REPORT.md, its
`panelDict.proposed`, `tables/`, `scripts/check_panel_proto.py`); the precedent
"declared, checked, drafted" of `system/layoutDict`
(`docs/design/a-plant-layout-is-declared-and-checked.md`); the GUI credo
(`docs/ai/gui-credo.md`).

## 2. What the engine and the GUI do today (read, not recalled)

| fact | where |
|---|---|
| A controller names its measurement `measurement { unit <u>; cv <key>; }`, resolved by the unit's `getCV(key)`; an unknown unit throws by name | `src/control/PIDController.cpp:40-46`, `:111` |
| PID output limits `output { min; max; bias; }`, absent = +/-1e30 | `src/control/PIDController.cpp:84-91` |
| choupoBatch publishes `trajectory.csv`: `t`, `<unit>.n_<comp>`, `<unit>.T`, then each unit's `trajectoryExtras()` as `<unit>.<key>`, on the `writeInterval` grid | `src/applications/choupoBatch/main.cpp:691-718` |
| The time-integrated driver writes `<unit>.<stateLabel>` and, per controller, `<C>.SP,<C>.PV,<C>.MV` (a controller with no PV writes `<C>.MV` only) | `src/dynamicDriver/DynamicDriver.cpp:1047-1068` |
| A CV a controller can read is not always a published column: `DynamicCSTR::getCV` accepts `T_jacket`, `stateLabels()` does not list it | `src/unitOperations/dynamic/DynamicCSTR.cpp:1035-1051`, `:1355-1388` |
| `batchElectrodialysis` publishes `I_A, U_V, i_A_per_m2, i_lim_A_per_m2, i_over_ilim, xi_eff, E_mem_pair_V, R_pair_ohm, P_electric_kW, W_electric_kJ, kappa_dil_S_per_m, kappa_conc_S_per_m`, molalities, the concentrate inventory, `deminActual`, `deminIdeal` | `src/unitOperations/batch/BatchElectrodialysis.cpp:822-858` |
| It checks the stack record's `limits { i_max; T_max; }` against the run and ANNOUNCES an excess | `src/unitOperations/batch/BatchElectrodialysis.cpp:471-487`; the record: `tutorials/batch/electrodialysis/edbatch01_constant_current/constant/assets/*.dat:113-116` |
| It accepts NO mid-run parameter: the base `setOperationParameter` throws, the unit does not override it; the recipe's actions are `transfer` and `setParameter` | `src/unitOperations/batch/BatchUnitOperation.cpp:328-333`; `src/applications/choupoBatch/main.cpp:498-511` |
| The result JSON is emitted once, after the run, advisories and timeline | `src/applications/choupoBatch/main.cpp:2270-2283`; `src/dynamicDriver/DynamicDriver.cpp:2080-2086` (direct path only, `writeOutputs`) |
| A block appears in the JSON ONLY when its dict is declared, one record per line with an `"id"`, which the golden kind `layout` reads | `src/result/ResultEmitter.cpp:1531-1540`; `bin/runTests:1162-1175`, `:2486` |
| `--layout-draft` writes a draft `system/layoutDict` after the solve, never over an existing one without `--force`, then checks its own draft; `bin/choupo-layout` wraps it | `src/applications/choupoSolve/main.cpp:547`, `:821-856`; `bin/choupo-layout:19-21`, `:51` |
| The named-unit registry has NO electrical unit (no `A`, `V`, `S/m`, `A/m2`); a scalar's dimensions are `[M L T Theta N]`; the stack record writes `i_max 200;` as raw SI for that reason | `src/core/Units.cpp` (registry); `docs/ai/dict-syntax.md:150-216` |
| Unread keys of a dict are reported with a typo suggestion | `src/core/DictAudit.H:103-109` |
| Flowsheet arrangement: browser working copy in localStorage > the case's `.cho` snapshot > automatic layout; ONE explicit "Save layout to case" writes the `.cho` through the local bridge | `gui/src/state/layout.ts:30-42`, `:232-244`, `:296-316`; `gui/src/ui/FlowCanvas.tsx:508`, `:722-728`, `:1737` |
| The bridge's `POST /api/case/file` writes ANY relative path inside the case folder | `gui/bridge/claudeBridge.mjs:789-818`; client `gui/src/cases/workspace.ts:183-200` |
| The Control Room is a PID tuning bench, shown only for a choupoCtrl case with a PID; it re-runs the case in WASM with mutated dicts and writes nothing back | `gui/src/ui/ControlWorkspace.tsx:2-15`; `gui/src/ui/MenuBar.tsx:194-198` |
| The GUI receives the trajectory as `{ t; vars: { name: number[] } }` | `gui/src/adapters/SolverAdapter.ts:429-432`, `:630` |

Consequences that shape every decision below: (a) the one namespace a run
publishes over time is the trajectory column `<owner>.<key>`; (b) electrical
quantities cannot carry a named unit; (c) the first case has no controller and
admits no mid-run disturbance; (d) the Control Room never opens on it.

## 3. Decision 1 -- the grammar of `system/panelDict`

### 3.1 Top-level blocks

| block | content | why it exists | rejected |
|---|---|---|---|
| `draft { tool; engine; }` | written ONLY by the drafter: the tool word (`panelDraft`) and the engine version that drafted | tells "this file began as a draft" without a date the git history already holds | a `by`/`date` pair (git carries both; a second home) |
| `lock { by; date; reason; }` | PRESENT = locked; delete it to unlock | the lock is a statement someone makes, with a reason | `locked true|false;` (a block whose one meaningful state is its presence -- the amplifier rule) |
| `grid { columns; rows; }` | positive integers, counts | elements are placed on cells, never in pixels | pixel coordinates (depend on the screen) |
| `style { density; trendWindow; }` | `density compact|comfortable`; `trendWindow <time>` (absent = the whole run) | the two presentation knobs the student owns | colour (doctrine: colour carries status only and every status is also a word -- said here, not a field) |
| `elements ( {...} ... )` | the panel | | |
| `messages ( {...} ... )` | events sent to someone NOT looking at the panel | a message is not an alarm | folding messages into alarms |

### 3.2 An element

| field | values | rule |
|---|---|---|
| `name` | word, unique | identity; the facts and the golden rows use it |
| `title` | string | what the operator reads |
| `kind` | `number`, `bar`, `trend`, `lamp` | the first four; others are later slices (§9) |
| `measurement` | `{ unit <u>; cv <key>; }` or `{ controller <C>; cv SP|PV|MV; }` | resolves to the published column `<u>.<key>` / `<C>.<cv>`; the controller block's shape reused verbatim |
| `reference` | same shape as `measurement`, optional, `trend` only | a second series drawn faint (actual against ideal, PV against SP) |
| `range { min; max; }` | scalars | the scale of the element; required for `bar`, `lamp` |
| `limit { low; high; source; reason; }` | at least one of `low`/`high`; `source` and `reason` strings, both required | ONE block for a limit and a band (a band is a limit with both ends) |
| `alarm { on high|low|outside; delay <time>; action "..."; }` | optional, needs a `limit` | every alarm names the action it asks for; `delay` absent = 0 s |
| `words { normal; low; high; }` | strings, `lamp` only, optional | the lamp's state as a word; absent = `NORMAL`/`LOW`/`HIGH` |
| `events ( <C> ... recipe )` | `trend` only, optional | instants a Signal/Schedule MV or a recipe action changed, drawn as markers on the time axis |
| `place { column; row; width; height; }` | integers inside `grid` | refused outside the grid or overlapping another element |
| `reason` | string, required | why this element is on the panel; a missing reason refuses |
| `authored` | `draft` or `edited` | who last shaped this element (§6.3) |

**Units on scalars.**  A `range`/`limit` value is either a named unit the
registry has (`313.15 K`, `2 min`), converted to SI, or a raw number in the SI
unit the series is published in -- the column's own name carries that unit
when no named unit exists (`i_A_per_m2`, `U_V`, `kappa_dil_S_per_m`), and the
example writes it in a comment beside each raw value.  `delay` and
`trendWindow` are times and always carry a unit.  `grid`/`place` are counts.
The engine cannot check a limit's dimension against its series, because no
trajectory column declares its dimension today: that is stated, not hidden
(§10, open item 7).

### 3.3 Field-by-field check of the proposed grammar (`panelDict.proposed`)

| proposed | decided | reason |
|---|---|---|
| `recordType controlPanel;` | dropped | no `system/` dict carries one (`layoutDict` does not); a word with one possible value |
| `draft { origin; by; date; basedOn; }` | `draft { tool; engine; }` + per-element `authored` (not `origin`: that word belongs to the provenance vocabulary and check_origin_vocabulary holds it) | the useful question is WHICH ELEMENTS a person changed, not who saved the file; `by`/`date` are git's |
| `lock { locked false; ... }` | `lock {}` present or absent | amplifier rule |
| `range ( 0 0.6 ) S/m;` | `range { min; max; }` | a list with a trailing unit is no convention in the corpus; `min`/`max` is the outerDict and plot-axis form (`docs/ai/dict-syntax.md:851`, `:1089`); `S/m` is not in the registry |
| `displayUnit mS/cm;` | dropped | display units already have one home, the reader's preferences (`gui/src/case/applyPrefs.ts`, the Units menu); `mS/cm` is not a registry unit |
| `band {}` and `limit { value; }` | one `limit { low; high; }` | two shapes for one comparison is a second home |
| `preAlarm { fraction 0.9; source "assumption"; }` | dropped from the first slices | a pre-alarm fraction is an alarm-management practice not verified against a source in hand; a student who wants one declares a second, tighter limit on another element and reads the facts about it |
| `expression "U / N_cellpairs";` | dropped | a derived quantity belongs to the unit that publishes it (one home); a panel that computes is a second engine.  A missing quantity is the fact "not published", which asks the unit to publish it |
| `prediction`, `strip`, `states ( ... when "..." )`, `confirm {}` | deferred (§9) | each needs a quantity no unit publishes (a rate, a time to limit) or a condition language; `strip` is several `lamp` elements in one row |
| `alarms ( { name; when outsideBand; for 2 min; action; } )` | one `alarm { on; delay; action; }` per element | one cause, one alarm: an element has one measurement and one limit, so one alarm |
| `messages ( { event; from; when "..."; text; } )` | `{ name; from <element>; on high|low|outside|end; text; }` | the trigger is a crossing of the element's own limit, or the run's end; no free condition string |
| `measurement { unit; cv; }` | kept, plus the `controller` owner | the controller's own grammar; `controller` covers SP/PV/MV, which are published under the controller's name, not a unit's |

### 3.4 Complete example -- `edbatch01_constant_current/system/panelDict`

```
/*---------------------------------------------------------------------------*\
  panelDict -- the operator panel of the constant-current batch rig.
  Drafted by `bin/choupo-panel --draft`, then the voltage scale was changed.
\*---------------------------------------------------------------------------*/

draft { tool panelDraft;  engine "Choupo-dev"; }

grid  { columns 12;  rows 8; }

style { density comfortable; }          // no trendWindow: the whole 2000 s

elements
(
    {
        name        diluate;
        title       "Diluate conductivity";
        kind        trend;
        measurement { unit rig;  cv kappa_dil_S_per_m; }
        range       { min 0;  max 1.4; }                 // S/m
        place       { column 1;  row 1;  width 8;  height 4; }
        reason      "the diluate is the product; its conductivity says how far the batch has got";
        authored    draft;
    }
    {
        name        demineralisation;
        title       "Demineralisation, actual against ideal at I(0)";
        kind        trend;
        measurement { unit rig;  cv deminActual; }
        reference   { unit rig;  cv deminIdeal; }
        range       { min 0;  max 1; }                   // fraction
        place       { column 1;  row 5;  width 8;  height 4; }
        reason      "the unit publishes the straight line beside the run; their parting is the over-limiting regime";
        authored    draft;
    }
    {
        name        voltage;
        title       "Stack voltage";
        kind        trend;
        measurement { unit rig;  cv U_V; }
        range       { min 0;  max 10; }                  // V
        place       { column 9;  row 1;  width 4;  height 2; }
        reason      "at constant current the voltage is the free electrical variable; it rises as the diluate loses conductivity";
        authored    edited;                              // the draft scale was 0..12 V
    }
    {
        name        overLimiting;
        title       "Limiting current";
        kind        lamp;
        measurement { unit rig;  cv i_over_ilim; }
        range       { min 0;  max 2.5; }                 // -
        limit       { high    1;
                      source  "the limiting current of the unit's own film model";
                      reason  "above 1 the extra current splits water instead of moving salt"; }
        alarm       { on high;  delay 0 s;
                      action "lower the current, or stop the batch: past the limiting current the extra current removes no salt"; }
        words       { normal "BELOW LIMITING";  high "OVER LIMITING"; }
        place       { column 9;  row 3;  width 4;  height 2; }
        reason      "the unit reports this regime boundary itself; crossing it is the event that ends efficient operation";
        authored    draft;
    }
    {
        name        currentDensity;
        title       "Current density against the stack rating";
        kind        bar;
        measurement { unit rig;  cv i_A_per_m2; }
        range       { min 0;  max 250; }                 // A/m2
        limit       { high    200;                     // A/m2
                      source  "the stack record's limits { i_max }, an estimate (see the record's provenance)";
                      reason  "the rating the unit checks the run against"; }
        alarm       { on high;  action "lower the current set on the rectifier"; }
        place       { column 9;  row 5;  width 4;  height 2; }
        reason      "the stack record declares this limit";
        authored    draft;
    }
    {
        name        temperature;
        title       "Rig temperature";
        kind        number;
        measurement { unit rig;  cv T; }
        range       { min 273.15 K;  max 333.15 K; }
        limit       { high    313.15 K;
                      source  "the stack record's limits { T_max }, an estimate (see the record's provenance)";
                      reason  "the membranes' temperature ceiling"; }
        alarm       { on high;  action "cool the tanks or stop"; }
        place       { column 9;  row 7;  width 4;  height 2; }
        reason      "the stack record declares this limit";
        authored    draft;
    }
);

messages
(
    { name overLimiting;  from overLimiting;  on high;  text "Limiting current reached: the batch has stopped removing salt efficiently"; }
    { name batchEnd;      on end;                       text "Batch finished"; }
);
```

The shipped `system/panelDict` of the witness differs from this example in
two declared ways, and its own header says so: it has no `draft {}` block and
every element is `authored edited`, because the drafter (S3) does not exist.

What the facts of §5 say on this run (computed by hand from the trajectory
with the definitions of §5 before S1 was built, and confirmed by the built
pass: the witness's `[panel]` log lines and the `panel` rows of its
`expected` carry the same numbers): `overLimiting` violated at **9 of 41**
written instants, first at **1600 s** (the unit's own step-resolved crossing
is 1593 s, `t_overLimiting_s`); `currentDensity` **constant** at 175 A/m2,
never violated, closest approach 25 A/m2 = 0.10 of its range; `temperature`
**constant** at 298.15 K, never violated, closest approach 0.25 of its range;
`voltage` 3.615 -> 9.019 V, inside its range; one alarm active at most, from
1600 s; messages `overLimiting` at 1600 s and `batchEnd` at 2000 s.  Two of
six elements show a quantity that never moves in this mode of operation --
which is the tutorial's first finding (§8).

## 4. Decision 2 -- where it lives and who reads it

| question | decision | reason | rejected |
|---|---|---|---|
| home | `system/panelDict`, optional | it is part of the case, like `layoutDict`; the engine reads it | the `.cho` marker: CLAUDE.md §3 reserves it for GUI-only metadata the solver never reads (`CLAUDE.md:374-377`), and the facts need the engine |
| absent | no line of any output changes | the layout precedent (`src/result/ResultEmitter.cpp:1531-1535`); proved per case by whole-output diff | |
| readers | `choupoBatch` (S1, built); the time-integrated driver, so `choupoCtrl` and `choupoSemiContinuous` (S1b, NOT built: until it is, the driver REFUSES the file by name, `src/dynamicDriver/DynamicDriver.cpp` before it reads the flowsheet's `recipe`) | a panel reads quantities over time | |
| `choupoSolve`, `choupoProps` | REFUSE a `panelDict` by name: "a panel reads a time-integrated run" | a steady run has no time axis; silently ignoring a declared file is the unread-key defect | ignoring it |
| outer drivers | the panel is evaluated on the direct path only | an outer pass writes no outputs (`DynamicDriver.cpp:2082`) | facts per sweep point |
| physics | **never changes it, structurally** | see below | |

**How "never changes the physics" is guaranteed by structure, not by care.**
(1) `panelDict` is opened only after the integration loop has ended, at the
point the advisories are collected and before the JSON is emitted
(`choupoBatch/main.cpp:2279-2283`; `DynamicDriver.cpp:2080-2086`).  (2) The
evaluator's inputs are a `const PublishedSeries&` -- the labels and rows
`writeSnapshot` already writes to `trajectory.csv`, kept in memory as they are
written -- the `const` flowsheet dict (for controller names and recipe) and the
`const` timeline; it holds no pointer to a unit or a controller.  (3) It lives
in `src/postProcessing/panel/`, a band `check_layering` already forbids every
`unitOperations`, `thermo` and `solver` file from reading.  (4) The gate's
first arm runs the witness with and without the file and diffs everything
except the `panel` block and the `[panel]` lines: byte-identical.  Rejected:
reading `trajectory.csv` back from disk (fails when the writer is off, couples
the facts to an I/O format); evaluating inside the time loop (the evaluator
would sit beside the integrator).

## 5. Decision 3 -- the facts

**Refusal or fact.**  The layout rule carries over: what makes the file
*not a panel* refuses; what makes it *a panel to defend* is a fact.

| refuses (malformed) | why |
|---|---|
| unknown `unit` or `controller` name | a typo, the controller's own rule (`PIDController.cpp:45-46`) |
| unknown `kind`, unknown key (the nearest key suggested by `dictAudit::editDistance`), `alarm` without `limit` or without `action`, `limit` without `source` or `reason` or with neither end, element without `reason`, a time (`delay`, `trendWindow`) without its unit, a `bar` or `lamp` without `range`, a `lock` without `by`, `date` or `reason` | the file says something the engine cannot read |
| `place` outside `grid`, two elements on one cell, duplicate `name`, `message.from` naming no element | the panel cannot be drawn |
| `--panel-draft --force` on a locked panel (S3, NOT built: there is no drafter yet) | the lock is a statement someone made |

| fact (`kind` id) | exact definition | threshold and its reason |
|---|---|---|
| `notPublished` | the column `<owner>.<cv>` is absent from the run's published series | none.  A FACT, not a refusal: the panel is drawn with "not published" in that element, never a zero; the remedy is for the unit to publish it.  A unit that can `getCV` a key it does not write (`DynamicCSTR.cpp` `T_jacket`) is to be reported with that distinction -- NOT built: it is the driver's case (S1b), and the driver refuses the file today |
| `constant` | `max - min <= 1e-8 max(1, abs(max))` over every written instant | the element shows a quantity that never moved in this run; 1e-8 is the last digit `trajectory.csv` writes (scientific, 8 decimals, `main.cpp:709`) |
| `outOfRange` | some written value below `range.min` or above `range.max`; reports the count and the extreme | the scale hides part of the run |
| `limitOutsideRange` | `limit.low` or `limit.high` outside `[range.min, range.max]` | the limit cannot be seen on its own scale |
| `violated` | count `k` of `n` written instants beyond a limit (strictly), first and last instant | always published when a limit exists; `k = 0` is reported as `neverViolated`, `k = n` as `alwaysViolated` |
| `neverApproached` | `k = 0` and the closest approach, `(high - max)/(range.max - range.min)` (or the `low` mirror), exceeds 0.5 | a limit in the far half of its own scale from every point was not exercised; 0.5 is a stated default of this record, not taken from any practice, and the closest approach is always published so a student can judge with another number |
| `controllerWithoutElement` | a PID in the flowsheet whose `PV` is shown by no element (`measurement { controller C; cv PV; }`, or the same `unit`/`cv` as its measurement block) | a declared loop the operator cannot see |
| `sameQuantityAlarms` | more than one `alarm` whose elements resolve to the same column | one cause, one alarm; two series that are functions of each other (`I_A`, `i_A_per_m2`) are NOT detected, and this is said in the gate |
| `alarmsActive` | per instant, the count of elements in alarm (`delay` applied on the write grid).  Published: `alarms` (declared), `max` (the largest count at one written instant) and `at` (the first instant that maximum is reached -- it can be the last written instant, so it is NOT the start of the alarms), `first` (the first written instant with at least one alarm active; absent when none ever is), `count` (the number of written instants with at least one alarm active) and, as the row's `intervals`, the periods with at least one alarm active.  The per-instant count itself is not published: it is derivable from each alarmed element's own `intervals` | the count of active alarms is always shown, and when and for how long any alarm was active is published, not left to be inferred from the maximum |
| `message:<name>` | first instant each message's trigger holds, as `fired` 0 or 1 and `t` when it fires | a message that never fires is published with `fired` 0 and no `t` |
| `draftDiffers` | an element marked `authored draft` whose fields differ from what the draft rules (§6) give on this run | NOT built (S3): the file was hand-edited without saying so, or the draft rules moved |

All crossings are resolved to the **write grid** (`writeInterval`): a crossing
between two writes is seen at the next one, and an excursion shorter than one
interval is missed.  Said in the first `[panel]` log line of every run and
in the Design Guide (`sec:operatorPanel`); the JSON block carries no sentence
on it.  The remedy is a smaller `writeInterval`.  Rejected: evaluating every step (puts the evaluator inside
the loop, §4).

**Where published.**  (a) A JSON block `"panel"` (`src/result/PanelJson.cpp`),
emitted only when the file exists, with four lists `elements`, `facts`,
`messages`, `summary`, one record per line with an `"id"` exactly like
`"layout"`; on each line the numbers come first, then the short words, then
the one `intervals` list where the row has one, and last a `"text": {}` object
carrying the case's own sentences and the engine's explanation, so a golden
never reads a number out of a sentence.  As built:
`{"id": "element:<name>"}` carries the panel as read (`kind`, `column`,
`referenceColumn`, `authored`, `alarmOn`, `rangeMin`/`rangeMax`,
`limitLow`/`limitHigh`, `alarmDelay`, `placeColumn`/`placeRow`/`placeWidth`/
`placeHeight`), `published` 0 or 1, and on a published column `min`, `max`,
`first`, `last`, `n`, with a limit `violated` and `closestApproach` (and
`closestApproachFraction` with a range), with an alarm `intervals`
`[[t0, t1], ...]` (the instants the alarm is active, its delay applied), and
in `text` the `title`, `reason`, `limitSource`, `limitReason`, `action` and
the lamp's words; `{"id": "<fact>:<name>", ...}` per fact, its numbers and its
`explanation`; `{"id": "message:<name>"}` with `on`, `from`, `fired` and `t`;
`{"id": "summary"}` with `elements`, `facts`, `messages`, `alarms`,
`alarmsMax`, `alarmsMaxAt`, `instants`, `locked`, the grid, the style and the
lock's sentences.  The GUI therefore parses no dict to draw.  (b) A `[panel]` line family on stdout at verbosity >= 1, one line per
fact.  NOT in the end-of-run caveat block: that block says how far the
NUMBERS can be trusted, and nothing in a panel changes a number.  (c) A golden
kind `panel`, read by id like `get_layout` (`bin/runTests:1162-1175`) and added
to the kind list (`:2486`), so the block is not one that "arrives unpinned"
(`docs/design/which-result-blocks-a-golden-can-read.md`).  On the witness the
golden pins: `violated` and `first` of `overLimiting`, the two `constant`
facts, `summary.alarmsMax`, both `message` instants.

## 6. Decision 4 -- the draft

### 6.1 Who triggers it

`choupoBatch --panel-draft [--force]` (and the driver binaries in S1b): runs
the case, then writes `system/panelDict` from the case and the run, never over
an existing file without `--force`, never over a locked one, and checks what it
wrote in the same run -- the `--layout-draft` shape
(`choupoSolve/main.cpp:821-856`).  `bin/choupo-panel --draft <case> [--force]`
wraps it as `bin/choupo-layout` wraps its binary.  The GUI triggers the same
flag through WASM and receives the text as an UNSAVED working copy (§7).
Rejected: a Python drafter (a second reader of the case); drafting inside
`choupo-init0` (that tool materialises the initial state and runs nothing).

### 6.2 The rules

The drafter cannot guess what a column MEANS from its name.  Each unit says
it, once, through one new read-only hook beside `trajectoryExtras()`:
`panelHints()`, a list of `{ cv; role; low; high; source; }` with role
`product | effort | limit | regime | inventory | specification`.  Default
empty; a unit with no hints drafts only the controller and recipe rules.
Rejected: inferring roles from column names (it would invent meaning, and a
renamed column would silently change a draft).

| trigger in the case or the run | element drafted | `reason` written |
|---|---|---|
| a PID controller `C` | `trend` of `{controller C; cv PV}` with `reference {controller C; cv SP}`; and a `bar` of `{controller C; cv MV}` with `range`/`limit` from `output { min; max; }` when declared, `alarm on outside` "the actuator is saturated: the loop can no longer act" | "C is a loop the case declares: PV against SP says whether it is controlled" / "MV against its limits says whether C can still act" |
| a Signal or Schedule controller (no PV) | its name in `events` of every trend whose unit it actuates | "a disturbance the case declares is shown as an event, so the excursion is linked to its cause" |
| a `recipe` in the flowsheet | `recipe` in `events` of every trend | "the recipe's actions are marked where they happen" |
| hint `limit` (a limit the unit checks, e.g. the stack record's `i_max`, `T_max`) | `bar` (or `number` when the series is constant over the draft run) with `limit` copied with the hint's `source`, `range` = `[0, 1.25 x limit]`, `alarm on high` with a placeholder action "declare the action this alarm asks for" | "the unit's record declares this limit" |
| hint `regime` (a boundary the unit itself announces, e.g. `i_over_ilim` = 1) | `lamp` with `limit`, `alarm`, words from the hint | "the unit reports this regime boundary itself" |
| hint `product` | `trend`, range from the run's min/max grown by 10 % | "this is what the unit makes" |
| hint `effort` (the free electrical or thermal variable) | `trend`, same range rule | "at this drive it is the variable that moves" |
| hint `inventory` (a holdup: level, volume, moles) | `trend`, `range` from the vessel geometry when published, else the run grown by 10 % | "the inventory the run is about" |
| hint `specification` (a declared target, e.g. a removal target) | `trend` with a `limit` band at the target; `source` = the dict path of the target | "the specification the unit runs for" |
| a series reaching 1e30-scale defaults, or a column with no hint | nothing | the draft is the simplest panel that works; a person adds the rest |

The draft places elements in the order of the table, filling a 12 x 8 grid
left to right, trends 8 x 4, bars and lamps 4 x 2, numbers 4 x 2.  For the
witness the rules give exactly the example of §3.4 with the voltage range
`0..12` and the placeholder actions (the example's actions are the student's).

### 6.3 Draft against edited

Every drafted element is written `authored draft;`.  The GUI's write marks
`authored edited;` on every element whose fields differ from the ones it loaded;
a hand edit in a text editor is caught by the fact `draftDiffers`.  On
`--force` the drafter KEEPS every `edited` element and every `messages` entry
and redraws the `draft` ones -- the layout drafter's rule of carrying the
case's own declarations forward (`bin/choupo-layout:19-21`).  Rejected: a file
checksum (says THAT something changed, not WHAT).

## 7. Decision 5 -- the GUI

| question | decision | against the credo |
|---|---|---|
| where | a **Panel** workspace in the top menu, shown when a time-integrated run's case declares `panelDict` or can be drafted; plus a `?panel=` interactive pop-out so it sits on a second screen beside the Control Room or the flowsheet | serves §2.4 (pop-out beats modal) and the interactive pop-out family (`gui-credo.md:647-660`); NOT a tab of the Control Room: that is a PID tuning bench that never opens on a batch case (`MenuBar.tsx:194-198`) |
| what it draws (S2, read-only) | `number`, `bar`, `trend`, `lamp` from `RunResult.trajectory` (`SolverAdapter.ts:429-432`) and the `panel` block: limits, ranges, places, alarm intervals, facts | the GUI compares nothing: a lamp's state and an alarm interval are the engine's `intervals`, the layout's "the GUI computes none" |
| a time cursor | the panel follows the run's time scrubber; the active-alarm count is always shown | |
| tuning (S4) | move and resize on the grid, change `kind` among the four, `range`, `limit` values with their `source`/`reason`, `alarm.action`, `words`, `style`; add an element ONLY by picking from the published columns; delete an element | |
| after a tuning change | facts are marked "as of the last run"; **Check panel** re-runs the case in WASM with the working-copy `panelDict` placed in memory -- the Control Room's re-run mechanism (`ControlWorkspace.tsx:7-15`) -- and writes nothing | no browser-side fact |
| persistence | working copy in localStorage keyed by case; precedence working copy > the case's `panelDict` > the draft; ONE explicit **Save panel to case** writes `system/panelDict` through the local bridge; with no bridge (the public site) the same button DOWNLOADS the file | the flowsheet arrangement's mechanism exactly (`layout.ts:232-244`, `FlowCanvas.tsx:722-728`) |

**The collision with the credo, and the resolution.**  The credo says the GUI
never writes a case: "When the user wants to change a case, the change happens
in the dict files" (`gui-credo.md:32-34`), "Drag-drop authoring of any kind"
is an anti-pattern (`:764-766`), and an edit must be an explicit Save
(`:781-783`).  `panelDict` IS a dict, so **S4 is a deliberate, bounded
exception**, argued, not slipped in: (1) the engine reads `panelDict` only
after the physics and never into it (§4), so nothing the GUI writes can move
a number -- the property that made the `.cho` write acceptable; (2) the
panel's medium is visual: a person judges a panel by looking at it, and
arranging a grid by typing coordinates is the wrong instrument; (3) the write
is one explicit act, never on a drag.  **The rule that keeps it from becoming
an editor:** *the GUI writes a file only if the engine provably reads that
file after the solve and never into it.*  Today that admits two files, the
`.cho` marker and `system/panelDict`; S4 makes it structural by narrowing the
bridge, which today writes ANY path in the case (`claudeBridge.mjs:789-818`),
to exactly those two, held by a gate.  The panel serializer writes the
panel's grammar only.  The credo gains this rule in §4 when S4 lands.
Rejected: a GUI that only downloads (the student must then move a file into
the case after every change -- kept as the no-bridge fallback); the panel in
the `.cho` (§4); tuning by text only (contradicts the idea's "tuned by the
student" on a visual object).

**Locked.**  Engine: `lock {}` present makes `--panel-draft --force` refuse;
the facts still run (a lock freezes the design, not the facts about it) and
`summary.locked` is published.  GUI: drawn exactly as the file, every tuning
control disabled with "locked by <by> on <date>: <reason>"; no working copy
is kept or applied.  The GUI may SET a lock (a save that adds `lock {}` with
a typed reason) and never removes one: unlocking is an edit of the file.
Rejected: the proposed "rearrange in your own browser while locked" -- an
examiner would see something other than what was locked.

## 8. Decision 6 -- the tutorial, on `edbatch01_constant_current`

| step | the student does | the student is told |
|---|---|---|
| 1. Run blind | runs the case; reads `trajectory.csv` (26 columns) and the plots; answers "when should this batch have stopped, and how would you have known at the rig?" | that an operator has none of the 26 columns at once, and that the answer must come from what he would see |
| 2. Receive the draft | `bin/choupo-panel --draft`; opens the Panel; reads each element's reason and the facts | each element is there for a reason written beside it; the facts are facts, not a mark: two elements never move at constant current |
| 3. Meet a disturbance | runs the variant the case header proposes: the rectifier at 4.5 A (225 A/m2, past the record's 200 A/m2), or `xi 0.6`, or a richer diluate in `0/internalStates/rig`; first predicts which element moves first | a disturbance here is a SECOND RUN of a varied case: this unit takes no mid-run change today (§2) |
| 4. Change the panel | removes or demotes the inert elements, declares a product band on the diluate conductivity with its own `source` and `reason`, writes each alarm's action | every limit says where it comes from; "my specification" is a valid source when written as such |
| 5. Read the facts | runs again; reads `neverApproached`, `violated`, `alarmsActive` | a band the run never meets, or always breaks, is a statement about the band or about the run; deciding which is the exercise |
| 6. Lock | saves with a lock and a reason; opens the same panel on `edbatch02_constant_voltage` | the panel was designed for one mode of operation: at constant voltage the voltage element is the constant one and the current moves |

## 9. Decision 7 -- slices

**Status at 02d088295c (2026-11-13).**  S1 BUILT (99adc853e0): the engine
pass `src/postProcessing/panel/PanelPass.{H,cpp}`, the records
`src/core/PanelRecords.H`, the block `src/result/PanelJson.cpp`, the golden
kind `panel`, the gate `bin/curate/check_panel.py`, the witness's panel; its
guide section went to the Design Guide (`sec:operatorPanel`), not the Theory
Guide.  S1b NOT built: the driver binaries refuse the file.  S2 BUILT
(e31b30c286): the Panel workspace and the `?panel=` pop-out
(`gui/src/ui/PanelWorkspace.tsx`, `gui/src/case/panelView.ts`), User Guide
`sec:panelWorkspace`.  S3 and S4 NOT built: no `panelHints()`, no
`--panel-draft`, no `bin/choupo-panel`, no `draftDiffers`, no GUI write.  S5
BUILT as the EduTool `operator-panels` (aa5393aef3;
`gui/src/ui/methods/OperatorPanelsTool.tsx`, Theory Guide `sec:operatorPanels`
and an EduTools Guide section).

Every slice lands on FAIL 0 of the validation listed, and carries rule 4d:
(G) a Theory Guide section with a `\label`, (L) the Theory/F1 link opening it,
(A) `docs/ai/case-layout.md` (the `system/panelDict` section) and the
capability index, (C) `docs/tutorials-catalogue.md` and the Tutorials Guide,
(P) the PDFs rebuilt.  S1 follows the time-integrated fixes TI-01..03 (DEV.md
4c C371), since both touch the batch run's outputs.

| slice | content | acceptance | validation |
|---|---|---|---|
| **S1** engine | `PublishedSeries` captured in choupoBatch's `writeSnapshot`; `src/postProcessing/panel/` reader and facts of §5; the `panel` JSON block and `[panel]` lines; golden kind `panel`; `choupoSolve`/`choupoProps` refuse the file (and, until S1b, `choupoCtrl`/`choupoSemiContinuous`); `edbatch01` carries the §3.4 panel; gate `check_panel` (`bin/curate/check_panel.py`) | the example's facts as in §3.4; every refusal of §5 by name; G (`sec:operatorPanel`, the facts' definitions), L, A, C, P | build; `edbatch01`, `edbatch02` byte-identical without the file; `--scope` on the batch ED cases; the gate (byte-identity arm, one sabotage per fact and per refusal); `check_layering`; `--fast` (choupoBatch's main is touched) |
| **S1b** driver | the same reader in `DynamicDriver`, controller rules, `controllerWithoutElement`; a panel on `ctrl21_tank_level_control` | facts on the ctrl witness; the Signal's `PV` never drawn as a measured zero (`DynamicDriver.cpp:1054-1068`) | the ctrl and semi-continuous cases the driver reaches, by `--scope`; the gate's ctrl arm |
| **S2** GUI read-only | Panel workspace and `?panel=` pop-out drawing the four kinds from the trajectory and the block; time cursor; alarm count; facts list | renders on both witnesses; "not published" drawn, never a zero; a stale run dims | `--gui`; a test recomputing nothing but comparing drawn states with the block's `intervals` |
| **S3** draft | `panelHints()` on `batchElectrodialysis` (and `dynamicCSTR`, `dynamicTank`); `--panel-draft`, `bin/choupo-panel`; `draftDiffers`; `--force` keeping `edited` | the draft of the witness equals §3.4 save the edited voltage range and the actions; refuses on a locked file | the gate's draft arms; the units' cases by `--scope` (the hook is read-only, the outputs byte-identical); G updated with the rules table |
| **S4** tuning, persistence, lock | working copy, **Check panel** re-run, **Save panel to case** (bridge) / download (no bridge), serializer, `origin edited`, lock in the GUI; the bridge narrowed to `.cho` + `system/panelDict` with its gate; the credo's new rule | a save round-trips byte-stable; a locked panel cannot be changed or redrafted; the bridge refuses any other path | `--gui`; bridge test of the refusal; round-trip test over every shipped `panelDict` |
| **S5** the lesson | §8 as a tutorial section and, when the page queue clears, an EduTool on panels and alarms (DEV.md 4c C371) | each step runs today on the shipped cases | `--gui` lesson tests; `check_lesson_references` |

**The four engine pieces the wine process needs -- a list, not designed here,
each decided on its own:**

| piece | what it is | validated against | depends on |
|---|---|---|---|
| fouling in electrodialysis | a membrane resistance that grows in time, declared in the case with its source and reason | a published constant-current run whose voltage rise is measured (none verified to be in the literature folder today) | -- |
| voltage drive with a limit; conductivity to a controller | the stack driven at a current until a declared voltage, then at that voltage; `getCV` of the outlet conductivity on the stack wrapped `quasiSteady` | `edbatch01` and `edbatch02` reproduced at their goldens as the two limits of one run; a closed loop matching the steady stack at its set point | fouling (to be worth having) |
| displacement vessel | a stratified vessel, drawn at the bottom and fed at the top without mixing | the analytic plug-flow limit and the C258 mass closure | -- |
| conditional events | a recipe action fired by a published quantity crossing a value, not by a clock | a hand-computed drain/refill period and the mass closure | the displacement vessel for the wine case; usable alone |

A fifth, smaller piece would serve this tutorial directly: `setParameter` on
`batchElectrodialysis` (current, voltage, `xi`) so a disturbance happens INSIDE
a run (§2).  Listed, not scheduled.

## 10. What is not decided and needs the owner

1. The credo amendment of §7 (the GUI writes a file only if the engine reads it
   after the solve and never into it) -- the credo is the owner's founding text.
2. The alarm-management and operator-display practice: which standards he
   holds, so that `alarm`, the alarm count and any pre-alarm can be checked
   against a source in hand.
3. Whether a WINE batch case is shipped for the tutorial (the review's
   thirteen-ion variant is scratch only; shipping it needs its composition's
   source) or the NaCl rig of `edbatch01` stays the lesson's case.
4. The 0.5 threshold of `neverApproached` (§5) is this record's default; a
   different number, or none, is a pedagogical choice.
5. Whether the mid-run `setParameter` on `batchElectrodialysis` (§9) is wanted
   before S5.
6. Remote delivery of `messages` (to a phone, a mail): out of scope here; the
   panel lists them with their instants.
7. A dimension per published column, so a panel limit's unit can be checked
   against its series: a change to every unit's `trajectoryExtras()`, outside
   this record.
