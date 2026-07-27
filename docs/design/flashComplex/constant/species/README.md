# `constant/species/` — nine model species

One typed file per species, mirrored verbatim from `data/standards/species/`.
Each carries what a *reaction record cannot*: the species' own standard-state
data (`hfAq`, `sAq`, the Criss-Cobble averaged partial molal heat capacity)
and, where curated, its transport radius and limiting diffusivity.

That is the whole membership rule. A species is here **iff** it has
independent data of its own. The derived neutrals and complexes of this case
— `CO2aq`, `H2CO3`, `NH3aq`, `HAc`, `H2Saq`, `CaHCO3`, `CaCO3aq`, `CaOH` —
are each defined completely by the reaction that forms them, and declare
their identity inline in that record. Giving them a file here would create a
second home for a charge and a formula, and the two would drift.

| species | family | master? |
|---|---|---|
| `H` | — | shared by every family; what couples them |
| `OH` | water | derived (`water-dissociation.dat`) |
| `HCO3` | carbonate | **master** |
| `CO3` | carbonate | derived |
| `Ca` | calcium | **master** |
| `NH4` | ammonia | **master** |
| `Acetate` | acetic | **master** |
| `HS` | sulfide | **master** |
| `N2` | — | dissolved inert; no ionisation |

The masters are declared in `constant/thermoPhysPropDict`; this directory
does not rank its own contents.
