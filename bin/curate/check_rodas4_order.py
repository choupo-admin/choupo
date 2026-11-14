#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the Rodas4 coefficients really give an order-4, L-stable method.

    bin/curate/check_rodas4_order.py

WHY THIS EXISTS (2026-11-08, DEV.md 4c C245 slice 11).  The Rodas4 constants
in src/solver/ODE/Rosenbrock23.cpp (Hairer & Wanner, Solving ODEs II, IV.7,
as printed in Hairer's rodas.f) were entered from memory, ~50 sixteen-digit
numbers.  A mistyped digit does not crash: it silently drops the method to a
lower order and every golden that uses it moves a little.  So the order is
MEASURED, not trusted.

WHAT IT CHECKS (`_rodas4OrderProbe.cpp`, compiled here against the ODE
sources alone, fixed steps so the error is the method's own):
  (a) on a nonautonomous nonlinear pair, the observed order from steps
      h = 3/20, 3/40, 3/80 is >= 3.8 at BOTH halvings (a good method gives
      4.1-4.3 here);
  (b) the stiff probe y' = -1000 (y - cos t) - sin t, h = 0.1 (h*lambda =
      -100), lands within 1e-6 of the exact cos t (L-stability).
NOT covered: the embedded error estimate's coefficients are exercised by the
suite's goldens, not here; the order of the 2(3) pair (unchanged).
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "bin" / "curate" / "_rodas4OrderProbe.cpp"
SOURCES = ["src/solver/ODE/Rosenbrock23.cpp", "src/solver/ODE/Jacobian.cpp",
           "src/solver/ODE/ODEIntegrator.cpp", "src/solver/ODE/EulerSI.cpp",
           "src/solver/ODE/RK4.cpp", "src/solver/LU.cpp",
           "src/solver/BlockTridiagonal.cpp"]
MIN_ORDER = 3.8
STIFF_TOL = 1.0e-6


def main():
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        print("check_rodas4_order: FAILED -- no C++ compiler; a check that "
              "cannot run must not pass")
        return 1
    with tempfile.TemporaryDirectory() as t:
        exe = Path(t) / "probe"
        r = subprocess.run([cxx, "-std=c++17", "-O2", "-I", str(ROOT / "src"),
                            str(PROBE)] + [str(ROOT / s) for s in SOURCES]
                           + ["-o", str(exe)], capture_output=True, text=True)
        if r.returncode != 0:
            print("check_rodas4_order: FAILED -- the probe does not compile:\n"
                  + r.stderr[-2000:])
            return 1
        out = subprocess.run([str(exe)], capture_output=True, text=True,
                             timeout=300).stdout
    orders, stiff = [], None
    for line in out.splitlines():
        p = line.split()
        if p[:1] == ["ORDER"]:
            orders.append((int(p[1]), float(p[2]), float(p[3])))
        elif p[:1] == ["STIFF"]:
            stiff = float(p[1])
    fails = []
    if len(orders) != 3 or stiff is None:
        fails.append(f"the probe printed an unexpected result:\n{out[-800:]}")
    else:
        for N, e, o in orders[1:]:
            if not o >= MIN_ORDER:
                fails.append(f"observed order {o:.2f} at N={N} (error {e:.2e}) "
                             f"is below {MIN_ORDER}: a Rodas4 coefficient "
                             "is wrong")
        if not stiff <= STIFF_TOL:
            fails.append(f"stiff probe error {stiff:.2e} exceeds "
                         f"{STIFF_TOL:g}")
    if fails:
        print("check_rodas4_order: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_rodas4_order: OK -- Rodas4 observed order "
          + ", ".join(f"{o:.2f}" for _, _, o in orders[1:])
          + f" (>= {MIN_ORDER}) at h = 3/40, 3/80 on a nonautonomous "
          f"nonlinear pair; stiff probe (h*lambda = -100) within "
          f"{stiff:.1e} of cos t (<= {STIFF_TOL:g}).  NOT covered: the "
          "embedded error estimate, the 2(3) pair's order.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
