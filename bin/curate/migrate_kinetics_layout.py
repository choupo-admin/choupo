#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Move the reaction library from ONE RECORD PER EQUATION to ONE FOLDER PER EQUATION
(DEV.md 4c C339, 2026-11-25).

    data/standards/kinetics/H+O2=O+OH.dat   ->   kinetics/H+O2=O+OH/OConaire2004.dat

The folder is the reaction (its canonical equation); each file in it is one SOURCE's rate constant
for it, so two published constants of one reaction can coexist.  The source of a flat record is read
from its own `source { citation ...; }` line.  Moves are `git mv`, so history follows; a manifest
(`constant/propertyManifest`) that pinned `kinetics/<eq>.dat` is rewritten to the new name (the
hash of the moved file is the same) and its `kinetics/` set line is recomputed.

usage:  bin/curate/migrate_kinetics_layout.py [--dir DIR]     (default data/standards/kinetics)
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
SOURCE_OF = [("O Conaire", "OConaire2004"), ("Glarborg", "Glarborg2018"),
             ("Miller and Bowman", "MillerBowman1989")]


def source_of(text, name):
    m = re.search(r'^\s*citation\s+"([^"]+)"', text[text.index("source"):], re.M)
    for key, src in SOURCE_OF:
        if m and key in m.group(1):
            return src
    sys.exit("%s: no known source in its citation %r; add it to SOURCE_OF" % (name, m and m.group(1)))


def main():
    d = REPO / "data" / "standards" / "kinetics"
    if "--dir" in sys.argv:
        d = Path(sys.argv[sys.argv.index("--dir") + 1])
    moved = {}
    for f in sorted(d.glob("*.dat")):
        src = source_of(f.read_text(), f.name)
        dst = d / f.stem / (src + ".dat")
        dst.parent.mkdir(exist_ok=True)
        subprocess.run(["git", "mv", str(f), str(dst)], check=True, cwd=REPO)
        moved[f.name] = "%s/%s.dat" % (f.stem, src)
    print("%d records moved" % len(moved))
    if not moved:
        return
    for m in sorted(REPO.glob("tutorials/**/constant/propertyManifest")):
        t = m.read_text()
        if '"kinetics/' not in t:
            continue
        names = []

        def rename(mm):
            old = mm.group(1)
            new = moved.get(old, old)
            names.append(new)
            return '"kinetics/%s"' % new
        t = re.sub(r'"kinetics/([^"/]+\.dat)"', rename, t)
        lines = "".join(n + "\n" for n in sorted(names))
        t = re.sub(r'("kinetics/"\s+"relevant:)[0-9a-f]{64}', r"\g<1>" + hashlib.sha256(lines.encode()).hexdigest(), t)
        m.write_text(t)
        print("manifest", m.relative_to(REPO))


if __name__ == "__main__":
    main()
