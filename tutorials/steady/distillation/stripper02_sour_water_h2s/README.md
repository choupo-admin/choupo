# stripper02_sour_water_h2s — the selectivity lesson

The three-family sour water: NH₃ (2.5) + CO₂ (1.0) + H₂S (0.5 kmol/h) in
96 kmol/h water, over the same 8 reactive trays as `stripper01`.  Three
speciation networks run at once on every tray — ammonia, carbonate,
sulfide — and the per-tray profile carries all of them.

## The lesson: read stripper01 first, then predict — and be wrong

`stripper01` teaches: CO₂ strips → pH rises → NH₄⁺ deprotonates → ammonia
strips.  Add H₂S and a student should predict the same rising pH.  The
converged profile says otherwise:

| quantity | tray 2 → reboiler |
|---|---|
| carbonate loading (per NH₃ species) | 0.196 → 0.00001 — CO₂ strips hard |
| sulfide loading | 0.18 → **0.51** — H₂S *concentrates* |
| pH | 8.49 → **7.61** — it *falls* |

CO₂ is the more volatile acid gas at these conditions, so the stripper is
**selective**: the carbonate leaves overhead while the sulfide stays with
the liquid — and with the ammonia also leaving, the residual H₂S acidifies
the bottoms faster than the departing CO₂ can alkalinise it.  The pH
direction is not a law of strippers; it is an outcome of *which* acid gas
wins, and this pair of cases shows both outcomes with the same machinery.

## What to look at

* `reports/unitOperations/tower/profile.csv` — per-tray pH, ionic strength
  and every species molality of all three families (`m_H2Saq`, `m_HS`
  beside the carbonate and ammonia columns).
* The distillate: an acid-gas overhead (NH₃ + CO₂ + a little H₂S) — the
  real design question of a sour-water unit (where each contaminant ends
  up) is answered per tray, not just at the ends.
* A tray whose H₂S has stripped to numerical zero reports the sulfide
  molalities as **0 exactly** — a solved tray with an empty family is a
  zero, never a NaN (NaN stays reserved for a tray whose speciation
  itself failed).

## Declared

`model simultaneous;` — one reactive flash per stage per residual
evaluation; the Jacobian sees apparent components only.  Sealed
(`bin/choupo-import`).
