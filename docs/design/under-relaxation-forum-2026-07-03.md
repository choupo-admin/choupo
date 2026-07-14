# Under-relaxation factors — forum-ratified design (2026-07-03)

**Status: DESIGN RATIFIED (5/5 unanimous), NOT BUILT.** Forum: OpenFOAM numerics
veteran, process-simulation numerics expert, numerical analyst, Choupo
credo-keeping architect, computational-pedagogy professor + MCFT student.

## The verdict, unanimous

**Under-relaxation belongs on the TEAR update ONLY — never on inner unit Newton
solves.**  The reason is mathematical, not stylistic:
* Inner unit solves run **NewtonND with Armijo backtracking line search**, which
  chooses the step adaptively to guarantee residual descent.  A fixed factor is
  *dominated on both ends*: too timid near the root (kills Armijo's quadratic
  convergence, which tries alpha=1 first), too bold far from it (no descent
  guarantee).  Adding a fixed alpha there is a step BACKWARDS and a
  no-silent-crutch violation (a weaker globaliser masquerading as "safer").
* The recycle **tear** is successive substitution x+ = G(x); the damped map
  x+ = (1-alpha)x + alpha*G(x) is the canonical, well-founded relaxation, and
  **Wegstein is its adaptive cousin**.  A plain alpha is the robust, predictable,
  student-legible fallback WHEN Wegstein oscillates or its q clamps at the
  [-5,0] rail (strongly nonlinear loops: reactive systems, high recycle ratio,
  a phase boundary crossed inside the loop).

## The spectral limit (what the tutorial must teach honestly)
Successive substitution converges iff rho(G') < 1; error e_{k+1} ~ G' e_k, so
alpha=1 diverges when |lambda(G')| > 1.  The damped map has Jacobian
M = (1-alpha)I + alpha*G', eigenvalues 1 - alpha(1 - lambda_i).  A scalar alpha<1
only tames lambda SLIGHTLY above 1; genuinely large |lambda| >> 1 or COMPLEX
lambda needs Wegstein/Newton, not a scalar.  Under-relaxation has a FINITE reach
-- teach that, don't oversell it.

## The design (all points unanimous unless noted)
1. **Scope: the tear update only.**  An alternative tear updater to Wegstein --
   one OR the other, NEVER both (double damping is the top pitfall).
2. **Dict: flowsheet level**, beside recycleMaxIter/recycleTol/recycleSolver
   (Flowsheet.cpp ~2395).  Key: `recycleRelaxation <alpha>;` (or a
   `relaxation { tear <alpha>; }` block at the same read site).  NOT solverDict
   (per-unit, wrong scope), NOT controlDict.
3. **Default: alpha = 1.0, MANDATORY.**  No-silent-crutch DEMANDS opt-in
   relaxation; and 1.0 is the ONLY value that keeps every golden byte-identical
   (any alpha<1 default changes the convergence path).  The default is fixed by
   the credo, not a tuning choice.  Documented first retry = 0.5 (in the
   tutorial, not in code).
4. **Announce (glass-box).**  At verbosity >= 3, when alpha < 1 is active:
   once at loop entry `recycle: under-relaxation ON (alpha=0.50) -- successive
   substitution, NOT Wegstein`; and per outer iteration `[recycle]
   under-relaxation alpha=0.50 applied to tear 'S7': raw |D|=1.4e-2 -> damped
   7.0e-3`.  **Print NOTHING when alpha=1** (no phantom line in existing
   goldens).  Mirrors the bounds-report-when-they-bind rule.
5. **Diagnostic (numerical analyst).**  Print the estimated spectral radius rho
   from the successive-correction ratio ||Dx_k||/||Dx_{k-1}|| each sweep, and
   flag when alpha is the reason it converged.
6. **Naming: keep "under-relaxation / relaxation factor / alpha"** -- transferable
   vocabulary students meet in every solver.  Do NOT mirror fvSolution's
   `relaxationFactors { fields{}; equations{}; }` two-bucket SHAPE (it encodes a
   segregated solver Choupo does not have -- use the word, not the dict shape).
7. **Tutorial (unanimous ADD).**  An alpha-SWEEP on an oscillating recycle (a
   stiff mixer -> reactor -> separator loop): tabulate iterations-to-converge
   vs alpha -> the U-CURVE (divergence at high alpha, slow convergence at low
   alpha, a sweet spot between).  That single figure IS the speed-vs-stability
   trade-off.  Contrast Wegstein on the same tear.
8. **CUT (unanimous): any per-unit-type relaxation in solverDict** -- redundant
   with Armijo, and it teaches the wrong (segregated) solver mental model.

## Optional / needs Vitor's call
* **Divergence-triggered auto-fallback (OpenFOAM vet).**  If Wegstein diverges,
  auto-fall-back to alpha=0.5 damped substitution with a LOUD announce ("Wegstein
  diverging -> falling back to alpha=0.5").  Honest (announced, not silent) and
  saves the run -- but it is an AUTOMATIC action, so it needs a ruling against
  the no-silent-crutch stance (announced auto-action vs student-owned knob).
  Recommend: v2, behind an explicit `recycleRelaxation autoFallback;` opt-in.

## The teachable framing (pedagogy)
"alpha is how much you trust the new guess: alpha*new + (1-alpha)*old.  Trust
less, converge slower but survive."

## MUST NOT CHANGE
alpha=1.0 default (goldens + credo); Armijo on NewtonND; the Wegstein q
machinery; the recycleSolver selector; zero output when alpha=1.
