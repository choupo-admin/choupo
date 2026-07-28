# ADR — the standard-state transfer correction (D3)

**Status:** contract ratified (three-way, 2026-07-26); wording per Vítor's
final redaction conditions, same date.  **No implementation exists and none
is authorised by this ADR** — no parser, no data folder, no mathematical
form.  This document is the *named gap* made precise.

## Context

The composite mixed-solvent electrolyte v1 prices the molecular backbone
with the full curated NRTL pair and keeps the aqueous network's equilibrium
constants **water-referenced** (infinite dilution in pure water, molality
scale).  When the liquid is a mixed solvent (water + co-volatiles), the
standard state those constants were measured against is no longer the
solvent the ions actually live in.  The v1 decision, ratified: the ions stay
Davies on water-referenced molality, the solvent activity decomposes
multiplicatively, and **the medium (transfer) term is a NAMED next slice** —
never silently zero, never smuggled into a fitted constant.

This ADR is that slice's contract.

## Responsibility

> Correct the standard state of a species when the solvent composition
> differs from the reference state used by the equilibrium constant.

Nothing more: it does not select models, does not touch activity
coefficients inside a declared model's own domain, and does not exist for a
pure-water case (the correction is identically zero there *by definition of
the reference*, not by approximation).

## Conceptual interface

```
standardStateCorrection(
    SpeciesId        species,
    SolventComposition solvents,
    Temperature      T,
    IonicStrength    I
)
```

This is a **conceptual** signature — the exact C++ types are NOT fixed by
this ADR (SpeciesId exists today; SolventComposition does not, and its
shape is an implementation decision for the future slice).

### Conceptual inputs

* the **typed species** being corrected (never a bare string);
* the **complete solvent composition** (not a single co-solvent fraction);
* **temperature**;
* **ionic strength**, when the future model depends on it;
* the **origin convention** of the equilibrium constant (a versioned
  `conventions/` profile — where the constant's reference state is declared,
  not assumed);
* the **destination standard state** (the state the case's declared
  formulation actually needs).

### Output

The output is the **unambiguous thermodynamic quantity**

```
Δμ°_transfer   [J/mol]
```

— the standard chemical-potential difference of the species between the
origin and destination standard states — or an explicitly documented
equivalent transformation.  A bare `factor` is FORBIDDEN unless its target
is stated: a number that might multiply K, ln K, an activity, an activity
coefficient, or a standard chemical potential is not a result, it is a
future bug.

## Present state (the named gap)

```
model unavailable
    -> named gap (energyLedger-style: quoted verbatim wherever a result
       depends on it)
    -> NO silent correction, in either direction
    -> approximate behaviour ONLY where the declared formulation authorises
       it (the delimited-approximation grammar; announced when exercised)
```

The composite v1 announce already names this term; any future claim of
mixed-solvent K-correction without this contract is a doctrine violation.

## What this ADR deliberately does NOT assume

The future model is not constrained to be:

* binary (water + one co-solvent);
* additive per co-solvent;
* composition-independent;
* ionic-strength-independent;
* a constant ΔG;
* stored under a `parameters/transfer/` folder (no folder is minted here).

## Conditions for a future implementation

All of the following, before any code or grammar lands:

1. a **primary source** for the transfer quantity;
2. a **defined mathematical form**;
3. **explicit origin and destination conventions** (versioned profiles);
4. a declared **validity domain**;
5. at least **one experimental system** to validate against;
6. a reference **case with a non-zero correction** (the term must be
   observable, not decorative);
7. **limit tests** (the correction vanishes at the pure-reference-solvent
   limit; recovers the declared endpoints), gate-enforced like
   `check_composite_limits`.

### Where those seven stand today (surveyed 2026-07-28)

The survey was prompted by an external audit that put a number on the gap:
for flashComplex's aqueous backbone (water 0.895 / ethanol 0.103 / benzene
0.002) a Born estimate at ε ≈ 64 against water's 78.4 gives ~1.4 kJ/mol per
unit z² — a factor of ~9 on a divalent γ and about **two log units on the
calcite saturation index**. The gap is not a rounding term, and until it is
priced the two-liquid capability is architecture without physics.

* **2 (form) — AVAILABLE.** The Born expression is already implemented and
  exercised: `ENRTLSingleSalt.H` carries `ln γ_i^Born = (e²/8πε₀k_BT)
  (1/ε_mix − 1/ε_w)(1/r_i)` with mixture permittivity, molar volume and molar
  mass replacing the pure-water values in `A_DH`. It is not a new model.
* **3 (conventions) — AVAILABLE.** The versioned profiles the origin and
  destination resolve to exist since the D2 migration
  (`data/standards/conventions/`).
* **7 (limit tests) — MECHANICAL.** `x_anti → 0` recovering the aqueous γ
  exactly is already the eNRTL mixed-solvent contract; the gate is the same
  shape as `check_composite_limits`.
* **1 (primary source) — THE BINDING CONDITION.** Everything else waits on
  it, and it is precisely two curated quantities:
  - **relative permittivity per backbone co-solvent** (ethanol, benzene, …)
    with a validity range in T. Water is covered — Malmberg & Maryott,
    J. Res. NBS 56 (1956) 1, US-government public domain, already in
    `SolventProperties.H`. The co-solvents are not, and every open route
    found on 2026-07-28 lands on CRC/NIST, which this project excludes on
    licence grounds (no grant, nothing to honour).
  - **Born radii per ion**, or the measured transfer free energies that
    would make radii unnecessary. Today's single radius is *fitted to KCl in
    water+ethanol* and documented as such — one system, not a rung.
* **5 / 6 (validation system, non-zero reference case) — follow from 1.**
  Ethanol–water is the natural choice: the transfer data are the most
  measured, and flashComplex already sits at 10 mol% ethanol with a divalent
  ion and a mineral, so the correction would be observable at two log units
  rather than decorative.

**So the campaign is a CURATION campaign, not a modelling one**, and it is
the same wall the NH4HCO3 solubility hit the same day: the physics and the
code are available, a licence-clean primary is not. Anyone picking this up
should start at the permittivity records, not at the solver.

## Relations

* `docs/design/equilibrium-parameterisation-identity.md` — the convention
  profiles this contract's origin/destination references resolve to.
* CLAUDE.md §ThermoResolver — composite mixed-solvent electrolyte v1, where
  the transfer term is declared as the named next slice.
* D5 (general mixed-solvent reference rung) stays deferred until a
  physically motivated case exists — this ADR does not advance it.
