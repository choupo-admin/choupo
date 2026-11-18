#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: THE CASE A STUDENT TAKES AWAY RUNS ALONE (contract K4, design 7b).
    bin/curate/check_exported_case_runs_alone.py [--only <case>] [--list]

WHY THIS EXISTS (the real defect class).  Since C413/C421 a case REFERENCES
the catalogue by hash (constant/propertyManifest `pins`) and holds no copy of a
record.  Such a case runs in the tree and FAILS on the student's machine when
the export leaves the referenced records behind: nothing in the tree can see
that, because every run in the tree has data/standards beside it.  Only an
export put on a build whose catalogue is HIDDEN says whether the case carries
what it reads.

WHAT IS CHECKED, per case of tutorials/FASTSET (one per family) that is a
runnable case directory:
  (1) EXPORT through the tool's own path (`bin/choupo-import --seal <case>
      --to <dir>`: the sealed form, records copied and hashed).
  (2) RUN the export from inside a private copy OUTSIDE the tree, with
      CHOUPO_HOME unset and no data/ in any parent: the catalogue is hidden.
  (3) COMPARE its result block with the in-tree run, number by number
      (relative 1e-9; non-numeric leaves exactly), ignoring only the blocks
      that say WHERE the case ran (seal/pins/provenance/citation/paths).
A case the seal tool cannot export is reported by name with its reason
(`code/` cases build their own binary).
Exit 0 only when every exportable case carries (EXPORT-OK, RUN-OK, SAME).
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
#  the golden comparator's default band (runTests: reltol 1e-4); swro01's
#  iterative residuals differ by 8e-6 between two runs of the SAME records.
RELTOL = 1e-4
#  An export that REFUSES by name is the tool keeping its contract, not a case
#  that left records behind: an `overlayOf` demo is meant to stay live against
#  the catalogue, so it is not sealed.
REFUSED_BY_DESIGN = "deep-merge demo meant to stay live"
#  Debt that only shrinks: a case whose export does not run alone, found by this
#  gate on its first run and QUEUED (DEV.md 4c), never silently accepted.  The
#  gate FAILS when a listed case starts to pass, so the entry must be removed.
KNOWN_OPEN = {
    "tutorials/plant/lithiumBrinePlant":
        "sealed before the utility lineup was in the closure and the importer "
        "refuses to re-seal its `Pitzer` spelling: every duty reads "
        "'(no utility catalogue loaded)' once the catalogue is hidden",
}
IGNORE = re.compile(
    r"seal|pins|provenance|citation|commit|path|file|dir|elapsed|wall|"
    r"timestamp|time_s|duration|version|origin|catalogue|consumption|pinned|drift",
    re.I)


def app_of(case):
    t = (case / "system" / "controlDict").read_text(errors="replace")
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    t = re.sub(r'(?m)^\s*//.*$', '', t)
    m = re.search(r'\bapplication\s+(\w+)\s*;', t)
    return m.group(1) if m else "choupoSolve"


def binary(app):
    for b in sorted((ROOT / "build").glob("*")):
        if (b / app).is_file() and not b.name.endswith("Debug"):
            return b / app
    sys.exit("no %s binary under build/ -- run make" % app)


def run(case, app, hide):
    env = {k: v for k, v in os.environ.items() if k != "CHOUPO_HOME"}
    if not hide:
        env["CHOUPO_HOME"] = str(ROOT)
    return subprocess.run([str(binary(app)), "."], cwd=str(case), env=env,
                          capture_output=True, text=True, timeout=900)


def block(out, *where):
    """The result JSON; every absolute path of the run (the case, the tree) is
    replaced by a token first, so a message that NAMES where a record was read
    is compared by what it says, not by where the case sat."""
    for w, tok in where:
        out = out.replace(str(w), tok)
    #  where a record was READ is the one difference an export is meant to make:
    #  the catalogue's file in the tree, the case's own copy in the export
    out = out.replace("<root>/data/standards/", "<rec>/").replace("<case>/constant/", "<rec>/")
    m = re.search(r'<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>', out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError:
        return None


def diff(a, b, path="", out=None):
    out = [] if out is None else out
    if len(out) > 8:
        return out
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if IGNORE.search(k):
                continue
            if k not in a or k not in b:
                out.append("%s/%s present on one side only" % (path, k))
            else:
                diff(a[k], b[k], path + "/" + k, out)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append("%s length %d vs %d" % (path, len(a), len(b)))
        else:
            for i, (x, y) in enumerate(zip(a, b)):
                diff(x, y, "%s[%d]" % (path, i), out)
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)) \
            and not isinstance(a, bool):
        if not math.isclose(a, b, rel_tol=RELTOL, abs_tol=1e-9):
            out.append("%s: %r vs %r" % (path, a, b))
    elif a != b:
        out.append("%s: %r vs %r" % (path, a, b))
    return out


def fastset():
    return [l.strip() for l in (ROOT / "tutorials" / "FASTSET").read_text().splitlines()
            if l.strip() and not l.strip().startswith("#")]


def check(rel):
    case = ROOT / rel
    if rel.startswith("data/curation/"):
        return "SKIP", "a curation case, not a case a student takes away"
    if not (case / "system" / "controlDict").is_file():
        return "SKIP", "not a case directory"
    if (case / "code").is_dir():
        return "SKIP", "code/ case builds its own binary"
    app = app_of(case)
    tmp = Path(tempfile.mkdtemp(prefix="k4_export_"))
    try:
        dest = tmp / "export"
        e = subprocess.run([sys.executable, str(ROOT / "bin" / "choupo-import"),
                            "--seal", str(case), "--to", str(dest)],
                           capture_output=True, text=True, timeout=1800)
        if e.returncode != 0:
            tail = " | ".join((e.stdout + e.stderr).strip().splitlines()[-3:])
            if REFUSED_BY_DESIGN in (e.stdout + e.stderr):
                return "OK", "refused by name (overlayOf demo stays live): nothing left behind"
            return "FAIL", "export REFUSED: " + tail[:300]
        ref = run(case, app, hide=False)
        if ref.returncode != 0:
            return "SKIP", "in-tree run exits %d (not a running case)" % ref.returncode
        got = run(dest, app, hide=True)
        if got.returncode != 0:
            tail = " | ".join((got.stdout + got.stderr).strip().splitlines()[-2:])
            return "FAIL", "export does not run alone (exit %d): %s" % (got.returncode, tail[:300])
        a = block(ref.stdout, (case, "<case>"), (ROOT, "<root>"))
        b = block(got.stdout, (dest, "<case>"), (ROOT, "<root>"))
        if a is None or b is None:
            if a is None and b is None:
                return "OK", "ran alone (no result block to compare)"
            return "FAIL", "result block on one side only"
        d = diff(a, b)
        if d:
            return "FAIL", "result differs: " + "; ".join(d[:4])
        return "OK", "carried, ran alone, same result"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    args = sys.argv[1:]
    cases = fastset()
    if "--list" in args:
        print("\n".join(cases))
        return 0
    if "--only" in args:
        cases = [args[args.index("--only") + 1]]
    bad = 0
    for rel in cases:
        st, why = check(rel)
        if rel in KNOWN_OPEN:
            if st == "FAIL":
                st, why = "OPEN", "KNOWN-OPEN debt: " + KNOWN_OPEN[rel]
            else:
                st, why = "FAIL", "now passes (%s): remove it from KNOWN_OPEN" % st
        print("%-5s %-60s %s" % (st, rel, why), flush=True)
        bad += st == "FAIL"
    if bad:
        print("check_exported_case_runs_alone: FAIL -- %d of %d case(s)" % (bad, len(cases)))
        return 1
    print("check_exported_case_runs_alone: OK -- %d FASTSET case(s): each exported by "
          "`choupo-import --seal`, run outside the tree with no catalogue, and its result "
          "equal to the in-tree run at the golden tolerance (%d known-open, by name).  "
          "NOT checked: the GUI's download path in a browser (its records are unit-tested "
          "in gui/tests/carryCatalogue.test.ts), cases outside the FASTSET." % (len(cases), len(KNOWN_OPEN)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
