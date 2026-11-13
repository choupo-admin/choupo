#!/usr/bin/env python3
"""D3: the density correlation of Olsson, Jernqvist and Aly (1997), Int. J.
Thermophys. 18(3), 779-793, Eqs. (6)-(9), Table IV (p. 785), window Table III
(p. 783), evaluated at every measured point of two independent laboratories.

  rho = b1 + b2 t + b3 t^2                [kg/m3], t in degC            (6)
  b_j = c_j0 + c_j1 x^(1/2) + ... + c_j5 x^(5/2)                    (7)-(9)
  x = mass fraction of WATER (the paper's variable), not of NaOH.

The 18 coefficients below were compared digit by digit with the page image of
Table IV (300 dpi crop) on 2026-11-13: all agree with the transcription in
docs/design/naoh-water-olsson1997.md section 1.2.

usage: olsson_density.py            (writes baseline/d3_olsson_*.tsv, prints the summary)
"""
import os
import statistics

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

K = [5007.2279636, -25131.164248, 74107.692582, -104657.48684, 69821.773186, -18145.911810]
L = [-64.786269079, 525.34360564, -1608.4471903, 2350.9753235, -1660.9035108, 457.64374355]
M = [0.24436776978, -1.9737722344, 6.04601497138, -8.9090614947, 6.37146769397, -1.7816083111]

# Table III, density column: (t_lo, t_hi_exclusive, x_min); the last band is closed at 200 degC
WINDOW = [(0, 10, 0.800), (10, 20, 0.700), (20, 60, 0.500), (60, 70, 0.400), (70, 150, 0.300), (150, 200.0000001, 0.200)]


def rho(x, t):
    s = [x ** (0.5 * j) for j in range(6)]
    b1 = sum(K[j] * s[j] for j in range(6))
    b2 = sum(L[j] * s[j] for j in range(6))
    b3 = sum(M[j] * s[j] for j in range(6))
    return b1 + b2 * t + b3 * t * t


def inside(x, t):
    for lo, hi, xm in WINDOW:
        if lo <= t < hi:
            return x >= xm - 1e-12
    return False


def read(name):
    rows, cols = [], None
    for line in open(os.path.join(HERE, name)):
        if line.startswith("#") or not line.strip():
            continue
        f = line.rstrip("\n").split("\t")
        if cols is None:
            cols = f
            continue
        rows.append(dict(zip(cols, f)))
    return rows


def summarise(tag, rows):
    ins = [r for r in rows if r["in_window"]]
    d = [r["dev_pct"] for r in ins]
    da = [r["dev_kg_m3"] for r in ins]
    lines = [f"{tag}: points {len(rows)}, inside the correlation's window {len(ins)}"]
    if d:
        i = max(range(len(d)), key=lambda k: abs(d[k]))
        lines.append(f"  AAD {statistics.mean(abs(v) for v in d):.3f} % ({statistics.mean(abs(v) for v in da):.2f} kg/m3), "
                     f"bias {statistics.mean(d):+.3f} % ({statistics.mean(da):+.2f} kg/m3), "
                     f"max {abs(d[i]):.3f} % ({abs(da[i]):.2f} kg/m3) at T={ins[i]['T_K']} K, w_NaOH={ins[i]['w_NaOH']:.4f}"
                     f"{', P=' + str(ins[i]['P_kPa']) + ' kPa' if 'P_kPa' in ins[i] else ''}")
        stat_U = [r["U"] for r in ins if r["U"] is not None]
        if stat_U:
            lines.append(f"  stated U of the measurements: {min(stat_U):g}-{max(stat_U):g} kg/m3 "
                         f"(mean {statistics.mean(stat_U):.2f}); points with |dev| > U: "
                         f"{sum(1 for r in ins if r['U'] is not None and abs(r['dev_kg_m3']) > r['U'])} of {len(ins)}")
        for key in sorted({r['T_K'] for r in ins}):
            s = [r for r in ins if r["T_K"] == key]
            lines.append(f"  T={key:g} K: n={len(s)} bias {statistics.mean(r['dev_pct'] for r in s):+.3f} % "
                         f"AAD {statistics.mean(abs(r['dev_pct']) for r in s):.3f} %")
    return lines


def main():
    print("check values of docs/design/naoh-water-olsson1997.md: x=1, 20 degC ->", f"{rho(1.0, 20):.2f}",
          "(note: 997.6; the correlation window starts at x = 0.8 below 10 degC and 0.7 at 10-20 degC, x = 1 is the pure-water limit)")
    print("                                                 50 wt % NaOH, 20 degC ->", f"{rho(0.5, 20):.2f}", "(note: 1522.9)")
    out = []
    for fname, tag, wkey in (("d3a_naoh_galindoLuna2019.tsv", "d3a", "w_NaOH"), ("d3b_naoh_hnedkovsky2007.tsv", "d3b", "w_NaOH")):
        rows = []
        for r in read(fname):
            w = float(r["w_NaOH"])
            T = float(r["T_K"])
            t = T - 273.15
            x = 1.0 - w
            rm = float(r["rho_kg_m3"])
            rc = rho(x, t)
            rows.append(dict(T_K=T, P_kPa=float(r["P_kPa"]), w_NaOH=w, rho_meas=rm, U=float(r["U_kg_m3"]) if r["U_kg_m3"] else None,
                             rho_olsson=rc, dev_kg_m3=rc - rm, dev_pct=100 * (rc - rm) / rm,
                             in_window=inside(x, t)))
        path = os.path.join(HERE, "baseline", f"d3_olsson_{tag}.tsv")
        with open(path, "w") as f:
            f.write("T_K\tP_kPa\tw_NaOH\trho_meas\tU\trho_olsson\tdev_kg_m3\tdev_pct\tin_window\n")
            for r in rows:
                f.write("\t".join(["" if v is None else (f"{v:.6g}" if isinstance(v, float) else str(v)) for v in
                                   (r["T_K"], r["P_kPa"], r["w_NaOH"], r["rho_meas"], r["U"], r["rho_olsson"], r["dev_kg_m3"], r["dev_pct"], int(r["in_window"]))]) + "\n")
        out += summarise(tag, rows)
        if tag == "d3b":
            for P in sorted({r["P_kPa"] for r in rows}):
                out += summarise(f"d3b at {P/1000:g} MPa", [r for r in rows if r["P_kPa"] == P])
    txt = "\n".join(out)
    print(txt)
    open(os.path.join(HERE, "baseline", "d3_olsson_summary.txt"), "w").write(txt + "\n")


if __name__ == "__main__":
    main()
