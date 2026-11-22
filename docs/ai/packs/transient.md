# Pack: transient simulation (batch vessels and recipes, start-up and disturbance, control)

budget: 1400 words (~2240 tokens)

Read after the brief (`docs/ai/brief.md`). Three binaries, chosen by `application` in `system/controlDict`, each its own problem class; the brief's steady `units (...)` grammar still applies but the unit TYPES differ. Fuller keys: `docs/ai/unit-ops.md` sections "batchReactor", "Recipe events", "choupoCtrl / choupoSemiContinuous", "Controllers".

## 1. Which binary

| You have | `application` | Units |
|---|---|---|
| a closed vessel or a campaign: react, then distil, crystallise, dry, adsorb, diafilter | `choupoBatch` | `batchReactor`, `batchStill`, `batchAccumulator`, `batchCrystalliser`, `batchAdsorber`, `fixedBedAdsorber`, `batchDiafilter`, `batchDryer`, `batchElectrodialysis`; a timed `recipe` |
| a continuous plant watched through a start-up, a step, feed-and-bleed: NO controller | `choupoSemiContinuous` | `dynamicCSTR`, `dynamicTank`, `quasiSteady` (wraps any steady unit) |
| the same plus a PID or a forcing signal | `choupoCtrl` | the same, plus `controllers ( ... )` |
| the plant at its steady state | `choupoSolve` | pack `recycles` and the other packs |

`choupoSemiContinuous` REFUSES a `controllers` block; a `recipe` is read by `choupoBatch` ONLY (refused by name in the other two). A timed change in a continuous process is a `Schedule` or `Signal` controller under `choupoCtrl`.

## 2. The time keys, in `controlDict`

```
application   choupoBatch;     // | choupoSemiContinuous | choupoCtrl
startTime 0;  endTime 600;  deltaT 1.0;  writeInterval 30;     // seconds
solutionControl { write true; }                                 // time directories <t>/ (default on)
```
Fixed-step RK4 by default. Stiff chemistry: `solver { integrator Rosenbrock23 | Rodas4 | seulex; }` on the unit (`batchReactor`). A run writes `trajectory.csv` and time directories `<t>/` that restart the case (a time directory renamed `0/`).

## 3. The initial state is a file: `0/internalStates/<unit>`

One file per unit, the SINGLE source of truth (an inline `initial {}` in `flowsheetDict` is refused). From `tutorials/batch/reactor/batch01_first_order`:
```
recordType internalState;   unit "reactor";   equipment batchReactor;
holdup { T 350.0 K; P 1.013 bar; V 0.001;           // m3
         totalMoles 0.0185;                         // kmol
         molarComposition { ethanol 0.5; aceticAcid 0.5; ethylAcetate 0.0; water 0.0; } }
```
`equipment` must name the unit's type. `start steadyState;` inside `holdup {}` seeds a dynamic unit at its steady point (the default `start explicit;` keeps what is written).

## 4. A batch vessel

Same case, `system/flowsheetDict`:
```
units ( { name reactor; type batchReactor;
          operation { mode isothermal; T_setpoint 350.0 K; }     // or `mode adiabatic;`
          reaction esterification_etac; } );                     // or `reactions ( r1 r2 );`
```
and `constant/reactions` (the named-reaction library; every reaction mass-balanced):
```
esterification_etac { limitingReactant ethanol;
  stoichiometry ( { component aceticAcid; nu -1; order 0; } { component ethanol; nu -1; order 1; }
                  { component ethylAcetate; nu 1; order 0; } { component water; nu 1; order 0; } );
  kinetics { type Arrhenius; A 1.0e8; Ea 7.0e4; } }
```
Kinetic types: `Arrhenius`, `LHHW` (`catalystLoading` in `operation`), `expression`, and the gas CHEMKIN forms (`modifiedArrhenius`, `thirdBody`, `falloff`, `plog`; see pack `reactors` and `docs/ai/unit-ops.md` `batchReactor`). `mode adiabatic` takes `energy liquidDH | gasConstantV | gasConstantP`. Witnesses: `tutorials/batch/reactor/batch02_adiabatic`, `batch06_adaptive_runaway`, `batch07_lhhw_methylAcetate`; combustion: `tutorials/batch/combustion/` (pack `reactors`).

## 5. A campaign: several vessels and a recipe

Units list the vessels; the `recipe` list sits in `flowsheetDict` after `units`. From `tutorials/batch/recipes/recipe01_react_then_distill`:
```
recipe ( { time 400; action transfer; from reactor; to still; } );
```
Actions: `transfer` (optional `fraction`), `setParameter` (`unit`, `key T_setpoint` or `T`, `value`), and a `when` trigger instead of `time`:
```
{ when { unit reactor; quantity x_ethanol; op lt; value 0.30; }
  action transfer; from reactor; to still; fraction 0.5; }     // quantity: T | total | n_<comp> | x_<comp>; op: gt ge lt le
```
Events fire at the next step boundary. Cooling failure of a jacketed vessel: `setParameter ... key adiabatic; value 1;` (`tutorials/batch/reactor/batch26_cooling_failure`); dosing: `batch27_semibatch_dosing`; a setpoint ramp: `tutorials/batch/recipes/recipe02_setpoint_ramp`; condition-triggered: `recipe03_conditional_partial`. The campaign keeps a material and an energy LEDGER (mass closes by construction). Other batch units, keys in `docs/ai/unit-ops.md`: `tutorials/batch/still/`, `tutorials/batch/crystallisation/`, `tutorials/batch/drying/`, `tutorials/batch/membrane/`, `tutorials/batch/electrodialysis/`, `tutorials/batch/adsorber/`. A tablet plant with lots is a different layer: pack `batch-plant`.

## 6. Start-up and disturbance, no controller: `choupoSemiContinuous`

From `tutorials/unsteady/unsteady05_tank_valve_drain`, `flowsheetDict`:
```
units ( { name tank; type dynamicTank; in feed; outputs ( drain );
  operation { geometry { shape verticalCylinder; diameter 2.0 m; height 4.0 m; }
              outflow { mode valve; opening 0.5;
                        valve { Cv 2.3e-3 m2; downstreamPressure 101325.0 Pa; } } } } );
```
`0/feed` is the stream at t = 0 (the NEW inflow: that is the step); `0/internalStates/tank` is the holdup by `level`:
```
recordType internalState;  unit "tank";  equipment dynamicTank;
holdup { T 293.15; P 101325.0; level 1.0; molarComposition { water 1.0; } }
```
- `outflow` is REQUIRED (the student decides it): `mode flow; F <kmol/s>;` integrates the level; `mode valve; opening; valve { Cv; downstreamPressure; }` self-regulates (`Cv` is an area in m2, not the US gpm coefficient). A tank that runs dry or overflows is REFUSED at that instant, never clamped. No reaction in a `dynamicTank`.
- A reacting vessel with a level: `dynamicCSTR` with `operation { volumeMode variable; geometry {...} outflow {...} }` (`tutorials/unsteady/unsteady06_reactor_fill_and_react`); constant volume: `tutorials/ctrl/ctrl01_cstr_temp_control`.
- A steady unit inside a transient (a membrane module, a mixer): wrap it, `{ name NF; type quasiSteady; in ModuleIn; outputs ( Retentate Permeate ); unit { type spiralWoundModule; operation {...} } }` (topology on the wrapper, none inside): `tutorials/unsteady/unsteady03_nf_feed_and_bleed_startup`. A loop must be fed from outside or hold a vessel with an outflow law, else it is refused by name (who sets the flow).
- `dynamicCSTR` with `Sum nu != 0` and constant volume never reaches a steady state: announced; use the steady `cstr` for that answer.

## 7. Control: `choupoCtrl`, `controllers` in `flowsheetDict`

From `tutorials/ctrl/ctrl21_tank_level_control` (a Signal steps the inflow at 600 s; a PI holds the level):
```
controllers
( { name FeedStep; type Signal; actuator { unit tank; inletField F; }
    signal { type step; mean 0.20; step 0.10; tStep 600.0; } }
  { name LC1; type PID;
    measurement { unit tank; cv level; }  actuator { unit tank; mv F_out; }
    setpoint 2.0;
    gains { Kp -2.0; Ki -0.01; Kd 0.0; }              // NEGATIVE: a level on the outflow is reverse acting
    output { min 0.0; max 1.0; bias 0.20; } } );
```
Controller types: `PID` (clamping anti-windup), `Schedule` (piecewise constant), `Signal` (`step`, `staircase`, `ramp`, `pulse`, `sine`). The manipulated variables and controlled variables of each unit are named strings (`T_jacket`, `T_in`, `F_out`, `opening`, `level`, `T`, ...); a key the unit does not publish is refused by name. Temperature control of a CSTR: `tutorials/ctrl/ctrl01_cstr_temp_control`; a sinusoidal disturbance and a Bode point: `ctrl06_sine_disturbance`, `ctrl20_bode_cstr`; a plant: `ctrl12_williams_otto`.

## 8. Pitfalls

- Direct-acting PID with `error = setpoint - measurement`: a level-to-outflow loop needs NEGATIVE gains.
- The holdup file must exist for every dynamic or batch unit, with `equipment` equal to the type.
- `endTime` should span about 5 to 9 time constants; `deltaT` small enough for RK4 on the fastest one (a stiff mechanism needs a stiff integrator, not a smaller `deltaT`).
- Do not put a `recipe` under `choupoCtrl`, nor `controllers` under `choupoSemiContinuous`.
- The first law across a `quasiSteady` unit is not claimed (the ledger says so); `dynamicTank`, `dynamicCSTR` and `batchReactor` claim mass and energy.
- Guides: Theory Guide `ch:batch-adiabatic`, `sec:batch-gas-constp`, `sec:batch-analytic-jacobian`; Tutorials Guide `docs/tutorialsGuide-batch.tex`, `docs/tutorialsGuide-ctrl.tex`, `docs/tutorialsGuide-unsteady.tex`.

<!-- RUN: batch01, unsteady05 and ctrl21 are golden-checked by bin/runTests.
     SOURCES: docs/ai/unit-ops.md lines 3376-3440, 3967-4245; the flowsheetDict, controlDict and 0/ files of the cases named above;
              src/unitOperations/batch/BatchUnitOperation.cpp:96-147, src/unitOperations/dynamic/DynamicUnitOperation.cpp:115-124, src/control/Controller.cpp.
-->
