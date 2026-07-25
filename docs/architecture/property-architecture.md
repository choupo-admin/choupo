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
| `chemistry/` | REAL equilibria (K + ΔH), one FLAT record per species/complex (70 today: aqueous speciation incl. the full phosphate/carbonate ladders, HSO₄⁻, HF, NH₃, H₂S; dissolved-gas equilibria O₂/N₂/CH₄/H₂; ion-exchange `…X` records).  The tree is physically FLAT — the speciation/gas/exchange grouping is the record's `recordType`/content, not a directory.  *(`mineralSolubility/`, `salts/` and `phases/solid/` were RETIRED — minerals folded into `components/` `solidPhases{}`, one substance = one file.)* | `[WORKS]` |
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

## 6b. The consolidation programme (audited 2026-07-25; two independent AI
## reviews converged — the plan of record until superseded)

The audit's finding, corroborated independently: the missing piece is not a
model, it is the CONTRACT between apparent components, model species, phase
eligibility, reactions and phase models — the volatile weak acid (NH₃, acetic,
phenol: ionises in the liquid AND transfers to the vapour) has no coherent
representation because the `role` enum conflates three axes and the
speciation world is separate from the ThermoPackage.  Programme, in order:

1. **Spike NH₃/water** `[WORKS]` (landed 2026-07-25): UNIT-LOCAL speciation —
   streams stay on the flowsheet/component basis on disk (the stream-state
   constitution is untouched; no ion ever reaches a 0/ or converged/ file);
   inside the unit the state speciates and chemical + phase equilibrium +
   electroneutrality solve SIMULTANEOUSLY (nested numerics — outer damped
   Newton in the classical (V, y) flash coordinates over an inner
   SpeciationSolver pass — with a JOINT residual acceptance, never
   flash-once/speciate-once).  The engine: `electrolyte::ReactiveVLE`,
   reached ONLY through `ThermoPackage::equilibrate()` (units implement no
   chemistry; the flash delegates).  Grammar: the REACTIVE shape of
   `electrolyteGammaPhi` — `aqueous { speciation { masters (...) } }` +
   `volatiles (...)`, each volatile served by its gas-liquid record
   (water's own record supplies the solvent VLE; no separate Antoine
   wiring).  Collapse: marker-element contract (refused when not closable,
   the ratified wording).  Reference: `steady/flash/flash09_nh3_water_reactive`
   (pH solved 9.90, ionised fraction 0.45 %, V/F 0.192 at 368 K/1 atm,
   joint residual 7e-11); idempotency (bubble-point boundary) and an
   apparent-basis recycle validated.  Still open in this slice: davies rung
   only (Pitzer joins later), ≤ 2 volatiles, TP flash only (no PH/duty),
   absorber01 physics upgrade, warm-start cache.  Acetic
   acid is spike #2 (adds Raoult-volatile transfer + VAPOUR-phase
   dimerisation, deliberately kept out of the foundational spike).
2. **Standard-state coherence gate**: declared convention ==
   activity-model implementation == reaction-K basis (the verifyCal pattern
   extended); the mechanical CONSUMPTION of the reference rung (Born term,
   McMillan-Mayer↔Lewis-Randall conversions) stays `[ROADMAP]` behind the
   mixed-solvent cases that need it.
3. **Retire the `role` enum's architectural load** (after the spike proves
   the shape): species identity × phase eligibility × representation basis ×
   per-phase model × reaction/transfer constraints — never one stored word.
4. Then the model additions on a stable base: Peneloux volume translation
   (with derived-property tests), ONE EoS-G^E rule (MHV2 first;
   Wong-Sandler/PSRK only against concrete cases), PC-SAFT association,
   carboxylic vapour association.

### Identifier typing before identifier cleanup (settled 2026-07-25, three-way)

Identifiers are BARE STRINGS today, and the component↔species link is made by
lexical equality (`in.totals[thermo.comp(i).name()]` in the membrane module is
the load-bearing example).  Measured consequence: every neutral aqueous
complex whose base name matches a component (`CaCO3aq`→`CaCO3`, `CO2aq`→`CO2`,
`NH3aq`→`NH3` — six of six checked) would collide on rename inside that very
mechanism.  The settled order, after one full round of proposals in both
directions:

* the historical suffixes (`aq`, `p`, `m`, `p2`, `m2`) are **technical debt
  created by the absence of typed identifiers** — neither chemistry nor
  architecture.  They are kept TEMPORARILY and are **not** promoted to a rule
  (a proposed mandatory-`aq` gate was built, run, and withdrawn the same day:
  it would have enshrined the workaround);
* **no partial migration**: renaming only the `p`/`m` class first was
  considered and rejected — one coherent migration, once, beats two waves of
  golden churn;
* the precondition is TYPED IDENTIFIERS: distinct identity spaces
  (`component:` / `aqueousSpecies:` / `solidPhase:` internally), every lookup
  resolving by type, the string-equality links removed, and a gate proving no
  untyped lookup remains;
* only then the single F2 migration: drop all suffixes, redox by Roman numeral
  (`CuI/CuII`, `FeII/FeIII`, `MnII/MnIII`), `Mg(SO4)2²⁻` as `MgSO4_2`,
  chemistry/ files named by REACTION (`ammonia-ionisation.dat`), never by
  species — file names validated only for format/uniqueness/non-deception,
  carrying no second ontology;
* sequencing inside F2: first a closed commit eliminating the six doubly-
  declared identities (CO3, H2PO4, HPO4, HSO4, MgOH, OH — watched, coherent),
  then the rename transaction; both on an unpublished branch, cases
  re-imported, corpus run with standards hidden, committed only green.

The identity gate (`check_species_identity.py`) pins the 59 historical keys —
the list may shrink in F2, never grow — and watches the six duplicates; that
instrumentation is what makes waiting for the typing safe.

Deferred by DESIGN (kept out while the engine refuses loudly what it cannot
represent): CPA (after PC-SAFT association, against a demonstrated case),
general solid solutions (`gamma_S = 1` pure-crystal is declared, not
implied), full polymer thermodynamics (the polycaprolactone case DECLARES
its molecular-surrogate approximation), a catalogue of α(T)/Psat variants.

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
