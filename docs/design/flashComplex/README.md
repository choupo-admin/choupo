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
| reactions that couple TWO families (ion pairs) | `constant/chemistry/aqueousComplexes/` | they belong to no single component — the pair axiom |
| species identity + standard-state data | `constant/species/` | one home each; never an equilibrium constant |
| phases, models, approximations | `constant/thermoPhysPropDict` | the phases that MAY exist; the solver decides which do |
| the assembled system | printed at run time | the `[chemistry]` block with an ACTIVATION REASON per entry — see [`EXPECTED_OUTPUT.md`](EXPECTED_OUTPUT.md) |
| the converged stream | `converged/<name>` | three levels: species (what travels) · elements+charge (what balances) · inputLedger (what was fed) |

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
| **grammar** | chemistry assembled from `aqueousSpeciation` facts; no per-reaction declaration visible | chemistry travels WITH the component (`aqueousChemistry { introduces … reactions … }`), cross-family reactions in `chemistry/aqueousComplexes/`, `standardGibbs { authority … }` per reaction, `phases` block with declared approximations |
| **engine** | 2-phase reactive Newton (V + aqueous); LL Gibbs separate; solids only in crystalliser units | one multiphase reactive flash: V + 2 liquids + N solids, saturation as **complementarity** (solid present ⇔ SI = 0, else SI < 0 and amount 0) — an active-set/phase-stability layer over the reactive Newton |
| **announce** | `chemical reactions: 3 (network in force)` | the full `[chemistry]` block above — system printed before solving, both directions explained, closure counted |
| **GUI** | no chemistry surface | a Chemistry tab rendering the same structured object |
| **docs** | — | the theory-to-case map page (course equations ↔ declared dict ↔ output) |

## Curation shopping list (before it can ever run)

- [ ] **`CaHCO3-formation` in `data/standards/` is CORRUPT** — `logK25 −4.059;
      dH 158117.5` against its own cited source (`log_k 1.106,
      delta_h 2.69 kcal`) and its siblings (Mg/Sr/Ba at ≈ +1.0).  Caught by
      `bin/curate/check_family_outliers.py`.  Fixing it re-seals ~34 cases →
      its own reviewed wave.  `chemistry/aqueousComplexes/CaHCO3-formation.dat` here already
      carries the corrected value and the full evidence.
- [ ] `NH4HCO3` solubility from primary (Trypuć & Kiełkowska, J. Chem. Eng.
      Data) — the `logK25 0.25` drafted here is order-of-magnitude only
- [ ] benzene–ethanol NRTL pair (public-licence primary) — deliberately not
      drafted, see `constant/parameters/NRTL/benzene-ethanol.CURATION-REQUIRED.md`
- [ ] aqueous formation data (`hfAq`, `sAq`) for the neutral secondary
      species — CO2aq, NH3aq, H2Saq, HAc, N2aq — and for the three complex
      products.  Without them the species-thermodynamics **cross-check is
      unavailable**: only 3 of 59 curated reactions can be checked today
      (and one of those three, HSO4-formation, disagrees by 5.8 kJ/mol).
- [ ] the H₂S physical constant (−0.94, decomposed in `components/H2S.dat`)
      promoted to a standards record with both parents cited
- [ ] operating-window check: does (T, P, feed) sit where BOTH solids are at
      saturation and both liquids form?  (tune when solvable)

## Self-contained: the data lives IN the case

`constant/` carries every record the declaration references — components,
species, complexes, parameters — so the student finds the whole system in one
folder (the sealed-corpus doctrine).  Records that do not exist in standards
yet are DRAFTS, loudly marked `reviewStatus interim;`.  The `propertyManifest`
(sha256 seal) is minted by `bin/choupo-import` at graduation, when the case
first runs.

A verification the mirrors expose for free: the case declares calcite in the
**Ksp form** the course teaches (CaCO₃ = Ca²⁺ + CO₃²⁻, pKsp 8.450) while the
catalogue stores the PHREEQC **acid form** (CaCO₃ + H⁺ = Ca²⁺ + HCO₃⁻,
log K 1.879) — and they agree exactly through the bicarbonate step:
−8.450 + 10.329 = 1.879.  The declared-and-verified layer must do *this*
conversion, never a string match.

## The output is part of the design

[`EXPECTED_OUTPUT.md`](EXPECTED_OUTPUT.md) specifies what the run must print:
the closure's **activation reason** for every equilibrium (a reaction enters
because a path exists from what was fed — never because the catalogue holds
it), the equations in course form, the standard-Gibbs authority and
cross-check per reaction, the two named refusals, the three-level stream, and
the optional apparent-component projection.

## Design questions — where they landed

Full reasoning in [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md).

| | question | outcome |
|---|---|---|
| **Q1** | phase tags on every stoichiometric term? | **kept explicit** — the term reads as physics, not as a lookup |
| **Q2** | how a liquid phase declares who may join it | **`members` + `approximation { excludes … reason … }`** — an approximation should name what it leaves out |
| **Q3** | must a formable solid be listed as a component? | **dissolved** by `componentDiscovery fromFeedAndDeclaredPhases` — the list is gone |
| **Q4** | do the Raoult legs belong in the chemistry ladder? | **no** — they carry no K, so they stay with the phase models; but each component now *says so* in a `vapourLiquidEquilibrium` block |
| **Q5** | declared-and-verified constants? | the constant lives inside `standardGibbs` with its `authority`; the cross-check against species data is automatic, no separate ceremony |
| **Q6** | a new `multiphaseReactiveFlash` unit type? | **no** (Vítor) — a flash is a flash; the phase repertoire grows in the formulation, never in the unit |

### Still open — one seam

The projection of the converged aqueous state back onto stream components is
**not unique**: with c cations and a anions the salt representation has
exactly **(c−1)(a−1) degrees of freedom** (K⁺/Na⁺ × Cl⁻/SO₄²⁻ → 1 dof; a real
brine → 9).  The physics is unaffected — elements and charge are what cross
the boundary, and the next unit re-speciates — but the *labels* are a choice,
and a choice must be declared.  Needs: a declared projection convention, plus
a loud refusal when the declared component set cannot span the ion totals
(a "cross" salt precipitated that nobody declared).

## Relations

- [`../equilibrium-parameterisation-identity.md`](../equilibrium-parameterisation-identity.md) — typed identity + convention profiles
- [`../standard-state-transfer-adr.md`](../standard-state-transfer-adr.md) — the mixed-solvent transfer term (contract only; not triggered by this case)
- `CLAUDE.md` §aqueous chemistry, §ThermoResolver — the doctrine this must extend, never fork
