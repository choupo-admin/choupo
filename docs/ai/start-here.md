# Start here — run and understand one Choupo case

## For a student with a browser and an AI assistant

You need no checkout.  Run cases in the app at https://www.choupo.org/app.  To
have your assistant (ChatGPT, Claude, ...) write a case, copy the three short
prompts from https://www.choupo.org/llm/prompts.md (also on the home page,
under "Work with your AI assistant", and in the app's Help menu): the first
makes it read Choupo's own instructions before anything else.  The hosted app
does not take pasted files: save each `=== FILE: <path> ===` block of its
answer into a case folder, or ask for a .zip, and open it with File, Open Case
folder or Open Case from .zip.  The rest of this file assumes a checkout.

## For an AI assistant: route the task, then stop reading this file

Read ONLY the one document your task needs.  `docs/ai/<path>` is served at
`https://www.choupo.org/llm/<path>` (packs keep their `packs/` folder).

| The student asks | Read |
|---|---|
| "does Choupo do X?" | `capabilities.md` |
| design a process, write a case | `brief.md` (all of it), then only the packs it names |
| a tablet plant for their own drug and dose | `brief.md`, then `docs/ai/packs/pharmaceutical.md` |
| change an existing case (feedback, a new number) | `brief.md`, its section 10 |
| how to run a case, what the files are | the rest of this file |

A tutorial is a worked check, never a template: derive the case from the
contract and the grammar, compare it with the nearest tutorial afterwards and
say where they differ.  Never invent a key, a unit type, a component name or a parameter value: if the
documents do not give it, say "Choupo does not provide it" and ask.  The rest
of this file is for the student.

This is the shortest reliable path from a fresh checkout to an understood
simulation.  It teaches the current case contract; the other files in this
directory are references to consult as needed.

## 1. Run the first case

From the repository root:

```sh
bin/runCase tutorials/steady/flash/adiabaticFlash01_benzene_toluene
```

`runCase` reads `controlDict.application` and dispatches to the right
binary.  The binaries also run DIRECTLY -- `choupoSolve <caseDir>` (or from
inside the case dir, `choupoSolve .`), same for `choupoProps` / `choupoBatch`
/ `choupoSemiContinuous` / `choupoCtrl`; set `CHOUPO_HOME=<repo root>` when running from a directory
that cannot see `data/` (deeper than three levels).  An UNSEALED case (no
`constant/propertyManifest`) is perfectly fine for local work: component and
parameter names resolve from the installation catalogue.  Sealing
(`bin/choupo-import`) is for shipping a self-contained case.

Or start the browser application with `bin/runGui`, then choose **Your first
flash (adiabatic)**.  Read `Streams` before opening the detailed `Log`.

## 2. Know the files that carry the problem

The first flash has this essential shape:

```
adiabaticFlash01_benzene_toluene/
├── adiabaticFlash01_benzene_toluene.cho
├── system/
│   ├── controlDict       selects choupoSolve and reporting
│   └── flowsheetDict     topology and unit operation settings
├── constant/
│   ├── thermoPhysPropDict   the thermophysical system (components + models)
│   ├── propertyManifest     sealed record registry (written by bin/choupo-import)
│   └── components/          the case's own property records, one .dat per component
└── 0/
    ├── feed              authored inlet state
    ├── liquid            complete initial state for this graph stream
    └── vapor             complete initial state for this graph stream
```

There are three governing rules:

1. `flowsheetDict` contains **topology**, never stream values.
2. Every graph stream has exactly one complete state file under `0/`.
3. The case is **self-contained**: `constant/components/` carries every
   property record the run needs, and `constant/propertyManifest` seals the
   set (the runtime never falls back to the installation catalogue in a
   sealed case).  `constant/thermoPhysPropDict` declares the thermophysical
   system — components and the model selection — with
   `recordType thermophysicalPropertySystem;`.

The `.cho` file is the GUI's openable marker; it may be empty or carry GUI
layout metadata (node positions).  The solver never reads it.

The solver writes the steady solution to `converged/`.  Do not edit
`converged/` to change the next run; edit the authored inputs in `0/`.

## 3. Read the input stream

`0/feed` uses explicit component flows and named units:

```
componentMolarFlows
{
    benzene    40 kmol/h;
    toluene    60 kmol/h;
}
T    380 K;
P    3 bar;
```

Named units are recommended everywhere.  Bare numbers are raw SI and are
harder to review.

## 4. Read results in this order

1. **Flowsheet** — process structure and phase/flow changes.
2. **Streams** — feed/product table and global mass and energy closure.
3. **Reports** — utilities, balances, and equipment summaries.
4. **Log** — model choices, equations, iterations, warnings, and diagnostics.
5. **Case** — the exact dictionaries that produced the result.

For an adiabatic, non-reacting flash, both the material balance and the full
first-law balance must close.  A visible non-zero energy residual is a problem
to investigate, not an expected utility duty.

## 5. Make one controlled change

Copy the tutorial to your own case directory, change the outlet pressure in
`system/flowsheetDict`, and run it again.  Compare outlet temperature, vapour
fraction, and energy closure.  The dictionaries remain the source of truth.

## 6. Pull only the reference you need

- Case files and `0/`: [`case-layout.md`](case-layout.md)
- Dictionary grammar and units: [`dict-syntax.md`](dict-syntax.md)
- Property models: [`thermo.md`](thermo.md)
- Unit operation fields: [`unit-ops.md`](unit-ops.md)
- Bringing MEASURED data in, and finding out WHICH declaration is wrong:
  [`validating-against-data.md`](validating-against-data.md) -- read this before
  answering "is this model good enough?", and before reaching for a better
  component record
- Recycle, sweeps, batch, and fitting: [`patterns.md`](patterns.md)
- Failure modes: [`pitfalls.md`](pitfalls.md)

When a required component property is absent, stop and follow
[`curation-protocol.md`](curation-protocol.md).  Do not invent a number to make
the case run.
