#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the seulex integrator (extrapolated linearly-implicit Euler) is right, and its Jacobian reuse is watched.

    bin/curate/check_seulex.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  seulex tolerates an OLD Jacobian, so a defect in
the machinery that decides when to rebuild it (the convergence monitor theta of Hairer &
Wanner IV.9), or in the extrapolation table, does not crash and does not trip a mass
balance: the run goes on with a stale J, takes steps that are too short, rejects, or --
worse -- returns a plausible answer that is off by far more than the tolerance it was
asked for.  A golden pins what a run prints and so cannot tell.  Two claims are checked
against numbers that do not come from seulex itself:

  1. STANDALONE (test/seulex_check.cpp, built here with g++): the Robertson problem equals
     the Rodas4 rtol 1e-12 value to 1e-5 and conserves its sum; a smooth problem's error
     falls with the tolerance; a deliberately WRONG Jacobian (80 % of the true one) gives
     the same answer as the right one to 1e-5 (the claim "a stale J costs steps, not
     correctness"); and with the refresh threshold at infinity -- the sabotage, a monitor
     that never refreshes -- the run on Robertson must NOT return a good answer cheaply
     (it fails at maxSteps), so the comparison has teeth.
  2. THE ENGINE (choupoBatch): nox03_millerbowman_large_seulex (235 reactions, sparse
     analytic Jacobian) and ignition01_h2o2_seulex end in the same state as their
     Rosenbrock23 siblings (final temperature to 0.05 K, final composition to 1e-4
     relative over the species above 1e-6), and the nox03 run builds a Jacobian on fewer
     steps than it takes (reuse is happening).

NOT CHECKED HERE: the accuracy on the OUTPUT GRID inside an induction period (held by
check_batch_dense_output arm (g); seulex's own dense output since 2026-11-22), sensitivity and the
fixed-bed adsorber (both refuse seulex by name), speed (a timing is not a gate).
"""
import csv
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
COMB = "tutorials/batch/combustion/"
SRC = ["test/seulex_check.cpp"] + ["src/solver/ODE/" + f for f in
       ("ODEIntegrator.cpp", "RK4.cpp", "EulerSI.cpp", "Rosenbrock23.cpp", "Seulex.cpp", "Jacobian.cpp")] \
      + ["src/solver/LU.cpp", "src/solver/SparseLU.cpp", "src/solver/BlockTridiagonal.cpp"]
STRIP = ("expected", "converged", "constant/propertyManifest", "trajectory.csv")


def final_row(case, env_extra=None):
    batch = gatekit.binary("choupoBatch")
    with gatekit.probe_copy(COMB + case, strip=STRIP) as c:
        rc, out = gatekit.run(batch, c)
        if rc != 0:
            return None, out
        rows = list(csv.DictReader(open(c / "trajectory.csv")))
        tau = re.search(r"tau_ign \(max dT/dt\) = (\S+) s", out)
        return rows[-1], (rows, tau.group(1) if tau else None)


def compare(a, b, tag, failures, tT=0.05, tX=1e-4):
    Tk = [k for k in a if k.endswith("T") or k.endswith("T[K]")][0]
    dT = abs(float(a[Tk]) - float(b[Tk]))
    if dT > tT:
        failures.append(f"{tag}: final T differs by {dT:.3g} K (> {tT})")
    nk = [k for k in a if ".n_" in k]
    tot_a = sum(float(a[k]) for k in nk)
    tot_b = sum(float(b[k]) for k in nk)
    worst = 0.0
    for k in nk:
        xa, xb = float(a[k]) / tot_a, float(b[k]) / tot_b
        if xb > 1e-6:
            worst = max(worst, abs(xa - xb) / xb)
    if worst > tX:
        failures.append(f"{tag}: a final mole fraction differs by {worst:.2e} relative (> {tX})")
    return dT, worst


def main():
    failures = []
    # ---- 1. the standalone test ------------------------------------------------
    with tempfile.TemporaryDirectory(prefix="seulex_") as td:
        exe = Path(td) / "seulex_check"
        cc = subprocess.run(["g++", "-std=c++17", "-O2", "-I", str(REPO / "src"), *[str(REPO / s) for s in SRC],
                             "-o", str(exe)], capture_output=True, text=True)
        if cc.returncode:
            return gatekit.verdict("check_seulex", ["test/seulex_check.cpp did not build: " + cc.stderr[-400:]], "")
        r = subprocess.run([str(exe)], capture_output=True, text=True, timeout=300)
        out = r.stdout
    for need in ("robertson", "smooth error falls", "wrongJ(0.8)", "monitor:", "linear:"):
        if not re.search(re.escape(need) + r".*PASS", out):
            failures.append(f"standalone: the '{need}' claim did not PASS:\n" + out[-600:])
    m = re.search(r"never-refresh: jac (\d+), steps (\d+) rejected (\d+) ok (\d)", out)
    if not m:
        failures.append("standalone: no never-refresh (sabotage) line")
    elif int(m.group(4)) == 1 and int(m.group(2)) < 100000:
        failures.append("sabotage arm: a monitor that never refreshes still integrated Robertson cheaply "
                        f"({m.group(2)} steps) -- the monitor cannot be seen doing anything")

    # ---- 2. the engine ---------------------------------------------------------
    pairs = [("nox03_millerbowman_large_seulex", "nox03_millerbowman_large"),
             ("ignition01_h2o2_seulex", "ignition01_h2o2")]
    worst = []
    for sx, base in pairs:
        a, (ra, ta) = final_row(sx)
        b, (rb, tb) = final_row(base)
        if a is None or b is None:
            failures.append(f"{sx} / {base}: did not run")
            continue
        worst.append(compare(a, b, sx, failures))
        #  the ignition delay (the max dT/dt row of the write grid) must be the same row
        if ta != tb:
            failures.append(f"{sx}: ignition delay {ta} s against {tb} s of {base}")
        #  T in the INDUCTION period (nox03: t = 2 ms, 0.4 ms before the ignition), where a
        #  too-loose error control or a wrong extrapolation moves the temperature first.  The
        #  rows between steps are seulex's dense output polynomial, so the bound stays
        #  1 K, not the method's accuracy (the standalone claims hold that).
        if sx.startswith("nox03"):
            Tk = [k for k in a if k.endswith("T")][0]
            row = lambda rows: min(rows, key=lambda r: abs(float(r["t"]) - 2.0e-3))
            dT2 = abs(float(row(ra)[Tk]) - float(row(rb)[Tk]))
            if dT2 > 1.0:
                failures.append(f"{sx}: T at 2 ms (induction) differs from {base} by {dT2:.3g} K (> 1)")
    # reuse is happening: stats via CHOUPO_ODE_STATS (adaptive path only)
    batch = gatekit.binary("choupoBatch")
    import os
    with gatekit.probe_copy(COMB + "nox03_millerbowman_large_seulex", strip=STRIP) as c:
        rc, out = gatekit.run(batch, c, env=dict(os.environ, CHOUPO_HOME=str(REPO), CHOUPO_ODE_STATS="1"))
        m2 = re.search(r"steps=(\d+) accepted=(\d+) rejected=(\d+) jacobians=(\d+)", out)
        if rc != 0 or not m2:
            failures.append("nox03_millerbowman_large_seulex: no work counters in the run")
        else:
            steps, acc, jac = int(m2.group(1)), int(m2.group(2)), int(m2.group(4))
            #  recorded: ~100 accepted steps, a Jacobian for ~0.9 of them (theta, default min(1e-4, rtol),
            #  is above its threshold on most steps of this problem); the linear arm of the standalone
            #  test holds the reuse itself.  Order pinned low or high moves the step count by 10x.
            if not (40 <= acc <= 300) or jac < 0.5 * acc or jac > steps:
                failures.append(f"nox03 seulex: {acc} accepted steps, {jac} Jacobians (recorded: 40..300 steps,"
                                " a Jacobian on at least half of them)")
    return gatekit.verdict(
        "check_seulex", failures,
        "seulex: Robertson, a smooth problem and a wrong-Jacobian run are right, never-refreshing is seen, and "
        "nox03 / ignition01 end where their Rosenbrock23 siblings do ("
        + ", ".join(f"dT {w[0]:.1e} K, dx {w[1]:.1e}" for w in worst) + ")")


if __name__ == "__main__":
    sys.exit(main())
