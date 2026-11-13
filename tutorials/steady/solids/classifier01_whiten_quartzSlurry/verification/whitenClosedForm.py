#!/usr/bin/env python3
"""Independent recomputation of classifier01_whiten_quartzSlurry.

Run:  python3 whitenClosedForm.py [result.json]

Written from the published form, not from the C++: Whiten's efficiency curve
as Nageswararao, Wiseman & Napier-Munn (2004) eq. 21 (p. 681) print it for the
overflow, E_oa = C (e^a - 1)/(e^(a d/d50c) + e^a - 2), divided by the water
split C and complemented to give the CORRECTED recovery to the coarse product,

    c(d) = 1 - (e^a - 1) / (e^(a d/d50c) + e^a - 2),

then the bypass a_k = R + (1 - R) c_k (King 2001, section 4.2), applied class
by class at each class's representative size: the geometric mean of its
edges, and for the pan its top edge divided by sqrt(ratio).  Cut sizes are the
first crossing from the fine end, linear in ln x between neighbouring
representative sizes (the rule docs/design/c361-solids-processing.md 7.2
states).  The water split is the declared fraction, nothing else.

The values printed are the hand-written rows at the top of ../expected.
UNCHECKED here: eq. 21 against the paper itself (not in the tree).
"""
import json, math, sys

a_sharp, d50c, R, Rfl = 3.0, 200e-6, 0.30, 0.35
xMax, r, n = 2368e-6, 1.41421356, 11
e = [0.0] + [xMax / r ** (n - 1 - k) for k in range(n)]
x = [e[1] / math.sqrt(e[2] / e[1])] + [math.sqrt(e[k] * e[k + 1]) for k in range(1, n)]
w = [0.301, 0.046, 0.070, 0.082, 0.079, 0.092, 0.092, 0.071, 0.071, 0.048, 0.048]
s = sum(w); w = [v / s for v in w]

def whiten(d):
    ea = math.exp(a_sharp)
    return 1.0 - (ea - 1.0) / (math.exp(a_sharp * d / d50c) + ea - 2.0)

c = [whiten(d) for d in x]
act = [R + (1 - R) * ck for ck in c]
Y = sum(ak * wk for ak, wk in zip(act, w))

def cross(cs, lev):
    for k in range(len(x) - 1):
        lo, hi = cs[k], cs[k + 1]
        if (lo - lev) * (hi - lev) <= 0 and lo != hi:
            t = (lev - lo) / (hi - lo)
            return math.exp(math.log(x[k]) + t * (math.log(x[k + 1]) - math.log(x[k])))
    return float("nan")

water_kmol_s = 3164.0300 / 3600.0      # 0/feed
silica_kmol_s = 1664.4474 / 3600.0     # 0/feed
rows = {
    "solidsTo_coarse": Y,
    "d50c_um": cross(c, 0.5) * 1e6,
    "d50_um": cross(act, 0.5) * 1e6,
    "fluidTo_coarse": Rfl,
}
#  The result JSON's stream F counts the water AND the solid's moles (the
#  console table prints the fluid alone), so each product's F is its declared
#  share of the water plus its share Y or 1 - Y of the silica.
coarseF = Rfl * water_kmol_s + Y * silica_kmol_s
fineF = (1 - Rfl) * water_kmol_s + (1 - Y) * silica_kmol_s
print("c at the representative sizes:", " ".join("%.5f" % v for v in c))
print("c(d50c) = %.12f  (the identity every Whiten curve meets)" % whiten(d50c))
for k, v in rows.items():
    print("  %-16s %.12g" % (k, v))
print("  stream coarse F  %.12g kmol/s   stream fine F  %.12g kmol/s" % (coarseF, fineF))
if len(sys.argv) > 1:
    J = json.load(open(sys.argv[1]))
    k = J["kpis"]["classifier"]
    for key, mine in rows.items():
        print("  engine %-16s %.12g  rel %.2e" % (key, k[key], k[key] / mine - 1))
