# Green ammonia, 1200 t/day — feasibility study, 150 bar loop

**Illustrated design stage: FEL-2** (feasibility; FEL-2 in a three-stage
numbering, FEL 2 *Preliminary Design* in the five-phase one). The PEQ
2026-27 green-ammonia plant as it is studied at the **feasibility stage**.
The stage, what it decides and the simulation fidelity it uses are set out
in
[`docs/design/how-a-process-design-is-staged.md`](../../../docs/design/how-a-process-design-is-staged.md)
§2.3, and the EduTool *Front-End Loading* draws them.

**The estimate class is the author's statement, not the stage's.**
`system/postDict` declares `estimateClass 4` (AACE 18R-97, −30 % / +50 %):
that is the author's statement of how far this project is defined, which is
the standard's PRIMARY characteristic. It does not follow automatically from
the design stage illustrated or from the model used — a feasibility study of
a poorly defined project is a Class 5 estimate whatever its arithmetic.

```bash
source /path/to/Choupo/etc/bashrc
runCase -f .
```

It is rung 2 of the green-ammonia sequence, which the common entry
[`ammoniaRoutes01_screening`](../ammoniaRoutes01_screening) maps in full:

| rung | case | illustrated design stage | converter | exchangers | what it decides |
|---|---|---|---|---|---|
| 1 | [`ammoniaRoutes01_screening`](../ammoniaRoutes01_screening) | FEL-1, screening | none — overall equations at full conversion | none | which production routes deserve a study |
| 2 | **this case** | FEL-2, feasibility, 150 bar | one Gibbs reactor 5 K short of equilibrium | **duties only**, each bought from a utility; areas on an assumed U | is it feasible; the gross margin with the energy priced |
| 2 | [`greenAmmonia02_feasibility50bar`](../greenAmmonia02_feasibility50bar) | FEL-2, an exploratory alternative | the same, at 400 °C and 50 bar — a catalyst hypothesis | the same | what a low-pressure loop would change, *if* a catalyst allowed it |
| 3 | [`greenAmmonia03_basicDesign`](../greenAmmonia03_basicDesign) | FEL-3, basic design (process side) | three adiabatic catalyst beds on a rate law, volumes solved | every exchanger designed (Kern) | what exactly is built |

## What it is derived from, and the one thing that differs

It is a copy of the base case
[`greenAmmoniaPEQ_baseCase`](../greenAmmoniaPEQ_baseCase): the same feeds
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
| revenue R (ammonia at 0.530 EUR/kg) | 206.09 |
| raw materials C_RM (H₂ at 8.0 EUR/kg, N₂ at 0.0175 EUR/kg) | 566.43 |
| **R − C_RM** — the margin of stage 1 | **−360.33** |
| utilities C_UT, of which: | 32.42 |
| · electricity for the four compressors | 11.35 |
| · molten salt for the feed preheater | 26.40 |
| · ammonia refrigeration for the chiller | 9.41 |
| · cooling water | 0.92 |
| · LP steam on two flash drums | 0.03 |
| · HP steam raised by the converter (a **credit**) | −15.69 |
| **R − C_RM − C_UT** — the margin with the energy priced | **−392.75** |

Hydrogen is priced **as the base case prices it**, as a purchased raw
material at the 8.0 EUR/kg ACER gives as the average cost of renewable
(RFNBO) hydrogen in the EU (cited in `constant/economics`; the source states
a cost, and that the plant pays it at its fence is the case's reading). The
base data carry no electrolyser specific consumption, so the hydrogen is not
priced through electricity here; the electrolyser and its power are outside
this battery limit, inside that price.

The margin with the energy is an **upper bound**, and the run says so: the
`StorageFlash` must cool to −35 °C and the coldest catalogue utility boils
at −33.3 °C, so that 0.74 MW is listed as unserved, as in the base case.
Every price is a cited public figure (`constant/economics`): the ammonia is
sold at the EU's 2025 import unit value of conventional ammonia (0.530
EUR/kg), the hydrogen bought at ACER's 8.0 EUR/kg. At those prices the
margin is **negative before any energy is bought** (−360 M EUR/yr, the
hydrogen alone costing 2.7 times the ammonia's price): the margins show
the shape of the problem, not a market forecast, and say what price the
product would need, not what the market pays.

### The pinch: what the next stage can recover

`system/postDict` runs the pinch pass on the duties (`reports/pinch/`):

| | |
|---|---|
| heating the flowsheet buys today | 60.95 MW (the preheater, and 0.09 MW on two flash drums) |
| **minimum heating, Q_H,min** | **0** |
| minimum cooling, Q_C,min | 40.36 MW (against 101.3 MW cooled today) |
| pinch | at the hot end: 733.15 K hot / 723.15 K cold, ΔT_min 10 K |

The converter effluent is hot enough to preheat the converter's own feed
entirely: the 26.40 M EUR/yr of molten salt is the duty a process-to-process
match can carry instead. That match is the feed/effluent exchanger the
basic-design case installs, and the margin it reaches is that case's.

The reaction heat is **not** in the pinch population: the pass reads a
unit's generic duty `Q`, a Gibbs reactor publishes only `Q_kW`, and a
reaction heat is not a stream segment (`src/postProcessing/PinchPass.H`,
METHOD HYPOTHESES). It is served by the declared steam generation instead.

### The capital, for orientation

Sized on assumed U values (the base case's own, from before its
exchangers were designed) and costed by Turton, the fixed capital is
42.1 M EUR and the NPV −3 325 M EUR at the base case's appraisal knobs. The
estimate is Class 4 (−30 % / +50 %), and with this hydrogen price there is
no IRR: the base case's README says why that is a price, not a defect.

### The sensitivity: which input decides

`system/postDict` ends with a `sensitivity {}` block (DEV.md 4c C68): the
economics pass moves each input **alone** to two ends and prices the same
converged run again, through the same cash flow — a tornado, printed sorted
by NPV swing and written to `reports/economics/sensitivity.csv`. The FCI's
ends are the declared accuracy band itself (`relative accuracyBand;`), so
the −30 % / +50 % finally reaches the NPV. The three **prices' ends are
cited**: the lowest and highest figure the sources span (ammonia 0.439,
USGS US Gulf Coast FOB 2025, to 0.726 EUR/kg, the EU import unit value in
January-September 2026; hydrogen 4.95, the price ammonia producers said they
would pay in the second European Hydrogen Bank auction, to 10.0 EUR/kg, the
top of ACER's 7-10 range; nitrogen 0.0159 to 0.0175, OIES Table 2's six
"Present" values), each with its arithmetic in `constant/economics`. The
three utility bills ±20 %, the discount rate 8 % / 12 % and the stream
factor 0.85 / 0.95 are the customary round figures, not cited.

| input (low / high end) | NPV at low | NPV at high | swing |
|---|---|---|---|
| H₂ price (4.95 / 10.0 EUR/kg) | −1 737.26 | −4 366.05 | 2 628.79 |
| discount rate (8 % / 12 %) | −3 728.31 | −2 988.21 | 740.10 |
| NH₃ price (0.439 / 0.726 EUR/kg) | −3 535.36 | −2 871.74 | 663.62 |
| stream factor (0.85 / 0.95) | −3 147.86 | −3 502.03 | 354.18 |
| molten-salt bill, `hitecSalt` (×0.8 / ×1.2) | −3 285.40 | −3 364.49 | 79.09 |
| **FCI, the accuracy band** (29.44 / 63.09 M EUR) | −3 300.20 | −3 366.19 | 66.00 |
| HP-steam credit, `steamGenerationHP` (×0.8 / ×1.2) | −3 348.45 | −3 301.44 | 47.01 |
| electricity bill (×0.8 / ×1.2) | −3 307.94 | −3 341.95 | 34.01 |
| N₂ price (0.0159 / 0.0175 EUR/kg) | −3 321.18 | −3 325.04 | 3.86 |

M EUR; the base NPV is −3 324.94 M EUR. What it teaches:

* **The hydrogen price decides, the capital does not.** The hydrogen range
  the sources span swings the NPV by 2.6 G EUR — forty times the whole
  −30 / +50 % capital band (66 M EUR) — and the ammonia range by 0.66 G EUR,
  ten times. At this stage a better capital estimate cannot rescue or sink
  the project; the margin R − C_RM can. The capital band also moves the NPV
  about twice as far as the capital itself (66 M EUR for a 33.6 M EUR spread
  of FCI), because 0.180 FCI rides inside COM_d every year.
* **No single input flips the sign, and no end of any price comes close.**
  Hydrogen at 4.95 EUR/kg leaves the NPV at −1 737 M EUR, ammonia at 0.726
  at −2 872 M EUR; neither has an IRR. This case declares no `breakEven`;
  the base case prints the exact ones (its README: ammonia at 1.93 EUR/kg,
  3.6 times the market price, or hydrogen at 1.79 EUR/kg), and a reading
  across this table would not be exact, because the tax credit on losses
  changes slope where the plant starts to pay tax. Both moving together is
  a different question — a one-at-a-time sensitivity does not ask it, by
  construction.
* **Two bars point the "wrong" way, and both say the same thing.** A higher
  discount rate makes the NPV *less* negative, and more hours on stream make
  it *worse*: the plant loses money on every hour it runs (R − COM_d =
  −541.1 M EUR/yr), so discounting those losses harder, or running fewer
  hours, helps. Both bars are now larger than the capital band's.
* **The molten-salt bill outranks the capital band** — the 26.4 M EUR/yr
  that the pinch says a feed/effluent match can avoid (the basic-design
  case installs it).

It is a **sensitivity, not an uncertainty analysis**: no probability is
attached to any end, and inputs that move together in a market (the
hydrogen and the electricity prices) are moved one at a time. The table's
own header says so. And the NPV includes the engine's assumed tax credit on
losses (869.9 M EUR of it here: the base case's README says what that
reading assumes).

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
