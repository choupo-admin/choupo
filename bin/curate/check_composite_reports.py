#!/usr/bin/env python3
"""Composite-report gate: a composite/named-edge case's reports must carry the
REAL boundary (roles from the flattened topology) and a non-empty global mass
balance.  Runs composite01_two_flashes in a temp copy and asserts:
  - streamTable: `feed` is a feed; vapor1/vapor2/bottoms are products;
  - massBalance: TOTAL in/out are non-zero and closure is ~100 %.
A zero/zero balance or all-intermediate roles FAILS (that was the P0: the
report walked the raw flowsheetDict, found no inline units in a composite,
and published an empty boundary as if it were physics)."""
import csv
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials" / "steady" / "flowsheets" / "composite01_two_flashes"


def main():
    with tempfile.TemporaryDirectory(prefix="choupo-comprep-") as tmp:
        case = Path(tmp) / "case"
        shutil.copytree(CASE, case,
                        ignore=shutil.ignore_patterns("log.choupo*", "reports",
                                                      "converged"))
        r = subprocess.run([str(SOLVE), str(case)], capture_output=True,
                           text=True, cwd=ROOT)
        if r.returncode != 0:
            print("composite-report gate: composite01_two_flashes FAILED to"
                  " run:\n" + (r.stdout + r.stderr)[-800:])
            return 1

        roles = {}
        with open(case / "reports" / "streams" / "streamTable.csv") as f:
            for row in csv.DictReader(f):
                roles[row["stream"]] = row["role"]
        bad = []
        if roles.get("feed") != "feed":
            bad.append(f"feed role = {roles.get('feed')!r} (want 'feed')")
        for s in ("vapor1", "vapor2", "bottoms"):
            if roles.get(s) != "product":
                bad.append(f"{s} role = {roles.get(s)!r} (want 'product')")
        if roles.get("liquid1") != "intermediate":
            bad.append(f"liquid1 role = {roles.get('liquid1')!r}"
                       " (want 'intermediate')")

        total_in = total_out = closure = None
        with open(case / "reports" / "balances" / "massBalance.csv") as f:
            for row in csv.reader(f):
                if row and row[0] == "TOTAL":
                    total_in, total_out = float(row[1]), float(row[2])
                if row and row[0] == "closure_pct":
                    closure = float(row[3])
        if not total_in or not total_out:
            bad.append(f"global mass balance is EMPTY (in={total_in},"
                       f" out={total_out}) -- the boundary was not derived")
        elif closure is None or abs(closure - 100.0) > 0.1:
            bad.append(f"global closure {closure}% (want ~100)")

        if bad:
            print("COMPOSITE-REPORT GATE FAILED (%d):" % len(bad))
            for b in bad:
                print("  " + b)
            return 1
    print("composite-report gate: boundary roles + global balance real"
          " (closure ~100%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
