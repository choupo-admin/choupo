# Multi-feed column with a liquid side draw (rigorous column-lite)

The rigorous `simultaneous` MESH column extended to **multiple feeds** and
**side draws** — the most-used features of a commercial simulator column, on the glass-box
Newton solver.

## The case

A benzene / toluene / o-xylene split (light / intermediate / heavy):

- **primary feed** — 100 kmol/h, benzene/toluene/o-xylene 0.40/0.40/0.20, enters
  high (stage 5);
- **second feed** — 60 kmol/h, heavier (0.05/0.45/0.50), enters low (stage 11);
- **liquid side draw** — 15 kmol/h pulled from stage 8, between the two feeds.

15 stages, R = 3, total condenser, partial reboiler.

## Result (6 Newton iterations, ‖F‖ ≈ 1e-9)

| product | kmol/h | key composition |
|---|---|---|
| distillate | 42 | benzene **0.966** |
| **side draw** (stage 8) | 15 | toluene **0.728** (the intermediate cut) |
| bottoms | 103 | o-xylene 0.467 / toluene 0.531 |

Mass closes (100 + 60 = 42 + 15 + 103 = 160 kmol/h). Q_condenser = −1436 kW,
Q_reboiler = +1527 kW. The side draw does exactly what it should — bleed the
intermediate component where it is most enriched on the trays.

## How it works (the solver)

The `simultaneous` MESH is a bubble-point-reduced Newton (CMO flows). The
extension generalises the single fixed feed into a per-stage **flow staircase**:
`L[j]`, `V[j]` are rebuilt by a CMO march that adds each feed's liquid/vapour
parts and subtracts each draw; every stage's material balance carries an
`F_j z_{F,j}` source and `(L_j+U_j)`, `(V_j+W_j)` outflows. The general balance
reduces **exactly** to the old single-feed equations when there is one feed and
no draw — so every existing distillation tutorial is unchanged (verified).

## Dict syntax

```
operation
{
    nStages 15;  feedStage 5;  refluxRatio 3.0;  distillateRate 42 kmol/h;
    feeds                                   # extra feeds (besides the primary feed{})
    (
        { stage 11;  F 60 kmol/h;  T 390 K;  quality 1.0;
          composition { benzene 0.05; toluene 0.45; oXylene 0.50; } }
    );
    sideDraws                               # liquid or vapour bleeds
    (
        { stage 8;  phase liquid;  rate 15 kmol/h; }
    );
}
```

`outputs ( distillate bottoms <draw1> <draw2> ... )` — side-draw streams follow
distillate and bottoms, in stage order.

## The feeds are flowsheet streams (the energy balance closes)

Every feed is a real **flowsheet stream** (`inputs ( feed feed2 )`), mapped to a
stage by `operation.feeds ( { stream NAME; stage k; } )`. This matters: an earlier
version declared the extra feed *inline* (composition inside the operation), which
made it a **hidden side channel** — the unit consumed it but the plant-boundary
mass + energy balance never saw it, so the first law did not close. With the feeds
on the flowsheet graph, the boundary energy balance closes exactly (verified:
inputs = outputs to machine precision). *Information follows the streams.*

## Honest scope

The two further rigorous column features — a **second liquid phase** (VLLE on a tray) and a
**Σν ≠ 0** reaction — are not in this method yet; they need the full-MESH energy
balance. (Σν = 0 reactive distillation IS available — see `column05`.)
