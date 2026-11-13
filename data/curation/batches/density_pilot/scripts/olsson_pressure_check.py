#!/usr/bin/env python3
"""D3: the Olsson density correlation has NO pressure argument (Eq. 6 is
rho(t, x)).  The 2-10 MPa set of Hnedkovsky et al. (2007) therefore compares
the correlation with a measurement at a pressure the correlation does not
carry.  This script estimates how much of the deviation is that pressure
step, using water as the stand-in for the dilute solution (the set's mass
fractions are 0.4-25 %): the factor rho_w(T, P) / rho_w(T, P_ref) from the
engine's IAPWS-95 route, P_ref = max(0.1 MPa, p_sat(T)) with p_sat from the
engine's IF97 route.  It is an ESTIMATE that shows the size of the effect,
not a corrected law; the threshold in the design note does not rest on it.
"""
import os, sys, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine_rho as E
import olsson_density as O

HERE = O.HERE
cols = None
data = []
for line in open(os.path.join(HERE, "baseline", "d3_olsson_d3b.tsv")):
    f = line.rstrip("\n").split("\t")
    if cols is None:
        cols = f
        continue
    r = dict(zip(cols, f))
    if r["in_window"] == "1":
        data.append(r)
Ts = sorted({float(r["T_K"]) for r in data})
dif97 = E.make_case("d3_if97", ["water"], "pureFluids { water { method IF97; } }")
psat, _ = E.scan(dif97, [(1e5, Ts)], "water", prop="Psat_water")
pref = {T: max(1e5, psat[(T, 1e5)] or 1e5) for T in Ts}
G = []
for T in Ts:
    Ps = sorted({float(r["P_kPa"]) * 1e3 for r in data if float(r["T_K"]) == T} | {pref[T] * 1.001})
    G.append((T, Ps))
dH = E.make_case("d3_helm", ["water"], "pureFluids { water { method Helmholtz; equation IAPWS95; } }",
                 ("parameters/Helmholtz",))
# one scan per pressure: group temperatures by pressure
byP = {}
for T, Ps in G:
    for P in Ps:
        byP.setdefault(P, []).append(T)
res, _ = E.scan(dH, [(P, sorted(Tl)) for P, Tl in byP.items()], "water")
out = []
for r in data:
    T, P = float(r["T_K"]), float(r["P_kPa"]) * 1e3
    f = res[(T, P)] / res[(T, pref[T] * 1.001)]
    rc = float(r["rho_olsson"]) * f
    rm = float(r["rho_meas"])
    out.append((T, P, pref[T], f, 100 * (rc - rm) / rm))
print("T_K\tP_MPa\tP_ref_MPa\tfactor\tdev_pct_after_estimate")
lines = ["T_K\tP_MPa\tP_ref_MPa\tfactor\tdev_pct_after_estimate"]
for T in Ts:
    for P in sorted({o[1] for o in out if o[0] == T}):
        s = [o for o in out if o[0] == T and o[1] == P]
        l = f"{T:g}\t{P/1e6:g}\t{s[0][2]/1e6:.4g}\t{s[0][3]:.6f}\t{statistics.mean(o[4] for o in s):+.3f} (mean of {len(s)})"
        print(l)
        lines.append(l)
d = [o[4] for o in out]
l = f"# all in-window points of d3b: AAD after the pressure-step estimate {statistics.mean(abs(v) for v in d):.3f} %, bias {statistics.mean(d):+.3f} %, max {max(abs(v) for v in d):.3f} %"
print(l)
lines.append(l)
open(os.path.join(HERE, "baseline", "d3_olsson_pressure_estimate.tsv"), "w").write("\n".join(lines) + "\n")
