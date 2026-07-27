# flashComplex — the design-driver case (2026-07-26/27)

**Status: SPECIFICATION.  This case does not run.**  It is the case the
architecture must grow to serve — authored first, reviewed by Vítor, and
only then implemented in slices (each slice keeping the full suite green).
It graduates to `tutorials/` the day `choupoSolve` solves it.

## The physical system

One vessel, 308.15 K, 2 atm.  Feed: water, benzene, ethanol, N₂, CO₂,
NH₃, H₂S, acetic acid, suspended CaCO₃.  **Five phases may coexist:**

| phase | members | why it is here |
|---|---|---|
| vapour | N₂, CO₂, NH₃, H₂S, HAc + (HAc)₂, H₂O, EtOH, benzene | the inert N₂ guarantees V > 0 — "no vapour" ambiguity is dead by construction |
| aqueous liquid | water + 4 acid-base families + Ca²⁺ + dissolved EtOH/N₂ | the speciation network; ONE pH couples everything |
| organic liquid | benzene + ethanol **only** (declared admission) | LLE with a declared, announced approximation |
| solid: calcite | CaCO₃ | fed; dissolves or grows with pH and p_CO₂ |
| solid: NH₄HCO₃ | ammonium bicarbonate | **not fed** — appears if the NH₃+CO₂ loading crosses saturation |

The two solids share the carbonate ladder (common-ion coupling); the four
families (carbonate, ammonia, sulfide, acetate) share the H⁺; the gas phase
moves both through the Henry legs.  Nothing is decorative.

## Where each thing is declared (merged form, 2026-07-27)

| what | where | note |
|---|---|---|
| the substances the student feeds | `0/feed` | only what was introduced before mixing — never ions |
| the chemistry each substance brings | `constant/components/<name>.dat` | species it introduces + its own equilibria, with sources |
| reactions that couple TWO families (ion pairs) | `constant/complexes/` | they belong to no single component — the pair axiom |
| species identity + standard-state data | `constant/species/` | one home each; never an equilibrium constant |
| phases, models, approximations | `constant/thermoPhysPropDict` | the phases that MAY exist; the solver decides which do |
| the assembled system | printed at run time | the `[chemistry]` block — no file shows the union |

There is **no student-authored `chemistryDict`**: the reachability closure
assembles the system from the components fed, and the run prints it.  This is
not a convenience — it is more correct.  See `DESIGN_DECISIONS.md`: the
hand-written first draft of this very case missed three calcium ion pairs
that change how much calcite dissolves.

## One condition, two data routes

Every equilibrium in the case — homogeneous reaction, phase transfer,
precipitation — is the same condition:

```
sum(nu_i * mu_i) = 0          with   mu_i = mu_i^0 + R T ln a_i
```

What varies is only how the standard part is obtained, and each reaction
declares it:

```
standardGibbs
{
    authority  measuredK;      // or speciesData
    measuredK  { logK25 ...; dH ...; source "..."; }
    crossCheck speciesData;    // both exist -> both printed, plus the diff
}
```

`Sum(nu*mu0) = -RT ln K` is an identity, so these are not rival theories —
they are two measurements of the same quantity, and the one that was actually
measured is the one that should be stored.

## What this case forces, layer by layer

| layer | today | must become |
|---|---|---|
| **data** | fused H₂S record; NH₄HCO₃ absent; benzene–ethanol NRTL absent | decomposed H₂S record (both parents cited); NH₄HCO₃ solubility curated from primary; the missing NRTL pair curated |
| **grammar** | chemistryDict v1 = solids list; masters-only declaration | chemistryDict v2: full declared system, explicit stoichiometry, phase tags, declared-and-verified constants; `phases` block with admission rules |
| **engine** | 2-phase reactive Newton (V + aqueous); LL Gibbs separate; solids only in crystalliser units | one multiphase reactive flash: V + 2 liquids + N solids, saturation as **complementarity** (solid present ⇔ SI = 0, else SI < 0 and amount 0) — an active-set/phase-stability layer over the reactive Newton |
| **announce** | `chemical reactions: 3 (network in force)` | the full `[chemistry]` block above — system printed before solving, both directions explained, closure counted |
| **GUI** | no chemistry surface | a Chemistry tab rendering the same structured object |
| **docs** | — | the theory-to-case map page (course equations ↔ declared dict ↔ output) |

## Curation shopping list (before it can ever run)

- [ ] `H2S-physical-dissolution` record (decomposed, INTERIM, both parents cited)
- [ ] `NH4HCO3` solubility from primary (Trypuć & Kiełkowska, J. Chem. Eng. Data) — the pKsp −0.25 here is order-of-magnitude only
- [ ] benzene–ethanol NRTL pair (public-licence primary)
- [ ] benzene component: role/`aqueousSpeciation none` facts
- [ ] species records: N2aq, H2Saq (exists), CO2aq label check, HAc2 (vapour dimer identity)
- [ ] operating-window check: does (T, P, feed) sit where BOTH solids are at
      saturation and both liquids form?  (tune T/P/feed when solvable)

## Self-contained (Vítor, 2026-07-27): the data lives IN the case

`constant/` mirrors every record the declaration references — components,
species, chemistry — even though most also live in `data/standards/` (the
sealed-corpus doctrine: the student finds the WHOLE system in one folder).
Records that do NOT exist in standards yet are DRAFTS, loudly marked
(`reviewStatus interim;`): `components/NH4HCO3.dat` (solubility order-of-
magnitude only) and `chemistry/H2S-physical-dissolution.dat` (the
decomposed constant, both parents cited).  The benzene–ethanol NRTL pair
is deliberately NOT drafted — a placeholder with invented coefficients
would be a fabricated record (`parameters/NRTL/
benzene-ethanol.CURATION-REQUIRED.md`).  The `propertyManifest` (sha256
seal) is minted by `bin/choupo-import` at graduation, when the case first
runs.

A free verification example the mirrors expose: the student declares
calcite as the Ksp form (CaCO₃ = Ca²⁺ + CO₃²⁻, pKsp 8.48) while the
catalogue record (`components/CaCO3.dat` solidPhases) stores the PHREEQC
acid form (CaCO₃ + H⁺ = Ca²⁺ + HCO₃⁻, logK 1.879) — and the two agree
exactly through the bicarbonate step: −8.48 + 10.33 = 1.85 ≈ 1.879.  The
declared-and-verified layer must do THIS conversion, not string matching.

## Open design questions (the passo-a-passo)

- **Q1 — phase tags:** every stoichiometry term carries `phase …;` explicitly
  (as drafted).  Keep fully explicit, or default `aqueous` and tag only the
  exceptions?  (Explicit = pedagogical; default = terser dicts.)
- **Q2 — admission rules:** `admits ( ethanol )` as drafted treats phase
  membership as a declared approximation (announced, delimited).  Right home
  and right name?  Alternative: `members ( benzene ethanol )` listing
  everything including the solvent.
- **Q3 — formable solids:** must NH₄HCO₃ appear in `components ( … )` even
  though it is never fed, or is the `phases` entry + chemistryDict record
  enough identity?  (Today's doctrine: streams carry components — a cake
  outlet stream needs the component to exist.)
- **Q4 — the Raoult legs:** the K-bearing equilibria live in chemistryDict;
  the γ·x·psat legs live with the models.  Should the chemistryDict list
  them anyway (structure only, no constant) so the student sees ONE complete
  ladder — or is the split (constants vs models) itself the lesson?
- **Q5 — declared constants:** pK declared-and-verified in every entry (as
  drafted), or optional (declare structure always, values only when the
  course wants the cross-check exercise)?
- **Q6 — SETTLED (Vítor, 2026-07-27): the unit stays `isothermalFlash`.**
  A new type would force gatekeeping classifications (which components
  "may" run in which flash) and split the flash world in two.  A flash
  holds T and P and splits into whatever phases the DECLARED thermo world
  admits; the repertoire grows in the `thermoPhysPropDict` formulation
  (the `phases` block), never in the unit.  One flash to teach, forever.

## Relations

- `docs/design/equilibrium-parameterisation-identity.md` — typed identity +
  convention profiles (the H₂S decomposition executes its D6 finding).
- `docs/design/standard-state-transfer-adr.md` — NOT triggered here
  (water-solvent aqueous phase); the organic phase's NRTL is symmetric-
  convention and self-contained.
- CLAUDE.md §aqueous chemistry / §fractal units — the declared-system v2
  grammar must subsume, never fork, the settled doctrine.
