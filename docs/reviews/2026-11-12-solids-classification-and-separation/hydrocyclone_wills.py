#!/usr/bin/env python3
"""Independent recomputation of hydrocyclone01 (Wills & Napier-Munn 2006 Table 9.1).

Run:  python3 hydrocyclone_wills.py [result.json]

The model implemented is `declared` only: a tabulated CORRECTED partition c_k and the
water split R_f, which is also the solids bypass, a_k = R_f + (1 - R_f) c_k (Kelsall;
Wills eq. 9.15).  No Plitt or Nageswararao correlation is built, so there is no
predicted cut size: d50c is read off the declared curve.

Two routes:
  (1) the BOOK's arithmetic: column 8 (% of each feed class to the underflow) as the
      actual curve y_k; U/F = SUM y_k w_k; R_f = (U/F) x (U/F dilution) / (feed dilution);
  (2) the CASE's declared inputs run forward (the engine's problem): a_k from the
      declared c_k and R_f = 0.39; U/F, both dilutions, d50 (actual) and d50c by
      interpolation linear in ln x between class geometric means (the engine's stated rule).
The case's inputs (c_k, R_f) were DERIVED from Table 9.1 itself, so route (2)
reproducing the book is a reconstruction, not a prediction.
"""
import json, math, sys

# feed on the book's sieve classes (0/feed): -74, 74-104.7, 104.7-148, 148-209.3,
# 209.3-296, 296-592, 592-1184, 1184-2368 um
w_book = [0.301, 0.046, 0.070, 0.082, 0.079, 0.184, 0.142, 0.096]
y_book = [0.372, 0.413, 0.443, 0.500, 0.608, 0.886, 1.0, 1.0]   # Wills col. 8 (case comments)
feed_dil = 0.57
UF_book = sum(a * b for a, b in zip(y_book, w_book))
Rf_book = UF_book * 0.34 / feed_dil
print("(1) book: U/F = %.5f (Wills 0.652);  R_f = U/F x 0.34 / 0.57 = %.5f (Wills 0.39)" % (UF_book, Rf_book))

# (2) the case grid: sqrt-2 from 2368 um, 11 classes incl. pan
xMax, r, n = 2368e-6, 1.41421356, 11
e = [0.0] + [xMax / r ** (n - 1 - k) for k in range(n)]
xr = [e[1] / r] + [math.sqrt(e[k] * e[k + 1]) for k in range(1, n)]
# map the book table onto the grid (uniform in ln x; the book's 296-592 and above
# each span two grid classes exactly)
src = [0, 74e-6, 104.6518e-6, 148e-6, 209.3036e-6, 296e-6, 592e-6, 1184e-6, 2368e-6]
def cum(x):
    if x <= 0: return 0.0
    U = 0.0
    for k in range(8):
        lo, hi = src[k], src[k + 1]
        if x < hi * (1 + 1e-9):
            t = x / hi if lo <= 0 else math.log(x / lo) / math.log(hi / lo)
            return U + min(t, 1.0) * w_book[k]
        U += w_book[k]
    return 1.0
w = [cum(e[k + 1]) - cum(e[k]) for k in range(n)]
c = [0, 0.0377, 0.0885, 0.1803, 0.3574, 0.7967, 0.7967, 1, 1, 1, 1]   # declared
Rf = 0.39
a = [Rf + (1 - Rf) * ck for ck in c]
Y = sum(ai * wi for ai, wi in zip(a, w))
ms, mw = 100.0, 57.0                    # t/h solids, water
uf_dil = Rf * mw / (Y * ms)
of_dil = (1 - Rf) * mw / ((1 - Y) * ms)
def cross(xs, cs, lev):
    for k in range(len(xs) - 1):
        if (cs[k] - lev) * (cs[k + 1] - lev) <= 0 and cs[k] != cs[k + 1]:
            t = (lev - cs[k]) / (cs[k + 1] - cs[k])
            return math.exp(math.log(xs[k]) + t * (math.log(xs[k + 1]) - math.log(xs[k])))
    return float('nan')
d50 = cross(xr, a, 0.5); d50c = cross(xr, c, 0.5)
d25 = cross(xr, a, 0.25); d75 = cross(xr, a, 0.75)
print("(2) case forward: grid fractions", " ".join("%.4f" % v for v in w))
print("    U/F %.5f (book 0.652, %+.2f %%);  U/F dilution %.5f (book 0.34);  O/F dilution %.5f (book 1.00)"
      % (Y, 100 * (Y / 0.652 - 1), uf_dil, of_dil))
print("    d50 actual %.3f um (book 177.5 at the arithmetic class mean);  d50c %.3f um;  imperfection %s"
      % (d50 * 1e6, d50c * 1e6, "%.4f" % ((d75 - d25) / (2 * d50)) if d25 == d25 else "undefined (no d25: bypass 0.39 > 0.25)"))
# the anchor is fixed by construction: a at the 148-209 class
print("    a at the 148-209 um class = %.5f  (the book's 50.0 %% re-entered through c = (0.5-0.39)/0.61)" % a[3])
print("    with the pan corrected value set to its NEGATIVE book value (-0.0295): U/F %.5f"
      % (sum((Rf + (1 - Rf) * ck) * wi for ck, wi in zip([-0.0295] + c[1:], w))))
if len(sys.argv) > 1:
    J = json.load(open(sys.argv[1]))
    k = J["kpis"]["cyclone"]
    for key, mine in (("solidsTo_underflow", Y), ("underflow_dilution", uf_dil),
                      ("overflow_dilution", of_dil), ("d50_um", d50 * 1e6), ("d50c_um", d50c * 1e6)):
        ev = k.get(key)
        print("  %-20s engine %-14.8g mine %-14.8g rel %.2e" % (key, ev, mine, ev / mine - 1))
    print("  imperfection published by the engine:", k.get("imperfection", "absent"))
