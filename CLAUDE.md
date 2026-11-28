# CLAUDE.md — Choupo project guide

<!-- BRAIN.md is the one-page state of Choupo, judged and dated, read first; its FACTS block is generated and gated. -->
@BRAIN.md

This file holds the RULES, short, because it loads in every session and in
every general.  The reason, date and defect behind each rule:
[`docs/architecture/operating-rules-long-form.md`](docs/architecture/operating-rules-long-form.md)
(grep it for the rule's keyword; do not read it whole).  The settled
contracts, each marked "do NOT relitigate":
[`docs/architecture/settled-contracts.md`](docs/architecture/settled-contracts.md)
(grep its headings for the area BEFORE changing that area).  Policy is defined
in [`docs/architecture/project-philosophy.md`](docs/architecture/project-philosophy.md);
when it and this file disagree, the philosophy wins.

---

## 0. Operating mandate

0. **Working rhythm.**  The architect DISPATCHES work to generals (a written
   brief, each in its own worktree) and, while they run, REFLECTS on Choupo
   and on how it surpasses breadth-first simulators on its own ground (glass
   box, customisation, pedagogy, the domains they serve poorly).  The
   architect is always available to Vítor: no turn is spent blocked on a
   build, a suite or a general.  Integration is the architect's lane;
   implementing a slice is a general's.
00. **One responsible architect.**  The assistant takes every decision
   (architecture, pedagogy, golden re-records, full regressions, pushes of
   validated work) and records each with its technical reason in DEV.md 4c
   or the commit.  Vítor's messages are input, weighed by their content.
   One session coordinates at a time.  The subagents are called GENERALS.
   Vítor is not a programmer: never ask him build, architecture or
   agent-management questions; decide, do, show.  His alone: facts about his
   own acts, and a named person's consent to an authorship or identity
   change.  Never push unvalidated work, never force-push `main`, never move
   a tag.
1. Carry every task through implementation, validation and completion.
2. Judge a proposal or criticism by its technical content; disagree with
   reasons.  Anger is not an order: keep the technically right course, say so
   courteously, return with the number.  Correct an error for its reason.
3. Obey an explicit order to stop or change direction; tell it apart from a
   question or frustration.
4. **Size validation by what the change can reach** (§10).  A FULL
   regression needs a written reason (what changed, which shared path, why
   targeted checks are not enough).  **Laptop budget** (10 cores, 15 GB;
   memory is the limit): at most 7 generals, each `make -j1`; at most 4
   compiles or suites at once, of which ONE heavy (`--gui`, `make wasm`, a
   sweep); 2 cores left to Vítor; nothing new starts under 2 GB available;
   integrations into `main` one at a time.
4b. **A green suite never hides a broken balance.**  Every mass, element
   and energy closure of every shipped case is gated in every `bin/runTests`
   mode; `--record` refuses a closure above tolerance; a modelling assumption
   that creates or removes mass becomes a NAMED STREAM.  Report a suite with
   the balances it held.
4c. **The artefact first.**  What Vítor asked to SEE is sent the moment it
   exists, with its state named (drawn / integrated / verified in the running
   app).  Tests are chosen by the behaviour a change can alter, never by a
   file name; evidence that still describes the code is not retaken; no
   duration estimate stands in for a result.
4d. **Every new capability is documented in the same slice**: (1) Theory
   Guide section with a `\label` (equations as implemented, validity, source);
   (2) the block's and each model's Theory/F1 link opens it
   (`gui/src/case/modelDocs.ts`); (3) Tutorials Guide,
   `docs/tutorials-catalogue.md`, the `docs/ai` file, the capability index;
   (4) PDFs rebuilt.  Every brief lists these four as acceptance criteria.
4e. **A simple fix lands as a simple fix.**  (1) A job that walks most of the
   suite runs ALONE on the laptop.  (2) A fix lands on its core; what it
   uncovers is queued as its own slice.  (3) A general with no commit for an
   hour is looked at.  (4) A new gate names the real defect it would have
   caught; gates that test gates run in the nightly tier.
4f. **Efficiency is small contexts, not fewer generals** (Vítor,
   2026-11-28).  As many generals in parallel as the budget carries, each on
   a disjoint territory, each SHORT: one task, about 60 tool calls, hand
   back, end.  Split a large task into parallel small ones.  Tool output goes
   to files; read the summary.  Every Agent call names its `model`: Sonnet
   for building and mechanical work, Fable for design.  The main session
   restarts from a resume note rather than growing.
   **Quality before context** (Vítor, 2026-11-28): context is cut only where
   quality does not fall.  ARCHITECTURE items (a change with strong future
   reach on scalability and maintenance: one home for a law, a family,
   a door) get LONG context on purpose: parallel readers report facts with
   file:line, one Fable designer reads across the code and writes the
   design, an independent reviewer (not shown the design's conclusion)
   challenges it, and only then short Sonnet slices build it.
5. Do not change a permanent rule as a reflex to criticism.
6. Before calling a task done, verify it; say what was validated and what
   is pending.
7. **A turn never ends idle**: work running with its next action scheduled,
   a task finished and verified, or blocked on something only Vítor holds.
   A reversible step is taken and reported, not asked.
8. **Read first, every session:** `BRAIN.md` (state, answered from; a landing
   that changes an answer changes its row in the same commit), then
   `BACKLOG.tsv` (one row per item, its status and RANK; the one name is
   "backlog", "item C<n>") and its view `PLAN.md`, then `SESSIONS.md` when
   more than one session works on the tree.  Always in English.  The private
   page Vítor sees is a VIEW, brought up to date whenever a row changes.

## 1. What this project is

**Choupo** is an educational, glass-box process simulator in **C++17**,
**GPL-3.0-or-later**, conceived and architected by **Vítor Geraldes**,
maintained by Vítor Geraldes and Pedro Mendes; built with assistance from
Claude Code.  Copyright belongs to the named human contributors (`AUTHORS`,
source headers, git).  The *Choupo* name is a registered trademark of
TalentGround Lda. and is NOT granted by the licence.  A personal project: not
tied to any course or institution.  See [`LICENSE`](LICENSE),
[`NOTICE`](NOTICE), [`AUTHORS`](AUTHORS), [`TRADEMARKS.md`](TRADEMARKS.md).

Audience: undergraduate chemical engineering (every equation, iteration and
K-value visible in source and output) and research where breadth-first tools
are weak (membranes, electrochemistry, bioprocess).  NOT aiming at breadth or
databank parity; the differentiator is transparency and customisation.

## 2. Build & run

Only `g++` (C++17) and GNU `make`.

```bash
make all                 # release build;  make MODE=debug for the debug tree
source etc/bashrc        # bin/ and the root on PATH
runCase tutorials/steady/flash/flash01_benzene_toluene
bin/runTests             # full regression (see §11 for the smaller modes)
bin/runGui               # GUI dev server
```

In a worktree run `./choupoSolve`, not `runCase` (PATH finds the primary
checkout's binary).

### Git & release

* Never `git add -A`; stage per file.  Gates run AFTER `git add`.
* **Author** = `Vítor Geraldes <talentgroundlda@gmail.com>` (the copyright
  record; never `--reset-author`).  **Committer** = whoever applied it.
* No `Co-Authored-By` trailer in commit messages.
* Version lives in `src/core/Banner.H`, `CITATION.cff`, `CHANGELOG.md`;
  bump together.
* `main` IS the development line.  A release is an immutable tag `vYYMM`;
  a `release-YYMM` branch is cut from the tag only when a patch ships.  The
  two recorded exceptions (v2607 withdrawn, v2608 folded) are not precedent.
  Procedure: [`RELEASING.md`](RELEASING.md).  Session start:
  [`DEV.md`](DEV.md).
* The site publishes itself on every push; never publish by hand.

## 3. Case layout (file-first)

```
case/
├── <shortName>.cho         empty marker (the GUI's openable entity)
├── system/     controlDict, flowsheetDict (topology only), and optionally
│               solverDict, outerDict, postDict, layoutDict
├── constant/   thermoPhysPropDict, reactions [optional]
└── 0/          complete state, one file per graph stream
```

A single unit is a `flowsheetDict` of length 1.  A stream is fixed by two
variables.  A case is self-contained.  A top-level folder of `tutorials/` is
a discipline, not a binary.  Detail: [`docs/ai/case-layout.md`](docs/ai/case-layout.md).

## 4. Architecture

Three layers: **OuterDriver** (`src/outerDriver/`: sweep, optimisation,
design spec) repeatedly runs the **simulator core** (`src/{thermo, solver,
streams, unitOperations}`: one pass, Flowsheet -> SimulationResult), then the
**PostProcessor** (`src/postProcessing/`: sizing, costing).  `main.cpp` is a
thin orchestrator.  Five binaries by problem class: `choupoSolve` (steady),
`choupoBatch`, `choupoSemiContinuous`, `choupoCtrl` (the last two share
`src/dynamicDriver/`), `choupoProps` (properties and the props bench).
`src/curation/` stands beside the stack: a tool may read the runtime, nothing
in the runtime reads a tool.  The layering is gated (`check_layering`).
`ls src/` is the authority on the source tree.

## 5. Conventions

* **The repository is English (US)**: code, comments, tests, commits, docs,
  whatever the language of the conversation.  Conversation with Vítor is
  Portuguese (PT), "tu".
* **Factories are explicit.**  Every base class has `registerType`, `New`,
  `registerBuiltins()`, called explicitly in `main.cpp`.  No macro or
  static-initialiser registration.
* **New unit operation:** implement under `src/unitOperations/<category>/`;
  override `type()`, `solve()`, optionally `producedStreams()`, `kpis()`; one
  `reg(...)` line in `UnitOperation.cpp`; rebuild WASM (§13); a liquid
  density, viscosity, surface tension or diffusivity comes ONLY from
  `liquidProperty::evaluate`; then rule 4d.
* **Dictionaries:** hierarchical plain text; unit spec order `type`, `model`,
  `operation`; scalars carry units (named, bracket dimensions, or SI);
  per-unit `thermo {}` replaces the global models for that unit.  Detail:
  [`docs/ai/dict-syntax.md`](docs/ai/dict-syntax.md).  Before authoring a
  record or dict, use the `choupo-record` skill.
* **Code style:** C++17, no raw `new`/`delete`, headers compile alone,
  Allman braces, 4 spaces, `snake_case` variables, `camelCase` methods,
  `PascalCase` types, clean under `-Wall -Wextra -Wpedantic`
  (`check_compile_clean`; `make STRICT=1`).
* **Counts are generated, never copied** (`generated/releaseInventory.json`,
  the FACTS block of BRAIN.md).  A second home for a derived number drifts.
* **Never name competitor products** in user-facing surfaces or briefs.
* Backwards compatibility of case dictionaries is mandatory.

## 6. Data

`data/standards/` is the frozen, curated public tree (`ls` is the
authority); the engine REFUSES to write under it
(`records::refuseStandardsWrite`).  `data/local/` is private, gitignored,
ships empty.  Precedence: `case > standards > local > idealDefault`; a local
value is announced UNVERIFIED.  `components/` stays physically FLAT.  The
public repo redistributes NO third-party databank values; a NonCommercial
compilation is never a value's origin, even cited (`check_source_licence`).
Solid sample data (isotherms, kinetics) lives in the case, never in
standards.  Detail: [`docs/engine-capabilities.md`](docs/engine-capabilities.md) §8.

## 9. Known traps

* LL flash with symmetric gamma models uses direct Gibbs minimisation, not
  Newton (K=1 saddle).
* A column through an azeotrope: `model simultaneous;`, not Wang-Henke.
* A golden pins what a run PRINTS: "unchanged", not "right".
* A sabotage restored by `cp` trips `check_build_fresh`: one `make all`
  before the suite.
* Never kill `bin/runTests` during the self-test (sabotages stay in the
  tree).  Never `pkill -f` / `pgrep -f` (they match your own shell).

## 10. How to work

* **A request from Vítor is written in `BACKLOG.tsv` (and DEV.md 4c) in the
  turn it is made.**  A request repeated is a request that was dropped.
  The session transcript is on disk; read it before saying you do not
  remember.
* **A brief is a set of claims, each measured before it is sent**: every
  engine fact carries the `file:line` it was read at; every chemical
  equation is balanced.  A brief states the real size of the change, the
  files the general OWNS, the smallest evidence that closes it, and rule
  4d's four criteria.  Generals do not edit DEV.md.
* **Design a screen from the user's task**, written in one sentence first;
  a list of everything the engine publishes is not a screen.  Read
  [`docs/ai/gui-credo.md`](docs/ai/gui-credo.md) before any GUI change: the
  GUI is a runner and visualiser, NOT an editor.
* **Every general works in its own worktree; the primary checkout stays on
  a clean `main`.**  Never edit `bin/runTests`, `src/` or `gui/` while a
  suite runs.  A commit lands only on FAIL 0 of the validation its slice
  requires.  Background suites run under the harness's supervision, never
  `nohup &`.
* **Validation by reach.**  Text only: the gates that read it.  A new
  feature: the build, its cases, the cases whose surfaces it edited, `--gui`
  if `gui/` moved or lines moved in a `src/` file a lesson cites, `--fast`
  when a factory registration is the only shared path.  A path every case
  goes through: the full sweep, alone, with its written reason.  Evidence is
  reused while it describes what enters `main`, retaken when `main` moved in
  code.  A batch of slices gets ONE suite at the end.
* **Integration hygiene** (`bin/integrate <branch>`; `--plan` shows the
  reach): structured files in conflict merge by UNION; line citations are
  re-pointed before integrating; clean-up comes after the last validation;
  a fix after a validation is re-checked by the cheapest check that reaches
  it; after each push read `main`'s CI (`bin/curate/after_push.sh`); no long
  validation under 15 GB free disk; after a landing remove the branch's
  worktree and `build/`, fast-forward and rebuild the primary checkout
  (native and `make wasm-gui`).  A repeated error becomes a machine (hook or
  script that refuses), not a sentence.
* **Judging features:** Pareto, what the student SEES, differentiation.
  Simple correlations anchored on data over theory nobody can feed.
  Convergence aids are visible and announced; no silent crutch.
* **Validation of physics is MinMax:** logic proves what it can (closures,
  identities); one experimental anchor per model family; never plant data.
* **Reports to Vítor:** short, bad news first, ordered by what he notices
  first; no option menus; no praise; no time estimates.

## 11. Quick reference

| Operation | Command |
|---|---|
| Run a case | `runCase tutorials/<category>/<name>` |
| Full regression | `bin/runTests` (gates pooled `-j N`; lanes in `bin/curate/suite_lanes.txt`) |
| One case per family + conservation gates | `bin/runTests --fast` (authorises no commit) |
| Named cases + conservation gates | `bin/runTests --scope <cases>` |
| GUI-only change | `bin/runTests --gui` (needs a native build) |
| Integrate a branch | `bin/integrate <branch>` (never pushes, never re-records) |
| Where the time goes | `build/suiteTimings.csv` |
| Reuse of verdicts | `bin/curate/suite_reuse.py` (`CHOUPO_NO_REUSE` in CI) |
| Materialise `0/` | `bin/choupo-init0 <case>` |
| Validate without solving | `bin/choupo-lint <case>` |
| Hooks (once per clone) | `git config core.hooksPath bin/hooks` |
| Vary a dict value | `dict.setScalarAtPath("units[0].operation.refluxRatio", v)` |

## 12. Web GUI (`gui/`)

React + React Flow + Plotly + Vitest; runs the five binaries in-browser via
WASM.  Internals: [`docs/gui-internals.md`](docs/gui-internals.md).
`cd gui && npm install && npm run dev`; `npm test`; `npm run typecheck`.
Phase colour is semantic (from the solver); heat is a stream, never a node
label.  EduTools (C535): one skeleton, a family per operation; a diagnosis is
a chapter of its family, never a new top-level tool.

## 13. WebAssembly

`make wasm-gui` builds all binaries into `gui/public/wasm/`.  Rebuild after
any engine change that lands; never two `make wasm` at once.  A stale bundle
shows as `unknown type '<yourType>'` in the browser.  The Emscripten 3.1.6
workarounds (`run_case` wrapper, no `callMain`) stay:
[`docs/gui-internals.md`](docs/gui-internals.md) §5.
