# Files without a notice: what the reviewing session measured

Date: 2026-11-13.  Subject: the coordinator's request on the board (21:40)
for "the list or the rule you applied, and anything beyond a missing
notice".  Measured on main at 3952d49bf4.  Findings: `findings.tsv`
(FH-01 .. FH-05).  No existing file was changed by this work: the
reviewing session's own preparation was stopped when the coordinator's
decision (DEV.md 4c C393) arrived, and its draft tool was deleted
unpushed.

## 1. The rule

A tracked file counts as carrying the notice when its first 4000
characters hold a line matching `Copyright (C|c|©)`.  A second column
says whether the same window holds a licence word, and a third gives the
`SPDX-License-Identifier` value when one is present.  This is the
coordinator's rule; the lists differ from its table only in which files
are counted.

## 2. The two lists

`code_files_without_copyright_line.tsv` (979 rows: path, kind, licence
word, copyright line, identifier).  It counts EVERY tracked file under the
code directories, so it is wider than the coordinator's table:

| kind | rows | of which cannot hold a comment, or are not code |
|---|---|---|
| bin | 542 | 29 Markdown, 16 spreadsheets, 14 tables, 7 text, 4 XML; 444 are Python, 11 C++ probes, 14 scripts with no extension |
| gui-tests | 155 | |
| gui-other | 148 | 131 JSON (120 of them `gui/schemas/operations`) |
| gui-src | 60 | |
| guide-source | 28 | all (a separate work; the manifest) |
| ci | 17 | |
| engine | 16 | |
| site | 7 | |
| make | 4 | |
| etc | 2 | |

`notices_naming_another_holder.tsv` (125 rows: path, kind, the notice as
written).  Every tracked file whose notice names a holder other than the
project's.  These are the files a stamping tool must never touch.

## 3. Beyond a missing notice

- **Third-party and vendored text** (FH-01).  Carry their own holder and
  must keep it, with no project line added:
  `bin/curate/enrtl_ref/enrtl.py` and `enrtl_reference_states.py`;
  `bin/curate/lvpp_sigma_profile.py` quotes the database's notice in its
  docstring (the script itself is the project's, and already carries the
  licence identifier); everything under `bin/curate/nanofiltran/`
  (vendored as received: the Fortran source's own notice is not valid
  UTF-8, `src/SIMPLEX.F` and `LICENSE-LAPACK.txt` name their own
  holders; 29 tracked files in all);
  `gui/public/THIRD_PARTY_NOTICES`,
  `gui/public/plotly-basic.min.js.LICENSE.txt`; everything under
  `thirdParty/`; `LICENSE`.
- **Records that carry a database's notice** (FH-02).  111 component
  records hold the line "Copyright (c) 2017 LVPP; cite ..." inside a
  parameter set: 23 under `data/standards/components` and 88 case-local
  copies in 72 case directories (60 under `data/curation/pairs`, 12
  under `tutorials/`).  The
  coordinator's decision leaves data records untouched; the case-local
  copies are under `tutorials/`, so a rule written as "every file under
  tutorials is a case file" would reach them.
- **The holder's name without its accent** (FH-03).  Five files:
  `README-windows.txt:6`, `src/thermo/electrolyte/UnmodelledSolutes.H:5`
  and `.cpp:5`, `src/unitOperations/crystallisation/
  CrystallisationSaturation.H:5` and `.cpp:5`.  A gate that compares the
  holder line as text will read these as a different holder.
- **A licence map that names authors** (FH-04).  `LICENSES/README.md:7-9`
  names two guide authors and an exception for the Developer Guide;
  `NOTICE:19-21` and the preamble's author macro say otherwise today.
  The map should point to the one home and name no one.
- **An existing stamping tool** (FH-05).  `bin/header` already stamps
  the banner from `etc/header.txt` and has a `--check` mode over the
  identifier.  It fills the holder from the local `git user.name` (its
  line 87), which in a managed container is the tool's identity.  A
  second tool beside it would be a second home for the banner.

Withdrawn: an earlier note of this session said `bin/header` held a
malformed identifier.  It does not: the match was the closing quote of a
shell string at its line 55.

## 4. What moves when a header is added

- **Lesson citations by line.**  Of the 16 engine files, two are cited by
  line from the web app's lessons: `CosmoSac.cpp` (17 distinct lines,
  14 citing statements in `CosmoSacTheoryTool.tsx`) and `PairAudit.H`
  (one, in `dataSourcesLesson.ts`).  Three scripts under `bin/curate`
  are cited by line from two lessons (`pairs_c283.py`,
  `check_source_licence.py`, `check_regressed_pairs.py`: six lines).  A
  two-line header after the shebang moves each of them.  The lesson
  citation gate catches all of these; they are listed here so the moved
  count is expected.
- **Readers** (by reading, not measured on a stamped file): a Python
  module docstring must stay the first statement; the `.profile` data
  files under `0/` use `#`; the `.cho` markers are empty by contract;
  goldens are rewritten whole by the recorder; a mirrored record under a
  computational seal takes a comment as cosmetic drift.

## 5. Authorship of commits

Asked by the coordinator: no commit on a branch this session pushed
carries the tool as author (checked on the three branches still ahead of
main).  Six of the eight commits of `fix/declared-phase-beyond-band`
carry the holder as COMMITTER as well as author: a builder committed
without the committer identity set.  Authorship is intact; those six
show as unverified.

## 6. What was NOT done

- No header was written to any file.
- The readers of section 4 were not exercised on stamped copies.
- The 45 commits the coordinator found were not re-counted here (the
  last 400 commits on main all carry the holder as author).
