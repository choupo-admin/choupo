> **SUPERSEDED (2026-07-14) by [`property-architecture.md`](property-architecture.md)** —
> the single consolidated property authority. Its declare→assemble→compute flow
> (U1–U4) and the reference-rung idea are folded there, reconciled to the current
> seven-homes / model-species / per-group-rung state. This file kept for the trail;
> where it says "eight kinds", "true species", or per-phase rungs, the new doc wins.

# Choupo — Final Property Architecture

> **Status: HISTORICAL — superseded, see the banner above.** (At ratification
> this read "CLOSED / CANONICAL, design settled 2026-06-30"; authority now lives
> in `property-architecture.md`.) This was the umbrella document that unified the
> three previously-separate threads into one architecture:
> - **Layer 1 (data)** detailed in [`aspen-like-data-architecture.md`](aspen-like-data-architecture.md);
> - **Layer 2 (curation/resolution)** is the 2026-06-05 contract in [`../property-architecture.md`](../property-architecture.md);
> - **Layer 3 (runtime compute)** is the existing engine (`ThermoPackage` +
>   `ActivityModel`/`EquationOfState`/`ElectrolyteModel`, post the A1–A3 refactors).
>
> No data files are moved and no numerical values change by adopting this.

**Thesis (one line):** *`propertyPackage` declares, `ThermoPackageBuilder`
assembles, `ThermoPackage` computes; `propertyMethod` declares the reference basis,
its requirements, and the property sets it provides; curation produces `.dat`,
runtime does not estimate.*

---

## The main flow

```
propertyPackage.dat          (declarative — a case SELECTS this)
     ↓
ThermoPackageBuilder         (runtime ASSEMBLY — loads + assembles, never estimates)
     ↓
ThermoPackage                (the mounted runtime COMPUTE object, unchanged)
     ↓
unit operations              (consume the ThermoPackage, as today)
     ↓
propertySets / reporting     (runtime-reportable quantities)
```

> **Terminology (load-bearing).** The runtime assembly step is the
> **`ThermoPackageBuilder`** (a.k.a. `PropertyPackageAssembler`). It is **NOT**
> called a "resolver" — *resolver* is reserved for **curation-time** property
> resolution / estimation (Layer 2). Builder = runtime, loads. Resolver =
> curation, may estimate. The two never mix.

---

## The three layers

### Layer 1 — Data (the Aspen-like ontology, ratified)
Eight kinds: **apparent components** (user-facing; intrinsic arity-1 props +
`trueSpeciesMap`) · **true species** (solver-facing: ions, aqueous molecular) ·
**solid phases** · **chemistry sets** (dissociation, speciation, salt
precipitation, gas–liquid, ion exchange) · **property methods** (declarative) ·
**parameter databanks** (arity-2+ values) · **property packages** (the centre a
case selects) · **property sets** (runtime-reportable quantities).
Internal electrolyte IDs stay `Na`/`Cl` (compat with `ions.dat`/`pairs.dat`); the
display strings are `"Na+"`/`"Cl-"`.

### Layer 2 — Curation / resolution (the 2026-06-05 contract)
Curation-time **may** resolve / estimate / derive missing values and create
glass-box `.dat` records (human-reviewed before promotion). It produces the
explicit files of Layer 1. **Runtime must never estimate.** Estimation is a
curation act, not a runtime computation. The arity rule holds: intrinsic arity-1
properties stay with the substance; arity-2+ model parameters go to parameter
databanks; **derived values are not stored as primary data**
(`Hf_solid = Σνᵢ·hfAq_i − dH_solution` is a curation-time derivation, not a second
stored datum).

### Layer 3 — Runtime compute (the existing engine)
`ThermoPackage` + `ActivityModel` / `EquationOfState` / `ElectrolyteModel`, with
the A1–A3 refactors assumed (factory takes Components; `asElectrolyte()` not RTTI;
`pitzer` ≠ `pitzerHMW`). **`ThermoPackage` remains the runtime object consumed by
unit operations.**

---

## The four closed decisions

### U1 — `propertyPackage` does NOT replace `ThermoPackage`
`propertyPackage` is the **declarative source**; `ThermoPackage` is the **runtime
product**. A case selects a `propertyPackage`; the `ThermoPackageBuilder` reads it
and assembles a `ThermoPackage`; the unit operations consume the `ThermoPackage`
as before. The old case `thermoPackage` is a **degenerate `propertyPackage`**
(`componentApproach apparent`, `true == apparent`, no chemistry, one liquid model,
optional binary parameters, molecular property sets). **Do not rename or remove
`ThermoPackage`** — there is no concrete runtime gain that would justify rewriting
every unit-operation consumer.

### U2 — the reference basis lives inside `propertyMethod`
The reference basis (the `ReferenceRung` idea) is **part of the `propertyMethod`
contract**, declared **per phase** — there is no separate top-level runtime object
for it, and the engine **must not hardcode "aqueous"** as the universal reference.
The engine reads the reference basis from the selected method.

```
recordType propertyMethod;   name pitzer;   family electrolyte;
referenceBasis
{
    aqueous { rung ionAqueousInfiniteDilution; convention "H+(aq)=0"; }
    solid   { rung solidFromIonFormation;
              relation "Hf_solid = sum(nu_i*hfAq_i) - dH_solution"; }
    vapour  { rung idealGasReference; }
}
requires { trueSpecies; charges; molality; ionPairParameters; }
provides { meanActivityCoefficient; osmoticCoefficient; waterActivity;
           ionicStrength; osmoticPressure; saturationIndex; }
```

```
recordType propertyMethod;   name NRTL;   family activity;
referenceBasis
{
    liquid { rung pureLiquidRaoult; convention "gamma_i -> 1 as x_i -> 1"; }
    vapour { rung idealGasReference; }
}
requires { apparentOrTrueComponents; binaryInteractionParameters; }
provides { activityCoefficients; Kvalues; excessGibbsEnergy; }
```

This **unifies the `ReferenceRung` forum with the Aspen method stack** — they stop
being two threads — and closes the "what if it is not aqueous?" gap: a non-aqueous
or melt method simply declares a different rung.

### U3 — runtime assembly loads declared records only
The builder **may** read the package, load apparent components, map to true
species, load active chemistry, load selected methods, load required parameters,
instantiate the models, assemble the `ThermoPackage`, and compute the requested
property sets. The builder **may NOT** estimate missing parameters, silently
derive thermochemistry, fall back to ideal, create `.dat` records, repair
incomplete data, or silently switch methods. **If a required record is missing at
runtime, fail clearly:**

```
FATAL: propertyPackage aqueousNaCl_pitzer selected propertyMethod pitzer,
       but required parameter pair Na-Cl was not found.
```

This preserves the curation/runtime boundary (2026-06-05) and the no-silent-crutch
credo.

### U4 — one stack serves electrolyte AND molecular
The same architecture degenerates cleanly for ordinary molecular cases — **no
special branch.**

```
molecular (ethanol–water NRTL):           electrolyte (aqueous NaCl Pitzer):
  apparent ethanol/water                     apparent NaCl
      ↓ (apparent == true)                       ↓  true Na + Cl
  no chemistry                               dissociation / halite / speciation
      ↓                                          ↓
  NRTL  ←  binary parameters                 Pitzer / eNRTL  ←  electrolyte params
      ↓                                          ↓
  ThermoPackage                              ThermoPackage
```

Same flow; the only difference is **what the selected method requires.**

---

## Minimum new fields

**Apparent electrolyte component** gains `trueSpeciesMap`:
```
trueSpeciesMap { Na 1; Cl 1; }
```

**`propertyPackage`** (the central record) minimally declares:
```
recordType propertyPackage;   name aqueousNaCl_pitzer;
components        { water; NaCl; }
componentApproach apparent;
apparentToTrue    { NaCl { Na 1; Cl 1; } }
chemistry         { salts { halite; } }
propertyMethods   { liquid electrolyte.pitzer; vapour idealGas; solid saltEquilibrium; }
parameters        { pitzerPairs { Na-Cl ".../parameters/Pitzer/pairs/Na-Cl.dat"; } }
propertySets      { osmoticPressure; waterActivity; ionicStrength;
                    saturationIndex; apparentComposition; trueComposition; }
```

---

## The `ThermoPackageBuilder` assembly contract

1. Read the selected `propertyPackage`.
2. Load apparent components.
3. Determine `componentApproach`.
4. For apparent electrolytes, read `trueSpeciesMap` / package `apparentToTrue`.
5. Load required true-species records.
6. Load active chemistry records.
7. Load selected `propertyMethods`.
8. Read each method's `referenceBasis`.
9. Load the parameter records the selected methods declare.
10. Instantiate `ActivityModel` / `EquationOfState` / `ElectrolyteModel`.
11. Assemble the `ThermoPackage`.
12. Expose the selected property sets for reporting.

**The builder loads and assembles. It does not estimate.**

---

## Compatibility

- `data/standards/components/` stays **flat**; the loader resolves
  `components/<name>.dat` by exact name, O(1) — unchanged.
- Ions / Pitzer pairs / minerals / binary pairs stay in their current paths during
  the compatibility phase; old paths remain loadable.
- `generated/indexes/` + `generated/flatCaches/` preserve the runtime lookup while
  the conceptual source records move toward the Aspen layout.
- **Implementation status:** today a case's `thermoPackage` dict is parsed directly
  into a `ThermoPackage` (the degenerate path — it already works). The
  `ThermoPackageBuilder` + the `propertyPackage` front-end are **Phase-5 work**,
  proven first by the `aqueousNaCl_pitzer` vertical spike before any mass move.

---

## Final decision

> `propertyPackage` **declares**. `ThermoPackageBuilder` **assembles**.
> `ThermoPackage` **computes**. `propertyMethod` **declares** the reference basis,
> its requirements, and the property sets it provides. `propertySets` are
> runtime-reportable quantities, not stored primary data. **Curation produces
> `.dat`; runtime does not estimate.**

> **Choupo uses Aspen-like declarative property packages with OpenFOAM-like
> explicit files: propertyPackage declares, ThermoPackageBuilder assembles,
> ThermoPackage computes.**
