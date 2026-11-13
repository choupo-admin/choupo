#!/usr/bin/env python3
"""D1 baseline: the engine's liquid density of water at the states PRINTED in
Wagner & Pruss (2002) Tables 13.1 / 13.2 (d1_water_iapws95.tsv), on three
routes -- generic (no pureFluids), IF97, Helmholtz IAPWS95 -- and the deviation
of each from the printed value.

usage: baseline_d1.py > baseline/d1_water.tsv     (summary on stderr)
"""
import os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine_rho as E

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = []
for line in open(os.path.join(HERE, "d1_water_iapws95.tsv")):
    if line.startswith("kind") or not line.strip():
        continue
    k, T, P, rho, tab, page, _ = line.rstrip("\n").split("\t")
    T_ = float(T)
    P = float(P)
    # saturated rows are evaluated 0.1 % above their printed psat so the liquid root is the one asked
    Peval = P * 1.001 if (k == 'sat' or (P <= 0.101325 and T_ >= 372.7)) else P
    rows.append((k, float(T), P, float(rho), tab, page, Peval))

groups = collections.OrderedDict()
for k, T, P, rho, tab, page, Peval in rows:
    Pa = round(Peval * 1e6, 6)
    groups.setdefault(Pa, []).append(T)
G = [(Pa, sorted(set(Ts))) for Pa, Ts in groups.items()]

routes = {
    "generic": ("", ()),
    "IF97": ("pureFluids { water { method IF97; } }", ()),
    "Helmholtz": ("pureFluids { water { method Helmholtz; equation IAPWS95; } }",
                  ("parameters/Helmholtz",)),
}
res = {}
for name, (blk, extra) in routes.items():
    d = E.make_case("d1_" + name, ["water"], blk, extra)
    res[name], log = E.scan(d, G, "water")
    open(os.path.join(d, "run.log"), "w").write(log)

print("kind\tT_K\tp_MPa\trho_printed\ttable\tpage\trho_generic\trho_IF97\trho_Helmholtz\t"
      "dev_generic_pct\tdev_IF97_pct\tdev_Helmholtz_pct")
for k, T, P, rho, tab, page, Peval in rows:
    Pa = round(Peval * 1e6, 6)
    vals = [res[r].get((T, Pa)) for r in ("generic", "IF97", "Helmholtz")]
    devs = [None if v is None else 100.0 * (v - rho) / rho for v in vals]
    f = lambda v, n: "nan" if v is None else f"{v:.{n}f}"
    print("\t".join([k, str(T), str(P), str(rho), tab, page] + [f(v, 4) for v in vals]
                    + [f(v, 5) for v in devs]))
