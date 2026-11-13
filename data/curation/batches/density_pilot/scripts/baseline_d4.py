#!/usr/bin/env python3
"""D4 baseline: liquid water carrying dissolved CO2.

(a) McBride-Wright et al. (2015), the one of the three measured sets that STATES
    the composition: what the engine's liquid-density route gives (ideal mixing of
    the pure liquid volumes, CO2 priced as a LIQUID by its own record: the route
    refuses above CO2's Tc = 304.13 K) against the measured density, and what the
    answer would be with CO2 left out (water alone, generic route; IAPWS-95).
(b) Hebach et al. (2004), states within 0.7 K of 293.15 and 313.15 K (the
    composition is not stated; the aqueous phase is CO2-saturated): the measured
    density against pure water on IAPWS-95 at the same (T, P): the size of the
    effect the dissolved CO2 has, which a method that prices CO2 at zero misses.

usage: baseline_d4.py > baseline/d4_summary.txt   (per-point tables beside it)
"""
import os, sys, collections, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine_rho as E
from baseline_d2 import read, HERE

MW = {"water": E.mw_of("water"), "CO2": E.mw_of("CO2")}


def run(rows, comps_states):
    G = collections.OrderedDict()
    for T, P in comps_states:
        G.setdefault(round(P, 6), set()).add(T)
    G = [(P, sorted(Ts)) for P, Ts in G.items()]
    r = {}
    for c, blk, extra, key in (("water", "", (), "water_generic"), ("CO2", "", (), "CO2_generic"),
                               ("water", "pureFluids { water { method Helmholtz; equation IAPWS95; } }", ("parameters/Helmholtz",), "water_ref")):
        d = E.make_case("d4_" + key, ["water", "CO2"] if c != "water" or key != "water_ref" else ["water"], blk, extra)
        r[key], log = E.scan(d, G, c)
    return r


def main():
    lines = []
    b = read("d4b_co2water_mcbrideWright2015.tsv")
    sts = [(float(r["T_K"]), round(float(r["P_kPa"]) * 1e3, 6)) for r in b]
    res = run(b, sts)
    out = ["T_K\tP_kPa\tx_CO2\trho_meas\tU\trho_engine_mixture\tdev_engine_pct\trho_engine_CO2_left_out\tdev_leftout_pct\trho_water_IAPWS95\tdev_water_IAPWS95_pct"]
    sel = collections.defaultdict(list)
    for r in b:
        T, P, x = float(r["T_K"]), round(float(r["P_kPa"]) * 1e3, 6), float(r["x_CO2"])
        rm = float(r["rho_kg_m3"])
        rw, rc, rref = res["water_generic"][(T, P)], res["CO2_generic"][(T, P)], res["water_ref"][(T, P)]
        mix = E.mixture_rho({"water": rw, "CO2": rc}, MW, {"water": 1 - x, "CO2": x}) if rc else None
        f = lambda v: "REFUSED" if v is None else f"{v:.5g}"
        d = lambda v: "" if v is None else f"{100 * (v - rm) / rm:+.4f}"
        out.append("\t".join([f"{T}", f"{P/1e3:g}", f"{x}", f"{rm}", r["U_kg_m3"], f(mix), d(mix), f(rw), d(rw), f(rref), d(rref)]))
        sel[(round(T), "mix" if mix else "refused")].append(None if mix is None else 100 * (mix - rm) / rm)
        sel[(round(T), "leftout")].append(100 * (rw - rm) / rm)
        sel[(round(T), "ref")].append(100 * (rref - rm) / rm)
    open(os.path.join(HERE, "baseline", "d4b_mcbrideWright.tsv"), "w").write("\n".join(out) + "\n")
    lines.append("d4b McBride-Wright 2015 (x_CO2 stated): deviation of today's engine from the measured density, per isotherm")
    for T in sorted({k[0] for k in sel}):
        m = [v for v in sel.get((T, "mix"), [])]
        nref = len(sel.get((T, "refused"), []))
        lo = sel[(T, "leftout")]
        rf = sel[(T, "ref")]
        lines.append(f"  T~{T} K: engine mixture (CO2 priced as a liquid): " +
                     (f"n={len(m)} AAD {statistics.mean(abs(v) for v in m):.3f} % bias {statistics.mean(m):+.3f} % max {max(abs(v) for v in m):.3f} %" if m else f"REFUSED at all {nref} points (T above Tc of CO2)") +
                     f"; CO2 left out (water, generic route): n={len(lo)} AAD {statistics.mean(abs(v) for v in lo):.3f} % bias {statistics.mean(lo):+.3f} %;"
                     f" pure water IAPWS-95: bias {statistics.mean(rf):+.3f} % max {max(abs(v) for v in rf):.3f} %")
    # (b) Hebach, states near 293.15 and 313.15 K
    h = [r for r in read("d4a_co2water_hebach2004.tsv") if float(r["rho_kg_m3"]) > 900]
    near = [r for r in h if abs(float(r["T_K"]) - 293.15) <= 0.7 or abs(float(r["T_K"]) - 313.15) <= 0.7]
    sts = [(float(r["T_K"]), round(float(r["P_kPa"]) * 1e3, 6)) for r in near]
    res = run(near, sts)
    out = ["T_K\tP_kPa\trho_meas\tU\trho_water_IAPWS95\tincrement_over_pure_water_pct\trho_water_generic\tdev_generic_pct"]
    inc = collections.defaultdict(list)
    for r in near:
        T, P = float(r["T_K"]), round(float(r["P_kPa"]) * 1e3, 6)
        rm = float(r["rho_kg_m3"])
        rref, rg = res["water_ref"][(T, P)], res["water_generic"][(T, P)]
        out.append("\t".join([f"{T}", f"{P/1e3:g}", f"{rm}", r["U_kg_m3"], f"{rref:.5g}", f"{100*(rm-rref)/rref:+.4f}", f"{rg:.5g}", f"{100*(rg-rm)/rm:+.4f}"]))
        inc[(round(T), P >= 1e7)].append(100 * (rm - rref) / rref)
    open(os.path.join(HERE, "baseline", "d4a_hebach_near293_313.tsv"), "w").write("\n".join(out) + "\n")
    lines.append("d4a Hebach 2004 (aqueous phase, composition not stated): measured minus pure water on IAPWS-95 at the same (T, P)")
    for k in sorted(inc):
        v = inc[k]
        lines.append(f"  T~{k[0]} K, {'P >= 10 MPa' if k[1] else 'P < 10 MPa'}: n={len(v)} increment over pure water {min(v):+.3f} .. {max(v):+.3f} % (mean {statistics.mean(v):+.3f} %)")
    print("\n".join(lines))
    open(os.path.join(HERE, "baseline", "d4_summary.txt"), "w").write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
