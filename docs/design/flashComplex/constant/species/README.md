# `species/` — identity and standard-state data, ONE home each

A species record carries what the species IS (name, presentation formula,
charge, MW) and its standard-state thermodynamics when curated.  It never
carries an equilibrium constant: constants belong to reactions.

## Why the identifiers are `H`, `HCO3`, `Ca` — and not `H_p1`, `HCO3_m1`

The charge-mangled form was considered and rejected (it was also REMOVED
from this corpus in the F2 campaign, 2026-07-26).  The problem it aims to
solve — telling the sodium ion apart from sodium metal — is already solved,
and more strongly, by the type system: `ComponentId`, `SpeciesId` and
`SolidId` are strong types with no implicit conversion, so the confusion is
a compile error, not a naming convention.

The readability the mangled form wants is delivered by the **presentation
formula**, which every record carries:

```
name     HCO3;
formula  "HCO3-";      <- what the student reads, everywhere
charge   -1;
```

Renaming would cost 41 species records, 59 chemistry records and every
sealed case, to buy readability that the `formula` field already provides.
