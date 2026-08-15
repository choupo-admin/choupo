#!/usr/bin/env python3
"""Single-asset-home gate (Codex assets-audit, 2026-07-18): a physical asset
(membrane / IEM / resin / material) lives in ONE home -- constant/assets/.
The legacy constant/membranes/ (and the like) overlay let a SEALED case open
input its propertyManifest never claimed.  Fail if any case carries the same
basename in two asset homes, or any surviving constant/membranes/ dir."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
bad = []
LEGACY = ("membranes",)   # adsorbents/ + materials/ migration is a named follow-up
#  A SCAN OVER NOTHING IS NOT A CLEAN TREE (2026-08-15, fleet census).  This
#  gate shared the check_true_ions death shape: rename tutorials/ and rglob
#  returns nothing, zero problems are found over zero subjects, and the gate
#  goes permanently green.  A scanner must refuse when it cannot see what it
#  audits.
if not (ROOT / "tutorials").is_dir():
    print("ASSET-HOME GATE FAILED: scan root 'tutorials' does not exist --"
          " this gate cannot see what it audits, and a green verdict over an"
          " absent tree would be the check_true_ions failure again.")
    sys.exit(1)
scanned = 0
for man in (ROOT / "tutorials").rglob("constant"):
    if not man.is_dir():
        continue
    scanned += 1
    assets = {f.name for f in (man / "assets").glob("*.dat")} \
        if (man / "assets").is_dir() else set()
    for legacy in LEGACY:
        ld = man / legacy
        if ld.is_dir():
            for f in ld.glob("*.dat"):
                bad.append(f"{f.relative_to(ROOT)}: retired asset home"
                           f" '{legacy}/' (move to assets/)")
#  Floor set well below the observed count (373 constant/ dirs at the
#  2026-08-15 census) so a collapsed scan refuses instead of describing
#  nothing.
if scanned < 50:
    print(f"ASSET-HOME GATE FAILED: only {scanned} constant/ dir(s) scanned"
          f" -- the tutorial corpus holds hundreds, so the scan surface has"
          f" collapsed and a verdict over it would describe nothing.")
    sys.exit(1)
if bad:
    print("ASSET-HOME GATE FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)
print(f"asset-home gate: one home (constant/assets/), no retired overlay dirs"
      f" ({scanned} constant/ dirs scanned; an absent or collapsed scan root"
      f" REFUSES)")
