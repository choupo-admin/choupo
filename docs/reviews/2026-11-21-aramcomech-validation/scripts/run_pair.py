#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""run_pair -- one ignition condition in Choupo (choupoBatch) and in Cantera, read the same way.

    run_pair.py IMPORTED_CASE MECH.yaml WORKDIR --label L --T 1400 --P 1 --mix "CH4:1,O2:2,N2:7.52" \\
                --mode V|P --endTime 3e-3 --deltaT 1e-6 [--linear dense|sparse|auto] [--choupo-only]

IMPORTED_CASE holds constant/ written by bin/curate/chemkin_to_choupo.py (the mechanism's own NASA-7
file, re-referenced to 1 bar); MECH.yaml is ck2yaml of the SAME two files.  The Choupo case is built by
docs/reviews/2026-11-21-large-mechanism/scripts/make_case.py (adiabatic batchReactor, Rodas4, the
analytic Jacobian by default), P converted atm -> bar.  Both trajectories are sampled at k * deltaT and
read by ignition.py.  Prints one JSON line.
"""
import argparse
import csv
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ignition as ig  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "bin", "curate"))
from chemkin_to_choupo import sanitise  # noqa: E402

MAKE = os.path.join(ROOT, "docs/reviews/2026-11-21-large-mechanism/scripts/make_case.py")
CT_PY = os.environ.get("CANTERA_PYTHON", "/usr/bin/python3")
ATM_BAR = 1.01325


def choupo(imported, work, a, linear):
    c = os.path.join(work, "choupo_" + a.label + ("_" + linear if linear else ""))
    shutil.rmtree(c, ignore_errors=True)
    os.makedirs(c)
    shutil.copytree(os.path.join(imported, "constant"), os.path.join(c, "constant"))
    mix = ",".join("%s:%s" % (sanitise(k), v) for k, v in (kv.split(":") for kv in a.mix.split(",")))
    solver = "integrator Rodas4;" + (" linearSolver %s;" % linear if linear else "")
    subprocess.run([sys.executable, MAKE, c, "--T", str(a.T), "--P", repr(a.P * ATM_BAR), "--mix", mix,
                    "--endTime", repr(a.endTime), "--deltaT", repr(a.deltaT), "--solver", solver,
                    "--energy", "gasConstantV" if a.mode == "V" else "gasConstantP"],
                   check=True, capture_output=True)
    env = dict(os.environ, CHOUPO_HOME=ROOT)
    w0 = time.perf_counter()
    r = subprocess.run([os.path.join(ROOT, "choupoBatch"), c], capture_output=True, text=True, env=env, cwd=c)
    wall = time.perf_counter() - w0
    open(os.path.join(c, "run.log"), "w").write(r.stdout + r.stderr)
    if r.returncode:
        raise SystemExit("choupoBatch failed (%d): %s" % (r.returncode, (r.stdout + r.stderr)[-600:]))
    t, T, _, n = ig.read_choupo(c)
    for d in os.listdir(c):                       # the time directories are not needed afterwards
        if re.fullmatch(r"[0-9.eE+-]+", d) and d != "0":
            shutil.rmtree(os.path.join(c, d), ignore_errors=True)
    ntot = [sum(v[k] for v in n.values()) for k in range(len(t))]
    X = {s: [v[k] / ntot[k] for k in range(len(t))] for s, v in n.items()}
    #  P = n R T / V at constant V (relative: P/P0 is all the max-dP/dt tangent needs)
    Prel = [ntot[k] * T[k] / (ntot[0] * T[0]) for k in range(len(t))] if a.mode == "V" else None
    return dict(t=t, T=T, X=X, Prel=Prel, wall=wall)


def cantera(mech, work, a):
    out = os.path.join(work, "ct_%s.csv" % a.label)
    w0 = time.perf_counter()
    r = subprocess.run([CT_PY, os.path.join(HERE, "ct_run.py"), mech, out, "--T", str(a.T), "--P", str(a.P),
                        "--mix", a.mix, "--mode", a.mode, "--endTime", repr(a.endTime), "--deltaT", repr(a.deltaT)],
                       capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("ct_run failed: " + r.stderr[-600:])
    rows = list(csv.reader(open(out)))
    h = rows[0]
    t = [float(x[0]) for x in rows[1:]]
    T = [float(x[1]) for x in rows[1:]]
    P = [float(x[2]) for x in rows[1:]]
    X = {sanitise(name): [float(x[3 + j]) for x in rows[1:]] for j, name in enumerate(h[3:])}
    os.remove(out)
    return dict(t=t, T=T, X=X, Prel=[p / P[0] for p in P] if a.mode == "V" else None,
                wall=time.perf_counter() - w0)


def tangent_tau(t, y):
    """Petersen's t_F (p. 83, Fig. 1): the steepest rise of y extrapolated back to y(0)."""
    tau, slope = ig.tau_max_slope(t, y)
    k = min(range(len(t)), key=lambda i: abs(t[i] - tau))
    yk = y[k] + (tau - t[k]) * slope          # y at the vertex time on the tangent
    return tau - (yk - y[0]) / slope


def metrics(r, mode):
    m = dict(tau_maxdTdt=ig.tau_maxdTdt(r["t"], r["T"]), tau_T400=ig.tau_crossing(r["t"], r["T"]),
             T_final=r["T"][-1])
    if mode == "V":
        m["tau_dPdt_tangent"] = tangent_tau(r["t"], r["Prel"])
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("imported")
    ap.add_argument("mech")
    ap.add_argument("work")
    ap.add_argument("--label", required=True)
    ap.add_argument("--T", type=float, required=True)
    ap.add_argument("--P", type=float, required=True, help="atm")
    ap.add_argument("--mix", required=True)
    ap.add_argument("--mode", choices=("V", "P"), default="V")
    ap.add_argument("--endTime", type=float, required=True)
    ap.add_argument("--deltaT", type=float, required=True)
    ap.add_argument("--linear", default="", help="dense,sparse: run Choupo once per solver")
    ap.add_argument("--choupo-only", action="store_true")
    a = ap.parse_args()
    a.work, a.imported, a.mech = (os.path.abspath(x) for x in (a.work, a.imported, a.mech))
    os.makedirs(a.work, exist_ok=True)
    out = dict(label=a.label, T0=a.T, P0_atm=a.P, mix=a.mix, mode=a.mode, endTime=a.endTime, deltaT=a.deltaT)
    lin = a.linear.split(",") if a.linear else [""]
    runs = {}
    for ls in lin:
        runs[ls] = choupo(a.imported, a.work, a, ls)
        out["wall_choupo" + ("_" + ls if ls else "")] = runs[ls]["wall"]
    ch = runs[lin[0]]
    out["choupo"] = metrics(ch, a.mode)
    if len(lin) > 1:
        out["dense_vs_sparse_maxdT"] = max(abs(x - y) for x, y in zip(runs[lin[0]]["T"], runs[lin[1]]["T"]))
    if not a.choupo_only:
        ct = cantera(a.mech, a.work, a)
        out["wall_cantera"] = ct["wall"]
        out["cantera"] = metrics(ct, a.mode)
        out["max_abs_dT"] = max(abs(x - y) for x, y in zip(ch["T"], ct["T"]))
        top = sorted(ct["X"], key=lambda s: -ct["X"][s][-1])[:8]
        out["X_final"] = {s: [ch["X"].get(s, [math.nan])[-1], ct["X"][s][-1]] for s in top}
    print(json.dumps(out))


if __name__ == "__main__":
    sys.exit(main())
