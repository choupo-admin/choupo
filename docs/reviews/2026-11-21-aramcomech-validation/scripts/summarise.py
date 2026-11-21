#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""summarise -- the REPORT.md tables from the run records (phaseB.jsonl, petersen.jsonl).

    summarise.py REVIEW_DIR
"""
import json
import math
import os
import statistics
import sys


def phase_b(d):
    print("| case | mode | tau max dT/dt, Choupo / Cantera [us] | rel | tau T0+400 K [us] | tau dP/dt tangent [us] | "
          "T_final Choupo / Cantera [K] | max abs dT [K] | wall dense / sparse / Cantera [s] |")
    print("|---|---|---|---|---|---|---|---|---|")
    for l in open(os.path.join(d, "phaseB.jsonl")):
        r = json.loads(l)
        c, t = r["choupo"], r["cantera"]
        tp = ("%.2f / %.2f" % (c["tau_dPdt_tangent"] * 1e6, t["tau_dPdt_tangent"] * 1e6)) if "tau_dPdt_tangent" in c else "-"
        print("| %s: %g K, %g atm, %s | %s | %.2f / %.2f | %.1e | %.2f / %.2f | %s | %.4f / %.4f | %.3f | %.1f / %.1f / %.1f |" % (
            r["label"], r["T0"], r["P0_atm"], r["mix"], r["mode"], c["tau_maxdTdt"] * 1e6, t["tau_maxdTdt"] * 1e6,
            c["tau_maxdTdt"] / t["tau_maxdTdt"] - 1, c["tau_T400"] * 1e6, t["tau_T400"] * 1e6, tp,
            c["T_final"], t["T_final"], r["max_abs_dT"], r["wall_choupo_dense"], r["wall_choupo_sparse"],
            r["wall_cantera"]))
    print()
    print("Final mole fractions (Choupo / Cantera), the eight largest:")
    print()
    for l in open(os.path.join(d, "phaseB.jsonl")):
        r = json.loads(l)
        w = max(abs(a / b - 1) for a, b in r["X_final"].values())
        print("- %s: " % r["label"] + ", ".join("%s %.6g / %.6g" % (s, a, b) for s, (a, b) in r["X_final"].items())
              + "; worst relative %.1e" % w)


def phase_c(d):
    rows = [json.loads(l) for l in open(os.path.join(d, "petersen.jsonl"))]
    rows.sort(key=lambda r: r["row"])
    print("| mixture | P5 [atm] | T5 [K] | measured [us] (diag) | Choupo [us] | Cantera [us] | Choupo/meas | "
          "Choupo/Cantera - 1 | Choupo max dT/dt [us] |")
    print("|---|---|---|---|---|---|---|---|---|")
    by = {}
    worst_cc = 0.0
    for r in rows:
        m = r["measured"]
        if "error" in r:
            print("| %s | %s | %s | %s | ERROR | | | | |" % (m["mixture"], m["P5_atm"], m["T5_K"], m["tau_ign_us"]))
            continue
        c, t = r["choupo"]["tau_dPdt_tangent"] * 1e6, r["cantera"]["tau_dPdt_tangent"] * 1e6
        meas = float(m["tau_ign_us"])
        by.setdefault(m["mixture"], []).append(math.log(c / meas))
        worst_cc = max(worst_cc, abs(c / t - 1))
        print("| %s | %s | %s | %s%s | %.1f | %.1f | %.2f | %.1e | %.1f |" % (
            m["mixture"], m["P5_atm"], m["T5_K"], m["tau_ign_us"], " (" + m["note"] + ")" if m["note"] else "",
            c, t, c / meas, c / t - 1, r["choupo"]["tau_maxdTdt"] * 1e6))
    print()
    print("| mixture | points | mean ln(model/measured) | geometric mean ratio | scatter (sd of ln) | max abs ln |")
    print("|---|---|---|---|---|---|")
    allv = []
    for k in sorted(by):
        v = by[k]
        allv += v
        print("| %s | %d | %+.3f | %.2f | %.3f | %.3f |" % (k, len(v), statistics.mean(v), math.exp(statistics.mean(v)),
              statistics.stdev(v) if len(v) > 1 else 0.0, max(abs(x) for x in v)))
    print("| all | %d | %+.3f | %.2f | %.3f | %.3f |" % (len(allv), statistics.mean(allv), math.exp(statistics.mean(allv)),
          statistics.stdev(allv), max(abs(x) for x in allv)))
    ng = [math.log(r["choupo"]["tau_dPdt_tangent"] * 1e6 / float(r["measured"]["tau_ign_us"]))
          for r in rows if "error" not in r and r["measured"]["note"] != "g"]
    print("| all but HeNe extinction (g) | %d | %+.3f | %.2f | %.3f | %.3f |" % (
        len(ng), statistics.mean(ng), math.exp(statistics.mean(ng)), statistics.stdev(ng), max(abs(x) for x in ng)))
    print()
    print("Choupo against Cantera on the same definition: worst |tau_C/tau_K - 1| = %.1e over %d points." % (worst_cc, len(allv)))


if __name__ == "__main__":
    d = sys.argv[1]
    phase_b(d)
    print()
    phase_c(d)
