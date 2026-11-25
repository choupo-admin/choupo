#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the noise-aware SQP (fdMode auto) never evaluates outside its box, never certifies on a stale or unmeasured gradient, never prints a bar it cannot defend, and the default SQP is unchanged.

    bin/curate/check_sqp_adaptive.py

THE REAL DEFECTS THIS WOULD HAVE CAUGHT (the Opus review of C496,
docs/audits/2026-11-24-c496-opus-review.md; eighteen of the twenty arms were
RED on the code that was about to land):
  * a step estimated at x = 0 and reused at x = 0.575 certified "KKT conditions
    satisfied" on a function whose gradient there is -0.5 (the certificate was
    taken on a gradient never re-estimated at the point, with a bound of 0.19
    against a tolerance of 1e-5);
  * a jump of 1.0 and a smooth sin(1500 x) were reported as noise levels of
    0.22 and 0.035, and one failed stencil point became the "1e-14 floor", so
    every later step and bar was built on a number that was not measured;
  * the printed multiplier bar was 7000 times too small on a noisy constraint,
    was that of another estimator (least squares, not the QP's B-weighted
    one), carried an absolute ridge, printed 0 +- 0 for an inactive row;
  * a step reused at a later iterate evaluated x = 1.0000002 outside [0, 1],
    and optim05's T_feed 367.5 K against a declared 352.5 K (past a cliff);
  * the robust QP called feasible problems INFEASIBLE (a step discarded below
    1e-9 and judged on its row; rows 1e-6 apart in angle dropped as dependent)
    and the SQP stopped "LOCAL INFEASIBILITY" on them.
And three more from the second review (docs/audits/2026-11-25-c496-opus-review-2.md),
each CONVERGED with a small bar at a true gradient 79 to 1458 times tolStat: one global
tolerance scale that a variable on a bound with slope 1e5 gave to every other variable;
a step allowance against ||x||inf with a QP step-bound row counted as a bound active at
x; a gradient taken at a step that aliased a smooth ripple (never confirmed at a second
step); and an unresolved multiplier that scaled the tolerances (HS13).
A golden pins what a run prints, and each of these printed smoothly.

WHAT IT CHECKS.  test/sqp_adaptive_check.cpp is built here against
src/solver/*.cpp in a mkdtemp (nothing is written in the tree) and run: every
arm must print PASS and the run must end ALL PASS (the arms are the review's
failing inputs, the four invariants -- no evaluation outside the declared box
in ANY arm; a CONVERGED verdict only with the gradient re-estimated at the point
and a bar below the tolerance; a bar that cannot be defended is NaN, never a
number; and the default path -- and test/sqp_default_path.cpp, the default
SQP and QP on eight problems printed at 17 digits every iteration, is compared
to bin/curate/sqp_default_path.expected (numbers to 1e-9 relative: the file was
recorded byte-identical to the base on the recording platform)).
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

SCAN_ROOTS = ("src/solver/SQP.cpp", "src/solver/SQP.H", "src/solver/ActiveSetQP.cpp",
              "src/solver/ActiveSetQP.H", "test/sqp_adaptive_check.cpp",
              "test/sqp_default_path.cpp", "bin/curate/sqp_default_path.expected")

MIN_ARMS = 25
SOURCES = ["SQP.cpp", "ActiveSetQP.cpp", "NewtonND.cpp", "LU.cpp", "BlockTridiagonal.cpp"]
NUM = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|nan|inf")


def same(a, b):
    """Two output lines equal, numbers to 1e-9 relative."""
    ta, tb = NUM.split(a), NUM.split(b)
    na, nb = NUM.findall(a), NUM.findall(b)
    if ta != tb or len(na) != len(nb):
        return False
    for x, y in zip(na, nb):
        if x == y:
            continue
        try:
            fx, fy = float(x), float(y)
        except ValueError:
            return False
        if abs(fx - fy) > 1e-9 * max(1.0, abs(fx), abs(fy)):
            return False
    return True


def main():
    failures, notes = [], []
    root = gatekit.repo
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        return gatekit.verdict("check_sqp_adaptive", ["no C++ compiler"], "")
    work = Path(tempfile.mkdtemp(prefix="sqp_adaptive_"))
    try:
        srcs = [str(root / "src/solver" / s) for s in SOURCES]
        for test in ("sqp_adaptive_check", "sqp_default_path"):
            r = subprocess.run([cxx, "-std=c++17", "-O1", "-Wall", "-Wextra", "-I", str(root / "src"),
                                str(root / "test" / (test + ".cpp")), *srcs, "-o", str(work / test)],
                               capture_output=True, text=True, timeout=900)
            if r.returncode != 0:
                failures.append(f"test/{test}.cpp did not compile: " + r.stderr[-800:])
                return gatekit.verdict("check_sqp_adaptive", failures, "")
        r = subprocess.run([str(work / "sqp_adaptive_check")], capture_output=True, text=True, timeout=1200)
        lines = r.stdout.splitlines()
        passed = [ln for ln in lines if ln.startswith("PASS ")]
        failed = [ln for ln in lines if ln.startswith("FAIL ")]
        if failed:
            failures.append("arms that FAIL:\n" + "\n".join(ln[:300] for ln in failed))
        if len(passed) < MIN_ARMS:
            failures.append(f"{len(passed)} arms passed, expected at least {MIN_ARMS}")
        if not failed and "ALL PASS" not in r.stdout:
            failures.append("no ALL PASS line:\n" + r.stdout[-600:])
        r2 = subprocess.run([str(work / "sqp_default_path")], capture_output=True, text=True, timeout=600)
        got = r2.stdout.splitlines()
        exp = (root / "bin/curate/sqp_default_path.expected").read_text().splitlines()
        if len(got) != len(exp):
            failures.append(f"the default path printed {len(got)} lines, the pinned file has {len(exp)}")
        else:
            bad = [(i + 1, e, g) for i, (e, g) in enumerate(zip(exp, got)) if not same(e, g)]
            if bad:
                i, e, g = bad[0]
                failures.append(f"the DEFAULT SQP changed ({len(bad)} lines differ); first, line {i}:\n  pinned: {e[:300]}\n  got:    {g[:300]}")
        notes.append(f"{len(passed)} arms PASS (the review's failing inputs and the four invariants); "
                     f"default path {len(got)} lines equal the pinned base output")
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return gatekit.verdict("check_sqp_adaptive", failures, "; ".join(notes))


if __name__ == "__main__":
    sys.exit(main())
