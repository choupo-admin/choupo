# `aceticAcid02_plant` — acetic acid from CO + methanol: a BASE CASE to optimise

Rung 2 after `aceticAcid01_gibbsReactor`.  The same Gibbs reactor, now inside a
plant: a methanol feed tank and its pump, a condenser, a CO recycle against a
purge, a degasser, a lights column, and an acetic acid product tank.
**It runs (32 s), it converges, and it is deliberately NOT optimised** — every
number a student would tune is a plain key in `system/flowsheetDict`.  The
optimisation is the exercise.

```bash
source etc/bashrc
runCase tutorials/plant/aceticAcid02_plant
```

The case is sealed: everything it reads is in its own `constant/`.

## 1. The flowsheet

```
freshMethanol (1 atm) -> [methanolTank] -> [methanolPump 30 bar] -> methanolToProcess
methanolToProcess + freshCO (pipeline) + coRecycle -> [M1] -> [preheater 460 K] -> [reactor]
        reactor liquid ---------------------------------------------+
        reactor gas -> [condenser 330 K, 30 bar] -> condensate -----+-> [M2]
                              |                                          |
                            coGas -> [purge 5 %] -> purge            [letdown 1.5 bar]
                                       |                                 |
                                   coRecycle  (the one recycle)    [degasser 380 K] -> offgas
                                                                         |
                                                                  [lightsColumn]
                                                                   |           |
                                                               lightsOut   acidProduct
                                                                                |
                                                                          [acidTank] -> acidShipped
```

**One recycle** (CO), closed with Wegstein in 46 iterations.  A second recycle
(the lights column's distillate back to the reactor) was built first and
abandoned: it cost 7 min 25 s a run, and the stream it recycled is 94 % acetic
acid.  `lightsOut` is a declared plant outlet.

**Two tanks** (added 2026-10-18, DEV.md 4c C87): the methanol the plant buys
is held in `methanolTank` before the process takes it, and the acid it makes
is held in `acidTank` between shipments.  Both are `storageTank` units: the
outlet IS the inlet, so they move no process number; what they add is the
inventory and the equipment (section 8).  The CO is **not** stored: it
arrives by pipeline at the plant pressure.

## 2. Base-case result (not optimised)

| | |
|---|---|
| feeds | 100 kmol/h methanol, 105 kmol/h CO |
| `acidProduct` | **98.39 kmol/h**, 99.89 mol % acetic acid (methyl acetate 0.05 %, water 0.06 %) |
| acid lost | `lightsOut` 0.89, `offgas` 0.66, `purge` 0.015 kmol/h; the rest is accounted for |
| yield on methanol | ~98.4 % to product |
| first-law residual of the plant | +6.17 kW, 0.10 % of the energy exchanged -- 3.28 kW of it is the methanol pump's (section 3) |
| inventory held in the two tanks | 1077 t of methanol + 992 t of acetic acid (section 8) |

## 3. What is modelled, and what is not

* **Reactor:** the Gibbs reactor of rung 1 — equilibrium at 460 K, 30 bar, 10 K
  approach.  No catalyst, no rate.  Its liquid is ideal by construction
  (`elementPotential`: gas plus one ideal condensable); the 10 K barely moves
  the main product (see rung 1).
* **Separations:** UNIFAC, which is **predictive** — the catalogue has no
  regressed pair for most of this system.  Every activity coefficient is an
  estimate from structure.
* **Vapour:** ideal gas.  Acetic acid is largely dimerised in real vapour.
  The engine models that dimer only on its REACTIVE-equilibrium path (a
  `vapourDimerisation` block on the acid's gas-liquid chemistry record; see
  `tutorials/steady/flash/flash12_nh3_acetic_ethanol_reactive` and `flash13`);
  a gamma-phi package like this one (UNIFAC liquid, ideal-gas vapour) has no
  vapour-association fugacity model, so this case does not use it and the
  condenser and degasser splits are indicative.
* **CO** has no UNIFAC group, so it sits outside the activity model
  (`approximations` block, announced as a *substitution* on every run).
* **Battery limits:** the methanol arrives as a liquid at 1 atm into its feed
  tank, and `methanolPump` (efficiency 0.65, **assumed**) lifts it to 30 bar.
  The CO arrives by pipeline, declared at 30 bar; no CO compressor is
  modelled.
* **The pump's own energy balance is announced as FAILED on every run**
  (dH 1.76 kW against 5.04 kW of shaft work, 35 % = 1 - eta).  It is the
  engine's, not the case's: the liquid enthalpy of this package carries no
  pressure term (measured here -- moving `0/freshMethanol` from 30 bar to
  1 atm left the plant's feed enthalpy unchanged to the last digit), so the
  3.28 kW of useful work v·dP the pump puts into the liquid is invisible to
  the energy report, and only its 1.76 kW of dissipation shows as a
  temperature rise.  `tutorials/steady/rotating/pump01_water` shows the same
  65 % gap.
* **Data:** dimethyl ether is `reviewStatus interim` with a Joback formation
  enthalpy (see rung 1); it is nil in every stream here.
* Antoine ranges are exceeded at 460 K (dozens of announcements per run) and
  the column prints `[distillate] WARNING` lines (47 in the base case): the
  distillate's bubble point does not converge because CO and dimethyl ether
  have no real saturation curve at those temperatures, so the distillate
  temperature is reported at the top tray.  Neither changes a flow.

## 4. The optimisation problem for the students

**Decision variables** (all in `system/flowsheetDict` unless noted):

| variable | base | where |
|---|---|---|
| reactor T, P | 460 K, 30 bar | `reactor.operation` |
| CO in excess | 105 vs 100 | `0/freshCO` |
| condenser T | 330 K | `condenser.operation` |
| purge fraction | 5 % | `purgeSplit.operation.fractions` |
| degasser T | 380 K | `degasser.operation` |
| column stages, feed stage | 20, 14 | `lightsColumn.operation` |
| reflux ratio | 5 | `lightsColumn.operation` |
| distillate rate | 1 kmol/h | `lightsColumn.operation` |
| methanol stock, product stock | 14 days, 7 days | `methanolTank` / `acidTank` `residenceTime`, and the `storage` entries of `system/postDict` (keep the two equal) |

**Objective:** yours to choose.  A natural one: acid product value minus CO and
methanol cost minus utilities (the condenser, degasser and column duties are in
`reports/`).  Choupo's outer drivers (`sweep`, `optimization`, `designSpec`) are
described in `docs/ai/outer-drivers.md`; this case ships without an `outerDict`
on purpose.

**Measured sensitivities on this base case** (one variable moved at a time):

| change | acid product | purity |
|---|---|---|
| reflux 2.5 / **5** / 10 | 98.39 (flat) | 99.87 / **99.89** / 99.92 mol % |
| purge 2 % / **5 %** / 10 % | 97.61 / **98.39** / 98.73 kmol/h | 99.78 / **99.89** / 99.94 mol % |

Reflux buys purity only slowly, and the heavy duty is the price.  More purge
gave MORE acid in this model; the mechanism was not analysed here, so treat it
as a question to answer before trusting it — it may be a feature of the
ideal-condensable reactor and the gas-only recycle rather than of chemistry.

## 5. Things to try

1. Fix the purity (say 99.9 mol %) and minimise column duty over stages and reflux.
2. Trade purge against CO loss and acid loss; add prices.
3. Move the condenser temperature and watch the CO recycle composition.
4. Put the lights back to the reactor (a second tear stream and a pump) and
   decide whether it pays — that is the variant that cost 7 min 25 s.

## 6. Sizing

`system/postDict` sizes the units that are pieces of
equipment — **sizing only, no costing**: pricing the plant is part of the
optimisation. Every design number in it is an author-set assumption declared
on its own line with its reason, and its header says which basis each item
rests on. After a run the sheets land in `design/`, one folder per unit.

| unit | sized as | basis |
|---|---|---|
| `preheater` | shell-and-tube | A = Q/(U·LMTD): the LMTD computed from the unit's own 320 → 460 K against HP steam, U **assumed** |
| `reactor` | vessel | a **declared volume** (3 m³), a hand calculation written out in the postDict — an equilibrium reactor has no volume of its own, and this one does not follow the run |
| `condenser` | vessel (the knock-out drum) | vapour residence time |
| `degasser` | vessel | vapour residence time — a liquid drum, so the volume is a **lower bound** |
| `methanolTank`, `acidTank` | atmospheric storage tank (`storage` list) | V = storage time × mass flow / (liquid density × fill fraction), the density the case's own at the stored state; 14 and 7 days, fill 0.90, at most 30 000 m³ per tank -- all **assumed** (section 8) |
| `lightsColumn` | shell (vessel), tray stack, condenser and reboiler (shell-and-tube) | the shell's diameter is the **tray-hydraulics pass's**, in design mode (80 % of flood on the worst tray; the `hydraulics {}` block in `system/flowsheetDict`, every geometry number **assumed**); its height is 18 trays × 0.5 m plus two end spaces; the two exchangers are A = Q/(U·LMTD) on the column's own duties, U **assumed** and each LMTD a hand calculation written out in the postDict |

The lights column could not be sized until 2026-10-17: the liquid on its
trays carries a trace of CO and dimethyl ether above their critical
temperatures, which have no liquid density, and the NaN went through every
hydraulic number. The engine now takes that liquid's density over the other
components — as the let-down valve already did — and **says so** in the run
(the KPI `liquidDensityUnpricedFraction_max` is the largest share left out);
a hydraulic number that is not finite now refuses by name instead of
printing. Two things are left for you: the **weep check is not performed**
(`K2` is read off a chart for your own tray, and nobody has read it), and
the column has **no reflux drum** (its sizer needs the KPI
`Q_condensate_m3_s`, which this column's `simultaneous` solver does not
publish).

**Not sized:**

* `M1`, `M2` (pipe junctions), `purgeSplit` (a tee) and `letdown` (a control
  valve) — no vessel, no area, no driver, so no item.
* `methanolPump` — the engine has no pump sizer, so it has no item (and no
  place on the plot plan).

## 7. Plant layout

`system/layoutDict` is the plant's **plot plan**: where
each sized item stands (plan centre `x`, `y`, base `z`, and which way it
lies), the separation distances the case requires between kinds of
equipment, the prevailing wind, and the hazardous-area (ATEX) zones around
the items that can release CO, methanol or acetic acid vapour. Every run
checks it after the sizing pass: two items that overlap are **refused**; a
pair closer than its declared distance, an ignition source inside a zone, or
one downwind of a release is **announced**. Grammar and checks:
`docs/design/a-plant-layout-is-declared-and-checked.md`.

**Every distance, zone extent, wind value and position in the file is a
placeholder — an author-set assumption for you to replace with your own site
data**, stated so on each line with its `source` and `reason`. None comes
from a spacing or hazardous-area standard: Choupo ships no such table (the
published ones grant no redistribution), so a real project takes its numbers
from the standard its client specifies and from the site's wind rose. The
three vessels and the column's shell take their size from their own design
sheets (the column's tray stack lives inside its shell); the two tanks take
their VOLUME from theirs and stand in a **tank area** 30 m north of the
process row, each with its own hazardous-area zones (methanol and acetic acid
are both flammable) and its own rows in the separation table, their plan
boxes declared as the bounding box of an upright cylinder holding the sized
volume; the preheater
(sized as an area, not a shell), the lights column's condenser and reboiler
(also areas) and the control room have DECLARED boxes. The column is **not** declared a release source — its zones are yours to
declare, and declaring one adds a fourth downwind finding against the
control room.

**Redraw it** with `bin/choupo-layout --draft --force .` from the case
directory: it lines the sized items up in flow order again and keeps the
separation table, wind, boxes, the control room and zones. **The pipes** are
routed by the engine over the declared rack: 17 of the 19 streams, among
them the fresh methanol to its tank, the acid from the column to its tank
and from the tank to the east battery limit. The two streams through
`methanolPump` are listed as **not routed** (the pump has no item to place),
which the run says with that reason. **The plot** is the bare envelope of
the layout, 68.5 m × 82 m = **5617 m²** (3388.5 m² before the tanks); no
`plot { margin; }` is declared, so that is a lower bound, and the tanks'
bunds -- the dikes that catch a spill -- are not drawn: both are ground the
plot must still carry, and yours to add. **See it** in the
GUI under Reports → "Plant layout (3D)", and learn to read it in the EduTool
**"Plant layout: where each item stands, and why"** (Process design &
economics shelf).

**One finding is left for you to resolve, on purpose** (announced three
times, once per release source): the control room stands **downwind** of the
reactor, the condenser drum and the degasser — the wind blows from the
north-west and the room is 47–57 m to the south-east, inside the declared
60 m reach. CO is toxic as well as flammable. Move the room, and say why
where you put it is safe.

## 8. Storage and the inventory the plant must carry

Until 2026-10-18 this plant had no tanks: the methanol went straight from the
battery limit into the reactor loop and the acid straight out, so neither the
economic analysis nor the plot plan carried the stock a real plant holds.
Now:

| tank | holds | stored state | liquid | tank volume | mass |
|---|---|---|---|---|---|
| `methanolTank` | 14 days of `freshMethanol` | 300 K, 1 atm, 785 kg/m³ | 1371 m³ | 1524 m³ | **1077 t** of methanol |
| `acidTank` | 7 days of `acidProduct` | 404 K, 1.5 bar, 911 kg/m³ | 1089 m³ | 1211 m³ | **992 t** (991.6 t acetic acid, 0.6 t methyl acetate, 0.2 t water) |

The numbers are the run's own: each `storageTank` unit publishes its holdup
(KPIs `holdupVolume_m3`, `holdupMass_kg` and the mass per component), and the
`storage` entry of the same name in `system/postDict` sizes the tank and
prints its inventory in the sizing table (`design/methanolTank/tank1`, `design/acidTank/tank1`).  The two
must say the same thing, and they do -- but each reads its OWN declaration
of the storage time and fill fraction, so **if you change one, change the
other**.

**What your economic analysis must now carry.**  Your working capital holds
the raw material and the product in these tanks (value each at your own
prices: the methanol at its purchase price, the acid at cost or at sale
price, a choice your analysis must state), plus what the process units hold
in their vessels, which the sizing pass lists only where an item declares
it.  Your fixed capital must buy the two tanks: the postDict sizes them on
an atmospheric fixed-roof tank basis, and the cost row a `costing {}` block
would price them on covers 90 to 30 000 m³ per tank.  Your plot must hold
the tank area (section 7).

**Three assumptions to replace**, every one author-set and none taken from a
source:

* **The stock.**  14 days of methanol is a delivery cycle plus a safety stock;
  7 days of acid is a weekly shipment.  Both are yours to set from your
  supply and sales plan -- and both are decision variables of the
  optimisation, since stock costs money.
* **The acid is stored HOT.**  It leaves the column at its bubble point at
  1.5 bar (about 404 K) and the tank takes it as it comes.  A real plant cools
  its product before an atmospheric tank (at 1 atm that liquid is above its
  boiling point); add a product cooler and your tank holds the denser, cold
  liquid -- and its duty is a utility cost.
* **The tank's material.**  Both are SS316, the one material record this
  sealed case carries; whether a methanol tank needs stainless steel is your
  materials question (the tank cost row carries no material factor).

**How the sizer splits a large store** (measured on this plant, not shipped):
the tank volume is split into **equal** tanks of at most `maxTankVolume`,
which has no default -- 365 days of methanol (39 724 m³ of tank) at a
30 000 m³ ceiling gives two tanks of 19 862 m³; 14 days at 1000 m³ gives two
of 762 m³.  The sizer announces no ceiling of its own; a `costing {}` pass
announces any tank outside 90 to 30 000 m³ as EXTRAPOLATED (half a day of
methanol, 54 m³, is).
