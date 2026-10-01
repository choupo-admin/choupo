# Green ammonia, 1200 t/day — the base case of the PEQ 2026-27 project

The starting point a design-project group opens: the plant of the **project
base data (v2)** — electrolytic hydrogen at 30 bar, nitrogen from an on-site
cryogenic air separation unit at 8 bar, a 150 bar synthesis loop with an
equilibrium converter, refrigerated separation and a water-scrubbed purge.

```bash
source /path/to/Choupo/etc/bashrc
runCase -f .
```

**One level, no sectors.** About twenty units on one canvas, because the loop
is what a group has to understand and a sector boundary would cut it in half.
The flowsheet, every declared number and where it comes from are in the
header of [`system/flowsheetDict`](system/flowsheetDict) — read it first.

## The process

| step | units | what it does |
|---|---|---|
| nitrogen | `N2Boost` · `N2Cooler` | 8 → 30 bar, cooled to 40 °C |
| make-up | `MakeupMix` · `MakeupComp1` · `Intercooler` · `MakeupComp2` · `Aftercooler` | H₂ + N₂ (3 : 1), two intercooled stages to 150 bar |
| loop | `RecycleComp` · `LoopMix` · `FEHE` | recycle 140 → 150 bar, joins the make-up, preheated to 380 °C against the converter outlet |
| converter | `Converter` | one Gibbs reactor at the converter outlet temperature (460 °C), 5 K short of equilibrium; its duty is the reaction heat the intercoolers remove as steam |
| condensation | `WaterCooler` · `Chiller` · `Separator` | cooling water, then refrigeration to −20 °C, separation at 140 bar |
| purge | `PurgeSplit` · `PurgeValve` · `PurgeHeater` · `Scrubber` | ~12 kmol/h of the loop vapour, its ammonia washed into water |
| finishing | `LetdownHP` · `StorageFlash` | 20 bar, then 1 atm to storage |

Two recycle cuts, both declared in [`system/solverDict`](system/solverDict):
`Recycle` (material) and `HotEffluent` (energy: the converter outlet preheats
the converter's own feed).

## What the run shows (measured 2026-10-01)

| | |
|---|---|
| ammonia produced | 1180 t/day (the feeds are the base data's; the 1.7 % gap to 1200 is the let-down and storage-flash gas, mostly ammonia boil-off that a real plant returns through the refrigeration unit) |
| converter outlet | 19.7 % NH₃ at 460 °C; feed preheated to 378 °C |
| recycle | ~13 400 kmol/h, about half the base data's indicative 27 000 — see below |
| reaction heat (steam) | ~31 MW; refrigeration ~22 MW; compression 13.7 MW |
| plant first law | closes to ~15 kW |

## Findings a group should reach (base data, section 2.8)

* **One equilibrium reactor, not three beds.** A Gibbs reactor computes only
  the outlet: the equilibrium of the atoms that enter, at the declared T and P.
  It has no volume and no path, so three Gibbs beds with coolers between them
  give the same outlet as one Gibbs reactor at the last bed's temperature.
  The first-pass practice is therefore one reactor at the converter outlet
  temperature with an approach to equilibrium. The number of beds, their
  inlet temperatures against the 520 °C limit and their catalyst volumes need
  a rate law — a plug-flow reactor
  ([`ammoniaStaged04_kinetic`](../ammoniaStaged04_kinetic)), task 2.
* **The base data's 18 % per pass is kinetic.** At 460 °C the equilibrium
  allows more, so this converter converts more per pass and the recycle is
  about half the base data's. Raise the outlet temperature towards 520 °C and
  watch the two meet.
* **The loop is not at H₂/N₂ = 3.** The make-up is 3 : 1 and so is the
  reaction, but the gases dissolved in the liquid ammonia and the purge leave
  nitrogen-rich, so hydrogen accumulates: the converter sees about 3.6. A real
  loop corrects the make-up ratio.
* **Argon leaves mostly with the liquid**, through the let-down and storage
  flashes, not through the purge. Task 3 (10 to 1000 ppm of argon) starts
  here.

## What is deliberately NOT in this case

* the **< 100 ppm H₂O + O₂ of the hydrogen** (the feed here is pure H₂) — both
  poison the catalyst, and handling them is a design decision;
* the **cold gas/gas exchanger** before the chiller, so the chiller's duty is
  an upper bound;
* the **refrigeration cycle**, the **steam system**, the **start-up heater**
  and the **catalyst volumes** — the postDict sizes and costs the compressors,
  the two exchangers and the two drums only, so the capital is INCOMPLETE.

## Engine notes

* The approach is a magnitude; the engine assigns its sign from the reaction's
  thermicity and says so in the log (`T + 5` for ammonia synthesis). The
  source of the 5 K and its definition are in
  [`ammoniaStaged03_approach`](../ammoniaStaged03_approach).
* The store is declared at −35 °C, not −33.4 °C: a pure liquid at its own
  boiling point is the one state a flash cannot decide.
* The scrubber computes in its own water-solvent world (its `thermo {}`
  block); the purge crossing into it is a model boundary, and the first-law
  ledger shows the enthalpy step there.

## History

Until 2026-10-01 this case was a 500 t/day plant fed with industrial-grade
nitrogen (99.5 % N₂, 0.40 % O₂), laid out in four sectors with a deoxo
reactor and a molecular-sieve dryer. It was rewritten to the project base
data v2 at Vítor's request (2026-10-01; its converter became one equilibrium
reactor the same day); the earlier version is in the git history. The
documents under [`docs/`](docs) still describe that earlier version.
