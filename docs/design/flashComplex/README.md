# flashComplex — the design-driver case (2026-07-26/27)

**Status: IT RUNS (2026-07-30).**  `choupoSolve` closes it — four phases at
once, jointly:

    V/F = 0.063491        |r|max(joint) = 4.63e-13
    organic  23.25 % of the backbone liquid  (x_benzene = 0.951)
    calcite  183.5 mg/kg, driven to SI = 0
    bottoms  phases { aqueous { … speciation } organic { … } solid { … } }

It was authored FIRST, as a specification, and implemented in slices against
it — each slice keeping the full suite green.  The last one it needed was the
stream file learning to name its phases (2026-07-30); `flash19` is the
smaller case that proved the four-phase path before this one was retried.

**It has NOT graduated to `tutorials/` yet, and the reason is curation, not
physics.**  Sealing refuses, correctly:

  * NINE `constant/species/*.dat` were byte-identical copies of the standard
    records — second homes for values that already had one.  DELETED
    (2026-07-30); the case runs identically without them, which is what a
    duplicate means.
  * ~~TEN `constant/components/*.dat` differ from the catalogue in REAL
    DATA~~ — **MEASURED AND FALSE (2026-08-02).**  Vítor ruled "mete no
    catálogo curado"; measuring first is what stopped that from
    *impoverishing* the catalogue.  Across the ten records, with block
    comments stripped and whitespace normalised, the case added **two
    lines** and *lost* **93**: every physical constant was byte-identical,
    and the mirrors were missing `liquidViscosity`, `uniquac`,
    `ebulioscopic`, `associationFactor`, `diffusionVolume`, the `cosmo`
    sets and `aliases`.  Of the two additions, one (`uniquac { r 0.9200;
    q 1.4000; }`) restates the catalogue's own values inline — formatting,
    not data.
  * The ONE genuinely case-carried fact was **`water: aqueousSpeciation
    none;`** — required of every component inside an electrolyte system by
    the SystemClassifier contract (settled 2026-07-26), and simply missing
    from the curated water record.  That absence is *why* this case had to
    mirror water at all.  It is now **PROMOTED to the catalogue**, and the
    nine impoverished mirrors are **DELETED** — the same act, for the same
    reason, as the nine duplicate `species/` records deleted 2026-07-30.
    The case's `converged/` is byte-identical after the deletion, which is
    what "duplicate" means.
  * `NH4HCO3.dat` STAYS. It is not a curated value but a declared REFUSAL:
    its solubility product is available only as an order of magnitude
    (logK25 ≈ 0.25, a full log unit on a solid whose appearance changes the
    whole answer).  Promoting that into the frozen tier would be exactly
    the fabrication this project forbids; the named gap belongs with the
    case that names it.

So the honest reading of its status: **the engine serves it, and the data
provenance is now RESOLVED** — the blocker was one missing line in the
curated water record, not ten divergent files.

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

## Where each thing is declared (rewritten into the corpus form, 2026-07-27)

| what | where | note |
|---|---|---|
| the substances the student feeds | `0/feed` | only what was introduced before mixing — never ions |
| the topology | `system/flowsheetDict` | **two** outlets — a flash drum has a vapour nozzle and a bottoms nozzle; the phase split is a result |
| which network each substance joins, and how it maps onto that network's masters | `constant/components/<name>.dat` | two lines: `aqueousSpeciation` + `aqueousMapping` — never the reactions themselves |
| every reaction | `constant/chemistry/`, flat, one file per reaction | 13 of the 15 are byte-exact mirrors of the curated catalogue; a reaction is curated once and referenced |
| which solid phases are admitted | `constant/chemistryDict` | availability, not presence — whether they appear is the answer |
| species identity + standard-state data | `constant/species/` | one home each; never an equilibrium constant |
| phases, models, approximations | `constant/thermoPhysPropDict` | the phases that MAY exist; the solver decides which do |
| the assembled system | printed at run time | the `[chemistry]` block with an ACTIVATION REASON per entry — see [`EXPECTED_OUTPUT.md`](EXPECTED_OUTPUT.md) |
| the converged stream | `converged/<name>` | three levels: species (what travels) · elements+charge (what balances) · inputLedger (what was fed) |

The student authors **no reactions**: the reachability closure assembles the
system from the components fed, and the run prints it.  (`chemistryDict` is
not chemistry — it declares which solid phases are *admitted*, which is a
modelling choice, not a fact about the substances.)  This is
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
| **grammar** | one liquid surface plus a vapour; no slot for a second liquid phase | a declared **second liquid phase** with its membership and its approximation — the one named gap that stops this case running |
| **engine** | 2-phase reactive Newton (V + aqueous); LL Gibbs separate; solids only in crystalliser units | one multiphase reactive flash: V + 2 liquids + N solids, saturation as **complementarity** (solid present ⇔ SI = 0, else SI < 0 and amount 0) — an active-set/phase-stability layer over the reactive Newton |
| **announce** | `chemical reactions: 3 (network in force)` | the full `[chemistry]` block above — system printed before solving, both directions explained, closure counted |
| **GUI** | no chemistry surface | a Chemistry tab rendering the same structured object |
| **docs** | — | the theory-to-case map page (course equations ↔ declared dict ↔ output) |

## Curation shopping list (before it can ever run)

- [x] **`CaHCO3-formation` in `data/standards/` was CORRUPT** — `logK25 −4.059;
      dH 158117.5` against its own cited source (`log_k 1.106,
      delta_h 2.69 kcal`) and its siblings (Mg/Sr/Ba at ≈ +1.0).  **Corrected**;
      `bin/curate/check_family_outliers.py` now catches the class.
- [ ] `NH4HCO3` — either the solid formation datum, or a solubility product
      from primary (Trypuć & Kiełkowska, J. Chem. Eng. Data).  The
      order-of-magnitude `logK25 ≈ 0.25` is deliberately **not stored**: see
      `constant/components/NH4HCO3.dat`, which refuses instead.
- [ ] four NRTL pairs — `benzene-ethanol`, `aceticAcid-water`, `benzene-water`
      (`ethanol-water` is curated).  Deliberately not drafted; see
      `constant/parameters/README.md`.
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
| **Q3** | must a formable solid be listed as a component? | **yes** — `components ( … )` stays.  `componentDiscovery` was tried and withdrawn: it was a field with one possible value, and the manifest *is* the case's declaration of its property system |
| **Q4** | do the Raoult legs belong in the chemistry ladder? | **no** — they carry no K, so they stay with the phase models.  The `vapourLiquidEquilibrium` block that said so on each component was withdrawn: it restated doctrine per substance |
| **Q5** | declared-and-verified constants? | the constant lives in the reaction's own record; the cross-check against species data is automatic.  `authority` is written **only** where the number came from another reaction — twice in this case, not fifteen times |
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
