# c3splitter01_propylene_propane -- the C3 splitter, and what its relative volatility is worth in trays

`runCase tutorials/steady/distillation/c3splitter01_propylene_propane`

## The specification is ILLUSTRATIVE

No propylene-splitter specification (feed, purities, pressure, trays) is in the literature folder, so every
number a plant would set is declared in `system/flowsheetDict` and marked `illustrative`:
feed 100 kmol/h at 70 mol % propylene, liquid, 316.0 K (0.3 K below its bubble point), 17 bar; column at the
feed's 17 bar; distillate 99.0 % of the propylene and 1.16 % of the propane (99.5 mol % propylene); R = 1.2 R_min.
Nothing here is a published plant, and it is not claimed to be one.  What is not illustrative is the
thermodynamics: SRK with kij = 0, the system `tutorials/props/compare/olefins01_propane_propene_laurance1972`
holds to Laurance & Swift's measured relative volatility.

## What it does

Two units on two identical feeds:

* `fug`, the Fenske-Underwood-Gilliland shortcut (constant alpha at the feed's bubble point):
  alpha = 1.1345, N_min = 71.6, R_min = 10.42, R = 12.51, **N = 144.6** theoretical stages, feed at stage 82.5.
* `mesh`, the full MESH column (Naphtali-Sandholm, the stage energy balances solved) at the shortcut's numbers rounded up:
  146 stages (145 trays + reboiler), feed on stage 83, R = 12.51, D = 69.648 kmol/h.  It delivers 99.47 mol % propylene overhead
  and 97.63 mol % propane in the bottoms (the illustrative specification: 99.5 and 97.69): the constant-alpha shortcut and
  the rigorous column agree to 0.1 point.

## What the measured alpha implies

Laurance & Swift's alpha at this temperature and composition (Table IV, x = 0.7, interpolated in T between the
100 and 110 degF blocks) is **1.1105**; the engine's is **1.1345**, 2.2 % higher.  The same Fenske-Underwood-Molokanov-Gilliland arithmetic
(typed in the gate from the textbook) on the measured alpha gives:

| | alpha | N_min | R_min | R (1.2 R_min) | N (theoretical) |
|---|---|---|---|---|---|
| engine (SRK, kij = 0) | 1.1345 | 71.6 | 10.42 | 12.51 | 144.6 |
| measured alpha | 1.1105 | 86.2 | 12.69 | 15.23 | 173.2 |
| engine vs measured | +2.2 % | -17 % | -18 % | -18 % | -16.5 % |

A 2 % error in alpha is a **20 % error in the tower** (the measured tower is 20 % taller and needs 22 % more reflux):
the engine's column is the optimistic one.  The reason is in olefins01: the kij = 0 cubic gives an alpha almost flat
in composition, too high at the propylene-rich end where this feed sits.  The deviation is the result; **no kij was
fitted** to remove it (the slice reports what the model does).

## What is NOT claimed

* No published column: the stage count, reflux and purities are an illustrative design problem, not a plant.
* The tower from the measured alpha is Fenske-Underwood-Gilliland arithmetic on ONE alpha (constant-alpha
  method): the shape of alpha(x) across a real column and the column pressure drop (none here) are not in it.
* The measured alpha is Laurance & Swift's Table IV, computed by the authors from measured pressures, not a sampled
  vapour; it carries their +-0.005 (0.5 % at alpha = 1.11, i.e. about 5 % in alpha - 1 and in the tower).
* Energy closure of `mesh` is closed by construction on the reboiler and verified by the unit's second route
  (the engine's report says so); the shortcut has no energy balance.

Gate: `bin/curate/check_olefin_vle.py` part (C): the engine's shortcut equals the textbook arithmetic on its own alpha
to 0.5 %, the measured-alpha tower is pinned, the rigorous column meets the illustrative specification within 0.002.
