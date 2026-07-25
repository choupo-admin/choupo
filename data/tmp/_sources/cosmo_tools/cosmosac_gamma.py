#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cosmosac_gamma.py -- a faithful PYTHON MIRROR of Choupo's
                     src/thermo/activityCoefficient/CosmoSac.cpp (COSMO-SAC 2002).

PRIVATE STAGING TOOL under data/tmp/ (gitignored).  It exists ONLY to measure the
CONSEQUENCE of swapping a component's COSMO set (VT-2005 -> LVPP) on the activity
coefficient, WITHOUT touching the C++ or writing any profile into a component file.

The mirror is line-for-line the same algorithm and the SAME constants as
CosmoSac.cpp (which cites usnistgov/COSMOSAC `COSMO1Constants`):
    a_eff = 7.5 A^2, alpha' = 16466.72, c_hb = 85580.0, sigma_hb = 0.0084,
    z = 10, r_0 = 66.69 A^3, q_0 = 79.53 A^2, R = 0.001987 kcal/(mol K),
    grid -0.025..0.025 e/A^2 step 0.001 (51 nodes), fixed point with 1/2 damping.

VALIDATION: `--verify` reproduces the golden CSV outputs that the shipped tutorial
`tutorials/props/molecular/cosmoSAC01_water_ethanol` recorded from the real
choupoProps binary.  If that check fails, nothing this script says is admissible.
"""

from __future__ import annotations

import math
import os
import sys

import numpy as np

A_EFF = 7.5
ALPHA_P = 16466.72
C_HB = 85580.0
SIGMA_HB = 0.0084
Z_COORD = 10.0
R0_NORM = 66.69
Q0_NORM = 79.53
R_GAS = 0.001987
NGRID = 51
SIGMA_MIN = -0.025
DSIGMA = 0.001

_grid = SIGMA_MIN + DSIGMA * np.arange(NGRID)
_sm = _grid[:, None]
_sn = _grid[None, :]
_acc = np.maximum(_sm, _sn)
_don = np.minimum(_sm, _sn)
DW = 0.5 * ALPHA_P * (_sm + _sn) ** 2 \
    + C_HB * np.maximum(0.0, _acc - SIGMA_HB) * np.minimum(0.0, _don + SIGMA_HB)


def ln_segment_gamma(T, p):
    RT = R_GAS * T
    E = np.exp(-DW / RT)
    G = np.ones(NGRID)
    for _ in range(500):
        Gnew = 1.0 / (E @ (p * G))
        maxdiff = np.max(np.abs(Gnew - G))
        G = 0.5 * (G + Gnew)
        if maxdiff < 1e-8:
            break
    return np.log(G)


def gamma(T, x, areas, vols, pAreas):
    x = np.asarray(x, float)
    areas = np.asarray(areas, float)
    vols = np.asarray(vols, float)
    P = np.asarray(pAreas, float)                # n x NGRID, AREA per bin

    Amix = float((x * areas).sum())
    pS = (x[:, None] * P).sum(axis=0) / Amix
    lnGS = ln_segment_gamma(T, pS)

    r = vols / R0_NORM
    q = areas / Q0_NORM
    l = 0.5 * Z_COORD * (r - q) - (r - 1.0)
    sumRx = float((r * x).sum())
    sumQx = float((q * x).sum())
    sumXl = float((x * l).sum())

    out = np.zeros(len(x))
    for i in range(len(x)):
        pI = P[i] / areas[i]
        lnGI = ln_segment_gamma(T, pI)
        res = float((pI * (lnGS - lnGI)).sum()) * areas[i] / A_EFF
        phi_over_x = r[i] / sumRx
        theta_over_x = q[i] / sumQx
        comb = (math.log(phi_over_x)
                + 0.5 * Z_COORD * q[i] * math.log(theta_over_x / phi_over_x)
                + l[i] - phi_over_x * sumXl)
        out[i] = math.exp(comb + res)
    return out


# ------------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sigma_profile import profile                       # noqa: E402
from validate_panel import read_vt2005, LVPP            # noqa: E402


def vt_set(name):
    d = read_vt2005(name)
    return d["area"], d["volume"], d["psigmaA"]


def lvpp_set(stem):
    r = profile(os.path.join(LVPP, stem + ".cosmo"), "Mullins")
    return r["cavityArea_A2"], r["cavityVolume_A3"], np.array(r["psigmaA_A2"])


def verify():
    """Reproduce the golden CSVs recorded from the real choupoProps binary."""
    cases = [
        ("water/ethanol 0.5/0.5 @298.15", 298.15, [0.5, 0.5],
         ["water", "ethanol"], [1.37424181, 1.10622790]),
        ("water/ethanol 0.5/0.5 @308.15", 308.15, [0.5, 0.5],
         ["water", "ethanol"], [1.37747824, 1.11284374]),
        ("water/nHexane 0.5/0.5 @298.15", 298.15, [0.5, 0.5],
         ["water", "nHexane"], [5.12735338, 3.16476008]),
        ("water/nHexane 0.5/0.5 @308.15", 308.15, [0.5, 0.5],
         ["water", "nHexane"], [5.00985635, 3.11071170]),
        ("water pure @298.15", 298.15, [1.0], ["water"], [1.0]),
    ]
    worst = 0.0
    for tag, T, x, comps, ref in cases:
        sets = [vt_set(c) for c in comps]
        g = gamma(T, x, [s[0] for s in sets], [s[1] for s in sets],
                  [s[2] for s in sets])
        rel = [abs(a / b - 1.0) for a, b in zip(g, ref)]
        worst = max(worst, max(rel))
        print("  %-32s got %s  ref %s  relmax %.2e"
              % (tag, np.array2string(g, precision=8), ref, max(rel)))
    ok = worst < 2e-8
    print("  VERIFY vs choupoProps golden CSVs: %s (worst rel. dev. %.2e)"
          % ("PASS" if ok else "FAIL", worst))
    return ok


def consequence():
    pairs = [
        ("water", "WATER", "ethanol", "ETHANOL", [0.5, 0.5], 298.15),
        ("water", "WATER", "ethanol", "ETHANOL", [0.01, 0.99], 298.15),
        ("water", "WATER", "ethanol", "ETHANOL", [0.99, 0.01], 298.15),
        ("water", "WATER", "nHexane", "N-HEXANE", [0.5, 0.5], 298.15),
        ("water", "WATER", "nHexane", "N-HEXANE", [0.01, 0.99], 298.15),
        ("ethanol", "ETHANOL", "benzene", "BENZENE", [0.5, 0.5], 298.15),
        ("acetone", "ACETONE", "nHexane", "N-HEXANE", [0.5, 0.5], 298.15),
        ("water", "WATER", "acetone", "ACETONE", [0.01, 0.99], 298.15),
    ]
    print("%-34s %-10s | %10s %10s %9s | %10s %10s %9s"
          % ("system (x1/x2)", "T/K", "g1_VT", "g1_LVPP", "dev%",
             "g2_VT", "g2_LVPP", "dev%"))
    print("-" * 116)
    rows = []
    for c1, s1, c2, s2, x, T in pairs:
        V = [vt_set(c1), vt_set(c2)]
        L = [lvpp_set(s1), lvpp_set(s2)]
        gV = gamma(T, x, [a[0] for a in V], [a[1] for a in V], [a[2] for a in V])
        gL = gamma(T, x, [a[0] for a in L], [a[1] for a in L], [a[2] for a in L])
        d1 = 100 * (gL[0] / gV[0] - 1)
        d2 = 100 * (gL[1] / gV[1] - 1)
        tag = "%s(%.2f)/%s(%.2f)" % (c1, x[0], c2, x[1])
        print("%-34s %-10.2f | %10.4f %10.4f %+8.1f%% | %10.4f %10.4f %+8.1f%%"
              % (tag, T, gV[0], gL[0], d1, gV[1], gL[1], d2))
        rows.append((tag, T, gV[0], gL[0], d1, gV[1], gL[1], d2))
    return rows


if __name__ == "__main__":
    print("VERIFY -- Python mirror vs the real choupoProps golden outputs")
    ok = verify()
    if not ok:
        sys.exit(1)
    print("\nCONSEQUENCE -- same engine maths, VT-2005 set vs LVPP-derived set")
    consequence()
