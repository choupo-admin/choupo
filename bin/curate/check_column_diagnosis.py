#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a column that does not converge says WHICH of four things it is, in the
words of the column (DEV.md 4c C184 slice 1).

    bin/curate/check_column_diagnosis.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT (2026-10-27).  A plant with two fullMESH
columns failed in the GUI with "block-Thomas solve singular at row 2",
"dense solve singular at row 87 (iteration 0, |F| 10.7)" and, last,
"unit 'C1' failed to converge".  A row of the flattened system means nothing to
a student, and nothing in the output said whether the specification was
impossible, a property had been extrapolated, the system was singular, or the
engine was wrong.  The run now prints a `[diagnosis]` block that names one of
(A) an infeasible specification, (B) thermodynamic data that could not be
priced, (C) an ill-conditioned or singular system, (D) an implementation fault,
or says it could not tell and lists what it tried.

WHAT THIS GATE CHECKS.

  (a) THE PROBE (`_columnDiagnosisProbe.cpp`, compiled HERE against
      ColumnDiagnosis.cpp alone): synthetic systems whose cause is known by
      construction give the right letter -- rates leaving no bottoms (A); a
      stage-pricing refusal (B); two identical stage equations and two that
      differ by 1e-13 (C); a NaN residual and an empty equation (D); a
      well-conditioned failure with nothing refused ("could not tell", with its
      list of what was tried).  Extrapolation notices alone are NOT a cause
      (B2), and an unconverged iterate with a negative distillate component is
      NOT called an infeasible specification (A2): the first version of this
      diagnosis made both mistakes and was corrected on a feasible 50-stage
      column.  No text carries "row"; equations and unknowns are named by
      stage and component.
  (b) END TO END, (A): a copy of column06_fullMESH asked for a distillate equal
      to its whole feed is refused with the (A) sentence (before any Newton
      exists), exit non-zero; the same for the simultaneous column02.
  (c) END TO END, THE NEWTON PATH: a copy of column06_fullMESH given 50 stages
      at a reflux ratio of 60 (hard, not infeasible) does not converge in this
      engine; the run must print a `[diagnosis]` block with a letter other than
      (A), naming a stage, and no "row N" anywhere.  (If the engine improves
      until this column converges the arm says so and fails: replace the
      example, do not delete the arm.)
  (d) A CONVERGED COLUMN PRINTS NOTHING OF THIS: the shipped column06 converges
      with no `[diagnosis]` line.
  (e) SOURCE: every call of `diagnoseFailure` and of `diagnose` sits behind a
      not-converged test, and ColumnDiagnosis.cpp does not include NewtonND.H
      (the diagnosis reads the NDResult it is handed; the solver is untouched).

  (f) SLICE 2, THE RETRY RUNG (DEV.md 4c C184 slice 2).  THE REAL DEFECT IT
      WOULD HAVE CAUGHT (2026-11-25): a wide-boiling column -- toluene recovered
      from n-hexadecane, 20 stages, a 300 K feed, 384 K and 560 K at the ends --
      stopped NOT converged after 80 Newton iterations (|F| = 0.053) from the
      unit's default start, a ramp from T_feed - 5 K to T_feed + 15 K that lies
      200 K from where the stages run; the same equations converge in 8
      iterations from a profile built on the package's own bubble points.  Arms:
      the shipped `column22_wide_boiling_retry` converges BY the retry, announced
      (`re-solved from the thermodynamic profile ... CONVERGED`); the same column
      as `model fullMESH;` is rescued by the full-MESH rung; `seed thermodynamic;`
      starts from the profile and never retries; a column that converges from the
      default seed (column06) prints no retry; the hard 50-stage column (arm c)
      fails after the retry and its `[diagnosis]` says a retry was tried; an
      unknown `seed` word is refused by name; the source retries only behind a
      not-converged test and never over a declared `stageProfile`.

NOT COVERED, stated so the green line cannot imply it: that the letter is RIGHT
for a real column beyond these constructed ones (the DME plant that started this
is the owner's, not in the tree); a specification infeasible only through the
energy or equilibrium reach (no purity target is declared by `distillateRate` +
`refluxRatio`, so no declared number can show it, and an unconverged iterate
cannot testify -- arm (a) A2); failures thrown BEFORE the first Newton iterate
(the seed cannot be priced), which carry the thrower's own refusal by name; the
Wang-Henke method, which reports (A) and "could not tell" only.

SABOTAGE-VERIFIED 2026-11-24, by hand, each restored before the next: the
`diagnoseFailure` call removed from the full-MESH block (arm c fails); the
singular test replaced by `false` (probe C1 gives "could not tell"); the (A)
sentence deleted (arm b fails).  Slice 2, 2026-11-25: `retryWithThermoSeed`
forced to `false` and the engine rebuilt: arm (c) (the diagnosis no longer says a
retry was tried) and both (f) rescues (column22 simultaneous and fullMESH, exit 2,
"failed to converge") fail; restored and rebuilt, the gate passes.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import case_records  # noqa: E402  (the probe copy has one home)

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROBE = ROOT / "bin" / "curate" / "_columnDiagnosisProbe.cpp"
SRC = ROOT / "src" / "unitOperations" / "distillation"
COL = "tutorials/steady/distillation/"
fails = []


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def copy_case(rel, dst):
    case_records.copytree(ROOT / rel, dst, symlinks=True, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "latest", "latest.txt", "converged", "*.log",
        "reports", "postProcessing"))
    return dst


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BUILD / "choupoSolve"), "."], cwd=case,
                       capture_output=True, text=True, timeout=900, env=env)
    return p.returncode, p.stdout + p.stderr


def edit(case, rel, pairs):
    f = case / rel
    t = f.read_text()
    for a, b in pairs:
        if not re.search(a, t):
            fails.append(f"the gate's own edit '{a}' no longer matches {rel}")
        t = re.sub(a, b, t, count=1)
    f.write_text(t)


def arm_probe(tmp):
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        fails.append("(a) no C++ compiler: the probe cannot run -- a check "
                     "that cannot run must not pass")
        return {}
    exe = tmp / "probe"
    r = subprocess.run([cxx, "-std=c++17", "-O1", "-D_GLIBCXX_ASSERTIONS",
                        "-I", str(ROOT / "src"), str(PROBE),
                        str(SRC / "ColumnDiagnosis.cpp"), "-o", str(exe)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("(a) the probe does not compile:\n" + r.stderr[-2000:])
        return {}
    p = subprocess.run([str(exe)], capture_output=True, text=True, timeout=300)
    if p.returncode != 0 or "probeDone 1" not in p.stdout:
        fails.append(f"(a) the probe exited {p.returncode}:\n{p.stdout[-800:]}")
        return {}
    v = {}
    for line in p.stdout.splitlines():
        k, _, rest = line.partition(" ")
        v.setdefault(k, []).append(rest)
    want = {"A1": "A", "B1": "B", "B2": "-", "C1": "C", "C2": "C",
            "D1": "D", "D2": "D", "U1": "-"}
    for k, letter in want.items():
        got = (v.get(k + "Letter") or ["?"])[0]
        if got != letter:
            fails.append(f"(a) probe {k}: expected ({letter}), got ({got}):\n"
                         f"    {(v.get(k + 'Text') or [''])[0][:600]}")
    if (v.get("A2Letter") or ["?"])[0] == "A":
        fails.append("(a) probe A2: an UNCONVERGED iterate's negative distillate "
                     "component was called an infeasible specification")
    texts = " ".join(" ".join(v.get(k + "Text", [])) for k in
                     ("A1", "B1", "B2", "C1", "C2", "D1", "D2", "U1"))
    texts += " ".join(v.get("nameEq", []) + v.get("nameUnk", []))
    if re.search(r"\brow\b", texts):
        fails.append("(a) a diagnosis text carries the word 'row': it must name "
                     "stage, component and equation, never a row of the system")
    if "what was tried" not in " ".join(v.get("U1Text", [])):
        fails.append("(a) 'could not tell' does not list what was tried")
    if "all but absent" not in " ".join(v.get("C2Text", [])):
        fails.append("(a) probe C2: the trace-component physics is not named")
    if "notices from this solve" not in " ".join(v.get("B2Text", [])):
        fails.append("(a) probe B2: extrapolation notices are not listed as notes")
    names = v.get("nameEq", []) + v.get("nameUnk", [])
    if not all("stage" in n or "condenser" in n for n in names) or len(names) != 4:
        fails.append(f"(a) equation/unknown names do not read as stages: {names}")
    return v


def arm_a(tmp):
    for label, case, key, val in (
            ("column06 (fullMESH)", "column06_fullMESH", "distillateRate", "100.0 kmol/h"),
            ("column02 (simultaneous)", "column02_simultaneous", "distillateRate", "100.0 kmol/h")):
        c = copy_case(COL + case, tmp / ("a_" + case))
        edit(c, "system/flowsheetDict", [(key + r"\s+[0-9.]+\s*kmol/h;", key + " " + val + ";")])
        rc, out = run(c)
        if rc == 0 or "(A) the specification is physically infeasible" not in out \
                or "nothing is left for the bottoms" not in out:
            fails.append(f"(b) {label}: a distillate rate equal to the feed was not "
                         f"refused with the (A) sentence (exit {rc}):\n{out[-500:]}")


def arm_newton(tmp):
    c = copy_case(COL + "column06_fullMESH", tmp / "c06hard")
    edit(c, "system/flowsheetDict", [(r"nStages\s+15;", "nStages 50;"),
                                     (r"feedStage\s+8;", "feedStage 25;"),
                                     (r"refluxRatio\s+2\.0;", "refluxRatio 60;")])
    rc, out = run(c)
    m = re.search(r"\[diagnosis\] column 'column06' did not converge: (?:\((\w)\) )?([^\n]*)", out)
    if rc == 0 and "[diagnosis]" not in out:
        fails.append("(c) the hard 50-stage column converges now: replace the "
                     "example (a column this engine cannot yet solve), do not "
                     "delete the arm")
        return None
    if not m:
        fails.append("(c) a column that did not converge printed no [diagnosis]:\n" + out[-500:])
        return None
    if m.group(1) == "A":
        fails.append("(c) a FEASIBLE column (50 stages, R = 60) was called an "
                     "infeasible specification: " + m.group(2))
    if re.search(r"\brow \d+", out):
        fails.append("(c) a row number of the flattened system reached the log")
    block = out[out.index("[diagnosis]"):]
    block = block[:block.index("\n\n")] if "\n\n" in block else block
    if "stage" not in block and "could not tell" not in block:
        fails.append("(c) the diagnosis names no stage:\n" + block[:600])
    if "a retry from the thermodynamic profile" not in block:
        fails.append("(c) the column failed after the thermodynamic retry and the "
                     "diagnosis does not say a retry was tried:\n" + block[:600])
    return m.group(1) or "-"


def arm_converged(tmp):
    c = copy_case(COL + "column06_fullMESH", tmp / "ok")
    rc, out = run(c)
    if rc != 0 or "[diagnosis]" in out:
        fails.append(f"(d) the shipped column06 exited {rc} or printed a diagnosis")
    if "re-solved from the thermodynamic profile" in out or "[seed] thermodynamic" in out:
        fails.append("(f) a column that converges from the default seed was retried "
                     "or seeded thermodynamically: the default path must be untouched")


RETRY = "did NOT converge; it was re-solved from the thermodynamic profile"


def arm_retry(tmp):
    case = COL + "column22_wide_boiling_retry"
    # (f1) the shipped case converges BY the retry, and says so
    c = copy_case(case, tmp / "f1")
    rc, out = run(c)
    if rc != 0 or "the MESH from the default seed " + RETRY not in out or "CONVERGED in" not in out \
            or "retryHistoryStartsAt" not in out \
            or not re.search(r"Converged:\s+yes", out) or "[diagnosis]" in out:
        fails.append(f"(f) column22 was not rescued by the announced retry (exit {rc}):\n{out[-700:]}")
    # (f2) the full-MESH rung: the same column as model fullMESH on 30 stages (at 20 the retry stops at 3e-7 in 60 iterations)
    c = copy_case(case, tmp / "f2")
    edit(c, "system/flowsheetDict", [(r"(?m)^(\s*)model(\s+)simultaneous;", r"\1model\2fullMESH;"),
                                     (r"nStages\s+20;", "nStages 30;"), (r"feedStage\s+10;", "feedStage 15;")])
    rc, out = run(c)
    if rc != 0 or "(fullMESH): the full MESH seeded from the constant-molal-overflow profile " + RETRY not in out \
            or "CONVERGED in" not in out:
        fails.append(f"(f) the full-MESH rung did not rescue column22 as fullMESH (exit {rc}):\n{out[-700:]}")
    # (f3) `seed thermodynamic;` starts from the profile and never retries
    c = copy_case(case, tmp / "f3")
    edit(c, "system/flowsheetDict", [(r"operation\s*\{", "operation\n        {\n            seed thermodynamic;")])
    rc, out = run(c)
    if rc != 0 or "[seed] thermodynamic profile at P" not in out or "re-solved from the thermodynamic" in out \
            or not re.search(r"Converged:\s+yes", out):
        fails.append(f"(f) `seed thermodynamic;` did not start the column from the profile "
                     f"(exit {rc}):\n{out[-700:]}")
    # (f5) a TALL wide-boiling column (40 stages, relative volatility 270): the profile once
    #      rounded 1 - 1/(1 + exp(-lr)) to zero and seeded every stage pure heavy
    #      (559.7 K at the top too); in log space it keeps the light key at the top.
    c = copy_case(case, tmp / "f5")
    edit(c, "system/flowsheetDict", [(r"nStages\s+20;", "nStages 40;"), (r"feedStage\s+10;", "feedStage 20;")])
    rc, out = run(c)
    mt = re.search(r"stage T ([0-9.]+) K \(top\) -> ([0-9.]+) K \(bottom\)", out)
    if rc != 0 or not mt or float(mt.group(2)) - float(mt.group(1)) < 100.0 \
            or "CONVERGED in" not in out or not re.search(r"Converged:\s+yes", out):
        fails.append(f"(f) the 40-stage wide-boiling column was not rescued from a profile that "
                     f"spans its two boiling points (exit {rc}, {mt.groups() if mt else None}):\n{out[-500:]}")
    # (f4) an unknown seed word is refused by name
    c = copy_case(case, tmp / "f4")
    edit(c, "system/flowsheetDict", [(r"operation\s*\{", "operation\n        {\n            seed fancy;")])
    rc, out = run(c)
    if rc == 0 or "operation `seed` must be `default` or `thermodynamic`" not in out:
        fails.append(f"(f) an unknown `seed` word was not refused by name (exit {rc}):\n{out[-400:]}")


def arm_source():
    dc = strip_comments((SRC / "DistillationColumn.cpp").read_text())
    calls = [m.start() for m in re.finditer(r"\bdiagnoseFailure\s*\(", dc)]
    guarded = len(re.findall(
        r"(?:if\s*\(\s*!\s*resF\.converged\s*\)|else\s+if\s*\(\s*!\s*res\.converged\s*\))\s*diagnoseFailure\s*\(", dc))
    # the definition is `auto diagnoseFailure = [&](...`, not a call
    if guarded != 2:
        fails.append(f"(e) diagnoseFailure must be called exactly twice, each behind a "
                     f"not-converged test (found {guarded} guarded of {len(calls)} mentions)")
    if not re.search(r"if\s*\(\s*!\s*converged\s*\)\s*\{\s*columnDiagnosis::Layout", dc):
        fails.append("(e) the Wang-Henke diagnosis is not behind `if (!converged)`")
    # (f) the retries are behind a not-converged test, and a declared interior wins
    if not re.search(r"if\s*\(\s*!\s*res\.converged\s*&&\s*!\s*fullMeshWord\s*&&\s*retryWithThermoSeed\s*\)", dc):
        fails.append("(f) the simultaneous retry is not behind `!res.converged && !fullMeshWord && retryWithThermoSeed`")
    if not re.search(r"if\s*\(\s*!\s*resF\.converged\s*&&\s*retryWithThermoSeed\s*\)", dc):
        fails.append("(f) the full-MESH retry is not behind `!resF.converged && retryWithThermoSeed`")
    if not re.search(r"retryWithThermoSeed\s*=\s*!\s*seedThermoAsked\s*&&\s*!\s*seedDeclared\s*;", dc):
        fails.append("(f) a retry may override a declared stageProfile or repeat `seed thermodynamic;`")
    cd = strip_comments((SRC / "ColumnDiagnosis.cpp").read_text())
    ch = strip_comments((SRC / "ColumnDiagnosis.H").read_text())
    if re.search(r'#include\s+"[^"]*NewtonND\.H"', cd + ch):
        fails.append("(e) ColumnDiagnosis includes NewtonND.H: the diagnosis must "
                     "read the NDResult it is handed, not touch the solver")


def main():
    if not (BUILD / "choupoSolve").exists():
        print("check_column_diagnosis: FAILED -- no build of choupoSolve; a "
              "check that cannot run must not pass")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        arm_probe(tmp)
        arm_a(tmp)
        letter = arm_newton(tmp)
        arm_converged(tmp)
        arm_retry(tmp)
        arm_source()
    if fails:
        print("check_column_diagnosis: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_column_diagnosis: OK -- a column that does not converge names (A) an "
          "infeasible specification, (B) a stage that could not be priced, (C) a "
          "singular or ill-conditioned system with its stage, equation and physics, "
          "(D) a faulty equation, or says it could not tell and what it tried (probe "
          "holds each, no text carries a row number, extrapolation notices alone are "
          f"not a cause); a distillate equal to the feed is refused as (A); the hard "
          f"50-stage column is diagnosed ({letter}, and says a retry was tried); a converged column prints none; "
          "a wide-boiling column is rescued by the announced thermodynamic retry (simultaneous and full-MESH rungs), "
          "`seed thermodynamic;` starts from the profile, a bad `seed` word is refused.  "
          "NOT covered: the letter for a real column beyond these; an infeasibility "
          "only the equilibrium reach shows; failures before the first Newton iterate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
