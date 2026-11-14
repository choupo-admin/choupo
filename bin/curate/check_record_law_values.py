#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a record's laws are well formed, and every law's check value reads back through the law.

    bin/curate/check_record_law_values.py

WHY (DEV.md 4c C398, the ruling's point 4 and the third addendum U3; slice
(b)).  A property block of a component record may hold several NAMED laws,
exactly one marked `preferred` (src/thermo/RecordLaws.H).  The units of a
law's coefficients belong to its TYPE (each type declares its form, units and
logarithm base where it is registered; the resolved view prints it), and the
only way a coefficient written in another unit is caught is to evaluate the
law at a state its own source tabulates and compare.  A law may therefore
carry `check { T <value> <unit>; value <value> <unit>; tolerance <fraction>; }`
-- a value from the law's source, compared, never a second source.

WHAT IT CHECKS, over data/standards/components:
  1. every property block holding two or more laws marks one `preferred`,
     and the word names one of its laws (sealed copies of the five records
     that held two viscosity laws before this rule keep reading without it,
     and a case that asks them for their preferred law is refused there);
  2. `choupoProps --record-law-checks` (src/applications/choupoProps/
     RecordLawChecks.cpp) evaluates every law that carries `check` through
     the engine's own law object: each must lie within its tolerance; a law
     that cannot be evaluated, or a block the engine cannot read, fails;
  3. THE DEBT: the laws that carry no check value, counted per property, are
     pinned in debt_registry.LAWS_WITHOUT_CHECK; a count may only shrink (a new law without a
     check fails, a check added lowers the pin, said in the commit).  The
     records the engine cannot load as a component on their own (minerals,
     species-like records) are listed by count and are outside its reach.

    reads: data/standards/components/
    reads: src/applications/choupoProps/RecordLawChecks.cpp src/thermo/RecordLaws.cpp
    reads: bin/curate/record_reader.py
"""
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from record_reader import PROPERTY_BLOCKS, laws_of, parse_file   # noqa: E402
from debt_registry import LAWS_WITHOUT_CHECK, LAWS_WITHOUT_CHECK_DEBT   # noqa: E402  ONE home

ROOT = Path(__file__).resolve().parents[2]
NAME = "check_record_law_values"
OUT = ROOT / "build" / "recordLawChecks" / "checks.tsv"

#  THE DEBT lives in the ONE registry (debt_registry.LAWS_WITHOUT_CHECK, with
#  its why and remedy): the laws without a check value, per property block;
#  a count may only shrink.
PINNED = LAWS_WITHOUT_CHECK


def main():
    fails = []
    #  1. `preferred`, read from the records' shape.
    for f in sorted((ROOT / "data/standards/components").glob("*.dat")):
        rec = parse_file(f)
        for prop in PROPERTY_BLOCKS:
            blk = rec.get(prop)
            if blk is None or isinstance(blk, list):
                continue
            laws = laws_of(prop, blk)
            names = [n for n, _ in laws]
            pref = blk.word("preferred")
            if len(laws) >= 2 and pref is None:
                fails.append(f"{f.name}: {prop} holds {len(laws)} laws ({', '.join(names)}) and marks"
                             " none `preferred` -- write `preferred <name>;` (the record's one value of"
                             " the property is a curation decision, never the order of the laws)")
            if pref is not None and pref not in names:
                fails.append(f"{f.name}: {prop}: `preferred {pref};` names no law of the block ({', '.join(names)})")
            if pref is not None and len(laws) == 1:
                fails.append(f"{f.name}: {prop}: `preferred` with one law -- a key with one possible value"
                             " is not written (the one law is preferred by construction)")

    #  2-3. The engine reads every law back.
    exe = ROOT / "choupoProps"
    if not exe.exists():
        print(f"{NAME}: FAIL -- {exe} is missing (build first); a gate that cannot run must not pass")
        return 1
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(exe), "--record-law-checks", str(OUT)], capture_output=True,
                       text=True, env=env, timeout=1200)
    if r.returncode != 0 or not OUT.exists():
        print(f"{NAME}: FAIL -- choupoProps --record-law-checks exited {r.returncode}\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")
        return 1
    nocheck = {p: 0 for p in PINNED}
    checked, not_loaded = [], 0
    for line in OUT.read_text().splitlines():
        if line.startswith("#"):
            continue
        c = line.split("\t")
        status = c[4] if len(c) > 4 else ""
        if status == "notLoaded":
            not_loaded += 1
        elif status == "nocheck":
            nocheck[c[1]] = nocheck.get(c[1], 0) + 1
        elif status == "checked":
            rel, tol = float(c[8]), float(c[9])
            checked.append(f"{c[0]}.{c[1]}.{c[2]} rel {rel:+.4g}")
            if not abs(rel) <= tol:
                fails.append(f"{c[0]}: {c[1]} law `{c[2]}` ({c[3]}) at T = {c[5]} K answers {c[7]},"
                             f" its check value is {c[6]}: relative {rel:+.4g} beyond the tolerance {tol}"
                             " -- a coefficient in another unit, or a transcription error")
        elif status in ("notEvaluable", "unreadable"):
            fails.append(f"{c[0]}: {c[1]} law `{c[2]}`: {status} -- {c[-1]}")
    for p, n in sorted(nocheck.items()):
        pin = PINNED.get(p, 0)
        if n > pin:
            fails.append(f"{p}: {n} laws carry no check value, the pin is {pin} -- a new law comes"
                         " with its check -- " + LAWS_WITHOUT_CHECK_DEBT["remedy"])
        elif n < pin:
            fails.append(f"{p}: {n} laws carry no check value, below the pin {pin} -- lower the count"
                         " in debt_registry.LAWS_WITHOUT_CHECK (the debt only shrinks, and says"
                         " so)")
    if fails:
        print(f"{NAME}: FAIL ({len(fails)})")
        for x in fails:
            print("  " + x)
        return 1
    print(f"{NAME}: OK -- every block of several laws marks one preferred; {len(checked)} check"
          f" value(s) read back within tolerance ({'; '.join(checked)}); laws without a check"
          f" (the pinned debt): {sum(nocheck.values())}; records not loadable alone: {not_loaded}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
