# C375: the fixed bed's numerical dispersion, and its convection scheme

Status: built on branch c375-fixed-bed-scheme (2026-11-12).  The unit
announces the numerical dispersion of its scheme; `operation.convectionScheme`
selects `upwind` (first order) or `vanLeer` (MUSCL, van Leer limiter, the
stated default); gate `check_fixed_bed_scheme`; witness
`tutorials/batch/adsorber/batch29_pulse_two_schemes`.  Theory Guide section
"The convection scheme and its numerical dispersion" (`sec:bed-convection-scheme`)
holds the equations; this record holds the measurements and the defects found.

## 1. The measurement (batch13, Pe = 250)

First-order upwind adds `D_num = v dz / 2` to the declared `D_L = Dax / eps`
(interstitial basis, the one the moments obey): at 100 cells 3.125e-4 against
2.5e-4 m2/s, ratio 1.25; the ratio falls under 0.1 only for nCells > 5 Pe =
1250.

Converged front, from the Richardson extrapolation of upwind at 800 and 1600
cells (first order): t_b(5 %) = **2939.26 s**, 5-95 % width **219.6 s**,
unused bed length L (1 - t_b/t_st) = **0.0167 m** (t_st = 3040.5125 s).  These
replace the first estimates (about 2935 s and 0.0172 m), which were the
800-cell upwind values, still moving.

| cells | 25 | 50 | 100 | 200 | 400 | 800 | 1600 |
|---|---|---|---|---|---|---|---|
| width, upwind [s] | 613.9 | 412.3 | 313.5 | 265.5 | 242.2 | 230.8 | 225.2 |
| width, vanLeer [s] | 398.4 | 274.7 | 231.5 | 221.7 | 220.0 | 219.7 | |
| t_b(5 %), upwind [s] | 2732.03 | 2838.54 | 2890.67 | 2915.76 | 2927.79 | 2933.59 | 2936.43 |
| t_b(5 %), vanLeer [s] | 2856.53 | 2914.16 | 2934.07 | 2938.41 | 2939.11 | 2939.20 | |

Observed order of the width: upwind 1.03-1.05; vanLeer 1.5, 2.1, 2.5, 2.7.
At 100 cells (batch13's mesh) van Leer is 0.18 % early on t_b and 5.4 % wide;
upwind 1.65 % early and 43 % wide; the unused length is 0.0175 m (van Leer)
and 0.0246 m (upwind).

The linear pulse (batch29, Pe 250, closed form: mean 54.5791 s, variance
33.1231 s2): upwind matches the mean to 6e-13 and the variance to 0.23 % only
with D_L + v dz/2 (86 % off without); van Leer matches the variance as written
to 1.88 % at 100 cells, 0.256 % at 200, 0.028 % at 400 (the limiter clips the
peak).

## 2. Two defects found, NOT fixed in C375 (for scheduling)

### 2a. The bed's `<t>/<unit>.profile` at t > 0 is erased by the instant writer

`FixedBedAdsorber::noteTimeAdvanced` (src/unitOperations/batch/FixedBedAdsorber.cpp:2237)
calls `writeProfile_` (:2178), which creates `<t>/` and writes
`<t>/<unit>.profile`.  In choupoBatch's time loop the units' clock note runs
first (src/applications/choupoBatch/main.cpp:1357, and :1445 in the second
loop) and the instant is written after it (`writeSnapshot(t)`, :1377 / :1451),
through `SolutionWriter::writeDynamicInstant`, whose atomic publish removes the
existing directory before renaming its temporary one into place
(src/io/SolutionWriter.cpp:811, `fs::remove_all(instDir, ec)`).  So with
`solutionControl { write true; }` -- the default -- no profile at t > 0
survives; only `0/<unit>.profile` does, because the writer skips t = 0
(main.cpp:769).

Reproduce: copy `tutorials/batch/adsorber/batch13_breakthrough_co2` without its
time directories, run `choupoBatch .`, and list `100/`: it holds
`internalStates/` only, while the header announces "axial profiles: <t>/bed.profile
every writeInterval".  (With `write false` the unit, since C375 (b), writes no
profile at all, as the switch says.)

Remedies to choose from: the writer publishes into an existing directory
without removing what it did not write (a shared path: every time-integrated
binary), or the unit's profile becomes part of the instant the writer
publishes (one file per unit under `internalStates/`, the C258 layout).

### 2b. The unit rewrites the authored `0/` on every run

At the start of the campaign choupoBatch calls `noteTimeAdvanced(startTime)`
(src/applications/choupoBatch/main.cpp:1198), and the bed writes
`0/<unit>.profile` (FixedBedAdsorber.cpp:2178-2181, `formatTime(0)` = "0").
`0/` is the AUTHORED initial state, which the writer itself never overwrites
(main.cpp:763-768).  The shipped cases track that file
(`tutorials/batch/adsorber/batch13_breakthrough_co2/0/bed.profile` and its
siblings), and every in-place run (`bin/runTests`) rewrites it; the bed does
not read it back (its state is declared in `operation`), so the content is
identical today and the rewrite is silent.

Reproduce: run a fixed-bed case in place, change one value of its tracked
`0/bed.profile` first, and `git diff` shows the run restoring it.

Remedy: the profile at t = 0 belongs to the first written instant (or to a
report), never to `0/`.
