# `ammoniaStaged03_approach` — stage C of the staged design sequence

**THE RUNG NOTHING ELSE IN THE CORPUS EXERCISES.**  `gibbsReactor` has read
`operation.temperatureApproach` and announced it loudly since
`src/unitOperations/reactor/GibbsReactor.cpp` (the `[gibbs] temperatureApproach`
announcement), and before this case **no
flowsheet case in `tutorials/` declared one** — only a props operation
(`tutorials/props/gibbs/nh3_equilibrium_map/system/propsDict`) mentioned the
key.  A capability that exists, announces itself and is used by nothing is a
capability no gate can see.

## 1. Where this sits

Three cases form a ladder of reactor fidelity over one unchanged ammonia
synthesis loop.  **Between consecutive stages exactly one thing moves: the
reactor model.**  Against stage B the difference is literally one line.

| | reactor | claims | must not claim |
|---|---|---|---|
| A `ammoniaStaged01_yield` | `conversionReactor`, declared conversion | a material balance | a reactor size; an equipment-factored cost |
| B `ammoniaStaged02_equilibrium` | `gibbsReactor`, true equilibrium | the thermodynamic ceiling | any size, any cost |
| **C** *this case* | `gibbsReactor` **+ 5 K approach** | a realistic outlet; downstream units may be sized; the converter may be costed | a bed volume the **engine** computed |
| D (**not built**) | kinetic PFR on a rate law | a bed volume the engine computed | — |

```bash
diff tutorials/plant/ammoniaStaged02_equilibrium/system/flowsheetDict \
     tutorials/plant/ammoniaStaged03_approach/system/flowsheetDict
```

Background: `docs/design/how-a-process-design-is-staged.md`, and DEV.md C8.

## 2. The approach to equilibrium, and its sign

`temperatureApproach 5;` declares a MAGNITUDE.  The engine reads the
thermicity of the transformation from this feed to its equilibrium at 700 K,
finds it exothermic, and evaluates the **reaction** equilibrium at 705 K while
the physical state, the enthalpy and the energy balance stay at 700 K —
announcing that choice and the isothermal reaction enthalpy it read on every
run (ruled 2026-09-26: *"O delta T é dado sempre positivo e tu é que vais
atribuir sinal dependendo da reacção química"*; a negative declaration is
refused by name).  Ammonia synthesis is exothermic, so equilibrium ammonia
falls as temperature rises: evaluating the chemistry 5 K **hot** is exactly
*"the outlet is 5 K short of equilibrium"*.

**The direction the engine assigns is the source's own**, and the word that
carries it is *above*.  US 5,352,428 (M. L. Bhakta and B. J. Grotz, CF Braun and Co, issued
4 October 1994), *High conversion ammonia synthesis*, verbatim:

```
"The effluent from each bed has an approach to equilibrium of 5 C., i.e.,
 the ammonia concentration corresponds to the equilibrium concentration at
 a temperature 5 C. above the actual temperature."
```

and, on the design range:

```
"The approach to equilibrium in any catalyst bed is 0 C. to 30 C. and
 preferably 1 C. to 10 C."
```

The patent calls the 5 °C example's conditions "typical and optimum in many
commercial process designs", so **5 is a sourced value, not a round number**.
It is declared bare because it is a temperature *difference*: 5 K and 5 °C are
the same interval.

**This closes a gap the research document left open.**
`docs/design/how-a-process-design-is-staged.md` section 3.2 records *"For ammonia
synthesis converters specifically: NOT SOURCED"*, and deliberately refused to
carry a patent figure that had been seen only in a search summary.  The
document above was then RETRIEVED — the full patent text was fetched and every
occurrence of "approach to equilibrium" in it was read — so both sentences
quoted here come from the document rather than from a summary of it.  What was
not done is a reading of the whole patent: the claims, the examples beyond
Case A and the prior-art discussion were not read, and nothing is asserted
about them.

### THE KEY IS `temperatureApproach`, AND THE SECOND KEY IS RETIRED

Read this before copying the key from anywhere older than 2026-09-26.  Until
that day `gibbsReactor` read **two** keys for this one quantity, in two
places, and they were not the same knob:

* `temperatureApproach` (the `[gibbs] temperatureApproach` announcement in
  `GibbsReactor.cpp`) travels on the problem and is applied INSIDE each Gibbs
  method as `g_pure_ig(T + dT)` — the CHEMISTRY alone.  It is ANNOUNCED on
  every run and published as the `temperatureApproach_K` KPI.  **It is what
  this case declares, and it is now the only key.**
* `approachTemperature` was added to the temperature ARGUMENT handed to the
  method, so everything the method priced at that temperature moved with it,
  not only the chemistry.  It was announced by NOTHING, published no KPI, and
  the two ADDED when both were declared.

They gave different answers.  Measured on 2026-09-25, by running this case
unchanged except for the key, against the engine as it then stood:

| declared | converter outlet y(NH₃) | converter Q_kW | announced | KPI |
|---|---|---|---|---|
| `temperatureApproach 5` | 0.300193618107 | 3 287.27 | yes | yes |
| `approachTemperature 5` | 0.299769866866 | 3 360.07 | **no** | **no** |

**And the silent one was the key every surface named** — the GUI schema
(with a wrong sign and a `minimum: 0` that forbade the endothermic case),
the generated `docs/ai/schemas-reference.md`, `docs/ai/unit-ops.md`, and
`tutorials/plant/greenAmmoniaIndustrialN2`'s README.  A reader who followed
any of them got a number nothing announced.  This case was the witness.

**RETIRED 2026-09-26, on a stated default (DEV.md section 5, the 2026-09-25
entry).**  An approach to equilibrium is about the REACTION's extent, not the
phase behaviour, so `temperatureApproach` is the model Choupo means.
`approachTemperature` is now read only to REFUSE by name — the message names
the surviving key, the difference between the two models and the sign
convention — exactly as the heater refuses `Tout`.  The schema no longer
declares it (a refused key is not declared), the docs name it only as
retired, and the second row of the table above can no longer be produced.
No corpus case declared the retired key, so no golden moved.

### What this number is NOT

The engine says it on every run and this README must not soften it:

```
[gibbs] temperatureApproach = 5.0000 K: REACTION equilibrium evaluated at T + 5.0000 K;
        enthalpy, Psat and the energy balance stay at the physical T.
        This is an EMPIRICAL closeness-to-equilibrium parameter (calibrated,
        never predicted); 0 = true equilibrium.  GLOBAL: it cannot resolve
        per-reaction approaches (e.g. WGS vs methanol), and at high P it will
        absorb missing fugacity corrections.
```

That last clause bites here: this package declares no SRK binary interaction
parameters, so all six pairs run k_ij = 0.  **Some unknown part of a 5 K
approach at 200 bar is paying for that, not for catalyst kinetics.**  The
approach is a stand-in for a rate law this case does not have — which is
stage D, and stage D is not built.

It is also **not** the *fractional* approach (outlet mole fraction divided by
the equilibrium value at the same T and P), which is a different quantity and
not convertible to this one without the slope of the equilibrium curve.  A case
that declares one must say which; this one declares the **temperature**
approach.

## 3. What this case claims

| quantity | value |
|---|---|
| converter inlet | 16 622.66 kmol/h, y(NH₃) = 0.008240 |
| converter outlet | 12 890.09 kmol/h, **y(NH₃) = 0.300194** |
| per-pass N₂ conversion | **46.6023 %** (ceiling 47.9288 %) |
| recycle / makeup (molar) | 1.0778 (ceiling 1.0257) |
| product | 3 783.09 kmol/h at 98.3987 mol% NH₃ → 1 521.5 t/d NH₃ |
| global first-law residual | +0.0008 kW (9.8e-7 %) |
| global mass closure | 99.9974 % |

Sizing and costing (`system/postDict`):

| item | size | basis the engine recorded | C_BM | C_TM |
|---|---|---|---|---|
| converter | V_R = **18.6290 m³**, D 1.5812 m, H 9.4871 m, wall 142.37 mm, 53 674 kg | `catalyst V = Q/SV` | 4 204 147 € | 4 960 893 € |
| separator | V_R = 11.7916 m³ | `drum V = Q*tau` | 3 292 176 € | 3 884 768 € |
| let-down drum | V_R = 0.5288 m³ | `drum V = Q*tau` | 21 410 € | 25 264 € |
| **total** | | | **7 517 733 €** | **8 870 925 €** |

**The estimate class is AACE 18R-97 Class 4** — the "study or feasibility"
class, whose methodology 18R-97 states as *equipment factored or parametric
models*, which is exactly what a per-item size feeding a Guthrie/Turton
bare-module factor is.  **The class's maturity and accuracy bands are NOT
restated here**: `src/postProcessing/EstimateClass.H` is this repository's ONE
home for that table, transcribed from the standard, and it explains why the
engine does not pre-determine a single band for a class.  Read it there.

## 4. Why the converter's volume is a RULE, not a number

`tutorials/plant/ammonia02_full_plant` and
`tutorials/plant/greenAmmoniaIndustrialN2` both size this converter with
a `designRules` block carrying a literal `volume` and put the provenance in a `//` comment beside
it.  The design sheet then records the basis as `"volume (author-set)"` and
says nothing about a space velocity, because there is nothing about a space
velocity for it to read.  **A fact a reader must act on, living in a comment,
is a fact no reader and no gate can check.**

This case declares the rule instead, in grammar the engine already parses
(`src/postProcessing/sizing/VesselSize.cpp:83-85`):

```
designRules { spaceVelocity 259.665;   flowKey N_in_mol_s;  ... }
```

so the volume becomes an engine **output** computed from this run's own
converter throughput, and the rule travels into the specification sheet at
`design/converter/vessel`:

```
basis       "catalyst V = Q/SV";
...
assumed     ( corrosionAllow jointEfficiency );
```

`flowKey N_in_mol_s` puts the space velocity on the **inlet** gas, which is the
convention every published GHSV uses; the sizer's own default is the outlet,
which for this reaction is 22 % smaller because four moles become two.

`corrosionAllow` and `jointEfficiency` are **deliberately not declared**.  The
engine supplies both from `src/postProcessing/sizing/DesignDefaults`, announces
each at its site and in the end-of-run caveat block, and lists them in the
sheet's `assumed ( ... )` block — which is exactly the difference between a
number this case chose and a number the engine chose.  This is the one case in
the corpus whose subject is that distinction, so it exercises it rather than
silencing it.

### The basis trap in `spaceVelocity` — a finding, not a workaround

`VesselSize` builds Q_gas as `N·R·T/P` **at the unit's own (T, P)**, so its
`spaceVelocity` is on *actual* gas volume and `[1/h]` is the honest unit.
**Every space velocity in the ammonia literature is quoted on normal or
standard gas volume** — Nm³ of gas per m³ of catalyst per hour.  At these
conditions the two differ by

```
Q_normal / Q_actual = (273.15 K × 2.0e7 Pa) / (101 325 Pa × 700 K) = 77.022
```

so typing an industrial GHSV straight into this key under-sizes the bed by a
factor of 77, **at exit 0, with a plausible-looking volume and every balance
closing**.  The engine has no grammar for declaring which basis a space
velocity is on, and nothing in it can detect the substitution.  That is
recorded here and reported; no key was invented, because a key the engine does
not read is a comment.

The value declared is therefore stated in the engine's own basis, with the
arithmetic in the open:

```
20 000 Nm³/(m³·h) ÷ 77.022 = 259.665 h⁻¹   (actual gas, 700 K, 200 bar)
```

**Where 20 000 Nm³/(m³·h) comes from: it is a declared assumption.**  Those are
the words.  The only primary source retrieved that states a range is
US 4,568,530 (Mandelik, Cassata, Shires & van Dijk, MW Kellogg, issued
4 February 1986), *Ammonia synthesis*: the catalyst space velocities "are
generally between 5000 and 150,000 m³ per hour of gas per m³ of catalyst at
standard conditions".  That band is a factor of thirty wide, and the patent
does not say *which* standard conditions — the same basis ambiguity one level
up.  **It brackets 20 000 and does not source it.**

**And that quotation is weaker evidence than the approach-to-equilibrium one
above, which is why this paragraph says so.**  US 5,352,428's two sentences
were read out of the retrieved document itself; this one reached here through
a fetch-and-summarise of the patent page and was NOT verified by reading the
raw document.  A curator who wants to rely on it should retrieve US 4,568,530
and check the sentence before quoting it onward.

**What would replace it:** an integrated rate law with a pellet effectiveness
factor, which is stage D.  `AmmoniaSynthesisRate.{H,cpp}` exists under
`src/unitOperations/reactor/kinetics/` and is included by its own `.cpp` and by
a props bench — **by no reactor**.  Until that is wired, this volume is a
feasibility-class number: enough to cost a vessel, not enough to build one.

## 5. What this case REFUSES to claim

* **It does not claim a bed volume the engine computed.**  18.63 m³ is
  arithmetic on a declared space velocity and this run's own throughput.  It is
  the *first* of the three volumes a converter gets in a real project — space
  velocity at feasibility, an integrated rate law with an effectiveness factor
  at FEED, a licensor's guaranteed charge at detailed design — and it cannot
  answer bed depth, pressure drop, hot-spot temperature or catalyst ageing.
* **It does not claim a complete CAPEX.**  There are no compressors and no
  exchangers in this flowsheet at all: the loop is isobaric at 200 bar, with
  makeup compression and feed/effluent interchange folded into the unit duties.
  So this total is **partial in units**, not only in provenance, and it is
  missing the two largest rotating machines of a real loop.  Read
  `ammonia02_full_plant` for a loop that carries them.
* **It does not claim a material that can hold 220 bar.**  The engine warns on
  every run: `design pressure 220.0 bar EXCEEDS material 'SS316' rating
  100.0 bar`.  The catalogue carries four construction materials and none is a
  multi-layer forged low-alloy converter shell.  The wall thickness and weight
  follow from `sigma_y` regardless, so the cost is an ASME thin-wall estimate
  on a material nobody would build this vessel from.
* **It publishes no `estimateClass` the engine can read.**  `estimateClass` is
  read only by `EconomicsPass` (`src/postProcessing/EconomicsPass.cpp:393`),
  and this case runs no economics — it appraises nothing, because an NPV needs
  prices this case does not declare.  So the Class-4 statement in 3 is
  **prose**, not a machine-visible declaration.  That is a limitation of the
  engine's grammar, stated rather than hidden.

## 6. How much the ceiling costs — measured

Probes run outside the shipped case, by changing only the approach to the ends
of the range US 5,352,428 states:

| approach | per-pass N₂ conversion | converter outlet y(NH₃) | recycle / makeup | converter inlet, mol/s |
|---|---|---|---|---|
| 0 K (stage B, the ceiling) | 47.9288 % | 0.310807 | 1.0257 | 4 501.5 |
| **5 K (this case)** | **46.6023 %** | **0.300194** | **1.0778** | **4 617.4** |
| 10 K | 45.2867 % | 0.289846 | 1.1323 | 4 738.3 |
| 30 K | 40.1644 % | 0.251177 | 1.3739 | 5 275.4 |

The last column is the one that reaches the catalyst charge: at a fixed space
velocity the bed volume is proportional to it.  The converter inlet is
**2.6 % larger at a 5 K approach and 17.2 % larger at 30 K than the ceiling
says it will be**, so a bed sized on stage B's answer is short by that much —
and every balance closes in all four runs.  That is what "sizing against a fiction"
means in numbers.

## 7. Honest limitations of this loop

The per-pass conversions here are **higher** than an industrial loop's, because
the converter inlet carries only 0.82 mol% NH₃ against the 3.5 vol% of the
commercial converter US 5,352,428 describes — a quarter of it.  Two inherited
causes: the separator runs at 250 K / 200 bar
and condenses nearly all the ammonia, and the SRK package declares no binary
interaction parameters.  See stage B's README, section 5.  **46.60 % is this
flowsheet's realistic per-pass conversion, not the ammonia industry's.**

The converter is also isothermal at 700 K, where a real one is a train of
adiabatic beds with inter-bed cooling — see
`tutorials/plant/ammonia03_quench_converter`.

## 8. Running it

```bash
bin/choupo-lint  tutorials/plant/ammoniaStaged03_approach
bin/choupo-init0 tutorials/plant/ammoniaStaged03_approach
runCase          tutorials/plant/ammoniaStaged03_approach
cat tutorials/plant/ammoniaStaged03_approach/design/converter/vessel
```

## 9. Sources

* AACE International Recommended Practice No. 18R-97, *Cost Estimate
  Classification System — As Applied in Engineering, Procurement, and
  Construction for the Process Industries*, Table 1 (rev. 7 August 2020);
  transcribed once in `src/postProcessing/EstimateClass.H`.
* US 5,352,428, *High conversion ammonia synthesis*, M. L. Bhakta and
  B. J. Grotz, CF Braun and Co, issued 4 October 1994 — the approach-to-
  equilibrium definition, its sign, and the 0–30 °C design range.
* US 4,568,530, *Ammonia synthesis*, B. G. Mandelik, J. R. Cassata,
  P. J. Shires and C. P. van Dijk, MW Kellogg, issued 4 February 1986 — the
  space-velocity range.
* Turton et al., *Analysis, Synthesis and Design of Chemical Processes*,
  Appendix A — the bare-module correlation the costing pass cites for itself.
