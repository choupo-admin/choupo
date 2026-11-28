#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_unmanaged_line_citations -- no gui/ file indexes an engine source by a
literal line number in a shape `repoint_lesson_citations.py` does not manage.

    bin/curate/check_unmanaged_line_citations.py [ROOT]

THE REAL DEFECT IT WOULD HAVE CAUGHT.  On 2026-11-28 the citations into
src/unitOperations/reactor/EquilibriumReactor.cpp and GibbsReactor.cpp held by
gui/tests/physicsApproachDuty.test.ts (`eq[914 - 1]`, `gb.slice(800 - 1, 806)`)
and the prose "EquilibriumReactor.cpp:914, 977-981, 988" of
approachToEquilibriumLesson.ts broke THREE times in one day (+17, +14/+37,
+20 lines): the repointer manages records, CLAIMS keys, ANCHORS and a single
`File.cpp:N[-M]` token, but not an array index `arr[N - 1]` / `.slice(N - 1`
on an array read from a src/ file, nor a range LIST `File.cpp:N, A-B, C`.
Each engine edit turned `--gui` red and was repaired by hand.  The cure is the
symbol citation of C415 (gui/tests/support/engineCite.ts).

WHAT IS FLAGGED, in .ts/.tsx under gui/src and gui/tests:
  (a) `[<digits> - 1]` or `.slice(<digits> - 1` in a file that reads a src/
      file (a `src/` path in the file text);
  (b) a list `Name.cpp|.H|.hpp:N, A-B` (a number, comma, a second number or
      range) after an engine file name.
A file's count is a RATCHET in unmanaged_line_citations.tsv (file<TAB>count):
more than its pin, or any in an unpinned file, FAILS; fewer asks for the pin
to be lowered.  It may only shrink.
NOT CHECKED: a line number built in code (`const L = 914; lines[L]`), and
whether a managed citation is current (repoint --check).
"""
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
LABEL = "check_unmanaged_line_citations"
PINS = os.path.join(HERE, "unmanaged_line_citations.tsv")

INDEX = re.compile(r"\[\s*\d+\s*-\s*1\s*\]|\.slice\(\s*\d+\s*-\s*1\b")
LIST = re.compile(r"\b\w+\.(?:cpp|H|hpp):\d+\s*,\s*\d+")
READS_SRC = re.compile(r"\bsrc/")
SKIP = {"node_modules", "build", ".git", "dist", "_dist", "wasm"}


def scan(root):
    have = Counter()
    for base in ("gui/src", "gui/tests"):
        for d, dirs, files in os.walk(os.path.join(root, base)):
            dirs[:] = [x for x in dirs if x not in SKIP]
            for f in files:
                if not f.endswith((".ts", ".tsx")):
                    continue
                p = os.path.join(d, f)
                t = open(p, encoding="utf-8").read()
                n = len(LIST.findall(t))
                if READS_SRC.search(t):
                    n += len(INDEX.findall(t))
                if n:
                    have[os.path.relpath(p, root)] = n
    return have


def main(argv=None):
    root = (argv or sys.argv[1:] or [ROOT])[0]
    have = scan(root)
    pins = {}
    if os.path.exists(PINS):
        for ln in open(PINS, encoding="utf-8"):
            if ln.strip() and not ln.startswith("#"):
                k, v = ln.rstrip("\n").split("\t")
                pins[k] = int(v)
    bad = []
    for rel, n in sorted(have.items()):
        pin = pins.get(rel, 0)
        if n > pin:
            bad.append("%s: %d unmanaged line citation(s), pinned at %d -- cite by "
                       "symbol (gui/tests/support/engineCite.ts), not by number" % (rel, n, pin))
        elif n < pin:
            bad.append("%s: %d, pinned at %d -- lower the pin in %s" % (rel, n, pin, PINS))
    for rel, pin in sorted(pins.items()):
        if rel not in have:
            bad.append("%s: pinned at %d but has none -- remove its row" % (rel, pin))
    if bad:
        for b in bad:
            print("  " + b)
        print("%s: FAILED (%d finding(s))" % (LABEL, len(bad)))
        return 1
    print("%s: OK %d unmanaged line citation(s) in %d file(s), each at its pin "
          "(ratchet: may only fall); no `arr[N - 1]` / `.slice(N - 1` read of a src/ "
          "file and no `File.cpp:N, A-B` list is unpinned.  NOT checked: a line "
          "number built in code." % (LABEL, sum(have.values()), len(have)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
