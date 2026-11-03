# unsteady06_reactor_fill_and_react — a reactor with a level fills while it reacts

`dynamicCSTR` with `volumeMode variable` (D = 0.5 m, H = 1.0 m) starts
from a **heel** (0.02 m of isobutanol at 300 K, an "empty" vessel — exactly
zero is refused by name), is fed 1.0e-3 kmol/s of pure isobutanol, has no
outflow, and isomerises it to 2-butanol with a first-order law, k = 4.0e-4
1/s (Ea = 0, so k cannot move with the small temperature rise).  1500 s,
5 s steps; runs under `choupoSemiContinuous` (no controller).

## What to look at

1. **The closed form.**  The reaction changes no moles and its extent rate
   k·n_A does not depend on the volume, so the mole numbers are exact:
   n_A(t) = F/k + (n_A0 − F/k)·exp(−kt), n_B = n_A0 + n_B0 + F·t − n_A.
   The volume is V = M(t)/ρ with M(t) = M0 + MW·F·t, and the level is V
   over the 0.196 m² cross-section.  The run reproduces all of them to
   ~4e-9 (`check_dynamic_cstr_level` recomputes them).
2. **The rate uses the current volume.**  A first-order law cannot show it;
   the gate runs a second-order variant (r·V = k·n_A²/V) against an
   independent integration — a vessel that kept the heel's volume in the
   rate would be off by 73 %.
3. **The ledger claims mass and energy and closes** (~1e-14): the canonical
   route is announced at start-up (the vessel stores H on the elements
   datum; the heat of reaction is a consequence of it).
4. Change `outflow { F 0.0 kmol/s; }` to `0.5` and the heel runs dry in the
   first step (`RAN DRY`); set `endTime` to 4000 and it overflows.  Both are
   refused by name, never clamped.

The same reactor under a level loop and a temperature loop is
`ctrl22_reactor_level_and_temperature`.
