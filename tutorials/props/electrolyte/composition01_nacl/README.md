# composition01 — apparent-salt input via speciesMap

The water analysis is given as APPARENT SALTS:
```
composition { NaCl 2.0 mol/kg; }
```
The speciate op expands each salt to ion totals through its
`dissociatesTo` (NaCl -> Na 1, Cl 1), and **validates electroneutrality**
(`Sum nu*charge = 0`) so a formulated-salts input can never silently unbalance
charge. This is byte-identical to writing the ions by hand
(`totals { Na 2.0; Cl 2.0 }`): `SI_halite -0.953`, feed charge imbalance 0.00%.

`composition{}` is the apparent-salt input mode; `analyticalTotals{}` / `totals{}`
stay as the mode for waters measured directly in ions/masters (roadmap Phase B).
