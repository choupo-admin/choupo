#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: water's saturation curve has ONE home, and it is the IAPWS equation.

    bin/curate/check_water_one_home.py

WHY THIS EXISTS (architect's ruling 2026-11-16).  Water's catalogue vapour
pressure was an Antoine fit +2.47 % high at 373 K and +6.4 % at 423 K against
IAPWS SR1-86 Eq. 1; every case that prices water's vapour pressure inherited
it.  It is now `model Wagner` at that equation, and the PHREEQC-convention
record chemistry/water-vapour-equilibrium.dat ("H2O(g) = H2O"), which stated
the same curve a second time with its own fit, is derived from it.

WHAT THIS GATE CHECKS (second opinions in Python, no code shared with the C++).
  (a) water.dat's vaporPressure is Wagner with the six coefficients and the
      reducing constants (647.096 K, 22.064 MPa) AS PRINTED in Wagner & Pruss
      2002 Eq. (2.5), typed here from the page, and Trange 273.16-647.096.
  (b) the equation reproduces the release's Table 1 check values:
      611.657 Pa at 273.16 K, 101325 Pa at 373.1243 K, 22.064 MPa at
      647.096 K, to 3e-7 relative.
  (c) the engine's Psat for water (a props run) equals that evaluation to
      1e-9 relative at 273.16, 298.15, 373.15, 473.15, 573.15 K.
  (e) no water.dat under tutorials/ carries `model Antoine` (purelaws02, which
      holds both laws as a grammar witness, must prefer SR1).
  (d) the gas-liquid record of H2O(g) = H2O agrees with -log10(psat/atm) of
      the same curve to 2e-5 in logK over 273.16-473.15 K, and its dH is the
      curve's own to 1 J/mol; no other chemistry record states H2O(g) = H2O.
NOT CHECKED: the sealed copies of water.dat inside cases (check_seal_drift
reports them), and that the release's own equation is right.
"""
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bin" / "curate"))
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
import fit_water_vapour_equilibrium as fw  # noqa: E402

PRINTED = dict(Tr=647.096, Pr=22.064e6,
               a=[-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502],
               e=[1, 1.5, 3, 3.5, 4, 7.5])
TABLE1 = [(273.16, 611.657), (373.1243, 101325.0), (647.096, 22.064e6)]


def main():
    fails = []
    t = fw.WATER.read_text()
    Tr, Pr, ex, co = fw.wagner_from_record()
    vp = re.search(r"(?m)^vaporPressure\s*\{(.*?)^\}", t, re.S).group(1)
    if (Tr, Pr) != (PRINTED["Tr"], PRINTED["Pr"]) or ex != PRINTED["e"] or co != PRINTED["a"]:
        fails.append("(a) water.dat's Wagner block is not Wagner & Pruss Eq. (2.5) as printed: %s" % ((Tr, Pr, ex, co),))
    if not re.search(r"Trange\s*\(\s*273\.16\s+647\.096\s*\)", vp):
        fails.append("(a) Trange is not 273.16-647.096")
    law = (Tr, Pr, ex, co)
    for T, p in TABLE1:
        v = fw.psat(T, law)
        if abs(v / p - 1) > 3e-7:
            fails.append("(b) Table 1: psat(%g K) = %.9g, release %.9g" % (T, v, p))
    # (c) the engine
    Ts = [273.16, 298.15, 373.15, 473.15, 573.15]
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp) / "c"
        (d / "system").mkdir(parents=True)
        (d / "constant" / "components").mkdir(parents=True)
        # the probe reads THIS tree's record, never a catalogue another checkout owns
        (d / "constant" / "components" / "water.dat").write_text(t)
        (d / "system" / "controlDict").write_text("application choupoProps;\nverbosity 2;\n")
        (d / "constant" / "thermoPhysPropDict").write_text(
            "recordType thermophysicalPropertySystem;\nschemaVersion 2;\ncomponents ( water );\n"
            "equilibrium { formulation gammaPhi; liquid { activityModel ideal; standardState pureLiquid; }"
            " vapour { fugacityModel idealGas; } }\n")
        ops = "".join("{ name T%d; type propertyPoint; state { T %.10g K; P 1 bar; composition { water 1.0; } }"
                      " properties ( Psat_water ); }\n" % (i, T) for i, T in enumerate(Ts))
        (d / "system" / "propsDict").write_text("operations\n(\n" + ops + ");\n")
        p = subprocess.run([str(PROPS), str(d)], capture_output=True, text=True, timeout=300)
        out = p.stdout + p.stderr
        if p.returncode != 0:
            fails.append("(c) probe did not run: " + out[-300:])
        else:
            import json
            got = {}
            for line in out.splitlines():
                m = re.match(r'\s*\{ "name": "(T\d)", "type": "[^"]+", "diagnostics": (\{.*?\}),', line)
                if m:
                    got[m.group(1)] = json.loads(m.group(2))
            for i, T in enumerate(Ts):
                e = got.get("T%d" % i, {}).get("Psat_water")
                v = fw.psat(T, law)
                if e is None or abs(e / v - 1) > 1e-9:
                    fails.append("(c) engine Psat(%g K) = %s vs independent %.12g" % (T, e, v))
    # (d) the gas-liquid record
    rec = fw.REC.read_text()
    a = [float(x) for x in re.search(r"analytic\s*\(([^)]*)\)", rec).group(1).split()]
    k25 = float(re.search(r"logK25\s+([-0-9.eE+]+)", rec).group(1))
    dh = float(re.search(r"\bdH\s+([-0-9.eE+]+)", rec).group(1))
    worst = 0.0
    for k in range(201):
        T = fw.T_LO + (fw.T_HI - fw.T_LO) * k / 200
        worst = max(worst, abs(fw.logk(a, T) + math.log10(fw.psat(T, law) / fw.ATM)))
    if worst > 2e-5:
        fails.append("(d) the H2O(g) = H2O analytic misses -log10(psat/atm) by %.2e in logK" % worst)
    if abs(k25 - (-math.log10(fw.psat(298.15, law) / fw.ATM))) > 2e-4:
        fails.append("(d) logK25 %.4f is not the curve's value at 298.15 K" % k25)
    if abs(dh - fw.dH298(a)) > 1.0:
        fails.append("(d) dH %.0f is not the analytic's own %.1f J/mol" % (dh, fw.dH298(a)))
    others = [f.name for f in (ROOT / "data/standards/chemistry").glob("*.dat")
              if f.name != fw.REC.name and re.search(r'reaction\s+"H2O\(g\)\s*=\s*H2O"', f.read_text())]
    if others:
        fails.append("(d) a second record states H2O(g) = H2O: %s" % others)
    #  (e) no case carries water's OLD law: a water.dat under tutorials/ with an
    #  Antoine vaporPressure model is a second home for the curve (2026-11-16).
    #  The one declared exception is purelaws02, whose record holds BOTH named
    #  laws on purpose (a grammar witness) and prefers the IAPWS one.
    for w in sorted((ROOT / "tutorials").rglob("water.dat")):
        txt = w.read_text()
        if "purelaws02_water_two_vapour_pressure_laws" in str(w):
            if not re.search(r"preferred\s+SR1\s*;", txt):
                fails.append("(e) %s must prefer the IAPWS law SR1" % w.relative_to(ROOT))
            continue
        if re.search(r"model\s+Antoine\s*;", txt):
            fails.append("(e) %s still carries water's Antoine vapour pressure" % w.relative_to(ROOT))
    if fails:
        print("check_water_one_home: FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("check_water_one_home: OK -- water.dat's vapour pressure is Wagner & Pruss Eq. (2.5) as printed, Table 1 reproduced "
          "to 3e-7, the engine's Psat equals it to 1e-9 at 5 temperatures, and the H2O(g) = H2O record is the same curve "
          "(logK within %.1e, dH its own).  NO case carries the old Antoine law.  NOT CHECKED: the sealed copies' other content (check_seal_drift reports them)." % worst)
    return 0


if __name__ == "__main__":
    sys.exit(main())
