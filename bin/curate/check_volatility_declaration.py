#!/usr/bin/env python3
"""Volatility-declaration gate: `role` is the CASE's modelling class,
`volatility {}` is the SUBSTANCE's physics, and the engine ANNOUNCES the
contradiction instead of obeying it in silence.

Resolution record: docs/design/role-vocabulary-forum-2026-08-02.md
(the panel compared the two reference process simulators: neither carries a
word meaning "this liquid cannot evaporate" -- both separate the participation
class from the case's convention -- and both fill a missing vapour-pressure
correlation by manufacturing a number, which this project forbids).

  CONTRADICTION  utility01_dowtherm_preheat models dowthermA `role
                 nonvolatile` while its record declares `volatility.class
                 volatile`; the run CONTINUES (a legal case-scoped
                 simplification) and says so, naming the record's own Tb.
  UNKNOWN        a nonvolatile component with NO volatility{} block is
                 announced UNKNOWN -- absence is never read as a claim.
                 (Any sealed nonvolatile record without the block serves;
                 the probe strips dowthermA's block to make one.)
  REFUSALS       volatility.class <junk>            -> the three legal words
                 class volatile with no record Tb   -> a claim must be
                                                       falsifiable
                 normalBoilingPoint inside the block -> one datum, one home
                                                       (the arity sin)

Exit 1 listing failures."""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
BASE = ROOT / "tutorials" / "steady" / "utilities" / "utility01_dowtherm_preheat"
REC = "constant/components/dowthermA.dat"

failures = []


def make_case(tmp: Path, tag: str, rec_edit=None) -> Path:
    case = tmp / f"probe_{tag}"
    shutil.copytree(BASE, case, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "converged", "iterations", "resultJson*"))
    if rec_edit:
        p = case / REC
        p.write_text(rec_edit(p.read_text()))
        #  The sealed manifest hashes every mirrored record, so a probe that
        #  edits one must drop the seal or the runtime refuses on provenance
        #  instead of on the thing under test.
        man = case / "constant" / "propertyManifest"
        if man.exists():
            man.write_text(re.sub(r"sealed\s+true;", "sealed false;",
                                  man.read_text()))
    return case


def run(case: Path):
    #  env PINNED, CHOUPO_HOME deliberately ABSENT (found 2026-08-09): the
    #  probes strip fields from the CASE-LOCAL record, but the overlay is
    #  field-by-field, so with a reachable standards catalogue the stripped
    #  block silently backfills from data/standards/ and every "absence"
    #  scenario evaporates -- the gate then fails in any shell that exports
    #  CHOUPO_HOME while passing in one that does not.  A gate whose verdict
    #  depends on the caller's environment is the permanently-green-gate
    #  defect wearing its inverse; the probe's real scenario is the sealed
    #  case running on its own mirrors, so pin exactly that.
    p = subprocess.run([str(SOLVE), "."], cwd=case,
                       capture_output=True, text=True, timeout=600,
                       env={"PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    if not SOLVE.exists():
        print(f"check_volatility_declaration: {SOLVE} missing -- build first")
        return 1
    if not (BASE / REC).exists():
        print(f"check_volatility_declaration: fixture {BASE/REC} missing")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- CONTRADICTION: announced, and the run continues -------------
        rc, out = run(make_case(tmp, "contradiction"))
        if rc != 0:
            failures.append("CONTRADICTION: the simplification is LEGAL --"
                            f" expected exit 0, got {rc}\n" + out[-800:])
        for n in ("[volatility] component 'dowthermA' is MODELLED nonvolatile",
                  "although its record declares it VOLATILE",
                  "case-scoped simplification, legal and announced"):
            if n not in out:
                failures.append(f"CONTRADICTION: output lacks '{n}'")
        # the announcement must carry the record's OWN falsifying datum
        if not re.search(r"Tb = 530\.15", out):
            failures.append("CONTRADICTION: the announcement does not name"
                            " the record's own Tb (530.15 K) -- a claim"
                            " without its datum is the defect being fixed")

        # ---- UNKNOWN: absence is not a claim ------------------------------
        def strip_block(t: str) -> str:
            out_ = re.sub(r"volatility\s*\{[^}]*\{[^}]*\}[^}]*\}", "", t,
                          count=1)
            assert "volatility" not in out_, "probe failed to strip the block"
            return out_
        rc, out = run(make_case(tmp, "unknown", strip_block))
        if rc != 0:
            failures.append(f"UNKNOWN: expected exit 0, got {rc}")
        for n in ("declares no volatility{} block",
                  "the physics is UNKNOWN, not established"):
            if n not in out:
                failures.append(f"UNKNOWN: output lacks '{n}'")
        if "MODELLED nonvolatile (K = 0) although" in out:
            failures.append("UNKNOWN: absence was announced as a"
                            " CONTRADICTION -- absence is not a claim")

        # ---- REFUSALS ------------------------------------------------------
        probes = [
            ("junkClass", lambda t: t.replace("class       volatile;",
                                              "class       slightly;"),
             ["volatility.class 'slightly' is not one of",
              "volatile / nonvolatile / decomposes"]),
            ("noTb", lambda t: re.sub(r"^Tb .*$", "", t, count=1,
                                      flags=re.M),
             ["volatility.class volatile without a component-level",
              "must be falsifiable"]),
            ("restatedTb", lambda t: t.replace(
                "class       volatile;",
                "class       volatile;\n    normalBoilingPoint 530.15;"),
             ["must NOT restate the boiling point",
              "one home"]),
        ]
        for tag, edit, needles in probes:
            rc, out = run(make_case(tmp, tag, edit))
            if rc == 0:
                failures.append(f"REFUSAL {tag}: expected nonzero exit,"
                                " got 0 (the refusal is gone)")
                continue
            for n in needles:
                if n not in out:
                    failures.append(f"REFUSAL {tag}: message lacks"
                                    f" '{n}'\n--- got:\n" + out[-600:])

    if failures:
        print("check_volatility_declaration: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_volatility_declaration: OK -- the modelled/declared"
          " contradiction is announced with its own Tb and the run"
          " continues; absence stays UNKNOWN (never a claim); 3 refusals"
          " fire named (junk class, unfalsifiable claim, restated Tb)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
