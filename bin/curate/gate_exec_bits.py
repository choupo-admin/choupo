#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""EVERY SCRIPT UNDER bin/ IS EXECUTABLE (DEV.md 4c C394, 2026-11-14).

    bin/curate/gate_exec_bits.py             this tree: git's mode AND the disk
    bin/curate/gate_exec_bits.py --rev REV   a commit: git's mode there

WHY.  Twice in two days a gate was committed as mode 100644
(check_ratebased_segment.py, then check_packing_record.py).  bin/runTests
calls most gates with no interpreter in front, so such a gate fails with
"Permission denied", and only the FULL sweep reaches those sites; the defect
surfaced an hour into a sweep, as a failure that says nothing about the
gate's subject.

THE RULE, COMPLETE BY CONSTRUCTION (review SE-06/SE-07, 2026-11-14).  The
first version parsed bin/runTests for the sites that run a script directly;
the review found it blind to fifteen of them (a quoted-pair loop, a name built
in a variable, the scripts under bin/ outside bin/curate, the scripts gates
run).  A reader of a caller can always miss a call.  So the rule no longer
asks who runs a script: EVERY tracked file under bin/ (recursively) whose
first line is a shebang (`#!`) must be mode 100755 in git AND executable on
disk.  A file with a shebang says it is meant to be run; a module meant only
to be imported carries none.  git's mode is what a fresh clone gets; the
disk is what this run will execute.

Cheap (one `git ls-files -s` and the first two bytes of each file), so
bin/runTests runs it in EVERY mode before anything else, and bin/integrate
--plan runs it on the branch's head (`--rev`: git's mode and blob only).

Exit 0 OK, exit 1 refused by name with the remedy.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def git(*args, stdin=None):
    return subprocess.run(["git", "-C", str(ROOT)] + list(args),
                          capture_output=True, input=stdin)


def entries(rev):
    """[(path, mode, first two bytes)] of the tracked files under bin/."""
    if rev:
        ls = git("ls-tree", "-r", rev, "--", "bin/").stdout.decode()
        rows = []
        for line in ls.splitlines():
            meta, path = line.split("\t", 1)
            mode, kind, sha = meta.split()
            if kind == "blob":
                rows.append((path, mode, sha))
        if not rows:
            return []
        out = git("cat-file", "--batch",
                  stdin="".join(r[2] + "\n" for r in rows).encode()).stdout
        heads, i = {}, 0
        for path, mode, sha in rows:
            nl = out.index(b"\n", i)
            size = int(out[i:nl].split()[2])
            heads[path] = out[nl + 1:nl + 1 + min(size, 2)]
            i = nl + 1 + size + 1
        return [(p, m, heads[p]) for p, m, _ in rows]
    ls = git("ls-files", "-s", "--", "bin/").stdout.decode()
    rows = []
    for line in ls.splitlines():
        meta, path = line.split("\t", 1)
        try:
            with open(ROOT / path, "rb") as f:
                head = f.read(2)
        except OSError:
            continue                       # deleted in the working tree
        rows.append((path, meta.split()[0], head))
    return rows


def main(argv):
    rev = argv[1] if argv[:1] == ["--rev"] and len(argv) == 2 else None
    rows = entries(rev)
    scripts = [(p, m) for p, m, h in rows if h == b"#!" and m != "120000"]
    bad = []
    for path, mode in scripts:
        why = []
        if mode != "100755":
            why.append(f"mode {mode} in git")
        if not rev and not os.access(ROOT / path, os.X_OK):
            why.append("not executable on disk")
        if why:
            bad.append((path, ", ".join(why)))
    where = ((f"at {rev[:10]}" if re.fullmatch(r"[0-9a-f]{11,40}", rev)
              else f"at {rev}") if rev else "in this tree")
    if bad:
        print(f"gate_exec_bits: REFUSED -- {len(bad)} script(s) under bin/ carry a "
              f"shebang and are not executable {where}; a caller running one "
              "directly gets 'Permission denied' (bin/runTests runs most gates "
              "that way, and only the full sweep reaches most of them):")
        for path, why in bad:
            print(f"    {path}: {why}")
        paths = " ".join(p for p, _ in bad)
        print(f"  Remedy: chmod +x {paths} && git update-index --chmod=+x {paths}")
        return 1
    print(f"gate_exec_bits: OK -- all {len(scripts)} tracked file(s) under bin/ that "
          f"begin with a shebang are mode 100755 in git"
          + (" and executable on disk" if not rev else "") + f" {where}.  Not "
          "judged: a script outside bin/, and a file run through an explicit "
          "interpreter (which needs no bit).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
