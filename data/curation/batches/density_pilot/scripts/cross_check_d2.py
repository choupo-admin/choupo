#!/usr/bin/env python3
"""D2: are the two measured sets mutually consistent?  Rehman & Ansari (2008)
at 298.15 and 323.15 K, 101 kPa, against Pecar & Dolecek (2005) at the same
temperatures, 100 kPa, interpolated in the excess volume V^E(x) (linear between
Pecar's neighbours, which are 0.02-0.05 apart in x).  Reads the two baseline
tables written by baseline_d2.py.  The pressure difference (1 kPa) is below the
resolution of either set.
"""
import os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MW_W, MW_E = 18.015, 46.069


def read(name):
    rows, cols = [], None
    for line in open(os.path.join(HERE, "baseline", name)):
        f = line.rstrip("\n").split("\t")
        if cols is None:
            cols = f
            continue
        rows.append({c: (float(v) if v not in ("",) else None) for c, v in zip(cols, f) if c not in ()})
    return rows


pec = [r for r in read("d2_pecar.tsv") if r["P_kPa"] == 100.0 and r["x"] < 1.0]
reh = read("d2b_rehman.tsv")
out = []
for T in (298.15, 323.15):
    P = sorted([(r["x"], r["VE_cm3_mol"]) for r in pec if r["T"] == T])
    for r in reh:
        if r["T"] != T:
            continue
        x = r["x"]
        lo = max((p for p in P if p[0] <= x), default=None)
        hi = min((p for p in P if p[0] >= x), default=None)
        if lo is None or hi is None:
            continue
        ve = lo[1] if hi[0] == lo[0] else lo[1] + (hi[1] - lo[1]) * (x - lo[0]) / (hi[0] - lo[0])
        # pure volumes at this T: IAPWS-95 water, Pecar's measured ethanol (the row at x = 1 of d2_pecar)
        rho_e = [q["rho_ethanol_meas"] for q in read("d2_pecar.tsv") if q["T"] == T and q["P_kPa"] == 100.0 and q["x"] == 1.0][0]
        Vw = MW_W * 1e-3 / r["rho_water_IAPWS95"] * 1e6
        Ve = MW_E * 1e-3 / rho_e * 1e6
        V = (1 - x) * Vw + x * Ve + ve
        Mbar = x * MW_E + (1 - x) * MW_W
        rho_p = Mbar * 1e-3 / (V * 1e-6)
        out.append((T, x, r["rho_meas"], rho_p, 100 * (rho_p - r["rho_meas"]) / r["rho_meas"], r["U"]))
print("T_K\tx_ethanol\trho_Rehman\trho_from_Pecar_interp\tdiff_pct\tU_Rehman")
for o in out:
    print("\t".join(f"{v:.5g}" for v in o))
d = [abs(o[4]) for o in out]
print(f"# n={len(d)}  mean |diff| {sum(d)/len(d):.3f} %  max {max(d):.3f} %")

# Rehman's points against IDEAL mixing with the reference pure volumes (IAPWS-95 water,
# Pecar's measured ethanol): the excess volume alone, on the second laboratory's set.
eth = {q["T"]: q["rho_ethanol_meas"] for q in read("d2_pecar.tsv") if q["P_kPa"] == 100.0 and q["x"] == 1.0}
e = []
for r in reh:
    if r["T"] in eth:
        x = r["x"]
        V = (1 - x) * MW_W / r["rho_water_IAPWS95"] + x * MW_E / eth[r["T"]]
        rho = (x * MW_E + (1 - x) * MW_W) / V
        e.append(100 * (rho - r["rho_meas"]) / r["rho_meas"])
print(f"# Rehman, ideal volumes with reference pure values, 298.15 and 323.15 K: n={len(e)} "
      f"AAD {sum(abs(v) for v in e)/len(e):.3f} %  max {max(abs(v) for v in e):.3f} %  (the excess volume alone)")
