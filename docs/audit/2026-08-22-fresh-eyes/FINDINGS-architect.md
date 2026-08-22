# Architect's own findings — serial track

*Working draft, opened 2026-08-22.  **NOT AUTHORITY.**  These are the findings
the architect took himself, in the serial track, while the read-only auditors
worked in parallel.  Each carries file:line, a verbatim quotation, and a
failure scenario, or it is not here.*

---

## CONFIRMED

### A1. The repository history is NOT in this checkout (environment, not defect)

**Evidence.**

    $ git rev-parse --is-shallow-repository
    true
    $ ls .git/shallow
    .git/shallow                       (exists, 41 bytes)
    $ git rev-list --count main
    50
    $ git log --format='%h %ad %s' --date=short main | tail -1
    bf12487a 2026-08-17 The publish refused over a notice for a file nobody receives

Fifty commits, the oldest dated 2026-08-17.  The project's own documents
describe work from 2026-05-16 onward, so upwards of three months of history is
absent from this working copy.

**Failure scenario.**  Every file in the tree reports the same creation date
under `git log --diff-filter=A`.  An audit that measures "when did this
subsystem appear" from this checkout concludes that the ENTIRE project was
created on one day — which is the exact signature of a system designed complex
up front, and it would be a pure artefact of the clone.  A Gall's Law
assessment taken this way would reach the most consequential possible
conclusion on evidence that does not exist.  Nothing in the tree announces the
truncation; `git log` succeeds and prints a plausible history.

**Consequence, already acted on.**  The growth half of the accretion survey was
redirected mid-flight to reconstruct the chronology from the project's own
dated prose (`decision-records.md`, `CLAUDE.md` §5/§6, `CHANGELOG.md`, source
header comments), with the standing requirement that the reconstruction be
labelled as documentary and not as a measurement of the repository — it
inherits whatever errors the prose contains, and the prose has been wrong
before.

**This is not a criticism of the project.**  It is a property of how this
session's working copy was created, and it bounds what this campaign can
honestly claim.

### A2. The stopping rule of §5a is satisfied over the last 15 slices — by a PROXY test whose blind spot is stated

**The rule** (`docs/architecture/project-philosophy.md` §5a, level 1, ruled by
Vítor 2026-08-09):

> "Three consecutive substantial slices that fit inside the existing
> architecture without reopening a Level-1 or Level-2 boundary are evidence
> that the architecture is FROZEN."

**What was measured.**  For each of the last 15 commits on `main`, whether it
modified any of the eleven level-1/level-2 authority documents.  Result: 13 of
15 touched none.  The two that did are both index maintenance, not boundary
work:

- `020b4650` — `decision-records.md` only, +4/-3: adds one design record to the
  ADR index and recounts.  Quotation: `-## 1. Why an index, when 77 records
  already exist` / `+## 1. Why an index, when 78 records already exist`.
- `60623158` — `decision-records.md` only, same shape, 76 → 77.

An independent count taken here agrees with the index: `ls docs/design/*.md |
wc -l` → **78**, and the index says 78.

**THE BLIND SPOT, stated rather than discovered later.**  Editing a level-1
document is a PROXY for reopening a boundary, and it is the weaker direction of
the two.  The dangerous case is the opposite: a new architectural boundary
introduced in `src/` — a new subsystem, a new abstract base, a new special-case
path — **without any document being touched**, which is precisely how a
boundary gets reopened silently.  That test requires knowing which source files
are NEW, and per A1 this checkout cannot answer that.

**So the honest verdict is:** no slice in the last 15 announced a boundary
reopening, and this campaign currently has no instrument that could detect an
unannounced one.  That gap is the reason the parallel auditors were pointed at
reachability and at duplicated homes — both of which detect a new boundary by
its consequences rather than by its birth date.

---

## DROPPED — a candidate that failed the failure-scenario test

Recorded because the discipline is only visible when something actually fails
it.

**Two distinct classes share the name `TransportModel`:**

    src/thermo/transport/TransportModel.H:64            class TransportModel
    src/unitOperations/membrane/transport/TransportModel.H:115  class TransportModel

and two different translation units include them by the SAME string:

    src/thermo/ThermoPackage.cpp:43                #include "transport/TransportModel.H"
    src/unitOperations/membrane/SpiralWoundModule.cpp:42   #include "transport/TransportModel.H"

**Why it is dropped.**  The two classes are in different namespaces —
`Choupo::TransportModel` and `Choupo::membrane::TransportModel` (the second
nested inside `namespace membrane {` at line 77) — so there is no C++ collision.
The identical include strings resolve correctly and deterministically, because a
quoted include is searched relative to the including file's own directory first;
each `.cpp` therefore reaches the header in its own subtree by the language
rule, not by luck of include-path ordering.

No concrete wrong answer could be constructed for a user.  Per
`development-governance.md` §5.3 — *"If that scenario cannot be constructed, the
finding is dropped, however plausible it looks"* — it is dropped.  It survives
only as an observation about vocabulary, relevant to how many distinct concepts
the naming scheme carries, and not as a defect.

---

## Measurements taken (not findings)

| quantity | value | method |
|---|---|---|
| abstract base classes in `src/` | 41 | `grep -rlE 'virtual[^;]*=\s*0\s*;' src --include=*.H \| wc -l` |
| commits available on `main` | 50 | `git rev-list --count main` |
| design records | 78 | `ls docs/design/*.md \| wc -l` |

The abstract-base count is a PROXY (a header declaring at least one pure
virtual); it counts headers, not classes, and a header holding two abstract
bases counts once.  Stated so the number is not later quoted as exact.

---

## A1 — SUPERSEDED, and the correction is itself the finding

`git fetch --unshallow origin` succeeded.  The history IS recoverable and is now
present:

    $ git rev-parse --is-shallow-repository        → false
    $ git rev-list --count main                    → 1175
    $ git log --format='%h %ad %s' --date=short main | tail -1
      7ec686c13 2026-06-19 Choupo — open-source, glass-box educational chemical process simulator

Commits by month: 2026-06 → 103 · 2026-07 → 444 · 2026-08 → 628.

A1 stands as a record of what a truncated clone would have made this campaign
conclude, and of the fact that nothing announced the truncation — `git log`
succeeded and printed a plausible history.  Its remedy was to try the recovery
before reporting the limitation.  The accretion survey has been redirected back
to real git dates.

---

## A3. WHAT GREW IS NOT THE ENGINE — it is the machinery that checks the engine

This is the central measurement for the Gall's Law question, and its answer was
not the expected one.

**The initial commit, `7ec686c13` (2026-06-19): 3336 files, 241 836 insertions.**

| quantity | at first commit | today (2026-08-22) | factor |
|---|---|---|---|
| C++ lines under `src/` | 72 050 | 145 386 | ×2.0 |
| C++ files under `src/` | 426 | 648 | ×1.5 |
| tutorial cases (`*.cho`) | 222 | 391 | ×1.8 |
| **gates (`bin/curate/check_*.py`)** | **1** | **149** | **×149** |
| markdown docs under `docs/` | 24 | 164 | ×6.8 |
| documents in `docs/architecture/` | 0 | 32 | from nothing |

Methods: `git ls-tree -r --name-only 7ec686c13 | grep -cE '^src/.*\.(cpp|H)$'`
and, for lines, `git show 7ec686c13:<path>` summed over that list; today's
figures by the same `find`/`wc` commands recorded in PLAN.md §4.

The single gate present at the first commit is `bin/curate/check_ion_pins.py`.

**Scale of the machinery today**: `bin/curate/` holds 196 Python files and
43 572 lines, of which the 149 gates are 32 972 lines; `bin/runTests` is a
further 3637 lines.  The verification and curation layer is therefore roughly
**30 % the size of the engine it verifies**, and it did not exist at the start.

### What this does and does not license anyone to conclude

**It does NOT show that the engine was designed complex up front.**  Git cannot
see the engine's genesis: the project's own documents date decisions to before
the first commit — the GUI credo to 2026-05-16 and the property architecture to
2026-06-05, both weeks earlier — so roughly five weeks of development preceded
the repository.  Whether the engine grew from a simple working thing in that
period is a question this repository cannot answer, and no measurement here
should be quoted as answering it.

**It DOES show, with dates, that the verification and governance layer grew by
accretion** — from one gate to 149, and from no architecture documents to
thirty-two — over the sixty-four days the repository covers.  That growth is
recorded, in this project's own idiom, one defect at a time: nearly every gate
names the specific defect that paid for it.

**The consolidation question therefore points somewhere unexpected.**  If a
subsystem here grew large by accretion without anyone having stepped back to ask
whether it still has a simple core, the strongest candidate is not the engine.
It is the 43 572 lines of checking machinery, which was built one gate at a time
under exactly the pressure that produces accretion, and which — unlike the
engine — has never been the subject of an architecture document of its own.

Stated as a hypothesis with its evidence, not as a conclusion.  What would
confirm or refute it: whether those 149 gates share a small number of common
shapes that could be expressed once, or whether each genuinely needs its own
code.  That is measurable and is not yet measured.
