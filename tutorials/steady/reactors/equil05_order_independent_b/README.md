# equil05_order_independent_b — the reaction list's order does not matter

Methane reforming and water-gas shift (SMR + WGS) to simultaneous equilibrium
at 1100 K, listed `( wgs smr )`.  The case and its twin `_a`, which lists
`( smr wgs )`, must give the same answer.  Here the reformer takes 6 kmol/h
in and gives 5.9974 kmol/h out, with Kp_smr = 312.74 and Kp_wgs = 0.9784,
duty 6.21 kW, converged by Newton in 11 iterations.  Figures are the case's
`expected` rows.

## The lesson

1. Equilibrium at fixed T and P is a property of the species set, not of the
   order in which the reactions are written.
2. The reaction list is an input, so a result that followed its order would be
   a bug.  The twin case holds that.
3. The extents come out as one solution: extent_smr -0.0013, extent_wgs
   -0.6707 kmol/h.

## What to try

Compare the `expected` files of `_a` and `_b`: the stream flows and Kp agree.
