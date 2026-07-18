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
Continuous stirred-tank reactor.  **One or many reactions.**
- ONE: Newton-1D in the extent ξ (`reaction <name>;`).
- MANY: the R coupled design equations `ξ_j = r_j(ξ) V_R` solved together by the
  multivariate Newton (`reactions ( r1 r2 ... );`) — this is what makes
  **selectivity** modellable (series A→B→C, parallel A→B / A→C).

```
operation { V_R  <m^3>; }
reaction  <name>;              # single         -> constant/reactions
reactions ( r1 r2 ... );       # MULTI (same grammar as batch/dynamicCSTR)
```
Reversible: add `reversible true;` to a reaction entry — detailed balance
`k_rev = k_fwd / K_eq(T)`.  Duty from the enthalpy balance (formation datum).
Example: `tutorials/steady/reactors/cstr03_series_selectivity` (A→B→C).

**Rate laws** (`kinetics { type ... }`, shared by `cstr` and `pfr` via `RateLaw`).
Two families, one formula.  With `theta_i` the concentration (mol/m³) or, when
`basis activity;`, the activity `a_i = γ_i x_i`; and `abar_i = K_i(T)·theta_i` the
adsorbed species (`K_i = K0·exp(B/T)`, `K_i = 1` where none is declared):

```
       k_f ∏ abar_i^{order_i}  −  k_r ∏ abar_i^{orderRev_i}
r  =  ─────────────────────────────────────────────────────
                ( vacantSite + Σ_ads abar_i ) ^ exponent
```

* `type Arrhenius` — no `adsorption` block, denominator ≡ 1: the plain power law.
* `type LHHW` — Langmuir-Hinshelwood-Hougen-Watson.  The denominator is the vacant
  site fraction raised to the number of sites the rate-determining step needs.  It is
  what lets a product **inhibit** its own reaction by covering the surface — something
  no power law reproduces at any order.
```
kinetics
{
    type LHHW;  basis activity;
    A <k_f0>;  Ea <J/mol>;   A_rev <k_r0>;  Ea_rev <J/mol>;   // regressed pair
    adsorption
    {
        exponent 2;  vacantSite 0;         // vacantSite 1 (default) = the "1 +" form
        species ( { component water; K0 0.29086872; B 0; } ... );
    }
}
```
The reverse leg is EITHER `reversible true` (detailed balance off `Kc` — concentration
basis only) OR a regressed `A_rev`/`Ea_rev` pair; asking for both is refused.
`orderRev` defaults to the product stoichiometry.  `operation { catalystLoading <kg/m^3>; }`
converts rate constants reported per gram of dry catalyst into a volumetric rate.
Example: `cstr07_lhhw_methylAcetate` — methyl-acetate synthesis over an ion-exchange
resin, activity basis on UNIQUAC, kinetically limited at 49 % against the 76 %
activity-based equilibrium the same rate law converges to as `V_R` grows.
(`batchReactor`/`dynamicCSTR` remain power-law only.)

**Non-isothermal** (multi-reaction path).  `thermalMode isothermal` (default) ·
`adiabatic` · `heatExchange { UA; T_coolant; }`, plus `T_guess` (K).
```
operation { V_R <m^3>;  thermalMode adiabatic;  T_guess 350; }
```
No `ΔH_rxn` source term: on the elements datum the reaction heat already lives inside
`H`, so an adiabatic reactor is simply `H_out = H_in` (`Q_kW = 0` exactly).  The extents
are eliminated first — at a **fixed** `T` the design equations are monotone and Newton
lands on the one root — leaving a single function of temperature,
`φ(T) = H_out(T) − H_in − Q_ext(T)`.  That is the textbook *heat generated vs heat
removed* balance, and it can have **three** roots.  Choupo does not hide that: it
**scans** the bracket, prints every steady state it finds, and reports the one nearest
`T_guess`.  Requires `standardThermochemistry` on every reacting species.  Example:
`cstr04_adiabatic` (esterification, +82 K; the PFR on the same reaction reaches +83 K,
the difference being the back-mixing the CSTR pays for) · `cstr05_multiplicity` (three
steady states: 300.4 / 348.4 / 391.3 K — `T_guess` picks the branch; KPI `steadyStates`
counts them) · `cstr06_jacketed` (`Q_kW` equals `UA (T_coolant − T_out)` to the digit).

### `pfr`
Plug-flow reactor.  Manual RK4 along the axial coordinate; supports reversible
reactions.  **One or many reactions** — with many it marches
`dF_i/dV = Σ_j ν_ij r_j(F)` (an IVP, no Newton).
```
operation { V_R  <m^3>; nSteps  100; }
reaction  <name>;              # single
reactions ( r1 r2 ... );       # MULTI
```
For a SERIES network the PFR beats the CSTR (no back-mixing keeps the intermediate):
`pfr03_series_selectivity` gives 79 % of B where `cstr03` gives 53 %, same τ.

**Non-isothermal** (multi-reaction path).  `thermalMode isothermal` (default — T imposed,
duty a result) · `adiabatic` · `heatExchange { U; areaPerVolume; T_coolant; }`.
```
operation { V_R <m^3>; nSteps 100;  thermalMode adiabatic; }
```
The reactor marches the **total enthalpy** `H` (elements datum) beside the species and
**recovers `T` by inverting it** — so there is **no `ΔH_rxn` source term**: on the formation
datum the heat of reaction is already inside `H`, and an adiabatic reactor conserves it
(`Q_kW = 0` exactly).  `T(V)` lands in the axial profile — a hot spot is something you
*see*.  Requires `standardThermochemistry` on every reacting species (a fictitious toy has no
elements datum → refused, loudly).  Example: `pfr04_adiabatic` (esterification, +83 K).
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
conversion for an irreversible reaction).  Isothermal; the heat of reaction is
**computed from each species' `standardThermochemistry`** (elements datum) — it reports the
resulting `dHrxn_kJ_per_mol` KPI and the duty `Q`.  A `dH_rxn` key in the reactions
dict is **ignored** by the steady reactors; it is an announced override only for
batch/dynamic toy components that lack formation data (see the heat-of-reaction
rule in `energy.md`).
**One or many reactions.**  With many, each extent is a SPEC (there is no solver):
```
operation { conversion  <0..1>;  T  <K>; }   // SINGLE (T optional; default = feed T)
reaction  <name>;        // needs only stoichiometry + limitingReactant (no kinetics)
```
```
operation                                     # MULTI -- a PARALLEL network
{
    T <K>;
    conversions
    (
        { reaction r1;  conversion 0.60; }    # fraction of the FEED limiting reactant
        { reaction r2;  extent 0.04; }        # ... or a direct extent [kmol/s]
    );
}
reactions ( r1 r2 );
```
Selectivity is then a **spec** (what the catalyst does), not a result — the honest reactor
when you have neither rate data nor an equilibrium.  Example:
`tutorials/steady/reactors/conversion02_parallel_selectivity` (75 % selectivity).

### `equilibriumReactor`  (alias `REquil`)
Stoichiometric **equilibrium** reactor (the "REquil" of process simulators): you give a
**set of reactions**, each driven to **simultaneous** chemical equilibrium via its
`Kp(T)` (from the species' `standardThermochemistry`, `K = exp(-ΔG°/RT)`) — **no kinetics, no
residence time**.  The R extents are a **result**: the coupled gas-phase ideal system
`Kp_j = ∏_i (p_i/P°)^ν_ij`, `n_i = n_i0 + Σ_j ν_ij ξ_j`, is solved in log form by the
multivariate Newton.  The reforming / shift / synthesis workhorse.  Distinct from
`conversionReactor` (extent **given**), `gibbsReactor` (Gibbs minimisation, **no reactions
specified** — cannot restrict *which* reactions equilibrate), and `cstr`/`pfr` (equilibrium
reached only **kinetically**, needing rate data + residence).
```
operation   { T <K>; }        // isothermal (default = feed T)
reactions   ( r1 r2 ... );    // names from constant/reactions (stoichiometry only;
                              // NO kinetics needed -- Kp(T) comes from standardThermochemistry)
```
The `reactions ( ... )` list is the **one multi-reaction grammar** across the engine
(the `batchReactor` / `dynamicCSTR` take the same); stoichiometry lives in the reactions
library, never repeated inside a unit.
KPIs: `Kp_<name>`, `extent_<name>_kmol_h`, `conversion_<name>`, `Q_kW`, `newtonResidual`.
Example: `tutorials/steady/reactors/equil01_reforming` (SMR + water-gas-shift together).

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

**Multiple feeds + side draws (`simultaneous` only).**  A multi-feed column takes
its feeds as **flowsheet streams** — `inputs ( feed feed2 )` — so the plant-boundary
mass + energy balance sees them (information follows the streams; an inline-composition
feed would be a hidden side channel that breaks the boundary balance).  `operation.feeds`
maps each input stream to a stage.  Liquid/vapour side draws are outputs (the rate is
in the operation; they follow distillate + bottoms in `outputs`, in stage order).  The
CMO flow profile `L[j], V[j]` is rebuilt per stage; one feed + no draw reduces exactly
to the single-feed case (existing cases unchanged).
```
# each feed is a real stream with its OWN authored 0/ file (0/feed, 0/feed2)
units ( { ... inputs ( feed feed2 );  outputs ( distillate bottoms intermediateCut );
  operation
  {
    nStages 15;  refluxRatio 3.0;  distillateRate 42 kmol/h;  P 1.013 bar;
    feeds      ( { stream feed;  stage 5;  quality 1.0; }      # stream -> stage
                 { stream feed2; stage 11; quality 1.0; } );
    sideDraws  ( { stage 8;  phase liquid;  rate 15 kmol/h; } );   # phase liquid|vapor
  } } )
```
(A single feed keeps the legacy `in feed;` + `feedStage`.)

**Murphree tray efficiency** (optional `operation { murphreeEfficiency <0..1>; }`,
`WangHenke` ONLY — `simultaneous` REFUSES it rather than returning ideal stages).
`y_j = E·K_j·x_j + (1−E)·y_{j+1}`, folded into an effective K with `y_{j+1}` lagged one
outer pass (exact at convergence).  Default `1` = the ideal stage, byte-exact.  With
`E < 1`, `nStages` counts **real trays** — which is what the hydraulics pass then sizes.
`E` is DECLARED (O'Connell, a chart, or plant data); the engine never invents it.
Example: `column11_murphree` (E = 0.70 → distillate 98.12 % → 95.05 %).

**Sieve-tray hydraulics** (optional `operation { hydraulics { ... } }`, works with BOTH
methods).  The MESH equations contain no diameter — a column of any width converges to
the same distillate, and a flooded one converges just as prettily.  This is a **rating
pass on the converged profile**, never a coupled unknown (the reported ΔP is NOT fed back
into the stage temperatures).  A stage with no vapour traffic identifies itself as
not-a-tray, so the condenser and reboiler drop out on their own.

```
hydraulics
{
    trayType               sieve;    # only sieve
    diameter               1.10;     # m -- GIVE it => RATING;  OMIT it => DESIGN
    traySpacing            0.50;     # m
    weirHeight             0.050;    # m
    holeDiameter           5.0e-3;   # m
    holeAreaFraction       0.10;     # A_holes / A_active
    downcomerAreaFraction  0.12;     # A_downcomer / A_tower
    weirLengthFraction     0.77;     # l_weir / D
    orificeCoefficient     0.84;     # C_o -- a CHART (Liebson 1957); declared, printed back
    floodFraction          0.80;     # design target
    K2                     30.7;     # optional CHART constant; absent => weep check skipped
    # sigma                0.021;    # N/m; else the package must supply surfaceTension
}
```
Flooding: Souders-Brown `u_flood = C_SB (σ/20)^0.2 √((ρL−ρV)/ρV)` on the net area, with
Fair's (1961) capacity parameter in the algebraic form of Lygeros & Magoulas (1986).
That fit misbehaves for `F_LV < 0.03` and the pass **says so** rather than reporting a
number it does not believe.  Pressure drop / weir crest / residual head / downcomer
backup / weep point follow Sinnott (mm of clear liquid).  Kister & Haas (1990) is
deliberately NOT implemented — two of its constants are unverified against a primary
source.  **σ is required**: add `transport { surfaceTension { model BrockBird; } }` to the
propertyDict or declare `sigma`.  KPIs: `diameter`, `floodApproach_max`, `floodStage`,
`dP_column_kPa`, `downcomerBackup_max_mm`, `downcomerFloodStages`, `weepingStages`;
profile gains `floodApproach`, `dP_Pa`, `h_backup_mm`.
Examples: `column09_tray_hydraulics` (design → D = 1.322 m) · `column10_flooding`
(same column at 1.10 m: identical stream table, stage 14 at 115.6 % of flood).

**Reactive distillation (`simultaneous` only).**  An equilibrium reaction on
named catalytic stages.  Restricted to **mole-conserving (Σν = 0)** reactions
(esterification, transesterification, metathesis) so the CMO flow profile is
untouched; each reactive stage gains a molar extent ξ_j closed by the
activity-based equilibrium `Σ_i ν_i ln(γ_i x_i) = ln K_a`.  Converged by homotopy
(solve non-reactive, then switch the reaction on).  The reaction heat is not fed
back into the flows — an honest bubble-point screening model.
```
reaction
{
    stoichiometry ( { component methanol; nu -1; } { component aceticAcid; nu -1; }
                    { component methylAcetate; nu 1; } { component water; nu 1; } );
    reactiveStages ( 11 12 13 14 15 16 17 18 19 );
    equilibrium { Ka 5.2; }       # activity-based equilibrium constant
}
```
Compared against Pöpken, Steinigeweg & Gmehling, *Ind. Eng. Chem. Res.* 40
(2001) 1566 (methyl acetate, run S-1): with the correct equilibrium K_a the model
gives 96 % conversion — the equilibrium ceiling — vs 87.6 % measured; the gap is
thermodynamic (predictive UNIFAC vs the paper's fitted UNIQUAC, whose reactive
MESH does not yet converge here).  KPIs: `conversion`, `reactionExtent`.

A **kinetic (rate-limited)** alternative replaces `equilibrium {}` with a
`kinetics {}` block (pseudo-homogeneous or adsorption LHHW); the per-stage extent
becomes `rate × catalyst mass` (no extent unknown):
```
kinetics
{
    model adsorption;                       # or pseudoHomogeneous
    forward { A 8.497e6; Ea 60470; }        # mol/(g_cat·s), J/mol
    reverse { A 6.127e5; Ea 63730; }
    adsorption ( { component aceticAcid; K 3.15; } ... );   # K_i for a'_i = K_i a_i / M_i
    catalystMass 0.45 kg;                   # total over the reactive stages
}
```
Caveat: for a **fast** rate (catalyst-rich, near-equilibrium) the explicit rate is
stiff and the FD-Jacobian Newton is slow / may not converge — use `equilibrium {}`
there; the kinetic mode is for genuinely rate-limited columns.  A Σν ≠ 0 reaction
and VLLE on a tray still need the full-MESH energy balance.

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
    membrane         SW30HR;        # -> data/standards/assets/<name>.dat
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

### `pneumaticConveyor`
Dilute-phase pneumatic conveying of solids in a gas (the conveying LINE).
Total pressure drop = sum of contributions (gas + solids acceleration,
gas + solids wall friction, gas + solids static head over the vertical
rise `dz`); particle velocity by Hinkle (slip), gas friction Fanning,
solids friction Hinkle (C_D Schiller–Naumann).  REPORTS the Rizk
saltation velocity and **warns aloud if `u_g` falls below it** (settling /
blockage risk) — never a silent clip.  Hardware-only operation block;
every velocity, the suspended density and ΔP are results.  Needs a
`transport { viscosity { model Chung; } }` block (gas viscosity) and the solid
component's `solid { rho_p; }`.
```
type      pneumaticConveyor;
operation { geometry { D 0.1 m;  L 50 m;  dz 10 m; } }   # diameter, length, rise
# feed stream declares solids as solidFlows (mass) + a PSD:
#   solids { solidFlows { silica 282 kg/h; } diameters (...); massFractions (...); }
```
KPIs: `deltaP` (+ the five-way breakdown), `u_gas`, `u_particle`,
`u_terminal`, `u_saltation`, `solidsLoading`, `suspensionDensity`.

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
Polish a HYGROSCOPIC powder (sugar, food) toward the equilibrium
moisture set by a real hot-air stream + the solid's **GAB sorption
isotherm** (`sorption {}` on the component).  Two real streams — the air
brings the heat and carries the moisture; the outlet T is a RESULT, no duty.
```
inputs  (wetSolid  hotAir );   outputs (drySolid  humidExhaust );
```

### `evaporativeDryer`
Dry a NON-sorbing solid (a crystalline inorganic — e.g. Li₂CO₃) of its
**free surface moisture**.  The honest counterpart of `solidDryer`: no
sorption isotherm exists or is consulted.  Free water evaporates into a real
hot-air stream (constant-rate) until the **first of three announced limits**
binds: all water gone · the exhaust air saturates (`maxExhaustHumidity`,
default 0.95) · the air runs out of heat (energy floor).  Saturation and the
adiabatic outlet T are solved coupled (evaporation cools the air).  No duty.
```
inputs  (wetSolid  hotAir );   outputs (drySolid  humidExhaust );
operation { maxExhaustHumidity 0.95; }   // optional
```
Use `solidDryer` when the moisture is sorbed (an isotherm governs it);
`evaporativeDryer` when it is free surface water (a crystal loses it by
plain evaporation).

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

Viscosity comes from the property package's `liquidViscosity` model, or an
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

**Gas-liquid two-phase flow (Layer 1).**  When the feed flashes two-phase at
`(T,P)` (i.e. `0 < V/F < 1` — the inlet vapour fraction the flowsheet resolves),
the pipe AUTOMATICALLY switches to a gas-liquid model.  A single-phase feed uses
the liquid path above, unchanged.  Select the model with an `operation { twoPhase
{ model ...; } }` sub-block (the `model` slot stays the phase-alone friction
factor):
- `LockhartMartinelli` (DEFAULT) — phase-alone gradients → Martinelli `X` →
  Chisholm multiplier `phi_L^2 = 1 + C/X + 1/X^2` (`C` = 20/12/10/5 by tt/vt/tv/vv
  regime) → two-phase `deltaP`; liquid holdup from the Butterworth (1975) fit of
  the Lockhart–Martinelli (1949) void fraction; elevation uses the holdup mixture
  density.
- `homogeneous` — no-slip pseudo-fluid: mixture density `1/(x/rho_G+(1-x)/rho_L)`,
  McAdams viscosity, single-phase Darcy.  Holdup = no-slip void.
- `Friedel` (Layer 2) — Friedel (1979) general multiplier `phi_LO^2` on the total
  mass flux flowing as liquid; needs surface tension (Weber/Froude).
- `BeggsBrill` (Layer 2) — Beggs & Brill (1973): flow-pattern map (segregated /
  intermittent / distributed), holdup per pattern, **inclination** correction, and
  a two-phase friction-factor ratio; needs surface tension.

Needs both phase properties: `rho_G`/`rho_L` from `density()` (idealGas vapour +
Rackett liquid), `mu_L` from `liquidViscosity` (or the `operation { viscosity }`
override), `mu_G` from `transport { viscosity { model Chung; } }` (or `twoPhase { gasViscosity
<v> Pa.s; }`).  Friedel/BeggsBrill also need `transport { surfaceTension { model
BrockBird; } }` (or `twoPhase { surfaceTension <v> N/m; }`).  Scope: **adiabatic**
(the inlet `vf` is held along the pipe — no flashing in the line).  Extra two-phase KPIs: `vaporFraction`, `quality_mass`, `holdup_liquid`,
`voidFraction`, `X_martinelli`, `phi_L2`, `jG`, `jL`, `rho_G`, `rho_L`, `Re_Ls`,
`Re_Gs`.  Validated framework: Lockhart & Martinelli, Chem. Eng. Prog. 45 (1949)
39 (air-water).  Tutorial: `steady/hydraulics/pipe02_airwater_twophase`.
```
{ name P1;  type pipe;  model Churchill;  in feed;  outputs ( downstream );
  operation {
    geometry { D 0.05 m;  L 10 m;  roughness 4.6e-5 m; }   // horizontal (dz 0)
    viscosity 8.9e-4 Pa.s;                 // liquid mu (water; trace gas has none)
    twoPhase { model LockhartMartinelli; } // LockhartMartinelli | homogeneous
  }
}
```
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
`kinetics { type ... }`: `Arrhenius` · `modifiedArrhenius` · `thirdBody` · `falloff`
(the CHEMKIN gas forms) · **`LHHW`** — the SAME shared `RateLaw` the steady `cstr`/`pfr`
evaluate, so a batch vessel and a continuous one cannot disagree about what an
adsorption denominator means.  With `basis activity` it needs an activity model.
`operation { catalystLoading <kg/m^3>; }` turns per-gram rate constants volumetric
(with c in kmol/m³ the factor IS the loading: mol/(g·s)·kg/m³ = kmol/(m³·s)).
Example: `batch07_lhhw_methylAcetate` (Pöpken 2000 Eq 16 on UNIQUAC activities;
X → 76.6 %, the activity equilibrium the steady CSTR also reaches).

### `fixedBedAdsorber`
One-dimensional isothermal adsorption with conservative finite volumes,
axial dispersion and declared LDF kinetics.  `flowModel ergun` activates the
A4 continuity contract: every gas component is an ODE state,
`P_j = R T sum(c_ij)`, and signed superficial velocity is solved at each face
from Ergun.  It requires `dParticle` (and optional `sphericity`) in the
adsorbent identity, gas viscosity from the thermo transport model, and a
declared downstream `P_out`.
```
operation {
  adsorbent zeolite13X_A4; flowModel ergun;
  L 0.5 m; area 0.01 m2; eps 0.4; u 0.05 m/s;
  T 298.15 K; P 1 bar; P_out 1 bar;
  Dax [0 2 -1 0 0] 1e-4; nCells 25;
  feed { molarComposition { CO2 0.15; He 0.85; } }
  initial { molarComposition { He 1.0; } }
  kLDF { basis solidFilm; scope "declared pellet"; source "cited or assumed";
         k { CO2 [0 0 -1 0 0] 0.05; } }
}
```
`constantVelocity` remains an explicit A3 teaching/compatibility mode and
announces its carrier-fabrication residual.  Examples: `batch16_ergun_profile`
(closed-form pressure profile), `batch17_dilute_ergun_limit`, and
`batch18_ergun_conservation`.

### `batchStill`
Rayleigh batch distillation; constant offtake `F_vap` per step;
bubble-T re-solved each step.  Optional `dischargeTo  receiver;`
routes condensed vapour to a `batchAccumulator`.

`model rectifier;` adds the classical batch rectification: `nStages`
ideal stages above the pot + a total condenser at constant reflux.
`F_vap` then means the internal BOILUP `V`; the product is
`D = V/(R+1)` and the pot loses `D·x_D(t)` only, with `x_D` solved
each instant from the quasi-steady cascade (announced on failure).
Trajectory gains `xD_<comp>`, `R`, `D` columns; the receiver
accumulates the run-average distillate (a different composition from
the instantaneous `x_D` -- both are visible on purpose).

```
{ name still;  type batchStill;  model rectifier;
  dischargeTo receiver;
  initial   { T 365 K; P 1.013 bar; totalMoles 1e-3;
              molarComposition { benzene 0.5; toluene 0.5; } }
  operation { P 1.013 bar;  F_vap 1.5e-6;      // boilup V, kmol/s
              nStages 3;  refluxPolicy constantReflux;  refluxRatio 3.0; } }
```
`refluxPolicy constantComposition;` holds a light-key purity instead:
`lightKey benzene; x_D_target 0.93; refluxMax 8; onRefluxLimit
stopDistillation;` (XOR with `refluxRatio`).  R(t) is solved each step
by a bracketed search over [0, refluxMax] on a feasibility map;
distinct refusals for a target below the R=0 floor, unreachable at
refluxMax (azeotrope barrier included), or a non-monotone x_D(R).  At
the ceiling the run announces stopDistillation: D = 0, inventory
freezes, `refluxLimitReached` appears in trajectory + KPIs.  With
`nStages 0` and `refluxRatio 0` the model reproduces plain Rayleigh
exactly.

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
Constant-volume continuous CSTR, optional jacket (UA·(T_j-T)).  RK4 on packed
`(nᵢ, T)`.  MV/CV string-keyed registry so controllers bind by name.
`kinetics { type Arrhenius; }` or **`type LHHW;`** (the shared `RateLaw`; same
`catalystLoading` key as the batch reactor).  Example: `ctrl07_lhhw_inhibition` — the
product adsorbs, the exotherm FADES as conversion proceeds, and the PID must hold a
setpoint against a shrinking disturbance.

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
Controller types: `PID` (clamping anti-windup, derivative-on-PV),
`Schedule` (open-loop piecewise constant — for step-disturbance
injection), and `Signal` (open-loop, the FULL forcing-function
vocabulary).

A `Signal` controller owns a `signal { type ...; }` block and writes
`signal.value(t)` to its actuator MV at each sample.  The signal types:

| `type` | params | shape |
|---|---|---|
| `step` | mean, step, tStep | `t<tStep ? mean : mean+step` |
| `staircase` (alias `schedule`) | `schedule( {time .. value ..} … )` | ZOH staircase (the `Schedule` math) |
| `ramp` | mean, slope, tStart, [tEnd] | linear ramp, optional saturation |
| `pulse` | mean, amplitude, tStart, width | rectangular pulse |
| `sine` (alias `sinusoidal`) | mean, amplitude, period XOR frequency, [phase], [tStart] | `mean + amplitude·sin(2π(t−tStart)/period + phase)` |

```
{
    name      FeedDist;
    type      Signal;
    actuator  { unit reactor;  mv T_in; }
    signal    { type sinusoidal;  mean 320 K;  amplitude 15 K;  period 600 s; }
}
```

Inject a sinusoid on an inlet, watch the PID chase the moving target →
the **forced sinusoidal response** (attenuated + phase-lagged); sweep
the `period` to build a one-point Bode by trial-and-error
(`ctrl06_sine_disturbance`).  `Schedule` stays a first-class spelling
(it delegates to the `staircase` signal, so legacy cases are unchanged).

The dynamic unit also exposes its **feed face** alongside its outlet:
when `solutionControl { write true; }` is on, each `<t>/streams` carries
both `<unit>.feed` (`bc inlet;`) and `<unit>.out` (`bc computed;`), and
`<t>/internalState` records the controller-driven jacket as a per-unit
extra — so the live overlay shows input and output flux at once
(accumulation is visible when in-flux ≠ out-flux).

A dynamic unit can also SEED its t=0 from the steady operating point:
add `start steadyState;` inside its `initial{}` block.  The engine
relaxes the holdup ODE at the declared feed/UA/jacket to its fixed point
and PRINTS the seeded `(T0, x_i)` (default `start explicit;` keeps the
literal `initial{}` — byte-identical to every existing case).

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
disagree.  Needs EXACTLY 3 components and a VLLE-capable property package — an
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
LM regression of property-package scalars against experimental data.
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

### `multiStreamHX`  (alias: `MHeatX`)
Multi-stream heat exchanger (the LNG / cold-box pattern): several hot and
cold inlets exchange in one shell.  Each inlet declares its OUTLET target
T in the `outlet {}` block except one, which the enthalpy balance closes.
```
operation { outlet { hot1 { T 330.0 K; }  hot2 { T 340.0 K; } } }
                       # the cold stream's outlet is the balance's result
```
Example: `mheatx01_two_hot_one_cold`.

### `extractor`
Multi-stage counter-current liquid-liquid extractor on the package's LLE
gammas (the declared solvent defines the extract phase).
```
operation { stages 5;  solvent benzene;  temperature 298.15 K; }
```
Example: `extract01_ethanol_water_benzene`.

### `ionExchanger`
Fixed-bed ion exchange on a declared RESIN record (resolved by exact name in
case-local `constant/assets/`): softening/polishing to the resin's selectivity
and capacity, hardware announced.  The capacity NAMEPLATE (`CEC` eq/L bed,
`CEC_dry` eq/kg dry) lives in the resin `.dat`; the operation declares the
CONTACT via `resinDose` (`L/kg` = bed litres per kg water, or `kg/kg` = dry
resin per kg water) and the engine derives + announces
`X_total = CEC × resinDose` in eq/kg water — no hidden ρ≈1 shortcut.
```
operation { resin SAC_Na;  resinDose 1.0 L/kg;  bedVolume 1.5 m3;  pH 7.0; }
```
Example: `membrane08_softened_scaling` (the softening pre-treatment).

### `psa`
Pressure-swing adsorption on a declared adsorbent
(`data/standards/assets/`): equilibrium loading split between P_high
and P_low, derated by a declared utilisation factor; the light key defines
the raffinate product.
```
operation { adsorbent zeolite5A;  P_high 20 bar;  P_low 1.2 bar;
            T 313 K;  lightKey H2;  purgeRatio 0.15;
            eta 0.80;  bedCapacity 2.0; }
```
Example: `psa01_h2_psa`.

### `tsaTwinBed`
Cycle-averaged twin-bed temperature-swing adsorption.  One bed adsorbs while
the other regenerates; `tCycle` is one bed's adsorption interval.  The model
uses the declared isotherms at `T_ads` and `T_regen`, reports working capacity
and gross sensible/desorption duties, and refuses a feed that exceeds the
available working capacity.  `cpSolid` is required in the adsorbent record.
```
operation { adsorbent zeolite13X_tsaAnchor;  mAdsPerColumn 3 kg;
            tCycle 300 s;  T_ads 298 K;  T_regen 398 K;
            lightKey He;  purgeRatio 0.10; }
```
The two output streams are the cooled product and combined regeneration gas;
this steady shortcut does not resolve breakthrough, thermal fronts, pressure
drop, or step timing.  Examples: `tsa01_co2_twin_bed` and the intentional
capacity refusal `tsa02_refused_capacity`.

### `electrodialysisStack`
ED stack (ion-exchange membrane pair): applied CURRENT drives salt from
diluate to concentrate channels; the limiting current is computed from the
declared channel hydraulics (Leveque) and an over-limiting demand is
refused/announced.
```
operation { N_cellpairs 100;  current 8.0;  xi 0.9;
            membraneArea 0.2 m2;  channelThickness 0.5 mm;
            channelLength 0.4 m;  linearVelocity 0.05 m/s;
            E_electrodes 1.5; }
```
Examples: `ed01_nacl_desalination`, `ed02_over_limiting_current`.

### `sweep`  (1-D parameter scan)
```
type       sweep;
parameter
{
    target    units[0].operation.T;      # dot-path into the flowsheetDict
    range     ( 360.0  385.0 );          # (min max)
    nPoints   26;
}
responses  ( flash01.V_over_F  vapor.F );  # unit.kpi or stream.field per point
report     { file  sweep_flashT.csv; }
```
A `streams.<name>.<field>` target is applied through the StreamOverrides
channel to the SEEDED registry each pass (legal over 0/; the 0/ file stays
the authored base value).  2-D grids: `gridSweep` (two parameter{} blocks,
long-form CSV the GUI pivots into a heatmap).

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
manipulate
(
    { variable A;                              initial 100 m2;    min 20 m2;   max 500 m2; }
    { variable streams.utilitySteam.F;         initial 400 kmol/h; min 100 kmol/h; max 1500 kmol/h; }
);
targets
(
    { path productConc.F_mass;  value 5000 kg/h;  tol 0.01; }   # value form
    { lhs  effect1.area;  rhs effect2.area;       tol 0.001; }  # equality form
);
```

### `fitBinaryPair`  — RETIRED (the factory throws; use `fitParameters`)

Removed from the engine: `OuterDriver::New` throws on this name and points
at `fitParameters`, which subsumes it (LM regression + identifiability
diagnostics + mode evaluate + the GUI Fit view).  Kept here as a one-line
HISTORICAL (legacy) note only — there is no runnable grammar to document.
