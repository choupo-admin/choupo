#!/usr/bin/env python3
"""Independent steady state of circuit01 (Herbst & Fuerstenau 1980 closed circuit).

Run:  python3 circuit_hf.py [result.json]
      (result.json = the engine's result for a run of
       tutorials/steady/solids/circuit01_herbstFuerstenau_closedCircuit; optional)

Written from the published equations, not from the C++:
  * perfectly mixed mill, energy-specific rate (H&F 1980 eq. for one mixer,
    Austin 1971 eq. 44a): p_i (1 + kappa_i) = f_i + SUM_{j coarser} b_ij kappa_j p_j
  * kappa_i = S1E (xbar_i / x1)^zeta1 * E,  E = P / (solids mass flow) in kWh/short ton
    (H&F Fig. 14 legend: k^E_i = 2.40 (sqrt(x_i x_i+1)/2000)^0.72 (kWh/ton)^-1)
  * Austin normalised breakage B(u) = phi u^gamma + (1 - phi) u^beta (King 2001 eq. 5.78),
    the parent taken at its class's LOWER edge (King eq. 5.79, the case's convention),
    b_ij = B(e_{i+1}/e_j) - B(e_i/e_j), the pan collecting B(e_1/e_j)
  * two mixers in series, each drawing half the power
  * classifier a_k = R + (1 - R) c_k with H&F's step (c = 1 at and above 104 um, 0 below), R = 0.3
  * successive substitution on the recycle's class flows to 1e-14
The H&F published target (p. 23): circulating load 2.50 at 100 short ton/h, 637 kW,
E = 1.82 kWh/short ton.
"""
import json, math, sys

edges = [0, 3.6875000743e-05, 5.2149126075e-05, 7.3750001238e-05, 1.0429825180e-04,
         1.4750000198e-04, 2.0859650290e-04, 2.9500000297e-04, 4.1719300440e-04,
         5.9000000396e-04, 8.3438600600e-04, 1.1800000040e-03, 1.6687720064e-03,
         2.3600000000e-03]
nc = len(edges) - 1
xbar = [edges[1] / math.sqrt(2)] + [math.sqrt(edges[k] * edges[k + 1]) for k in range(1, nc)]
wfresh = [0.0156250003, 0.0064720870, 0.0091529132, 0.0129441740, 0.0183058263,
          0.0258883478, 0.0366116526, 0.0517766955, 0.0732233049, 0.1035533907,
          0.1464466093, 0.2071067807, 0.2928932176]
ST = 907.18474                       # kg per short ton
fresh_kg_s = 906.397081 * 100.0869 / 3600.0   # CaCO3 kmol/h x MW (catalogue 100.0869)
P_half_kW = 318.5
S1E, x1, z1 = 2.40, 2000e-6, 0.72
phi, gam, bet = 0.456, 0.75, 2.2
Rbyp = 0.3
cstep = [0, 0, 0, 0] + [1] * (nc - 4)


def Bfun(u):
    return phi * u ** gam + (1 - phi) * u ** bet


b = [[0.0] * nc for _ in range(nc)]
for j in range(1, nc):
    y = edges[j]
    for i in range(j):
        up = Bfun(edges[i + 1] / y)
        lo = Bfun(edges[i] / y) if edges[i] > 0 else 0.0
        b[i][j] = up - lo


def mill(feed):                       # feed: class mass flows kg/s
    m = sum(feed)
    E = P_half_kW / m / 3600.0 * ST   # kWh/short ton
    kap = [0.0] + [S1E * (xbar[k] / x1) ** z1 * E for k in range(1, nc)]
    p = [0.0] * nc
    for i in reversed(range(nc)):
        src = feed[i] + sum(b[i][j] * kap[j] * p[j] for j in range(i + 1, nc))
        p[i] = src / (1 + kap[i])
    return p, E


def solve(cfun, R, nhalves=2):
    a = [R + (1 - R) * c for c in cfun]
    rec = [0.0] * nc
    for it in range(5000):
        feed = [wfresh[k] * fresh_kg_s + rec[k] for k in range(nc)]
        p = feed
        Es = []
        for _ in range(nhalves):
            p, E = mill(p)
            Es.append(E)
        new = [a[k] * p[k] for k in range(nc)]
        err = max(abs(new[k] - rec[k]) for k in range(nc))
        rec = new
        if err < 1e-14:
            break
    prod = [p[k] - rec[k] for k in range(nc)]
    return dict(rec=rec, prod=prod, disch=p, feed=feed, E=Es, it=it,
                CL=sum(rec) / fresh_kg_s,
                closure=sum(prod) - fresh_kg_s,
                classClosure=max(abs(rec[k] + prod[k] - p[k]) for k in range(nc)))


r = solve(cstep, Rbyp)
Etot_st = 2 * r["E"][0]      # kWh per short ton of MILL FEED (H&F's E = P / mill throughput)
print("fresh feed %.6f kg/s (%.4f short ton/h)" % (fresh_kg_s, fresh_kg_s * 3600 / ST))
print("iterations %d" % r["it"])
print("recycle (coarse) %.6f kg/s ; circulating load %.5f (H&F 2.50 -> %+.2f %%)"
      % (sum(r["rec"]), r["CL"], 100 * (r["CL"] / 2.5 - 1)))
print("specific energy per mill half %.6f kWh/short ton = %.6f kWh/t ; whole mill %.5f kWh/short ton of mill feed (H&F 1.82 -> %+.2f %%)"
      % (r["E"][0], r["E"][0] * 1000 / ST, Etot_st, 100 * (Etot_st / 1.82 - 1)))
print("product - fresh = %.3e kg/s ; max class |coarse+fine-discharge| = %.3e" % (r["closure"], r["classClosure"]))
prodw = [v / sum(r["prod"]) for v in r["prod"]]
print("product mass fractions (pan first):", " ".join("%.6f" % v for v in prodw))
if len(sys.argv) > 1:
    J = json.load(open(sys.argv[1]))
    print("--- engine (result JSON) ---")
    kp = J["kpis"]
    try:
        cs = kp["classifier"]["coarse_solids_kg_s"]
        print("engine coarse %.6f  mine %.6f  rel diff %.2e" % (cs, sum(r["rec"]), cs / sum(r["rec"]) - 1))
        e1 = kp["millFirstHalf"]["specificEnergy_kWh_t"]
        print("engine E half %.6f kWh/t  mine %.6f  rel diff %.2e" % (e1, r["E"][0] * 1000 / ST, e1 / (r["E"][0] * 1000 / ST) - 1))
    except Exception as ex:
        print("could not read engine kpis:", ex)
