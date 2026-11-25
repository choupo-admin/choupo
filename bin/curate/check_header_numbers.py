#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a number in a case's HEADER that quotes a run is TIED to its golden row.

    bin/curate/check_header_numbers.py            # the gate
    bin/curate/check_header_numbers.py --write    # re-pin the ratchet (after a fix only)

THE REAL DEFECT (found 2026-11-25, DEV.md 4c C520).  The header of
tutorials/steady/distillation/column10_flooding described a saturated-liquid
feed and a 114.5 % flood, 1.10 m, 98.12 %, 268.5 mm: numbers of a column
designed at 1.316 m.  The feed file is 370 K at 70 % vapour and the golden held
98.7 % at 1.10 m (later 112.6 %).  column09 -- the same family -- still said
the feed was a saturated liquid and quoted per-tray numbers (63.7 %, 1.316 m)
the run no longer printed.  A header is prose and a golden pins what the run
prints, so every suite was green while the first text a student reads described
another column.  check_readme_numbers.py closed this for READMEs (C447); this
gate closes it for the header of system/controlDict and system/flowsheetDict.

WHAT IT CHECKS, TWO THINGS.
 1. THE MARKER.  A header number written with `<!--golden: kind name key
    [*F] [+O]-->` directly after it (the grammar of check_readme_numbers.py,
    inside a dict comment, which is invisible to the parser) must round to
    that row of the case's `expected` at the decimals written, and a marker
    that is not directly after a number FAILS (it would go unchecked).
 2. THE RATCHET.  bin/curate/header_numbers.py classifies every other header
    number (MATCH / INPUT / PAPER / TRIVIAL / OTHER / SUSPECT; its docstring
    says what "header" means and how).  `header_numbers_debt.tsv` pins today's
    SUSPECT count per case: a case whose count RISES fails (a new header number
    that looks like a result and ties to nothing, or a MATCH that went stale
    because the golden moved), and a case whose count FALLS fails too, until
    the file is lowered with --write -- the debt may only shrink and is never
    forgotten.  A number is silenced by marking it, which holds it to its row.

WHAT IT DOES NOT CHECK (stated).  An unmarked number the heuristic calls MATCH
or INPUT may equal a row by chance and still be wrong; a SUSPECT may be right
(a hand calculation, a paper's value written without a citation word).  The
classification is a heuristic that over-reports on purpose.  That the marker
sits on every number that should carry one is a reading.  data/curation cases
(fits, no prose header to speak of) are not scanned.
"""
import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEBT = HERE / "header_numbers_debt.tsv"


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def read_debt():
    out = {}
    if DEBT.exists():
        for ln in DEBT.read_text().splitlines():
            if ln.strip() and not ln.startswith("#"):
                k, n = ln.split("\t")
                out[k] = int(n)
    return out


def main(argv) -> int:
    rn, hn = load("check_readme_numbers"), load("header_numbers")
    bad, nmark, now = [], 0, {}
    for case in hn.case_dirs():
        rel = case.relative_to(ROOT).as_posix()
        exp = case / "expected"
        table = rn.rows(exp) if exp.exists() else None
        for text in hn.header_texts(case):
            if "golden:" not in text:
                continue
            found = list(rn.MARK.finditer(text))
            seen = {m.end() for m in found}
            for h in re.finditer(r"<!--\s*golden:[^>]*-->", text):
                if h.end() not in seen:
                    ctx = " ".join(text[max(0, h.start() - 40):h.end()].split())
                    bad.append(f"{rel}: a golden marker in the header is not directly "
                               f"after a number (it would go unchecked): ...{ctx}")
            for m in found:
                nmark += 1
                err = rn.verify_marker(m, table, rel, "header")
                if err:
                    bad.append(err)
        n = sum(1 for _, _, c in hn.classify_case(case) if c == "SUSPECT")
        if n:
            now[rel] = n
    pinned = read_debt()
    if "--write" in argv:
        DEBT.write_text(
            "# Header numbers that look like results and tie to nothing: today's SUSPECT\n"
            "# count per case (bin/curate/header_numbers.py).  A ratchet: it may only\n"
            "# shrink; mark a number with <!--golden: ...--> or fix the header, then\n"
            "# re-pin with check_header_numbers.py --write.  DEV.md 4c C520.\n"
            + "".join(f"{k}\t{v}\n" for k, v in sorted(now.items())))
        print(f"check_header_numbers: wrote {len(now)} case(s), {sum(now.values())} suspect(s)")
        return 0
    for k in sorted(set(now) | set(pinned)):
        a, b = now.get(k, 0), pinned.get(k, 0)
        if a > b:
            bad.append(f"{k}: {a} suspect header number(s), pinned {b} -- a number that "
                       f"looks like a result and ties to no golden row or input "
                       f"(bin/curate/header_numbers.py --case {Path(k).name}; mark it "
                       f"with <!--golden: ...--> or correct it)")
        elif a < b:
            bad.append(f"{k}: {a} suspect header number(s), pinned {b} -- the debt "
                       f"shrank: lower it with check_header_numbers.py --write")
    if bad:
        print("check_header_numbers: FAILED")
        for b in bad:
            print("  " + b)
        return 1
    print(f"check_header_numbers: OK -- {nmark} marked header number(s) agree with their "
          f"golden rows; suspect header numbers {sum(now.values())} in {len(now)} case(s) "
          f"held at the pinned debt (may only shrink)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
