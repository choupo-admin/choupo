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
problem with no feasible point (or a local minimum of the violation) into the words "locally infeasible" -- without
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
      violation <= 1e-8, in an iteration count within a band of its pin, and NO
      evaluation of f, its gradient, the constraints or their Jacobian is made
      outside the variable bounds (the start is evaluated clamped to them).
      HS13 has its own rule and HS116 its own reference, below.  Added rows:
      HS100p1 and HS100p2 (HS100 from two seeded perturbations of its start --
      the only rows that hold the filter's corner (22), sabotage iv; held by
      their OUTCOME, converged, with no iteration pin: their chaotic starts
      may move the count on another libm);
      WB2000 (Wachter & Biegler 2000, from a start I CHOSE, (-3, 3, 0.01), so
      that the run enters the restoration phase and recovers -- the witness of
      the restoration sabotage; the HS set itself never enters it); WB2000c, the
      SAME problem from the paper's own start (-2, 3, 1), whose expected
      outcome is the known behaviour of this method there: "locally infeasible"
      at x = (-1, 0, 0), a local minimum of ||c||_1 = 1.5 (not a claim that the
      problem is infeasible); FDHESS (a problem with no analytic Hessian
      whose objective is undefined below its bound: the finite-difference
      Hessian is clamped to the bounds); EVALFAIL (a start that cannot be
      evaluated ends "evaluation failed" with a defined x, run once under
      -D_GLIBCXX_ASSERTIONS by hand);
  HS13 -- THE RULE AND ITS TRUE REASON.  Its optimum (1, 0) is a cusp with NO
      KKT point; this method accepts an equality residual up to tol on g - s = 0
      and uses it, and since the constraint is a cube a residual v lets x1 reach
      1 + v^(1/3): f reaches the floor (1 - v^(1/3))^2, 4.3e-3 below f* at
      v = 1e-8.  The rule is computed from the run's OWN violation v (a run with
      v = 0 must give f >= 1 - 1e-6).  (An earlier justification, "no solver
      can meet |df| <= 1e-6 at v <= 1e-8", was false: x = (1, 0) meets it.)
  HS116 -- THE REFERENCE IS 97.5875096, NOT THE COLLECTION'S 97.5884089805.
      Independent review (2026-11-25): the transcription agrees term by term
      with Schittkowski's PROB.FOR (TP116, LEX = .FALSE.: the collection's own
      flag that the listed solution is not exact), CUTEst HS116.SIF,
      Vanderbei's hs116.mod, JSO's hs116.jl and TEST.TEX.  The published x* in
      this transcription gives f = 97.5884089807 with all eleven active rows
      INSIDE by 2.29e-7..2.39e-7; scipy SLSQP and trust-constr from the
      published x* give 97.5875096 / 97.5875097, feasible to 1e-11; first
      order with the run's multipliers: 3790 x 2.309e-7 + 2.4e-5 (x4 bound)
      = 8.99e-4 = the gap.  A second stationary point is at 97.59103; x3 and x6
      are not unique, so f is pinned, never x.
  (c) the two infeasible problems of review R3 -- two inconsistent linear
      equalities, and a bound against an equality -- end "locally infeasible"
      naming the violated rows, never "converged" and never at the iteration
      limit;
  (d) Algorithm IC treats a factorisation BREAKDOWN as zero eigenvalues
      (dc > 0), never uses a step whose solve has a backward error above the
      limit, raises dw on an indefinite reduced Hessian, ends in IC-6 (no
      step, no crash) on a matrix holding NaN, and keeps dc > 0 after a
      singular first iteration.

TWO PROBLEMS HAVE THEIR OWN RULE (2026-11-25, stated in the test and in the
Theory Guide).  HS13: its optimum is a cusp with no KKT point and a cubic
constraint, so |f - f*| <= 1e-6 at violation 1e-8 is unreachable by ANY solver
(f is within 2 v^(1/3) = 4.3e-3 of f*); the rule is the one the violation
implies.  HS116: the run is feasible and 9.0e-4 below the collection's f*
(relative 9.2e-6; multipliers ~1e3, so a 8.5e-7 feasibility margin explains
it); the rule is one-sided, f in [f* (1 - 1e-5), f* (1 + 1e-6)].

SABOTAGE-VERIFIED 2026-11-25 (by hand, in the source, restored; outputs in the
slice report):
  (i)   fraction to the boundary removed (alpha_max and alpha_z = 1): the line
        search's own rejection of a trial with an undefined log HIDES it from
        the objective, so the test counts every evaluation (f, gradient,
        constraints, Jacobian) outside the variable bounds -- FAILS (b).
  (ii)  Algorithm IC's inertia test removed: HS7 converges to f = +1.78,
        HS6 / HS38 / HS13 stop in the restoration phase, the indefinite-Hessian
        case reports inertia (1,2,0) -- FAILS (b), (d).  (HS40 needs no
        regularisation and is NOT a witness for this sabotage.)
  (iii) restoration replaced by a stop: WB2000 ends "restoration failed" and
        both infeasible problems end so, not "locally infeasible" -- FAILS.
  (iv)  the filter corner (22) computed from f instead of phi_mu in both
        augment calls: every HS row and WB2000 are unchanged, but HS100p1 and
        HS100p2 end "restoration failed" (14 and 21 iterations against 25 and
        38) -- FAILS (b).  Only these two rows hold that line.
  (r3)  the "locally infeasible" exit test of the restoration phase never
        fires: both infeasible problems and WB2000c run to the iteration limit
        -- FAILS (c) and (b).
  (r3b) the primal infeasibility removed from the stopping test: the
        two-equalities problem reports "converged" and HS6 returns with a
        violation of 1.7e-2 -- FAILS (c) and (b).
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

#  The one walk below compiles every translation unit of the interior point
#  beside the test; the gate therefore reaches src/solver/ip/ and the test.
SCAN_ROOTS = ("src/solver/ip/*.cpp", "src/solver/ip/*.H", "test/interior_point_hs.cpp")

HS_NAMES = ["HS1", "HS6", "HS7", "HS13", "HS21", "HS35", "HS38", "HS40", "HS43", "HS71",
            "HS76", "HS100", "HS100p1", "HS100p2", "HS113", "HS116", "HS118", "WB2000", "WB2000c",
            "FDHESS", "EVALFAIL"]


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
        hs = {ln.split()[0]: ln for ln in lines if re.match(r"^(HS\d+\w*|WB2000c?|FDHESS|EVALFAIL)\s+(f\*|expected) ", ln)}
        inf = [ln for ln in lines if re.match(r"^INF\d", ln) and "status" in ln]
        ic = [ln for ln in lines if ln.startswith("IC ")]

        if len(deriv) < 22 or any(not ln.rstrip().endswith("ok") for ln in deriv):
            failures.append(f"derivative checks: {len(deriv)} rows (expected 22) or one failed:\n"
                            + "\n".join(ln for ln in deriv if not ln.rstrip().endswith("ok")))
        missing = [n for n in HS_NAMES if n not in hs]
        if missing:
            failures.append("HS rows missing: " + ", ".join(missing))
        if "WB2000c" in hs and "locally infeasible" not in hs["WB2000c"].split("status", 1)[-1]:
            failures.append("WB2000c (the paper's own start) must end locally infeasible:\n" + hs["WB2000c"])
        if "WB2000" in hs and not re.search(r"\bresto\s+[1-9]", hs["WB2000"]):
            failures.append("WB2000 must ENTER the restoration phase and still converge (it is the witness that "
                            "holds the restoration phase):\n" + hs["WB2000"])
        bad = [hs[n] for n in HS_NAMES if n in hs and not hs[n].rstrip().endswith("PASS")]
        if bad:
            failures.append("rows that do not meet their rule (|f - f*| <= 1e-6 max(1,|f*|), "
                            "violation <= 1e-8, iterations in band, no evaluation outside the bounds):\n" + "\n".join(bad))
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
