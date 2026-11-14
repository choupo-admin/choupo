#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a packing read from a record gives the inline bed's numbers, prints
where each value came from, and refuses by name what a correlation lacks.

    bin/curate/check_packing_record.py

WHAT IT HOLDS (DEV.md 4c C329 "where a packing's data live", C398 slice (e);
Theory Guide sec:packing-record; src/unitOperations/distillation/PackingRecord.{H,cpp};
the review rows PK-01..PK-10, docs/reviews/2026-11-14-packing-record/).

  (1) THE WITNESS REPRODUCES ITS TWIN.  packing05_schulz_record_0p10bar (a
      case-local record, the installed area and void fraction, the side
      borrowed from SulzerBX) against packing01_schulz_0p10bar (the same four
      numbers inline), both at the declared F-factor: every KPI the twin
      publishes EQUAL, exactly; the three `packing_*` KPIs the record-backed
      bed adds equal the resolved 478, 0.92 and 60; the printed source of
      every value compared ROW BY ROW (value and label); and the unread-key
      audit names NO key at all on the witness (PK-05).
  (2) THE RATE-BASED SOLVER READS IT TOO.  ratebased01 against a copy whose
      `packing {}` is the witness's: every shared KPI equal, exactly; no
      unread key.
  (3) THE CATALOGUE NUMBERS ARE PINNED (PK-07).  (a) packing03's bed from
      `record MontzB1-250; model Delft;`: every Delft field printed `nominal
      (record)` and four KPIs held to the values stated below (relative
      1e-6).  (b) The witness's sealed mirror of SulzerBX is the catalogue
      record: the manifest's originSha256 equals the catalogue file's sha256,
      or this gate reports the drift.
  (4) A SHEET-METAL RECORD RUNS (PK-06, E3).  A probe record (MontzB1-250's
      geometry with an F_SE, written in the temporary case only, never
      shipped) under Rocha-Bravo-Fair: exit 0, `surface sheetMetal` and F_SE
      printed from the record, every KPI equal to the same bed typed inline.
      And the PK-02 remedy followed: MontzB1-250 with F_SE BORROWED from the
      probe runs to the same numbers.
  (5) MARKS (PK-04, PK-09, E8).  An estimate in the column's record is printed
      on its nominal line; an estimate in the LENDING record is printed on
      the borrowed line; a value borrowed from a RANDOM packing runs, is
      announced as such, and moves nothing.
  (6) THE INLINE FORM: packing01 prints no packing-record line and publishes
      no `packing_*` KPI.
  (7) REFUSALS, each by name: no `borrowed` (names `corrugationSide`,
      `RochaBravoFair` and the record); SulzerBX under Delft (the four
      fields); MontzB1-250 under Rocha-Bravo-Fair (`surfaceEnhancement`); an
      unknown model word FIRST, with the inline message (PK-01); a geometry
      key, `surface` and `surfaceEnhancement` each typed beside `record`, each
      with the remedy the reader accepts (PK-02, E5); an unknown record;
      `installed {}` without a source; `installed { diameter }`; a borrow
      without a reason; a borrow from the column's own record; a RANDOM
      record; a void fraction of 1.5 in a record, under `installed`, and
      inline in a shipped-shape case, and an angle of 95 deg (PK-03, E4); a
      record whose `name` is not its file name (PK-08).

WHAT IT DOES NOT CHECK: that the catalogue records transcribe their papers
(read by the author and by the reviewer, page by page; no gate can); that a
packing correlation suits a packing it was not fitted to.

THE SABOTAGES (the review's table E1-E8, each against this gate; E2, E4 and
E8 also run by check_gate_selftest):
  E1 the installed-without-nominal label -> "nominal (record)": arm (1) rows.
  E2 transferReads disabled: arm (1), the audit names 8 keys.
  E3 the surface inserted as "gauze" always: arm (4), KPIs differ.
  E4 the range check off: arm (7), four probes run to exit 0.
  E5 `surface` dropped from the typed-beside list: arm (7).
  E6 the BORROWED label replaced: arm (1) rows.
  E7 `installed` without a source accepted: arm (7).
  E8 the estimate mark on a nominal value dropped: arm (5).
"""
import hashlib
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

#  (3a) The Delft bed of packing03 (1.22 m, 2.2 m, xylenes, 0.10 bar, F 1.5)
#  filled with the catalogue's MontzB1-250, as this gate first ran it
#  (2026-11-14, branch c398/slice-e-packing-record, linux64Gcc).  A change to
#  the record, the reader or the Delft model moves them; that is the point.
B1_STATED = {
    "HETP": 0.378252247189,
    "theoreticalStages_bed": 5.81622453363,
    "P_bottom_bar": 0.101551985079,
    "dP_bed_mbar_per_m": 0.705447155001,
}

PACKING_RE = re.compile(r"            packing\n            \{.*?\n            \}\n", re.S)
DICT_RE = re.compile(r"^\[dict\].*$", re.M)


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


def rows(out):
    """The printed resolution: {field: (value, label)}."""
    m = re.search(r"\n  Packing of 'column' from .*?:\n((?:    \S.*\n)+)", out)
    got = {}
    if not m:
        return got
    for ln in m.group(1).splitlines():
        mm = re.match(r"    (\w+)\s+(\S+(?: (?:m2/m3|deg|m))?)  (.*)$", ln)
        if mm:
            got[mm.group(1)] = (mm.group(2), mm.group(3))
    return got


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


def edit(case: Path, old: str, new: str, rel="system/flowsheetDict"):
    f = case / rel
    t = f.read_text()
    if old not in t:
        raise SystemExit(f"{NAME}: fixture edit target missing in {rel}: {old[:70]!r}")
    f.write_text(t.replace(old, new, 1))


def put_record(case: Path, name: str, text: str):
    d = case / "constant" / "assets"
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{name}.dat").write_text(text)


def same_kpis(inline, record, extra=()):
    """Every KPI `inline` publishes equal in `record`; `record` may carry only
    the named extra keys besides."""
    if inline is None or record is None:
        return False, "no result block"
    surplus = set(record) - set(inline) - set(extra)
    lack = set(inline) - set(record)
    if surplus or lack:
        return False, f"KPI sets differ: surplus {sorted(surplus)}, missing {sorted(lack)}"
    diff = [k for k in inline if inline[k] != record[k]]
    return (not diff), (f"{len(inline)} KPIs equal" if not diff
                        else "; ".join(f"{k} {inline[k]!r} vs {record[k]!r}" for k in diff[:4]))


PACKING_KPIS = ("packing_specificArea_m2_m3", "packing_voidFraction",
                "packing_corrugationAngle_deg")

INLINE_TAIL = """                lightKey          pXylene;
                liquidViscosity   3.91e-4;
                segments          100;
            }
"""


def block(*lines):
    body = "".join(f"                {ln}\n" for ln in lines)
    return "            packing\n            {\n" + body + INLINE_TAIL


PROBE_SHEET = """name              ProbeSheet;
kind              packing;
arrangement       structured;
specificArea      244;
voidFraction      0.980;
corrugationAngle  45;
corrugationSide   0.01645 m;
surface           sheetMetal;
correlations { RochaBravoFair { surfaceEnhancement 0.35; } }
provenance { source "a GATE PROBE written in a temporary case by check_packing_record.py; not a packing"; }
"""

PROBE_RANDOM = """name              ProbeRandom;
kind              packing;
arrangement       random;
corrugationSide   0.009 m;
provenance { source "a GATE PROBE written in a temporary case by check_packing_record.py; not a packing"; }
"""

PROBE_EST_LENDER = """name              ProbeEstLender;
kind              packing;
arrangement       structured;
corrugationSide   0.009 m;
provenance
{
    source "a GATE PROBE written in a temporary case by check_packing_record.py; not a packing";
    corrugationSide { origin estimated; reviewStatus unverified; notes "PROBE-LENDER-NOTE"; }
}
"""


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
        kw = None
        if rcw != 0 or rct != 0:
            fail.append(f"(1) witness exit {rcw}, twin exit {rct}: {last(ow if rcw else ot)}")
        else:
            kw = kpis(ow)
            ok, msg = same_kpis(kpis(ot), kw, PACKING_KPIS)
            print(f"  (1) witness vs packing01: {msg}")
            if not ok:
                fail.append(f"(1) {msg}")
            for k, v in zip(PACKING_KPIS, (478.0, 0.92, 60.0)):
                if (kw or {}).get(k) != v:
                    fail.append(f"(1) KPI {k} = {(kw or {}).get(k)!r}, expected the resolved {v}")
            want = {
                "specificArea": ("478 m2/m3", "installed (case) replaces nominal 500 m2/m3 (record)"),
                "voidFraction": ("0.92", "installed (case); the record states none"),
                "corrugationAngle": ("60 deg", "nominal (record)"),
                "corrugationSide": ("0.009 m", "BORROWED from record 'SulzerBX' (case constant/assets/"
                                    "SulzerBX.dat) -- a hypothesis of this case: not printed by "
                                    "Schulz et al.; Sulzer BX is the gauze packing of the same "
                                    "area class (492 m2/m3, 60 deg) in Rocha-Bravo-Fair 1993 "
                                    "Table IV, and HETP is roughly proportional to S"),
                "surface": ("gauze", "record"),
            }
            got = rows(ow)
            for f, wv in want.items():
                if got.get(f) != wv:
                    fail.append(f"(1) printed row `{f}`: {got.get(f)!r}, expected {wv!r}")
            if set(got) != set(want):
                fail.append(f"(1) printed rows {sorted(got)}, expected {sorted(want)}")
            audit = DICT_RE.findall(ow)
            if audit:
                fail.append(f"(1) the unread-key audit speaks on the witness: {audit[:3]}")

        # (6) the inline form
        if "Packing of 'column' from record" in ot:
            fail.append("(6) packing01 (inline) printed a packing-record line")
        if any(k in (kpis(ot) or {}) for k in PACKING_KPIS):
            fail.append("(6) packing01 (inline) publishes a packing_* KPI")

        # (2) the rate-based solver -----------------------------------------
        r0 = copy_case(RATE, tmp, "rate_inline")
        r1 = copy_case(RATE, tmp, "rate_record")
        put_record(r1, "MontzA3-500M",
                   (WITNESS / "constant" / "assets" / "MontzA3-500M.dat").read_text())
        set_packing(r1, packing_block(WITNESS))
        rc0, o0 = run(r0)
        rc1, o1 = run(r1)
        if rc0 != 0 or rc1 != 0:
            fail.append(f"(2) rate inline exit {rc0}, record exit {rc1}: {last(o1 if rc1 else o0)}")
        else:
            ok, msg = same_kpis(kpis(o0), kpis(o1), PACKING_KPIS)
            print(f"  (2) ratebased01 inline vs record: {msg}")
            if not ok:
                fail.append(f"(2) {msg}")
            if DICT_RE.search(o1):
                fail.append(f"(2) the unread-key audit speaks: {DICT_RE.findall(o1)[:3]}")

        # (3a) MontzB1-250 under Delft, pinned ------------------------------
        d = copy_case(DELFT, tmp, "delft_b1")
        set_packing(d, block("record            MontzB1-250;", "model             Delft;",
                             "diameter          1.22 m;", "height            2.2 m;"))
        rcd, od = run(d)
        if rcd != 0:
            fail.append(f"(3a) MontzB1-250 under Delft exit {rcd}: {last(od)}")
        else:
            got = rows(od)
            for f in ("specificArea", "voidFraction", "corrugationAngle", "corrugationBase",
                      "corrugationHeight", "elementHeight", "holeFraction"):
                if (got.get(f) or ("", ""))[1] != "nominal (record)":
                    fail.append(f"(3a) `{f}` is printed {got.get(f)!r}, not nominal (record)")
            k = kpis(od) or {}
            for key, val in B1_STATED.items():
                if key not in k or abs(k[key] - val) > 1e-6 * abs(val):
                    fail.append(f"(3a) MontzB1-250 Delft {key} = {k.get(key)!r}, stated {val!r}")
            print(f"  (3a) MontzB1-250 under Delft: HETP {k.get('HETP')}, "
                  f"stages {k.get('theoreticalStages_bed')}, P_bottom {k.get('P_bottom_bar')}, "
                  f"dP {k.get('dP_bed_mbar_per_m')}")

        # (3b) the sealed mirror is the catalogue record ---------------------
        man = (WITNESS / "constant" / "propertyManifest").read_text()
        m = re.search(r'"assets/SulzerBX\.dat"\s*\{[^}]*originSha256\s+"([0-9a-f]+)"', man)
        cat = hashlib.sha256((ROOT / "data/standards/assets/SulzerBX.dat").read_bytes()).hexdigest()
        if not m:
            fail.append("(3b) the witness's manifest claims no assets/SulzerBX.dat")
        elif m.group(1) != cat:
            fail.append("(3b) DRIFT: data/standards/assets/SulzerBX.dat changed since the witness"
                        " was sealed (originSha256 " + m.group(1)[:12] + " vs " + cat[:12]
                        + "); re-seal the witness with bin/choupo-import and re-read its numbers")

        # (4) a sheet-metal record, and the F_SE borrow ----------------------
        s_in = copy_case(TWIN, tmp, "sheet_inline")
        set_packing(s_in, block("model             RochaBravoFair;", "diameter          1.22 m;",
                                "height            2.2 m;", "specificArea      244;",
                                "voidFraction      0.980;", "corrugationAngle  45;",
                                "corrugationSide   0.01645 m;", "surface           sheetMetal;",
                                "surfaceEnhancement 0.35;"))
        s_rec = copy_case(TWIN, tmp, "sheet_record")
        put_record(s_rec, "ProbeSheet", PROBE_SHEET)
        set_packing(s_rec, block("record            ProbeSheet;", "model             RochaBravoFair;",
                                 "diameter          1.22 m;", "height            2.2 m;"))
        s_bor = copy_case(TWIN, tmp, "sheet_borrow")
        put_record(s_bor, "ProbeSheet", PROBE_SHEET)
        set_packing(s_bor, block("record            MontzB1-250;", "model             RochaBravoFair;",
                                 "diameter          1.22 m;", "height            2.2 m;",
                                 "borrowed { surfaceEnhancement { from ProbeSheet; reason \"gate probe\"; } }"))
        rci, oi = run(s_in)
        rcr, orr = run(s_rec)
        rcb, ob = run(s_bor)
        if rci != 0 or rcr != 0 or rcb != 0:
            fail.append(f"(4) sheet metal: inline exit {rci}, record exit {rcr}, borrow exit {rcb}: "
                        f"{last(orr if rcr else (ob if rcb else oi))}")
        else:
            ok, msg = same_kpis(kpis(oi), kpis(orr), PACKING_KPIS)
            print(f"  (4) sheet-metal record vs inline: {msg}")
            if not ok:
                fail.append(f"(4) record: {msg}")
            ok, msg = same_kpis(kpis(oi), kpis(ob), PACKING_KPIS)
            if not ok:
                fail.append(f"(4) F_SE borrowed: {msg}")
            g = rows(orr)
            if g.get("surface") != ("sheetMetal", "record"):
                fail.append(f"(4) surface printed {g.get('surface')!r}")
            if g.get("surfaceEnhancement") != ("0.35", "record, a constant of this packing under RochaBravoFair"):
                fail.append(f"(4) F_SE printed {g.get('surfaceEnhancement')!r}")
            gb = rows(ob).get("surfaceEnhancement") or ("", "")
            if not gb[1].startswith("BORROWED from record 'ProbeSheet'"):
                fail.append(f"(4) the borrowed F_SE is printed {gb!r}")

        # (5) marks ---------------------------------------------------------
        e = copy_case(WITNESS, tmp, "estimates")
        edit(e, '    corrugationAngle { origin literature; method "section 2, p. 764: 60 deg with respect to horizontal"; }',
             '    corrugationAngle { origin estimated; reviewStatus unverified; notes "PROBE-NOMINAL-NOTE"; }',
             rel="constant/assets/MontzA3-500M.dat")
        put_record(e, "ProbeEstLender", PROBE_EST_LENDER)
        edit(e, "from      SulzerBX;", "from      ProbeEstLender;")
        rce, oe = run(e)
        if rce != 0:
            fail.append(f"(5) estimates exit {rce}: {last(oe)}")
        else:
            g = rows(oe)
            if "ESTIMATE (unverified): PROBE-NOMINAL-NOTE" not in (g.get("corrugationAngle") or ("", ""))[1]:
                fail.append(f"(5) the nominal estimate is printed {g.get('corrugationAngle')!r}")
            if "ESTIMATE (unverified): PROBE-LENDER-NOTE" not in (g.get("corrugationSide") or ("", ""))[1]:
                fail.append(f"(5) the borrowed estimate is printed {g.get('corrugationSide')!r}")
        rnd = copy_case(WITNESS, tmp, "random_lender")
        put_record(rnd, "ProbeRandom", PROBE_RANDOM)
        edit(rnd, "from      SulzerBX;", "from      ProbeRandom;")
        rcn, on = run(rnd)
        if rcn != 0:
            fail.append(f"(5) borrow from a random record exit {rcn}: {last(on)}")
        else:
            if "is a RANDOM packing" not in (rows(on).get("corrugationSide") or ("", ""))[1]:
                fail.append("(5) a value borrowed from a RANDOM record is not announced")
            if kw is not None:
                ok, msg = same_kpis(kw, kpis(on))
                if not ok:
                    fail.append(f"(5) random lender moved the numbers: {msg}")

        # (7) refusals ------------------------------------------------------
        probes = []

        def probe(tag, base, mutate, needles, absent=()):
            c = copy_case(base, tmp, tag)
            mutate(c)
            rc, out = run(c)
            missing = [n for n in needles if n not in out]
            present = [n for n in absent if n in out]
            if rc == 0 or missing or present:
                fail.append(f"(7) {tag}: exit {rc}, missing {missing}, unwanted {present}: {last(out)}")
            probes.append(tag)

        wblock = packing_block(WITNESS)
        no_borrow = re.sub(r"                borrowed\n                \{.*?\n                \}\n",
                           "", wblock, flags=re.S)
        probe("no_borrowed", WITNESS, lambda c: set_packing(c, no_borrow),
              ["corrugationSide", "RochaBravoFair", "MontzA3-500M"])
        probe("sulzerbx_delft", WITNESS, lambda c: set_packing(c, block(
            "record            SulzerBX;", "model             Delft;",
            "diameter          1.22 m;", "height            2.2 m;")),
            ["`model Delft;`", "corrugationBase", "corrugationHeight", "elementHeight", "holeFraction"])
        probe("b1_rbf", WITNESS, lambda c: set_packing(c, block(
            "record            MontzB1-250;", "model             RochaBravoFair;",
            "diameter          1.22 m;", "height            2.2 m;")),
            ["surfaceEnhancement", "RochaBravoFair", "MontzB1-250"])
        probe("unknown_model", WITNESS,
              lambda c: edit(c, "model             RochaBravoFair;", "model             Billet;"),
              ["packing model", "Billet", "RochaBravoFair", "Delft"], absent=["is not read by"])
        probe("typed_beside", WITNESS,
              lambda c: edit(c, "                model             RochaBravoFair;",
                             "                model             RochaBravoFair;\n"
                             "                specificArea      478;"),
              ["`specificArea` is typed beside `record", "installed {", "borrowed {"])
        probe("surface_beside", WITNESS,
              lambda c: edit(c, "                model             RochaBravoFair;",
                             "                model             RochaBravoFair;\n"
                             "                surface           gauze;"),
              ["`surface` is typed beside `record", "neither installed nor borrowed"],
              absent=["installed { surface", "borrowed { surface"])
        probe("fse_beside", WITNESS,
              lambda c: edit(c, "                model             RochaBravoFair;",
                             "                model             RochaBravoFair;\n"
                             "                surfaceEnhancement 0.35;"),
              ["`surfaceEnhancement` is typed beside `record", "borrowed { surfaceEnhancement",
               "never `installed`"], absent=["installed { surfaceEnhancement"])
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
        probe("random_packing", WITNESS,
              lambda c: edit(c, "arrangement       structured;", "arrangement       random;",
                             rel="constant/assets/MontzA3-500M.dat"),
              ["RANDOM packing", "MontzA3-500M"])
        probe("range_installed", WITNESS,
              lambda c: edit(c, "                    voidFraction  0.92;", "                    voidFraction  1.5;"),
              ["`voidFraction` = 1.5 is outside its range", "installed"])
        probe("range_record", WITNESS,
              lambda c: edit(c, "corrugationAngle  60;", "corrugationAngle  95;",
                             rel="constant/assets/MontzA3-500M.dat"),
              ["`corrugationAngle` = 95 is outside its range"])
        probe("range_record_void", WITNESS,
              lambda c: edit(c, "specificArea      500;", "specificArea      500;\nvoidFraction      1.5;",
                             rel="constant/assets/MontzA3-500M.dat"),
              ["`voidFraction` = 1.5 is outside its range"])
        probe("range_inline", TWIN,
              lambda c: edit(c, "voidFraction      0.92;", "voidFraction      1.5;"),
              ["`voidFraction` = 1.5 is outside its range"])
        probe("name_not_file", WITNESS,
              lambda c: edit(c, "name              MontzA3-500M;", "name              MontzA3-500X;",
                             rel="constant/assets/MontzA3-500M.dat"),
              ["differs from the file name 'MontzA3-500M'"])

    if fail:
        print(f"{NAME}: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print(f"{NAME}: OK -- a packing read from a record gives the inline bed's numbers"
          f" exactly (packing05 = packing01, ratebased01 through the record, a sheet-metal"
          f" record and its F_SE borrowed), prints every value's source row by row with"
          f" estimate and random-lender marks, leaves no unread key, holds MontzB1-250 under"
          f" Delft to stated KPIs and the witness's SulzerBX mirror to the catalogue, and"
          f" refuses {len(probes)} inputs by name (unknown model first; out-of-range values"
          f" in a record, installed or inline); it does NOT check that the records"
          f" transcribe their papers or that a correlation suits a packing")
    return 0


if __name__ == "__main__":
    sys.exit(main())
