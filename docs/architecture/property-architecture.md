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
a case DECLARES its system INLINE       (constant/thermoPhysPropDict — the CENTRE;
        │                                recordType thermophysicalPropertySystem,
        │                                schemaVersion 2; the shared-catalogue
        │                                `package <name>;` selector is RETIRED,
        │                                and v1 propertyDict/thermoPackage refused)
        │  declares: components · equilibrium.formulation · per-phase models · parameters
        ▼
ThermoPackageBuilder   ASSEMBLES the declared formulation NATIVELY — loads + verifies
        │               + announces, NEVER estimates
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
| `components/` | UNIFIED substance records (247, of which 64 carry solid phases): identity (name, MW, formula) **+ `dissociatesTo`/`speciesMap`** (ion stoichiometry = identity, not behaviour) **+ `solidPhases{}`** (dissolution reaction, Ksp = logK25 + ΔH + analytic(T), solid thermochemistry) **+ crystal/shape** (ρ_p, k_v). FLAT, O(1) by exact name | `[WORKS]` |
| `species/<name>.dat` | one `recordType modelSpecies` file per aqueous species (`species/Na.dat`, `species/Cl.dat`, `species/O2.dat`, …): `formula` + charge + MW + `aqueousThermo{}` (hfAq/sAq/cpAq, Wagman 1982). "never fed to a flowsheet". `modelSpecies` covers BOTH charged ions AND neutral dissolved molecules (O₂(aq)/N₂(aq), charge 0 — `formula`, not `ion`); `ion`/`cation`/`anion` are reserved for charge ≠ 0. So a sealed case copies exactly the species it reaches. *(Dismantled 2026-07-18 from the earlier single `species/aqueous.dat` catalogue.)* | `[WORKS]` |
| `chemistry/` | REAL equilibria (K + ΔH): `aqueousSpeciation/` (56), `gasLiquid/` (8, Henry), `ionExchange/` (6). *(`mineralSolubility/`, `salts/` and `phases/solid/` were RETIRED — minerals folded into `components/` `solidPhases{}`, one substance = one file.)* | `[WORKS]` |
| `parameters/` | interaction parameters by PAIR (`Pitzer/` 55 pares +θ/ψ/λ/ζ, `eNRTL/`, `NRTL/ UNIQUAC/ Wilson/`, `Henry/` 205, `SRK/`) + group tables (`Joback.dat`, `UNIFAC/`, `vanKrevelen.dat`, `Yang2020.dat`) + `adsorption/` + `eos/kij` + `solution/` | `[WORKS]` |
| `assets/` `mixtures/` `utilities/` | flat physical kit (membranes/adsorbents/materials, `kind`-tagged), predefined mixtures (air…), plant utility services | `[WORKS]` |
| *(`methods/` RETIRED)* | the per-model `methods/<name>.dat` ceremony records were retired with the v2-native migration — a model's reference rung is now declared IN the case's `thermoPhysPropDict` (`equilibrium.<phase>.standardState`), read by the builder, not looked up from a data home | `[RETIRED]` |
| *(pair homes consolidated)* | Migration 2 (2026-07-16): `binaryPairs/{NRTL,UNIQUAC,Wilson}` → `parameters/{NRTL,UNIQUAC,Wilson}` (5 public pairs post-scrub), `henrysLaw/` → `parameters/Henry/` (205), `parameters/electrolyte/{pitzer,eNRTL}` → `parameters/{Pitzer,eNRTL}`, `parameters/eos/kij` → `parameters/SRK/`. ONE spelling across every tier (per-node · case · snapshot · standards · local) | `[WORKS]` |

*(`propertyPackages/` — the shared manifest catalogue — was RETIRED 2026-07-15:
the directory is deleted, no code reads it, and the runtime actively REFUSES a
`package <name>;` selector. The manifest lives INLINE in each case.)*

Data tiers: **`standards`** (public, curated) **> `local`** (private, gitignored,
your imports/estimates). The public `proposed` tier was retired (2026-07-13); any
doc still naming it is stale. Precedence is defined **per mechanism**, not as one
global chain — components: nearest case overlay > sealed snapshot > standards >
local; activity pairs add a per-node rung: per-node > case-root > per-node
snapshot > case snapshot > standards > local > announced ideal default. `local`
never shadows a verified `standards` record and every use is announced
`[local] UNVERIFIED`.

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

Reference manifests (INLINE in their cases — there is no shared package
catalogue): NaCl/NaOH Pitzer, KCl-ethanol eNRTL, CO₂-water Henry,
ethanol-water NRTL, N₂-CH₄ SRK. Tutorials: `props/electrolyte/scaling_ro_*`,
`props/electrolyte/pitzer02_nacl_package`, `steady/crystallisation/*`,
`steady/membranes/membrane0{7,8}_scaling`.

### Active-set projection (per-unit pair domain) — 2026-07-16

A per-unit property context may declare `activeComponents ( ... )`: the
component VECTOR stays GLOBAL (streams, package, flatten — the 2026-06-08
doctrine is untouched); only the PAIR MATRIX and its announcement restrict to
the declared domain. Every ACTIVE-ACTIVE pair must resolve to a RECORD — an
ideal assumption between active components is a model FACT and lives as a
normal pair record with `provenance { source assumedIdeal; }`, same house,
same route (never a special grammar, never a silent default). Pairs touching
an out-of-domain component are `outOfContext` (one aggregated line, no
lookup). Out-of-domain COMPOSITION during evaluation is advisory-tolerated
(the auto-init tear seed is the announced flow-averaged feed aggregate and
washes out); at CONVERGENCE it is hard-checked (the lithium route gate).
Reference: `lithiumBrinePlant` EXTRACTION (6-component domain, 15 owned
pairs: 5 tuned + 10 assumedIdeal). NRTL-first; UNIQUAC/Wilson follow-up.
`[WORKS]`

## 4. Solids & salts — how precipitation enters

A solid (halite, gypsum, calcite…) is a first-class **phase** with a **stored**
dissolution equilibrium in its OWN component record —
`components/<mineral>.dat` `solidPhases{}` (dissolution reaction, logK25 + ΔH +
analytic(T), solid thermochemistry; 64 minerals today). Exactly the PHREEQC
pattern (Choupo imported the USGS `phreeqc.dat`/`pitzer.dat`, public domain).
Precipitation is driven by `SI = log₁₀(IAP/Ksp)`, IAP = Π a(ion)^ν; multi-mineral
equilibration by active-set complementarity. `[WORKS]`.

The salt COMPONENT (`NaCl.dat`) carries identity + `dissociatesTo` +
`nonvolatile` + a `solid{}` crystal block — and **no** `standardThermochemistry` block:
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
  built. Vocabulary: **flowsheet/component basis** vs **aqueous-species basis** —
  the "apparent/true" naming is rejected; neither basis is more "true".)*
- Runtime estimation / high-T K extrapolation (Helgeson-style): Choupo curates K
  offline (van't Hoff logK25+ΔH); accepts a narrower T-window for glass-box clarity.
- Inert / non-conventional solids not in phase equilibrium (CISOLID / NC): only
  precipitating salts are modelled.
- Per-property runtime **route-tracing** (calculation-boundary transparency):
  provenance today lives at the DATA boundary, not the calculation boundary.
- Breadth / thermo-curation parity with commercial simulators — the value is
  transparency, not coverage.
