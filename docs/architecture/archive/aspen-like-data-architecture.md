> **SUPERSEDED 2026-07-01 by [electrolyte-data-architecture.md](electrolyte-data-architecture.md)** — the 8-home / 2-axis architecture (no basisMaps, dissociatesTo on components, no "true species"). Kept for history.

# Choupo Data Architecture — Aspen-like conceptual model, glass-box implementation

> **Status: DESIGN RATIFIED 2026-06-30 (do NOT relitigate); implementation
> pending (Phases 2–5).** The conceptual architecture below is settled — Phase 5
> (the engine reasoning apparent-vs-true) is committed. No data files have been
> moved and no physical-property values have been changed yet. It supersedes the
> earlier first-cut [`data-ontology.md`](data-ontology.md) /
> [`data-migration-map.md`](data-migration-map.md) (which captured a 7-kind subset
> without the property-package centre).

## Core principle

**Choupo copies Aspen's conceptual separation, not Aspen's closed
implementation.** The thermodynamic complexity is real and irreducible; the
architecture's job is to **expose it cleanly in explicit files**, not to hide it
inside overloaded component records, and not to bury it behind a wizard. The
center of the architecture is **the property package**, not `NaCl.dat`.

---

## The eight object kinds

1. **Apparent component** — the user-facing substance written in a case
   (`water`, `NaCl`, `MgSO4`, `ethanol`, `air`). Carries its intrinsic arity-1
   pure-component data and a `trueSpeciesMap` linking it to the species it
   dissociates into.
2. **True species** — the solver-facing real species (`Na+`, `Cl-`, `H2O`,
   `CO2(aq)`). Not necessarily user-facing.
3. **Solid phase** — a real solid / crystal phase that participates as an
   independent phase / equilibrium object (`halite`, `gypsum`, `calcite`, `ice`).
4. **Chemistry set / reaction** — a reaction or equilibrium definition
   (`NaCl(s) <=> Na+ + Cl-`, carbonate speciation, ion exchange).
5. **Property method** — the *equations* of a method and the parameter *types* it
   requires (`NRTL`, `Pitzer`, `eNRTL`, `PengRobinson`). A method is the form, not
   the numbers.
6. **Parameter databank** — the *values* a method consumes that are not naturally
   owned by one component (binary pairs, Pitzer ion-pair / mixing parameters,
   Henry pairs, group-contribution parameters).
7. **Property package** — **the central object.** Selects the components, the
   component approach (apparent vs true), the active chemistry, the active
   property methods, the required parameter sets, and the reported property sets.
8. **Property set** — a named reportable quantity (`osmoticPressure`,
   `waterActivity`, `ionicStrength`, `pH`, `saturationIndex`,
   `apparentComposition`, `trueComposition`).

### Conceptual flow

```
apparent components
    ↓
true species
    ↓
chemistry / reactions / equilibria
    ↓
property method
    ↓
model parameters / databanks
    ↓
property package          ← the case selects THIS
    ↓
unit operations
    ↓
property sets / reports
```

---

## Why each separation exists (implementation rationale)

**Apparent vs true species.** The user writes `NaCl`; the electrolyte solver works
in `Na+` + `Cl-`. Forcing the user to enumerate ions, or forcing the solver to
re-derive them from a molecular formula, both fail. The apparent component carries
a `trueSpeciesMap` (`Na+ 1, Cl- 1`); the package's `componentApproach` decides
whether a unit operation sees apparent or true composition. One substance, two
views, declared once.

**Chemistry separate from components.** `NaCl(s) <=> Na+ + Cl-` is not a property
of `NaCl` the component, of `Na+` the ion, or of `halite` the solid — it is a
*relationship between them*. Storing it on any single record makes that record the
owner of a fact it does not solely determine. A chemistry record names the
reaction and its **primary** equilibrium data (measured solubility anchor, `logK`,
dissolution enthalpy for the T-dependence) — never a derived `Ksp`/`Hf_solid`
(arity-1: derivatives stay underived).

**Property method separate from parameters.** A method (`NRTL`, `Pitzer`) is a set
of *equations* plus a manifest of the *parameter types* it needs. The parameters
are the *fitted numbers*. Separating them lets the same Pitzer method run on many
ion-pair databanks, lets a databank be re-fitted without touching the equations,
and makes the validation boundary obvious (the method declares what it requires;
the package audit confronts that against what the databank supplies).

**The property package as the central object.** A case must not merely list
components and hope the engine guesses the rest. It **selects a property package**,
and the package fixes: which components, apparent or true, which chemistry is
active, which methods compute each phase, which parameter databanks feed them, and
which property sets are reported. This is the single object a case author reasons
about — it converts "seven scattered concerns" into "one selection over seven
clean layers."

**Property sets for reporting.** `osmoticPressure`, `saturationIndex`,
`trueComposition` are *derived quantities a user wants reported*, not stored data.
Naming them as first-class property sets lets a package declare its report surface
explicitly, and lets a unit operation or post-processor ask for them by name.

**Aspen-conceptual but glass-box.** Aspen evolved this separation over decades and
it is correct. What Choupo rejects is Aspen's *implementation*: closed databanks,
an opaque wizard, hidden generated chemistry, undocumented parameter provenance.
Choupo implements the same concepts with **explicit files, explicit links,
readable chemistry, readable packages, auditable parameter records**, and
**generated indexes only for runtime convenience**.

---

## The arity rule (pure properties stay with the substance)

**Intrinsic arity-1 data stay with the apparent or true component record**, where
they are user-auditable: molecular weight, Antoine vapour pressure, pure heat
capacity, pure density, pure viscosity, critical properties. **Do not fragment
every pure property into model folders** — there is no `parameters/pure/<model>/`
explosion.

**Model-specific arity-2-or-higher data go to `parameters/`**, because a pair /
group / interaction parameter has no home in any single component: NRTL / UNIQUAC
/ Wilson binary parameters, Pitzer ion-pair and mixing parameters, eNRTL
parameters, Henry pairs, group-contribution parameters.

So: **intrinsic → the substance; method-specific interaction data → `parameters/`;
`propertyMethods/` define the equations and required parameter types;
`propertyPackages/` select which methods and chemistry are active.**

---

## Worked example — NaCl

`NaCl.dat` must **not** become a universal file holding all NaCl-related data. It
is the user-facing apparent salt and **links** to the rest:

```
data/standards/components/apparent/NaCl.dat
    - identity, formula, CAS, molecular weight
    - nonvolatile true
    - trueSpeciesMap: Na+ 1, Cl- 1
    - links to chemistry (halite) and true-species records

data/standards/components/true/aqueous/Na+.dat        - charge, aqueous thermo data
data/standards/components/true/aqueous/Cl-.dat        - charge, aqueous thermo data
data/standards/components/true/solids/halite.dat   - formula NaCl, density, habit

data/standards/chemistry/salts/halite.dat
    - reaction NaCl(s) <=> Na+ + Cl-
    - solubility / logK / K_SALT representation
    - dissolution enthalpy (for the T-dependence) if used

data/standards/parameters/electrolyte/pitzer/pairs/Na-Cl.dat
    - Pitzer pair parameters for Na+ / Cl-

data/standards/propertyMethods/electrolyte/pitzer.dat
    - definition of the Pitzer method: required parameter types, required
      species / equilibrium inputs

data/standards/propertyPackages/aqueousNaCl_pitzer.dat
    - the case-facing selection object (see below)
```

---

## Target architecture

```
data/
  standards/
    components/
      apparent/                      water.dat NaCl.dat MgSO4.dat ethanol.dat lactose.dat air.dat
      true/
        molecular/                   H2O.dat CO2_aq.dat NH3_aq.dat
        ions/                        Na+.dat Cl-.dat H+.dat OH-.dat Mg+2.dat SO4-2.dat
        solids/                      halite.dat gypsum.dat calcite.dat ice.dat

    chemistry/
      aqueous/                       NaCl_water.dat carbonate.dat sulfate.dat acid_base.dat
      salts/                         halite.dat gypsum.dat calcite.dat
      gasLiquid/                     CO2_water.dat NH3_water.dat H2S_water.dat
      ionExchange/                   generic_resin.dat

    propertyMethods/
      molecular/                     ideal.dat NRTL.dat UNIQUAC.dat Wilson.dat PengRobinson.dat SRK.dat
      electrolyte/                   idealElectrolyte.dat pitzer.dat eNRTL.dat ENRTL_RK.dat

    parameters/
      pure/                          README.md     (pure props live with the substance; see arity rule)
      binary/                        NRTL/ UNIQUAC/ Wilson/
      electrolyte/                   ions/ salts/ pairs/ mixing/ eNRTL/ pitzer/
      henry/                         CO2_water.dat NH3_water.dat

    propertyPackages/                aqueousNaCl_ideal.dat aqueousNaCl_pitzer.dat
                                     organic_NRTL.dat electrolyte_eNRTL_RK.dat

    propertySets/                    osmoticPressure.dat waterActivity.dat pH.dat
                                     ionicStrength.dat saturationIndex.dat
                                     apparentComposition.dat trueComposition.dat

    assets/                          membranes/ materials/ adsorbents/ utilities/ resins/

  proposed/                          (same structure as standards/, plus imports/coolprop|chemsep|other)
  generated/                         indexes/ flatCaches/
```

---

## The center: the property package

A case **does not merely list components — it selects a property package.**

```
propertyPackage aqueousNaCl_pitzer
{
    components        { water; NaCl; }
    componentApproach apparent;

    chemistry         { include NaCl_water; include halite; }

    propertyMethod
    {
        liquid  electrolyte.pitzer;
        vapour  idealGas;
        solid   saltEquilibrium;
    }

    parameters
    {
        ions    electrolyte/ions;
        pairs   electrolyte/pitzer/pairs;
        salts   electrolyte/salts;
        henry   henry;
    }

    propertySets
    {
        osmoticPressure; waterActivity; ionicStrength;
        saturationIndex; apparentComposition; trueComposition;
    }
}
```

The package determines the **component approach** (apparent or true), the **active
chemistry**, the **active property methods** per phase, the **required parameter
sets**, and the **reported property sets**. The unit operations consume the
package; they never re-decide thermo.

---

## Relationship to the existing `thermoPackage` (the compatibility path)

Choupo cases today carry a `thermoPackage` (components + a global activity/EoS
model). The `propertyPackage` is its **superset**: a simple molecular case is a
package with `componentApproach apparent`, no `chemistry`, one liquid method, and
no electrolyte parameters — i.e. exactly today's `thermoPackage` with the new
fields defaulted/empty. Migration path: `thermoPackage` stays loadable and is
read as a degenerate `propertyPackage`; new electrolyte/geochemistry cases author
a full `propertyPackage`. The two are not parallel concepts — one is the lean
projection of the other.

## Relationship to the flat-components / O(1) decision

Splitting `components/` into `apparent/` + `true/{molecular,ions,solids}` is a
**source-layout** change. The runtime by-name O(1) lookup (the flat-components
decision, `CLAUDE.md` §7, 2026-06-07) is preserved by **`generated/indexes/`** and
**`generated/flatCaches/`**: the source is organised by kind for review and Git; a
generated index serves the loader. The engine never directory-walks the new tree.

---

## What to copy from Aspen, and what not to

**Copy (the concepts):** apparent components · true species · chemistry sets ·
property methods · parameter databanks · property packages · property sets.

**Do NOT copy (the implementation):** closed data · opaque wizard · hidden
generated chemistry · undocumented parameter provenance.

**Choupo is Aspen architecture with an open-source, glass-box implementation:**
explicit files, explicit links, readable chemistry, readable property packages,
auditable parameter records, generated indexes only for runtime convenience.

> **Aspen-like conceptual model; OpenFOAM-like explicit files.**
