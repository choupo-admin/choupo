#!/usr/bin/env python3
"""Turn a line-stamped suite log into per-item wall-clock numbers.

    bin/curate/suite_timings.py build/suiteTimings.raw build/suiteTimings.csv

Written by bin/runTests' timing wrapper (2026-09-05, task #84): every output
line of the sweep arrives with the epoch it was printed.  Each PASS / FAIL /
KNOWN-BROKEN / EXPECTED-FAIL line closes an item, and the item's seconds are
the gap since the previous such line -- so whatever printed in between is
charged to the item that ends the gap (a gate's own diagnostics; the header
checks before the first PASS).  Good enough to find the tail; not a profiler.

KIND is decided from the tree, not from the name's shape: an item whose name
is the basename of a case directory under tutorials/ is a `case`, anything
else a `gate`.  Two totals follow (cases vs gates), which is the number the
"minimise the case list" argument needs and never had.

This is a MEASUREMENT, not a gate: it prints, it writes the CSV, it judges
nothing.  The decisions it informs are separate slices.
"""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULT = re.compile(r"^(PASS|FAIL|KNOWN-BROKEN|EXPECTED-FAIL)\s+(\S+)")
TALLY = re.compile(r"^PASS \d+ / FAIL \d+")     # the closing summary line is not an item


def case_names() -> set[str]:
    return {p.parent.parent.name for p in ROOT.glob("tutorials/**/system/controlDict")}


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[2].strip())
        return 2
    raw, out = Path(argv[1]), Path(argv[2])
    if not raw.exists():
        print("suite_timings: no raw log at", raw)
        return 1
    cases = case_names()
    rows, t_prev, t_first = [], None, None
    for line in raw.read_text(errors="replace").splitlines():
        stamp, _, text = line.partition("\t")
        try:
            t = float(stamp)
        except ValueError:
            continue
        if t_first is None:
            t_first = t_prev = t
        m = RESULT.match(text)
        if not m or TALLY.match(text):
            continue
        verdict, name = m.groups()
        rows.append((name, "case" if name in cases else "gate", verdict, round(t - t_prev, 3)))
        t_prev = t
    if not rows:
        print("suite_timings: no result lines in", raw)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["item", "kind", "verdict", "seconds"])
        w.writerows(rows)
    total = (t_prev or 0) - (t_first or 0)
    by_kind = {}
    for _, kind, _, s in rows:
        by_kind[kind] = by_kind.get(kind, 0.0) + s
    print()
    print("---- where the wall clock went (build/suiteTimings.csv; a measurement, not a gate) ----")
    print(f"  items {len(rows)}: " + ", ".join(
        f"{k} {sum(1 for r in rows if r[1] == k)} = {v/60:.1f} min" for k, v in sorted(by_kind.items()))
        + f"; walked in {total/60:.1f} min")
    print("  slowest ten (seconds are the gap since the previous result line):")
    for name, kind, verdict, s in sorted(rows, key=lambda r: -r[3])[:10]:
        print(f"    {s:8.1f} s  {kind:<4}  {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
