#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: an unconverged seed is announced, and a Newton step that does not
improve the residual is counted, limited and never returned as the "last good
iterate" (DEV.md 4c C184 defects A and B).

    bin/curate/check_distillation_seed.py

WHY THIS EXISTS (2026-11-01).  An external review of a failed dimethyl-ether
plant named two defects; both were read in the source and reproduced here
before they were fixed (record: docs/design/an-unconverged-seed-is-announced.md):

  (A) `model fullMESH` started its rigorous Newton from the constant-molal-
      overflow (CMO) iterate on the model word alone.  A CMO phase that had
      NOT met its tolerance seeded the full MESH in silence, and the column
      reported the CMO's flag and residual whatever the full MESH did.
  (B) `newtonND`'s backtracking exhausts at alpha < minAlpha holding a FINITE
      trial that does not reduce ||F||; the iteration advanced to it anyway,
      while every stop message promised "the last good iterate".  Measured:
      residual 2 -> 50 on a jump residual, and ||F|| = 1.2e55 on column06
      seeded at 10 K.

WHAT THIS GATE CHECKS.

  (a) THE PROBE (`_newtonStallProbe.cpp`, compiled HERE against the solver
      sources alone, -D_GLIBCXX_ASSERTIONS): from x0 = 3 on a residual with a
      jump the line search exhausts; the solve must return the BEST iterate
      (x = 3, |F| = 2, never 2.99976 / 50), converged = 0, stalledSteps = 1;
      with maxStalledSteps = 0 the first stalled step stops the solve with
      the named cause; a well-posed problem is untouched.
  (b) AN UNCONVERGED CMO SEED, end to end.  A copy of column06_fullMESH with
      a DECLARED interior at 10 K on every stage (a declared profile that does
      not satisfy the balances is a SEED, never an answer) leaves the CMO
      phase unconverged; the run must print the announcement naming the stage
      count, the iterations and |F|, exit non-zero, and publish the FULL
      MESH's residual (not the CMO's).  The shipped column06 must print no
      such announcement and converge.
  (c) THE CORPUS THROUGH A STALLED STEP.  acetone06_luyben_column_C1 converges
      through floor-damped steps (2 of 15 iterations when measured 2026-11-01):
      it must still converge and, if it takes any, SAY how many; a strict
      default would have turned it into a failure, which is why the allowance
      exists.  SINCE C245 SLICE 2 (2026-11-08) the simultaneous MESH takes the
      bounded Armijo contract, whose Levenberg-Marquardt fallback replaces the
      floor-damped step: acetone06 converges in 18 iterations with NONE.  The
      arm now holds the invariant that survives -- converged, and any
      floor-damped step taken is announced (a step taken silently fails; zero
      steps is reported as zero) -- and the stalled-step mechanism itself
      stays held by arm (a), whose probe runs the legacy search.
  (d) SOURCE.  The full-MESH block tests `!res.converged` before it seeds and
      does not combine the seed's flag with `&&`; newtonND tests
      `!(normFNew < normF)` before advancing and returns the best iterate on
      every unconverged exit.

NOT COVERED, stated so the green line cannot imply it: whether a CMO-failed
seed that the full MESH then CONVERTS exists in the corpus (none was found
in about sixty perturbed variants of column03/06 and acetone06 -- the CMO
phase is robust); the singular-Jacobian diagnostic naming a stage and an
equation (C184 P0, not built); the default allowance of 25 floor-damped steps
(it is a bound, not a theorem).

SABOTAGE-VERIFIED 2026-11-01, by hand, each restored (and touched) before the
next; observed output is in the design record.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROBE = ROOT / "bin" / "curate" / "_newtonStallProbe.cpp"
SOURCES = ["src/solver/NewtonND.cpp", "src/solver/LU.cpp",
           "src/solver/BlockTridiagonal.cpp"]
COL = "tutorials/steady/distillation/"
fails = []


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def copy_case(rel, dst):
    shutil.copytree(ROOT / rel, dst, symlinks=True, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "latest", "latest.txt", "converged", "*.log",
        "reports"))
    return dst


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BUILD / "choupoSolve"), "."], cwd=case,
                       capture_output=True, text=True, timeout=900, env=env)
    return p.returncode, p.stdout + p.stderr


def arm_probe(tmp):
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        fails.append("(a) no C++ compiler: the probe cannot run -- a check "
                     "that cannot run must not pass")
        return {}
    exe = tmp / "probe"
    r = subprocess.run([cxx, "-std=c++17", "-O1", "-D_GLIBCXX_ASSERTIONS",
                        "-I", str(ROOT / "src"), str(PROBE)]
                       + [str(ROOT / s) for s in SOURCES] + ["-o", str(exe)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("(a) the probe does not compile:\n" + r.stderr[-2000:])
        return {}
    p = subprocess.run([str(exe)], capture_output=True, text=True, timeout=300)
    if p.returncode != 0 or "probeDone 1" not in p.stdout:
        fails.append(f"(a) the probe exited {p.returncode} before finishing:"
                     f"\n{p.stdout[-800:]}\n{p.stderr[-800:]}")
        return {}
    v = {}
    for line in p.stdout.splitlines():
        k, _, rest = line.partition(" ")
        v[k] = rest

    def num(k):
        try:
            return float(v[k].split()[0])
        except (KeyError, ValueError, IndexError):
            fails.append(f"(a) the probe did not print {k}")
            return float("nan")

    if not (abs(num("stallX") - 3.0) < 1e-12 and abs(num("stallResidual") - 2.0) < 1e-12):
        fails.append(f"(a) the stalled solve returned x = {v.get('stallX')}, "
                     f"|F| = {v.get('stallResidual')} -- not the BEST iterate "
                     "(x = 3, |F| = 2): the uphill step was handed back as "
                     "the last good iterate")
    if num("stallConverged") != 0 or num("stallCount") != 1:
        fails.append(f"(a) stalled solve: converged {v.get('stallConverged')},"
                     f" stalledSteps {v.get('stallCount')} (expected 0 and 1)")
    if (num("strictConverged") != 0 or num("strictCount") != 1
            or abs(num("strictX") - 3.0) > 1e-12
            or "no step that reduces the residual" not in v.get("strictReason", "")
            or "allowance of 0" not in v.get("strictReason", "")):
        fails.append("(a) maxStalledSteps 0 did not stop at the first stalled "
                     f"step with the named cause: {v.get('strictReason')!r}, "
                     f"x = {v.get('strictX')}, count {v.get('strictCount')}")
    if num("sqrtConverged") != 1 or num("sqrtErr") > 1e-9:
        fails.append("(a) a well-posed problem (x^2 = 2) was disturbed")
    return v


def arm_seed(tmp):
    # shipped column06: no announcement, converges
    ok = copy_case(COL + "column06_fullMESH", tmp / "ok")
    rc, out = run(ok)
    if rc != 0 or "seeds the full MESH" in out:
        fails.append(f"(b) the shipped column06 exited {rc} or announced an "
                     "unconverged seed it does not have")
    # garbage declared interior
    bad = copy_case(COL + "column06_fullMESH", tmp / "bad")
    src = (ROOT / COL / "column16_declared_interior/0/internalStates/column16"
           ).read_text().replace("column16", "column06")

    def fix_t(m):
        n = len(m.group(2).split())
        return m.group(1) + "(\n" + " ".join(["10"] * n) + "\n        );"
    src = re.sub(r"(\n        T\n        )\((.*?)\);", fix_t, src, count=1,
                 flags=re.S)
    (bad / "0" / "internalStates").mkdir(parents=True, exist_ok=True)
    (bad / "0" / "internalStates" / "column06").write_text(src)
    rc, out = run(bad)
    m = re.search(r"phase that seeds the full MESH did NOT converge \((\d+) "
                  r"stages, (\d+) iterations, \|F\| = ([0-9.e+-]+) against "
                  r"1e-9\)", out)
    if not m or m.group(1) != "15":
        fails.append("(b) a CMO phase that did not converge seeded the full "
                     "MESH without the announcement (stage count, "
                     f"iterations, |F|):\n{out[-600:]}")
        return None
    if "ANNOUNCED seed" not in out:
        fails.append("(b) the announcement does not say it is an ANNOUNCED seed")
    if rc == 0:
        fails.append("(b) the garbage-seeded column exited 0")
    fm = re.search(r"full-MESH \(Naphtali-Sandholm\): NOT converged in \d+ "
                   r"iters, \|\|F\|\| = ([0-9.e+-]+)", out)
    cv = re.search(r"Converged:\s+NO\s+Newton iters: \d+\s+\|\|F\|\| = "
                   r"([0-9.e+-]+)", out)
    if not fm or not cv or abs(float(fm.group(1)) - float(cv.group(1))) > 1e-3 * float(fm.group(1)):
        fails.append("(b) the published residual is not the full MESH's own "
                     f"(full MESH {fm and fm.group(1)}, published "
                     f"{cv and cv.group(1)})")
    return m.groups()


def arm_corpus(tmp):
    case = copy_case(COL + "acetone06_luyben_column_C1", tmp / "a06")
    rc, out = run(case)
    m = re.search(r"MESH: (\d+) floor-damped line-search step", out)
    if rc != 0 or "Converged:   yes" not in out:
        fails.append(f"(c) acetone06 no longer converges (exit {rc})")
    if m:
        return int(m.group(1))
    if "floor-damped" in out:
        fails.append("(c) acetone06 mentions floor-damped steps but the "
                     "announcement does not carry the count")
        return None
    return 0     # the Armijo contract took none; nothing to announce


def arm_source():
    dc = strip_comments((ROOT / "src/unitOperations/distillation/"
                         "DistillationColumn.cpp").read_text())
    if not re.search(r"cmoSeedFailed\s*=\s*!\s*res\.converged", dc):
        fails.append("(d) the full-MESH block does not read res.converged "
                     "before seeding from the CMO iterate")
    if re.search(r"res\.converged\s*=\s*res\.converged\s*&&\s*resF", dc):
        fails.append("(d) the seed's flag is combined with the full MESH's")
    if not re.search(r"if\s*\(\s*cmoSeedFailed\s*\)\s*\{\s*res\.converged\s*=\s*"
                     r"resF\.converged", dc):
        fails.append("(d) the verdict after a failed seed is not the full "
                     "MESH's own")
    nd = strip_comments((ROOT / "src/solver/NewtonND.cpp").read_text())
    i = nd.find("opts.backtracking && !(normFNew < normF)")
    j = nd.find("x = std::move(xNew)")
    if i < 0 or j < 0 or i > j:
        fails.append("(d) newtonND does not test for a non-improving trial "
                     "before advancing to it")
    bad = len(re.findall(r"return finish\(\{x, Fx, normF, it, false", nd))
    good = len(re.findall(r"restoreBest\(\);", nd))
    if bad < 3 or good < bad:
        fails.append(f"(d) {bad} unconverged exits, {good} restoreBest calls: "
                     "an unconverged exit may return a worse iterate than the "
                     "best seen")


def main():
    if not (BUILD / "choupoSolve").exists():
        print("check_distillation_seed: FAILED -- no build of choupoSolve; a "
              "check that cannot run must not pass")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        v = arm_probe(tmp)
        seed = arm_seed(tmp)
        n06 = arm_corpus(tmp)
        arm_source()
    if fails:
        print("check_distillation_seed: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_distillation_seed: OK -- a Newton step no trial improves is "
          "counted and limited and the BEST iterate is returned (probe: "
          f"x = {v['stallX']}, |F| = {v['stallResidual']}, not the uphill "
          f"2.99976 / 50; strict mode stops at the first); a CMO phase that "
          f"did not converge ({seed[0]} stages, {seed[1]} iterations, |F| = "
          f"{seed[2]}) seeds the full MESH only as an ANNOUNCED seed and the "
          f"verdict is the full MESH's own; acetone06 still converges through "
          f"{n06} floor-damped step(s) (all announced; 0 under the Armijo contract).  NOT covered: a seed the "
          "full MESH converts (none found in the corpus), the singular-"
          "Jacobian stage/equation diagnostic (C184 P0), the allowance's "
          "default of 25.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
