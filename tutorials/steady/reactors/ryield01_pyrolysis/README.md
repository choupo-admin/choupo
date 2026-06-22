# ryield01 — lumped yield reactor (RYield analogue)

A single `yieldReactor` (the Choupo analogue of Aspen's RYield): the outlet is
fixed by an empirical **mass-yield slate** rather than by stoichiometry or
kinetics. This is the right tool when only the product distribution is known
(lumped / empirical chemistry) — the overall mass balance always closes because
the yields are given on a normalised (sum = 1) mass basis.

## What it models

The chemistry is **toluene hydrodealkylation (HDA)**:

    toluene + H2  ->  benzene + CH4

fed as 25 mol% toluene / 75 mol% H2 at 900 K, 35 bar. (The folder name
`ryield01_pyrolysis` is a legacy label; the slate below is HDA, not thermal
cracking — a pyrolysis example would use a coke/olefin product distribution.)

The yields are **illustrative**, chosen to sum to 1.0 kg/kg of total feed and to
demonstrate the mechanics of a yield reactor, not measured for a specific HDA
unit:

| product | mass yield (kg / kg feed) |
|---------|---------------------------|
| benzene | 0.62 |
| CH4     | 0.10 |
| H2      | 0.28 |

## What to see in the run

- Mass in = mass out (9818.9 kg/h in and out) — the headline property of a
  yield reactor.
- Molar flow grows (400 -> ~1503 kmol/h) because the slate makes lighter
  species, while mass is conserved.
- Product composition ~0.91 H2 / 0.052 benzene / 0.041 CH4 (mole fractions),
  isothermal at 900 K with an endothermic duty Q ~ 3760 kW.
