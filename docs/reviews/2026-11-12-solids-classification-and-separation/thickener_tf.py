#!/usr/bin/env python3
"""Independent recomputation of thickener01 (Talmage & Fitch 1955; Coe & Clevenger 1916
as Wills & Napier-Munn 2006 eqs. 15.4-15.6 print them) on Geankoplis Problem 30.1-11's
settling test, as the case declares it.

Run:  python3 thickener_tf.py [result.json]

Talmage-Fitch: H_u = C0 H0 / C_u; tangent at the compression point (t_c, H_c) with
slope v; intercept H_i = H_c + v t_c; t_u = (H_i - H_u)/v when H_u < H_c; A = W t_u/(C0 H0).
Coe-Clevenger: at each test point the Kynch layer C = C0 H0 / H_i, v the local slope;
A = max W (1/C - 1/C_u)/v over layers with C < C_u.
The slope is taken three ways to show what the tangent depends on: the 3-point parabola
(the engine's stated rule), the backward secant and the forward secant.
"""
import json, sys

t = [0, 1800, 3600, 6300, 10800, 18000, 43200, 72000]
H = [0.360, 0.285, 0.211, 0.150, 0.125, 0.113, 0.102, 0.090]
C0, Cu, H0 = 250.0, 700.0, 0.360
W = 359.6874316 * 100.0869 / 3600.0         # kg/s of solids
tc = 1.75 * 3600

def parab_slope(j):
    x0, x1, x2 = t[j - 1], t[j], t[j + 1]
    y0, y1, y2 = H[j - 1], H[j], H[j + 1]
    x = x1
    d0 = ((x - x1) + (x - x2)) / ((x0 - x1) * (x0 - x2))
    d1 = ((x - x0) + (x - x2)) / ((x1 - x0) * (x1 - x2))
    d2 = ((x - x0) + (x - x1)) / ((x2 - x0) * (x2 - x1))
    return y0 * d0 + y1 * d1 + y2 * d2

Hu = C0 * H0 / Cu
j = t.index(tc)
res = {}
for lab, dH in (("parabola", parab_slope(j)), ("backward secant", (H[j] - H[j - 1]) / (t[j] - t[j - 1])),
                ("forward secant", (H[j + 1] - H[j]) / (t[j + 1] - t[j]))):
    v = -dH
    Hi = H[j] + v * tc
    tu = (Hi - Hu) / v
    A = W * tu / (C0 * H0)
    res[lab] = (v, Hi, tu, A)
    print("T&F [%-15s] v %.4e m/s  H_i %.5f m  t_u %.1f s (%.3f h)  A %.2f m2  (%.4f m2 per t/d)"
          % (lab, v, Hi, tu, tu / 3600, A, A / (W * 86.4)))
print("H_u = %.6f m;  W = %.6f kg/s (%.2f t/d)" % (Hu, W, W * 86.4))
# Coe-Clevenger over the test's layers, slopes from the 3-point parabola (ends clamped)
Acc, best = 0.0, None
for k in range(len(t)):
    jj = min(max(k, 1), len(t) - 2)
    x0, x1, x2 = t[jj - 1], t[jj], t[jj + 1]
    y0, y1, y2 = H[jj - 1], H[jj], H[jj + 1]
    x = t[k]
    d = (y0 * ((x - x1) + (x - x2)) / ((x0 - x1) * (x0 - x2))
         + y1 * ((x - x0) + (x - x2)) / ((x1 - x0) * (x1 - x2))
         + y2 * ((x - x0) + (x - x1)) / ((x2 - x0) * (x2 - x1)))
    v = max(0.0, -d)
    Hi = H[k] + v * t[k]
    C = C0 * H0 / Hi
    if v > 0 and C < Cu:
        a = W * (1 / C - 1 / Cu) / v
        if a > Acc:
            Acc, best = a, (t[k], C, v)
print("Coe-Clevenger max area %.2f m2 at t = %s s (C %.2f kg/m3, v %.4e m/s)" % (Acc, best[0], best[1], best[2]))
v, Hi, tu, A = res["parabola"]
Acp = W * (1 / (C0 * H0 / Hi) - 1 / Cu) / v
print("identity: Coe-Clevenger at the compression layer %.6f m2 vs T&F %.6f m2 (rel %.1e)" % (Acp, A, Acp / A - 1))
if len(sys.argv) > 1:
    J = json.load(open(sys.argv[1]))
    k = J["kpis"]["thickener"]
    for key, mine in (("underflowLine_Hu_m", Hu), ("compression_v_m_s", v), ("tangentIntercept_Hi_m", Hi),
                      ("tu_s", tu), ("areaTalmageFitch_m2", A), ("areaCoeClevenger_m2", Acc)):
        ev = k.get(key)
        print("  %-22s engine %-14.9g mine %-14.9g rel %.2e" % (key, ev, mine, ev / mine - 1))
