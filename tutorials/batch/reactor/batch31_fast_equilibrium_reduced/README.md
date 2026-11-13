# batch31_fast_equilibrium_reduced — partial equilibrium as one rate law

The reduced twin of `batch30_fast_equilibrium_full`.  A and B are lumped
into one pool (carried as compA) that drains to C at k K/(1+K), written in
`constant/reactions` as a `type expression` law.  No kf and no kr appear.

## What to look at

1. **Two parameters instead of three.**  k and K are all the law needs.
2. **What is lost.**  The moment while B forms from A: against the full twin
   the largest gap in n_C is 0.62 % of the charge.
3. **compA is the pool**, not A alone: 0.8 of it is B at every instant.
