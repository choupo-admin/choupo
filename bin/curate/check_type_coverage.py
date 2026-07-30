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
"""check_type_coverage -- every registered type must be reachable by a case.

THE GAP THIS GUARDS.  A type registered in a factory is a PROMISE: it appears
in `UnitOperation::availableTypes()`, the GUI offers it, a student writes it
in a dict.  A promise nothing exercises can rot for a year with the suite
green, and the first to find out is whoever tries to use it.

That is not hypothetical.  Four property operations had no case; writing the
first one, for `vaporPressureFit`, SEGFAULTED choupoProps twice and then ran
with a silently empty thermo package.  `psychrometricChart` before that was
published to the GUI's Property Explorer while reporting an empty diagnostics
block.  `evaporativeDryer` was the last unit-op CLASS nobody ran.

What is checked, statically (no runs -- this is a coverage question, and the
suite already runs everything):

  1. Every CLASS behind a registered unit-op or property-op name is
     instantiated by at least one tutorial case, under some name.
  2. Every registered NAME, including aliases, resolves to a class -- an
     alias pointing at a class no case builds is reported with the name that
     does cover it, so the reader can see the alias is only a spelling and
     not an untested path.

Aliases with no case of their own are NOT a failure: `flash` and
`isothermalFlash` build the same class, and requiring a case per spelling
would be testing the registration table, not the engine.  What would be a
failure is a class with no spelling exercised at all.

Exit 0 = every class is reachable.  Exit 1 = a named class is not.
"""

import collections
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

REGISTRIES = [
    ("unit operation", os.path.join(ROOT, "src", "unitOperations", "UnitOperation.cpp"),
     "flowsheetDict"),
    ("property operation", os.path.join(ROOT, "src", "propertyOps", "PropertyOperation.cpp"),
     "propsDict"),
]

fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL  " + msg)


def declared_types(dict_name):
    """Every `type <word>;` written in a case dict of this kind."""
    used = collections.defaultdict(set)
    for base, _dirs, files in os.walk(os.path.join(ROOT, "tutorials")):
        if dict_name not in files:
            continue
        body = open(os.path.join(base, dict_name), errors="replace").read()
        body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
        body = re.sub(r"//[^\n]*", "", body)
        for m in re.finditer(r"(?m)^\s*type\s+(\w+)\s*;", body):
            used[m.group(1)].add(os.path.relpath(base, ROOT))
    return used


for label, src, dict_name in REGISTRIES:
    if not os.path.exists(src):
        fail("%s registry %s is gone -- this sweep is looking at nothing"
             % (label, os.path.relpath(src, ROOT)))
        continue
    text = open(src, errors="replace").read()
    name2class = dict(re.findall(
        r'reg\("([^"]+)",\s*\[\]\s*\{\s*return std::make_unique<(\w+)>', text))
    if not name2class:
        fail("%s registry: matched 0 registrations -- the pattern no longer "
             "fits registerBuiltins(), so this proves nothing" % label)
        continue
    used = declared_types(dict_name)
    covered = collections.defaultdict(set)
    for name, cls in name2class.items():
        if used.get(name):
            covered[cls].add(name)

    orphans = sorted({cls for cls in name2class.values() if not covered.get(cls)})
    for cls in orphans:
        spellings = sorted(n for n, c in name2class.items() if c == cls)
        fail("%s %s is registered as %s and NO case builds it -- a type the "
             "GUI offers and nothing exercises"
             % (label, cls, " / ".join("`%s`" % s for s in spellings)))
    if not orphans:
        print("  ok   %s: %d names -> %d classes, every class built by a case"
              % (label, len(name2class), len(set(name2class.values()))))
        aliases = sorted(n for n, c in name2class.items()
                         if not used.get(n) and covered.get(c))
        if aliases:
            print("       (%d alias spelling(s) with no case of their own: %s "
                  "-- the class is covered under another name)"
                  % (len(aliases), ", ".join(aliases)))

print()
if fails:
    print("%d type(s) unreachable." % len(fails))
    sys.exit(1)
print("type coverage: every registered class is built by at least one case.")
sys.exit(0)
