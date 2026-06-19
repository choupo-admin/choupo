# cryst1 — this unit's data home

Local data for THIS crystalliser lives here as it is measured: a sample
solubility curve (`components/<name>.dat`), nucleation / growth kinetics, the
particle-size distribution. Anything dropped here overrides the case default
for cryst1 ONLY — the cascade reads the unit's own `constant/` first, then the
case's. With nothing local yet, cryst1 inherits the case eNRTL package.

The folder is also why cryst1 runs and diagnoses **standalone**: open
`cryst1.cho` with its inlet streams frozen from the last full-flowsheet run.
