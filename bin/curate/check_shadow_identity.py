#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Shadow-identity gate: a local record that has a catalogue homonym says what
it is, the engine checks the claim, and a case that REFERENCES the catalogue
cannot read an unpinned record or follow a moved one in silence (C413).

Design record: docs/design/c413-cases-reference-the-catalogue.md, D1-D3.

The fixtures are copies of the pinned witness (flash01_benzene_toluene), run by
the built engine outside the tree with CHOUPO_HOME on this one.  Each arm is a
SABOTAGE and must be refused BY NAME with its remedy; each has the control that
shows the refusal is not crying wolf.

  CONTROL    the pinned witness runs, verdict `pinned`, strict or not.
  ION/RADICAL  a local record with the catalogue's name and another CHARGE,
             undeclared -- refuses ("DIFFERENT species"), naming distinctFrom.
  VARIATION  `variationOf benzene;` whose formula disagrees -- refuses.
  DISTINCT   `distinctFrom benzene;` on the SAME species -- refuses; and on a
             different charge it is ACCEPTED (the declared ion over a radical).
  REASON     a declared variation without `variationReason` -- announced, and
             refused under strict.
  UNDECLARED an identical copy beside a pin -- announced, refused under strict
             (the copies may not come back).
  UNPINNED   a pin removed: the run read a record the manifest does not pin --
             announced as `drifted` (exit 0), refused under strict, naming
             `bin/choupo-import --pin`.
  CHANGED    a pin edited -- `drifted` and refused under strict, naming
             `--repin`.
  BOTH       `pins` beside `sealed true;` refuses.
  HOMONYM PIN  a pin for a record the case reads ALONE (a declared variation):
             check_case_records names it.
  SPELLING   the two catalogue formulas the record named (Cl, HOCl) read as
             chlorine.
Exit 1 listing failures."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
BASE = ROOT / "tutorials" / "steady" / "flash" / "flash01_benzene_toluene"
CAT_BENZENE = ROOT / "data" / "standards" / "components" / "benzene.dat"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import case_records  # noqa: E402

failures = []


def make_case(tmp, tag, files=None, man_edit=None):
    case = tmp / f"probe_{tag}"
    shutil.copytree(BASE, case, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "converged", "iterations", "log.*", "resultJson*"))
    for rel, text in (files or {}).items():
        p = case / "constant" / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
    if man_edit:
        m = case / "constant" / "propertyManifest"
        m.write_text(man_edit(m.read_text()))
    return case


def run(case, strict):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    env.pop("CHOUPO_PINS", None)
    if strict:
        env["CHOUPO_PINS"] = "refuse"
    p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def seal_of(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1)).get("seal")
    except json.JSONDecodeError:
        return None


def benzene(formula=None, extra=""):
    t = CAT_BENZENE.read_text()
    if formula:
        t = re.sub(r"(?m)^formula\s+\S+;", f"formula        {formula};", t, count=1)
    return t + "\n" + extra


def refuses(label, rc, out, needles):
    if rc == 0:
        failures.append(f"{label}: expected a REFUSAL, got exit 0")
        return
    for n in needles:
        if n not in out:
            failures.append(f"{label}: the refusal does not say '{n}'")


def main():
    if not SOLVE.exists():
        print(f"check_shadow_identity: {SOLVE} missing -- build first")
        return 1
    if not case_records.read_manifest(BASE / "constant" / "propertyManifest")["pins"]:
        print("check_shadow_identity: the witness flash01_benzene_toluene holds no `pins`")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        DECL = lambda kind, why='variationReason "gate probe";': f"{kind} benzene;\n{why}\n"

        # ---- CONTROL ------------------------------------------------------
        for strict in (False, True):
            rc, out = run(make_case(tmp, f"control{int(strict)}"), strict)
            s = seal_of(out)
            if rc != 0 or not s or s.get("verdict") != "pinned":
                failures.append(f"CONTROL (strict={strict}): exit {rc}, seal {s!r};"
                                " the pinned witness must run and say `pinned`")

        # ---- ION OVER RADICAL: another charge, undeclared -----------------
        rc, out = run(make_case(tmp, "ion", {"components/benzene.dat": benzene("C6H6+")}), False)
        refuses("ION/RADICAL undeclared", rc, out,
                ["DIFFERENT species", "charge", "distinctFrom"])
        # declared: accepted, and read ALONE
        rc, out = run(make_case(tmp, "ion_ok", {"components/benzene.dat":
                      benzene("C6H6+", DECL("distinctFrom"))}), True)
        if rc != 0:
            failures.append(f"DISTINCT on another charge must be ACCEPTED, got exit {rc}:\n"
                            + "\n".join(out.splitlines()[-6:]))

        # ---- a declared variation whose formula disagrees -----------------
        rc, out = run(make_case(tmp, "var_bad", {"components/benzene.dat":
                      benzene("C6H7", DECL("variationOf"))}), False)
        refuses("VARIATION with another formula", rc, out,
                ["variationOf", "disagree", "formula", "distinctFrom"])
        # ... and a faithful one runs, strict, read alone
        rc, out = run(make_case(tmp, "var_ok", {"components/benzene.dat":
                      benzene(None, DECL("variationOf"))}), True)
        if rc != 0:
            failures.append(f"VARIATION faithful must run strict, got exit {rc}:\n"
                            + "\n".join(out.splitlines()[-6:]))

        # ---- distinctFrom on the SAME species -----------------------------
        rc, out = run(make_case(tmp, "dist_same", {"components/benzene.dat":
                      benzene(None, DECL("distinctFrom"))}), False)
        refuses("DISTINCT on the same species", rc, out,
                ["distinctFrom", "SAME species", "variationOf"])

        # ---- missing reason ------------------------------------------------
        rc, out = run(make_case(tmp, "noreason", {"components/benzene.dat":
                      benzene(None, "variationOf benzene;\n")}), False)
        if rc != 0 or "variationReason" not in out:
            failures.append("REASON non-strict: expected exit 0 with the sentence"
                            f" announced, got exit {rc}")
        rc, out = run(make_case(tmp, "noreason_s", {"components/benzene.dat":
                      benzene(None, "variationOf benzene;\n")}), True)
        refuses("REASON strict", rc, out, ["variationReason"])

        # ---- an identical, undeclared copy beside a pin ---------------------
        rc, out = run(make_case(tmp, "copy", {"components/benzene.dat": benzene()}), False)
        if rc != 0 or "[shadow]" not in out:
            failures.append(f"UNDECLARED non-strict: expected exit 0 and a [shadow] line, got exit {rc}")
        rc, out = run(make_case(tmp, "copy_s", {"components/benzene.dat": benzene()}), True)
        refuses("UNDECLARED strict", rc, out, ["without", "variationOf", "--pin"])

        # ---- an unpinned read ---------------------------------------------
        def drop_pin(t):
            return re.sub(r'(?m)^\s*"components/toluene.dat".*\n', "", t)
        c = make_case(tmp, "unpinned", man_edit=drop_pin)
        rc, out = run(c, False)
        s = seal_of(out)
        if rc != 0 or not s or s.get("verdict") != "drifted" \
                or "components/toluene.dat (unpinned)" not in s.get("divergedRecords", []):
            failures.append(f"UNPINNED announce: expected exit 0, `drifted` naming"
                            f" components/toluene.dat (unpinned) IN THE RESULT; got exit {rc}, seal {s!r}")
        rc, out = run(make_case(tmp, "unpinned_s", man_edit=drop_pin), True)
        refuses("UNPINNED strict", rc, out,
                ["components/toluene.dat", "unpinned", "bin/choupo-import --pin"])

        # ---- a changed pin -------------------------------------------------
        def bend_pin(t):
            return re.sub(r'("components/benzene.dat"\s+")[0-9a-f]{64}', r"\g<1>" + "0" * 64, t)
        rc, out = run(make_case(tmp, "changed", man_edit=bend_pin), False)
        s = seal_of(out)
        if rc != 0 or not s or s.get("verdict") != "drifted" \
                or "components/benzene.dat (changed)" not in s.get("divergedRecords", []):
            failures.append(f"CHANGED announce: expected exit 0, `drifted` naming"
                            f" components/benzene.dat (changed); got exit {rc}, seal {s!r}")
        rc, out = run(make_case(tmp, "changed_s", man_edit=bend_pin), True)
        refuses("CHANGED strict", rc, out, ["components/benzene.dat", "changed", "--repin"])

        # ---- pins AND sealed -----------------------------------------------
        rc, out = run(make_case(tmp, "both", man_edit=lambda t: t.replace(
            "propertyManifest\n{", "propertyManifest\n{\n    sealed true;", 1)), False)
        refuses("BOTH pins and sealed", rc, out, ["pins", "sealed", "--seal"])

        # ---- a pin for a record the case reads ALONE -----------------------
        import check_case_records
        c = make_case(tmp, "homonympin", {"components/benzene.dat":
                      benzene(None, DECL("variationOf"))})
        probs = check_case_records.judge(c, ROOT)
        if not any("components/benzene.dat" in p and "pin" in p for p in probs):
            failures.append("HOMONYM PIN: check_case_records does not name a pin for a"
                            f" record the case reads alone; it said {probs!r}")
        probs = check_case_records.judge(make_case(tmp, "clean"), ROOT)
        if probs:
            failures.append(f"HOMONYM PIN control: the witness is judged {probs!r}")

    # ---- the respelled catalogue formulas ----------------------------------
    for rel, want in (("components/Cl.dat", "Cl"), ("components/HOCl.dat", "HOCl")):
        t = (ROOT / "data" / "standards" / rel).read_text()
        m = re.search(r"(?m)^formula\s+(\S+);", t)
        if not m or m.group(1) != want:
            failures.append(f"SPELLING: data/standards/{rel} formula is"
                            f" {m.group(1) if m else None!r}, expected {want} (the formula"
                            " grammar reads `CL` as carbon + L, and the shadow rule compares formulas)")

    if failures:
        print("check_shadow_identity: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_shadow_identity: OK -- on copies of the pinned witness: an undeclared"
          " homonym of another charge, a `variationOf` whose formula disagrees, a"
          " `distinctFrom` on the same species, a missing variationReason (strict),"
          " an undeclared copy (strict), an unpinned read and a changed pin each REFUSE by"
          " name with their remedy (announced as `drifted` in the result when not strict);"
          " a declared distinctFrom on another charge and a faithful variationOf run;"
          " `pins` beside `sealed` refuses; a pin for a record read alone is named; Cl and"
          " HOCl carry their chlorine spelling.  NOT CHECKED: that a declared variation's"
          " numbers are right, or any case other than the witness.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
