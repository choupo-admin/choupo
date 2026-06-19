# Unit-op catalogue — every shipped type, what it does, how to write it

One entry per type registered in `UnitOperation::registerBuiltins()`
(steady) / `BatchUnitOperation::registerBuiltins()` (batch) /
`DynamicUnitOperation::registerBuiltins()` (ctrl) /
`PropertyOperation::registerBuiltins()` (props).  Grouped by binary,
then by family.

The keys `name` / `type` / `in` (or `inputs`) / `outputs` are
required on every steady/batch/ctrl unit; they are listed once at the
top of each entry and elided in per-op examples.

```
{ name <free>;  type <type>;  in <streamIn>;  outputs ( <s1> <s2>... );
  operation {... }  // per-op contents below
  reaction <ref>;     // when needed
  crystallisation <ref>;  // when needed
  dryingCurve <ref>;  // when needed
  thermo {... }      // optional per-unit override
}
```

# choupoSolve (steady)

## Flash / saturation

### `isothermalFlash`  (alias: `flash`)
Vapour-liquid (or LL, or VLLE) flash at fixed (T, P).  Newton in V/F
(`Kvec` + Rachford-Rice) with `Wegstein` outer loop on γᵢ.

`operation` — all optional (a flash is a KNOB-LESS separator):
```
operation { }            # inherits T and P from the feed, just separates
```
or pin the drum's state:
```
T  <K>;     # optional; omitted -> inherits the feed T
P  <Pa>;    # optional; omitted -> inherits the feed P (use a valve upstream to drop P)
phaseSet  VL;    # default; also LL or VLLE
```
The flash reports its duty as a `Q` KPI (the heat to hold T): + heating,
- cooling.  A knob-less flash that just separates an equilibrated feed reads
Q ≈ 0; an isothermal condenser-flash reads Q < 0.  That duty is sized to a
utility by the `utilityAllocation` report (see [`energy.md`](energy.md)).

**Degrees of freedom.**  A flash is fixed by exactly two numbers (Duhem's
theorem) — here `T` and `P`.  The duty `Q` is therefore a **result, never a
spec**: a flash *gives* a Q (read it; see it as a heat stream), it never *takes*
one.  To impose a known heat, chain a `heater(Q) → flash`; for a target outlet
T, a DesignSpec on the heater's `$Q`.  See [`energy.md`](energy.md) → "the
flash/heater rule".

Outputs convention: `(liquid vapor )` for VL; `(vapor liquid_alpha liquid_beta )`
for VLLE (the absent phase carries F=0 so the contract stays fixed).
LL: `(liquid_alpha liquid_beta )`.

### `adiabaticFlash`
Same as isothermalFlash but the outer Newton finds T such that
`H_out = H_in`.  Spec the pressure only:
```
operation { P <Pa>; }
```
This *is* the `Q = 0, P` corner of the flash DOF — the only duty value that
needs no external device.  A non-zero imposed heat is a `heater(Q)` **upstream**,
not a `Q` key here (the key was removed on purpose: "heat is a stream").

### `bubbleT`
Newton-1D in T on `Σᵢ Kᵢ(T) xᵢ = 1` at fixed P.
```
operation { P <Pa>; }
```

### `dewT`
Newton-1D in T on `Σᵢ yᵢ / Kᵢ(T) = 1` at fixed P.
```
operation { P <Pa>; }
```

## Reactors

### `cstr`
Continuous stirred-tank reactor.  Newton-1D in extent ξ for a single
reaction (forward, reversible, or with magma dependence).

Required:
```
operation { V_R  <m^3>; }
reaction  <name>;     # -> constant/reactions
```
Reversible: add `reversible true;` to the reaction entry — uses
detailed balance `k_rev = k_fwd / K_eq(T)`.

### `pfr`
Plug-flow reactor.  Manual RK4 along axial coordinate; supports
reversible reactions ().
```
operation { V_R  <m^3>; nSteps  100; }
reaction  <name>;
```
NOTE: `cstr`/`pfr` compute concentration on the **liquid** molar volume
(Vliq) — a liquid-basis model.  For a GAS-phase reactor prefer
`conversionReactor` (below).

### `conversionReactor`
Stoichiometric reactor: you **specify the per-pass conversion** of the
limiting reactant; the outlet follows the reaction stoichiometry.  NO
kinetics, NO liquid molar volume — the **honest choice for a gas-phase
reactor** (HDA, hydrotreating, …) where per-pass conversion is set by the
catalyst / residence time, not by equilibrium.  It keeps a **finite**
per-pass conversion, so it is the right reactor when a **recycle** is the
point of the flowsheet (unlike `gibbsReactor`, which runs to ~complete
conversion for an irreversible reaction).  Isothermal; reports `dH_rxn(T)`
and the duty `Q`.
```
operation { conversion  <0..1>;  T  <K>; }   // T optional (default = feed T)
reaction  <name>;        // needs only stoichiometry + limitingReactant (no kinetics)
```

### `gibbsReactor`
Equilibrium by direct Gibbs minimisation with atom-balance
constraints.  Three selectable `model`s:
- `elementPotential` (default; Lagrange multipliers; gas + 1 ideal
  condensable).
- `reactiveFlash`     (multi-condensable + NRTL).
- `directMin`         (multi-start Nelder-Mead on the reaction-extent
  null space).

```
operation
{
    T  <K>;
    P  <Pa>;
    elements (C H O N );
    species
    (
        { name CH4; atoms ( 1 4 0 0 ); }
        { name CO2; atoms ( 1 0 2 0 ); }
        { name H2;  atoms ( 0 2 0 0 ); }
...
    );
}
```
Optional `approachTemperature  <ΔT K>;` evaluates the equilibrium at
`T + ΔT` (streams stay at the physical `T`) — models an **incomplete
approach to equilibrium** for reversible reactions (WGS / reforming /
ammonia) without kinetics; default 0 = full equilibrium.  (No effect on
an essentially irreversible reaction whose K is huge — use
`conversionReactor` there.)

For an adiabatic Gibbs reactor (the flame temperature problem), wrap
in a DesignSpec that varies `$T` to make `H_out = H_in`.

## Heat transfer

### `heater`  (1-stream, furnished duty)
Single-stream heater/cooler.  Operation block carries the absolute
thermal power Q (W); T_out is a RESULT.  Phase-aware: gas
streams integrate H_ig, liquid uses H_liquid.
```
operation { Q  <W>; }   # positive heats, negative cools
```
For "I need T_out = 360 K", wrap in a DesignSpec on `$Q`.  The heater is the
unit that **takes** a Q (its hardware knob); a flash **gives** one.  That makes
"impose 500 kW then separate" a `heater → flash` chain — see [`energy.md`](energy.md)
→ "the flash/heater rule".

### `phaseChanger`  (aliases `boiler`, `condenser`)
The dome-crossing phase-change unit: one stream in, one (two-phase-aware) stream
out, the heat duty Q a **result**.  Where a `heater` is sensible-only (must not
cross the saturation line), a `phaseChanger` lands the outlet **anywhere** on the
(T, vf) surface — subcooled liquid, inside the dome (0 < vf < 1), or superheated
vapour.  It wraps the isothermal-flash (vf, x, y) kernel + the dome-aware
enthalpy `h = (1−vf)·h_f + vf·h_g`; Tsat(P) comes from the pure-fluid (IF97)
kernel for an effectively-pure feed, else from inverting the **dominant**
component's Antoine Psat curve.  `boiler`/`condenser` are the SAME class — the
direction (and the role label `boiler` / `partial boiler` / `condenser` /
`partial condenser`) is **emergent** from the converged vf and sign of Q, not a
model switch.  Q is always reported as `DUTY (result)`, split into latent +
sensible.

P is **held** from the inlet (or set `P`).  Then pick **exactly ONE** outlet
coordinate (a DOF guard rejects zero or two); every mode but `Q` is a built-in
self-target inverse solve (Choupo announces it — no `outerDict` needed):
```
operation
{
    P            <Pa>;   # optional; held from inlet otherwise
    # --- pick exactly ONE of: ---
    Q            <W>;            # duty given → T_out, vf_out are results
    outletT      <K>;           # → Q result
    outletQuality <0..1>;       # target vapour fraction (partial b/c) → Q
    outletState  saturatedVapour;   # or saturatedLiquid → Q
    superheat    <K>;           # T = Tsat(P) + ΔK (vapour side) → Q
    subcool      <K>;           # T = Tsat(P) − ΔK (liquid side) → Q
}
```
For an area/HTC **rating** (duty EMERGES from geometry + a coolant/heating
medium) use `model geometry;` with a `geometry{}` + `coolant{}` block (Nusselt
film condensation) or a `boiling{}` + `heatingMedium{}` block (Rohsenow nucleate
flux, Zuber CHF ceiling — a design above CHF is hard-refused).  Theory:
[`theoryGuide`](../theoryGuide.tex) → "Phase changer: the dome-crossing
boiler / condenser".

### `heatExchanger`  (2-stream, ε-NTU rating)
Two process streams; hardware-only (`area` + `U`).  Outputs both
streams' new T + the duty Q.

```
inputs  (hot  cold );
outputs (hot_out  cold_out );
operation
{
    area   <m^2>;
    U      <W/m^2/K>;
    flow   counter;     # or `co` / `cocurrent`; default counter
}
```

### `evaporator`  (Mode-2 credo-pure)
Single-effect.  Hardware = `area` + `U`.  Heating-side `inputs[1]` is
the chest (saturated steam); the unit propagates mass + energy
through the vessel; T_boil, V/F, P_op all RESULTS.

```
inputs  (feed  steam );
outputs (concentrated  vapour  condensate );
operation
{
    area      <m^2>;
    U         <W/m^2/K>;
    Tref      <K>;        # enthalpy reference (default 298.15)
}
```

## Rotating equipment

### `compressor`
Credo: hardware = `W_shaft` + `eta`.  Outer Newton-1D on P_out
matching isentropic enthalpy; P_out / T_out are RESULTS.

```
operation
{
    W_shaft  <W>;     # positive (energy in)
    eta      0.75;    # isentropic efficiency
}
```

### `turbine`
Mirror of compressor.  `W_shaft` is NEGATIVE (energy out).  Same
operation block.

### `pump`
Incompressible: `ΔP = η W_shaft / Q_vol`, `Q_vol = ṅ·v_molar` (set by the
feed), tiny dissipation `dT = (1-η) w_real / Cp_liq`.  Closed form, no
EoS, no Newton.  Because the relation inverts in closed form
(`W_shaft = Q_vol·ΔP/η`), give `eta` **plus exactly ONE** of:
```
operation { eta 0.65;  P_out 30 bar; }   # header it feeds -> W_shaft is the RESULT (common)
operation { eta 0.65;  dP    29 bar; }   # rise it adds    -> W_shaft is the RESULT
operation { eta 0.65;  W_shaft 2 kW;  }  # motor power      -> P_out/dP is the RESULT
```
Specifying `P_out` is NOT a DesignSpec (the target is local, one-shot) ---
the natural way to size a plant's many pumps without an outer loop each.
A let-down (`P_out < P_in`) is a `valve`, not a pump.

### `electricLoad`  (shaft-work sink)
A stream-less sink for the shaft work a turbine produces (or any `work`
energy port).  No material streams; it just consumes the wired W.
```
{ name G1; type electricLoad;
  operation   { eta  0.97; }                       # generator efficiency
  energyInputs ( { from turbine01.shaft;  kind work;  target W_shaft; } ) }
```
KPIs: `W_in`, `W_electric` (= η·W_in).  See [`energy.md`](energy.md).

## Distillation / absorption (staged separations)

### `distillationColumn`  (alias `column`)
Rigorous multistage MESH column (Mass / Equilibrium / Summation / entHalpy)
with two selectable `model`s — both solve the *same* stage equations, they
differ only in the numerical strategy:

- `WangHenke`     (**default**; sequential bubble-point).  Each outer pass
  solves the component balances by a tridiagonal (Thomas) sweep at frozen
  K, then updates every stage T from its bubble point.  Cheap per pass but
  O(100–500) outer iterations, and it can step *through* an azeotrope
  non-physically.  Use it for **ideal / wide-boiling** systems (Raoult,
  ideal-γ); it is the pedagogical default because each step is inspectable.
- `simultaneous`  (aliases `MESH`, `NaphtaliSandholm`).  Newton-ND on the
  whole block at once — unknowns are the per-stage `(x_{1..n-1}, T_j)`,
  residuals the n−1 component balances plus the bubble-point
  `Σ Kᵢxᵢ − 1 = 0` per stage with `Kⱼ(Tⱼ)` live (Armijo backtracking).
  **Quadratic** (≈5–6 iterations) and **stable through azeotropes** — the
  required choice for **non-ideal / azeotropic** systems (NRTL ethanol/water:
  Wang-Henke fails, `simultaneous` finds the physical sub-azeotrope cut and
  refuses to invent a "past the azeotrope" answer).  Restriction:
  `feedStage` must be 2..nStages (no feed on the top stage).

See theory: §Distillation (Wang-Henke) and §Rigorous MESH Newton.
Reference: Wang & Henke, *Hydrocarbon Process.* 45 (1966) 155;
Naphtali & Sandholm, *AIChE J.* 17 (1971) 148.

```
operation
{
    nStages          12;           # (NOT `stages`)
    feedStage         6;
    refluxRatio      2.5;          # XOR with distillateRate
    # distillateRate 50 kmol/h;
    P              1.01325 bar;
}
```

**Heat ports.**  A column carries two intrinsic duties: a **reboiler**
(heating, at the bottoms T) and a **condenser** (cooling, at the top T),
reported as `Q_reboiler_kW` / `Q_condenser_kW` KPIs.  By default each is
sized to a plant utility by temperature level (the `utilityAllocation`
report — steam grade for the reboiler, cooling water for the condenser).
Name one explicitly, or reuse the heat by a forward heat-link:
```
operation { ...  condenser { utility coolingWater; } }   # name the utility
# or, reuse the condenser heat downstream (heat integration) — wire it on
# the CONSUMER, like any energy link:
#   energyInputs ( { from column01.condenser; kind heat; target Q; } )
```
See [`energy.md`](energy.md) for the heat-port / heat-link / utility model.

### `shortcutColumn`  (alias `FUG`)
Fenske-Underwood-Gilliland **design** method (constant α, no azeotropes):
Fenske gives `N_min` at total reflux, Underwood gives `R_min` (the θ root),
Gilliland correlates the actual N to R.  Use it to **size first** (a quick
N, R, feed-stage estimate), then hand those to `distillationColumn` for a
rigorous rating.  For azeotropic systems skip FUG and go straight to the
`simultaneous` MESH column.  References: Fenske, *Ind. Eng. Chem.* 24 (1932)
482; Underwood, *Chem. Eng. Prog.* 44 (1948) 603; Gilliland, *Ind. Eng.
Chem.* 32 (1940) 1220.

```
operation
{
    LK_component   benzene;
    HK_component   toluene;
    recovery_LK    0.99;
    recovery_HK    0.01;
    refluxFactor   1.3;            # = R / R_min
    P              1.01325 bar;
}
```
N_min, R_min, N, feed_stage are RESULTS.

### `absorber`
Counter-current multistage gas absorber.  Coupled mass + energy by
the Thomas tridiagonal.
```
inputs  (liquidIn  gasIn );
outputs (richLiquid  cleanGas );
operation { stages  6; }
```
Solute(s) must have a Henry pair (`role solute;` in their.dat).

### `stripper`
Mirror of absorber.
```
inputs  (liquidIn  strippingGas );
outputs (strippedLiquid  richGas );
operation { stages  6; }
```

## Membrane (NF/RO)  — `spiralWoundModule`  (alias `membraneSW`)

```
operation
{
    membrane         SW30HR;        # -> data/standards/membranes/<name>.dat
    area             35 m2;          # per element
    length           1 m;
    elements         1;              # for a train
    interElementDP   0.5 bar;        # gap loss between elements
    P_perm           1.01325 bar;
    dP_feed_total    2 bar;          # constant model (default); see below

    # Selectable sub-models (factory pattern):
    massTransfer
    {
        model         SchockMiquel;  # or `constant`; default constant
        channelHeight 0.7 mm;
        spacerPorosity 0.9;
        diffusivity   1.6e-9 m2/s;   # solute D
        viscosity     1.0e-3 Pa.s;
    }
    pressureDrop  { model SchockMiquel; }   # or `constant`; default constant
    osmotic       { model Pitzer; }         # or `vanHoff` (default)
}
```

Inputs (`feed`), outputs (`retentate permeate`).  KPIs: `J_w_avg`,
`R_obs_<solute>`, `water_recovery`, `dP_feed`, etc.

## Solids separators

### `cyclone`
PSD-aware centrifugal classifier.  Five selectable `model`s:
`Lapple` (default), `LeithLicht`, `IoziaLeith`, `Barth`,
`Muschelknautz` (the last adds the solids-loading effect).

```
operation
{
    bodyDiameter   0.5 m;
    numberOfTurns  5;
}
inputs (feed );  outputs (cleanGas  capturedSolids );
```

### `bagFilter`
Cake-dominated, near-total collection.  Headline KPI is `dP_filter`.
```
operation
{
    filterArea   30 m2;
    arealDustLoad 0.5;  # kg/m^2
    K1  1e9;  K2 1e10;  # Darcy resistances
    penetration0 0.02;  dCharacteristic 1 um;
}
```

### `gasSolidSplitter`
Ideal spec'd split; PSD passes UNCHANGED into both outlets (does NOT
classify by size).
```
operation { solidsRecovery 0.9; gasCarryover 0.01; }
```

_(Solid–liquid separation lives in the `crystalliser`: declare two
outputs and it discharges a wet cake + the drained mother liquor —
see the Crystallisation section.)_

## Drying

### `sprayDryer`
Hardware: wheel atomiser geometry + chamber.  Atomisation by
Friedman, drying kinetics by Ranz-Marshall + Lewis falling rate,
equilibrium by GAB sorption isotherm.

```
inputs  (feed  dryingAir );
outputs (powder  exhaustAir );
operation
{
    wheelDiameter   0.1 m;
    wheelSpeed     20000 1/min;
    chamberDiameter  1 m;
    chamberHeight    5 m;
    flow  co;                       # or counter
}
dryingCurve  sucroseDrying;          # -> constant/dryingKinetics
```
Component must have a `sorption {}` block (typically case-local
overlay per axiom 4) for the GAB isotherm + Xc.

### `solidDryer`
Polish an already-solid powder to the equilibrium moisture set by
the air RH + the GAB isotherm.
```
operation
{
    airTemperature   80 degC;
    relativeHumidity 0.3;
}
```

## Crystallisation

### `crystalliser`
Two selectable `model`s:
- `equilibrium` (default).  Cooling crystalliser.  Mother
  liquor leaves saturated; yield = `solute_in − c_sat(T)·solvent`.
- `MSMPR`.  Steady continuous, method of moments → the crystal-size
  distribution n(L) (mean sizes, CV, magma PSD).  S is a RESULT (Newton-1D
  on the solute balance); needs kinetics in `constant/crystallisation` and a
  `solid { rho_p; k_v; }` block on the solute.
- `FVM`.  Discretised population balance n(L) on a size grid (size-dependent
  growth); same inputs as MSMPR.

The **MSMPR/FVM models read the SAME saturation as `equilibrium`** — so they
run for an **electrolyte** salt (the eNRTL/Pitzer m_sat(T), incl. the
antisolvent drowning-out supersaturation), not only a solubility curve.  The
population balance then operates on `S = c/c_sat` regardless.  See
`crystalliser08_nacl_antisolvent_msmpr` (a continuous antisolvent NaCl MSMPR
that returns the PSD the equilibrium model cannot).

**Multiple feeds** — declare `inputs (brine antisolvent);` and the
crystalliser combines them internally (no separate `mixer` node), e.g. a
brine + an antisolvent for drowning-out.  Single feed = `in feed;`.

**Which salt (multi-salt feeds)** — `operation { solute <name>; }` names the
species this unit crystallises when the feed carries more than one (two
crystallisers in series, each pulling out a different salt).  The saturation
route is decided PER SOLUTE: if the target IS the package's electrolyte salt it
uses the ion-activity Ksp; any other named solute uses its own `solubility {}`
curve.  So a single `activityModel { model eNRTL; }` package can hold KCl (eNRTL,
antisolvent) and potassium bitartrate (solubility curve, cooling) at once — see
`crystalliser09_KHT_KCl_series` (cool to drop KHT, then ethanol to drop KCl).
Omit `solute` and the unit auto-picks (the electrolyte salt, else the lone
`solubility {}` component).

**One OR two products** — the equilibrium model adapts to the declared
`outputs`:
- `outputs (magma);` → one **magma** slurry (crystals in the solid phase
  + mother liquor), the default; the MSMPR/FVM models need this so the
  crystal-size distribution travels with the slurry.
- `outputs (crystals motherLiquor);` → a **solid–liquid split**: a wet
  crystal **cake** + the drained saturated mother liquor.  The crystals
  leave WET — they carry the mother liquor clinging to them
  (`cakeMoisture`), so the cake is never perfectly pure (perfectly-dry
  solids are unphysical).  `solidsRecovery < 1` lets fines escape with
  the liquor.

```
operation
{
    operatingTemperature  293.15 K;
    volume                5.0 m3;        # MSMPR only
    cakeMoisture          0.10;          # kg liquor / kg dry solid (two-output mode; default 0.10)
    solidsRecovery        1.0;           # fraction of crystals to the cake (two-output mode)
}
crystallisation  sucroseKinetics;        # MSMPR only -> constant/crystallisation
```
KPIs (two-output mode): `cakeMoisture`, `cakeWetness_pct`,
`soluteInCake_mass` (dissolved solute leaving on the wet cake — the
cake-washing target), `solidsRecovery`.
Component must carry `solubility { coefficients (a b c); dHcryst; }`
and `solid { rho_p; k_v; }` — or, for a salt, an `electrolyte {}` block
(saturation from the ion-activity Ksp; see `crystalliser05/06`).

## Mixer / splitter (flow primitives)

### `mixer`
Adiabatic stream merge.  `P_out = min(P_in)` (a higher-pressure feed
expands to the lowest inlet pressure — no silent throttling penalty
invented); energy balance on the dominant phase (gas-aware: a gas-dominant
mix uses the formation enthalpy, a liquid mix the sensible datum); solids
summed.  A mixer MIXES — it never runs an internal flash (separators
separate).  Newton-1D in T_out.

**Declare each inlet's phase** with `state` (`superheatedVapour` → vf 1,
`subcooledLiquid` → vf 0; both need T and P).  The mixer picks its
energy-balance basis from the flow-weighted inlet vf — leave the phase out
and every inlet defaults to liquid, so a gas-dominant merge tries a liquid
balance and the T-solve can fail.

**Optional `operation { T <K>; }` → isothermal.** The mixer then DECLARES
the mix temperature and skips the adiabatic energy balance (it announces
this in the log).  Use it when (a) a furnace/heater downstream fixes T
anyway (e.g. a reactor feed whose furnace is lumped into the reactor's
`operation.T`), or (b) the adiabatic balance is ill-posed — a genuine
gas+liquid merge whose liquid species carry a large formation+latent gap on
the gas basis can push the 1-D Newton in T off its bracket.  Mixing
(F, composition, P) is exact either way; only the T datum is the question,
and here the author owns it.
```
inputs  (s1  s2  s3 );  outputs (merged );
operation {}                  # adiabatic: T_out is a result
operation { T 330 K; }        # isothermal: T_out declared, energy balance skipped
```

### `splitter`
Single inlet → multiple outlets at user-spec'd fractions.  All
branches share inlet T/P/composition + vapour fraction (flow split, not
separation); solids split by the same fractions.
```
inputs  (in );  outputs (s1  s2 );
operation { fractions ( 0.6  0.4 ); }
```

### `valve`
Isenthalpic throttle: drops pressure to `P` at constant enthalpy; `T_out`
and the vapour fraction are RESULTS (a real-gas EoS flashes the let-down).
Use it upstream of a flash to set the drum pressure.  Warns if `P >= P_in`.
```
in  feed;  outputs (throttled );
operation { P  1.0 bar; }          # the downstream pressure (the only knob)
```

## Hydraulics

### `pipe`
Single-phase incompressible PIPE element.  The pressure DROP is a COMPUTED
RESULT of the geometry + flow --- NEVER a spec (a pipe has no shaft, no
knob; a `pump` raises P, a `valve` sets a let-down).  Mechanical-energy
balance with the Darcy-Weisbach friction term, the minor-loss (fittings)
term and the static head:
```
deltaP = [ f*(L/D) + sum K ] * (rho v^2 / 2)  +  rho g dz
         \___distributed + minor___/             \_elevation_/
```
with `v = Q/A`, `A = pi D^2/4`, `Q = (F*MW)/rho`, `Re = rho v D / mu`,
`eps/D = roughness/D`.  T is held (incompressible; the dissipation is
accounted as the P drop, not re-injected as heat --- the valve credo).
Friction-factor sub-models via the `model` slot:
- `Churchill` (DEFAULT) --- one explicit correlation across laminar /
  transition / turbulent, all eps/D (Churchill 1977).
- `Haaland`   --- explicit turbulent fit to Colebrook (~2 %); laminar
  branch `64/Re` below Re = 2300.
- `Colebrook` --- implicit Colebrook-White solved by fixed-point; the
  classical turbulent reference; same laminar branch.

Viscosity comes from the thermoPackage `liquidViscosity` model, or an
`operation { viscosity <v> Pa.s; }` override (Re needs it).
```
{ name P1;  type pipe;  model Churchill;   // Churchill (default) | Haaland | Colebrook
  in feed;  outputs ( downstream );
  operation {
    geometry {
      D 0.1 m;  L 50 m;  roughness 4.6e-5 m;  dz 2 m;   // dz: rise costs P
      fittings ( { K 0.9; count 2; }   // two elbows
                 { K 10.0;         } ); // one globe valve
    }
  }
}
```
KPIs: `deltaP`, `dP_friction`, `dP_fittings`, `dP_elevation`, `P_in`,
`P_out`, `velocity`, `reynolds`, `frictionFactor`, `regime` (0 laminar /
1 transition / 2 turbulent), `head_loss_m`, `density`, `viscosity`.
GAS / compressible flow is a future extension (rho varies along the pipe).

# choupoBatch (time-dependent)

Common shape:
```
{ name <free>;  type <type>;
  initial   { T <K>; P <Pa>; V <m^3>; totalMoles <kmol>; molarComposition {...} }
  operation { mode isothermal | adiabatic;  T_setpoint <K>;... }
  reaction  / crystallisation / dischargeTo... }
```

### `batchReactor`
Closed vessel, RK4 in time.  `mode isothermal` (T held) or `adiabatic`
(T integrated via Σ rᵢΔH/ΣnᵢCp).  Single or list of reactions
(`reactions (A B );`).

### `batchStill`
Rayleigh batch distillation; constant offtake `F_vap` per step;
bubble-T re-solved each step.  Optional `dischargeTo  receiver;`
routes condensed vapour to a `batchAccumulator`.

### `batchAccumulator`
Passive receiver vessel (a "tank with no chemistry").  Step is a
no-op; only changes by being charged.

### `batchCrystalliser`
Closed vessel with supersaturated charge → desupersaturation curve.
RK4 on packed `(μ0, μ1, μ2, μ3, n_solute)` with the same kinetics
library (`constant/crystallisation`) the steady MSMPR uses.

```
{ name cryst;  type batchCrystalliser;
  initial { T 293.15 K; P 1.013 bar; V 1.3; totalMoles 31.4;
            molarComposition { water 0.8838; sucrose 0.1162; } }
  crystallisation  sugarBatchKinetics;
}
```

## Recipe events (in `flowsheetDict`)

```
recipe
(
    { time 400;  action transfer;     from reactor;  to still; fraction 0.5; }
    { time 200;  action setParameter; unit reactor;  key T_setpoint; value 350.0; }
    { when { unit reactor; quantity x_ethanol; op lt; value 0.30; }
      action transfer; from reactor; to still; fraction 0.5; }
);
```
Actions: `transfer` (partial via `fraction`), `setParameter`, `when`
condition-triggered (`quantity` can be `T`, `total`, `n_<comp>`,
`x_<comp>`; `op` is `gt`/`ge`/`lt`/`le`).

# choupoCtrl (dynamic continuous + control)

### `dynamicCSTR`
Constant-volume continuous CSTR with Arrhenius kinetics, optional
jacket (UA·(T_j-T)).  RK4 on packed `(nᵢ, T)`.  MV/CV string-keyed
registry so controllers bind by name.

```
{ name reactor;  type dynamicCSTR;
  initial { T 320 K; P 1.013 bar; V 0.001; totalMoles 0.0185;
            molarComposition { compA 1.0; } }
  feed { F 5e-5 kmol/s; T 320 K; composition { compA 1.0; } }
  operation { reactions (a_to_b );  jacketUA 30 W/K; }
}
```

## Controllers (in `flowsheetDict.controllers (... )`)

```
controllers
(
    {
        name  TC1;
        type  PID;
        measurement { unit reactor;  cv T_reactor; }
        actuator    { unit reactor;  mv T_jacket; }
        setpoint    350 K;
        Kp  4.0;  Ki  0.04;  Kd  0.0;
        bias  320;  uLow  280;  uHigh  420;
    }
    {
        name  noise;
        type  schedule;
        actuator { unit reactor;  mv T_in; }
        schedule ( { t 0 K 320; }  { t 700 K 305; }  { t 1300 K 335; } );
    }
);
```
Two controller types: `PID` (clamping anti-windup, derivative-on-PV)
and `schedule` (open-loop piecewise constant — for disturbance
injection).

# choupoProps (property evaluations)

A `propsDict` carries `operations (... )` instead of `units (...)`:

### `propertyPoint`
Single-point property evaluation.  Emits to STDOUT (no CSV).
```
{ name p1;  type propertyPoint;
  state { T 298.15 K;  P 1 bar;  composition { N2 1.0; } } }
```

### `propertyScan1D`
1-D sweep, long-form CSV.
```
{ name psat;  type propertyScan1D;
  vary { variable T; from 250 K; to 400 K; n 51; }
  properties (Psat_ethanol  Psat_water );
  output { file psat.csv; } }
```

### `propertyScan2D`
2-D sweep on a grid; LONG-form CSV (pivots into a heatmap in the GUI).
```
{ name Zgrid;  type propertyScan2D;
  varyX { variable T; from 290 K; to 600 K; n 21; }
  varyY { variable P; from   1 bar; to 150 bar; n 21; }
  state { composition { CO2 1.0; } }
  properties (Z  v_molar  H_R  S_R );
  output { file Z_grid.csv; } }
```

### `propertyScanTernary`
Walk the ternary composition simplex (x1+x2+x3=1) at a FIXED (T, P) and, at
every interior node, run the isothermal VLLE flash to classify the phase regime
(ONE_PHASE / VL / LL / VLLE) and collect liquid-liquid tie-lines.  REUSE, not
reimplementation: each node calls the same `IsothermalFlash::solveCore` the
`isothermalFlash` unit op calls, so the diagram and a single flash cannot
disagree.  Needs EXACTLY 3 components and a VLLE-capable thermoPackage — an
explicit `phases` block with a vapour + TWO liquid phases and an activity model
with a real LL gap (NRTL), exactly like the `vlle03_audit_artificial` tutorial
(the legacy `activityModel`+`equationOfState` form builds only one liquid and
will NOT split).  LONG-form CSV `x1,x2,x3,region,region_id,kind,tieline_id,
beta_vapor,beta_alpha,beta_beta` (`kind` = node | tie); the GUI's `TernaryPlot`
renders it.  NO composition under `state` — the grid IS the composition.
```
{ name lle;  type propertyScanTernary;
  state { T 350 K;  P 1 bar; }
  grid  { n 24; }            // intervals per triangle edge (interior nodes)
  tieStride 3;               // a tie-line every k-th split node
  output { file ternary.csv; } }
```
Tutorial: `tutorials/props/scan/ternary01_audit_vlle`.

### `fitParameters`
LM regression of thermoPackage scalars against experimental data.
Writes `fit_log.csv` (chi² + parameter trajectory) and `parity.csv`
(model vs experiment at the optimum).
```
{ name fit_nrtl;  type fitParameters;
  parameters
  (
      { path activityModel.pairs[0].a_ij; initial -0.5; min -5; max 5; }
      { path activityModel.pairs[0].b_ij; initial 200; min -1500; max 1500; }
...
  );
  residual
  {
      kind  T_bubble;  P  1.01325 bar;
      data ( 0.05 361.95   0.10 359.95   0.20 358.05...  );
  } }
```

Supported property keywords (in `propertyPoint.state` selectors and
in `propertyScanND.properties`): `T`, `P`, `Psat_<comp>`, `T_bubble`,
`gamma_<comp>`, `y_eq_<comp>`, `Cp_liquid_<comp>` (pure-component liquid Cp,
per compound — fails loudly if a compound has no `liquidHeatCapacity`),
`Cp_ig`, `H_ig`, `S_ig`, `Z`, `v_molar`, `H_R`, `S_R`,
`H_real`, `S_real`, `viscosity` / `mu`, `thermal_conductivity` / `k`,
`diffusivity` / `D`, `mu_L`, `k_L`, `D_L`.  `Psat_<comp>`, `gamma_<comp>`,
`y_eq_<comp>`, `Cp_liquid_<comp>` are PER-COMPONENT (one value per named
compound); the rest are mixture scalars at `state.composition`.

# Outer drivers (in `outerDict`)

When you want to do a SWEEP / OPTIMISATION / DESIGN SPEC / FIT around a
steady simulation, add a `system/outerDict`.  Selected by `type`:

### `sweep`  (1-D parameter scan)
```
type      sweep;
variable  units[0].operation.refluxRatio;
from      1.5;  to  5.0;  n  20;
report    sweep_R.csv;
```

### `optimization`  (Nelder-Mead n-D)
```
type       optimization;
variables
(
    { path units[0].operation.refluxRatio;  initial 2.5;  min 1.5;  max 5.0; }
    { path units[0].operation.feedStage;    initial 6;    min 3;    max 10; }
);
objective  { kind kpi; path units[0].V_strip;  sense minimize; }
report     opt_history.csv;
```
`objective.kind` can be `kpi`, `stream`, `cost`, `costTotal` (the last
two run the postDict chain on each evaluation).

### `designSpec`  (Newton on `$variables` against targets)
```
type   designSpec;
variables
(
    { path variables.A;        initial 100;  min 10;  max 1000; }
    { path variables.F_steam;  initial 5000; min 500; max 20000; }
);
targets
(
    { path productConc.F_mass;  value 5000 kg/h;  tol 0.01; }   # value form
    { lhs  effect1.area;  rhs effect2.area;       tol 0.001; }  # equality form
);
```

### `fitBinaryPair`  (LM regression of NRTL/Wilson)
The choupoSolve outer driver predating the choupoProps `fitParameters`.
Still works for pair-only regressions:
```
type        fitBinaryPair;
data        ( 0.05 361.95  0.10 359.95...  );
P           1.01325 bar;
output      pairfit.dat;
```
