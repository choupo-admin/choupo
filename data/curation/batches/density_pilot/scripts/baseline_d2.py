#!/usr/bin/env python3
"""D2 baseline: water + ethanol.  The engine's liquid density today is the
mole-weighted molar volume of the PURE liquids (ThermoPackage::density, step
(3)), each at its own (T, P) by its own route; here the engine's pure values
(generic route, `rho_liquid_<c>`) are combined that way and compared with both
measured sets.  The measured excess volume is V^E = V_meas - sum x_i V_i with
the pure volumes from the reference equation of state for water (the engine's
own IAPWS-95 route) and from the measured pure ethanol of the same article.

usage: baseline_d2.py            (writes baseline/d2_*.tsv and prints the summary)
"""
import os, sys, collections, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine_rho as E

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MW = {"water": E.mw_of("water"), "ethanol": E.mw_of("ethanol")}


def read(name):
    out = []
    cols = None
    for line in open(os.path.join(HERE, name)):
        if line.startswith("#") or not line.strip():
            continue
        f = line.rstrip("\n").split("\t")
        if cols is None:
            cols = f
            continue
        out.append(dict(zip(cols, f)))
    return out


def engine_pure(rows, Pcol_kPa="P_kPa"):
    states = collections.OrderedDict()
    for r in rows:
        states.setdefault(round(float(r[Pcol_kPa]) * 1e3, 6), set()).add(float(r["T_K"]))
    G = [(P, sorted(Ts)) for P, Ts in states.items()]
    res = {}
    for comp, blk, extra in (("water", "", ()), ("ethanol", "", ())):
        d = E.make_case("d2_" + comp, ["water", "ethanol"], blk, extra)
        res[comp], _ = E.scan(d, G, comp)
    d = E.make_case("d2_waterIAPWS95", ["water"],
                    "pureFluids { water { method Helmholtz; equation IAPWS95; } }",
                    ("parameters/Helmholtz",))
    res["water_ref"], _ = E.scan(d, G, "water")
    return res


def stats(devs):
    a = [abs(x) for x in devs]
    i = max(range(len(a)), key=a.__getitem__)
    return dict(n=len(devs), AAD=sum(a) / len(a), bias=sum(devs) / len(devs), max=a[i], imax=i)


def main():
    pecar = read("d2_waterEthanol_pecar2005.tsv")
    rehman = read("d2b_waterEthanol_rehmanAnsari2008.tsv")
    # measured pure ethanol of Pecar by (T, P)
    eth_meas = {(float(r["T_K"]), float(r["P_kPa"])): float(r["rho_kg_m3"]) for r in pecar if float(r["x_ethanol"]) == 1.0}

    summary = []
    for tag, rows in (("d2_pecar", pecar), ("d2b_rehman", rehman)):
        pure = engine_pure(rows)
        out = []
        for r in rows:
            T, P, x = float(r["T_K"]), float(r["P_kPa"]) * 1e3, float(r["x_ethanol"])
            P = round(P, 6)
            rw, re_, rref = pure["water"][(T, P)], pure["ethanol"][(T, P)], pure["water_ref"][(T, P)]
            xm = {"ethanol": x, "water": 1.0 - x}
            rho_eng = E.mixture_rho({"water": rw, "ethanol": re_}, MW, xm) if x < 1.0 else re_
            rho_m = float(r["rho_kg_m3"])
            Mbar = x * MW["ethanol"] + (1 - x) * MW["water"]
            # excess volume in cm3/mol of mixture: V_meas - sum x_i V_i(pure, reference/measured)
            Vm = Mbar / rho_m * 1e3                       # cm3/mol  (kg/mol / kg/m3 = m3/mol; *1e6 cm3 ; MW in g/mol -> /1000)
            Vm = Mbar * 1e-3 / rho_m * 1e6
            Vw = MW["water"] * 1e-3 / rref * 1e6
            rho_e_meas = eth_meas.get((T, float(r["P_kPa"])))
            Ve = (MW["ethanol"] * 1e-3 / rho_e_meas * 1e6) if rho_e_meas else None
            VE = (Vm - (1 - x) * Vw - x * Ve) if Ve is not None else None
            out.append(dict(T=T, P_kPa=float(r["P_kPa"]), x=x, rho_meas=rho_m, U=r["U_kg_m3"],
                            rho_engine=rho_eng, dev_pct=100 * (rho_eng - rho_m) / rho_m,
                            rho_ethanol_engine=re_, rho_ethanol_meas=rho_e_meas,
                            rho_water_engine=rw, rho_water_IAPWS95=rref, VE_cm3_mol=VE,
                            dev_ideal_with_reference_pures_pct=(100 * (Mbar * 1e-3 / (((1 - x) * Vw + x * Ve) * 1e-6) - rho_m) / rho_m if Ve is not None and x < 1.0 else None)))
        path = os.path.join(HERE, "baseline", tag + ".tsv")
        with open(path, "w") as f:
            cols = list(out[0].keys())
            f.write("\t".join(cols) + "\n")
            for o in out:
                f.write("\t".join("" if o[c] is None else (f"{o[c]:.6g}" if isinstance(o[c], float) else str(o[c])) for c in cols) + "\n")
        mix = [o for o in out if o["x"] < 1.0]
        summary.append((tag, "all", stats([o["dev_pct"] for o in mix]), mix))
        lowP = [o for o in mix if o["P_kPa"] <= 101.5]
        summary.append((tag, "0.1 MPa", stats([o["dev_pct"] for o in lowP]), lowP))
        if tag == "d2_pecar":
            for P in (10000.0, 20000.0, 30000.0, 40000.0):
                sub = [o for o in mix if o["P_kPa"] == P]
                summary.append((tag, f"{P/1000:g} MPa", stats([o["dev_pct"] for o in sub]), sub))
            for T in (298.15, 323.15, 348.15):
                sub = [o for o in lowP if o["T"] == T]
                summary.append((tag, f"0.1 MPa, {T} K", stats([o["dev_pct"] for o in sub]), sub))
        # engine pure-ethanol level against the measured pure ethanol
        pe = [o for o in out if o["x"] == 1.0]
        if pe:
            summary.append((tag, "pure ethanol (engine vs measured)", stats([o["dev_pct"] for o in pe]), pe))
    with open(os.path.join(HERE, "baseline", "d2_summary.txt"), "w") as f:
        for tag, sel, s, sub in summary:
            o = sub[s["imax"]]
            line = (f"{tag:11s} {sel:34s} n={s['n']:4d}  AAD {s['AAD']:.3f} %  bias {s['bias']:+.3f} %  "
                    f"max {s['max']:.3f} % at T={o['T']} P={o['P_kPa']} kPa x_EtOH={o['x']}")
            print(line)
            f.write(line + "\n")
        for lab, sel in (("0.1 MPa", lambda o: o["P_kPa"] <= 101.5), ("all pressures", lambda o: True)):
            sub = [o for o in summary[0][3] if o["dev_ideal_with_reference_pures_pct"] is not None and sel(o)]
            d = [o["dev_ideal_with_reference_pures_pct"] for o in sub]
            line = (f"Pecar, ideal mixing with REFERENCE pure volumes (IAPWS-95 water, measured ethanol), {lab}: "
                    f"n={len(d)} AAD {sum(abs(v) for v in d)/len(d):.3f} % max {max(abs(v) for v in d):.3f} % (the excess volume alone)")
            print(line); f.write(line + "\n")
        # excess volume maxima (Pecar, 0.1 MPa and all)
        ve = [o for o in summary[0][3] if o["VE_cm3_mol"] is not None]
        m = min(ve, key=lambda o: o["VE_cm3_mol"])
        line = f"V^E minimum (Pecar, all): {m['VE_cm3_mol']:.4f} cm3/mol at T={m['T']} P={m['P_kPa']} kPa x={m['x']}"
        print(line); f.write(line + "\n")


if __name__ == "__main__":
    main()
