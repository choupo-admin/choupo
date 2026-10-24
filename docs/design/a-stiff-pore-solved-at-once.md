# A stiff pore solved at once — the extended Nernst-Planck equations across a DSPM-DE pore

*2026-10-22, DEV.md 4c C138, slice 1; slice 2 (the comparison with
NanoFiltran itself) is §9.  Vítor's decision: build, as an
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
  untested), and the spiral module: a DSPM-DE salt feed under `ionCoupling
  electroneutral;` is still refused by `buildPolarisation` (the bench builds
  the film from the policy directly).
- NanoFiltran's data-fitting mode (Nelder-Mead on X, r_p, δ, ε_p) and its
  refined meshes (`EPSX` 1.05 was run once, before the matching, ND 26 to
  204: it converges; nothing of it is pinned).
- The paper's own figures.
- ~~Replacing any default (`hindrance legacy`, the B_s wall closure,
  `wallDavies`) -- Vitor's.~~  Vitor took it on 2026-10-24 (DEV.md 4c
  C141): the hindrance in §10.1; `wallDavies` stays the default.

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
corrected K_d is 5 to 12 times the old one; K_c moves 5-7 % down).  The one pair is now `DechadilokDeen2006`
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
