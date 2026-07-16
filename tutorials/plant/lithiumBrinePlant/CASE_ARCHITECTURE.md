# lithiumBrinePlant — the fractal reference plant

This IS the reference lithium-carbonate-from-brine plant, laid out in Choupo's
fractal `sectors/<SECTOR>/unitOperations/<unit>/` architecture.  It runs end to
end: `runCase tutorials/plant/lithiumBrinePlant` converges, `0/` is complete
(15 stream IDs == 15 state files), and mass closes on every element.  Each of the
five sectors is a real thermodynamic subdomain (BRINE Pitzer · EXTRACTION NRTL LLE ·
CARBONATION solubility · HOTAIR Gibbs · FINISHING drying) whose world comes from a
local `constant/propertyDict` that `inherits "../../../constant"` and overrides the
method — no inline `thermo {}`.  Every unit op declares the streams it consumes and
produces (`inputs`/`outputs`), so it also runs standalone (`cd
sectors/<S>/unitOperations/<u> && runCase`, projected from the plant solution) and
drills into a runnable self-contained sub-case in the GUI.

## Physical hierarchy

```text
plant
└── sectors
    ├── BRINE
    ├── EXTRACTION
    ├── CARBONATION
    ├── HOTAIR
    └── FINISHING
```

Inside each sector:

```text
unitOperations/
```

Units are not sectors.

Examples:

```text
sectors/EXTRACTION/unitOperations/mix01
sectors/EXTRACTION/unitOperations/settler01
sectors/FINISHING/unitOperations/dryer
sectors/FINISHING/unitOperations/recoverer
```

## Run state

The root plant run owns:

```text
0/
```

Because the plant has real sectors, the state is partitioned by sector ownership:

```text
0/BRINE/
0/EXTRACTION/
0/CARBONATION/
0/HOTAIR/
0/FINISHING/
```

Nested sectors and units do not carry permanent `0/` directories merely because
they exist.  When run independently, `runCase` should project an ancestor state
onto the selected subgraph, materialize a local `0/`, and start a new local clock.

## Property contexts

A property context is:

```text
constant/
├── propertyDict
└── propertyData/
```

The root context has no parent.

Each sector explicitly inherits the root context:

```cpp
inherits "../../../constant";
```

The `inherits` target is a `constant/` directory, not a file.

Semantics:

- parent effective configuration is merged first;
- local values override parent values;
- local `propertyData/` is searched first;
- then inherited contexts are searched in order;
- runtime never falls back to the installation catalogue.

EXTRACTION demonstrates a true local data overlay:

```text
sectors/EXTRACTION/constant/propertyData/
├── methods/NRTL.dat
└── parameters/activity/NRTL/*.dat
```

The molecular components are inherited from the plant root context.

## No legacy constructs

Target state:

```text
children (...)                 = 0
legacy streams {}              = 0
boundary {}                    = 0
anonymous connections (...)    = 0
propertyPackage case file      = 0
recordType propertyPackage     = 0
thermo {} inside flowsheetDict = 0
```

## Important honesty note

This is an architectural target case.  It has not been claimed to run on the
current Choupo binary without the corresponding parser/resolver/runtime changes:

- `sectors/<name>/...`
- `unitOperations/<name>/...`
- explicit property-context `inherits`
- ordered propertyData lookup through the inheritance chain
- local-run `0/` materialization

The source stream-state files were preserved byte-for-byte.
