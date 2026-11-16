#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""fit_water_vapour_equilibrium.py -- derive the gas-liquid record of water's
own vapour from water's ONE saturation curve.

    bin/curate/fit_water_vapour_equilibrium.py [--write]

WHY.  Water's saturation curve lives in data/standards/components/water.dat
(vapour-pressure model Wagner = IAPWS SR1-86 Eq. 1).  The PHREEQC-convention
record data/standards/chemistry/water-vapour-equilibrium.dat ("H2O(g) = H2O")
stated the same curve a second time, as a dissolution constant with its own
analytic fit (USGS phreeqc.dat), which agreed with neither the Antoine law
nor the IAPWS equation.  At unit water activity the equilibrium constant of
H2O(g) = H2O is K = 1 / (p_sat / 1 atm), so

    logK(T) = - log10( p_sat(T) / 101325 Pa )

and the six coefficients of the engine's analytic form
    logK = A1 + A2 T + A3/T + A4 log10 T + A5/T^2 + A6 T^2
are the linear least-squares fit of that function to the Wagner block, over
273.16-473.15 K (the form is linear in A1..A6).  dH [J/mol] at 298.15 K is
R ln10 T^2 d(logK)/dT of the fit.  The record keeps no number the curve does
not give; `check_water_one_home.py` recomputes both from the Wagner block and
fails when they disagree.  The tool writes the analytic line, logK25 and dH.
"""
import math
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
WATER = ROOT / "data" / "standards" / "components" / "water.dat"
REC = ROOT / "data" / "standards" / "chemistry" / "water-vapour-equilibrium.dat"
R = 8.314462618
ATM = 101325.0
T_LO, T_HI = 273.16, 473.15


def wagner_from_record():
    t = WATER.read_text()
    vp = re.search(r"(?m)^vaporPressure\s*\{(.*?)^\}", t, re.S).group(1)
    assert re.search(r"model\s+Wagner", vp), "water.dat's law is not Wagner"
    Tr = float(re.search(r"reducing\s*\{\s*T\s+([0-9.]+)\s*K", vp).group(1))
    Pr = float(re.search(r"P\s+([0-9.]+)\s*MPa", vp).group(1)) * 1e6
    ex = [float(v) for v in re.search(r"exponents\s*\(([^)]*)\)", vp).group(1).split()]
    co = [float(v) for v in re.search(r"coefficients\s*\(([^)]*)\)", vp).group(1).split()]
    return Tr, Pr, ex, co


def psat(T, law):
    Tr, Pr, ex, co = law
    u = 1.0 - T / Tr
    return Pr * math.exp(Tr / T * sum(c * u ** e for c, e in zip(co, ex)))


def basis(T):
    return [1.0, T, 1.0 / T, math.log10(T), 1.0 / T ** 2, T * T]


def fit():
    law = wagner_from_record()
    Ts = np.linspace(T_LO, T_HI, 201)
    A = np.array([basis(T) for T in Ts])
    y = np.array([-math.log10(psat(T, law) / ATM) for T in Ts])
    # column scaling for conditioning
    sc = np.abs(A).max(axis=0)
    c = np.linalg.lstsq(A / sc, y, rcond=None)[0] / sc
    res = A @ c - y
    return law, c, float(np.abs(res).max())


def logk(c, T):
    return sum(ci * bi for ci, bi in zip(c, basis(T)))


def dH298(c):
    T, h = 298.15, 1e-3
    d = (logk(c, T + h) - logk(c, T - h)) / (2 * h)
    return R * math.log(10) * T * T * d


def main():
    law, c, mx = fit()
    c = [float(f"{v:.8g}") for v in c]
    k25 = logk(c, 298.15)
    dh = dH298(c)
    print("analytic (%s)" % " ".join("%.8g" % v for v in c))
    print("logK25 = %.4f   dH(298.15) = %.0f J/mol   max |logK fit - law| over %g-%g K = %.2e (%.3f %% in p)"
          % (k25, dh, T_LO, T_HI, mx, 100 * (10 ** mx - 1)))
    if "--write" not in sys.argv:
        return 0
    t = REC.read_text()
    new = ("      logK25 %.4f; dH %.0f; analytic ( %s ); source \"derived from water's own vapour-pressure law "
           "(components/water.dat, IAPWS SR1-86 Eq. 1): logK = -log10(psat/atm), six-term least squares over "
           "%g-%g K by bin/curate/fit_water_vapour_equilibrium.py; replaces the USGS PHREEQC phreeqc.dat fit\";"
           % (k25, dh, " ".join("%.8g" % v for v in c), T_LO, T_HI))
    t2 = re.sub(r"(?m)^\s*logK25 .*$", new, t, count=1)
    REC.write_text(t2)
    print("written", REC)
    return 0


if __name__ == "__main__":
    sys.exit(main())
