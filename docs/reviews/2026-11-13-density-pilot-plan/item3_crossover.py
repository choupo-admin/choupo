#!/usr/bin/env python3
"""Item 3, second table: where the record's water saturation temperature
crosses the reference equation's (IAPWS95 and IF97), on a fine pressure grid
from 0.007 to 0.15 bar.

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item3_crossover.py <scratch_dir> > item3_crossover.tsv
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import propscase as pc
scratch = os.path.abspath(sys.argv[1])
P = [0.007, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.075, 0.08, 0.085, 0.09, 0.1, 0.12, 0.15]
T = {}
for route in ("record", "IF97", "IAPWS95"):
    d = pc.make_case(scratch, "x_" + route, ["water"], pc.ROUTES[route])
    res, _ = pc.scan(d, [(p * 1e5, [300.0]) for p in P], {"water": 1.0}, ["T_bubble"])
    T[route] = [r[300.0]["T_bubble"] if r else None for r in res]
print("P_bar\tTsat_record_K\tTsat_IAPWS95_K\trecord_minus_IAPWS95_mK\trecord_minus_IF97_mK\tpilot_rule(1 mK)")
for k, p in enumerate(P):
    a, b, c = T["record"][k], T["IAPWS95"][k], T["IF97"][k]
    dm = (a - b) * 1000; d9 = (a - c) * 1000
    print(f"{p}\t{a:.6f}\t{b:.6f}\t{dm:.1f}\t{d9:.1f}\t{'refused' if dm > 1 else 'priced'}")
