#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""EVERY SCRIPT bin/runTests RUNS DIRECTLY CARRIES ITS EXECUTABLE BIT
(DEV.md 4c C394, 2026-11-14).

    bin/curate/gate_exec_bits.py             this tree (git's index, else disk)
    bin/curate/gate_exec_bits.py --rev REV   a commit (git ls-tree / git show)

WHY.  Twice in two days a gate was committed as mode 100644
(check_ratebased_segment.py, then check_packing_record.py).  bin/runTests
calls most gates directly -- `gate_exec "$ROOT/bin/curate/check_x.py"`, no
interpreter in front -- so such a gate fails with "Permission denied", and
only the FULL sweep reaches those sites: --fast, --scope, --gui, a named case
and bin/integrate's validation all skip them.  The defect therefore surfaced
an hour into a sweep, as a failure that says nothing about the gate's
subject.  This check costs a fraction of a second, so bin/runTests runs it in
EVERY mode, before anything else, and bin/integrate --plan runs it on the
branch it plans.

WHAT IT READS.  bin/runTests' own text: every `"$ROOT/bin/curate/<name>.py"`
that is NOT preceded by an interpreter (`python3`, `python3 -I`) is executed
directly and must be executable; a `$fg`-style loop site
(`for fg in check_a check_b ...; do ... "$ROOT/bin/curate/$fg.py"`) names its
scripts in the loop's list.  A tracked script must be mode 100755 in git (a
chmod on disk alone is lost on the next checkout); an untracked one must be
executable on disk.  A script the text names that does not exist is left to
the site that runs it.

Exit 0 OK, exit 1 refused by name with the remedy.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = re.compile(r'(python3(?:\s+-I)?\s+)?"\$ROOT/bin/curate/([A-Za-z0-9_$]+)\.py"')
LOOP = re.compile(r'for\s+(\w+)\s+in\s+((?:[A-Za-z0-9_]+\s*\\?\s*)+);\s*do')


def direct_scripts(text):
    """Names (without .py) of the bin/curate scripts run with no interpreter."""
    names = set()
    loops = {}
    for m in LOOP.finditer(text):
        loops[m.group(1)] = m.group(2).replace("\\", " ").split()
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            continue
        for m in SITE.finditer(line):
            if m.group(1):
                continue                       # run through an interpreter
            name = m.group(2)
            if name.startswith("$"):
                names.update(loops.get(name[1:], []))
            else:
                names.add(name)
    return names


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT)] + list(args),
                          capture_output=True, text=True)


def main(argv):
    rev = argv[1] if argv[:1] == ["--rev"] and len(argv) == 2 else None
    if rev:
        p = git("show", f"{rev}:bin/runTests")
        if p.returncode != 0:
            print(f"gate_exec_bits: cannot read bin/runTests at {rev}")
            return 1
        text = p.stdout
        ls = git("ls-tree", rev, "--", "bin/curate/").stdout
        modes = {l.split("\t")[1]: l.split()[0] for l in ls.splitlines() if "\t" in l}
    else:
        text = (ROOT / "bin" / "runTests").read_text(errors="ignore")
        ls = git("ls-files", "-s", "--", "bin/curate/").stdout
        modes = {l.split("\t")[1]: l.split()[0] for l in ls.splitlines() if "\t" in l}
    names = direct_scripts(text)
    bad = []
    for n in sorted(names):
        rel = f"bin/curate/{n}.py"
        mode = modes.get(rel)
        if mode is not None:
            if mode != "100755":
                bad.append((rel, f"mode {mode} in git"))
        elif not rev and (ROOT / rel).is_file() and not os.access(ROOT / rel, os.X_OK):
            bad.append((rel, "untracked and not executable on disk"))
    where = (f"at {rev[:10]}" if re.fullmatch(r"[0-9a-f]{11,40}", rev) else f"at {rev}") if rev else "in this tree"
    if bad:
        print(f"gate_exec_bits: REFUSED -- {len(bad)} script(s) bin/runTests runs "
              f"DIRECTLY lack the executable bit {where}; each would fail with "
              "'Permission denied', and only the full sweep reaches its site:")
        for rel, why in bad:
            print(f"    {rel}: {why}")
        print("  Remedy: chmod +x " + " ".join(r for r, _ in bad)
              + " && git update-index --chmod=+x " + " ".join(r for r, _ in bad))
        return 1
    print(f"gate_exec_bits: OK -- the {len(names)} bin/curate script(s) bin/runTests "
          f"runs directly are executable {where} (mode 100755 in git; on disk "
          "for an untracked one).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
