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

### UNIFAC: no `=` in a group name (alkenes/alkynes absent)
Same tokenizer limitation: `=` is not a word character, so UNIFAC subgroup
names that contain it — the alkene/alkyne groups `CH2=CH`, `CH=CH`, `C=C` — are
NOT in `data/standards/unifac/groups.dat` and cannot be declared.  UNIFAC works
for saturated families (alkanes, aromatics, alcohols, ketones, esters, ethers,
acids, amines, chloro, water); a system needing an alkene group must use a
fitted activity model (NRTL/UNIQUAC) instead.  (Fixable by extending the
tokenizer, but deliberately deferred — not a launch blocker.)

### `kmol/s` is the canonical molar flow unit
`F 100;` is `100 kmol/s` (huge!).  Always `F 100 kmol/h;` or `F 0.0278
kmol/s;`.

## Composition

### `molarComposition` vs `massComposition`
Use `molarComposition { water 0.85; sucrose 0.15; }` for mole
fractions; use `massComposition { water 0.30; sucrose 0.70; }` for
mass fractions — `readComposition` converts mass to mole via the
component MWs.  Using the wrong key SILENTLY interprets your numbers
in the wrong basis.

### Σ z ≠ 1 — auto-normalised, but watch precision
The parser normalises any composition that doesn't sum to 1.  If you
write 0.05/0.10/0.20/.../1.00 by mistake (Σ > 1), you get
auto-normalised values.  Print the parsed stream early to verify.

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

If you put `model Muschelknautz;` inside `operation {... }`, the
unit silently falls back to the default model (`Lapple` for cyclone,
`WangHenke` for distillation, `equilibrium` for crystalliser).

### `reaction` / `crystallisation` / `dryingCurve` are STRING refs
They point to a NAMED block in the corresponding `constant/<library>`
file:

```
reaction         my_kinetics;          # -> constant/reactions
crystallisation  sugarKinetics;        # -> constant/crystallisation
dryingCurve      sucroseDrying;         # -> constant/dryingKinetics
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
variables (Duhem).  Give **`P` + exactly ONE of {`T`, `vaporFraction`}**:

| you write | engine resolves | use |
|---|---|---|
| `T` + `P` | flash → `vf` | general feed (single- or two-phase) |
| `P` + `vaporFraction` | solves `T` (bubble/dew/flash-at-vf) | saturated-liquid (`vaporFraction 0`) / vapour (`1`) feed |
| `T` + `vaporFraction` | solves `P` | feed pinned at a temperature |

**`vaporFraction` is often ESSENTIAL, not optional sugar:** on the phase boundary
`T` and `P` are NOT independent (a pure two-phase stream has `P = Psat(T)`), so a
saturated / two-phase feed CANNOT be pinned with `(T,P)` — you must give
`vaporFraction` with one of them.  This is the classic point of confusion.

- All three (`T` + `P` + `vaporFraction`) is **over-specified → REFUSED** (the
  flash at `(T,P)` already fixes the vf; a declared vf that disagrees is named in
  the error).
- Only one is under-specified → refused with guidance.
- (`vf` is the legacy alias of `vaporFraction`; the pure-only
  `state saturatedLiquid`/… keyword still works.)

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

### NRTL without `pairs` block
If you select NRTL but `data/standards/parameters/NRTL/<i>-<j>.dat`
doesn't exist AND you didn't write inline `pairs (...)`, the model
defaults to ideal (γ=1) for that pair — **announced loudly**, never
silently: a `[thermo] NRTL: N binary pair(s) have no parameters ->
defaulted to IDEAL` log line, an advisory the GUI shows as an amber
toast, and the pair-coverage matrix colouring the pair as
ideal-default.  The pitfall is IGNORING the announcement, not the
absence of one.  Always verify the file exists for your component
pair, or inline the parameters.  (Contrast the `propertyPackage`
world: there a DECLARED pair file that is missing does not default at
all — the builder REFUSES at assembly, naming the entry.)

### `model ideal` for a strongly non-ideal mixture
Common mistake.  Ethanol/water at 1 atm has a 12% offset from Raoult
near the azeotrope; using ideal there gives wrong K-values.  Switch
to NRTL.

## propertyPackage (the declarative manifest)

Reference cases: `flash08_co2_water_package` (inline manifest, Henry
world) and `flash09_n2ch4_stryjek` (φ-φ world + kijPairs).

### Mixed cubics in one VLE → REFUSED
`liquid eos.SRK;` with a DIFFERENT vapour cubic (or `builtin.idealGas`)
is two Gibbs surfaces pretending to be one VLE.  The builder refuses at
assembly: the φ-φ world needs the SAME cubic on both phases
(`liquid eos.SRK; vapour eos.SRK;` — one Gibbs surface per phase,
`K = φ_L/φ_V` from the one cubic's two roots).

### A declared parameter file that is missing → REFUSED, not defaulted
Unlike the legacy NRTL ideal-default (announced but tolerated), a
`parameters.henryPairs` / `parameters.kijPairs` entry whose file is
absent or unparseable REFUSES at assembly, naming the entry to add
(amendment A3: declare → verify → refuse).  So does a `solution{}`
solute with no matching `henryPairs` entry.

### Omitting `kijPairs` on an EoS package → kij = 0 (announced)
No `kijPairs` block is legal — the cubic runs predictive with
`kij = 0`, announced.  Near-critical phase splits will be off (the
N2-CH4 split needs its DECHEMA kij 0.0289).  Declare the pair file
(`data/standards/parameters/SRK/<i>-<j>.dat`) and watch for the
`[builder] kij(...)` line confirming it loaded.

### The `package <name>;` selector is retired → write the manifest inline
There is no shared `data/standards/propertyPackages/` catalogue any more:
`constant/propertyDict` must BE the inline `recordType propertyPackage`
manifest (components, methods, pairs + sources, all in the case).  A stray
`package <name>;` now fails LOUD.  See `thermo.md`.

## Reactions

### Mass-balance violation
A user-written reaction whose stoichiometry doesn't conserve mass
(e.g. ethanol → water with no other species) corrupts the case
silently — the solver runs, the streams "balance" in moles but mass
is lost.  The `massBalance` report catches it:

```
reports { massBalance {} }
```

Then check `reports/balances/massBalance.csv`: if `closure_pct` ≠ 100%
for a species, the reaction is at fault.

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
single-salt VLE adapter selected inside a propertyDict /
propertyPackage) uses the multi-ion Pitzer-HMW model — binary
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

### Forgetting the `state` keyword on a steam feed
A "saturated steam at 200 kPa" feed should be:
```
chest1
{
    F         5000 kg/h;
    P         200 kPa;
    state     saturatedVapour;       # T resolved by Antoine inversion
    molarComposition { water 1.0; }
}
```
NOT a hand-computed T that may drift from `T_sat(P)` for water
(393.4 K at 200 kPa).: the parser inverts at parse-time.

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

