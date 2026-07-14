# Choupo Data Architecture Migration Map
> **SUPERSEDED 2026-06-30.** This early plan maps to a tree that was NOT built
> (`species/ions/`, `models/electrolyte/...`). The migration ACTUALLY executed
> follows [`aspen-like-migration-map.md`](aspen-like-migration-map.md):
> ions->`components/true/aqueous/`, pairs/mixing/eNRTL->`parameters/electrolyte/...`,
> minerals/speciation/gases/exchange->`chemistry/...`. The standards monoliths are
> DELETED; the engine reads the per-file tree (dual-leg, case-local overlay first).
> Kept for history only.


> **SUPERSEDED (2026-06-29) by [`aspen-like-migration-map.md`](aspen-like-migration-map.md).**
> Kept for history; read the Aspen migration map for the canonical plan.

> **This is a migration map only.** Existing files remain loadable during the
> compatibility phase. The target architecture (see
> [`data-ontology.md`](data-ontology.md)) is introduced **gradually, by object
> kind**. Generated flat caches may preserve the old runtime lookup behaviour.
> **No physical-property values change during an architectural move** — a move
> relocates a record, it never edits it.

---

## Path migration table

| Current path | Target path | Meaning |
|---|---|---|
| `data/standards/components/` | `data/standards/components/molecular/`<br>`data/standards/components/apparentSalts/`<br>`data/standards/components/pseudo/`<br>`data/standards/components/mixtures/` | User-facing flowsheet components. Split by component kind. **Intrinsic arity-1 pure-component properties remain in these component files.** |
| `data/standards/electrolyte/ions.dat` | `data/standards/species/ions/`<br>*(temporarily `data/standards/species/ions.dat`)* | Real ionic species used internally by electrolyte models. |
| `data/standards/electrolyte/pairs.dat` | `data/standards/models/electrolyte/pitzer/pairs/` | Pitzer binary interaction parameters. |
| `data/standards/electrolyte/mixing.dat` | `data/standards/models/electrolyte/pitzer/mixing/` | Pitzer higher-order / mixing parameters. |
| `data/standards/electrolyte/enrtl.dat` | `data/standards/models/electrolyte/eNRTL/` | Electrolyte-NRTL parameters. |
| `data/standards/electrolyte/minerals.dat` | `data/standards/equilibria/mineralSolubility/` | Mineral dissolution / precipitation equilibria. |
| `data/standards/electrolyte/speciation.dat` | `data/standards/equilibria/aqueousSpeciation/` | Aqueous chemical speciation equilibria. |
| `data/standards/electrolyte/gases.dat` | `data/standards/equilibria/gasLiquid/` | Gas–liquid electrolyte equilibria. |
| `data/standards/electrolyte/exchange.dat` | `data/standards/equilibria/ionExchange/` | Ion-exchange equilibria. |
| `data/standards/electrolyte/resins/` | `data/standards/assets/resins/` | Ion-exchange resin engineering assets. |
| `data/standards/binaryPairs/NRTL/` | `data/standards/models/activity/NRTL/` | NRTL activity-model binary parameters. |
| `data/standards/binaryPairs/UNIQUAC/` | `data/standards/models/activity/UNIQUAC/` | UNIQUAC activity-model binary parameters. |
| `data/standards/binaryPairs/Wilson/` | `data/standards/models/activity/Wilson/` | Wilson activity-model binary parameters. |
| `data/standards/henrysLaw/` | `data/standards/equilibria/gasLiquid/henry/` | Henry-law gas–liquid equilibrium data. |
| `data/standards/membranes/` | `data/standards/assets/membranes/` | Membrane engineering assets. **Intrinsic membrane spec stays in the asset;** only a separate, swappable transport-model parameterisation (if any) goes to `models/transport/membraneTransport/`. |
| `data/standards/materials/` | `data/standards/assets/materials/` | Materials of construction / engineering materials. |
| `data/standards/adsorbents/` | `data/standards/assets/adsorbents/` | Adsorbent engineering assets. |
| `data/standards/utilities/` | `data/standards/assets/utilities/` | Utility stream definitions / utility assets. |
| `data/standards/mixtures/` | `data/standards/components/mixtures/` | Mixture aliases / predefined component expansions. |
| `data/proposed/_coolprop_review/` | `data/proposed/imports/coolprop/` | Raw or reviewed CoolProp-derived import material. |

---

## Explicit non-migration rule

**Do NOT migrate pure-component properties into `models/pure/`.** There is **no
`models/pure/` branch** in the target architecture. Pure, intrinsic arity-1
properties (vapour pressure, heat capacity, density, viscosity, critical
properties, Antoine coefficients, molecular weight, pure-component correlations)
**remain with the component/substance file.** Only arity-2-or-higher,
model-specific pair/group/interaction parameters belong in `models/`.

---

## Compatibility phase

1. **Do not break existing paths immediately.**
2. Existing loaders may continue to read the old locations.
3. New documentation defines the target architecture.
4. New data should preferentially use the target architecture.
5. A `generated/flatCaches/` layer may be used to produce old-style monolithic
   files for runtime speed or backward compatibility — this preserves the
   `components/<name>.dat` O(1) by-name lookup the loader expects (the
   flat-components decision, `CLAUDE.md` §7), so the runtime never
   directory-walks the new tree.
6. Migration is incremental **but by object kind**, not random file-by-file.
7. **Avoid long-lived dual conventions.**
8. **Do not change physical-property values during architectural moves.**

---

## Migration discipline

**Migrate by object kind, atomically where possible:**

- all ions together,
- all Pitzer pairs together,
- all mineral equilibria together,
- all activity-model binary pairs together,
- all assets of one kind together.

**Avoid a long period where half of a kind lives in old paths and half in new
paths.** A short, fully-closed dual-convention window per kind is the whole point
of migrating by kind rather than file-by-file.

---

## Implementation plan

**Phase 1 — Architecture documentation only.**
Produce / revise [`data-ontology.md`](data-ontology.md) and this map. *(This is
the current task; the phases below are NOT executed unless explicitly
requested.)*

**Phase 2 — Empty target directories with README files.**
Create the target directories, each with a `README` stating the object kind it
holds. No data moves.

**Phase 3 — Migrate one full object kind at a time** (not random individual
files). E.g. all ions, then all Pitzer pairs, then all mineral equilibria.

**Phase 4 — Generated flat caches.**
Add the `generated/flatCaches/` build step if the old runtime lookup expects
monolithic files.

**Phase 5 — Make the property resolver use the ontology explicitly:**
`Component → Species → Equilibrium → ModelParameterSet`. This is the phase that
*justifies* the whole architecture (see below).

---

## Why this shape — and the one condition that justifies it

This architecture follows the **conceptual** structure used by Aspen electrolyte
systems: **apparent** components are user-facing, **true species** are
solver-facing, **reactions / equilibria** define the chemistry, and **property
methods** provide model-specific parameters. Choupo should **not** copy Aspen's
hidden databank/wizard style — it implements the same conceptual separation with
**explicit open-source files that are easy to review, version, and extend through
Git.**

> **The condition.** This architecture only justifies itself if Choupo's *engine*
> will actually reason about **apparent versus true** species, and treat
> **equilibria** and **model parameters** as **first-class objects** (Phase 5). If
> the solver continues to treat this as mere folder rearrangement, the migration
> cost — the resolution graph, the flat-cache build, the dual-convention window —
> is **not** justified. Decide Phase 5 before starting Phase 3.

> **Choupo should be Aspen-like in ontology and OpenFOAM-like in file structure.**
