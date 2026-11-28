# flashSpec02_window_edges — the edges of the flash specification's search

`choupoProps` on IAPWS-IF97 water, asking the (P,H) and (P,S) flash for states
at the edges of the temperature search window: a root exactly on the window
edge, a target at the top of the package's temperature domain (1073.15 K),
and a default window wider than the package domain (273.15 K).  The first
witness, `edgeRootPH`, asks for H = 2029.64 at 1 bar and returns T = 300 K
(299.999999999), residual 8.7e-8, in 2 iterations and 11 flashes.  The other
witnesses are in the case's `expected`.

## The lesson

1. A root exactly on a bracket end must be accepted, not rejected.
2. A target at the top of the package's domain (1073.15 K) must be reachable.
3. A default window wider than the package domain must not call the package
   outside its range.

## What to try

Read the other witnesses' rows in `expected`.
