#!/usr/bin/env python3
"""Sealed-corpus gate: every case carries its data, or names why not.

The pedagogical contract Vitor asked for in one line: a student opens ANY
tutorial and finds, under constant/, a copy of every record the case uses --
components, species, chemistry, parameters -- listed and hashed in
constant/propertyManifest.  No hunting through the installation catalogue to
learn what a case consumed.

Enforced here: every TOP-LEVEL case (it has its own system/controlDict and is
not a fractal sub-unit of a parent case) must carry constant/propertyManifest.

The ONE named exemption: a LIVE-OVERLAY demo -- a case whose component records
declare `overlayOf`, whose whole lesson is the field-by-field overlay resolving
against the EVOLVING standards base.  Sealing it would freeze the very
mechanism it teaches; the importer itself refuses to pre-merge it.  Those
cases stay unsealed, and this gate checks they really are that kind.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

bad = []
sealed = live = 0

caseDirs = {p.parent for p in (ROOT / "tutorials").rglob("*.cho")}
tops = []
for c in sorted(caseDirs):
    if not (c / "system" / "controlDict").exists():
        continue                          # a marker inside a composite: not a case
    # a fractal sub-unit lives INSIDE another case directory
    if any(par in caseDirs and (par / "system" / "controlDict").exists()
           for par in c.parents):
        continue
    tops.append(c)

for c in tops:
    if (c / "constant" / "propertyManifest").exists():
        sealed += 1
        continue
    isLive = any(re.search(r'\boverlayOf\b', p.read_text(errors="replace"))
                 for p in (c / "constant").rglob("*.dat")) \
             if (c / "constant").is_dir() else False
    if isLive:
        live += 1
        continue
    bad.append(f"{c.relative_to(ROOT)}: no constant/propertyManifest and not a"
               f" live-overlay demo -- run bin/choupo-import so the case"
               f" carries (and names, hashed) every record it uses")

if bad:
    print("sealed-corpus gate FAILED:")
    for b in bad:
        print("  " + b)
    sys.exit(1)

print(f"sealed-corpus gate: {sealed} top-level cases sealed with a manifest,"
      f" {live} live-overlay demos exempt by design, 0 unsealed")
sys.exit(0)
