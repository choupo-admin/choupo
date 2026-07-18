#!/usr/bin/env python3
"""Empty-directory gate (Vitor, 2026-07-18): a case folder must carry no
empty directory -- reachable-closure removals / methods retirement left
hollow species/ parameters/electrolyte/ shells.  The importer now prunes,
this gate keeps the tree honest.  Exit 1 listing any empty dir under
tutorials/ or data/standards/."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
empties = []
for base in ("tutorials", "data/standards"):
    for d in (ROOT / base).rglob("*"):
        if d.is_dir() and not any(d.iterdir()) and ".tmp_" not in str(d):
            empties.append(d.relative_to(ROOT).as_posix())
if empties:
    print("EMPTY-DIR GATE FAILED (%d):" % len(empties))
    for e in sorted(empties)[:40]:
        print("  " + e)
    sys.exit(1)
print("empty-dir gate: no empty directories under tutorials/ or data/standards/")
