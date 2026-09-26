# `ammoniaStaged01_yield` — stage A of the staged design sequence

**A DECLARED CONVERSION AND NOTHING ELSE.**  The reactor is a
`conversionReactor`: it converts 25 % of the inlet nitrogen because this
case's dictionary says so, and it would do the same at any temperature and
any pressure, whether or not equilibrium allows it.  That is what a yield
reactor *is*.

**READ SECTION 4 BEFORE QUOTING ANY DUTY FROM THIS CASE.**  DEV.md's C8
entry gives this stage exactly one claim — *"Claims a mass balance"* — and
that wording is load-bearing rather than loose.  **This case cannot honestly
claim a converged HEAT balance**, and the reason is the engine rather than
the stage: its first law is out by 2 278.14 kW.  The engine announces it
loudly on every run, and section 4 diagnoses it with a probe.

## 1. Where this sits

Three cases form a ladder of reactor fidelity over one unchanged ammonia
synthesis loop.  **Between consecutive stages exactly one thing moves: the
reactor model.**  Feed, pressure, components, property package, recycle plan,
tear seed, separator, let-down and purge are byte-identical across all three.

| | reactor | claims | must not claim |
|---|---|---|---|
| **A** *this case* | `conversionReactor`, declared conversion | a material balance | a reactor size; an equipment-factored cost |
| **B** `ammoniaStaged02_equilibrium` | `gibbsReactor`, true equilibrium | the thermodynamic ceiling | any size, any cost |
| **C** `ammoniaStaged03_approach` | `gibbsReactor` + 5 K approach | a realistic outlet | a bed volume the engine computed |
| **D** `ammoniaStaged04_kinetic` | adiabatic `pfr` on the Dyson & Simon (1968) rate law, volume solved by a DesignSpec | a bed volume the engine computed | a pellet effectiveness factor (announced as unpriced); a cost |

Background: `docs/design/how-a-process-design-is-staged.md`, and DEV.md C8.

## 2. What this case claims

**A converged MATERIAL balance over the whole loop**, and the consequences of
one declared number.

| quantity | value |
|---|---|
| converter inlet | 28 516.83 kmol/h, y(NH₃) = 0.011439 |
| converter outlet | 25 084.32 kmol/h, y(NH₃) = 0.149843 |
| per-pass N₂ conversion | **25.0000 %** — *declared*, and reproduced exactly |
| recycle / makeup (molar) | 2.5646 |
| product | 3 461.07 kmol/h at 98.6072 mol% NH₃ → 1 394.9 t/d NH₃ |
| global mass closure | 99.9976 % |
| **global first-law residual** | **−2 278.14 kW (−1.3316 %)** — see section 4 |

## 3. What this case REFUSES to claim — the load-bearing half

* **No reactor size.**  A declared conversion contains no length scale, no
  contact time and no catalyst.  There is nothing here from which a volume
  follows.
* **No cost — and the reason is the METHODOLOGY, not squeamishness.**  This
  case carries **no `system/postDict`**.  A stage-A estimate is AACE 18R-97
  **Class 5**, whose methodology the standard states as *capacity factored,
  parametric models, judgment, or analogy* — the whole plant scaled from a
  reference plant, with **no individual item sized at all**.  Choupo's costing
  chain is per-item Guthrie/Turton bare-module: **equipment factored**, which
  18R-97 lists against **Class 4**, not Class 5.  So the engine cannot produce
  the RIGHT KIND of cost at this stage.  It could produce a *number*; the
  number would be a Class-4 answer wearing a Class-5 label.  The class table
  is transcribed once, in `src/postProcessing/EstimateClass.H` — read the
  bands there, never from prose.
* **It does not claim the 25 % is right.**  See section 5.

## 4. THE HEAT BALANCE DOES NOT CLOSE, AND IT IS NOT THE CASE'S FAULT

The engine's own report says so, at verbosity 3, in the run banner, in the
end-of-run caveat block and in the result JSON:

```
ENERGY BALANCE FAILED -- unit 'converter'
dH = 53257.785726 kW vs declared items 50979.639980 kW  (104.468736 % closure)
```

**The diagnosis.**  `ConversionReactor::solve` prices its duty entirely on the
ideal-gas rung — `src/unitOperations/reactor/ConversionReactor.cpp:143-149`
sums `thermo.comp(i).h_pure_ig(T)` for both the reaction term and the sensible
term — while the streams it produces are priced by this case's property
package, whose vapour is **SRK at 200 bar**.  Two enthalpy surfaces, one unit.
This is the family CLAUDE.md section 6 names: *the state a unit computes with is not
the state its streams carry.*  `GibbsReactor` was moved onto the package's own
`H_stream_formation` surface on 2026-09-12; `ConversionReactor` was not.

**The probe that establishes it.**  A copy of this case outside the tree, with
one word changed — `fugacityModel SRK;` → `fugacityModel idealGas;` — and
nothing else:

| package | converter energy closure | global first-law residual |
|---|---|---|
| SRK (this case) | 104.47 % | −2 278.14 kW (−1.3316 %) |
| ideal gas (probe) | **100.00 %** | **0.0000 kW** |

When the two surfaces are made the same, the residual is exactly zero.  The
2 278 kW is the SRK residual enthalpy the unit's duty never saw.

**Why the unit says nothing.**  It has a `[rating]` announcement for exactly
this hazard — but the guard at `ConversionReactor.cpp:177` is
`haveDuty && T_feed != T && vf_in < 1.0`, so it fires only for a **two-phase or
liquid** inlet.  A single-phase vapour priced by a cubic equation of state is
the other half of the same defect and is **silent**.  Here `vf_in = 1.0`, so
nothing is announced at the unit; only the plant-level report catches it.

**This is not unique to this case.**  `check_energy_closure`'s `KNOWN_OPEN`
ledger already pins `tutorials/plant/hda` at 4.246 %,
`tutorials/steady/reactors/acetone02_luyben_reactor` at 25.179 % and
`tutorials/steady/flowsheets/acetone03_luyben_reaction_section` at 33.308 % —
all three `conversionReactor` cases, and in `acetone02`'s committed per-unit
report the reactor is the *only* unit and it closes at 125.18 %.  acetone02
runs `fugacityModel idealGas`, so its gap is the liquid half of the same split
rather than the EOS half.  **This case is the isolated witness for the EOS
half**, because it is a single-phase vapour loop where every other unit closes
to within 0.01 kW.

**What was NOT done, deliberately.**  The conversion was not lowered to bring
the residual under `check_energy_closure`'s 1.0 % band, and the property
package was not switched to ideal gas to make the stage close.  Either would be
choosing a number to satisfy a gate.  Nothing in `src/` was touched.

## 5. Where the 25 % comes from: IT IS A DECLARED ASSUMPTION

Those are the words, and they are deliberate.

**No primary source retrieved for this case states a per-pass nitrogen
conversion for an ammonia synthesis converter as a number.**  What *is* sourced
is the closest measurable neighbour: US 5,352,428 (Bhakta & Grotz, CF Braun and
Co, 4 October 1994) describes a commercial converter taking **3.5 vol% NH₃ in
to 16.1 vol% NH₃ out**, conditions the patent calls "typical and optimum in
many commercial process designs".  Turning that pair into a nitrogen conversion
needs the feed's H₂:N₂ ratio and its inert content, which the passage does not
give.  **So the patent brackets 0.25 and does not source it.**

**What would replace it: stages B and C.**  That is the entire point of the
ladder, and the verdict is recorded here as measured, whichever way it fell:

| | per-pass N₂ conversion | converter outlet y(NH₃) | recycle / makeup | NH₃ product |
|---|---|---|---|---|
| **A — the 25 % assumption** | **25.0000 %** | 0.149843 | **2.5646** | 1 394.9 t/d |
| B — the ceiling | 47.9288 % | 0.310807 | 1.0257 | 1 525.9 t/d |
| C — 5 K approach | 46.6023 % | 0.300194 | 1.0778 | 1 521.5 t/d |

**The screening assumption was PESSIMISTIC, and the price is visible.**  Stage
A recirculates 2.56 mol per mol of makeup where stage C needs 1.08 — 2.4
times the recycle, which puts **1.72 times as much gas through the converter**
(28 516.83 against 16 622.66 kmol/h).  Every unit on the loop is over-sized by
that ratio, and so in a real plant would be the interchanger and the recycle
compressor this flowsheet does not draw.  And it still makes **8.3 % less
ammonia than stage C**, because the larger recycle carries more argon out
through a larger purge.  **An assumption is not a lie; an assumption never
checked is.**

Be careful reading stage A's outlet y(NH₃) = 0.1498 against the patent's
16.1 vol%.  They are close, and the closeness is a coincidence: the patent's
converter starts from a three-times-richer inlet (3.5 mol% NH₃ against
1.14 % here).  See stage B's README, section 5, for why this loop's inlet is so lean.

## 6. Design choices this case makes, and where they are declared

* **The limiting reactant is nitrogen** (`constant/reactions`).  Per-pass
  conversion in the ammonia literature is normally quoted on nitrogen, so this
  is the reading a reader expects — but it *is* a reading, and it is declared
  where the engine reads it rather than assumed.
* **No `dH_rxn` is declared.**  All three reacting species carry
  `standardThermochemistry`, so the engine derives dH_rxn(T) from the
  elements/formation datum.  It reports −105.351 kJ/mol of extent at 700 K.
  A declared `dH_rxn` here would be a second source of truth for a derivable
  number.
* **The converter is isothermal at 700 K.**  A real converter is a train of
  adiabatic beds with inter-bed cooling; see
  `tutorials/plant/ammonia03_quench_converter`.

## 7. Running it

```bash
bin/choupo-lint  tutorials/plant/ammoniaStaged01_yield
bin/choupo-init0 tutorials/plant/ammoniaStaged01_yield
runCase          tutorials/plant/ammoniaStaged01_yield
```

```bash
# the one thing that moves between stages A and B
diff tutorials/plant/ammoniaStaged01_yield/system/flowsheetDict \
     tutorials/plant/ammoniaStaged02_equilibrium/system/flowsheetDict
```

## 8. Sources

* AACE International Recommended Practice No. 18R-97, *Cost Estimate
  Classification System — As Applied in Engineering, Procurement, and
  Construction for the Process Industries*, Table 1 (rev. 7 August 2020);
  transcribed once in `src/postProcessing/EstimateClass.H`.
* US 5,352,428, *High conversion ammonia synthesis*, M. L. Bhakta and
  B. J. Grotz, CF Braun and Co, issued 4 October 1994.
