#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_lesson_prose_citations -- no new lesson citation that nothing keeps.

    bin/curate/check_lesson_prose_citations.py

WHY THIS EXISTS (DEV.md 4c C455, class 1).  An EduTool cites the engine as
prose -- `FixedBedAdsorber.cpp:845` -- and a student follows the number to
the line.  `repoint_lesson_citations.py` keeps a citation current only when a
CLAIM covers it (a CLAIMS key naming the text the lesson says is there, or an
ANCHORS line inside the range); a citation with no claim drifts with every
edit of the cited file and NOTHING notices.  The 2026-11-19 outside sweep of
all 75 lessons (docs/reviews/2026-11-19-edutools-batch-*) found that drift in
almost every batch: electrolyteModels' prose citations 10-30 lines off while
its EM_CITATIONS table was right, every FixedBedAdsorber.cpp line of
lubScaleup stale, a reversed range "658-655" in batchMembrane.  Measured at
9e253a5fbc: 455 such tokens in 83 files.

WHAT IS CHECKED.  The unmanaged tokens are counted per file by
`repoint_lesson_citations.unmanaged_tokens` (the one home of "unmanaged", so
`--inventory` and this gate cannot disagree) and held to
`debt_registry.LESSON_PROSE_CITATIONS_UNMANAGED`, a RATCHET:

  (a) a file with MORE unmanaged tokens than its pin FAILS -- a new citation
      must come with its claim;
  (b) a file not in the pin list with ANY unmanaged token FAILS -- a new
      lesson starts with every citation kept;
  (c) a file with FEWER than its pin FAILS asking for the pin to be lowered,
      and a pinned file that no longer exists or has none asks for its entry
      to be removed -- a pin outliving its violation is a licence.

WHAT IS NOT CHECKED, said plainly.  Whether a managed citation is CURRENT is
`repoint_lesson_citations.py --check`'s job (wired as its own gate); whether
the claim is TRUE of the engine is the lesson tests'.  This gate only stops
the uncovered population from growing.  It cannot tell a token moved from one
line of a file to another (the count is per file): that is the price of a
count, and the alternative -- 455 literal tokens in the registry -- would
break on every legitimate edit of the cited engine files.

THE REAL DEFECT IT WOULD HAVE CAUGHT.  lubScaleup's prose cites five
FixedBedAdsorber.cpp lines with no claim; written after the registry, each
would have failed arm (b) the day the lesson landed.
"""
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import repoint_lesson_citations as rlc                      # noqa: E402
from debt_registry import LESSON_PROSE_CITATIONS_UNMANAGED  # noqa: E402

LABEL = "check_lesson_prose_citations"


def main(argv=None):
    root = (argv or sys.argv[1:] or [ROOT])[0]
    tree = rlc.Tree(root)
    items, _ = rlc.scan(tree)
    toks = rlc.unmanaged_tokens(tree, items)
    have = Counter(rel for rel, _ in toks)
    pins = LESSON_PROSE_CITATIONS_UNMANAGED
    bad = []
    for rel, n in sorted(have.items()):
        pin = pins.get(rel)
        if pin is None:
            new = sorted({t for r, t in toks if r == rel})
            bad.append("%s: %d unmanaged citation(s) in a file with no pin (%s) -- "
                       "give each a claim (CLAIMS key or ANCHORS line) so "
                       "repoint_lesson_citations keeps it" % (rel, n, ", ".join(new[:6])))
        elif n > pin:
            bad.append("%s: %d unmanaged citations, pinned at %d -- a new citation "
                       "must come with its claim" % (rel, n, pin))
        elif n < pin:
            bad.append("%s: %d unmanaged citations, pinned at %d -- the debt shrank; "
                       "lower debt_registry.LESSON_PROSE_CITATIONS_UNMANAGED to %d"
                       % (rel, n, pin, n))
    for rel, pin in sorted(pins.items()):
        if rel not in have:
            bad.append("%s: pinned at %d but has no unmanaged citation (or no longer "
                       "exists) -- remove its entry from debt_registry."
                       "LESSON_PROSE_CITATIONS_UNMANAGED" % (rel, pin))
    if bad:
        for b in bad:
            print("  " + b)
        print("%s: FAILED (%d finding(s))" % (LABEL, len(bad)))
        return 1
    print("%s: OK %d unmanaged prose citation(s) in %d file(s), each file at its "
          "pin (ratchet: may only fall); %d managed citation(s) are kept by "
          "repoint_lesson_citations.  NOT checked here: whether a managed one is "
          "current (repoint --check) or true (the lesson tests)."
          % (LABEL, len(toks), len(have), len(items)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
