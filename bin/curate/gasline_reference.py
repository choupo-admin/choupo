#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Vítor Geraldes
"""
gasline_reference.py -- an INDEPENDENT hand computation of the isothermal gas
line (C506), written without reading the engine's source: ideal-gas density,
Churchill's friction factor coded here, the exact isothermal equation solved by
plain bisection and the mean-density shortcut in closed form.

    P1^2 - P2^2 = c G^2 [ f L/D + SUM K + 2 ln(P1/P2) ] ,   c = R T / M (Z = 1)
    P2(mean rho)^2 = P1^2 - c G^2 [ f L/D + SUM K ]

The one input it cannot compute for itself is the gas viscosity (the engine
takes it from the Chung model of the case's property dictionary); it is a
command-line argument, so the number that was compared is on the screen.

Usage:  gasline_reference.py T P1 mdot D L eps M mu [sumK]
        (SI: K, Pa, kg/s, m, m, m, kg/mol, Pa s)
Prints P2 exact, P2 mean-density, f, Re, L_max.
"""
import math
import sys

R = 8.314462618


def churchill(Re, rr):
    # Churchill (1977), Chem. Eng. 84(24) 91: f = 8 [ (8/Re)^12 + 1/(A+B)^1.5 ]^(1/12)
    A = (2.457 * math.log(1.0 / ((7.0 / Re) ** 0.9 + 0.27 * rr))) ** 16
    B = (37530.0 / Re) ** 16
    return 8.0 * ((8.0 / Re) ** 12 + 1.0 / (A + B) ** 1.5) ** (1.0 / 12.0)


def solve(T, P1, mdot, D, L, eps, M, mu, sumK=0.0):
    A = math.pi * D * D / 4.0
    G = mdot / A
    c = R * T / M
    Re = G * D / mu
    f = churchill(Re, eps / D)
    K = f * L / D + sumK
    Pch = G * math.sqrt(c)
    g = lambda P2: P1 * P1 - P2 * P2 - c * G * G * (K + 2.0 * math.log(P1 / P2))
    lo, hi = Pch, P1
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if g(mid) > 0.0:
            lo = mid
        else:
            hi = mid
    P2 = 0.5 * (lo + hi)
    P2m = math.sqrt(P1 * P1 - c * G * G * K)
    Kmax = (P1 * P1 - Pch * Pch) / (c * G * G) - 2.0 * math.log(P1 / Pch)
    Lmax = (Kmax - sumK) * D / f
    return dict(P2=P2, P2mean=P2m, f=f, Re=Re, G=G, c=c, Pch=Pch, Lmax=Lmax)


if __name__ == "__main__":
    a = [float(x) for x in sys.argv[1:]]
    if len(a) < 8:
        sys.exit(__doc__)
    r = solve(*a)
    for k, v in r.items():
        print(f"{k:8s} {v:.12g}")
