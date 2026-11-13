# Green ammonia, 1200 t/day — feasibility study, 50 bar loop: an exploratory alternative

**Illustrated design stage: FEL-2** — the SAME stage as
[`greenAmmonia02_feasibility150bar`](../greenAmmonia02_feasibility150bar)
(read that README first), not a further one. It is an **exploratory
alternative** of that study: the synthesis loop moved from **150 to 50 bar**,
the speculation the feasibility stage allows —
*what would this plant earn if a catalyst approached equilibrium at 400 °C
and 50 bar?*

**THE CATALYST IS A HYPOTHESIS, and the whole case rests on it.** No rate law
in this tree supports a converter that approaches equilibrium at 400 °C and
50 bar (the section below says why); the case assumes one exists. Its
`estimateClass 4` is, as in the 150 bar case, the author's statement of how
far the project is defined, not a consequence of the model or the stage.

```bash
source /path/to/Choupo/etc/bashrc
runCase -f .
```

## Read this before quoting anything from this case

**An equilibrium model says what the plant would earn IF a catalyst
approached equilibrium at the temperature declared. It does not say that
such a catalyst exists.** The converter here is a Gibbs reactor at 400 °C,
5 K short of equilibrium: the case assumes an activity no rate law in this
tree supports. The only ammonia kinetics Choupo carries — Dyson & Simon
(1968), used by [`greenAmmonia03_basicDesign`](../greenAmmonia03_basicDesign) and
[`ammoniaReactor04_kineticSizing`](../ammoniaReactor04_kineticSizing) — are for an
**iron** catalyst and were fitted over 150-300 atm; nothing here extends
them to 50 bar. Ruthenium-based catalysts are reported to be far more
active than iron and to run at lower pressures (down to 90 bar in the
source that record retrieved), but no rate expression for one has been
read into this project
([`how-a-process-design-is-staged.md`](../../../docs/design/how-a-process-design-is-staged.md)
§3.5 records what could and could not be established). Which catalyst, if
any, delivers this converter is the question this case cannot answer.

## What moved, and only this

| | 150 bar case | this case |
|---|---|---|
| make-up compression | 30 → 67 → 150 bar, two intercooled stages | 30 → 50.4 bar, **one** stage (`Intercooler` and `MakeupComp2` removed) |
| converter | 460 °C, 150 bar | 400 °C, 50 bar (both 5 K short of equilibrium) |
| feed preheat | to 380 °C | to 320 °C (80 K below the outlet, as at 150 bar — author-set) |
| separator | 140 bar, −20 °C | 47 bar, −20 °C (the 150 bar case's 10/150 loop pressure drop, scaled — author-set) |
| compressor powers | the base case's | re-tuned by running the case: `MakeupComp1` 3227 kW, `RecycleComp` 1211 kW |

Everything else — feeds, package, utilities, prices, purge fraction,
let-down, sizing rules — is the 150 bar case's. Because the electrolyser
already delivers hydrogen at 30 bar, the make-up needs one short stage
instead of two.

## What the run shows, beside the 150 bar case

Every number is read off a run of each case; each case's golden is the
authority on its own numbers.

| | 150 bar | **50 bar** |
|---|---|---|
| ammonia produced | 1180.3 t/day | 1180.3 t/day |
| converter outlet NH₃ | 19.70 % | **15.07 %** |
| hydrogen converted per pass | 29.7 % | **19.6 %** |
| recycle / make-up (mol/mol) | 2.28 | **4.18** |
| NH₃ in the recycle gas | 2.16 % | **4.97 %** |
| purge | 11.4 kmol/h | 20.9 kmol/h |
| compression | 13.67 MW, 278 kWh/t | **6.55 MW, 133 kWh/t** |
| · make-up compressors | 10.71 MW | 3.23 MW |
| · recycle compressor | 0.85 MW | 1.21 MW |
| refrigeration (−20 °C) | 20.24 MW | **31.23 MW** |
| converter heat, raised as HP steam | 30.94 MW | 22.30 MW |
| feed preheat (bought) | 60.86 MW, molten salt | 82.24 MW, hot oil (`dowthermA`) |
| plant first law | 9.0 kW | 0.09 kW |

The consequences the run shows, in order:

* **The equilibrium falls with the pressure**, so the per-pass conversion
  falls (29.7 → 19.6 % of the hydrogen), even at a converter 60 K cooler.
* **So the recycle grows** (2.28 → 4.18 mol per mol of make-up), and with
  it the gas the loop must heat, cool and recompress.
* **The separation gets harder.** At −20 °C ammonia's vapour pressure is a
  larger share of 47 bar than of 140 bar, so the recycle gas carries more
  than twice the ammonia fraction (4.2 times the ammonia flow) and the
  chiller removes 54 % more heat.
* **Compression halves**, almost all of it in the make-up: the loop now
  sits close to the electrolyser's own 30 bar.
* **Less steam is raised**: the converter releases less heat at a lower
  temperature (the credit stays above the steam's 252 °C plus 10 K).

## The gross margin

| M EUR/yr | 150 bar | **50 bar** |
|---|---|---|
| revenue R (ammonia at 0.530 EUR/kg) | 206.09 | 206.09 |
| raw materials C_RM (H₂ at 8.0, N₂ at 0.0175 EUR/kg) | 566.43 | 566.43 |
| **R − C_RM** | **−360.33** | **−360.34** |
| electricity | 11.35 | 5.44 |
| heating the converter feed | 26.40 | 23.75 |
| ammonia refrigeration | 9.41 | 14.15 |
| cooling water and LP steam | 0.95 | 1.21 |
| HP steam raised (credit) | −15.69 | −11.22 |
| C_UT | 32.42 | 33.32 |
| **R − C_RM − C_UT** | **−392.75** | **−393.65** |

R − C_RM does not move: the products and the raw materials are the same
molecules. What moves is the energy, and at the cited prices the
compression saved is paid back by refrigeration and lost steam: the
unintegrated margin is 0.9 M EUR/yr **lower** at 50 bar (both margins are
negative: see the 150 bar case). Both margins are
upper bounds for the same reason (the `StorageFlash`'s −35 °C duty, which
no catalogue utility serves).

**The pinch moves the comparison.** At 50 bar, as at 150, the minimum
heating is **zero** (pinch at the hot end, 673.15 / 663.15 K) and the
minimum cooling is 41.89 MW, against 82.65 MW of heating and 124.5 MW of
cooling bought today. Once the feed is preheated by the effluent — which
the targets say is possible at both pressures — the heating bill leaves
both columns, and what remains is electricity, refrigeration and steam:
the comparison a group should make with the basic-design stage in hand,
not this one.

The fixed capital, sized on assumed U values and costed by Turton, is
35.9 M EUR against 42.1 M EUR at 150 bar (a 55 bar g design pressure, one
compressor fewer, carbon steel wherever the 700 K rule allows; the run's
equipment table itemises it); the NPV is −3 319 M EUR
against −3 325 M EUR. Class 4 is −30 % / +50 %: those two capitals are inside
each other's band, so at this stage they **cannot** decide between the two
pressures — the point the *Front-End Loading* EduTool draws.

**The sensitivity says the same, with numbers.** `system/postDict` ends
with the same `sensitivity {}` block as the 150 bar case (DEV.md 4c C68;
the FCI's ends are the declared accuracy band, the three prices' ends
are cited, as in the 150 bar case — ammonia 0.380 / 0.692 (monthly EU import
unit values of 2025), hydrogen 7.0 / 10.0 (ACER's range), nitrogen 0.0159 /
0.0175 EUR/kg; the three utility bills ±20 %, discount
rate 8 % / 12 % and stream factor 0.85 / 0.95 are round figures). Its tornado
(`reports/economics/sensitivity.csv`), M EUR, base NPV −3 319.20, beside the
150 bar swings:

| input (low / high end) | NPV at low | NPV at high | swing | swing at 150 bar |
|---|---|---|---|---|
| H₂ price (7.0 / 10.0 EUR/kg) | −2 798.64 | −4 360.31 | 1 561.67 | 1 561.66 |
| discount rate (8 % / 12 %) | −3 722.57 | −2 982.45 | 740.12 | 740.10 |
| NH₃ price (0.380 / 0.692 EUR/kg) | −3 666.03 | −2 944.62 | 721.41 | 721.42 |
| stream factor (0.85 / 0.95) | −3 141.74 | −3 496.66 | 354.92 | 354.18 |
| hot-oil bill, `dowthermA` (×0.8 / ×1.2) | −3 283.63 | −3 354.77 | 71.13 | 79.09 (molten salt) |
| **FCI, the accuracy band** (25.14 / 53.88 M EUR) | −3 298.06 | −3 354.43 | 56.37 | 66.00 |
| HP-steam credit (×0.8 / ×1.2) | −3 336.00 | −3 302.40 | 33.61 | 47.01 |
| electricity bill (×0.8 / ×1.2) | −3 311.05 | −3 327.35 | 16.29 | 34.01 |
| N₂ price (0.0159 / 0.0175 EUR/kg) | −3 315.44 | −3 319.30 | 3.86 | 3.86 |

The two alternatives differ in NPV by **5.7 M EUR** — less than every bar
of either tornado but the nitrogen price's (3.86 M EUR) — and the inputs that
dominate both (the hydrogen and ammonia prices) move the two loops by the
same amount to within 0.02 M EUR, because the same molecules are bought and
sold. So nothing a price does can rank the two pressures; what differs is
only what each loop buys: half the electricity swing (less compression), a
smaller steam credit (−11.22 against −15.69 M EUR/yr in the margin table
above), and a capital band whose own swing (56.4 M EUR) is ten times the
difference. As at 150 bar, no single input flips the NPV's sign (hydrogen at
7.0 EUR/kg leaves −2 799 M EUR, no IRR), and the discount-rate and
stream-factor bars point the "wrong" way because the plant loses money on
every hour it runs. The NPV includes the engine's assumed tax credit on
losses (869.0 M EUR here). A sensitivity, not an uncertainty analysis: no probability is attached to
any end.

## What this case does NOT claim

* **That a catalyst exists** that approaches equilibrium at 400 °C and 50
  bar, or at what volume. See the first section.
* Anything the 150 bar feasibility case does not claim (no network, no
  reactor size, no kinetics, no exchanger geometry; read its README).
* A loop pressure drop: the 3 bar at the separator is an author-set scaling
  of the base case's, not a hydraulic calculation. A real low-pressure loop
  moves three times the gas volume per mole, and its pressure drop would be
  larger.
