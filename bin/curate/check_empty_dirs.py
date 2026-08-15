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
scanned = 0
for base in ("tutorials", "data/standards"):
    #  A SCAN OVER NOTHING IS NOT A CLEAN TREE (2026-08-15, fleet census).
    #  This gate shared the check_true_ions death shape with thirteen other
    #  scanners: rename the scanned root and rglob returns nothing, zero
    #  problems are found over zero subjects, and the gate goes permanently
    #  green.  A scanner must refuse when it cannot see what it audits.
    if not (ROOT / base).is_dir():
        print("EMPTY-DIR GATE FAILED: scan root '%s' does not exist -- this"
              " gate cannot see what it audits, and a green verdict over an"
              " absent tree would be the check_true_ions failure again." % base)
        sys.exit(1)
    for d in (ROOT / base).rglob("*"):
        if d.is_dir():
            scanned += 1
            if not any(d.iterdir()) and ".tmp_" not in str(d):
                empties.append(d.relative_to(ROOT).as_posix())
if scanned < 100:
    print("EMPTY-DIR GATE FAILED: only %d directories scanned -- the corpus"
          " holds hundreds, so the scan surface has collapsed and a verdict"
          " over it would describe nothing." % scanned)
    sys.exit(1)
if empties:
    print("EMPTY-DIR GATE FAILED (%d):" % len(empties))
    for e in sorted(empties)[:40]:
        print("  " + e)
    sys.exit(1)
print("empty-dir gate: no empty directories under tutorials/ or data/standards/ (%d dirs scanned; an absent or collapsed scan root REFUSES)" % scanned)
