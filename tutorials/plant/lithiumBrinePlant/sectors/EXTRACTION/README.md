# EXTRACTION sector — NRTL liquid–liquid extraction (γ–γ LLE)

Solvent extraction of lithium from the BRINE mother liquor into a
kerosene + LiX-extractant organic. **Two liquid phases, both described by
NRTL activity coefficients — this is γ–γ / LLE, not γ–φ** (the vapour slot
is formal; nothing boils here). The dicts are kept operational; the rationale
lives here.

## The measured-K_D workhorse
Real Li solvent extraction is a chelation equilibrium (Li⁺ + HX_org ⇌ LiX_org).
This sector represents **one mixer–settler stage** whose NRTL pairs are **tuned**
(not fitted — see below) so the stage reproduces a measured single-stage
distribution: K_D(LiCl, x-basis) ≈ 19, moving ≈ 89 % of the LiCl into the loaded
organic. It is the smallest honest container for the measured partition until
the `phaseEquilibrium{}` datum grammar lands (constitution v2, amendment f3), at
which point the K_D becomes a first-class cited datum and these tuned τ retire.

## Why "tuned", not "fitted"
Several NRTL interaction parameters **cannot be uniquely identified from one
macroscopic K_D** — many parameter sets reproduce the same distribution. A
`fitted` quality word requires a real dataset with independent information
(tie-lines, binodal, multiple loadings/temperatures). So the pair files declare
`source tuned;` (a non-identifiable demonstration closure), not `fitted`.

## Why not the builtin `extractor`
Its per-stage LL flash seeds the Gibbs multi-start from the solvent-rich basin;
for a dilute solute (z_LiCl ≈ 0.016) those starts are composition-infeasible and
the minimiser settles at K(LiCl) ≈ 1 — the cascade never sees the tuned
partition. The mixer + `isothermalFlash phaseSet LL` arrangement exposes the
seeds as explicit dict keys (`alphaRich`/`betaRich`, the no-silent-crutch
doctrine) and lands in the measured-K_D basin reliably. Multistage
counter-current SX returns when the extractor's seeding hardens.

## The two-liquid surface
The settler carries a per-unit `thermo{}` override declaring two liquid phases
(the LL structure the decanter needs); both phases share the SAME NRTL pairs
from `constant/binaryPairs/NRTL/` — one source of numbers, the split coming from
the surface's curvature.

## Declared simplification: NaCl background dropped
The liquor's NaCl is dropped and the feed renormalised (BRINE liquor
water 0.8819 / NaCl 0.0976 / LiCl 0.0205 → water 0.9773 / LiCl 0.0227 on
88 kmol/h). Five components overload the fixed-budget LL Gibbs minimiser, and
NaCl does not enter the organic anyway (measured SX rejection ≈ 100 %). The salt
re-enters at the BRINE→EXTRACTION seam when the Pitzer↔NRTL datum bridge lands.

The pair deliberately left to the announced ideal default (τ = 0):
kerosene–LiX (miscible organic) — the engine names it at load.
