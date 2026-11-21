#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""fixture_forms -- the four CHEMKIN forms on a small NUMERICAL fixture, Choupo against Cantera 3.2.

    fixture_forms.py WORKDIR

Six made-up species (A = H, B = O2, C = HO2, F = an HO2 isomer, D = N2, E = AR; one NASA-7
polynomial on both ranges, so the thermo is continuous -- NOT chemistry) and six reactions,
one CHEMKIN text read by BOTH codes (bin/curate/chemkin_to_choupo.py, cantera.ck2yaml):

  r001  A+B+D <=> C+D        D on both sides (Cantera reads it as a three-body on D alone)
  r002  A+B(+E) <=> C(+E)    a single collider, AR
  r003  A+B(+M) <=> C(+M)    SRI with five numbers, efficiency D 2
  r004  F+D <=> C+D          D on both sides
  r005  A+B => C             FORD A 1.5, FORD E 0.5 (a non-reactant order)
  r006  A+B(+M) <=> C(+M)    SRI with three numbers

(1) The net rate of every reaction at the initial state: Choupo's rateOfProduction at t = 0
    against Cantera's net_rates_of_progress (both kmol/m3/s).
(2) The adiabatic constant-volume trajectory: T on a common grid, both codes.
"""
import csv
import math
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "bin", "curate"))
import chemkin_to_choupo as ck  # noqa: E402

SP = [("A", {"H": 1}), ("B", {"O": 2}), ("C", {"H": 1, "O": 2}), ("D", {"N": 2}), ("E", {"Ar": 1}),
      ("F", {"H": 1, "O": 2})]
REACTIONS = """A+B+D=C+D           1.0E+15  0.0   3.0
  DUP
A+B(+E)=C(+E)       1.0E+13  0.0  10.0
  LOW / 1.0E+16 0.0 5.0 /
  DUP
A+B(+M)=C(+M)       2.0E+13  0.3  10.0
  LOW / 1.0E+16 -0.5 5.0 /
  SRI / 0.45 797 979 1.2 0.1 /
  D/2.0/
  DUP
F+D=C+D             1.0E+12  0.2   8.0
A+B=>C              1.0E+13  0.0  10.0
  FORD / A 1.5 /
  FORD / E 0.5 /
  DUP
A+B(+M)=C(+M)       3.0E+12  0.0   9.0
  LOW / 2.0E+15 0.0 4.0 /
  SRI / 0.6 500 1200 /
  DUP
"""
T0, P0_ATM = 1200.0, 2.0
X0 = {"A": 0.05, "B": 0.2, "C": 0.05, "D": 0.4, "E": 0.25, "F": 0.05}


def mech():
    out = ["! numerical fixture, not chemistry", "ELEMENTS H O N AR END",
           "SPECIES " + " ".join(n for n, _ in SP) + " END", "THERMO ALL", "   300.000  1000.000  5000.000"]
    for k, (n, c) in enumerate(SP):
        a = [3.5 + 0.5 * k, 1.0e-4, 0.0, 0.0, 0.0,
             -1000.0 * (k + 1) - (30000.0 if n == "C" else (25000.0 if n == "F" else 0.0)), 3.0 + k]
        out += ck._thermo_lines(dict(name=n, comp={e: float(v) for e, v in c.items()}, phase="G", Tlow=200.0,
                                     Thigh=5000.0, Tcommon=1000.0, low=list(a), high=list(a)))
    return "\n".join(out) + "\nEND\nREACTIONS KCAL/MOLE\n" + REACTIONS + "END\n"


def main():
    work = os.path.abspath(sys.argv[1])
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    inp = os.path.join(work, "fixture.inp")
    open(inp, "w").write(mech())
    case = os.path.join(work, "case")
    import contextlib, io
    with contextlib.redirect_stdout(io.StringIO()):
        res = ck.convert(inp, None, case, "numerical fixture, no data")
    print("import: %d of 6 reactions written, refused %s" % (len(res["ok"]), res["refused"]))
    end, dt = 2.0e-3, 2.0e-6
    subprocess.run([sys.executable, os.path.join(ROOT, "docs/reviews/2026-11-21-large-mechanism/scripts/make_case.py"),
                    case, "--T", str(T0), "--P", repr(P0_ATM * 1.01325),
                    "--mix", ",".join("%s:%s" % kv for kv in X0.items()), "--endTime", repr(end),
                    "--deltaT", repr(dt), "--solver", "integrator Rodas4;"], check=True, capture_output=True)
    fs = os.path.join(case, "system/flowsheetDict")
    t = open(fs).read().replace("        reactions\n", "        rateOfProduction { times ( 0 ); top 3; }\n        reactions\n", 1)
    open(fs, "w").write(t)
    r = subprocess.run([os.path.join(ROOT, "choupoBatch"), case], capture_output=True, text=True,
                       env=dict(os.environ, CHOUPO_HOME=ROOT), cwd=case)
    if r.returncode:
        raise SystemExit("choupoBatch: " + (r.stdout + r.stderr)[-800:])
    rate = {}
    for row in csv.DictReader(open(os.path.join(case, "rateOfProduction.csv"))):
        if float(row["t_s"]) == 0.0 and row["reaction"] not in ("NET", "DNDT_ODE"):
            rate[row["reaction"]] = float(row["rate_kmol_m3_s"])
    yml = os.path.join(work, "fixture.yaml")
    ct_py = os.environ.get("CANTERA_PYTHON", "/usr/bin/python3")
    code = r"""
import sys, cantera as ct, json
g = ct.Solution(sys.argv[1]); g.TPX = %r, %r * ct.one_atm, %r
q = list(g.net_rates_of_progress)
r = ct.IdealGasReactor(g, clone=True); net = ct.ReactorNet([r]); net.rtol, net.atol = 1e-12, 1e-22
T = [r.T]
for k in range(1, %d + 1):
    net.advance(k * %r); T.append(r.T)
print(json.dumps(dict(q=q, T=T, eq=[x.equation for x in g.reactions()])))
""" % (T0, P0_ATM, ",".join("%s:%s" % kv for kv in X0.items()), int(round(end / dt)), dt)
    p = subprocess.run([ct_py, "-m", "cantera.ck2yaml", "--input", inp, "--output", yml, "--permissive"],
                       capture_output=True, text=True)
    if p.returncode:
        raise SystemExit("ck2yaml: " + p.stdout[-600:] + p.stderr[-600:])
    import json
    p = subprocess.run([ct_py, "-W", "ignore", "-c", code, yml], capture_output=True, text=True)
    ct = json.loads(p.stdout.strip().splitlines()[-1])
    names = sorted(rate)
    print("%-6s %-26s %22s %22s %10s" % ("rxn", "Cantera equation", "Choupo r [kmol/m3/s]", "Cantera", "rel diff"))
    worst = 0.0
    for j, nm in enumerate(names):
        a, b = rate[nm], ct["q"][j]
        d = abs(a - b) / max(abs(b), 1e-300)
        worst = max(worst, d)
        print("%-6s %-26s %22.15e %22.15e %10.2e" % (nm, ct["eq"][j], a, b, d))
    rows = list(csv.reader(open(os.path.join(case, "trajectory.csv"))))
    Tc = [float(x[rows[0].index("bomb.T")]) for x in rows[1:]]
    dT = max(abs(x - y) for x, y in zip(Tc, ct["T"]))
    print("worst rate difference %.2e; adiabatic constant-V trajectory: T %.4f -> %.4f K (Choupo) vs %.4f K "
          "(Cantera), max |dT| on the %d-point grid %.2e K" % (worst, Tc[0], Tc[-1], ct["T"][-1], len(Tc), dT))


if __name__ == "__main__":
    sys.exit(main())
