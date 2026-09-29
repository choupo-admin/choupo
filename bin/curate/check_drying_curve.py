#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_drying_curve -- the characteristic drying curve (2026-09-29).

The batch dryer's falling-rate period follows a DECLARED characteristic
drying curve (van Meel 1958; src/unitOperations/heatTransfer/DryingCurve.H):
R = R_c f(Phi), Phi = (X - X_eq)/(X_c - X_eq).  The witness
tutorials/batch/drying/dryer02_characteristic_curves runs one tray four
times, differing only in f.  This gate recomputes, from each tray's OWN
published KPIs, the closed forms the curve admits and holds the engine to
them -- so a flux that ignored the declared curve, or read it wrong, fails
here and not on a student's desk:

  (a) linear   X(t_end) = X_eq + (X_c - X_eq) exp(-t'/tau)
  (b) convex   f = Phi^2:   Phi(t') = 1 / (1 + t'/tau)
  (c) concave  f = Phi^0.5: reaches X_eq at t' = 2 tau < t_end, so X_final
               sits at X_eq -- to the RK4 overshoot a non-Lipschitz f admits
               at Phi = 0: MEASURED 2.4e-6 relative BELOW X_eq with dt = 2 s,
               the size (dt/tau)^2 (X_c - X_eq)/4 predicts; bounded at 1e-5.
               The engine does not clamp it (no clamp in this class, by
               rule); the witness header says so.
  (d) the table tray lies BETWEEN linear and convex at the end, which its
      own points imply (f_table <= f_linear everywhere on its knots)

with t' = t_end - t_critical and tau = m_s (X_c - X_eq)/(R_c A).

Then six refusals, each fired through the real reader on a copy of the
witness and required to exit non-zero AND name its cause: an unknown shape,
a power curve with no source, a non-positive exponent, a table that does not
end at (1, 1), a table whose f decreases, and a key of another shape.

NOT CHECKED: whether any curve describes a real material -- every curve in
the witness is declared hypothetical, and no measured curve of any material
is in the repository.
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/batch/drying/dryer02_characteristic_curves"
BIN = ROOT / "choupoBatch"
AREA = 0.5              # m2, the witness's declared tray area


def fail(msg):
    print(f"check_drying_curve: FAILED\n  {msg}")
    sys.exit(1)


def run(case_dir):
    p = subprocess.run([str(BIN), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def kpis(out, unit):
    m = re.search(r'"' + unit + r'": (\{[^{}]*\})', out)
    if not m:
        fail(f"no KPI row for unit '{unit}' in the run's output")
    return json.loads(m.group(1))


def main():
    #  The molar mass is READ from the record the witness runs on (its
    #  adopted, sealed sucrose.dat), never typed here -- a typed copy was
    #  wrong in the first draft of this gate.
    mw = re.search(r"^MW\s+([0-9.]+)",
                   (CASE / "constant/components/sucrose.dat").read_text(), re.M)
    if not mw:
        fail("the witness's sucrose.dat declares no MW")
    MW_SUCROSE = float(mw.group(1))
    if not BIN.exists():
        fail(f"{BIN} is missing -- build first (make all); a check that"
             " cannot run must not pass")

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "case"
        shutil.copytree(CASE, work)
        rc, out = run(work)
        if rc != 0:
            fail(f"the witness did not run (exit {rc}):\n{out[-800:]}")

        res = {}
        for u in ("linear", "concave", "convex", "measured"):
            k = kpis(out, u)
            ms = k["n_sucrose_final"] * MW_SUCROSE
            tau = ms * (k["X_critical"] - k["X_equilibrium"]) / (k["R_constant"] * AREA)
            tp = k["t_end"] - k["t_critical"]
            res[u] = (k, tau, tp)

        k, tau, tp = res["linear"]
        want = k["X_equilibrium"] + (k["X_critical"] - k["X_equilibrium"]) * math.exp(-tp / tau)
        if abs(k["X_final"] - want) > 1e-5 * want:
            fail(f"(a) linear: X_final {k['X_final']:.8g} against the closed"
                 f" form {want:.8g}")
        k, tau, tp = res["convex"]
        want = k["X_equilibrium"] + (k["X_critical"] - k["X_equilibrium"]) / (1.0 + tp / tau)
        if abs(k["X_final"] - want) > 1e-4 * want:
            fail(f"(b) convex (Phi^2): X_final {k['X_final']:.8g} against the"
                 f" closed form {want:.8g} -- the declared curve is not the"
                 " one the flux runs on")
        k, tau, tp = res["concave"]
        if not tp > 2.0 * tau:
            fail("(c) concave: the run ends before t' = 2 tau, so the"
                 " finite-time arrival this arm checks never happens")
        if abs(k["X_final"] - k["X_equilibrium"]) > 1e-5 * k["X_equilibrium"]:
            fail(f"(c) concave (Phi^0.5): X_final {k['X_final']:.10g} is not"
                 f" at X_eq {k['X_equilibrium']:.10g} after t' = {tp:.1f} s"
                 f" > 2 tau = {2 * tau:.1f} s")
        xl, xm, xc = (res[u][0]["X_final"] for u in ("linear", "measured", "convex"))
        if not (xl < xm < xc):
            fail(f"(d) the table tray ends at {xm:.6g}, not between linear"
                 f" {xl:.6g} and convex {xc:.6g}")

        fs0 = (CASE / "system/flowsheetDict").read_text()
        convex = re.search(r"shape     power;\n\s*exponent  2;\n\s*source[^\n]*\n", fs0)
        table = re.search(r"f       \( 0  0\.05  0\.3  0\.75  1 \);", fs0)
        if not convex or not table:
            fail("the witness's convex or table block is not in the shape the"
                 " probes edit -- update the probes with the witness")
        probes = [
            ("unknown shape", fs0.replace(convex.group(0),
             'shape     exponential;\n                exponent  2;\n', 1),
             "drying-curve shape"),
            ("power with no source", fs0.replace(convex.group(0),
             "shape     power;\n                exponent  2;\n", 1),
             "must say where it comes from"),
            ("exponent <= 0", fs0.replace("exponent  2;", "exponent  0;", 1),
             "exponent must be > 0"),
            ("table not ending at (1, 1)", fs0.replace(table.group(0),
             "f       ( 0  0.05  0.3  0.75  0.9 );", 1), "end at (1, 1)"),
            ("table with f decreasing", fs0.replace(table.group(0),
             "f       ( 0  0.05  0.3  0.25  1 );", 1), "must not decrease"),
            ("a key of another shape", fs0.replace(table.group(0),
             table.group(0) + "\n                exponent 2;", 1),
             "is read only by shape power"),
        ]
        for label, text, needle in probes:
            if text == fs0:
                fail(f"probe '{label}' edited nothing -- the probe cannot fire")
            pdir = Path(tmp) / "probe"
            if pdir.exists():
                shutil.rmtree(pdir)
            shutil.copytree(CASE, pdir)
            (pdir / "system/flowsheetDict").write_text(text)
            rc, out = run(pdir)
            if rc == 0:
                fail(f"probe '{label}': the case RAN and exited 0 -- the"
                     " refusal is not there")
            if needle not in out:
                fail(f"probe '{label}': refused, but not by name (expected"
                     f" '{needle}'):\n{out[-600:]}")

    print("check_drying_curve: OK -- the batch dryer's declared"
          " characteristic drying curve is the one its flux runs on: the"
          " linear, Phi^2 and Phi^0.5 closed forms reproduced from each"
          " tray's own KPIs, the table tray between linear and convex, and"
          " six malformed curves refused by name.  NOT checked: that any"
          " curve describes a real material (every curve in the witness is"
          " declared hypothetical).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
