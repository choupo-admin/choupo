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

## 7. What is deliberately not done

* No fine-tuning, no embeddings, no retrieval server: the site serves static
  files and the student's own assistant reads them.
* No second grammar for LLMs: the kernel teaches the engine's one grammar.
* The developer documents (`CLAUDE.md`, `DEV.md`, `docs/design/`) are not
  part of what a student's assistant reads, and are not rewritten for it.
