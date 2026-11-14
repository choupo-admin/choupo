#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_brain_fresh: BRAIN.md's FACTS block is a fresh render, and BRAIN.md stays a page.

Fails when (1) bin/curate/gen_brain_facts.py --check differs from the block on
disk, (2) BRAIN.md exceeds 250 lines, (3) it has no `## STATE BY AREA` table
with a `judged` column.  It does NOT judge whether a row's judgement is still
true -- that is the architect's, dated, in the row.  (C241.)
"""
import re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAXLINES = 250


def main():
    bad = []
    r = subprocess.run([sys.executable, str(ROOT / "bin/curate/gen_brain_facts.py"), "--check"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        bad.append("FACTS block differs from a fresh render:\n" + r.stdout + r.stderr)
    text = (ROOT / "BRAIN.md").read_text()
    n = len(text.splitlines())
    if n > MAXLINES:
        bad.append("BRAIN.md has %d lines (limit %d); move detail to DEV.md" % (n, MAXLINES))
    m = re.search(r"^## STATE BY AREA.*?\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    hdr = next((l for l in (m.group(1).splitlines() if m else []) if l.startswith("|")), "")
    if not m or "judged" not in [c.strip() for c in hdr.strip("|").split("|")]:
        bad.append("no `## STATE BY AREA` table with a `judged` column")
    if bad:
        print("check_brain_fresh: FAILED")
        print("\n".join(bad))
        return 1
    print("check_brain_fresh: OK -- FACTS block equals a fresh render from the tracked tree; "
          "BRAIN.md %d/%d lines; STATE BY AREA has a `judged` column.  Does NOT judge "
          "whether a dated judgement is still true." % (n, MAXLINES))
    return 0


sys.exit(main())
