# Changelog

All notable changes to **Choupo** are documented here.  The format follows
[Keep a Changelog](https://keepachangelog.com/).  Releases use dated catalogue
tags (`Choupo-YYMM`), not semantic versions; **Choupo-2607** is the first
version.

## [Unreleased]

## [Choupo-2607] — 2026-07-14

Two threads under one stabilisation tag: a large **open compound-library
expansion** with release hygiene, plus the **pristine-electrolyte architecture**.

### Added (open compound library)
- **~28.8k group-estimated compounds** under `data/groupEstimative/` — identity +
  Joback / Lee-Kesler / Ambrose-Walton estimates from the open `chemicals` /
  `thermo` + RDKit toolchains, each `.dat` flagged as an ESTIMATE (never a
  measurement), engine-loadable, gated by `check_groups` (atom conservation).
  A stable nomenclature base (names / CAS / groups) students cannot silently rename.
- **UNIFAC groups filled on 25 standard components** (vocab-checked vs
  `unifac/groups.dat`).

### Changed (release hygiene)
- **`yieldReactor` built-in removed** — a mass-yield split blind to atoms could
  create or destroy elements; the case-local `userOp01` yield reactor stays as
  the teaching example of adding your own unit op.
- **`data/references/` retired** (superseded by `data/groupEstimative/`): the
  release ships Choupo's own open estimates, not third-party pointers.
- **No commercial-simulator interop in the public tree** — private benchmark
  tooling and validation suites are local-only; the public repo names no
  commercial simulator.

### Electrolyte architecture

The **pristine-electrolyte-architecture** work.  Native **208/0**, byte-exact
throughout.  Consolidates the 8-home / 2-axis electrolyte data architecture and
**retires the legacy `electrolyte{}` component block** — the arity-1 "saco" is gone.

> **Status: stabilisation tag, not a feature announcement.**  The electrolyte
> architecture is one to two days old, validated by AI-assisted design
> reviews and byte-exact regression only — **not yet
> reviewed by a human co-author nor exercised by real use.**  Byte-exact 207/0
> proves *no regression*, not *architecture correctness*.  Announce as a milestone
> only after human review + a case authored from scratch against the new tree.

### Changed
- **8-home electrolyte data architecture** (design settled 2026-07-01).  A substance's ROLE
  (lumped / dissociated / multi-ion / molten) is chosen by the `propertyPackage`,
  never stored on the substance, via two orthogonal axes: REPRESENTATION (the
  package activates) × REFERENCE (the method selects one of 4 discrete rungs).
  Homes: `components/` (identity + `dissociatesTo`) · `species/` · `phases/solid/`
  · `chemistry/` · `parameters/` · `propertyMethods/` · `propertyPackages/` ·
  `propertySets/`.  Canonical doc: `docs/architecture/electrolyte-data-architecture.md`.
- **`components/apparent/*` deleted** (the duplicate salt records); the builder
  reads salt identity + `dissociatesTo` from `components/`, solid from
  `phases/solid/`, anchor from `chemistry/salts/`.
- **The legacy `electrolyte{}` component block RETIRED** from all 21 salt `.dat`
  via expand-contract (shim → backfill `dissociatesTo` → repoint DSPM-DE +
  Crystalliser → delete).  cation/anion single-sourced from `dissociatesTo`;
  dHsoln/solubility from `chemistry/salts`.
- **"true species" purged** → *model species*: `species/` (was `components/true/`),
  `phases/solid/` (was `species/solids/`), `dissociatesTo`, `speciesComposition`.
- **halite dissolution dH corrected** 1370 → 3841 J/mol (phreeqc.dat
  `delta_h 0.918 kcal/mol`; the old value mis-cited the source).

### Added
- **`ENRTLMixedSolvent` — the generalized segment-based eNRTL** (Chen & Song 2004,
  DOI 10.1002/aic.10151) for a 1-1 salt in water+alcohol: segment local NRTL
  (ethanol = 1.811 C2H4 + 0.609 OH) + component-scale PDH + mixed-solvent
  infinite-dilution reference.  New `enrtlMixedSolvent` props op + a validation
  tutorial against the PRIMARY Esteso 1989 gamma_pm data (47 points, 0-90 wt%
  ethanol): **AAD 4.31% with ZERO refit** of the published parameters (aqueous
  1.0%; the +8% at 80/90 wt% is Esteso's own measured ion pairing, declared).
- **`thermoTest` tutorial** — one system {NaCl, CaSO4, ethanol, water}, five
  models: lumped vs Pitzer evaporators (BPE 2.11 vs 5.07 K — the representation
  axis on one operation), eNRTL antisolvent crystalliser, NRTL flash, Pitzer-HMW
  speciation+scaling (gypsum/halite SI).  In `tutorials/{steady,props}/thermoTest/`.

### Limitations (honest scope — declared, not hidden)
- **eNRTL is single-salt** *in this implementation* — the Chen-Song-Evans model is
  multi-salt by design; only Choupo's `ENRTLSingleSalt` treats one salt per case
  (the shipped eNRTL cases are single-salt, so this is a scope limit, not an error;
  a multi-ion eNRTL is a roadmap item, mirroring `PitzerHMW` on the Pitzer side).
- **eNRTL `calorimetricFit=false`** — the `tau(T)` is not calorimetrically
  calibrated, so the apparent molar enthalpy (heat of dilution, `L_phi`) is gated
  OUT of the energy balance; the antisolvent-crystalliser duty is therefore
  *materially approximate on the enthalpy side*.
- **Aqueous-only**: no redox (pe), no solid solutions, no non-aqueous/molten
  electrolyte yet (the reference-rung machinery accepts it; no case ships).
- Reference-datum **T-dependence is shallow** (a single ΔH, not a full T-function)
  for most salts.
- The `thermoPackage` path and the flat-vs-`identity{}` component dual-reader are
  **retained compat surfaces** (all ~200 tutorials use `thermoPackage`; it is the
  legitimate degenerate `propertyPackage`).
