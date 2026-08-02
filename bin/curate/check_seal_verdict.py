#!/usr/bin/env python3
"""Seal-verdict gate: the manifest's claim and its RETRACTION travel
together, and the refusal is the CASE's to declare.

Resolution record: docs/design/seal-divergence-forum-2026-08-02.md.  The
forum seated the students first, as Vitor instructed, and they dissolved
the announce-or-refuse binary: the first-year must be able to edit a
record and learn from it; the masters student must not quote a release
her case no longer reproduces.  The measurement behind it: verifySeal()
returned a divergence count that ALL THREE binaries discarded, so the
divergence lived on stderr and a golden recorded from a diverged run was
byte-indistinguishable from one recorded from a verified run.

  VERIFIED   the sealed fixture, untouched, reports seal.verdict
             "verified" IN THE RESULT.
  DIVERGED   the SAME case with one record edited reports "diverged" and
             NAMES the record in the result (not merely on stderr), and
             the run still completes -- announcing is the default.
  UNSEALED   a case with no manifest reports "unsealed", and NEVER
             "verified": sealing nothing is not passing.
  REFUSE     with `onDivergence refuse;` the edited case exits nonzero,
             naming the record and the archival reason.
  JUNK       an unknown onDivergence word refuses by name.

Exit 1 listing failures."""
import json
import re
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
BASE = ROOT / "tutorials" / "steady" / "utilities" / "utility01_dowtherm_preheat"
REC = "constant/components/dowthermA.dat"
MAN = "constant/propertyManifest"

failures = []


def make_case(tmp: Path, tag: str, rec_edit=None, man_edit=None) -> Path:
    case = tmp / f"probe_{tag}"
    shutil.copytree(BASE, case, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "converged", "iterations", "resultJson*"))
    if rec_edit:
        p = case / REC
        p.write_text(rec_edit(p.read_text()))
    if man_edit:
        p = case / MAN
        p.write_text(man_edit(p.read_text()))
    return case


def run(case: Path):
    #  The probes run outside the repo tree, so the UNSEALED one would fail
    #  looking for the catalogue rather than on the thing under test.  A
    #  SEALED case forbids the catalogue anyway, so this is inert for the
    #  rest.
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def seal_of(out: str):
    """The verdict as the ARTEFACT carries it -- parsed out of the result
    block, never off stderr.  That distinction is the whole slice."""
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1)).get("seal")
    except json.JSONDecodeError:
        return None


def main() -> int:
    if not SOLVE.exists():
        print(f"check_seal_verdict: {SOLVE} missing -- build first")
        return 1
    if not (BASE / MAN).exists():
        print(f"check_seal_verdict: fixture {BASE/MAN} missing")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        touch = lambda t: t + "\n// gate probe: one byte moved\n"

        # ---- VERIFIED -----------------------------------------------------
        rc, out = run(make_case(tmp, "verified"))
        s = seal_of(out)
        if rc != 0:
            failures.append(f"VERIFIED: expected exit 0, got {rc}")
        elif not s or s.get("verdict") != "verified":
            failures.append(f"VERIFIED: result carries {s!r}, expected"
                            " verdict 'verified'")

        # ---- DIVERGED: announced, named IN THE RESULT, run continues ------
        rc, out = run(make_case(tmp, "diverged", rec_edit=touch))
        s = seal_of(out)
        if rc != 0:
            failures.append("DIVERGED: announce is the DEFAULT -- expected"
                            f" exit 0, got {rc}")
        elif not s or s.get("verdict") != "diverged":
            failures.append(f"DIVERGED: result carries {s!r}, expected"
                            " verdict 'diverged'")
        elif "components/dowthermA.dat" not in s.get("divergedRecords", []):
            failures.append("DIVERGED: the result does not NAME the moved"
                            f" record -- got {s.get('divergedRecords')!r}."
                            "  Naming it on stderr alone is the defect.")

        # ---- UNSEALED is not VERIFIED -------------------------------------
        case = make_case(tmp, "unsealed")
        (case / MAN).unlink()
        rc, out = run(case)
        s = seal_of(out)
        if s and s.get("verdict") == "verified":
            failures.append("UNSEALED: a case that sealed NOTHING reported"
                            " 'verified' -- sealing nothing is not passing")
        elif not s or s.get("verdict") != "unsealed":
            failures.append(f"UNSEALED: result carries {s!r}, expected"
                            " verdict 'unsealed'")

        # ---- REFUSE: the archival posture, declared by the CASE ------------
        #  `onDivergence` lives INSIDE the propertyManifest{} block, beside
        #  `sealed` -- the first version of this probe put it at file top,
        #  outside the block, where the reader cannot see it.
        def with_policy(word):
            def f(t):
                a = "sealed             true;"
                assert a in t, "manifest anchor moved"
                return t.replace(a, a + f"\n    onDivergence       {word};", 1)
            return f
        add_refuse = with_policy("refuse")
        rc, out = run(make_case(tmp, "refuse", rec_edit=touch,
                                man_edit=add_refuse))
        if rc == 0:
            failures.append("REFUSE: `onDivergence refuse;` with a moved"
                            " byte must STOP the run, got exit 0")
        else:
            for n in ("onDivergence", "declared ARCHIVAL",
                      "components/dowthermA.dat"):
                if n not in out:
                    failures.append(f"REFUSE: message lacks '{n}'")
        #  and it must NOT fire when nothing moved
        rc, out = run(make_case(tmp, "refuse_clean", man_edit=add_refuse))
        if rc != 0:
            failures.append("REFUSE: an INTACT archival case must run --"
                            f" got exit {rc} (crying wolf)")

        # ---- JUNK word ----------------------------------------------------
        rc, out = run(make_case(tmp, "junk", rec_edit=touch,
                                man_edit=with_policy("maybe")))
        if rc == 0:
            failures.append("JUNK: an unknown onDivergence word must refuse")
        elif "is not one of announce / refuse" not in out:
            failures.append("JUNK: the refusal does not name the legal words")

    if failures:
        print("check_seal_verdict: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_seal_verdict: OK -- the verdict reaches the RESULT"
          " (verified / diverged+named / unsealed, and unsealed is never"
          " verified); announce is the default and the case declares"
          " `onDivergence refuse;` for the archival posture (fires on a"
          " moved byte, silent when intact); a junk word refuses named")
    return 0


if __name__ == "__main__":
    sys.exit(main())
