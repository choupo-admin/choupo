# Green ammonia, 1200 t/day — the base case of the PEQ 2026-27 project

The starting point a design-project group opens: the plant of the **project
base data (v2)** — electrolytic hydrogen at 30 bar, nitrogen from an on-site
air separation unit at 8 bar, a 150 bar synthesis loop with an equilibrium
converter, and refrigerated separation.

```bash
source /path/to/Choupo/etc/bashrc
runCase -f .
```

Seventeen units on one canvas, no sectors. Every declared number and where it
comes from is in the header of [`system/flowsheetDict`](system/flowsheetDict).

## The process

| step | units | what it does |
|---|---|---|
| nitrogen | `N2Boost` · `N2Cooler` | 8 → 30 bar, cooled to 40 °C |
| make-up | `MakeupMix` · `MakeupComp1` · `Intercooler` · `MakeupComp2` · `Aftercooler` | H₂ + N₂ (3 : 1), two intercooled stages to 150 bar |
| loop | `RecycleComp` · `LoopMix` · `FEHE` | recycle 140 → 150 bar, joins the make-up, preheated to ~380 °C against the converter outlet |
| converter | `Converter` | one Gibbs reactor at the converter outlet temperature (460 °C), 5 K short of equilibrium; its duty is the reaction heat to remove as steam |
| condensation | `WaterCooler` · `Chiller` · `Separator` | 40 °C, then −20 °C, separation at 140 bar |
| purge | `PurgeSplit` | ~11 kmol/h of the loop vapour leaves |
| finishing | `LetdownHP` · `StorageFlash` | 20 bar, then 1 atm to storage |

Two recycle cuts, declared in [`system/solverDict`](system/solverDict):
`Recycle` (material) and `HotEffluent` (the converter outlet preheats the
converter's own feed).

## Why one Gibbs reactor and not three beds

A Gibbs reactor computes only the outlet: the equilibrium of the atoms that
enter, at the declared temperature and pressure. It has no volume and no
path, so three Gibbs beds in series with coolers between them give the same
outlet as one Gibbs reactor at the last bed's temperature. The first-pass
practice is therefore one reactor at the converter outlet temperature with
an approach to equilibrium (the definition and its source are in
[`ammoniaStaged03_approach`](../ammoniaStaged03_approach)). The number of
beds, their inlet temperatures against the catalyst's 520 °C limit and their
catalyst volumes need a rate law: a plug-flow reactor
([`ammoniaStaged04_kinetic`](../ammoniaStaged04_kinetic)), task 2.

## What the run shows

| | |
|---|---|
| ammonia produced | 1180 t/day, −35 °C, 1 atm |
| converter outlet | 19.7 % NH₃ at 460 °C |
| recycle | ~13 400 kmol/h |
| reaction heat (steam) | ~31 MW |
| refrigeration (−20 °C) | ~20 MW |
| compression | 13.7 MW, ~280 kWh/t |
| plant first law | closes to ~9 kW |

## What a group should notice

* **The base data's 18 % per pass is kinetic.** At 460 °C the equilibrium
  allows more, so this converter converts more per pass and the recycle is
  about half the base data's. Raise the outlet temperature towards 520 °C
  and watch the two meet.
* **The loop is not at H₂/N₂ = 3.** The make-up is 3 : 1 and so is the
  reaction, but what leaves dissolved in the liquid is nitrogen-rich, so
  hydrogen accumulates: the converter sees about 3.6.
* **Argon leaves mostly with the liquid**, through the let-down and storage
  flashes, not through the purge. Task 3 (10 to 1000 ppm of argon) starts here.

## What is NOT in this case — the groups' work

* the converter's beds (number, inlet temperatures, catalyst volume);
* the < 100 ppm H₂O + O₂ of the hydrogen (the feed here is pure H₂);
* the cold gas/gas exchanger before the chiller, so the chiller duty is an
  upper bound;
* the purge scrubber and the let-down gas recovery;
* the cooling water, the refrigeration cycle and the steam system: each
  cooler declares an outlet temperature and its duty is the heat to remove;
* sizing and economics.

## Engine notes

* The store is declared at −35 °C, not −33.4 °C: a pure liquid at its own
  boiling point is the one state a flash cannot decide.

## History

Until 2026-10-01 this case was a 500 t/day plant fed with industrial-grade
nitrogen, in four sectors with a deoxo reactor, a dryer, a purge scrubber,
sizing and economics, and two case documents. It was rewritten to the
project base data v2 at Vítor's request and simplified the same day; the
earlier versions are in the git history.
