#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_scan_roots -- the gates bin/integrate --plan cannot see may only shrink.

    bin/curate/check_scan_roots.py

WHY (DEV.md 4c C394, review SE-09, 2026-11-14).  `bin/integrate --plan` lists
a gate when one of its SCAN ROOTS holds a touched file; the roots are read
from each gate's syntax tree by bin/curate/gate_scan_roots.py (with the
module-level SCAN_ROOTS a gate may declare, and the bin/curate scripts it
imports or runs).  A walk whose base that reader cannot evaluate -- a
function parameter, a value read at run time -- leaves the gate invisible to
the plan for that walk, which is how the C398 (a)+(b) sweep failed three
gates an hour in.

WHAT IT CHECKS.  It recomputes the set of gates with such a walk in their own
source and no SCAN_ROOTS declaration (gate_scan_roots.unresolved_gates) and
compares it, BY NAME, with debt_registry.SCAN_ROOTS_UNRESOLVED:
  * a gate in the set and not pinned FAILS -- a new walk the plan cannot see:
    declare its SCAN_ROOTS;
  * a pinned gate no longer in the set FAILS -- it was fixed: remove its pin,
    so the debt only shrinks.

NOT CHECKED: whether a declared SCAN_ROOTS is complete or a resolved root is
the whole of what a gate reads (a read through a fixed path is matched by
name elsewhere in the plan); a walk inside an imported helper (it is pinned,
if at all, through the gate that owns it).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gate_scan_roots                                   # noqa: E402
from debt_registry import SCAN_ROOTS_UNRESOLVED, SCAN_ROOTS_UNRESOLVED_DEBT  # noqa: E402


def main() -> int:
    now = gate_scan_roots.unresolved_gates()
    total = len(list(HERE.glob("check_*.py")))
    if total < 100:
        print(f"check_scan_roots: FAILED\n  only {total} gates found -- the "
              "scan saw nothing to judge")
        return 1
    new = sorted(set(now) - set(SCAN_ROOTS_UNRESOLVED))
    healed = sorted(set(SCAN_ROOTS_UNRESOLVED) - set(now))
    if new or healed:
        print("check_scan_roots: FAILED")
        for g in new:
            print(f"  {g}: a walk bin/integrate --plan cannot see ({now[g]}).  "
                  + SCAN_ROOTS_UNRESOLVED_DEBT["remedy"])
        for g in healed:
            print(f"  {g}: pinned in debt_registry.SCAN_ROOTS_UNRESOLVED and no "
                  "longer unresolved -- remove its pin (the debt only shrinks)")
        return 1
    print(f"check_scan_roots: OK -- {len(now)} of {total} gates carry a walk the "
          "plan cannot see, each pinned by name in "
          "debt_registry.SCAN_ROOTS_UNRESOLVED, and none was added.  NOT "
          "checked: whether a declared SCAN_ROOTS is complete, or walks inside "
          "an imported helper.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
