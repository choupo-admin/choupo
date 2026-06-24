# economics02 — sweep reactor volume, read economics.IRR

The same esterification plant as `economics01`, but driven by a
**sensitivity sweep** over the reactor volume that reads **economic
responses** at every point:

```
responses ( economics.IRR  economics.NPV  economics.paybackYears
            economics.FCI   economics.COM_d )
```

## What it demonstrates — the differentiator

The `SweepDriver` now runs the full post-processing chain
(sizing → costing → economics) on **each converged point**, so the headline
economic scalars the `EconomicsPass` publishes into `result.kpis["economics"]`
resolve as ordinary `unit.kpi` responses. A sweep can finally *see cost*:

| V_R [m³] | IRR | NPV [EUR] | disc. payback [yr] | FCI [EUR] |
|---|---|---|---|---|
| 4  | 47.1% | 890 924 | 2.46 | 388 673 |
| 6  | 37.7% | 708 069 | 3.10 | 426 108 |
| 8  | 31.3% | 575 086 | 3.76 | 460 663 |
| 10 | 26.5% | 468 186 | 4.45 | 493 402 |
| 12 | 22.8% | 376 792 | 5.17 | 524 867 |

A bigger reactor raises conversion (more product, more revenue) but raises
CAPEX and feed throughput — the IRR falls monotonically over this range, a
trade-off invisible from a single CAPEX number.

> The range floors at 4 m³ on purpose: below ~3 m³ the lower conversion
> drops the mixture bubble point and the fixed-duty heater would cross the
> saturation dome (a heater is sensible-only) — the deliberate validity edge.

## Run

```bash
runCase tutorials/steady/economics/economics02_irr_sweep
cat tutorials/steady/economics/economics02_irr_sweep/sweep_results.csv
```
