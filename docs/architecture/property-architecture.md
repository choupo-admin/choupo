# Choupo — Property Architecture (the single source)

**Status.** THE consolidated authority for how Choupo represents and computes
physical properties. Subordinate only to
[`CHOUPO-CONSTITUTION.md`](CHOUPO-CONSTITUTION.md) (case shape + engine reading).
Where the older scattered notes disagree with THIS file, this file wins.

**This file supersedes / folds:** the electrolyte-mechanism note
`docs/electrolyte-architecture.md` (ARCHIVED — described the pre-A1..A3
single-slot/RTTI wiring), and unifies the still-good detail docs below, which
remain the deep reference for their slice:
- resolution / model layer → [`../property-architecture.md`](../property-architecture.md) *(root; Layer-2 contract, 2026-06-05)*
- electrolyte data ontology → [`electrolyte-data-architecture.md`](electrolyte-data-architecture.md) *(the 7 homes, representation×reference)*
- grammar of the dict → [`../design/thermo-grammar-professors-forum-2026-07-04.md`](../design/thermo-grammar-professors-forum-2026-07-04.md) *(the five axes, A1–A3)*
- author-facing → [`../ai/thermo.md`](../ai/thermo.md), [`../ai/data-doctrine.md`](../ai/data-doctrine.md)

**This file describes WHAT THE ENGINE ACTUALLY DOES.** Every capability is
tagged `[WORKS]` (implemented + covered by a running tutorial), `[ROADMAP]`
(designed, not built), or `[OUT]` (a conscious non-goal). No promises the code
does not keep.

---

## 1. The flow

```
a case SELECTS a propertyPackage        (the manifest — the CENTRE)
        │  declares: components · chemistry · per-phase methods · parameters
        ▼
ThermoPackageBuilder   ASSEMBLES it — loads + verifies + announces, NEVER estimates
        ▼
ThermoPackage          COMPUTES (K-values, γ, φ, H, S, ρ, …)
        ▼
unit ops               flash · reactor · distillation · crystalliser · membrane
```
`[WORKS]`. "Builder" is the runtime assembler; "resolver" is the curation-time
estimator (§5). They never mix — the runtime never estimates a missing value;
it declares, verifies, and refuses (no silent crutch).

## 2. Data homes — `data/standards/` (one coherent tree, OpenFOAM-style)

| home | carries | status |
|---|---|---|
| `components/` | identity (name, MW, formula) **+ `dissociatesTo`** (ion stoichiometry = identity, not behaviour). FLAT, O(1) by exact name | `[WORKS]` |
| `species/aqueous/` | model species (ions Na⁺, Cl⁻…) + medium-tagged `…Thermo{}` (hfAq/sAq/cpAq, Wagman 1982). "never fed to a flowsheet" | `[WORKS]` |
| `phases/solid/` | crystal ρ_p, k_v (for the population-balance crystalliser) | `[WORKS]` |
| `chemistry/` | REAL equilibria (K + ΔH): `mineralSolubility/` (Ksp=logK25+ΔH+analytic(T), imported from USGS PHREEQC), `salts/`, `aqueousSpeciation/`, `gasLiquid/` (Henry), `ionExchange/` | `[WORKS]` |
| `parameters/` | interaction parameters by PAIR (Pitzer, eNRTL, NRTL/UNIQUAC/Wilson kij) | `[WORKS]` |
| `propertyMethods/` | a model + its reference rung, per phase/group (`activity/ electrolyte/ eos/`) | `[WORKS]` |
| `propertyPackages/` | **SELECTS** everything; one per scenario; a pure manifest (references, never values) | `[WORKS]` |
| `unifac/ joback/ binaryPairs/ henrysLaw/ solution/` | group tables, pair catalogues, Henry pairs | `[WORKS]` |

Data tiers: **`standards`** (public, curated) **> `local`** (private, gitignored,
your imports/estimates) — plus **`references/`** manifests (identity+citation,
zero values). Precedence: `case > standards > local > ideal default`. The public
`proposed` tier was retired (2026-07-13); any doc still naming it is stale.

## 3. The models that run

**Molecular VLE / one Gibbs surface per phase** `[WORKS]`:
- ideal / Raoult; activity **NRTL · UNIQUAC · Wilson · UNIFAC**; EoS **Peng-Robinson · SRK · idealGas**.
- LLE/VLLE by **direct Gibbs-energy minimisation** (not fugacity equality) — Nelder-Mead multi-start.
- Henry's law for dissolved gases (`co2Water_henry`) `[WORKS]`.

**Electrolytes** — REPRESENTATION × REFERENCE (details:
`electrolyte-data-architecture.md`). REPRESENTATION is a continuum *lumped →
complete dissociation → ion-pair → multi-ion*; REFERENCE is one of *solid ·
pure-liquid Raoult · aqueous-infinite-dilution · fused-salt*. The METHOD picks
the rung; it is never stored on the substance.

| representation | reference | status |
|---|---|---|
| lumped salt (van't Hoff ν → π=νRTc) | — / solid | `[WORKS]` |
| single salt, complete dissociation | aqueous | `[WORKS]` — Pitzer, eNRTL (+ ethanol mixed-solvent) |
| multi-ion **speciation** (SI, pH, scaling) | aqueous | `[WORKS]` — `pitzerHMW` (Harvie-Møller-Weare) / `davies` |
| salt precipitation | solid via Ksp | `[WORKS]` — `chemistry/mineralSolubility/`, SI=log(IAP/Ksp) |
| multi-ion **carried in every stream** through a general flowsheet | aqueous | `[ROADMAP]` |
| molten / fused-salt | fused | `[ROADMAP]` |

Packages that ship & run: `aqueousNaCl_{pitzer,eNRTL}`,
`aqueousKCl_ethanol_eNRTL`, `aqueousNaOH_pitzer`, `co2Water_henry`,
`ethanolWater_NRTL`, `n2ch4_srk`. Tutorials: `props/electrolyte/scaling_ro_*`,
`steady/crystallisation/*`, `steady/membranes/membrane0{7,8}_scaling`.

## 4. Solids & salts — how precipitation enters

A solid (Halite, gypsum, calcite…) is a first-class **phase** with a **stored**
dissolution equilibrium in `chemistry/mineralSolubility/<mineral>.dat`
(logK25 + ΔH + analytic(T), reaction = its ions). Exactly the PHREEQC pattern
(Choupo imported the USGS `phreeqc.dat`). Precipitation is driven by
`SI = log₁₀(IAP/Ksp)`, IAP = Π a(ion)^ν. `[WORKS]`.

The salt COMPONENT (`NaCl.dat`) carries identity + `dissociatesTo` +
`nonvolatile` + a `solid{}` crystal block — and **no** `gibbsFormation` block:
the salt's solid formation is DERIVED from the ions + dissolution enthalpy
(arity, §6), never stored twice. A salt is NEVER routed through the ideal-gas
reference, and NEVER group-estimated (§5).

## 5. Estimation = curation, not runtime

Property estimation is a **curation-time RESOLUTION** problem that yields a
glass-box, reviewable `.dat` with per-value provenance — the runtime never
estimates (detail: root `property-architecture.md`). The bulk group-estimation
lake `data/groupEstimative/` holds Joback/Lee-Kesler estimates for **covalent
molecules only**; group contribution does not reach salts/electrolytes (no
molecular Tc for an ion pair), so salts there carry only identity +
`dissociatesTo` for electrolyte-tier curation. `[WORKS]` as a lake; promotion is
selective + human.

## 6. Doctrines (non-negotiable)

- **One Gibbs surface per phase** — illegal to split a phase across two models.
- **Arity** — never store a derivable quantity twice (salt solid formation is ion-derived).
- **Elements datum** — all formation/reaction enthalpy on the elements-at-25 °C reference; reactions carry no separate ΔH_rxn.
- **No silent crutch** — declare → verify → refuse; every convergence aid is explicit.
- **Model boundary** — H is the conserved truth, T the model-dependent readout; audit at seams.

## 7. Conscious non-goals `[OUT]`

- Multi-ion carried in every stream + report-in-salt aggregation across a general
  flowsheet (the "composition-basis round-trip"). *(Designed as `[ROADMAP]`, not
  built; the naming "apparent/true" is rejected — there is no "true" composition.)*
- Runtime estimation / high-T K extrapolation (Helgeson-style): Choupo curates K
  offline (van't Hoff logK25+ΔH); accepts a narrower T-window for glass-box clarity.
- Inert / non-conventional solids not in phase equilibrium (CISOLID / NC): only
  precipitating salts are modelled.
- Per-property runtime **route-tracing** (calculation-boundary transparency):
  provenance today lives at the DATA boundary, not the calculation boundary.
- Breadth / thermo-curation parity with commercial simulators — the value is
  transparency, not coverage.
