# Crystallizer09chatGPT — Golden target architecture

This case is intentionally a **target case** for Choupo.  It encodes the
architecture agreed for nested runnable domains and is meant to show Claude
Code / Codex what the repository should support.

> **Implementation status — F1 + F2 COMPLETE (2026-07-07).**  Everything below runs
> on disk as described.  The domain hierarchy (`units ( … )` under
> `unitOperations/<unit>/`), the FLAT `0/`+`converged/` state, the named-edge
> topology, the tear in `solverDict`, and the self-contained `constant/propertyData/`
> snapshot are live.  **F2 (1) `inherits` resolver:** a unit's
> `constant/propertyDict` may carry `inherits "../../../constant";`; the engine
> resolves the linear chain (cycle-detected, loud shadowing, no filesystem crawling),
> merges local over parent, and the SELECTED liquid method defines the ACTIVE world --
> `recovery`'s `liquid activity.NRTL` runs molecular and the inherited salt chemistry
> stays available but INACTIVE (announced: *"inherited chemistry INACTIVE"*).  **F2 (2)
> parameters:** every model parameter resolves from
> `constant/propertyData/parameters/<family>/<model>/<key>.dat`, before the catalogue.
> **F2 (3):** `recovery` carries `constant/propertyDict` (`inherits` + `liquid
> activity.NRTL`) -- NO inline `thermo{}` -- and its NRTL ethanol-water parameter is
> inherited from the plant context's `propertyData/parameters/activity/NRTL/` (its
> natural home: a molecular pair the plant also owns).  The `constant/electrolyte/`
> and `constant/parameters/` overlays are GONE; the case runs with `data/standards`
> hidden, from `propertyDict` + `propertyData/` + the `inherits` chain alone.

## 1. Domain hierarchy

This case has **no sectors**.  It is one operational flowsheet with three unit
operations:

```text
Crystallizer09chatGPT
└── unitOperations
    ├── cryst1
    ├── cryst2
    └── recovery
```

The root graph therefore declares:

```cpp
units ( cryst1 cryst2 recovery );
```

`children (...)` is forbidden.  `sectors (...)` is reserved for genuine
process subdomains and is not used here.

## 2. Units are not state subdomains

Because there are no sectors, the root run state is flat:

```text
0/
├── feed
├── freshEthanol
├── KHT_cake
├── liquor1
├── KCl_cake
├── finalLiquor
├── recoveredEthanol
└── stillage
```

and `converged/` has the same stable stream-ID layout after convergence.

There is no `0/cryst1/`, `0/cryst2/`, or `0/recovery/` merely because those
names are units.

## 3. Every physical stream is one named graph edge

The edge name is simultaneously:

```text
physical stream identity
=
stable stream ID
=
state filename
```

Ports such as `cryst1/motherLiquor` and `cryst2/liquor1` are endpoints, not
competing stream identities.

There are no anonymous `connections (...)`, no `boundary {}`, and no legacy
`streams {}` state hidden in `flowsheetDict`.

## 4. Nested runnable domains get their own run state only when run

A nested unit operation is a model while embedded in the root run.  It does
not own a separate clock merely because it exists in the tree.

When a student runs a nested unit independently, `runCase` materialises a
local `0/` for that run domain from an ancestor solution and starts a new local
time reference at zero.

Constitutional rule:

> **Time belongs to a run, not to a unit operation.**

For a selected subgraph:

```text
incoming cut edge   -> fixed from ancestor snapshot
internal edge       -> solved (ancestor value may seed the initial guess)
outgoing cut edge   -> solved (ancestor value may seed the initial guess)
```

Thus a local `0/` is a projection of an ancestor state onto the selected
subgraph.  It is not a permanent duplicate ontology.

## 5. Property inheritance is `inherits`, NOT `#include` (F2)

There are **no `parentCase` symbolic links** and **no `#include`-as-inheritance**
in this case.  Textual `#include` is textual inclusion only; it must never be the
mechanism that implicitly drags in a sibling `propertyData/` (ClaudeChat.md §8/§13).
Property-context heritage is an explicit keyword pointing at the parent
**directory** `constant/`:

```cpp
// unitOperations/recovery/constant/propertyDict   (F2 TARGET)
inherits "../../../constant";

propertyMethods
{
    liquid activity.NRTL;
}
```

Semantics (deliberately simple, glass-box):

1. the parent property context (its `propertyDict` config AND its sibling
   `propertyData/`) enters the resolution chain;
2. the nearest local declaration wins; local data overlays parent data, and a
   shadowed record is announced, never silent;
3. at most one parent (linear chain, cycle-detected);
4. the runtime never falls back to the installation catalogue;
5. model parameters resolve from `propertyData/parameters/…` (declared, not crawled).

**Status (on disk today — F2 complete):** `recovery/constant/propertyDict` carries
exactly `inherits "../../../constant";` + `propertyMethods { liquid activity.NRTL; }`.
`cryst1`/`cryst2` carry no local `constant/` — they use the plant context unchanged.
The engine resolves the chain, and because the selected liquid method is molecular,
the inherited salt chemistry is available-but-inactive for `recovery` (announced at
run time).  The NRTL ethanol-water parameter is inherited from the plant context's
`propertyData/parameters/activity/NRTL/` — its natural home, a molecular pair the
plant also owns.  No inline `thermo{}`, no `constant/parameters/` overlay.

## 6. No symlink expansion problem

Because inheritance is an explicit `inherits "…/constant"` (a relative directory
path in the case language), there are no `parentCase` links to preserve,
dereference, or accidentally expand recursively.

Standalone export is a separate explicit operation: resolve includes,
materialise the effective property configuration, calculate the exact
property-data dependency closure, materialise local `0/`, and write a closed
case.

## 7. Root property architecture

```text
constant/propertyDict
    declares

constant/propertyData/
    closed plant snapshot

ThermoPackageBuilder
    assembles

ThermoPackage
    calculates
```

`propertyPackage` is not the case abstraction.  Runtime installation-catalogue
fallback is forbidden.

## 8. Numerical separation

`recoveredEthanol` is one physical named edge in the graph.  Its tear role is
numerical and belongs only in `system/solverDict`.

A temporary infeasible Newton/Jacobian trial is a recoverable trial-domain
failure.  It must not be used as an excuse to preserve legacy graph/state
architecture.

## 9. Acceptance invariants

For this case:

```text
number of named graph stream IDs = 8
number of root 0/ state files     = 8
number of root converged/ files   = 8
```

Required:

```text
graph IDs == 0/ IDs
graph IDs == converged/ IDs
```

Forbidden active constructs:

```text
children (...)
legacy streams {}
manual boundary {}
anonymous connections (...)
parentCase symlinks
recordType propertyPackage
thermo {} inside flowsheetDict
apparentOrTrue
runtime installation-catalogue fallback
```
