#!/usr/bin/env python3
"""Item 2(a): rankine02's pump inlet, asked of today's engine.

The state (T, P) is read from the scratch run of rankine02_water
(<scratch_dir>/cases/rankine02_water/result.json, stream `condensate`);
the liquid density of pure water is asked through `rho_liquid_water`
(ThermoPackage::density, the pure-fluid route when `pureFluids` selects
water) at P, P(1+1e-6), P(1-1e-6), with IF97 (the case's selection) and
IAPWS95, and the saturation temperature at P through `T_bubble`.

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item2_rankine02.py <scratch_dir>
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import propscase as pc
scratch = os.path.abspath(sys.argv[1])
d = json.loads(open(os.path.join(scratch, "cases/rankine02_water/result.json")).read().split("<<<Choupo:result-end>>>")[0])
s = d["streams"]["condensate"]; k = d["kpis"]["feedPump"]
T, P = s["T"], s["P"]
print(f"condensate stream: T={T!r} K P={P!r} Pa vf={s['vf']}")
print(f"pump today: rho = dP/(head g) = {k['dP']/(k['head_m']*9.80665):.4f} kg/m3; v_molar_liq = {k.get('v_molar_liq')}")
for route in ("IF97", "IAPWS95", "record"):
    c = pc.make_case(scratch, "rk_" + route, ["water"], pc.ROUTES[route])
    groups = [(P, [T]), (P * (1 + 1e-6), [T]), (P * (1 - 1e-6), [T]), (P, [T - 0.001]), (P, [T + 0.001])]
    res, log = pc.scan(c, groups, {"water": 1.0}, ["rho_liquid_water", "T_bubble", "Psat_water"])
    lab = ["P", "P(1+1e-6)", "P(1-1e-6)", "T-1mK", "T+1mK"]
    for l, r in zip(lab, res):
        v = list(r.values())[0] if r else {}
        print(f"{route}\t{l}\trho_liquid_water={v.get('rho_liquid_water')}\tT_bubble(P)={v.get('T_bubble')}\tPsat(T)={v.get('Psat_water')}")

# The plan's rule, read literally: evaluate at (T, max(P, p_sat(T))) through
# today's pure-fluid density (which returns the STABLE phase).  p_sat(T) is
# taken from the same route's Psat_water at full CSV precision.
print("\nliteral rule (T, max(P, p_sat(T))) through today's stable-phase evaluator:")
print("# CAUTION: p_sat is read back from the CSV (9 significant digits). IF97's own router picks region 1 when p >= psat(T)"
      " in double precision (src/thermo/iapws/IF97.cpp:429), so the IF97 vapour rows below are the CSV rounding, not the rule.")
for route in ("IF97", "IAPWS95"):
    c = pc.make_case(scratch, "rk2_" + route, ["water"], pc.ROUTES[route])
    for TT in (T, T + 0.0005, T + 0.001, 300.0, 373.0):
        r, _ = pc.scan(c, [(P, [TT])], {"water": 1.0}, ["Psat_water"])
        ps = r[0][TT]["Psat_water"]
        Pe = max(P, ps)
        r2, _ = pc.scan(c, [(Pe, [TT])], {"water": 1.0}, ["rho_liquid_water"])
        print(f"{route}\tT={TT!r}\tp_sat(T)={ps!r}\tP_eval={Pe!r}\trho={r2[0][TT]['rho_liquid_water']}")
