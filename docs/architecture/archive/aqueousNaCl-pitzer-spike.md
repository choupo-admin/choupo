# Vertical spike — `aqueousNaCl_pitzer`

> **This is a vertical SPIKE, not a general migration.** It proves the
> [final property architecture](final-property-architecture.md) end-to-end for one
> system (aqueous NaCl, Pitzer) by laying down one record of every kind. No engine
> code is added, no parser is rewritten, no other component is migrated, and no
> numerical value is changed. The old flat paths remain the source of truth and
> stay loadable.

## What the spike proves

```
apparent component   (components/apparent/NaCl.dat)
    ↓  trueSpeciesMap: Na 1, Cl 1
true species         (components/true/aqueous/Na.dat, Cl.dat)
    ↓
solid phase          (components/true/solids/halite.dat)
    ↓
chemistry            (chemistry/salts/halite.dat — the dissolution equilibrium)
    ↓
property method      (propertyMethods/electrolyte/pitzer.dat — incl. referenceBasis)
    ↓
parameters           (parameters/electrolyte/pitzer/pairs/Na-Cl.dat)
    ↓
property package     (propertyPackages/aqueousNaCl_pitzer.dat — the CENTRE)
    ↓
property sets        (propertySets/{osmoticPressure,waterActivity,ionicStrength,
                       saturationIndex,apparentComposition,trueComposition}.dat)
```

## Decisions honoured

- **Internal IDs stay `Na` and `Cl`** (compat with the existing `ions.dat` /
  `pairs.dat`); the display strings are `"Na+"` / `"Cl-"`.
- **The property package is the centre.** A case selects
  `aqueousNaCl_pitzer`; a future `ThermoPackageBuilder` would read it and assemble
  a `ThermoPackage` (the builder LOADS, it does not estimate — U3).
- **The reference basis lives in the `propertyMethod`** (`pitzer.dat`
  `referenceBasis`), declared per phase — the solid rung is the ion-derived datum
  (`Hf_solid = Σνᵢ·hfAq_i − dH_solution`), single-source.
- **Halite carries two pre-existing equilibrium sources, preserved, NOT
  reconciled** in the spike: the measured solubility / dissolution enthalpy from
  `NaCl.dat` (`measuredSolubilityAnchor`) and the PHREEQC `logK25`/`dH` from
  `minerals.dat` (`phreeqcMineralEquilibrium`).

## Faithfulness (the values are COPIES, guarded)

Every numerical value in the spike is copied verbatim from an existing source and
is verified by `bin/curate/check_spike_aqueousNaCl.py` (exits 1 on any drift —
the same anti-arity-1 discipline as `check_ion_pins.py`):

| spike record | value(s) | source |
|---|---|---|
| `true/aqueous/Na.dat` | MW 22.99, hfAq −240120, sAq 59.0, cpAq 46.4, radius 3.58e-10, D0 1.33e-09 | `electrolyte/ions.dat` |
| `true/aqueous/Cl.dat` | MW 35.453, hfAq −167160, sAq 56.5, cpAq −136.4, radius 3.32e-10, D0 2.03e-09 | `electrolyte/ions.dat` |
| `parameters/.../Na-Cl.dat` | beta0 0.07534, beta1 0.2769, beta2 0.0, Cphi 0.00148, alpha1 2.0, alpha2 12.0 | `electrolyte/pairs.dat` |
| `true/solids/halite.dat` | rho_p 2165.0, k_v 1.0 | `components/NaCl.dat` solid block |
| `chemistry/salts/halite.dat` `measuredSolubilityAnchor` | solubility 6.144, dissolutionEnthalpy 3880 | `components/NaCl.dat` electrolyte block |
| `chemistry/salts/halite.dat` `phreeqcMineralEquilibrium` | logK25 1.57, dH 1370 | `electrolyte/minerals.dat` |

## Compatibility / status

The `ThermoPackageBuilder` is built and a real case RUNS on this architecture:
`tutorials/props/electrolyte/pitzer02_nacl_package` selects the `aqueousNaCl_pitzer`
package, the builder assembles a `ThermoPackage` from these NEW records (reading
zero old salt files), and the `electrolyteActivity` op emits gamma_pm_1m 0.6572 /
phi_1m 0.9363 / aw_1m 0.9668 — byte-identical to the old `pitzer01_nacl` golden
(no-retrocompat proven by hiding the old `NaCl.dat`/`ions.dat`/`pairs.dat`). The
OLD path is untouched: the legacy flat `components/<name>.dat` by-name O(1) lookup
still serves every existing tutorial.

## Scope of this spike

**This is a vertical spike for aqueous NaCl ONLY.** It proves the Aspen-like stack
end-to-end:

```
apparent component -> true species -> solid phase -> chemistry / salt equilibrium
  -> electrolyte parameters -> property method -> property package -> property sets
```

Only **NaCl** has been split through this path. **Legacy flat components remain
unchanged.** Files such as
`data/standards/components/{NaHCO3,Na2CO3,CaCO3,KCl,CaCl2,NaOH}.dat` are **NOT yet
compliant** with the final Aspen-like architecture — this is expected; the task
was a NaCl vertical spike only. Do **not** read
`data/standards/components/true/solids/halite.dat` as the complete solids
inventory — it is only the solid phase needed for the NaCl spike.

**Future migrations must happen BY KIND, not randomly file-by-file:**
- all true electrolyte ions,
- all Pitzer pairs,
- all mineral solid phases,
- all mineral / salt equilibria,
- all electrolyte speciation equilibria,
- all binary molecular model parameters.

*(A second, MOLECULAR path is also proven — `tutorials/props/molecular/nrtl01_ethanol_water_package`
runs ethanol-water NRTL through the SAME builder — but only that one molecular pair
is split; the molecular catalogue is likewise not migrated.)*

### Example of a legacy component not yet migrated — NaHCO3

`data/standards/components/NaHCO3.dat` is still a legacy FLAT component. It mixes
in one file: apparent-component identity · the nonvolatile-salt role · solid
density · solid Gibbs/enthalpy/entropy data · solid heat capacity ·
tutorial/application prose. This is **not** the final Aspen-like layout. The
future split (DO NOT create these now — documented only):
- `components/apparent/NaHCO3.dat` — apparent sodium bicarbonate component,
- `components/true/aqueous/HCO3.dat` — bicarbonate true species,
- `components/true/solids/nahcolite.dat` — the NaHCO3 solid phase,
- `chemistry/salts/nahcolite.dat` — `NaHCO3(s) <=> Na + HCO3`,
- `chemistry/aqueous/carbonate.dat` — carbonate / bicarbonate / CO2 / H / OH
  aqueous speciation,
- `chemistry/reactions/` or `mechanisms/` — `2 NaHCO3 -> Na2CO3 + H2O + CO2`, if
  used as a reaction exercise.

### `origin` vs `ref` — a known spike simplification (not the final format)

During the spike, an `origin` field marks the LEGACY Choupo file a value was
copied from. This is acceptable for a migration spike but is **not** the ideal
final format. In final curated records each empirical value should carry a
scientific `ref`/`source` next to the value, while migration history is recorded
once per file:

```
hfAq { value -167160; unit J/mol; ref "Wagman 1982"; }
migration { importedFrom "data/standards/electrolyte/ions.dat"; }
```

The spike files are NOT converted to this pattern yet (deliberately out of scope).
