#!/usr/bin/env python3
"""Gate: the way in still leads somewhere.

    bin/curate/check_start_here.py

WHY THIS EXISTS.  `docs/start-here.md` names NINE cases in order and tells a
newcomer to run them.  It is the first thing a student is pointed at, from the
README and from `listCases`, so a broken step there is not an inconvenience --
it is the project failing at the only moment it gets a first impression.

And it is EXACTLY the shape that rots quietly.  A curated list of paths, held
in prose, referring to directories that other work renames, moves or retires.
Three derived artefacts were found stale in one week for want of a check
(the WASM sixteen days behind the engine, the tutorials guide a corpus behind,
schemas-reference caught only because it HAD one).  This is a fourth of the
same family, written down before it had a chance to rot rather than after.

  (S1) EVERY case the path names EXISTS as a runnable case directory.  A dead
       path in the first document a student opens is worse than no document.

  (S2) EVERY case the path names is COVERED BY THE SUITE -- it ships an
       `expected` golden, so `bin/runTests` checks its ANSWER and not merely
       its exit code.  This is
       what lets start-here.md promise that a failure is a real signal and not
       an unguarded case drifting.  A step without a golden could break for
       months with nobody noticing.

  (S3) THE PATH IS STILL A PATH: at least eight steps, in ascending order, no
       repeats.  A curated sequence that loses its ordering has become a list,
       and a list is what the document exists NOT to be.

  (S4) IT IS REACHABLE.  The README and `bin/listCases` both point at it.  A
       way in that nothing links to is a file, not a way in -- the same defect
       this gate's own family keeps producing.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it:
whether the ORDER is pedagogically right, whether nine is the right number, or
whether the one-line "new idea" under each step is true of the case.  Those are
teaching judgements and belong to whoever teaches the course; no gate can make
them.  What is checked is that the path is intact, guarded, ordered and
findable.

AND IT FOUND ONE ON ITS FIRST RUN, before either sabotage.  Step 2
(`compare_activity_etoh_water`) shipped no golden: the suite ran it and
checked only that it did not crash, so the document's promise -- "a failure
here is a real signal" -- was one the corpus could not keep for that step.
Its golden was recorded rather than the step replaced; a published case pinned
by nothing is the same defect one layer down, and worth fixing on its own.

SABOTAGE-VERIFIED 2026-08-14; OBSERVED output recorded.

Sabotage 1 -- a step repointed at a case directory that does not exist:

    check_start_here: FAILED
      S1: step 4 names tutorials/steady/distillation/column01_benzene_XX,
      which is not a case directory -- the first document a student opens
      sends them somewhere that is not there

Sabotage 2 -- the README's link removed:

    check_start_here: FAILED
      S4: README.md does not link docs/start-here.md -- a way in that
      nothing points at is a file, not a way in
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "docs" / "start-here.md"

fails = []

if not DOC.exists():
    print("check_start_here: FAILED\n  docs/start-here.md is gone, and the "
          "README and bin/listCases both point at it.")
    sys.exit(1)

text = DOC.read_text(encoding="utf-8")

#  The steps are the numbered headings' following case path.  Read the ORDER
#  from the headings so a reordered document is a reordered path, not a
#  silently different one.
steps = re.findall(r"^### (\d+)\.[^\n]*\n`(tutorials/[^`]+)`", text, re.M)

if len(steps) < 8:
    fails.append(f"S3: the path has {len(steps)} step(s) -- a way in with "
                 "fewer than eight has stopped being the sequence this "
                 "document exists to be")

numbers = [int(n) for n, _ in steps]
if numbers != sorted(numbers) or len(set(numbers)) != len(numbers):
    fails.append(f"S3: the step numbers are {numbers} -- a curated sequence "
                 "that loses its ordering has become a list, and a list is "
                 "what this document exists NOT to be")

seen = set()
for n, case in steps:
    d = ROOT / case
    if not (d / "system" / "controlDict").exists():
        fails.append(f"S1: step {n} names {case}, which is not a case "
                     "directory -- the first document a student opens sends "
                     "them somewhere that is not there")
        continue
    if not (d / "expected").exists():
        fails.append(f"S2: step {n} ({case}) ships no `expected` golden, so "
                     "the suite checks only that it does not crash, never that "
                     "its ANSWER has not moved -- this document promises that a "
                     "failure here is a real signal, and a case pinned by "
                     "nothing cannot keep that promise")
    if case in seen:
        fails.append(f"S3: {case} appears twice in the path")
    seen.add(case)

for who, path in [("README.md", ROOT / "README.md"),
                  ("bin/listCases", ROOT / "bin" / "listCases")]:
    if "start-here.md" not in path.read_text(encoding="utf-8"):
        fails.append(f"S4: {who} does not link docs/start-here.md -- a way in "
                     "that nothing points at is a file, not a way in")

if fails:
    print("check_start_here: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print(f"check_start_here: OK -- the way in is intact: {len(steps)} ordered "
      "steps, every one an existing case that ships a golden and is therefore "
      "checked on every suite run, and both the README and bin/listCases point "
      "at it.  NOT CHECKED: whether the ORDER is pedagogically right, whether "
      "nine is the right number, or whether each step's one-line claim is true "
      "of its case -- those are teaching judgements and no gate can make them.")
