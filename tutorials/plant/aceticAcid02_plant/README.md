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
