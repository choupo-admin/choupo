#!/usr/bin/env python3
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


if __name__ == "__main__":
    sys.exit(main())
