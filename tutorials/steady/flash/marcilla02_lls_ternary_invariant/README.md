# marcilla02_lls_ternary_invariant — the three-phase LLS state, live

**PRIMARY:** A. Marcilla, F. Ruíz, M. M. Olaya, *Fluid Phase Equilibria*
**105** (1995) 71–91, DOI 10.1016/0378-3812(94)02595-R, Table 4B —
water + 1-butanol + NaCl at 25.0 ± 0.1 °C.  With solid NaCl present the
two-liquid tie-line is **invariant**, so one tie-triangle describes the
whole three-phase region.  Anchors staged in
`docs/design/solid-migration-witness-data.md` §2a (interim).

This is the state marcilla01 could not reach (its UNIFAC-VLE backbone
keeps water/1-butanol miscible).  The backbone here is **UNIQUAC on the
cited Winkelman 2009 water/1-butanol set** (case-local record — the same
values `vlle01_waterButanol` consumes inline, where they demonstrably
open the gap).  The engine's first **PRESENT wet organic**: all three
phases coexist, each through its one mechanism — halite complementarity,
activity-equality split with the ionic a_w factor on water, Davies
speciation of the brine.

## The comparison (wt%), model beside anchor — reported, never tuned

| phase | quantity | model | Marcilla Table 4B |
|---|---|---|---|
| aqueous | water | 76.1 | 73.14 |
| aqueous | 1-butanol | 7.7 | 0.72 |
| aqueous | NaCl | 16.2 | 26.14 |
| organic | water | 13.6 | 7.53 |
| organic | 1-butanol | 86.4 | 92.28 |
| organic | NaCl | 0 (declared refusal) | 0.19 |

Every deviation is a NAMED model approximation, announced by the run:

* **Aqueous NaCl low** (16.2 vs 26.1 wt%): Davies saturates halite at
  3.65 mol/kg against the measured 6.14 — the same number marcilla01
  measured, seven times outside Davies' band, announced.
* **Aqueous butanol high** (7.7 vs 0.72 wt%): Davies prices neutral
  solutes at γ = 1, so the brine's salting-out of butanol — an order of
  magnitude in the anchor — is invisible to the ionic leg.
* **Organic too wet** (13.6 vs 7.53 wt% water): Davies' φ = 1 water
  activity (a_w ≈ 0.88 vs the real ≈ 0.75 over saturated brine)
  under-prices the salt's pull on the water, so too much crosses.

The internal identities the gate pins: the cross-liquid equality residual
including water's a_w factor is at machine precision (|ln(a_org/a_aq)| ~
1e-15 per member), and the dissolved salt over the AQUEOUS water alone
reproduces the Davies saturation molality — the conversion-basis bug this
case caught (a total-water basis overstated the crystal by exactly the
organic water's share, while every mass balance still closed: a wrong
basis conserves mass perfectly).

Energy balance: UNAVAILABLE (the apparent salt has no elements-datum
route in this world — named diagnostic; mass and element balances close).
