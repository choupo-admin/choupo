# Dict syntax — the language a Choupo case is written in

Choupo dicts: hierarchical, plain-text, **comma-free** (one statement
per logical entry, terminated by `;`).  Parser lives in
`src/core/Dictionary.{H,cpp}`.  Component-aware tokenizer: `[` and `]`
are treated as word characters (used in unit-bracket dimensions and
in path syntax).

## Top-level structure

A dict file has NO outer braces.  It is a sequence of statements:

```
type        crystalliser;
model       MSMPR;

operation
{
    operatingTemperature  293.15 K;
    volume                  5.0 m3;
}
```

This is a generic dictionary block, not a complete case.  In a case,
`system/flowsheetDict` contains topology and unit operations only.  Material
states are separate files under `0/`; for example `0/feed`:

```
componentMolarFlows
{
    water      85 kmol/h;
    sucrose    15 kmol/h;
}
T    353.15 K;
P    1 bar;
```

## Four primitive constructs

### 1. Scalar / word assignment

```
keyword  value;
```

The value is one token (a number with optional unit, a word, or a
quoted string).  Examples:

```
verbosity    3;                       // integer
T            293.15 K;                // number + named unit
T_init       293.15;                  // raw number (SI; parser stores
                                       // dimensions as expected)
P            [1 -1 -2 0 0]  101325;   // bracket form: M L T Theta N exps
                                       // + raw SI value
fluid        water;                   // word
description  "isothermal flash";      // quoted string
```

### 2. Sub-dictionaries

```
keyword  { statement1; statement2;... }
```

```
operation
{
    refluxRatio    2.5;
    feedStage      6;
    nStages        12;
}
```

### 3. Lists

```
keyword  (v1 v2 v3... );
```

The values are tokens (numbers or words):

```
outputs    ( liquid  vapor );
components (water  ethanol  sucrose );
fractions  ( 0.6  0.4 );
```

### 4. Lists of sub-dicts

```
keyword
(
    {... }
    {... }
...
);
```

Used for collections of structured items (units, reactions, recipe
events, equality targets):

```
units
(
    { name flash01; type isothermalFlash;
      in feed; outputs (liquid vapor );
      operation { T 370 K; P 1 bar; } }

    { name cstr01;  type cstr;
      in vapor;  outputs (product );
      operation { V_R 0.004; }
      reaction isomerization; }
);
```

## Comments

```
// single-line comment to end of line

/* multi-line
   comment */
```

**`#` is NOT a comment character.**  The tokenizer knows only the two forms
above; a pasted `# note` line parses as tokens and errors.  (Until
2026-08-23 this kit's own examples used `#` inline comments -- 203 of them,
converted after the benchmark re-run flagged the inconsistency.)

## FoamFile header (optional, skipped)

A `FoamFile` header at the top is tolerated for compatibility with files
carried over from other tools;
the parser reads and ignores it:

```
FoamFile
{
    version  2.0;
    format   ascii;
    class    dictionary;
    object   flowsheetDict;
}
```

Most Choupo tutorials omit it.  Don't write one unless asked.

## Units on numeric scalars

EVERY numeric scalar in Choupo carries dimensions internally (a 5-int
exponent vector `[M L T Theta N]` for mass / length / time /
temperature / amount).  Three input forms are accepted by the parser
; when in doubt, prefer the **named-unit** form.

### Named units (recommended)

```
P                    1.0 bar;
T                  370.0 K;
F                  100.0 kmol/h;
area                35.0 m2;
volume               5.0 m3;
length               1.0 m;
mu                 1.0e-3 Pa.s;
A_w                1.0e-6 m/s/bar;         // water permeability of a membrane (SW30HR RO)
k_film             5.0e-5 m/s;
W_shaft           10000.0 W;                // or `10 kW`
duty                160.0 kW;
```

Registry of ~90 named units lives in `src/core/Units.cpp`.  Only the
suffixes below are accepted -- anything else is a parse error.  Includes:

- **Pressure:** `Pa`, `kPa`, `MPa`, `bar`, `atm`, `psi`, `mmHg`, `torr`
  (lower-case only).
- **Flow (molar):** `kmol/s`, `kmol/h`, `mol/s`, `mol/h`.
- **Flow (mass):** `kg/s`, `kg/h`, `g/s`, `g/h`, `t/h`.
- **Temperature:** `K`, `degC` (`C`/`Celsius`), `degF` (`F`/`Fahrenheit`)
  -- note: degC/degF are affine, so a difference and an absolute differ;
  use `K` when in doubt.
- **Length:** `m`, `mm`, `cm`, `km`, `in` (`inch`), `ft`.  (No `um`/`nm`.)
- **Area:** `m2`, `cm2`, `mm2`.
- **Volume:** `m3`, `L` (`l`), `mL` (`ml`).
- **Volumetric flow:** `m3/s`, `m3/h`, `L/s`, `L/h`, `L/min`.
- **Time:** `s` (`sec`), `min`, `h` (`hr`), `day`.
- **Mass:** `kg`, `g`, `t` (`ton`/`tonne`).
- **Energy / power:** `J`, `kJ`, `MJ`, `W`, `kW`, `MW_power` (`MW_power`,
  not `MW` -- a bare `MW` would collide with `MPa`'s milli-prefix logic).
- **Heat-transfer coefficient:** `W/m2/K` (the one parseable spelling --
  `^`, `(`, `)` are not word characters, so forms like `W/(m2.K)` never
  survive the tokenizer).  (No `kW/m2/K`.)
- **Mass-transfer coefficient / velocity:** `m/s`, `cm/s`, `mm/s`.
  (No `um/s` -- use `mm/s`, or `m/s` with the numeric value, e.g.
  `5.0e-5 m/s`.)
- **Water permeability:** `m/s/bar`, `m/s/Pa`.
- **Viscosity:** `Pa.s`, `cP`.
- **Concentration:** `kmol/m3`, `mol/m3`, `mol/L`, `mmol/L`, `M`.
- **Molality:** `mol/kg`, `mmol/kg` (per kg of solvent -- water analyses,
  electrolyte `totals`).
- **Density / mass concentration:** `kg/m3`, `g/cm3`, `g/mL`, `mg/L`, `g/L`,
  `ppm` (= mg/L, the w/v water-analysis convention -- NOT a fraction).
- **Molar mass:** `kg/kmol`, `g/mol`.
- **Molar energy:** `J/mol`, `kJ/mol`, `J/kmol`, `kJ/kmol`.
- **Molar heat capacity:** no parseable named unit (`^`, `(`, `)` are not
  word characters) -- use the bracket form or raw SI (J/mol/K).
- **Dimensionless:** `-`, `%`.

### Bracket form (when no named unit fits)

```
keyword  [M L T Theta N]  value_SI;
```

The value is in canonical SI; the brackets declare its dimensions:

```
A_w   [-1 2 1 0 0]   1.0e-11;     // M^-1 L^2 T^1: kg^-1 m^2 s ≡ m/(Pa·s)
                                  // (= 1.0e-6 m/s/bar, the SW30HR value above)
```

Useful for uncommon dimensions where a named unit would be invented
just for one parameter.

### Raw SI (caller-asserts)

```
keyword  value;          // no unit suffix
```

Accepted: the parser stores the number with **expected dimensions**.
If the caller later does a dim-checked lookup, an inconsistency is
caught.  Avoid this form for clarity; named units are pedagogically
better.

### Dim-checked lookup error message

When a downstream `lookupScalar(key, expectedDims)` sees a mismatch,
the error is crystal-clear:

```
ERROR: Dictionary 'feed' ():
  parameter 'P' expected dimensions [1 -1 -2 0 0] (Pa)
  but the dict declared [1 0 0 0 0] (kg).  Check the unit
  suffix on this entry.
```

## `$variables` — live references

A top-level `variables {... }` block in any dict lets you reference
its entries from anywhere else in the same root dict (via `$name`):

```
variables { A 100; F_steam 5000 kg/h; }

units
(
    { name effect1; type evaporator;
      in feed; outputs (concentrated vapor );
      operation { area $A m2;... } }

    { name effect2; type evaporator;
      in concentrated; outputs (... );
      operation { area $A m2;... } }   // SAME $A
)
```

`$A` is resolved at LOOKUP TIME — so an outer driver
(`DesignSpec`, `SweepDriver`) that mutates `$variables.A` at runtime
sees the change reflected in every reader on the next call.  This is
how a 2-D DesignSpec problem reduces to two scalars (`$A` + `$F_steam`).

References inherit the variable's declared dimensions — the
dim-check upstream still works through the indirection.

## Computed `$variables`

For post-processing arithmetic, a variable can be a `compute`
expression evaluated against the simulation result:

```
variables
{
    Q_total       { compute "effect1.duty + effect2.duty + effect3.duty"; unit kW; }
    water_evap    { compute "effect1.F_vap_mass + effect2.F_vap_mass + effect3.F_vap_mass"; unit kg/h; }
    economy       { compute "water_evap / effect1.F_steam"; }
}
```

The evaluator (`src/core/ExprEval.{H,cpp}`) supports `+ − * /`,
parentheses, unary sign, numbers, and identifiers.  Identifiers
resolve as `<unit>.<kpi>`, `<stream>.<field>`, an earlier computed
var, or a plain input `$variable`.  Values land in
`reports/computed/values.csv` and in the JSON result.

## Path syntax (programmatic access)

When an outer driver mutates a value, it uses dot-and-bracket
notation:

```
units[0].operation.refluxRatio       // the first unit's reflux
reactions.myRxn.kinetics.A           // an Arrhenius prefactor
variables.A                          // a top-level $variable
streams.feed.F                       // a feed flow
```

A reaction sub-dict carries its `kinetics { … }` (Arrhenius); the **heat of
reaction is computed from the species' `standardThermochemistry`** (the one enthalpy base),
not from the dict.  An optional `dH_rxn <J/mol>;` (negative = exothermic) is an
**announced override**, honoured only when a reacting species lacks
`standardThermochemistry` (toy / lumped components); the steady reactors ignore it and
cross-check it against the formation value when both are present (see
`energy.md`).

This is the language `Dictionary::setScalarAtPath(path, v)` reads.
End-users don't write this in dict files; outer drivers do, on their
behalf.

## Reserved keywords inside a unit-op entry

Inside a `{... }` block representing one unit operation (in a `units
(...)` list), some keys are special and MUST appear in this slot
ordering:

| Position | Key | Required? | Meaning |
|---|---|---|---|
| 1 | `name`      | yes | instance name -- referenced by `in:`/`outputs:` of other units |
| 2 | `type`      | yes | unit op type (`isothermalFlash`, `cstr`, `crystalliser`,...) |
| 3 | `model`     | opt | sub-model selector (cyclone `Lapple`, distillation `WangHenke`/`simultaneous`, gibbs `directMin`, crystalliser `MSMPR`,...) |
| 4 | `in`        | one-of | single input stream name |
| 4 | `inputs`    | one-of | list of input stream names |
| 5 | `outputs`   | yes | list of output stream names |
| 6 | `operation` | yes | sub-dict of operating parameters (the numeric knobs) |
| 7+ | `reaction` / `crystallisation` / `dryingCurve` | opt | reference to a constant/<lib>/<name> block |
| 7+ | `thermo`    | opt | per-unit thermo override (replaces global models for this unit only) |

`name` and `type` are mandatory; the rest depend on the unit.  See
`unit-ops.md` for per-op required fields.

## How `inputs` and `outputs` map to streams — the ONE rule that bites

Inputs and outputs are identified by **two DIFFERENT mechanisms**.  This is the
single most common source of "why is my product mislabelled?" — learn it once.

* **Inputs — by NAME.**  `in feed;` or `inputs ( hot cold );` name the streams the
  unit CONSUMES.  Which physical role each plays is either the unit's own
  convention (a `heatExchanger` reads `tubeStream` to say which named inlet is in
  the tubes; a `distillationColumn` reads a `feeds ( { stream feed1; stage 10; }
  ... )` block to place each named feed at a stage) or, for a two-inlet unit with a
  symmetric role, positional.  The point: an input is wired by the name you gave it.

* **Outputs — by POSITION.**  `outputs ( a b c )` does NOT match by name.  Every
  unit produces its streams in a **FIXED internal order** (its `producedStreams()`),
  and `outputs[k]` simply **RENAMES** `producedStreams()[k]` to your label.  The
  engine does literally this:

  ```cpp
  for (k = 0; k < outputs.size(); ++k) { s = produced[k]; s.name = outputs[k]; }
  ```

  So the ORDER of your `outputs` list must match the unit's emission order:

  | unit | `producedStreams()` order |
  |---|---|
  | `isothermalFlash` / `flash` (VL) | **`liquid`, `vapor`** |
  | `isothermalFlash` in LL mode (the decanter) | `liquid_alpha`, `liquid_beta` |
  | `isothermalFlash` in VLLE mode | `vapor`, `liquid_alpha`, `liquid_beta` — note the vapour moves FIRST here |
  | `extractor` | `extract`, `raffinate` |
  | `crystalliser` | `crystals`, `motherLiquor` |
  | `cyclone` | `cleanGas`, `capturedSolids` |
  | `distillationColumn` | `distillate`, `bottoms`, then side draws by **ascending stage** (on one stage: liquid draw before vapour draw) |

  This table was WRONG once — until 2026-08-23 the flash row said `vapor,
  liquid`, and two independent LLM-authored cases shipped with exit 0 and the
  phase labels silently swapped (the vf column of the run's own stream table
  is what exposed it).  Each row above is now transcribed from the emitting
  code itself.  If a run's `vf` disagrees with your label, trust the vf and
  swap your `outputs` — and please report the row.

  Example — a 4-way column `outputs ( distillate bottoms drawC4 drawC5 )` with
  side draws declared at stage 13 then 23: `drawC4` (position 2) binds to the
  stage-13 draw, `drawC5` (position 3) to the stage-23 draw.  Swap the two names
  and the labels stick to the WRONG physical stream — **the engine does not warn**
  (the counts still match).  The only guard is arity: declaring MORE names than the
  unit produces is a loud error (`produced N streams but M names declared`); you may
  declare FEWER (a trailing product you don't wire is dropped).

Rule of thumb: to know a unit's output order, read its `producedStreams()` in the
source (glass-box) or the per-op entry in `unit-ops.md`.  Never assume the name you
wrote selects the stream — position does.

## `heatExchanger` model slot: `epsNTU` (default) vs `geometry`

The two-stream `heatExchanger` accepts a `model` selector (the slot right
after `type`):

* **`model epsNTU;`** (the default — omit `model` entirely): the classic
  RATING form.  `operation` supplies `area` and `U` directly; the duty Q and
  the outlet temperatures are RESULTS (eps-NTU).

  ```
  {
      name hx; type heatExchanger;          // model epsNTU is the default
      inputs ( hot cold ); outputs ( hotOut coldOut );
      operation { area 10 m2; U 500 W/m2/K; flow counter; }
  }
  ```

* **`model geometry;`**: U and area are **COMPUTED** from the tube-bundle
  geometry + per-side convective correlations, then fed into the *same*
  unchanged eps-NTU duty.  `operation` then carries:

  | key | req? | meaning |
  |---|---|---|
  | `flow`        | opt | `counter` (default) / `co` |
  | `tubeStream`  | **yes** | which named inlet is inside the tubes (must match an `inputs` name) |
  | `geometry {}` | **yes** | the bundle dimensions (below) |
  | `tubeSide  { model ...; }` | opt | tube correlation, default `Gnielinski` |
  | `shellSide { model ...; }` | opt | shell correlation, default `Kern` |

  The `geometry {}` block:

  ```
  geometry
  {
      tubeID         0.016 m;       // tube inside diameter
      tubeOD         0.019 m;       // tube outside diameter (> tubeID)
      tubeLength     4.88  m;
      nTubes         160;
      passes         1;             // tube passes (default 1)
      shellID        0.387 m;
      baffleSpacing  0.305 m;
      tubePitch      0.025 m;       // centre-to-centre (> tubeOD)
      wallK          50;            // wall k [W/(m.K)]  -- OR:
      // wallMaterial carbonSteel;  // pull k from the material catalogue
  }
  ```

  Correlations available in `tubeSide`/`shellSide`: `DittusBoelter`,
  `Gnielinski` (tube-side default), `Kern` (shell-side default).  Each prints
  Re, Pr, Nu, h, its validity tick/WARN; the unit then prints the
  R_inner/R_wall/R_outer split with the controlling resistance named, and U
  + area as RESULTS.  Supply `wallK` **or** `wallMaterial`, never spec `U`/
  `area` in geometry mode (they are outputs).

### `phaseChanger` (condenser) `model geometry;` — film-condensation HTC

The dome-crossing `phaseChanger` (aliases `condenser` / `boiler`) has a
SEVENTH resolution alongside its six outlet-coordinate specs
(`Q | outletState | outletQuality | superheat | subcool | outletT`): with
`model geometry;` the **duty EMERGES** from the condensing film, the wall and a
coolant, instead of being specified.  A **Nusselt (1916) laminar film**
coefficient is computed on the surface, the wall conducts, and the coolant
film carries the heat away; because the film coefficient itself depends on the
driving `dT_film = Tsat − T_wall`, the unit solves a 1-D energy balance at the
wall (`q_cond == q_cool`, the wall temperature the unknown — a bracketed Newton
in `(T_cool, Tsat)`), then `Q = h_cond · A · dT_film` and the outlet is the
dome-flash at that duty.  A `coolant {}` block selects the **condensation**
branch (below); a `boiling {}` block selects the **pool-boiling** branch
(further below).

`operation` then carries three blocks:

```
operation
{
    geometry
    {
        orientation   horizontalTube;   // horizontalTube | verticalPlate | verticalTube
        tubeOD        0.025 m;           // outside diameter (horiz: also the char length)
        tubeID        0.021 m;           // inside diameter  (or `wallThickness`)
        tubeL         2.0   m;           // tube length (vertical: use `charLength`/height)
        nTubes        24;
        wall          carbonSteel;       // -> k from the material catalogue  -- OR:
        // wallK       50;               // wall k [W/(m.K)] directly
        // plateWidth  1.0 m;            // (verticalPlate only, default 1 m)
    }
    condensation { model NusseltFilm; }  // the only v1 model
    coolant      { T_in 300 K;  h 8000 W/m2/K; }   // cold-side T + film coeff
}
```

Char length is the tube **diameter** for `horizontalTube` (coefficient 0.729)
and the **height** (`charLength`/`tubeL`) for vertical surfaces (coefficient
0.943).  The film properties (rho_l, mu_l, lambda_l, cp_l) are evaluated at the
film temperature T_f = (Tsat+T_wall)/2; `h_fg` and rho_v at Tsat; everything
on the case thermo package (IF97 for water).  The mandatory SEE prints Tsat,
h_fg, the per-iteration wall-T trace, the film h + Re_film + regime (WARN if
the laminar bound binds — wavy/turbulent is v2, never silently clamped), the
coolant side, the three resistances (film / wall / coolant) + which controls,
and the duty as a RESULT with a U·A·ΔT cross-check.  Reference: Nusselt (1916);
Incropera & DeWitt, *Fundamentals of Heat and Mass Transfer*, Ch. 10
(Ex. 10.3 vertical plate, Ex. 10.4 horizontal tube).  Tutorial:
`steady/heat/condenser01_film_nusselt`.

### `phaseChanger` (boiler) `model geometry;` — nucleate pool boiling

Swap the `coolant {}` block for a `boiling {}` + `heatingMedium {}` pair and
the *same* `model geometry;` resolution drives a **pool reboiler**: the duty
EMERGES from the **Rohsenow (1952) nucleate-boiling flux** on a heated surface,
with the **Zuber (1959) critical heat flux (CHF)** as the design ceiling.
Because the nucleate flux is the **cube** of the wall superheat
`dT_excess = T_surface − Tsat`, the unit solves a 1-D energy balance at the
surface (`q_boil == q_heat`, the surface temperature the unknown — a bracketed,
step-capped Newton in `(Tsat, T_medium)`, monotone increasing), then
`Q = q″ · A` and the outlet is the dome-flash at that duty.

```
operation
{
    geometry
    {
        orientation   horizontalTube;   // horizontalTube | verticalPlate | verticalTube
        tubeOD        0.025 m;
        tubeID        0.021 m;           // (or wallThickness)
        tubeL         2.0   m;
        nTubes        8;
        wallK         400;               // copper k [W/(m.K)]  (or `wall <material>;`)
    }
    boiling
    {
        model     Rohsenow;              // nucleate pool boiling (the only v1 model)
        Csf       0.013;                 // surface-fluid constant -- NO DEFAULT
        s         1.0;                   // Prandtl exponent: 1.0 water / 1.7 others
        citation  "Incropera & DeWitt Tab 10.1, water-copper polished";  // MANDATORY
    }
    heatingMedium { T_in 393 K;  h 8000 W/m2/K; }   // hot-side T + film coeff
}
```

**HONESTY-AS-STRUCTURE — the binding rule of the boiling path.** The nucleate
flux is **±100 % uncertain**: `C_sf` is surface-FINISH lab data (polish,
oxidation, wetting), not a fluid property. So the boiling path **refuses to
default**:

* **`Csf` has NO default and NO catalogue in v1** — omit it and the run
  REFUSES (with the remedy + an example value).
* **`citation` is MANDATORY** — omit it and the run REFUSES. The provenance of
  a ±100 % number must be stated.
* The result **carries the `[q/2, 2q]` scatter band** (a ±25 % move in `C_sf`,
  cubed). The indicative flux is never read as a reliable number.
* The **RELIABLE** figure is the Zuber CHF ceiling, printed **FIRST**. A design
  whose flux exceeds CHF is **HARD-REFUSED (burnout)** — a pool boiler cannot
  operate above the critical heat flux; the refusal states by how much and what
  to reduce (dT_excess, area, or heating-medium T).

Boiling film properties (`mu_l`, `lambda_l`, `cp_l`, `rho_l`, `rho_v`, `h_fg`,
`sigma`) are evaluated at `Tsat` on the case thermo package (IF97 for water,
incl. `sigma` via IAPWS R1-76). The mandatory SEE leads with the CHF ceiling,
spells out the wall superheat `dT_excess` (never reusing the condensation
`dT_film` label), calls out the cube, prints the scatter band, the per-iteration
surface-T trace, and `q/q_CHF` with a `SAFE`/`BURNOUT` tag. References: Rohsenow
(1952); Zuber (1959); Incropera & DeWitt, *Fundamentals of Heat and Mass
Transfer*, Ch. 10 (Table 10.1 `C_sf`, the nucleate worked example, the CHF
anchor). Tutorial: `steady/heat/reboiler_water_copper`. **Not in v1:** film
boiling (Bromley), flow boiling (Chen), any `C_sf` default or catalogue.

## The `thermoPhysPropDict` record grammar

`constant/thermoPhysPropDict` is a typed RECORD — the file IS the case's
whole thermophysical system, inline and self-contained (there is no selector
into a shared catalogue; each case carries its own declaration).  The record
keys:

```
recordType     thermophysicalPropertySystem;   // typed record marker
schemaVersion  2;

components     ( water CO2 );

equilibrium
{
    formulation diluteSolution;     // the VLE world: gammaPhi |
                                    //   diluteSolution | phiPhi |
                                    //   electrolyteGammaPhi
    liquid
    {
        solvent { component water;   standardState pureLiquid; }
        solutes { components ( CO2 ); standardState infiniteDilution;
                  solutionModel henryDilute;
                  binaryParameters                     // DECLARED files,
                  {                                    //   verified at
                      CO2-water                        //   assembly (refuse
                      { source "data/standards/parameters/Henry/CO2-water.dat"; }
                  } }                                  //   if missing)
    }
    vapour { fugacityModel idealGas; }
}

// caloric {} (energy routes) and transport {} (mu/k/D/sigma) are the other
// top-level slots — see thermo.md for every formulation's shape.
```

Semantics, worked examples and the four-formulations table:
[`thermo.md`](thermo.md) → "The formulations".

## Per-unit `thermo {}` override

A unit may carry an optional `thermo {... }` block that REPLACES the
global system's models for that unit only (components stay global):

```
{ name turbine; type turbine;  in feed;  outputs (expanded );
  operation { W_shaft -3 kW; eta 0.8; }
  thermo    { equationOfState { model SRK; } } }     // real gas here only
```

A stream crossing from a unit with model X into one with model Y is
**re-interpreted at the boundary**: (T,P,z) are held and each unit recomputes
its own enthalpy, so `H` STEPS at the boundary — visibly, in the printed
enthalpy.  That step is the two models disagreeing on `H(T,P,z)`; it is
information, not a bug.  `H` is the conserved truth, `T` is the
model-dependent readout — the solver never silently nudges `T` to paper over
the step.  Default is ONE consistent global model; the override is a
deliberate advanced act.  See [`energy.md`](energy.md) §7 (model boundaries).

Per-UNIT thermo is the fifth legal axis of the ratified heterogeneous-thermo
grammar — models per PHASE, conventions per GROUP, correlations per
COMPONENT, parameters per PAIR, **packages per UNIT** — and the model
boundary it creates is auditable (the opt-in model-boundary AUDIT prints
`ΔH = H_down − H_up` at fixed (T,P,z) into the first-law ledger).

## Pinning the phase of an inlet — `vaporFraction` and `phase`

**The phase is normally a CONSEQUENCE, not a declaration.**  A stream of known
composition is fixed by exactly two variables (Duhem's theorem): give `(T, P, z)`
and the phase (vf) is determined — you read it off, you don't type it.  Declaring
`T`, `P` AND `vf` together is over-specification (three numbers on a two-variable
state).  Prefer declaring only `(T, P, z)`.

**When you DO pin the phase** (the two legitimate cases — never a decorative
`vaporFraction 1`):

* `vaporFraction 0.25;` — a **two-phase split** on the saturation manifold, where
  `T` and `P` are *not* independent so the split is a genuine free variable.
* `phase gas;` (or `phase liquid;`) — a **phase-intent boundary**: "this feed enters
  as a gas".  Needed when the cheap screen cannot recover the phase — Choupo marks a
  stream a permanent gas only when `T` exceeds *every* present component's critical
  temperature `Tc` (Vítor's rule: you can only speak of *vapour* below `Tc`).  A gas
  mixture holding a sub-critical species — steam in a water-gas-shift feed, `T` below
  water's `Tc` — is all-vapour but the screen can't prove it, so you say `phase gas;`.

The reader stores only these pins; the *permanent-gas* case (hot air, combustion gas)
carries **nothing** — the engine's `Tc` screen recovers `vf = 1` on its own.

The two pins are keys of the stream's own `0/<stream>` file, beside the material
block:

```
// 0/chest1
componentMolarFlows { water 277.6 kmol/h; }
T               393.36 K;
P               200 kPa;
vaporFraction   1.0;
category        LP_steam_200kPa;      // for utility aggregation
```

**There is no `state <word>;` key on a stream, and no `vf` spelling.**  A
`state saturatedVapour;` spec (with its parse-time Antoine inversion) and the
short spelling `vf` were both readers of the **retired** `flowsheetDict
streams {}` block; that block is refused loudly since the stream-state
migration of 2026-07-10, and its two solvers (`invertPsat`,
`solveStateForVf`) were deleted with it — one home, no dual reader.  Write
the saturation temperature you mean, or let a `phaseChanger` produce it.  The
four words `saturatedVapour` / `saturatedLiquid` / `subcooledLiquid` /
`superheatedVapour` are still live, but as `phaseChanger`'s **`outletState`**
— a unit-operation specification, not a stream one.  (Should a saturated-state
inlet spec ever return, it returns through the `0/` grammar, where the code is
not that code.)

## Stream `category` for utility aggregation

A `0/<stream>` file may carry `category <word>;`.  At end of solve, the
simulator sums F (kmol/s) and mass flow (kg/s) by category and emits
the totals on `SimulationResult.utilities` + `reports/utilities/consumption.csv`
— so a triple-effect cascade reports total `LP_steam_170kPa` even
though three different stream names feed the three chests.

## `utility <name>;` — the catalogue is read by a unit PORT, not by a stream

`data/standards/utilities/<name>.dat` carries a service's `components`,
`state`, `P`, `T_in`, `T_out`, `dutyPerKg` (J/kg delivered) and `cost`
(€/GJ).  **Nine** utilities ship: `steamLP` / `steamMP` / `steamHP`,
`coolingWater`, `chilledWater`, `dowthermA`, `hitecSalt`,
`refrigerationPG`, `electricity` (`ls data/standards/utilities/` is the
authority — this list is a convenience, not a second home for the count).

The key is declared **on a unit's port**, where it says which service pays
for that port's duty; the allocation report and the costing chain read it
there.  It is **not** a stream key and it expands no stream fields — a
utility loop is written as ordinary streams in `0/`, with `category` tying
them to the service.  See `tutorials/steady/utilities/utility01_dowtherm_preheat`
for the worked shape.

## Tear seeds, and the convergence aids a stream does NOT carry

**A stream has no `bounds {}` block.**  A cage on a tear iterate (absolute or
frozen-reference limits on `F` / `T`) was designed and is described in the
solver-aid literature of this project, but **no reader for it exists in the
engine** — do not write one into a case expecting it to bind.  What is live is
the announcement side of the same credo: auto-init, equipment ratings and
similar aids report aloud when they act (see below), and the seed itself is
authored, never invented.

**Tear seeds are authored `0/` files; `solverDict tearStreams` only NAMES
them.**  The split of responsibilities: `tearStreams ( recycle );` in
`solverDict` declares WHICH streams are torn (a numerical-strategy choice),
while the seed VALUES live in the stream's own `0/<stream>` file like every
other stream state.  A tear named in `tearStreams` MUST have its `0/` file
(completeness is fatal before the solve), and `bin/choupo-init0` refuses to
invent one — the seed is the author's.  (The old `streams {}` reader, which
could auto-seed a missing tear from the feed aggregate, was REMOVED in the
`0/` migration; there is no auto-seed path any more.)

**Equipment ratings.**  A `spiralWoundModule` (membrane) WARNs if the feed
P/T exceeds the element's catalogue `P_max`/`T_max`; vessel sizing WARNs (no
longer aborts) if the design pressure exceeds the material rating.  These are
WARN-only — a rating never clamps a stream.

Auto-init and ratings are emitted in the result JSON (`advisories`) and
surfaced by the GUI (an amber run-complete toast + a list in the Streams
summary band), not just printed to the log — alongside the durable caveat
surface (extrapolations, unverified records, estimates), which is replayed
once, grouped, at the end of every run.

## estimateComponent: the `derived {}` closure block

The estimate is a visible chain: `groups → constants → omega(Tb,Tc,Pc) →
Psat(Tc,Pc,omega) → Vliq(Tc,Pc,omega)`.  Each closure is a named, selectable
method; omitting the block keeps the honest defaults (announced on console):

```
derived
{
    omega   LeeKesler;        // only method today
    Psat    AmbroseWalton;    // or `none` — refuses the fill, proposal carries a loud GAP
    Vliq    Rackett;          // or `none`
}
```

`validation { ... }` is the proper name of the compare-only reference block
(`reference` stays accepted as the legacy alias — it never feeds the estimate).

## Optimisation: `method sqp` + the `constraints {}` block (outerDict)

The `optimization` outer driver minimises (or maximises) a scalar objective
over design variables.  Two methods:

* `method nelderMead;` — derivative-free simplex, **unconstrained** (box
  bounds only, by clipping).  The default.
* `method sqp;` — hand-rolled line-search **Sequential Quadratic
  Programming** (damped-BFGS on the Lagrangian, L1 merit, active-set convex
  QP; Nocedal & Wright Ch.18 / 16.5).  Adds nonlinear **constraints**.

Only `sqp` accepts a `constraints (...)` list (asking Nelder-Mead for
constraints is a loud error — add a penalty term or switch method):

```
type    optimization;
method  sqp;

variables
(
    { path variables.P_feed;  min 10 bar;  max 30 bar;  initial 14 bar; }
    { path variables.nMods;   min 3;       max 9;       initial 5;      }
);

objective
{
    kind   kpi;                       // kpi | stream | cost | costTotal
    path   vessel.water_recovery;
    sense  maximise;                  // minimise (default) | maximise
}

constraints
(
    { kpi vessel.maxSI_gypsum_wall;   atMost  0.0;            }
    { kpi vessel.maxSI_calcite_wall;  atMost  0.0;            }
    { kpi column.recovery;            atLeast 0.99;           }
    { kpi column.purity;              equals  0.75;  tol 1e-4; }
);

options
{
    maxIter  40;
    fdStep   1e-3;                    // relative FD step (default 1e-5)
    fdMode   central;                 // forward (n+1 sim/iter, default) | central (2n)
}
```

* The keywords are **`atLeast` / `atMost` / `equals`** — deliberately NOT
  `min`/`max` (those collide with the objective `sense minimise`).  Each
  constraint carries exactly one of the three.
* The RHS is **unit-aware** (canonical SI, same as a DesignSpec target — e.g.
  `atMost 1.5 bar;`).  `equals` takes an optional `tol` (default `1e-4`) that
  scales the equality residual.
* `kpi <path>` is the same dotted resolver used everywhere — `unit.kpi` or
  `stream.{F|F_mass|T|P|vf}`.
* **Variable scaling is automatic and announced** (`xs = x / s`): variables
  spanning orders of magnitude (feed pressure ~1e6 Pa vs a module count ~5)
  are solved in scaled coordinates so the QP stays well-conditioned.
* The run prints a **glass-box trace** per iteration — objective, KKT
  residuals, the active set, the **Lagrange multipliers (shadow prices)**, the
  merit penalty `mu`, the BFGS damping `theta`, and the Armijo `alpha` — and
  ends with the 5-line **KKT certificate** (stationarity, primal feasibility
  ×2, complementarity, dual feasibility).
* A **sim-noise-floor probe** at start-up evaluates `F(x0)` twice and prints
  the repeatability; an **infeasible start** is reported honestly (SQP drives
  toward feasibility — it does not silently guess a feasible point).
* v1 limits (deliberate): FD gradients only (no analytic sensitivities); the
  watchdog is the only Maratos mitigation; no feasibility restoration (an
  infeasible start that cannot recover is reported, not patched).

## Where solver options live — the four homes are LEVELS, not scatter

Numerical options deliberately live in FOUR places, one per configuration
LEVEL (Vítor's 2026-08-02 ruling: the levels are intentional and must be
explicit; what must NOT exist is a solver option ignored in silence):

| home | level | carries |
|---|---|---|
| `system/solverDict` | steady FLOWSHEET numerics (choupoSolve only) | per-unit-TYPE subdicts merged into each unit; `tearStreams (…)`; recycle-driver scalars (`recycleSolver`, tolerances) |
| unit `solver {}` (inside its flowsheetDict entry) | per-UNIT integrator choice (batch vessel units) | `integrator`, `rtol`, per-unit `verbosity` |
| `controlDict` `timeStepping` / `timeSteppingControl {}` | TIME control of the transient binaries (choupoBatch/choupoCtrl) | `adaptive;` + `rtol/atol/deltaT0/deltaTmax/maxGrowth` |
| `fixedBedAdsorber` sub-stepping | that unit's own inner discretisation | reads BOTH its `solver{rtol}` and controlDict timing |

The anti-silence contract (gate `check_solverdict_lint`, all four
binaries): a `system/solverDict` in a batch/ctrl/props case is announced
by name with its cost stated ("every value in it had NO effect"), and a
transient `timeStepping`/`timeSteppingControl` in a steady case is
announced by choupoSolve the same way.  Announced, never refused — the
unread-keys posture.  Consolidation of the homes stays open ONLY if this
table proves unteachable (DEV.md §4b decision 3).

## `networkScope restricted` — a deliberately smaller speciation network

By default a speciation run activates every curated chemistry record
reachable from the feed (`networkScope full`).  A case whose physics
DEMANDS a reduced network — e.g. an HMW Pitzer verification whose θ/ψ
were fitted to a non-pairing treatment, so admitting the sulfate ion
pairs would double-count — declares it, in the props `speciate` op or in
`equilibrium { aqueous { speciation {} } }`:

```
networkScope restricted;
network      ( water-dissociation );   // admitted chemistry records, by file stem
reason       "HMW theta/psi were fitted to a NON-pairing major-ion treatment; ...";
```

Rules (each refusal exists because its absence produces a wrong answer):
`restricted` requires a non-empty `network` AND a non-empty `reason`; every
admitted name must match a loaded chemistry record AND be reachable from
the feed; `full` alongside a `network` list refuses (two authorities).
The run announces the restriction and quotes the reason; results carry a
`networkRestricted` label; `bin/choupo-import` seals exactly the admitted
records, so a re-import can never silently un-restrict the physics.  The
reduced network passes the same charge/stoichiometry verification as the
full one.  Reference: `tutorials/props/electrolyte/pitzer_seawater_verify`;
gate `check_restricted_network`.  (The old `constant/electrolyte/`
sidecar is fully retired.)
