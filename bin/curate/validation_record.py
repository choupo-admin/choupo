#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The automatic record of each validation (backlog C485).

One tab-separated file, read and never written by hand, in the repository's
COMMON git directory (so every worktree of a clone sees it, nothing tracked):

    <git-common-dir>/choupo-validations.tsv
    columns: when, tree, verdict (ok | fail | blocked | unvalidated),
             what ran, how many checks, failed checks

  add    --tree T --verdict V --what W [--checks N] [--failed a,b]
         (bin/integrate calls this when it prints its verdict; run it by hand
         after a bin/runTests you want the push hook to know about)
  check  TREE   exit 0 when the LAST record of TREE is `ok` or `blocked` (every
         check the tool could run passed), else 1 with the reason.
  show          print the last ten rows.

THE REAL DEFECTS THE PUSH HOOK (bin/hooks/pre-push) READS THIS FOR: on
2026-11-24 a push to main went out with a red gate, and a push went out before
check_source_headers ran (backlog_progress.tsv, red on main).
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path


def store():
    d = subprocess.run(["git", "rev-parse", "--git-common-dir"], text=True,
                       capture_output=True, check=True).stdout.strip()
    return Path(d).resolve() / "choupo-validations.tsv"


def rows():
    p = store()
    if not p.exists():
        return []
    return [l.split("\t") for l in p.read_text().splitlines() if l.strip()]


def add(tree, verdict, what, checks=0, failed=""):
    clean = lambda s: str(s).replace("\t", " ").replace("\n", " ")
    with store().open("a") as f:
        f.write("\t".join([time.strftime("%Y-%m-%dT%H:%M:%S"), tree, verdict,
                           clean(what), str(checks), clean(failed)]) + "\n")


def check(tree):
    mine = [r for r in rows() if len(r) >= 3 and r[1] == tree]
    if not mine:
        return False, "no validation is recorded for this tree"
    r = mine[-1]
    if r[2] in ("ok", "blocked"):
        return True, f"{r[2]} ({r[3]}, {r[0]})"
    why = r[5] if len(r) > 5 and r[5] else r[3]
    return False, f"the last validation of this tree is {r[2]}: {why} ({r[0]})"


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("--tree", required=True)
    a.add_argument("--verdict", required=True,
                   choices=["ok", "fail", "blocked", "unvalidated"])
    a.add_argument("--what", required=True)
    a.add_argument("--checks", type=int, default=0)
    a.add_argument("--failed", default="")
    c = sub.add_parser("check")
    c.add_argument("tree")
    sub.add_parser("show")
    o = ap.parse_args(argv)
    if o.cmd == "add":
        add(o.tree, o.verdict, o.what, o.checks, o.failed)
        return 0
    if o.cmd == "check":
        ok, why = check(o.tree)
        print(why)
        return 0 if ok else 1
    for r in rows()[-10:]:
        print("\t".join(r))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
