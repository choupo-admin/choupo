# The property door: an independent measurement

Tree: detached `main` at `3b12a4a321`. Read only. The gates were run read-only:
`check_liquid_property_ratchet` OK and `check_liquid_density_entry_callers` OK.

## 1. How the door dispatches

- The door is a set of free functions in `src/thermo/LiquidPropertyDoor.{H,cpp}`. `evaluate` has two stages:
  - **A switch on `enum Property`** (`LiquidPropertyDoor.H:64`, `.cpp:143-157`). It forwards to five hand-written `ThermoPackage` members: `viscosityLiquid` `ThermoPackage.cpp:2274`, `thermalConductivityLiquid` `:2306`, `surfaceTension` `:2353` and `density` `:2416`, plus the diffusivity call. Each of those members hand-rolls the same precedence: pure fluid, then measured, then laws plus a mixing rule, then a check.
  - **A second if-chain** (`.cpp:163-367`). It re-derives the method label "from the decision the package took". The chain's order has to mirror the package's order by hand: the door tests measured first (`.cpp:168`), while the package tests the pure fluid first (`ThermoPackage.cpp:2276` and `:2308`). No divergence was found today, but nothing in the code ties the two orders together.
- **New model:** close to a one-place change.
  - A new liquid-viscosity law is one `registerModel` plus one `declareForm` in `transport/LiquidViscosityModel.cpp:80-105`. Aliases and window behaviour also live in two hard-coded lists in `ThermoPackage.cpp:2885` and `:3086`.
  - A new density method is a factory line in `liquidProperty/DensityMethod.cpp:64-85` plus its rank in `DensityResolver.cpp:230-446`, where the method names are hard-coded. That is two places, which a precedence ranking can justify.
- **New property** (for example liquid Cp): not a one-place change. It touches:
  1. the enum (`H:64`);
  2. `name()` (`.cpp:62`);
  3. the value switch (`.cpp:143`);
  4. the label chain (`.cpp:163-367`);
  5. a new `ThermoPackage` member with its laws, measured list and mixing rule;
  6. the ratchet's `DIRECT_OTHER` regex (`check_liquid_property_ratchet.py`).

  That is at least six places in four files.
- **Liquid density has two doors.**
  - **The wrapper**, `evaluate(Property::density)`. It goes to `ThermoPackage::density`, which only does ideal mixing of record volumes (`:2416-2499`). 16 sites in 14 files call it. Examples: `Pipe.cpp:271,467`, `StorageTank.cpp:186`, `HeatExchanger.cpp:235`, `PhaseChanger.cpp:878,1317`, `PhaseDensity.cpp:126`, `ShellTubeHX.cpp:233`.
  - **The kernel**, `density(Request)`. It goes to `DensityResolver`, which honours measured densities, `solutionLaw` and `massWithoutVolume`. 11 unit sites call it, plus the benches.
  - **Consequence, pinned in a golden** (`tutorials/plant/swro01_campoDalias/expected:3645-3664`). In one run:
    - the pumps price seawater with `solutionLaw.NaCl-water`;
    - the storage tanks and pipe headers on the same water use `idealMix`, with the NaCl dropped: `densityPricedFraction 0.9889` and 996.94 kg/m3 (`expected:65-66`).

    That is two answers for one stream's density.
  - The header still calls the kernel entry scaffolding that "only the pump and the CSTR call" (`H:150-153`). That is stale.

## 2. Bypass census

- **For the five properties the door covers, the reduction is real.** The record counted 82 sites. The ratchet now reports 13, all of class `keyRead` in three props benches, and all pinned as debt (`liquid_property_ratchet_debt.tsv`). My own grep found 0 direct `viscosityLiquid(`, `surfaceTension(`, `thermalConductivityLiquid(`, `diffusivityLiquid*(` or `Vliq()` calls in `unitOperations/` or `postProcessing/`.
- **Outside the door's scope, and outside every gate:** liquid heat capacity. `cpLiquid().Cp(` appears at 18 sites in 11 files.
- **Worst 10:**
  1. `SprayDryer.cpp:540` — 75.4 J/(mol K) water fallback
  2. `SprayDryer.cpp:546` — the same fallback
  3. `EvaporativeDryer.cpp:150` — the same fallback
  4. `PhaseChanger.cpp:885` — skips a component with no Cp, silently
  5. `PhaseChanger.cpp:1345` — the same silent skip
  6. `Crystalliser.cpp:379, 683, 1014` — one loop copied three times, each skipping silently
  7. `HeatExchanger.cpp:165`
  8. `DynamicCSTR.cpp:891`
  9. `AgitatedVessel.cpp:190` — computes `fc->stressUnchecked(g)/g` itself. That is the door's own form-3 arithmetic (`LiquidPropertyDoor.cpp:451-452`), done without recording the use.
  10. `Pipe.cpp:472` and `AgitatedVessel.cpp:116` — read `thermo.flowCurveFor()` directly, although the door exposes the curve (`ApparentViscosity::curve`, `H:195`).
- **The "slice-d density callers" allow-list** (`check_liquid_density_entry_callers.py:44-58`):
  - Its 13 files match reality exactly, and the gate passes.
  - Its docstring (`:17-25`) still lists 8 callers.
  - Its premise is inverted. It calls the entry "scaffolding" whose list "only shrinks", yet the list grew from 2 units to 11: the scaffolding is the door that is actually being adopted.
  - The ratchet's claim line says it does not check `propertyOps/` (`NOT CHECKED: ... propertyOps/`), but `propertyOps` is one of its scanned roots (`SCAN`, `check_liquid_property_ratchet.py:96`).

## 3. Duplication the door should have absorbed

- **The pure-fluid announce-and-trace block is copied four times:** `ThermoPackage.cpp:2276-2290`, `:2308-2321`, `:2357-2370` and `:2432-2440`.
- **Repeated code inside the door itself:**
  - the share-normalisation loop: `LiquidPropertyDoor.cpp:260-261`, `:305-306`, `:362-363`;
  - the use-recording call: `:116-119`, `:373-376`, `:468-470`.
- **The "no liquid viscosity" precondition is hand-written 8 times**, each with its own wording:
  - `DistillationColumn.cpp:5117` and `:5623`;
  - `RateBasedSegment.cpp:268`, nearly verbatim the same text as `:5623`;
  - `EDCell.cpp:144`;
  - `SolidLiquidCore.cpp:149`;
  - `Pipe.cpp:277` and `:477`;
  - `PipeHeaderSize.cpp:185`.

  The package already refuses in this case (`ThermoPackage.cpp:2292`). Diffusivity, by contrast, has one helper (`ColumnTypedProperties.H`, `requireEffectiveLiquidDiffusivity`).
- **Mole-weighted liquid Cp is written per unit, with four different missing-datum policies:**
  - counts the missing components: `HeatExchanger.cpp:158-170`;
  - skips them silently: `PhaseChanger.cpp:883-886` and `Crystalliser.cpp:377-379`;
  - substitutes water: `SprayDryer.cpp:540`.
- **`Request` boilerplate of 2-4 lines at 11 unit sites**, for example `CSTR.cpp:172-174` and `EDCell.cpp:108-113`. A one-call overload would remove it.
- **Two homes for "a component with no liquid volume":**
  - `pricedDensity::select` (`thermo/PricedDensity.H`), which probes each component and drops it, on the wrapper side;
  - the kernel's declared `massWithoutVolume`.

  This is the root of the swro01 split.

## 4. Did the refactor delete plumbing?

- **Migration commits** (src only, `git show --numstat`):

  | Slice | Commit(s) | Added | Removed |
  |---|---|---|---|
  | A | `15a6e579dc` | +36 | -61 |
  | E | `e0f1c70c60` | +27 | -18 |
  | electrochem + membrane | `f90d38929f` | +167 | -88 |
  | B | `2d2a0cdad5` | +64 | -96 |
  | D | `d19815519c`, `86d0de21fc`, `9d668507ac`, `fadd3ac5b5`, `b68439d8a6` | +171 | -156 |
  | C402 step 2 | `7410a64657` | +4 | -4 |
  | **Total** | | **+469** | **-423** |

  The net change is about neutral.
- **The removed lines were real duplicated logic:**
  - unit-level override readers for `operation.viscosity`, `gasViscosity`, `surfaceTension` and the header's `viscosity {}` (`15a6e579dc`);
  - the spray dryer's water knob, `waterViscosityKnob` (`2d2a0cdad5`);
  - the pressure exchanger's own Σx·Vliq with a private ion policy (`9d668507ac`, 63 lines removed).
- **What was added** is mostly:
  - refusals through one shared helper, `unitTypedProperties::refuse` (13 call sites);
  - label and log code.
- **New capabilities were additive:**
  - form 3, the flow curve (`261790afd6`): +2092/-6 in src, almost all in `thermo/transport` plus two consumers;
  - the sample record (`b64a585630`): +591/-45.

## 5. Verdict

- **Elegant:** units no longer type properties. Typed keys are refused in one place (`UnitTypedProperties.H`, 13 callers). A two-sided ratchet with sabotage fixtures keeps it so. The units' bypass count went from 82 to 0, with 13 pinned bench sites left.
- **Elegant:** models below the door use explicit factories with no auto-registration (`LiquidViscosityModel.cpp:80`, `DensityMethod.cpp:64`). Adding a law is organic.
- **Not elegant: two density doors with different physics**, pinned as different numbers in one plant (swro01).
- **Not elegant:** the label is re-derived in a parallel if-chain (`.cpp:163-367`) that must mirror four hand-written precedence functions in `ThermoPackage`. A new property spreads to at least six places.
- **Not covered:** liquid Cp is outside the door and outside every gate. It has 18 call sites, 3 water constants and 4 missing-datum policies.
- **Stale self-descriptions:**
  - `LiquidPropertyDoor.H:150-153` (only "the pump and the CSTR");
  - the entry-callers gate's docstring;
  - the ratchet's claim line (`propertyOps` named as not checked, though scanned).

**The three cheapest improvements:**

1. **Make `evaluate(Property::density)` call the kernel resolver**, and fold `pricedDensity::select` into the kernel's `massWithoutVolume`. That makes one density door. The swro01 rows move, so the list goes to Vítor first. Then delete the entry-callers gate.
2. **Add `liquidProperty::require(thermo, Property, who)` and a `density(thermo, T, P, x, who)` overload.** This deletes the 8 hand-written preconditions and the 11 `Request` blocks.
3. **Add `Property::heatCapacity` to the door with one missing-datum policy**, and teach the ratchet `cpLiquid().Cp(` and the 75.4 literal.
