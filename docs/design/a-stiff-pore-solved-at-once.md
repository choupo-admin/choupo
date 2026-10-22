# A stiff pore solved at once — the extended Nernst-Planck equations across a DSPM-DE pore

*2026-10-22, DEV.md 4c C138, slice 1.  Vítor's decision: build, as an
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

- Any comparison with NanoFiltran's published results (slice 2, on the paper).
- The wall closed with the pore's own permeate (§5); activity inside the pore
  and at the permeate face (ideal in both paths, as the closed form had it).
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
