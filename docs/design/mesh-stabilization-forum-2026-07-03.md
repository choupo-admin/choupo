# MESH distillation stabilization — forum-ratified design (2026-07-03)

**Status: DESIGN RATIFIED (5/5), NOT BUILT.** Forum: distillation-solver expert
(25 yr MESH/Naphtali-Sandholm/inside-out), constrained-Newton numerical analyst,
Choupo credo-keeping architect, OpenFOAM numerics veteran, pedagogy professor +
MCFT student.

## The problem (verified in code)
The `simultaneous`/MESH column solves the N·n MESH set (per-stage liquid
fractions x + stage T) with `solver::newtonND` — dense FD Jacobian + Armijo
backtracking, the ONLY globaliser.  NDOptions has NO variable bounds.  A Newton
step can drive a mole fraction NEGATIVE mid-iteration, feeding a bad T/K-value
and a poisoned property evaluation.  (The Wang-Henke path clamps `max(x,0)`; the
MESH does not.)  Continuation already exists (reaction OFF→ON, catalyst ramp).

## THE teachable moment (pedagogy, verbatim)
"A mole fraction going negative mid-iteration is physically meaningless — there
is no −3% benzene.  The Newton step is a LINEAR extrapolation of a NONLINEAR
world; unconstrained it walks off the physical manifold, then poisons the
K-values and bubble-T it feeds back.  Bounds keep every iterate inside the
physics; a good seed starts you in the basin.  All three are one idea: STAY
PHYSICAL."

## The design (unanimous unless noted)

### 1. BOUNDED LINE SEARCH (the core fix) — DEFAULT-ON, path-preserving
The ONLY Q1 option compatible with byte-identical goldens.  Inside the existing
Armijo: first compute the maximum fraction-to-boundary alpha that keeps every
x_i in [0,1] (the classic tau*alpha_max, tau~0.995), CAP Armijo's alpha there,
then backtrack as normal.
  * When the unconstrained step is already feasible, alpha_max=1 -> the iteration
    is UNCHANGED -> every existing golden stays byte-identical.  It acts ONLY on
    the infeasible steps that currently poison K/T.
  * CRITICAL: compute alpha_feasible from the step DIRECTION, BEFORE evaluating F
    (not from x<0 after a poisoned eval).
  * COMPLEMENT (belt-and-suspenders): guard K / bubble-T against x<0 so a
    mid-search FD-Jacobian trial can't NaN.  A complement, not a substitute.
  * REJECTED: (a) softmax/logit transform — reparametrizes (path in w != path in
    x -> breaks EVERY golden), SINGULAR as x->0 (rank-deficient dx/dw) so it
    WORSENS conditioning in the azeotrope/high-purity regime it targets, and
    HIDES the negative-fraction event from the student.  Offer only as opt-in
    `variables logit;` for research.
  * REJECTED (top pitfall, unanimous): (b) clamp-and-renormalise — NOT a descent
    method; desyncs residual from state and stalls / limit-cycles exactly on
    azeotropes.

### 2. SEED FROM THE SHORTCUT / WANG-HENKE — opt-in (the highest-leverage fix)
The forum RE-RANKED this ABOVE bounds: "a good seed beats globalisation for hard
columns" (Newton's basin is local; no line search enlarges it).  Seed the MESH
Newton from the existing Fenske-Underwood-Gilliland shortcut OR a few Wang-Henke
sweeps (which already live in-code and DIE exactly where MESH takes over -- a
perfect seed AND the canonical lesson).  A changed seed CHANGES the
converged-to-tolerance path -> NOT default (breaks goldens): ship as
`initialize shortcut|wangHenke|linear;`, default `linear`.

### 3. DAMPING KNOB — CUT (unanimous)
No graded `none|mild|medium|severe` ladder -- "a mood ring", "false-comfort
knob", cargo-cult, anti-pedagogy (teaches "turn it to severe" instead of "look
at your setup").  Armijo + the feasible cap already bound the physically
meaningful excursion.  If ever wanted, ONE honest NUMERIC with units
(`maxDeltaT_perStage` / `maxRelDeltaX`), default no-op, announced -- but
redundant once the bounded line search exists, so SKIP for v1.

### 4. DICT + ANNOUNCE
A column-level `stabilization {}` block inside `operation` (co-located with the
column; NOT solverDict = flowsheet-Newton scope; NOT bare operation keys).
`boundedLineSearch on;` defaults on.  Announce at verbosity >= 3, ONE line only
when alpha is clipped by a bound (NEVER when 1.0, so goldens gain no phantom
line):
  `[MESH] iter 12: step clipped alpha=0.34 (x[benzene,stage7]->0 bound) ||F||=4.1e-3`

### 5. SKIP (unanimous) — breadth-first opacity, not for a glass-box teaching tool
Broyden/quasi-Newton (hides the FD Jacobian the student must see), inside-out
(opaque), adaptive mesh / stage-adding, automatic multiple-steady-state
detection.

### 6. THE TUTORIAL (crown jewel, unanimous ADD)
Failure->fix, explicit: run Wang-Henke, WATCH it diverge through the azeotrope;
read the diagnosis; switch to `model simultaneous`; WATCH the bounded step clip
a would-be-negative fraction and converge.  The verbose log showing the negative
mole fraction that would have poisoned the K-value IS the lesson.  "Failure you
can watch is the whole glass-box premise."

## Priority (forum-revised; the pre-forum triage under-ranked seeding)
  SEED (2) ~= BOUNDED LINE SEARCH (1)  >  everything else;  damping SKIPPED.
Build order: bounded line search + FD guard (default-on, goldens-safe, the
robustness floor) -> the failure->fix tutorial (proves + teaches it) -> the
opt-in shortcut seed.

## MUST NOT CHANGE
The converged iterate of every existing distillation golden -> bounds/seed/
damping that alter the path stay opt-in; ONLY the never-binding-when-feasible
alpha cap is default-on.  The dense FD Newton stays visible (no Broyden).  The
existing continuation (reaction OFF->ON, catalyst ramp) is the credo-consistent
pattern to follow.

## CUT / ADD (net)
CUT: damping-level presets; softmax/logit transform (as a default).
ADD: the feasible-alpha cap in the line search (default-on, announced); the
opt-in shortcut/Wang-Henke seed; the failure->fix tutorial.
