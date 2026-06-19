# thermoPackage — composing the thermodynamic models

A case's `constant/thermoPackage` declares the components + which
phase-property models to use.  Minimum viable:

```
components       (water  ethanol );

activityModel    { model ideal; }
equationOfState  { model idealGas; }
```

That's enough for an isothermal flash with Raoult VLE.  Real cases
usually want more.  This document is the reference.

## components

A list of component names that must exist in
`data/standards/components/` (see `components.md` for the inventory)
OR in `<case>/constant/components/` as a case-local override / new
component.

```
components (water  ethanol  CO2 );
```

Order matters: it sets the indexing the solver uses internally (some
features — like `binaryInteractions ( { i j kij } )` for an EoS —
reference components by `i`/`j` indices).

## activityModel  (liquid-phase non-ideality)

```
activityModel  { model <name>; <model-specific keys> }
```

| `model` | What it is | When to use |
|---|---|---|
| `ideal`  | γᵢ = 1 (Raoult).  Trivial baseline. | Air, dilute, hydrocarbons-only. |
| `NRTL`   | Renon & Prausnitz (1968).  Handles LLE. | Polar non-ideal mixtures (ethanol/water, alcohols,...). |
| `Wilson` | Cheaper than NRTL but **cannot represent LLE** (structural). | Mild non-ideality, no expected liquid split. |
| `UNIFAC` | **Predictive** — γ from molecular GROUPS, NO fitted binary parameters (original UNIFAC; Fredenslund 1975 / Hansen 1991). | A binary with no regressed data: get a first VLE from structure alone, then SEE the error vs data. Weak for alcohol-water (predicts the azeotrope but misplaces it — original-UNIFAC's known limit). |

`UNIFAC` takes no pairs; instead declare each component's groups (the R_k/Q_k +
a_mn tables live in `data/standards/unifac/`):

```
activityModel
{
    model  UNIFAC;
    groups
    {
        ethanol ( { group CH3; count 1; } { group CH2; count 1; } { group OH; count 1; } );
        water   ( { group H2O; count 1; } );
    }
}
```

NRTL / Wilson need binary-pair parameters, supplied either inline:

```
activityModel
{
    model  NRTL;
    pairs
    (
        {
            i  ethanol;  j  water;
            a_ij  -0.8009;  b_ij  246.18;
            a_ji   3.4578;  b_ji  -586.0809;
            alpha  0.30;
        }
    );
}
```

or by reference to `data/standards/binaryPairs/NRTL/<i>-<j>.dat`:

```
activityModel  { model NRTL; }    # pairs auto-loaded if a file exists
```

**Per-node resolution order (fractal `constant/`).**  For an uncovered pair,
NRTL searches, in order:

1. the owning **node's** `constant/binaryPairs/NRTL/<i>-<j>.dat`
   (a sector/unit's PARTICULAR pair — see the fractal `constant/`);
2. the **plant-root** case `constant/binaryPairs/NRTL/<i>-<j>.dat`;
3. the **standard library** `data/standards/binaryPairs/NRTL/<i>-<j>.dat`.

So an `ethylAcetate-water` pair fitted for one sector lives in that sector's
`constant/` and beats the library, while `ethanol-water` is inherited from the
library — both in the same run.  (A unit gets its node base via the `thermo {
binaryPairsBase ...; }` the Flowsheet injects; you don't write it by hand.)

**Hybrid NRTL (no silent crutch).**  NRTL needs a pair for EVERY binary
(N components ⇒ N(N−1)/2 pairs).  A pair with no parameters anywhere does NOT
abort the run — it **defaults to ideal** (τ = 0) so you can build the
foundation pair-by-pair (turn NRTL on, see what's missing, fit/add it).  But
it is never silent: each ideal-defaulted pair is announced (a `[thermo]` log
line + a run-JSON advisory the GUI shows as an amber toast), and the GUI's
**pair-coverage matrix** (Thermo workspace, after a run) colours every pair by
where it resolved — library / inline / local / placeholder / ideal-default —
so the unconstrained interactions are visible at a glance.  Each `.dat` may
carry a `provenance { source placeholder|literature|fitted; }` block; a
PLACEHOLDER (a guess) is then shown distinctly from real data.

## equationOfState  (vapour-phase + Z, H_R, S_R)

```
equationOfState  { model <name>;... }
```

| `model` | What it gives | When to use |
|---|---|---|
| `idealGas` | Z=1, H_R=0, S_R=0.  Default. | Low pressure, no critical effects. |
| `SRK`      | Soave-Redlich-Kwong cubic.  vdW 1-fluid mixing. | Moderate pressure, hydrocarbons, gas compression. |
| `PR`       | Peng-Robinson cubic.  Better near critical for CO2. | High pressure, CO2, near-critical fluids. |

Optional binary interaction parameters:

```
equationOfState
{
    model  SRK;
    binaryInteractions
    (
        { i  CO2;   j  CH4;   kij  0.0973; }
        { i  N2;    j  CH4;   kij  0.031;  }
    );
}
```

SRK + PR need each component's `Tc`, `Pc`, `omega` from the standard
catalogue (every well-curated component ships them).

## transport  (optional; for unit ops that need μ / k / D)

```
transport
{
    viscosity            { model Chung; }
    thermalConductivity  { model Eucken; }
    diffusivity          { model Fuller; }
    liquidViscosity      { model Vogel; }      # or Andrade
    liquidConductivity   { model SatoRiedel; } # or Latini
    liquidDiffusivity    { model WilkeChang; } # or Scheibel
}
```

These are selectable sub-models (explicit-factory pattern).  Pick by
need:

| Need | Sub-model |
|---|---|
| Gas viscosity (low pressure) | **`Chung`** — uses Tc/Pc/ω/MW, zero new data. |
| Gas thermal conductivity | **`Eucken`** — `λ = (Cp+5R/4)·μ/M`, no extra data. |
| Gas binary diffusivity | **`Fuller`** — needs `diffusionVolume` on each component (water/N2/O2/CO2/CH4/H2/CO ship it). |
| Liquid viscosity | **`Vogel`** (3-param `ln μ = A+B/(T-C)`, water 0.2 % RMS) or **`Andrade`** (2-param). |
| Liquid thermal conductivity | **`SatoRiedel`** (parameter-free, organics) or **`Latini`** (family-tuned). |
| Liquid binary diffusivity | **`WilkeChang`** (needs `associationFactor`) or **`Scheibel`** (no association). |

When a unit op needs a transport property the package doesn't supply
(e.g. a spray dryer needs liquid viscosity but you wrote `Andrade`
without Andrade params on the components), the solver throws a clear
error.

## solvent  (for Henry's law)

When a component is flagged `role solute;` (in its.dat) and a Henry
pair exists in `data/standards/henrysLaw/<solute>-<solvent>.dat`, you
must declare which component is the solvent:

```
solvent  water;
```

Used by:
- absorber / stripper (Kvec consults Henry for the solute);
- aqueous gas absorption (CO2, NH3, O2, H2S, SO2, CH4, Cl2, HCl in water all ship).

## membrane (only for spiralWoundModule)

A membrane case declares which membrane the spiral-wound module uses
on a per-unit basis (see `unit-ops.md > spiralWoundModule`), not at
the thermoPackage level — but the components include the solute(s),
and the solute must have `nonvolatile true;` + `dissociation <nu>;`
in its.dat (NaCl, glucose, MgSO4 ship this).

## A full real example

```
components       (water  sucrose );

activityModel    { model ideal; }
equationOfState  { model idealGas; }

# transport is omitted -- the units in this case (cooling crystalliser)
# don't need μ/k/D.
```

A heavier one (CO2 compression):

```
components       (CO2  CH4  N2 );

activityModel    { model ideal; }
equationOfState
{
    model  PR;
    binaryInteractions
    (
        { i  CO2;  j  CH4;  kij  0.0973; }
    );
}
transport
{
    viscosity  { model Chung; }
}
```

## What does the simulator do with the thermoPackage?

The four binaries all call `ThermoPackage::readFromDict(dict, db)`
at startup, which:

1. Loads each component's `.dat` from `data/standards/components/` (or
   the case-local overlay).
2. Instantiates the chosen activity / EoS / transport models via the
   factory.
3. Caches Antoine, Cp, Hvap polynomials for fast K-value / enthalpy
   calls.

After that, the package is passed to every unit op's `solve(dict,
thermo, verbosity)`.  Units consume only the slice they need.

## Enthalpy reference state (the `phase` field in `gibbsFormation`)

Choupo uses the **elements-at-298.15 K / 1 bar** datum for any
energy balance that crosses a reactor (this is the same convention as
NIST and JANAF).  Each component's
`gibbsFormation { dHf_298; s_298; phase; }` block carries the
formation enthalpy plus a one-word **`phase`** field declaring in
which phase `dHf_298` is tabulated:

| `phase`  | Required Cp model                  | Typical species |
|----------|------------------------------------|-----------------|
| `gas`    | `idealGasHeatCapacity`             | the convention --- all 45 standard volatiles + radicals |
| `liquid` | `liquidHeatCapacity`               | compounds tabulated in the condensed datum (rare) |
| `solid`  | `liquidHeatCapacity` (used as $c_p^{\mathrm{solid}}$) | crystalline non-volatiles that never honestly vaporise (sucrose) |

The solver uses `phase` to walk the **enthalpy ladder** (theoryGuide
§"The reference state, and why a reaction needs the elements"):
starting from the tabulated rung, it adds / subtracts Hvap and Hfus
jumps as needed to reach the rung the energy balance asks for.  A
`solid`-tagged species is *never* asked to integrate through a gas
leg, so sucrose does not need an ideal-gas Cp.  An attempt to send a
`phase = solid` component into a vapour stream throws a clear error
rather than fabricating a sublimation enthalpy.

Default is `gas` for backward compatibility, but **new components
should always declare `phase` explicitly** so the datum is unambiguous
at the source of truth.  The same rule applies to per-case overlays
under `<case>/constant/components/<name>.dat`.
