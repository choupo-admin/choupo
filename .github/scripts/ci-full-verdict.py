#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""ci-full-verdict.py <runTests-full.log> [bin/curate/platform_divergence_debt.tsv]

The verdict of the FULL tier on the runner (C384).  `bin/runTests` itself stays
strict -- it knows nothing of platforms.  This script, which only the CI
workflow runs, reads the sweep's own log and compares the set of failures with
the PINNED SET in bin/curate/platform_divergence_debt.tsv: rows and gates that
are known to disagree between the maintainer's platform and the runner's, each
with its class, its reason and its remedy.

  PASS when every failure is inside the pinned set;
  FAIL on any NEW failure (a case row or a gate not pinned);
  FAIL when a pinned entry no longer fails (it healed: remove its line, a debt
       that outlives its subject is how a ratchet stops being one);
  FAIL when the log carries no final tally (the sweep did not finish).

A pinned GATE (row `-`) also carries `max_details`, the number of detail lines
the gate printed when it was pinned; it fails above that, so a new defect
inside an already-red gate is not hidden by the pin.

The FAST tier has NO pin: it must be green by itself.

Columns of the debt file (TAB separated):
  case | row | runner_value | maintainer_value | class | reason | remedy | max_details
`case` is the case's short name or the gate's name as the sweep prints it;
`row` is `kind.name.key` as the sweep prints a mismatch, `-` for a whole
gate or a case that fails for a reason other than a KPI mismatch, or `*` for
EVERY row of that case (an optimiser's flat valley; see main()).
"""
import re
import sys
from pathlib import Path

TALLY = re.compile(r"^PASS \d+ / FAIL \d+")
FAIL = re.compile(r"^FAIL\s+(\S+)\s+\((.*)")
ROW = re.compile(r"^\s+(\S+): (?:got|MISSING|ANCHOR)")


def parse_log(text):
    """-> ({(case,row): n_detail}, tally_seen)"""
    fails = {}
    cur = None
    tally = False
    for line in text.split("\n"):
        line = re.sub(r"^\ufeff?\d{4}-\d\d-\d\dT[\d:.]+Z ", "", line)   # a web-log timestamp, when read from one
        if TALLY.match(line):
            tally = True
        m = FAIL.match(line)
        if m:
            cur = m.group(1)
            if m.group(2).startswith("KPI mismatch"):
                continue
            fails[(cur, "-")] = 0
            continue
        if cur is not None:
            r = ROW.match(line)
            if r:
                fails[(cur, r.group(1))] = 0
                continue
            if line.startswith(("PASS", "pass", "SKIP", "EXPECTED-FAIL", "KNOWN-BROKEN")):
                cur = None
            elif (cur, "-") in fails and line.strip():
                fails[(cur, "-")] += 1
    return fails, tally


def parse_debt(path):
    pinned = {}
    for line in Path(path).read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        f = line.split("\t")
        if len(f) < 7:
            print(f"ci-full-verdict: malformed debt line: {line[:80]}")
            sys.exit(2)
        pinned[(f[0], f[1])] = int(f[7]) if len(f) > 7 and f[7].strip() else None
    return pinned


def emit(fails, pinned):
    """Draft debt lines (TAB separated) for every failure not yet pinned; the
    reason and the remedy are written by a person, never by this script."""
    for (case, row), n in sorted(fails.items()):
        if (case, row) in pinned:
            continue
        print("\t".join([case, row, "RUNNER_VALUE", "MAINTAINER_VALUE", "CLASS", "REASON", "REMEDY",
                         str(n) if row == "-" else ""]))


def main(argv):
    if "--emit" in argv:
        argv = [a for a in argv if a != "--emit"]
        fails, _ = parse_log(Path(argv[1]).read_text(errors="replace"))
        emit(fails, parse_debt(argv[2]) if len(argv) > 2 else {})
        return 0
    log = Path(argv[1])
    debt = argv[2] if len(argv) > 2 else str(Path(__file__).resolve().parents[2] / "bin/curate/platform_divergence_debt.tsv")
    fails, tally = parse_log(log.read_text(errors="replace"))
    pinned = parse_debt(debt)
    problems = []
    if not tally:
        problems.append("the log has no final tally line: the sweep did not finish")
    #  A pin whose row is `*` covers EVERY row of that case: the rows an optimiser's
    #  flat valley moves depend on the runner's CPU (the same job ran on two EPYC
    #  models in one day), so a row-by-row pin of a fit would turn red on a runner
    #  whose valley is a little different.  A new FAILING CASE is still new, and a
    #  wildcard pin heals only when its case has no failing row at all.
    covered = lambda k: k in pinned or (k[0], "*") in pinned
    new = sorted(k for k in fails if not covered(k))
    healed = sorted(k for k in pinned
                    if (k[1] == "*" and not any(c == k[0] for c, _ in fails))
                    or (k[1] != "*" and k not in fails))
    grown = sorted(k for k, n in fails.items() if k in pinned and pinned[k] is not None and n > pinned[k])
    for k in new:
        problems.append(f"NEW failure: {k[0]} {k[1]}")
    for k in healed:
        problems.append(f"pinned entry no longer fails (remove it from the debt file): {k[0]} {k[1]}")
    for k in grown:
        problems.append(f"pinned gate {k[0]} now prints {fails[k]} detail lines, more than the {pinned[k]} it was pinned at")
    print(f"ci-full-verdict: {len(fails)} failing item(s) in the log, {len(pinned)} pinned, "
          f"{len(new)} new, {len(healed)} healed, {len(grown)} grown")
    for p in problems:
        print("  - " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
