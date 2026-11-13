#!/usr/bin/env python3
"""Item 3: water's saturation temperature from the component record's own
vapour-pressure model against the two pure-fluid formulations in the tree
(IF97; Helmholtz IAPWS95), through today's engine (`T_bubble` of pure water in
a propertyScan1D), at the pressures of the brief; and the liquid density each
route gives at the RECORD's saturation temperature (what the pilot's rule
would be asked for a condensate the case itself put on its bubble point).

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item3_saturation.py <scratch_dir> > item3_saturation.tsv
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import propscase as pc

scratch = os.path.abspath(sys.argv[1])
P_bar = [0.05, 0.1, 0.5, 1, 1.01325, 2, 5, 8.59, 10, 20, 50, 100]
Tsat = {}
for route, pure in pc.ROUTES.items():
    d = pc.make_case(scratch, "sat_" + route, ["water"], pure)
    res, log = pc.scan(d, [(p * 1e5, [300.0]) for p in P_bar], {"water": 1.0}, ["T_bubble"])
    Tsat[route] = [r.get(300.0, {}).get("T_bubble") if r else None for r in res]
# the liquid density each route returns AT the record's Tsat(P), at P and at P(1+1e-6)
rho = {}
for route, pure in pc.ROUTES.items():
    d = pc.make_case(scratch, "rho_" + route, ["water"], pure)
    groups = []
    for p, T in zip(P_bar, Tsat["record"]):
        groups.append((p * 1e5, [T]))
    res, log = pc.scan(d, groups, {"water": 1.0}, ["rho_liquid_water", "Psat_water"])
    rho[route] = [(r.get(T, {}) if r else {}) for r, T in zip(res, Tsat["record"])]
print("P_bar\tTsat_record_K\tTsat_IF97_K\tTsat_IAPWS95_K\trecord_minus_IAPWS95_mK\trecord_minus_IF97_mK\t"
      "pilot_rule_at_record_Tsat(IAPWS95)\trho_today_IF97_at_recordTsat\trho_today_IAPWS95_at_recordTsat\tpsat_IAPWS95_at_recordTsat_bar")
for k, p in enumerate(P_bar):
    tr, t9, t5 = Tsat["record"][k], Tsat["IF97"][k], Tsat["IAPWS95"][k]
    dm = (tr - t5) * 1000 if tr and t5 else None
    d9 = (tr - t9) * 1000 if tr and t9 else None
    rule = "-" if dm is None else ("refused (outsideHardDomain)" if dm > 1.0 else "priced")
    r9 = rho["IF97"][k].get("rho_liquid_water"); r5 = rho["IAPWS95"][k].get("rho_liquid_water")
    ps = rho["IAPWS95"][k].get("Psat_water")
    f = lambda v, n=6: "None" if v is None else f"{v:.{n}f}"
    print(f"{p}\t{f(tr)}\t{f(t9)}\t{f(t5)}\t{f(dm,1)}\t{f(d9,1)}\t{rule}\t{f(r9,3)}\t{f(r5,3)}\t{f(ps/1e5 if ps else None,6)}")
