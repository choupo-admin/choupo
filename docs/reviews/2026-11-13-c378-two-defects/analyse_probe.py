#!/usr/bin/env python3
"""Summarise probe_saturation_line.py output: one row per (unit, T, declared
phase), the exit codes over e, and the largest spread of any published number
over the runs INSIDE the band (|e| <= 5e-7 < 1e-6, plus one-ulp 'down'/'up').

    python3 analyse_probe.py probe.tsv [summary.tsv]

A 'jump' is a published number whose spread over those runs exceeds
max(1e-3, 1e-4 |value|) -- far above the v dP effect of moving P by 1e-9 of
itself, far below a latent heat.
"""
import csv
import json
import sys
from collections import defaultdict

INSIDE = {"down", "up", "0", "-1e-12", "1e-12", "-1e-9", "1e-9", "-5e-7", "5e-7"}


def flat(prefix, d, out):
    for k, v in d.items():
        if isinstance(v, dict):
            flat(prefix + k + ".", v, out)
        elif isinstance(v, (int, float)) and v is not None:
            out[prefix + k] = float(v)


def main():
    rows = list(csv.DictReader(open(sys.argv[1]), delimiter="\t"))
    groups = defaultdict(list)
    for r in rows:
        groups[(r["unit"], r["T_K"], r["declared_phase"])].append(r)
    out = ["unit\tT_K\tdeclared_phase\texits_by_e\tinside_band_ok\tjump\tworst_key\tworst_min\tworst_max\tband_edge_jump\tedge_worst_key\tedge_min\tedge_max\tfirst_error"]
    for (u, T, ph), rs in groups.items():
        exits = " ".join(f"{r['e']}:{r['exit']}" for r in rs)
        vals = defaultdict(list)
        evals = defaultdict(list)
        for r in rs:
            if r["exit"] != "0":
                continue
            d = {}
            flat("kpi.", json.loads(r["kpis"]), d)
            flat("out.", json.loads(r["outlets"]), d)
            flat("bnd.", json.loads(r["boundary"]), d)
            for k, v in d.items():
                if k.endswith(".P") or k.endswith("P_in") or k.endswith("P_out") or k == "kpi.dP" or "residual" in k:
                    continue
                if r["e"] in INSIDE:
                    vals[k].append(v)
                evals[k].append((r["e"], v))
        def worst(vs):
            best = ("", 0.0, 0.0, 0.0)
            for k, l in vs.items():
                if len(l) < 2:
                    continue
                lo, hi = min(l), max(l)
                score = (hi - lo) / max(1e-3, 1e-4 * max(abs(lo), abs(hi)))
                if score > best[3]:
                    best = (k, lo, hi, score)
            return best
        k, lo, hi, sc = worst(vals)
        ek, elo, ehi, esc = worst({kk: [v for _, v in l] for kk, l in evals.items()})
        nin = sum(1 for r in rs if r["e"] in INSIDE and r["exit"] == "0")
        err = next((r["error"] for r in rs if r["exit"] != "0"), "")[:160]
        out.append("\t".join([u, T, ph, exits, str(nin), "yes" if sc > 1 else "no",
                              k, f"{lo:.9g}", f"{hi:.9g}",
                              "yes" if esc > 1 else "no", ek, f"{elo:.9g}", f"{ehi:.9g}", err]))
    text = "\n".join(out) + "\n"
    if len(sys.argv) > 2:
        open(sys.argv[2], "w").write(text)
    sys.stdout.write(text)


if __name__ == "__main__":
    main()
