#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_backlog: BACKLOG.tsv is the one home of every item's status, and it is whole.

THE REAL DEFECT (DEV.md 4c C436, 2026-11-18): an item's status had no home of
its own -- it lived in prose over 22 000 lines of DEV.md 4c, so the plan was a
fresh reading each time, and on 2026-11-18 the plan shown to Vitor held only
the night's lane while 143 of his items were open or partial, and a census
called a landed EduTool (C247) open.

Fails when: (a) an item C<n> headed in DEV.md 4c (`**C<n>`) has no row, or a
row names no item there; (b) a status is outside DONE / PARTIAL / OPEN /
DROPPED / NOT-AN-ITEM; (c) an OPEN or PARTIAL row has no rank or no reason, the
ranks are not 1..N (0 = in progress), or a closed row has a rank; (d) a commit named in a row is not
in this repository's history; (e) a DROPPED row does not quote Vitor (only he
drops an item); (f) a row is duplicated or the header is not the agreed one.
It does NOT check that a status is TRUE -- that is a reading, kept by the rule
that a landing changes its item's row in the same commit.
"""
import csv, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN_ROOTS = ("BACKLOG.tsv", "DEV.md")
HEADER = ["item", "status", "rank", "title_pt", "open_pt", "why_pt", "asked", "size", "commit", "waits_on"]
STATUSES = {"DONE", "PARTIAL", "OPEN", "DROPPED", "NOT-AN-ITEM"}


def items_in_register():
    s = (ROOT / "DEV.md").read_text()
    a = s.index("## 4c."); b = s.index("## 4d.")
    return {f"C{m.group(1)}" for m in re.finditer(r"\*\*\(?C(\d{1,3})\b", s[a:b])}


def main():
    bad = []
    rows = list(csv.reader((ROOT / "BACKLOG.tsv").open(), delimiter="\t"))
    if rows[0] != HEADER:
        bad.append(f"header is {rows[0]}, expected {HEADER}")
    body = rows[1:]
    seen = {}
    ranks = []
    for i, r in enumerate(body, 2):
        if len(r) != len(HEADER):
            bad.append(f"line {i}: {len(r)} columns"); continue
        c, st, rank = r[0], r[1], r[2]
        if c in seen:
            bad.append(f"{c}: duplicated (lines {seen[c]} and {i})")
        seen[c] = i
        if st not in STATUSES:
            bad.append(f"{c}: status '{st}'")
        if st in ("OPEN", "PARTIAL"):
            if not rank.isdigit():
                bad.append(f"{c}: {st} with no rank")
            elif not r[5].strip():
                bad.append(f"{c}: ranked {rank} with no reason (why_pt)")
            else:
                ranks.append(int(rank))
        elif rank:
            bad.append(f"{c}: {st} carries rank '{rank}'")
        if st == "DROPPED" and "Vitor" not in r[4] and "Vítor" not in r[4]:
            bad.append(f"{c}: DROPPED without Vitor's words in open_pt")
    pos = sorted(k for k in ranks if k > 0)
    if pos and pos != list(range(1, len(pos) + 1)):
        bad.append("ranks are not 1..N without gaps or repeats (rank 0 = in progress)")
    commits = sorted({r[8] for r in body if len(r) == len(HEADER) and r[8]})
    for h in commits:
        if subprocess.run(["git", "-C", str(ROOT), "cat-file", "-e", h + "^{commit}"],
                          capture_output=True).returncode:
            bad.append(f"commit {h} is not in this repository")
    reg = items_in_register()
    rowset = set(seen)
    for c in sorted(reg - rowset, key=lambda x: int(x[1:])):
        bad.append(f"{c}: in DEV.md 4c, no row in BACKLOG.tsv")
    for c in sorted(rowset - reg, key=lambda x: int(x[1:])):
        if not re.search(rf"\b{c}\b", (ROOT / "DEV.md").read_text()):
            bad.append(f"{c}: a row with no item in DEV.md")
    if bad:
        print("check_backlog: FAIL -- %d finding(s)" % len(bad))
        for b in bad[:60]:
            print("  - " + b)
        return 1
    n = {s: sum(1 for r in body if r[1] == s) for s in STATUSES}
    print("check_backlog: OK -- %d items, every one headed in DEV.md 4c has its row "
          "(DONE %d, PARTIAL %d, OPEN %d, DROPPED %d, NOT-AN-ITEM %d); every open or "
          "partial item has a rank and a reason; %d named commits are in history.  NOT checked: "
          "that a status is true (a landing changes its row in the same commit)."
          % (len(body), n["DONE"], n["PARTIAL"], n["OPEN"], n["DROPPED"], n["NOT-AN-ITEM"], len(commits)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
