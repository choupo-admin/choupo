# flash06_sweep_T — one knob moves, the physics answers

The `flash01` benzene/toluene drum, with its temperature **swept from
360 K to 385 K in 1 K steps** by a `system/outerDict` — the first time
the simulator is run *many times* rather than once.  The result is the
V/F S-curve and, beside it, the duty each temperature costs.

The sweep table is written to `sweep_flashT.csv` in the case folder.
Read down it:

| T (K) | V/F | Q (kW) |
|---|---|---|
| 367 | 0 | −288 |
| 368 | 0.022 | −264 |
| 370 | 0.304 | **0** |
| 372 | 0.604 | +284 |
| 374 | 0.961 | +626 |
| 375 | 1 | +666 |

## The lesson

1. **The knob is a dict path.**  `parameter { target
   units[0].operation.T; range ( 360 385 ); nPoints 26; }` — *any*
   scalar a unit's `operation` block carries can be swept the same way.
   The dict is the schema; there is no separate list of "sweepable"
   things.
2. **Bubble and dew fall out of the curve.**  V/F leaves 0 between 367
   and 368 K and reaches 1 between 374 and 375 K.  You did not ask for
   the bubble and dew points; you read them off.
3. **Q = 0 at 370 K is not a coincidence.**  The feed is declared at
   370 K: at the feed's own temperature the drum adds nothing (the point
   `flash01` makes on its own).  Below it the drum *removes* heat to
   condense; above it the drum *supplies* heat to boil.
4. **Between two points the curve is not a line.**  V/F goes
   0.30 → 0.60 → 0.96 over 370–374 K — steepest near the dew point.  A
   hand calculation at two temperatures would miss the shape entirely.

## What to try

Sweep pressure instead: change `target` to `units[0].operation.P` with a
range across 0.5–2 bar and watch the same feed move from all-vapour to
all-liquid.  `flash07_gridsweep_TP` sweeps both at once and draws the
envelope.
