# Green ammonia, 1200 t/day — the reference case of the PEQ 2026-27 brief

The starting point a design-project group opens: the plant of the **project
base data (v2)** — electrolytic hydrogen at 30 bar, nitrogen from an on-site
air separation unit at 8 bar, a 150 bar synthesis loop with an equilibrium
converter, and refrigerated separation.

```bash
source /path/to/Choupo/etc/bashrc
runCase -f .
```

**It is the brief's REFERENCE case, and it sits outside the numbered
sequence on purpose.** Its detail differs from equipment to equipment, as a
reference plant's does: the converter is an equilibrium model (one Gibbs
reactor, 5 K short of equilibrium) while the six exchangers are designed in
detail (Kern). That is not a defect to be fixed; it is why the numbered cases
exist. Each is a copy of this case with one thing changed, so the stage it
illustrates is uniform:

| rung | case | illustrated design stage | what changes against this case |
|---|---|---|---|
| 1 | [`ammoniaRoutes01_screening`](../ammoniaRoutes01_screening) | FEL-1, screening | not a copy: the production routes on paper, the common entry |
| 2 | [`greenAmmonia02_feasibility150bar`](../greenAmmonia02_feasibility150bar) | FEL-2, feasibility | no feed/effluent exchanger, every duty bought from a utility, pinch targets and the gross margin with the energy priced |
| 2 | [`greenAmmonia02_feasibility50bar`](../greenAmmonia02_feasibility50bar) | FEL-2, an exploratory alternative | the same at 50 bar, resting on a catalyst hypothesis |
| 3 | [`greenAmmonia03_basicDesign`](../greenAmmonia03_basicDesign) | FEL-3, basic design (process side) | the converter as three adiabatic catalyst beds on a rate law, volumes solved, every exchanger designed |

Its `estimateClass 4` is, like theirs, the author's statement of how far the
project is defined — not a consequence of the model.

Seventeen units, no sectors, each in its **own folder** (`Converter/`,
`Separator/`, …) with its `system/flowsheetDict` and its `.cho` marker. The
plant's [`system/flowsheetDict`](system/flowsheetDict) holds the topology only —
which folders exist and the pipes between them — and its header says where
every declared number comes from. Because each unit is a folder, a
double-click on it in the GUI opens it as a case of its own, in its own tab,
fed with the plant's converged streams: change its operation, sweep it, study
it alone.

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
[`ammoniaReactor03_equilibriumApproach`](../ammoniaReactor03_equilibriumApproach)). The number of
beds, their inlet temperatures against the catalyst's 520 °C limit and their
catalyst volumes need a rate law: a plug-flow reactor
([`ammoniaReactor04_kineticSizing`](../ammoniaReactor04_kineticSizing)), task 2.

## What the run shows

| | |
|---|---|
| ammonia produced | 1180 t/day, −35 °C, 1 atm |
| converter outlet | 19.7 % NH₃ at 460 °C |
| recycle | ~13 687 kmol/h<!--golden: stream CompRecycle F *3600--> |
| reaction heat (steam) | 30.3 MW<!--golden: kpi Converter Q_kW *-1e-3--> |
| refrigeration (−20 °C) | 20.8 MW<!--golden: kpi Chiller Q_kW *-1e-3--> |
| compression | 13.7 MW<!--golden: kpi MakeupComp1 W_shaft_kW & kpi MakeupComp2 W_shaft_kW & kpi N2Boost W_shaft_kW & kpi RecycleComp W_shaft_kW *1e-3-->, ~280 kWh/t |
| plant first law | closes to ~9 kW |

### The pinch: what the heat targets of this plant show

`system/postDict` runs the pinch pass on the converged result (dTmin 10 K,
as in the feasibility case; `reports/pinch/`). It reads 10 segments:
the four water coolers, the chiller, the three flash drums and the FEHE's two sides.
The Gibbs converter publishes only `Q_kW`, so its 30.3 MW<!--golden: kpi pinch Q_excluded_kW *1e-3--> is **not** in the
population, and the run says so: these are the targets of the 10 segments,
not of the plant.

| | |
|---|---|
| minimum heating, Q_H,min | **0** (0.06 MW<!--golden: kpi pinch Q_heat_current_kW *1e-3--> bought today, on the two cold flash drums) |
| minimum cooling, Q_C,min | 41.11 MW<!--golden: kpi pinch Q_C_min_kW *1e-3--> (against 41.17 MW<!--golden: kpi pinch Q_cool_current_kW *1e-3--> cooled today) |
| class | threshold problem, no hot utility, **no interior pinch** (the cascade touches zero only at the top of the range, 728.15 K shifted) |

The plant has no heat to buy and nothing left to recover: the FEHE already
carries 61.6 MW<!--golden: kpi FEHE Q_kW *1e-3--> of the 61.6 MW<!--golden: kpi pinch Q_recovery_max_kW *1e-3--> maximum recovery of this population (all
but the 0.06 MW the two flash drums draw), and the cooling it buys is within 0.2 % of its target. The
pinch says this base case is thermally tight on the process side; what is
left is the converter's 30.3 MW<!--golden: kpi Converter Q_kW *-1e-3-->, served by the steam generation, which no
pinch of generic duties can see.

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
  cooler declares an outlet temperature and its duty is the heat to remove.
  The converter's heat is **valued** as HP steam raised (see *Utilities*
  below) — the waste-heat boiler, the steam header and whatever would use
  the steam are not modelled.

## Sizing and costing

[`system/postDict`](system/postDict) sizes and costs (Turton, 2026 EUR)
the fourteen units that are pieces of equipment; the two mixers and the
purge splitter are pipe junctions and are not. Every design number in it
is an author-set assumption declared on its own line with its reason, and
its header says which basis each item rests on:

| items | sized by |
|---|---|
| 4 compressors | their own shaft power (the run's result) |
| 5 coolers | a **Kern shell-and-tube design**: the tube bundle and the fouling declared, the number of tubes, the shell, both film coefficients, U, F, the area and both pressure drops computed — against a named utility (cooling water, or ammonia boiling at 1 atm for the chiller) |
| `FEHE` | the same Kern design, both sides process gas, four 1-1 shells in series; the unit's own declared 2000 m² is published beside the designed area |
| `Converter` | a catalyst vessel on an **assumed** space velocity — a Gibbs reactor has no volume of its own |
| 3 drums | **detailed** (C318): Souders-Brown allowable velocity, liquid levels from a 600 s hold-up and 120 s surge, the orientation chosen and printed (all three horizontal), a droplet check, the three nozzles; Theory Guide `sec:drum-sizing` |
| `NH3Storage` | 21 days of production of `ProductNH3`, refrigerated at 1 atm, 90 % working level, at most 30 000 m³ per tank — two tanks |

The design sheets land in `design/<unit>/` after a run (the two product
tanks in `design/NH3Storage/tank1` and `tank2`).

### The exchangers, designed

An area from A = Q/(U·LMTD) with a typed U is an estimate: it has no tubes,
no shell, no film coefficients, no fouling and no pressure drop. Here each
exchanger is **designed** by the Kern method (DEV.md 4c C48): the author
chooses the bundle — 1 in tubes with a 2.77 mm wall, 6.1 m long, at 1.25
tube diameters, the passes, the baffle spacing — and the fouling on each
side; the run then finds the **smallest number of tubes** for which

    U · F · LMTD · (π d_o L N) ≥ |Q|

with U computed from the two films, the tube wall and the fouling. The gas
goes in the tubes (it is the high-pressure side); the cooling water in the
shell. What the sheet in `design/<unit>/shellTubeHX` gives a group to check:
N, the shell ID, h on each side, the five resistances that add up to 1/U,
F (1-2 shell, Bowman–Mueller–Nagle), the area required and installed, the
cooling-water flow (|Q| over the utility record's own duty per kg) and both
pressure drops. Three things to read before quoting it:

* **The gas viscosity and conductivity are dilute-gas values** (Chung,
  Eucken). At 150 bar the real gas is more viscous and more conductive.
* **The WaterCooler and the Chiller condense ammonia.** They are designed on
  the **gas film of the vapour that leaves** — the condensate film, which is
  better, is not credited — so their areas are on the safe side, and their
  pressure drop is a single-phase estimate. The sheet says so.
* **The chiller's boiling-ammonia coefficient is typed** (2500 W/m²/K), not
  computed: no boiling correlation is wired into the design.

The FEHE comes out at ~1821 m²<!--golden: equipment FEHE values.A--> over four shells with U ≈ 474 W/m²/K<!--golden: equipment FEHE values.U--> — the
flowsheet's own interchanger declares 2000 m² at U = 550. The design's area
is the one costed; the declared one is published beside it, and the
flowsheet's answer is not moved.

### Product storage

A storage tank is not a flowsheet unit, so it is declared in the postDict,
**attached to the boundary stream it stores** (`storage ( ... )` in
`system/postDict`). Its volume is

    V = storageTime × ṁ / (ρ_liquid × fillFraction)

split into equal tanks of at most `maxTankVolume`; ṁ is the stream's own
mass flow and ρ its liquid density at the state it carries, from the case's
own property package. Every number in the basis (21 days, 90 %, 30 000 m³)
is a design assumption, not a datum.

Two things a group should read before quoting the tanks:

* **The cost is a lower bound.** The only tank correlation read (CAPCOST
  2017, the authors' program for Turton's Appendix A) prices an
  *atmospheric* API fixed-roof tank. Ammonia here is stored refrigerated at
  −35 °C, in an insulated, double-containment tank that costs more. No
  factor is invented to close the gap; the run says LOWER BOUND on every
  tank.
* **The density is the engine's own liquid-property door.** The run prices
  liquid ammonia at 238 K at 684 kg/m³<!--golden: equipment NH3Storage/tank1 inventory.ProductNH3.rho--> (the tanks'
  stored mass divided by their liquid volume). Until the door took over
  (DEV.md 4c C378) the tanks were sized on ~769 kg/m³, about 12 % high against
  the ~684 kg/m³ the literature gives near 238 K, and so about 12 % small;
  this page's earlier warning about that is retired with the number it
  described.

Not stored here, by decision: the **nitrogen supply** belongs to the air
separation unit, outside this battery limit. A *gas* is refused by the tank
sizer by name: a gas is stored in pressure vessels (next section).

### The hydrogen buffer

The electrolysers follow an intermittent renewable supply; the synthesis
loop wants a steady feed. Between them sits a **hydrogen buffer**:
`H2Buffer`, attached to the boundary stream `H2Feed` (`gasStorage ( ... )`
in `system/postDict`). A pressure vessel gives back only the gas between
its full state and the state it must keep to deliver at the pressure the
make-up train needs, so

    working gas  = autonomy × ṁ(H2Feed)
    V_total      = working gas / (ρ(P_max, T) − ρ(P_min, T))

with both densities from the case's **own** property package (SRK). The run
prints the compressibility at both ends — hydrogen is supercritical here and
SRK puts it a few per cent *above* the ideal gas (Z ≈ 1.05 at 100 bar), so
the ideal gas would oversize the working gas per m³. The volume is split
into equal **standing** vessels of at most `maxVesselVolume` (standing
because the Turton vessel set that costs them is the vertical one), each
wall by the ASME thin-wall rule at P_max read as gauge.

Every number in the basis is a design assumption, not a datum: **2 h** of
autonomy at full rate (a short-term buffer against a cloud or a wind lull —
a day/night or seasonal buffer is a different store, a cavern or a
pipeline, and the groups' question); **P_max 100 bar**, the carbon-steel
record's own rating; **P_min 32 bar**, the 30 bar make-up suction plus 2
bar for the let-down valve; **313.15 K**, the stream's own; at most **400
m³** per vessel. The run gives ten vessels of about 362 m³<!--golden: equipment H2Buffer/vessel1 values.V_R--> (D 5.36 m<!--golden: equipment H2Buffer/vessel1 values.D--> × H
16.1 m<!--golden: equipment H2Buffer/vessel1 values.H-->) with **201 mm<!--golden: equipment H2Buffer/vessel1 values.t_wall *1e3--> walls**, holding 26.6 t<!--golden: equipment H2Buffer/vessel1 values.m_full *1e-3--> of hydrogen full, of which
17.8 t<!--golden: equipment H2Buffer/vessel1 values.m_working *1e-3--> is working gas and 8.8 t<!--golden: equipment H2Buffer/vessel1 values.m_cushion *1e-3--> is cushion that never leaves.

Three things to read before quoting the buffer:

* **It is priced by its steel, not by a correlation** (Vítor's ruling,
  DEV.md 4c C89). Each vessel costs its published shell steel — the
  cylindrical shell only, ρ π D H t, 426 t<!--golden: equipment H2Buffer/vessel1 values.weight *1e-3--> — times a **declared installed
  price of 8 EUR/kg** (`steelPrice`, a round placeholder with heads,
  nozzles and supports folded in; not a quotation and not from any source):
  about 3.4<!--golden: equipment H2Buffer/vessel1 cost.bareModule *1e-6--> M€ per vessel and **34.1 M€ for the buffer** (its bare-module
  cost), with no index and no module factor applied, because the price is
  already an installed one; like every item it then carries the 1.18
  contingency and fee into its total-module cost and the FCI. The Turton vessel set is still printed beside each vessel
  as an *extrapolated comparison*: its pressure factor grows with the wall,
  and a 200 mm wall on a 5.36 m shell (t/R ≈ 0.075) gives F_P ≈ 32 and about
  30 M€ per vessel — nine times the steel. It enters no total. The buffer
  still more than doubles the fixed capital (41.3 → 99.5<!--golden: kpi economics FCI *1e-6--> M€); the price per
  kg, the hours, the pressures and the vessel size are the levers.
* **It is a lower bound.** The *charging compressor* that takes the
  hydrogen from 30 bar to 100 bar is not in the flowsheet: neither it nor
  its power is sized or priced, and the run says so on every run.
* **The hours are assumed**, not derived from a renewable-power profile.

The hydrogen the full buffer holds is **raw-material stock** in the working
capital, at its purchase price. The vessels are placed on the plot plan
south-west of the make-up train, each with its own hydrogen release zone;
like the ammonia tanks they are not on a routed pipe, because a store is
not a flowsheet unit.

### What each item holds

The working capital needs to know how much material is *inside* the plant
while it runs. An item in the postDict may declare

    inventory { held ( { stream RawLiquid; fraction 0.25; }
                       { stream UnreactedGas; fraction 0.75; } ); }

and then holds, per phase, m = V × fraction × ρ × w: V its own sized
volume, ρ and w the density and mass fractions of the stream named for that
phase, at the state that stream carries (the phase is read off the stream).
The converter (bed voidage 0.40), the separator (liquid level 0.25) and the
two let-down drums (half full) declare one; every fraction is an assumption.
The storage tanks hold their working level, 21 days of production.

| item | held | kg |
|---|---|---|
| `NH3Storage` (2 tanks) | liquid ammonia | ~24.9<!--golden: equipment NH3Storage/tank1 inventory.mass.total & equipment NH3Storage/tank2 inventory.mass.total *1e-6--> × 10⁶ |
| `Separator` | liquid + loop gas | ~4 878<!--golden: equipment Separator inventory.mass.total--> |
| `StorageFlash` | liquid + flash gas | ~11 693<!--golden: equipment StorageFlash inventory.mass.total--> |
| `Converter` | loop gas in the bed voids | ~193<!--golden: equipment Converter inventory.mass.total--> |
| `LetdownHP` | liquid + let-down gas | ~12 676<!--golden: equipment LetdownHP inventory.mass.total--> |

The run prints this table, writes it to `reports/inventory/inventory.csv`
and puts each item's block on its design sheet. The compressors and the
exchangers are listed as **NOT DECLARED** — they hold gas, but no sizer
publishes the volume they hold it in, and none is invented. The golden is
the authority on these numbers; this table is a reading of one run.

## Economics and working capital

`system/postDict` ends with an `economics {}` block (Turton's cost of
manufacture and a discounted cash flow) priced from
[`constant/economics`](constant/economics). **Every price there is a cited
public figure** (read 2026-11-13, source, page and arithmetic in each price's
provenance block), and the three are different kinds of number:

| stream | price | what it is |
|---|---|---|
| ammonia, sold | 0.530 EUR/kg | the EU's **import unit value** of anhydrous ammonia in 2025 (Eurostat Comext, CN 28141000, extra-EU27: 1 427 171 639 EUR for 2 693 549 t, so 1 427 171 639 / 2 693 549 000 kg = 0.5298 EUR/kg), a customs value at the EU border used here as the **market price of conventional ammonia**; all twelve months of 2025 are in the data and the dataset does not state whether the year is final; not a price at the gate, not a contract price |
| hydrogen, bought | 8.0 EUR/kg | ACER's statement of the average **cost** of renewable (RFNBO) hydrogen in the EU: "around 8 EUR/kg, ranging between 7-10 EUR/kg ... depending on the country of origin" (European hydrogen markets, 2025 Monitoring Report, 2 Dec 2025, p. 40; an estimate current in October 2025, based on a commercial data provider's cost estimates). The source states no delivered price and no pressure: that the plant pays this cost at its fence is **this case's reading**, not the source's |
| nitrogen, bought | 0.0175 EUR/kg | a **modelled production cost** from Table 2 of OIES paper ET40 (October 2024): the highest of the six "Present" values, 18.98 USD/t (Chile Atacama, PV), at 1.08238 USD per EUR (ECB, 2024 average); not a merchant price, and about 1 % of the raw-material bill |

No transaction or contract price of renewable ammonia could be read, so none
is assumed: the case sells at the market price of the **conventional** product,
and the premium the plant needs is not an input, it is what the engine's
break-even prints (below). The ends of the feasibility cases' `sensitivity {}`
are each on the basis of its base price, cited in the provenance block:
ammonia 0.380-0.692 EUR/kg (the lowest and highest monthly EU import unit
value of 2025, June and November, from the same Eurostat dataset); hydrogen
7.0-10.0 EUR/kg (ACER's own range of the cost of renewable hydrogen by
country of origin; the market index the same report gives, "averaging
approximately 8.2 EUR/kg" in 2025, p. 41, the HYDRIX65 index of the European
Energy Exchange, supports reading the 8.0 cost as a price); nitrogen
0.0159-0.0175 EUR/kg (OIES Table 2, six "Present" values, 2024). Figures of
another kind are context in the blocks, not ends: a US free-on-board estimate
and a nine-month 2026 value for ammonia, and 4.95 EUR/kg for hydrogen, the
average offtake price ACER calculated for ammonia producers from the bids of
a subsidised auction (p. 26).

At these prices **the plant loses money, and that is the finding**: the
hydrogen alone costs 0.1803 kg H₂/kg NH₃ x 8.0 = 1.44 EUR per kg of ammonia,
2.7 times what the ammonia sells for (0.530). NPV is -3 238<!--golden: kpi economics NPV *1e-6--> M EUR and there
is no IRR. (The hydrogen price was an assumed 4.50 EUR/kg, the ammonia 1.00
and the nitrogen 0.05 EUR/kg before 2026-11-13, giving NPV −405 M EUR; those
figures had no source.)

**Which tax reading this NPV is.** The plant loses money in every one of its
15 operating years, and by default the cash flow treats each year's negative
tax as a credit: it assumes the owner has other taxable profit to set the
loss against. That credit is worth about **841 MEUR<!--golden: kpi economics taxCreditOnLoss_NPV *1e-6--> of the NPV** (1 654 MEUR<!--golden: kpi economics taxCreditOnLoss *1e-6-->
of tax credited over the 15 years, undiscounted; the run announces it, with
the KPIs `lossYears`, `taxCreditOnLoss` and `taxCreditOnLoss_NPV`). A
stand-alone project has no such profit; declare `taxOnLoss none;` in the
`economics` block for that reading, and the NPV falls by that amount, to
-4 079.1 MEUR<!--golden: kpi economics NPV &- kpi economics taxCreditOnLoss_NPV *1e-6--> (the difference of the two numbers above; a run of a scratch copy of
this case with `taxOnLoss none;` added to the `economics` block printed
`NPV(i=0.100) = -4085642704 EUR`, `taxCreditOnLoss` 0 and the break-evens
unchanged, but it was taken BEFORE the 2026-11-19 lote moved this plant and
has not been repeated). Neither reading carries a loss forward.

**At what price does it pay?** "Never" teaches little, so the `economics`
block declares `breakEven { price ( ProductNH3 H2Feed ); }` and the run
prints, beside the NPV, the price of one stream at which the NPV is zero with
every other price held (found by pricing the same appraisal again). The
**minimum selling price of ammonia** is **1.930 EUR/kg<!--golden: kpi economics breakEven_price_ProductNH3-->**, **3.6 times** the
conventional market price of 0.530 (KPI `breakEven_price_ProductNH3`): that
is the premium a renewable-ammonia buyer would have to pay for the plant to
break even at the cited hydrogen cost. The **highest price of hydrogen the
plant can bear** is **1.780 EUR/kg<!--golden: kpi economics breakEven_price_H2Feed-->**, 22 % of the cited 8.0 and below the
bottom of ACER's 7-10 EUR/kg range (`breakEven_price_H2Feed`). The first is above the
cost of making a kilogram (`productionCostPerKg` 1.863<!--golden: kpi economics productionCostPerKg--> EUR/kg, which is COM_d
over the year's ammonia) because a price that only covered COM_d would leave
nothing to recover the 146 MEUR<!--golden: kpi economics TCI *1e-6--> of total capital: pre-tax, at the 10 %
discount rate over 15 years, that capital charge alone adds about 0.07
EUR/kg. Both numbers inherit every assumption of the case (the other prices,
the capital, the utility bill that is a lower bound) and say what the plant
needs, not what the market will pay. At the two break-even prices every
operating year has a positive taxable income, so the two break-evens are the
same under either tax reading above. For comparison only, and not like for
like: IRENA's Innovation Outlook, Renewable Ammonia (2022) estimates "the
range of USD 720 - 1 400 per tonne" for the production cost of renewable
ammonia in new plants today (pdf p. 16), 720 being the estimate for the best
solar and wind sites (p. 12): 0.68 to 1.33 EUR/kg at the ECB 2022 annual average of
1.05305 USD per EUR (read 2026-11-13 from the ECB data API, EXR/A.USD.EUR.SP00.A, 1.0530486), with hydrogen made on site; this plant buys hydrogen at
the EU's cost today.

### Utilities: what serves each duty, and the converter's steam credit

Every heat duty a unit publishes is served by a plant utility, carried by
its own process streams (the `FEHE`), or **listed as unserved** — never
dropped (DEV.md 4c C52). The allocation picks, for each duty, the
lowest-grade utility in `constant/utilities/` that can take it across a
10 K approach: cooling water for the 40 °C coolers, ammonia boiling at
−33 °C for the chiller, electricity for the compressors.

The **converter** releases 30.3 MW<!--golden: kpi Converter Q_kW *-1e-3--> at 460 °C. Left to the automatic pick it
would be dumped into cooling water and *charged for*. A real ammonia loop
raises HP steam from that heat in a waste-heat boiler, so the case
**declares** the service on the unit (`utility steamGenerationHP;` in
[`Converter/system/flowsheetDict`](Converter/system/flowsheetDict)):

| | |
|---|---|
| the record | [`constant/utilities/steamGenerationHP.dat`](constant/utilities/steamGenerationHP.dat) — saturated steam at the `steamHP` header's own 41 bar / 252 °C, feedwater taken at saturation |
| steam raised | ~17.7 kg/s<!--golden: utility Converter cooling.steamGenerationHP.kg_s--> (~64 t/h) |
| its value | **−18 EUR/GJ — a credit**, the price the plant would pay for the same steam from `steamHP.dat`; an **author-set assumption** and an *upper* bound (the steam is worth that only if something in the plant uses it) |
| the credit | ~15.5<!--golden: kpi economics C_UT_credit *-1e-6--> × 10⁶ EUR/yr, printed on its own line under C_UT |

The record lives **in this case**, not in the public catalogue, because its
price has no primary source behind it. A credit is never picked
automatically — earning it means installing a boiler, which the case
declares — and a declared utility that cannot serve its duty (wrong sign,
or too hot to receive heat at 460 °C less 10 K) is **refused by name**.

One duty stays **unserved** and the utility bill says LOWER BOUND because
of it: the `StorageFlash` must cool to −35 °C and the coldest utility in the
catalogue boils at −33.3 °C. That is a real finding about this design, not
a defect.

### Working capital: *capital circulante* and *fundo de maneio*

Working capital is the money a running plant keeps tied up in things that
are not equipment: the material in its tanks and vessels, what its
customers still owe it, and the cash it keeps to pay its bills.

* The **gross** working capital — the **current assets** (*capital
  circulante*) — is the sum of those.
* Part of it is financed by the plant's **suppliers**, who are paid later
  than they deliver: the **payables**, a current liability.
* What is left — current assets minus current liabilities — is the **net**
  working capital (*fundo de maneio*): the part the owners must actually put
  in. It is invested once, at start-up, and recovered when the plant stops,
  so the cash flow carries the **net** figure at year 0 and returns it in
  the last year.

Instead of the usual 15 % of the fixed capital, this case **builds it up**
(`workingCapital { ... }` in the economics block):

| line | rule (this case) |
|---|---|
| raw-material stock | the hydrogen the full buffer holds, at its purchase price; 0 days of nitrogen, which arrives by pipe from the ASU |
| process inventory | what the vessels hold (above), at cost |
| product stock | what the two tanks hold — 21 days of production — at the **cost of making it** (COM_d per kg of product), never at its sales price |
| receivables | 30 days of sales |
| minimum cash | 15 days of the cash cost of manufacture (COM_d) |
| **= gross** (*capital circulante*) | |
| − payables | 30 days of raw-material purchases |
| **= net** (*fundo de maneio*) | the WC of the cash flow |

Every held component is valued at what it cost the plant: hydrogen and
nitrogen at their purchase price, ammonia at the plant's cost of manufacture
per kilogram. The run prints the build-up line by line, both totals, and
the 15 %-of-FCI figure beside them for comparison; it writes them to
`reports/economics/workingCapital.csv`. The days are design-basis
assumptions for this case, not data. Here the product stock and the
receivables dominate. Before the hydrogen buffer was sized (DEV.md 4c
C89) the net working capital came out several times larger than 15 % of
the fixed capital — the fixed capital excludes the electrolysers and the
ASU while the raw materials and product are priced in full; with the
buffer's vessels in the fixed capital the net working capital is still about
three times the 15 % figure. The hydrogen the buffer holds adds little to the working capital
(26.6 t at 8.0 EUR/kg); what it adds to the fixed capital is the lesson.

## Plant layout

[`system/layoutDict`](system/layoutDict) is the plant's **plot plan**: where
each sized item stands (plan centre `x`, `y`, base `z`, and which way it
lies), the separation distances the case requires between kinds of
equipment, the prevailing wind, and the hazardous-area (ATEX) zones around
the items that can release hydrogen or ammonia. Every run checks it after
the sizing pass: two items that overlap are **refused**; a pair closer than
its declared distance, an ignition source inside a zone, or one downwind of
a release is **announced**. Grammar and checks:
[`docs/design/a-plant-layout-is-declared-and-checked.md`](../../../docs/design/a-plant-layout-is-declared-and-checked.md).

**Every distance, zone extent, wind value and position in the file is a
placeholder — an author-set assumption for you to replace with your own
site data**, stated so on each line with its `source` and `reason`. None
comes from a spacing or hazardous-area standard: Choupo ships no such table
(the published ones grant no redistribution), so a real project takes its
numbers from the standard its client specifies and from the site's wind
rose. The nine cylinders (the coolers, the converter and the drums) and the
ten hydrogen-buffer vessels take their size from their own design sheets;
the compressors, the FEHE (four
shells), the two ammonia tanks, the control room and the electrical
substation have DECLARED boxes, because their sizers publish no diameter
and length — the engine will not invent one.

**Redraw it** with `bin/choupo-layout --draft --force .` from the case
directory: it lines the sized items up in flow order again and keeps the
separation table, wind, boxes, non-process items and zones. **See it** in
the GUI under Reports → "Plant layout (3D)", and learn to read it in the
EduTool **"Plant layout: where each item stands, and why"** (Process design
& economics shelf).

**The site.** The plot plan is a site, laid out by the method of
[`ammonia02_full_plant`](../ammonia02_full_plant): a ring road round the
process block (so a fire tender reaches every item from two sides), the
main road carried west past the hydrogen buffer, a road along the tank
bund, a **main gate** on the north fence beside the control room (upwind:
the wind blows from the north-west) and an **emergency gate** on the east
fence at the end of the tank-farm road. The **fence** is the plot's
boundary, and every pipe that enters or leaves the plant crosses it at a
labelled point that names where it comes from or goes to — the
electrolysers and the air separation unit for the feeds, the gas
treatments this case does not model for the three gas outlets.

**The plan raises no finding.** Until 2026-11-09 it left two on purpose
(the two ammonia tanks 12 m apart against the 17 m the file declares
between two tanks, and the electrical substation inside `MakeupComp1`'s
zone 2); as the course's reference plant it resolves both — the tanks
stand 18 m apart, the substation west of the compressors, upwind and
outside every zone, with its own rows in the separation table. Move
`tank2` back to x 181 m, or the substation back to (16, −31) m, and the run
announces each again: say why your own arrangement is safe.

**The stores are piped.** The ten buffer vessels and the two ammonia tanks
are stores attached to a boundary stream in `system/postDict`, not
flowsheet units. The engine routes that stream through the store: `H2Feed`
from the west fence to a header between the two rows of vessels (one branch
to each vessel's low nozzle) and on to the make-up mixer, `ProductNH3` from
the storage flash to a header beside the two tanks (one branch to each) and
on to the east fence. Each branch is a pipe of its own in the register
(`pipe:H2Feed@H2Buffer/vessel1`, ...), with the stream's state and no flow.

**The utilities block (2026-11-10).** The north-east corner of the plot
holds three facilities that the run's own utility ledger consumes: the
**cooling tower** (19.4 MW<!--golden: utility N2Cooler cooling.coolingWater.duty_kW & utility Intercooler cooling.coolingWater.duty_kW & utility Aftercooler cooling.coolingWater.duty_kW & utility WaterCooler cooling.coolingWater.duty_kW *-1e-3--> rejected by the four water coolers, 465 kg/s<!--golden: utility N2Cooler cooling.coolingWater.kg_s & utility Intercooler cooling.coolingWater.kg_s & utility Aftercooler cooling.coolingWater.kg_s & utility WaterCooler cooling.coolingWater.kg_s-->
circulated), the **ammonia refrigeration package** (the 20.8 MW<!--golden: utility Chiller cooling.refrigerationNH3.duty_kW *-1e-3--> the Chiller
takes at -33.3 C, 15.2 kg/s<!--golden: utility Chiller cooling.refrigerationNH3.kg_s--> of boiling ammonia) and the **flare** (the three
gas outlets, 747 kg/h in all, with its own spur of the tank-farm road and
60 m rows in the separation table). Each is a non-process box declared in
`layoutDict`; the number it is sized on is the run's, the box drawn on it
is an author-set assumption. They are outside the battery limit, so none is
costed (their running cost is already in C_UT) and no capital is invented
for them. They leave the plot, the land and every balance unchanged.

**The utility lines (2026-11-13, DEV.md 4c C268 slice 2).** A utility is
not a stream of the flowsheet, so the engine routes nothing for one by
itself; `layoutDict` now DECLARES thirteen lines in `utilityLines` and the
engine routes them on the pipe rack, on tiers above the process pipes' (no
process route moves), and checks them like a process pipe: the cooling
water from the tower to each of the four coolers and back (eight lines,
carrying 47.3<!--golden: utility N2Cooler cooling.coolingWater.kg_s-->, 123.9<!--golden: utility Intercooler cooling.coolingWater.kg_s-->, 131.2<!--golden: utility Aftercooler cooling.coolingWater.kg_s--> and 162.9<!--golden: utility WaterCooler cooling.coolingWater.kg_s--> kg/s, the run's own utility
allocation), the refrigerant between the package and the Chiller (two, 15.18<!--golden: utility Chiller cooling.refrigerationNH3.kg_s-->
kg/s) and a flare header from the separator and the two let-down drums (three,
no flow: the case declares no relief valve, and its three vent gases are
already piped to the fence as process streams). EVERY LINE IS UNSIZED:
the layout sizes no pipe. They are listed under the pipe register in
Reports -> Plant layout (3D) and drawn there by service.

**What still hangs, and why.** No steam line: the run draws 0.03 kg/s<!--golden: utility Separator heating.steamLP.kg_s--> of
low-pressure steam for the separator (60 kW<!--golden: utility Separator heating.steamLP.duty_kW-->), from a
steam system outside this battery limit with no item on the plot to start a
line from; the steam the converter raises is a credit, not equipment. Two
things a real plant has and this case does not compute: the refrigeration
compressor's shaft power and the flare's emergency relief load (the flare is
placed on the normal vent load only).

## The line list (2026-11-19, DEV.md 4c C207, C440)

The 24 process pipes the layout routes are sized by the `lineDesign {}` block at the end
of `system/layoutDict` and listed, one row per line, in `reports/lines/lineList.csv`
(the sheet of each line is `design/lines/<stream>`).  The rules are the case's, each with
its book or the word `assumed`: velocity window by service (Towler and Sinnott 2008,
section 5.6), the wall of ASME B31.3 Eq. 5.8, the nominal sizes and walls of Perry's
Table 10-22, the fittings of Towler Table 5.3, and an ASSUMED 15000 Pa limit on rho v^2 (a screening value with no source in the folder)
that no book in the folder gives.  `line01_pumped_drum` works one line by hand.

| line | from -> to | service | NPS (in) | sch | v (m/s) | governed by | drop (kPa) |
|---|---|---|---|---|---|---|---|
| N2Feed | inlet -> N2Boost | gas | 10 | 40 | 24.9 | service window | 18.0 |
| N2Compressed | N2Boost -> N2Cooler | gas | 8 | 40 | 16.7 | erosion rho v^2 | 20.5 |
| N2Cooled | N2Cooler -> MakeupMix | gas | 6 | 40 | 19.0 | erosion rho v^2 | 27.0 |
| H2Feed | inlet -> MakeupMix | gas | 10 | 40 | 21.2 | service window | 7.4 |
| Makeup30 | MakeupMix -> MakeupComp1 | gas | 10 | 40 | 28.2 | service window | 13.3 |
| Makeup67 | MakeupComp1 -> Intercooler | gas | 8 | 40 | 27.3 | service window | 43.6 |
| Makeup67Cool | Intercooler -> MakeupComp2 | gas | 8 | 40 | 20.4 | erosion rho v^2 | 28.7 |
| Makeup150 | MakeupComp2 -> Aftercooler | gas | 8 | 160 | 17.4 | erosion rho v^2 | 40.7 |
| Makeup | Aftercooler -> LoopMix | gas | 8 | 160 | 12.9 | erosion rho v^2 | 20.6 |
| Recycle | PurgeSplit -> RecycleComp | gas | 10 | 160 | 16.7 | erosion rho v^2 | 31.2 |
| CompRecycle | RecycleComp -> LoopMix | gas | 10 | 160 | 16.0 | erosion rho v^2 | 36.8 |
| Mixed | LoopMix -> FEHE | gas | 12 | 160 | 17.2 | erosion rho v^2 | 24.6 |
| HotEffluent | Converter -> FEHE | gas | 16 | 160 | 23.6 | erosion rho v^2 | 34.0 |
| CooledEffluent | FEHE -> WaterCooler | gas | 12 | 160 | 16.9 | erosion rho v^2 | 39.9 |
| PreheatedFeed | FEHE -> Converter | gas | 16 | 160 | 24.7 | erosion rho v^2 | 34.5 |
| WaterCooledEffluent | WaterCooler -> Chiller | two-phase | not sized | | | | |
| ChilledEffluent | Chiller -> Separator | two-phase | not sized | | | | |
| RawLiquid | Separator -> LetdownHP | liquid | 4 | 80 | 2.8 | service window | 40.3 |
| UnreactedGas | Separator -> PurgeSplit | gas | 10 | 160 | 16.7 | erosion rho v^2 | 35.2 |
| Purge | PurgeSplit -> outlet | gas | 0.25 | 80 | 11.2 | erosion rho v^2 | 867.1 |
| LetdownLiquid | LetdownHP -> StorageFlash | liquid | 4 | 40 | 2.5 | service window | 45.1 |
| LetdownGas | LetdownHP -> outlet | gas | 0.5 | 40 | 18.9 | service window | 168.9 |
| ProductNH3 | StorageFlash -> outlet | liquid | 4 | 40 | 2.4 | service window | 158.0 |
| FlashGas | StorageFlash -> outlet | gas | 3.5 | 40 | 26.7 | service window | 4.3 |

What to read in it.  On the dense loop gas (40-50 kg/m3 at 150 bar) the 15-30 m/s window
is not what sets the bore: the declared rho v^2 limit is, so those lines run at 16-17 m/s
and are one or two sizes larger than the window alone would give.  Eleven lines carry the flag "design pressure above the material record's maxP" (the carbon
steel record states 100 bar): Makeup150, Makeup, Recycle, CompRecycle, Mixed, HotEffluent,
CooledEffluent, PreheatedFeed, RawLiquid, UnreactedGas and Purge.  The flag is left
standing: the material of the 150 bar lines is a design decision (DEV.md 4c C440), not
one the line list makes.  The line list does not repeat the record's temperature check (the sizing pass owns it; the
733 K `HotEffluent` is above the record's 700 K), and the pipe schedule here is a teaching
value on a record that its own header calls unsourced.  The two two-phase lines (the water cooler's and the chiller's outlets) are
listed and NOT sized: no book in the folder gives a velocity rule for two-phase flow, and
the Lockhart-Martinelli drop is not built.  The tiny `Purge` and `LetdownGas` lines sit at
the bottom of the declared table (1/4 in and 1/2 in) and carry the "drop above the guide"
flag, as does any line that is long for its size.

## Engine notes

* The store is declared at −35 °C, not −33.4 °C: a pure liquid at its own
  boiling point is the one state a flash cannot decide.

## History

Until 2026-10-01 this case was a 500 t/day plant fed with industrial-grade
nitrogen, in four sectors with a deoxo reactor, a dryer, a purge scrubber,
sizing and economics, and two case documents. It was rewritten to the
project base data v2 at Vítor's request and simplified the same day; the
earlier versions are in the git history.

Dated notes moved here from the dictionaries' headers (DEV.md 4c C435):

* **system/layoutDict, until 2026-11-09.** The file left two findings on purpose
  for the groups to resolve: the two ammonia tanks 12 m apart against the 17 m
  declared between two tanks, and the electrical substation 8 m from the axis
  of MakeupComp1's zone 2 (radius 9 m), an ignition source inside a hazardous
  area. Both were resolved when the plant became the course's reference: tank2
  moved east inside the same bund (to 18 m, shell to shell), and the
  substation moved west of the compressor row, at (16, -31) m no longer.
* **system/postDict.** Until DEV.md 4c C52 the converter's ~30.6 MW was dropped
  (the utility allocation read no reactor's duty); it is now served by the
  declared `steamGenerationHP`. The exchangers' U was a declared assumption per
  exchanger before they were designed (C44 slice 1); it is each exchanger's
  design result now. The design pressure was 1.1 x the absolute operating
  pressure before C150 R01; it is now the rule on the gauge pressure.
* **constant/economics.** The three prices were replaced by CITED public
  figures on 2026-11-13 (DEV.md 4c C389).

## The nozzle schedule (2026-11-19, DEV.md 4c C444)

Every item's equipment sheet (`design/<unit>/<tag>`) carries a `nozzles {}` block, from the
`nozzleDesign {}` block at the end of `system/layoutDict`: one row per line that ends on the
item (mark N1.., service, stream and line, nominal size, flange class and facing,
orientation, design pressure and temperature), and a manway (M1) on each vessel of 1.2 m or
more.  The size is the line's, or the item's own criterion where that asks more: the
Separator's liquid outlet is a 6 in nozzle on a 4 in line (the drum's rho v^2 and
clearance criterion of C318), printed as a reducer.  The flange class is read from the
case's pressure-temperature table (Perry 9th ed. Table 10-42a, c, d, pp. 10-95 and 10-96,
extracted from ASME B16.5), at the item's `pressureDesign` (166 bar gauge on the loop:
class 1500, ring joint) and the hottest connected stream plus an ASSUMED 25 K margin.
Declared as `assumed`, with the reason: the 25 K margin, the 1500 ring-joint threshold, the
inspection-opening size, the manway count of a vessel and a tank (Towler p. 714 gives the
1.2 m entry limit; p. 1062 the 0.6 m access port).  Rows the case could not decide are
listed with the reason, never defaulted: a line not sized (two-phase) or an item with no
criterion for a port gives no size; a design temperature above the last row of the SS316
table gives no class.  The rows are pinned by the golden (`layout nozzle:<item>:<mark> ...`).
