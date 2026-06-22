# optim02_process_cost — minimise total module cost

A small **reactor → heater → separator** process. The `OptimizationDriver`
(Nelder-Mead) tunes two design variables to minimise the **total Guthrie
module cost** of the two costed units (reactor + heater):

| variable                | meaning              | box bounds          |
|-------------------------|----------------------|---------------------|
| `reactor.V_R`           | reactor volume [m³]  | `[0.002, 0.010]`    |
| `heater.Q`              | heater duty [W]      | `[0, 500]`          |

The heater is credo-pure: it specifies **Q** (the thermal power, hardware),
not an outlet T. `T_out` is a reported KPI, not a control variable.

## What the run actually finds

The optimum is **not** at the lower corner. Nelder-Mead converges (8 moves,
`simplexInit 0.15`) to:

```
best objective:  9.346728e+05  EUR  (total module cost)
  reactor.V_R = 0.008070 m³        (INTERIOR — not on a bound)
  heater.Q    = 500 W              (UPPER bound — driven hard against it)
```

Increasing Q monotonically lowers the objective: the simplex walks the
cost from ~2.0e6 EUR at Q≈170 W down to ~9.35e5 EUR at Q=500 W.

## Why higher duty is *cheaper* here — the real lesson

The dominant cost is the heat exchanger (~916 k of the ~935 k total). Its
area follows `A = Q / (U·LMTD) = Q / 6000` m², so Q=500 W gives only
**A ≈ 0.083 m²**. The Turton shell-and-tube correlation used by the Guthrie
model is valid for `A ∈ [10, 1000] m²`; our exchanger is **two orders of
magnitude below `Smin`**. In that extrapolated tail the correlation

```
log10(Cp) = 4.3247 − 0.3030·log10(A) + 0.1634·(log10 A)²
```

turns *upward* as A shrinks (the quadratic term dominates for log10 A < 0),
so a **larger** area is **cheaper**. The optimiser correctly exploits this:
pushing Q to its upper bound grows A toward the correlation's valid range
and slides down the cost curve. The reactor volume settles at an interior
0.00807 m³ — large enough for adequate conversion (X ≈ 0.64), small enough
that its vessel cost (~19 k) stays a rounding error next to the exchanger.

## What the student should take away

1. The `OptimizationDriver` wires correctly into the post-processing chain
   (sizing → Guthrie costing) so `result.costs` is populated before the
   objective is read.
2. The Nelder-Mead simplex contracts cleanly and parks one variable on an
   active box constraint (Q at its upper bound) while the other lands in the
   interior — a genuinely mixed optimum, not a degenerate corner.
3. **Mind the validity range of a cost correlation.** This optimum is partly
   an *artifact of extrapolating the HX correlation far below `Smin = 10 m²`*.
   A correct CAPEX study would either size a real heater inside the valid
   range or clamp/refuse the extrapolation. The honest reading: the model is
   being driven outside where it is meant to apply, and the optimiser will
   happily live there. *All models are wrong; some are useful — but only
   inside their range.*

`bin/runTests` compares the optimum KPIs against the golden `expected`.
