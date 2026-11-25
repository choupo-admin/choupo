# pinch02_two_pinches_mer — feasible at ΔT_min is not the same as keeping the energy target

Four streams on the constant-Cp teaching fluid (`hxFluid`): two hot (H1 370 → 340 K at CP 1 kW/K,
H2 400 → 310 K at CP 0.5 kW/K) and two cold (C1 280 → 290 K at CP 0.5, C2 320 → 360 K at CP 1.5),
ΔT_min = 20 K.  The targets are **Q_H,min = 0 kW**<!--golden: kpi pinch Q_H_min_kW--> and
**Q_C,min = 10 kW**<!--golden: kpi pinch Q_C_min_kW-->, with **two** pinches, at shifted T* = 360 K
and 330 K (`n_pinches` = 2<!--golden: kpi pinch n_pinches-->).

## The lesson

1. The candidate H1 → C1 (5 kW) is temperature-feasible at ΔT_min.  Make it, rebuild the problem
   table by hand: the targets become 5 / 15 kW.  It crosses the second pinch.
2. `reports/pinch/candidateMatches.csv` now says so: the row carries `targetPenalty_kW` (5) and the
   recommendation reads "temperature-feasible at dTmin but NOT compatible with maximum energy
   recovery".  Only 1 of the 5 pairs keeps the targets at its full duty
   (`candidates_mer_compatible` = 1<!--golden: kpi pinch candidates_mer_compatible-->).
3. The above/below labels and the CP rule refer to the hottest pinch; the penalty does not depend on
   that choice — it is measured by the targets themselves.

Held by `bin/curate/check_pinch.py`, arm `pinch_mer`: an independent problem table recomputes the
targets after every candidate match.
