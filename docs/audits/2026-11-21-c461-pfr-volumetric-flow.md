# C461 -- the pfr's volumetric flow (2026-11-21)

Defect: `src/unitOperations/reactor/PFR.cpp` formed every concentration as F_i / Q with Q the FEED's
volumetric flow, held along the bed.  For a gas whose reaction changes the number of moles (ethane
cracking, +40 %), or whose T or P move along the bed, that is wrong.

## Step 1 -- measurement

Method: a prototype fix behind a temporary switch (`CHOUPO_PFR_Q_FIXED=1` = the old behaviour) and the
23 `type pfr` units of `tutorials/` (21 case roots; the three ammonia beds run inside
`ammoniaPEQ03_basicDesign`), every case run old and new on the same binary and compared line by line
(paths normalised).  The switch is removed in the landed commit.

| case | feed / rate-law basis | moved by the corrected Q? |
|---|---|---|
| cracking01_ethane_sundaram_froment | vapour, concentration laws, +40 % moles | YES: the whole slate (see Step 3) |
| ammoniaPEQ03_basicDesign (Bed1-3) | vapour, expression laws in T, p, x (no c[i]) | no (byte-identical output) |
| ammoniaReactor04_kineticSizing | vapour, expression law in p, x | no |
| pfr05_cooled_multitubular | vapour, expression law | no |
| elementary01a/01b, 02a/02b, 03a/03b | vapour, concentration laws, mole-conserving | no (output identical) |
| plog01..04 | vapour, concentration laws, mole-conserving | no |
| pfr02_reversible_wgs, ladder01_wgs_three_rungs | vapour WGS (moles conserved, ideal gas) | profile column `minus_r_CO` changes at 1e-11 relative (round-off of F_t v vs the fixed Q); outlet and every pinned row identical |
| pfr01_first_order, pfr03_series_selectivity, pfr04_adiabatic, pfr_polyesterification, polycaprolactonePlant | liquid feed (feed Q kept by rule) | no |

So the ammonia converter beds, the obvious candidates, are NOT affected: their laws are written in
partial pressures and mole fractions, which never read Q.  One golden moves.

## Step 2 -- the fix

`localVolumetricFlow` (PFR.cpp): for an all-vapour feed, Q = F_t * Mbar / rho_V(T, P, z) at the local
molar flow, T, P and composition, at every RK4 stage, with rho_V from the package's own vapour density
(ideal gas where the package is ideal); the single-reaction path, the multi-reaction path's rate state and
its law-expression state all use it.  A liquid feed keeps its feed volumetric flow (the liquid density
change is small and the basis is the property door's liquid density).  The printed tau stays V_R / Q_feed.
No switch remains.  Theory Guide `sec:pfr-volumetric-flow`.

## Step 3 -- moved rows (cracking01_ethane_sundaram_froment)

* The twenty segments `seg01..seg20` (units) and the nineteen intermediate streams `s01..s19` are
  retired: one `pfr` named `coil`, V_R 15.004 L, nSteps 2000 (the 20 x 100 of the workaround).  Every
  `seg*` and `s*` row of `expected` is removed with them; `coil` rows and `coil` utility row are new.
* V_R 14.896 L -> 15.004 L.  The 14.896 L was tuned to 59.1 % conversion on the 20-segment chain, which
  re-priced Q only at 20 inlets (a discretisation of the expansion); the exact integration needs 15.004 L
  (conversion 58.90 % at the old volume, 59.10 % at the new).  The gate's independent integration uses the
  same volume (`V_TOTAL_M3`).
* `product.F` 0.00223506 -> 0.00223518 kmol/s (the same conversion with a slightly different slate).
* `check_cracking_yields`: green; engine conversion 59.1 % against the independent integration's 59.0 %;
  ethylene +2.1 %, H2 +1.6 %; CH4 -29 %, C3H6 -59 %, C4H6 +91 % pinned as the scheme's own.
* Closures: mass and element closures of the case held (the scoped conservation gates passed).
