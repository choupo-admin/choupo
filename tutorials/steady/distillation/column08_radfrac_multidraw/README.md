# rigorous column — multiple feeds + multiple side draws (the full feature set)

A C3/C4/C5/C6 **depropanizer-style** column at **16 bar**, split **four ways**
by the rigorous full-MESH, exercising the two most-used rigorous column features at once:
**TWO feeds** (a light cut high, a heavy cut low) and **TWO liquid side draws**.

## The case

| product | stage | ~ component | result |
|---|---|---|---|
| distillate | top (321.6 K) | propane | **98 %** propane |
| upper side draw (`drawC4`) | 13 (378.8 K) | n-butane | **89 %** n-butane |
| lower side draw (`drawC5`) | 23 (422.5 K) | n-pentane | 74 % n-pentane |
| bottoms | reboiler (454.5 K) | n-hexane | 78 % n-hexane |

Two saturated-liquid feeds (100 kmol/h each, 290 K / 320 K): a light cut on stage
10, a heavy cut on stage 20. 30 stages, R = 4. **Mass closes exactly** (200 = 45 +
55 + 55 + 45 kmol/h) and the **energy balance closes**: the feed-to-product
enthalpy gap (1137.7 kW) equals the net duty $Q_{\text{reb}}+Q_{\text{cond}} =
1942.3 - 804.6$ kW. Converges in a few full-MESH iterations from the CMO seed.

## Why 16 bar (a feed-state lesson)

This case was first written at 1 atm, and the energy balance **would not close** —
because at 1 atm and 290 K the light hydrocarbons (propane b.p. 231 K, n-butane
272 K) are **above their boiling points**: the feed streams flash to VAPOUR
(vf = 1.0), yet the column was told `quality 1.0` (saturated liquid). The latent
heat of the unrecognised vapour feed was exactly the missing ~1 MW. At **16 bar**
the feeds are genuinely liquid (vf = 0, consistent with `quality 1.0`) and the
balance closes — which is also why a real depropanizer runs at elevated pressure:
so the propane distillate condenses against cooling water (here 321.6 K). A feed's
thermal state must be specified consistently with its actual phase.

## Feeds are flowsheet streams

Both feeds are real flowsheet streams (`inputs ( feed1 feed2 )`, mapped to stages
by `operation.feeds`), so the plant-boundary mass + energy balance sees them
(*information follows the streams*). Side draws are `outputs` in stage order:
`outputs ( distillate bottoms drawC4 drawC5 )`.

## Validation scope

Self-consistently validated (mass + energy close, four cuts in volatility order)
on the full-MESH solver that IS paper-validated against Naphtali & Sandholm (1971)
in `column07_naphtaliSandholm`. No external multi-feed+multi-draw single-column
benchmark with published profiles is readily available in the open literature.
