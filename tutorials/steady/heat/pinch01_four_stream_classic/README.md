# pinch01_four_stream_classic — how much heat must this plant buy?

Four streams, the textbook problem: two hot (H1 150 → 60 °C at CP 2 kW/K,
H2 90 → 60 °C at CP 8 kW/K) and two cold (C1 20 → 125 °C at CP 2.5 kW/K,
C2 25 → 100 °C at CP 3 kW/K), each modelled as a heater or cooler with a
declared duty, on a synthetic constant-Cp fluid (`hxFluid`, 100 J/mol K,
case-local) so that CP = F·cp exactly.  With **ΔT_min = 20 K** the pinch
pass finds the targets the whole subject is named after: **Q_H,min =
107.5 kW**, **Q_C,min = 40 kW**, pinch at shifted T* = 353.15 K (hot
363.15 K / cold 343.15 K).  Today's unintegrated flowsheet buys **487.5 kW**
of heating and rejects **420 kW** — the gap is what integration could
recover.

## The lesson

1. **The problem table is printed, interval by interval.**  Six shifted
   intervals, ΣCP hot and cold, ΔH per interval and the cascade —
   `[pinch]` lines in the **Log** tab.  Redo the cascade by hand (start at
   0, carry each ΔH down, then add the most negative value back); the
   golden is what you get.
2. **The targets are a consequence, not a design.**  Nothing was
   matched yet.  `reports/pinch/candidateMatches.csv` lists every
   admissible hot–cold pair per region (6 candidates, 6 admissible) with
   its counter-current end-approach bound.  The word *optimal* never
   appears — the pass recommends, it never rewrites the flowsheet.
3. **The three violations name themselves.**  `coolerH1` rejects 120 kW
   *above* the pinch; `heaterC1` and `heaterC2` draw 125 + 135 kW *below*
   it.  Their sum is exactly the current-minus-target excess.  Those are
   the coursework rules, read off your own flowsheet.
4. **Composite curves are a file, not a claim.**
   `reports/pinch/compositeCurves.csv` — plot it; the two curves touch at
   ΔT_min and the overhangs are Q_H,min and Q_C,min.

## What to try

Change `dTmin` in `system/postDict` to 10 K and rerun: both targets fall
and the pinch moves.  Then look at `energyBalance` for this case — it
says UNAVAILABLE, because `hxFluid` carries no formation enthalpy on
purpose: a pinch analysis needs only CP, and the case declares nothing
it does not need.

## The warnings this run prints, and why they are honest

The fluid is **synthetic** and its heat capacity is **constant** (100 J/mol K);
nothing about it is a measured property, and it carries no formation enthalpy
on purpose.  That is why the run says (1) the heaters invert their outlet
temperature on the *sensible* enthalpy path (no datum, so no latent heat can
be priced -- harmless here, every stream stays subcooled liquid) and (2)
`hxFluid` has no `standardThermochemistry` block (the energy balance is
UNAVAILABLE, with the remedy).  A third warning, a vapour pressure
"evaluated at 150 K, outside 280-620 K", used to appear too; it was the
heater's dome guard bracketing its search at a fixed 150 K, not a state any
stream was in, and the guard now brackets inside the record's own declared
window (DEV.md 4c C234).

## Classify before you read the pinch

The pass classifies the problem from the whole cascade and prints the word
(`CLASS: interiorPinch`; also `reports/pinch/summary.csv`).  Try `dTmin 1 K`:
`Q_H,min` = 67.5 kW and `Q_C,min` = 0 -- a *threshold* problem with no pinch.
Whatever `dTmin` you choose, `Q_H,min - Q_C,min` stays 67.5 kW: it is the cold
total (487.5 kW) minus the hot total (420 kW), a first-law identity.
`reports/pinch/problemTable.csv` is the worked cascade the page draws.
