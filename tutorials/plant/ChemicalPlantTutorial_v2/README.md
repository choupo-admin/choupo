# chemicalPlantTutorial — the fractal-architecture proxy case

This is the **development target** for the multi-sector "chemical plant"
architecture (the fractal design worked out 2026-05-23). It is **not yet
runnable** by the engine — it is the *specification of where we are going*,
materialised as a folder tree so we can build the engine toward it. Until
the engine catches up, **this tree is read, not run.**

## The idea: one concept, repeated

```
unit operation  ⊂  sector  ⊂  plant
```

Every level is the **same thing** — a *node* with the same triad
`{ <name>.cho, system/, constant/ }`. Only the granularity differs:

- a node is **COMPOSITE** if its `flowsheetDict` has `children ( ... )`;
- a node is **LEAF** if its `flowsheetDict` has `type ...; operation { ... }`.

Nothing else distinguishes them. The solver resolves a leaf (one equation
set) or iterates a composite (sequential-modular + Wegstein on the
inter-child tear streams). Recursively, to any depth.

## This plant: a sugar line

```
concentration/   evap1 → evap2  (double effect)  → cryst   (crystalliser)
drying/          SD (spray dryer) → BD (extra solid drying) → CY (cyclone)
```

## Principles you can read straight off the tree

| Principle | What to look for |
|---|---|
| **Fractal** | every level is a folder with `.cho + system/ + constant/` |
| **Run-scope** | a `.cho` at every level → open/run a *unit*, a *sector*, or the *whole plant* |
| **Overlay / cascade** | data resolve `standards → plant → sector → unit`, each level overriding only what it adds (same for `controlDict` and for boundary feeds) |
| **Credo, fractal** | each node: *streams IN → box (params) → streams OUT*; a leaf's boundary feeds carry **defaults** so it runs isolated, and the parent **overrides** them when it cables |

## What the engine still needs (the roadmap this case pins down)

- `flowsheetDict` parsing of `children ( ... )` + `connections ( ... )` + `boundary { ... }`
- a recursive **`Solvable`** (a `Flowsheet` IS-A `UnitOperation`)
- **run-scope**: resolve a chosen node (leaf or composite)
- the **cascade** of `controlDict` / data / boundary feeds across folder levels
- GUI **drill-down** + per-level Run
- the **crystalliser** and **solidDryer** unit ops (the `cyclone`, `evaporator`
  and `sprayDryer` already exist)

We build toward this, one piece at a time.
