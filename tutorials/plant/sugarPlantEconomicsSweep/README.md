# sugarPlantEconomicsSweep — the economic-sensitivity differentiator

This is the flagship sugar plant (`tutorials/plant/ChemicalPlantTutorial`)
driven by a **SweepDriver** instead of a single pass.  It exists to show the
one thing a single CAPEX number cannot: **how the project economics move when a
process variable changes.**

```
runCase tutorials/plant/sugarPlantEconomicsSweep
```

The driver runs the FULL post-processing chain (`sizing → costing → economics`,
in `system/postDict`) on **every converged point**, so `economics.IRR`,
`economics.paybackYears`, `economics.NPV`, … resolve as ordinary KPI look-ups
(the Phase-2 SweepDriver post-chain wiring).  The result lands in
`sweep_results.csv`.

## What the sweep shows

Sweeping the RawJuice **sucrose content** 0.09 → 0.16 mol fraction walks the
plant from sub-economic, through break-even, to clearly profitable:

| sucrose (mol frac) | IRR | discounted payback | NPV (EUR) |
|------:|----:|------:|----------:|
| 0.090 |  5.6 % | — | −6.7 M |
| 0.104 | 11.9 % | 9.2 yr | +3.0 M |
| 0.118 | 17.6 % | 6.6 yr | +12.7 M |
| 0.132 | 23.0 % | 5.1 yr | +22.4 M |
| 0.146 | 28.2 % | 4.2 yr | +32.1 M |
| 0.160 | 33.2 % | 3.5 yr | +41.8 M |

(Measured 2026-10-06 from `sweep_results.csv`, after the BD dryer's air was
sized for the richest point -- the design basis is written in `0/MAIN/BdAir`.)

Richer juice → more crystalline sugar per unit feed → more revenue against an
almost-unchanged plant cost → the IRR climbs and the payback appears and
shortens.  The NPV crosses zero between 0.090 and 0.104.

## The two companion cases

| Case | Run mode | Shows |
|---|---|---|
| `ChemicalPlantTutorial` | single pass | the **full itemised appraisal** — FCI/TCI, the Lang cross-check, the `COM_d` taxonomy line by line, revenue, NPV/IRR/payback, with the AACE Class-4 (−30 %/+50 %) banner |
| `sugarPlantEconomicsSweep` (this case) | sweep | how IRR / payback / NPV **move** with feed quality |

Both use the **same** `constant/economics` prices (EU Sugar Market Observatory
white sugar, ECB EUR/USD, *Chemical Engineering* CEPCI, US statutory tax) and
the **same** `system/postDict` cost chain — only the run mode differs.
