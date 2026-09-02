# The student walkthrough

*The programme, its legs, and where each one lives — written 2026-09-02,
the day it was found to have no home.*

## 1. What it is

A recurring exercise with one rule: **play the student, do what they would
do, and record what stops them.**  Not a review of the code, not a reading
of the manuals — a walk, with the friction hit rather than imagined.  Each
leg asks one question a final-year student asks in order, and each leg's
findings are fixed at the source and written down where the next session
can find them.

It is the instrument behind most of what this project fixed in the last
week of August, and it had no record of its own: legs 4 and 5 named
themselves in their design records, leg 6 named itself in a commit body and
in a task title, and the legs before 4 were named in nobody's file.  A
programme whose legs live in session memory is exactly the kind of fact
CLAUDE.md §10 says a successor will not be able to suspect is missing —
this record is the correction.

## 2. The legs, from the tree

Every entry below is cited to the commit or record that carries it.  Where
the tree does not say, this record says so rather than filling the gap.

| leg | question | date | where |
|---|---|---|---|
| (unnumbered) | *Can a student author a capstone case from nothing?* — three walls: a case-only component name refused with advice to ESTIMATE it; `inputs ( feed )` and `in feed;` not equivalent, failing three layers down; a bare flow number run as kmol/s, a plant 3600× too large with every balance closed | 2026-08-27 | commit `b855223a0`, "Three walls a student hits in the first hour" |
| **4** | *Can the student say where a number came from?* — take €166,653 off the costing table and try | 2026-08-27 | commit `784e81c20`; [`a-cost-you-can-defend.md`](a-cost-you-can-defend.md), [`the-key-nobody-read-in-the-postdict.md`](the-key-nobody-read-in-the-postdict.md) |
| **5** | *Can the student get it OUT?* — sizing and costing left no file at all | 2026-08-27 | commit `758be03ca`; [`the-deliverable.md`](the-deliverable.md) |
| (unnumbered) | *Does the kit the student is told to paste into a chat fit the window?* — `llmctx` said "well under any modern context window" at ~134 k tokens | 2026-08-28 | commit `69e29eaa3` |
| **6** | *The first hour, walked for real* — `bin/newCase`, then authoring using only the scaffold's own guide; the guide's own `shortcutColumn` example used five keys the engine never read | 2026-08-29 | commit `c9c1c2ca3` |
| **7** | *What does a student meet FIRST?* — the app offered four "first clicks" and the inventory declared none of them a tutorial; five of 393 cases were tutorials at all.  Nineteen cases chosen by reading, each with a README written from its golden and every claim run before it was written | 2026-09-02 | the `tier tutorial;` READMEs; DEV.md §4 (September) |
| **8** | *Does the DELIVERED app do what the engine does?* — the frozen release app fetched its engine from the site root; a disabled tab named the wrong reason | 2026-09-02 | `bin/drive-app`; RELEASING.md's freeze step |
| **9** | *Can the student READ the lesson where they run the case?* — the nineteen READMEs of leg 7 were bundled into the app and read by nothing: listed last in the Case view, painted as a dictionary, absent from the intro and the Open Case dialog | 2026-09-02 | `gui/src/case/lesson.ts` (a rendering subset that refuses outside itself), `gui/tests/firstPath.test.ts`; the dialog's "start here" folder reads `tier tutorial;` |

**Legs 1–3 are not in the tree.**  No commit, record or task numbers a leg
below 4.  Either the numbering began at 4 (the three-walls commit of the
same morning reads like the walk's opening and carries no number), or
earlier legs were walked in a session and never written down.  The tree
cannot say which, and this record does not guess — an invented leg would be
a falsely sourced fact, which is the one conversion this project forbids.

## 3. What the legs have in common

* **The findings were never where anyone was looking.**  Leg 4's chain was
  correct at every step in the source and untraceable from the output.  Leg
  5's two most-needed reports were declared by zero cases.  Leg 6's guide
  example was wrong in the one place a student copies from.  Leg 8's
  frozen app passed every check that read it at rest.
* **The method is cheap and the yield is high**, because it measures the
  artefact a student meets instead of the source a developer reads.  The
  same instrument — drive the real thing, record what it does — found the
  catalogue drift against Poling and the 133 undefined lesson symbols.
* **Every fix went to the source of the falsehood, never to the symptom**:
  the guide regenerates from `docs/ai/unit-ops.md`; the reports serialise
  rather than recompute; the engine paths resolve from the app's base.

## 4. What is next, named

Leg 6's own closing line: *"GUI path and output legibility are the next
legs of the first hour."*  Leg 8 built the instrument for the GUI path
(`bin/drive-app`) and drove the frozen 2608 copy through every tutorial;
the dev-server mode is written and, in the container this was built in,
untested against an engine (no emscripten there).  Output legibility — what
a student reads in the Log tab and whether it says what the engine did — is
the leg after, and the CSTR console lines found on leg 7 (an `F_out`
1000× off, an unlabelled cumulative Newton count) are its first two
findings, fixed the same day.

## 5. Not in scope, said plainly

This record does not decide what the first path should contain — that is
a professor's reading, and the nineteen cases declared on 2026-09-02 are an
architect's default under philosophy §4, reversible in one word per
controlDict.  It does not gate anything: a walk is a measurement, and the
gates it produced (`check_cost_provenance`, `check_lesson_symbols`,
`check_case_tiers`) each carry their own record.
