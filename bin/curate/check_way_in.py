#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_way_in -- 2 former gates run as ARMS of one script (DEV.md 4c C419).

Former gates, each moved here verbatim as a function (its own docstring first,
its own checks, its own printed lines): check_start_here, check_first_path_agrees.
Each arm prints exactly what its gate printed; this runner prints ONE claim
line first (`check_way_in: OK -- ...`) that carries every arm's own claim, then
the arms' output, and exits non-zero when any arm does.  An arm that fails does
not stop the others: every verdict is reported.
"""

import contextlib
import io
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

def arm_start_here():
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


def arm_first_path_agrees():
    """check_first_path_agrees -- two surfaces claim to be the way in; they agree.

WHY THIS GATE EXISTS
--------------------
A student arriving at Choupo meets a document and an application, and both
offer to tell them what to open first:

  * `docs/start-here.md` -- "Start here -- nine cases, in this order".  Nine
    cases, a deliberate sequence, each entry arguing why it follows the one
    before.  This is the curriculum.
  * the app's Open Case dialog -- a virtual folder labelled "start here: the
    first path", built from every case carrying `tier tutorial;`
    (gui/src/cases/tutorials.ts, FIRST_PATH).

Measured on 2026-09-24, before this gate: three of the nine carried the tier
word.  Six did not -- including `tutorials/plant/acetonePlant`, the plant the
whole document builds toward.  So a student who read the curriculum and a
student who clicked the folder were taught two different courses, and neither
surface knew the other existed.

THE RULE, and it is arity and nothing more: THE WRITTEN CURRICULUM IS THE ONE
HOME OF THE FIRST PATH, AND THE APP'S FOLDER MUST CONTAIN ALL OF IT.

WHAT THIS GATE IS CAREFUL NOT TO DO
-----------------------------------
`check_case_tiers` states in its own blind-spot list that it deliberately
does NOT check coverage -- "a gate demanding growth would defeat the
doctrine", because a new case is a WITNESS by default and the learning
surface grows only by deliberate promotion.  This gate does not demand
growth either.  It demands only that the cases a HUMAN-WRITTEN curriculum
already teaches carry the word that makes them visible where the app says
the way in is.  Writing `docs/start-here.md` IS the deliberate promotion;
this gate holds the two ends of that act together.

The folder may hold MORE than the nine, and does.  That is not a finding:
the curriculum is a path, the tier is a set, and a path through a set is
the normal relation.  Only the reverse -- a taught case missing from the
set -- is the defect.

WHAT THIS GATE CHECKS
---------------------
(a) Every case `docs/start-here.md` names in a numbered entry EXISTS on disk
    and carries a `system/controlDict`.
(b) Every one of them declares `tier tutorial;`, so the app's "start here"
    folder contains the whole written curriculum.
(c) Every one of them carries a `README.md`.  `check_case_tiers` arm (c)
    already requires this of any `tier tutorial;` case, so on a passing tree
    this arm is redundant -- it is here because it is the arm that fires
    FIRST when someone adds a case to the curriculum, and it names the
    curriculum in its message where the other gate names only the tier.
(d) The document still has the shape this gate parses: at least one numbered
    entry, and the count it announces in its own title matches the number of
    entries found.  A gate that silently parses zero entries and passes is
    the permanently-green failure this project retired `check_true_ions` for.

WHAT THIS GATE DOES NOT CHECK
-----------------------------
Whether the ORDER is right, or whether the app presents one at all: the
folder is a SET and declares itself so, and a declared order would be a
case-format decision this project has deliberately deferred
(gui/src/cases/tutorials.ts, the FIRST_PATH comment).  Nor whether any case
is well chosen for its position -- that is a reading judgement, and no gate
makes it.  Nor the four welcome cards: `gui/tests/firstPath.test.ts` pins
that they lie inside the tier, and a second home for that claim is the
defect this gate exists to prevent.

SABOTAGES FIRED BY HAND (see the commit that added this file)
  S1  tier word removed from a curriculum case   -> arm (b) FAILED
  S2  a curriculum case renamed in the document  -> arm (a) FAILED
  S3  a README removed from a curriculum case    -> arm (c) FAILED
  S4  every numbered entry removed               -> arm (d) FAILED (not a pass)
  S5  the title's count changed to disagree      -> arm (d) FAILED
"""

    import pathlib
    import re
    import sys

    ROOT = pathlib.Path(__file__).resolve().parents[2]
    DOC = ROOT / "docs" / "start-here.md"

    # The document writes each entry as a heading `### <n>. <title>` followed by a
    # line holding the case path in backticks.  Parse the PATH LINE, and require
    # it to sit under a numbered heading -- a path mentioned in running prose is
    # not an entry.
    ENTRY_HEAD = re.compile(r"^###\s+(\d+)\.\s+(.+?)\s*$")
    PATH_LINE = re.compile(r"^`(tutorials/[A-Za-z0-9_/]+)`\s*$")

    # The title announces its own count in words.
    WORD_COUNT = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
        "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    }


    def entries(text):
        """[(n, title, case path)] in document order."""
        out, pending = [], None
        for line in text.splitlines():
            m = ENTRY_HEAD.match(line)
            if m:
                pending = (int(m.group(1)), m.group(2))
                continue
            if pending is not None:
                p = PATH_LINE.match(line.strip())
                if p:
                    out.append((pending[0], pending[1], p.group(1)))
                    pending = None
        return out


    def declared_count(text):
        """The count the document's own H1 announces, or None."""
        for line in text.splitlines():
            if line.startswith("# "):
                for word, n in WORD_COUNT.items():
                    if re.search(r"\b%s\s+cases\b" % word, line, re.I):
                        return n
                m = re.search(r"\b(\d+)\s+cases\b", line, re.I)
                return int(m.group(1)) if m else None
        return None


    def tier_of(case_dir):
        cd = case_dir / "system" / "controlDict"
        if not cd.is_file():
            return None
        m = re.search(r"^\s*tier\s+([A-Za-z]+)\s*;",
                      cd.read_text(encoding="utf-8", errors="replace"), re.M)
        return m.group(1) if m else ""


    def main():
        if not DOC.is_file():
            print("check_first_path_agrees: FAIL")
            print("  docs/start-here.md is missing -- the curriculum is the one "
                  "home of the first path, and it is not there")
            return 1

        text = DOC.read_text(encoding="utf-8")
        ents = entries(text)
        fails = []

        # (d) the document still has the shape this gate parses
        if not ents:
            fails.append("(d) parsed ZERO numbered entries from docs/start-here.md. "
                         "Either the document changed shape or this gate's parser "
                         "went stale; a gate that reads nothing must not pass.")
        else:
            want = declared_count(text)
            if want is None:
                fails.append("(d) the document's title announces no case count. "
                             "It is the one number a reader checks the list "
                             "against; keep it in the H1.")
            elif want != len(ents):
                fails.append("(d) docs/start-here.md announces %d cases in its "
                             "title and carries %d numbered entries."
                             % (want, len(ents)))

        for n, title, rel in ents:
            case = ROOT / rel
            where = "docs/start-here.md entry %d (%s)" % (n, title)

            # (a) it exists and is a case
            if not (case / "system" / "controlDict").is_file():
                fails.append("(a) %s names `%s`, which is not a case on disk "
                             "(no system/controlDict)." % (where, rel))
                continue

            # (b) the tier word that puts it in the app's folder
            tier = tier_of(case)
            if tier != "tutorial":
                fails.append(
                    "(b) %s is taught by the curriculum but declares `tier %s` in "
                    "%s/system/controlDict.  The app's \"start here: the first "
                    "path\" folder is built from `tier tutorial;` cases, so this "
                    "one is invisible exactly where the app says the way in is.  "
                    "Add `tier tutorial;` (and a README.md, which that tier "
                    "requires) or take the case out of the curriculum."
                    % (where, tier if tier else "<none>", rel))

            # (c) the lesson page
            if not (case / "README.md").is_file():
                fails.append("(c) %s has no README.md.  A case the curriculum "
                             "teaches has a lesson the app can show; without one "
                             "the student reaches a case with nothing to read."
                             % where)

        if fails:
            print("check_first_path_agrees: FAIL")
            for f in fails:
                print("  " + f)
            return 1

        print("check_first_path_agrees: OK -- all %d cases the written curriculum "
              "(docs/start-here.md) teaches exist, carry a README.md, and declare "
              "`tier tutorial;`, so the app's \"start here: the first path\" folder "
              "contains the whole of it; the document's own announced count "
              "matches the entries found, so a silently-empty parse cannot pass.  "
              "NOT CHECKED: the ORDER (the folder is a SET and says so; a declared "
              "order is a deferred case-format decision), whether any case suits "
              "its position (a reading judgement), and the welcome cards "
              "(gui/tests/firstPath.test.ts owns that claim -- a second home for "
              "it is the defect this gate exists to prevent)." % len(ents))
        return 0
    return main()


ARMS = [
    ("start_here", arm_start_here),
    ("first_path_agrees", arm_first_path_agrees),
]


def _claim(name, text):
    from gate_claim import claim_in
    import re
    c = claim_in(text, "check_" + name)
    c = c if c else (text.strip().splitlines() or ["(no output)"])[-1].strip()
    return "[" + name + "] " + re.sub(r"^\s*(\[[^\]]+\]|[\w.\-]+:)\s*OK\b\s*(--)?\s*", "", c)


def main():
    results = []
    for name, fn in ARMS:
        buf = io.StringIO()
        rc = 0
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                r = fn()
                rc = r if isinstance(r, int) else 0
            except SystemExit as e:
                rc = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
                if isinstance(e.code, str):
                    print(e.code)
            except Exception:
                traceback.print_exc()
                rc = 1
        results.append((name, rc, buf.getvalue()))
    bad = [n for n, rc, _ in results if rc != 0]
    if bad:
        print("check_way_in: FAILED -- arm(s) " + ", ".join(bad))
    else:
        print("check_way_in: OK -- " + " || ".join(_claim(n, t) for n, _, t in results))
    for name, rc, text in results:
        print("--- arm check_%s (exit %d)" % (name, rc))
        sys.stdout.write(text if text.endswith("\n") or not text else text + "\n")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
