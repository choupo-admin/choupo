# Pack: pressure changers (pump, compressor, turbine, valve, pipe)

budget: 1950 words (~3120 tokens)

Read this pack when the design raises, lowers or loses pressure.  Binary:
`choupoSolve`.  Pressure is NOT a free knob on a machine: you choose the
hardware (efficiency, and either the power or the discharge pressure), the
engine computes the rest.

## 1. Which unit

| Stream | Raise P | Lower P (work recovered) | Lower P (no work) | Lose P in a line |
|---|---|---|---|---|
| liquid | `pump` | - | `valve` | `pipe` |
| vapour | `compressor` | `turbine` | `valve` | NOT modelled (refused) |
| two-phase | - | - | `valve` | `pipe` (own correlations) |

* `valve` is isenthalpic: T drops for a real gas or a flashing liquid.
* A liquid in a `compressor` or `turbine`, or a vapour in a `pump`, is refused
  (each machine prices one phase).  Cool/condense before a pump, superheat
  before a turbine.
* Membrane high-pressure pumps and energy recovery (`pressureExchanger`): see
  the membranes pack.  Not covered here.

## 2. Units

Ports: one inlet (`in <s>;`), one outlet (`outputs ( out );`).  Unit order:
`type`, `model` (only where listed), ports, `operation { }`.  Values carry
units (`P_out 12 bar;`, `W_shaft 40 kW;`).  `eta` is dimensionless, 0 < eta <= 1.

### `pump`  (incompressible liquid)
```
operation { eta 0.7;  P_out 25 bar; }     // or  dP 20 bar;   or  W_shaft 5 kW;
```
* `eta` REQUIRED.  Give **exactly one** of `P_out`, `dP`, `W_shaft`:
  `P_out`/`dP` -> shaft power is the result; `W_shaft` -> `P_out` is the result.
* Computed: `W_shaft`, `W_hydraulic = eta * W_shaft` (= V dP), `head_m`, `T_out`
  (the loss `(1-eta) W_shaft` heats the liquid).
* DOF: eta + one of three = specified.
* Needs each component's liquid molar volume `Vliq` (catalogue components have
  it) and a liquid inlet.
* Refusals (`Pump.cpp:84,149,172`): `Pump: specify EXACTLY ONE of 'W_shaft',
  'P_out', or 'dP' in operation`; `Pump: the discharge pressure must EXCEED
  the inlet (a pump raises pressure) ... For a pressure let-down, use a
  'valve'`; `Pump: eta must satisfy 0 < eta <= 1`.
* Note: on a case with no pure-fluid method the energy report closes the pump
  to `(1-eta) W_shaft` only and the unit says so (an announced `[pump]`
  note); that is a property of the thermodynamic surface, not an error.

### `compressor`  (vapour, real gas from the package)
```
operation { eta 0.75;  P_out 12 bar; }    // or  W_shaft 130 kW;
```
* `eta` (isentropic) REQUIRED.  **Exactly one** of `P_out`, `W_shaft`:
  `P_out` -> power is the result; `W_shaft` -> `P_out` is the result.
* Computed: `W_shaft` (and `_kW`), `T_out`, `T_out_isen`, `W_isen`, `ratio`,
  `dS_gen`.  Path is isentropic to `P_out` with the package's own entropy; the
  real work is isentropic work / eta.
* Refusals (`Compressor.cpp:97-107,133-157`): `Compressor: give eta plus
  EXACTLY ONE of W_shaft ... and P_out ...`; `Compressor: P_out must exceed
  the inlet pressure ... a let-down is a valve, an expansion a turbine`; a
  liquid or two-phase suction is refused (acceptance check): the inlet must be
  vapour.  Declare `phase gas;` on a feed that sits near its dew point.

### `turbine`  (vapour expander)
```
operation { eta 0.8;  W_shaft -100 kW; }  // W_shaft NEGATIVE = work extracted
```
* The turbine takes **`W_shaft` and `eta` only; there is NO `P_out` key.**
  `P_out` is the result of extracting that work (`Turbine.cpp:78-86`).
  To hit a target outlet pressure, put a design specification on `W_shaft`
  (see the outer-driver documentation).
* Refusals: `Turbine: W_shaft must be NEGATIVE (work is extracted from the
  gas). Use a compressor block for compression`; vapour inlet required.
* Computed: `P_out`, `T_out`, `T_out_isen`, `ratio` (P_in/P_out), `W_gen_kW`.

### `valve`
```
operation { P 3 bar; }
```
* `P` REQUIRED (outlet pressure).  Isenthalpic; `T_out` and vapour fraction
  are results (the package flashes the let-down).  No efficiency, no work.
* `P >= inlet` only prints a warning (`A valve can only DROP pressure`);
  the run continues, so check it yourself.
* Any phase in.  Use it to throttle a liquid into a flash (flashing).

### `pipe`  (liquid or two-phase line)
```
operation
{
    geometry
    {
        D         0.05 m;           // inner diameter
        L         120 m;           
        roughness 4.6e-5 m;         // commercial steel
        dz        5 m;              // optional, default 0 (+ = uphill)
        fittings  ( { K 0.5; count 2; }  { K 10; } );   // optional, sum K*count
    }
    viscosity 0.9e-3 Pa.s;          // optional if the package has liquid viscosity
}
```
* `model` word (after `type`): `Churchill` (default), `Blasius`, `Haaland`,
  `Colebrook` - the friction-factor correlation (registered names).
* Computed: `deltaP = dP_friction + dP_fittings + dP_elevation`, `P_out`
  (= P_in - deltaP), `velocity`, `reynolds`, `frictionFactor`, `regime`.
  The pipe never takes a `P_out` spec: pressure drop is a RESULT of D, L, flow.
* A **gas** inlet is refused: `no compressible model` (`Pipe.cpp` single-phase
  guard).  Size a gas line by hand outside the flowsheet and say so.
* Two-phase inlet: automatic (`operation { twoPhase { model
  homogeneous|LockhartMartinelli (default)|Friedel|BeggsBrill; } }`; Friedel
  and BeggsBrill need a surface tension from the package or `twoPhase {
  surfaceTension ...; }`).
* Warns if `P_out <= 0`: enlarge `D` or add a pump.

## 3. Multistage compression with intercooling (design pattern)

Why: discharge T and work both grow with the pressure ratio; cooling the gas
between stages returns it to a low inlet T and cuts the total work.  Pattern:

`compressor  ->  phaseChanger { outletT, P }  ->  compressor  -> ...`

* Stage count: keep ratio per stage <= 3-4 (T_out <= ~150-200 degC for
  hydrocarbons).  Equal ratios minimise work: `r = (P_final/P_in)^(1/N)`.
* Intercooler `phaseChanger`: `outletT` = what cooling water allows
  (30-45 degC + approach, e.g. 40-50 degC); `P` = inlet pressure minus a
  drop of 1-5 % (omit `P` to hold the pressure).  Give exactly ONE of
  `Q | outletState | outletQuality | superheat | subcool | outletT`.  Its duty
  `Q` is a result.  Check the intercooler outlet stays above the mixture's dew
  point (else it condenses; add a flash to remove liquid before the next
  stage).
* The duty is sized to a utility by the utility report; you do not wire it.
* Efficiencies: centrifugal compressor 0.72-0.85, reciprocating 0.75-0.9,
  pump 0.55-0.80 (small pumps lower).
* Hand estimate (ideal gas): `T_isen = T_in r^((k-1)/k)`, `W = F Cp
  (T_isen - T_in)/eta`; k ~ 1.3 for light hydrocarbons, 1.4 for N2/air.
  The engine uses the real-gas package, so expect it within about 10 %.

### Shaft work between machines (energy streams)

A turbine can drive a compressor.  The consumer declares what it reads:
```
{
    name T1;  type turbine;  in hot;  outputs ( cold );
    operation { W_shaft -100 kW;  eta 0.8; }
    energyOutputs ( { name shaft;  kind work;  expression "-W_shaft";  unit W; } );
}
{
    name C1;  type compressor;  in gas;  outputs ( g1 );
    operation { eta 0.75; }                       // no W_shaft, no P_out here
    energyInputs ( { from T1.shaft;  kind work;  target W_shaft; } );
}
```
* The producer (turbine) must be declared BEFORE the consumer.  `expression`
  may use the producer's `operation` keys and KPIs.
* `target` is an `operation` key of the consumer (`W_shaft`); the compressor
  then computes `P_out`.  Several `energyInputs` to the same target are
  SUMMED (a shaft node: turbine `+`, a compressor load `-`).  A `work` wire
  cannot join a `heat` input (refused).
* Note the `;` after the closing `)` of `energyOutputs`/`energyInputs`
  (omitting it is a parse error: `expected ';' after dict-list`).
* Run check: T1 20 bar, 500 K, 100 kW out -> `P_out` 5.99 bar; C1 gets 100 kW
  -> `P_out` 2.65 bar; plant energy residual -0.0002 kW.

## 4. Thermodynamics for pressure changers

Machines price enthalpy and entropy from the package: use a real-gas model
for gas compression (cubic `SRK` or `PengRobinson`, see the thermo
documentation).  Ideal gas is acceptable only near 1 bar.  Light gases need
`Tc, Pc, omega` (catalogue has them).  For a pure steam/water machine use a
case with a pure-fluid method.

## 5. Example: two-stage compression of a light gas, SRK

Gas 100 kmol/h (90 % CH4, 7 % ethane, 3 % N2), 300 K, 1 bar -> 12 bar in two
stages of ratio about 3.5, cooled to 310 K between them with 0.1 bar drop.
Hand estimate: stage 1 with k ~ 1.3: T_isen = 300 x 3.5^0.23 ~ 400 K,
W ~ 120 kW; stage 2 similar; total near 250-280 kW; T_out per stage ~ 140-160
degC.

`system/controlDict`
```
application   choupoSolve;
description   "Two-stage compression of a light gas with intercooling";
verbosity     3;
```
`system/flowsheetDict`
```
units
(
    {
        name     C1;
        type     compressor;
        in       gas;
        outputs  ( g1 );
        operation { P_out 3.5 bar;  eta 0.75; }
    }
    {
        name     IC;
        type     phaseChanger;
        in       g1;
        outputs  ( g2 );
        operation { outletT 310 K;  P 3.4 bar; }
    }
    {
        name     C2;
        type     compressor;
        in       g2;
        outputs  ( g3 );
        operation { P_out 12 bar;  eta 0.75; }
    }
);
```
`constant/thermoPhysPropDict`
```
recordType    thermophysicalPropertySystem;
schemaVersion 2;

components ( CH4  ethane  N2 );

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
`0/gas`
```
componentMolarFlows { CH4 90 kmol/h;  ethane 7 kmol/h;  N2 3 kmol/h; }
T  300 K;
P  1 bar;
phase gas;
```
Result as run (exit 0): C1 `W_shaft` 132.7 kW, `T_out` 419.1 K (146 degC);
IC `Q` -123.6 kW (to 310 K); C2 ratio 3.53, `W_shaft` 137.5 kW, `T_out`
432.1 K; total 270.3 kW.  Mass closure 100.000 %, energy residual -0.0004 kW.
The same duty in ONE stage (1 -> 12 bar): 299.9 kW and `T_out` 546 K - the
intercooling saves about 10 % of the work and keeps T_out below 160 degC.
The hand estimate was about 10 % low because Cp rises with T and the gas is
real.

<!-- RUN: scratch case pr; CHOUPO_HOME=/home/vitor/Choupo bin/choupo-init0 . ; choupoSolve .  -> exit 0.
     Variants run: one stage 1->12 bar (299.9 kW, 546.2 K); turbine->compressor energy wire (exit 0, residual -0.0002 kW), first attempt without ';' after energyOutputs list -> parse error quoted above. -->
<!-- SOURCES
 Pump: src/unitOperations/rotating/Pump.cpp:82-86 (eta), :144-154 (exactly one of W_shaft/P_out/dP), :169-175 (dP>0), :104-115 (Vliq), :255-310 (first-law note), KPIs :363-375; liquid-only acceptance :389-394.
 Compressor: Compressor.cpp:95-107 (eta + exactly one of W_shaft/P_out), :140-147 (P_out > P_in), :61-79 (liquid suction refused via acceptance), KPIs W_shaft/T_out/T_out_isen/ratio from :170+ and the run.
 Turbine: Turbine.cpp:78-86 (W_shaft required and negative, eta 0<eta<=1); no P_out lookup (P_out is disc.P_out :108); vapour acceptance :64-75.
 Valve: src/unitOperations/valve/Valve.cpp:53 (operation P required), :58-62 (P>=Pfeed warning only), acceptance :378 (any phase).
 Pipe: src/unitOperations/hydraulics/Pipe.cpp:100-103 (D, L, roughness required; dz optional), :112-118 (fittings list of {K, count}), :486-487 (model word, default Churchill), :450-472 (viscosity), :146-182 (gas refused), :186-192 (twoPhase model), :566-568 (dP sum), KPIs :626-630.
 Friction models registered: src/unitOperations/hydraulics/friction/FrictionFactorCorrelation.cpp:402-405.
 PhaseChanger: src/unitOperations/heatTransfer/PhaseChanger.cpp:158-160 (P optional, held from inlet), :183-196 (exactly one coordinate; message quoted), outletT :320.
 Energy wires: src/unitOperations/flowsheet/Flowsheet.cpp:876-1042 (energyInputs: from/kind/target; summed targets :900-910; kind mismatch refused; forward only); docs/ai/energy.md section 2.
 SRK phiPhi grammar: docs/ai/thermo.md:213-248 (copied form, run).
-->
