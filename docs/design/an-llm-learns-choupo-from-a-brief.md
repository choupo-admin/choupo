# An LLM learns Choupo from a brief, and designs before it copies

Status: ARCHITECTURE DECIDED 2026-11-01 (DEV.md 4c C200, the architect's
decision under rule 00).  Phases A-E below; each lands with its own measurement.

## 1. The task, in one sentence

A student opens ChatGPT, Claude.ai or any other assistant, gives it Choupo's
brief and a design problem, and gets back a case that opens in the browser
application at choupo.org, runs, and is the student's OWN design -- not a
tutorial with the numbers changed.

Everything below is judged against that sentence.  A document an LLM reads is
an interface, and its users are a model with a context budget and a student
who must defend the result.

## 2. What was measured before deciding (2026-11-01)

* `docs/ai/` is 20 files and about 887 kB.  The largest are `unit-ops.md`
  (193 kB), `schemas-reference.md` (157 kB) and `case-layout.md` (112 kB).
* `bin/llmctx --core` is about 245 kB, roughly 60 k tokens -- more than a free
  ChatGPT window holds once a conversation and a case are added, and most of it
  is reference the model reads end to end instead of looking up.
* The GUI's clipboard bridge (`gui/src/agent/authoringGuide.ts`) concatenates
  nine of those files (over 500 kB) under a comment that says "~97 KB".  The
  comment is a size claim with a second home, and it is wrong by a factor of five.
* The site serves NO document addressed to an LLM: a student whose assistant
  can browse has nothing at a known URL to read.
* The browser engine preloads `data/standards/` (the WASM package), so an
  UNSEALED case -- component names resolved from the installation catalogue --
  runs in the browser.  A student's case does not need `bin/choupo-import`.
* The browser application has NO way to materialise `0/`.  `choupoSolve
  -init0` exists only on the command line (`src/applications/choupoSolve/
  main.cpp`, the `-init0` flag), and the engine REFUSES a case whose `0/` lacks
  a graph stream.  So today an LLM must write a seed file for every
  intermediate stream, by hand, with numbers it has to invent -- the step where
  a model is most likely to be wrong and least able to check itself.

## 3. The failure this prevents

An assistant handed 245 kB of reference does what a hurried student does: it
finds the tutorial closest to the request and edits it.  The result runs and
is not a design -- the topology, the thermodynamic model and the
specifications were chosen by whoever wrote the tutorial, for a different
problem.  Vitor's requirement is the opposite order: DESIGN, then write.

## 4. The architecture

### 4.1 Three layers, read in this order

1. **The kernel** (`docs/ai/kernel.md`, at most 8 k tokens).  The whole
   contract of a case, the grammar, the unit catalogue as one line each, the
   design protocol, the return format and the index of packs.  An assistant
   that reads only this can author a simple steady case correctly.
2. **Task packs** (`docs/ai/packs/<topic>.md`, 3-6 k tokens each), read only
   when the design needs them: distillation and absorption, reactors and
   kinetics, recycles and tears, heat integration and utilities, electrolytes
   and aqueous chemistry, membranes, solids and drying, rotating equipment and
   hydraulics, sizing / costing / economics, outer drivers, batch and
   transient, properties bench.  Each pack states what the unit DECLARES,
   what it RETURNS, its degrees of freedom, its refusals and one minimal
   example written for the pack (never a tutorial copy).
3. **The reference** (generated, never hand-kept): the component list, the
   unit keys, the schemas.  Looked up, never read end to end.  Its size claims
   are printed by the tool that builds it.

The existing `docs/ai/*.md` files remain the long-form reference.  The kernel
and the packs are not summaries of them; they are written for a different
reader, and each fact in them carries its source (`file:line` in a comment
block the model may skip) so a gate can hold it to the engine.

### 4.2 The design protocol is mandatory and comes first

The kernel requires the assistant's reply to begin with `DESIGN.md`, written
BEFORE any case file and before looking at any tutorial:

1. the goal and the product specification, with numbers;
2. the component list, each checked against the catalogue;
3. the thermodynamic model and the reason for it (ideal, activity model with
   which pairs, equation of state, electrolyte);
4. the topology: units in solve order, every stream with its role (inlet,
   intermediate, product, tear);
5. per unit: what is specified, what is computed, and the degree-of-freedom
   count that shows the unit is fully specified;
6. the expected results the student can check by hand (an order of magnitude
   for each key number), so a wrong answer is visible on the first run;
7. what the design deliberately leaves out.

Tutorials may be consulted AFTER the design, for grammar only, and the
assistant must say which one it read and why.  `DESIGN.md` travels inside the
case (it is a file of the case like any other); the GUI shows it.

### 4.3 The transport

* **choupo.org/llms.txt** (the convention assistants that browse look for)
  points to `/llm/kernel.md`, `/llm/packs/*.md` and the generated reference,
  published by the site build from `docs/ai/`.  A student whose assistant
  cannot browse pastes the kernel.
* **The clipboard bridge** sends the kernel plus the packs the request
  selects (a keyword map, shown to the student and editable), never the whole
  directory.
* **The reply format** stays `=== FILE: <path> ===` (the bridge already
  applies it).  The first file is `DESIGN.md`.  The student may also save the
  files as a `.zip` and use *Open Case from .zip...*, which already exists.
* **The browser materialises `0/`.**  The assistant writes `controlDict`,
  `flowsheetDict`, `thermoPhysPropDict`, `solverDict` when there is a recycle,
  the AUTHORED inlets and the tear seeds; the application runs the engine's
  own `-init0` (one home, the C++ that `bin/choupo-init0` wraps) and shows the
  student which files were generated and why.  An assistant no longer
  invents numbers for intermediate streams.

### 4.4 Style

Telegraphic, imperative, one fact per line; grammar shown, not described;
no history, no rulings, no "do not relitigate" -- those belong to
developers.  A kernel line that a gate cannot check against the engine
carries its `file:line`.

## 5. How it is judged: the evaluation harness

A document's quality is what a model DOES with it, so it is measured.

* Ten design problems written for the harness (not taken from tutorials),
  from a flash to a recycle with a reactor, an absorber, a column, an
  electrolyte step and a membrane stage.
* A proxy assistant (`claude -p`, a small model, so the cost of a run is
  small) receives the brief under test plus one problem and returns files in
  the reply format.
* Scored mechanically: `DESIGN.md` present and complete (the seven items);
  `choupo-lint` passes; the case solves; the mass, element and energy
  balances close; the case is not a near-copy of a tutorial (a similarity
  measure against the corpus); tokens read and written.
* Baseline: today's `llmctx --core` and today's bridge guide.  Every phase
  re-runs the harness and reports the same table; a phase that does not
  improve it is not finished.

### 5.1 Baseline (2026-11-01)

Tool: `bin/curate/llm_brief_eval.py` (stdlib Python; a tool, wired into no gate
because it calls a paid model).  Problems: `bin/curate/llm_eval/problems/p01..p10`.
Proxy: `claude -p --model haiku --tools "" --no-session-persistence
--system-prompt "<one line>" --output-format json` from a neutral directory
(the CLI adds about 11.3 k input tokens of its own, measured by a trivial call
and subtracted below).  Engine: the primary checkout's build, commit d102180c9;
one run per (brief, problem), 20 proxy calls, no retries needed.

```
python3 bin/curate/llm_brief_eval.py --out <scratch>/baseline          # both briefs, 10 problems
python3 bin/curate/llm_brief_eval.py --rescore --out <scratch>/baseline # re-score, no model call
```

Brief (a) `core` = `bin/llmctx --core` (505 kB); brief (b) `bridge` = the nine
files `gui/src/agent/authoringGuide.ts` concatenates, in its order (536 kB).

| brief | runs | DESIGN.md present | mean items /7 | lint ok | solves | balances ok | tokens in (net) | tokens out |
|---|---|---|---|---|---|---|---|---|
| core   | 10 | 10/10 | 4.1 | 7/10 | 7/10 | 6/10 | 2 340 292 | 119 215 |
| bridge | 10 | 10/10 | 3.9 | 0/10 | 0/10 | 0/10 | 2 582 583 | 106 598 |

Per problem (core): p02 ethanol/water flash, p04 recycle flash, p05 reactor +
flash, p06 column, p08 compressor train, p09 high-pressure gas, p10 brine flash
solve; p01 (component `pentane` does not exist: the catalogue name differs),
p03 (a malformed `Q` value) and p07 (absorber: the two product streams have no
`0/` file) fail lint.  Every `bridge` run fails at the same place: the `0/`
completeness check (a graph stream with no state file), because the bridge
guide omits `start-here` and `stream-state`, which `--core` carries.  Full
per-run table: the tool's `summary.md`.

Findings, each measured:

1. **Both briefs are about 200-280 k tokens, not 60 k.**  Section 2's "about
   245 kB" for `--core` is wrong by a factor of two (505 kB measured today);
   the CLI reports 205-254 k input tokens for `core` and 234-283 k for `bridge`
   (the same brief reads about 49 k higher from p05 on for `core` and from p03
   on for `bridge`; the CLI's accounting was not investigated).  Neither fits a 200 k window.  The proxy's window is
   1 M, so nothing was truncated; a student's assistant with 128-200 k could
   not take either.
2. **The bridge guide ships an unrunnable case 10 times out of 10**, and the
   comment in `authoringGuide.ts` still says "~97 KB" for 536 kB.
3. **Near-copy of the corpus**: the flowsheetDict is 0.52-0.93 similar to a
   tutorial's (mostly 0.7-0.9), the thermoPhysPropDict 0.92-1.00 (that file is
   short and largely boilerplate, so it is a weak signal alone). 
4. **DESIGN.md is present 20/20 but thin**: item 5 (degrees of freedom) is
   missing in 19/20, item 1 (goal with numbers) in 16/20, item 7 in 13/20.
   The detector is lenient keyword presence (documented in the script), so
   these are upper bounds.
5. A solved case is not a right one: core p10 (brine flash) solves with a
   -39.1 kW energy residual and the mass/element balances at 100 %; nothing
   here scores whether the numbers match the problem.  Hand-checkable values
   are the next refinement of the scorer.

## 6. Phases

* **A** -- the harness and the baseline (a general).
* **B** -- the kernel and the pack index (the architect writes the kernel;
  every engine fact measured); the bridge sends the kernel; the stale size
  comment goes.
* **B'** -- the browser materialises `0/` (a general: WASM `-init0`, the
  bridge runs it after applying a reply).
* **C** -- the packs, one general per family, each fact cited, each pack
  measured with the harness.
* **D** -- the generated reference and `llms.txt` on the site.
* **E** -- the harness again, the table published to Vitor.

### 5.2 The brief and the packs, measured (2026-11-02, phase E first run)

Same proxy (`claude -p --model haiku`, tools disabled), same ten problems,
ONE run per cell.  Two briefs: `brief` = `docs/ai/brief.md` alone (15 kB);
`briefpacks` = the brief plus the four packs that exist (recycles, pressure,
separations, reactors).  **The harness gained one step** (`init0`): the brief
tells the assistant to write only the authored inlets and tear seeds and the
student to run Complete 0/ (the app) or `bin/choupo-init0`, so each case is
completed with `choupoSolve -init0` (no `--force`) before lint and solve, and
that step's own exit code is reported.  Without it all 20 runs failed lint for
a step the brief delegates (measured on the first scoring), which is why the
same replies were re-scored with no new model call.

| brief | runs | DESIGN.md | mean items /7 | lint ok | solves | balances ok | tokens in (net, all 10) |
|---|---|---|---|---|---|---|---|
| `brief` | 10 | 10/10 | 6.9 | 8/10 | 6/10 | 5/10 | 67 888 |
| `briefpacks` | 10 | 10/10 | 6.8 | 10/10 | 10/10 | 9/10 | 331 228 |

Against the 2026-11-01 baseline (`--core`: 7 of 10 solve at 205-254 k input
tokens per run; the bridge guide: 0 of 10), the brief reads 6.8 k tokens per
run and the brief with packs 33 k, so **10 of 10 solving at 7-30 times less
input**.  What these numbers do NOT say: the baseline was scored on the bare
replies (no `init0`), so the comparison is indicative until the baseline is
re-scored in the same way; one run per cell on a small model is not a
distribution; the scoring is mechanical (a solved case is not a correct
design); the flowsheet similarity to a tutorial is 0.5-0.95 and highest where
a pack example is close to the problem (p06 0.91, p07 0.95), which is the pack
doing its job and also the thing to watch for copying.

What failed with the brief alone, each a lesson for the brief rather than the
assistant: p05, p06 (a case that completes and lints and does not solve:
read `solve.log` per case before changing anything); **p07** the absorber
needs a declared SOLVENT package (`diluteSolution`) that the brief does not
state (the pack for separations does, and p07 solves with it); **p09** a
component name that is not a catalogue file name (the proxy has no tools to
look names up; the brief says the names are exact, and 12 of them are
listed); **p10** (NaCl in water, which no pack covers) solves with mass and elements at
100 % in BOTH briefs and is not "balances ok" because the engine's own energy
balance REFUSES it: `NaCl` has no enthalpy datum in the form the default
energy report needs (`globalEnergyBoundary.csv`, status REFUSED, reason named).
That is the engine saying it cannot verify the first law there, so the strict
rule (energy must be verified) stands; the finding is for the curation of the
salt, not for the brief or the harness.

## 7. What is deliberately not done

* No fine-tuning, no embeddings, no retrieval server: the site serves static
  files and the student's own assistant reads them.
* No second grammar for LLMs: the kernel teaches the engine's one grammar.
* The developer documents (`CLAUDE.md`, `DEV.md`, `docs/design/`) are not
  part of what a student's assistant reads, and are not rewritten for it.
