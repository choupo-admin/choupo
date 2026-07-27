# `complexes/` — the reactions no single component owns

A component file declares the chemistry it **unambiguously brings**: the
reactions in which its own identity is the only non-solvent parent
(CO₂ owns the carbonate ladder; CaCO₃ owns the calcite dissolution).

Ion pairs and complexes are different: they **couple two families**.

```
Ca2+ + HCO3-  =  CaHCO3+      calcium (from CaCO3) x carbonate (from CO2)
Ca2+ + CO3-2  =  CaCO3(aq)    same
Ca2+ + H2O    =  CaOH+ + H+   calcium x solvent
```

Neither `CaCO3.dat` nor `CO2.dat` can own these without one of them
silently claiming the other's family — and if BOTH declare them, the value
has two homes (the arity sin).  So they live here, exactly as
**pair-dependent parameters** (NRTL, Wilson, Henry) live in a pair
catalogue and not inside a component: it is the same axiom, applied to
reactions instead of parameters.

The student never writes these.  The reachability closure activates them
from the master species the feed produces, and the `[chemistry]` block
prints them with everything else — which is where readability actually
matters: the assembled system at run time, not the file tree.

**This is what a hand-written declaration misses.**  The first draft of this
case, written by someone who knew the chemistry, declared 6 aqueous
reactions.  The closure finds 9 — the three above were forgotten.  Ion
pairs sequester free Ca²⁺, lower its activity and therefore change how much
calcite dissolves.  Not decorative.
