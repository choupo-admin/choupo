#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Tool: which numbers in a case's HEADER are no longer the run's?  (DEV.md 4c C520)

    bin/curate/header_numbers.py                 # corpus counts
    bin/curate/header_numbers.py --suspects      # + every suspect, by case
    bin/curate/header_numbers.py --case column09 # one case, every number
    bin/curate/header_numbers.py --tsv           # case<TAB>suspects (the ratchet's form)

THE REAL DEFECT (found 2026-11-25).  The header of
tutorials/steady/distillation/column10_flooding described a saturated-liquid
feed and a 114.5 % flood that the golden never held: the feed file is 370 K at
70 % vapour and the golden says 0.987, later 1.126.  The header is prose, the
golden pins what the run prints, and nothing tied the two (the gap
check_readme_numbers.py closed for READMEs, DEV.md 4c C447).  column09, the
same family, still carries the same stale liquid-feed numbers.

WHAT "HEADER" MEANS HERE (stated, not guessed).  The text a student reads
before the numbers of the case:
  * the `description "...";` string of system/controlDict;
  * every comment (`/* */` and `//`) of system/controlDict;
  * the LEADING comments of system/flowsheetDict -- every comment before the
    first statement; the banner box (the block containing `-*- Choupo -*-`)
    is dropped.
Comments further down a dict (per-unit remarks) are not header and are not read.

HOW A NUMBER IS CLASSIFIED (a heuristic; it OVER-reports rather than hides).
  MARKED  carries `<!--golden: kind name key [*F] [+O]-->` directly after it
          (the grammar of check_readme_numbers.py); check_header_numbers.py
          holds it to the row.
  MATCH   equals some value in the case's own `expected` to the decimals
          written, directly or after a unit change (x1, x100, x1e-3, x1e3,
          x3600, /3600, x1e-5, x1e5, x1e-6, x1e6, +-273.15).
  INPUT   equals a numeric token of the case's own dicts (system/*,
          constant/*, 0/*), comments removed, under the same unit changes.
  PAPER   is in a sentence that cites a source (Table, Fig, Eq, Perry,
          et al, p., Example ...): a published value, not a run's.
  TRIVIAL an integer 0-9 with no unit, a year, a ratio like 1:2.
  SUSPECT none of the above AND it looks like a result: a unit word of a
          result (%, kW, MW, K, m, kPa, bar, kmol/h, kg/s, mm, m/s, ...), or a
          bare decimal of three or more significant digits.
  OTHER   the rest (a count, a bare integer): reported, never a ratchet row.
A MATCH is not proof the header is right (a number can equal a row by chance,
and the unit changes widen the net); it says the header has a row it could be
tied to.  A SUSPECT is not proof it is wrong; it says nothing ties it.
"""
import re
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

NUM = re.compile(r"(?<![\w.])[-+]?\d+(?:,\d{3})*(?:\.\d+)?(?:[eE][-+]?\d+)?")
MARKER = re.compile(r"\s*[*_%`]*\s*(?:[A-Za-zµ°€][\w°€/]*)?[*_%`\s]*<!--\s*golden:[^>]*?-->")
UNIT = re.compile(r"\s*(%|[A-Za-zµ°€][\w°€/^]*)")
RESULT_UNITS = {"%", "kW", "MW", "W", "K", "C", "m", "mm", "kPa", "bar", "Pa", "atm",
                "kmol/h", "kmol/s", "mol/s", "kg/s", "kg/h", "t/h", "m/s", "m3/h",
                "kWh", "MJ", "kJ", "kJ/kg", "EUR", "kEUR", "MEUR", "h", "s", "min",
                "ppm", "wt", "mol", "kg", "m2", "m3", "L", "J/mol", "kmol"}
PAPER = re.compile(r"Table|Tab\.|Fig\.|Figure|Eq\.|Eqs|Perry|et al|Example|Ex\.|\bp\.|\bpp\.|"
                   r"paper|Chapter|textbook|handbook|book|published|literature|vs the paper|"
                   r"\bref\b|Sinnott|Seader|Turton|Treybal|Kister|Wankat", re.I)
FACTORS = (1.0, 100.0, 1e-2, 1e3, 1e-3, 3600.0, 1 / 3600.0, 1e5, 1e-5, 1e6, 1e-6)
OFFSETS = (0.0, -273.15, 273.15)


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    return re.sub(r"//[^\n]*", " ", t)


def comments(t):
    """(kind, text) of every comment, in order."""
    out = []
    for m in re.finditer(r"/\*(.*?)\*/|//([^\n]*)", t, flags=re.S):
        out.append(m.group(1) if m.group(1) is not None else m.group(2))
    return out


def header_texts(case):
    """The header text of a case: see the module docstring."""
    out = []
    cd = case / "system" / "controlDict"
    if cd.exists():
        t = cd.read_text(errors="replace")
        m = re.search(r'description\s+"((?:[^"\\]|\\.)*)"', t, flags=re.S)
        if m:
            out.append(m.group(1))
        out += [c for c in comments(t) if "-*- Choupo -*-" not in c]
    fd = case / "system" / "flowsheetDict"
    if fd.exists():
        t = fd.read_text(errors="replace")
        pos = 0
        while True:
            m = re.compile(r"\s*(?:/\*(.*?)\*/|//([^\n]*))", re.S).match(t, pos)
            if not m:
                break
            body = m.group(1) if m.group(1) is not None else m.group(2)
            if "-*- Choupo -*-" not in body:
                out.append(body)
            pos = m.end()
    return out


def golden_values(case):
    vals = []
    exp = case / "expected"
    if not exp.exists():
        return vals
    for ln in exp.read_text(errors="replace").splitlines():
        t = ln.split()
        if len(t) < 5 or t[0].startswith("#"):
            continue
        try:
            vals.append(float(t[3]))
        except ValueError:
            pass
    return vals


def input_values(case):
    vals = []
    for sub in ("system", "constant", "0"):
        d = case / sub
        if not d.is_dir():
            continue
        for f in d.rglob("*"):
            if f.is_file():
                try:
                    t = strip_comments(f.read_text(errors="replace"))
                except OSError:
                    continue
                for m in NUM.finditer(t):
                    try:
                        vals.append(float(m.group(0).replace(",", "")))
                    except ValueError:
                        pass
    return vals


def tolerance(written):
    w = written.replace(",", "")
    d = Decimal(w)
    if "e" in w.lower():
        mant, ex = w.lower().split("e")
        dec = len(mant.split(".")[1]) if "." in mant else 0
        return 0.5 * 10 ** (-dec) * 10 ** int(ex)
    dec = max(0, -d.as_tuple().exponent)
    return 0.5 * 10 ** (-dec)


def equals_any(written, vals):
    v = float(written.replace(",", ""))
    tol = tolerance(written) * (1 + 1e-9)
    for x in vals:
        for f in FACTORS:
            for o in OFFSETS:
                if abs(x * f + o - v) <= tol or abs(x * f + o - v) <= tol * 1.0001:
                    return True
    return False


def sig_digits(written):
    d = written.replace(",", "").lstrip("+-").lower().split("e")[0].replace(".", "").lstrip("0")
    return len(d.rstrip("0")) if d else 0


def classify_case(case):
    """List of (number, context, class) for every number of the header."""
    gold, inp = golden_values(case), input_values(case)
    rows = []
    for text in header_texts(case):
        text = re.sub(r"\d{4}-\d{2}-\d{2}", " ", text)
        for m in NUM.finditer(text):
            w = m.group(0)
            after = text[m.end():m.end() + 160]
            ctx = " ".join(text[max(0, m.start() - 40):m.end() + 25].split())
            if MARKER.match(after):
                rows.append((w, ctx, "MARKED"))
                continue
            um = UNIT.match(after)
            unit = um.group(1) if um else ""
            if after[:1] == ":" or re.match(r"\s*:\d", after):
                rows.append((w, ctx, "TRIVIAL")); continue
            val = float(w.replace(",", ""))
            if re.fullmatch(r"(19|20)\d\d", w) or (re.fullmatch(r"\d", w) and not unit):
                rows.append((w, ctx, "TRIVIAL")); continue
            if "." not in w and "e" not in w.lower() and abs(val) < 100 and unit not in RESULT_UNITS:
                rows.append((w, ctx, "OTHER")); continue
            if equals_any(w, gold):
                rows.append((w, ctx, "MATCH")); continue
            if equals_any(w, inp):
                rows.append((w, ctx, "INPUT")); continue
            starts = [x.end() for x in re.finditer(r"[.;:]\s", text[:m.start()])]
            sent = text[(starts[-1] if starts else 0):m.end() + 60]
            if PAPER.search(sent):
                rows.append((w, ctx, "PAPER")); continue
            if unit in RESULT_UNITS or (("." in w) and sig_digits(w) >= 3):
                rows.append((w, ctx, "SUSPECT")); continue
            rows.append((w, ctx, "OTHER"))
    return rows


def case_dirs():
    out = []
    for base in ("tutorials",):
        for cd in sorted((ROOT / base).rglob("system/controlDict")):
            out.append(cd.parent.parent)
    return out


def main(argv):
    only = None
    if "--case" in argv:
        only = argv[argv.index("--case") + 1]
    counts, per, scanned, nogold = {}, {}, 0, 0
    for case in case_dirs():
        if only and only not in case.name:
            continue
        scanned += 1
        if not (case / "expected").exists():
            nogold += 1
        rows = classify_case(case)
        per[case] = rows
        for _, _, c in rows:
            counts[c] = counts.get(c, 0) + 1
    if "--tsv" in argv:
        for case, rows in per.items():
            n = sum(1 for r in rows if r[2] == "SUSPECT")
            if n:
                print(f"{case.relative_to(ROOT)}\t{n}")
        return 0
    if only:
        for case, rows in per.items():
            print(case.relative_to(ROOT))
            for w, ctx, c in rows:
                print(f"  {c:8s} {w:>10s}   ...{ctx}")
        return 0
    cases_with = sum(1 for r in per.values() if any(x[2] == "SUSPECT" for x in r))
    print(f"header_numbers: scanned {scanned} tutorial case(s) ({nogold} without an `expected`);"
          f" {sum(counts.values())} header number(s)")
    for k in ("MARKED", "MATCH", "INPUT", "PAPER", "TRIVIAL", "SUSPECT", "OTHER"):
        print(f"  {k:8s} {counts.get(k, 0)}")
    print(f"  cases with at least one SUSPECT: {cases_with}")
    if "--suspects" in argv:
        for case, rows in per.items():
            for w, ctx, c in rows:
                if c == "SUSPECT":
                    print(f"{case.relative_to(ROOT)}\t{w}\t{ctx}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
