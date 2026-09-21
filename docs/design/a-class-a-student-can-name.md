# A class a student can name

*The fifth problem class and binary, `choupoSemiContinuous`, and the
extraction of the dynamic driver into ONE home.  Built 2026-09-20, the same
day as the tutorials taxonomy ruling (a top-level `tutorials/` folder is a
discipline, not a binary).  Kind: ADR.  Status: SHIPPED 2026-09-20.*

---

## 1. The ruling (Vítor Geraldes, 2026-09-20, verbatim)

> *"Como é que um aluno sabe que choupoCtrl simula um reactor feed and
> bleed?!  Cria a classe semiContinuous!"*

A fifth PROBLEM CLASS and a fifth binary, **`choupoSemiContinuous`**: the
time-integrated flowsheet of unit operations connected by streams whose
internal states are non-stationary, WITHOUT a control loop — continuous
transients (start-up, a disturbance watched open-loop), fed-batch, feed &
bleed.  `choupoCtrl` stays: the same integration with the CONTROL layer, a
distinct class BY RULING, because process control is a distinct discipline
(one course, its own folder `tutorials/ctrl/`).  The word `semiContinuous` is
Vítor's and is used exactly; it is not `unsteady`, `dynamic` or `transient`.

## 2. The measured fact: the reactor already ran, under the wrong name

Before anything was built, the claim behind the ruling was measured.  A feed
& bleed reactor DID run: `dynamicCSTR` carries a continuous inlet and a
continuous outlet, the forward router of 2026-08-24 chains such units, the
driver integrates them in time, and the controllers were OPTIONAL — the
whole control layer sat inside `if (fsDict->found("controllers"))` in
`choupoCtrl/main.cpp` (line 518 that morning; `DynamicDriver.cpp` now).
`ctrl12_williams_otto` and both `unsteady/` cases declared no controllers and
ran.  The capability existed; the NAME hid it: a student looking for the
transient simulation of a process reads `Ctrl` and walks past.

So this slice is a NAME and an EXTRACTION, not new physics.  What it
deliberately does not build is the feed & bleed around a STEADY unit (an ED
stack, a membrane module), which needs the quasi-steady seam — task #185, a
separate slice.

## 3. The extraction, and its evidence

`src/applications/choupoCtrl/main.cpp` was a thin orchestrator in name only:
1776 lines holding the `0/` seeding (`seedDynamicUnitsFrom0`), the unit
construction, the router, both time loops (fixed RK4 and adaptive
Rosenbrock between samples), the accepted-step balance ledger, the trajectory
and instant writers, the RTD and frequency-response accumulators, the caveat
block, the result emission and the outerDict functor.  Two binaries cannot
share that by copying it — two copies of a 1700-line time loop is the arity
sin at its largest.

**ONE home: `src/dynamicDriver/DynamicDriver.{H,cpp}`.**  The body of `main`
moved as one block.  The only edits are the string literals that named the
binary — `"choupoCtrl: …"` on every refusal, the banner suffix, the usage
text, the `application` default, the `"ctrl"` tag `SolutionWriter` stamps
on a real-time instant — each now a field of `DynamicDriverConfig`, and each
substitution asserted by the extraction script to hit exactly once.  The
driver holds no `if (binary == …)`: the config carries names and one policy
word (§4), never a switch on physics.  `choupoCtrl/main.cpp` is 78 lines: it
registers the `Controller` and `Signal` factories (the control layer, the one
thing that binary owns) and hands the config to `runDynamicDriver`.
`choupoSemiContinuous/main.cpp` registers nothing and hands its own config.

**Placed legally.**  The driver reads `outerDriver` (the campaign functor is
wrapped by `OuterDriver::New`), `unitOperations/dynamic`, `control`, `io`
and `result`, and nothing in the runtime reads it back; so it sits in band 1
of the layering beside `outerDriver` / `postProcessing` / `reporting`, added
to `check_layering`'s `BANDS` and to `module-boundaries.md` §1 in the
extraction commit itself — `check_layering: OK -- 73 subsystem edge(s)
measured across all 15 declared subsystems.`

**Byte-identity, measured rather than argued.**  Every case that declares
`application choupoCtrl;` — 19 under `tutorials/ctrl/` and 2 under
`tutorials/unsteady/`, **21 in all (the brief said 23; the tree says 21)** —
was run under the HEAD build and under the extracted build from the same
commit (same git hash in the banner), and `diff -r` over the two snapshot
trees finds nothing: stdout, stderr, exit code, `trajectory.csv`,
`balanceTrajectory.csv`/`.meta`, `reports/rtd/E.csv` and every real-time
instant directory.

| case | trajectory.csv | result JSON (stdout) |
|---|---|---|
| ctrl01_cstr_temp_control | identical | identical |
| ctrl02_disturbance_rejection | identical | identical |
| ctrl03_adaptive_disturbance | identical | identical |
| ctrl05_disturbance_transient | identical | identical |
| ctrl06_sine_disturbance | identical | identical |
| ctrl07_lhhw_inhibition | identical | identical |
| ctrl08_prbs_ident | identical | identical |
| ctrl09_stream_disturbance | identical | identical |
| ctrl10_brine_concentration | identical | identical |
| ctrl11_esterification_jacket | identical | identical |
| ctrl12_williams_otto | identical | identical |
| ctrl13_williams_otto_step | identical | identical |
| ctrl14_williams_otto_pi | identical | identical |
| ctrl16_williams_otto_optimal | none written (outerDict) under either build | identical |
| ctrl17_signal_shapes | identical | identical |
| ctrl17_step_reaction_curve | identical | identical |
| ctrl18_rtd_pulse_cstr | identical | identical |
| ctrl19_freq_response_cstr | identical | identical |
| ctrl20_bode_cstr | none written (outerDict) under either build | identical |
| unsteady01_startup_transient | identical | identical |
| unsteady02_tanks_in_series | identical | identical |

Then the two `unsteady/` cases were re-pointed to
`application choupoSemiContinuous;` and run under the NEW binary: their
`trajectory.csv`, `balanceTrajectory.csv` and result JSON are byte-identical
to the post-extraction snapshot, and both goldens pass untouched
(`PASS 2 / FAIL 0`).  Same code path, same numbers — which is what a name
change must cost.

## 4. The class boundary: refused one way, announced the other

A `controllers (...)` block in `flowsheetDict` is what separates the two
classes that run one driver, and the driver never silently runs the other
class's case.  The policy is a word in `DynamicDriverConfig::ControlLoop`
(`refused` | `optionalAnnounced`), declared by each application's `main`.

`choupoSemiContinuous` on a case with a `controllers` block (a copy of
`ctrl01`), verbatim, exit 2:

```
ERROR: choupoSemiContinuous: this case declares a control loop (a `controllers` block in system/flowsheetDict); that is choupoCtrl's class -- set `application choupoCtrl;` in system/controlDict, or remove the block to simulate the process open-loop here.
```

`choupoCtrl` on `ctrl12_williams_otto` (no controllers), verbatim, at
verbosity ≥ 1, the run continuing to exit 0:

```
[class] no controllers declared: an open-loop transient; the binary for a process without a control loop is choupoSemiContinuous (set `application choupoSemiContinuous;` in system/controlDict).  This run continues unchanged.
```

**Why the asymmetry.**  A loop under the loopless binary is a category
error: the binary has no `Controller` factory and the case would be
integrated with its declared loop silently dropped, which is exactly the
silence this project forbids.  A loopless case under the loop binary is
merely the wrong door — the integration is identical — and `ctrl12` is the
open-loop plant of a reference battery (ctrl12/13/14/16) that stays in
`ctrl/` because a case stays with the battery it anchors; refusing it would
evict a reference anchor to enforce a filing rule.  Announced, never refused,
and never silent.

`unsteady02` under the new binary prints no `[class]` line: the announcement
belongs to the binary that could have been the wrong one.

## 5. Every place that enumerated the binaries — touched, or left with a reason

Measured with `git grep`, not remembered.  Touched: `Makefile` (SEMI_OBJS,
BINARY_SEMI, SYMLINK_SEMI, `all`, `clean`, `print`, the header comment),
`make/wasm.mk` (the fifth grouped target `createChoupoSemiContinuous`, the
`WASM_ALL_OUT` set, the comments — **emscripten is not on this box, so
`make wasm` was not run**; the rule follows the four existing ones to the
letter and `check_wasm_dialect` holds the C++), `.gitignore`, `bin/runCase`
(dispatch table + header), `bin/newCase` and `bin/cleanCase` (comments),
`bin/curate/check_build_fresh.py` (ARTEFACTS), `check_caveat_surface.py`
(BINARIES, and arm (d) now follows a main into the driver it includes),
`check_doc_references.py` (BARE_ROOTS), `release_inventory.py` (`engines 5`,
`generated/releaseInventory.json` regenerated), `migrate_thermoPhysProp.py`,
`gen_tutorials_guide.py` (the category title), `src/core/Banner.H`
(comment), the GUI (`WasmAdapter.ts` union + `selectBinary`,
`solverWorker.js` factory map, `engineSeries.ts` / `methodRun.ts` unions,
`workspaces.ts` lineup, `CaseIntro.tsx` label, `tutorials.ts` — see §6 —,
`driveApp.mjs` asset list, the user-visible hints in `PlotsWorkspace.tsx`),
`README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/ai/` (overview, case-layout,
start-here, thermo, unit-ops, dict-syntax, energy, gui-credo),
`docs/engine-capabilities.md`, `docs/gui-internals.md`,
`docs/architecture/CHOUPO-CONSTITUTION.md` §5 (count and list only, citing
the ruling), `module-boundaries.md` §1, the user, developer, theory and
tutorials guides (+ their PDFs), `tutorials/WITNESSES`
(`semiContinuousTransient`), and the two `unsteady/` controlDicts.

Left alone, each with its reason: `paper/paper.tex` (describes the published
release); `docs/architecture/archive/*` and every existing `docs/design/*`
record (history); `README.md`'s Roadmap paragraph "**Choupo-2608.** Four
binaries…" (it describes the maintained release as shipped, which is true);
`bin/runTests` (dispatches by the `application` word and enumerates no
binary — the only `choupoCtrl` mentions are comments about specific cases);
`bin/listCases` (already reads `application` from each case since the
taxonomy commit, and shows `choupoSemiContinuous` beside both unsteady
cases); `bin/buildCode` (per-case code is a choupoSolve/choupoProps feature);
`gui/src/ui/MenuBar.tsx` and `ControlWorkspace.tsx` (`hasPid` is keyed on
`choupoCtrl`, and a semiContinuous case can never carry a PID — the binary
refuses one); the lesson prose in `bodeLesson.ts`, `vanHeerdenLesson.ts`,
`reactionCurve.schema.json` (they describe choupoCtrl experiments, truly);
`docs/tutorials-catalogue.md` (it does not list either `unsteady/` case at
all — a gap that predates this slice, from the rename, named here rather
than filled in passing); `generated/gateManifest.json` (regenerated, never
edited).

## 6. Two GUI defects the class exposed, fixed at the root

**The workspace lineup was keyed on the application word** —
`workspaces.ts` handed the TIME set to `choupoBatch` and `choupoCtrl` and
let everything else fall through to the steady set.  A
`choupoSemiContinuous` case would have shown Streams, Variables and Pinch,
each a lit-but-dead button (gui-credo §2.5).  It now gets the time set
without Control (no PID can be declared: the binary refuses one), asserted
by a test that also holds the negative.

**The tutorial index derived each case's binary FROM ITS FOLDER**
(`batch` → choupoBatch, `ctrl` → choupoCtrl, `props` → choupoProps, else
choupoSolve).  Under the taxonomy ruling that is the restatement that went
false: `unsteady/*` read as choupoSolve, and the two `choupoProps` cases
inside `steady/` always had.  Measured, the value only reached the
"run it from a terminal" hint of the browser-unsupported message (the run
dispatch already read `controlDict.application`), which is why nothing
visibly broke — a wrong fact that happened to be unread.  One home now:
`applicationOf(controlDictText)`, the same
`^\s*application\s+(\w+)` regex `bin/runTests` and `bin/runCase` use,
`choupoSolve` only when the key is absent; every `TutorialEntry` (drilled
sub-nodes included) carries `application`, and
`tests/tutorialsApplication.test.ts` asserts an `unsteady/` case indexes as
`choupoSemiContinuous` and a `steady/` props case as `choupoProps`.  The
Open-Case group labels stopped naming a binary per folder for the same
reason.

## 7. Rejected alternatives

* **A `--no-control` flag on `choupoCtrl`.**  A flag is not a class a
  student can name, and the ruling is about the name: `listCases` prints the
  application word beside each case, and `runCase` dispatches on it.
* **Renaming `choupoCtrl` to cover both.**  Control is a distinct discipline
  by ruling; folding the two would un-name the one the course is about.
* **A runtime `if (binary == …)` inside the driver.**  The config carries
  names and one policy word; the physics is one function.  A branch on the
  binary name inside the loop would be the second home the extraction
  exists to remove.
* **Refusing a loopless case under `choupoCtrl`.**  See §4: it would evict
  `ctrl12` from the battery it anchors to enforce a filing rule.
* **Silence in either direction.**  Not considered; the constitution forbids
  it.

## 8. Not done, said plainly

* **The quasi-steady seam (#185).**  A feed & bleed around a STEADY unit —
  an ED stack, a spiral-wound module — needs a unit that is solved to steady
  state inside each accepted step of a dynamic vessel.  Nothing here starts
  it.
* **The `0/` layout (#186).**  The new binary INHERITS the OLD dynamic shape,
  `0/internalState` + `0/streamFaces`, exactly as choupoCtrl reads it
  (`seedDynamicUnitsFrom0`, unchanged).  Migrating it to the 2026-09-06
  `<view>/internalStates/<SECTOR>/<unit>` shape is a separate decision.
* **The WASM bundle.**  `make/wasm.mk` carries the fifth target and the
  worker its factory name, but no emscripten is installed here, so the
  first `make wasm-gui` on a machine that has it is where the bundle is
  proved.
* **The semiContinuous GUI surfaces** (a time scrubber on the canvas, the
  routing-delay badge on routed edges) — a separate GUI slice after #185.
* **`docs/tutorials-catalogue.md`** does not list the two `unsteady/` cases.

## 9. Gates

`check_layering` (the new band), `check_caveat_surface` (arm (d) follows
the driver; five binaries), `check_build_fresh` (five artefacts),
`check_witness_tier` (the `semiContinuousTransient` line), `check_wasm_dialect`
(the driver as a translation unit), `check_decision_index` (this row and the
two counts), `check_doc_references` (the new bare root),
`release_inventory --check` (`engines 5`), `gen_tutorials_guide --check`,
`check_guide_pdf_fresh` (four guides re-rendered), the GUI's
`tutorialsApplication`, `workspaceKinds` and `dynamicInstants` tests.  No
new gate: the class is held by the gates that already enumerate binaries,
each of which had to learn the fifth word — which is the check that they
enumerate at all.
