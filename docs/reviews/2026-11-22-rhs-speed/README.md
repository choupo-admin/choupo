# C473 part (c): the batch right-hand side, cost per call

Branch `rhs-speed` off `c473-speed` (5dbd32d7b).  Case: `nox03_millerbowman_large` (235 reactions,
51 species, adiabatic constant V, sparse analytic Jacobian).  State: the midpoint (n and T) of the
trajectory rows at 1354 K and 2612 K, T = 1983.4 K (`state_mid.txt`, one line: n_i in kmol, then T).

## The harness

`test/rhs_bench.cpp` is a standalone program (not part of the engine; the vessel's private members
are reached through the declared `friend struct BatchReactorBenchAccess` of BatchReactor.H).  Build
line at the top of the file; `rhs_bench CASE N STATEFILE [rhs|jac]` times N calls of `derivatives_`
and N/10 sparse analytic Jacobians at the one state of `state_mid.txt` (n_i in kmol, then T; the
midpoint of the trajectory rows at 1354 K and 2612 K, T = 1983.4 K) and refuses a non-numeric N.  T
moves by 1e-13 relative per call, so nothing memoised per T answers from the call before.  All the
scripts here run from the tree (paths relative to the script, the tracked nox03 case): `bench.sh`
best of five; `ir.sh` instructions per call from callgrind (the reliable axis on a loaded laptop);
`ctbench.py` Cantera 3.2 on the same state; `timing2.py` the end-to-end table; `runcmp.py BASEDIR TAG`
the byte-identity harness.

## Per call, nox03 mid-ignition

| | rhs Ir/call | rhs us (best of 5-6) | Jacobian us | Jacobian Ir/call |
|---|---|---|---|---|
| base (c473-speed) | 277.6k | 23.3 | 60.0 | 845k |
| step 1: NASA-9 constants, energy loop on memoised h/Cp, no copies | 188.0k | 16.8 | 58.2 | 793k |
| step 2: tables per distinct Ea, b, sum(nu), multiplier hoisted | 167.9k | 17.6 (noise) | 62.3 | 793k |
| step 3: Jacobian scratch buffers and tables | 167.6k | 14.0 | 41.2 | 652k |

Cantera 3.2 on the same state: kinetics alone 3.0 us (set state + net_production_rates 4.6 us minus
the set 1.5 us); the 8 us and 6.5 us quoted by the coordinator include more of the reactor.
Choupo's 14 us includes the energy equation (u_i, Cv_i of 51 species) and the 235 reactions'
detailed balance.

## Where the 167.6k instructions per call are now

| part | Ir/call |
|---|---|
| `rateOfReaction_` (235 reactions; self 58k, exp for K_c about 16k, pow, K_c dG loop 11k) | 88.8k |
| `gibbsAt_` (h_i, g_i of the 51 species at T: NASA-9 H and S, one log each) | 37.5k |
| `energiesAt_` (Cp_i of all species, h_i for the unlisted ones) | 18.0k |
| `derivatives_` itself (scatter into dn/dt, result vector) | 15.7k |
| `kinCtx_` (c = n/V, [M] for 3 efficiency lists, 100 exp(-Ea/RT), 41 T^b, 3 c_std^sumNu) | 7.4k |

Before: `rateOfReaction_` 149k, `gibbsAt_` 71k, the energy loop 34k (h again) + 5k (Cp), 12 heap
allocations per call, 3.8k in thread-local reads of the sensitivity multiplier.

## What changed (all bit-identical)

* `NASA9Cp::H/S`: the antiderivatives at Tcommon and 298.15 K are taken once at construction by the
  same `hAnti_/sAnti_`; the expression `(hLo(Tc) - hLo(a)) + (hHi(b) - hHi(Tc))` is unchanged.
  One log per call instead of three.  Shared by every case that reads a NASA-9 record.
* `energiesAt_`: h_i and Cp_i of every species memoised with the Gibbs memo; the gas energy equation
  and the Jacobian read them.  `gibbsAt_`/`enthalpyAt_` return references.
* `KinCtx` (thread-local scratch): the packed state copy, c = n/V, [M] once per distinct efficiency
  list, exp(-Ea/RT) once per distinct Ea, T^b once per distinct b != 0, c_std^sumNu once per distinct
  sum(nu) (`Reaction::concentrationBasisFactor`, `equilibriumKcWithFactor`, added at the end of
  Reaction.cpp), the factory laws' clamped c and x, the sensitivity multiplier of the thread.
* Jacobian: the four factor vectors per reaction and the concentration vector are scratch; k, [M],
  K_c read the same tables.

Thread safety: every scratch is `thread_local` (the `solver { threads N; }` sensitivity block runs
one integration per thread on one vessel); a context lives for one evaluation.

## Byte identity (base binaries against the new ones, same cases, wall-time lines dropped)

| application | cases | identical |
|---|---|---|
| choupoBatch (tutorials/batch, incl. 19 adsorber) | 69 | 69 |
| choupoCtrl | 21 | 21 |
| choupoSemiContinuous | 8 | 8 |
| choupoSolve (tutorials/steady, all) | 361 | 361 |
| choupoProps (tutorials/props, all) | 187 | 187 |

Eight of them (batch07, cstr07, vlle04, esterification2sector, process04, curate05, curate12,
eval_nrtl_catalogue) differ only in the `package <hash>` line, which hashes the case directory's
path (the harness runs base and new in two different directories); every other byte equal.  The
curation corpus (1260 fits) was not compared.

## End to end (best of 3, process start included, nox03; Cantera 3.2 CVODES, same mechanism and charge)

| rtol | 1e-6 | 1e-8 | 1e-10 |
|---|---|---|---|
| Cantera CVODES | 0.025 | 0.040 | 0.087 |
| Rosenbrock23 base | 0.163 | 0.703 | 5.036 |
| Rosenbrock23 new | 0.139 | 0.555 | 4.261 |
| Rodas4 base | 0.150 | 0.296 | 1.550 |
| Rodas4 new | 0.136 | 0.221 | 1.152 |
| scratch merge with `seulex` (not committed): seulex | refused | 0.165 | 0.240 |
| scratch merge: Rodas4 | 0.136 | 0.251 | 1.225 |

nox02 (17 vessels, wall, base then new): Rosenbrock23 0.920/4.006/25.01 then 0.731/3.405/19.90 s;
Rodas4 0.790/1.725/7.308 then 0.574/1.597/5.657 s; merged seulex 0.468/0.643/1.048 s.  The gap to
Cantera is still the factor 4 to 5 in cost per call and the integrator's step count; this slice
moved the first.

## Not done, and candidates kept aside

* Reassociation, not applied: third-body [M] as c_total + sum (eff - 1) c would save the 3 x 51 sums
  (`thirdBodyConcentration`, 4.2k Ir of 167.6k, 2.5 %), and changes M at the last bit; ln k as
  exp(ln A + b ln T - Ea/RT) costs one exp per reaction against the 141 exp/pow of the tables, so no
  gain.  Neither was built or measured on goldens.
* Bit-identical and left: one log T shared by H and S (about 3 %), a flat per-reaction array
  layout for `rateOfReaction_` (self 58k), K_c exp per reaction (no shared operand).
* The Jacobian's `odeJacobianSparse` self cost (167k Ir) and the FD fallback were not touched.
