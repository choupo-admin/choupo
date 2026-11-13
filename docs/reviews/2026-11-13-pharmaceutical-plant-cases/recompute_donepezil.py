#!/usr/bin/env python3
"""Independent recomputation of donepezil01_tablets and donepezil02_two_strengths.

HOW TO RUN
    CHOUPO_REPO=<repo-root> python3 -I recompute_donepezil.py <run-dir-donepezil01> <run-dir-donepezil02>

(CHOUPO_REPO is read only by the fluid-bed block, for the case's component
records; the other blocks need the two run dirs alone.)

Each run-dir is a COPY of the case that has been run with `runCase`; its
reports/streams/streamTable.csv and reports/economics/cashFlow.csv are read
only to COMPARE.  The declared inputs used here (per-tablet masses, stage
times, lot, demand, prices) are transcribed from the cases' README section 2,
system/postDict and constant/economics, each named on its line.  Standard
library only; prints TSV.
"""
import csv, math, os, sys

D1, D2 = sys.argv[1], sys.argv[2]


def streams(d):
    return {r["stream"]: r for r in csv.DictReader(open(os.path.join(d, "reports/streams/streamTable.csv")))}


def row(*a):
    print("\t".join(str(x) for x in a))


E1 = streams(D1)
m = lambda s: float(E1[s]["F_mass_kg_per_h"])
pressed, coated = 720000.0, 712800.0

print("## block donepezil01_formula  (mg per tablet; UK SmPC ARICEPT 10 mg: API 10.00, lactose 174.33 -- cited, NOT read by this reviewer)")
row("ingredient", "declared_mg", "engine_kg_h", "engine_mg", "diff")
core = {"apiFeed": 10.00, "lactoseFeed": 174.33, "starchFeed": 50.00, "mccFeed": 36.87, "hpcFeed": 7.40, "mgstFeed": 1.40}
tot = 0
for s, mg in core.items():
    e = m(s) / pressed * 1e6
    tot += e
    row(s, mg, m(s), round(e, 4), round(e - mg, 6))
row("CORE", 280.00, "", round(tot, 4), round(tot - 280, 6))
row("API w/w %", "3.6", "", round(1000 / 280, 3), "")
row("binder water mg (10 wt % HPC)", 66.60, m("granWater"), round(m("granWater") / pressed * 1e6, 4), "")
row("binder water / dry intragranular %", 23.9, "", round(100 * 66.6 / (280 - 1.4), 2), "")
coat = sum(m(s) for s in ["hpmcFeed", "tio2Feed", "pegFeed", "talcFeed", "feOxFeed"]) / coated * 1e6
row("coat mg (3 % of 280)", 8.40, "", round(coat, 4), round(coat - 8.4, 6))
row("coat water mg (12 wt %)", round(8.4 / .12 - 8.4, 4), m("coatWater"), round(m("coatWater") / coated * 1e6, 4), "")
row("packed tablet g", 0.29023, m("packagedTablets"), round(m("packagedTablets") / coated * 1e3, 6), "")
# donepezil HCl molar mass C24H29NO3.HCl
aw = {"C": 12.011, "H": 1.008, "N": 14.007, "O": 15.999, "Cl": 35.45}
mw_salt = 24 * aw["C"] + 30 * aw["H"] + aw["N"] + 3 * aw["O"] + aw["Cl"]
mw_base = 24 * aw["C"] + 29 * aw["H"] + aw["N"] + 3 * aw["O"]
row("donepezil HCl MW / base equivalent of 10 mg", 415.96, "", "%.3f / %.3f mg" % (mw_salt, 10 * mw_base / mw_salt), "SmPC: 9.12 mg")

print("\n## block donepezil01_plan")
rP = m("packagedTablets")
B = 300 * rP / m("finalBlend")
Q = 43535.0
N = math.ceil(Q / B)
row("quantity", "independent", "engine/README", "diff")
row("lot B kg", round(B, 4), 305.852, "")
row("lots N", N, 143, N - 143)
row("H_eq h", round(Q / rP, 4), 210.437, "")
# times from postDict: (charge, process, discharge, clean); a throughFedStage discharge = the fed stage's process
tgran = {"binderPreparation": 0.5 + 1 + 0.5 + 1,   # discharge through granulation's process 0.5 h
         "granulation": 0.5 + 0.5 + 0.25 + 1.5, "drying": 0.25 + 1.5 + 0.5 + 2,
         "milling": 0.25 + 2 + 0 + 1, "finalBlending": 0.5 + 0.25 + 0.5 + 1}
ttab = {"compression": 1.5 + 7 + 0 + 1.5, "suspensionPreparation": 0.5 + 1.5 + 4 + 0.5,
        "coating": 0.5 + 4 + 0.5 + 1.5, "packaging": 1 + 9 + 0 + 1}
for name, t, span_eng, req_eng in (("granulation", tgran, 38.5, 1121), ("tableting", ttab, 101, 2239)):
    TL = max(t.values())
    c = math.ceil(N / 8)
    first = span_eng - 7 * TL                  # the engine's first-lot pass, taken as given (a Gantt convention)
    last = N - 8 * (c - 1)
    req = (c - 1) * (span_eng + 24) + (first + (last - 1) * TL + 24)
    row(name + " T_L h / limiting", "%s / %s" % (TL, max(t, key=t.get)), "", "")
    row(name + " campaigns / required h / occ %", "%d / %.2f / %.1f" % (c, req, 100 * req / 3840), "%d / %s" % (c, req_eng), "")
row("drying stage V m3 = f/(550*0.5)*B", round(m("wetMass") / rP / (550 * .5) * B, 4), 1.336, "")
row("FBD drying rate implied: wet mass per lot / 1.5 h vs flowsheet wetMass kg/h", "%.1f vs %.1f" % (m("wetMass") / rP * B / 1.5, m("wetMass")), "", "")

print("\n## block donepezil01_economics")
R = Q * 344.55
row("revenue EUR/yr", round(R), 14999984, round(R - 14999984))
row("tablets / yr", round(Q / (rP / coated)), "150 M", "")
FCI, COMd, WC, land = 19798606, 14819804, 3151057, 80 * 12320.8
def npv(R, COMd, FCI, WC, land, credit=True, i=.1, tau=.21, N=10, dl=7):
    v = -land * (1 + i) - FCI - WC
    for y in range(1, N + 1):
        d = FCI / dl if y <= dl else 0
        ti = R - COMd - d
        tax = tau * ti if (ti > 0 or credit) else 0
        cf = R - COMd - tax
        if y == N: cf += WC + land
        v += cf / (1 + i) ** y
    return v
row("NPV taxOnLoss credit", round(npv(R, COMd, FCI, WC, land)), -18672735, "")
row("NPV taxOnLoss none", round(npv(R, COMd, FCI, WC, land, credit=False)), "-21.4 M (README)", "")
F = 0.18 * FCI + 2.73 * 3704400 + FCI / 7
V = 1.23 * (927989 + 1314)
row("operating break-even x = F/(R-V)", round(F / (R - V), 4), "1.19 (README)", "")

print("\n## block donepezil02_year  (multiproduct: campaigns back to back, the product clean REPLACES the train changeover)")
B2 = B
N10, N5 = math.ceil(26121 / B2), math.ceil(8707 / B2)
row("quantity", "independent", "engine/README", "diff")
row("lots 10 mg / 5 mg", "%d / %d" % (N10, N5), "86 / 29", "")
row("tablets/yr 10 mg / 5 mg", "%.0f / %.0f" % (26121 / .29023e-3, 8707 / .145115e-3), "90 M / 60 M", "")
# granulation: same stage times for both strengths; T_L 4.25, first-lot pass 8.75 (38.5 - 7*4.25)
def year(N, TL, first, n=8, co=24):
    c = math.ceil(N / n); last = N - n * (c - 1)
    return c, (c - 1) * (first + (n - 1) * TL) + (first + (last - 1) * TL) + (c - 1) * co
c10, y10 = year(N10, 4.25, 8.75)
c5, y5 = year(N5, 4.25, 8.75)
prod_clean = max(2, 6, 5, 2, 3)               # productChangeover per granulation stage, max over stages
g = y10 + y5 + 2 * prod_clean
row("granulation year h (product clean 6 h replaces the 24 h changeover)", round(g, 2), 880.2, round(g - 880.2, 2))
g_alt = y10 + y5 + 2 * max(prod_clean, 24)
row("granulation year h if a product change cost at least the 24 h same-product clean", round(g_alt, 2), "", round(g_alt - g, 2))
g_one = y10 + y5 + 2 * 24
row("two products save over one product with the same campaigns (h)", round(g_one - g, 2), "", "")
# tableting: 10 mg T_L 11, first 24; 5 mg: compression 1.5+14+1.5 = 17, packaging 1+18+1 = 20 -> T_L 20; first pass from engine 180 - 7*20 = 40
c10t, y10t = year(N10, 11, 24)
c5t, y5t = year(N5, 20, 40)
t = y10t + y5t + 12 + 6                       # changeoverTo strength5 12 h (coating), back to strength10 6 h
row("tableting year h", round(t, 2), 2079, round(t - 2079, 2))
row("tableting year h if each product change cost at least the 24 h clean", round(y10t + y5t + 48, 2), "", round(48 - 18, 2))
row("5 mg press load tablets/h (2.14 M cores / 14 h)", round(300e3 / 0.140 / 14), "", "")
row("blended price EUR/kg", round((90e6 * .10 + 60e6 * .06) / (26121 + 8707), 3), 361.78, "")

print("\n## block crew_cover_what_if  (REVIEWER's what-if: the declared crew staffed for each train's DECLARED available hours, not round the clock)")
row("quantity", "engine (x 4.5)", "what-if (avail h / 1960)", "diff")
wage = 42 * 1960
cover = 3840 / 1960
COL0 = 10 * 4.5 * wage
COL1 = 10 * cover * wage
COMd1 = COMd - 2.73 * (COL0 - COL1)
WC1 = WC - 15 / 365 * (COMd - COMd1)
row("donepezil01 positions", 45, round(10 * cover, 2), "")
row("donepezil01 C_OL EUR/yr", round(COL0), round(COL1), round(COL1 - COL0))
row("donepezil01 COM_d EUR/yr", COMd, round(COMd1), round(COMd1 - COMd))
n0, n1 = npv(R, COMd, FCI, WC, land), npv(R, COMd1, FCI, WC1, land)
row("donepezil01 NPV EUR", round(n0), round(n1), round(n1 - n0))
# apalutamide: solvent section (2/shift) on the 7920 h spray-drying train, the other 9 on the 3840 h solid-dose train
COLa0 = 11 * 4.5 * wage
COLa1 = (2 * 7920 / 1960 + 9 * 3840 / 1960) * wage
row("apalutamide01 positions", 49.5, round(2 * 7920 / 1960 + 9 * 3840 / 1960, 2), "")
row("apalutamide01 C_OL EUR/yr", round(COLa0), round(COLa1), round(COLa1 - COLa0))
row("apalutamide01 COM_d change EUR/yr (x 2.73)", "", "", round(2.73 * (COLa1 - COLa0)))

print("\n## block fbd_energy  (adiabatic fluid-bed dryer by hand; Cp polynomials, Watson latent heat and solid Cp from the case's own records)")
import re
REPO = os.environ.get("CHOUPO_REPO", ".")
CC = os.path.join(REPO, "tutorials/batch/plant/donepezil01_tablets/constant/components")
def rec(n):
    t = open(os.path.join(CC, n + ".dat")).read()
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S); return re.sub(r"//[^\n]*", "", t)
def coeffs(t, b):
    return [float(x) for x in re.search(b + r"\s*\{[^}]*coefficients\s*\(([^)]*)\)", t, re.S).group(1).split()]
def sc(t, k):
    return float(re.search(r"(?m)^\s*" + k + r"\s+([-\d.eE+]+)", t).group(1))
H = lambda c, a, b: sum(c[i] / (i + 1) * (b ** (i + 1) - a ** (i + 1)) for i in range(len(c)))
air = {"N2": 0.79 * 250, "O2": 0.21 * 250, "water": 3.0}          # 0/fbdAirIn: 250 kmol/h dry air 79/21 + 3 kmol/h water
cps = {k: coeffs(rec(k), "idealGasHeatCapacity") for k in air}
w = rec("water"); Tcw, Tbw, Hbw = sc(w, "Tc"), sc(w, "Tb"), sc(w, "HvapTb")
Hv = lambda T: Hbw * ((1 - T / Tcw) / (1 - Tbw / Tcw)) ** 0.38
solids = {"donepezilHydrochloride": 7.2, "lactoseMonohydrate": 125.5176, "maizeStarch": 36.0,
          "microcrystallineCellulose": 26.5464, "hydroxypropylCellulose": 5.328}    # kg/h, 0/ feeds
CpS = sum(m_ / sc(rec(k), "MW") * coeffs(rec(k), "solidHeatCapacity")[0] for k, m_ in solids.items())  # J/(K h) per kmol->mol x1000 below
water_in = 47.952 / 18.015                                            # kmol/h, the binder water
X_eq = 0.1 * 12 * 0.72 * 0.06 / ((1 - 0.72 * 0.06) * (1 - 0.72 * 0.06 + 12 * 0.72 * 0.06))  # GAB of the starch at the inlet a_w 0.06
kept = X_eq * 36.0 / 18.015
evap = water_in - kept
Tin, T0 = 333.15, 298.15
def resid(T):
    q_air = sum(n * H(cps[k], T, Tin) for k, n in air.items())
    q_ev = evap * (Hv(T0) + H(cps["water"], T0, T))
    q_s = CpS * (T - T0) + kept * 75.3 * (T - T0)                    # kept water as liquid, 75.3 J/(mol K) (reviewer's constant)
    return q_air - q_ev - q_s
lo, hi = 300.0, 333.0
for _ in range(200):
    mid = .5 * (lo + hi)
    lo, hi = (mid, hi) if resid(mid) > 0 else (lo, mid)
row("quantity", "independent", "engine", "diff")
row("GAB X_eq of the starch at a_w 0.06 kg/kg", round(X_eq, 5), 0.037, "")
row("water evaporated kg/h", round(evap * 18.015, 3), "46.6 (12.95e-3 kg/s = 46.62)", "")
row("FBD exhaust T K", round(.5 * (lo + hi), 2), 316.72, round(.5 * (lo + hi) - 316.72, 2))
row("air heater duty kW (250 dry + 3 water kmol/h, 298.15 -> 333.15 K)", round(sum(n * H(cps[k], T0, Tin) for k, n in air.items()) / 3600, 3), 72.1, "")
