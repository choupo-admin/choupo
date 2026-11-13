# Review by measurement: the header tool and its gate (`chore/source-headers`)

Date: 2026-11-13.  Asked by the coordinator (board, R7): the tool and
the gate, not the files.  Reviewed at 6985c13390 (merge-base with main
f7e67822c0) on a native build of that commit.  Findings: `findings.tsv`
rows SH-01 .. SH-21.  Scripts and tables: `tool_and_gate/`.

## 1. Verdict

**The stamping is clean.**  The tool is idempotent (2482 code files
read, 0 to change, twice); no file under `data/`, `tutorials/`,
`thirdParty/` or the guides was touched; of the fourteen files outside
data and tutorials that name another holder, thirteen are unchanged and
the fourteenth is the project's own script that only quotes a notice;
the vendored solver's 29 files and the six held scripts are as they
were.  The diff is additive apart from the five accent corrections and
two named rewrites.  450 Python files compile, the module docstring of
all 440 pre-existing stamped Python files is unchanged, shebangs and
modes are preserved, the engine builds and the web app typechecks.

**The branch does not pass two of the project's own checks** (SH-01,
SH-02), and **the gate holds less than the ruling says** (SH-03 to
SH-07).

## 2. The two that stop integration

| id | check | on the branch | on the merge-base |
|---|---|---|---|
| SH-01 | `python3 bin/curate/repoint_lesson_citations.py --check` | exit 1: 25 stale, 1 refused as ambiguous (`PairAudit.H:112`) | exit 0 |
| SH-02 | `python3 bin/curate/gate_manifest.py --check` | exit 1: "check_source_headers is a gate with no manifest entry" | exit 0 |

Both reproduced by the reviewing session.  SH-01 also fails 15 lesson
tests.  The re-point tool repairs 25 of the 26; the ambiguous one needs
a person.  SH-13: 38 further `file:line` strings that no tool reaches
(a lesson string shown to the student, comments in a guide's source)
point into stamped files.

## 3. What the gate does not hold

By-hand sabotages, each applied, the gate run, restored
(`tool_and_gate/sabotage.tsv`).

| sabotage | gate |
|---|---|
| the copyright line removed from an engine file | caught |
| the identifier line removed from a script | caught |
| a new file with no header, in each of seven kinds; a new directory | caught |
| the project's header on a third-party file (three of them) | caught |
| a commit authored by someone not listed; a merge commit authored by the tool | caught |
| the holder replaced by another name listed in AUTHORS | **passes** (SH-04; reproduced by the reviewing session) |
| a co-holder appended to the holder line | **passes** (SH-04) |
| a second, foreign copyright line added beside the project's | **passes** (SH-04; reproduced by the reviewing session) |
| the header inside a string literal instead of a comment | **passes** (SH-03) |
| the full header on a HELD file; the holder without its accent, or the identifier alone, on a third-party file | **passes** (SH-05) |
| a new script at the repository root | **passes** (SH-06) |
| a second licence identifier in one file | **passes** (SH-09) |
| the year changed | passes, and the gate says it does not hold the year |

The ruling the gate was built for is "his name alone, with its accent,
on every code file".  As built, the gate holds "some name listed in
AUTHORS begins some copyright line, and no line of the exact form
`Copyright (C) <year> <unlisted name>` is present".

The tool has the mirror hole (SH-07): its guard against another holder's
notice recognises one spelling of a notice; a file whose notice is
written in four other common forms is stamped.  On today's tree it
stamped none wrongly (section 1); the hole is for the next file.

## 4. The manifest and the record

- `REUSE.toml` is read by nothing (SH-11).  Every glob matches today; 16
  excluded files that cannot hold a comment are in no annotation.
- The exclusion table cites rulings as "DEV.md 4c C393, ruled" that are
  in no `DEV.md` (SH-12).
- Under the code roots every tracked file is stamped (2482), excluded by
  a named rule (255) or reported as unclassified (0).  Outside them, by
  decision, 165 scripts and sources under `docs/`, `tutorials/`, `data/`
  and two smaller trees carry no header.

## 5. What was NOT reviewed

- `bin/runTests --gui` as a suite; `check_gate_selftest`.
- The 760 files one by one; whether each copied banner equals its
  neighbour's byte for byte.
- Whether the manifest is valid under its specification.
