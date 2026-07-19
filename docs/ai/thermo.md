# thermoPhysPropDict — declaring the thermophysical system

A case's `constant/thermoPhysPropDict` declares the case's whole
thermophysical system: the components, the equilibrium **formulation** (which
K-value structure the VLE runs on), the model in each phase slot, the caloric
routes, and any transport correlations.  It always opens with its record
identity:

```
recordType    thermophysicalPropertySystem;
schemaVersion 2;

components       ( benzene  toluene );

equilibrium
{
    formulation gammaPhi;

    liquid
    {
        activityModel ideal;        // gamma = 1 identically (Raoult)
        standardState pureLiquid;
    }

    vapour
    {
        fugacityModel idealGas;
    }
}
```

That is a complete system for an ideal flash.  Everything is DECLARED — the
formulation, the standard state, the vapour route — even when the choice is
the obvious one.  There are no defaults to assume and no hidden fallbacks: a
shape the builder does not recognise gets a named refusal, never a guess.

## components

A list of component names.  In a **sealed** case (the shipped tutorials) every
name resolves to a record in the case's own `constant/components/<name>.dat`,
verified by `constant/propertyManifest`; in an unsealed case names may also
resolve from the installation catalogue `data/standards/components/` (see
`components.md` for the inventory).

```
components ( water  ethanol  CO2 );
```

Order matters: it sets the indexing the solver uses internally.

## The formulations — the `formulation` keyword IS the VLE world

The `equilibrium.formulation` keyword selects which of the four K-value
structures the whole VLE runs on:

| `formulation` | World | K-value | Reference tutorial |
|---|---|---|---|
| `gammaPhi` | **γ-φ** | `K_i = γ_i·Psat_i / (φ_i·P)` | `flash02_ethanol_water` (NRTL) |
| `diluteSolution` | **dilute solution** | solvent on Raoult; each solute on the full Krichevsky-Kasarnovsky / Krichevsky-Ilinskaya Henry form `y φ_V P = x γ* H(T) exp[v_∞(P−Ps)/RT]` | `flash08_co2_water_package` |
| `phiPhi` | **φ-φ** | `K_i = φ_i^L / φ_i^V` — the SAME cubic's two roots | `flash09_n2ch4_stryjek` |
| `electrolyteGammaPhi` | **aqueous electrolyte** | ionic activity + osmotic coefficients on the aqueous-ion reference | `pitzer02_nacl_package` |

Two hard rules ride on this:

* **One Gibbs surface per phase.**  In `phiPhi` both phase slots take their
  fugacity from the ONE declared `equationOfState` (`fugacityRoute
  equationOfState; root liquid|vapour;`) — two different cubics, or a cubic
  liquid against an ideal-gas vapour, are two Gibbs surfaces pretending to be
  one VLE and the builder refuses at assembly.
* **The world is announced.**  The run log's `[builder]` lines name the
  assembled formulation, each phase's model and reference rung, and every
  parameter file engaged.

### `gammaPhi` — activity liquid, fugacity vapour

```
equilibrium
{
    formulation gammaPhi;

    liquid
    {
        activityModel
        {
            model NRTL;
            binaryParameters            // the dict OWNS the numbers (inline)
            {
                ethanol-water
                {
                    i ethanol;  j water;
                    a_ij -0.8009;  b_ij  246.18;
                    a_ji  3.4578;  b_ji -586.0809;
                    alpha 0.30;
                }
            }
        }
        standardState pureLiquid;
    }

    vapour { fugacityModel idealGas; }
}
```

A parameter block may instead point at a catalogue file:

```
binaryParameters
{
    // Sander (2015) compilation, CC-BY
    CO2-water { source "data/standards/parameters/Henry/CO2-water.dat"; }
}
```

Every declared file is loaded and verified at assembly — a
declared-but-missing file REFUSES loudly, naming the entry to add.

Liquid `activityModel` choices:

| `model` | What it is | When to use |
|---|---|---|
| `ideal`  | γᵢ = 1 (Raoult).  Trivial baseline. | Air, dilute, hydrocarbons-only. |
| `NRTL`   | Renon & Prausnitz (1968).  Handles LLE. | Polar non-ideal mixtures (ethanol/water, alcohols, …). |
| `UNIQUAC`| Abrams & Prausnitz (1975). | Alternative to NRTL where UNIQUAC pairs exist. |
| `Wilson` | Cheaper than NRTL but **cannot represent LLE** (structural). | Mild non-ideality, no expected liquid split. |
| `UNIFAC` | **Predictive** — γ from molecular GROUPS, NO fitted binary parameters (original UNIFAC; Fredenslund 1975 / Hansen 1991). | A binary with no regressed data: get a first VLE from structure alone, then SEE the error vs data.  Weak for alcohol-water (predicts the azeotrope but misplaces it — original-UNIFAC's known limit). |
| `cosmoSAC` | **Predictive** — γ from each component's COSMO σ-profile (Lin & Sandler 2002, NIST constants).  Multi-set: `source <setName>;` picks a named profile set. | A binary with no pairs where the components carry `cosmo {}` data. |

`UNIFAC` takes no pairs.  The group decomposition is COMPONENT data, resolved
from each component's own `.dat` — one home, never re-declared per case:

```
// each component's .dat carries its decomposition:
groups
{
    unifac ( { group CH3; count 1; } { group CH2; count 1; } { group OH; count 1; } );
}
```

An inline `groups {}` block inside the activity model is refused (it would let
the same molecule change structure per case); a pedagogical alternative
decomposition goes in a case-local component overlay
(`constant/components/<name>.dat`).  A UNIFAC system whose participating
component lacks a decomposition is an ERROR with the remedy — never a silent
γ = 1.

**Pair coverage (no silent crutch).**  NRTL/UNIQUAC/Wilson need a pair for
EVERY binary (N components ⇒ N(N−1)/2 pairs).  An uncovered pair does NOT
abort the run — it **defaults to ideal** (τ = 0) so you can build the
foundation pair-by-pair — but it is never silent: each ideal-defaulted pair
is announced (a `[thermo]` log line + a run-JSON advisory the GUI shows), and
the GUI's pair-coverage matrix colours every pair by where it resolved.
Resolution order for an uncovered pair: the owning node's
`constant/parameters/<MODEL>/<i>-<j>.dat` → the case root's → the standard
catalogue `data/standards/parameters/<MODEL>/` → the private, gitignored
`data/local/` tier (announced `[local] UNVERIFIED`).

### `diluteSolution` — Henry's law with a declared solvent

WHO dissolves in WHAT is declared structurally, not by flags:

```
equilibrium
{
    formulation diluteSolution;

    liquid
    {
        solvent
        {
            component     water;
            standardState pureLiquid;          // the Raoult rung
        }
        solutes
        {
            components    ( CO2 );
            standardState infiniteDilution;    // the Henry rung
            solutionModel henryDilute;
            binaryParameters
            {
                // Sander (2015) compilation, CC-BY
                CO2-water { source "data/standards/parameters/Henry/CO2-water.dat"; }
            }
        }
    }

    vapour { fugacityModel idealGas; }
}
```

Used by absorbers/strippers and aqueous gas absorption (CO2, NH3, O2, H2S,
SO2, CH4, Cl2, HCl in water all ship as Henry pairs).

### `phiPhi` — one cubic, both phases

```
equilibrium
{
    formulation phiPhi;

    equationOfState
    {
        model      SRK;                        // or PR
        mixingRule vanDerWaalsOneFluid;
        binaryInteractions
        {
            // Knapp et al., DECHEMA Chemistry Data Series VI (1982)
            N2-CH4 { source "data/standards/parameters/SRK/N2-CH4.dat"; }
        }
    }

    liquid { fugacityRoute equationOfState; root liquid; }
    vapour { fugacityRoute equationOfState; root vapour; }
}

caloric
{
    energyBasis elementsDatum;
    liquid { departureRoute equilibriumEquationOfState; root liquid; }
    vapour { departureRoute equilibriumEquationOfState; root vapour; }
}
```

The cubics (SRK, PR) deliver BOTH roots — `phiLiquid` is the smallest
physical root above the co-volume.  `idealGas` refuses `phiLiquid` (it can
never fake a liquid root), so it is never a legal liquid slot.  No
`binaryInteractions` → `kij = 0`, announced (predictive-degraded;
near-critical splits will be off).  SRK/PR read each component's `Tc`, `Pc`,
`omega` — no model-specific data files.

In a `gammaPhi` system a cubic may still serve the VAPOUR slot alone
(`vapour { fugacityModel SRK; }`) — that is a γ-φ world with a real-gas φ,
not φ-φ.

### `electrolyteGammaPhi` — aqueous electrolytes

```
equilibrium
{
    formulation electrolyteGammaPhi;    // aqueous electrolyte x ideal vapour

    aqueous
    {
        solvent            water;
        apparentComponents ( NaCl );    // stream carries the salt; the model
                                        //   activates its ions (dissociatesTo)
        activityModel { model Pitzer; } // single-salt VLE adapter
        compositionBasis molality;
    }

    vapour { fugacityModel idealGas; }
}

caloric
{
    energyBasis elementsDatum;
    aqueous { enthalpyRoute ionicReferencePlusExcess; }  // aq inf-dilution ion
    vapour  { enthalpyRoute idealGasCp; }                //   datum + L_phi
}
```

The stream carries the SALT (the flowsheet/component basis); the model
activates its ions from the component's `dissociatesTo` and the ion records
in `species/`.  Multi-ion speciation (`pitzerHMW`, `davies`) is a propsDict
`speciate` operation, not a flowsheet formulation.

## caloric — the energy routes

The `caloric {}` block declares how enthalpy is computed per phase.
`energyBasis elementsDatum;` is the project convention: ONE datum — the
elements at 298.15 K / 1 bar — so energy balances may legally cross
reactors.  Routes per phase (`idealGasCp`, `equilibriumEquationOfState`
departures, `ionicReferencePlusExcess`) name where the sensible/latent legs
come from.  When the block is omitted the builder uses the formulation's
canonical routes and says so.

## transport  (optional; for unit ops that need μ / k / D / σ)

Transport correlations are declared per PHASE, and an interface block covers
surface tension:

```
transport
{
    vapour
    {
        viscosity           { model Chung; }    // gas mu
        thermalConductivity { model Eucken; }   // gas k (Cp + mu)
        diffusivity         { model Fuller; }   // binary gas D (Sigma v)
    }

    liquid
    {
        viscosity           { model Vogel; }      // or Andrade
        thermalConductivity { model SatoRiedel; } // or Latini
        diffusivity         { model WilkeChang; } // or Scheibel
    }

    interface
    {
        surfaceTension { model BrockBird; }
    }
}
```

Pick by need:

| Need | Sub-model |
|---|---|
| Gas viscosity (low pressure) | **`Chung`** — uses Tc/Pc/ω/MW, zero new data. |
| Gas thermal conductivity | **`Eucken`** — `λ = (Cp+5R/4)·μ/M`, no extra data. |
| Gas binary diffusivity | **`Fuller`** — needs `diffusionVolume` on each component (water/N2/O2/CO2/CH4/H2/CO ship it). |
| Liquid viscosity | **`Vogel`** (3-param `ln μ = A+B/(T-C)`, water 0.2 % RMS) or **`Andrade`** (2-param). |
| Liquid thermal conductivity | **`SatoRiedel`** (parameter-free, organics) or **`Latini`** (family-tuned). |
| Liquid binary diffusivity | **`WilkeChang`** (needs `associationFactor`) or **`Scheibel`** (no association). |
| Surface tension | **`BrockBird`** (corresponding states). |

When a unit op needs a transport property the system doesn't supply, the
solver throws a clear error naming the missing slot.

## The three-tier model-parameter rule

A model's parameter lives at the **highest tier where it is true** — the
same arity test as the component glossary, asked of the *model* (*does the
number require you to name the model?*).  See
[`data-doctrine.md`](data-doctrine.md) §4.

1. **Corresponding-states triad → stays on the component, untouched.**  Any
   model that needs only `{Tc, Pc, ω}` (every cubic: SRK, PR, a new
   α-function) reads the triad off the component and derives its own
   `a_c, b, m, α(T)` **in source**.  Adding such a model touches **zero data
   files**.  Never pre-bake `a_c` into a `.dat`.
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
   A model with **no** required block on a component **fails with a remedy**
   — never a silent corresponding-states fallback.
3. **PAIR parameters (NRTL τ, Henry, Pitzer β, `k_ij`) → the parameter
   catalogue**, `data/standards/parameters/<MODEL>/<i>-<j>.dat`, referenced
   from a `binaryParameters`/`binaryInteractions` block by `source`, loaded
   and verified at assembly with a LOUD `[builder]` line — with the inline
   numbers form staying first-class.

## The aqueous solution tier + the default-solvent rule

A solute property whose **definition names a solvent** — an "in-water"
ΔH_soln, an aqueous Hf°, a solubility curve — is arity-2 PAIR data.  It does
**not** go in the component `.dat`; it lives in a by-name catalogue tier:

| Solute kind | Tier | Carries |
|---|---|---|
| **ions** (∞-dilution) | `data/standards/species/<name>.dat` (one `recordType modelSpecies` file per species) | `hfAq / sAq / cpAq` on the H⁺(aq)=0 convention (Wagman/NBS 1982) |
| **molecular solutes** | `data/standards/parameters/solution/<solute>-<solvent>.dat` | ΔH_soln and other solution thermo, primary-cited |

Water earns **one canonical, named, by-name aqueous reference tier** — never
an *implied component slot*.  When a solution property is needed and no
solvent is named at the call site, the resolver uses the declared default
**and announces it on every run**; off-default it **fails with a remedy** —
never a silent water substitution.  See [`data-doctrine.md`](data-doctrine.md) §2.

## The fractal cascade — where a refined number goes

A datum lives at the **highest level where it is TRUE**; a lower node only
**overlays** it when the lower scope makes it *more true*.  The overlay merges
**block-by-block** (top-level-key replacement of the whole reference-state
block), never field-by-field.

| Question about your number | Home |
|---|---|
| stands alone with one molecule (MW, Tc, ω, crystalline ΔH_f) | the component record (`constant/components/<name>.dat` in a sealed case; `data/standards/components/` in the catalogue) |
| names a second species (NRTL τ, Henry, Pitzer β, k_ij, ΔH_soln-in-water) | a catalogue, keyed by the pair, referenced by `source` |
| a sample-specific refinement of a molecular block (this powder's sorption) | `<case>/constant/components/<name>.dat` overlay (whole block) |
| a sample-specific pair/model-param refinement | `<case>/constant/parameters/<MODEL>/<pair>.dat` or an `eosParameters{}` overlay |
| a RATE (kinetics) or GEOMETRY (PSD) — the molecule-in-a-machine | the operation's `constant/` (`crystallisation`, `dryingKinetics`, `reactions`); PSD is a **stream** attribute |

Precedence, lowest → highest: `local < standard < case < sector < unit`.
Full rule + the merge semantics: [`data-doctrine.md`](data-doctrine.md) §3.

## membrane (only for spiralWoundModule)

A membrane case declares which membrane the spiral-wound module uses
on a per-unit basis (see `unit-ops.md > spiralWoundModule`), not at
the system level — but the components include the solute(s),
and the solute must have `nonvolatile true;` + `dissociation <nu>;`
in its `.dat` (NaCl, glucose, MgSO4 ship this).

## What does the simulator do with thermoPhysPropDict?

The four binaries all hand the authored dict to
`ThermoPackageBuilder::build(dict, db, chemistry)` at startup, which:

1. Verifies `recordType thermophysicalPropertySystem;` (any other shape is a
   named refusal).
2. Loads each component's `.dat` — from the case's sealed `constant/`
   records (manifest-verified) or, unsealed, from the catalogue.
3. Assembles the declared formulation natively: instantiates the activity /
   EoS / transport models via the explicit factories, loads + verifies every
   declared parameter file, resolves the reference rungs.
4. Caches Antoine, Cp, Hvap polynomials for fast K-value / enthalpy calls.

The builder **assembles, never estimates** — a missing datum is a curation
problem solved before the run (`curation-protocol.md`), not a runtime guess.
After assembly the package is passed to every unit op's `solve(dict, thermo,
verbosity)`.  Units consume only the slice they need.  A per-unit
`thermo {}` override REPLACES the models for that unit only (components stay
global) — the boundary is announced, see `energy.md` §model boundaries.

## Enthalpy reference state (the `phase` field in `standardThermochemistry`)

Choupo uses the **elements-at-298.15 K / 1 bar** datum for any
energy balance that crosses a reactor (this is the same convention as
NIST and JANAF).  Each component's
`standardThermochemistry { dHf_298; s_298; phase; }` block carries the
formation enthalpy plus a one-word **`phase`** field declaring in
which phase `dHf_298` is tabulated:

| `phase`  | Required Cp model                  | Typical species |
|----------|------------------------------------|-----------------|
| `gas`    | `idealGasHeatCapacity`             | the convention --- volatiles + radicals |
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

New components should always declare `phase` explicitly so the datum is
unambiguous at the source of truth.  The same rule applies to per-case
overlays under `<case>/constant/components/<name>.dat`.

## The rules in one paragraph

Models are per PHASE (the formulation's slots); reference conventions
(Raoult / infinite-dilution Henry / aqueous-ion) are per COMPONENT-GROUP
within a phase (`standardState` on the solvent/solutes groups); correlations
(Antoine, Cp) stay per COMPONENT; parameters (Henry, NRTL, Pitzer, k_ij)
stay per PAIR, declared by `source` and verified at assembly — a
declared-but-missing file REFUSES loudly, naming the entry to add.  The run
log announces the assembled formulation, each phase's model and reference
rung (`[builder]`), and each engaged Henry pair with constants + source
(`[henry]`).  Never mix two gamma-models or two EoS in one phase — one Gibbs
surface per phase.
