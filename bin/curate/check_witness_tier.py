#!/usr/bin/env python3
"""Gate: the architectural witness tier is a DECLARED, resolvable list.

    bin/curate/check_witness_tier.py

WHY THIS EXISTS.  `tutorials/WITNESSES` names one representative case per
execution class, and `bin/runTests --witnesses` runs exactly that list as
the routine development feedback loop (Vitor's testing-hierarchy ruling,
2026-08-10).  A tier whose lines silently rot -- a renamed case, a deleted
golden, two lines claiming one class -- would keep printing green while
checking less than it claims, which is the check_true_ions failure shape.

WHAT THIS CHECKS:

  (W1) every declared case directory EXISTS and is a runnable case
       (system/controlDict present);
  (W2) every witness ships an `expected` golden -- a witness with nothing
       to compare against proves traversal ended in exit 0, not that the
       answer stood still;
  (W3) class names are UNIQUE -- one class, one witness, no shadowing;
  (W4) no case appears twice under two class names -- a case may hold two
       ROLES (tutorial + witness) but not two witness lines;
  (W5) the list is non-empty and parses (two fields per line).

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * REPRESENTATIVENESS -- whether each case truly traverses its class's full
    architectural route is an architect's judgement, made in review when a
    line is added or moved, not a property a script can measure;
  * whether the witnesses PASS -- that is `runTests --witnesses` itself;
  * completeness of the class list -- a NEW execution class does not fail
    this gate; adding its witness line is part of shipping the class, and
    the reviewer of that slice is the enforcement.

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- a witness path pointed at a case that does not exist:

    check_witness_tier: FAILED
      W1: class 'membrane' names tutorials/steady/membranes/membrane99_gone
      -- no such case directory (system/controlDict not found)

Sabotage 2 -- one class declared twice:

    check_witness_tier: FAILED
      W3: class 'molecularFlash' is declared 2x -- one class, one witness
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LIST = os.path.join(ROOT, "tutorials", "WITNESSES")

fails = []

if not os.path.isfile(LIST):
    print("check_witness_tier: FAILED")
    print("  tutorials/WITNESSES is missing -- the tier is a declared list, "
          "and it is gone")
    sys.exit(1)

classes = {}
cases = {}
n = 0
for ln, raw in enumerate(open(LIST, encoding="utf-8"), 1):
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    parts = line.split()
    if len(parts) != 2:
        fails.append(f"W5: line {ln} does not parse as '<class> <case>': "
                     f"'{line}'")
        continue
    wclass, wpath = parts
    n += 1
    classes.setdefault(wclass, []).append(ln)
    cases.setdefault(wpath, []).append(wclass)

    d = os.path.join(ROOT, wpath)
    if not os.path.isfile(os.path.join(d, "system", "controlDict")):
        fails.append(f"W1: class '{wclass}' names {wpath} -- no such case "
                     f"directory (system/controlDict not found)")
        continue
    if not os.path.isfile(os.path.join(d, "expected")):
        fails.append(f"W2: witness {wpath} (class '{wclass}') ships no "
                     f"`expected` golden -- a witness with nothing to compare "
                     f"against proves exit 0, not an unmoved answer")

for wclass, lns in classes.items():
    if len(lns) > 1:
        fails.append(f"W3: class '{wclass}' is declared {len(lns)}x -- one "
                     f"class, one witness")
for wpath, wcls in cases.items():
    if len(wcls) > 1:
        fails.append(f"W4: case {wpath} carries {len(wcls)} witness lines "
                     f"({', '.join(wcls)}) -- one case, one line")

if n == 0:
    fails.append("W5: the list declares no witnesses")

if fails:
    print("check_witness_tier: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print(f"check_witness_tier: OK -- {n} class witness(es), each an existing "
      "case with a golden, classes and cases both unique.  NOT COVERED: "
      "representativeness (an architect's review call), whether the "
      "witnesses PASS (that is `runTests --witnesses`), and completeness of "
      "the class list (a new class ships its own line).")
