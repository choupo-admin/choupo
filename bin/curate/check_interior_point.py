#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the interior-point optimizer solves the Hock-Schittkowski set, ends an infeasible problem as "locally infeasible", and keeps its safeguards.

    bin/curate/check_interior_point.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  A primal-dual interior-point code has
four safeguards, and the defect of each is silent: (i) the FRACTION TO THE
BOUNDARY keeps x and z strictly inside their bounds -- without it an iterate
reaches a bound, a logarithm is evaluated at zero or a negative number, and the
run ends in NaN or, worse, in a point that satisfies the stopping test with a
garbage multiplier; (ii) ALGORITHM IC (the inertia correction) makes the
Newton step a descent direction when the Lagrangian Hessian is indefinite --
without it the run takes ascent steps and stalls or converges to a stationary
point that is not a minimiser, exit 0; (iii) the RESTORATION PHASE recovers
from a point where no step is acceptable -- without it the run stops short of a
solution a feasible path leads to; (iv) the LOCAL-INFEASIBILITY VERDICT turns a
problem with no feasible point into the words "locally infeasible" -- without
it such a problem is reported "converged" (the multipliers blow up and the
residual test passes on a scaled problem) or runs to the iteration limit, and a
process model with inconsistent specifications looks like a slow solve.  A
golden pins what a run PRINTS, and the iterates of each wrong run are as smooth
as those of a right one; the only place the defect is visible is a problem
whose answer is known, which is what this gate solves (design record
docs/design/interior-point.md sec. 4.1, review R3).

WHAT THIS GATE CHECKS (test/interior_point_hs.cpp, built here against
src/solver/ip/*.cpp in a mkdtemp; nothing is written in the tree).  Every
line of its output is read; a FAIL, a missing "INTERIOR_POINT_OK" or a count
of rows below the expected fails the gate.

  (a) the hand derivatives of each problem (gradient, Jacobian, and the
      analytic Hessian where there is one) equal central differences;
  (b) each of the fifteen Hock-Schittkowski problems HS1, 6, 7, 13, 21, 35,
      38, 40, 43, 71, 76, 100, 113, 116, 118 converges from the collection's
      start with |f - f*| <= 1e-6 max(1, |f*|) and a constraint and bound
      violation <= 1e-8, in an iteration count within a band of its pin;
  (c) the two infeasible problems of review R3 -- two inconsistent linear
      equalities, and a bound against an equality -- end "locally infeasible"
      naming the violated rows, never "converged" and never at the iteration
      limit;
  (d) Algorithm IC treats a factorisation BREAKDOWN as zero eigenvalues
      (dc > 0), never uses a step whose solve has a backward error above the
      limit, raises dw on an indefinite reduced Hessian, ends in IC-6 (no
      step, no crash) on a matrix holding NaN, and keeps dc > 0 after a
      singular first iteration.

KNOWN RED ROWS (2026-11-25, not loosened): HS13 and HS116 do not meet (b) -- see
the test's header and the slice report.  HS13: its optimum is a cusp with no KKT
point, so f* is reachable only to about 2 v^(1/3) = 4.3e-3 at v = 1e-8.  HS116:
the run is feasible and 9.0e-4 BELOW the collection's f*.  The gate says so and
fails on them until the architect rules.

SABOTAGE-VERIFIED 2026-11-25 (by hand, in the source, restored; before/after
in the slice report):
  (i)   fraction to the boundary removed (alpha_max = 1) -- see the report.
  (ii)  Algorithm IC disabled (dw = dc = 0 always) -- see the report.
  (iii) restoration replaced by a stop -- see the report.
  (r3)  the "locally infeasible" exit test sabotaged -- see the report.
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

HS_NAMES = ["HS1", "HS6", "HS7", "HS13", "HS21", "HS35", "HS38", "HS40", "HS43", "HS71",
            "HS76", "HS100", "HS113", "HS116", "HS118"]


def main():
    failures, notes = [], []
    root = gatekit.repo
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        failures.append("no C++ compiler to build test/interior_point_hs.cpp")
        return gatekit.verdict("check_interior_point", failures, "")
    work = Path(tempfile.mkdtemp(prefix="interior_point_"))
    try:
        exe = work / "interior_point_hs"
        sources = sorted(str(p) for p in (root / "src/solver/ip").glob("*.cpp"))
        r = subprocess.run([cxx, "-std=c++17", "-O2", "-Wall", "-Wextra", "-I", str(root / "src"),
                            str(root / "test/interior_point_hs.cpp"), *sources, "-o", str(exe)],
                           capture_output=True, text=True, timeout=900)
        if r.returncode != 0:
            failures.append("test/interior_point_hs.cpp did not compile: " + r.stderr[-800:])
            return gatekit.verdict("check_interior_point", failures, "")
        r = subprocess.run([str(exe)], capture_output=True, text=True, timeout=900)
        out = r.stdout
        lines = out.splitlines()

        deriv = [ln for ln in lines if "derivatives vs central differences" in ln]
        hs = {ln.split()[0]: ln for ln in lines if re.match(r"^HS\d+\s+f\* ", ln)}
        inf = [ln for ln in lines if re.match(r"^INF\d", ln) and "status" in ln]
        ic = [ln for ln in lines if ln.startswith("IC ")]

        if len(deriv) < 17 or any(not ln.rstrip().endswith("ok") for ln in deriv):
            failures.append(f"derivative checks: {len(deriv)} rows (expected 17) or one failed:\n"
                            + "\n".join(ln for ln in deriv if not ln.rstrip().endswith("ok")))
        missing = [n for n in HS_NAMES if n not in hs]
        if missing:
            failures.append("HS rows missing: " + ", ".join(missing))
        bad = [hs[n] for n in HS_NAMES if n in hs and not hs[n].rstrip().endswith("PASS")]
        if bad:
            failures.append("HS problems that do not meet the PASS rule (|f - f*| <= 1e-6 max(1,|f*|), "
                            "violation <= 1e-8, iterations in band):\n" + "\n".join(bad))
        if len(inf) != 2 or any(not ln.rstrip().endswith("PASS") or "locally infeasible" not in ln for ln in inf):
            failures.append("the two infeasible problems must end 'locally infeasible' naming their rows:\n"
                            + "\n".join(inf))
        if len(ic) < 6 or any(not ln.rstrip().endswith("ok") for ln in ic):
            failures.append(f"Algorithm IC rows: {len(ic)} (expected 6) or one failed:\n"
                            + "\n".join(ln for ln in ic if not ln.rstrip().endswith("ok")))
        if r.returncode != 0 and not failures:
            failures.append("the test exited non-zero:\n" + out[-1500:])
        if not failures and "INTERIOR_POINT_OK" not in out:
            failures.append("no INTERIOR_POINT_OK line:\n" + out[-800:])

        passed = [n for n in HS_NAMES if n in hs and hs[n].rstrip().endswith("PASS")]
        its = [int(m.group(1)) for n in passed for m in [re.search(r"\bit\s+(\d+)\s", hs[n])] if m]
        notes.append(f"{len(passed)} of {len(HS_NAMES)} HS problems to 1e-6 (iterations {min(its) if its else 0}-{max(its) if its else 0}), "
                     f"{len(inf)} infeasible problems ended locally infeasible, {len(ic)} inertia-correction checks, "
                     f"{len(deriv)} derivative checks")
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return gatekit.verdict("check_interior_point", failures, "; ".join(notes))


if __name__ == "__main__":
    sys.exit(main())
