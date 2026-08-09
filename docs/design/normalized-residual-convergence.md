# Normalized-residual convergence — the contract

**KIND: ADR.**  Ruled by Vítor 2026-08-09; built the same day.
Implementation: [`src/solver/Convergence.H`](../../src/solver/Convergence.H).
Gate: `bin/curate/check_convergence_residual.py`.
Witness: `tutorials/steady/flash/flash17_two_liquids_reactive`.

---

## 1. The ruling

`flash17_two_liquids_reactive` runs an isothermal flash whose duty is
**0.0845 kW**, and its by-unit first-law ledger reports **dH = 0.0869 kW
against declared items of 0.0845 kW** — a 0.0024 kW gap at 102.83 % closure.
Vítor's instruction on that number, verbatim in intent:

> It must NOT be rounded to zero, NOT compared against an arbitrary
> hard-coded threshold, and NOT given a case-specific tolerance.  Instead the
> project adopts an OpenFOAM-style NORMALIZED RESIDUAL convergence contract,
> implemented ONCE in shared convergence machinery and used consistently by
> all applicable nonlinear and equilibrium solvers.

The general principle behind it, and the reason it is worth a record: **a
dimensional residual is a magnitude, not a verdict.**  It becomes a verdict
only when divided by the magnitude of what is being balanced.  `1e-9` on a
raw residual is a number compared with nothing — which is exactly the shape
the arity slice of 2026-08-05 kept finding, one field over.

Three rejected alternatives, each of which was available and cheaper:

* **Round it.**  Report the gap as 0.00 kW.  Rejected: it converts a visible
  small number into an invisible one, and the project's standing rule is that
  a visible gap is strictly better than an invisible falsehood.
* **Widen the golden's tolerance for this case.**  Rejected by name in the
  ruling: a case-specific tolerance is a number tuned to make one case pass,
  which is the definition of a crutch.
* **Compare against a larger hard-coded threshold.**  Rejected: it replaces
  one bare number with a second bare number and answers none of the question.

---

## 2. The OpenFOAM mapping, and where it stops being one

OpenFOAM normalizes a LINEAR system `A x = b` over a mesh
(`lduMatrix::solver::normFactor`):

```
xRef       = average(x)                           // a uniform field
normFactor = Σ|A x − A xRef| + Σ|b − A xRef| + small
residual   = Σ|b − A x| / normFactor
```

sums over CELLS; `small` is `SolverPerformance::small_ = 1e-20`, a divide
guard and not a physical scale.  Two properties carry over and are the reason
the shape was chosen: the denominator is the spread of **both sides about the
same trivially-balanced reference**, not "the size of b"; and it measures how
much there is to balance, not how big the numbers happen to be.

Choupo's adaptation, for a nonlinear residual `r(u) = 0` whose equation `k`
balances terms `t(k,0), t(k,1), …`:

```
tRef       = mean( all terms )                    // the uniform state
normFactor = Σ_over_all_terms |t − tRef| + floor  // floor = 1e-20
normalized = Σ_k |r_k| / normFactor
```

with `cells → equations` and `{A x, b} → the terms of the equation`.  **This
is the same structure and the same intent.  It is not the same theorem**, and
the header says so in the same words.  Three limits, stated up front:

1. **There is no operator, so there is no `A xRef`.**  The reference is the
   arithmetic mean of the terms themselves.  For a linear system whose two
   sides are the field values this coincides with OpenFOAM; in general it
   does not, and no claim is made that it does.
2. **The normalization degenerates for a single equation.**  With `K = 1` and
   two terms, `tRef = (t0+t1)/2` and `normFactor = |t0 − t1| = |r|` exactly,
   so `normalized ≡ 1` however small the residual is.  OpenFOAM has the
   identical degeneracy on a one-cell mesh; the difference is that a one-cell
   mesh does not occur and a one-equation nonlinear system does.  It is
   therefore **detected, not hidden**: `Normalization::degenerate` is set
   whenever the spread is not strictly larger than the residual it would
   scale, the verdict falls back to the RAW residual against the same
   `tolerance`, and the criterion string says which of the two decided.  A
   degenerate normalization is never reported as a normalized one.
3. **The terms are whatever the caller hands over.**  A term set that does
   not sum to the residual would make the factor meaningless and nothing in
   the header can detect that.  It is the caller's contract; there is one
   caller per solver, so it is checkable by reading.

**One home.**  `normalizeResidual` in `src/solver/Convergence.H` is the only
definition in the tree, and the gate greps for a second one.  Two
normalizations are two verdicts on one solve, differing by a factor nobody
can see.

---

## 3. The controls, the decision, and the defaults

The OpenFOAM triple, declared per solver in `system/solverDict`:

```
reactiveEquilibrium { tolerance 1e-9; relTol 0; maxIter 60; }
```

The decision, stated in exactly one place (`convergedNow`):

> converged ⟺ `normFinal ≤ tolerance` **OR**
> `normFinal / normInitial ≤ relTol` (when `relTol > 0`), subject to
> `maxIter`.

`relTol 0` **disables** the reduction test — OpenFOAM's own convention; it
does not mean "require exact zero".  Reaching `maxIter` with neither test
satisfied is **not** convergence, and the criterion says so by name.

**Defaults: `tolerance 1e-9`, `relTol 0`, `maxIter 60`.**  These are exactly
the two constants the reactive outer Newton carried hard-coded
(`num::outerTol`, `num::outerMaxIt`) before this slice, so a case that
declares nothing runs the numbers it always ran.  They are **announced** on
first use — `[convergence] reactiveEquilibrium: DEFAULT controls …` — because
a default that is never printed is indistinguishable from a number nobody
chose.  A case that declares them gets `declared controls … (system/
solverDict)`, so a reader can tell a chosen tolerance from an inherited one.

**An unknown key inside the block REFUSES by name.**  A declared control the
solver does not implement is not a decoration; it is an instruction the
author believes is in force, and silently dropping it is the difference
between a numeric contract and a comment.

---

## 4. What is wired, and what is not

**WIRED — `ReactiveVLE`'s outer phase-equilibrium Newton**
(`src/thermo/electrolyte/ReactiveVLE.cpp`).  This is the solve the ruling
points at.  Its convergence test was `rn < num::outerTol` on a raw `||r||₂`;
it is now the shared decision on the normalized residual, with the terms
being `ln a_i(liquid)` and `ln(K_i p_i)` per volatile.  The `||r||₂` norm
survives untouched **as the line search's descent measure** — the two were
only ever the same number by accident, and separating them is half the point.

The controls reach the engine from `system/solverDict` through the two places
that hold both a built `ThermoPackage` and the case's solverDict:
`choupoSolve`'s `runSimulation` (the global package) and
`Flowsheet::applyReactiveConvergence` (a per-unit `thermo {}` world).  A case
whose declaration were honoured by one and ignored by the other would be the
same defect as ignoring it outright.

**A second, related fix rode with it, and it is the substantive half.**
Acceptance was `jointOK = rMax < 1e-7`.  An outer Newton that ran out of
iterations could still be waved through by that per-leg check — so a
tolerance a case DECLARED and the solve never met came out as a **silent
pass**.  Acceptance is now `rMax < 1e-7 && conv.converged`, and the refusal
carries all five numbers plus the criterion.

**NOT WIRED, each with its reason:**

| solver | why left |
|---|---|
| `IsothermalFlash` (Rachford-Rice / LL Gibbs) | `src/unitOperations/flash/IsothermalFlash.{H,cpp}` was **off-limits for this slice** (concurrent work).  It is the most obvious next adopter and the only one blocked by access rather than by judgement. |
| `SpeciationSolver` inner Newton + γ fixed point (`1e-12`, `1e-9`) | NESTED strictly inside the reactive outer Newton — one speciation solve per residual evaluation.  The project's ratified posture is that a nested tolerance sits BELOW its outer one; re-basing the inner test on a different measure while the outer one changed in the same commit would make a movement impossible to attribute.  Also the widest blast radius in the corpus (~30 electrolyte cases). |
| `DistillationColumn` (`opts.tolerance = 1e-9`, `1e-7` handed to `NewtonND`) | Reachable — this is a **choice**, not a constraint.  Left because the MESH residual's terms are not yet identified (which quantities each tray equation balances is a modelling statement, not a refactor), and because 12 column goldens ride on it.  Its `compositionTol` is already case-declarable. |
| `NewtonND`, `NewtonRaphson`, `Wegstein`, `NelderMead`, `SQP`, `ActiveSetQP`, `StabilityTest` | None of these holds a bare hard-coded convergence number: the tolerance is a parameter of the options struct, supplied by the caller.  The bare number, where one exists, is at the CALL SITE — which is where adoption belongs. |
| the recycle loop (`recycleTol`) | already case-declarable in `solverDict`, with a documented default; not a bare number. |

---

## 5. What moved, measured

`flash17` is **byte-identical**: same seed, same eight outer iterates, same
KPIs to every printed digit, `Q_kW = 0.0844683208495` unchanged.  Its
normalization factor is **7.40**, so the normalized residual is about an
eighth of the raw one — which is why `tolerance 1e-9` on the normalized
residual stops the Newton at the same iterate the raw test did.

The five numbers it now reports:

```
raw   |r|1   initial 6.7917e-02  ->  final 1.2783e-09   (log-form, dimensionless)
normalized   initial 9.1780e-03  ->  final 1.6583e-10
reduction    normFinal/normInitial = 1.8068e-08
tolerance    1.0000e-09   relTol 0.0000e+00   maxIter 60   (system/solverDict)
criterion    absolute tolerance (normalized residual <= tolerance)
verdict      CONVERGED after 7 outer iterations
```

Note honestly what the "raw" residual **is** here: the sum of
`|ln a_i(liquid) − ln(K_i p_i)|` over the volatiles.  It is log-form and
therefore **dimensionless** — it is *not* the 0.0845 kW.  The two are
different quantities and the case prints both, which is the point of the
slice: the duty is physics, the residual is numerics, and neither is
evidence about the other.

Across the reactive corpus, thirteen of fourteen cases reproduce their
goldens; nine of those are byte-identical and four differ at 1e-11–1e-12
relative (the Newton stops at a marginally different point on the same root).

**ONE golden moved, and it is worth reading.**
`column13_sour_water_stage_identity`'s `restage.Q` /`restage.Q_kW` went from
`1.03920077284e-09 kW` to `9.11014568475e-10 kW`.  That KPI is the duty of an
**isothermal re-flash of a stage's own products** — the identity says nothing
should happen, so its physically meaningful value is **zero**, and both
numbers are one nanowatt: the difference of two ~1e5 J/s enthalpies, i.e.
cancellation round-off.  The golden was pinning that round-off at 1e-4
relative.  Evidence that it is noise and not a shift: running the same case
with `tolerance 1e-13` gives `6.88e-10 kW` — *further* from the old value,
not closer, because the old value was never the exact answer, it was the
legacy stopping point.  The two rows were re-recorded; `restage.T`
(367.3397849 K), `V_over_F`, `pH`, and both tower duties are unmoved, and
`check_stage_identity` passes untouched.

---

## 6. The gate

`bin/curate/check_convergence_residual.py`, six arms: the five numbers are
reported for flash17 (A1); the normalization is defined in exactly one place
(A2); a declared `tolerance 1e-30` fails NAMING its criterion and writes no
`converged/` (A3); the defaults are announced when used (A4); the reduction
equals `normFinal/normInitial` (A5); an unimplemented control refuses by name
(A6).

Sabotage-verified twice, evidence in the gate's own docstring: dropping
`&& conv.converged` from acceptance made the 1e-30 run exit 0 **while still
printing `NOT converged`** (a verdict printed and not acted on — both halves
of A3 fired), and deleting the `reduction` line fired A1 and A5 together.

**Not claimed by the gate**, deliberately: that the normalization is the
RIGHT one, that its value is physically meaningful, or that any solver beyond
`ReactiveVLE`'s outer Newton has adopted it.  §4 is the record of what has
not.
