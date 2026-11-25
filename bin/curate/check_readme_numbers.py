#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a README number that quotes a run is TIED to the golden row it quotes.

    bin/curate/check_readme_numbers.py

THE REAL DEFECT (found 2026-11-18, DEV.md 4c C447).  After the density door
moved tau (310 -> 288 s), the README of cstr01_first_order still said the
conversion was 52.59 % while the run prints 50.75 %, and pfr01_first_order
said 67.02 % against 64.32 %.  The golden pins what a run PRINTS, the README
is prose, and nothing connected the two: the first text a student reads was
wrong and every suite was green.  The same drift was then found by hand in
flash02 (V/F 0.7976 vs 0.7685), column16 (0.9812 vs 0.9510), bubbleT01
(354.42 vs 354.57 K), batch01 and the ammonia reactor ladder.

THE MARKER (DEV.md 4c C447).  A number in a README that quotes a run is
written with an HTML comment directly after it, naming the row of the case's
own `expected` file it comes from (the three leading columns of the row):

    V/F = **0.7685**<!--golden: kpi flash02 V_over_F-->
    conversion 50.75 %<!--golden: kpi cstr01 X *100-->

The comment is invisible in rendered Markdown.  `@steady/flash/flash01_x` first in the marker reads another case's
`expected` (a number quoted from a sister case).  Several rows are summed with `&` and subtracted with `&-`
(`kpi a x & kpi b x`, `kpi a x &- kpi b x`).  Optional trailing
words say how the README's unit differs from the golden's SI value: `*F` multiplies the row
by F, `+O` adds O after the factor (`*100`, `*1e-3`, `+-273.15`).  The number
checked is the token immediately before the comment (`**`, `%` and ONE unit word such as `K` or `kmol/h`
may sit between number and comment).  A comment that is not directly after a
number FAILS, so a misplaced marker never goes unchecked.

WHAT IT CHECKS.  For every marker: the row exists in the case's `expected`;
the number, as written, equals the row (scaled) rounded to the number of
decimals written -- 0.7685 against 0.768504749542 passes, 0.7976 does not.
A moved golden row therefore fails the README it feeds, and the re-record is
made to name it.

WHAT IT DOES NOT CHECK (the blind spots, stated).  A number with NO marker is
not checked: a paper's value, a hand calculation, an input.  That the marker
is on every number that SHOULD carry one is a reading, not a gate (the
migration of DEV.md 4c C447 was done by reading each tier-`tutorial` README
against its run).  A marker naming the wrong row that happens to round the
same passes.
"""
import re
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MARK = re.compile(
    r"(?P<num>[-+]?(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.\d+)?(?:[eE][-+]?\d+)?)[*_%`\s]*(?:[A-Za-zµ°€][\w°€/]*)?[*_%`\s]*"
    r"<!--\s*golden:\s*(?P<spec>[^>]*?)\s*-->")


def rows(expected: Path):
    out = {}
    for ln in expected.read_text(errors="replace").splitlines():
        t = ln.split()
        if len(t) < 5 or t[0].startswith("#"):
            continue
        try:
            out.setdefault((t[0], t[1], t[2]), float(t[3]))
        except ValueError:
            pass
    return out


def verify_marker(m, table, rel, what):
    """The error text of one marker (a MARK match) held to the case's `expected`
    rows `table` (None: no file), or None when the number agrees.  Shared with
    check_header_numbers.py, which holds the numbers of a case's HEADER to the
    same rows with the same grammar (DEV.md 4c C520)."""
    spec = m.group("spec").split()
    other = None
    if spec and spec[0].startswith("@"):
        other = ROOT / "tutorials" / spec[0][1:] / "expected"
        spec = spec[1:]
    tbl = table if other is None else (rows(other) if other.exists() else None)
    keys, cur, scale, off, signs = [], [], 1.0, 0.0, [1.0]
    for t in spec:
        if t in ("&", "&-"):
            keys.append(tuple(cur)); cur = []
            signs.append(-1.0 if t == "&-" else 1.0)
        elif t.startswith("*") and len(t) > 1:
            scale = float(t[1:])
        elif t.startswith("+") and len(t) > 1:
            off = float(t[1:])
        else:
            cur.append(t)
    keys.append(tuple(cur))
    if any(len(k) != 3 for k in keys):
        return f"{rel}: marker needs 'kind name key': '{m.group(0)}'"
    if tbl is None:
        return f"{rel}: the case has no `expected` file"
    miss = [k for k in keys if k not in tbl]
    if miss:
        return (f"{rel}: no row '{' '.join(miss[0])}' in expected "
                f"(marker after {m.group('num')})")
    written = m.group("num").replace(",", "").replace(" ", "")
    d = Decimal(written)
    dec = max(0, -d.as_tuple().exponent) if "e" not in written.lower() else \
        max(0, len(written.lower().split("e")[0].split(".")[-1]) if "." in written else 0)
    if "e" in written.lower():
        tol = 0.5 * 10 ** (-dec) * 10 ** int(written.lower().split("e")[1])
    else:
        tol = 0.5 * 10 ** (-dec)
    want = sum(sg * tbl[k] for sg, k in zip(signs, keys)) * scale + off
    if abs(float(written) - want) > tol * (1 + 1e-9):
        return (f"{rel}: {what} says {written}, the run's row "
                f"'{' & '.join(' '.join(k) for k in keys)}' gives {want:.10g}")
    return None


def main() -> int:
    bad, n, cases = [], 0, set()
    for readme in sorted(ROOT.glob("tutorials/**/README.md")):
        text = readme.read_text(errors="replace")
        if "<!--golden:" not in text and "<!-- golden:" not in text:
            continue
        case = readme.parent
        exp = case / "expected"
        rel = readme.relative_to(ROOT)
        table = rows(exp) if exp.exists() else None
        found = list(MARK.finditer(text))
        seen = {m.end() for m in found}
        for h in re.finditer(r"<!--\s*golden:[^>]*-->", text):
            if h.end() not in seen:
                ctx = " ".join(text[max(0, h.start() - 40):h.end()].split())
                bad.append(f"{rel}: a golden marker is not directly after a number "
                           f"(it would go unchecked): ...{ctx}")
        for m in found:
            n += 1
            cases.add(case)
            err = verify_marker(m, table, rel, "README")
            if err:
                bad.append(err)
    if bad:
        print("check_readme_numbers: FAILED")
        for b in bad:
            print("  " + b)
        return 1
    print(f"check_readme_numbers: OK -- {n} marked README number(s) in "
          f"{len(cases)} case(s) agree with their golden rows at the precision written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
