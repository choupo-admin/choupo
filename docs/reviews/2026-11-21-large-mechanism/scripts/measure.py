#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""measure -- wall time of one choupoBatch case with `linearSolver dense` and `sparse`.

    measure.py CASE [--repeat 3] [--solvers dense,sparse] [--threads N] [--bin DIR]

Rewrites the case's `solver { ... }` line (make_case.py writes it on one line), runs
choupoBatch `repeat` times per solver at verbosity 4, and prints per solver: the
minimum wall time, the steps (Jacobians built), the right-hand sides, the factor size
the run announced, and the KPIs' largest relative difference from the first solver.
CHOUPO_HOME must point at the repository.  Nothing is written outside CASE.
"""
import argparse
import json
import os
import re
import subprocess
import time
from pathlib import Path


def kpis(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>", out, re.S)
    if not m:
        return {}
    f = {}
    for u, d in (json.loads(m.group(1)).get("kpis") or {}).items():
        if isinstance(d, dict):
            for k, v in d.items():
                if isinstance(v, (int, float)) and not isinstance(v, bool) and "closure" not in k \
                        and "residual" not in k:
                    f[(u, k)] = float(v)
    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("case")
    ap.add_argument("--repeat", type=int, default=3)
    ap.add_argument("--integrator", default="Rosenbrock23")
    ap.add_argument("--solvers", default="dense,sparse")
    ap.add_argument("--extra", default="", help="more solver keys, e.g. 'threads 4;'")
    ap.add_argument("--bin", default=str(Path(__file__).resolve().parents[4] / "build/linux64Gcc"))
    a = ap.parse_args()
    case = Path(a.case)
    fs = case / "system/flowsheetDict"
    orig = fs.read_text()
    base = None
    try:
        for ls in a.solvers.split(","):
            fs.write_text(re.sub(r"solver\s*\{[^}]*\}",
                                 "solver      { integrator " + a.integrator + "; verbosity 4; "
                                 f"linearSolver {ls}; {a.extra} }}", orig, count=1))
            best, out = None, ""
            for _ in range(a.repeat):
                t0 = time.perf_counter()
                r = subprocess.run([str(Path(a.bin) / "choupoBatch"), str(case)],
                                   capture_output=True, text=True, env=os.environ)
                dt = time.perf_counter() - t0
                out = r.stdout + r.stderr
                if r.returncode != 0:
                    print(f"{case.name} {ls}: exit {r.returncode}: "
                          + " | ".join(out.strip().splitlines()[-2:])[:400])
                    break
                best = dt if best is None else min(best, dt)
            if best is None:
                continue
            cnt = re.findall(r"right-hand sides so far (\d+), Jacobian analytic \((\d+) built, (\d+) "
                             r"right-hand sides spent on audits\)", out)
            sp = re.search(r"(\d+) rows, (\d+) entries on the network's pattern, (\d+) in L\+U", out)
            fb = re.findall(r"(\d+) refactored dense", out)
            fl = re.search(r"([0-9.e+]+) multiply-adds per factorisation against n\^3/3 = ([0-9.e+]+) dense", out)
            br = re.findall(r"wall ([0-9.]+) s = right-hand sides ([0-9.]+) \(audits included\) \+ "
                            r"Jacobian ([0-9.]+) \+ linear algebra and the rest ([0-9.-]+)", out)
            k = kpis(out)
            if base is None:
                base, diff = k, 0.0
            else:
                diffs = [(abs(k[x] - base[x]) / max(abs(k[x]), abs(base[x]), 1e-300), x, base[x], k[x])
                         for x in base if x in k and abs(base[x]) > 1e-12]
                worst = max(diffs, default=(0.0, None, 0, 0))
                diff = worst[0]
                if diff > 1e-8:
                    print(f"   worst KPI {worst[1]}: {worst[2]:.10g} vs {worst[3]:.10g}")
            rhs, jac, aud = (cnt[-1] if cnt else ("?", "?", "?"))
            print(f"{case.name:10s} {ls:6s} wall {best:9.3f} s  Jacobians {jac}  RHS {rhs} "
                  f"(audits {aud})"
                  + (f"  pattern {sp.group(2)} L+U {sp.group(3)} rows {sp.group(1)}" if sp else "")
                  + (f"  dense refactorisations {fb[-1]}" if fb else "")
                  + (f"  multiply-adds {float(fl.group(1)):.3g} (dense {float(fl.group(2)):.3g})" if fl else "")
                  + (f"  [integrate {br[-1][0]} = RHS {br[-1][1]} + Jacobian {br[-1][2]} + LA&rest {br[-1][3]}]"
                     if br else "")
                  + f"  KPIs vs first {diff:.1e}")
    finally:
        fs.write_text(orig)


if __name__ == "__main__":
    main()
