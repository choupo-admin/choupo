# Start here — run and understand one Choupo case

This is the shortest reliable path from a fresh checkout to an understood
simulation.  It teaches the current case contract; the other files in this
directory are references to consult as needed.

## 1. Run the first case

From the repository root:

```sh
bin/runCase tutorials/steady/flash/adiabaticFlash01_benzene_toluene
```

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
│   └── propertyDict      components and property models
└── 0/
    ├── feed              authored inlet state
    ├── liquid            complete initial state for this graph stream
    └── vapor             complete initial state for this graph stream
```

There are two governing rules:

1. `flowsheetDict` contains **topology**, never stream values.
2. Every graph stream has exactly one complete state file under `0/`.

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
- Recycle, sweeps, batch, and fitting: [`patterns.md`](patterns.md)
- Failure modes: [`pitfalls.md`](pitfalls.md)

When a required component property is absent, stop and follow
[`curation-protocol.md`](curation-protocol.md).  Do not invent a number to make
the case run.
