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

## The four arenas of equilibrium (all declared in `constant/chemistryDict`)

1. **Aqueous homogeneous** — 6 reactions (water, NH₄⁺, carbonic ×2, H₂S
   first step, HAc).  The absent HS⁻/S²⁻ second step is a *stated*
   curation decision (pK₂ contested by ~7 units in the literature).
2. **Gas–liquid (K-bearing)** — 5 Henry legs, incl. the H₂S *physical*
   constant **decomposed** from the fused PHREEQC record
   (logK_phys = −7.93 − (−6.994) = −0.94): the D6 dossier finding, executed.
3. **Vapour homogeneous** — the acetic dimerisation 2 HAc(g) = (HAc)₂(g).
4. **Solid–liquid** — calcite (pKsp 8.48) and NH₄HCO₃ (pKsp INTERIM).

Plus the Raoult-convention legs (H₂O, EtOH, benzene: γ·x·psat) that carry
no K and live with the phase models — see open question Q4.

## The ideal run output (what the student must see, verbatim sketch)

```
[chemistry] the declared system: 6 aqueous + 5 gas-liquid + 1 vapour +
            2 solid equilibria; 4 acid-base families sharing H+
[chemistry] every reaction checked: charge balance OK, element balance OK
[chemistry] (1) H2O = H+ + OH-                     pK(308.15 K) = 13.68   [PHREEQC analytic]
[chemistry] (2) NH4+ = NH3(aq) + H+                pK(308.15 K) =  9.05   [PHREEQC]
[chemistry] (3) CO2(aq) + H2O = HCO3- + H+         pK(308.15 K) =  6.31   [PHREEQC analytic]
[chemistry] (4) HCO3- = CO3-2 + H+                 pK(308.15 K) = 10.22   [PHREEQC analytic]
[chemistry] (5) H2S(aq) = HS- + H+                 pK(308.15 K) =  6.94   [PHREEQC]
[chemistry] (6) HAc(aq) = Ac- + H+                 pK(308.15 K) =  4.74   [Goldberg 2002]
[chemistry]     declared pK values verified against the catalogue: 6/6 agree
[chemistry] closure: 16 aqueous unknowns = 6 mass action + 6 family totals
            + 1 electroneutrality + 2 saturation complementarities + 1 solvent
[resolver]  organicLiquid admits ( ethanol ) -- DECLARED APPROXIMATION:
            water, HAc and dissolved gases excluded from the organic phase
            (real benzene holds ~0.2% water); announced, delimited, refused
            for anything unlisted
...
[flash]     phases formed: vapour 12.3 kmol/h | aqueous 61.2 | organic 25.8
            | calcite 0.62 | NH4HCO3 0.9   (pH 8.7, SI_calcite = 0.00,
            SI_NH4HCO3 = 0.00, both at saturation)
```

(Numbers illustrative; the *shape* of the output is the specification.)

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
- **Q6 — the unit type:** `multiphaseReactiveFlash` as a NEW unit type (as
  drafted), or grow `isothermalFlash` until it subsumes this?  A new type
  keeps the existing flash simple and teachable; growing one type avoids a
  zoo.

## Relations

- `docs/design/equilibrium-parameterisation-identity.md` — typed identity +
  convention profiles (the H₂S decomposition executes its D6 finding).
- `docs/design/standard-state-transfer-adr.md` — NOT triggered here
  (water-solvent aqueous phase); the organic phase's NRTL is symmetric-
  convention and self-contained.
- CLAUDE.md §aqueous chemistry / §fractal units — the declared-system v2
  grammar must subsume, never fork, the settled doctrine.
