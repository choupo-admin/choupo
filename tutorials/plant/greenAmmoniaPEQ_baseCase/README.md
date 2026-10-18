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
| 3 drums | vapour residence time; for the two let-down drums, which are liquid drums, that volume is a **lower bound** |
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

The FEHE comes out at ~1840 m² over four shells with U ≈ 470 W/m²/K — the
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
* **The density is probably about 12 % high, so the tanks are about 12 %
  small.** The run prices liquid ammonia at 238 K at ~769 kg/m³. The NH₃
  record's `Vliq` (2.50 × 10⁻⁵ m³/mol, i.e. 681 kg/m³) is read by the
  engine as a 25 °C datum and extrapolated to −35 °C with Rackett; 681
  kg/m³ is, however, the figure usually quoted for liquid ammonia near its
  *normal boiling point*, not at 25 °C (this has not been checked against a
  primary source here). If the record's value is the boiling-point one,
  the density at 238 K is ~684 kg/m³ and every liquid volume sized from it
  is ~12 % larger. Correcting a record is a curation act and was not done
  in this case.

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
m³** per vessel. The run gives ten vessels of about 362 m³ (D 5.36 m × H
16.1 m) with **200 mm walls**, holding 26.6 t of hydrogen full, of which
17.8 t is working gas and 8.8 t is cushion that never leaves.

Three things to read before quoting the buffer:

* **It dominates the capital.** Turton's vessel pressure factor grows with
  the wall thickness, and a 200 mm wall gives F_P ≈ 32: each vessel costs
  about 30 M€ installed and the buffer alone about 300 M€, several times the
  rest of the plant. Whether that correlation is meant to price a wall that
  thick is not checked here; that two hours of hydrogen cost more than the
  synthesis loop is the lesson to argue with, and the hours, the pressures
  and the vessel size are the levers.
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
| `NH3Storage` (2 tanks) | liquid ammonia | ~24.8 × 10⁶ |
| `Separator` | liquid + loop gas | ~5 600 |
| `StorageFlash` | liquid + flash gas | ~5 050 |
| `Converter` | loop gas in the bed voids | ~190 |
| `LetdownHP` | liquid + let-down gas | ~85 |

The run prints this table, writes it to `reports/inventory/inventory.csv`
and puts each item's block on its design sheet. The compressors and the
exchangers are listed as **NOT DECLARED** — they hold gas, but no sizer
publishes the volume they hold it in, and none is invented. The golden is
the authority on these numbers; this table is a reading of one run.

## Economics and working capital

`system/postDict` ends with an `economics {}` block (Turton's cost of
manufacture and a discounted cash flow) priced from
[`constant/economics`](constant/economics). **Every price there is an
author-set assumption** — H₂ at 4.50 EUR/kg, N₂ at 0.05 EUR/kg, ammonia at
1.00 EUR/kg — chosen so the appraisal runs, not market data; replace each
with a dated, cited figure before quoting a result. At those prices the
hydrogen alone costs more than the ammonia sells for, and the appraisal
says so: NPV is strongly negative and there is no IRR. That is the
economics of green ammonia at an assumed hydrogen price, not a defect.

### Utilities: what serves each duty, and the converter's steam credit

Every heat duty a unit publishes is served by a plant utility, carried by
its own process streams (the `FEHE`), or **listed as unserved** — never
dropped (DEV.md 4c C52). The allocation picks, for each duty, the
lowest-grade utility in `constant/utilities/` that can take it across a
10 K approach: cooling water for the 40 °C coolers, ammonia boiling at
−33 °C for the chiller, electricity for the compressors.

The **converter** releases ~30.6 MW at 460 °C. Left to the automatic pick it
would be dumped into cooling water and *charged for*. A real ammonia loop
raises HP steam from that heat in a waste-heat boiler, so the case
**declares** the service on the unit (`utility steamGenerationHP;` in
[`Converter/system/flowsheetDict`](Converter/system/flowsheetDict)):

| | |
|---|---|
| the record | [`constant/utilities/steamGenerationHP.dat`](constant/utilities/steamGenerationHP.dat) — saturated steam at the `steamHP` header's own 41 bar / 252 °C, feedwater taken at saturation |
| steam raised | ~17.9 kg/s (~64 t/h) |
| its value | **−18 EUR/GJ — a credit**, the price the plant would pay for the same steam from `steamHP.dat`; an **author-set assumption** and an *upper* bound (the steam is worth that only if something in the plant uses it) |
| the credit | ~15.6 × 10⁶ EUR/yr, printed on its own line under C_UT |

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
buffer's vessels in the fixed capital the two figures are of the same
order. The hydrogen the buffer holds adds little to the working capital
(26.6 t at 4.50 EUR/kg); what it adds to the fixed capital is the lesson.

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

**Two findings are left for you to resolve, on purpose** — say why your
resolution is safe:

1. the two ammonia tanks stand 12 m apart, shell to shell, against the 17 m
   the file declares between two tanks — tank spacing is the first thing a
   tank-farm layout answers;
2. the electrical substation stands inside the zone 2 envelope of
   `MakeupComp1` (8 m from its axis, radius 9 m) — switchgear is an ignition
   source and does not belong in a hazardous area. The substation is also
   missing from the separation table on purpose: which distance it needs is
   your call.

## Engine notes

* The store is declared at −35 °C, not −33.4 °C: a pure liquid at its own
  boiling point is the one state a flash cannot decide.

## History

Until 2026-10-01 this case was a 500 t/day plant fed with industrial-grade
nitrogen, in four sectors with a deoxo reactor, a dryer, a purge scrubber,
sizing and economics, and two case documents. It was rewritten to the
project base data v2 at Vítor's request and simplified the same day; the
earlier versions are in the git history.
