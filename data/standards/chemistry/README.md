# Electrolyte chemistry objects — migrated PHREEQC equilibrium kinds

This tree holds the aqueous/gas equilibrium objects the electrolyte engines read,
one subfolder per kind (each `recordType` carries its own per-entry `source`):

- **`aqueousSpeciation/<name>.dat`** — the association / acid-dissociation
  reactions (e.g. `CaSO4aq`, `CO2aq`, `HTart`), scanned whole-dir by the
  `SpeciationSolver`.
- **`gasLiquid/<gas>.dat`** (`recordType gasLiquidEquilibrium`) — the gas
  dissolution (Henry) constants for the open-system option (e.g. `CO2`), read by
  the speciation gas leg.
- **`ionExchange/<name>.dat`** — the exchange half-reactions (Gaines–Thomas
  selectivity), read by the exchange chemistry.

## Where the salt / mineral solubility lives (NOT here)

The salt-equilibrium **anchor** (`measuredSolubilityAnchor` — primary-cited
solubility + heat of solution) and the **mineral solubility** (`logK25`/`dH`
saturation records) are NOT in this tree: they live in
`data/standards/components/<name>.dat` — the anchor as a top-level
`measuredSolubilityAnchor` block the `ThermoPackageBuilder` reads, the minerals
as the `solidPhases` block the `SpeciationSolver` reads. The former
`chemistry/salts/` and `chemistry/mineralSolubility/` folders were retired (one
component = one file; see the electrolyte-data-architecture doc). Do not
recreate them.

## Provenance convention for this tree (ratified 2026-07-04)

Chemistry records cite **per entry, inline**: every equilibrium line carries a
`source "…"` string — the databank (`"USGS PHREEQC phreeqc.dat (public domain)"`
/ `pitzer.dat`) plus the primary literature where the databank states it (e.g.
Plummer & Busenberg 1982 for the carbonate system, Van Bladel & Gheyl 1980 for
ion exchange, Wagman NBS 1982 for dissolution enthalpies). This `recordType` +
per-entry `source` style **is** the accepted citation convention for these
one-line records; a per-file banner box would be boilerplate.

Honesty rule: where the databank does not name a primary, the `source` string
says so explicitly (e.g. `gasLiquid/CO2.dat`: `"… primary not stated in db"`) —
never invent a primary; re-citation is an IST curation act.
