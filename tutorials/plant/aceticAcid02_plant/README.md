# `aceticAcid02_plant` — acetic acid from CO + methanol: a BASE CASE to optimise

Rung 2 after `aceticAcid01_gibbsReactor`.  The same Gibbs reactor, now inside a
plant: a condenser, a CO recycle against a purge, a degasser, a lights column.
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
freshMethanol + freshCO + coRecycle -> [M1] -> [preheater 460 K] -> [reactor]
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
```

**One recycle** (CO), closed with Wegstein in 46 iterations.  A second recycle
(the lights column's distillate back to the reactor) was built first and
abandoned: it cost 7 min 25 s a run, and the stream it recycled is 94 % acetic
acid.  `lightsOut` is a declared plant outlet.

## 2. Base-case result (not optimised)

| | |
|---|---|
| feeds | 100 kmol/h methanol, 105 kmol/h CO |
| `acidProduct` | **98.39 kmol/h**, 99.89 mol % acetic acid (methyl acetate 0.05 %, water 0.06 %) |
| acid lost | `lightsOut` 0.89, `offgas` 0.66, `purge` 0.015 kmol/h; the rest is accounted for |
| yield on methanol | ~98.4 % to product |
| first-law residual of the plant | -80 kW, 1.4 % of the energy exchanged (reported, not chased) |

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
* **Battery limits:** the feeds are declared at 30 bar; no compressor or pump
  is modelled for them.
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
sheets (the column's tray stack lives inside its shell); the preheater
(sized as an area, not a shell), the lights column's condenser and reboiler
(also areas) and the control room have DECLARED boxes. The column is **not** declared a release source — its zones are yours to
declare, and declaring one adds a fourth downwind finding against the
control room.

**Redraw it** with `bin/choupo-layout --draft --force .` from the case
directory: it lines the sized items up in flow order again and keeps the
separation table, wind, boxes, the control room and zones. **See it** in the
GUI under Reports → "Plant layout (3D)", and learn to read it in the EduTool
**"Plant layout: where each item stands, and why"** (Process design &
economics shelf).

**One finding is left for you to resolve, on purpose** (announced three
times, once per release source): the control room stands **downwind** of the
reactor, the condenser drum and the degasser — the wind blows from the
north-west and the room is 47–57 m to the south-east, inside the declared
60 m reach. CO is toxic as well as flammable. Move the room, and say why
where you put it is safe.
