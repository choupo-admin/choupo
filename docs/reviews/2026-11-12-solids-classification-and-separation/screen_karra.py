#!/usr/bin/env python3
"""Independent recomputation of screen01 (Karra's screen model as King 2001 prints it,
section 4.2.1-4.2.2, eqs. 4.30-4.48), on the case's own inputs.

Run:  python3 screen_karra.py [result.json]

Route: the authored feed table (King Table 10.1 feed, 0/feed) is re-binned onto the
case's sqrt-2 grid (3 in down, 9 classes incl. the pan) by my own code (mass uniform in
ln x inside a source class, uniform in x inside the pan); P^F(x) is read off the
cumulative with the same within-class assumption; the Karra factors, the loading K,
d50 = h_T G_c / K^0.148 and the Rosin-Rammler partition c = 1 - exp(-0.693 (d/d50)^5.9)
at each class's geometric-mean size follow.  The same arithmetic is also done directly
on the authored table (no re-binning) to show how much the grid itself moves.
Measured (King Table 10.1, Hennings & Grant 1982): oversize/feed 0.3054.
"""
import json, math, sys

IN = 25.4e-3
src_edges = [0, 6.350e-3, 9.525e-3, 1.270e-2, 1.905e-2, 2.540e-2, 3.175e-2, 3.810e-2, 5.080e-2, 7.620e-2]
src_w = [0.2540, 0.1096, 0.0811, 0.1653, 0.1173, 0.0914, 0.0671, 0.0694, 0.0448]
s = sum(src_w); src_w = [v / s for v in src_w]

xMax, ratio, n = 3 * IN, 1.41421356, 9
grid = [0.0] + [xMax / ratio ** (n - 1 - k) for k in range(n)]
xrep = [grid[1] / ratio] + [math.sqrt(grid[k] * grid[k + 1]) for k in range(1, n)]


def cum(edges, w, x):
    if x <= edges[0]:
        return 0.0
    if x >= edges[-1]:
        return 1.0
    U = 0.0
    for k in range(len(w)):
        lo, hi = edges[k], edges[k + 1]
        if x < hi:
            t = x / hi if lo <= 0 else math.log(x / lo) / math.log(hi / lo)
            return U + t * w[k]
        U += w[k]
    return 1.0


gw = [cum(src_edges, src_w, grid[k + 1]) - cum(src_edges, src_w, grid[k]) for k in range(n)]


def karra(edges, w, xr):
    h, dw, th, area, rhoB = 1.25 * IN, 0.5 * IN, math.radians(20), 1.308055, 1762.04
    hT = ((h + dw) * math.cos(th) - dw) * 1e3                      # mm (4.31)
    A = 12.13 * hT ** 0.32 - 10.3 if hT < 51 else 0.34 * hT + 14.41   # 4.32-4.33
    P = lambda xmm: cum(edges, w, xmm * 1e-3)
    PhT, Ph2, P125, P075, Ph = P(hT), P(hT / 2), P(1.25 * hT), P(0.75 * hT), P(h * 1e3)
    Pbar = 1 - PhT
    B = 1.6 - 1.2 * Pbar if Pbar <= 0.87 else 4.275 - 4.25 * Pbar  # 4.36
    x = Ph2
    C = (0.7 + 1.2 * x if x <= 0.3 else 2.053 * x ** 0.564 if x <= 0.55
         else 3.35 * x ** 1.37 if x <= 0.8 else 5 * x - 1.5)        # 4.37
    D, E, F = 1.1 - 0.1 * 1, 1.0, rhoB / 1600                       # 4.38, dry, 4.39
    Gc = 0.975 * (1 - P125 + P075) ** 0.511                         # 4.40
    WF = 900.9587 * 100.0869 / 1000                                 # t/h (feed kmol/h x MW)
    K = (WF * PhT / area) / (A * B * C * D * E * F)                 # 4.42
    d50 = hT * Gc / K ** 0.148                                      # mm (4.43)
    c = [1 - math.exp(-0.693 * (xx * 1e3 / d50) ** 5.9) for xx in xr]
    Y = sum(ci * wi for ci, wi in zip(c, w))
    U = sum((1 - ci) * wi for ci, wi in zip(c, w)) * WF
    Th = A * B * C * D * E * F * Gc * area
    return dict(hT=hT, A=A, B=B, C=C, D=D, F=F, Gc=Gc, K=K, d50_mm=d50, Y=Y,
                AUF=U / Th, eff=U / (WF * Ph), PhT=PhT, Ph2=Ph2, c=c)


rg = karra(grid, gw, xrep)
src_rep = [src_edges[1] / math.sqrt(2)] + [math.sqrt(src_edges[k] * src_edges[k + 1]) for k in range(1, 9)]
rs = karra(src_edges, src_w, src_rep)
print("grid edges [in]:", " ".join("%.4f" % (e / IN) for e in grid))
print("grid feed fractions:", " ".join("%.5f" % v for v in gw))
for lab, r in (("on the case grid", rg), ("on the authored table", rs)):
    print("[%s] h_T %.4f mm  A %.4f  B %.4f  C %.4f  D %.3f  F %.5f  Gc %.5f  K %.5f  d50 %.4f mm"
          % (lab, r["hT"], r["A"], r["B"], r["C"], r["D"], r["F"], r["Gc"], r["K"], r["d50_mm"]))
    print("[%s] oversize/feed %.5f (measured 0.3054 -> %+.2f %%)  AUF %.4f  efficiency %.4f"
          % (lab, r["Y"], 100 * (r["Y"] / 0.3054 - 1), r["AUF"], r["eff"]))
print("partition c at the grid sizes (um: c):")
for xx, cc in zip(xrep, rg["c"]):
    print("   %9.1f  %.6f" % (xx * 1e6, cc))
if len(sys.argv) > 1:
    J = json.load(open(sys.argv[1]))
    k = J["kpis"]["screen"]
    for key, mine in (("hT_mm", rg["hT"]), ("karra_A", rg["A"]), ("karra_B", rg["B"]),
                      ("karra_C", rg["C"]), ("karra_Gc", rg["Gc"]), ("karra_K", rg["K"]),
                      ("karra_d50_um", rg["d50_mm"] * 1e3), ("solidsTo_oversize", rg["Y"]),
                      ("areaUtilisationFactor", rg["AUF"]), ("screeningEfficiency", rg["eff"])):
        e = k.get(key)
        print("  %-24s engine %-14.8g mine %-14.8g rel %.2e" % (key, e, mine, (e / mine - 1) if e else float('nan')))

# ---- sensitivity: the partition integrated over each class (mass uniform in ln x)
#      instead of evaluated at the class's geometric-mean size (the engine's choice).
def integrated_Y(edges, w, d50mm, m=5.9, npts=400):
    Y = 0.0
    for k in range(len(w)):
        lo, hi = edges[k], edges[k + 1]
        if lo <= 0:                     # pan: uniform in x
            xs = [hi * (i + 0.5) / npts for i in range(npts)]
        else:
            xs = [lo * (hi / lo) ** ((i + 0.5) / npts) for i in range(npts)]
        cbar = sum(1 - math.exp(-0.693 * (x * 1e3 / d50mm) ** m) for x in xs) / npts
        Y += w[k] * cbar
    return Y
Yi = integrated_Y(grid, gw, rg["d50_mm"])
print("oversize/feed with the partition INTEGRATED over each grid class: %.5f (point value %.5f; measured 0.3054)"
      % (Yi, rg["Y"]))
