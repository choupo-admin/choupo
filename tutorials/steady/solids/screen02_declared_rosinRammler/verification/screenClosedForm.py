#!/usr/bin/env python3
"""Independent recomputation of screen02_declared_rosinRammler.

Run:  python3 screenClosedForm.py [result.json]

Written from King (2001), not from the C++: the corrected curve eq. 4.41,
c(d) = 1 - exp[-0.693 (d/d50)^m] (0.693 as King prints it), the bypass
a_k = R + (1 - R) c_k (section 4.2), applied at each class's representative
size (the geometric mean of its edges; the pan's is its top edge divided by
sqrt(ratio)).  Cut sizes: first crossing from the fine end, linear in ln x
between neighbouring representative sizes; imperfection (d75 - d25)/(2 d50)
on the ACTUAL curve (docs/design/c361-solids-processing.md 7.2).

The values printed are the hand-written rows at the top of ../expected.
"""
import json, math, sys

d50, m, R = 22e-3, 5.9, 0.05
xMax, r, n = 3 * 0.0254, 1.41421356, 9
e = [0.0] + [xMax / r ** (n - 1 - k) for k in range(n)]
x = [e[1] / math.sqrt(e[2] / e[1])] + [math.sqrt(e[k] * e[k + 1]) for k in range(1, n)]
w = [0.20, 0.08, 0.10, 0.12, 0.15, 0.13, 0.10, 0.07, 0.05]
s = sum(w); w = [v / s for v in w]

c = [1.0 - math.exp(-0.693 * (d / d50) ** m) for d in x]
act = [R + (1 - R) * ck for ck in c]
Y = sum(ak * wk for ak, wk in zip(act, w))

def cross(cs, lev):
    for k in range(len(x) - 1):
        lo, hi = cs[k], cs[k + 1]
        if (lo - lev) * (hi - lev) <= 0 and lo != hi:
            t = (lev - lo) / (hi - lo)
            return math.exp(math.log(x[k]) + t * (math.log(x[k + 1]) - math.log(x[k])))
    return float("nan")

d50a, d25, d75 = cross(act, 0.5), cross(act, 0.25), cross(act, 0.75)
CaCO3_kmol_s = 900.9587 / 3600.0      # 0/feed; a dry feed: F is the solid's moles
rows = {
    "solidsTo_oversize": Y,
    "d50c_um": cross(c, 0.5) * 1e6,
    "d50_um": d50a * 1e6,
    "imperfection": (d75 - d25) / (2 * d50a),
}
print("c(d50) = %.6f  (the identity: 1 - exp(-0.693))" % (1 - math.exp(-0.693)))
for k, v in rows.items():
    print("  %-18s %.12g" % (k, v))
print("  stream oversize F %.12g kmol/s   stream undersize F %.12g kmol/s"
      % (Y * CaCO3_kmol_s, (1 - Y) * CaCO3_kmol_s))
if len(sys.argv) > 1:
    J = json.load(open(sys.argv[1]))
    k = J["kpis"]["screen"]
    for key, mine in rows.items():
        print("  engine %-18s %.12g  rel %.2e" % (key, k[key], k[key] / mine - 1))
