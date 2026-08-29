# Pitfalls — common mistakes when authoring a Choupo case

Real things that have bitten contributors (some of them documented as
latent-bug fixes in CLAUDE.md).  When a user case behaves
unexpectedly, scan this list before deep-debugging.

## Units

### Bare numbers are SI, not the unit you think
`P 1;` declares `1 Pa`, not 1 bar.  Always write a unit suffix:
`P 1 bar;`.  The parser tracks dimensions; a downstream dim-checked
lookup throws if the value is wrong-dimensioned.

### `degC` is affine — and is NOT usable as a display unit
A temperature *difference* and an *absolute* temperature differ by
+273.15.  When in doubt, use `K`.  Beyond input, `degC` (and `degF`)
**cannot** be requested as an OUTPUT/display unit: `DisplayUnits`
multiplies by a single factor and has no place for the +273.15 affine
offset, so `controlDict units { temperature degC; }` is **silently
rejected** (it prints a `DisplayUnits: ignored...` line to stderr and
the output stays in **K**).  Display preferences (§"Why is my GUI
showing the wrong number?") accept only multiplicative units (`bar`,
`kmol/h`, `m3`,...) — temperature display is always K.

### `m^3` does not parse — use `m3`
`^` is not a word character in the tokenizer.  Same for `m^2` → write
`m2`.  (Both `m3`/`m^3` are in the registry; the tokenizer just
doesn't reach the `^` form.)

### UNIFAC: `=` in a group name parses (alkene/alkyne groups available)
Unlike `^`, `=` IS a word character in the tokenizer (added exactly for UNIFAC
subgroup names), so the alkene/alkyne groups `CH2=CH`, `CH=CH`, `CH2=C`,
`CH=C`, `C=C` ship in `data/standards/parameters/UNIFAC/groups.dat` and can be
declared directly, alongside the saturated families (alkanes, aromatics,
alcohols, ketones, esters, ethers, acids, amines, chloro, water).

### `kmol/s` is the canonical molar flow unit
`F 100;` is `100 kmol/s` (huge!).  Always `F 100 kmol/h;` or `F 0.0278
kmol/s;`.

## Composition

### `molarComposition` vs `massComposition` — and where each spelling is read
Two different readers, two different vocabularies, and mixing them up is the
commonest authoring error:

* **Inside a batch / dynamic unit-op block** (`initial {}`, `feed {}` of
  `batchReactor`, `batchStill`, `dynamicCSTR`, `fixedBedAdsorber`, …) the keys
  are `molarComposition { water 0.85; sucrose 0.15; }` for mole fractions and
  `massComposition { water 0.30; sucrose 0.70; }` for mass fractions.  The
  shared `readComposition` helper converts mass to mole via the component MWs.
* **Inside a `0/<stream>` state file** neither spelling exists.  A stream
  declares ONE canonical material form — `componentMolarFlows { … }`,
  `componentMassFlows { … }`, `molarFlow` + `moleFractions { … }`,
  `massFlow` + `massFractions { … }`, `speciesMolarFlows { … }` or
  `aqueousAnalysis { … }` — and declaring two is refused, not resolved by
  precedence.

Using the wrong key SILENTLY interprets your numbers in the wrong basis; using
a unit-op spelling in a `0/` file leaves the stream with no material at all.

### Σ z ≠ 1 — auto-normalised, but watch precision
The parser normalises any composition that doesn't sum to 1.  If you
write 0.05/0.10/0.20/.../1.00 by mistake (Σ > 1), you get
auto-normalised values.  `readComposition` (the unit-op blocks) prints a
warning first when the sum is off by more than 1e-3 — but a drift smaller
than that is absorbed silently, so print the parsed stream early to verify.

### Component name typos
Component names are case-sensitive.  `Water` ≠ `water`.  The list of
shipped components lives in `data/standards/components/` (see
`components.md`); typos throw "component 'XYZ' not found".

## Unit-op specification

### `model` goes at unit level, NOT inside `operation`:

```
{ name cyclone1;  type cyclone;
  model  Muschelknautz;      // <-- HERE
  in feed;  outputs (cleanGas capturedSolids );
  operation { bodyDiameter 0.5 m; numberOfTurns 5;... } }
```

The unit-level slot is the convention (type = which unit, model = which
variant).  The cyclone happens to ALSO read an operation-level `model`
key as an explicit legacy fallback (`Cyclone.cpp`), so
`model Muschelknautz;` inside `operation {... }` still works there — but
do not rely on that elsewhere: the distillation column's in-operation
legacy key is `method`, not `model`, so an operation-level `model` there
is unread (and flagged by the dict audit) while the column runs
`WangHenke`.

### `reaction` / `crystallisation` / `dryingCurve` are STRING refs
They point to a NAMED block in the corresponding `constant/<library>`
file:

```
reaction         my_kinetics;          // -> constant/reactions
crystallisation  sugarKinetics;        // -> constant/crystallisation
dryingCurve      sucroseDrying;         // -> constant/dryingKinetics
```

Not the kinetics themselves inline.

### Required field missing
`UnitOperation::solve` throws when a required field of the operation
block is absent.  The error names the field; the schemas (`gui/schemas/operations/`)
list which are required.

### Don't put a `Q` on a flash — a flash GIVES a duty
A flash is fixed by exactly two numbers (`T,P` for `isothermalFlash`; `Q=0,P`
for `adiabaticFlash`).  Its duty `Q` is a RESULT (a KPI + heat stream), never an
`operation` key — the key was removed on purpose.  To *impose* a heat, chain a
`heater(Q) → flash`; for a target T, a DesignSpec on the heater's `$Q`.  See
[`energy.md`](energy.md) → "the flash/heater rule".

### Specifying a feed's thermal state — the `vaporFraction` rule
A stream of known composition + flow is fixed by exactly **two** intensive
variables (Duhem).  That is the theory; what the engine implements is narrower:

| you write | engine does today | |
|---|---|---|
| `T` + `P` | flash → `vf` | the implemented closure |
| `P` + `vaporFraction` | — | recognised; resolution DEFERRED |
| `T` + `vaporFraction` | — | recognised; resolution DEFERRED |
| `T` + `P` + `vaporFraction` | flash on `(T,P)`; the declared `vf` is a PIN | carried, not refused |

**`vaporFraction` is often ESSENTIAL, not optional sugar:** on the phase boundary
`T` and `P` are NOT independent (a pure two-phase stream has `P = Psat(T)`), so a
saturated / two-phase feed CANNOT be pinned with `(T,P)` — you must give
`vaporFraction` with one of them.  This is the classic point of confusion.

- **The implemented closure is `T` + `P`.**  `(P, vaporFraction)` and
  `(T, vaporFraction)` are recognised spellings whose flash resolution is
  DEFERRED — the engine does not currently solve `T` from a declared `β`.
- All three together are **carried, not refused**, whatever older notes said:
  the flash runs on `(T, P)` and the declared `vaporFraction` acts as a PIN
  (it sets `phasePinned`, which is what energy-pricing consumers ask instead of
  testing `vf == 0`).  It is not checked against the flash, so if the two
  disagree the flash wins silently.  `tutorials/steady/flash/flash01_benzene_toluene`
  ships all three and passes — which is how the old "REFUSED" claim was caught.
  Write `β` only when you mean the pin.
- The key is spelled `vaporFraction` in full.  **`vf` is not a dict key** (it
  is the name of the field inside `ProcessStream`), and there is no
  `state saturatedLiquid;` stream keyword — both belonged to the retired
  `flowsheetDict streams {}` block.  `phase gas;` / `phase liquid;` is the
  other live pin.

### A feed's phase must match its declared state (don't call a vapour "liquid")
At low pressure, light species sit ABOVE their boiling point, so a feed you think
is liquid actually flashes to VAPOUR (propane/butane at 1 atm, 290 K → `vf=1`).
The flowsheet flash resolves the real `vf` and **announces it** (`[phase] stream
'feed1': … → vf=1.00`) — read that line.  A distillation column takes its feed
quality `q = 1 − vf` from the STREAM, not a separate `operation.feeds.quality`;
a `quality` that contradicts the stream is **refused** (it was the silent bug
that lost a feed's latent heat and broke the energy balance).  Fix it by setting
the right `P` (a C3–C6 split runs at ~16 bar so the feeds are liquid) or by
declaring the feed's `vaporFraction` explicitly.

### Boiling: `dT_excess` is NOT `dT_film`; the nucleate flux is INDICATIVE
A geometry-mode **boiler** (`boiling {}`) is the inverse of a geometry-mode
**condenser** (`coolant {}`), and the difference is load-bearing:

* The condenser's driving dT is `dT_film = Tsat − T_wall` (the surface SUB-cools
  the film); the boiler's is `dT_excess = T_surface − Tsat` (the surface
  SUPER-heats the pool). They are different quantities — the run never reuses the
  `dT_film` label for boiling.
* The Rohsenow nucleate flux scales as **`(dT_excess / C_sf)³`** — a cube. A
  modest `C_sf` error is amplified **threefold**, so the flux is **±100 %
  uncertain** (`C_sf` is surface-finish lab data, not a fluid property). There is
  **NO default `C_sf`** and **`citation` is mandatory** — omit either and the run
  REFUSES. The result carries a `[q/2, 2q]` scatter band; treat the nucleate flux
  as INDICATIVE, never as a reliable number.
* The **reliable** figure is the **Zuber CHF ceiling** (±15 %), printed FIRST. A
  design above CHF is **HARD-REFUSED (burnout)** — a pool boiler physically
  cannot exceed the critical heat flux. If the run refuses with a burnout
  message, reduce `dT_excess`, area, or the heating-medium temperature; do not
  raise a tolerance. See [`dict-syntax.md`](dict-syntax.md) → "phaseChanger
  (boiler) `model geometry;`". Tutorial: `steady/heat/reboiler_water_copper`.

## Activity model / EoS

### Wang-Henke through an azeotrope → does NOT converge
The bubble-point method (`distillationColumn` default
`model WangHenke;`) cannot solve a column whose product is on the
wrong side of an azeotrope (it can step THROUGH and invent a
non-physical answer).  For azeotropes: `model simultaneous;` (MESH
Newton, quadratic).

### NRTL / UNIQUAC / Wilson without parameters for a pair — now REFUSED
If you select a pair-parameter activity model but
`parameters/<MODEL>/<i>-<j>.dat` doesn't exist AND you didn't write inline
parameters, that pair does **not** run the model you declared: it runs ideal
(γ=1).  **Since 2026-08-11 the engine refuses** rather than announcing it and
carrying on — the answer would be to a different problem from the one your
case describes.

The refusal names every affected pair and prints four ways forward: add the
record, fit it (`fitParameters`, kind `T_bubble`), declare a predictive model
that needs no pair (UNIFAC), or **authorise the approximation** with a
paste-ready block at the TOP LEVEL of `constant/thermoPhysPropDict`:

```
approximations
{
    idealBinaryPair
    {
        pairs  ( acetone-water );
        reason "why ideal is acceptable for THIS problem";
    }
}
```

Authorised, it runs — and every ideal-defaulted pair rides the result as a
`problemDivergence`, printed above the KPIs and written to
`converged/problemDivergence`.  Three traps:

* the block goes at the **top level**, not inside `activityModel {}` (the
  grammar refuses it there — it is a statement about your case, not a
  parameter of the model);
* it is **delimited** — authorising one pair does not authorise another;
* **never invent parameter values to escape the refusal.**  A fabricated pair
  is indistinguishable from a curated one; an authorised ideal pair is visible
  forever.

(Contrast a DECLARED pair: a `binaryParameters` entry whose `source` file is
missing does not default at all — the builder REFUSES at assembly, naming the
entry.)

### `model ideal` for a strongly non-ideal mixture
Common mistake.  Ethanol/water at 1 atm has a 12% offset from Raoult
near the azeotrope; using ideal there gives wrong K-values.  Switch
to NRTL.

### PC-SAFT association: the scheme is PART of the fit
A published `(epsAB_K, kappaAB)` pair is meaningful only under the site
scheme the paper regressed it with — read the paper's own site count,
never assume one from the molecule's chemistry ("water is 4C" is a
chemistry intuition, not a fact about a parameter set).  The corpus
paid for this once: the Gross & Sadowski 2002 water set is fitted with
TWO sites (2B); curated as 4C, the PURE liquid density read +0.6 % — a
coincidence that masked the error — while pure-water Psat left the
physical range and the ethanol/water mixture flash collapsed
(K_water = 0.0044).  Two lessons: (1) the `assocScheme` you write must
be the paper's, and (2) a single pure-density check cannot validate an
association trio — a MIXTURE case (or a Psat point) is the witness that
catches a scheme mismatch.  Also remember the trio is all-or-nothing:
`assocScheme`/`epsAB_K`/`kappaAB` declared together or not at all (a
partial trio refuses at load).

### PC-SAFT parameters are not derivable — and the fitted set is one object
The segment trio `m/sigma/epsilonK` cannot be generated from
`{Tc, Pc, omega}` (a component without a `pcsaft{}` block refuses, with
a remedy — never a silent corresponding-states fallback), and a set
fitted WITH association is meaningless without it: the 2002 water
segment trio under a bare non-associating PCSAFT gives a fluid that is
not water.  Never mix a segment trio from one paper with an association
pair from another.

## The declared system (thermoPhysPropDict)

Reference cases: `flash08_co2_water_package` (diluteSolution / Henry
world) and `flash09_n2ch4_stryjek` (φ-φ world + declared kij).

### Mixed cubics in one VLE → REFUSED
A `phiPhi` system routes BOTH phase slots through the ONE declared
`equationOfState` (`fugacityRoute equationOfState; root liquid|vapour;`).
Two different cubics — or a cubic liquid against an ideal-gas vapour —
are two Gibbs surfaces pretending to be one VLE; the builder refuses at
assembly (one Gibbs surface per phase, `K = φ_L/φ_V` from the one
cubic's two roots).

### A declared parameter file that is missing → REFUSED, not defaulted
Unlike the NRTL ideal-default for an UNDECLARED pair (announced but
tolerated), a `binaryParameters` / `binaryInteractions` entry whose
`source` file is absent or unparseable REFUSES at assembly, naming the
entry to add (declare → verify → refuse).  So does a `solutes{}` group
with no matching pair entry.

### Omitting `kijPairs` on an EoS package → kij = 0 (announced)
No `kijPairs` block is legal — the cubic runs predictive with
`kij = 0`, announced.  Near-critical phase splits will be off (the
N2-CH4 split needs its DECHEMA kij 0.0289).  Declare the pair file
(`data/standards/parameters/SRK/<i>-<j>.dat`) and watch for the
`[builder] kij(...)` line confirming it loaded.

### The system is declared inline — there is no shared package catalogue
`constant/thermoPhysPropDict` IS the case's thermophysical system
(`recordType thermophysicalPropertySystem;` — components, formulation,
model slots, pairs + sources, all in the case).  A selector into a shared
catalogue does not exist; a dict without the recordType line fails LOUD.
See `thermo.md`.

## Reactions

### Mass-balance violation
A user-written reaction whose stoichiometry doesn't conserve mass
(e.g. ethanol → water with no other species) corrupts the case
silently — the solver runs, the streams "balance" in moles but mass
is lost.  The `massBalance` report catches it, and since 2026-08-02 it
runs **by default** on every converged steady case (as do
`elementBalance` and `energyBalance`) — no `reports {}` block needed.
Check `reports/balances/massBalance.csv`: if `closure_pct` ≠ 100%
for a species, the reaction is at fault.  (Declare
`reports { massBalance { enabled false; } }` only to opt out.)

### Reversible reaction without `standardThermochemistry` on every species
For `reversible true;`, the reverse rate is `k_fwd / K_eq(T)` with
`K_eq = exp(-Σνᵢ gᵢ°(T)/RT)`.  This needs each species to carry a
`standardThermochemistry { dHf_298; s_298; phase; }` block in its.dat.  Without it,
K_eq defaults to 1 and the reverse rate is wrong (without warning).

## Membrane

### Forgetting the osmotic model for a high-salt brine
Default `osmotic { model vanHoff; }` is fine for seawater RO at low
recovery.  For a high-recovery design / brine concentrator / a wall
at high c, `vanHoff` over-predicts Δπ → under-predicts flux.  Switch
to `osmotic { model Pitzer; }`.

### `k_film` too small / too large
`k_film` controls the concentration polarisation `c_m = c_b·exp(J_w/k)`.
Too small → c_m blows up, J_w drops to zero (case looks "broken").
Too large → film effect vanishes (no realistic CP).  Realistic
range: 10–100 µm/s.  For a hydraulics-correlated value, use
`massTransfer { model SchockMiquel; channelHeight 0.7 mm;... }`.

## Crystallisation (MSMPR + batch)

### Unseeded batch crystalliser with `j > 0`
Nucleation `B0 = k_b (S-1)^b M_T^j` with `j > 0` is magma-dependent
(secondary).  Unseeded means `M_T(0) = 0` → `B0(0) = 0` → no
nucleation → no growth → S stays at S_0 forever.  Either add a seed
(initial moments > 0) OR use `j = 0` (primary nucleation; bootstraps
from any S > 1).

### Feed not supersaturated
`crystalliser model MSMPR;` requires `c_feed > c_sat(T_op)`.  If
`S_feed ≤ 1` it throws.  Either lower `operatingTemperature` (to drop
`c_sat`) or raise the feed concentration.

### Missing solubility / solid blocks
The component must carry both:
- `solubility { coefficients (a b c); dHcryst; }` (for c_sat)
- `solid { rho_p; k_v; }` (for the number↔mass bridge)

Sucrose and similar crystalliser-targeted components ship both.

### A crystallising SALT's formation is ION-DERIVED — never add a component `standardThermochemistry`
If a salt crystalliser reports `Q = 0` / `dH_cryst = 0` and the log warns
`Component 'NaCl': h_pure_ig(T) needs standardThermochemistry`, the fix is **NOT** to add a
`standardThermochemistry` block to the salt's `.dat` (Claude did, in circles, on 2026-06-29
— don't repeat it).  A salt's solid formation is a DERIVATIVE:
`Hf_solid = Σνᵢ·hfAq_i − dH_soln`, from the aqueous ions
(the `hfAq` in each ion's `data/standards/species/<name>.dat`) **plus** the salt's
`electrolyte { dissolutionEnthalpy }`.  Storing it a second time is the arity-1
sin (it drifts silently); `bin/curate/check_ion_pins.py` **exits 1** on it.  The
heat of crystallisation comes from `dissolutionEnthalpy` read straight — make
sure the salt's `electrolyte {}` block carries it (primary-cited).  A nonvolatile
salt never takes the ideal-gas enthalpy path.  Full story: `docs/ai/energy.md` +
CLAUDE.md §5 (settled 2026-06-29, forum 5/6).

## Drying

### Nonvolatile in the package without Cp
A spray dryer's gas-side Cp calculation iterates components; if a
nonvolatile (e.g. sucrose) is in the package but has no
`idealGasHeatCapacity` block (because it's, well, non-volatile), the
classical `ThermoPackage::Cp_ig` throws.  Workaround: the spray dryer
sums Cp LOCALLY over species present in the gas (y > 0), skipping
the nonvolatile.  When writing a custom case, make sure the dryer
sees the nonvolatile component flagged `nonvolatile true;` in its
.dat — otherwise the solver tries to compute Cp_ig for it.

### Sorption isotherm on the standard catalogue
**Don't** put sample-specific sorption data
(`sorption { Xm; C; K; }`) into `data/standards/components/<name>.dat`.
The same compound has different isotherms for different formulations
(crystalline vs amorphous, food-grade vs technical,...).  Put it in
the case as `<case>/constant/components/<name>.dat` — Database
overlays it **block-by-block** over the standard (you copy the whole
`sorption{}` block; a lone-scalar overlay is the forbidden hidden
hybrid — see `data-doctrine.md` §3).  (Property axiom 4.)

## Electrolyte speciation / precipitation

### `networkScope restricted` is a modelling claim, not a convenience switch
The admitted-list restriction (`networkScope restricted; network ( … );
reason "…";`) exists for cases where the FULL network is the wrong
model (e.g. HMW theta/psi fitted to a non-pairing major-ion treatment).
The `reason` string is mandatory because it must carry a MODELLING
argument — "runs faster" or "silences the missing-K error" is not one,
and the outputs of a restricted run are permanently labelled
`networkRestricted` so a reduced model can never pass as the full one.
The engine already refuses the dishonest shapes (no list, no reason,
unknown record, unreachable record, two authorities); the pitfall left
to the author is a technically-valid reason string that argues
convenience instead of chemistry.

### `equilibrate` gives a CEILING, not a deposit prediction
`equilibrate { minerals ( calcite gypsum ); }` (in `speciate` /
`scalingScan`) drives each named mineral to its `SI = 0` saturation and
reports the amount precipitated.  That amount is the *thermodynamic
maximum* — `SI → 0`, infinite time, no nucleation barrier.  **Real scale
is kinetically limited**: induction time, nucleation, and antiscalants
all act on KINETICS, which this equilibrium calculation cannot see.  So
the actual deposit is `≤` the ceiling, often **far** less.  Use it for
the *safe* direction only — `ceiling ≈ 0` rigorously means *no driving
force* (you are safe); a large ceiling means *possible* scale, not
certain scale.  Do not read `n_calcite` as "kg of scale you will get".
The engine prints this banner on every equilibrate run for exactly this
reason; the cross-check tool is PHREEQC `EQUILIBRIUM_PHASES`.  (Without
the `equilibrate` block the same op reports only `SI` — "how
supersaturated?" — and precipitates nothing.)

### Given `pH` + a precipitating carbonate = a phantom buffer
When you precipitate a carbonate mineral (calcite, aragonite — anything
with an `{ ion H; nu -1; }` leg) under a GIVEN pH (`pH 8.2;`), the H⁺
that the mineral releases has to go somewhere — and a fixed pH means an
*unstated external buffer* silently swallows it.  **H is not conserved**,
and the reported amount is a pH-stat (titrated) value, not a closed
equilibrium.  The engine warns loudly when this happens.  Prefer
`pH solve;` so the freed H⁺ re-acidifies the water (the pH drops, the
electroneutrality row closes the system) — then the precipitated amount
is a genuine equilibrium with no hidden buffer.

### `exchange` is the LIMITING effluent, not a bed in service
The `exchange` op (ion-exchange softening) returns the water FULLY
equilibrated with the resin at the stated CEC and Gaines-Thomas
selectivity — the best a *fresh / fully-loaded* contactor does per
pass.  A real fixed bed does **not** behave this way: it leaks rising
hardness as the exchange front migrates toward **breakthrough**, then
must be **regenerated**.  Cycle length, bed-volumes-to-breakthrough and
regeneration are **transient** and are NOT modelled by the equilibrium
op (a non-suppressible banner says so on every run).  Safe reading: the
real leakage is **≥** this equilibrium leakage — if the equilibrium
effluent is already hard, no bed will soften it; if it is soft, a real
bed is soft only until breakthrough.  Use the op to size selectivity and
the salt penalty (`Na_added_meqL`), not to predict run length.  Also
note the resin starts in its regenerated `form` (Na): the softener
trades hardness for Na *eq-for-eq*, so a softened water is **higher in
sodium** — that is physics, not a leak.

### Calcite is RETROGRADE — a cold-safe water can scale when hot
Saturation indices are temperature-dependent through `K(T)`, and the SIGN
of the slope matters.  **Calcite dissolution is exothermic**, so its
`log K` *falls* as temperature rises and `SI_calcite = log(IAP) − log K(T)`
*rises* — calcite is **less** soluble hot.  A water that reads `SI_calcite
< 0` at the 25 °C feed can read `SI_calcite > 0` on a 70 °C heat-exchanger
surface or in a warm RO concentrate.  **Always speciate at the hottest
surface temperature**, not just the feed.  Set it with `temperature
<value> K;` on a `speciate` op (or scan several temperatures, as
`tutorials/props/electrolyte/ksp_temperature` does).  Normal-solubility
salts (e.g. halite, dH > 0) go the other way — `SI` drifts *down* with T.
At exactly 25 °C every `K(T)` returns its `logK25` (nothing moves); off
25 °C the run announces the form in use per entry — **analytic** (the
PHREEQC `-analytical_expression`, anchored on `logK25`), **van't Hoff**
(constant `dH`), or **flat** (held at 25 °C, the shrinking bare set).

### `K(T)` outside the fitted range = announced, never silent
An analytic `K(T)` carries the source's fitted validity window (`validC
( lo hi );`, °C).  Run **outside** it and the engine raises a loud
`K(T) EXTRAPOLATED beyond the fitted analytic range` advisory naming the
entries — the number is still produced (so you can see it) but it is an
**extrapolation**, not a fit.  Treat such SI/speciation values as
indicative; if a species you care about extrapolates (e.g. an `HCl` ion
pair fitted only 0–50 °C used at 80 °C), prefer a catalogue entry whose
range covers your temperature, or a richer model (Pitzer with its own
T-treatment).

### Pitzer in a mixed brine: ternary mixing + E_theta higher-order electrostatics
`activityModel pitzerHMW;` (the propsDict `speciate` selector — NOT
`pitzer`, which since the 2026-06-29 key split names the salt-level
single-salt VLE adapter selected inside a thermoPhysPropDict /
thermoPhysPropDict) uses the multi-ion Pitzer-HMW model — binary
virials (`pairs.dat`) **plus** the ternary cation-cation / anion-anion
mixing (`theta`) and triplet (`psi`) terms (`mixing.dat`). This matters
for **mixed brines** (seawater, RO concentrate): the mixing terms are the
difference between a sum-of-single-salts estimate and the real multi-ion
γ. The mixing parameter is the **full** Pitzer form `Φ_ij = θ_ij +
E_theta_ij(I)` with `Φ'_ij = E_theta'_ij(I)`: the I-dependent **higher-order
unsymmetrical electrostatic mixing term `E_theta(I)`** (Pitzer 1975, built
from the J(x)/J'(x) integrals) is **now active** — non-zero only for
like-sign ion pairs of *different* charge (e.g. Na⁺/Ca²⁺, Cl⁻/SO₄²⁻); for
like-charge pairs and every single salt it vanishes identically, so the
single-salt oracle is untouched (1.57e-14). E_theta is a refinement that
shifts the 2:1 / 1:2 ion γ a few % at seawater I and more in deep brine; the
only remaining v2 deferral is the full β(T)/θ(T) **temperature** surface
(25 °C base). Two more limits to keep honest: (1) the mixing catalogue covers the **core
seawater system + the carbonate subsystem** (Na K Ca Mg H | Cl SO4 OH CO3
HCO3, with the neutral CO2 salting-out) — borate / H4SiO4 / HSO4 ternaries
are not in `mixing.dat` yet; (2) do **not** stack explicit ion pairing (an
`NaSO4-`/`MgSO4(aq)` speciation reaction) on top of Pitzer for the major
ions — the HMW parameters already subsume that interaction, so both together
**double-count** it. Pitzer-HMW is trustworthy to I ≈ 6 for this
seawater/brine system; see
`tutorials/props/electrolyte/pitzer_seawater_verify`.

### Pitzer carbonate: CO2 salting-out, and Pitzer ≠ Davies for scaling
With `activityModel pitzerHMW;` the carbonate system (CO3, HCO3, the neutral
CO2aq) is fully wired (slice S4): the neutral **CO2(aq) gets γ > 1 in
brine** (the *salting-out* lambda term), so dissolved CO2 is less soluble in
seawater than the Davies model — which forces γ ≡ 1 for every neutral —
will ever show. For **calcite / gypsum scaling in brine the choice of
activity model is not cosmetic**: at seawater I ≈ 0.7 Davies overshoots the
calcite SI by ≈ 0.22 (it is past its trustworthy band ~0.5) and misses the
CO2 salting-out entirely. Use **Pitzer for brine** (RO concentrate,
produced water, seawater); reserve Davies for dilute (I ≲ 0.5) waters. The
divergence is shown side-by-side in
`tutorials/props/electrolyte/pitzer_calcite_brine` (surface seawater
SI_calcite: Pitzer +0.67 vs Davies +0.88; γ_CO2aq 1.10 vs 1.00). The
lambda/zeta T-dependence is deferred (25 °C base) — speciate carbonate brine
near 25 °C, or treat off-25 °C carbonate SI as indicative.

### Industry indices (LSI / Stiff-Davis / Ryznar) ≠ the rigorous activity SI
When a `scaling { minerals (calcite …); }` audit (membrane) or a `scalingScan`
(props) tracks **calcite** and the analysis carries **Ca + HCO₃**, Choupo also
emits the closed-form **industry calcite-scaling indices** — **LSI** (Langelier
1936), **Stiff-Davis** (1952), **Ryznar RSI** (1944) — beside `SI_calcite`.
These are a deliberate CONTRAST, not a substitute: they are **concentration-
based EMPIRICAL** indices (ion concentrations + a published ionic-strength
correction), whereas `SI_calcite` uses real ion **activities** (γ·m from Davies
/ Pitzer).  Both share the same `logK_cc(T)` anchor, so the ONLY difference is
concentration-vs-activity, and:
* at **low I** (γ → 1) the index ≈ `SI_calcite` (validation); but
* at **high I / at the membrane wall** (where concentration polarisation drives
  the local I far above the bulk) the empirical index **OVER-predicts**
  saturation — it cannot see the γ reduction.  In `membrane09_index_vs_rigorous`
  the wall LSI over-predicts the rigorous `SI_calcite` by ≈ +0.78 at seawater I;
  in the brine `scalingScan` the gap reaches > +1 under Pitzer.
**Stiff-Davis** extends LSI to brines with an empirical chart-fit `K(I,T)` that
pulls the index PART of the way back toward the rigorous value — but it is still
a chart fit, NOT the real per-ion γ, so it does not close the gap.  **Trust the
rigorous activity SI** for high-recovery / brine membrane scaling; read the
index family as the convenient-but-unsafe shortcut.  The audit footer / CSV make
the gap (`LSI − SI_calcite`) explicit.

## Recycle convergence

### Absolute `recycleTol` on a tear vector dominated by T
With absolute tolerance, `T ~ 365` swamps a tear flow `~ 2e-4` in an
L2 norm, so absolute tolerance reports convergence at 5%-off flow.
The Newton-on-tears recycle solver uses RELATIVE residual by default
(`recycleSolver Newton;` is the default; `Wegstein` is the
fixed-point accelerator alternative).  If you see "converged" but the
recycle flow looks suspicious, force `recycleSolver Newton;`.

## Reporting

### Energy balance "n/a" or a tiny ΔH on a reactor
The heat of reaction is computed on the **elements / formation datum**
(`dH_rxn = Σ νᵢ·hᵢ(T)`, the `H_ig − dHvap` base) in **every** reactor — steady
AND batch/dynamic.  If a reactor report shows `n/a` or a tiny ΔH for an obviously
hot reaction, some reacting species is **missing**
`standardThermochemistry { dHf_298; s_298; phase; }` — without it the elements-datum can't
be computed.  In the steady reactors the duty is then dropped (announced); in
`batchReactor` / `dynamicCSTR` the engine falls back to an explicit `dH_rxn` key
in the reactions dict, announced as a **dict OVERRIDE** — that key is for
formation-data-absent toy / lumped components ONLY, and it is **ignored** by the
steady reactors (which compute the duty from `standardThermochemistry`).  Add
`standardThermochemistry` to every reacting species and the same heat of reaction flows
everywhere.

## Energy wires / heat-links

### Forward heat-link: list the PRODUCER before the CONSUMER
A heat-link (`energyInputs ( { from column01.condenser; kind heat;
target Q; } )` on a consumer) copies a scalar duty from the producer's
solved KPI into the consumer's `operation` block *before the consumer
solves*.  This is a **forward** wire — there is no iteration over it —
so the producer MUST appear earlier in the `units (...)` list than the
consumer, or the consumer reads a stale/zero duty.  In
`heatlink01_condenser_to_heater` the column is listed first, then the
preheater that consumes its condenser duty.  If you see a heat-driven
unit getting `Q = 0` (or last pass's value), check the unit ordering.
See `energy.md` for the full energy-wire / heat-port model (W = scalar
work wire, Q = duty carried-or-allocated, column `condenser`/`reboiler`
ports, the `utilityAllocation` report).

## State / streams

### An unpinned gas feed manufactures an "ENERGY BALANCE FAILED" banner
A stream file with no `vaporFraction` / `phase` key is priced as a
**sub-cooled liquid** (vf = 0).  Feed a flash an all-vapour mixture that way
(natural gas at 250 K / 60 bar: every species except methane is
sub-critical, so the Tc screen cannot prove it gaseous) and the unit's
energy report shows an "unexplained" first-law residual — the latent heat of
the mispriced feed — under a red `ENERGY BALANCE FAILED` banner, at exit 0,
on a case whose composition answers are perfectly right.  The fix is one
declared line in the `0/` file: `phase gas;` (see dict-syntax "Pinning the
phase of an inlet").  Rule of thumb: **any feed that is not a liquid at its
(T, P) needs its phase pinned**, and a FAILED energy banner whose residual
is latent-heat-sized is usually a mispriced inlet, not a broken unit.
(Found by the 2026-08-23 LLM benchmark, which also hit a
`conversionReactor` variant of the same banner — RESOLVED 2026-08-24: that
unit now carries its inlet's phase state instead of stamping gas; see its
entry in unit-ops.md.)

### Writing a saturated steam feed — there is no `state` keyword to forget
A "saturated steam at 200 kPa" feed is written in its own `0/<stream>` file,
with the saturation temperature stated and the phase pinned:
```
// 0/chest1
componentMolarFlows { water 277.6 kmol/h; }
T               393.36 K;             // T_sat(P) for water at 200 kPa
P               200 kPa;
vaporFraction   1.0;
```
The engine does **not** invert Antoine for you at parse time.  A
`state saturatedVapour;` key did exactly that, but it read the retired
`flowsheetDict streams {}` block and was deleted with it (stream-state
migration, 2026-07-10) — its two solvers had no other caller.  So the
hand-computed `T` is now yours to get right; check it against the same
`Psat` correlation the run will use (`choupoProps` will print it), because a
`T` that drifts from `T_sat(P)` silently makes the feed superheated or
sub-cooled.  The four saturated-state words survive on a `phaseChanger`'s
`outletState`, where a unit — not a parser shortcut — does the work.

### Per-unit thermo override leaks
When unit A uses SRK and downstream unit B uses ideal gas, the
stream A→B is re-interpreted at the boundary: (T,P,z) are held and `H`
STEPS (each unit recomputes its own enthalpy).  That step is VISIBLE in
the printed enthalpy — `H` is the conserved truth, `T` is the
model-dependent readout, and the solver never silently nudges `T` to hide
the step.  So if `H` jumps across an override boundary, that is the two
models disagreeing — information, not a bug.  Default to ONE consistent
global thermo; reach for `thermo {}` overrides only when you really need
different models on adjacent units (rare).  Detail: [`energy.md`](energy.md) §7.

## Electrolytes

### Pitzer activity is calibrated at 25 °C — accuracy degrades off it
The Pitzer-HMW virial parameters in the catalogue (`beta0/beta1/beta2/Cphi`,
the `theta/psi` mixing terms) and the Debye-Hückel `A_phi` are the **25 °C**
set; the full `beta(T)/theta(T)` temperature surface is a deferred extension
(`PitzerHMW.H`).  So a speciation/activity result is trustworthy **near
298.15 K** and grows progressively approximate as `T` moves away — the model
holds the 25 °C virials constant rather than inventing a `T`-dependence it was
not given (honest, but a real limitation).  For an evaporator or crystalliser
running far from 25 °C, read the ionic activities as indicative, and prefer a
narrow-`T` case until the `beta(T)` surface lands.  This is a *calibration*
limit, not a bug: the equations are exact; only the input virials are
single-temperature.

## "Why is my GUI showing the wrong number?"

### Display preferences are output-only
`controlDict.units { pressure bar; flow kmol/h; }` changes the
PRINTED output (in the run log, the StreamsTable, the PropertyPanel).
It does NOT change the stored canonical-SI values.  Reading a
"pressure: 1.0" in the GUI when the dict has `P 101325` and display
units are `bar` is correct (101325 Pa = 1 bar).  Only multiplicative
units work here — affine `degC`/`degF` are silently rejected (see
§Units "`degC` is affine"); temperature is always displayed in K.

### KPI vs stream are different sources
The StreamsTable reads `runResult.streams`; the PropertyPanel's
"Latest results" reads `runResult.kpis`.  Both come from the
structured JSON the solver writes after a run.  If one shows data
and the other doesn't, the case may have produced one but not the
other (e.g. a propsDict case has KPIs from `propertyPoint` ops but no
streams).

