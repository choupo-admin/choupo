# Solution directories (OpenFOAM-style 0/ 1/ 2/) — forum-ratified policy (2026-07-03)

**Trigger:** Vítor's screenshot of gibbs06 (a single-pass Gibbs case) — "weren't
the streams supposed to be in folders 0/ 1/ 2/ like OpenFOAM?"

**Forum: 6 voices** — OpenFOAM/CFD veteran, process-simulation expert (Aspen/
gPROMS), computational-pedagogy professor, MCFT undergrad (no OpenFOAM),
reproducibility/git engineer, credo-keeping architect.

## The unanimous verdict (6/6)
1. **Shape = HYBRID gated on a genuine MARCH.**  Write instant directories only
   where there is a sequence to write: a multi-iteration recycle (the pseudo-
   time march to the tear fixed point) or dynamic real time (choupoBatch/Ctrl,
   the number IS physical seconds).  The recycle march is the pedagogy;
   `ls 0/ 1/ 2/` = the tear-stream trajectory to convergence.
2. **The GUI SHOWS instant dirs when present, but must NOT provision them.**  A
   "write solution directories" toggle in the GUI is a parallel authoring
   channel (credo: GUI is a runner/visualiser, no config dialogs).  Writing is
   a `controlDict solutionControl { write true; }` decision, made in the dict —
   glass-box, a line the student can read.  CUT the proposed GUI toggle.
3. **Cleanup = an explicit `bin/cleanCase`; NEVER auto-prune silently.**  Silent
   pruning of the history you wrote for pedagogy violates "announce everything".
   Keep the existing `purgeWrite` last-N (ring buffer) for the recycle march.
4. **Goldens stay safe.**  Instants are gitignored; `bin/runTests` compares KPIs
   + NaN-guards from the in-memory result JSON and must NEVER diff instant
   CONTENTS or enumerate case-directory entries.  A written instant is never a
   golden.
5. **The march ANNOUNCES itself** — a post-run banner ("wrote N instants: tear
   residual 1e-1 -> 1e-4; `ls` for the march, `cleanCase` to remove").

## The one split (5 vs 1): the single-pass `0/`
- **5 (OpenFOAM vet, process-sim, undergrad, pedagogy, reproducibility):** a
  single-pass case (gibbs06: one solve, no recycle) writes NOTHING.  A lone
  `0/` is a CATEGORY ERROR: in OpenFOAM `0/` is the INITIAL condition and the
  LAST time dir is the answer, so numbering a converged steady solution `0/`
  inverts the meaning ("filing the answer under 'initial guess'").  The undergrad:
  a bare `0/` "reads as a glitch, not the answer."  Answer Vítor's surprise with
  a banner + docs + a convergence PLOT, not a semantically-wrong folder.
- **1 (credo keeper):** the converged instant IS meaningful (the solution as a
  directory you can ls/cat/restart) — but even this vote says number it as the
  converged iteration, NOT a pro-forma `0/`.

**Resolution (the tiebreaker the forum itself surfaced):** OpenFOAM cases SHIP
WITHOUT result time directories — you GENERATE them by running.  So "opt-in /
generated-by-running" is MORE OpenFOAM-faithful than pre-sprinkling `0/`, and it
avoids the meaning-inversion.  Single-pass writes nothing; the discoverability
gap that prompted Vítor is closed by an announce banner + the convergence plot,
not by a folder that teaches a falsehood.

## The pedagogical WIN everyone converged toward
A **convergence view (residual vs iteration)** in the GUI for recycle cases —
the student and pedagogy professor, verbatim: "the folders don't teach me; a
plot does."  This is the real answer to "help me understand why it converges."

## Two REAL BUGS found (independent of the policy — FIXED 2026-07-03)
1. **gitignore digit hole + numeric-sector data-loss (FIXED).**  Instant patterns
   covered integers only to 6 digits (a dynamic sim past 1e6 s wrote a TRACKED
   `1000000/`) and decimals to 2 leading digits; extended to 9/5.  The sharp
   edge: a sector NAMED purely numerically (`2024/`) matched the ignore pattern
   and had its system/+constant/ SILENTLY IGNORED on commit.  Fixed at the ROOT:
   the Flowsheet loader now REFUSES a purely-numeric sector/child name (loud
   error); no tutorial violates it, so it is backwards-compatible.
2. **restart contamination — MILDER than reported.**  Adopting stale instants as
   a `latestTime` seed requires `startFrom latestTime` EXPLICITLY in the dict
   (default is `startTime` = cold).  Not silent-by-default; the cold-start
   default already protects.  No code change; documented here.

## The recommendation to Vítor (his call — NOT yet built beyond the bug fixes)
KEEP OPT-IN as the default (the safe, reproducible, clean default 5/6 back),
and close the discoverability gap with FEATURES, not a default flip:
(a) a post-run banner announcing what was / was not written and why;
(b) the convergence PLOT in the GUI (the pedagogical win);
(c) the Case file tree showing instant dirs when present;
(d) `bin/cleanCase`.
Do NOT flip default-on; do NOT add a GUI write-toggle.

## MUST NOT change (forum, unanimous)
The SolutionWriter's per-sector CHT design (per-branch `streams`, no global
side-channel); `latestTime` max-integer discovery with symlink-optional restart;
the self-describing dict payload; the `solutionControl {}` block as the explicit
switch.

## CUT / ADD (net)
- CUT: the GUI "write solution directories" toggle; default-on for single-pass.
- ADD: the convergence plot; the announce banner; `bin/cleanCase`; the
  numeric-sector guard (done).
