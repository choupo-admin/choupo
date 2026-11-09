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
| 4  | undefined | −991.2 M | none | 376 094 |
| 6  | undefined | −980.3 M | none | 413 528 |
| 8  | undefined | −972.1 M | none | 448 084 |
| 10 | undefined | −965.8 M | none | 480 822 |
| 12 | undefined | −960.8 M | none | 512 288 |

On this case's declared price basis every point LOSES money: the yearly
cash flow is negative, so there is no rate at which the NPV is zero (the
IRR is published as `null`, never as a number) and no payback.  The sweep
still shows the trade-off: a bigger reactor raises conversion and CAPEX
together, and over this range the NPV becomes less negative as the reactor
grows.  (This table was regenerated 2026-11-03 from the run; the one it
replaced showed a profitable plant that the golden had stopped describing
before then.)

The range floors at 4 m³ on purpose: below ~3 m³ the lower conversion
drops the mixture bubble point and the fixed-duty heater would cross the
saturation dome (a heater is sensible-only) — the deliberate validity edge.

## Run

```bash
runCase tutorials/steady/economics/economics02_irr_sweep
cat tutorials/steady/economics/economics02_irr_sweep/sweep_results.csv
```
