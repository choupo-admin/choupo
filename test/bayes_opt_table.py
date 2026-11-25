#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""C499: turn the per-run CSVs of test/bayes_opt_bench.cpp into the table of
docs/audits/2026-11-24-c499-protocol.md.

    test/bayes_opt_table.py RUNS_DIR PROBLEM SENSE FSTAR_EXTRA

RUNS_DIR   holds <problem>_<method>_<seed>/bench.csv
PROBLEM    a or b
SENSE      max or min
FSTAR_EXTRA  extra best-known candidates (grid, shipped optimum), comma list,
             or '-' for none.

f* = the best feasible value of every run and of the extra candidates.
n(tol) = first simulation after which the best feasible so far is within
|f - f*| / |f*| <= tol; 'inf' when the budget ended first.  The SQP column of a
seed is the better (smaller n) of sqpForward and sqpCentral.
"""
import csv
import glob
import os
import statistics
import sys


def load(path):
    rows = []
    with open(path) as fh:
        for r in csv.DictReader(fh):
            rows.append(r)
    return rows


def main():
    runs, prob, sense, extra = sys.argv[1:5]
    maximise = sense == "max"
    data = {}
    for d in sorted(glob.glob(os.path.join(runs, prob + "_*"))):
        _, method, seed = os.path.basename(d).split("_")
        f = os.path.join(d, "bench.csv")
        if os.path.exists(f):
            data[(method, int(seed))] = load(f)
    cands = []
    if extra != "-":
        cands += [float(v) for v in extra.split(",")]
    for rows in data.values():
        for r in rows:
            if r["feasible"] == "1":
                cands.append(float(r["f"]))
    fstar = max(cands) if maximise else min(cands)
    print(f"problem {prob}: f* = {fstar:.10g} (best of {len(cands)} candidates)")

    def first(rows, tol):
        for r in rows:
            if r["feasible"] == "1" and r["bestFeasible"] not in ("", "nan"):
                if abs(float(r["bestFeasible"]) - fstar) <= tol * abs(fstar):
                    return int(r["eval"])
        return float("inf")

    inf = float("inf")
    print("| seed | method | sims run | failed | n(1e-2) | n(1e-3) | best feasible |")
    print("|---|---|---|---|---|---|---|")
    per = {"bayes": {1e-2: [], 1e-3: []}, "sqp": {1e-2: [], 1e-3: []}}
    for seed in sorted({s for (_, s) in data if s > 0}):
        best = {}
        for m in ("bayes", "sqpForward", "sqpCentral"):
            rows = data.get((m, seed))
            if not rows:
                continue
            nf = sum(1 for r in rows if r["ok"] == "0")
            n2, n3 = first(rows, 1e-2), first(rows, 1e-3)
            bf = rows[-1]["bestFeasible"]
            print(f"| {seed} | {m} | {len(rows)} | {nf} | {n2} | {n3} | {bf} |")
            key = "bayes" if m == "bayes" else "sqp"
            cur = best.setdefault(key, [inf, inf])
            cur[0] = min(cur[0], n2)
            cur[1] = min(cur[1], n3)
        for key, v in best.items():
            per[key][1e-2].append(v[0])
            per[key][1e-3].append(v[1])
    print()
    for key in ("bayes", "sqp"):
        for tol in (1e-2, 1e-3):
            v = per[key][tol]
            if v:
                print(f"median n({tol:g}) {key}: {statistics.median(v)}   per seed {v}")


if __name__ == "__main__":
    main()
