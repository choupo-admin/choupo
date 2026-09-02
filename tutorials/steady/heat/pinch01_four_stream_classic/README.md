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
