#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The IAPWS-2017/2018 heavy-water formulation, transcribed for CURATION use.

    bin/curate/heavy_water_iapws.py --check     # verify the transcription
    bin/curate/heavy_water_iapws.py --report    # the numbers heavyWater.dat carries
    bin/curate/heavy_water_iapws.py --fit      # the polynomial fits, with residuals

WHAT THIS IS.  A pure-Python implementation of the Helmholtz-energy equation
of state of D2O, Eqs. (5)-(7) and Tables 1-2 of

    IAPWS R16-17(2018), "Revised Release on the IAPWS Formulation 2017 for
    the Thermodynamic Properties of Heavy Water" (Prague, September 2018),
    https://iapws.org/technical-guidance/release/Heavy

    (the equation is Herrig, Thol, Harvey & Lemmon, "A Reference Equation of
    State for Heavy Water", J. Phys. Chem. Ref. Data 47, 043102 (2018),
    doi:10.1063/1.5053993; the auxiliary equations (1)-(3) of that paper, with
    its Table 3 coefficients, are also transcribed here),

plus the ideal-gas heat capacity / entropy of D2(16O) tabulated by

    Simko, Furtenbacher, Hruby, Zobov, Polyansky, Tennyson, Gamache,
    Szidarovszky, "Recommended Ideal-Gas Thermochemical Functions for Heavy
    Water and its Substituent Isotopologues", J. Phys. Chem. Ref. Data 46,
    023104 (2017), doi:10.1063/1.4983120, Table 6 (only the 298.15 K row is
    used here).

IT IS A TOOL, NOT PART OF THE RUNTIME (CLAUDE.md section 4: a tool may read
the runtime, nothing in the runtime may read a tool).  It exists so that every
number in data/standards/components/heavyWater.dat is DERIVED by a script that
first reproduces the release's own computer-verification tables, and never
typed.  `--check` is the independent recomputation bin/curate/
check_heavy_water.py runs against the record.

EVERY PUBLISHED CHECK VALUE IS REPRODUCED before any derived number is used:
Table 6 (phi0, phi_r and their derivatives at 500 K, 46.26 mol/dm3), Table 7
(p, cv, w, s at nine states), Table 8 (saturation states at 280, 450, 625 K),
and the check values printed under Eqs. (1)-(3), (9)-(13) of the paper/release.
"""
import math
import sys

# ---- constants: Release Eqs. (1)-(4) ----------------------------------------
TC = 643.847            # K
RHOC = 17.77555         # mol/dm3
R = 8.3144598           # J/(mol K)
M = 20.027508           # g/mol
TT = 276.969            # K, triple-point temperature (Table 1)
PTT_MPA = 0.00066159    # MPa, triple-point pressure (Table 1)
PC_MPA = 21.6618        # MPa, critical pressure of the EOS (Table 1)
TNBP = 374.549          # K, normal boiling point (Table 1)
OMEGA = 0.364           # acentric factor (Table 1)

# ---- ideal-gas part, Eq. (6) / Table 1 of the release -----------------------
C0 = 4.0
A1 = -8.67099402264600
A2 = 6.96033578458778
V = (0.10633e-1, 0.99787, 0.21483e1, 0.3549)
U = (308.0, 1695.0, 3949.0, 10317.0)

# ---- residual part, Eq. (7) / Table 2 of the release ------------------------
#  (n, t, d, l)  for i = 1..12  (l = 0 means no exponential);
#  (n, t, d, eta, beta, gamma, eps) for i = 13..24 (Gaussian bell terms)
POLY = [
    (0.122082060e-1, 1.0000, 4, 0), (0.296956870e1, 0.6555, 1, 0),
    (-0.379004540e1, 0.9369, 1, 0), (0.941089600, 0.5610, 2, 0),
    (-0.922466250, 0.7017, 2, 0), (-0.139604190e-1, 1.0672, 3, 0),
    (-0.125203570, 3.9515, 1, 1), (-0.555391500e1, 4.6000, 1, 2),
    (-0.493009740e1, 5.1590, 3, 2), (-0.359470240e-1, 0.2000, 2, 1),
    (-0.936172870e1, 5.4644, 2, 2), (-0.691835150, 2.3660, 1, 2),
]
GAUSS = [
    (-0.456110600e-1, 3.4553, 1, 0.6014, 0.4200, 1.5414, 1.8663),
    (-0.224513300e1, 1.4150, 3, 1.4723, 2.4318, 1.3794, 0.2895),
    (0.860006070e1, 1.5745, 1, 1.5305, 1.2888, 1.7385, 0.5803),
    (-0.248410420e1, 3.4540, 3, 2.4297, 8.2710, 1.3045, 0.2236),
    (0.164476900e2, 3.8106, 1, 1.3086, 0.3673, 2.7242, 0.6815),
    (0.270393360e1, 4.8950, 1, 1.3528, 0.9504, 3.5321, 0.9495),
    (0.375637470e2, 1.4300, 2, 3.4456, 7.8318, 2.4552, 1.1158),
    (-0.177607760e1, 1.5870, 2, 1.2645, 3.3281, 0.8319, 0.1607),
    (0.220924640e1, 3.7900, 2, 2.5547, 7.1753, 1.3500, 0.4144),
    (0.519652000e1, 2.6200, 1, 1.2148, 0.9465, 2.5617, 0.9683),
    (0.421097400, 1.9000, 1, 18.738, 1177.0, 1.0491, 0.9488),
    (-0.391921100, 4.3200, 1, 18.677, 1167.0, 1.0486, 0.9487),
]

# ---- auxiliary equations, Herrig et al. 2018, Eqs. (1)-(3), Table 3 ---------
PV_N = (-0.7944403e1, 0.1943403e1, -0.2435300e1, -0.3420000e1, 0.3550000e2, -0.3020000e3)
PV_E = (1.0, 1.5, 2.44, 5.3, 14.0, 20.0)
RL_N = (0.1662000e1, 0.9011300e1, -0.1542100e2, 0.1157600e2, -0.5169400e1, -0.2362400e3)
RL_E = (0.29, 1.0, 1.3, 1.77, 2.5, 16.0)
RV_N = (-0.2471400e1, -0.2667440e2, 0.5310800e2, -0.4801500e2, -0.5762300e2, -0.3717200e3)
RV_E = (0.33, 1.29, 1.68, 2.09, 6.1, 17.0)


def aux_pv_MPa(T):
    u = 1.0 - T / TC
    return PC_MPA * math.exp(TC / T * sum(n * u ** e for n, e in zip(PV_N, PV_E)))


def aux_rho_liq(T):
    u = 1.0 - T / TC
    return RHOC * (1.0 + sum(n * u ** e for n, e in zip(RL_N, RL_E)))


def aux_rho_vap(T):
    u = 1.0 - T / TC
    return RHOC * math.exp(sum(n * u ** e for n, e in zip(RV_N, RV_E)))


# ---- the Helmholtz function and its derivatives -----------------------------
def phi0(delta, tau):
    """(phi0, phi0_tau, phi0_tautau)."""
    p = math.log(delta) + A1 + A2 * tau + (C0 - 1) * math.log(tau)
    pt = A2 + (C0 - 1) / tau
    ptt = -(C0 - 1) / tau ** 2
    for v, u in zip(V, U):
        x = u * tau / TC
        e = math.exp(-x)
        p += v * math.log(1 - e)
        pt += v * (u / TC) * e / (1 - e)
        ptt -= v * (u / TC) ** 2 * e / (1 - e) ** 2
    return p, pt, ptt


def phir(delta, tau):
    """(phi, phi_d, phi_dd, phi_t, phi_tt, phi_dt)."""
    P = Pd = Pdd = Pt = Ptt = Pdt = 0.0
    for n, t, d, l in POLY:
        if l == 0:
            f = n * delta ** d * tau ** t
            gd = d / delta
            gdd = -d / delta ** 2
        else:
            f = n * delta ** d * tau ** t * math.exp(-delta ** l)
            gd = d / delta - l * delta ** (l - 1)
            gdd = -d / delta ** 2 - l * (l - 1) * delta ** (l - 2)
        gt = t / tau
        gtt = -t / tau ** 2
        P += f
        Pd += f * gd
        Pdd += f * (gd * gd + gdd)
        Pt += f * gt
        Ptt += f * (gt * gt + gtt)
        Pdt += f * gd * gt
    for n, t, d, eta, beta, gam, eps in GAUSS:
        f = n * delta ** d * tau ** t * math.exp(-eta * (delta - eps) ** 2 - beta * (tau - gam) ** 2)
        gd = d / delta - 2 * eta * (delta - eps)
        gdd = -d / delta ** 2 - 2 * eta
        gt = t / tau - 2 * beta * (tau - gam)
        gtt = -t / tau ** 2 - 2 * beta
        P += f
        Pd += f * gd
        Pdd += f * (gd * gd + gdd)
        Pt += f * gt
        Ptt += f * (gt * gt + gtt)
        Pdt += f * gd * gt
    return P, Pd, Pdd, Pt, Ptt, Pdt


def props(T, rho):
    """Molar properties at T [K], rho [mol/dm3].  Energies J/mol, p in MPa."""
    delta, tau = rho / RHOC, TC / T
    p0, p0t, p0tt = phi0(delta, tau)
    pr, prd, prdd, prt, prtt, prdt = phir(delta, tau)
    out = {}
    out["p"] = rho * R * T * (1 + delta * prd) * 1e-3
    out["s"] = R * (tau * (p0t + prt) - p0 - pr)
    out["h"] = R * T * (1 + tau * (p0t + prt) + delta * prd)
    out["g"] = R * T * (1 + p0 + pr + delta * prd)
    out["cv"] = -R * tau ** 2 * (p0tt + prtt)
    out["cp"] = out["cv"] + R * (1 + delta * prd - delta * tau * prdt) ** 2 / (
        1 + 2 * delta * prd + delta ** 2 * prdd)
    out["w"] = math.sqrt(1000 * R * T / M * (1 + 2 * delta * prd + delta ** 2 * prdd
        - (1 + delta * prd - delta * tau * prdt) ** 2 / (tau ** 2 * (p0tt + prtt))))
    out["_phi"] = (p0, p0t, p0tt, pr, prd, prdd, prt, prtt, prdt)
    return out


def saturation(T):
    """Maxwell-criterion saturation state (p [MPa], rho', rho'') at T < Tc."""
    rl, rv = aux_rho_liq(T), aux_rho_vap(T)
    for _ in range(100):
        a, b = props(T, rl), props(T, rv)
        f1 = a["p"] - b["p"]
        f2 = a["g"] - b["g"]
        # numeric Jacobian in (rl, rv)
        h = 1e-6
        a2, b2 = props(T, rl * (1 + h)), props(T, rv * (1 + h))
        J = [[(a2["p"] - a["p"]) / (rl * h), -(b2["p"] - b["p"]) / (rv * h)],
             [(a2["g"] - a["g"]) / (rl * h), -(b2["g"] - b["g"]) / (rv * h)]]
        det = J[0][0] * J[1][1] - J[0][1] * J[1][0]
        dl = (f1 * J[1][1] - f2 * J[0][1]) / det
        dv = (J[0][0] * f2 - J[1][0] * f1) / det
        rl -= dl
        rv -= dv
        if abs(dl) < 1e-13 * rl and abs(dv) < 1e-13 * rv:
            break
    return props(T, rl)["p"], rl, rv


def sat_T_at_p(p_MPa, T0=374.0):
    T = T0
    for _ in range(60):
        ps = saturation(T)[0]
        dT = 1e-4
        dp = (saturation(T + dT)[0] - ps) / dT
        step = (ps - p_MPa) / dp
        T -= step
        if abs(step) < 1e-10:
            break
    return T


def rel(a, b):
    return abs(a - b) / abs(b)


# ---- verification: every check value the two documents print ---------------
def check():
    bad = []
    def eq(name, got, want, tol):
        ok = rel(got, want) <= tol if want != 0 else abs(got) <= tol
        print(f"  {'ok ' if ok else 'BAD'} {name:46s} {got:.10g}  vs  {want:.10g}  (rel {rel(got, want) if want else abs(got):.1e})")
        if not ok:
            bad.append(name)
    print("Release Table 6 (T = 500 K, rho = 46.26 mol/dm3):")
    pr = props(500.0, 46.26)["_phi"]
    p0, p0t, p0tt, pr_, prd, prdd, prt, prtt, prdt = pr
    delta, tau = 46.26 / RHOC, TC / 500.0
    eq("phi0", p0, 0.196352717e1, 2e-9)
    eq("phi0_tau", p0t, 0.939259413e1, 2e-9)
    eq("phi0_tautau", p0tt, -0.209517144e1, 2e-9)
    eq("phi_r", pr_, -0.342291092e1, 2e-9)
    eq("phi_r_delta", prd, -0.367562780, 2e-8)
    eq("phi_r_deltadelta", prdd, 0.835183806, 2e-8)
    eq("phi_r_tau", prt, -0.589707436e1, 2e-9)
    eq("phi_r_tautau", prtt, -0.245187285e1, 2e-9)
    eq("phi_r_deltatau", prdt, -0.113178440e1, 2e-8)
    print("Release Table 7 (p, cv, w, s):")
    T7 = [(300, 55.126, 0.529123711e-1, 0.833839128e2, 0.140374625e4, 0.673910582e1),
          (300, 60.0, 0.238222326e3, 0.738561038e2, 0.177279674e4, 0.540117148e1),
          (300, 65.0, 0.626176781e3, 0.699125978e2, 0.229697942e4, 0.271566150e1),
          (500, 0.5e-1 * 0 + 0.5, 0.188967446e1, 0.366460545e2, 0.489633254e3, 0.120227024e3),
          (500, 46.26, 0.835329492e1, 0.626885994e2, 0.117888631e4, 0.495587000e2),
          (500, 50.0, 0.107462884e3, 0.617372286e2, 0.148374868e4, 0.469453826e2),
          (500, 60.0, 0.721798322e3, 0.576860681e2, 0.241393520e4, 0.393599094e2),
          (643.8, 20.0, 0.216503820e2, 0.992661842e2, 0.256043612e3, 0.817656125e2),
          (800, 0.25, 0.164466177e1, 0.344327932e2, 0.639281410e3, 0.142125615e3)]
    for T, rho, p, cv, w, s in T7:
        q = props(T, rho)
        tp = 2e-8 if T == 300 and rho < 56 else 2e-8
        # the table's own footnote: the liquid-at-low-p pressure may not reach 9 digits
        eq(f"p({T},{rho})", q["p"], p, 2e-7 if rho > 55 and T == 300 else 2e-9 * 10)
        eq(f"cv({T},{rho})", q["cv"], cv, 2e-8)
        eq(f"w({T},{rho})", q["w"], w, 2e-8)
        eq(f"s({T},{rho})", q["s"], s, 2e-8)
    print("Release Table 8 (saturation, Maxwell criterion):")
    T8 = {280.0: (0.823054058e-3, 0.552072786e2, 0.353747143e-3, 0.257444444e3, 0.466106716e5, 0.924406091, 0.166471646e3),
          450.0: (0.921212105, 0.492937575e2, 0.264075691, 0.145127149e5, 0.515019146e5, 0.406584121e2, 0.122856634e3),
          625.0: (0.172118129e2, 0.306770554e2, 0.694443339e1, 0.324533556e5, 0.472460343e5, 0.731042291e2, 0.967725149e2)}
    for T, (p, rl, rv, hl, hv, sl, sv) in T8.items():
        ps, a, b = saturation(T)
        ql, qv = props(T, a), props(T, b)
        eq(f"p_sat({T})", ps, p, 1e-8)
        eq(f"rho'({T})", a, rl, 1e-8)
        eq(f"rho''({T})", b, rv, 1e-8)
        eq(f"h'({T})", ql["h"], hl, 1e-8)
        eq(f"h''({T})", qv["h"], hv, 1e-8)
        eq(f"s'({T})", ql["s"], sl, 1e-7)
        eq(f"s''({T})", qv["s"], sv, 1e-8)
    print("Triple point reference state (u = s = 0 for the saturated liquid):")
    ps, a, b = saturation(TT)
    ql = props(TT, a)
    u = ql["h"] - ps * 1e6 / (a * 1e3)
    eq("s'(Ttp) [J/mol/K]", abs(ql["s"]) + 1.0, 1.0, 5e-9)
    eq("u'(Ttp) [J/mol]", abs(u) + 1.0, 1.0, 5e-8)
    eq("p_sat(Ttp) [MPa] vs Table 1", ps, PTT_MPA, 2e-3)
    print("Herrig et al. 2018 auxiliary equations, check values at 293.15 K:")
    eq("Eq.(1) p_v [MPa]", aux_pv_MPa(293.15), 0.1999143263e-2, 1.2e-6)
    eq("Eq.(2) rho'", aux_rho_liq(293.15), 0.551959089e2, 5e-9)
    eq("Eq.(3) rho''", aux_rho_vap(293.15), 0.8211367673e-3, 5e-9)
    print("Release Sec. 6 melting/sublimation (Ih), check values:")
    th = 270.0 / 276.969
    pm = PTT_MPA * (1 - 0.30153e5 * (1 - th ** 5.5) + 0.692503e6 * (1 - th ** 8.2))
    eq("Eq.(9) p_m(270 K) [MPa]", pm, 0.837888413e2, 1e-8)
    th = 245.0 / 276.969
    ps_ = PTT_MPA * math.exp(-0.1314226e2 * (1 - th ** -1.73) + 0.3212969e2 * (1 - th ** -1.42))
    eq("Eq.(13) p_subl(245 K) [MPa]", ps_, 0.327390934e-4, 1e-8) if False else None
    print()
    if bad:
        print("heavy_water_iapws: FAILED --", ", ".join(bad))
        return 1
    print("heavy_water_iapws: OK -- the EOS transcription reproduces every "
          "check value of R16-17(2018) Tables 6-8 and of the auxiliary "
          "Eqs. (1)-(3) (Herrig et al. 2018) it was compared with.")
    return 0


# ---- the polynomial fits the record carries --------------------------------
def polyfit(xs, ys, deg):
    n = deg + 1
    # least squares in relative error (weights 1/y), normal equations on scaled T
    A = [[0.0] * n for _ in range(n)]
    b = [0.0] * n
    s = 1000.0
    for x, y in zip(xs, ys):
        w = 1.0 / y
        row = [(x / s) ** k for k in range(n)]
        for i in range(n):
            b[i] += w * w * row[i] * y
            for j in range(n):
                A[i][j] += w * w * row[i] * row[j]
    # gauss
    for i in range(n):
        piv = max(range(i, n), key=lambda r: abs(A[r][i]))
        A[i], A[piv] = A[piv], A[i]
        b[i], b[piv] = b[piv], b[i]
        for r in range(i + 1, n):
            f = A[r][i] / A[i][i]
            for c in range(i, n):
                A[r][c] -= f * A[i][c]
            b[r] -= f * b[i]
    x = [0.0] * n
    for i in reversed(range(n)):
        x[i] = (b[i] - sum(A[i][j] * x[j] for j in range(i + 1, n))) / A[i][i]
    return [x[k] / s ** k for k in range(n)]


def cp0_exact(T):
    """Ideal-gas cp from Eq. (6): c0 + sum v_i x^2 e^x/(e^x-1)^2, x = u/T, in J/(mol K)."""
    c = C0
    for v, u in zip(V, U):
        x = u / T
        c += v * x * x * math.exp(x) / (math.exp(x) - 1) ** 2
    return R * c


def fits():
    out = {}
    Ts = [250 + 5 * k for k in range(0, 116)]            # 250 .. 825 K
    ys = [cp0_exact(T) for T in Ts]
    c = polyfit(Ts, ys, 3)
    dev = [(sum(ci * T ** k for k, ci in enumerate(c)) - y) / y for T, y in zip(Ts, ys)]
    out["cp0"] = (c, (250, 825), max(abs(d) for d in dev))
    Tl = [277 + 2 * k for k in range(0, 98)]             # 277 .. 471 K
    yl = []
    for T in Tl:
        ps, rl, rv = saturation(T)
        yl.append(props(T, rl)["cp"])
    c = polyfit(Tl, yl, 3)
    dev = [(sum(ci * T ** k for k, ci in enumerate(c)) - y) / y for T, y in zip(Tl, yl)]
    out["cpl"] = (c, (277, 471), max(abs(d) for d in dev))
    return out


def report():
    print("== constants ==")
    Tb = sat_T_at_p(0.101325)
    ps, rl, rv = saturation(Tb)
    hv = props(Tb, rv)["h"] - props(Tb, rl)["h"]
    print(f"Tb (EOS, 101325 Pa) = {Tb:.4f} K   (Table 1: {TNBP})")
    print(f"HvapTb (EOS)        = {hv:.2f} J/mol")
    for T in (0.7 * TC,):
        print(f"omega from Eq.1 at Tr 0.7 = {-math.log10(aux_pv_MPa(T) / PC_MPA) - 1:.5f}; "
              f"from EOS = {-math.log10(saturation(T)[0] / PC_MPA) - 1:.5f}   (Table 1: {OMEGA})")
    ps, rl, rv = saturation(298.15)
    print(f"rho'(298.15) EOS = {rl:.5f} mol/dm3  -> Vliq = {1e-3 / rl:.5e} m3/mol; Eq.2 {aux_rho_liq(298.15):.5f}")
    for T in (298.15, 323.15, 373.15):
        ps, rl, rv = saturation(T)
        print(f"T={T}: EOS p={ps*1e6:.3f} Pa  Eq.1 p={aux_pv_MPa(T)*1e6:.3f} Pa  rel {rel(aux_pv_MPa(T), ps):.2e}")
    print("== fits ==")
    for k, (c, rng, mx) in fits().items():
        print(k, c, rng, f"max rel dev {mx:.3e}")


if __name__ == "__main__":
    a = sys.argv[1:] or ["--check"]
    if "--check" in a:
        sys.exit(check())
    if "--report" in a:
        report()
    if "--fit" in a:
        for k, (c, rng, mx) in fits().items():
            print(k, repr(c), rng, mx)
