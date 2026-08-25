# The MESH declares its structure, and the solver audits the declaration

*Built 2026-08-25 on Vítor's ambition ask ("equation-oriented, or more
efficient optimisation with more compact Jacobians"), scoped INSIDE the
constitution: the universal equation-oriented flowsheet solver stays
deferred; this is structure in ONE unit's already-EO solver.*

## 1. What was measured before anything was written

The simultaneous MESH is equation-oriented per unit (Naphtali-Sandholm) and
was solved the most expensive way possible: dense finite-difference Jacobian
(N·nv residual evaluations per iteration) + dense Gauss (O((N·nv)³)).  A
20-line probe measured the structure on the corpus BEFORE the solver was
built on the claim:

    strip8  (nv=3):  dist 0: 4.9e+02   dist 1: 1.1e+00   dist >=2: 0 (exact)
    col40   (nv=2):  dist 0: 1.2e+00   dist 1: 8.9e-02   dist >=2: 0 (exact)

Block-tridiagonal EXACTLY — no dense condenser/reboiler rows, not even
noise.  (An early probe with a misaligned block size showed 2e-5 at dist 2;
the lesson: measure with the real blocking before concluding.)

## 2. The two classical pieces

* **Curtis-Powell-Reid colored FD Jacobian** (Curtis, Powell & Reid, J.
  Inst. Maths Applics 13:117, 1974): stage j's residual sees only j-1, j,
  j+1, so one variable slot of every THIRD stage is perturbed at once —
  3 colors × nv slots × 2 (central) = ~6·nv evaluations per Jacobian,
  INDEPENDENT of stage count, against 2·N·nv dense.
* **Block-Thomas** on the three bands, each pivot block factored by the
  shared dense `luFactor` — O(N·nv³) against O((N·nv)³).

Each colored column keeps the dense builder's own step rule
(h = h0·max(|x|,1)) and central/one-sided ladder, so the two constructions
agree to round-off on a true structure.  An InfeasibleTrial on a colored
pass cannot name the offending column, so that pass falls back to
per-column dense probing (counted).

## 3. The declaration is a claim, and a claim is audited

`opts.blockTri = {N, nv}` is a solver AID, and aids report aloud.  The
first iteration builds the dense Jacobian too, measures the largest
off-band entry, REFUSES by name when the structure is materially false
(off > 1e-4 · in-band max), and the measured maximum is announced:

    [solver] block-tridiagonal structure VERIFIED on the first iteration:
    max |J| outside the bands = 0.00e+00; Jacobians built with 3-color
    finite differences (468 residual evaluations total)

The audit costs one dense Jacobian per solve — about half of the remaining
Jacobian cost on a 10-iteration column — and it stays: it is the price of
never converging on a silently wrong structure.

## 4. Measured, same machine, same day

48-stage reactive sour-water stripper (each residual evaluation = 48
reactive flashes), identical convergence both ways (10 iterations, ||F||
2.485e-10 vs 2.486e-10):

| | dense | structured |
|---|---|---|
| wall | 62.7 s | **28.9 s** |
| CPU | 124 s | 50 s |
| residual evaluations per Jacobian | 288 | **18** |

2.2× on the whole case, 16× on the Jacobian, and the margin grows with N
because the colored cost is stage-count-independent.  The corpus: all 20
distillation tutorials byte-identical, including the two Klemola
primary-anchored columns.

## 5. The sabotage pair worth keeping

A COARSE false declaration (blocks fatter than the physics) is still TRUE —
wide bands contain narrow ones — so the audit passes and the
EVALUATION-COUNT arm catches it (150 ≠ the formula's 120).  A FINE false
declaration (blocks of 1) deletes real coupling and the audit refuses by
name ("30 blocks of 1 is FALSE: 0.089 outside against 1.233 inside").
Both directions pinned; five sabotages total, recorded verbatim in the
gate's docstring.

## 6. Not done, said plainly

The fullMESH (V, L unknowns) keeps its dense solve — its structure is
BORDERED tridiagonal, and declaring it clean would be the exact lie the
audit exists to catch.  The recycle/tear Newton stays dense (few unknowns).
The next EO step that would deserve the name — DesignSpecs solved jointly
with the tears — is NAMED for September and is Vítor's call, not begun.
