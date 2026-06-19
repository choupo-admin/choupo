# Agent instructions for Choupo

This file is the entry-point for LLM / AI assistants that land in this
repository.  There are TWO audiences, with different docs.

## Are you helping a USER author a Choupo case?

(A student, an engineer, anyone composing a `flowsheetDict` /
`propsDict` for this simulator.)

→ Read **`docs/ai/`**.  Start with [`docs/ai/overview.md`](docs/ai/overview.md).
The eight files in that folder are designed to fit a single context
window together (~1500 lines total):

| File | Read when |
|---|---|
| `overview.md`     | First.  What Choupo is, the 4 binaries, the case layout. |
| `dict-syntax.md`  | Before writing any dict.  Dict syntax, units, `$variables`. |
| `case-layout.md`  | When organising the directory tree (`system/`, `constant/`, `.cho`). |
| `thermo.md`       | When composing a `thermoPackage` (components + γ-φ models). |
| `unit-ops.md`     | The catalogue.  Per unit op: required + optional fields, an example. |
| `components.md`   | The shipped component / material / membrane / Henry inventory. |
| `curation-protocol.md` | When a compound LACKS data a model needs.  Build the case WITH the student: read the gap report, advise, offer bounded choices, invoke deterministic estimators, NEVER invent numbers. |
| `patterns.md`     | Recipes (recycle, sweep, DesignSpec, FitParameters, batch recipe,...). |
| `pitfalls.md`     | Common mistakes -- read before answering a question that smells like one. |
| `gui-credo.md`    | Before proposing any GUI change.  Single source of truth for Choupo GUI design: identity, founding principles, deliberate adaptations vs ParaView, consolidated patterns, anti-patterns, vocabulary, roadmap.  Replaces the older `gui-mental-model.md`. |

For one-shot bundling (paste-into-fresh-Claude-or-ChatGPT) use
`bin/llmctx`:

```sh
bin/llmctx                # print all docs/ai/*.md to stdout in reading order
bin/llmctx > ctx.md       # save -> paste -> ask your question
```

## Are you editing the project's source code?

(Adding a unit op, refactoring, fixing a bug, writing a new tutorial,
working on the simulator itself.)

→ Read **`CLAUDE.md`** at the repo root.  That file documents the
architecture, conventions, version history (→), the
property axioms, the licensing position, the decisions already made
(do not relitigate), and the "things to never do".  Long but
authoritative.

`CLAUDE.md` is internal/developer-oriented; `docs/ai/` is
user-facing.  Don't confuse them.

## Quick orientation either way

- **Licence:** GPL-3.0-or-later (single permissive).  Copyright Vítor Geraldes.
- **Stack:** C++17 + GNU make for the engine; Vite + React + Mantine +
  Plotly + React Flow for the GUI; Emscripten for the WASM build.
  Zero external C++ deps (Newton / Gauss / RK4 / Nelder-Mead are
  hand-rolled).
- **4 binaries** (one per problem class):
  - `choupoSolve` -- steady-state simulation, `F(x) = 0`.
  - `choupoBatch` -- batch / time-dependent, recipe-driven.
  - `choupoCtrl`  -- dynamic continuous + control loops.
  - `choupoProps` -- property evaluations + LM regression.
- **Cases are plain-text dicts on disk**.  The GUI is a
  runner + visualiser, **not** a case editor (the LLM is the case
  authoring tool now -- this is the workflow Choupo is designed for).
- **Run a case from the CLI:**
  ```sh
./choupoSolve tutorials/steady/flash/flash01_benzene_toluene
  ```
- **Run a case in the GUI:** `cd gui && npm run dev`, open in browser,
  File → Open Tutorial.

When a user asks you to compose a case from scratch, walk them through
`dict-syntax.md` + `case-layout.md` first, then `unit-ops.md` /
`thermo.md` for the specific pieces.  Always cite the file you used.
