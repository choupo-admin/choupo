# Integration has a cost, and three tools remove the part that is not judgement

*Kind: ADR.  Status: BUILT 2026-11-01 (DEV.md 4c C196, items a-c).*

---

## 1. The defect

With several generals running, one commander integrates their branches.  In one
week the same mechanical work was done by hand repeatedly:

* the counts in `docs/architecture/decision-records.md` (prose said 192, the
  table held 193; a union merge had even left three versions of each count
  sentence in the committed file);
* the registration lines every new gate, sizer and unit adds
  (`bin/runTests`, `EquipmentSize.cpp`, `UnitOperation.cpp`): two branches add
  different lines at the same spot, which is a textual conflict and no
  disagreement;
* GUI lessons cite engine lines as `file:line`, and a test holds each cited
  line to the text the lesson claims for it.  Any engine edit that moves lines
  turns lesson tests red, and the repair (find where the text went, edit the
  number in the source AND in the test) was done by ad-hoc script in four files.

None of it is judgement; all of it costs a turn.  Three tools.

## 2. (a) `bin/curate/repoint_lesson_citations.py`

Reads every citation it can parse, checks that the claim still holds at the
cited line(s), and for a stale one finds the place within a window (default
+/-40 lines) where the claim holds.  One place: the number is edited
everywhere that same citation is written.  Two places or none: **REFUSED by
name**, nothing guessed.  `--check` reports and exits 1 if anything is stale;
`--inventory` prints the shapes below for the tree as it is.

When a claim spanning a range holds at several places, the tool takes the one
at the shift of the nearest already-decided citation of the same file (an edit
shifts neighbouring lines alike), says so on the line it prints, and refuses
when no candidate has that shift.

### 2.1 Inventory of citation shapes (gui/src, gui/tests; measured 2026-11-01)

| shape | where | managed |
|---|---|---|
| R: `{ file: MAIN, line: 521, contains: "text" }` records, `file` a const or a string | `runLog.ts` (103), `caseAssembly.ts` (62) | yes |
| C: `"Base.cpp:383": "text"` / `/regex/` keys of a `CLAIMS` table, the same token repeated as prose in the lesson source (also across a `"..." + "..."` break), and the tuple form `"Base.cpp:33-34": [path, 33, 34, claim]` | `plantLayout`, `gmpLayout`, `syngas`, `materials`, `solventMixture`, `correlationSimplicity`, `dataReconciliation`, `letdown` lesson tests (144) | yes |
| T: `["path", 1612, "text"]` ANCHORS tuples; the lesson prose cites a RANGE that contains the anchor, so the prose range is shifted by the same amount | `bodeLesson`, `elementPotentialLesson`, `numericsLessons` tests (107) | yes |
| prose `Base.cpp:N-M` with no machine-readable claim (en-dash ranges, comment citations, `toContain("X.cpp:47")` asserts) | 61 lesson/tool/test files (`--inventory` lists them) | NO |
| computed in the test (`/PropertyEvaluator\.cpp:(\d+)/.exec(all)` then compared) | `overpressure.test.ts` | NO |

An unmanaged shape is not touched; a stale one still fails its test and is
repaired by hand, as before.  Adding a shape is adding one scan rule.

### 2.2 Verified on a case made for it

In a scratch copy of the tree, three blank lines were inserted near the top of
`src/applications/choupoSolve/main.cpp` and five in `PlantLayout.cpp`.
`--check` reported 79 citations stale; the tool re-pointed them (runLog and
caseAssembly records, the plant-layout CLAIMS keys and the prose repeating
them); `npx vitest run tests/runLog.test.ts tests/caseAssembly.test.ts
tests/plantLayoutLesson.test.ts` then passed 253/253 with no hand edit, and a
second `--check` was clean.  A wider shift (two lines in six cited files) was
re-pointed with three ambiguous range claims resolved by the neighbour rule,
and the bode, numerics, syngas, caseAssembly and runLog tests passed.

Gate `check_citation_repointer` builds a synthetic tree with one fixture of each
managed shape, shifts the cited file, requires the expected lines, a clean
`--check` and a no-op second run, and requires an ambiguous and a missing claim
to be refused with the citation left unedited.  Six by-hand sabotages of the
tool were each caught (ambiguity guessed; the `" + "`-break token pattern
removed; anchor shifts dropped; a missing claim accepted; test files skipped; the tuple number left unedited).

`bin/integrate`: when its `--gui` step fails, it runs the tool in the
integration worktree, announces each re-point, commits them, and re-runs ONLY
the failing GUI test files, once.  The earlier failure is dropped from the
verdict only if that re-run passes and nothing but `gui-tests` had failed.

## 3. (b) The decision index counts are generated

`check_decision_index.py --write` rewrites exactly the three count sentences
(`when N records already exist`, `Of N design records, **M state a rejected
alternative and K do not**`, `**K of N records state no rejected
alternative.**`) from the table, in every place they occur, and collapses a
sentence line repeated directly after itself (the debris of a union merge).
Idempotent.  What the gate checks is unchanged; its FAIL message now prints the
command.  This record's row was added by hand and the counts by `--write`.

## 4. (c) `bin/integrate` keeps both sides of an additive registration conflict

A conflict in exactly `bin/runTests`, `src/postProcessing/sizing/EquipmentSize.cpp`,
`src/unitOperations/UnitOperation.cpp` or `docs/architecture/decision-records.md`
is resolved when BOTH sides only ADD lines to what the merge base had: at each
position of the base, main's added lines then the branch's, then the base line.
This is computed from the three index stages, not with the stock union merge,
which was measured to repeat unchanged lines lying between two nearby hunks.  A
side that also changes or removes a base line, a file without a common base,
and any other file STOP the run as before.  Each resolution is announced with
the file and the added lines.  For the index the count sentences are masked
before the comparison (both sides "changed" them only because they counted) and
`check_decision_index --write` runs after.

Tested on a throwaway repository in which two branches added different gate
blocks, include and `reg(...)` lines, and index rows: both kept, in order, the
counts rewritten, the merge committed; a branch that edited the base line next
to the other side's addition STOPPED naming the file and the line; a conflict
in an unlisted file STOPPED.

## 5. Rejected

* Resolving every conflict in a registration file by `--union`: wrong on nearby
  hunks (above).
* Re-pointing by a per-lesson line delta: a citation inside a moved block and one
  after it shift differently; the claim's text is the only anchor that does not
  drift.
* A tool that fixes the stale unmanaged shapes by guessing from prose: a number
  with no claim has no anchor.

## 6. Not done

* The unmanaged shapes of 2.1.
* The second half of C196 (the WASM site is rebuilt only by CI): a plan row, not
  this record.
* The first-law, golden and gate-manifest conflicts keep their existing
  handling in `generated_artefacts.py`.
