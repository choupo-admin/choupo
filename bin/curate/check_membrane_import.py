#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the manufacturer-catalogue import tool writes data/local only, never
merges, never assumes, counts from what it wrote, and every record it writes
loads in the engine.
    bin/curate/check_membrane_import.py

WHY THIS EXISTS (DEV.md 4c C189, slice 4).  `bin/choupo-import-membranes`
turns a working catalogue spreadsheet into private `kind membraneModule`
records.  Three ways such a tool goes quietly wrong, each a wrong record at
exit 0: it MERGES two rows that state one test twice (a duplicate becomes one
number and a contradiction becomes an average); it ASSUMES a fact the input
does not state (a pressure basis defaulted to gauge is a 1 bar error on every
NF test, invisible in the file); and it reports counts from the loop that
wrote the files rather than from the files, so a record the engine would
refuse is counted as imported.  Each is an arm below.

THE FIXTURE IS SYNTHETIC.  Built with openpyxl in a temporary directory on
every run: a manufacturer that does not exist ("FixtureCo"), elements and
tests invented to reach each arm.  The private Downloads spreadsheet is never
read here, and nothing from it is in this file.

WHAT THIS GATE CHECKS (every run is RUN here; the tool is run as a process):
  (a) COUNTS FROM THE FILES.  The import exits 0; the report's record count
      equals the number of .dat files in the output directory, its test
      count equals the rated-test blocks found by reading those files, and
      its per-manufacturer tally matches.
  (b) IDEMPOTENT.  A second run on the same input leaves every file's bytes
      AND mtime unchanged, and the report says so (`idempotent: true`).
  (c) DUPLICATES AND CONTRADICTIONS ARE REPORTED, NOT MERGED.  Two rows
      stating one MgSO4 test with the same values are both written (both
      ids in the record) and listed as a duplicate; two rows stating one
      NaCl test with DIFFERENT values are both written and listed as a
      contradiction; a repeated element row is written once and listed; two
      element rows that map to ONE record name with different values are
      neither written and listed.
  (d) AN UNSTATED PRESSURE BASIS IS NOT ASSUMED.  A test whose row carries
      no basis is written WITHOUT `pressureBasis` and its id is listed; a
      row saying "gauge" gets `feedGauge`, one saying "absoluta" gets
      `feedAbsolute` -- the engine's own words, as the input states them.
  (e) data/standards REFUSES.  `--out <tmp>/x/standards/y` and
      `--out <root>/data/standards/assets` both exit non-zero naming
      `records::refuseStandardsWrite`, and write nothing.
  (f) EVERY WRITTEN RECORD LOADS.  Each record is copied into a membrane15
      copy's constant/assets and run (`module <name>; membrane NF270;`):
      exit 0 and one `Rated test <id>:` line per test the record carries.
      The fixture element with two MgSO4 tests runs the slice-1 inversion on
      a membrane25 copy naming one test (`MgSO4 ( fromRatedTest ... )`):
      R_int is published, finite, in (0, 1).
  (g) REFUSALS BY NAME.  A workbook declaring a non-SI conversion constant
      refuses; an input path that does not exist is reported "not imported"
      and no record is invented for it.
  (h) THE ONE OPT-IN IS ANNOUNCED.  Without `--assume-spacer-mil` an element
      with no spacer thickness is NOT written and listed; with it, the record
      appears with `origin estimated` on `channelHeight` and a note naming
      the flag.
  (i) WHAT IS NOT WRITTEN IS LISTED BY REASON: no area, a flat sheet, a
      range with no ends, a reference value, an incomplete test, an unknown
      rejection word, an orphan test, a duplicate test id, an unknown solute,
      an unknown basis word.
  (j) A PROSE-LIKE FIELD IS DROPPED AND SAID; the derived-SI sheet is not
      imported and its one planted mismatch is reported.

SABOTAGE (by hand, 2026-11-01; each restored byte-identical afterwards,
verified with cmp):
  S1  the tool made to keep only the FIRST of two tests stating the same
      conditions (a merge, `continue` on a repeated key) -- arms (a) and (c):
        FAIL (a) expected 5 rated tests in the files (T1 T4 T2 T3 T5); got 3
        FAIL (c) FX-4040 must carry both MgSO4 test ids T2 and T3 (not merged): ['T2']
        FAIL (c) FX-4040 must carry both NaCl test ids T1 and T4 (not merged): ['T1']
        FAIL (c) the duplicate MgSO4 pair T2/T3 is not reported: [...]
        FAIL (c) the contradictory NaCl pair T1/T4 is not reported: [...]
      (the report's own count stayed consistent with the files -- a merge is
      invisible to arm (a)'s file/report agreement, which is why (c) names
      the ids.)
  S2  the tool made to default an unstated basis to `feedGauge` -- arm (d):
        FAIL (d) T2 has no stated basis but the record declares `pressureBasis feedGauge;`
        FAIL (d) T3 has no stated basis but the record declares `pressureBasis feedGauge;`
        FAIL (d) T4 has no stated basis but the record declares `pressureBasis feedGauge;`
        FAIL (d) report must list T2, T3, T4 as unstated; got []
        FAIL (d) the record does not say the basis was omitted
      (nothing else fired: the engine LOADS the sabotaged record and runs
      it, which is why this arm reads the file and not the run.)
  Found while building: arm (d) first looked for the WORD `pressureBasis`
  in the test block and fired on the record's own comment saying the key
  was omitted -- a check for a declaration must match a declaration.  And
  the tool's rejection-word table matched "nominal" inside "valor de
  referência (não nominal)" and filed a brochure reference value as an
  incomplete test; the table is ordered now and the fixture holds it.

NOT CHECKED, said plainly: whether a transcribed number is the manufacturer's
(the tool verifies nothing and says so); the real Downloads spreadsheet
(private, never read here); promotion to data/standards (a human act).
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
TOOL = ROOT / "bin" / "choupo-import-membranes"
BIN = ROOT / "choupoSolve"
M15 = ROOT / "tutorials/steady/membranes/membrane15_module_nf270_4040"
M25 = ROOT / "tutorials/steady/membranes/membrane25_rated_test_inversion_nf270_4040"

fails = []


def fail(msg):
    fails.append(msg)
    print("  FAIL " + msg)


# ---------------------------------------------------------------------------
#  The synthetic fixture
# ---------------------------------------------------------------------------
MEM_HDR = ["id", "fabricante", "modelo", "classe", "area_m2", "espacador_mil", "espacador_h_mm",
           "epsilon_assumida", "df_sobre_h_assumido", "de_schock_miquel_mm", "geometria_status",
           "qualidade_fonte", "fonte", "observacoes"]
TEST_HDR = ["id", "membrana_id", "soluto_ou_sal", "rejeicao_pct", "natureza_rejeicao", "concentracao_mg_L",
            "pressao_bar", "temperatura_C", "recuperacao_pct", "pH", "caudal_GPD", "fonte", "notas", "base_pressao"]
URL = "https://example.invalid/fixtureco/sheet.pdf"
PROSE = "© FixtureCo. All rights reserved. " + "This element delivers outstanding performance. " * 8


def build_fixture(path, gpd_constant=4.381263638888889e-08):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "LEIA_ME"
    ws.append(["GATE FIXTURE -- hypothetical catalogue", "01-11-2026 · fixture"])
    h = wb.create_sheet("HIPOTESES")
    h.append(["Parâmetro", "Valor", "Descrição"])
    h.append(["L_ef_m", 1, "comprimento hidráulico efetivo estimado"])
    h.append(["epsilon", 0.8, "porosidade do espaçador estimada"])
    h.append(["GPD_em_m3_s", gpd_constant, "galão EUA / dia"])
    h.append(["mil_em_m", 2.54e-05, "polegada / 1000"])
    m = wb.create_sheet("Membranas")
    m.append(MEM_HDR)
    rows = [
        ["MEM-1", "FixtureCo", "FX-4040", "NF", 7.6, 28, 0.7112, 0.85, 0.5, None, "fixture", "FICHA_OU_BROCHURA_VERIFICADA", URL, "short note"],
        ["MEM-2", "FixtureCo", "FX-8040", "BWRO", 37, 34, None, None, None, None, "fixture", "LEGADO_NAO_REVALIDADO", URL, PROSE],
        ["MEM-3", "FixtureCo", "FX-NOAREA", "BWRO", None, 28, None, 0.8, None, None, "fixture", "LEGADO_NAO_REVALIDADO", URL, None],
        ["MEM-4", "FixtureCo", "FX-NOSPACER", "BWRO", 37, None, None, None, None, None, "SEM DADOS", "LEGADO_NAO_REVALIDADO", URL, None],
        ["MEM-5", "FixtureCo", "FX 2540", "BWRO", 2.6, 28, None, 0.8, None, None, "fixture", "LEGADO_NAO_REVALIDADO", URL, None],
        ["MEM-6", "FixtureCo", "FX-2540", "BWRO", 2.8, 28, None, 0.8, None, None, "fixture", "LEGADO_NAO_REVALIDADO", URL, None],
        ["MEM-7", "FixtureCo", "FX-DUPROW", "SWRO", 35, 28, None, 0.8, None, None, "fixture", "LEGADO_NAO_REVALIDADO", URL, None],
        ["MEM-7", "FixtureCo", "FX-DUPROW", "SWRO", 35, 28, None, 0.8, None, None, "fixture", "LEGADO_NAO_REVALIDADO", URL, None],
        ["MEM-8", "FixtureCo", "FX-Flat Flatsheet", "NF - FLATSHEET", None, None, None, None, None, None, "fixture", "FICHA_OU_BROCHURA_VERIFICADA", URL, None],
    ]
    for r in rows:
        m.append(r)
    t = wb.create_sheet("Ensaios_originais")
    t.append(TEST_HDR)
    tests = [
        ["T1", "MEM-1", "NaCl", 99.5, "nominal", 2000, 4.8, 25, 15, 7, 2500, URL, None, "gauge"],
        ["T4", "MEM-1", "NaCl", 99.0, "nominal (legado; verificar)", 2000, 4.8, 25, 15, 7, 2600, URL, "validar", None],
        ["T2", "MEM-1", "MgSO4", 97, "mínima", 2000, 4.8, 25, 15, None, 2500, URL, None, None],
        ["T3", "MEM-1", "MgSO4", 97, "mínima", 2000, 4.8, 25, 15, None, 2500, URL, None, None],
        ["T5", "MEM-2", "NaCl", 99.6, "nominal", 2000, 15.5, 25, 15, 8, 11000, URL, None, "absoluta"],
        ["T7", "MEM-2", "NaCl", None, "intervalo nominal", 2000, 5, 25, 15, None, 9000, URL, None, None],
        ["T8", "MEM-2", "Boro", 92, "valor de referência (não nominal)", None, None, None, None, None, None, URL, None, None],
        ["T9", "MEM-2", "NaCl", 99.6, "nominal", 2000, None, 25, 15, 8, 11000, URL, None, None],
        ["T10", "MEM-2", "NaCl", 99.6, "bizarro", 2000, 15.5, 25, 15, 8, 11000, URL, None, None],
        ["T11", "MEM-999", "NaCl", 99.6, "nominal", 2000, 15.5, 25, 15, 8, 11000, URL, None, None],
        ["T5", "MEM-2", "NaCl", 99.6, "nominal", 2000, 15.5, 25, 15, 8, 11000, URL, None, None],
        ["T13", "MEM-2", "Xyz", 99.6, "nominal", 2000, 15.5, 25, 15, 8, 11000, URL, None, None],
        ["T14", "MEM-2", "NaCl", 99.6, "nominal", 2000, 15.5, 25, 15, 8, 11000, URL, None, "foo"],
        ["T6", "MEM-3", "NaCl", 99.6, "nominal", 2000, 15.5, 25, 15, 8, 11000, URL, None, None],
        ["T15", "MEM-4", "NaCl", 99.6, "nominal", 2000, 15.5, 25, 15, 8, 11000, URL, None, None],
    ]
    for r in tests:
        t.append(r)
    d = wb.create_sheet("Modulo_SI")
    d.append(["Ensaio", "Membrana_ID", "Qp_m3_s", "Pfeed_Pa", "Cf_kg_m3", "T_K"])
    d.append(["T1", "MEM-1", 2500 * 4.381263638888889e-08, 480000, 2.0, 298.15])
    d.append(["T5", "MEM-2", 11000 * 4.381263638888889e-08, 1550000, 2.5, 298.15])   # Cf planted wrong
    wb.save(str(path))


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------
def run_tool(*args):
    r = subprocess.run([sys.executable, str(TOOL)] + [str(a) for a in args],
                       capture_output=True, text=True, timeout=300, cwd=str(ROOT))
    return r.returncode, r.stdout, r.stderr


def report_of(out):
    return json.loads((out / "IMPORT-REPORT-membranes.json").read_text())


RE_TEST = re.compile(r"\n\s*\{\s*\n\s*id\s+(\S+);\s*\n\s*solute\s+(\S+);", re.M)


def tests_in(path):
    return [a for a, _b in RE_TEST.findall(path.read_text())]


def block_of(path, tid):
    s = path.read_text()
    i = s.index("id                 %s;" % tid)
    return s[i:s.index("}", i)]


def snapshot(out):
    return {p.name: (p.read_bytes(), p.stat().st_mtime_ns) for p in sorted(out.glob("*.dat"))}


def copy_case(src, dst):
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "log.*", "expected", "reports", "design", "propertyManifest"))


def run_case(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BIN), str(case)], capture_output=True, text=True,
                       timeout=900, env=env, cwd=str(case))
    return r.returncode, r.stdout, r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1].split("<<<Choupo:result-end>>>")[0])


# ---------------------------------------------------------------------------
def main():
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        print("check_membrane_import: COULD NOT RUN -- openpyxl is not installed (python3 -m pip install openpyxl)")
        return 1
    if not TOOL.exists():
        print("check_membrane_import: COULD NOT RUN -- no %s" % TOOL)
        return 1
    if not BIN.exists():
        print("check_membrane_import: COULD NOT RUN -- no %s (make all)" % BIN)
        return 1

    tmp = Path(tempfile.mkdtemp(prefix="membraneImport."))
    try:
        xlsx = tmp / "fixture.xlsx"
        build_fixture(xlsx)
        out = tmp / "local" / "assets"

        # ---- (a) counts from the files ------------------------------------
        rc, so, se = run_tool(xlsx, "--out", out)
        if rc != 0:
            fail("(a) the import exited %d:\n%s%s" % (rc, so[-800:], se[-800:]))
            return finish(tmp)
        rep = report_of(out)
        dats = sorted(out.glob("*.dat"))
        names = sorted(p.stem for p in dats)
        if rep["records"]["total"] != len(dats):
            fail("(a) report says %d records, the directory holds %d" % (rep["records"]["total"], len(dats)))
        n_tests_files = sum(len(tests_in(p)) for p in dats)
        if rep["ratedTests"]["total"] != n_tests_files:
            fail("(a) report says %d tests, the files carry %d" % (rep["ratedTests"]["total"], n_tests_files))
        if names != ["FX-4040", "FX-8040", "FX-DUPROW"]:
            fail("(a) expected records FX-4040, FX-8040, FX-DUPROW; got %s" % names)
        if rep["records"]["byManufacturer"] != {"FixtureCo": len(dats)}:
            fail("(a) per-manufacturer tally %r" % rep["records"]["byManufacturer"])
        if n_tests_files != 5:
            fail("(a) expected 5 rated tests in the files (T1 T4 T2 T3 T5); got %d" % n_tests_files)
        print("  (a) %d records, %d tests -- report and files agree" % (len(dats), n_tests_files))

        # ---- (b) idempotent ----------------------------------------------
        snap1 = snapshot(out)
        rc, so2, se2 = run_tool(xlsx, "--out", out)
        rep2 = report_of(out)
        if rc != 0 or snapshot(out) != snap1:
            fail("(b) the second run changed a file (bytes or mtime)")
        if not rep2.get("idempotent") or "IDEMPOTENT" not in so2:
            fail("(b) the second run does not report itself idempotent")
        else:
            print("  (b) second run: no file changed, reported idempotent")

        # ---- (c) duplicates and contradictions reported, not merged ----------
        fx = out / "FX-4040.dat"
        ids = tests_in(fx)
        if [i for i in ids if i in ("T2", "T3")] != ["T2", "T3"]:
            fail("(c) FX-4040 must carry both MgSO4 test ids T2 and T3 (not merged): %r" % [i for i in ids if i in ("T2", "T3")])
        if [i for i in ids if i in ("T1", "T4")] != ["T1", "T4"]:
            fail("(c) FX-4040 must carry both NaCl test ids T1 and T4 (not merged): %r" % [i for i in ids if i in ("T1", "T4")])
        dup = "\n".join(rep["duplicates"])
        con = "\n".join(rep["contradictions"])
        if "T2, T3" not in dup or "MgSO4" not in dup:
            fail("(c) the duplicate MgSO4 pair T2/T3 is not reported: %r" % rep["duplicates"])
        if "T1, T4" not in con or "DIFFERENT values" not in con:
            fail("(c) the contradictory NaCl pair T1/T4 is not reported: %r" % rep["contradictions"])
        if "FX-DUPROW" not in dup or "written once" not in dup:
            fail("(c) the repeated element row FX-DUPROW is not reported as written once")
        if (out / "FX-2540.dat").exists() or "FX-2540" not in con or "NEITHER written" not in con:
            fail("(c) the name collision FX 2540 / FX-2540 must write neither and be reported")
        if not fails:
            print("  (c) duplicate T2/T3 and contradiction T1/T4 both written and reported; FX-DUPROW once; FX-2540 collision refused")

        # ---- (d) unstated pressure basis never assumed ---------------------
        RE_DECL = re.compile(r"(?m)^\s*pressureBasis\s+(\S+);")   # a DECLARATION, not the comment naming the key
        for tid in ("T2", "T3", "T4"):
            m = RE_DECL.search(block_of(fx, tid))
            if m:
                fail("(d) %s has no stated basis but the record declares `pressureBasis %s;`" % (tid, m.group(1)))
        if "pressureBasis      feedGauge;" not in block_of(fx, "T1"):
            fail("(d) T1 says gauge in the input and the record does not declare feedGauge")
        if "pressureBasis      feedAbsolute;" not in block_of(out / "FX-8040.dat", "T5"):
            fail("(d) T5 says absoluta in the input and the record does not declare feedAbsolute")
        if rep["ratedTests"]["pressureBasisUnstatedIds"] != ["T2", "T3", "T4"]:
            fail("(d) report must list T2, T3, T4 as unstated; got %r" % rep["ratedTests"]["pressureBasisUnstatedIds"])
        if "pressureBasis omitted, never assumed" not in block_of(fx, "T2"):
            fail("(d) the record does not say the basis was omitted")
        if not fails:
            print("  (d) T2/T3/T4 written without pressureBasis and listed; T1 feedGauge, T5 feedAbsolute as stated")

        # ---- (e) data/standards refuses -------------------------------------
        before = sorted(p.name for p in (ROOT / "data/standards/assets").iterdir())
        for bad in (tmp / "x" / "standards" / "y", ROOT / "data" / "standards" / "assets"):
            rc, so, se = run_tool(xlsx, "--out", bad)
            if rc == 0 or "refuseStandardsWrite" not in se:
                fail("(e) --out %s did not refuse naming records::refuseStandardsWrite (exit %d)" % (bad, rc))
            if (tmp / "x").exists():
                fail("(e) --out %s wrote something" % bad)
        after = sorted(p.name for p in (ROOT / "data/standards/assets").iterdir())
        if before != after:
            fail("(e) data/standards/assets changed: %r" % sorted(set(after) ^ set(before)))
        if not fails:
            print("  (e) both standards paths refused, nothing written")

        # ---- (f) every written record loads ---------------------------------
        for p in dats:
            case = tmp / ("load_" + p.stem)
            copy_case(M15, case)
            shutil.copy(p, case / "constant/assets" / p.name)
            f = case / "system/flowsheetDict"
            t = f.read_text()
            t2 = t.replace("module           NF270-4040;     // data/standards/assets/, kind membraneModule",
                           "module           %s;\n            membrane         NF270;" % p.stem, 1)
            if t2 == t:
                fail("(f) membrane15's module line not found")
                break
            f.write_text(t2)
            rc, so, se = run_case(case)
            if rc != 0:
                fail("(f) %s does not load in the engine (exit %d):\n%s" % (p.name, rc, (so + se)[-900:]))
                continue
            n_lines = len(re.findall(r"^\s*Rated test \S+:", so, re.M))
            if n_lines != len(tests_in(p)):
                fail("(f) %s: %d `Rated test <id>:` lines printed for %d tests in the record" % (p.name, n_lines, len(tests_in(p))))
            else:
                print("  (f) %s loads: %d rated test(s) printed" % (p.name, n_lines))
        case = tmp / "invert"
        copy_case(M25, case)
        shutil.copy(fx, case / "constant/assets" / fx.name)
        f = case / "system/flowsheetDict"
        t = f.read_text()
        t2 = t.replace("module           NF270-4040;     // data/standards/assets/, its ratedTest {} is inverted",
                       "module           FX-4040;\n            membrane         NF270;", 1)
        t2 = re.sub(r"(?m)^(\s+)rejection \{ MgSO4 fromRatedTest; \}",
                    lambda m: m.group(1) + "rejection { MgSO4 ( fromRatedTest T2 ); }", t2, count=1)
        if t2 == t:
            fail("(f) membrane25's lines not found")
        f.write_text(t2)
        rc, so, se = run_case(case)
        j = result_of(so) if rc == 0 else None
        r_int = None if j is None else j.get("kpis", {}).get("NFderived", {}).get("R_int_fromRatedTest_MgSO4")
        if rc != 0 or r_int is None or not (0.0 < r_int < 1.0):
            fail("(f) the inversion on the imported FX-4040 (test T2) did not publish a finite R_int (exit %d, R_int %r):\n%s"
                 % (rc, r_int, (so + se)[-900:]))
        else:
            print("  (f) inversion on FX-4040 test T2: R_int(MgSO4) = %.6f" % r_int)

        # ---- (g) refusals by name ------------------------------------------
        bad_wb = tmp / "badconst.xlsx"
        build_fixture(bad_wb, gpd_constant=4.0e-08)
        rc, so, se = run_tool(bad_wb, "--out", tmp / "g")
        if rc == 0 or "GPD_em_m3_s" not in se or "not the SI one" not in se:
            fail("(g) a workbook with a non-SI conversion constant did not refuse by name (exit %d): %s" % (rc, se[-300:]))
        rc, so, se = run_tool(xlsx, tmp / "absent.xlsx", "--out", tmp / "g2")
        rep_g = report_of(tmp / "g2") if rc == 0 else {}
        missing = [i for i in rep_g.get("inputs", []) if i["status"].startswith("not imported: file not found")]
        if rc != 0 or len(missing) != 1 or rep_g["records"]["total"] != len(dats):
            fail("(g) an absent input must be reported 'not imported' and invent nothing (exit %d, %r)" % (rc, missing))
        if not fails:
            print("  (g) non-SI constant refused; an absent input reported, nothing invented")

        # ---- (h) the one opt-in is announced --------------------------------
        nw = {e["model"]: e["reason"] for e in rep["notWritten"]}
        if "FX-NOSPACER" not in nw or "espacador_mil" not in nw["FX-NOSPACER"]:
            fail("(h) FX-NOSPACER must be listed as not written for its spacer: %r" % nw.get("FX-NOSPACER"))
        rc, so, se = run_tool(xlsx, "--out", tmp / "h", "--assume-spacer-mil", "28")
        p = tmp / "h" / "FX-NOSPACER.dat"
        if rc != 0 or not p.exists():
            fail("(h) --assume-spacer-mil 28 did not write FX-NOSPACER")
        else:
            s = p.read_text()
            i = s.index("    channelHeight\n")
            blk = s[i:s.index("}", i)]
            if "origin        estimated;" not in blk or "--assume-spacer-mil 28" not in blk:
                fail("(h) the assumed spacer is not an announced estimate naming the flag:\n%s" % blk)
            else:
                print("  (h) FX-NOSPACER absent by default; with the flag, channelHeight is an announced estimate")

        # ---- (i) not written / rejected, by reason ---------------------------
        want = {"FX-NOAREA": "area_m2", "FX-Flat Flatsheet": "flat sheet"}
        for model, word in want.items():
            if model not in nw or word not in nw[model]:
                fail("(i) %s must be listed as not written for %r: %r" % (model, word, nw.get(model)))
        kinds = rep["rejectedTestsByKind"]
        want_k = {"range-without-ends": 1, "reference-value": 1, "incomplete": 1, "unknown-kind": 1,
                  "orphan": 1, "duplicate-id": 1, "unknown-solute": 1, "unknown-pressure-basis": 1,
                  "element-not-written": 2}
        if kinds != want_k:
            fail("(i) rejected tests by kind: %r, expected %r" % (kinds, want_k))
        if not fails:
            print("  (i) every not-written element and rejected test listed with its reason (%d kinds)" % len(kinds))

        # ---- (j) prose dropped; derived sheet cross-checked --------------------
        if not any("observacoes dropped" in d for d in rep["dropped"]):
            fail("(j) the prose-like observacoes field was not dropped and said")
        if len(rep["derivedCrossCheckMismatches"]) != 1 or "cf_kg_m3" not in rep["derivedCrossCheckMismatches"][0]:
            fail("(j) the planted Modulo_SI mismatch (T5 Cf) was not reported: %r" % rep["derivedCrossCheckMismatches"])
        if not any("derived columns" in d and "not imported" in d for d in rep["dropped"]):
            fail("(j) the derived sheet must be reported as not imported")
        if not fails:
            print("  (j) prose field dropped; derived sheet not imported, its one planted mismatch reported")
    finally:
        pass
    return finish(tmp)


def finish(tmp):
    shutil.rmtree(tmp, ignore_errors=True)
    if fails:
        print("check_membrane_import: FAIL -- %d finding(s)" % len(fails))
        return 1
    print("check_membrane_import: OK -- bin/choupo-import-membranes on a SYNTHETIC catalogue (FixtureCo, built in a "
          "temporary directory): counts read back from the written records, a second run changes no byte and no "
          "mtime, a duplicate and a contradictory test pair are both written and reported (never merged), an "
          "unstated pressure basis is omitted and listed (gauge/absolute written only as the input says), both "
          "data/standards paths refuse naming records::refuseStandardsWrite, every written record loads in "
          "choupoSolve on a membrane15 copy with one `Rated test` line per test and the slice-1 inversion runs on "
          "an imported two-test element, a non-SI constant and an absent input refuse/report by name, the spacer "
          "opt-in is an announced estimate, nine rejection kinds and three not-written reasons listed, prose dropped, the derived sheet "
          "cross-checked.  NOT checked: any number against a manufacturer's sheet; the private Downloads file.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
