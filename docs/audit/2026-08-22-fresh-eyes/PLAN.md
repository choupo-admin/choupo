# Fresh-eyes audit — campaign plan

*Opened 2026-08-22.  **STATUS: WORKING DRAFT — NOT AUTHORITY.**  This directory
sits deliberately OUTSIDE `docs/architecture/`, whose README carries a
four-level authority map: an unratified document filed there acquires the look
of law without being law.  Nothing here decides anything.  Promotion of any
finding to a contract goes through the normal route — written, refused by name,
a case that FIRES the refusal — and is the architect's act, not this file's.*

---

## 1. What this campaign is

A full read and audit of the project by an assistant with no prior context,
commissioned so the architecture can afterwards be consolidated and assessed
against **Gall's Law**: *a complex system that works is invariably found to
have evolved from a simple system that worked.*  The question that lens asks of
every subsystem is not "is this good?" but "did this GROW from something simple
that already worked, or was it DESIGNED complex up front?"

The consolidation decision itself is explicitly NOT part of this campaign.
Evidence first; the ruling comes after, and it is the architect's.

## 2. The law this campaign runs under

`docs/architecture/development-governance.md` (level 1) already specifies the
shape of an assisted fleet, and it was read BEFORE the fleet was deployed
rather than after.  What it dictates here:

- **Production does not parallelise; verification does.**  Hence: many
  read-only auditors asking the whole corpus one question each, in parallel and
  conflict-free; one architect, serial, owning integration and arbitration.
- **Auditors are read-only** — "an agent that both finds and fixes cannot be
  trusted about what it found."  Enforced BY CONSTRUCTION here (the auditors
  are given a tool set with no write capability), not by instruction.  This
  follows the project's own precedent of enforcing a boundary with a mechanism
  rather than a comment (`AnalysisReconciler`'s translation unit).
- **Every finding carries file:line and a verbatim quotation**, plus a concrete
  FAILURE SCENARIO; a finding whose failure scenario cannot be constructed is
  dropped however plausible it looks.
- **CONFIRMED and SUSPECTED are never mixed.**  A short CONFIRMED list
  outranks a long mixed one.
- **Coverage is reported, not implied** — an audit states what it actually
  inspected, so a clean result cannot be mistaken for a complete sweep.
- **An audit produces evidence, never authority.**

Two measured physical constraints also bind the campaign:

- **Never build while the suite runs** (36 spurious failures in one observed
  instance; relinking under a running binary yields exit 127).  Build and
  regression are therefore strictly serialised here.
- **The working tree is not durable** — it has reverted to an older snapshot
  five times in a single session.  *Work exists only once pushed.*  Hence this
  file is committed and pushed before the findings arrive, not after.

## 3. The seven questions

Each auditor asks the WHOLE repository exactly one question.  The questions are
chosen so that no producer would ask them in the course of producing anything —
which is where this project's highest-yield findings have historically come
from.

| # | question |
|---|---|
| 1 | Which facts have MORE THAN ONE HOME? (invariant I1, the arity doctrine) |
| 2 | Which of the ~149 `check_*` gates can NOT actually fail? |
| 3 | Which claims in the level-1/level-2 authority documents are CONTRADICTED by the tree? |
| 4 | Where does the engine SILENTLY substitute, default or fall back? (invariant I5) |
| 5 | What exists in the engine that NO case and NO gate can reach? |
| 6 | Which cases PIN NOTHING, and which published numbers can no golden reach? |
| 7 | What is the growth and complexity SHAPE of each subsystem? (measurement only) |

Questions 1, 2, 4 and 5 are pointed at defect classes this project has ALREADY
paid for at least once — a second home that drifted, a permanently-green gate,
an unannounced substitution, a correct-but-unreachable model.  A class that has
bitten once is the cheapest place to look for the instance nobody has found yet.

Question 7 is deliberately measurement-only.  The auditors find; the architect
judges.  Handing an auditor the Gall's Law question would return a judgement
nobody verified.

## 4. Ground truth, taken first

Measured on the clean checkout at commit `bd10220b`, before any auditor ran:

| quantity | value | how |
|---|---|---|
| C++ files | 648 | `find src -name '*.cpp' -o -name '*.H' \| wc -l` |
| C++ lines | 145 386 | `find src \( -name '*.cpp' -o -name '*.H' \) -exec cat {} + \| wc -l` |
| tutorial cases | 391 | `find tutorials -name '*.cho' \| wc -l` |
| gates | 149 | `ls bin/curate/check_* \| wc -l` |
| curated records | 796 | `find data/standards -name '*.dat' \| wc -l` |
| markdown docs | 162 | `find docs -name '*.md' \| wc -l` |
| LaTeX guides | 18 | `find docs -name '*.tex' \| wc -l` |

These are counts taken here, once, for orientation.  Per the arity doctrine
they are NOT a second home for anything generated — the authority on corpus
size remains `generated/releaseInventory.json`.  If a number above disagrees
with that file, that file wins and this table is the stale copy.

The regression verdict is deliberately absent from this table: it is taken by
running `bin/runTests`, and a verdict transcribed into prose is a verdict that
drifts.

## 5. What this campaign will NOT do

- It will not reopen a SETTLED contract.  Where an auditor's evidence suggests
  a settled contract is wrong, the finding is **flagged with its evidence and
  stops there**.  Flagging is not reopening; reopening is the architect's act.
  This preserves the reason the no-relitigation rule exists — churn — while
  still letting fresh eyes report what they see.
- It will not fix anything it finds, in this phase.  Finding and fixing in one
  pass destroys the trustworthiness of the finding.
- It will not invent a citation, a parameter, or a source to close a gap.  A
  visible gap is strictly better than an invisible falsehood.
