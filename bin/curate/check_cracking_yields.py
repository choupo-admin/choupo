#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the Sundaram & Froment (1977) ethane-cracking scheme, in a pfr, against the published numbers.

    bin/curate/check_cracking_yields.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  The case's constant/reactions carries
five reactions (seven laws: two are reverse legs) written in SI from a paper
that prints A in s^-1 or l/mol/s, E in kcal/mol and K_C in mol/l.  A transcription
is a legal rate law whichever way it is wrong: l/mol/s read as m3/mol/s (10^3 on
every second-order step), kcal read as kJ (a factor 4.184 in E, e^(-18) at 1100 K),
K_C taken in the wrong direction.  Every one runs at exit 0 with the mass and element
balances closed, and a golden pins what it prints.  Worse, this reactor holds its
CONVERSION fixed (the volume is chosen to reach the published 59.1 %), so an error
in the main step k1 is absorbed by the volume and the product slate barely moves:
the check must therefore sit on the SECONDARY steps and on the volume itself.

WHAT THIS GATE CHECKS (tutorials/steady/reactors/cracking01_ethane_sundaram_froment).

  (A) FIDELITY.  An independent integration written HERE (plain Python, RK4, the
      volumetric flow re-priced at every step from the local mole count, the rate
      constants re-typed from Sundaram & Froment Table 3 and the K_C under Table 1)
      is compared with the engine's outlet at the case's own volume.  The engine
      chain re-prices Q at each of 20 segments, so the two differ by the
      discretisation of the gas expansion (about 1 %); the tolerance is 3 % of each
      yield above 0.3 wt % and 0.01 wt % absolute below, and 0.6 points of
      conversion.  Two transcriptions agreeing is what the gate holds.

  (B) THE PUBLISHED TABLE.  Froment, Van de Steene & Van Damme (1976), Table VIII,
      pilot column, at 59.1 % conversion: H2 3.71, CH4 2.99, C2H4 48.7, C2H6 39.0,
      C3H6 1.05, C4H6 0.99 (wt %).  The band was DECLARED BEFORE THE FIRST RUN
      (README): C2H4 3 %, H2 6 %.  Both PASS and are held to it.
      The others do NOT reproduce the table, and the gate says so by name rather
      than widening the band: CH4 -29 %, C3H6 -59 %, C4H6 +93 % (declared 15 %, 35 %,
      35 %); C2H6 is not compared because the table's 39.0 wt % ethane and its 59.1 %
      conversion disagree with each other (100 - 59.1 = 40.9).  Each is pinned at its
      measured deviation with a drift allowance of 5 points, so the gate fails if the
      distance to the published value CHANGES, in either direction, without the
      README being re-read.

  (C) SABOTAGE.  The case copy is rerun with k6's A multiplied by 1000 (the l/mol/s
      read as m3/mol/s defect); (A) must then fail on the butadiene yield.

NOT CHECKED: the scheme's prediction of conversion against volume (the equivalent
volume of the published run is not printed in the papers), the industrial coil
(the pfr has no declared temperature or pressure profile), propane cracking.
"""
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

CASE = "tutorials/steady/reactors/cracking01_ethane_sundaram_froment"
STRIP = ("expected", "converged", "reports", "constant/propertyManifest")

MW = {"ethane": 30.069, "ethylene": 28.053, "H2": 2.016, "CH4": 16.043, "propylene": 42.080,
      "propane": 44.096, "acetylene": 26.038, "13Butadiene": 54.092, "water": 18.015}
FEED_ETHANE_KMOL_H = 3.6
FEED_STEAM_KMOL_H = 2.4034
T = 1113.15            # K, T_R = 840 C
P_ATM = 1.55           # atm, Table VIII
V_TOTAL_M3 = 0.014896  # the sum of the twenty segments in the case's flowsheetDict

# Table VIII, pilot column, wt %
PUBLISHED = {"H2": 3.71, "CH4": 2.99, "ethylene": 48.7, "ethane": 39.0, "propylene": 1.05, "13Butadiene": 0.99}
PUBLISHED_CONVERSION = 0.591
IN_BAND = {"ethylene": 0.03, "H2": 0.06}                 # declared before the first run (README)
# measured deviation (engine - published)/published, in %, and the drift allowed (points)
KNOWN_OUT = {"CH4": -29.0, "propylene": -59.0, "13Butadiene": 93.0}
DRIFT_POINTS = 5.0


def reference():
    """The scheme of Sundaram & Froment 1977, Model III, integrated here: wt % of the hydrocarbon fed."""
    R = 1.987
    Rl = 0.082057
    tt = [775 + 273.15, 800 + 273.15, 825 + 273.15]

    def vant_hoff(values):
        x = [1.0 / t for t in tt]
        y = [math.log(v) for v in values]
        n = 3.0
        sx, sy = sum(x), sum(y)
        sxx = sum(a * a for a in x)
        sxy = sum(a * b for a, b in zip(x, y))
        b = (n * sxy - sx * sy) / (n * sxx - sx * sx)
        a = (sy - b * sx) / n
        return math.exp(a + b / T)

    kc1 = vant_hoff([8.895e-3, 1.276e-2, 1.800e-2])      # mol/l, under Table 1
    kc5 = vant_hoff([9.847e-3, 1.375e-2, 1.890e-2])
    kk = lambda a, e: a * math.exp(-e / (R * T))          # Table 3: s^-1 or l/mol/s, cal/mol
    k1, k2, k5, k6, k8 = (kk(4.652e13, 65200), kk(3.850e11, 65250), kk(9.814e8, 36920),
                          kk(1.026e12, 41260), kk(7.083e13, 60430))
    idx = ["C2H6", "C2H4", "H2", "CH4", "C3H6", "C3H8", "C2H2", "C4H6", "H2O"]
    name = {"C2H6": "ethane", "C2H4": "ethylene", "H2": "H2", "CH4": "CH4", "C3H6": "propylene",
            "C3H8": "propane", "C2H2": "acetylene", "C4H6": "13Butadiene"}

    def f(F):
        ft = sum(F)
        c = [x / ft * P_ATM / (Rl * T) for x in F]        # mol/l
        e6, e4, h2, m4, p6, p8, a2, b4, _ = c
        r1 = k1 * (e6 - e4 * h2 / kc1)
        r2 = k2 * e6
        r5 = k5 * (p6 - a2 * m4 / kc5)
        r6 = k6 * a2 * e4
        r8 = k8 * e6 * e4
        d = [-r1 - 2 * r2 - r8, r1 - r6 - r8, r1, r2 + r5 + r8, -r5 + r8, r2, r5 - r6, r6, 0.0]
        return [x * 3.6 for x in d]                      # mol/l/s -> kmol/h per litre

    F = [FEED_ETHANE_KMOL_H, 0, 0, 0, 0, 0, 0, 0, FEED_STEAM_KMOL_H]
    n = 3000
    h = V_TOTAL_M3 * 1000.0 / n
    for _ in range(n):
        k1_ = f(F)
        k2_ = f([a + h / 2 * b for a, b in zip(F, k1_)])
        k3_ = f([a + h / 2 * b for a, b in zip(F, k2_)])
        k4_ = f([a + h * b for a, b in zip(F, k3_)])
        F = [a + h / 6 * (b + 2 * c + 2 * d + e) for a, b, c, d, e in zip(F, k1_, k2_, k3_, k4_)]
    m0 = FEED_ETHANE_KMOL_H * MW["ethane"]
    y = {name[s]: 100 * F[i] * MW[name[s]] / m0 for i, s in enumerate(idx[:8])}
    return 1 - F[0] / FEED_ETHANE_KMOL_H, y


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def engine_yields(out):
    j = result(out)
    s = j["streams"]["product"]
    flows = {k: v * s["F"] * 3600.0 for k, v in s["composition"].items()}
    m0 = FEED_ETHANE_KMOL_H * MW["ethane"]
    return 1 - flows["ethane"] / FEED_ETHANE_KMOL_H, {k: 100 * flows[k] * MW[k] / m0 for k in flows if k != "water"}


def fidelity(conv, y, rconv, ry):
    """-> list of complaints comparing the engine with the independent integration."""
    bad = []
    if abs(conv - rconv) > 0.006:
        bad.append(f"conversion {100 * conv:.2f} % against the independent integration's {100 * rconv:.2f} %")
    for k, v in ry.items():
        e = y[k]
        tol = 0.03 * v if v > 0.3 else 0.01
        if abs(e - v) > tol:
            bad.append(f"{k}: engine {e:.3f} wt % against the independent integration's {v:.3f} (tol {tol:.3f})")
    return bad


def main():
    failures = []
    solve = gatekit.binary("choupoSolve")
    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        rc, out = gatekit.run(solve, c)
    if rc != 0:
        return gatekit.verdict("check_cracking_yields", [f"the case did not run (exit {rc}): "
                               + " | ".join(out.strip().splitlines()[-3:])], "")
    conv, y = engine_yields(out)
    rconv, ry = reference()

    # (A) fidelity
    failures += ["fidelity: " + b for b in fidelity(conv, y, rconv, ry)]

    # (B) the published table
    if abs(conv - PUBLISHED_CONVERSION) > 0.002:
        failures.append(f"the case's conversion is {100 * conv:.2f} %, not the published 59.1 % it is sized to")
    nums = []
    for k, band in IN_BAND.items():
        dev = (y[k] - PUBLISHED[k]) / PUBLISHED[k]
        nums.append(f"{k} {100 * dev:+.1f} %")
        if abs(dev) > band:
            failures.append(f"{k}: {y[k]:.3f} wt % against Table VIII's {PUBLISHED[k]}: {100 * dev:+.1f} %, "
                            f"declared band {100 * band:.0f} %")
    for k, pinned in KNOWN_OUT.items():
        dev = 100 * (y[k] - PUBLISHED[k]) / PUBLISHED[k]
        nums.append(f"{k} {dev:+.0f} % (known out of band)")
        if abs(dev - pinned) > DRIFT_POINTS:
            failures.append(f"{k}: deviation from Table VIII is {dev:+.1f} %, pinned at {pinned:+.0f} % "
                            f"(+-{DRIFT_POINTS:g} points): the scheme, the case or the reading of the table changed")

    # (C) sabotage: k6's A read as m3/mol/s instead of l/mol/s
    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        try:
            gatekit.edit(c / "constant/reactions", "A 1.026e9;", "A 1.026e12;")
        except gatekit.EditNotApplied as e:
            failures.append(f"sabotage arm: {e}")
        else:
            rc2, out2 = gatekit.run(solve, c)
            if rc2 != 0:
                failures.append(f"sabotage arm: the sabotaged case did not run (exit {rc2})")
            else:
                conv2, y2 = engine_yields(out2)
                if not fidelity(conv2, y2, rconv, ry):
                    failures.append("sabotage arm: k6 x 1000 passed the fidelity check -- it cannot see a unit-factor defect")

    return gatekit.verdict(
        "check_cracking_yields", failures,
        "Sundaram-Froment ethane scheme in a pfr: the engine matches an independent integration of Table 1 / Table 3 "
        f"(conversion {100 * conv:.1f} %, reference {100 * rconv:.1f} %); against Froment 1976 Table VIII "
        + ", ".join(nums) + "; a unit factor 10^3 on k6 is seen",
    )


if __name__ == "__main__":
    sys.exit(main())
