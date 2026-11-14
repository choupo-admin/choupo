#!/usr/bin/env python3
"""recompute.py <repo> <scratch> : the three hand recomputations per case, from the
published profile + the case's own dicts (Antoine coefficients read from the case's
component records).  Uses runs/<tag>_sweep/result.json (the golden sweep point)."""
import json, math, re, sys
from pathlib import Path

repo, scratch = Path(sys.argv[1]), Path(sys.argv[2])
CASES = [("ratebased01", "ratebased01_schulz_0p10bar", 0.10),
         ("ratebased02", "ratebased02_schulz_0p02bar", 0.02),
         ("ratebased03", "ratebased03_schulz_delft_0p10bar", 0.10),
         ("ratebased04", "ratebased04_schulz_delft_0p02bar", 0.02)]
which = sys.argv[3] if len(sys.argv) > 3 else "sweep"


def antoine(case, comp):
    t = (repo / "tutorials/steady/distillation" / case / "constant/components" / f"{comp}.dat").read_text()
    m = re.search(r"vaporPressure\s*\{[^}]*coefficients\s*\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s*\)", t, re.S)
    A, B, C = map(float, m.groups())
    return lambda T: 10 ** (A - B / (T + C)) * 1e5  # Pa


def bubbleT(x1, P, ps1, ps2):
    lo, hi = 250.0, 600.0
    for _ in range(200):
        T = 0.5 * (lo + hi)
        f = x1 * ps1(T) + (1 - x1) * ps2(T) - P
        if f > 0: hi = T
        else: lo = T
    return T


def rel(a, b):
    return (b - a) / a


rows = []
for tag, case, Ptop_bar in CASES:
    r = json.loads((scratch / "runs" / f"{tag}_{which}" / "result.json").read_text())
    K = r["kpis"]["column"]
    c = r["profiles"]["column"]["columns"]
    ps1, ps2 = antoine(case, "pXylene"), antoine(case, "oXylene")
    Ptop = Ptop_bar * 1e5
    Pb = K["P_bottom_bar"] * 1e5
    M = len(c["z"])
    Z = 2.2
    # --- faces from the profile midpoints ---
    Tb = K["T_bottom"]
    xN = K["x_reboiler_LK"]
    yreb = xN * ps1(Tb) / Pb
    yreb_n = yreb / (yreb + (1 - xN) * ps2(Tb) / Pb)
    yface = [0.0] * (M + 1)
    yface[M] = yreb_n
    for k in range(M - 1, -1, -1):
        yface[k] = 2 * c["y_pXylene"][k] - yface[k + 1]
    xf = yface[0]
    for k in range(M):
        xf = 2 * c["x_pXylene"][k] - xf
    xT, xB = yface[0], xf
    # --- alpha as the KPI defines it (RateBasedSegment.cpp endsOf): geometric mean of
    #     the relative volatility at the top (reflux at its bubble point, Ptop) and below
    #     the bed (x_B at its bubble point, P_bottom) ---
    def alpha_at(x1, P):
        T = bubbleT(x1, P, ps1, ps2)
        return ps1(T) / ps2(T), T
    aT, Ttop = alpha_at(xT, Ptop)
    aB, Tbel = alpha_at(xB, Pb)
    alpha = math.sqrt(aT * aB)
    HETP = Z * math.log(alpha) / math.log((xT / (1 - xT)) / (xB / (1 - xB)))
    # with the engine's alpha and KPI compositions (the coordinator's formula)
    a_k, xT_k, xB_k = K["alpha_mean"], K["x_reflux_LK"], K["x_belowBed_LK"]
    HETP_k = Z * math.log(a_k) / math.log((xT_k / (1 - xT_k)) / (xB_k / (1 - xB_k)))
    rows.append((tag, "alpha_mean", K["alpha_mean"], alpha))
    rows.append((tag, "x_reflux_LK (profile faces)", K["x_reflux_LK"], xT))
    rows.append((tag, "x_belowBed_LK (profile faces)", K["x_belowBed_LK"], xB))
    rows.append((tag, "T_top", K["T_top"], Ttop))
    rows.append((tag, "HETP (my alpha, profile faces)", K["HETP"], HETP))
    rows.append((tag, "HETP (KPI alpha, KPI x)", K["HETP"], HETP_k))
    # --- 2: summed interfacial transfer of the light component ---
    AT = math.pi / 4 * 1.22 ** 2
    dz = Z / M
    Wsum = sum(c["Na_pXylene"]) * AT * dz
    Vb = K["V_boilup"]
    Vtop = K["V_top_over_V_bottom"] * Vb
    bal = Vtop * K["x_reflux_LK"] - Vb * K["x_belowBed_LK"]
    rows.append((tag, "sum W_pX vs V_top x_T - V_b x_B [kmol/s]", bal, Wsum))
    Wh = sum(c["Na_oXylene"]) * AT * dz
    rows.append((tag, "sum W_oX vs V_top(1-x_T) - V_b(1-x_B)", Vtop * (1 - K["x_reflux_LK"]) - Vb * (1 - K["x_belowBed_LK"]), Wh))
    # --- 3: segment 50 (0-based index 50, z = 50.5 dz) ---
    k = 50
    HG, HL, m, V, L = c["HG"][k], c["HL"][k], c["m"][k], c["V"][k], c["L"][k]
    HOG = HG + m * V / L * HL
    share = m * V / L * HL / HOG
    rows.append((tag, "seg50 H_OG (published column vs H_G + mV/L H_L)", c["HOG"][k], HOG))
    rows.append((tag, "seg50 liquid share", c["liquidFilmShare"][k], share))
    # the slope m from Antoine at the segment's mean liquid
    xm = c["x_pXylene"][k]
    h = 1e-4
    def ystar(x1, P):
        T = bubbleT(x1, P, ps1, ps2); return x1 * ps1(T) / P
    Pm = c["P"][k]
    mm = (ystar(xm + h, Pm) - ystar(xm - h, Pm)) / (2 * h)
    rows.append((tag, "seg50 m (Antoine central difference)", m, mm))
    # temperatures
    dTV = [ti - tv for ti, tv in zip(c["T_I"], c["T_V"])]
    dTL = [tl - ti for ti, tl in zip(c["T_I"], c["T_L"])]
    rows.append((tag, "max|T_I-T_V| from profile", K["TI_minus_TV_maxAbs"], max(map(abs, dTV))))
    rows.append((tag, "max|T_L-T_I| from profile", K["TL_minus_TI_maxAbs"], max(map(abs, dTL))))
    # T_I vs bubble point of x_I at P (interface equilibrium, ideal)
    eqerr = max(abs(c["T_I"][j] - bubbleT(c["xI_pXylene"][j], c["P"][j], ps1, ps2)) for j in range(M))
    rows.append((tag, "max|T_I - Tbub(x_I)| (Antoine)", 0.0, eqerr))
    yIerr = max(abs(c["yI_pXylene"][j] - c["xI_pXylene"][j] * ps1(c["T_I"][j]) / c["P"][j]) for j in range(M))
    rows.append((tag, "max|yI - xI Psat/P|", 0.0, yIerr))
    # print dT profile summary
    print(tag, "T_I-T_V at z top/mid/bottom:", [round(dTV[i], 4) for i in (0, M // 2, M - 1)],
          " T_L-T_I:", [round(dTL[i], 5) for i in (0, M // 2, M - 1)], " sign(T_I-T_V)<0 count", sum(1 for d in dTV if d < 0))

print(f"{'case':12s} {'quantity':48s} {'engine':>18s} {'mine':>18s} {'rel diff':>11s}")
for tag, q, e, me in rows:
    rd = (me - e) / e if e != 0 else float('nan')
    print(f"{tag:12s} {q:48s} {e:18.11g} {me:18.11g} {rd:11.2e}")
