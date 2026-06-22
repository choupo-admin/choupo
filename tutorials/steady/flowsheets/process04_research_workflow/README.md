# process04_research_workflow

## What this tutorial demonstrates

The **research workflow** for managing thermodynamic parameters: instead
of declaring NRTL `pairs (...)` inline in the `thermoPackage`, the case
declares only the model and lets the simulator load the parameters from
a file inside the case directory.

This is the pattern used when you have your **own fitted parameters**
that you do not want to mix into the standards database. The case
remains self-contained and reproducible: the parameters travel with the
case.

## Files

```
process04_research_workflow/
├── system/
│   ├── controlDict
│   └── flowsheetDict                    (ethanol/water flash at 355 K)
└── constant/
    ├── thermoPackage                    ("model NRTL;" only --- no inline pairs)
    └── binaryPairs/
        └── NRTL/
            └── ethanol-water.dat        case-local NRTL parameters
```

## Lookup order at runtime

When the simulator builds the NRTL model and discovers there are no
inline pairs in `thermoPackage`, it falls back to file lookup:

1. **Case-local** -- `<case>/constant/binaryPairs/NRTL/ethanol-water.dat` ← used here
2. **Standards**  -- `$CHOUPO_HOME/data/standards/binaryPairs/NRTL/ethanol-water.dat`

In this case the local file exists, so it wins. If you delete the local
file, the run still succeeds because the standards file is the same
DECHEMA set.

## Running

```bash
runCase tutorials/steady/flowsheets/process04_research_workflow
less  tutorials/steady/flowsheets/process04_research_workflow/log.choupoSolve
```

The result is numerically identical to `flash02_ethanol_water` (same
NRTL parameters; just a different way of supplying them).

## What this prepares you for

The next step is the parameter-estimation workflow -- fitting those NRTL
parameters to experimental VLE data instead of inheriting them:

```bash
runCase tutorials/steady/optimisation/fitNRTL01_ethanol_water
```

That tutorial fits the ethanol-water NRTL pair by hand-rolled
Levenberg-Marquardt against experimental VLE data, with the inner
simulator pass providing T_bubble per data row.  A proposal is written
to

    constant/binaryPairs/<model>/<c1>-<c2>.fit-<date>.dat

The proposal is dormant until you do

    mv constant/binaryPairs/NRTL/ethanol-water.fit-<date>.dat \
       constant/binaryPairs/NRTL/ethanol-water.dat

That's the "promote" step. Human decides, never the simulator silently.

> Note: the canonical estimation engine going forward is `fitParameters`
> under `choupoProps` (a property-level fit with the same propose-then-promote
> discipline); the standalone `fitBinaryPair` outer driver used by the
> fitNRTL01 case is being retired in its favour.
