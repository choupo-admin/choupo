# cryst2 — this unit's data home

Local data for THIS antisolvent crystalliser lives here as it is measured: a
sample solubility / Ksp anchor (`electrolyte/…`, `components/<name>.dat`),
nucleation / growth kinetics, the particle-size distribution. Anything dropped
here overrides the case default for cryst2 ONLY — the cascade reads the unit's
own `constant/` first, then the case's. With nothing local yet, cryst2 inherits
the case eNRTL package.

The folder is also why cryst2 runs and diagnoses **standalone**: open
`cryst2.cho` with its inlet streams frozen from the last full-flowsheet run.
