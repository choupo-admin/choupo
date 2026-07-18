#!/usr/bin/env python3
"""Retired-name gate (Codex tutorial-audit P2, 2026-07-18): no tutorial case
SOURCE (dicts, README, .cho -- not generated logs) may reference a retired
architecture name.  A green tutorial with a false comment teaches the wrong
layout.  Exit 1 listing offenders."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RETIRED = ["electrolyte/ions.dat", "constant/propertyDict", "constant/thermoPackage"]
bad = []
for f in (ROOT / "tutorials").rglob("*"):
    if not f.is_file():
        continue
    n = f.name
    if n.startswith("log.choupo") or n == "expected" or f.suffix in (".csv", ".ods"):
        continue
    sf = str(f)
    if any(x in sf for x in ("/reports/", "/converged/", "/iterations/",
                             "/.build/", "/code/")):
        continue          # generated output / compiled user-code artifacts
    try:
        txt = f.read_text(errors="replace")
    except OSError:
        continue
    for name in RETIRED:
        # allow explicit history ("was ", "previously", "renamed", "retired")
        for m in re.finditer(re.escape(name), txt):
            line = txt[max(0, txt.rfind("\n", 0, m.start())):
                       txt.find("\n", m.start())].lower()
            if any(h in line for h in ("was ", "previously", "renamed",
                                       "retired", "old ", "legacy", "propertyData")):
                continue
            bad.append(f"{f.relative_to(ROOT)}: '{name}'")
            break
if bad:
    print("RETIRED-NAME GATE FAILED (%d):" % len(bad))
    for b in bad[:40]:
        print("  " + b)
    sys.exit(1)
print("retired-name gate: no tutorial source references a retired architecture name")
