# CLAUDE.md -- Choupo case: steady/acetone02_luyben_reactor

You are helping AUTHOR this Choupo **case** (the dicts under `system/`,
`constant/` and `0/`), NOT editing the C++ engine.

Programme record:
[`docs/design/acetone-ipa-reference-case.md`](../../../../docs/design/acetone-ipa-reference-case.md).
Sibling: `tutorials/props/compare/acetone01_ipa_water_azeotrope` (the
thermodynamics of the same plant, measured).

## Intent (this case) -- keep this updated as the project develops

- **Goal:** the first PROCESS slice of Luyben's acetone flowsheet. One unit,
  chosen because its answer does not depend on the mixture thermodynamics:
  at 623 K everything is vapour and no activity model is consulted. What is
  exercised is stoichiometry, the elements-datum heat of reaction, and the
  energy balance.

- **The feed is derived from the paper's own stream table** (arithmetic in the
  `flowsheetDict` header) and closes on Luyben's stated total to 0.02 % and on
  his stated conversion to 0.0 %. Two independent checks on a hand
  transcription.

### What it found, measured 2026-08-12

**1. The stoichiometry closes exactly.** Rout matches Luyben's four mole
fractions to five figures. This is *not* validation and the golden says so:
the feed was derived from that same table, so the agreement verifies the
stoichiometry and the transcription, not the model. Anchoring it would be the
LiCl circularity.

**2. The heat of reaction is 22.5 % below the paper's.**

| | value |
|---|---|
| Luyben (2011), stated | **62.9 kJ/mol** |
| Choupo, derived from formation data | **48.72 kJ/mol** |

Choupo never reads a `dH_rxn` key — it derives the heat from each species'
own `standardThermochemistry`, and **isopropanol's is a Joback estimate**
(`dHf_298 = −262.76 kJ/mol`) because Choupo has no curated isopropanol.
Acetone's and hydrogen's are curated. So the whole 14.2 kJ/mol gap is carried
by one estimated number, and it propagates straight into a furnace duty.

*This is the multi-scale point the sibling case makes on the VLE side, on the
energy axis instead: an approximation made at the component level is still
alive several units later.* A curated isopropanol would close most of it.

**No `anchor` row was authored for the 62.9**, deliberately. An anchor whose
band cannot admit the observed value would put the suite in the red, and the
rule is *report, never tune*. The disagreement is reported here and in the
programme record; it becomes an anchor the day isopropanol is curated.

**3. AN ENGINE DEFECT, found by the first-law report, reproduced — and FIXED
on 2026-08-13.  Both states are kept, because the sequence is the record.**

*What the run used to raise:*

> `ENERGY balance, unit 'reactor': dH = 1442.4 kW vs declared items 470.5 kW
> (306.6 % closure) — An UNEXPLAINED first-law residual`

`conversionReactor` reported `Q_kW` = **the reaction enthalpy alone**
(extent × ΔH_rxn = 34.767 kmol/h × 48.7173 kJ/mol = 470.49 kW, exact) while
declaring an **outlet temperature**. The heat needed to bring the feed to that
temperature was simply absent. It was reproduced by sweeping the inlet
temperature and watching the declared duty *not move*:

| T_in | vf_in | Q declared | ΔH of the streams | residual |
|---|---|---|---|---|
| 389 K | 0.00 | 470.49 kW | 1442.44 kW | 971.95 kW |
| 420 K | 0.00 | 470.49 kW | 1357.40 kW | 886.92 kW |
| 450 K | 0.00 | 470.49 kW | 1266.26 kW | 795.78 kW |

**A duty that is invariant to the inlet state is not a duty.** Everywhere else
in this engine `Q_kW` on a unit means the heat crossing its boundary.

*What it is now.* `Q_kW` is the first law over the unit,
H(outlet state) − H(inlet state), published beside its two exact parts:

> `dH_rxn = 48.7 kJ/mol  (ideal-gas/formation rung -- the reaction's own property)`
> `duty Q = 840.3 kW  (net added)`
> `  = reaction 470.5 kW at 623.00 K  +  sensible 369.8 kW heating the feed from 389.00 K`

The split is Hess's law and is exact, not an apportionment. Against Luyben's
reactor duty of **0.960 MW** this case reads **0.840 MW — 87.5 %**, where
it read **49 %** before. Nothing was tuned; a term that belonged in the sum
was put in it.

**Only one case in the corpus moved**, and that is the check on the change:
every other reactor is fed at its own temperature, where the new term is
identically zero, so their numbers are byte-identical. `tutorials/plant/hda`
moved from −1338 kW to **+18723 kW**, which is not a regression but the same
defect at plant scale — its flowsheet has no feed preheater, so the reactor
itself is heating 2122 kmol/h from 330 K to 900 K, and the old number hid a
20 MW furnace load.

### The SURFACE was the second half of it — closed 2026-09-25

Between 2026-08-13 and 2026-09-25 both terms of that duty were sums of
`h_pure_ig` — IDEAL GAS — while the stream this unit publishes is priced by
the package. One reactor, two enthalpy surfaces; the family CLAUDE.md §6
names, and the shape `gibbsReactor` was taken off on 2026-09-08. The run
announced it rather than hiding it, in a `[rating]` line saying its own ledger
would not reconcile — which is better than silence and worse than not having
the gap. Both terms now go through the SAME resolve-then-price call the energy
report applies to these very streams, so the `[rating]` line is gone with the
thing it warned about, and `dH_rxn` (the reaction's own property, on the
elements datum) is printed as the separate quantity it always was.

*And the surface fix is what finally showed where the residual really lives.*
The 2026-08-13 note above said the remaining gap was the feed's latent heat.
It was — but not because a reactor refuses to price one. **This case never
declares the phase of its streams.** `0/Rin` and `0/Rout` carry no
`vaporFraction` and no `phase`, so `vf` defaults to 0 and is *unpinned*; the
energy report has always priced both of them on the LIQUID leg, at 389 K and
at 623 K, and a superheated 623 K stream is not a liquid. The unit's ideal-gas
duty and the report's liquid pricing disagreed by exactly that, and the gap
had a name only in the unit's warning.

MEASURED, by running a copy of this case with one line added to `0/Rin`
(`phase gas;`) and nothing else changed:

| `0/Rin` | `Q_kW` | `Q_reaction_kW` | `Q_sensible_kW` | plant residual |
|---|---:|---:|---:|---:|
| as shipped (no phase declared) | 1051.833460 | 247.477646 | 804.355814 | **0.000000 kW** |
| + `phase gas;` | **840.263235** | **470.487528** | **369.775707** | **4.5e-13 kW** |

The three duty columns of the second row are this case's shipped goldens
**to the last recorded digit** (840.263234652 / 470.487527672 / 369.77570698);
its boundary rows move, because pinning the inlet also re-prices `H_feeds_kW`
(−4599.214607 → −3997.038663) and `H_products_kW` (−3547.381147 →
−3156.775428).  So the surface fix moves no duty that the case's own
declaration would have settled: what it does is make the unit say the same thing as the report, and
then the *case* becomes the thing that decides which of the two answers is
right. `docs/ai/pitfalls.md` already carries this rule — *any feed that is not
a liquid at its (T, P) needs its phase pinned* — and this case does not follow
it.

**The one-line case fix is NOT made here**, because it moves further golden
rows and re-recording is the architect's act. Until it is, this case ships
goldens recorded under the ideal-gas duty and `bin/runTests` FAILS it on five
rows.

- **Pending / in curation:**
  - a curated `isopropanol` in `data/standards/` (would close most of the
    ΔH_rxn gap) — Vítor's call, curation is reserved;
  - the reactor's LIQUID-PRICED INLET (§3): the DUTY half is closed
    (2026-09-25, the duty is on the package's own surface), and what is left
    is one declared line in `0/Rin` — `phase gas;` — which the measurement in
    §3 shows reproduces this case's shipped goldens exactly and closes the
    first law at 4.5e-13 kW.  Not made: it moves golden rows, and
    re-recording is the architect's act;
  - the reactor's SIZE: Luyben specifies 450 tubes and a 624 K jacket, but the
    design record has no tube dimensions, so a `pfr` on his kinetics cannot be
    dimensioned from what is in hand. The kinetics are transcribed in the
    record and deliberately unused here.
