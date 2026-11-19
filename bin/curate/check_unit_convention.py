#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_unit_convention -- a key whose bare number is in a working unit
reads a declared unit too, and is read in one place.

    bin/curate/check_unit_convention.py

WHY THIS EXISTS (DEV.md 4c C454, first slice).  The parser converts a value
written with its unit to canonical SI (`Pc 220.64 bar;` -> 2.2064e7 Pa); a key
the code then reads BARE and treats as bar was a trap: `Pc 220.64 bar;` would
have run as 2.2064e7 bar, at exit 0, in every component, and nothing could see
it because every record writes the number bare.  The 2026-11-19 outside sweep
(docs/reviews/2026-11-19-units-correlations-edutools/units.md) counted 18 such
families; the widest were component `Pc` (bar) and `pressureDesign` (bar g,
read bare as bar by thirteen sizers and as Pa by the pressure exchanger -- one
key, two conventions, in one postDict).  `Dictionary::lookupScalarIn(key,
Dims, workingUnit)` is the one reader: bare keeps the working unit (no record
moves), a declared unit is converted.

ARMS.
  (a) SOURCE: every read of a key listed in WORKING_UNIT_KEYS goes through
      `lookupScalarIn` / `lookupScalarInOrDefault` -- a plain `lookupScalar*`
      of it is the trap coming back.
  (b) Pc, BEHAVIOUR: flash09_n2ch4_stryjek (a phi-phi PR flash, where Pc
      enters both phases) is run three times on an unsealed copy -- CH4's Pc
      bare (the catalogue's number), written `<same> bar;`, and written bare
      as the Pa number.  The first two must agree to 1e-12 on V/F; the third
      must NOT (it proves the run is sensitive to Pc, without which the first
      comparison would prove nothing).
  (c) pressureDesign, BEHAVIOUR: a sizing witness run with its bare
      `pressureDesign` and with the same number written `bar` must publish
      the same wall thickness and cost to 1e-12.

WHAT IT DOES NOT CHECK.  The other 16 trap families of the sweep (they are
the rest of C454, one family per slice); whether `bar` is the RIGHT working
unit (it is the corpus convention, kept so no golden moves).
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import case_records                                      # noqa: E402

ROOT = HERE.parents[1]
BIN = ROOT / "build" / "linux64Gcc" / "choupoSolve"
LABEL = "check_unit_convention"

#  Configuration, not a waiver: the keys whose bare number is in a working
#  unit, and that unit (docs/ai/dict-syntax.md lists the same keys).
WORKING_UNIT_KEYS = {"Pc": "bar", "pressureDesign": "bar"}

FLASH = ROOT / "tutorials" / "steady" / "flash" / "flash09_n2ch4_stryjek"
SIZING = ROOT / "tutorials" / "steady" / "flash" / "flash22_drum_sizing_benzene_toluene"

fails = []


def arm_a():
    bad = []
    keys = "|".join(map(re.escape, WORKING_UNIT_KEYS))
    pat = re.compile(r'lookupScalar(?!In)\w*\(\s*"(' + keys + r')"')
    for p in sorted((ROOT / "src").rglob("*.[cH]*")):
        if p.suffix not in (".cpp", ".H"):
            continue
        for i, line in enumerate(p.read_text(errors="replace").split("\n"), 1):
            if line.lstrip().startswith("//"):
                continue
            m = pat.search(line)
            if m:
                bad.append("%s:%d reads `%s` without lookupScalarIn (bare would be "
                           "%s, a declared unit SI)" % (p.relative_to(ROOT), i, m.group(1),
                                                       WORKING_UNIT_KEYS[m.group(1)]))
    fails.extend(bad)
    return len(bad) == 0


def run(case):
    p = subprocess.run([str(BIN)], cwd=str(case), capture_output=True,
                       text=True, timeout=600)
    out = p.stdout + p.stderr
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    js = json.loads(m.group(1)) if m else None
    return p.returncode, out, js


def copy_unsealed(src, dst):
    case_records.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "reports", "iterations", "design", "economics"))
    for man in dst.rglob("propertyManifest"):
        man.unlink()
    return dst


def kpi(js, unit, key):
    return js["kpis"][unit][key]


def arm_b(td):
    variants = {}
    for name in ("bare", "declared", "pa"):
        d = copy_unsealed(FLASH, Path(td) / ("pc_" + name))
        rec = d / "constant" / "components" / "CH4.dat"
        if not rec.is_file():
            fails.append("(b) the probe copy carries no components/CH4.dat -- STALE fixture")
            return False
        t = rec.read_text()
        m = re.search(r"(?m)^(Pc\s+)([0-9.eE+-]+)(\s*;)", t)
        if not m:
            fails.append("(b) CH4.dat has no bare `Pc <number>;` line -- STALE fixture")
            return False
        v = float(m.group(2))
        new = {"bare": m.group(0),
               "declared": "%s%s bar%s" % (m.group(1), m.group(2), m.group(3)),
               "pa": "%s%r%s" % (m.group(1), v * 1e5, m.group(3))}[name]
        rec.write_text(t[:m.start()] + new + t[m.end():])
        rc, out, js = run(d)
        if rc != 0 or js is None:
            fails.append("(b) %s run failed (exit %d): %s" % (name, rc, out[-400:]))
            return False
        variants[name] = kpi(js, "node", "V_over_F")
    ok = True
    if abs(variants["bare"] - variants["declared"]) > 1e-12 * max(1.0, abs(variants["bare"])):
        fails.append("(b) `Pc %s bar;` gives V/F %.15g, bare gives %.15g -- the declared unit "
                     "is not read as bar" % ("<v>", variants["declared"], variants["bare"]))
        ok = False
    if abs(variants["bare"] - variants["pa"]) < 1e-6:
        fails.append("(b) the run is insensitive to Pc (bare Pa number gives the same V/F) -- "
                     "the comparison proves nothing; choose another witness")
        ok = False
    return ok, variants


def sizing_numbers(js):
    out = {}
    for it in js.get("sizing", js.get("equipment", [])) or []:
        if isinstance(it, dict):
            for k, v in it.items():
                if isinstance(v, (int, float)) and k not in ("index",):
                    out[(it.get("item", it.get("unit", "?")), k)] = v
    return out


def arm_c(td):
    res = {}
    for name in ("bare", "declared"):
        d = copy_unsealed(SIZING, Path(td) / ("pd_" + name))
        pd = d / "system" / "postDict"
        t = pd.read_text()
        ms = list(re.finditer(r"pressureDesign\s+([0-9.eE+-]+)\s*;", t))
        if not ms:
            fails.append("(c) the sizing witness declares no bare pressureDesign -- STALE fixture")
            return False
        if name == "declared":
            for m in reversed(ms):
                t = t[:m.start()] + "pressureDesign %s bar;" % m.group(1) + t[m.end():]
            pd.write_text(t)
        rc, out, js = run(d)
        if rc != 0 or js is None:
            fails.append("(c) %s run failed (exit %d): %s" % (name, rc, out[-400:]))
            return False
        res[name] = (sizing_numbers(js), js)
    a, b = res["bare"][0], res["declared"][0]
    if not a:
        fails.append("(c) the witness published no sizing numbers in its result -- STALE fixture")
        return False
    diff = [k for k in a if k not in b or abs(a[k] - b[k]) > 1e-12 * max(1.0, abs(a[k]))]
    if diff:
        fails.append("(c) `pressureDesign <v> bar;` moved %d sizing number(s), e.g. %s: %r -> %r"
                     % (len(diff), diff[0], a[diff[0]], b.get(diff[0])))
        return False
    return len(a)


def main():
    if not BIN.is_file():
        print("%s: FAILED -- no engine binary at %s (run `make all`); a check that "
              "cannot run must not pass" % (LABEL, BIN))
        return 1
    a_ok = arm_a()
    with tempfile.TemporaryDirectory(prefix="unitconv.") as td:
        b = arm_b(td)
        c = arm_c(td)
    if fails:
        for f in fails:
            print("  " + f)
        print("%s: FAILED (%d finding(s))" % (LABEL, len(fails)))
        return 1
    _, v = b
    print("%s: OK (a) every read of %s goes through lookupScalarIn; (b) flash09's "
          "V/F is %.12g with CH4's Pc bare and with it written `bar`, and %.6g with "
          "the Pa number bare (the run sees Pc); (c) %d published sizing numbers of "
          "flash22 are identical with pressureDesign bare and written `bar`.  NOT "
          "checked: the other 16 trap families of C454."
          % (LABEL, " and ".join("`%s` (%s)" % kv for kv in WORKING_UNIT_KEYS.items()),
             v["bare"], v["pa"], c))
    return 0


if __name__ == "__main__":
    sys.exit(main())
