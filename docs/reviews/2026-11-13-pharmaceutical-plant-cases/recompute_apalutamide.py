#!/usr/bin/env python3
"""Independent recomputation of tutorials/batch/plant/apalutamide01_tablets.

HOW TO RUN
    python3 -I recompute_apalutamide.py <repo-root> <run-dir>

  <repo-root>  the Choupo checkout (the case's declared inputs are read from
               <repo-root>/tutorials/batch/plant/apalutamide01_tablets).
  <run-dir>    a COPY of that case that has been run with `runCase` (its
               reports/ and log.choupoSolve are read for the ENGINE's numbers,
               which are only COMPARED, never used as inputs).

Every number recomputed here is built from the DECLARED inputs (0/ files,
system/postDict, constant/economics, constant/components/*.dat) and a
published relation written out below (Raoult, an Antoine equation in the
record's own form, ideal-gas Cp polynomials from the records, a Watson latent
heat, the single-product batch-plan relations, Turton's capital relations,
a straight-line DCF).  Standard library only.  Prints TSV blocks; the caller
redirects them into the review's .tsv files.
"""
import csv, math, os, re, sys

REPO, RUN = sys.argv[1], sys.argv[2]
CASE = os.path.join(REPO, "tutorials/batch/plant/apalutamide01_tablets")


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def record(name):
    return strip_comments(open(os.path.join(CASE, "constant/components", name + ".dat")).read())


def scalar(txt, key):
    m = re.search(r"(?m)^\s*" + key + r"\s+([-\d.eE+]+)", txt)
    return float(m.group(1))


def block_coeffs(txt, block):
    m = re.search(block + r"\s*\{[^}]*coefficients\s*\(([^)]*)\)", txt, re.S)
    return [float(x) for x in m.group(1).split()]


def feed_kg_h(stream):
    """Overall component mass flows (kg/h) of a 0/ file, read from its
    top-level componentMolarFlows (x MW) or componentMassFlows block."""
    t = strip_comments(open(os.path.join(CASE, "0", stream)).read())
    t = t.split("phases")[0]
    out = {}
    m = re.search(r"componentMassFlows\s*\{([^}]*)\}", t)
    if m:
        for c, v, u in re.findall(r"(\w+)\s+([-\d.eE+]+)\s+(\S+);", m.group(1)):
            assert u == "kg/h", u
            out[c] = float(v)
        return out
    m = re.search(r"componentMolarFlows\s*\{([^}]*)\}", t)
    for c, v, u in re.findall(r"(\w+)\s+([-\d.eE+]+)\s+(\S+);", m.group(1)):
        assert u == "kmol/h", u
        out[c] = float(v) * scalar(record(c), "MW")
    return out


def engine_streams():
    return {r["stream"]: r for r in csv.DictReader(open(os.path.join(RUN, "reports/streams/streamTable.csv")))}


def row(*a):
    print("\t".join(str(x) for x in a))


ES = engine_streams()

# ---------------------------------------------------------------- 1. formula
print("## block formula  (mg per tablet; dossier = US 12,303,493 B2 Ex. 3.2/3.3 as transcribed in docs/design/apalutamide-design-basis-dossier.md 1.4)")
row("item", "dossier_g_per_30000_or_batch", "dossier_mg", "case_kg_h", "case_tablets_h", "case_mg", "diff_mg")
pressed, coated = 15625.0, 15625.0 * 0.99
dossier = {  # Example 3.2, grams per 30 000 tablets
    "SDD (API + HPMCAS)": (7200, ["apiFeed", "hpmcasFeed"]),
    "colloidal silica": (273, ["silicaIntraFeed", "silicaExtraFeed"]),
    "croscarmellose": (1050, ["ccsIntraFeed", "ccsExtraFeed"]),
    "MCC": (8865, ["mccFeed"]),
    "silicified MCC": (3507, ["smccFeed"]),
    "Mg stearate": (105, ["mgstExtraFeed"]),
}
core = 0.0
for k, (g, feeds) in dossier.items():
    kg = sum(sum(feed_kg_h(f).values()) for f in feeds)
    mg = kg / pressed * 1e6
    core += mg
    row(k, g, round(g / 30000 * 1000, 4), round(kg, 6), pressed, round(mg, 4), round(mg - g / 30000 * 1000, 6))
row("CORE", 21000, 700.0, "", pressed, round(core, 4), round(core - 700.0, 6))
api = feed_kg_h("apiFeed")["apalutamide"] / pressed * 1e6
hp = feed_kg_h("hpmcasFeed")["hpmcas"] / pressed * 1e6
row("API : HPMCAS", "1:3", "", "", "", "%.4f : %.4f" % (api, hp), round(hp / api - 3.0, 9))
coat = sum(sum(feed_kg_h(f).values()) for f in ["pvaFeed", "pegFeed", "talcFeed", "tio2Feed", "feOxFeed"]) / coated * 1e6
water = feed_kg_h("coatWater")["water"] / coated * 1e6
row("coat solids (Ex 3.3: 17.997 g / 857 tablets)", 17.997, round(17.997 / 857 * 1000, 4), "", coated, round(coat, 4), round(coat - 17.997 / 857 * 1000, 4))
row("coat water (Ex 3.3: 71.988 g / 857 tablets)", 71.988, round(71.988 / 857 * 1000, 4), "", coated, round(water, 4), round(water - 71.988 / 857 * 1000, 4))
ac = feed_kg_h("acetoneFeed")["acetone"]
solids = sum(feed_kg_h("apiFeed").values()) + sum(feed_kg_h("hpmcasFeed").values())
row("spray solution solids wt%", "5.0", "", round(ac + solids, 4), "", round(100 * solids / (ac + solids), 6), "")
pk = float(ES["packagedTablets"]["F_mass_kg_per_h"])
row("packaged tablet mass g (engine stream / accepted tablets)", "", "721 + water", pk, coated, round(pk / coated * 1000, 5), "")
# molar mass of the API from its formula C21H15F4N5O2S (IUPAC standard atomic weights, conventional values)
aw = {"C": 12.011, "H": 1.008, "F": 18.998, "N": 14.007, "O": 15.999, "S": 32.06}
mw = 21 * aw["C"] + 15 * aw["H"] + 4 * aw["F"] + 5 * aw["N"] + 2 * aw["O"] + aw["S"]
row("apalutamide MW from formula", "", "", "", "", round(mw, 3), round(mw - scalar(record("apalutamide"), "MW"), 3))

# ------------------------------------------------------- 2. nitrogen loop
print("\n## block loop  (closed N2 loop, solved here as an explicit steady state)")
acet = record("acetone")
A, B, C = block_coeffs(acet, "vaporPressure")          # log10(P/bar) = A - B/(T + C), the record's form
MWa, MWn = scalar(acet, "MW"), scalar(record("N2"), "MW")
psat = lambda T: 10 ** (A - B / (T + C))                  # bar
Tc_, Pc_ = 263.15, 1.0                                    # condensatePot T, P (flowsheetDict)
K_ac = psat(Tc_) / Pc_
F_ac = ac / MWa                                           # kmol/h fresh acetone
M_n2 = feed_kg_h("n2Makeup")["N2"] / MWn
purge = 0.05
# Engine prices N2 in the liquid with an Antoine continued past Tc (README s8); take ITS K from the log to
# reproduce, and also solve with insoluble N2 (K = inf) as the physical bound.
logt = open(os.path.join(RUN, "log.choupoSolve")).read()
K_n2_engine = float(re.search(r"\n\s*N2\s+[\d.]+\s+[\d.]+\s+[\d.]+\s+([\d.]+)", logt).group(1))
for label, Kn in (("engine K_N2", K_n2_engine), ("insoluble N2", float("inf"))):
    # unknowns: recycle flows (a, n).  Fixed-point on the physical loop (no acceleration needed: exact
    # solve by iteration to 1e-14).
    a, n = 0.87, 15.2
    for _ in range(20000):
        za, zn = a + F_ac, n + M_n2                        # exhaust = recycle + make-up + evaporated acetone
        Fz = za + zn
        z = (za / Fz, zn / Fz)
        Ks = (K_ac, Kn)
        # Rachford-Rice
        f = lambda V: sum(zi * (Ki - 1) / (1 + V * (Ki - 1)) if Ki != float("inf") else zi / V for zi, Ki in zip(z, Ks))
        lo, hi = 1e-9, 1 - 1e-12
        for _ in range(200):
            mid = 0.5 * (lo + hi)
            if f(mid) > 0: lo = mid
            else: hi = mid
        V = 0.5 * (lo + hi)
        x = [zi / (1 + V * (Ki - 1)) if Ki != float("inf") else 0.0 for zi, Ki in zip(z, Ks)]
        if Kn == float("inf"):
            x[1] = 0.0; x[0] = 1.0
            y = ((z[0] - (1 - V) * 1.0) / V, z[1] / V)
        else:
            y = [Ki * xi for Ki, xi in zip(Ks, x)]
        Vf, Lf = V * Fz, (1 - V) * Fz
        an, nn = (1 - purge) * Vf * y[0], (1 - purge) * Vf * y[1]
        if abs(an - a) + abs(nn - n) < 1e-14: break
        a, n = an, nn
    rec_ac = Lf * x[0] * MWa
    lost = purge * Vf * y[0] * MWa
    row("case", "quantity", "independent", "engine", "diff")
    row(label, "Psat acetone 263.15 K bar (record Antoine)", round(psat(Tc_), 6), round(K_ac * Pc_, 6), "")
    row(label, "exhaust acetone mole fraction", round(z[0], 6), "0.116009 (log, condensatePot z)", round(z[0] - 0.116009, 6))
    row(label, "gas after pot acetone mole fraction", round(y[0], 6), "0.054395", round(y[0] - 0.054395, 6))
    row(label, "acetone recovered kg/h", round(rec_ac, 4), "68.58 (README)", round(rec_ac - 68.58, 4))
    row(label, "recovery %", round(100 * rec_ac / ac, 3), "96.3 (README)", "")
    row(label, "acetone lost in purge kg/h", round(lost, 4), "2.67 (README)", round(lost - 2.67, 4))
    row(label, "acetone balance fresh - recovered - purge kg/h", round(ac - rec_ac - lost, 9), "", "")
    row(label, "N2 recycle kmol/h", round(nn, 5), round(float(ES["gasRecycle"]["F_kmol_per_h"]) * 0.0 + 15.20954501, 5), "")
    row(label, "recycle total kmol/h", round(an + nn, 5), ES["gasRecycle"]["F_kmol_per_h"], round(an + nn - float(ES["gasRecycle"]["F_kmol_per_h"]), 5))
    row(label, "N2 in loop (drying gas) kg/h", round((nn + M_n2) * MWn, 2), "450 (README: 22.5/0.05)", round((nn + M_n2) * MWn - 450, 2))
    if Kn != float("inf"):
        z_loop = z
# dew point of the exhaust (P = 1.1 bar, exhaustGas)
p_ex = z_loop[0] * 1.10
Tdew = B / (A - math.log10(p_ex)) - C
row("dew", "exhaust acetone partial pressure bar", round(p_ex, 5), "", "")
row("dew", "exhaust dew point K (vs cooler 308.15, condenser 263.15)", round(Tdew, 2), "", "")
for Tcond in (273.15, 263.15, 253.15, 243.15):
    row("dew", "acetone in N2 at saturation, mole frac, T=%.2f K, 1 bar" % Tcond, round(psat(Tcond), 5), "", "")

# ---------------------------------------------------- 3. spray-dryer energy
print("\n## block dryer_energy  (ideal-gas Cp polynomials and Watson latent heat from the case's records)")
cpa = block_coeffs(acet, "idealGasHeatCapacity")
cpn = block_coeffs(record("N2"), "idealGasHeatCapacity")
Hcp = lambda c, T1, T2: sum(c[i] / (i + 1) * (T2 ** (i + 1) - T1 ** (i + 1)) for i in range(4))   # J/mol
Tc, Tb, Hb = scalar(acet, "Tc"), scalar(acet, "Tb"), scalar(acet, "HvapTb")
Hv = lambda T: Hb * ((1 - T / Tc) / (1 - Tb / Tc)) ** 0.38
# the dryer inlet composition is the independent loop solution (insoluble-N2 run, last above)
n_ac_in = (an) / 3.6                                       # mol/s, acetone recycled (independent)
n_n2_in = (nn + M_n2) / 3.6
F_ev = F_ac / 3.6
m_api, m_hp = feed_kg_h("apiFeed")["apalutamide"] / 3600, feed_kg_h("hpmcasFeed")["hpmcas"] / 3600   # kg/s
cps = 1200.0 * m_api + 1300.0 * m_hp                       # W/K, the records' 1.2 and 1.3 J/(g K)
Tin, Tf = 393.15, 298.15
def resid(T):
    q_gas = n_n2_in * Hcp(cpn, T, Tin) + n_ac_in * Hcp(cpa, T, Tin)
    q_evap = F_ev * (Hv(Tf) + Hcp(cpa, Tf, T))
    q_sol = cps * (T - Tf)
    return q_gas - q_evap - q_sol
lo, hi = 300.0, 393.0
for _ in range(200):
    mid = 0.5 * (lo + hi)
    if resid(mid) > 0: lo = mid
    else: hi = mid
Tout = 0.5 * (lo + hi)
row("quantity", "independent", "engine", "diff")
row("Watson latent heat of acetone at 298.15 K J/mol", round(Hv(Tf), 1), "", "")
row("exhaust T_out K (adiabatic dryer)", round(Tout, 3), ES["exhaustGas"]["T_K"], round(Tout - float(ES["exhaustGas"]["T_K"]), 3))
row("heat to evaporate + superheat acetone kW", round(F_ev * (Hv(Tf) + Hcp(cpa, Tf, Tout)) / 1000, 4), "", "")
# gas heater: loop gas 271.541 -> 393.15 K (blower outlet T from the engine; the blower is not recomputed)
Tb_out = float(ES["blowerOut"]["T_K"])
Qh = (n_n2_in * Hcp(cpn, Tb_out, Tin) + n_ac_in * Hcp(cpa, Tb_out, Tin)) / 1000
row("gas heater duty kW (blower outlet T taken from engine)", round(Qh, 4), "18.1487", round(Qh - 18.1487, 4))
# exhaust cooler 319.256 -> 308.15
n_ac_ex = (an + F_ac) / 3.6
Qc = (n_n2_in * Hcp(cpn, 308.15, Tout) + n_ac_ex * Hcp(cpa, 308.15, Tout)) / 1000
row("exhaust cooler duty kW", round(-Qc, 4), "-1.9363", round(-Qc + 1.9363, 4))
# condenser 308.15 -> 263.15, condensing the recovered acetone (latent at 263.15 by Watson)
# independent condensed acetone = fresh - purge loss (steady state) -- the insoluble-N2 run above
rec_mol_s = (ac - lost) / MWa / 3.6
Qcond = (n_n2_in * Hcp(cpn, 263.15, 308.15) + n_ac_ex * Hcp(cpa, 263.15, 308.15) + rec_mol_s * Hv(263.15)) / 1000
row("solvent condenser duty kW", round(-Qcond, 4), "-18.4836", round(-Qcond + 18.4836, 4))

# ---------------------------------------------------------- 4. batch plan
print("\n## block batch_plan  (single-product method, from the declared postDict and the stream table)")
r = lambda s: float(ES[s]["F_mass_kg_per_h"])
rP = r("packagedTablets")
Q, Mlot = 10156.0, 400.0
B = Mlot * rP / r("finalBlend")
N = math.ceil(Q / B)
row("quantity", "independent", "engine/README", "diff")
row("lot B kg product", round(B, 4), "410.4009", round(B - 410.4009, 4))
row("lots a year N", N, 25, N - 25)
row("H_eq h/yr", round(Q / rP, 4), "905.0162", round(Q / rP - 905.0162, 4))
row("tablets sold a year (Q / packaged tablet mass)", round(Q / (rP / coated)), "14.0 M", "")
t_sd = r("asdPowder") / rP * B / 3.75
t_sol = 2 + 2 + t_sd + 2
row("spray drying time per lot h", round(t_sd, 4), "36.57", "")
row("solution tank cycle (charge+process+fed-stage run+clean) h", round(t_sol, 4), "42.57", "")
V_sol = r("sprayFeed") / rP / (800 * 0.8) * B
row("solution tank V m3", round(V_sol, 4), "4.286", "")
camps = math.ceil(N / 7)
full = 7 * t_sol
req_sd = (N // 7) * (full + 48) + ((N % 7) * t_sol + 48 if N % 7 else 0)
row("sprayDrying campaigns / required h / occupancy %", "%d / %.3f / %.2f" % (camps, req_sd, 100 * req_sd / 7920), "4 / 1256.286 / 15.9", "")
st = {  # stage: (charge, process, discharge, clean)
    "blending": (1, .5, .5, 1), "granulation": (.5, 3, 0, 1), "finalBlending": (.5, .25, .5, 1),
    "compression": (1.5, 4, 0, 1), "suspensionPreparation": (.5, 1.5, 3, .5), "coating": (.5, 3, .5, 1), "packaging": (1, 8, 0, 1)}
tj = {k: sum(v) for k, v in st.items()}
TL = max(tj.values())
row("solidDose T_L h (stage)", "%s (%s)" % (TL, max(tj, key=tj.get)), "10 (packaging)", "")
row("solidDose campaigns", math.ceil(N / 6), 5, "")
sizes = {
    "blending V m3": r("intraBlend") / rP / (450 * .6) * B,
    "finalBlending V m3": r("finalBlend") / rP / (500 * .6) * B,
    "coating V m3": r("tabletCores") / rP / (750 * .65) * B,
    "suspension V m3": r("coatingSuspension") / rP / (1150 * .7) * B,
    "granulation rate kg/h": r("ribbons") / rP * B / 3,
    "compression rate kg/h": r("finalBlend") / rP * B / 4,
    "packaging rate kg/h": B / 8,
}
for k, v in sizes.items():
    row(k, round(v, 4), "", "")
# rated-machine checks vs the plan's sizes (the same machine in two places)
row("finalBlender: plan vessel (fill 0.6) vs rated nominal 1.2 m3 (maxFill 0.7)", round(sizes["finalBlending V m3"], 4), "1.2", round(sizes["finalBlending V m3"] - 1.2, 4))
row("coatingPan: plan vessel (fill 0.65) vs rated nominal 1.0 m3", round(sizes["coating V m3"], 4), "1.0", round(sizes["coating V m3"] - 1.0, 4))
row("finalBlender utilisation load/(1.2*0.7)", round(Mlot / 500 / (1.2 * .7), 6), "0.952381", "")
row("tabletPress tablets/h needed vs 45*60*60", round(r("finalBlend") / rP * B / 4 / 0.7e-3), "142857 vs 162000", "")
row("packaging packs/h vs 12*60", round(B / 8 / 0.72546e-3 / 112, 3), "631.374 vs 720", "")
# raw materials at Q/r_P hours vs at N*B (the plan makes N whole lots)
row("product made by N whole lots kg (vs Q)", round(N * B, 3), "10260.022", "")

# ----------------------------------------------------------- 5. economics
print("\n## block economics  (Turton relations, the case's declared prices)")
econ = strip_comments(open(os.path.join(CASE, "constant/economics")).read())
prices = dict((s, float(p)) for s, p in re.findall(r"stream\s+(\w+);\s+price\s+([\d.]+);", econ))
H = Q / rP
crm = sum(sum(feed_kg_h(s).values()) * p * H for s, p in prices.items() if s != "packagedTablets")
row("quantity", "independent", "engine", "diff")
row("C_RM EUR/yr", round(crm), 6877344, round(crm - 6877344))
row("API share of C_RM EUR/yr", round(feed_kg_h("apiFeed")["apalutamide"] * 7776 * H), "", "")
row("API cost per sold tablet EUR", round(feed_kg_h("apiFeed")["apalutamide"] * 7776 / coated, 4), "0.47 (README)", "")
R = Q * 5513.8
row("revenue EUR/yr", round(R), 55998153, round(R - 55998153))
row("revenue per tablet EUR (5513.8 x engine tablet mass)", round(5513.8 * rP / coated, 5), "4.0", "")
# spray dryer cost, Turton power-law as printed: Cp = 180000 (S/0.1)^0.6, S = kg/s evaporated
S = ac / 3600
cp01 = 180000 * (S / 0.1) ** 0.6
cp = cp01 * 820 / 397 * 0.92
cbm = cp * (1.60 + 1.20 * 3.05)
row("SD purchased EUR", round(cp), 129412, round(cp - 129412))
row("SD C_BM EUR", round(cbm), 680705, round(cbm - 680705))
# vessel solutionPrep: log-quadratic K1..K3 = 3.4974 0.4485 0.1074, B1 2.25, B2 1.82, F_M 3.05, F_P 1
lv = math.log10(V_sol)
cpv = 10 ** (3.4974 + 0.4485 * lv + 0.1074 * lv * lv) * 820 / 397 * 0.92
row("solutionPrep C_BM EUR", round(cpv * (2.25 + 1.82 * 3.05)), 98793, round(cpv * (2.25 + 1.82 * 3.05) - 98793))
# quotes scaled by the six-tenths rule
row("finalBlender quote 300000*(V/1)^0.6 EUR", round(300000 * sizes["finalBlending V m3"] ** .6), 356520, "")
row("finalBlender quote at the RATED 1.2 m3 EUR", round(300000 * 1.2 ** .6), "", "")
row("coatingPan quote at plan 0.812 m3 EUR", round(800000 * sizes["coating V m3"] ** .6), 706191, "")
row("coatingPan quote at the RATED 1.0 m3 EUR", 800000, "", "")
# labour
crew = 2 + 1 + 2 + 1 + 1 + 3 + 1
row("C_OL declared crew EUR/yr", crew * 4.5 * 42 * 1960, 4074840, "")
nol = math.sqrt(6.29 + 31.7 * 36 + 0.23 * 5)
row("Turton N_OL per shift / C_OL EUR/yr", "%.3f / %d" % (nol, round(nol * 4.5, 1) * 42 * 1960), "33.89 / 12554801", "")
# FCI, COM_d, DCF
SCBM, SCBM0 = 17691146, 5818741           # sums printed by the engine; the two items above are checked individually
FCI = 1.18 * SCBM + 0.5 * SCBM0
COL = crew * 4.5 * 42 * 1960
CUT = 2052
COMd = 0.18 * FCI + 2.73 * COL + 1.23 * (crm + CUT)
row("FCI EUR", round(FCI), 23784923, round(FCI - 23784923))
row("COM_d EUR/yr", round(COMd), 23867256, round(COMd - 23867256))
def npv(R, COMd, FCI, WC, land, i=0.10, tau=0.21, N=10, dl=7):
    v = -land * (1 + i) - (FCI + WC)
    for y in range(1, N + 1):
        d = FCI / dl if y <= dl else 0.0
        cf = (R - COMd - d) * (1 - tau) + d
        if y == N: cf += WC + land
        v += cf / (1 + i) ** y
    return v
# itemised working capital, rebuilt from the case's declared days (postDict workingCapital {})
ac_cost = ac * H * 1.20
tank_kg = 14 * 24 * ac                        # acetoneTank: 14 d of fresh acetone (holdup the tank unit states)
stock = tank_kg * 1.20 + 60 / 365 * (crm - ac_cost)
proc = 11532.2 * (1 - 11.6 / 11532.2) * 1.20   # recoveredTank holdup (engine inventory), acetone part at its price
WC = stock + proc + 60 / 365 * R + 15 / 365 * COMd - 30 / 365 * crm
row("net working capital EUR (itemised, rebuilt)", round(WC), 10781116, round(WC - 10781116))
land = 80 * 16055.5
base = npv(R, COMd, FCI, WC, land)
row("NPV EUR (WC taken from engine)", round(base), 128116779, round(base - 128116779))
# one sensitivity bar: price 12130.3 EUR/kg; receivables move with R (60 d), nothing else in WC does
R2 = Q * 12130.3
WC2 = WC + 60 / 365 * (R2 - R)
hi = npv(R2, COMd, FCI, WC2, land)
row("NPV at 8.8 EUR/tablet (12130.3 EUR/kg)", round(hi), 447518483, round(hi - 447518483))
row("swing", round(hi - base), 319401704, round(hi - base - 319401704))
# the utility bill vs the clean-utility plant it omits
row("C_UT EUR/yr (engine) / HVAC fan kW at 6 ACH (engine)", 2052, 30.40, "")
row("HVAC fan energy if the air plant runs the solid-dose year 3840 h, MWh", round(30.40 * 3840 / 1000, 1), "", "")
row("HVAC fan energy if it runs all year 8760 h, MWh", round(30.40 * 8760 / 1000, 1), "", "")
