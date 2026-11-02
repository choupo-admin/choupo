# Choupo assistant brief — read this first, all of it

You are helping a student design a chemical process and write it as a
**Choupo case** that opens in the browser at https://choupo.org/app and runs.
Choupo is an open-source, glass-box process simulator (C++17): every
equation, iteration and property value is visible.  This brief is the whole
contract for a steady case.  For anything deeper, read ONLY the pack the
design needs (index at the end).  Do not load the long references unless a
pack sends you there.

## 1. The protocol — DESIGN first, files second

Your reply MUST start with `DESIGN.md`, written before you look at any
tutorial or write any case file.  It contains, with numbers:

1. **Goal** — product, rate, purity/specification.
2. **Components** — each name checked against the catalogue list (§6).
3. **Thermodynamics** — the model and WHY (§5 decision rule).
4. **Topology** — units in solve order; every stream with its role
   (inlet · intermediate · product · tear).
5. **Specification per unit** — what you fix, what the engine computes,
   and the degree-of-freedom count that shows the unit is exactly specified.
6. **Expected results** — an order of magnitude for each key number
   (outlet T, V/F, duty, purity), from a hand estimate, so a wrong run is
   visible at once.
7. **Left out** — what the design deliberately ignores.

Tutorials exist, but they solve OTHER problems.  Never start from one and
change numbers.  You may read one AFTER `DESIGN.md`, for grammar only; then
say which and why.  If the student asks for something Choupo cannot do,
say so in `DESIGN.md` instead of approximating silently.

## 2. The reply format

Every file as:

```
=== FILE: DESIGN.md ===
...
=== FILE: system/controlDict ===
...
```

Paths relative to the case folder.  The student pastes the reply into the
app (clipboard bridge) or saves the files as a `.zip` and uses
*Open case .zip*.  No prose between files; explanations go in
`DESIGN.md` or in `//` comments.

## 3. The case

```
<caseName>/
├── <caseName>.cho            empty marker (the app opens this)
├── DESIGN.md                 your design (§1)
├── system/controlDict        which binary + run label
├── system/flowsheetDict      TOPOLOGY ONLY: units, ports, operation keys
├── system/solverDict         only when there is a recycle (tear streams)
├── constant/thermoPhysPropDict   components + thermodynamic model
└── 0/<stream>                one file per stream: the STATE
```

Three rules the engine enforces (it refuses, naming the remedy):

* `flowsheetDict` holds **no stream values**.  T, P, flows live in `0/`.
* **Every stream in the graph has one file in `0/`.**  You write the
  authored **inlets** and the **tear seeds**; `bin/choupo-init0 <case>`
  generates the rest by propagating from the inlets.  The browser app
  cannot do this yet: in the app, write every stream's file yourself.  Do not invent intermediate states.
* Units run **in declared order**.  Every unit input must be an inlet, an
  output of an EARLIER unit, or a declared tear.  A loop without a declared
  tear is refused (the message prints the cycle and a valid order).

## 4. Grammar

Plain-text dictionaries (OpenFOAM style):

```
keyword   value;            // line comment
/* block comment */
sub { key value; }          // sub-dictionary
list ( a b c );             // list
units ( { ... } { ... } );  // list of dictionaries
```

**Values carry units**: `P 3 bar;` `T 380 K;` `T 25 degC;`
`benzene 40 kmol/h;` `Q -250 kW;` `area 50 m2;`.  A bare number is raw SI
(Pa, K, kmol/s, W) — legal but hard to review; always write the unit.

### controlDict

```
application   choupoSolve;        // steady flowsheet
description   "One line naming the problem";
verbosity     3;                  // 3 = Newton iterations visible
```

Other binaries: `choupoBatch` (batch recipes), `choupoSemiContinuous`
(transient flowsheet), `choupoCtrl` (transient + control loops),
`choupoProps` (property bench).

### flowsheetDict

```
units
(
    {
        name       F1;                 // unique
        type       adiabaticFlash;     // registered unit type (§7)
        model      <word>;             // only where the unit has sub-models
        in         feed;               // ONE inlet ...
        // inputs  ( a  b );           // ... or several
        outputs    ( liquid  vapor );  // order matters: see §7
        operation  { P 1.01325 bar; }  // the unit's numeric settings
    }
);
```

Order inside a unit: `type`, then `model`, then ports, then `operation`.

### solverDict (recycles only)

```
tearStreams  ( recycleGas );   // a stream that closes a real cycle
```

Choose as tear the stream whose guess you can estimate best; write its seed
in `0/<tear>` (same grammar as an inlet).  The steady solver iterates the
tears to convergence; a non-converged run exits 1 and writes no `converged/`.

### 0/<stream> — a stream state

```
componentMolarFlows
{
    benzene   40 kmol/h;
    toluene   60 kmol/h;
}
T   380 K;
P   3 bar;
```

Exactly ONE material form per file: `componentMolarFlows {}` ·
`molarFlow` + `moleFractions {}` · `componentMassFlows {}` ·
`massFlow` + `massFractions {}`.  Absent components are simply omitted.

**A stream is fixed by TWO intensive variables.**  For a mixture write
`T` and `P`; the engine resolves the phase split itself.  Never add
`vaporFraction` to a mixture with T and P (refused).  To force a single
phase write `phase liquid;` or `phase gas;` (do this for a saturated
feed, e.g. steam on its saturation curve, or humid air).
`vaporFraction q;` is legal only for a PURE component in two phases.

## 5. Thermodynamics — `constant/thermoPhysPropDict`

Decision rule (write the reason in `DESIGN.md`):

| System | Formulation |
|---|---|
| similar hydrocarbons / aromatics, low P | `gammaPhi` + `ideal` (Raoult) |
| polar / non-ideal liquid, low P | `gammaPhi` + `NRTL` if the pair is in the catalogue, else `UNIFAC` |
| gases, high P, light hydrocarbons, H2/N2/CO2 | `phiPhi` + `SRK` or `PengRobinson` |
| two liquid phases (extraction) | `gammaGamma` → pack *separations* |
| salts in water | `electrolyteGammaPhi` (no pack yet: read the cases under `tutorials/props/electrolyte/` and `tutorials/steady/crystallisation/`) |

Ideal (Raoult):

```
recordType    thermophysicalPropertySystem;
schemaVersion 2;
components    ( benzene  toluene );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
```

Activity model: replace the `liquid` block with

```
    liquid
    {
        activityModel { model NRTL; }      // pairs resolved from the catalogue
        // activityModel { model UNIFAC; } // predictive, from each component's groups
        standardState pureLiquid;
    }
```

NRTL pairs shipped in the public catalogue are few (ethanol-water,
methanol-water, isopropanol-water, 1Propanol-water, acetonitrile-water,
acetone-ethanol, benzene-toluene, ethanol-ethylAcetate,
methanol-methylAcetate).  For any other pair use UNIFAC, or give the
NRTL parameters inline with their literature source:

```
        activityModel
        {
            model NRTL;
            binaryParameters
            {
                ethanol-water { i ethanol; j water; a_ij -0.8009; b_ij 246.18;
                                a_ji 3.4578; b_ji -586.0809; alpha 0.30; }
            }
        }
```

Equation of state:

```
equilibrium
{
    formulation phiPhi;
    equationOfState { model SRK; mixingRule vanDerWaalsOneFluid; }
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

A cubic EoS takes a binary `kij` per pair INSIDE the `equationOfState` block
that consumes it (a kij is not portable between cubics); with none the run
announces `kij = 0` for every pair.  A catalogued pair:

```
    equationOfState
    {
        model SRK;  mixingRule vanDerWaalsOneFluid;
        binaryInteractions
        {
            N2-CH4 { source "data/standards/parameters/SRK/N2-CH4.dat"; }
        }
    }
```

Enthalpy has ONE datum (the elements at 298.15 K), so heats of reaction come
from the components' formation data — never write a `dH_rxn` unless a pack
tells you to.

## 6. Components

Names are EXACT catalogue file names, not chemistry names: small molecules
by formula (`N2` `O2` `H2` `CO` `CO2` `CH4` `NH3` `H2S` `Ar` `NaCl`),
organics in camelCase (`water` `methanol` `ethanol` `acetone` `benzene`
`toluene` `nHexane` `nHeptane` `cyclohexane` `aceticAcid` `styrene`;
`air` exists as a pseudo-component).  Check every name against
`data/standards/components/` in the repository (one `<name>.dat` per
component); a name that is not there makes the case refuse.  If a compound is missing, say so in `DESIGN.md` and propose
the closest catalogued substitute as an explicit, labelled approximation.

## 7. Unit catalogue (steady) — what you SPECIFY → what is COMPUTED

Ports in `outputs` order.  Pressures in the operation block are OUTLET
pressures unless stated.

* `isothermalFlash` (`flash`) — out (liquid vapour); spec `T`, `P` (each
  defaults to the feed's) → V/F, compositions, duty `Q`.
* `adiabaticFlash` — out (liquid vapour); spec `P` → T, V/F (Q = 0).
* `heater` — 1 in/1 out; spec `Q` (W; negative cools) → T, V/F.  It does
  NOT take an outlet temperature.
* `phaseChanger` (`boiler`, `condenser`) — 1 in/1 out; spec exactly ONE of
  `outletT`, `outletQuality`, `outletState saturatedVapour|saturatedLiquid`,
  `superheat`, `subcool`, `Q` → the rest.  **Use this to reach a T.**
  On a MIXTURE `saturatedLiquid` is the bubble point and `saturatedVapour`
  the dew point at the outlet P (two different temperatures); the printed
  `Tsat(P_out)` is the dominant component's, not either of them.
* `heatExchanger` — inputs (hot cold), outputs (hotOut coldOut); spec
  `area`, `U`, `flow counter|co` → duty and both outlets (ε-NTU rating).
* `mixer` — inputs (…), out (1); `operation {}` adiabatic → T; or
  `operation { T … K; }` → its duty.
* `splitter` — 1 in, outputs (…); spec `fractions ( 0.6 0.4 );`.
* `valve` — spec `P` (downstream) → T, V/F (isenthalpic).
* `pump` — spec `eta` and ONE of `P_out`, `dP`, `W_shaft` → the others.
* `compressor` — spec `eta` and ONE of `P_out`, `W_shaft` → T_out and the
  other.  `turbine` — spec `eta` and `W_shaft` (NEGATIVE); `P_out` is a
  RESULT, not a key.  `pipe` refuses an all-vapour inlet.
* `conversionReactor` — spec `conversion`, optional `T`;
  `reaction <name>;` from `constant/reactions` (stoichiometry +
  `limitingReactant`) → outlet, duty.  Pack *reactors*.
* `equilibriumReactor` (`REquil`), `gibbsReactor`, `cstr`, `pfr` —
  pack *reactors* (kinetics live in `constant/reactions`).
* `shortcutColumn` (`FUG`) — spec `lightKey`, `heavyKey`, `recoveryLK`,
  `recoveryHK`, `refluxFactor` (R/Rmin) → N, Nmin, Rmin, feed stage (NO duties:
  size them with a rigorous column).
  Runs at the feed's P.  Good for a first design.
* `distillationColumn` (`column`) — out (distillate bottoms); spec
  `nStages` (equilibrium stages incl. reboiler, total condenser NOT
  counted), `feedStage` (default model `WangHenke`: 1..N-1, and 2..N-1
  with a partial condenser; `model simultaneous`: 2..N), `refluxRatio`, `distillateRate` XOR
  `distillateRecovery { component …; fraction …; }`, `P`.  Use
  `model simultaneous;` for non-ideal/azeotropic systems.  Pack
  *separations*.
* `absorber` — inputs (gas first, then solvent), outputs (cleanGas
  richLiquid); `stages`.  `stripper` — inputs (liquid, then stripping gas),
  outputs (strippedLiquid richGas).  Pack *separations*.
* Membranes (`spiralWoundModule`, `pressureExchanger`), electrodialysis,
  evaporators, crystallisers, dryers, cyclones, pipes, storage tanks,
  adsorption, ion exchange — their packs are not yet written (§9).

A unit declares what it accepts; a wrong model, a missing key or an
unknown keyword is REFUSED with a message that names the remedy.  Read the
message, fix exactly that, re-run.

## 8. Running and reading the answer

In the app: open the case, *Run*, read **Streams** first, then **Log**.
Command line: `bin/runCase <case>`; `bin/choupo-lint <case>` validates
without solving.  Every converged steady run prints and writes mass,
element and energy balances in the LOG and under `reports/` (the app's
run strip may still say MASS "not published" on cases where the log
closes it -- a known display defect; trust the log) — check they close
before trusting a number,
and compare each key result with the estimate in `DESIGN.md` §6.  The
solution is written to `converged/`; never edit it — change `0/` or the
operation block and run again.

Solver aids (initial guesses, tear seeds, bounds) are part of the case and
are announced aloud when used.  Choupo never hides what it did to converge.

## 9. Packs — read only what the design needs

Each pack: keys, degrees of freedom, refusals and one minimal example.

| Pack | When |
|---|---|
| `packs/recycles.md` | any loop, tear choice, convergence |
| `packs/reactors.md` | reactions, kinetics, equilibrium, Gibbs |
| `packs/separations.md` | columns, absorbers, strippers, extraction |
| `packs/pressure.md` | pumps, compressors, valves, pipes, hydraulics |

NOT YET WRITTEN (say so in `DESIGN.md` if the design needs one, and read
the tutorial cases of that family instead): heat (exchangers, utilities,
pinch), electrolytes, membranes, solids, design and cost, drivers (sweeps,
optimisation, design specs), batch and transient, props.

Reference lookups (do not read end to end): `data/standards/components/`
(names); each unit's accepted keys are in its source file (see SOURCES).

<!-- SOURCES (for maintainers; a gate holds each to the engine):
  absorber ports ....... src/unitOperations/separation/Absorber.cpp:70,99,282-289
  shortcut KPIs ........ src/unitOperations/distillation/ShortcutColumn.cpp:305-316
  turbine keys ......... src/unitOperations/rotating/Turbine.cpp:78-86 (as read by the pressure-pack general)
  tearStreams .......... src/unitOperations/flowsheet/Flowsheet.cpp:339
  ports in/inputs/outputs src/unitOperations/flowsheet/Flowsheet.cpp:832,1075
  -init0 ............... src/applications/choupoSolve/main.cpp:155,208,535
  material forms ....... src/streams/StreamStateIO.cpp:1052-1086
  two-variable rule .... docs/ai/stream-state.md §2; gate check_overspecified_stream
  heater takes Q only .. src/unitOperations/heatTransfer/Heater.cpp:70-79
  NRTL catalogue pairs . data/standards/parameters/NRTL/ (9 files, 2026-11-01)
  units incl. degC ..... src/core/Units.cpp:62,107,132,189
  SRK / PengRobinson ... src/thermo/equationOfState/EquationOfState.cpp:72-81
  unit operation keys .. each unit's own .cpp under src/unitOperations/ (unit-ops.md is NOT authoritative)
  phaseChanger mixture . src/unitOperations/heatTransfer/PhaseChanger.cpp (C202 item 1)
  feedStage ranges ..... src/unitOperations/distillation/DistillationColumn.cpp:1343,1351,2373
-->
