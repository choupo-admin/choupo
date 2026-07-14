> **SUPERSEDED 2026-07-01 by [electrolyte-data-architecture.md](electrolyte-data-architecture.md)** — the 8-home / 2-axis architecture (no basisMaps, dissociatesTo on components, no "true species"). Kept for history.

# Choupo Data Ontology

> **SUPERSEDED (2026-06-29) by [`aspen-like-data-architecture.md`](aspen-like-data-architecture.md)**
> — the fuller Aspen-like model (apparent/true components, chemistry sets,
> property methods, parameter databanks, **property packages as the centre**,
> property sets). This first-cut 7-kind doc is kept for history; read the Aspen
> doc for the canonical proposal.

> **Status: PROPOSAL (not yet implemented).** This document defines a *target*
> data architecture. No files have been moved and no physical-property values
> have been changed by adopting it. The current `data/standards/` tree (flat
> `components/`, `electrolyte/ions.dat`, `electrolyte/pairs.dat`, …) remains the
> live, loadable source. Migration is described in
> [`data-migration-map.md`](data-migration-map.md) and is incremental, by object
> kind, and reversible.

Choupo keeps the existing **`standards/` vs `proposed/`** split (curated,
committee-managed reference data vs staged data awaiting promotion). What this
document adds is a clearer **ontology** *underneath* that split: today the folder
layout mixes object kinds, and in particular `components/` risks becoming a
dumping ground for molecular components, apparent salts, pseudo-components,
mixtures, solids, and tutorial-specific objects. Making the object kinds explicit
keeps each record in a place that states what it *is*.

---

## The seven object kinds

### 1. Component
A **user-facing substance name** used in a flowsheet — what the author writes in
`thermoPackage`. A component may be molecular, an apparent electrolyte, a
pseudo-component, or a mixture alias. **Its intrinsic arity-1 pure-component
properties stay here, in the component file.**
*Examples:* `water`, `ethanol`, `NaCl`, `MgSO4`, `air`.

### 2. Species
A **solver-facing real chemical species**, used internally by electrolyte,
reaction, and speciation models. A species is **not necessarily** a user-facing
flowsheet component.
*Examples:* `Na+`, `Cl-`, `H+`, `OH-`, `HCO3-`, `CO2(aq)`.

### 3. SolidPhase
A **real solid phase or crystal form, when it participates as an independent
phase / equilibrium object.**
*Examples:* `halite`, `gypsum`, `calcite`, `ice`.

> **Rule — do NOT move every `solid{}` block into `solids/`.** A solid earns its
> own `solids/` record when it is an **independent phase**, especially a
> mineral/solid phase participating in a dissolution/precipitation equilibrium.
> A molecular crystal whose solid data are simple intrinsic arity-1 component
> data (e.g. a crystallising organic that only melts/freezes) **may remain inline
> inside the component file.** The trigger is *"is there a separate solid–liquid
> equilibrium object?"*, not *"is it a solid?"*.

### 4. ModelParameterSet
**Parameters belonging to a named model** — meaningless without naming the model
they parameterise. **Pure-component arity-1 properties do NOT go here.**
*Examples:* NRTL binary pair, Wilson binary pair, UNIQUAC pair, UNIFAC group
parameters, Pitzer Na–Cl, Pitzer mixing, eNRTL parameters.

### 5. Equilibrium
A **chemical or phase equilibrium definition.** An equilibrium record may hold
**primary** equilibrium data: the reaction definition, measured solubility
anchors, dissolution enthalpy, `logK`, and temperature-dependence data.
*Examples:*
`NaCl(s) <=> Na+ + Cl-`, `CO2(g) <=> CO2(aq)`, `HCO3- <=> H+ + CO3--`,
ion-exchange equilibria.

### 6. Asset
An **engineering object**, not a thermodynamic substance — something a unit
operation *uses*.
*Examples:* NF270 membrane, SS316, activated carbon, a cooling-water utility, an
ion-exchange resin.

> **Rule — membrane (and asset) intrinsic data vs a transport model.** The same
> "which home?" rule as `SolidPhase`. A membrane's **intrinsic specification** —
> the as-built asset: identity, material, area, the rejection/permeability spec
> that identifies *this* membrane — stays in `assets/membranes/`. A record goes to
> `models/transport/membraneTransport/` **only** when it is a **separate, swappable
> transport-model parameterisation** (e.g. a solution-diffusion or DSPM-DE
> parameter set that could be re-fitted, or swapped for the same membrane). The
> trigger is *"is this a distinct transport model being parameterised, or the
> asset's own intrinsic data?"* — intrinsic → the asset; a separate model fit →
> `models/transport/`. Never split a membrane's intrinsic spec across both.

### 7. Mechanism
A **kinetic reaction network**.
*Examples:* combustion mechanisms, aqueous kinetic mechanisms, catalytic
mechanisms.

---

## The design rule

> - A **Component** is what the user writes in a flowsheet.
> - A **Species** is what the thermodynamic or electrolyte solver may use internally.
> - A **SolidPhase** is a real solid/crystal phase **when it participates independently**.
> - A **ModelParameterSet** belongs to a named model.
> - An **Equilibrium** defines a reaction or phase equilibrium.
> - An **Asset** is an engineering object used by a unit operation.
> - A **Mechanism** is a kinetic reaction network.

---

## The arity rule (the load-bearing rule)

**Arity-1, intrinsic properties stay with the substance/component file** — never
scattered into a model folder. A pure-component property stands alone with its
molecule.
*Stays in the component file:*
pure vapour pressure · pure liquid heat capacity · pure density · pure viscosity
· pure solid heat capacity · molecular weight · critical properties · Antoine
coefficients · any pure-component correlation.

**Arity-2 or higher — model-specific interaction data — go to `models/`**, because
a pair/group parameter has no home in any single component.
*Goes to `models/`:*
NRTL binary parameters · UNIQUAC binary parameters · Wilson binary parameters ·
UNIFAC group parameters · Pitzer ion-pair parameters · Pitzer mixing parameters ·
eNRTL parameters.

> **There is NO `models/pure/` branch.** Pulling `water.dat`'s Antoine /
> heat-capacity / density / viscosity into `models/pure/…` would fragment one
> substance's intrinsic truth across many files — the opposite of arity-1. Pure
> properties remain with the substance; only pair/group/interaction parameters
> live in `models/`.

This rule keeps the ontology consistent with `docs/ai/data-doctrine.md`
(`ARITY → SCOPE → KIND`): arity still decides *what each file holds*; the ontology
only makes **KIND** explicit at the *folder* level. Derivatives are still never
stored — a salt's solid formation stays `Hf_solid = Σν·hfAq − dH_soln`
(the `salt-formation-ion-derived` rule), so a `SolidPhase` or `Equilibrium`
record carries **primary** data (measured solubility, cited `logK`, primary
`dH_soln`), never a number another record already determines.

---

## How this honours the flat-components decision

The flat-components / O(1) lookup decision (`CLAUDE.md` §7, 2026-06-07) — exact
`components/<name>.dat` resolution, **no startup directory-walk** — is preserved by
the **`generated/flatCaches/`** layer: the *source* is organised by kind for human
review and Git, while a *generated* flat cache serves the by-name lookup the
loader expects. The organisation is a source-layout-plus-generated-index concern,
never a runtime directory-walk. The day this lands, the loader still sees a flat,
by-name surface — so the ontology **complements** the 2026-06-07 decision rather
than relitigating it.

---

## Target architecture

```
data/
  standards/
    components/
      molecular/
      apparentSalts/
      pseudo/
      mixtures/

    species/
      ions/
      aqueous/
      gases/
      radicals/

    solids/
      minerals/
      other/

    models/
      activity/
        NRTL/
        UNIQUAC/
        Wilson/
        UNIFAC/
      electrolyte/
        pitzer/
          pairs/
          mixing/
        eNRTL/
      transport/
        diffusion/
        membraneTransport/

    equilibria/
      aqueousSpeciation/
      mineralSolubility/
      gasLiquid/
      solidLiquid/
      ionExchange/

    assets/
      membranes/
      materials/
      adsorbents/
      utilities/
      resins/

    mechanisms/

  proposed/
    components/
      molecular/
      apparentSalts/
      pseudo/
      mixtures/
    species/
      ions/
      aqueous/
      gases/
      radicals/
    solids/
      minerals/
      other/
    models/
      activity/
      electrolyte/
      transport/
    equilibria/
      aqueousSpeciation/
      mineralSolubility/
      gasLiquid/
      solidLiquid/
      ionExchange/
    assets/
      membranes/
      materials/
      adsorbents/
      utilities/
      resins/
    mechanisms/
    imports/
      coolprop/
      chemsep/
      other/

  generated/
    indexes/
    flatCaches/
```

*(No `models/pure/` branch — see the arity rule.)*

---

## Worked example — NaCl

`NaCl` is the canonical case where one user-facing name fans out into several
distinct object kinds. The recommended separation:

```
standards/components/apparentSalts/NaCl.dat
    - identity
    - formula
    - CAS
    - molecular weight
    - type apparentSalt
    - nonvolatile true
    - ion stoichiometry: Na+ 1, Cl- 1
    - links to halite, the Na-Cl Pitzer pair, the mineral equilibrium

standards/species/ions/Na.dat
    - ion identity
    - charge
    - ion thermochemical data

standards/species/ions/Cl.dat
    - ion identity
    - charge
    - ion thermochemical data

standards/solids/minerals/halite.dat
    - solid phase identity
    - formula NaCl
    - density
    - crystal habit / shape factor if needed

standards/equilibria/mineralSolubility/halite.dat
    - reaction NaCl(s) <=> Na+ + Cl-
    - measured solubility anchor, logK, or equivalent primary equilibrium data
    - dissolution enthalpy if used for temperature dependence
    - temperature dependence if available

standards/models/electrolyte/pitzer/pairs/Na-Cl.dat
    - Pitzer pair parameters for Na+ / Cl-
```

**The key principle:** `NaCl.dat` must **not** become a universal file containing
all NaCl-related data. It is the **user-facing apparent-salt component**, and it
**links** to the internal species, the solid phase, the equilibrium, and the
model-parameter records. Each fact lives once, in the record whose kind it
belongs to; the component is the entry point that ties them together by name.

> **Molecular-crystal note (sucrose / lactose style).** A molecular solid or
> crystallising organic compound does **not** automatically need a separate
> `solids/` file. If its solid data are simple intrinsic arity-1 component data,
> they may remain inside the component file. Create a separate `SolidPhase` record
> only when the solid is an **independent phase object** — especially when it
> participates in a separate solid–liquid equilibrium object.

---

## The architecture in one phrase

**Aspen-like ontology, OpenFOAM-like files, with arity-1 intrinsic properties
kept with the substance.**

Choupo follows the *conceptual* structure used by Aspen electrolyte systems —
apparent components are user-facing, true species are solver-facing,
reactions/equilibria define the chemistry, and property methods supply
model-specific parameters. Choupo does **not** copy Aspen's hidden
databank/wizard style: it implements the same conceptual separation with
**explicit, open-source files that are easy to review, version, and extend
through Git.**
