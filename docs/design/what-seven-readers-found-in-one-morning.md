# What seven readers found in one morning

*Record of the 2026-09-04 seven-way audit.  Status: IN PROGRESS — this file is
the ledger; each fix links to its own commit.*

## 1. Why seven, and why read-only

Vítor asked for the generals to be put to work.  Seven agents were dispatched
on one morning, each with a different subject, and **all seven read-only**:
they could run binaries on copies in `/tmp`, run individual gates and write
throwaway scripts, and could not modify one byte of the tree.

That constraint is not caution, it is what makes the method work.  It is the
same shape as the 2026-08-31 EduTools audit (43 confirmed defects, eleven
agents, none allowed to write a file).  A wrong report costs five minutes; a
wrong write costs hours and can contaminate the evidence the other six are
reading.  Findings are applied by one hand, verified first, ranked by damage to
a student.

The seven subjects: the student's first hour · the absences the last 48 hours
of work should have buried · the refusal messages a student actually hits ·
tutorial headers against their own runs · the GUI's dead surfaces · the manuals
against the engine · the curated data against itself.

## 2. The through-line, which one of them said better than the brief did

> **The failures are all *generalisation* failures.  The good message exists
> somewhere and was never wired to its siblings.**

It holds across every subject:

* The unread-key audit produces an excellent "did you mean …?" and is wired to
  unit `operation{}`, `postDict`, `solverDict` and `outerDict` — **not** to
  `constant/thermoPhysPropDict`, so a typo in a binary-interaction pair is
  silent.
* The near-name join exists for component names (the best message in the tree,
  which even disarms its own remedy when the remedy would be wrong) and not for
  stream names, unit-op types or unit suffixes.
* The rich non-convergence diagnosis exists in `Mixer` — under a comment
  describing this exact defect — and not in the flowsheet fallback or seven
  sibling throws.
* The `feedQuality`-vs-`vf` contradiction is refused by name on the
  `simultaneous` path and ignored on Wang-Henke.
* The caveat replay carries extrapolations and not the convergence verdict.

## 3. What was fixed, worst first

### The first typo produced a silent terminal

`bin/runCase` and `bin/runApplication` both end in a branch that prints
`FAILED (exit N)` and the log's last lines.  Both ran under `set -euo pipefail`
and invoked the binary bare, so a non-zero exit killed the script *at the
invocation* — before `rc=$?`, and therefore before the branch that reports it.
**The FAILED branch was dead code in both files.**

Reproduced on a copy of `flash01` with the unit type mistyped: exit 2, three
lines that look like a normal start, and nothing on stdout or stderr.  The
engine's own message — naming the unknown type and listing all 48 registered
ones — reached only the log.

This is the first thing a new student meets when they make their first mistake,
and the answer was silence.  Gate: `check_runcase_reports_failure`, which
requires the failure to reach the terminal **with its cause**, not merely the
word FAILED, and checks the negative so it can tell the two states apart.

### Thirteen sentences that were true until the day before

Commit `26264b656`.  Twelve of the thirteen were written by this session in the
two preceding commits — the `verdict` golden row kind and the fourth home of
the verdict vocabulary — and not buried.  The rule was quoted in both of those
commit messages.  Recording that is the point: **the rule is easy to state and
easy to skip on the day you are the one shipping.**

## 4. What is fixed elsewhere, or open

Tracked as tasks, each with its evidence: the guide teaching `phase` where the
parser reads `referenceState` (a silent wrong enthalpy rung — the guide teaches
the bug); the thermo-dict typo; five guide examples that refuse; a
mass-transfer default naming an unregistered model; six drifted tutorial
headers; the unit pop-out dropping `solverDict`; the divergence channel
reaching no mounted surface for three of the four binaries.

## 5. What is RESERVED, and why guessing would be worse

* **membrane01's flux.** Header 20–25 LMH, engine 47.78 LMH.  20–25 is the
  physically typical seawater RO figure.  The header may be right and the model
  wrong, so rewriting the header to match the engine would pin a possibly-wrong
  answer as the reference.  The golden pins all three numbers, so the *answer*
  has not moved; the header's numbers were never pinned by anything.
* **1782 values reading `origin literature; method "ChemSep database import"`**
  — a databank named as the authority under a word that asserts a primary.  The
  remedy is opening primaries, not writing citations.  One record of this shape
  is already pinned in the debt registry; this is the same shape at corpus
  scale.
* **The `phase`/`referenceState` engine half**: whether an unread key inside a
  component record should REFUSE or announce is a contract decision, not a
  typo fix.

## 6. The negatives, which are half the value

Recorded so the clean parts are visible and nobody re-audits them next month:

* Build instructions reproduce exactly; the four symlinks, every `make` target
  and every command the README names.
* `flash01`, `cstr01`, `column01` (every *numeric* claim), `column03`,
  `ammonia01` and the acetone plant's `CLAUDE.md` comparison table all
  reproduce to the digit.
* 16 of 24 audited tutorial headers are fully clean.
* MW recomputed from the declared formula on 565 records: 0 disagreements.
* 1639 validity-range fields: 0 inverted or degenerate.
* 0 components carry both `dissolutionEnthalpy` and `standardThermochemistry`
  (the salt arity ban holds).
* Every one of the GUI adapter's other eight rebuilds carries every field its
  type declares.
