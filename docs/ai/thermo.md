# propertyDict — composing the thermodynamic models

A case's `constant/propertyDict` (the ONE property-package file — the old
`constant/thermoPackage` name was retired corpus-wide with NO backward
compatibility; the engine reads only `propertyDict`) declares the
components + which
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

`UNIFAC` takes no pairs.  The group decomposition is COMPONENT data, resolved
from each component's own `.dat` — one home, never re-declared per case (the
R_k/Q_k + a_mn tables live in `data/standards/unifac/`):

```
// case propertyDict — nothing but the model selection:
activityModel { model UNIFAC; }

// each component's .dat carries its decomposition:
groups
{
    unifac ( { group CH3; count 1; } { group CH2; count 1; } { group OH; count 1; } );
}
```

An inline `groups {}` block inside the activity model is RETIRED (it made the
same molecule able to change structure per case) and refuses with a pointer; a
pedagogical alternative decomposition goes in a case-local component overlay
(`constant/components/<name>.dat`).  A UNIFAC package whose participating
component lacks a decomposition is an ERROR with the remedy — never a silent
γ = 1.

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

or by reference to a binary-pair catalogue file:

```
activityModel  { model NRTL; }    # pairs auto-loaded if a file exists
```

**Per-node resolution order (fractal `constant/`).**  For an uncovered pair,
NRTL searches, in order:

1. the owning **node's** `constant/binaryPairs/NRTL/<i>-<j>.dat`
   (a sector/unit's PARTICULAR pair — see the fractal `constant/`);
2. the **plant-root** case `constant/binaryPairs/NRTL/<i>-<j>.dat`;
3. the **standard library** `data/standards/binaryPairs/NRTL/<i>-<j>.dat`.
4. the **extended, unverified library**
   `data/local/binaryPairs/NRTL/<i>-<j>.dat`.

The same standard-before-proposed fallback applies to UNIQUAC and Wilson. A
proposed pair can never shadow a standard pair. When the fourth tier is used,
the run prints `[proposed]`, records `status: proposed` plus typed provenance in
the result JSON, and the GUI displays the advisory. Treat it as screening data
until it has been checked against VLE data for the relevant temperature and
composition range.

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

## equationOfState  (real-gas φ, Z, H_R, S_R — and, for a cubic, the liquid root too)

```
equationOfState  { model <name>;... }
```

| `model` | What it gives | When to use |
|---|---|---|
| `idealGas` | Z=1, H_R=0, S_R=0.  Default. | Low pressure, no critical effects. |
| `SRK`      | Soave-Redlich-Kwong cubic.  vdW 1-fluid mixing. | Moderate pressure, hydrocarbons, gas compression. |
| `PR`       | Peng-Robinson cubic.  Better near critical for CO2. | High pressure, CO2, near-critical fluids. |

An EoS is **no longer vapour-only**.  The cubics (SRK, PR) also deliver the
**LIQUID root** (the smallest physical root above the co-volume) and
`phiLiquid(T,P,x)` — so in a `propertyPackage` a cubic may occupy the
**liquid method slot** too (`liquid eos.SRK; vapour eos.SRK;` — the φ-φ
world, the SAME cubic serving both phases, `K_i = φ_i^L/φ_i^V`; see "The
four VLE worlds" below).  `idealGas` REFUSES `phiLiquid` — it can never fake
a liquid root, so it is never a legal liquid slot.

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

### The three-tier model-parameter rule

A model's parameter lives at the **highest tier where it is true** — the
same arity test as the component glossary, asked of the *model* (*does the
number require you to name the model?*).  See
[`data-doctrine.md`](data-doctrine.md) §4.

1. **Corresponding-states triad → stays on the component, untouched.**  Any
   model that needs only `{Tc, Pc, ω}` (every cubic: SRK, PR, RK, a new
   α-function) reads the triad off the component and derives its own
   `a_c, b, m, α(T)` **in source**.  Adding such a model touches **zero data
   files** (this is why adding PR after SRK touched no `.dat`).  Never
   pre-bake `a_c` into a `.dat`.
2. **Model-specific PURE parameters that cannot be generated → a
   `model`-keyed `eosParameters{}` sub-block on the component**, read as a raw
   sub-dict (exactly like the `liquidViscosity{}` pattern):
   ```
   // inside the component .dat — ADDITIVE; never disturbs the triad
   eosParameters
   {
       PCSAFT { m 2.4653;  sigma 3.6478e-10;  epsilon_k 287.35;
                provenance { origin regressed; method "Gross & Sadowski 2001 Table 1"; } }
       // a future EOS adds its OWN key; SRK/PR appear in NO key (they read Tc,Pc,ω)
   }
   ```
   Each factory reads its own sub-block by name and ignores the rest; one
   molecule carries SRK + PR + PC-SAFT + the next EOS simultaneously, each
   with its own `provenance{}`.  A model with **no** required block on a
   component **fails with a remedy** ("PCSAFT needs m,sigma,epsilon_k for 'X';
   fit them or pick SRK/PR which run off Tc,Pc,ω") — never a silent
   corresponding-states fallback.
3. **PAIR parameters (`k_ij` and friends) → the declarative parameter
   catalogue**, `data/standards/parameters/eos/kij/<i>-<j>.dat` (the shipped
   home; siblings `parameters/binary/` for activity pairs and
   `parameters/electrolyte/` for Pitzer/eNRTL), declared in a
   `propertyPackage` via `parameters { kijPairs { N2-CH4 "…"; } }` and
   loaded by the Builder with a LOUD `[builder] kij(N2,CH4) = 0.0289 ---
   <file>` line — with the always-permitted **inline** override
   (`binaryInteractions ( … )`, shown above) staying first-class.

The activity (`activityModel`) and transport branches follow the identical
shape: corresponding-states-or-parameter-free where possible; a model-keyed
sub-block on the component (`liquidViscosity{ Vogel{…} }` is the live
precedent); a pair catalogue for interaction parameters
(`binaryPairs/<model>/<i>-<j>.dat`).  One OpenFOAM-style model-selection
scheme throughout — data with the component, called by name, model picked by
the explicit factory.

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

In a `propertyPackage` the same declaration is the `solution {}` block
(`solution { solvent water; solutes ( CO2 ); }` — the `henryDilute` world,
see below): WHO dissolves in WHAT is declared at the package level, the pair
files are declared in `parameters.henryPairs`, and a declared-but-missing
pair REFUSES loudly at assembly, naming the entry to add.

### The aqueous solution tier + the default-solvent rule

A solute property whose **definition names a solvent** — an "in-water"
ΔH_soln, an aqueous Hf°, a solubility curve — is arity-2 PAIR data.  It does
**not** go in the component `.dat`; it lives in a by-name catalogue tier:

| Solute kind | Tier | Carries |
|---|---|---|
| **ions** (∞-dilution) | `data/standards/components/true/aqueous/` | `hfAq / sAq / cpAq` on the H⁺(aq)=0 convention (Wagman/NBS 1982) |
| **molecular solutes** | `data/standards/solution/<solute>-<solvent>.dat` | ΔH_soln and other solution thermo, primary-cited |

Water earns **one canonical, named, by-name aqueous reference tier** — never
an *implied component slot*.  The package declares the default solvent once
(`solvent water;`, as Henry's law already does).  When a solution property is
needed and no solvent is named at the call site, the resolver uses the default
**and announces it on every run**:

```
[thermo] solution property dHsoln(sucrose): solvent not named -> DEFAULT solvent = water
         source: solution/sucrose-water.dat  [Putnam & Kilday 1986]  origin: literature
```

Off-default it **fails with a remedy** (the case solvent is ethanol but only
`sucrose-water` exists → "provide solution/sucrose-ethanol.dat or accept
water explicitly") — never a silent water substitution.  See
[`data-doctrine.md`](data-doctrine.md) §2.

### The fractal cascade — where a refined number goes

A datum lives at the **highest level where it is TRUE**; a lower node only
**overlays** it when the lower scope makes it *more true*.  The overlay merges
**block-by-block** (top-level-key replacement of the whole reference-state
block), never field-by-field.

| Question about your number | Home |
|---|---|
| stands alone with one molecule (MW, Tc, ω, crystalline ΔH_f) | `data/standards/components/<name>.dat` |
| names a second species (NRTL τ, Henry, Pitzer β, k_ij, ΔH_soln-in-water) | a catalogue, keyed by the pair, referenced by name |
| a sample-specific refinement of a molecular block (this powder's sorption) | `<case>/constant/components/<name>.dat` overlay (whole block) |
| a sample-specific pair/model-param refinement | `<case>/constant/<feature>/<pair>.dat` or an `eosParameters{}` overlay |
| a RATE (kinetics) or GEOMETRY (PSD) — the molecule-in-a-machine | the operation's `constant/` (`crystallisation`, `dryingKinetics`, `reactions`); PSD is a **stream** attribute |

Precedence, lowest → highest: `local < standard < case < sector < unit`.
Full rule + the merge semantics: [`data-doctrine.md`](data-doctrine.md) §3.

## membrane (only for spiralWoundModule)

A membrane case declares which membrane the spiral-wound module uses
on a per-unit basis (see `unit-ops.md > spiralWoundModule`), not at
the property-package level — but the components include the solute(s),
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

## What does the simulator do with propertyDict?

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

## propertyPackage — the declarative manifest (the modern convention)

`constant/propertyDict` is **always the INLINE full manifest** — the file
carries a `components (…)` list, so it IS the package record: components,
methods, solution structure and parameter sources all IN the case, readable.
This is the self-contained form and the ONLY form (the `package <name>;`
selector into a shared `data/standards/propertyPackages/` catalogue was
retired — a case never reaches out to a shared registry for its thermo; if
two cases share thermo, each carries its own copy).  `constant/propertyPackage`
and `constant/thermoPackage` were also retired with no backward compatibility.

The inline form, from
`tutorials/steady/flash/flash08_co2_water_package/constant/propertyDict`:

```
/* header comment: the case's own thermo manifest — inline form */
recordType propertyPackage;
schemaVersion 1;
name flash08_co2Water;
components ( water CO2 );
propertyMethods
{
    liquid solution.henryDilute;   // water on the Raoult rung,
    vapour builtin.idealGas;       //   CO2 on the infinite-dilution Henry rung
}
solution
{
    solvent water;
    solutes ( CO2 );
}
parameters
{
    henryPairs
    {
        // Sander (2015) compilation, CC-BY
        CO2-water "data/standards/henrysLaw/CO2-water.dat";
    }
}
```

The selector form:

```
// <case>/constant/propertyDict           (the selector form)
/* header comment REQUIRED: say which manifest this selects, summarise what
   it declares (methods, pairs + sources), and point at the run log for the
   full assembly story.  A bare one-liner is a juice-less file -- forbidden. */
package co2Water_henry;
```

The run header names what was found: `Property package:  INLINE in the case`
or `Property package:  co2Water_henry   (record: data/standards/
propertyPackages/co2Water_henry.dat)`.

### The four VLE worlds — the liquid method slot IS the world

The `propertyMethods.liquid` slot does not merely pick a γ-model: it selects
which of the **four K-value structures** the whole VLE runs on:

| `propertyMethods.liquid` | World | K-value | Reference tutorial |
|---|---|---|---|
| `activity.<Model>` (e.g. `activity.NRTL`) | **γ-φ** | `K_i = γ_i·Psat_i / (φ_i·P)` | `flash02_ethanol_water` (NRTL) |
| `solution.henryDilute` | **dilute solution** | solvent on Raoult; each solute on the full Krichevsky-Kasarnovsky / Krichevsky-Ilinskaya Henry form `y φ_V P = x γ* H(T) exp[v_∞(P−Ps)/RT]` | `flash08_co2_water_package` |
| `eos.<Model>` (`eos.SRK`, `eos.PengRobinson`) | **φ-φ** | `K_i = φ_i^L / φ_i^V` — the SAME cubic's two roots | `flash09_n2ch4_stryjek` |
| `electrolyte.pitzer` / `electrolyte.eNRTL` | **speciation** | ionic activity + osmotic coefficients on the aqueous-ion reference | `aqueousNaCl_pitzer` / the eNRTL packages |

Two hard rules ride on this:

* **Mixed cubics are REFUSED.**  `liquid eos.SRK;` with a DIFFERENT vapour
  cubic (or `builtin.idealGas`) is two Gibbs surfaces pretending to be one
  VLE — the builder refuses at assembly, demanding the same cubic on both
  phases (one Gibbs surface per phase).
* **The world is announced.**  A φ-φ package prints
  `[builder] VLE world: phi-phi (SRK both phases -- K = phi_L/phi_V)` and
  the assembled package carries the `vleWorld phiPhi;` key; the default
  (γ-φ) needs no key.

### kijPairs — declared EoS pair parameters

An EoS-bearing package declares its `k_ij` files the same way Henry pairs
are declared (A3: declare → verify → refuse), from
`tutorials/steady/flash/flash09_n2ch4_stryjek`:

```
parameters
{
    kijPairs
    {
        // Knapp et al., DECHEMA Chemistry Data Series VI (1982)
        N2-CH4 "data/standards/parameters/eos/kij/N2-CH4.dat";
    }
}
```

Each declared record is loaded at assembly — a missing/bad file REFUSES,
naming the entry — and announced LOUD:

```
[builder] kij(N2,CH4) = 0.0289  --- data/standards/parameters/eos/kij/N2-CH4.dat
```

No `kijPairs` block → `kij = 0`, announced (the EoS runs
predictive-degraded; near-critical phase splits will be off).  The inline
`binaryInteractions (…)` form in a flat `propertyDict` stays first-class.

### Per-group reference rungs (amendment A1)

Reference conventions are per COMPONENT-GROUP within a phase, and every
implemented method family (`electrolyte.*`, `activity.*`, `solution.*`,
`eos.*`, `transport.*`) records them uniformly in a `referenceBasis` block.
From `data/standards/propertyMethods/solution/henryDilute.dat`:

```
referenceBasis
{
    liquid
    {
        solvent { rung pureLiquidRaoult;      convention "gamma -> 1 as x -> 1"; }
        solutes { rung infiniteDilutionHenry; convention "gamma* -> 1 as x -> 0";
                  relation "y phi_V P = x gamma* H(T) exp[v_inf (P - Ps)/RT]"; }
    }
    vapour  { all { rung idealGasReference; convention "phi from the declared vapour method"; } }
}
```

The electrolyte methods speak the same grammar on their groups:
`water { rung pureLiquidRaoult; }` / `ions { rung ionAqueousInfiniteDilution; }`
(the H⁺(aq)=0 convention) in `propertyMethods/electrolyte/{pitzer,eNRTL}.dat`.
The run log echoes each selected method's rungs via `[builder]` lines.

### The rules in one paragraph (the 2026-07-04 grammar forum)

Models are per PHASE; reference conventions (Raoult / infinite-dilution
Henry / aqueous-ion) are per COMPONENT-GROUP within a phase (the
`solution{}` block + the method's `referenceBasis`); correlations (Antoine,
Cp) stay per COMPONENT; parameters (Henry, NRTL, Pitzer, k_ij) stay per
PAIR, with their files DECLARED and verified at assembly — a declared-but-
missing pair REFUSES loudly, naming the entry to add.  The run log announces
the selected package, the VLE world, each method's reference rungs
(`[builder]`) and each engaged Henry pair with constants + source
(`[henry]`).  Never mix two gamma-models or two EoS in one phase (one Gibbs
surface per phase).  The flat `propertyDict` form remains fully supported as the
degenerate form — existing cases never migrate forcibly.
