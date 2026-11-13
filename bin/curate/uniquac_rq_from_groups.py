#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""uniquac_rq_from_groups -- UNIQUAC r and q as the sum of a component's own UNIFAC groups.

    bin/curate/uniquac_rq_from_groups.py --list            what would be derived
    bin/curate/uniquac_rq_from_groups.py --write NAME ...  write it into those records
    bin/curate/uniquac_rq_from_groups.py --check [NAME ...] every derived r/q reproduced

WHY (DEV.md 4c C294, 2026-11-11).  A UNIQUAC pair needs each component's van
der Waals volume r and surface area q (`uniquac { r; q; }`, read by
src/thermo/Component.cpp and injected by ThermoPackage::injectUniquacRQ).  The
catalogue carries a tabulated r/q (Abrams & Prausnitz) on a handful of
records.  A component that lacks them but DECLARES its original-UNIFAC
subgroups (`groups { unifac ( { group G; count n; } ... ); }`) gets them by
DEFINITION -- the group sum UNIFAC itself is built on:

    r = sum_k nu_k R_k        q = sum_k nu_k Q_k

R_k, Q_k from data/standards/parameters/UNIFAC/groups.dat (Hansen,
Rasmussen, Fredenslund, Schiller & Gmehling, Ind. Eng. Chem. Res. 30 (1991)
2352).  Written with a per-value provenance entry `uniquac { origin
definition; method "sum of UNIFAC group R_k/Q_k"; ... }`.  A record that
already carries r/q is never touched (a tabulated value is not replaced by a
sum); a record without UNIFAC groups gets nothing, and its pairs are not
fitted with UNIQUAC (the pair case says so).

--check recomputes every `origin definition` r/q of the catalogue from the
record's own groups and the table (1e-9) -- used by check_regressed_pairs'
UNIQUAC arm, so a hand-edited r/q or group list cannot drift from the sum.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMP = ROOT / "data" / "standards" / "components"
GROUPS = ROOT / "data" / "standards" / "parameters" / "UNIFAC" / "groups.dat"
METHOD = "sum of UNIFAC group R_k/Q_k"
CITATION = ("R_k and Q_k of Hansen, Rasmussen, Fredenslund, Schiller & Gmehling, "
            "Ind. Eng. Chem. Res. 30 (1991) 2352, as tabulated in "
            "data/standards/parameters/UNIFAC/groups.dat; the group sum of "
            "Fredenslund, Jones & Prausnitz, AIChE J. 21 (1975) 1086")


def strip(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def table():
    out = {}
    for m in re.finditer(r"\{\s*name\s+(\S+);\s*mainGroup\s+\S+;\s*R\s+([0-9.]+);\s*Q\s+([0-9.]+);\s*\}",
                         GROUPS.read_text()):
        out[m.group(1)] = (float(m.group(2)), float(m.group(3)))
    return out


def unifac_groups(text):
    """[(group, count)] of the record's `unifac ( ... );`, or None."""
    m = re.search(r"(^|\s)unifac\s*\((.*?)\)\s*;", strip(text), re.S)
    if not m:
        return None
    return [(g, int(n)) for g, n in
            re.findall(r"group\s+(\S+?)\s*;\s*count\s+(\d+)\s*;", m.group(2))]


def has_rq(text):
    return re.search(r"(?m)^uniquac\s*\{", strip(text)) is not None


def rq_of(text):
    m = re.search(r"(?m)^uniquac\s*\{([^{}]*)\}", strip(text))
    if not m:
        return None
    r = re.search(r"(^|\s)r\s+([0-9.eE+-]+)\s*;", m.group(1))
    q = re.search(r"(^|\s)q\s+([0-9.eE+-]+)\s*;", m.group(1))
    return (float(r.group(2)), float(q.group(2))) if r and q else None


def derive(text, tab):
    """(r, q, groups) or raises ValueError naming why not."""
    g = unifac_groups(text)
    if not g:
        raise ValueError("declares no UNIFAC groups")
    miss = [k for k, _ in g if k not in tab]
    if miss:
        raise ValueError(f"UNIFAC group(s) {miss} not in groups.dat")
    r = round(sum(n * tab[k][0] for k, n in g), 6)
    q = round(sum(n * tab[k][1] for k, n in g), 6)
    return r, q, g


def is_definition(text):
    prov = re.search(r"(^|\n)provenance\s*\{", text)
    if not prov:
        return False
    m = re.search(r"\n    uniquac\s*\{([^{}]*)\}", text[prov.start():])
    return bool(m and re.search(r"origin\s+definition\s*;", m.group(1)))


def write(name, tab):
    p = COMP / f"{name}.dat"
    t = p.read_text()
    if has_rq(t):
        raise ValueError("already carries `uniquac { r; q; }` -- never replaced")
    r, q, g = derive(t, tab)
    gl = " + ".join(f"{n} {k}" for k, n in g)
    blk = (f"// UNIQUAC van der Waals volume r and surface area q: the sum of the\n"
           f"// record's own UNIFAC groups ({gl}), R_k/Q_k of Hansen et al. 1991\n"
           f"// (DEV.md 4c C294; bin/curate/uniquac_rq_from_groups.py).\n"
           f"uniquac\n{{\n    r   {r:.4f};\n    q   {q:.4f};\n}}\n\n")
    m = re.search(r"^groups\s*\{", t, re.M)
    if not m:
        raise ValueError("no top-level `groups {` block to place r/q beside")
    t = t[:m.start()] + blk + t[m.start():]
    ent = (f"    uniquac\n    {{\n        origin        definition;\n"
           f"        method        \"{METHOD}: r = sum nu_k R_k = {r:.4f}, q = sum nu_k Q_k = "
           f"{q:.4f} over the record's unifac groups ({gl})\";\n"
           f"        citation      \"{CITATION}\";\n    }}\n")
    pm = re.search(r"^provenance\s*\n?\{\n", t, re.M)
    if pm:
        t = t[:pm.end()] + ent + t[pm.end():]
    else:
        t = t.rstrip("\n") + "\n\nprovenance\n{\n" + ent + "}\n"
    p.write_text(t)
    return r, q


def check_text(text, tab=None):
    """None when the record's r/q equal its group sum, else why not."""
    try:
        r, q, _ = derive(text, tab or table())
    except ValueError as ex:
        return str(ex)
    have = rq_of(text)
    if have is None or abs(have[0] - r) > 5e-5 or abs(have[1] - q) > 5e-5:
        return f"uniquac r/q {have}, the group sum gives ({r:.4f}, {q:.4f})"
    return None


def check(names=None):
    tab = table()
    fails, n = [], 0
    for p in sorted(COMP.glob("*.dat")):
        if names and p.stem not in names:
            continue
        t = p.read_text()
        if not is_definition(t):
            continue
        n += 1
        try:
            r, q, _ = derive(t, tab)
        except ValueError as ex:
            fails.append(f"{p.stem}: r/q `origin definition` but {ex}")
            continue
        have = rq_of(t)
        if have is None or abs(have[0] - r) > 1e-9 + 5e-5 or abs(have[1] - q) > 1e-9 + 5e-5:
            fails.append(f"{p.stem}: uniquac r/q {have}, the group sum gives ({r:.4f}, {q:.4f})")
    return n, fails


def main(argv):
    tab = table()
    if argv[:1] == ["--list"]:
        for p in sorted(COMP.glob("*.dat")):
            t = p.read_text()
            if has_rq(t):
                continue
            try:
                r, q, g = derive(t, tab)
                print(f"{p.stem}: r {r:.4f} q {q:.4f}")
            except ValueError:
                pass
        return 0
    if argv[:1] == ["--write"]:
        rc = 0
        for n in argv[1:]:
            try:
                r, q = write(n, tab)
                print(f"{n}: r {r:.4f}, q {q:.4f} written")
            except ValueError as ex:
                print(f"{n}: NOT written -- {ex}")
                rc = 1
        return rc
    if argv[:1] == ["--check"]:
        n, fails = check(set(argv[1:]) or None)
        if fails:
            print("uniquac_rq_from_groups --check: FAILED")
            for f in fails:
                print("  - " + f)
            return 1
        print(f"uniquac_rq_from_groups --check: OK -- {n} r/q of `origin definition` "
              "reproduced from their records' UNIFAC groups")
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
