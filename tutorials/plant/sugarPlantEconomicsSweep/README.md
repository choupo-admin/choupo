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
| 0.090 |  0.9 % | — | −14.6 M |
| 0.104 |  6.6 % | — | −5.7 M |
| 0.118 | 11.6 % | 9.3 yr | +2.8 M |
| 0.132 | 16.2 % | 7.1 yr | +11.1 M |
| 0.146 | 20.4 % | 5.7 yr | +19.2 M |
| 0.160 | 24.4 % | 4.8 yr | +27.0 M |

Richer juice → more crystalline sugar per unit feed → more revenue against an
almost-unchanged plant cost → the IRR climbs and the payback appears and
shortens.  The NPV crosses zero between 0.104 and 0.118.

## The two companion cases

| Case | Run mode | Shows |
|---|---|---|
| `ChemicalPlantTutorial` | single pass | the **full itemised appraisal** — FCI/TCI, the Lang cross-check, the `COM_d` taxonomy line by line, revenue, NPV/IRR/payback, with the AACE Class-4 (−30 %/+50 %) banner |
| `sugarPlantEconomicsSweep` (this case) | sweep | how IRR / payback / NPV **move** with feed quality |

Both use the **same** `constant/economics` prices (EU Sugar Market Observatory
white sugar, ECB EUR/USD, *Chemical Engineering* CEPCI, US statutory tax) and
the **same** `system/postDict` cost chain — only the run mode differs.
