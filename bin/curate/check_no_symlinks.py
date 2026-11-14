#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: no tracked symlink lives under data/ (DEV.md 4c C296).

    bin/curate/check_no_symlinks.py

WHY.  C296 keys the curation tree by the pair and generates the per-compound
view; it forbids symlinks as the way to give one record two homes (a symlink
is a second name that git, zip archives and the WASM bundle each treat
differently).  This gate reads the git index (`git ls-files -s`) and fails on
any entry of mode 120000 under data/.

NOT CHECKED: untracked symlinks (they are not in the repository), symlinks
outside data/, and gitignored private tiers (data/local).
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    out = subprocess.run(["git", "ls-files", "-s", "--", "data"], cwd=ROOT,
                         capture_output=True, text=True, check=True).stdout
    bad = []
    n = 0
    for line in out.splitlines():
        meta, _, path = line.partition("\t")
        n += 1
        if meta.split()[0] == "120000":
            bad.append(path)
    if bad:
        print("check_no_symlinks: FAIL")
        for p in bad:
            print(f"  tracked symlink under data/: {p}")
        return 1
    print(f"check_no_symlinks: OK -- {n} tracked entries under data/, none is "
          f"a symlink (mode 120000).  NOT CHECKED: untracked links, links "
          f"outside data/, the gitignored data/local tier.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
