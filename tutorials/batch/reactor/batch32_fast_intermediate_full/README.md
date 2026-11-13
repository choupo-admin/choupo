# batch32_fast_intermediate_full — a reactive intermediate, integrated

An isothermal batch reactor with A -> I -> P (k1 = 0.001, k2 = 0.1 1/s; I is
compB, P is compC), both rates integrated.  10 mol of A, 5000 s.

## What to look at

1. **I never accumulates.**  After a short first moment n_I stays near
   (k1/k2) n_A, under 1 % of the charge.
2. **The reduced twin.**  `batch33_fast_intermediate_reduced` makes P at
   k1 n_A directly.  The largest gap in n_P is 0.95 % of the charge, and it
   equals the largest n_I: in a closed vessel the missing P is the I in
   transit.
3. **Two tanks in disguise.**  The gap at k1/k2 = eps is the gap of
   `unsteady07`/`unsteady08` at the same eps: the same equation.
