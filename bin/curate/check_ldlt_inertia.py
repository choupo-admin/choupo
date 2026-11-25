#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the dense LDL^T of the interior-point optimizer counts the inertia right, and says how well it solved.

    bin/curate/check_ldlt_inertia.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  An interior-point step is a descent
direction only when the KKT matrix [[W + Sigma, A], [A^T, 0]] has inertia
(n, m, 0) -- n positive eigenvalues, m negative, none zero (Waechter & Biegler
2006, Algorithm IC).  The optimizer reads that count from the factorisation of
the matrix; if the count is WRONG -- a 2x2 pivot block counted as two positive
eigenvalues when it holds one of each, a zero eigenvalue passed over, a pivot
order that breaks down on a zero diagonal -- the optimizer takes an ASCENT
direction as a descent step, or skips the inertia correction it needed, and the
run stalls or converges to a stationary point that is not a minimiser, with no
error message and exit 0.  Nothing downstream can see it: a golden pins what a
run prints, and the iterates of a wrong run are as smooth as those of a right
one.  The only place the defect is visible is a matrix whose inertia is known
by construction, which is what this gate factors.

WHAT THIS GATE CHECKS (test/ldlt_inertia.cpp, built here against
src/solver/ip/DenseLDLT.cpp in a mkdtemp; nothing is written in the tree).
Every line of its output is read; a FAIL, a BREAKDOWN on a matrix that has
none, or a missing "LDLT_INERTIA_OK" fails the gate.

  (a) the inertia (n_pos, n_neg, n_zero) equals the one known by construction
      on: a diagonal of mixed signs; [[0,1],[1,0]] (no 1x1 pivot exists, a 2x2
      block must be taken); singular matrices (the zero count: [[1,1],[1,1]],
      diag(1,0,-1), a congruence with two zero eigenvalues); the KKT matrices
      of equality-constrained QPs (the HS76 Hessian with its two active rows:
      (4,2,0); H indefinite on the null space of A^T: the WRONG inertia, which
      the count must report as wrong); S diag(signs) S^T for n = 10, 40, 100
      (Sylvester's law: the inertia is that of the signs); and badly scaled
      congruences over 4 and 6 decades.
  (b) the NORMWISE BACKWARD ERROR of the solve, eta = |b - K x|_inf /
      (|K|_inf |x|_inf + |b|_inf) on the unscaled K, is at most 1e-12 after
      refinement on every non-singular matrix (measured at most 2.8e-16).
  (c) REFINEMENT AND THE ACCEPTANCE LIMIT (review R4).  A Bunch-Kaufman solve is
      already backward stable, so on honest matrices refinement has nothing
      to lower (measured over 4e5 random matrices up to nine decades: worst eta
      4e-13 before refinement, and refinement lowered it by a few percent at most).  What refinement is
      for is an INEXACT factorisation; the test stands one in (the true factors
      with every solution component off by a relative eps): eps = 1e-7 gives
      eta 2.6e-8 before and 5e-17 after two steps, ACCEPTED, and refinement
      removed leaves it above the limit -- the gate fails; eps = 0.3 is still
      above 1e-12 after two steps and is REJECTED, which is what Algorithm IC
      does with a factorisation whose eta exceeds kBackwardErrorLimit (the rule
      SparseLU.H:76-78 states and Rosenbrock23.cpp:787-795 applies).

SABOTAGE-VERIFIED 2026-11-25 (by hand, in the source, restored; outputs in the
slice report):
  (s1) a 2x2 block counted as two positive eigenvalues: [[0,1],[1,0]] reports
       (2,0,0) and the HS76 and congruence rows move -- FAILS (a).
  (s2) alpha = 0, so no 2x2 pivot is ever taken: the zero diagonal of
       [[0,1],[1,0]] is a BREAKDOWN -- FAILS (a).
  (s3) iterative refinement removed: the inexact-factorisation row at eps = 1e-7
       stays at eta 2.6e-8, above the limit, and is REJECTED where it must be
       accepted -- FAILS (c).  (It does NOT fail on the honest matrices, whose
       eta is below 1e-15 before any refinement: the gate does not claim to
       hold refinement there.)
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

ETA_MAX = 1e-12


def main():
    failures, notes = [], []
    root = gatekit.repo
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        failures.append("no C++ compiler to build test/ldlt_inertia.cpp")
        return gatekit.verdict("check_ldlt_inertia", failures, "")
    work = Path(tempfile.mkdtemp(prefix="ldlt_inertia_"))
    try:
        exe = work / "ldlt_inertia"
        r = subprocess.run([cxx, "-std=c++17", "-O2", "-Wall", "-Wextra", "-I", str(root / "src"),
                            str(root / "test/ldlt_inertia.cpp"),
                            str(root / "src/solver/ip/DenseLDLT.cpp"), "-o", str(exe)],
                           capture_output=True, text=True, timeout=600)
        if r.returncode != 0:
            failures.append("test/ldlt_inertia.cpp did not compile: " + r.stderr[-600:])
            return gatekit.verdict("check_ldlt_inertia", failures, "")
        r = subprocess.run([str(exe)], capture_output=True, text=True, timeout=600)
        out = r.stdout
        rows = [ln for ln in out.splitlines() if ln.rstrip().endswith(("ok", "FAIL"))]
        if r.returncode != 0 or "LDLT_INERTIA_OK" not in out or any(ln.rstrip().endswith("FAIL") for ln in rows):
            failures.append("DenseLDLT reports a wrong inertia or a backward error above "
                            f"{ETA_MAX:g}:\n" + out[-2500:])
        else:
            inert = [ln for ln in rows if "expected" in ln]
            etas = [float(m.group(1)) for ln in inert
                    for m in [re.search(r"after (\S+) \(", ln)] if m]
            ref = [ln for ln in rows if "inexact factors" in ln]
            if len(inert) < 12 or len(ref) != 2:
                failures.append(f"the test printed {len(inert)} inertia rows and {len(ref)} refinement rows "
                                "(expected at least 12 and 2): a case was dropped")
            else:
                worst = max(etas) if etas else 0.0
                if worst > ETA_MAX:
                    failures.append(f"worst backward error {worst:.2e} above {ETA_MAX:g}")
                m = re.search(r"eps 1e-07: eta before (\S+) after (\S+)", ref[0])
                notes.append(f"{len(inert)} matrices of known inertia exact, worst eta {worst:.1e}; "
                             f"refinement of an inexact factorisation {m.group(1)} -> {m.group(2)} accepted, "
                             "eps 0.3 rejected" if m else "refinement rows present")
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return gatekit.verdict("check_ldlt_inertia", failures, "; ".join(notes))


if __name__ == "__main__":
    sys.exit(main())
