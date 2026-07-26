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

## Relations

* `docs/design/equilibrium-parameterisation-identity.md` — the convention
  profiles this contract's origin/destination references resolve to.
* CLAUDE.md §ThermoResolver — composite mixed-solvent electrolyte v1, where
  the transfer term is declared as the named next slice.
* D5 (general mixed-solvent reference rung) stays deferred until a
  physically motivated case exists — this ADR does not advance it.
