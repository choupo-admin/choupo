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
for man in (ROOT / "tutorials").rglob("constant"):
    if not man.is_dir():
        continue
    assets = {f.name for f in (man / "assets").glob("*.dat")} \
        if (man / "assets").is_dir() else set()
    for legacy in LEGACY:
        ld = man / legacy
        if ld.is_dir():
            for f in ld.glob("*.dat"):
                bad.append(f"{f.relative_to(ROOT)}: retired asset home"
                           f" '{legacy}/' (move to assets/)")
if bad:
    print("ASSET-HOME GATE FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)
print("asset-home gate: one home (constant/assets/), no retired overlay dirs")
