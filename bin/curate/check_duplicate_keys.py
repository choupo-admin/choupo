#!/usr/bin/env python3
# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -----------------------------------------------------------------------------
#     SPDX-License-Identifier: GPL-3.0-or-later
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================
"""check_duplicate_keys -- one key, one declaration, in every dict on disk.

`Dictionary::insert` is last-wins: a key declared twice appears ONCE in the
ordering, holding the second value, so above the parser the duplicate is
INVISIBLE.  Every reader agrees on an answer the file does not uniquely
state, and the order of the file decides the physics.

The parser refuses this now -- but only for a file some case actually LOADS.
A record nobody opens today carries the defect silently until the day it is
used, and that is how the live one survived: TWELVE standard components
declared `groups` twice (joback, then unifac) and the Joback assignments were
discarded at parse time.  They are read by `estimateComponent`, so those
twelve refused a Joback estimate while their own records said they carried
one.

THIS SWEEPS EVERY FILE, loaded or not.  It is also the honest answer to a
mistake made while fixing that one: the corpus was sampled -- sixty cases,
zero duplicates, declared clean -- and the full suite then found four more,
one of them inside a GATE's own fixture.  Sampling and asserting is the habit
this file replaces.

Scope: data/standards/, data/local/ if present, every tutorial dict, and the
drafts under docs/design/ -- the one place with no other net.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

#  Files the engine parses as dictionaries.  Extension-less names are the
#  case dicts (controlDict, flowsheetDict, thermoPhysPropDict, 0/<stream>, ...).
DICT_NAMES = ("controlDict", "flowsheetDict", "thermoPhysPropDict", "solverDict",
              "outerDict", "postDict", "chemistryDict", "designDict",
              "propsDict", "reactions", "propertyManifest")

SCAN = [("data/standards", None), ("data/local", None),
        ("tutorials", None), ("docs/design", None)]

fails = []


def scan(path):
    """Duplicate keys per BRACE DEPTH, mirroring how the parser nests.

    A key repeated at the same depth inside the same block is the defect; the
    same word at different depths (a `water` entry inside two phases) is not.
    Comments and quoted strings are stripped first so a keyword inside prose
    cannot raise a false alarm -- these records carry long provenance notes.
    """
    try:
        body = open(path, errors="replace").read()
    except OSError:
        return []
    #  Strip comments and strings but PRESERVE the line structure -- the line
    #  numbers this reports are read by a human opening the file, and a
    #  collapsing substitution made them point at the wrong place (found by
    #  this gate reporting a duplicate at a line that held only a brace).
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    body = re.sub(r"/\*.*?\*/", blank, body, flags=re.S)
    body = re.sub(r"//[^\n]*", blank, body)
    body = re.sub(r'"(?:[^"\\]|\\.)*"', blank, body, flags=re.S)

    #  Pair keys carry a hyphen (compA-compB, CO2-water), so it belongs in the
    #  key character class.  Without it the scanner split `compA-compB` into
    #  `compA` and reported a false duplicate against the components list.
    seen, out, depth = [{}], [], 0
    #  A KEY is a bare word at the start of a statement: `word value;` or
    #  `word {`.  A word inside a ( ... ) list is data, not a key, so list
    #  depth is tracked separately and suppresses collection.
    listd = 0
    for m in re.finditer(r"[{}()]|[A-Za-z_][A-Za-z0-9_.\[\]-]*", body):
        t = m.group(0)
        if t == "(":
            listd += 1
        elif t == ")":
            listd = max(0, listd - 1)
        elif t == "{":
            depth += 1
            seen.append({})
        elif t == "}":
            depth = max(0, depth - 1)
            if len(seen) > 1:
                seen.pop()
        elif listd == 0 and depth < len(seen):
            #  Only the FIRST word of a statement is a key; the words after it
            #  are its value.  Approximate that by taking a word as a key only
            #  when the previous non-space character ended a statement or
            #  opened a block.
            before = body[:m.start()].rstrip()
            if before and before[-1] not in ";{}":
                continue
            line = body[:m.start()].count("\n") + 1
            d = seen[-1]
            if t in d:
                out.append((t, d[t], line))
            else:
                d[t] = line
    return out


for rel, _ in SCAN:
    base = os.path.join(ROOT, rel)
    if not os.path.isdir(base):
        continue
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames
                       if d not in ("converged", "reports", ".git", "node_modules")
                       and not re.fullmatch(r"\d+(\.\d+)?", d)]
        for fn in filenames:
            if not (fn.endswith(".dat") or fn in DICT_NAMES
                    or os.path.basename(dirpath) == "0"):
                continue
            if fn.startswith("log.") or fn.endswith(".md"):
                continue
            p = os.path.join(dirpath, fn)
            for key, first, second in scan(p):
                fails.append("%s: key '%s' declared at line %d and again at %d "
                             "in the same block -- last wins, silently"
                             % (os.path.relpath(p, ROOT), key, first, second))

if fails:
    print("DUPLICATE KEYS (%d) -- the file's order would decide the answer:"
          % len(fails))
    for f in fails[:40]:
        print("  " + f)
    if len(fails) > 40:
        print("  ... and %d more" % (len(fails) - 40))
    sys.exit(1)

print("duplicate-key gate: every dict on disk declares each key once "
      "(standards, local, tutorials, design drafts)")
sys.exit(0)
