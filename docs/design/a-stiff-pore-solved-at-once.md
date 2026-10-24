# A stiff pore solved at once — the extended Nernst-Planck equations across a DSPM-DE pore

*2026-10-22, DEV.md 4c C138, slice 1; slice 2 (the comparison with
NanoFiltran itself) is §9; the defaults corrected (C141) §10; a better
solver -- an analytic Jacobian, the wall and the water flux in the same
Newton, the closed form retired, NanoFiltran kept as the reference (C142) --
§11; a solution-adaptive grid, built and measured (C144) -- §12; the
paper's own comparisons, its Table 2 and its Fig. 3 against experiment
(C145) -- §13.  Vítor's
decision: build, as an
opt-in pore solver for the `DSPM-DE` transport law, the method of his own
NanoFiltran (Geraldes & Alves, "Computer program for simulation of mass
transport in nanofiltration membranes", J. Membr. Sci. 321 (2008)
172-182): the extended Nernst-Planck (ENP) equations discretised by finite
differences inside the membrane, linearised, every node solved at once —
"aquilo é um problema muito stiff".  Only the paper's abstract was available
to this slice; no NanoFiltran number is quoted or compared anywhere here.
That comparison is slice 2, on the paper.*

## 1. What was measured before anything was built

`DSPM-DE` did not solve the pore.  `DSPM_DE.cpp` (the `poreSolve` lambda)
made the pore electroneutral at the FEED face by a bisection on the feed
Donnan potential — and only when the membrane declares a charge, so with
`X_d = 0` two ions of unequal steric partition entered the pore NOT
electroneutral — made the PERMEATE electroneutral by a bisection on a
permeate Donnan potential, and carried each ion across alone by

    c_perm,i / c_in,i = K_c / (K_c + (1 − K_c e^{−Pe}) R),     R = part_feed/part_perm

Nothing coupled the ions inside the pore: neither electroneutrality nor zero
current was imposed there.  Its header listed both as "the physics solved".

The closed form is not the solution of the ENP even in its own limit with no
potential.  Take a point solute in an uncharged pore (`Φ = K_c = 1`, `R =
1`): it is transmitted `1/(2 − e^{−Pe})`, i.e. REJECTED up to 50 % at large
Péclet number, where the ENP gives `c_p = c_w` — no rejection at all — for
every Pe.  The neutral-solute solution of the ENP is the textbook one,
`c_p/c_w = Φ K_c / (1 − (1 − Φ K_c) e^{−Pe})`; the closed form does not
reduce to it.  §5 measures how far apart the two are on real cases.

## 2. The method

**The problem**, per ion on the dimensionless pore coordinate ξ ∈ [0, 1],
ψ the potential in RT/F units relative to the feed bulk, `P_i = K_d,i D_i
A_k/Δx` the ion's diffusive conductance of the layer:

    N_i = −P_i (dc_i/dξ + z_i c_i dψ/dξ) + K_c,i J_v c_i     constant in ξ
    N_i = J_v c_perm,i                                        the permeate closure
    Σ z_i c_i + X_d = 0                                        at EVERY node
    Σ z_i N_i = 0                                              zero current
    c_i(0) = feedSide_i e^{−z_i ψ(0)}                          feed partition
    c_i(1) = permSide_i c_perm,i e^{−z_i (ψ(1) − ψ_perm)}      permeate partition

`feedSide = Φ e^{−ΔW/kT} γ c_wall` and `permSide = Φ e^{−ΔW/kT}` are the
partition coefficients `DSPM_DE.cpp` already computed — the pore solver holds
no partition model of its own, so the law's one home for them stays the only
one.  Everything outside the pore is shared with the closed form: the wall,
the Davies γ at the feed face (bulk ionic strength), an ideal permeate, the
van't Hoff osmotic difference and the damped fixed point on the water flux.
The two paths therefore differ ONLY in the pore.

**The flux between two nodes is exponentially fitted (Scharfetter-Gummel).**
On [k, k+1] with the coefficients frozen and the potential linear, the ENP is
a linear ODE whose exact solution gives

    N_i = (P_i/h) [ B(−a h) c_k − B(a h) c_{k+1} ],   a h = K_c,i J_v h/P_i − z_i (ψ_{k+1} − ψ_k),
    B(x) = x/(e^x − 1)

Chosen over a central difference because a central difference of a
drift-diffusion flux is oscillation-free only while the cell Péclet number
stays below 2, and the fitted flux is exact for a uniform drift at ANY cell
Péclet number — the standard cure for drift-diffusion stiffness (the same
equations are solved in semiconductor device simulation).  It is second order
on a smooth profile, which §4 measures.  The Bernoulli function is evaluated
without cancellation near 0 and without overflow at large |x|.

**The unknowns, one block per node** (block size 2 Ni + 2): `ln c_{k,i}`,
`ψ_k`, a per-node copy of `ln c_perm,i` and of `ψ_perm`.  The copies are what
let the two GLOBAL unknowns fit the block-tridiagonal shape — each copy
couples only to its neighbour.  Rows of block k: the fitted flux of [k, k+1]
minus `J_v c_perm` (k < N) or the permeate partition (k = N);
electroneutrality; the feed partition (k = 0) or the `c_perm` copy held equal
backward; the `ψ_perm` copy held equal FORWARD, or zero current at k = N.
**The direction of the copy rows is not cosmetic**: the first layout held the
`ψ_perm` copy equal backward and put zero current at node 0, which left the
`ψ_perm` column of the first diagonal block empty — block-Thomas has no
pivoting across blocks, so every first solve failed on a singular pivot block
(measured).  Every row is normalised by the terms it balances
(`solver/Convergence.H`'s rule): a flux row by `|t1| + |t2| + |J_v c_perm|`,
electroneutrality by `Σ |z| c + |X_d|`, zero current by `Σ |z| N`.

**The solve** is `solver::newtonND` with `NDOptions::blockTri` declared —
the colored Jacobian and the block-Thomas solve the MESH column and the stiff
integrator share.  One field was added to `BlockTri`, `audit` (default true):
the first-iteration dense audit costs a dense Jacobian, and the pore is solved
thousands of times per run with the same residual function, so DSPM-DE audits
its FIRST solve, announces the measurement, and declares the rest.  No caller
that predates the field changes.

**The seed is local Donnan equilibrium.**  Each ion's reservoir value runs
log-linear from `feedSide` to `permSide c_perm` (the closed form's permeate),
and at every node the potential is the one that makes the pore
electroneutral against those reservoirs (a bisection — monotone).  Both
partitions and electroneutrality hold at every node of the seed; the Newton
owes only the flux rows and zero current.  The first seed (log-linear
concentrations, flat potential) was measured to send the Newton into overflow
on a strongly charged pore with a divalent co-ion.  Between water-flux passes
of one station the previous pore warm-starts the next; between stations, the
previous station's pore.  The closed-form seed is used once per run — and on
`membrane20`'s MgSO4 unit even that one fails (the closed form is far from
the answer), which is what the next aid is for.

**Continuation in J_v, counted.**  When the Newton fails from its seed, the
pore is solved again from the one state that is exact without any Newton: at
`J_v = 0` nothing crosses, the pore is in Donnan equilibrium with both baths
and the permeate equals the feed.  From a Péclet number of 1e-4 the flux is
raised geometrically to the target, each solve warm-started, a failed step
shortening the ratio.  It is a solver aid, so it is ANNOUNCED (once, and into
the caveat block) and COUNTED in the module's pore summary; the failed
attempts are filed as the solver's path (trial advisories), never as the
answer.  A pore that still does not converge REFUSES the run, naming `J_v`,
`X_d`, the node count and why.

## 3. The declaration and the voice

*(Slice 1 as built.  Since C141 the solved pore is the default; since C142
`method closedForm` is RETIRED and refuses, `nodes` has a sibling `grading`,
and the audit runs on an 11-node copy of the first station -- §11.)*

    transportParameters { poreSolver { method finiteDifference; nodes 101; } }

`method closedForm` is the default, byte-identical.  `nodes` (faces
included) defaults to 101, announced as a stated default.  An unknown method
word refuses naming both accepted words (`registryRefusal`); `nodes` beside
`closedForm`, `nodes` below 3, an unknown key in `poreSolver` and an unknown
key in `transportParameters` each refuse by name — `DSPM-DE` had no
`readParameters` before, so a `transportParameters` block handed to it was
silently ignored.

The run says: the method, the node count, the block structure; the first
solve's Newton iterations, `||F||`, the block-tridiagonal structure VERIFIED
(max |J| off the bands, exactly 0) and the STIFFNESS of the answer — the
electromigration flux against the net flux; and per unit a pore summary:
solves, the most Newton iterations, the worst `||F||`, flux constancy (against
the terms each interval nets AND against the net flux), zero current,
electroneutrality, and how many solves needed the continuation.  Two KPIs are
published, `pore_nodes` and `pore_stiffness_max`; the residuals are printed
and never pinned — a golden on a number at the last digit pins the compiler.

## 4. Verification, measured (bin/curate/check_pore_solver.py)

A probe compiled against the pore solver alone:

| arm | measured |
|-----|----------|
| ANALYTIC — 1:1 salt, `X_d = 0`, unequal partitions and conductances.  Electroneutrality and zero current collapse the two ENP equations into ONE ambipolar equation: `P_s = 2P₊P₋/(P₊+P₋)`, `K_c,s = (K_c₊P₋ + K_c₋P₊)/(P₊+P₋)`, `S = √(Φ₊Φ₋)`, `c_p/(γ c_w) = S K_c,s/(1 − (1 − S K_c,s) e^{−Pe})`, `Pe = K_c,s J_v/P_s` | observed order 1.97–2.00 from 25 to 400 intervals at Pe 0.44 and 4.4; within 2.1e-9 at 1600; at Pe 440 (cell Péclet 17.6 at 25 intervals) exact to round-off on every grid; cation and anion permeates equal to 1e-12 |
| GRID — a stiff pore, `X_d = −200`, Na₂SO₄ + a trace of NaCl, migration 2.9e5 × the net flux | Richardson order 2.00–2.01 on every ion |
| MACHINE | `||F||` ≤ 2.5e-14; flux constancy ≤ 1.6e-15 of the terms each interval nets; zero current ≤ 3e-16; electroneutrality ≤ 3e-16 |
| AUDIT | exactly 0 outside the declared bands |
| SWEEP — J_v 1e-7..1e-2 m/s × X_d −2000..+1000, from a CRUDE seed | 56/56 converge, 14 by continuation; worst `||F||` 7e-14 |
| WARM vs cold | 5.5e-14 |

**Flux constancy has two honest measures, and they part by the stiffness.**
Against the two fitted terms an interval nets, it is round-off (1e-15).
Against the net flux itself it is 2.7e-7 at 1600 intervals on the stiff
pore: a co-ion held back by the Donnan field carries terms far larger than
the flux they net, and 1e-16 of the large terms is a larger fraction of the
small one — the representable limit of the problem, not a solver defect.
Both are printed.

**End to end**, on a copy of the witness with an UNCHARGED, Born-free
membrane: per station, the permeate the march used (`dN_b/dQ_b` between
profile rows) against the ambipolar closed form above, built in Python from
the station's own `J_w`, wall concentration and Davies γ, the ion records'
radii and D0 and an independent transcription of the Deen polynomials: within
**1.6e-6 at every station** at 101 nodes.  This is the arm that proves the
LAW hands the pore the right conductances, hindrances and partitions.  On the
same stations the default closed form departs from that limit by **70.6 %** at its worst station
(pinned as a finding; the arm fails the day it closes).

**The witness's own grid** (`membrane20`, NaCl): observed order 2.0 across
26–801 nodes; the transmission moves 4.4e-8 between 201 and 401 nodes.

## 5. The closed form beside the solved pore — reported, no golden moved

| case | unit | closed form R_obs | solved pore R_obs (101 nodes) |
|------|------|------------------:|------------------------------:|
| membrane10 (X_d −5, 5 mM) | NaCl | 54.95 % | 74.98 % |
| | CaCl₂ | 70.46 % | 83.89 % |
| | MgSO₄ | 99.924 % | 99.980 % |
| membrane11 (50 mM NaCl) | Born on | 86.10 % | 63.84 % |
| | Born off | 65.95 % | **−2.46 %** |
| membrane20 (the witness) | NaCl | 56.97 % | 75.09 % |
| | MgSO₄ | 99.924 % | 99.980 % |
| STIFF: MgSO₄ 5 mM + 1 % NaCl trace, X_d −5 | MgSO₄ / Na trace | 82.18 % / 8.42 % | 99.852 % / 99.351 % |
| same, X_d −50 | | **−40.42 % / −88.93 %** | 99.959 % / 99.655 % |
| same, X_d −200 (stiffness 1.5e5) | | **−63.52 % / −40.61 %** | 99.980 % / 99.761 % |

The stiff rows are unchanged to six digits between 101 and 401 nodes; every
solve held `||F||` ≤ 1e-12 and electroneutrality ≤ 7e-15, zero current ≤
5.5e-13, and only the first station of each run needed the continuation.

The membrane11 Born-off row is NEGATIVE rejection of a single salt, and it is
not the pore's doing: **the wall shared by both paths is closed with the
salt's solution-diffusion `B_s`**, not with the pore's own permeate
(`wallWithSolutionDiffusion`, called from `wallIons`), so at that flux the
film polarises to `c_m ≈ 2.4 c_b` against a permeate the pore makes larger
than `B_s` would.  The membrane record says "the DSPM-DE law does NOT use the
solution-diffusion B_s" — it does, in the wall.  Recorded, not fixed: it moves
every DSPM-DE golden, and it is Vítor's.

## 6. What the solver could do for SDEM — measured, not built

SDEM's equations are this solver's with `K_c → 0`, `X_d = 0` and unit
partitions (its "virtual" concentrations).  Measured in a scratch program
against SDEM's own backward RK4 shot (`solveInner`, 320 steps), MgSO₄ 10 mM
with four trace ions on the NF270 permeances: agreement 1e-7..3e-5 up to
`J_v = 4e-5 m/s`; at `J_v = 1e-4 m/s` the trace monovalent cations differ by
2.5e-3 at 801 nodes (and 1.6e-2 between 201 and 801) — at that flux the
permeate-face boundary layer is thin and a UNIFORM grid resolves it slowly,
where the fourth-order shot does not.  So the solver serves SDEM's equations,
converges where the shot was tuned and beyond, but a production swap wants a
grid stretched toward the permeate face.  Slice 2's question.

## 7. What is NOT done

*(As of slice 1.  The non-uniform grid was built in C142 and measured not to
help; the default was replaced in C141 and the closed form retired in C142 --
§10, §11.)*

- ~~Any comparison with NanoFiltran~~ -- done in slice 2, against the
  PROGRAM itself on the same model (§9); its published figures were not
  digitised.
- The wall closed with the pore's own permeate (§5) and activity at both
  faces exist since slice 2 as DECLARED choices (§9); the default of both
  paths is unchanged (B_s wall closure, feed-face Davies, ideal permeate).
- The batch diafilter under the solved pore: it runs (`transportParameters`
  is handed to the law there too), but it prints no pore summary and has no
  witness.
- A per-salt collapse of a MIXED feed's permeate: the module marches salts,
  the pore returns ions, and the existing collapse reads the cation leg; a
  mixture's permeate is electroneutral overall, not salt by salt.
- A non-uniform grid (§6), a pore-size distribution, a pore profile published
  as internal state.
- Whether a case's `nodes` is ENOUGH: the gate measures the order; a case must
  still declare its grid.
- Replacing the default.  The closed form stays byte-identical — every
  DSPM-DE golden is pinned to it — and whether to retire it is Vítor's.

## 8. The gate, and what its sabotages found

`bin/curate/check_pore_solver.py`, wired into `bin/runTests`.  Eight
sabotages by hand, each restored and rebuilt; the observed output is in the
gate's docstring.  Every one fails the gate.  Three are worth reading:

- **A central difference passed every low-Péclet arm** — it is second order
  too where it is stable — and was caught by the Péclet-440 arm (and, barely,
  by the 1e-8 bound at 1600 intervals).  A sabotage that only a
  regime-specific arm sees is the reason that arm exists.
- **A law handing the pore an unhindered conductance passed the whole
  probe** — the probe writes its own coefficients — and only the end-to-end
  arm (c) saw it, at 139 % from the analytic limit.
- **An unknown method word, accepted, SURVIVED the first version of the
  refusal arm**: its probe also declared `nodes`, the bad word fell through
  to the closed form, which refused the `nodes` instead — and that output
  still contained every needle the arm looked for.  A refusal for another
  reason is not the refusal under test; each probe now carries one defect
  and its needle is the refusal's own sentence.

Also found by a sabotage: two of membrane10's golden rows are closures at
round-off (2e-16 against 4e-16), which a 1e-10 relative comparison would
read as the default path moving; they are compared absolutely now.

## 9. Slice 2: the same model in NanoFiltran — a code-to-code golden

*2026-10-22.  Vítor handed over NanoFiltran itself (Geraldes & Brites Alves,
J. Membr. Sci. 321 (2008) 172-182, doi:10.1016/j.memsci.2008.04.054) and,
the same day, leave to vendor it ("O nanofiltran pode ser usado sem
problema!").  It lives in `bin/curate/nanofiltran/` as received (README
there: licences, build, the matching rule, the findings), and
`tutorials/props/membrane/nanofiltran01_dspmde_reference` is the golden case.
CODE-TO-CODE VERIFICATION: one model, two implementations.  Nothing here is
a measurement.*

### 9.1 What NanoFiltran's model is — read from the source

Read in `NANOFILTRAN.F` (`MODEL`), not assumed:

- ENP per ion between nodes with **central** differences — the flux
  `−D K_d Δc/Δx − z U c̄ Δφ/Δx + J_v K_c c̄ = J_v c_p` on every interval,
  `c̄` the interval mean; electroneutrality with the fixed charge at every
  pore node; the permeate is the last node.  Exact Newton linearisation of
  the products, a dense `SGESV` (LAPACK 3.0 converted to `REAL*8`),
  under-relaxed by `URF`.  ND nodes of which ND−1 span the layer on a mesh
  mirrored about the centre and refined toward both faces by `EPSX`; ND is
  forced EVEN (the comment says "odd") and limited to 205.
- Partitions at both faces: steric `(1−λ)²` × Born `exp(−6.95e-5 z²/r_s
  (1/ε_p − 1/80)/(8.314 T))` × the activity ratio × Donnan.  ε_water is
  fixed at 80.
- Activities: `GB = γ_bulk(I_wall; A(80)) / γ_pore(I_node1; A(ε_p))` at the
  feed face, `GP = γ_perm(I_perm; A(80)) / γ_pore(I_node ND−1; A(ε_p))` at the
  permeate face, Davies `exp(−A z² (√I/(1+√I) − 0.3 I))` with
  `A = 1.825e6 (εT)^−1.5`; neutral solutes `exp(0.1 I)`; `IACT 0` = ideal.
- Hindrance: `K_d = H(λ)/(1−λ)²` (λ ≤ 0.95, Dechadilok-Deen's `H`), `K_d =
  0.984((1−λ)/λ)^{5/2}` above; `K_c = (1+3.867λ−1.907λ²−0.834λ³)/(1+1.867λ
  −0.741λ²)`.
- The film, when a Sherwood correlation is given: per ion `k = D/L · a Re^b
  Sc^c`, `Sc = μ/997/D`, the suction correction `k* = k (φ + (1+0.26φ^1.4)^−1.7)`
  (Geraldes & Afonso 2006) and the interface balance `J_v c_p = J_v c_0 −
  k*(c_0 − c_b) − z D F/RT c_0 dφ/dx` with electroneutrality at the
  interface — the multi-ionic model of Geraldes & Afonso 2007, i.e. Choupo's
  `Polarisation` kernel equation for equation.  Without a correlation the
  film is NOT removed: `k = 10 m/s` in the same equations.
- `D(T)` from `D25` by Vogel's viscosity and Stokes-Einstein; `F = 96500`,
  `R = 8.314`.

### 9.2 Every difference, and how each was handled

| difference | kind | handled by |
|---|---|---|
| `K_d`: Choupo's default takes the polynomial `H` itself, NanoFiltran `H/Φ` | **model** (and a Choupo defect, §9.5) | new declared `hindrance DechadilokDeen2006;` |
| `K_c`: Bowen-Welfoot centreline vs Dechadilok-Deen rational fit | model | the same declaration |
| activity: Choupo Davies at the feed face only, permeate ideal; NanoFiltran the bulk/pore ratio at both faces, pore A from ε_p | model | new `activity bulkOverPoreDavies;` (and `ideal`) |
| bulk dielectric: Choupo `epsWater(T)` (78.45), NanoFiltran 80 | model input | new `bulkDielectric 80;` |
| wall: Choupo closes it with the salts' `B_s`, NanoFiltran with the pore's own permeate | model | new `poreSolver { wallClosure porePermeate; }` |
| fixed `J_v` (NanoFiltran's input) vs `J_w = A_w(ΔP − Δπ)` | problem statement | the `poreTransport` props op hands the SAME law `imposedJv` |
| `D` corrected to T by Vogel (×1.000140779 at 298.15 K) | constant | NanoFiltran's IONS input divided by it |
| Born constant `6.95e-5/8.314` vs CODATA (exponent 5.2e-4 larger) | constant | NanoFiltran's ε_p input 60 → 60.0078 |
| single-precision literals in `H(λ)`: K_d of Mg²⁺ −1.55e-4 | numerics | NanoFiltran's D input × K_d(double)/K_d(single) |
| Davies `exp()` on the log10 A | **NanoFiltran defect** (§9.5) | the Davies op anchored on a copy with ln 10 restored (`DAVIES_PATCH`) |
| `F`, `R` | constants | none needed: `F/RT` only scales the potential variable, which is not compared |
| central differences vs Scharfetter-Gummel; ND ≤ 205 vs any grid | numerics | both converged in their own grids (second order, measured) and Richardson-extrapolated |
| the Davies constant's fifth figure (1.825e6 vs 1.82483e6) | constant | written to five figures in the same patch |

### 9.3 The matrix, and what NanoFiltran could not converge

Six ops, 13 operating points, 35 ion rows (`bin/curate/nanofiltran/
regenerate.py`): the shipped example (Na⁺/Mg²⁺/Cl⁻ 10/20/50 mol/m³, X −30
mol/m³, r_p 0.4 nm, δ 2.5 μm, ε_p 60, T 298.15 K) at J_v 1e-6 … 5e-5 m/s; the
example with Born off (ε_p = 80); the example with Davies (Born off, §9.4);
NaCl 10 mol/m³ and Na₂SO₄ 10 mol/m³ (the divalent co-ion against the negative
pore) at 1e-5 and 5e-5; and NaCl + Na₂SO₄ 10/10 with polarisation (Sh = 0.23
Re^0.567 Sc^0.33, Re 2000, L 2.4 cm — Choupo's `StirredCell` with radius = L,
density 997 and NanoFiltran's Vogel viscosity) at 1e-5 and 3e-5.  NanoFiltran
ran each at ND 102 and 204, uniform mesh, URF 0.1, TOL 1e-9, ITMAX 4000.

NanoFiltran's normalised residuals sum absolute values over every interval,
so their floor grows with ND and with the stiffness: at TOL 1e-9 it stopped
at ITMAX on NaCl at ND 204 (residual 4.8e-9, 2.4e-9) and Na₂SO₄ at both grids
(7.1e-8, 2.8e-8); at TOL 1e-10, NaCl ran 20 000 iterations at both grids.
Those answers had stopped moving all the same — they agree with Choupo to
1.1e-7 and 1.8e-7 — and reference.tsv says which rows they are.  At TOL
1e-12 the shipped example had not terminated after two minutes (ITMAX
100 000) and was stopped.  Its own grid: second order,
Na⁺ of the example at J_v 5e-5 moving 3.8e-4 between ND 204 and the
extrapolation — the widest error in the table, and the widest anchor band.

### 9.4 The comparison

Both programs Richardson-extrapolated: NanoFiltran from ND 102/204 (100/202
intervals), Choupo from 801/1601 nodes (its observed order 2.00 on every
row, from 401/801/1601).  The grid columns are each program's own error at
its finest run (NanoFiltran at ND 204, Choupo at the case's 801 nodes).

| op | J_v [m/s] | ion | NanoFiltran c_p (ext) | Choupo c_p (ext) | rel. diff | NF grid (ND 204) | Choupo grid (801) |
|---|---:|---|---:|---:|---:|---:|---:|
| example_ideal | 1e-06 | Na | 10.95434541 | 10.95434546 | +4.6e-09 | 2.1e-08 | 3.7e-09 |
| example_ideal | 1e-06 | Cl | 39.85054943 | 39.85054861 | -2.1e-08 | 3.7e-08 | 2.5e-09 |
| example_ideal | 1e-06 | Mg | 14.44810201 | 14.44810157 | -3.0e-08 | 5.9e-08 | 4.8e-09 |
| example_ideal | 5e-06 | Na | 9.550598738 | 9.550598588 | -1.6e-08 | 8.0e-08 | 5.2e-08 |
| example_ideal | 5e-06 | Cl | 28.794947 | 28.79494566 | -4.7e-08 | 3.1e-07 | 1.3e-08 |
| example_ideal | 5e-06 | Mg | 9.622174131 | 9.622173538 | -6.2e-08 | 5.0e-07 | 4.5e-08 |
| example_ideal | 1e-05 | Na | 6.631111402 | 6.631111091 | -4.7e-08 | 2.5e-08 | 2.0e-08 |
| example_ideal | 1e-05 | Cl | 24.15249423 | 24.1524927 | -6.3e-08 | 7.2e-08 | 4.1e-10 |
| example_ideal | 1e-05 | Mg | 8.760691414 | 8.760690806 | -6.9e-08 | 9.0e-08 | 8.0e-09 |
| example_ideal | 2e-05 | Na | 2.685199737 | 2.685199462 | -1.0e-07 | 1.2e-06 | 1.2e-06 |
| example_ideal | 2e-05 | Cl | 19.80839037 | 19.80838886 | -7.6e-08 | 9.6e-07 | 1.0e-08 |
| example_ideal | 2e-05 | Mg | 8.561595318 | 8.561594699 | -7.2e-08 | 1.3e-06 | 1.8e-07 |
| example_ideal | 5e-05 | Na | 0.04650076392 | 0.04650075874 | -1.1e-07 | 3.8e-04 | 1.7e-05 |
| example_ideal | 5e-05 | Cl | 17.19873263 | 17.19873139 | -7.2e-08 | 5.5e-06 | 8.6e-07 |
| example_ideal | 5e-05 | Mg | 8.576115933 | 8.576115316 | -7.2e-08 | 6.6e-06 | 9.1e-07 |
| example_noBorn | 5e-05 | Na | 8.214063806 | 8.214063981 | +2.1e-08 | 2.0e-08 | 5.6e-07 |
| example_noBorn | 5e-05 | Cl | 28.90291155 | 28.90291041 | -3.9e-08 | 2.6e-09 | 1.7e-07 |
| example_noBorn | 5e-05 | Mg | 10.34442387 | 10.34442321 | -6.4e-08 | 4.3e-09 | 1.4e-08 |
| example_davies | 5e-05 | Na | 7.265155751 | 7.265155898 | +2.0e-08 | 2.6e-07 | 3.1e-07 |
| example_davies | 5e-05 | Cl | 26.66643644 | 26.66643533 | -4.2e-08 | 7.1e-08 | 9.5e-08 |
| example_davies | 5e-05 | Mg | 9.700640346 | 9.700639718 | -6.5e-08 | 1.4e-09 | 1.3e-08 |
| NaCl_ideal | 1e-05 | Na | 3.128208847 | 3.128208556 | -9.3e-08 | 3.2e-08 | <1e-11 |
| NaCl_ideal | 1e-05 | Cl | 3.128208847 | 3.128208556 | -9.3e-08 | 3.2e-08 | <1e-11 |
| NaCl_ideal | 5e-05 | Na | 0.8986329628 | 0.8986328676 | -1.1e-07 | 7.4e-07 | 2.2e-10 |
| NaCl_ideal | 5e-05 | Cl | 0.8986329628 | 0.8986328676 | -1.1e-07 | 7.4e-07 | 2.2e-10 |
| Na2SO4_ideal | 1e-05 | Na | 0.03372171352 | 0.03372170732 | -1.8e-07 | 3.5e-07 | <1e-11 |
| Na2SO4_ideal | 1e-05 | SO4 | 0.01686085676 | 0.01686085366 | -1.8e-07 | 3.5e-07 | <1e-11 |
| Na2SO4_ideal | 5e-05 | Na | 0.01398816288 | 0.01398816038 | -1.8e-07 | 2.8e-06 | <1e-11 |
| Na2SO4_ideal | 5e-05 | SO4 | 0.006994081439 | 0.006994080188 | -1.8e-07 | 2.8e-06 | <1e-11 |
| mixed_polarised | 1e-05 | Na | 12.99226679 | 12.99226779 | +7.7e-08 | 2.4e-08 | <1e-11 |
| mixed_polarised | 1e-05 | Cl | 11.83400703 | 11.83400712 | +7.6e-09 | 3.0e-10 | <1e-11 |
| mixed_polarised | 1e-05 | SO4 | 0.5791298764 | 0.5791303359 | +7.9e-07 | 2.6e-07 | 6.9e-10 |
| mixed_polarised | 3e-05 | Na | 22.18068891 | 22.18069367 | +2.1e-07 | 1.6e-07 | 3.6e-09 |
| mixed_polarised | 3e-05 | Cl | 10.41207837 | 10.41207822 | -1.4e-08 | 2.0e-08 | 9.6e-10 |
| mixed_polarised | 3e-05 | SO4 | 5.884305271 | 5.884307722 | +4.2e-07 | 3.3e-07 | 7.1e-09 |

**Every row agrees within 7.9e-7, and 32 of 35 within 2e-7** — below both
programs' discretisation error wherever that error is above 1e-7.  The
residual is systematic and has visible sources on NanoFiltran's side: its
`K_c` literals are single precision too (2–6e-8), it stops at TOL 1e-9, and
the `D` compensation of §9.2 reaches its FILM as well as its pore — on SO₄²⁻
(K_d compensation 8.3e-7) the polarised rows are the largest, 7.9e-7 and
4.2e-7.  `bin/curate/check_nanofiltran_reference.py` holds the agreement at
2e-6; the case's own 801-node rows sit within anchor bands sized 3 × (its
grid error + a third of NanoFiltran's last Richardson step + the measured
disagreement), floored at 1e-6.

**What the matching was worth.**  With only the Vogel and Born constants
matched, the example parted by 6.8e-4 on the trace Na⁺ and 1.4e-5 on Mg²⁺,
and MgCl₂ alone by 5.5e-5, while NaCl alone agreed to 1.1e-7: a disagreement
confined to Mg²⁺.  NanoFiltran's printed `KDF` for Mg²⁺ (6.0853010159e-3)
is the single-precision evaluation of the polynomial exactly; the double is
6.0862467e-3.  Compensated through the input, every row fell to ~1e-7.
With no matching at all (the first run of the day) the example's Na⁺ differed by 3.2e-3.

**The Davies op runs with Born off.**  With Born on, the ε_p input that
matches NanoFiltran's Born constant also enters its pore-side Davies
`A(ε_p)` (2e-4 larger), and the example's trace Na⁺ amplifies that to 5.5e-4.
A one-off build with the pore A evaluated at 60 exactly agreed to 1.3e-7
(Na⁺) and 7e-8 (Cl⁻, Mg²⁺) with Born ON — the Born-on path of
`bulkOverPoreDavies` is verified, but not pinned.

### 9.5 Two findings

**NanoFiltran's Davies is ln 10 too weak.**  `A = 1.825e6 (εT)^−1.5` is the
constant of Davies' equation for log₁₀ γ (0.495 at ε = 80, 298.15 K);
NanoFiltran writes `γ = exp(−A z² …)`.  As received, it puts 7.7 % more Na⁺,
4.8 % more Cl⁻ and 3.8 % more Mg²⁺ in the Davies op's permeate than the
corrected copy (`regenerate.py --report-davies`: 7.824213764 / 27.95573084 /
10.06575854 against 7.265155751 / 26.66643644 / 9.700640346 mol/m³).  The
by-hand sabotage that gives Choupo the same mistake reproduces the
as-received numbers to 5e-6, so the explanation is the whole difference.
Choupo was not given an option for it: a declared choice that reproduces a
known error is a wrong model with a name.

**Choupo's default `K_d` counts the steric partition twice.**  The DSPM-DE
default (`deenFactors`, `DSPM_DE.cpp`) takes Dechadilok-Deen's polynomial as
`K_d`; the polynomial is `H = Φ K_d` (it meets the λ > 0.95 lubrication form
only once divided by Φ), and Φ is already in the partition.  `K_d` is too
small by `(1−λ)²` — 0.29 for Na⁺ in this pore, 0.016 for Mg²⁺ — in every
DSPM-DE case of the corpus (membrane10, 11, 20).
NOT changed: every DSPM-DE golden is pinned to it, and replacing the default
is Vítor's decision.  `hindrance DechadilokDeen2006;` is the remedy, opt-in.
One consequence measured on the way: on NanoFiltran's example membrane the
legacy `K_d` drives the trace Na⁺ permeate from 1.16 to 3e-12 mol/m³ between
J_v 1e-5 and 1.4e-5 m/s, and the solved pore's continuation then stalls at
1.4e-5 on every grid (101 to 801 nodes) — the representable limit of a
concentration 12 orders below its feed, not a fold.

### 9.6 What was added to Choupo

- `DSPM-DE` declared choices, each opt-in, each refusing an unknown word by
  name, each announced once per run when declared: `hindrance`,
  `activity`, `bulkDielectric`, `poreSolver { wallClosure }`.  With none
  declared every membrane case's result JSON and console are byte-identical
  to the parent build (measured: 23 cases — steady/membranes, the two
  diafilters, polarisation01).
- `wallClosure porePermeate` is a NEWTON on the permeate the wall is closed
  with (one unknown per ion, `solver::newtonND`, each evaluation one pore
  warm-started from the last), not a fixed point: a plain fixed point was
  built first and failed on the polarised op (400 passes without settling),
  and a full step from the B_s closure can ask the film for more of an ion
  than it supplies — such a trial is an `InfeasibleTrial` the line search
  backs away from.  The shared `Polarisation` kernel is unchanged.
- `bulkOverPoreDavies` converges the pore-side gammas by a fixed point
  around each pore solve (≤ 1e-13 relative); it refuses the closed form.
- The structure audit (a dense Jacobian of the first pore) is skipped above
  4096 unknowns and the banner says so with its size: at 3201 nodes of a
  four-ion pore it was 8.2 GB.
- `TransportContext::imposedJv` (NaN for every unit) and
  `TransportSolution::ions` (per-ion bulk, wall, permeate).
- The `poreTransport` props op; `choupoProps` now loads the membrane
  registry.

### 9.7 Still NOT done

- The batch diafilter under the declared choices (they are read there too,
  untested).  ~~The spiral module: a DSPM-DE salt feed under `ionCoupling
  electroneutral;` is still refused by `buildPolarisation`.~~  Lifted in
  C148 (2026-10-24) for a law that decomposes its salts itself
  (`TransportModel::decomposesSaltsIntoIons`, DSPM-DE; the builder says so
  once, the module and the batch diafilter pass it); solutionDiffusion on
  salts still refuses.  Witness `membrane22_two_stage_nf_array_dspmde`, the
  first MIXED-salt DSPM-DE feed in a module -- and it found the salt
  collapse's limit: the pore conserves charge, not salts, so a salt's two
  legs differ in a mixture (membrane22's MgSO4: Mg2+ passes 0.18 mol/m3 at
  the first station, SO4 2- 3e-4, the Mg crossing with Cl-), and the
  module's salt basis carries the cation leg.  The run ANNOUNCES each salt
  whose legs differ; the stream table's anions are not the pore's.  Mapping
  the ion permeate back onto the salt components (or marching the module
  in ions) is a model decision, NOT taken.
- NanoFiltran's data-fitting mode (Nelder-Mead on X, r_p, δ, ε_p) and its
  refined meshes (`EPSX` 1.05 was run once, before the matching, ND 26 to
  204: it converges; nothing of it is pinned).
- The paper's own figures.
- ~~Replacing any default (`hindrance legacy`, the B_s wall closure,
  `wallDavies`) -- Vitor's.~~  Vitor took it on 2026-10-24 (DEV.md 4c
  C141): the hindrance in §10.1, the pore and the wall closure in §10.2;
  `wallDavies` stays the default.

## 10. The defaults corrected (2026-10-24, DEV.md 4c C141)

*Vitor, on §9.5's findings: "Avanca com tudo e Corrige o K_d e mostra-me as
linhas que mudam".  Each change is its own commit, so the golden rows each
one moves can be attributed to it; the rows are LISTED and shown to him
before any `--record`.*

### 10.1 K_d no longer counts the steric partition twice

The default hindrance (`legacy`) took the Dechadilok-Deen polynomial H as
K_d; H is Phi K_d, and Phi is carried separately in the partition, so the
diffusive flux carried Phi twice (K_d too small by (1 - lambda)^2: x0.163
for Na+, x0.200 for Cl-, x0.136 for SO4 2-, x0.098 for Ca2+ and x0.082 for
Mg2+ in membrane10's 0.6 nm pore, from the case's own ion radii -- so the
corrected K_d is 5 to 12 times the old one; K_c moves 4.7-7.4 % down).  The one pair is now `DechadilokDeen2006`
(K_d = H/Phi, their rational K_c), announced on every DSPM-DE run as the
default when undeclared; `hindrance legacy;` REFUSES by name with that
reason, and the Bowen-Welfoot centreline K_c went with it (no centreline
K_d was put in its place -- none is citable from a primary in this tree).

MEASURED with the closed form still the default pore, and it is the
finding that decides §10.2: **with the honest K_d the closed form stops
being a model.**  Its transmission K_c/(K_c + (1 - K_c e^{-Pe}) R) has a
denominator that shrinks when K_c > 1 and Pe is small, and a K_d 5 to 12
times larger makes Pe 5 to 12 times smaller: membrane10's NaCl
unit and membrane20's NaCl closed-form unit exhaust the solute from the
bulk and the module's solute-balance refusal stops the run (exit 2);
membrane11's Born-off NaCl reports R_obs = -121.5 %; MgSO4 drops from
99.92 % to 58.5 % and CaCl2 from 70.5 % to 52.5 %.  The solved pore, on
the same K_d, moves membrane20's NaCl from 75.09 % to 30.80 % and leaves
MgSO4 at 99.98 %.

### 10.2 The pore SOLVED by default, the wall closed with its own permeate

The default became `poreSolver { method finiteDifference; nodes 101;
wallClosure porePermeate; }`, every default announced in the run
("(the default)"; a declared word still says "(declared)", so
nanofiltran01, which declares all of them, prints what it printed).
`method closedForm;` stays, DECLARED, announced as not solving the pore;
its wall is the B_s closure (it has no permeate of its own).

**Measured BEFORE it was taken -- and it failed.**  As C138 left it, the
`porePermeate` path refused on all three spiral-wound DSPM-DE cases at the
first station:

| case | refusal | cause |
|---|---|---|
| membrane10 | `DSPM-DE wall: a permeate concentration reached zero` | the wall Newton's unknowns were EVERY ion of the flowsheet, and a unit fed NaCl alone carries the zero Ca2+/Mg2+/SO4 2- of the other salt components: ln c_p of an absent ion is -inf at the first evaluation |
| membrane11 | `pore ENP solver: the pore needs at least one cation and one anion` | the uncoupled film computes a wall below zero for a trial permeate (it does not hide it, Polarisation.cpp) and the trial was handed to the pore, which refused it as a one-sign pore -- a fatal error, not a trial to back away from |
| membrane20 | as membrane10 | as membrane10 |

nanofiltran01 had never met either: every ion of every op is fed, and its
walls stay positive.  Both are fixed in the path itself: the unknowns are
the FED ions (an absent ion is not a term, as the pore already treated it),
and a trial wall with a fed ion at or below zero is an `InfeasibleTrial`.

**Then the cost.**  With the two fixes every case converged, at 113 s
(membrane10), 121 s (membrane11) and 62 s (membrane20) against 0.12 s,
0.03 s and 1.8 s before: each of the ~40 passes of the water-flux fixed
point re-started the wall Newton from the B_s closure.  Two aids, both
the same equations: the wall Newton warm-starts from this station's
previous pass and from the previous station (results identical to the last
bit), and the solved pore's water-flux closure takes a safeguarded secant
on h(J) = J - A_w (dP - dpi(J)) -- bracketed by (0, A_w dP], a step that
leaves the bracket falls back to the damped one -- instead of the fixed
point (results within 3e-12 relative, the last printed digit).  The closed
form keeps the fixed point.  nanofiltran01, which imposes J_v and so has no
water-flux loop, moves by at most 1.3e-11 relative (the warm start: its wall
Newton stops at 1e-12 on ln c_p) and passes every anchor.

| case | closed form, legacy K_d (before C141) | default after C141 |
|---|---:|---:|
| membrane10 (3 units, 50 stations) | 0.12 s | 10.9 s |
| membrane11 (2 units, 50 stations) | 0.03 s | 8.2 s |
| membrane20 (3 units, 20 stations; was 4) | 1.8 s | 3.0 s |
| nanofiltran01 (declares everything) | 9.2 s | 9.2 s |

Every solve: `||F||` <= 1e-12, zero current and electroneutrality at
machine level; continuation in J_v only at the first station of an MgSO4
unit (5 solves), as before.  Beyond the corpus, membrane11's two units at
3/10/20/40 bar x 5/50/500 mM NaCl: 12 of 12 converge (5.5-22.5 s, at most
13 continuation solves); at 3 bar and 500 mM the osmotic pressure exceeds
the applied one and there is no flux.

**The closed form with the honest K_d** (§10.1) cannot run membrane20's
NaCl unit on the charged record, so the unit was removed from the witness
and the refusal pinned (check_pore_solver arm (c3)); on the uncharged
variant it departs from the ambipolar limit by 76 % (arm (c2), 70.6 % with
the legacy K_d), the solved pore by 3.9e-8.

**Headline rejections** (R_obs, the salt basis -- a single-salt feed's
cation and anion are rejected alike by electroneutrality):

| case | unit | before C141 | closed form + corrected K_d | after C141 (default) |
|---|---|---:|---:|---:|
| membrane10 | NaCl | 54.95 % | refused (bulk exhausted) | 49.56 % |
| | CaCl2 | 70.46 % | 52.54 % | 69.65 % |
| | MgSO4 | 99.924 % | 58.47 % | 99.975 % |
| membrane11 | Born on | 86.10 % | 23.92 % | 30.09 % |
| | Born off | 65.95 % | -121.5 % | 9.39 % |
| membrane20 | NaCl, solved pore | 75.09 % | 30.80 % (B_s wall) | 49.73 % |
| | MgSO4, solved pore | 99.980 % | 99.98 % (B_s wall) | 99.975 % |
| | MgSO4, closed form | 99.924 % | 58.49 % | 58.49 % |
| | NaCl, closed form | 56.97 % | refused | removed |

The NF ordering MgSO4 > CaCl2 > NaCl (membrane10) and Born on > off
(membrane11) both hold.  membrane11's Born-off row is no longer negative
(§5's -2.46 % was the solved pore against the B_s wall): with the wall
closed with the pore's own permeate it is +9.39 %.

## 11. A better solver (2026-10-24, DEV.md 4c C142)

*Vítor, on the C141 timings: "Eu quero que faças um solver melhor! E deixes o
nanofiltran resultados só para comparares!"  NanoFiltran stays the REFERENCE;
the solver must be as accurate, more robust and faster.  Every number below
was measured on this branch against a build of its parent (e8afeef7e) and
against NanoFiltran rebuilt by `regenerate.py`'s own `build()` (gfortran
13.3, `-O2`), on one machine, wall clock including process start.*

### 11.1 What the C141 solver spent its time on

Per station of a spiral-wound module the C141 path ran a safeguarded secant
on the water flux; each secant pass ran a Newton on the wall (one unknown per
fed ion, a DENSE finite-difference Jacobian, so 2 Na + 1 pore solves per
iteration plus the line search); each of those ran the pore's Newton, whose
Jacobian was a colored finite difference (3 colours x (2 Ni + 2) slots x 2
residual evaluations per Newton iteration).  Measured in the old pore
summaries: membrane10's NaCl unit made **3 933 pore solves for 51 stations**
(CaCl2 4 540, MgSO4 3 265; membrane11 4 795 and 3 683).

### 11.2 What was built

- **An analytic Jacobian.**  Every row of the pore residual (§2) has
  closed-form derivatives: the Scharfetter-Gummel terms through the
  Bernoulli function, `B'(x) = B(x)(1 - x - B(x))/x` (the identity
  `B(-x) = B(x) + x`), with the series `-1/2 + x/6 - x^3/180 + x^5/5040` below
  |x| = 1e-2 where the bracket cancels; every row's NORMALISATION is
  differentiated too (`d(r/s) = (dr - (r/s) ds)/s`), because a Jacobian of a
  differently normalised function would make the line search compare norms of
  two functions.  It is assembled straight into the three bands and handed to
  `solver::newtonND` through the new `BlockTri::jacobian`.  The colored
  finite differences of C138 stay, as the ORACLE: `PoreSettings::
  finiteDifferenceJacobian` restores them, and the audit compares the two.
- **One Newton per station.**  The wall concentration that feeds the feed
  partition is the film's interface balance (Geraldes & Afonso 2007) AT A
  GIVEN FIELD -- `C_m = (k* C_b - J_v C_p)/(k* - J_v + z D xi')`, or with
  the solution-diffusion closure `C_m = k* C_b/(k* - J_v + z D xi' + J_v
  B/(J_v + B))` -- evaluated with its derivatives by `membrane::
  wallAtField` (`massTransfer/InterfaceBalance.cpp`; the kernel and it share
  `detail::wallAt`, so the wall keeps ONE home); electroneutrality at a
  coupled wall is one row; the water flux `J_v = A_w (dP - RT (sum C_m -
  sum c_p))` is one row; `bulkOverPoreDavies`' four face coefficients are
  evaluated on the answer's own ionic strengths (with `d ln gamma/dI`).  All of
  them read only node 0's unknowns, so they fit the block-tridiagonal shape
  as they stand -- two more slots per node, J_v and xi', held equal node to
  node exactly like the permeate copies of §2 (the J_v copy is read by every
  flux row; xi' only at node 0, its slot idle elsewhere because the blocks
  share one size).  Block size `2 Ni + 4`.
- **The robust fallback, kept**: continuation from the exact no-flux state,
  now in the DRIVE -- the imposed J_v, or dP under the closure -- raised
  geometrically, counted and announced.  And one case it had never met: when
  the osmotic pressure at vanishing flux (the pore in Donnan equilibrium with
  both baths, `RT sum (c_b - feedSide c_b / permSide)`, exact) is not below
  dP there is no positive root; the closure's only root is a negative flux.
  The station then has J_w = 0, said once per unit (membrane11 at 3 bar and
  500 mM: before, the damped fixed point crawled to J_w = 7e-25 and
  published R_obs 0.267 of it).
- **The audit on an 11-node copy** of the first station: the off-band
  maximum and the analytic-against-FD departure are properties of the code,
  not of the grid, and the dense audit at 201 nodes of a four-ion pore (46 MB,
  4 800 residual evaluations) cost more than the solve; above 4 096 unknowns
  C141 skipped it.  Now it is never skipped.
- **An allocation-free substitution** (`solver::luSolveInto`) inside the
  shared block-Thomas: the same operations in the same order (bit-identical
  results, measured on every membrane case's JSON), one third of the run
  time removed (callgrind: malloc was 40 %).
- **`method closedForm;` RETIRED**, refused by name with its reason (§10.1).
  membrane20 rebuilt: the same NaCl and MgSO4 feeds, the pore solved, the
  wall closed with the pore's own permeate against the solution-diffusion
  B_s -- NaCl R_obs 49.73 % against 30.80 % (the B_s wall over-polarises,
  Gamma 2.79 against 2.07), MgSO4 equal to 1e-6.

**Where this departs from the brief, and why.**  The brief asked for the wall
unknowns in "a bordered block-Thomas / Schur complement".  None is needed:
the copies of §2 already carry global unknowns through a block-tridiagonal
structure, and the wall and the water flux are such unknowns.  The block
grows from `2 Ni + 2` to `2 Ni + 4`; the solve stays the shared block-Thomas
(one home, no new linear algebra).

### 11.3 The grid -- measured, and the brief's premise did not hold

The brief asked for a grid graded toward both faces "(where the Donnan/Born
layers and thin permeate-face layers live)".  It was built
(`poreSolver { grading <beta>; }`, a tanh map, PoreNernstPlanck.H "THE
GRID") and measured.  It keeps the order (1.99-2.00 on the ambipolar limit)
and, from beta 1.5 up, it is WORSE on every problem measured, at the same
node count (beta 1 is within 10 % of uniform either way: slightly better on
two high-Peclet probe problems, worse on the rest):

| problem | uniform, 101 nodes | beta 1.5 | beta 3 |
|---|---:|---:|---:|
| ambipolar limit, Pe 0.44 / 4.4 (rel. error of c_p) | 5.4e-7 / 1.19e-6 | 7.9e-7 / 1.27e-6 | 2.3e-6 / 3.6e-6 |
| stiff pore, X_d -5 / -50 / -200 mol/m3, J_v 4e-4 | 8.6e-7 / 1.2e-9 / 1.9e-11 | 1.4e-6 / 1.9e-9 / 3.1e-11 | 4.1e-6 / 5.8e-9 / 9.3e-11 |
| membrane10, worst published R_obs / composition | 1.3e-8 | 2.1e-8 | 6.2e-8 |
| membrane11 | 1.4e-7 | 2.1e-7 | 6.3e-7 |
| NanoFiltran's example, J_v 5e-5 (trace Na+) | 1.10e-3 | 2.62e-3 | 8.38e-3 |

(reference: Richardson from 1601/3201 uniform nodes, or the analytic limit;
the face-graded error at beta 1.5-3 is 1.1 to 8 times the uniform one.)  The reason was
found by looking at the hardest row's profile (a scratch dump of NanoFiltran's
example at J_v = 5e-5, 401 nodes): the steepest curvature of ln c_Na and of
psi is at **xi = 0.39, in the interior** -- the front where the trace Na+
hands the fixed charge over to Mg2+, ln c_Na falling two decades -- not at a
face, where the Donnan and Born jumps are interfacial (they are partitions,
not layers, in this model).  Clustering toward the faces takes cells from
exactly where they are needed.  So the stated default stays **uniform, 101
nodes**: its grid error on the corpus is 1e-8 (membrane10) to 1.4e-7
(membrane11), well below the goldens' 1e-4; at 41 nodes it would still be
8.6e-7.  The case to know is an interior ion-exchange front, which needs some
400 nodes for 1e-4 (NanoFiltran's example: 101 -> 1.1e-3, 201 -> 2.7e-4,
401 -> 6.9e-5, 801 -> 1.7e-5); nanofiltran01 declares 801.  The `grading`
key stays a declared choice (0..6, announced), for a student to see the
measurement for themselves and for a future SDEM march (§6), whose thin
PERMEATE-face layer is the case a face-graded grid serves.  What would
serve an interior front is a solution-adaptive grid (equidistributing the
arc length of ln c and psi) -- not built: it makes the grid depend on the
answer.  *(Built on 2026-10-24, §12 -- and the arc length was measured to be
the wrong monitor, and the right one a margin and not a cure: that front is
not narrow.)*

### 11.4 Verification (bin/curate/check_pore_solver.py, rebuilt)

New arms: JACOBIAN -- the analytic Jacobian against a Richardson-combined
central difference on 50 random states of five problems (the fixed-face pore,
the stiff pore, three stations with the wall and the water flux folded in),
on the uniform and the graded grid: worst 4.5e-8 of a row (on the stiff pore,
the oracle's own floor; ~1e-11 elsewhere), exactly 0 off the bands.  A plain
central difference was not good enough as an oracle: its own error reached
1.6e-6 there.  STATION -- the three stations' answers recomputed in Python
from the film's interface balance, the closure and the wall
electroneutrality (3.3e-16), and the finite-difference Newton reaching the
same answer (5.7e-15).  GRADED -- the order on the graded grid.  Four
sabotages on the C142 code, all caught; the instructive one drops the wall's
dC_m/dJ_v from the Jacobian, and only the JACOBIAN arm sees it: the Newton
still converges, more slowly, to the same answer.  The gate's docstring has
the observed output.

### 11.5 The comparison

**The NanoFiltran matrix** (§9.3), each problem solved cold and alone.
NanoFiltran: its matrix's settings (uniform mesh, URF 0.1, TOL 1e-9, ITMAX
4000); its "residual" is its own sum of normalised absolute residuals, not
comparable digit for digit with Choupo's ||F||_2 of the normalised rows.
Choupo at the case's 801 nodes, before (C141, e8afeef7e) and after; the
anchor column is the worst |c_p / NanoFiltran's extrapolation - 1| of the
op's ions at 801 nodes -- identical before and after (the same grid).

| op | J_v [m/s] | NF ND 102: s / it | NF ND 204: s / it / residual | Choupo before (801) | Choupo after (801): s / it / ‖F‖ | after (101) s | anchor (801) |
|---|---:|---:|---:|---:|---:|---:|---:|
| example_ideal | 1e-6 | 0.61 / 251 | 32.0 / 1897 / 1.0e-9 | 0.34 | 0.066 / 7 / 6e-14 | 0.016 | 2.6e-8 |
| example_ideal | 5e-6 | 0.47 / 246 | 3.71 / 246 / 9.2e-10 | 0.27 | 0.049 / 6 / 1e-14 | 0.012 | 6.8e-8 |
| example_ideal | 1e-5 | 0.38 / 248 | 2.76 / 250 / 9.3e-10 | 0.33 | 0.058 / 6 / 1e-14 | 0.012 | 6.7e-8 |
| example_ideal | 2e-5 | 0.44 / 251 | 3.23 / 257 / 9.4e-10 | 0.37 | 0.064 / 7 / 1e-14 | 0.015 | 1.1e-6 |
| example_ideal | 5e-5 | 0.49 / 279 | 3.73 / 286 / 9.6e-10 | 0.54 | 0.206 / 24 / 1e-14 | 0.019 | 1.7e-5 |
| example_noBorn | 5e-5 | 0.37 / 236 | 2.98 / 243 / 9.3e-10 | 0.22 | 0.053 / 5 / 8e-15 | 0.012 | 5.3e-7 |
| example_davies | 5e-5 | 0.34 / 238 | 2.88 / 244 / 9.7e-10 | 0.94 | 0.054 / 5 / 8e-15 | 0.013 | 2.9e-7 |
| NaCl_ideal | 1e-5 | 0.16 / 264 | 14.4 / **4001** / 4.8e-9 | 0.13 | 0.025 / 4 / 1.6e-13 | 0.009 | 9.3e-8 |
| NaCl_ideal | 5e-5 | 0.16 / 287 | 15.1 / **4001** / 2.4e-9 | 0.06 | 0.031 / 6 / 7e-15 | 0.009 | 1.1e-7 |
| Na2SO4_ideal | 1e-5 | 2.97 / **4001** | 20.3 / **4001** / 7.1e-8 | 0.27 | 0.043 / 9 / 1e-14 | 0.008 | 1.8e-7 |
| Na2SO4_ideal | 5e-5 | 2.43 / **4001** | 15.6 / **4001** / 2.8e-8 | 0.39 | 0.054 / 9 / 9e-15 | 0.019 | 1.8e-7 |
| mixed_polarised | 1e-5 | 0.52 / 311 | 2.68 / 311 / 9.7e-10 | 2.31 | 0.083 / 9 / 8e-15 | 0.015 | 7.9e-7 |
| mixed_polarised | 3e-5 | 0.34 / 279 | 2.79 / 279 / 9.8e-10 | 2.48 | 0.071 / 10 / 7e-15 | 0.014 | 4.2e-7 |

**4001** = ITMAX: NanoFiltran stopped short of its tolerance.  Choupo's
iterations are the station's whole Newton (4 to 24; no problem needed the
continuation at 801 nodes; at 101 nodes Na2SO4 at 5e-5 did, 5 solves).  Of
Choupo's wall time about 10 ms is the process start; NanoFiltran's per-run
times include its own I/O.  At its finer grid NanoFiltran took 2.7-32 s and
236-4001 iterations per problem; Choupo after takes 0.03-0.21 s at 801 nodes,
four times NanoFiltran's grid, and the anchors (NanoFiltran's grid limit)
are met within the bands of §9.4 (`check_nanofiltran_reference`: agreement
of the two extrapolations within 7.9e-7 on all 35 rows, unchanged).

**The corpus cases** (whole runs; per unit: station solves / Newton
iterations in all / the worst ||F|| of a station):

| case | Choupo before (C141) | Choupo after | per unit after |
|---|---:|---:|---|
| membrane10 (3 units, 51 stations) | 10.9 s; 3 933 / 4 540 / 3 265 pore solves, ‖F‖ <= 1e-12 | **0.27 s** | 51 / 156 / 2.9e-15; 51 / 156 / 3.6e-15; 51 / 194 / 1.4e-14 (MgSO4: 5 continuation solves at the first station, as before) |
| membrane11 (2 units) | 8.2 s; 4 795 / 3 683 pore solves | **0.16 s** | 51 / 154 / 8.4e-15; 51 / 155 / 2.7e-15 |
| membrane20 | 2.4 s (3 units, one the closed form) | **0.20 s** (4 units) | 21 / 66 / 2.4e-15; 21 / 65 / 2.5e-15; 21 / 104 / 1.4e-14 (x2) |
| nanofiltran01 (13 points, 801 nodes) | 8.5 s | **0.57 s** | -- |
| membrane11 at 3/10/20/40 bar x 5/50/500 mM | 5.1-21.1 s per point, 2-13 continuation solves on 4 points | **0.03-0.21 s**, no continuation | identical answers to every printed digit on 11 of 12; the 12th has no flux (11.2) |

Agreement: on the same grid the answers are the C141 answers -- every one of
membrane10's 1 835 published numbers (profiles included), membrane11's 795
and nanofiltran01's 70, to the last printed digit, except round-off closures
and `pore_stiffness_max`, which C141 took as a maximum over every pore the
nested solver evaluated on its way and is now over the accepted answers (it
is pinned by no golden).

### 11.6 Still NOT done

- A solution-adaptive grid for an interior front (11.3).  *Built and
  measured in §12 (C144): an option, not the default.*
- SDEM's march onto this solver (§6) -- its thin permeate-face layer is where
  `grading` would earn its keep; not measured here.
- The first station of a highly rejected salt (MgSO4 99.98 %) still needs
  the continuation (5 solves): the cold seed is an unrejected permeate.  A
  better seed would remove it; it costs ~40 iterations once per unit.
- The block-Thomas is now 45 % of a run; a flat-storage factorisation would
  halve it, but `BlockBands`' layout is shared with the MESH column and the
  stiff integrator, so it was not touched.
- The batch diafilter under the solved pore (it runs; no witness).
- `NF270_dspmde.dat` still says its `permeabilities` are "unused by DSPM-DE";
  true under the default, not under `wallClosure solutionDiffusion`.  A
  record edit was not made from a solver slice.

## 12. A solution-adaptive grid (2026-10-24, DEV.md 4c C144)

*Vítor: "Faz a malha adaptativa, porque eu preciso de enviar o link para um
cientista que me pediu."  The premise, from §11.3: the hardest profile's
steep region is an INTERIOR ion-exchange front at xi ~ 0.39, so a grid
graded toward the faces takes cells from where they are needed and a grid
adapted to the solved profile should put them there.  Built
(`poreSolver { grid adaptive; }`), measured, and kept a DECLARED OPTION: it
is never worse than uniform by more than a few per cent, better by 1.0x to
3.3x, and nowhere near the factor that would let it replace a finer grid.
Every number below was measured on this branch, one machine, wall clock
including the process start; "error" is the worst relative error of a
published number (the permeate composition and flow, every KPI but the pore
diagnostics and the round-off closures; the bench's per-ion wall and
permeate concentrations) against a Richardson extrapolation of the same case
on 1601 and 3201 uniform nodes.*

### 12.1 What was built

- **The loop** (de Boor's): solve; compute the monitor of the answer;
  place the nodes so that each cell holds an equal share of the integral of
  the monitor (the inverse of its piecewise-linear cumulative integral -- the
  nodes are strictly increasing because the monitor is positive); carry the
  state onto the new grid (ln c and psi interpolated linearly, the copies of
  the global unknowns kept node for node); solve again, warm-started; stop
  when no node would move by more than `gridTolerance` of its own cell
  (default 0.1) or after `gridPasses` re-solves (default 8).  A re-solve that
  fails is abandoned, the last converged answer stands, and the run says so.
  The Newton, the Jacobian and the block-Thomas are untouched: the
  Scharfetter-Gummel flux was always written per cell with its own h_k, and
  the analytic Jacobian differentiates it with that h_k -- the JACOBIAN arm
  had already held it on the graded grid (§11.4).
- **The grid is carried.**  A warm start (the next station of a module, the
  next J_v of the bench) starts on the previous answer's own grid and
  re-adapts only when the monitor moves; on a fixed grid a warm state is
  carried onto the declared grid (the identity when the two are the same).
- **The declaration**: `grid uniform | graded | adaptive;` beside `nodes`,
  `gridTolerance` and `gridPasses` read only by `adaptive`.  `grading` alone
  keeps C142's meaning (graded).  A contradiction refuses by name: `grading`
  with `grid uniform` or `grid adaptive`, `grid graded` with no grading,
  `gridTolerance`/`gridPasses` on a fixed grid, a tolerance outside (0, 1],
  a pass count outside 1..100.  The run announces the grid and its defaults,
  the first station's re-solves, whether it settled, its smallest cell; the
  module's pore summary counts the re-solves and the stations whose grid did
  not settle (an unsettled station is also an advisory).

### 12.2 The monitor -- the brief's was measured first, and it was the wrong one

The brief proposed the arc length of the profile, M = sqrt(1 + alpha
sum (d ln c_i/dxi)^2 + beta (dpsi/dxi)^2).  Built with alpha = 1/the mean
of the squared slope and four smoothing passes, it made NanoFiltran's
example at J_v = 5e-5 WORSE than uniform at every node count (101 nodes:
1.26e-3 against 1.10e-3; the probe's copy of that pore 1.27e-3 against
1.10e-3).  The reason is in the profile itself (a scratch dump, 101 nodes):
ln c_Na falls 4.6 across xi = 0.3..1 at a slope that is nearly CONSTANT
there, psi ramps almost linearly, so the arc length is largest where the
profile is straight -- and a straight profile is the one the fitted flux
solves exactly.  The local truncation error, measured directly (the 3201-node
answer sampled on the 101-node grid and put into the 101-node flux rows),
is largest at xi = 0.39 for EVERY ion, at 1.5e-4 of J_v c_p (Na, Cl) and
3.0e-4 (Mg), and falls only five- to ten-fold toward the faces: it follows
the CURVATURE of psi, which is what the Scharfetter-Gummel flux leaves out
(it is exact for a linear potential on any cell).

So the monitor is built on psi'': on cell k the error is O(h_k^2 |psi''|),
the error of a published permeate is their sum, and the node distribution
that minimises sum h_k^2 D_k for a fixed node count has h_k ~ D_k^(-1/3).
The monitor is therefore M = |psi''|^(1/3) + mean(|psi''|^(1/3)) -- the
mean a floor that keeps at least half the nodes uniformly spread (Beckett &
Mackenzie, Appl. Numer. Math. 35 (2000) 87), where psi'' is not the only
source of error (the concentration's own curvature under convection) --
smoothed by two passes of a (1/4, 1/2, 1/4) filter.  Four families were
measured on the probe's problems (a scratch study driving the solver's own
API): the arc length (above); the gradient of psi; the curvature of the
whole (ln c, psi) vector, with and without a Peclet weight
J_v c_p/(P c); and the curvature of psi alone at exponents 1/3 and 1/2 and
floors 1, 0.3, 0.1 and 0 times the mean.  The more aggressive D^(1/2) with a
floor of 0.1 x the mean took the interior front to 0.59x the uniform error
(the best seen) -- and the ambipolar limit at Pe 4.4 to 2.4x WORSE, and the
high-Peclet stiff pore to 2.3x worse.  D^(1/3) with the mean as floor is the
only one measured never worse than uniform by more than a few per cent.

### 12.3 The measurement

**The probe's problems** (fixed faces, coefficients in
`_poreSolverProbe.cpp`; the interior front is NanoFiltran's example at
J_v = 5e-5 with no polarisation, the coefficients its DSPM-DE run hands the
pore; reference Richardson on 3200/6400 intervals, or the closed form):

| problem | uniform 50 / 100 / 200 | adaptive 50 / 100 / 200 |
|---|---:|---:|
| interior front, J_v 5e-5 | 4.39e-3 / 1.10e-3 / 2.75e-4 | 3.35e-3 / 8.34e-4 / 2.08e-4 (0.76x) |
| interior front, J_v 2e-5 | 3.08e-4 / 7.70e-5 / 1.92e-5 | 2.77e-4 / 6.92e-5 / 1.73e-5 (0.90x) |
| ambipolar limit, Pe 0.44 (100) | 5.42e-7 | 5.03e-7 (0.93x) |
| ambipolar limit, Pe 4.4 (100) | 1.19e-6 | 9.62e-7 (0.81x) |
| ambipolar limit, Pe 440 | round-off | round-off (the fitted flux is exact on any cell) |
| stiff pore X_d -5 / -50 / -200, J_v 4e-4 (100) | 8.61e-7 / 1.19e-9 / 1.93e-11 | 8.53e-7 / 1.20e-9 / 1.94e-11 (0.99-1.01x) |
| stiff pore X_d -200, J_v 4e-3 (100) | 1.50e-11 | 9.96e-12 (0.67x) |

(the stiff rows from the scratch study, whose loop ran at a tolerance of
0.05 against the engine's 0.1; the others from the gate's own probe.)

**The corpus cases and NanoFiltran's matrix**, whole runs, error / wall
time (best of three) / re-solves on a moved grid in all:

| case | uniform 101 | uniform 801 | adaptive 101 | adaptive 201 |
|---|---:|---:|---:|---:|
| nanofiltran01 (13 points) | 1.10e-3 / 0.062 s | 1.72e-5 / 0.49 s | 8.34e-4 / 0.10 s / 6 | 2.08e-4 / 0.17 s / 6 |
| membrane10 (3 units, 51 stations) | 1.28e-8 / 0.31 s | 2.0e-10 / 1.59 s | 1.28e-8 / 0.25 s / 5 | 3.19e-9 / 0.51 s / 9 |
| membrane11 (2 units) | 1.38e-7 / 0.15 s | 2.2e-9 / 1.19 s | 1.34e-7 / 0.13 s / 4 | 3.35e-8 / 0.29 s / 6 |
| membrane20 (4 units) | 5.58e-8 / 0.19 s | 8.7e-10 / 1.10 s | 5.57e-8 / 0.20 s / 8 | 1.39e-8 / 0.34 s / 15 |

The adaptive module costs what the uniform one costs: the grid adapts at the
first station (one to three re-solves) and is carried; on membrane10 51
stations took 5 re-solves in all (0.25 s against 0.31 s -- within noise, a
re-solve on a carried grid is a warm Newton of two or three iterations).
On the corpus the error does not move, because the corpus pores have little
curvature to adapt to.

**nanofiltran01 point by point** (the worst ion of each point):

| op | J_v | uniform 101 | adaptive 101 | uniform 801 | adaptive 801 | uniform 3201 |
|---|---:|---:|---:|---:|---:|---:|
| example_ideal | 1e-6 | 3.1e-7 | 3.0e-7 | 4.8e-9 | 4.8e-9 | 3.0e-10 |
| example_ideal | 5e-6 | 3.3e-6 | 3.1e-6 | 5.2e-8 | 4.9e-8 | 3.2e-9 |
| example_ideal | 1e-5 | 1.3e-6 | 1.1e-6 | 2.0e-8 | 1.7e-8 | 1.2e-9 |
| example_ideal | 2e-5 | 7.7e-5 | 6.9e-5 | 1.2e-6 | 1.1e-6 | 7.5e-8 |
| example_ideal | 5e-5 | 1.1e-3 | 8.3e-4 | 1.7e-5 | 1.3e-5 | 1.1e-6 |
| example_noBorn | 5e-5 | 3.5e-5 | 1.1e-5 | 5.6e-7 | 1.7e-7 | 3.5e-8 |
| example_davies | 5e-5 | 2.0e-5 | 6.1e-6 | 3.1e-7 | 9.5e-8 | 1.9e-8 |
| NaCl_ideal | 1e-5 | 2.8e-9 | 2.8e-9 | 4.4e-11 | 4.0e-11 | 2.1e-12 |
| NaCl_ideal | 5e-5 | 1.8e-8 | 1.8e-8 | 2.8e-10 | 2.8e-10 | 1.8e-11 |
| Na2SO4_ideal | 1e-5 | 1.3e-9 | 1.3e-9 | 2.0e-11 | 2.0e-11 | 2.0e-12 |
| Na2SO4_ideal | 5e-5 | 4.2e-9 | 4.4e-9 | 6.0e-11 | 6.0e-11 | 2.9e-12 |
| mixed_polarised | 1e-5 | 4.8e-8 | 4.8e-8 | 7.4e-10 | 7.4e-10 | 4.7e-11 |
| mixed_polarised | 3e-5 | 4.5e-7 | 4.4e-7 | 7.0e-9 | 6.9e-9 | 4.4e-10 |

(the 3201-node column is the reference's own fine grid against the
extrapolation: an upper bound on how far the reference itself is from its
grid limit, a quarter of it.)

**membrane11 off the corpus** (C142's sweep: feed pressure x NaCl, the
permeate at 1 bar), error / wall time:

| P [bar] | NaCl [mM] | uniform 101 | adaptive 101 | uniform 801 |
|---:|---:|---:|---:|---:|
| 3 | 5 / 50 / 500 | 9.0e-10 / 2.6e-9 / (no flux) | 9.0e-10 / 2.6e-9 / (no flux) | 1.4e-11 / 4.0e-11 / (no flux) |
| 10 | 5 / 50 / 500 | 2.6e-8 / 1.4e-7 / 2.5e-9 | 2.6e-8 / 1.3e-7 / 2.4e-9 | 4.2e-10 / 2.2e-9 / 4.0e-11 |
| 20 | 5 / 50 / 500 | 1.2e-7 / 7.2e-7 / 4.9e-8 | 1.2e-7 / 6.2e-7 / 4.9e-8 | 1.9e-9 / 1.1e-8 / 7.7e-10 |
| 40 | 5 / 50 / 500 | 1.4e-6 / 4.8e-5 / 5.7e-7 | 1.4e-6 / 2.8e-5 / 5.6e-7 | 2.3e-8 / 7.4e-7 / 8.9e-9 |

every point 0.10-0.25 s on either grid at 101 nodes, 0.9-1.6 s at 801.

### 12.4 The decision: an option, not the default -- and why

The brief's rule was to make the adaptive grid the default if it beat the
uniform one at the same node count by a clear margin everywhere, with the
node count chosen so that every row's grid error is at most 1e-6.  Neither
half holds.  The margin is 1.0x on the corpus cases and the sweep, 1.1-1.3x
on the hardest row and 3.2-3.3x on the two Born/Davies variants at
J_v = 5e-5; a few rows are a few per cent worse (Na2SO4 at 5e-5: 4.4e-9
against 4.2e-9).  And no node count makes the adaptive grid meet 1e-6 on
the hardest row where the uniform one does not: at the observed order 2 and
0.76x the uniform constant, 1e-6 on NanoFiltran's example at 5e-5 needs some
2 900 adaptive nodes against some 3 300 uniform ones.

The reason is the shape of that front, measured above: the curvature of psi
-- the only error the fitted flux makes -- is spread over a third of the
pore, peaking only some ten-fold above its value at the faces.  An
equidistributing grid gains in proportion to how CONCENTRATED its monitor
is, and here the bound can be computed rather than argued: with the local
truncation error D_k measured on the uniform 101-node grid (the 3201-node
answer put into its flux rows), the best that ANY grid of the same node
count can do for sum h_k^2 D_k is (mean D^(1/3))^3 / mean D times the
uniform error -- **0.764, for every ion**.  The adaptive grid measures
0.76: it is at the bound of what moving these nodes can buy.  A
solution-adaptive grid earns its keep on a NARROW layer (a high-Peclet face
layer, a shock), where that ratio is small; this pore has none.  "Interior front" in §11.3 was the right
word for where the curvature peaks and the wrong picture of how narrow it is.

So the default stays uniform, 101 nodes (C142's measured choice, no golden
moved), and `grid adaptive;` is a declared option -- for a case that does
have a narrow layer, and for a student to see the measurement.

**What would meet 1e-6 everywhere, measured and NOT built.**  The uniform
grid's error is cleanly second order on every problem (observed order 2.00
from 50 to 400 intervals), so a Richardson extrapolation of the PUBLISHED
permeate from N and 2N intervals is fourth order: on the probe's interior
front at J_v = 5e-5 it is 1.25e-6 from 50/100 and 7.9e-8 from 100/200
intervals (against 1.1e-3 for 100 uniform nodes alone); at J_v = 2e-5 6.2e-8
and 3.9e-9; on the ambipolar limit and the stiff pores 1e-11 to round-off.
Its cost is a second solve on the doubled grid per station (about 2x); its
price is a design question, not a numerical one: the published permeate
would then be an extrapolation, not the solution of any discrete problem the
run also publishes (the profile, the wall, the water flux of the module's
own balances), and that is Vítor's to decide.  Until then, a case that needs
1e-6 on such a front declares the nodes it needs (3201 nodes: nanofiltran01's
hardest row at 1.1e-6 in 3.2 s for the whole matrix).

### 12.5 Verification (bin/curate/check_pore_solver.py, extended)

New probe arm ADAPTIVE: the interior front at 50/100/200 intervals against
the 3200/6400 reference -- both grids converge, the adaptive grid is
strictly increasing from 0 to 1, settles, ||F|| <= 1e-12, and its error is
below 0.85x the uniform grid's (measured 0.76x); a warm start from
J_v = 4.8e-5 carries its grid (no more re-solves than the cold solve) and
agrees with the cold answer to 1e-5 (measured 1.9e-7, against a grid error
of 8e-4); the ambipolar limit on the adaptive grid no worse than uniform at
Pe 0.44 and 4.4 and exact to 1e-10 at Pe 440, its cation and anion permeates
equal; an explicit grid that is not increasing and an adaptive grid with no
tolerance refuse.  New arm (f): the witness membrane20 with `grid adaptive;`
on every unit announces it four times, says the first station's re-solves,
keeps its pore summaries at machine level with no station unsettled, and
agrees with the uniform witness to 1e-6 (measured 6.8e-11).  Arm (e) gains
six refusals.  Sabotages, by hand, each restored before the next:

- A1 -- the monitor on the SLOPE of psi instead of its curvature: caught by
  ADAPTIVE (the adaptive error 1.15x the uniform one at every node count).
- A2 -- the equidistribution's inverse written as a product,
  `(t - W) * M` for `(t - W) / M`: caught by ADAPTIVE (not settled, node
  movement 2 to 11 cells; error equal to uniform -- the re-solve on the
  wrong grid failed and the loop kept the uniform answer, as designed).
- A3 -- the re-solve handed the OLD grid (`sg.nodes = g` dropped): caught
  by ADAPTIVE (not settled after 8 re-solves; the margin gone).  **Its first
  run found a defect in the code it attacked**: the loop left the "settled"
  flag of the last re-solve's answer, a default `true`, when it stopped on
  its pass count, so an adaptive grid that had NOT settled reported that it
  had.  The flag is decided on every pass now.
- A4 -- the refusal of `grid adaptive;` beside `grading` removed (engine
  rebuilt): caught by (e) alone.

## 13. The paper as a comparison case (2026-10-24, DEV.md 4c C145)

*Vítor, uploading Geraldes & Alves, J. Membr. Sci. 321 (2008) 172-182:
"Tens aqui o paper original para criar um caso de comparação".  The paper is
the publisher's copyright: it is not in the tree, nor are its figures; its
numbers enter as cited facts -- Table 2 transcribed
(`bin/curate/nanofiltran/regenerate_paper.py`, `PAPER_TABLE2`) and Fig. 3
digitised (`bin/curate/digitise_geraldes_alves2008.py` into
`nanofiltran03_bowen_mohammad_ca30/constant/experimental/geraldes_alves2008_fig3.csv`)
-- held by `check_source_licence` (`ACCEPTED_PAPER_FACTS`: each carrier
cites the paper and says what it carries, and no PDF or image under the
scanned roots hashes to the paper or its figures).  Two cases, one gate
(`bin/curate/check_nanofiltran_paper.py`).*

### 13.1 Table 2 is NanoFiltran as received -- and carries its Davies defect

The paper's stiff case (§4.2: Na+/Mg2+/Cl- 10/20/50 mol/m3, J_v 5e-5 m/s,
Δx_e 2.5 µm, r_p 0.40 nm, c_X −30 mol/m3, ε_p 60, 298 K, Davies, no
polarisation) IS NanoFiltran's shipped example: `shipped/INPUT.XLS` carries
exactly those values (T 298, Davies on), and the ion database it ships
supplies Na+ (0.184 nm, 1.33e-9 m2/s) and Cl- (0.121 nm, 2.03e-9) -- the
rows citing Bowen & Mohammad, the values the paper also states in §4.1 --
beside the paper's Mg2+ (0.35 nm, 0.707e-9).  The paper's numerics: URF 0.2,
TOL 1e-4.  The vendored program caps the grid at 205 nodes and Table 2 runs
N = 300 and 350, so every paper build carries a declared ARRAY_PATCH (NDX
351; measured to change no printed digit at N = 10, 50, 200).

| N | Table 2: Na+ / Mg2+ / Cl- / ΔΨ_m / it | NanoFiltran as received | Davies corrected |
|---:|---|---|---|
| 10 | 0.0367468 / 8.634545 / 17.305819 / 0.149227 / 71 | 0.0367477 / 8.634527 / 17.305785 / 0.149227 / 71 | 0.0409767 / 8.665796 / 17.372553 / 0.145327 / 71 |
| 20 | 0.0460774 / 8.605800 / 17.257671 / 0.149651 / 75 | 0.0460785 / 8.605786 / 17.257645 / 0.149650 / 75 | 0.0510887 / 8.637907 / 17.326894 / 0.145743 / 74 |
| 50 | 0.0480736 / 8.599753 / 17.247577 / 0.149740 / 79 | 0.0480748 / 8.599740 / 17.247551 / 0.149739 / 79 | 0.0532462 / 8.632026 / 17.317296 / 0.145830 / 79 |
| 100 | 0.0483219 / 8.599001 / 17.246324 / 0.149751 / 82 | 0.0483231 / 8.598988 / 17.246298 / 0.149750 / 82 | 0.0535147 / 8.631295 / 17.316103 / 0.145841 / 82 |
| 200 | 0.0483809 / 8.598822 / 17.246025 / 0.149753 / 85 | 0.0483821 / 8.598809 / 17.245999 / 0.149753 / 85 | 0.0535784 / 8.631120 / 17.315818 / 0.145844 / 85 |
| 300 | 0.0483915 / 8.598790 / 17.245971 / 0.149754 / 87 | 0.0483927 / 8.598776 / 17.245945 / 0.149753 / 87 | 0.0535899 / 8.631089 / 17.315767 / 0.145844 / 87 |
| 350 | 0.0483937 / 8.598782 / 17.245959 / 0.149754 / 88 | 0.0483949 / 8.598769 / 17.245933 / 0.149753 / 88 | 0.0535923 / 8.631082 / 17.315756 / 0.145844 / 88 |

The program as received reproduces the table: **every iteration count
exactly**, Mg2+, Cl- and the potential within 6e-6, the trace Na+ within
2.6e-5 -- the same +2.5e-5 at every N, the residue a loosely converged
(TOL 1e-4) iteration leaves when the floating point differs (a 2007 compiler
against gfortran 13; nothing else in the inputs is free).  The program with
DAVIES_PATCH does not: +10.7 % on Na+.  **Table 2 carries the ln 10** -- and
not by an accident of the code: the paper's Eq. 13 is the Debye-Hückel
constant on log10 (it carries the 1/ln 10; it is 0.495 L^1/2 mol^-1/2 at
ε 80 and 298 K, which only the log10 constant is) and its Eq. 12 is
ln γ = −A z^2(...).  The program implements the equations as printed.

**ΔΨ_m** is the permeate node's potential, PHI(ND) in the output, against
ψ_m = 0 (Eq. 24's reference, the solution just outside the feed face): the
potential difference across the membrane with both Donnan jumps.  It is what
Table 2 prints (0.149227 = PHI(ND) at N = 10 to six figures).  Choupo now
publishes it as `dPsi_m_V_p<p>` on the `poreTransport` bench (CODATA volts,
2.08e-4 larger than NanoFiltran's 96500/8.314 volts for one dimensionless
potential).

Choupo has deliberately **no option** that reproduces the ln 10: a declared
choice that reproduces a known error is a wrong model with a name (§9.5).
So nanofiltran02 is pinned to NanoFiltran with its Davies corrected, and
Table 2 is ACCOUNTED FOR, one change at a time (N = 350; `paper.tsv`):

| | Na+ | Mg2+ | Cl- | ΔΨ_m [V] |
|---|---:|---:|---:|---:|
| Table 2 | 0.0483937 | 8.598782 | 17.245959 | 0.149754 |
| NanoFiltran as received | 0.0483949 | 8.598769 | 17.245933 | 0.149753 |
| + Davies corrected (ln 10) | 0.0535923 | 8.631082 | 17.315756 | 0.145844 |
| + D input matched (Vogel to 298 K, K_d literals) | 0.0552122 | 8.630938 | 17.317088 | 0.145025 |
| + Born constant in CODATA values (BORN_PATCH) | 0.0554182 | 8.631751 | 17.318920 | 0.144930 |
| + converged (TOL 1e-4 → 1e-9) | 0.0554180 | 8.631751 | 17.318919 | 0.144930 |
| + grid extrapolated (ND 102/204) | 0.0554248 | 8.631733 | 17.318890 | 0.144930 (0.144960 CODATA) |
| **Choupo, extrapolated (801/1601 nodes)** | **0.0554248** | **8.631732** | **17.318889** | **0.144960** |
| Choupo, the case's 350 nodes | 0.0554298 | 8.631692 | 17.318815 | 0.144958 |

Choupo against the corrected program: 7e-8 (Na+), 1e-7 (Mg2+), 7e-8 (Cl-),
−2.6e-8 (ΔΨ_m).  Against Table 2: +14.5 % Na+, +0.38 % Mg2+, +0.42 % Cl-,
ΔΨ_m −3.2 %.  Three quarters of the Na+ is the Davies defect; most of the
rest is the DIFFUSIVITY.

**A FINDING about Choupo, recorded and not changed: its DSPM-DE has no
temperature dependence of D.**  NanoFiltran corrects every D to T by
Stokes-Einstein with Vogel's viscosity, D(T) = D25 (0.897e-3/298.15) T/μ(T);
at 298 K -- 0.15 K below 25 C, where water's viscosity moves 2.3 % per kelvin
-- that is 0.38 % on every D, and the trace Na+ amplifies it to +3.0 %.
Choupo's law reads the species' 25 C `D0` at any temperature
(`electrolyte::ionD0`, `DSPM_DE.cpp`).  At 298.15 K the two agree (§9.2,
1.00014); at a process temperature of 40 C the omission would be ~30 % on
every D.  Whether the law should carry D(T) is a model decision (Vítor's):
the paper's own case is the measurement that names it.

**CLOSED 2026-10-24 (DEV.md 4c C145 ruling, built in C148).**  Every
membrane reader of `D0` -- the DSPM-DE pore and its film, the Polarisation
object's per-ion k -- now takes D_i(T) = D_i0 (T/298.15)(μ(298.15)/μ(T)) on
the package's OWN declared liquid viscosity, ONE home
(`thermo/transport/StokesEinstein.H`, which the electrodialysis stack's
correction also calls).  With no liquid-viscosity model declared the factor
is 1 and the run says so; at 298.15 K it is 1 exactly.  This case declares
none, so its numbers and anchors did not move.  MEASURED on a copy that
declares `transport { liquid { viscosity { model Vogel; } } }`, against
NanoFiltran (Davies + Born corrected, TOL 1e-9, ND 102/204 extrapolated)
WITHOUT the Vogel half of the D matching (K_d literals still matched): with
NanoFiltran's own Vogel constants (−10.5, 530, 146) the factor is 0.996067,
and Choupo agrees on Mg2+ to 2e-7, Cl- to 3e-6, the potential to 2.0e-4 and
the trace Na+ to −1.1e-3 (it was +2.95e-2 without D(T)); with the
catalogue's water Vogel fit, 0.996084, Na+ −9.6e-4.  The residual is
NanoFiltran's normalisation: it divides by the literal 0.897e-3 Pa s where
its own Vogel gives μ(298.15) = 0.89687e-3, 1.4e-4 on every D, amplified
~8x by the trace Na+.  So D(T) closes the "D input matched" step to that
literal; the K_d single-precision step remains NanoFiltran's.

### 13.2 The grid study at Choupo's own N

| N | Table 2 Na+ / iterations (NanoFiltran, as published) | Choupo Na+ / Newton iterations (correct Davies) |
|---:|---|---|
| 10 | 0.0367468 / 71 | 0.0627659 / 7 |
| 20 | 0.0460774 / 75 | 0.0571069 / 9 |
| 50 | 0.0480736 / 79 | 0.0556794 / 9 |
| 100 | 0.0483219 / 82 | 0.0554872 / 10 |
| 200 | 0.0483809 / 85 | 0.0554403 / 11 |
| 350 | 0.0483937 / 88 | 0.0554298 / 12 |

Choupo's N counts the pore nodes (N − 1 intervals); NanoFiltran's N counts
the permeate node too (N − 2 intervals across the membrane).  The two
discretisations converge from opposite sides -- central differences from
below, exponentially fitted fluxes from above -- both second order (Choupo's
measured 2.00 on this case).  Choupo's iterations are a full Newton with an
analytic Jacobian from a local-Donnan seed; NanoFiltran's an under-relaxed
(0.2) Newton stopped at TOL 1e-4.  At N = 10 Choupo is 13 % from its own
limit on the trace Na+, NanoFiltran 24 % from its own.

### 13.3 Fig. 4: the profile

The `poreTransport` bench gained `profile <file>.csv;` (every point's solved
pore: x over the equivalent thickness, each ion species' concentration, ψ in
volts on the ΔΨ_m reference); nanofiltran02's op N350 writes
`pore_N350.csv`, the paper's Fig. 4.  The figure is NOT digitised: it is
NanoFiltran's own output at N = 350, which the as-received run reproduces
(Table 2 being reproduced), so the as-received program's profile IS the
figure.  At the two faces (concentrations; ψ in CODATA volts):

| face | | as received (Fig. 4) | corrected NanoFiltran (ext.) | Choupo (ext.) |
|---|---|---:|---:|---:|
| feed (x = 0) | Na+ | 15.1153 | 15.072668 | 15.072668 |
| | Mg2+ | 7.91872 | 7.946131 | 7.946131 |
| | Cl- | 0.952728 | 0.9649302 | 0.9649302 |
| | ψ [V] | −0.0584815 | −0.0582841 | −0.0582841 |
| permeate (x = 2.5 µm) | Na+ | 0.147901 | 0.1602845 | 0.1602845 |
| | Mg2+ | 15.0137 | 15.023507 | 15.023507 |
| | Cl- | 0.175323 | 0.2072982 | 0.2072982 |
| | ψ [V] | 0.0741967 | 0.0721758 | 0.0721758 |

Choupo and the corrected program agree on the faces within 1.1e-7.

### 13.4 Fig. 3: the solved pore against EXPERIMENT

§4.1 sets NanoFiltran against Bowen & Mohammad's measured rejections (AIChE
J. 44 (1998) 1799): Na+, Cl- and a trivalent dye on CA30, r_p 0.63 nm,
**Δx_e** 6.2 µm (the paper's own word: "equivalent membrane thickness", Δx/A_k
-- the record's `porosityOverThickness` 1/6.2e-6), 298 K, ideal activities,
ε_p = ε_b (no Born term), the stirred cell's Sh = 0.23 Re^0.567 Sc^0.33 at
Re 26 900 and L 0.024 m (Choupo's `StirredCell`, exactly: Re = ω r²ρ/μ with
NanoFiltran's Vogel viscosity at 298 K and density 997), c_X of Eq. 43 and
J_v of Eqs. 44-45 at each feed.  Nothing needed new grammar but one key:
**the charge of Eq. 43 is a function of the feed**, so no single record value
carries it -- the `poreTransport` op gained `chargeDensity <mol/m3>;`, which
replaces the record's X_d for that op, announced with both values
(`Membrane::withChargeDensity`, a copy; the registry's record is never
touched).  Each of the ten ops writes its c_X and J_v with the arithmetic
beside it, and the gate recomputes both from the equations.

**THE DYE COULD NOT BE CARRIED AS A PORE ION, AND THAT WAS AN ENGINE GAP.**
Its Stokes radius equals the pore radius (λ = 1), and the law's steric
partition at λ ≥ 1 is 1e-15 (NanoFiltran's own number).  As a pore unknown
it sat 15 orders below the other ions, and the station REFUSED at the first
point ("the line search found no evaluable step").  The pore excludes such an
ion, so it is no longer a pore unknown: `pore::PoreWall::excluded` carries
it in the FILM only -- its wall concentration the interface balance at zero
permeate, C_m = k* c_b/(k* − J_v + z D ξ'), in the wall's electroneutrality
(8), the wall's ionic strength (bulkOverPoreDavies) and the osmotic
difference (9), with their analytic derivatives -- and its permeate is zero.
Announced once per unit.  The two are the same problem in NanoFiltran's
limit: the converged programs agree on the Na+/Cl- permeates within 2e-8.
No corpus case has an ion with λ ≥ 1, so no golden moved (36 membrane-family
cases re-run).

**The figure was digitised** (`digitise_geraldes_alves2008.py`): the raster
the PDF embeds (670 × 524 px, sha256 recorded), calibrated on the plot frame
and the tick marks (every tick read back to its label within half a
pixel: 0.11 mol/m3 in x, 1e-4 in R_obs), each marker found by a morphological opening around its eye-placed
position (open markers filled first), the solid NanoFiltran lines TRACED on a
mask of continuous pixels (the dotted Bowen & Mohammad lines fail it) and
read at each marker's x.  Reading error ±1.5 px: 0.32 mol/m3 and 0.011 in
R_obs.  The CSV records the digitiser's own sha256 (a stale CSV is refused)
and its calibration line (each row is checked to be its own pixel).  An
experiment's feed is the mean of its two markers' c_Cl.

NanoFiltran with the paper's settings (20 nodes, URF 0.2, TOL 1e-4) lands on
the drawn line within half a reading error at all twenty markers: Eqs. 43-46
were read right.  The comparison with experiment:

| dye | c_Cl | ion | experiment | Choupo | NanoFiltran (paper) | Choupo − exp |
|---:|---:|---|---:|---:|---:|---:|
| 4 | 5.097 | Na+ | 0.643 ± 0.015 | 0.620 | 0.621 | −0.023 |
| 4 | 5.097 | Cl- | −0.184 ± 0.018 | −0.274 | −0.273 | −0.090 |
| 4 | 10.460 | Na+ | 0.496 ± 0.015 | 0.474 | 0.474 | −0.023 |
| 4 | 10.460 | Cl- | −0.022 ± 0.011 | −0.130 | −0.129 | −0.108 |
| 4 | 25.752 | Na+ | 0.338 ± 0.011 | 0.316 | 0.317 | −0.022 |
| 4 | 25.752 | Cl- | 0.055 ± 0.015 | −0.002 | −0.002 | −0.057 |
| 4 | 52.460 | Na+ | 0.257 ± 0.011 | 0.231 | 0.231 | −0.027 |
| 4 | 52.460 | Cl- | 0.099 ± 0.015 | 0.055 | 0.055 | −0.044 |
| 4 | 103.009 | Na+ | 0.188 ± 0.015 | 0.178 | 0.178 | −0.010 |
| 4 | 103.009 | Cl- | 0.103 ± 0.018 | 0.082 | 0.082 | −0.021 |
| 37 | 4.460 | Na+ | 0.871 ± 0.015 | 0.891 | 0.891 | +0.020 |
| 37 | 4.460 | Cl- | −2.092 ± 0.011 | −1.818 | −1.814 | +0.273 |
| 37 | 9.239 | Na+ | 0.812 ± 0.015 | 0.817 | 0.818 | +0.005 |
| 37 | 9.239 | Cl- | −1.342 ± 0.011 | −1.375 | −1.372 | −0.033 |
| 37 | 21.929 | Na+ | 0.699 ± 0.011 | 0.693 | 0.693 | −0.006 |
| 37 | 21.929 | Cl- | −0.768 ± 0.011 | −0.862 | −0.860 | −0.093 |
| 37 | 42.903 | Na+ | 0.585 ± 0.015 | 0.572 | 0.572 | −0.012 |
| 37 | 42.903 | Cl- | −0.482 ± 0.011 | −0.535 | −0.534 | −0.053 |
| 37 | 87.292 | Na+ | 0.456 ± 0.011 | 0.430 | 0.431 | −0.026 |
| 37 | 87.292 | Cl- | −0.235 ± 0.015 | −0.294 | −0.294 | −0.059 |

Root-mean-square over the twenty symbols: Choupo 0.077, NanoFiltran 0.078
(the two are the same model; NanoFiltran's 20 nodes and TOL 1e-4 give the
third decimal).  The model follows both dye levels' trends -- the excluded
trivalent anion at the wall drives Cl- strongly negative, and both
rejections fall as chloride screens the fitted charge -- and misses where
the paper's own figure shows it missing: at 4 mol/m3 of dye it
under-predicts both rejections by 0.01-0.11 (the Cl- symbols sit above the
line), and at the lowest chloride with 37 of dye it reaches −1.82 where the
measurement is −2.09 (Bowen & Mohammad's own model, the dotted line, reaches
it).  **This is a comparison with experiment carried by FITTED inputs**:
r_p and Δx_e were determined from these data, c_X is Bowen & Mohammad's
fitted function of the feed and J_v their fitted function at each dye level.
Agreement says the pore model reproduces the data at its fitted inputs; it
is not a prediction of a membrane nobody fitted.

The anchors of nanofiltran03 are on the PERMEATE, c_p = c_b(1 − R_obs) of each
symbol, not on R_obs: R_obs crosses zero (Cl- at 25.8 mol/m3 of chloride and
4 of dye), and a relative band on a number near zero means nothing.  Bands:
the measured disagreement × 1.25 plus half the reading error (2 % to 25 %);
the gate caps each at twice the disagreement plus the reading error.

### 13.5 The gate, and what its sabotages found

`bin/curate/check_nanofiltran_paper.py` (no compiler needed; it reruns only
Choupo): (a) the transcription is PAPER_TABLE2's, the CSV fresh (digitiser
hash), from the named image, every row its own pixel; (b) Table 2 is the
as-received program (iterations exact, Na+ 5e-5, the rest 1e-5) and is NOT
the Davies-corrected one (> 5 %); (c) nanofiltran02 at 401/801/1601 nodes,
order 2, extrapolated within 1e-6 of the corrected program on the permeates
and ΔΨ_m and 1e-5 on the faces; (d) the cases' printed tables are the
measurement (60 numbers in nanofiltran02's header, nanofiltran03's results
table verbatim); (e) the anchors are the reference's and the measurement's,
every run inside its band and no band wider than twice the disagreement;
(f) every nanofiltran03 op is Eqs. 43-46 at the read feed, Choupo meets the
converged program within 1e-6, the paper-settings program meets the drawn
line within 2.5 reading errors, the dye's permeate is exactly 0 and its
exclusion announced.  `regenerate_paper.py --check` holds `paper.tsv` to a
fresh NanoFiltran run (it refuses without gfortran).

By hand, 2026-10-24, each restored (engine ones rebuilt) and the gate
re-run to OK:

- S1 -- the excluded ion left out of the wall's electroneutrality (engine):
  caught by (f), but as a REFUSAL, not a disagreement -- without the dye's
  charge at the wall the coupled film has no electroneutral solution and the
  station stops.  A refusal for another reason is still a refusal; S1b is
  why the arm is trusted.
- S1b -- the excluded ion's film removed (its k × 1e6, so C_m = c_b; engine):
  caught by (f), code to code, 2.5 % on Na+ at the lowest chloride.
- S2 -- one measured R_obs hand-edited in the CSV (−2.0919 → −1.9919):
  caught by (a) (the value is not its pixel), (e) and (d).
- S3 -- the digitiser edited, the CSV not rerun: caught by (a) (stale).
- S4 -- one op's c_X edited (−65.28 → −60.28): caught by (f), twice -- the
  equation and the code-to-code permeate (2.8 %).
- S5 -- one number of nanofiltran02's header table edited: caught by (d).
- S6 -- one Table 2 value mistranscribed in PAPER_TABLE2: caught by (a).
- S7 -- one experiment anchor's band widened to 0.3: caught by (e).
- L1 (`check_source_licence`) -- the Fig. 3 JPEG copied into the case's
  `constant/experimental/`: refused by name ("IS its Fig. 3 (JPEG)").

### 13.6 What was added, and what is NOT done

Added: `pore::PoreWall::excluded` (an ion the pore excludes, carried in the
film), its routing in DSPM-DE (λ ≥ 1), the excluded ion's c_perm 0 at the
no-flux limit and its c_b in that limit's Δπ; `TransportSolution::
PoreProfile` (the solved profile, filled by DSPM-DE, read by the bench only);
the bench's `dPsi_m_V_p<p>`, `poreNewton_p<p>`, `poreContinuations_p<p>`,
`chargeDensity` and `profile`; `Membrane::withChargeDensity`;
`regenerate_paper.py` + `paper.tsv`; the digitiser and its CSV; the two
cases; the gate; the licence contract.  No existing golden moved (the 36
membrane-family cases re-run, byte-for-byte KPIs).

NOT done, named: the temperature dependence of D in DSPM-DE (§13.1, the
finding; Vítor's); Fig. 4 digitised beyond its two faces (it is NanoFiltran's
own output); the paper's Fig. 5 (the Runge-Kutta shooting it argues against:
Choupo shot its SDEM pore once and turned the shot round, CLAUDE.md, and the
DSPM-DE pore is never shot); a measurement uncertainty for Fig. 3 (neither
paper states one); the dye's molar mass (`Na3Dye.dat` carries a placeholder
the grammar requires and nothing reads, said in the record).
