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

## Economic appraisal — the money on top of the physics

This flagship is also the worked **process-economics** example (Turton 5th ed.,
Ch. 7–8 + §10).  Two case files turn the converged flowsheet into money:

- `constant/economics` — the **market/time tier**: product/feed prices, labour
  rate, FX, target CEPCI, tax rate.  Each value is **dated and primary-cited**
  (EU Sugar Market Observatory white-sugar price; ECB EUR/USD; *Chemical
  Engineering* CEPCI; US statutory tax).  No price ever defaults to a literal
  in code — the `EconomicsPass` refuses to run if a required price is absent.
- `system/postDict` — the **sizing → costing → economics** chain: physical
  size of each major item from its unit-op KPIs (evaporator area, crystalliser
  magma volume, spray-dryer evaporation rate, fermentor volume) → Guthrie/Turton
  bare-module cost (CEPCI-updated, EUR) → OPEX (`COM_d`), revenue, straight-line
  DCF, NPV, IRR, discounted + simple payback.  Every factor is printed.

### The single-point appraisal (this case)

```
runCase tutorials/plant/ChemicalPlantTutorial
```

makes one pass and prints the complete **Economic Appraisal** block: `FCI /
TCI`, the Lang cross-check, the `COM_d` taxonomy line by line, revenue, and the
DCF (NPV / IRR / payback) with the **AACE Class-4 (−30 %/+50 %)** banner.

At the base feed (6 mol% sucrose) and the cited EU sugar price (0.557 EUR/kg)
this small pilot line is **sub-economic** — FCI ≈ 37 M EUR against ≈ 9.1 M EUR/yr
revenue, COM_d ≈ 9.9 M EUR/yr, NPV negative, no break-even.  That is an honest,
glass-box result: a 17 kt/yr sugar line carrying full-scale unit costs needs
either a richer feed or a higher sugar price to clear the MARR.

### The differentiator — sweep how the economics MOVE

The sister case **`tutorials/plant/sugarPlantEconomicsSweep`** is this same
plant driven by a `SweepDriver`: it runs the FULL post-chain on every converged
point, so `economics.IRR` / `economics.paybackYears` resolve as ordinary KPI
look-ups.  Walking the RawJuice sucrose content 0.09 → 0.16 mol fraction walks
the project from sub-economic, through break-even, to clearly profitable
(IRR 0.9 % → 24.4 %, payback appearing at 9.3 yr and shortening to 4.8 yr,
NPV crossing zero).  A single CAPEX number cannot show this trade-off; the
sweep can.  See that case's README for the table.
