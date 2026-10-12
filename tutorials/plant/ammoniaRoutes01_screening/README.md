# Ammonia production routes, screened on paper

The common entry to the ammonia cases. Before any flowsheet exists, three
**production routes** to ammonia are compared on their input-output balance —
Douglas' first level — and on the energy each one needs, so that only the
routes worth a feasibility study go on to one.

```bash
source /path/to/Choupo/etc/bashrc
runCase -f .
```

**Illustrated design stage: screening** (FEL-1 in a three-stage numbering).
No equipment exists yet, so nothing here is sized or costed.

## Where this case sits

This is rung 1. The green route then continues through the green-ammonia
sequence, whose cases will carry these names:

| rung | future name | what it adds | directory today |
|---|---|---|---|
| 1 | `ammoniaRoutes01_screening` | this case: the routes on paper | — |
| 2 | `greenAmmonia02_feasibility150bar` | the loop with its recycle and purge, an equilibrium converter, every duty priced | [`greenAmmoniaFeasibility`](../greenAmmoniaFeasibility) |
| 2 | `greenAmmonia02_feasibility50bar` | the same loop at 50 bar | [`greenAmmoniaFeasibility50bar`](../greenAmmoniaFeasibility50bar) |
| 3 | `greenAmmonia03_basicDesign` | kinetic catalyst beds, every exchanger designed | [`greenAmmoniaBasicDesign`](../greenAmmoniaBasicDesign) |
| — | `greenAmmoniaPEQ_baseCase` | the PEQ project's reference plant (a hybrid of rungs 2 and 3) | [`greenAmmoniaIndustrialN2`](../greenAmmoniaIndustrialN2) |

The directories still carry their old names until the renaming slice lands.

## The three routes

The synthesis reaction is the same in all three, N₂ + 3 H₂ → 2 NH₃. The
routes differ in where the hydrogen and the nitrogen come from, and that is
all an overall equation keeps.

| route | what it is | overall equation (per 2 NH₃) |
|---|---|---|
| **green** | water electrolysis (H₂), air separation (N₂), synthesis | 3 H₂O + N₂ → 2 NH₃ + 3/2 O₂ |
| **grey** | steam reforming of methane, water-gas shift, air in a secondary reformer, synthesis; the CO₂ is emitted | 0.884157 CH₄ + 1.231686 H₂O + 0.268314 O₂ + N₂ → 2 NH₃ + 0.884157 CO₂ |
| **blue** | grey, with the process CO₂ captured and stored | the same as grey |

Every equation balances; the element count of each side is written in
[`constant/reactions`](constant/reactions). The grey coefficients are not
data. The air that brings the nitrogen brings oxygen with it, in air's own
ratio O₂/N₂ = 0.2095/0.7808 (taken as 0.268314), and that oxygen is burnt
inside the process. The methane and the water then follow from the oxygen
and hydrogen balances: CH₄ = 3/4 + O₂/2 and H₂O = 2 CH₄ − 2 O₂. This is the
**ideal** plant, in which every carbon atom leaves as CO₂ and none is burnt
for heat.

## What the run computes

Each route is a conversion reactor at X = 1 on its overall equation, sized
to make 2936 kmol/h of NH₃ (1200.0 t/day, the PEQ base case's design rate).
Three more units supply the numbers a screen needs beside the routes. None
needs a rate law.

| unit | what it gives |
|---|---|
| `electrolytic`, `reforming` | the raw materials per kg of NH₃ (their feeds), the heat of reaction (`dHrxn_kJ_per_mol`, per 2 mol NH₃) |
| `waterSplitting` | H₂O → H₂ + ½ O₂ on the route's water: its duty is the least power a thermoneutral electrolyser fed steam can be supplied with |
| `combustion` | CH₄ + 2 O₂ → CO₂ + 2 H₂O: its heat of reaction is the lower heating value of methane |
| `synthesis150`, `synthesis50` | the shared synthesis step at equilibrium, 700 K, ideal gas |

The route units run at 298.15 K and 0.02 bar. **That is the reference state,
not a process condition.** Below the vapour pressure of water at 25 °C every
species is the ideal gas its formation datum is written for, and an ideal
gas's enthalpy does not depend on pressure. Every heat below is therefore a
standard one, with water as vapour (the lower-heating-value basis).

| per kg NH₃ | green | grey / blue |
|---|---|---|
| raw materials, kg | water 1.587, N₂ 0.822 | CH₄ 0.416, water 0.651, air 1.089 |
| by-product, kg | O₂ 1.409 | CO₂ 1.142 |
| heat of reaction, kJ/mol NH₃ | +316.8 (endothermic) | −38.0 (exothermic) |
| heat of reaction at 1200 t/day | +258 MW | −31 MW |

The green route **cannot run on heat**: it needs 18.6 MJ of energy per kg of
NH₃, and an electrolyser supplies it as electricity. The electrolyser alone,
fed steam, needs at least 33.3 kWh per kg of H₂ — 5.92 kWh per kg of NH₃.
An electrolyser fed liquid water must also pay the water's enthalpy of
vaporisation (the higher-heating-value basis), so its floor is higher. The
lower heating value of methane comes out at 50.0 MJ/kg.

**The utility table of the run is not a design.** Every steady run hands
each unit's duty to the utility allocation, which reads these reference-state
heats as duties at 25 °C and serves them with low-pressure steam and chilled
water. No steam heats an electrolyser: the rows are what the allocation does
with a number that is a heat of reaction, not a process duty, and the screen
reads none of them.

The synthesis equilibrium at 700 K converts 40.6 % of the nitrogen at
150 bar (25.5 % NH₃ in the outlet gas) and 21.3 % at 50 bar (11.9 %). It is
the same in every route, so it decides nothing between them. It says what
the next rung must add: a recycle loop. Both figures are ideal-gas
equilibria; a real equation of state moves the 150 bar one.

## The basis: prices and assumed specific consumptions

A margin from the material balance alone does not compare these routes:
electricity, reformer fuel and CO₂ handling decide the result. So every
route is priced twice, on its raw materials and then after the energy it
needs, each energy term an **assumed specific consumption** per kg of NH₃.

**Prices.** Three come from the PEQ base case; the rest are AUTHOR-SET
ASSUMPTIONS, round figures of the right order chosen so the arithmetic can
run. None is market data, and none cites a source, because none was read.
Replace each with a dated, cited figure before quoting a margin.

| item | price | where it comes from |
|---|---|---|
| ammonia (product) | 1.00 EUR/kg | PEQ base data, `greenAmmoniaIndustrialN2/constant/economics` (itself author-set there: "a green premium over grey ammonia, assumed") |
| hydrogen | 4.50 EUR/kg | PEQ base data, the same file (author-set there) |
| nitrogen (ASU) | 0.05 EUR/kg | PEQ base data, the same file (author-set there) |
| electricity | 27.8 EUR/GJ = 0.100 EUR/kWh | `data/standards/utilities/electricity.dat`, the record the PEQ base case imports (an industrial tariff of the order of Turton et al., Table 8.3) |
| natural gas (CH₄) | 0.50 EUR/kg | author-set assumption |
| process water | 0.002 EUR/kg | author-set assumption |
| air, and O₂ from electrolysis | 0 | author-set: air is free, the O₂ is not sold |
| CO₂ emitted (a carbon price) | 0.08 EUR/kg | author-set assumption |
| CO₂ transport and storage | 0.02 EUR/kg | author-set assumption |

**Specific consumptions.** All AUTHOR-SET ASSUMPTIONS except the loop
compression, which is a Choupo result. None cites a source.

| term | value | applies to |
|---|---|---|
| electrolysis | 55 kWh electricity per kg H₂ (the engine's floor, fed steam, is 33.3) | green |
| air separation | 0.25 kWh per kg N₂ | green |
| synthesis-loop compression | 0.28 kWh of shaft work per kg NH₃, ÷ 0.95 motor efficiency | all routes. The shaft work is the PEQ base case's own computed figure (13.67 MW at its ~1180 t/day); the 0.95 is `electricity.dat`'s `driveEfficiency` |
| reformer fuel | 8 GJ (LHV) per t NH₃, beyond the feed methane | grey, blue |
| CO₂ compression | 0.11 kWh per kg CO₂ captured | blue |

Blue captures the **process** CO₂ only, the stream every reforming plant
already separates because the synthesis catalyst cannot take it. The CO₂ of
the burnt fuel leaves with the flue gas and is charged the carbon price.
The year is 7884 h on stream, the PEQ base case's `streamFactor 0.90`:
1200 t/day × 365 × 0.90 = 394 200 t/yr.

## The screen

| per kg NH₃ | green, H₂ + N₂ bought | green | grey | blue |
|---|---|---|---|---|
| raw materials, EUR | H₂ 0.799 + N₂ 0.041 | water 0.003 | CH₄ 0.208 + water 0.001 | CH₄ 0.208 + water 0.001 |
| **margin on raw materials**, EUR/kg | **0.160** | **0.997** | **0.791** | **0.791** |
| — per year, M EUR | 63.0 | 393.0 | 311.6 | 311.6 |
| electricity, EUR | loop 0.030 | electrolysis 0.977 + ASU 0.021 + loop 0.030 | loop 0.030 | loop 0.030 + CO₂ compression 0.013 |
| fuel, EUR | — | — | 0.080 | 0.080 |
| CO₂, EUR | — | — | emitted 1.581 kg: 0.126 | stored 1.142 kg: 0.023; emitted 0.439 kg: 0.035 |
| **margin after energy**, EUR/kg | **0.130** | **−0.031** | **0.554** | **0.611** |
| — per year, M EUR | 51.4 | −12.1 | 218.6 | 240.7 |

"Green, H₂ + N₂ bought" is the green route at the PEQ base case's battery
limit: the electrolyser and the air separation unit are outside it, and their
electricity and capital are inside the two prices. "Green" moves the battery
limit to water, air and electricity.

The arithmetic: kg per kg NH₃ is a feed's mass flow over the NH₃ mass flow
in the same unit's outlet; each cost is that ratio times its price; the
energy terms are the assumed consumption times the kg it applies to times
the price. The run publishes every flow and heat this table uses; the
table itself is worked by hand from them, so it must be re-worked if the
engine's numbers move.

## What a student should notice

* **The material balance alone ranks the routes backwards.** On raw
  materials green is the best route by far, because water is nearly free.
  It is the electricity that decides, and after it the green route from
  water, air and electricity is the only one that loses money.
* **Green breaks even at 0.097 EUR/kWh** on these assumptions
  (10.27 kWh per kg NH₃). Electricity price and electrolyser efficiency are
  the two numbers a green feasibility study has to defend.
* **The two green rows do not agree, and the disagreement is in the PEQ
  base data.** At 0.100 EUR/kWh, a hydrogen price of 4.50 EUR/kg buys
  45.0 kWh per kg of H₂ — only 1.35 times the engine's floor fed steam, with
  nothing left for the electrolyser's capital. Either the hydrogen price is
  low for that electricity price, or the electricity a green plant buys is
  cheaper than the catalogue's industrial tariff. A screen exists to find
  exactly this before a group designs a plant on it.
* **Blue beats grey once CO₂ costs more than about 31 EUR/t** (compression
  plus storage, 0.035 EUR/kg NH₃, over the 1.142 kg of CO₂ it avoids). Below
  that price, capture is a cost.
* **One product, one price.** The base data's 1.00 EUR/kg includes a green
  premium. Grey and blue ammonia would not earn it, so their margins here
  are upper bounds by whatever that premium is.
* **Rung 1 and rung 2 disagree on the same green battery limit:** 0.160
  EUR/kg here, 0.145 EUR/kg in `greenAmmoniaFeasibility` (its
  `grossMargin_RM`, 56.08 M EUR/yr on 387 732 t/yr). The difference is the
  hydrogen the loop purges and flashes off, which an input-output balance
  cannot see because it sends every hydrogen atom to ammonia.

## What level 1 does not see

* **Separation and recycle** — the purge, the flash gases, the argon that
  accumulates: the hydrogen they lose (rung 2).
* **Heat and its temperature** — the reformer needs heat at a temperature
  only burnt fuel reaches, while the synthesis releases heat a waste-heat
  boiler can raise steam with; a sum of enthalpies counts both the same.
  Heat integration and the steam credit are rungs 2 and 3.
* **Capital** — electrolysers, an air separation unit, a reformer, a capture
  plant; no equipment exists here.
* **Operation** — a renewable electricity supply is intermittent, so the
  electrolyser's load factor and a hydrogen buffer enter at rung 2 and
  beyond.
* **The loop pressure** — 150 against 50 bar is a rung-2 question; the two
  equilibria here only say it matters.
* **By-product value** — the green route makes 1.41 kg of O₂ per kg of NH₃,
  valued here at zero.

## Not in this case

An EduTool view. The *Screening routes to a product* tool
(`gui/src/ui/methods/RouteScreeningTool.tsx`) runs the methanol screen
(`steady/reactors/screen01_methanol_routes`); it does not show this case.
The engine's economics pass cannot compute this table either: it prices one
plant per run, and it needs costed equipment.
