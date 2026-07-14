# Electrolyte chemistry objects — two roles, one rule

This tree holds aqueous/solid equilibrium objects in distinct subfolders with
**distinct, non-overlapping roles**. A `<name>` (e.g. `halite`, `sylvite`) may
appear in more than one subfolder — that is **not** a duplicate source of truth,
because each subfolder answers a different question:

- **`salts/<name>.dat`** (`recordType saltEquilibrium`) — the **curated,
  package-facing** salt-equilibrium object a `propertyPackage` SELECTS. Its
  `measuredSolubilityAnchor` carries the primary-cited solubility + heat of
  solution (e.g. halite 6.144 mol/kg / 3880 J/mol) that the `ThermoPackageBuilder`
  reads for Ksp / heat of crystallisation.

- **`mineralSolubility/<name>.dat`** (`recordType mineralSolubility`) — the **raw
  migrated PHREEQC-style** mineral record (`logK25` / `dH` on the PHREEQC molality
  convention, e.g. halite 1.57 / 3841), read by the `SpeciationSolver`
  scaling/saturation path.

- **`aqueousSpeciation/`**, **`gasLiquid/`**, **`ionExchange/`** — the other
  migrated PHREEQC equilibrium kinds (association reactions / Henry gases /
  exchange half-reactions).

## The rule

`salts/` is the **curated package-facing anchor**; the PHREEQC-style folders are
the **raw migrated records**. The two halite/sylvite numbers (a measured
solubility anchor vs a PHREEQC mineral saturation index) are **different
quantities on different conventions** and are kept deliberately **un-reconciled**
— never merge them, and never treat one as the other's source of truth. A
propertyPackage reads `salts/`; the speciation/scaling engine reads
`mineralSolubility/`.

## Provenance convention for this tree (ratified 2026-07-04)

Chemistry records cite **per entry, inline**: every equilibrium line carries a
`source "…"` string — the databank (`"USGS PHREEQC phreeqc.dat (public
domain)"` / `pitzer.dat`) plus the primary literature where the databank
states it (e.g. Plummer & Busenberg 1982 for the carbonate system, Van Bladel
& Gheyl 1980 for ion exchange, Pinho & Macedo, J. Chem. Eng. Data 50 (2005)
for the salt solubility anchors, Wagman NBS 1982 for dissolution enthalpies).
This `recordType` + per-entry `source` style **is** the accepted
header/citation convention for the migrated PHREEQC folders
(`aqueousSpeciation/`, `gasLiquid/`, `ionExchange/`, `mineralSolubility/`) —
the records are one-line entries, and a per-file `/*--- Choupo ---*/` banner
box would be boilerplate; boxes are reserved for the curated `salts/`
anchors, which carry a file-specific narrative.

Honesty rule: where the databank does not name a primary, the `source` string
says so explicitly (e.g. `gasLiquid/CO2.dat`: `"… primary not stated in db"`)
— never invent a primary; re-citation is an IST curation act.
