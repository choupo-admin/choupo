# Green ammonia, 1200 t/day — the feasibility stage (FEL-2)

The PEQ 2026-27 green-ammonia plant as it is studied at the **feasibility
stage**: FEL-2 in a three-stage numbering (FEL 2, *Preliminary Design*, in
the five-phase one), whose estimate is an AACE **Class 4** type study. The
stage, what it decides and the simulation fidelity it uses are set out in
[`docs/design/how-a-process-design-is-staged.md`](../../../docs/design/how-a-process-design-is-staged.md)
§2.3, and the EduTool *Front-End Loading* draws them.

```bash
source /path/to/Choupo/etc/bashrc
runCase -f .
```

It is one of three cases that describe the same plant at successive stages:

| case | stage | converter | exchangers | what it decides |
|---|---|---|---|---|
| **this case** | feasibility, FEL-2, 150 bar | one Gibbs reactor 5 K short of equilibrium | **duties only**, each bought from a utility; areas on an assumed U | is it feasible; the gross margin with the energy priced |
| [`greenAmmoniaFeasibility50bar`](../greenAmmoniaFeasibility50bar) | the same study, 50 bar loop | the same, at 400 °C | the same | what a low-pressure loop would change, *if* a catalyst allowed it |
| [`greenAmmoniaBasicDesign`](../greenAmmoniaBasicDesign) | basic design, FEL-3 (process side) | three adiabatic catalyst beds on a rate law | every exchanger designed (Kern) | what exactly is built |

Stage 1 — screening several reaction routes on their stoichiometric gross
margin — is not a case: it is the *Route screening* EduTool, which today
screens methanol routes only (`screen01_methanol_routes`).

## What it is derived from, and the one thing that differs

It is a copy of the base case
[`greenAmmoniaIndustrialN2`](../greenAmmoniaIndustrialN2): the same feeds
(project base data v2), the same property package and records, the same
utility records — the case-local HP-steam credit included — the same
compressors, loop pressure, separation, purge and let-down, and the same
Gibbs converter at 460 °C, 5 K short of equilibrium, whose heat is declared
as HP steam raised. Read the base case's README for all of that.

**What differs is the feed/effluent exchanger: there is none.** At this
stage no exchanger network exists yet, so:

* the loop gas is heated to the base data's 380 °C converter inlet by a
  **duty**, `FeedPreheater`, and
* the converter effluent is cooled from 460 °C to 72 °C by a **duty**,
  `EffluentCooler` (72 °C keeps the sensible cooling apart from the
  condensation that the `WaterCooler` carries; it is an author-set split
  point).

Each duty is served by the cheapest catalogue utility that can take it
(the engine's allocation, DEV.md 4c C52): the preheater by molten salt
(`hitecSalt`), the effluent cooler by cooling water. The single recycle
cut is the separator vapour (`system/solverDict`).

Douglas's hierarchy, for orientation: this case covers the input-output
structure, the recycle structure and the separation of the product (his
levels 2-4) with a heat-exchanger network left as **targets** (level 5).

## What the run shows

Every number below is read off a run of this case; the golden
(`expected`) is the authority on all of them.

| | |
|---|---|
| ammonia produced | 1180.3 t/day |
| converter outlet | 19.70 % NH₃ at 460 °C, 150 bar |
| recycle / make-up | 13 378 / 5 880 kmol/h (ratio 2.28) |
| hydrogen converted per pass | 29.7 % (2 928 kmol/h NH₃ made from 14 802 kmol/h H₂ in the converter feed) |
| converter heat, raised as HP steam | 30.94 MW (18.05 kg/s of steam) |
| feed preheat (bought) | 60.86 MW of molten salt |
| effluent cooling (to cooling water) | 59.17 MW |
| refrigeration (−20 °C) | 20.24 MW |
| compression | 13.67 MW, 278 kWh/t |
| plant first law | closes to 9.0 kW (0.004 %) |

### The gross margin

The economics pass publishes the margin a feasibility study is decided on,
before any capital (`grossMargin_RM`, `grossMargin_RM_UT`, DEV.md 4c C57):

| | M EUR/yr |
|---|---|
| revenue R (ammonia at 1.00 EUR/kg) | 387.73 |
| raw materials C_RM (H₂ at 4.50 EUR/kg, N₂ at 0.05 EUR/kg) | 331.65 |
| **R − C_RM** — the margin of stage 1 | **56.08** |
| utilities C_UT, of which: | 31.50 |
| · electricity for the four compressors | 11.35 |
| · molten salt for the feed preheater | 25.91 |
| · ammonia refrigeration for the chiller | 9.10 |
| · cooling water | 0.91 |
| · LP steam on two flash drums | 0.03 |
| · HP steam raised by the converter (a **credit**) | −15.81 |
| **R − C_RM − C_UT** — the margin with the energy priced | **24.58** |

Hydrogen is priced **as the base case prices it**, as a purchased raw
material at an author-set 4.50 EUR/kg. The base data carry no electrolyser
specific consumption, so the hydrogen is not priced through electricity
here; the electrolyser and its power are outside this battery limit, inside
that price.

The margin with the energy is an **upper bound**, and the run says so: the
`StorageFlash` must cool to −35 °C and the coldest catalogue utility boils
at −33.3 °C, so that 0.74 MW is listed as unserved, as in the base case.
And every price is an author-set assumption (`constant/economics`), chosen
so the appraisal runs: read the margins as the shape of the problem, not
as a market forecast.

### The pinch: what the next stage can recover

`system/postDict` runs the pinch pass on the duties (`reports/pinch/`):

| | |
|---|---|
| heating the flowsheet buys today | 60.95 MW (the preheater, and 0.09 MW on two flash drums) |
| **minimum heating, Q_H,min** | **0** |
| minimum cooling, Q_C,min | 40.36 MW (against 101.3 MW cooled today) |
| pinch | at the hot end: 733.15 K hot / 723.15 K cold, ΔT_min 10 K |

The converter effluent is hot enough to preheat the converter's own feed
entirely: the 25.91 M EUR/yr of molten salt is the duty a process-to-process
match can carry instead. That match is the feed/effluent exchanger the
basic-design case installs, and the margin it reaches is that case's.

The reaction heat is **not** in the pinch population: the pass reads a
unit's generic duty `Q`, a Gibbs reactor publishes only `Q_kW`, and a
reaction heat is not a stream segment (`src/postProcessing/PinchPass.H`,
METHOD HYPOTHESES). It is served by the declared steam generation instead.

### The capital, for orientation

Sized on assumed U values (the base case's own, from before its
exchangers were designed) and costed by Turton, the fixed capital is
41.4 M EUR and the NPV −493 M EUR at the base case's appraisal knobs. The
estimate is Class 4 (−30 % / +50 %), and with this hydrogen price there is
no IRR: the base case's README says why that is a price, not a defect.

## What this case does NOT claim

* **No heat-exchanger network.** The pinch gives targets; the matches,
  their areas and their cost are the next stage's.
* **No reactor size.** A Gibbs reactor has no volume; the converter vessel
  is sized on an assumed space velocity, as in the base case.
* **No kinetics.** The 5 K approach says what an equilibrium-limited
  converter would deliver at 460 °C, not what a catalyst bed does.
* **No exchanger geometry.** Every area is A = Q/(U·LMTD) on an author-set U.
* Everything the base case lists as not in it (the purge scrubber, the
  let-down gas recovery, the cooling-water, refrigeration and steam
  systems as equipment) is not here either.
