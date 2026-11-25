#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The Billet-Schultes method written a SECOND time, from the page images of
R. Billet, M. Schultes, Trans IChemE 77 Part A (1999) 498-504, in a different
language from the engine's PackingBS.cpp and sharing no code with it.  It is
the hand point the engine's law is held to by bin/curate/check_billet_schultes.py
(DEV.md C513).  Equation numbers are the paper's.  SI units throughout.

    python3 bin/curate/billet_schultes_reference.py   # prints the states
"""
import math

G = 9.80665
# water at 20 C, declared (the paper says "water" in Eqs 15 and 44, no temperature)
SIGMA_W, ETA_W, RHO_W = 0.0728, 1.002e-3, 998.2

# Table 2a (p. 501), the rows entered in the catalogue
PACKINGS = {
    "PallRing-metal-50":   dict(a=112.6, e=0.951, CS=2.725, CFl=1.580, Ch=0.784, CP0=0.763, CL=1.192, CV=0.410),
    "PallRing-metal-25":   dict(a=223.5, e=0.954, CS=2.627, CFl=2.083, Ch=0.719, CP0=0.957, CL=1.440, CV=0.336),
    "PallRing-plastic-50": dict(a=111.1, e=0.919, CS=2.816, CFl=1.757, Ch=0.593, CP0=0.698, CL=1.239, CV=0.368),
    "PallRing-plastic-25": dict(a=225.0, e=0.887, CS=2.696, CFl=2.064, Ch=0.528, CP0=0.865, CL=0.905, CV=0.446),
    "Raschig-ceramic-25":  dict(a=190.0, e=0.680, CS=2.454, CFl=1.899, Ch=0.577, CP0=1.329, CL=1.361, CV=0.412),
}


def bisect(f, lo, hi):
    flo = f(lo)
    for _ in range(300):
        mid = 0.5 * (lo + hi)
        fm = f(mid)
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return 0.5 * (lo + hi)


def evaluate(p, dcol, uV, uL, rhoV, rhoL, etaV, etaL, sigma, DL, DV, lam=1.0):
    a, e = p["a"], p["e"]
    nuL, nuV = etaL / rhoL, etaV / rhoV
    dh = 4 * e / a                                              # (10)
    LV = uL * rhoL / (uV * rhoV)
    fp = LV * math.sqrt(rhoV / rhoL)
    # holdup below loading, (41)-(43)
    ReL = uL * rhoL / (a * etaL)
    Fr = uL ** 2 * a / G
    ah = p["Ch"] * ReL ** 0.15 * Fr ** 0.1 if ReL < 5 else p["Ch"] * 0.85 * ReL ** 0.25 * Fr ** 0.1
    hLS = (12 * nuL * uL * a * a / G) ** (1 / 3) * ah ** (2 / 3)
    # loading point, (31)-(35)
    if fp <= 0.4:
        nS, CS = -0.326, p["CS"]
    else:
        nS, CS = -0.723, 0.695 * p["CS"] * (etaL / etaV) ** 0.1588
    psiS = G / CS ** 2 * (fp * (etaL / etaV) ** 0.4) ** (-2 * nS)

    def rhs(u):
        uLS = rhoV / rhoL * LV * u
        X = 12 * nuL * uLS / G
        return math.sqrt(G / psiS) * (e / a ** (1 / 6) - math.sqrt(a) * X ** (1 / 3)) * X ** (1 / 6) * math.sqrt(rhoL / rhoV)

    uhi = e ** 3 / a ** 2 * G / (12 * nuL) * rhoL / rhoV / LV
    uS = bisect(lambda u: rhs(u) - u, 1e-9 * uhi, uhi)
    # flooding point, (36)-(40), (13)
    if fp <= 0.4:
        nF, CF = -0.194, p["CFl"]
    else:
        nF, CF = -0.708, 0.6244 * p["CFl"] * (etaL / etaV) ** 0.1028
    psiF = G / CF ** 2 * (fp * (etaL / etaV) ** 0.2) ** (-2 * nF)

    def uF(h):
        return math.sqrt(2) * math.sqrt(G / psiF * (e - h) ** 1.5 / math.sqrt(e)) * math.sqrt(h / a) * math.sqrt(rhoL / rhoV)

    hF = bisect(lambda h: h ** 3 * (3 * h - e) - 6 / G * a * a * e * nuL * LV * rhoV / rhoL * uF(h), e / 3, e)
    uFl = uF(hF)
    out = dict(uS=uS, uFl=uFl, hLS=hLS, flooded=uV >= uFl, aboveLoading=uV > uS)
    if uV >= uFl:
        return out
    sg = max(sigma, 0.03)

    def aph(s, c):                                              # (9), (15)
        return c * (a * dh) ** -0.5 * (uL * dh / nuL) ** -0.2 * (uL ** 2 * rhoL * dh / s) ** 0.75 * (uL ** 2 / (G * dh)) ** -0.45

    aS = aph(sg, 1.5)
    if uV <= uS:
        hL, ub, aA = hLS, uL / hLS, aS
    else:
        hLF = 2.2 * hLS * (etaL * RHO_W / (ETA_W * rhoL)) ** 0.05      # (44)
        w = (uV / uFl) ** 13
        hL = hLS + (hLF - hLS) * w                                     # (12)
        aF = aph(sg, 10.5 * (sg / SIGMA_W) ** 0.56)                    # (15)
        aA = aS + (aF - aS) * w                                        # (14)
        ub = (G * rhoV ** 2 * uV ** 2 / (12 * etaL * a * a * rhoL)) ** (1 / 3) * LV ** (2 / 3) \
            * (1 - ((uV - uS) / (uFl - uS)) ** 2)                      # (16)
    kL = p["CL"] * 12 ** (1 / 6) * math.sqrt(ub) * math.sqrt(DL / dh)  # (6)
    bVa = p["CV"] / math.sqrt(e - hL) * a ** 1.5 / math.sqrt(dh) * DV * (uV / (a * nuV)) ** 0.75 \
        * (nuV / DV) ** (1 / 3) * aA                                   # (8)
    ae = aA * a
    HG, HL = uV / bVa, uL / (kL * ae)
    HOG = HG + lam * HL
    # pressure drop (23)-(30)
    dP = 6 * (1 - e) / a
    K = 1 / (1 + 2 / (3 * (1 - e)) * dP / dcol)
    ReV = uV * dP / ((1 - e) * nuV) * K
    psi0 = p["CP0"] * (64 / ReV + 1.8 / ReV ** 0.08)
    FV2 = uV ** 2 * rhoV
    dp0 = psi0 * a / e ** 3 * FV2 / 2 / K
    psiL = psi0 * ((e - hL) / e) ** 1.5 * (hL / hLS) ** 0.3 * math.exp(13300 / a ** 1.5 * math.sqrt(Fr))
    dpw = psiL * a / (e - hL) ** 3 * FV2 / 2 / K
    out.update(hL=hL, ae=ae, kL=kL, kG=bVa / ae, HG=HG, HL=HL, HOG=HOG, dPdry=dp0, dP=dpw, ubar=ub, aOverA=aA)
    return out


# the hand states: a cyclohexane / n-heptane-like liquid on its vapour at 1 atm, total reflux (L/V mass = 1)
STATE = dict(rhoV=3.0, rhoL=680.0, etaV=1.0e-5, etaL=4.0e-4, sigma=0.0198, DL=3.0e-9, DV=4.0e-6)
DCOL = 0.5
# (packing, u_V, L/V mass ratio): the base ratio 1 is total reflux; 0.1 puts Re_L under 5 (Eq 42's
# branch); 8 puts the flow parameter (L/V) sqrt(rho_V/rho_L) above 0.4 (Eqs 34-35, 39-40)
CASES = [("PallRing-metal-25", u, 1.0) for u in (0.5, 1.0, 1.4)] \
      + [("Raschig-ceramic-25", u, 1.0) for u in (0.5, 1.0, 1.4)] \
      + [("PallRing-metal-25", 1.0, 0.1), ("PallRing-metal-25", 0.2, 8.0), ("PallRing-metal-25", 0.7, 8.0),
         ("PallRing-plastic-50", 1.2, 0.1), ("PallRing-plastic-50", 0.8, 8.0)]


def states():
    for name, uV, LV in CASES:
        uL = uV * STATE["rhoV"] / STATE["rhoL"] * LV
        yield name, uV, LV, evaluate(PACKINGS[name], DCOL, uV, uL, STATE["rhoV"], STATE["rhoL"], STATE["etaV"],
                                     STATE["etaL"], STATE["sigma"], STATE["DL"], STATE["DV"], 0.9)


if __name__ == "__main__":
    for name, uV, LV, r in states():
        print(name, uV, LV, {k: (float("%.10g" % v) if isinstance(v, float) else v) for k, v in r.items()})
