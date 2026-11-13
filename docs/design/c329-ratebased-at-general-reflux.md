# C329 part 2 -- a column whose efficiency comes from its internals at a general reflux, and the rate-based stage

*Design record, 2026-11-13, written by a designer-by-measurement for the
architect, in answer to Vitor's question "is rate-based distillation at a
GENERAL reflux in the plan?".  It is: PLAN.md row C329 part 2, state todo.
No code was written.  Every engine fact carries the `file:line` it was read
at on `origin/main` at commit b32ea5c211 (`src/unitOperations/distillation/` is
abbreviated `distillation/`); every number marked "measured" was printed by a
build of that tree on a scratch copy of a corpus case; every statement about
the literature is marked `unchecked`, because no paper is in this container
(`~/Choupo-Literature` does not exist here) and none was read for this
record.*

## 0. For a phone

* **What exists.**  A tray efficiency or a packed-bed HETP is computed from
  the geometry and the transport properties, but ONLY for a binary column at
  TOTAL reflux (`model totalReflux;`).  At a general reflux a Murphree
  efficiency can only be DECLARED, and only on the simplest column model
  (Wang-Henke, constant molar overflow, no stage energy balance).
* **Formulation A** puts the computed efficiency into a real column with a
  feed and products: the full MESH (the one model that solves every stage's
  energy balance) learns the Murphree relation, and the efficiency of each
  tray is recomputed from that tray's own flows until it stops moving.
* **Formulation B** is the true rate-based stage: two films, interface
  compositions, fluxes.  About five times the unknowns per stage; it needs
  properties the engine does not have yet (a liquid thermodynamic factor,
  concentration-dependent liquid diffusivities).
* **First slice:** Murphree inside the full MESH with a DECLARED efficiency
  (it is refused there today), proved by two checks: efficiency 1 gives
  today's full MESH back exactly, and the first law closes by a second route.
  Then the computed efficiency on top, binary only.  No measurement in the
  tree is at a general reflux, so until one is transcribed these columns can
  be held only to limits, not to data.
* **Vitor decides:** what a student is told a multicomponent efficiency is
  (one efficiency on two keys, or one per component), whether B is a new
  `model` word, and whether Klemola's column (nine components, VALVE trays)
  is the target at all, since none of the three tray correlations in the
  tree describes a valve tray.

## 1. The solvers as they are

### 1.1 The model word and the dispatch

`DistillationColumn::solve` reads `model` (falling back to a legacy
`operation.method`, default `WangHenke`; `distillation/DistillationColumn.cpp:1325-1326`)
and dispatches (`:1355-1361`):

| word | entry | what it solves |
|---|---|---|
| `WangHenke` (default) | the body of `solve` from `:1385` | bubble-point method under constant molar overflow (CMO): per component a tridiagonal in the stage index (`:1754-1798`), then each stage's T from the bubble point of its liquid (`:1821-1824`); successive substitution, stopped on the balances (DEV.md 4c, the closure-stop paragraph) |
| `simultaneous` | `solveSimultaneous` (`:2370`) | a Newton on the CMO MESH |
| `fullMESH`, `MESH`, `NaphtaliSandholm` (all three set `fullMeshWord`, `:2382-2386`) | `solveSimultaneous`, then the refinement block `:3794-4110` | the CMO MESH as a SEED, then the full MESH with V and L as unknowns and an energy row per stage |
| `totalReflux` | `solveTotalReflux` (`:4941`), and `solveTotalRefluxPacked` (`:5491`) when a `packing {}` block is declared (`:4946-4954`) | the total-reflux march (C329 first delivery) |
| any other word | refused, naming the accepted list (`:1369-1373`) | -- |

`distillateRecovery` wraps whichever of the first three is selected
(`solveForRecovery`, `:1357`, `:2125`).  The short-cut column is a separate
unit (`distillation/ShortcutColumn.cpp`) and is not a stage model.

A note on the words, read at `:1359-1360` and `:2382-2386`: `MESH` and
`NaphtaliSandholm` select the FULL MESH, not the CMO MESH that `simultaneous`
selects.  A reader who takes "MESH" to mean `simultaneous` is wrong; every
corpus case writes `simultaneous` or `fullMESH` (section 5).

### 1.2 Unknowns and residuals of each model

* **Wang-Henke** (`:1754-1830`).  Unknowns per stage: x (n) and T.  The flows
  are fixed by CMO per section (`Lstage`/`Vstage`, `:1660-1661`).  Per
  component a tridiagonal mass balance, normalisation of x (`:1800-1806`),
  the bubble point of the liquid for T.  No stage energy balance; the reboiler
  duty is the plug `dH - Q_cond` (`:2076`, `reboilerClosure(..., fullMesh =
  false, ...)`, which publishes it as closed by construction, not verified:
  `:226-283`).
* **simultaneous (CMO MESH).**  Unknowns per stage: `nv = n` (`:3077`): the
  first n-1 liquid mole fractions and T.  The vapour is ELIMINATED as
  `y = K(T, x) x` (`:3343-3347`).  Rows per stage: n-1 component balances
  divided by the total feed (`:3362-3375`) and `Sum y - 1` (`:3376-3378`);
  reactive stages add extent unknowns after the stage blocks (`:3379-3400`).
  The flows are CMO constants.  The Jacobian is DECLARED block-tridiagonal
  (`opts.blockTri = { N, nv }`, `:3598`) and the declaration is audited on
  the first iteration (`:3587-3597`; the CPR colouring costs about `3 nv`
  residual evaluations per iteration independently of N).
* **fullMESH.**  Unknowns per stage: `mv = n + 2` (`:3811`): x (n-1), T, V,
  L.  The vapour is again `y = K x` (`:3888`).  Rows per stage: n-1
  component balances, `Sum y - 1`, the stage's total balance, and the stage
  energy balance divided by the feed times the mean latent heat (`:3913-3979`;
  the scale at `:3832-3857`); stage 1 and stage N carry the specifications
  in place of two of those rows (`:3931-3973`).  Extents and, under
  `bottomsRate`/`boilupRatio`, D are unknowns after the stage blocks
  (`:3812-3818`).  It is seeded by the converged CMO profile (`:3794-3799`).
  **It is solved DENSE:** `optsF` (`:4039`) declares no `blockTri`; only the
  CMO MESH does.  The rows that break the band are the boil-up specification
  in stage 1's row of a partial-condenser column, which reads V_N (`:3941-3942`),
  and the bottoms specification `BfF`, which reads every extent and D
  (`:3911-3912`, used at `:3973`); whether
  a non-reactive column with a reflux and distillate specification has a
  zero off-band Jacobian was not measured.
* **totalReflux, trays** (`:4941-5460`).  No feed, no products.  Closed by
  the boil-up and the reboiler liquid composition; marched up from the
  reboiler, one bubble point per stage, `V_j` from the cut energy balance
  (`:5126-5171`, V_j at `:5166`).  The stage energy balance is used to DEFINE V_j, so the
  first law is consistent by construction and published as not verified
  (`:5448`, review RB-02).
* **totalReflux, packed** (`:5491-5818`).  Not a stage model: `dy/dz =
  (y*(x = y) - y)/H_OG` integrated up the bed by a midpoint rule (`:5652-5683`),
  the bottom pressure found by bisection so that the top is at the declared P
  (`:5685-5711`).  The HETP is DERIVED from the bed's Fenske count
  (`:5713-5720`).

### 1.3 Where a Murphree efficiency enters today

Only on the Wang-Henke path.

* It is read at `:1597` (`murphreeEfficiency`, default 1), refused at zero or
  below (`:1598-1600`), announced above 1 without a ceiling check
  (`:1601-1623`: the plug-flow ceiling needs the point efficiency and mV/L,
  neither of which is declared).
* It is FOLDED INTO AN EFFECTIVE K (`:1717-1730`):
  `Keff_j,i = E K_j,i + (1 - E) y_{j+1,i}/x_{j,i}`, with `y_{j+1}` taken from
  the PREVIOUS outer pass (`:1632-1637`, `:1808-1819`), so the tridiagonal
  keeps its shape and the Murphree relation holds exactly only at the fixed
  point.  The reboiler and a partial condenser stay equilibrium stages
  (`:1720-1723`).
* The TEMPERATURE of the stage is the bubble point of its LIQUID with the
  equilibrium K, not with Keff (`:1821-1824`; the bubble residual uses
  `Keq`, `:1663-1676`), so the vapour leaving a tray has the non-equilibrium
  composition `Keff x` at the liquid's temperature.
* Energy: none per stage (CMO).  The condenser duty is priced on the
  distillate `Keff_1 x_1` (`:1836-1845`), the reboiler is the plug, and the
  reboiler's own envelope, priced on `Keff_N` (`:2066-2072`), is published
  beside it as a number that cannot agree under CMO (`:2076-2079`).  So a
  Murphree efficiency moves the separation and therefore both duties, but no
  first-law statement about the trays exists for it to satisfy or violate.
* Hydraulics run AFTER convergence on the CMO section traffic with `y = Keff
  x` (`:2082-2103`).

`solveSimultaneous` refuses `murphreeEfficiency != 1` for the CMO MESH and the
full MESH alike (`:2387-2400`), naming the reason: the relation would have to
enter the residual and the Jacobian.  `totalReflux` applies a per-tray E in
its march (`:5157-5158`: `y_j = y_{j+1} + E_j (y*_j - y_{j+1})`, a negative
value clipped to zero, the vapour priced at the tray's bubble temperature in
the cut energy balance, `:5166`).

MEASURED on `column11_murphree` (15 stages, E_MV 0.70, Wang-Henke): see
section 1.5.

### 1.4 Where the computed efficiency lives

* The CORRELATIONS are a pure kernel: `TrayEfficiency::evaluate(Model,
  Geometry, State)` (`distillation/TrayEfficiency.H:242`, structures
  `:189-236`), `PackingRBF::evaluate` (`distillation/PackingRBF.H:116`,
  result with `ae`, `kG`, `kL`, `HG`, `HL`, `HOG`, `HETP` at `:107-114`) and
  `PackingDelft::evaluate`.  They read no files and know no column.
* The STATE BUILDER is not shared: it is a lambda inside `solveTotalReflux`
  (`:5176-5228`), and its packed twin inside `solveTotalRefluxPacked`
  (`local`, `:5602-5650`).  Both assume a binary: `diffusivityGas(T, P, 0, 1)`
  (`:5183`, `:5625`), Wilke-Chang both ways on components 0 and 1
  (`:5188-5190`, `:5626-5628`), and the equilibrium slope of the light key
  from a binary composition `xp[1 - lk]` (`:5196-5204`; packed `:5608-5613`).
* The refusals: `efficiency {}` or `packing {}` on any model other than
  `totalReflux` (`:1335-1352`), a multicomponent package (`:5056-5060` trays,
  `:5509-5511` packing), a computed efficiency without a declared diameter
  (`:5061-5064`).
* The coupling at total reflux is an OUTER FIXED POINT: march, evaluate every
  tray's E from the march (with the hydraulics' flood approach where the
  entrainment or Chan-Fair needs it, `:5234-5240`), march again, until
  `max |dE| < 1e-10` or 100 marches (`:5229-5258`), announced with the count.

### 1.5 Measured on scratch copies

How they were run is in section 9.  Wall times are the whole `choupoSolve`
process (start-up and reports included), the best of five on a shared
machine: indicative only.

**The three general-reflux models on ONE column.**  `column01_benzene_toluene`
with `nStages 20`, `feedStage 10` (R 2, D 50 kmol/h, its own feed at 370 K),
the model word changed and nothing else:

| model | iterations | x_D benzene | Q_reboiler kW (plug) | reboiler's own envelope kW | wall s |
|---|---|---|---|---|---|
| WangHenke | 48 passes | 0.972140539 | 675.25 | 773.06 (cannot agree: CMO) | 0.09 |
| simultaneous | 6 Newton | 0.972140540 | 675.25 | 773.06 (cannot agree: CMO) | 0.05 |
| fullMESH | 6 Newton (after the CMO seed) | 0.952881554 | 679.14 | 679.14 (`verified`) | 0.09 |

Wang-Henke and the CMO MESH are the same model solved two ways (agree to
1e-9).  The full MESH moves the distillate purity by 1.9 points on the same
specification, because its traffic follows the latent heats; that is the
difference a computed efficiency evaluated on CMO traffic would inherit.  On
a binary column of 20 stages every model costs well under a second, so cost
is not what chooses the host.

**An industrial size: Klemola's column (`column15_klemola_ideal_trays`,
75 stages, 9 components, E_MV = 1).**

| model | result | wall s |
|---|---|---|
| WangHenke (as shipped, subcooled reflux) | 711 passes, converged | 33.6 |
| simultaneous | REFUSED: "`refluxTemperature` (subcooled reflux) is read by `model WangHenke;` only.  The simultaneous MESH paths return saturated reflux; remove the key or select WangHenke." | -- |
| simultaneous, `refluxTemperature` removed | 12 Newton, Q_reboiler 8089.0 kW, own envelope 8658.4 kW | 9.8 |
| fullMESH, `refluxTemperature` removed | CMO seed 12 Newton, full MESH 5 Newton, Q_reboiler 8095.4 kW = own envelope (`verified`) | 62.5 |

So the full MESH CONVERGES on the Klemola splitter, but (i) about 53 s of its
62.5 s come after the CMO seed (9.8 s, from the `simultaneous` row), in five
full-MESH iterations on a DENSE system of 75 x 11 = 825 unknowns (how those
53 s split between the finite-difference Jacobian and the rest was not
measured; the CMO MESH, 675 unknowns, block-tridiagonal, takes 9.8 s in all); an outer efficiency
loop of the 7-11 passes the total-reflux cases need (below) would cost
minutes per run unless the full MESH becomes block-tridiagonal; and (ii) the
plant's subcooled reflux is a Wang-Henke-only key, so Klemola on the full MESH
needs that key carried into the MESH first.

**The declared Murphree efficiency on `column11_murphree`** (Wang-Henke, 15
stages): x_D benzene 0.917894 at E_MV 0.70 in 38 passes; the column
publishes ONE E (no per-tray efficiency) and a stage table of T and x only;
its first law is the CMO plug, 682.30 kW, against the reboiler's own
envelope 771.38 kW (the 89 kW gap is published as "the energy the CMO
approximation does not conserve").  The E_MV sweep the case header prints
does not match today's engine:

| E_MV | header says x_D | measured x_D | passes |
|---|---|---|---|
| 0.50 | 0.9100 | 0.880211 | 35 |
| 0.70 | 0.9505 | 0.917894 | 38 |
| 0.90 | 0.9738 | 0.942094 | 40 |
| 1.0 | 0.98125 | 0.951017 | 41 |

The golden agrees with the measured column (`expected`: x_D_LK
0.917893864162); the header's table is stale (the ideal value it quotes,
0.98125, is not column01's/column09's current golden, 0.951017, either).
Not fixed here (no case is touched by this record); listed in section 8.

**Total reflux with the computed efficiency** (`trayEfficiency01_yanagi14`,
an outer sweep of 21 F-factors): the outer fixed point took 8 marches on 18
points, 7 on two and 11 on one ("efficiency from the internals: N
march(es) until every tray's E_MV moved by < 1e-10"); the same with 20 trays
in place of 10: the same counts.  The per-tray table at the first point:
E_MV from 0.801 (top tray) to 0.977 (tray 10), the reboiler 1.

**The refusals today, quoted verbatim** (scratch copies, one line added):

* `fullMESH` + `efficiency { model AIChE; }`: "DistillationColumn 'column06':
  `efficiency { ... }` is read ONLY by `model totalReflux;` (a binary column
  at total reflux, C329) and this column runs `model fullMESH;`, which would
  ignore it and solve on ideal stages.  Select `model totalReflux;` to compute
  the tray efficiency (`efficiency { model AIChE|ChanFair|SyedaChuang; }`), or
  remove the block; for a fixed Murphree efficiency on this column declare
  `murphreeEfficiency <E>;` where the model reads it."  (The same text names
  `model WangHenke;` on a Wang-Henke column.)
* `simultaneous` + `murphreeEfficiency 0.7`: "DistillationColumn:
  `murphreeEfficiency` is not implemented for `method simultaneous` -- it would
  have to enter the MESH residual and Jacobian, and Choupo will not quietly
  hand you ideal stages instead.  Use the Wang-Henke method, or drop the
  efficiency."
* `fullMESH` + `murphreeEfficiency 0.7`: THE SAME TEXT, naming `method
  simultaneous` for a column that declared `model fullMESH;` -- the message
  names the wrong model (the shape review RB-07 found for the multicomponent
  refusal).  S1 (section 7) rewrites this refusal anyway.

## 2. Formulation A -- the MESH at a general reflux with the efficiency from the internals

### 2.1 Which solver takes it

**The full MESH, and only it in the first instance.**  Three reasons, each
read from the code:

1. A tray efficiency is a function of that tray's vapour and liquid loads
   (`TrayEfficiency::State::vapourVolFlow`, `liquidVolFlow`, `lambda = m V/L`,
   `GoverL`: `TrayEfficiency.H:206-222`).  Under CMO those loads are section
   constants that the energy balance would contradict; only the full MESH
   carries `V_j` and `L_j` as unknowns (`:3811`).
2. The full MESH is the only general-reflux model whose stage energy balance
   is solved, so it is the only one where adding a Murphree vapour changes a
   first-law statement that can then be CHECKED: its reboiler closure is
   published `verified` only when the reboiler's own envelope agrees with the
   plug (`:270-283`).  Under a Murphree efficiency that check stays
   meaningful; under CMO it never was.
3. The Wang-Henke path already holds a Murphree implementation, but by a lag
   (`:1632-1637`) inside a successive substitution whose rate is near 1 on
   the Klemola splitters (measured, 1.5: column15 711 passes, 33.6 s, where the
   CMO MESH takes 12 Newton iterations).  An efficiency recomputed from the internals inside that loop
   adds a second slow fixed point to the first.

The CMO MESH (`simultaneous`) is NOT recommended as a host: it has no V_j,
L_j to evaluate an efficiency on, and its energy statement is the plug.

### 2.2 The Murphree relation inside the full MESH

Today the full MESH eliminates the vapour (`y_j = K_j x_j`, `:3888`).
With a Murphree vapour efficiency the vapour of tray j is
`y_j = y_{j+1} + E_j (K_j x_j - y_{j+1})`.  Two ways to carry it:

* **(A1) Keep y eliminated, recursively from the bottom.**  y_j becomes a
  function of x_j..x_N and T_j..T_N.  The stage block of j then depends on
  every stage below it: the Jacobian loses its band entirely.  It is dense
  today anyway (`:4039`), so this costs nothing NOW and closes the door on
  the block-tridiagonal solve later.  Rejected.
* **(A2) Promote y to unknowns.**  Per stage: x (n-1), y (n-1), T, V, L =
  `2n + 1`.  Rows: n-1 component balances, n-1 Murphree rows
  `y_j,i - y_{j+1,i} - E_j (K_j,i x_j,i - y_{j+1,i}) = 0`, the bubble
  condition of the LIQUID `Sum_i K_j,i x_j,i - 1 = 0` (the equilibrium
  vapour sums to one, the actual one sums to one by its own n-1 unknowns),
  the total balance and the energy balance = `2n + 1`.  Each row couples only
  j-1, j, j+1, so the structure is block-tridiagonal with block size `2n + 1`
  and can be DECLARED and audited exactly as the CMO MESH does (`:3587-3598`).
  **Recommended.**  With one E per tray (a binary, or a pseudo-binary, 3.2),
  summing the n Murphree relations gives `Sum y_j = 1` identically, so
  dropping the n-th relation is exact.  With component-wise E_i it is not
  (3.2, option 2).
* **The energy row.**  The vapour leaving tray j is priced at the tray's
  temperature T_j with its actual composition y_j, the convention every
  existing path already uses (Wang-Henke condenser and reboiler envelope,
  `:1836-1845`, `:2066-2072`; total reflux, `:5166`).  It is a CONVENTION,
  not physics: a vapour richer than equilibrium at T_j is not at T_j.  The
  record must say so where it is used, and Formulation B is where it stops
  being one (section 4).

`E_j = 1` everywhere must reduce A2 to today's full MESH to round-off (the
Murphree rows then give `y = K x`).  That is the first slice's proof (S1, section 7).

### 2.3 Where the efficiency is evaluated, and how it is coupled

Per tray, from THAT tray's converged state: `V_j`, `L_j`, `x_j`, `y_j`,
`T_j`, P, its densities, its vapour viscosity and diffusivity, its liquid
viscosity, diffusivity and surface tension, the local equilibrium slope, and
the flood approach the hydraulics compute for its traffic.  Exactly the
inputs the total-reflux lambda assembles (`:5176-5228`), so the slice
EXTRACTS that lambda into one function both paths call (the `BulkConversion.H`
precedent, CLAUDE.md §6) rather than copying it.

Two couplings:

* **(C1) Outer fixed point -- RECOMMENDED for the first slice that computes E (S3).**  Solve the
  full MESH with the efficiencies FROZEN (constants in the residual);
  evaluate every tray's E on the converged profile; solve again from the
  previous answer; stop when `max_j |E_j^new - E_j| < 1e-10`, refuse after a
  declared count, and announce the count (the total-reflux posture,
  `:5229-5258`).  The Newton never sees a correlation, so its Jacobian is not
  differentiating a chain of nested bubble points (the equilibrium slope is a
  central difference of two bubble points per tray, `:5196-5204`) and Fair's
  entrainment refusal (`TrayEfficiency.cpp:240-243`, psi >= 1 throws) can
  never fire inside a line search on a trial no one asked for.  Each inner
  solve is today's verified problem with constants changed.  Cost: one full
  MESH per outer pass; the first delivery needed 8 marches on
  `trayEfficiency01` at its recorded point (record `c329-ratebased-first-delivery.md`
  section 2).  Whether the fixed point contracts at a general reflux, and how
  fast near flood, is NOT MEASURED: the brief for the slice must measure it
  on the witness before claiming it.
* **(C2) Inside the Newton.**  E_j as a function of the unknowns, the
  Jacobian by finite differences.  It converges quadratically if it converges
  at all, but it puts nested solves (two bubble points per tray for the slope,
  the hydraulics) inside every residual evaluation, the same shape CLAUDE.md
  §5 records as noise under a finite-difference Jacobian for the second
  liquid ("Gibbs DECIDES, the Newton SOLVES").  Kept as the remedy if C1 is
  measured not to contract; not built first.

**No silent crutch.**  Every aid is announced: the seed (the CMO profile, as
today, `:3794-3799`), the starting efficiencies (E = 1, or a declared start),
the count of outer passes, any under-relaxation of E (none in the first
slice; if one is ever needed it is declared in `system/solverDict` and
announced when it binds), and the clip that the total-reflux march applies to
a negative Murphree vapour (`:5158`, announced at `:5262-5267`) -- the
A2 Newton must REFUSE a trial with a negative y rather than clip it (it is a
bounded unknown, the box the full MESH already declares for x, `:4078-4092`).

### 2.4 Rating against sizing

* **Rating** (`hydraulics { diameter <m>; }` declared): the geometry is
  fixed, the efficiency is computed, and every tray's flood approach is
  REPORTED; a tray past Fair's entrainment flood refuses by name, as the
  total-reflux path does (`TrayEfficiency.cpp:240-243`).  This is what the
  first delivery calls the model's own capacity limit.
* **Sizing** (`diameter` absent, `floodFraction` declared): the hydraulics
  already DESIGN a diameter in closed form from the traffic -- per tray, the
  diameter that puts that tray at `floodFraction` (`TrayHydraulics.cpp:270-275`),
  the column as wide as its widest tray (`:288-292`), and the two section
  diameters (`:304-320`).  In Formulation A the diameter feeds the efficiency
  (active area, flow path, weir length: `DistillationColumn.cpp:5085-5093`), so
  it becomes ONE MORE variable of the outer fixed point: solve, design D from
  the traffic, evaluate E with that D, solve again.  The fractions that make
  a tray from a diameter (downcomer, hole area, weir length, all declared,
  `TrayHydraulics.H:154-170`) stay declared; only D is solved.  One D for
  the whole column or one per section is a decision (the hydraulics publish
  both; the column sizer builds the tower straight at the wider section,
  CLAUDE.md §6 "ONE UNIT, FIVE ITEMS").  Recommended default: ONE diameter,
  announced, because a swaged tower changes the efficiency of the trays on
  either side of the swage and the engine has no correlation for the
  transition.
* What the hydraulics pass provides per tray today (`TrayHydraulics.H:175-189`):
  F_LV, C_SB, densities, surface tension, flood and actual velocity, flood
  approach, required diameter, the pressure-drop heads, downcomer backup,
  hole velocity and weep velocity, residence time, weep and downcomer-flood
  flags.  It is called AFTER convergence on Wang-Henke and the MESH
  (`hydraulicsPass`, `:4712`); in A it is called inside the outer loop.  The
  pressure drop is reported, not fed back (true of every path today; the
  first delivery names it, its section 8).  Feeding the tray pressure drop
  back into the stage pressures is a separate slice and is not proposed here.
* Weeping enters no efficiency (review section 2), so a sizing run can land a
  low-load section in the weeping region with an efficiency that does not
  know it.  The flag exists (`TrayHydraulics.H:187`); A must ANNOUNCE a
  weeping tray beside its computed efficiency, not refuse it.

### 2.5 A packed section at a general reflux

`Height / HETP` is not an integer, and HETP is itself the result of the
total-reflux integration (`:5713-5720`), not an input to it.  So a packed
section must NOT become `round(H/HETP)` equilibrium stages: that rounds a
computed quantity silently and evaluates HETP at one state for a section
whose loads vary.

Recommended: **a packed section is a stack of M SEGMENTS of declared or
announced height dz, each a Murphree stage whose efficiency is derived from
the bed's own transfer units over dz**: with the vapour in plug flow through
the segment and the liquid well mixed within it, `E_MV,seg = 1 -
exp(-dz/H_OG)` (`unchecked` as a literature statement; it follows from
integrating `dy/dz = (y* - y)/H_OG` across dz at fixed liquid, which is the
equation `:5652-5683` already integrates).  As M grows the stack tends to the
differential bed regardless of the mixing assumption inside a segment, so the
answer must be shown to be independent of M (two values of M published; the
total-reflux bed already integrates on 200 segments by default, `:5584`).  A
packed section then rides the SAME A2 machinery as trays, and its HETP is
reported as a derived number (bed height over the equivalent stage count),
exactly as now.

To REFUSE: a packed section declared with both a stage count and a height;
a declared HETP used as an input (it is the model's output); a segment count
so small that the published independence check fails (the engine should
print both answers and the difference, and refuse above a declared
tolerance -- the default a decision for the slice).

## 3. The binary restriction

### 3.1 What is binary today, exactly

| place | why it is binary | where |
|---|---|---|
| gas diffusivity | one pair, components 0 and 1 | `DistillationColumn.cpp:5183`, `:5625` |
| liquid diffusivity | Wilke-Chang at infinite dilution both ways on components 0 and 1, combined linearly in x | `:5188-5190`, `:5626-5628` |
| equilibrium slope m | central difference of y*_LK along a binary composition line `xp[1 - lk]` | `:5196-5204`, `:5608-5613` |
| one E per tray | `TrayEfficiency::State` carries ONE DV, ONE DL, ONE m, ONE lambda (`TrayEfficiency.H:206-222`) | |
| packed composition | `composition(ylk)` builds a binary from one number | `:5594-5595` |
| refusals | `n != 2` | `:5056-5060`, `:5509-5511` |

What the package ALREADY gives for any number of components: a gas
diffusivity for every pair (`ThermoPackage.H:640-641`), a liquid diffusivity
at infinite dilution for every solute/solvent pair (`:657-658`), liquid and
gas viscosity and conductivity of the mixture, the surface tension of the
mixture (`:667-668`).  What it does NOT give: any liquid diffusivity at finite
concentration other than the unit's own linear combination, and any
thermodynamic factor (no `d ln gamma / d x` exists in any activity model; a
search of `src/` finds none).

### 3.2 Options for three or more components (described, not chosen)

1. **A pseudo-binary efficiency on DECLARED keys.**  The tray's E is computed
   from the light-key/heavy-key pair (their gas pair diffusivity, their
   liquid pair diffusivities, the slope of the key pair) and applied to every
   component.  One E per tray, so `Sum y = 1` holds by construction (2.2) and
   A2 carries it unchanged.  `unchecked`: that this is the usual practice in
   tray design and what correlations such as AIChE were built for.  What a
   student is told: the efficiency belongs to the separation of the keys; the
   other components follow it whether or not their own transfer is that fast.
2. **Component-wise efficiencies.**  Each component's own E_OG,i from its own
   N_G,i and N_L,i (an effective diffusivity of i in the mixture, e.g. a
   Wilke-type mixing of the pair values, `unchecked`) and its own `lambda_i =
   K_i V/L`.  The E_i differ, so the n Murphree relations no longer sum to
   one and one of them must be dropped or the vapour normalised; which one,
   and what that does to a trace component, is the known difficulty
   (`unchecked`: that component efficiencies can be negative or above one for
   minor components in multicomponent mixtures).  Klemola's column has seven
   components below 1 wt % in its feed (`klemola-c4-splitter-reference-case.md`
   section 3).
3. **Maxwell-Stefan.**  A matrix of transfer units per tray and an efficiency
   MATRIX (`unchecked`), the diffusion interactions included.  It needs the
   thermodynamic factor and the finite-concentration diffusivities the
   package does not have (3.1).  In practice it is Formulation B's mass
   transfer written in efficiency form; it is listed here because it is the
   only option of the three in which a component can diffuse against its own
   gradient, and it should not be built twice.

The choice among them is pedagogical (what a student is told an efficiency
of a multicomponent tray IS) and is Vitor's (section 7).

## 4. Formulation B -- the explicit interfacial model

### 4.1 Unknowns and equations per stage (or packed segment)

Derived here for this record (not transcribed from a source).  With the
vapour and the liquid as separate control volumes meeting at an interface:

| unknowns | count |
|---|---|
| bulk vapour y, bulk liquid x | 2n |
| interface y^I, x^I | 2n |
| molar fluxes N_i across the interface | n |
| T_V, T_L, T_I | 3 |
| V, L | 2 |
| **total** | **5n + 5** |

| equations | count |
|---|---|
| vapour component balances (bulk), liquid component balances (bulk) | 2n |
| vapour-film rate equations (n-1 independent, the flux relation of the chosen diffusion model) | n - 1 |
| liquid-film rate equations | n - 1 |
| interface equilibrium `y^I_i = K_i(T_I, x^I, y^I) x^I_i` | n |
| `Sum y = 1`, `Sum x = 1`, `Sum y^I = 1`, `Sum x^I = 1` | 4 |
| vapour energy balance, liquid energy balance, energy flux continuous across the interface | 3 |
| **total** | **5n + 5** |

(Writing the flows as component flows removes the summations and V, L and
leaves the count unchanged.)  The column specifications replace rows at the
two ends exactly as in the full MESH (`:3931-3973`).

**Size against today.**  Per stage: CMO MESH n (`:3077`), full MESH n + 2
(`:3811`), A2 2n + 1, B 5n + 5.  Binary: 2 / 4 / 5 / 15.  Klemola (n = 9,
75 stages): 9 / 11 / 19 / 50 per stage, 675 / 825 / 1425 / 3750 in all.

**Structure.**  The bulk balances couple a stage to its neighbours only
through the bulk flows (vapour from below, liquid from above); everything at
the interface is local.  So the Jacobian is block-tridiagonal with block size
5n + 5, the structure `opts.blockTri` declares (`:3598`) and the solver
audits, and the CPR colouring costs about `3 (5n + 5)` residual evaluations
per iteration whatever the stage count (`:3587-3597`).  The dense full MESH
on Klemola's 825 unknowns already takes about 53 s for 5 iterations
(measured, 1.5); a dense solve of 3750 unknowns was not tried.  The block solve is what makes B affordable on Klemola, so B must be
built block-tridiagonal from the start and its column-level specifications
kept out of the stage rows (the full MESH's boil-up and bottoms rows are what
make it dense today, 1.2).

### 4.2 The closures

* **What must sum:** each of the four compositions (or, with component flows,
  nothing).
* **What must be continuous:** the component flux across the interface (one
  N_i appears in both films' balances), the energy flux across the interface
  (conductive heat on each side plus the enthalpy the fluxes carry), the
  temperature at the interface (T_I is one unknown both films see), the
  pressure (one P per stage, as today).
* **The bootstrap problem:** in a binary with a flux model of the Fickian
  form the n-1 = 1 rate equation per film does not determine the two fluxes;
  the energy continuity does (with nearly equal latent heats it gives nearly
  equimolar counter-diffusion; `unchecked` as the textbook statement).  So
  the interface energy balance is not an optional refinement: without it the
  binary is under-determined.

### 4.3 Properties the package does not give today

| needed | today | where |
|---|---|---|
| liquid thermodynamic factor (d ln gamma / d x) | none in any activity model | search of `src/thermo/` |
| liquid diffusivity at finite concentration, every pair | infinite dilution only (`diffusivityLiquid(T, i, j)`) | `ThermoPackage.H:657-658` |
| vapour diffusivity, every pair | present (`diffusivityGas`) | `:640-641` |
| film heat-transfer coefficients | none; an analogy from the mass-transfer coefficients and the phase conductivities and heat capacities (`unchecked`) | conductivities present, `:634-656` |
| mass-transfer coefficients and interfacial area, separately | packed beds: `kG`, `kL`, `ae` separately (`PackingRBF.H:112`); trays: only the PRODUCTS N_G, N_L (`TrayEfficiency.H:229`) | |
| the enthalpy of each phase at a non-equilibrium state | present (`columnEnthalpySurface`, `:386`) | |

The tray asymmetry matters: the AIChE route gives transfer units, not a
coefficient and an area, so a tray in Formulation B would carry the fluxes in
transfer-unit form; a packed segment can carry them in k a form.

### 4.4 The smallest honest first slice of B, and what it can be held to

**A BINARY PACKED BED AT TOTAL REFLUX as a non-equilibrium segment model.**
Why this one:

* The packing models already publish kG, kL and ae separately
  (`PackingRBF.H:112`), so no new correlation is needed.
* The total-reflux bed already exists as a transfer-unit model
  (`:5652-5683`), so B has an ORACLE in the tree: in the limit of a linear
  equilibrium over a segment, equimolar counter-diffusion and an isothermal
  interface, the two-film rate model reduces to `dy/dz = (y* - y)/H_OG` with
  `H_OG = H_G + lambda H_L` (`unchecked` as a literature statement; it is
  the derivation the packing records' H_OG rests on).  So B on `packing01`
  must reproduce `packing01`'s HETP in that limit, and its departure from it
  when the energy continuity is switched on is the first thing B can say that
  A cannot.
* The four Schulz cases (`packing01`-`04`) and their digitised measurements
  (first-delivery record, sections 11-12) are then a second check against
  measured data, unchanged in what was and was not fitted.
* Axial-discretisation independence (the plan's own words) is checkable on
  the existing segment count.

What it does NOT give: trays, multicomponent diffusion, a feed.  Trays come
second (transfer-unit form; the Yanagi cases as the oracle, A's computed E as
the limit), a feed third (on A2's block-tridiagonal skeleton).

**Klemola under B** needs multicomponent Maxwell-Stefan (3.2 option 3) and a
VALVE-tray mass-transfer correlation, and the tree has neither (section 6).

## 5. What each formulation can move

Counted from every `system/flowsheetDict` under `tutorials/` (comments
stripped; the `model` word read where it follows `type
distillationColumn;`): **49 column units** --

| model | units | cases |
|---|---|---|
| WangHenke (default, no word) | 16 | column01, 09, 10, 11, 16, 17, 18; process05, recycle02; optim01, optim06, pareto01, sensitivity01, sensitivity02; heatlink01, heatlink02 |
| WangHenke (word written) | 2 | column14, column15 |
| simultaneous | 14 | column02, 03, 04, 05, 12, 13; acetone06, acetone07; stripper01, stripper02; aceticAcid02_plant; acetonePlant (2 columns); crystalliser09_KHT_KCl_series |
| fullMESH | 5 | column06, 07, 08, 19, 20 |
| totalReflux | 12 | totalReflux01, trayEfficiency01-07, packing01-04 |

plus one column under `benchmarks/` (`distillation01_methanol_acetone_pressure_swing`).
Three declare `murphreeEfficiency` (column11, column14, column15), all
Wang-Henke.

**The requirement:** a column that declares nothing new is byte-identical.
A and B are both opt-in by a block or a word the corpus does not carry today
(an `efficiency {}` or `murphreeEfficiency` on the full MESH is REFUSED today,
`:2387-2400`, `:1335-1352`), so no golden should move.  How to PROVE it,
rather than infer it from the goldens' tolerance (1e-4 relative):

* build the parent commit and the slice side by side;
* run all 49 + 1 column units (and the 12 total-reflux ones, whose state
  builder is being extracted) under both, and compare every numeric leaf of
  the result JSON and every file under `converged/` and `reports/` by `cmp`
  (the measurement the DEV.md closure-stop entry already used: "bit-identical
  in every numeric leaf of their result JSON");
* slice S1 moves the full MESH's unknown layout, so its five witnesses
  are the ones that can move by round-off: if they do, the slice must either
  keep the old layout when no efficiency is declared (two code paths, one
  more to keep honest) or show the list of moved rows to Vitor before any
  `--record` (CLAUDE.md §10, golden re-record rule).  **Recommended: keep the
  old layout when every E is 1 and nothing is computed**, because a layout
  change that moves column06-08 and the reactive columns by round-off buys
  nothing a student can see.

Gates a slice must keep green (they read the touched surfaces):
`check_unread_keys` (its RB-03 arm asserts the refusal on a Wang-Henke
column naming `model totalReflux`, and its RB-07 arm asserts the exact phrase
"the ChanFair tray efficiency is implemented for a BINARY",
`bin/curate/check_unread_keys.py:242-308`), `check_energy_closure`,
`check_column_thermo_consistency`, `check_reactive_mesh`,
`check_kinetic_mesh`, `check_block_tridiagonal`, `check_design_sheet`
(column items), and the review scripts beside
`docs/reviews/2026-11-12-rate-based-columns/` if they have become a gate by
then.

## 6. The validation data

**In the repository:**

* Yanagi & Sakata 1982 (sieve trays, cyclohexane/n-heptane): two tabulated
  runs and digitised Figs. 12-13, all in the first-delivery record (sections
  4-5, 9-10) and the `trayEfficiency01`-`07` headers.  All at TOTAL reflux.
* Schulz et al. 2018 (gauze packing, p-/o-xylene): digitised Fig. 2b in the
  first-delivery record (sections 11-12).  Total reflux.
* Klemola & Ilme 1996 (industrial i-butane/n-butane fractionator): Table 1
  geometry and Table 2 performance transcribed in
  `docs/design/klemola-c4-splitter-reference-case.md` (sections 2-3) and
  `tutorials/steady/distillation/column14_klemola_c4_splitter/constant/reference/klemola1996_table2.csv`;
  the paper's own derived efficiencies (88 ideal trays, overall 118.9 %,
  NTU_OV 1.71, point efficiency 81.6 %, E_MV 119.1 %) in the record's section
  4.  What constrains a design, read from those files:
  - the column has NINE components (record section 3), so Formulation A on
    it needs a multicomponent option (3.2);
  - the trays are TWO-PASS Ballast V-1 VALVE trays (record section 2); the
    three correlations in the tree are sieve-tray correlations
    (`TrayEfficiency.H:189`) and the efficiency kernel models a single-pass
    flow path (`TrayEfficiency::Geometry::flowPath`, `TrayEfficiency.H:198`;
    the review's section 2 says "single-pass crossflow");
  - the measured anchors are ENDPOINT compositions only; the record's section
    8 says both passing rows also pass with E_MV = 1 (column15), so the
    product compositions do not discriminate an efficiency within their 1 %
    band.  What CAN discriminate a computed efficiency is the paper's own
    back-calculated E_MV 119.1 %, E_OV 81.6 % and NTU_OV 1.71, which are in
    the record: a computed efficiency on column14 would be compared with
    those three numbers, not with the products;
  - the boiler duty: 10.240 MW measured by the plant.  The record's section 8
    still quotes 8.09 MW for column14; today column14 publishes 9766.9 kW
    (its golden, and measured here: 597 passes, 31.1 s) with the subcooled
    reflux, as a CMO plug whose own reboiler envelope reads 10455.7 kW.  On
    column15 the full MESH with a SATURATED reflux gives 8095 kW, closure
    `verified` (1.5).  The duty is a quantity the full MESH could address
    independently of any efficiency, once it carries the subcooled reflux.
* Pelkonen 2001: **nothing**.  The only occurrence in the tree is PLAN.md's
  C329 row.  No case, no transcription, no record.

**Not here, and what a reader of each paper would have to supply:**

* Pelkonen 2001 (as named in PLAN.md; the full citation is not in the tree):
  the column geometry and packing or tray data; the systems (the plan says two
  ternaries, one held for prediction); for each run the feed or total-reflux
  specification, the pressure, the boil-up or F-factor, and the reboiler or
  any fixed composition; the MEASURED axial profiles (composition, and
  temperature if published) with their positions and uncertainty; which
  properties the authors used.  Whether the runs are at total reflux or at a
  general reflux is not known here and decides whether they test A/B at a
  general reflux at all.
* Klemola & Ilme 1996: the valve-tray data a correlation would need (valve
  lift, valve mass and orifice details beyond Table 1), and the paper's Table
  4 (the record says it lists ten methods disagreeing across a factor of
  five, but does not transcribe it).
* Yanagi & Sakata 1982 and Schulz 2018 at a GENERAL reflux: none of their
  runs used here are at a general reflux; the first delivery's data are all
  total reflux.  So **no measurement in the tree tests a general-reflux
  efficiency.**  A's general-reflux witness can be held only to limits (A at
  total-reflux-like specifications against `totalReflux`, A with E = 1
  against today's full MESH, A with a declared E printed beside Wang-Henke on
  column11 as a comparison and not an identity, 1.5) until a general-reflux
  dataset is transcribed.

## 7. Slices, decisions, rejected alternatives

### 7.1 Proposed order (each one sitting for a builder)

Slices are numbered S1, S2, ... to keep them apart from the layout options
(A1/A2, section 2.2) and the couplings (C1/C2, section 2.3).

1. **S1: Murphree inside the full MESH, DECLARED efficiency.**  Adds the A2
   layout (y as unknowns, the Murphree rows, the liquid bubble row) when
   `murphreeEfficiency != 1`; lifts the refusal at `:2387-2400` for
   `fullMESH` only (the CMO MESH keeps it, and its text stops naming `method
   simultaneous` for a full-MESH column, 1.5); declares `blockTri` for the
   new layout when the column's specification rows allow it (reflux ratio +
   distillate rate, no boil-up row, non-reactive), else stays dense and says
   why.  Witness: column11 with `model fullMESH;` (a new case, for example
   `column21_murphree_fullMESH`), held to (i) E = 1 everywhere reproduces the
   same column without the key to round-off and (ii) the reboiler closure
   `verified`.  Gate arm: the E = 1 identity, a declared-E run converged with
   a verified first law, and the old refusal still firing on `simultaneous`.
   Must not move: every existing case byte-identical (section 5).  Note: the
   case will NOT agree with column11 under Wang-Henke; on column01's
   specification the full MESH already moves x_D by 1.9 points at E = 1
   (1.5), and that difference is a finding to print beside it, not a defect.
2. **S2: the state builder extracted.**  Pure refactor: the lambda at
   `:5176-5228` and its packed twin (`:5602-5650`) become one function per
   correlation family, called by `solveTotalReflux[Packed]`; the 12
   total-reflux cases byte-identical.
3. **S3: computed efficiency in the full MESH, binary, rating mode.**  The
   outer fixed point (C1), E on each tray from its own converged state, the
   flood approach from the hydraulics inside the loop, weeping announced, the
   per-tray E published in the profile as the total-reflux path does
   (`:5412`).  Witness: a binary general-reflux column on the Yanagi tray
   geometry (the cyclohexane/n-heptane package of `trayEfficiency01`); held
   to the limits listed in section 6, and its trend towards the total-reflux
   efficiencies as the reflux ratio grows printed as a measurement, not
   claimed as an identity.  Gate: the outer count announced; the contraction
   measured on the witness; `efficiency {}` still refused on Wang-Henke and
   `simultaneous` (the RB-03 arm of `check_unread_keys` updated to accept
   `fullMESH` as a reader).
4. **S4: sizing mode** (D in the outer loop, one diameter, announced).
5. **S5: the full MESH declared block-tridiagonal in general** (moving the
   boil-up and bottoms specification rows out of the stage blocks, or
   carrying them as a bordered system), measured on column15 with
   `model fullMESH;` -- today 62.5 s, about 53 of them in five dense full-MESH iterations (1.5).
   Without it an outer efficiency loop on an industrial column costs minutes.
6. **S6: the subcooled reflux (`refluxTemperature`) in the full MESH** -- the
   Klemola cases need it before they can leave Wang-Henke (1.5).
7. **S7: packed sections at a general reflux** by segments (2.5), with the
   independence check.
8. **S8: multicomponent**, by whichever option Vitor chooses (3.2); the RB-07
   arm's phrase changes with it.  Only after S5, S6 and S8 can column14
   compute an efficiency at all, and then only with a two-pass valve-tray
   correlation the tree does not carry (section 6).
9. **B1: binary packed bed at total reflux, non-equilibrium segments**, held
   to the transfer-unit bed as its limit (4.4).  Then B2 trays (transfer-unit
   form, the Yanagi cases and S3's computed E as the limit), B3 a feed on the
   block-tridiagonal skeleton, B4 multicomponent Maxwell-Stefan with the
   thermodynamic factor added to the activity models first (its own slice,
   with its own witness against a closed form).

B1 does not depend on S1-S8 and can be built in parallel with them.

### 7.2 The owner's decisions

* **Pedagogical scope of a multicomponent efficiency** (3.2): one efficiency
  on declared keys, component-wise efficiencies, or nothing short of
  Maxwell-Stefan.
* **Whether Formulation B is a new `model` word** (for example `rateBased`)
  or a mode of the full MESH.  Recommendation, with its reason: a new word,
  because B's unknowns, its properties and its refusals are different and a
  student must be able to SEE which question the column answered; the
  dispatcher's refusal of an unknown word (`:1369-1373`) makes a new word
  cheap and safe.
* **Formulation A's home**: full MESH only (recommended), or also Wang-Henke
  (where column14 lives today).
* **One diameter or two** in sizing mode (2.4).
* **The Klemola target.**  The plan's "Klemola column14/15 with the
  efficiency coming out of the model" needs (a) a multicomponent option, (b)
  a two-pass valve-tray efficiency correlation, and (c) acceptance that the
  comparison is against the paper's back-calculated E_MV/E_OV/NTU_OV, not
  the products.  (b) has no source in the tree.
* **The Pelkonen 2001 paper** must be supplied before it can be planned
  against (section 6).

### 7.3 Rejected alternatives

* **Murphree in the full MESH by the Wang-Henke lag** (y_{j+1} from the
  previous Newton): a Newton has no outer pass to lag against, which is why
  `:2387-2400` refuses it; a lag would make the residual depend on the
  iteration history.
* **Eliminating y recursively (A1 of 2.2):** destroys the band permanently.
* **The efficiency inside the Newton as the first build (C2):** nested solves
  in the residual; kept as the remedy if C1 does not contract.
* **The CMO MESH as A's host:** no V_j, L_j to evaluate an efficiency on.
* **A packed section as round(H/HETP) stages:** rounds a computed quantity
  and evaluates HETP at one state for a section whose loads vary.
* **Starting B on Klemola:** needs every missing piece at once (section 6).
* **Klemola as the first witness of A:** nine components, valve trays, a
  Wang-Henke-only reflux key and a 62 s dense full MESH; the binary Yanagi
  geometry can witness every mechanism of A first.

## 8. Absences that become false when this is built

So that the builder buries them in the same commit (CLAUDE.md §10):

* `docs/design/klemola-c4-splitter-reference-case.md` section 6: "Predicting
  it needs the rate-based programme Choupo deliberately does not have
  (`docs/architecture/project-philosophy.md`)".  The philosophy file contains
  no statement about rate-based columns, distillation or tray efficiency (a
  search for "column", "distill", "efficien" and "rate-based" in it finds
  nothing), so the citation is already wrong today, independently of this
  plan.
* `docs/tutorialsGuide-steady.tex:1656`: "it has no rate-based
  (non-equilibrium) stage model ... at all" and "only for a BINARY column at
  TOTAL REFLUX".
* `distillation/DistillationColumn.H` class description: "no energy balance
  per stage, no Murphree efficiency" -- already partly false today (Wang-Henke
  carries a declared Murphree efficiency, `:1597`).
* `DistillationColumn::acceptance()` sentence (`:4884-4885`): "a Murphree
  efficiency only where declared".
* `solveSimultaneous`'s refusal text (`:2396-2400`).
* The `column11_murphree` header's own comparison table (x_D 0.9505 at
  E_MV 0.70 against 0.917894 measured, and its "ideal" 0.98125 against
  0.951017): stale today, independently of this plan (1.5), and its closing
  NOTE that "The MESH `simultaneous` method REFUSES the keyword".
* `docs/design/klemola-c4-splitter-reference-case.md` section 8, "the boiler
  duty (10.240 MW against 8.09 MW ...)": stale today (column14's golden is
  9766.9 kW, section 6), independently of this plan.
* `column14_klemola_c4_splitter` header sections 10 and 11 ("The efficiency
  is implemented on the Wang-Henke path only"; "Choupo computes a tray
  efficiency ... only for a BINARY column at TOTAL REFLUX, and it has no
  rate-based ... stage model ... at all"), and the same sentence in
  `column15_klemola_ideal_trays`.

## 9. How the measurements were taken

On scratch copies (under the session scratchpad, deleted afterwards) of
`column01_benzene_toluene`, `column02_simultaneous`, `column06_fullMESH`,
`column11_murphree` and `trayEfficiency01_yanagi14`, with `nStages` 20 /
`feedStage` 10 where a 20-stage timing is quoted, and one-line edits for the
probes, and of `column15_klemola_ideal_trays` under the three general-reflux
model words; `choupoSolve` at the case's own verbosity; wall time from the
shell clock around the process.  On a shared machine, so the times are
indicative only.  The runs were taken with a build of the tree's previous
head (commit 512b328c76), which differs from this record's base only in
`src/core/Origin.H` and three electrolyte files
(`git diff --stat 512b328c76 HEAD -- src`), none on a path these
non-electrolyte columns take; the four headline runs were repeated with this
tree's own build (b32ea5c211: column11_murphree, column01 at 20 stages under
the three model words, trayEfficiency01, the full-MESH Murphree refusal) and
printed the same numbers to every digit shown.
