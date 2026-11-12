# Pack: reactors and kinetics

budget: 2800 words (~4480 tokens)

Read this when the design has a reaction.  Read the brief (`docs/ai/brief.md`) first.

## 1. Which reactor

| You know | Use | Engine computes |
|---|---|---|
| per-pass conversion (catalyst data, a plant spec, a recycle design) | `conversionReactor` | outlet by stoichiometry, duty |
| which reactions occur, and T, P are high/long enough for equilibrium | `equilibriumReactor` (`REquil`) | extents, Kp, duty |
| only the atoms and the species list | `gibbsReactor` | equilibrium composition (every pathway the species list allows) |
| a rate law and a volume | `pfr` (tube) or `cstr` (stirred) | conversion, T(V) if non-isothermal |

First design: start with `conversionReactor` (conversion = your spec), then check
with `equilibriumReactor` that the conversion is BELOW equilibrium.  Equilibrium is a
ceiling: no catalyst or volume exceeds it for a reversible reaction.  Use `pfr`/`cstr`
only when you have a rate law you can defend (a source, or declared "illustrative").
Rule: every reacting species needs `standardThermochemistry` in its component record
(all the catalogue's small molecules do; check).  The heat of reaction is computed
from it.  NEVER write `dH_rxn`: the steady reactors ignore it.

Ports (all four types): `in feed;` `outputs ( product );` (gibbsReactor may need a
second output for a condensate, see §2.4).  Reactor outlet is its own equilibrium
state: its vapour fraction is resolved at its own T, P, z; a `phase gas;` on the FEED
is not carried to the product.

## 2. The units

### 2.0 constant/reactions (shared grammar)

```
<reactionName>
{
    stoichiometry
    (
        { component ethane;   nu -1;  order 1; }   // reactant nu<0; order only for kinetics
        { component ethylene; nu  1; }
    );
    limitingReactant ethane;      // conversionReactor, single-reaction cstr/pfr: required
    kinetics { ... }              // pfr/cstr only (§2.3)
    // temperatureApproach 20 K;  // equilibriumReactor only, per reaction (§2.2)
}
```
Name every reaction; units select it with `reaction <name>;` (one) or
`reactions ( r1 r2 );` (many).  Balance the equation (atoms) before you write it;
the mass and element balance reports will show a bad one.
Kinetic `order` on a reactant is REQUIRED for Arrhenius/LHHW laws; if missing:
`reactant 'X' has nu = -1 but declares no `order`` (thermo/reaction/Reaction.cpp:254).

### 2.1 conversionReactor

```
{ name R; type conversionReactor; in feed; outputs ( product );
  reaction cracking;                          // or reactions ( r1 r2 );
  operation { conversion 0.60; T 1100 K; } }
```
- `conversion` 0..1 of `limitingReactant` (required; else refused,
  ConversionReactor.cpp:215-218).  `T` optional: outlet T, default = feed T.
- MANY reactions: `operation { T ..; conversions ( { reaction r1; conversion 0.6; }
  { reaction r2; extent 0.04; } ); }` plus `reactions ( r1 r2 );`.  `extent` is kmol/s.
  Each conversion is of the FEED's limiting reactant (parallel network); selectivity is your spec.
- Computed: outlet flows `n_out = n_in + nu*extent`; KPIs `extent_kmol_h`,
  `dHrxn_kJ_per_mol`, `Q_kW` (= H_out - H_in), `Q_reaction_kW`, `Q_sensible_kW`.
- DOF: 1 per reaction (you fix the conversion).  The outlet T is yours.
- Refusals: limiting reactant with nu >= 0 ("has non-negative nu -- it must be a
  reactant (nu < 0)", :213); more conversion than the other reactants allow
  ("outlet moles of 'X' went negative", :232).

### 2.2 equilibriumReactor (alias REquil)

```
{ name R; type equilibriumReactor; in feed; outputs ( product );
  reactions ( r1 r2 );
  operation { T 1100 K; temperatureApproach 25 K; } }   // both optional
```
- You declare WHICH reactions equilibrate (stoichiometry only; no kinetics).
  A reaction left out is one you say is too slow.  A complete independent set
  reproduces `gibbsReactor`.
- `T` optional (default feed T), isothermal.  `P` is the feed's.  Ideal gas phase
  unless the package is a cubic EoS (then fugacity coefficients enter).
- Kp(T) = exp(-dG/RT) from `standardThermochemistry`; solved with the extents unknown.
- `temperatureApproach` (K, a MAGNITUDE >= 0, global or per reaction):
  evaluates Kp at T +/- dT while the reactor stays at T; the engine picks the sign
  (exothermic: T+dT, endothermic: T-dT) and announces it.  Negative: refused
  ("must be a MAGNITUDE (>= 0 K)", EquilibriumReactor.cpp:148).  Empirical; do not
  use it to repair a missing fugacity correction.
- KPIs: `Kp_<name>`, `extent_<name>_kmol_h`, `conversion_<name>`, `Q_kW`,
  `newtonResidual`.  No adiabatic mode and no liquid phase: a condensing outlet is
  refused, naming `gibbsReactor`.
- DOF: 0 beyond T.  A species with no formation data cannot enter.

### 2.3 pfr and cstr (kinetics)

```
{ name R; type pfr; in feed; outputs ( product );
  reactions ( cracking );                      // ONE element is fine; the general path
  operation { V_R 0.15; nSteps 100; thermalMode adiabatic; } }
```
- `operation.V_R` (m3, required).  `pfr`: `nSteps` (RK4, default 100).
  Isothermal pfr runs at the FEED's T (no `T` key).  `cstr` isothermal accepts
  `operation.T` (the reactor T, else feed T); it is refused under adiabatic/heatExchange.
- Two paths: `reaction <name>;` (single, isothermal, `Arrhenius` only; any other
  law there is refused and points you to the list form) and `reactions ( .. );` (any
  law, any thermalMode, selectivity networks).  PREFER THE LIST FORM.
- `thermalMode`: `isothermal` (default; duty `Q_kW` is a result) | `adiabatic`
  (T_out is a result, `Q_kW` = 0; KPIs `T_out`, `T_max`, `dT_rise`) |
  `heatExchange` — `cstr`: `UA` (W/K), `T_coolant` (K); `pfr`: `U` (W/m2/K),
  `areaPerVolume` (m2/m3), `T_coolant` (K).  `cstr` also `T_guess` (K): picks the
  steady state when there are several (it prints all roots).
  Anything else: refused (`thermalMode must be isothermal, adiabatic or heatExchange`,
  PFR.cpp:597).  Non-isothermal needs `standardThermochemistry` on every reacting
  species (refused: "needs the heat of reaction ...", PFR.cpp:641).
- `catalystLoading` (kg/m3 of reactor, optional): converts a rate constant given per
  gram of dry catalyst: r_vol = 1000 * loading * r_per_g.  It is a unit conversion only;
  the pellet is a point (effectiveness factor taken as 1, announced).
- Rate-law families (`kinetics { type ..; }` inside the reaction), all through
  one factory:
  - `Arrhenius`: `A`, `Ea` (J/mol).  r = A exp(-Ea/RT) * prod(c_i^order_i).
    Concentration is c_i = F_i/Q with Q = F * sum(z_i * Vliq_i): a LIQUID-BASIS
    concentration in mol/m3 (`Vliq` of the component record; error if <= 0).  So A has units
    (mol/m3)^(1-sum order)/s, and a first-order law is 1/s.  Optional reverse:
    `reversible true;` (detailed balance, only if sum(nu)=0) OR `A_rev`/`Ea_rev`
    (+ `orderRev` per species); both together are refused.  `basis activity;` uses
    gamma_i x_i instead of c_i.
  - `LHHW`: Arrhenius plus an `adsorption { exponent n; vacantSite v; species ( {
    component X; K0 ..; B ..; } ); }` denominator; needs the block.
  - `expression`: you write the law (§2.3.1).  Use it for any GAS-phase bed.
  Law not one of the three: refused with the list of accepted words.
- THE GAS TRAP: `Arrhenius`/`LHHW` concentrations come from the LIQUID molar volume, not
  from P, T and the ideal-gas law, and ignore the change in moles.  For a gas
  reaction write the law as `type expression` in T, P and partial pressures
  (`p[i]` = x_i P), which reads no Vliq.  `conversionReactor` also needs none.
- KPIs: `V_R`, `T_out`, `Q_kW` (isothermal), `X_<reactant>` (expression pfr), `tau_s`
  (liquid basis), `Da_kTau` (cstr), `y_<product>_out`.  Axial T(V) profile for non-isothermal pfr.

#### 2.3.1 `type expression`

```
kinetics
{
    type    expression;
    source  "who the numbers come from, or: author-set illustrative";   // REQUIRED
    basis   reactorVolume;       // or catalystMass (then the reactor needs catalystLoading)
    rateOf  extent;              // or a component name (its net formation rate)
    parameters  { k0 1e14 -; E 273 kJ/mol; sec 1 s; }     // EVERY value has a unit; `-` = pure number
    definitions { k "k0*exp(-E/(Rg*T))/sec"; }            // in dependency order
    rate    "k * c0 * p[ethane]/Pref";                    // dimensions must equal the basis
}
```
- Symbols: `T` (K), `P` (Pa), `x[i]`, `p[i]` (Pa), `c[i]` (kmol/m3, liquid basis),
  functions `exp ln log10 sqrt pow min max`.  No `order`/`reversible` keys in the
  stoichiometry (refused).  Optional `forward`/`reverse` instead of `rate`;
  `validity`, `tables`, `rateConstant`.
- Rate unit is kmol/(m3 s) here (Arrhenius/LHHW use mol).  Units available include
  `kmol/m3`, `kmol/m3/s`, `kJ/mol`, `cal/mol/K`, `bar`, `K`, `s`.
  A rate constant in 1/s: declare it dimensionless `-` and divide by a parameter
  `sec 1 s;` (the dimension check then works in every build).
- ALL amounts are kmol: a gas constant for turning p into a concentration would
  have to be 8314 J/(kmol K).  Avoid it: use the ideal-gas concentration at a
  reference state as a parameter, `c0 = 0.044032 kmol/m3` (1 bar, 273.15 K), and
  write c = c0 (p/Pref)(Tn/T), as in the example.
- A dimension mismatch, an unknown symbol or a missing `source` refuses by name.

### 2.4 gibbsReactor

```
{ name R; type gibbsReactor; in feed; outputs ( product );     // + a 2nd name for a condensate
  operation
  {
      T 800 K; P 1 bar;                         // required (T is a SEED when mode adiabatic)
      mode isothermal;                          // or adiabatic; optional Q (J per mol of feed)
      elements ( C H O );
      species ( { name CO; atoms ( 1 0 1 ); } { name water; atoms ( 0 2 1 ); }
                { name CO2; atoms ( 1 0 2 ); }  { name H2;   atoms ( 0 2 0 ); } );
      // temperatureApproach 20 K;              // optional magnitude, as §2.2
  } }
```
- `model` (after `type`): `elementPotential` (default; gas + one ideal condensable),
  `reactiveFlash`, `directMin`.  Atom counts follow the `elements` order.
- Computed: composition minimizing G subject to atom balance; KPIs `T`, `y_<species>`,
  `Q_kW`, `lambda_<element>`, `iterations`.  No reaction list, so all pathways
  among the species run (a methanation not wanted? omit CH4 from `species`).
- Refusals: `need more species than elements`; species without
  `standardThermochemistry`; a liquid forms and only one output is declared
  ("a LIQUID formed ... Declare `outputs ( <gas> <condensate> );`").
  `approachTemperature` is retired: use `temperatureApproach`.

## 3. Design guidance (do this by hand before running)

1. Heat of reaction: dH = sum(nu_i * dHf_i) from the component records (kJ/mol of
   extent).  Exo/endo decides the temperature profile.
2. Adiabatic temperature change, one reaction on a feed with limiting-reactant
   flow `n_A` and mean molar heat capacity `Cp_mix` (J/mol/K, per mol total feed):
   `dT = X * y_A * (-dH) / Cp_mix`.  Endothermic cracking at 1300 K, X = 40 %, dH = +144 kJ/mol:
   drop of ~455 K (run below).  If |dT| is hundreds of K, an adiabatic single bed
   is not a design: use a jacketed tube (`heatExchange`), staged beds, or dilute
   with steam/inert.
3. Equilibrium caps conversion: Kp = exp(-dG/RT).  Higher T favours endothermic
   reactions, lower T exothermic ones; for dn > 0 (more moles out) low P helps; for
   dn < 0 high P helps.  Always compute the equilibrium conversion
   (`equilibriumReactor`) before asserting a per-pass conversion.
4. Choose conversion/kinetics/equilibrium by data: have a rate law -> pfr/cstr;
   have catalyst per-pass data -> conversionReactor; neither and fast reaction at
   high T -> equilibriumReactor (maybe with `temperatureApproach` 10-50 K, labelled
   as an assumption).
5. Residence time: tau = V / Q_actual.  For a first-order law, X = 1 - exp(-k tau) for a
   PFR with no mole change; a CSTR gives X = k tau / (1 + k tau).  PFR beats CSTR for
   positive-order laws and for series networks (intermediate product).
6. Gas reactors: typical per-pass conversions 20-80 %; recycle the rest (see recycles pack).
   Put inerts and the heat carrier in the feed deliberately.
7. State in DESIGN.md which Ea/A are illustrative; a rate with no source is an
   assumption, not a datum.

## 4. Worked example (written for this pack; run before inclusion)

Ethane cracking, C2H6 -> C2H4 + H2, 100 kmol/h, 1.5 bar.  Shared files:

`system/controlDict`
```
application   choupoSolve;
description   "Ethane cracking to ethylene";
verbosity     3;
reports { massBalance { } elementBalance { } energyBalance { } }
```
`constant/thermoPhysPropDict`
```
recordType    thermophysicalPropertySystem;
schemaVersion 2;
components    ( ethane ethylene H2 );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
```
`0/feed` (and `0/product` is written by `bin/choupo-init0`):
```
componentMolarFlows { ethane 100 kmol/h; }
T 1100 K;
P 1.5 bar;
phase gas;
```

A. Conversion reactor (feed at 1000 K in the run, operating T 1100 K):

`constant/reactions`
```
cracking
{
    stoichiometry
    (
        { component ethane;    nu -1; }
        { component ethylene;  nu  1; }
        { component H2;        nu  1; }
    );
    limitingReactant ethane;
}
```
`system/flowsheetDict`
```
units
(
    {
        name      crack;
        type      conversionReactor;
        in        feed;
        outputs   ( product );
        reaction  cracking;
        operation { conversion 0.60; T 1100 K; }
    }
);
```
Result: product 160 kmol/h (ethane 0.25, ethylene 0.375, H2 0.375), Q = 2757 kW,
dHrxn = +144.4 kJ/mol, mass/element closure 100.000 % / 0.0000 %, energy residual 0.

B. Same duty by kinetics, isothermal pfr.  Replace `constant/reactions` and the unit:

`constant/reactions`
```
cracking
{
    stoichiometry
    (
        { component ethane;    nu -1; }
        { component ethylene;  nu  1; }
        { component H2;        nu  1; }
    );
    limitingReactant ethane;
    kinetics
    {
        type    expression;
        source  "author-set illustrative first-order law in ethane, not a measured rate";
        basis   reactorVolume;
        rateOf  extent;
        parameters
        {
            k0    1.0e14     -;            // pre-exponential factor, 1/s (see `sec`)
            E     273        kJ/mol;
            Rg    1.987      cal/mol/K;    // only inside exp(-E/(Rg T))
            sec   1          s;            // turns the dimensionless k0 into 1/s
            c0    0.044032   kmol/m3;      // ideal-gas concentration at 1 bar, 273.15 K
            Pref  1          bar;
            Tn    273.15     K;
        }
        definitions
        {
            k    "k0*exp(-E/(Rg*T))/sec";       // 1/s
            cEt  "c0*(p[ethane]/Pref)*(Tn/T)";  // kmol/m3 of ethane, ideal gas
        }
        rate    "k * cEt";                      // kmol/(m3 s) of reactor
    }
}
```
`system/flowsheetDict`
```
units
(
    {
        name      crack;
        type      pfr;
        in        feed;
        outputs   ( product );
        reactions ( cracking );
        operation { V_R 0.15; nSteps 100; thermalMode isothermal; }
    }
);
```
Hand check: k(1100 K) = 1e14 exp(-273000/(8.314*1100)) = 10.8 1/s; Q = F R T/P = 1.69 m3/s;
tau = 0.15/1.69 = 0.089 s; 1 - exp(-k tau) = 62 %; the run gives 52.4 % (the gas expands, so tau
shrinks).  Result: product 152.4 kmol/h, X(ethane) 52.39 %, duty 2102 kW, closures 100 %.

C. Adiabatic: set `thermalMode adiabatic;` and the feed `T 1300 K;`.  Result: T_out 844 K
(drop 456 K), X = 40.1 %, Q = 0.  (Endothermic: the bed quenches itself.)

D. Equilibrium ceiling at 1100 K, 1.5 bar: unit `type equilibriumReactor; reactions ( cracking );
operation { T 1100 K; }`.  Result: Kp = 1.735, conversion 73.2 % (product 173.2 kmol/h).  The
kinetic 52 % is below it; the irreversible law has no knowledge of this ceiling, so a larger
`V_R` would exceed it: read the equilibrium run before sizing V_R.

## 5. Common mistakes

- Arrhenius on a gas: concentrations are liquid-basis; use `expression` with partial pressures.
- Forgetting `order` on a reactant (refused) or writing a reverse leg and `reversible true` together.
- Unbalanced stoichiometry: element balance report shows non-zero.
- A temperature key on an adiabatic cstr: refused.
- Treating `temperatureApproach` as a fitting knob.

<!-- RUN: CHOUPO_HOME=/home/vitor/Choupo /home/vitor/Choupo/bin/choupo-init0 <case> ; /home/vitor/Choupo/choupoSolve <case>
     cases in scratch: crack_conv (A), crack_pfr (B), crack_adi (C), crack_eq (D); all exit 0, mass 100.000 %, element 0.0000 %,
     global energy residual 0.0000 kW.  Binary of the primary checkout (predates unit `1/s` and `J/mol/K`: example avoids both).
     SOURCES (src file:line READ at):
 conversionReactor: feed/operation keys src/unitOperations/reactor/ConversionReactor.cpp:171-215 (conversion 215-218, limitingReactant 209-213,
   T 180, multi: conversions list 402-433, extent 417, reactions 384-396), KPIs 314-324.
 equilibriumReactor: EquilibriumReactor.cpp:59-62 (T default feed), 103-117 (reactions), 159-173 (temperatureApproach global/per reaction), 145-150 (negative refused).
 gibbsReactor: GibbsReactor.cpp:173-185 (T,P required; mode isothermal|adiabatic; Q), 197 (approachTemperature retired),
   221 (model default elementPotential), 225-253 (elements, species, atoms, standardThermochemistry required), 227-232 (empty/more species), 337 (temperatureApproach),
   655-676 (condensate output), KPIs 691-760.
 cstr: CSTR.cpp:108-110 (T, V_R), 166 (operation T), 177-201 (single path; Arrhenius only 192), 229 (catalystLoading), 561-586 (thermalMode, UA, T_coolant, T_guess, T refused non-isothermal),
   693 (conc mol/m3), KPIs 444-449, 457-464.
 pfr: PFR.cpp:100-105 (F,T,nSteps), 154-168 (single path Arrhenius only), 216/616 (catalystLoading), 597-613 (thermalMode), 629-647 (needs standardThermochemistry),
   660-672 (Vliq basis, Q = F * sum z Vliq), 734/893 (mol basis), 1844-1846 (U, areaPerVolume, T_coolant), KPIs 1168-1220.
 rate laws: thermo/reaction/RateLaw.cpp:40-130 (Arrhenius/LHHW keys, basis concentration|activity, A_rev, reversible, adsorption), 135-170 (net rate);
   Reaction.cpp:45 (A exp(-Ea/RT)), 245-275 (order required), 202-237 (detailed balance refusal);
   ExpressionRate.cpp:112-166 (no order/reversible; source, basis, rateOf required), 202-215 (parameters), 287-293 (definitions), 374-385 (rate/forward/reverse), 431 (rateConstant), 460 (validity).
 expression symbols/units: docs/ai/unit-ops.md section "A RATE LAW WRITTEN IN THE CASE" cross-checked by the run; unit table src/core/Units.cpp:265-287.
 ports/in/outputs: the brief; flowsheet usage in the four run cases.
-->
