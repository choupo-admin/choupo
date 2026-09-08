# Green ammonia, 500 t/day, Sines — sectored case, **industrial-grade N₂**

A fractal (sectored) Choupo case: read it as **PLANT → SECTOR → UNIT**.

```bash
source /home/vitor/Choupo/etc/bashrc
runCase -f .
```

## The one line of input data that makes this case

|  | N₂ | O₂ | Ar |
|---|---|---|---|
| original base data | 99.999 % | — | 50 ppm |
| **this case** | **99.50 %** | **0.40 %** | **0.10 %** |

Nitrogen at 99.999 % is analytical-grade gas — the kind you buy in a cylinder
to feed a chromatograph detector. This plant consumes **17 t/h** of it: at that
rate you take whatever the air separation column produces, which is 99.5 to
99.9 %, with oxygen as the dominant impurity.

That single line is why this plant has a `PURIFICATION` sector with a deoxo
reactor, a chiller, a knock-out drum and a dryer in it, where a plant fed on
99.999 % nitrogen would only need compression.

## Geography

```
  H2, N2 ──► [ PURIFICATION ] ──Makeup──► [ LOOP ] ──RawLiquid──► [ PRODUCT ] ──► NH3
                   │                        │
          KoWater, RegenGas               Purge
          CwAOut, ChwOut                    │
                                            ▼
                          WashWater ──► [ RECOVERY ] ──► ScrubbedGas (H₂, N₂, Ar)
                                                    ──► AqueousNH₃
```

| sector | units | what it does |
|---|---|---|
| `PURIFICATION` | N2Boost · N2Cooler · SynMix · **Deoxo** · **GasChiller** · **KoDrum** · **Dryer** · SynComp | battery limits → dry, oxygen-free syngas at 231 bar |
| `LOOP` | RecycleComp · LoopMix · FEHE · Converter · WaterCooler · Separator · PurgeSplit | the Haber-Bosch loop; **both recycle cuts are internal to it** |
| `PRODUCT` | Letdown | 200 → 20 bar; product from ~99.4 % to ~99.9 % NH₃ |
| `RECOVERY` | PurgeValve · PurgeHeater · **Scrubber** | washes the ammonia out of the purge before it leaves the plant |

The geography was drawn on one criterion: **cut the plant where the recycle
does not pass.** A tear is closed at the composite node that declares it, so a
recycle crossing two sectors would have no owner.

## The water chain, and why it takes four blocks

| block | what leaves | water left in the gas |
|---|---|---|
| `Deoxo` | O₂ + 2 H₂ → 2 H₂O | **2118 ppm** |
| `GasChiller` | cools to 279 K | (condensation starts) |
| `KoDrum` | 81 kg/h of liquid water | **315 ppm** |
| `Dryer` | 4A molecular sieve | **< 1 ppm** |

Above ~310 K at 30 bar the gas is not even saturated: cooling with cooling
water alone condenses **nothing**. Cut `GasChiller.area` down and run again —
it is the single most instructive experiment in this case, and it is what
decides whether the dryer holds 1.5 t of sieve per bed or 11 t.

**The simulator does not see catalyst poisoning.** Delete the dryer and the
case still runs, with the water travelling through the loop and into the
product. The dryer is there because the iron catalyst tolerates less than
~5 ppm of oxygen compounds; the case shows you *how much* water it removes,
not what would happen without it.

## Two sectors, two property packages — read `PURIFICATION/constant/`

`constant/` exists at **every level** of a fractal case, because what we *know*
is not the same everywhere in a plant. This case is a working example.

| level | solvent | why |
|---|---|---|
| plant `constant/` | **ammonia** | in the loop the liquid is liquid NH₃ with dissolved H₂, N₂, Ar |
| `PURIFICATION/constant/` | **water** | no ammonia in that sector — the only liquid is the deoxo water |
| `RECOVERY/constant/` | **water** | ammonia absorbed *out of* a gas *into* water |

Three sectors, three thermodynamic worlds. One package could not describe all
three, which is the whole argument for `constant/` living at every level.

What it changes, in the knock-out drum:

| | ammonia package | water package |
|---|---|---|
| K_Ar | 14.1 | **888** |
| K_N₂ | 404 | 2015 |
| K_H₂ | 598 | 2025 |

Gases are roughly ten times *less* soluble in water than in ammonia, and the
drum only carries 4.5 kmol/h of liquid — so in tonnes per hour the correction
is tiny. It is there because it is **right**, and because it is the mechanism
the purge scrubber will need, where the solvent really is water and the amount
really does matter.

`Makeup` crosses that model boundary on its way to `LOOP`: (T, P, z) are held
and each side recomputes its own enthalpy, so **H steps** at the boundary. The
run prints the step in the first-law ledger. That is two models disagreeing on
H(T,P,z) — information, not a bug.

> **A gap worth knowing about.** `thermoPhysPropDict` and `reactions` resolve
> per sector (`PURIFICATION/constant/reactions` holds the deoxo reaction and the
> run finds it, while the plant root reports "reactions library: not present").
> The **adsorbent registry does not**: `constant/adsorbents/` and
> `constant/parameters/adsorption/` must sit at the plant root or the run
> refuses with `AdsorbentRegistry: unknown adsorbent 'molSieve4A'. Loaded:
> (none)`. So the dryer's data lives at the root even though it is knowledge
> that belongs to the purification sector.

## Argon — and a property record authored for this case

Argon is the inert that the purge exists to remove, so its solubility in liquid
ammonia decides the whole purge-versus-hydrogen-loss trade-off. The catalogue
has no `Ar-NH3` Henry pair, and without one argon falls onto the Raoult rung
with a vapour pressure extrapolated **above its critical temperature**
(Tc = 150.86 K). In the separator that gave `K_Ar = 1.7` against `K_N2 = 124`
— argon ~70× more soluble in liquid ammonia than nitrogen — and 88 % of the
argon left dissolved in the product instead of accumulating in the loop.

`constant/parameters/Henry/Ar-NH3.dat` fixes that: fitted from the IUPAC-NIST
Solubility Data Series Vol. 4 (Argon), Krichevsky-Kasarnovsky, same treatment
as the `H2-NH3` and `N2-NH3` records it sits beside. `K_Ar` becomes **69**.
The full provenance, the fit script, the held-out validation and **the one
inference the record carries** are in `curation/Ar-NH3/`. Read that before
trusting the number.

## Base-case results

| | |
|---|---|
| Production | **499.9 t/day** at 99.89 % NH₃ |
| Specific H₂ | **181.1 kg/t** |
| Power | 9.0 MW → 433 kWh/t |
| Per-pass conversion | y_NH₃ = 11.0 % (converter outlet 839 K) |
| O₂ removed in the deoxo | 2.59 kmol/h, releasing 349 kW |
| Chilling duty | 742 kW |
| Water condensed | 81.1 kg/h |
| Dryer utilisation | 53 % on 1500 kg/bed |

Argon balance — this is what the corrected Henry pair buys:

| leaves in | share |
|---|---|
| `Purge` | 56 % |
| `LetdownGas` | 33 % |
| dissolved in `ProductNH3` | 11 % |

## The RECOVERY sector

```
Purge (250 K, 200 bar) ──[PurgeValve]──[PurgeHeater]──┐
                            → 30 bar      → 300 K     │
                                                      ▼
                          WashWater ──────────────►[Scrubber]
                                                   │        │
                                         ScrubbedGas        AqueousNH₃
```

| | |
|---|---|
| NH₃ in the purge | 6.19 kg/h (≈ 50 t/year) |
| NH₃ in the scrubbed gas | **91 ppb** — below the report's display precision |
| Aqueous ammonia | 12.4 kmol/h at **2.78 % (m/m)** |
| Scrubbed gas | 22.7 kmol/h · H₂ 75.8 % · N₂ 22.7 % · **Ar 1.55 %** |

**Why it is there at all.** You cannot vent 50 t/year of ammonia — it is a
permit item, not an economic one. The ammonia it recovers is worth ~40 k€/year,
which never pays for a column. What it *also* does, and what is worth money, is
deliver **ammonia-free gas**: polymeric H₂-recovery membranes do not survive
NH₃, so this column is the gatekeeper for the ~1.1 M€/year of hydrogen sitting
in the purge.

**Why the purge has to be warmed first.** It leaves the separator at 250 K.
Scrub a 250 K gas with water and the water freezes on the packing. The let-down
to 30 bar already helps — on a hydrogen-rich gas the Joule-Thomson coefficient
is *negative*, so the valve warms it from 250 to 257 K — and 9.5 kW of heating
finishes the job. In a real plant that heat comes from cooling water, which at
298 K is the *hot* side here.

**The water rate is a modelling decision as much as a design one.** The
separation itself is trivial: at 12 kmol/h of water the absorption factor is
A ≈ 15, and Kremser over 6 stages gives 99.99999 % — the column is wildly
over-designed. What the water rate really decides is whether Henry is still
honest:

| wash water | A | absorbed | rich liquid |
|---|---|---|---|
| 2 kmol/h | 2.5 | 99.73 % | 14.7 % (m/m) — **the industrial number, Henry invalid** |
| 4 kmol/h | 4.9 | 99.99 % | 7.9 % |
| 8 kmol/h | 9.8 | 100.00 % | 4.1 % |
| **12 kmol/h** | **14.7** | **100.00 %** | **2.8 % — dilute, Henry defensible** |

A real design uses *less* water, makes a 15–25 % solution and distils it. Doing
that here means replacing this sector's package with an activity or electrolyte
model over the full composition range — and the records for that are already in
the case, unused: `constant/chemistry/NH3aq-formation.dat`,
`water-dissociation.dat`, species `NH4` / `OH` / `H`. **That is the next
exercise.**

**What is still missing: the hydrogen.** A membrane or PSA behind the scrubber
would send the recovered H₂ back to the synthesis compressor suction, in
`PURIFICATION`. Two obstacles, both worth understanding:

1. That closes a recycle running `LOOP → RECOVERY → PURIFICATION → LOOP`, i.e.
   through **all three** sectors. The rule this geography was drawn on is *cut
   where the recycle does not pass*, so the tear belongs to no sector — it has
   to be declared at the **plant root**, which is a composite node like any
   other and may declare one.
2. The `psa` unit needs an isotherm per species, and the catalogue's
   `zeolite5A` has H₂, N₂, CH₄, CO₂ and CO — **but not argon**. A species with
   no isotherm is treated as non-adsorbing and reports to the raffinate, so the
   argon would ride back into the loop with the recovered hydrogen and the purge
   would stop working entirely. Authoring an Ar/zeolite5A isotherm is the
   prerequisite.

## What to change

| file | design decision |
|---|---|
| `0/MAIN/N2Feed` | **the nitrogen purity** — the variable this case exists for |
| `LOOP/PurgeSplit/system/flowsheetDict` | purge fraction: inert build-up vs. H₂ loss |
| `PURIFICATION/GasChiller/system/flowsheetDict` | how cold to go; it sizes the dryer |
| `PURIFICATION/Dryer/system/flowsheetDict` | `mAdsPerColumn`, `tCycle`, `purgeRatio` |
| `constant/parameters/adsorption/.../water.dat` | the isotherm — replace with the vendor's |
| `LOOP/Converter/system/flowsheetDict` | loop pressure, mode, `approachTemperature` |
| `0/MAIN/WashWater` | wash-water rate: separation is easy, but it sets whether Henry is still valid |
| `RECOVERY/Scrubber/system/flowsheetDict` | number of stages |
| `constant/economics` | H₂ and NH₃ price scenarios |

## Known simplifications

1. The dryer's regeneration gas **leaves the plant** (13 kmol/h). A real unit
   cools it, knocks the water out and returns it to the compressor suction.
2. Cooling to 279 K is one exchanger; in reality it is two (cooling water to
   ~308 K, then NH₃ refrigeration).
3. The deoxo is isothermal (the exotherm is reported as `Q_kW`); a real bed is
   adiabatic and rises ~17 K.
4. Single adiabatic converter bed, single-stage compressors, isobaric loop at
   200 bar, let-down gas leaving the system — inherited from case 02.
5. The energy auditor flags residuals on `KoDrum` (3 kW) and `Dryer` (22 kW):
   `tsaTwinBed` does not declare its regeneration heat as a duty item, and the
   knock-out drum sits on a model boundary. 25 kW in a 10 MW plant.
6. The `RECOVERY` sector recovers the **ammonia** but not yet the **hydrogen** —
   see below.
