# chemicalPlantTutorial — the fractal-architecture showcase case

This is the worked example of the multi-sector "chemical plant" architecture
(the fractal design from 2026-05-23). **It runs.** The engine flattens the
sector tree into one flat solver problem and converges the plant in a couple of
Newton iterations on the fermentation recycle tear:

```
runCase tutorials/plant/ChemicalPlantTutorial
```

It ships an `expected` golden master and is exercised by `bin/runTests` (as a
fractal showcase it is run with the NaN/inf guard; its KPIs are not auto-pinned
because the curate-vs-simulate sector dispatch is still an open call).

## The idea: one concept, repeated

```
unit operation  ⊂  sector  ⊂  plant
```

Every level is the **same thing** — a *node* with the same triad
`{ <name>.cho, system/, constant/ }`. Only the granularity differs:

- a node is **COMPOSITE** if its `flowsheetDict` has `children ( ... )` (+
  `connections`);
- a node is **LEAF** if its `flowsheetDict` has `type ...; operation { ... }`.

Nothing else distinguishes them. `flattenNode` collapses the tree to ONE flat
solver problem with `plant.sector.unit` names; the recycle solver (Newton over
the tear streams) closes the whole factory at once.

## This plant: a sugar line + a fermentation loop

```
JuiceSplitter    RawJuice → (2/3) CONCENTRATION + (1/3) FERMENTATION
CONCENTRATION    evap1 → evap2  (double effect)  → cryst   (crystalliser)
DRYING           SD (spray dryer) → BD (extra solid drying) → CY (cyclone)
FERMENTATION     mixer → fermentor → flash → splitter (with a recycle)
```

## What you see when it runs

- the tear streams listed with their initial guesses, then
  `Recycle converged in 2 Newton iteration(s)`;
- per-unit KPIs for every namespaced equipment (`CONCENTRATION.Evap1`,
  `DRYING.SD`, `FERMENTATION.Fermentor`, …);
- plant-wide stream table, mass balance, energy balance and utilities reports
  over the flattened factory, so the first law closes across all sectors.

## Principles you can read straight off the tree

| Principle | What to look for |
|---|---|
| **Fractal** | every level is a folder with `.cho + system/ + constant/` |
| **Run-scope** | a `.cho` at every level → open/run a *unit*, a *sector*, or the *whole plant* |
| **Overlay / cascade** | data resolve `standards → plant → sector → unit`, each level overriding only what it adds (same for `controlDict` and for boundary feeds) |
| **Credo, fractal** | each node: *streams IN → box (params) → streams OUT*; a leaf's boundary feeds carry **defaults** so it runs isolated, and the parent **overrides** them when it cables |
