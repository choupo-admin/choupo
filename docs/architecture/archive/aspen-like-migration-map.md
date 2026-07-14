# Choupo Data Architecture — Aspen-like Migration Map

> **Design RATIFIED 2026-06-30; this is the migration map for the build.**
> Existing paths remain loadable during the compatibility phase. The target architecture (see
> [`aspen-like-data-architecture.md`](aspen-like-data-architecture.md)) is
> introduced gradually, by object kind. `generated/indexes/` and
> `generated/flatCaches/` preserve the old runtime lookup (O(1) by name). **No
> physical-property values change during an architectural move.** Supersedes the
> first-cut [`data-migration-map.md`](data-migration-map.md).

---

## Path migration table

| Current path | Target path | Meaning |
|---|---|---|
| `data/standards/components/` | `data/standards/components/apparent/`<br>`data/standards/components/true/molecular/`<br>`data/standards/components/true/aqueous/`<br>`data/standards/components/true/solids/` | Split into user-facing apparent components and solver-facing true species. **Intrinsic arity-1 pure-component properties stay in these records.** |
| `data/standards/electrolyte/ions.dat` | `data/standards/components/true/aqueous/` | Real ionic species. |
| `data/standards/electrolyte/pairs.dat` | `data/standards/parameters/electrolyte/pitzer/pairs/` | Pitzer binary interaction parameters. |
| `data/standards/electrolyte/mixing.dat` | `data/standards/parameters/electrolyte/pitzer/mixing/` | Pitzer higher-order / mixing parameters. |
| `data/standards/electrolyte/enrtl.dat` | `data/standards/parameters/electrolyte/eNRTL/` | Electrolyte-NRTL parameters. |
| `data/standards/electrolyte/minerals.dat` | `data/standards/chemistry/salts/` | Salt precipitation / dissolution equilibria. |
| `data/standards/electrolyte/speciation.dat` | `data/standards/chemistry/aqueous/` | Aqueous chemical speciation equilibria. |
| `data/standards/electrolyte/gases.dat` | `data/standards/chemistry/gasLiquid/` | Gas–liquid electrolyte equilibria. |
| `data/standards/electrolyte/exchange.dat` | `data/standards/chemistry/ionExchange/` | Ion-exchange equilibria. |
| `data/standards/electrolyte/resins/` | `data/standards/assets/resins/` | Ion-exchange resin engineering assets. |
| `data/standards/binaryPairs/NRTL/` | `data/standards/parameters/binary/NRTL/` | NRTL binary parameters. |
| `data/standards/binaryPairs/UNIQUAC/` | `data/standards/parameters/binary/UNIQUAC/` | UNIQUAC binary parameters. |
| `data/standards/binaryPairs/Wilson/` | `data/standards/parameters/binary/Wilson/` | Wilson binary parameters. |
| `data/standards/henrysLaw/` | `data/standards/parameters/henry/`<br>*or* `data/standards/chemistry/gasLiquid/henry/` | Henry data. Goes to `parameters/henry/` if the files are **model parameters**, to `chemistry/gasLiquid/henry/` if they are **equilibrium definitions** — decide per file by what it holds. |
| `data/standards/membranes/` | `data/standards/assets/membranes/` | Membrane assets. Intrinsic spec stays in the asset; only a separate swappable transport-model parameterisation goes to `parameters/`/`propertyMethods/transport`. |
| `data/standards/materials/` | `data/standards/assets/materials/` | Materials of construction. |
| `data/standards/adsorbents/` | `data/standards/assets/adsorbents/` | Adsorbent assets. |
| `data/standards/utilities/` | `data/standards/assets/utilities/` | Utility assets. |
| `data/standards/mixtures/` | `data/standards/components/apparent/`<br>*or* `data/standards/components/apparent/mixtures/` | Mixture aliases / predefined component expansions. |
| `data/proposed/_coolprop_review/` | `data/proposed/imports/coolprop/` | Raw or reviewed CoolProp-derived import material. |

New kinds with **no current source** (created empty, populated as cases need them):
`propertyMethods/`, `propertyPackages/`, `propertySets/`, `chemistry/aqueous|salts|gasLiquid|ionExchange/`,
`parameters/pure/` (a README only — pure props stay with the substance).

---

## The `thermoPackage → propertyPackage` path

The existing `thermoPackage` dict stays loadable and is read as a **degenerate
`propertyPackage`**: `componentApproach apparent`, no `chemistry`, one liquid
method, no electrolyte parameters. New electrolyte / geochemistry cases author a
full `propertyPackage`. The package is the superset; `thermoPackage` is its lean
projection. No existing case breaks; no case is force-migrated.

---

## Compatibility phase

1. Existing paths remain loadable; old loaders keep reading old locations.
2. The architecture is documented first (this and the companion document).
3. New data preferentially uses the target architecture.
4. `generated/indexes/` + `generated/flatCaches/` produce old-style monolithic /
   by-name views so runtime lookup stays O(1) (the 2026-06-07 flat-components
   contract is honoured).
5. Migration is incremental **but by object kind**, not random file-by-file.
6. **Avoid long-lived dual conventions.**
7. **No physical-property values change during a move.**

---

## Migration discipline (by object kind, atomically)

- all true ions together,
- all Pitzer pairs together,
- all salt / mineral equilibria together,
- all activity-model binary pairs together,
- all assets of one kind together.

Avoid a long period where half of a kind lives in old paths and half in new
paths. A short, fully-closed dual-convention window per kind is the point of
migrating by kind.

---

## Implementation plan

**Phase 1 — Documentation only.** This and the companion document. *(Current
task. Phases below are NOT executed unless explicitly requested.)*

**Phase 2 — Empty target directories with READMEs** stating the object kind each
holds. No data moves.

**Phase 3 — Migrate one full object kind at a time** (all ions, then all Pitzer
pairs, then all salt equilibria, …), values untouched.

**Phase 4 — Generated indexes + flat caches** so the runtime by-name lookup is
preserved.

**Phase 5 — Make the resolver use the architecture explicitly:** a case selects a
`propertyPackage` → apparent/true components → chemistry → property methods →
parameter databanks → property sets. This is the phase that *justifies* the
architecture: the engine reasons about apparent vs true and treats chemistry,
methods, parameters, and packages as first-class objects. Decide Phase 5 is
wanted before starting Phase 3 — without it the move is folder churn.

---

## Closing

The complexity already exists in the thermodynamics. This architecture **exposes
it cleanly** in explicit, auditable files instead of hiding it inside overloaded
component records or behind a wizard. Do not make the architecture smaller because
it is complex — make it **explicit, teachable, and modular**.

> **Choupo is Aspen architecture with an open-source implementation —
> Aspen-like conceptual model, OpenFOAM-like explicit files.**
