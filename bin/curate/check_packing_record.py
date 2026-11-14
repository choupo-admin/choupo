#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a packing read from a record gives the inline bed's numbers, prints
where each value came from, and refuses by name what a correlation lacks.

    bin/curate/check_packing_record.py

WHAT IT HOLDS (DEV.md 4c C329 "where a packing's data live", C398 slice (e);
Theory Guide sec:packing-record; src/unitOperations/distillation/PackingRecord.{H,cpp}).

  (1) THE WITNESS REPRODUCES ITS TWIN.  packing05_schulz_record_0p10bar (the
      geometry from a case-local record, the installed area and void fraction
      from the case, the corrugation side borrowed from the catalogue record
      SulzerBX) and packing01_schulz_0p10bar (the same four numbers typed
      inline), both at the declared F-factor (outerDict removed): every
      column KPI EQUAL, exactly (the resolved values are the same doubles).
      The witness's log must say that the installed 478 replaces the
      record's nominal 500, and that the side is borrowed from SulzerBX as a
      hypothesis of the case; the unread-key audit must not name `record`,
      `installed` or `borrowed`.
  (2) THE RATE-BASED SOLVER READS IT TOO.  ratebased01_schulz_0p10bar and a
      copy whose `packing {}` is the witness's (record + installed +
      borrowed): every column KPI equal, exactly.  (RateBasedSegment.cpp is
      not touched: it reads the resolved copy through its own lookups.)
  (3) A CATALOGUE RECORD SERVES DELFT.  packing03_schulz_delft_0p10bar's bed
      with `record MontzB1-250; model Delft;` and no geometry typed: exit 0,
      every Delft field printed `nominal (record)`.
  (4) THE INLINE FORM IS UNTOUCHED in the one way a gate can see: the
      packing01 log carries no packing-record line.  (Byte-identity of every
      shipped packed case's log against the parent build was measured by
      hand for the slice; this arm is the re-runnable part.)
  (5) REFUSALS, each by name: the witness without `borrowed` (names
      `corrugationSide`, `RochaBravoFair` and the record); SulzerBX under
      Delft (names the four fields Delft reads and the source does not
      print); MontzB1-250 under Rocha-Bravo-Fair (names `surfaceEnhancement`,
      F_SE of a sheet-metal surface); a geometry key typed beside `record`
      (names `installed`); an unknown record; `installed {}` without a
      source; `installed { diameter }`; a borrowed value with no reason; a
      borrowed value from the column's own record; a RANDOM packing record.

WHAT IT DOES NOT CHECK: that the catalogue records transcribe their papers
(read by the author, cited by table and page in each record; no second
transcription exists); that a packing correlation is right for a packing it
was not fitted to (Theory Guide sec:packing-schulz).

SABOTAGE-VERIFIED BY HAND (2026-11-14), each in PackingRecord.cpp, rebuilt,
run, restored and rebuilt; observed output:
  S1 (resolution) the installed value ignored in the resolution, the record's
                  taken (`if (installed.count(f))` -> `if (false)`) -> arms
                  (1) and (2) FAIL: "witness exit 2, twin exit 0: ERROR:
                  map::at" (the record states no void fraction, so the
                  sabotaged resolution has nothing to take).
  S2 (refusal)    the missing-field check disabled (`if (false && ...)`) ->
                  arm (5) FAILS on three probes: "no_borrowed: exit 2, missing
                  ['corrugationSide', 'RochaBravoFair', 'MontzA3-500M']:
                  ERROR: map::at" (and sulzerbx_delft, b1_rbf) -- the run
                  dies without naming the field, the correlation or the record.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "tutorials" / "steady" / "distillation"
WITNESS = DIST / "packing05_schulz_record_0p10bar"
TWIN = DIST / "packing01_schulz_0p10bar"
RATE = DIST / "ratebased01_schulz_0p10bar"
DELFT = DIST / "packing03_schulz_delft_0p10bar"
NAME = "check_packing_record"

PACKING_RE = re.compile(r"            packing\n            \{.*?\n            \}\n", re.S)


def run(case: Path, timeout=900):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    try:
        p = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=str(case), env=env,
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT"
    return p.returncode, p.stdout + p.stderr


def kpis(out):
    a = out.find("<<<Choupo:result-begin>>>")
    b = out.find("<<<Choupo:result-end>>>")
    if a < 0 or b < 0:
        return None
    try:
        r = json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    except ValueError:
        return None
    return r.get("kpis", {}).get("column")


def last(out):
    lines = [ln for ln in out.strip().splitlines() if ln.strip()]
    for ln in reversed(lines):
        if "ERROR" in ln or "rror" in ln:
            return ln.strip()[:300]
    return (lines[-1] if lines else "")[:300]


def copy_case(src: Path, tmp: Path, tag: str) -> Path:
    dst = tmp / tag
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "reports", "converged", "iterations", "log.*", "expected", "*.csv"))
    (dst / "system" / "outerDict").unlink(missing_ok=True)
    return dst


def packing_block(case: Path) -> str:
    t = (case / "system" / "flowsheetDict").read_text()
    m = PACKING_RE.search(t)
    if not m:
        raise SystemExit(f"{NAME}: no `packing {{}}` block at the expected indent in {case.name}")
    return m.group(0)


def set_packing(case: Path, block: str):
    f = case / "system" / "flowsheetDict"
    t = f.read_text()
    m = PACKING_RE.search(t)
    if not m:
        raise SystemExit(f"{NAME}: no `packing {{}}` block in {case.name}")
    f.write_text(t[:m.start()] + block + t[m.end():])


def edit(case: Path, old: str, new: str):
    f = case / "system" / "flowsheetDict"
    t = f.read_text()
    if old not in t:
        raise SystemExit(f"{NAME}: fixture edit target missing: {old[:70]!r}")
    f.write_text(t.replace(old, new, 1))


def same_kpis(a, b):
    if a is None or b is None:
        return False, "no result block"
    if set(a) != set(b):
        return False, f"KPI sets differ: {sorted(set(a) ^ set(b))}"
    diff = [k for k in a if a[k] != b[k]]
    return (not diff), (f"{len(a)} KPIs equal" if not diff
                        else "; ".join(f"{k} {a[k]!r} vs {b[k]!r}" for k in diff[:4]))


def main():
    if not (ROOT / "choupoSolve").exists():
        print(f"{NAME}: FAILED -- no choupoSolve at the repository root; build first.")
        return 1
    for c in (WITNESS, TWIN, RATE, DELFT):
        if not c.is_dir():
            print(f"{NAME}: FAILED -- case {c.relative_to(ROOT)} is missing.")
            return 1
    fail = []
    with tempfile.TemporaryDirectory(prefix="packrec_") as td:
        tmp = Path(td)

        # (1) the witness and its twin --------------------------------------
        w = copy_case(WITNESS, tmp, "witness")
        t = copy_case(TWIN, tmp, "twin")
        rcw, ow = run(w)
        rct, ot = run(t)
        if rcw != 0 or rct != 0:
            fail.append(f"(1) witness exit {rcw}, twin exit {rct}: {last(ow if rcw else ot)}")
        else:
            ok, msg = same_kpis(kpis(ow), kpis(ot))
            print(f"  (1) witness vs packing01: {msg}")
            if not ok:
                fail.append(f"(1) {msg}")
            for needle in ("installed (case) replaces nominal 500 m2/m3 (record)",
                           "BORROWED from record 'SulzerBX'",
                           "corrugationAngle   60 deg  nominal (record)"):
                if needle not in ow:
                    fail.append(f"(1) the witness's log does not say: {needle!r}")
            for k in ("record", "installed", "borrowed"):
                if re.search(r"\[dict\]\s+.*`" + k + "`", ow):
                    fail.append(f"(1) the unread-key audit names `{k}`")
        # (4) the inline form carries no packing-record line
        if "Packing of 'column' from record" in ot:
            fail.append("(4) packing01 (inline) printed a packing-record line")

        # (2) the rate-based solver -----------------------------------------
        r0 = copy_case(RATE, tmp, "rate_inline")
        r1 = copy_case(RATE, tmp, "rate_record")
        (r1 / "constant" / "assets").mkdir(parents=True, exist_ok=True)
        shutil.copy(WITNESS / "constant" / "assets" / "MontzA3-500M.dat",
                    r1 / "constant" / "assets" / "MontzA3-500M.dat")
        set_packing(r1, packing_block(WITNESS))
        rc0, o0 = run(r0)
        rc1, o1 = run(r1)
        if rc0 != 0 or rc1 != 0:
            fail.append(f"(2) rate inline exit {rc0}, record exit {rc1}: {last(o1 if rc1 else o0)}")
        else:
            ok, msg = same_kpis(kpis(o0), kpis(o1))
            print(f"  (2) ratebased01 inline vs record: {msg}")
            if not ok:
                fail.append(f"(2) {msg}")

        # (3) a catalogue record under Delft --------------------------------
        d = copy_case(DELFT, tmp, "delft_b1")
        set_packing(d, """            packing
            {
                record            MontzB1-250;
                model             Delft;
                diameter          1.22 m;
                height            2.2 m;
                lightKey          pXylene;
                liquidViscosity   3.91e-4;
                segments          100;
            }
""")
        rcd, od = run(d)
        if rcd != 0:
            fail.append(f"(3) MontzB1-250 under Delft exit {rcd}: {last(od)}")
        else:
            for f in ("corrugationBase", "corrugationHeight", "elementHeight", "holeFraction"):
                if not re.search(rf"^\s+{f}\s+\S+( m)?\s+nominal \(record\)", od, re.M):
                    fail.append(f"(3) `{f}` is not printed as nominal (record)")
            k = kpis(od) or {}
            print(f"  (3) MontzB1-250 under Delft: exit 0, HETP {k.get('HETP')}")

        # (5) refusals ------------------------------------------------------
        probes = []

        def probe(tag, base, mutate, needles):
            c = copy_case(base, tmp, tag)
            mutate(c)
            rc, out = run(c)
            missing = [n for n in needles if n not in out]
            if rc == 0 or missing:
                fail.append(f"(5) {tag}: exit {rc}, missing {missing}: {last(out)}")
            probes.append(tag)

        wblock = packing_block(WITNESS)
        no_borrow = re.sub(r"                borrowed\n                \{.*?\n                \}\n",
                           "", wblock, flags=re.S)
        probe("no_borrowed", WITNESS, lambda c: set_packing(c, no_borrow),
              ["corrugationSide", "RochaBravoFair", "MontzA3-500M"])
        probe("sulzerbx_delft", WITNESS, lambda c: set_packing(c, """            packing
            {
                record            SulzerBX;
                model             Delft;
                diameter          1.22 m;
                height            2.2 m;
                lightKey          pXylene;
                liquidViscosity   3.91e-4;
            }
"""), ["`model Delft;`", "corrugationBase", "corrugationHeight", "elementHeight", "holeFraction"])
        probe("b1_rbf", WITNESS, lambda c: set_packing(c, """            packing
            {
                record            MontzB1-250;
                model             RochaBravoFair;
                diameter          1.22 m;
                height            2.2 m;
                lightKey          pXylene;
                liquidViscosity   3.91e-4;
            }
"""), ["surfaceEnhancement", "RochaBravoFair", "MontzB1-250"])
        probe("typed_beside", WITNESS,
              lambda c: edit(c, "                model             RochaBravoFair;",
                             "                model             RochaBravoFair;\n"
                             "                specificArea      478;"),
              ["`specificArea` is typed beside `record", "installed {"])
        probe("unknown_record", WITNESS,
              lambda c: edit(c, "record            MontzA3-500M;", "record            MontzA3-5000M;"),
              ["unknown packing record 'MontzA3-5000M'"])
        probe("installed_no_source", WITNESS,
              lambda c: (lambda f: f.write_text(re.sub(r"\n\s*source\s+\"Schulz[^\n]*", "", f.read_text(), count=1)))(c / "system" / "flowsheetDict"),
              ["`installed {}` carries no `source`"])
        probe("installed_diameter", WITNESS,
              lambda c: edit(c, "                    voidFraction  0.92;",
                             "                    voidFraction  0.92;\n                    diameter      1.2;"),
              ["installed packing value", "diameter"])
        probe("borrow_no_reason", WITNESS,
              lambda c: (lambda f: f.write_text(re.sub(r"\n\s*reason\s+\"not printed[^\n]*", "", f.read_text(), count=1)))(c / "system" / "flowsheetDict"),
              ["states its reason"])
        probe("borrow_from_self", WITNESS,
              lambda c: edit(c, "from      SulzerBX;", "from      MontzA3-500M;"),
              ["names the column's own record"])

        def random_record(c):
            f = c / "constant" / "assets" / "MontzA3-500M.dat"
            f.write_text(f.read_text().replace("arrangement       structured;",
                                               "arrangement       random;"))
        probe("random_packing", WITNESS, random_record, ["RANDOM packing", "MontzA3-500M"])

    if fail:
        print(f"{NAME}: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print(f"{NAME}: OK -- a packing read from a record gives the inline bed's numbers"
          f" exactly (packing05 = packing01, and ratebased01 through the record), prints"
          f" each value as nominal, installed or borrowed, serves Delft from the catalogue"
          f" record MontzB1-250, and refuses {len(probes)} inputs by name (the field a"
          f" correlation reads and the record lacks, among them); it does NOT check that"
          f" the records transcribe their papers or that a correlation suits a packing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
