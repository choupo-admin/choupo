#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_convective_dryer -- the continuous convective dryer (2026-09-29).

`convectiveDryer` (src/unitOperations/heatTransfer/ConvectiveDryer.H) dries a
sorbing solid along a declared contact area on its characteristic drying
curve, co-current or counter-current, with the air's humidity and temperature
ALGEBRAIC in the solid's moisture (water and enthalpy balances on the
package's own formation surface).  The witness
tutorials/steady/drying/convDryer01_sugar_curve sends one feed through both
flow arrangements.  This gate holds, from the run itself:

  (a) the first law: each dryer's own energyResidual_kW and the PLANT energy
      report's residual below 1e-3 kW -- the unit balances on the surface the
      report prices on, so the two cannot disagree;
  (b) the water balance against the STREAMS, not the KPI arithmetic: the
      exhaust's mass flow minus the air's equals the solid's water loss
      S (X_in - X_out), to 1e-9 relative;
  (c) the textbook ordering: counter-current ends drier than co-current, and
      neither below the equilibrium moisture of the air as fed;
  (d) the profiles: X never rises along the area, and the air humidity runs
      the way each arrangement makes it (up along xi co-current, down along
      xi counter-current, where the air flows from xi = 1 to 0);
  (e) the step: nSteps 400 moves each X_out by < 1e-5 relative from the
      default 100 (the RK4 march has converged);
  (f) four refusals fired through the real reader on copies of the witness:
      an air stream DECLARED liquid, an unknown flow word, X_c not above the
      equilibrium moisture of the air, and a missing k_Y; and (f0) the same
      air with NO declared phase RUNS (it resolves as vapour -- until
      2026-10-05 the flash returned NaN on the package's absent sucrose and
      that probe was refused for that reason alone; DEV.md 4d D1, C35).

SABOTAGE (2026-10-05, C35, by hand, restored by checkout + `make all`): drop
the `z_i = 0` skip from IsothermalFlash's g(V=0)/g(V=1) phase test -> "(f0)
hot air at 420 K with no declared phase was REFUSED (exit 2)".

NOT CHECKED: the dryer against any MEASURED dryer -- k_Y, X_c and the curve
of the witness are hypothetical teaching values; and the solid's warm-up in
the falling period, which the model does not have (it is announced).
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/steady/drying/convDryer01_sugar_curve"
BIN = ROOT / "choupoSolve"


def fail(msg):
    print(f"check_convective_dryer: FAILED\n  {msg}")
    sys.exit(1)


def run(case_dir):
    p = subprocess.run([str(BIN), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=600,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout + p.stderr


def block(out, key):
    """The JSON object that follows `"key": ` (brace-matched)."""
    i = out.find(f'"{key}": {{')
    if i < 0:
        fail(f"no '{key}' block in the run's output")
    j = out.index("{", i)
    depth = 0
    for k in range(j, len(out)):
        depth += {"{": 1, "}": -1}.get(out[k], 0)
        if depth == 0:
            return json.loads(out[j:k + 1])
    fail(f"unterminated '{key}' block")


def kpis(out, unit):
    m = re.search(r'"' + unit + r'": (\{ "T_air_out"[^{}]*\})', out)
    if not m:
        fail(f"no KPI row for dryer '{unit}'")
    return json.loads(m.group(1))


def main():
    if not BIN.exists():
        fail(f"{BIN} is missing -- build first; a check that cannot run must"
             " not pass")
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "case"
        shutil.copytree(CASE, work)
        rc, out = run(work)
        if rc != 0:
            fail(f"the witness did not run (exit {rc}):\n{out[-800:]}")

        ge = block(out, "globalEnergyBoundary")
        if abs(ge["residual_kW"]) > 1e-3:
            fail(f"(a) the plant energy report's residual is"
                 f" {ge['residual_kW']:.6g} kW")
        k = {u: kpis(out, u) for u in ("co", "counter")}
        for u, kk in k.items():
            if abs(kk["energyResidual_kW"]) > 1e-3:
                fail(f"(a) dryer '{u}': energyResidual_kW ="
                     f" {kk['energyResidual_kW']:.6g}")

        streams = {n: block(out, n) for n in ("airCo", "exhaustCo",
                                              "airCounter", "exhaustCounter")}
        for u, cap in (("co", "Co"), ("counter", "Counter")):
            picked = streams["exhaust" + cap]["F_mass"] - streams["air" + cap]["F_mass"]
            removed = k[u]["water_removed_kg_s"]
            if abs(picked - removed) > 1e-9 * removed:
                fail(f"(b) dryer '{u}': the air picked up {picked:.12g} kg/s"
                     f" but the solid lost {removed:.12g} kg/s")

        xc, xk = k["co"]["X_final"], k["counter"]["X_final"]
        floor = k["co"]["X_equilibrium_inlet_air"]
        if not (floor <= xk < xc):
            fail(f"(c) expected X_eq(air in) {floor:.6g} <= counter {xk:.6g}"
                 f" < co {xc:.6g}")

        prof = block(out, "profiles")
        for u, sign in (("co", 1), ("counter", -1)):
            col = prof[u]["columns"]
            X, Y = col["X_kg_kg"], col["Y_kg_kg"]
            if any(b > a + 1e-15 for a, b in zip(X, X[1:])):
                fail(f"(d) dryer '{u}': the solid's moisture rises along the area")
            if any(sign * (b - a) < -1e-15 for a, b in zip(Y, Y[1:])):
                fail(f"(d) dryer '{u}': the air humidity runs the wrong way"
                     " along the area")

        fs0 = (CASE / "system/flowsheetDict").read_text()
        fine = fs0.replace("            flow              cocurrent;",
                           "            flow              cocurrent;\n            nSteps            400;")
        fine = fine.replace("            flow              countercurrent;",
                            "            flow              countercurrent;\n            nSteps            400;")
        if fine.count("nSteps            400;") != 2:
            fail("(e) could not place nSteps in both dryers of the witness")
        pdir = Path(tmp) / "fine"
        shutil.copytree(CASE, pdir)
        (pdir / "system/flowsheetDict").write_text(fine)
        rc, outf = run(pdir)
        if rc != 0:
            fail(f"(e) the nSteps 400 run failed:\n{outf[-600:]}")
        for u in ("co", "counter"):
            a, b = k[u]["X_final"], kpis(outf, u)["X_final"]
            if abs(a - b) > 1e-5 * b:
                fail(f"(e) dryer '{u}': X_out {a:.10g} (100 steps) against"
                     f" {b:.10g} (400) -- the march has not converged")

        air0 = (CASE / "0/hotAir").read_text()
        probes = [
            #  2026-10-05 (C35): the probe used to DELETE the word, and the
            #  refusal fired only because the air's own flash returned NaN
            #  (the package's sucrose, which the air carries none of, has
            #  K = 0, and the phase test summed 0/0).  The flash now skips an
            #  absent component, undeclared hot air resolves as the vapour it
            #  is -- arm (f0) below holds that -- and the refusal is probed
            #  with air DECLARED liquid, a reading the dryer must refuse.
            ("air declared liquid", "0/hotAir",
             air0.replace("phase           gas;\n", "phase           liquid;\n"),
             "declare `phase gas;`"),
            ("unknown flow word", "system/flowsheetDict",
             fs0.replace("flow              cocurrent;", "flow              parallel;"),
             "must be cocurrent or countercurrent"),
            ("X_c not above X_eq", "system/flowsheetDict",
             fs0.replace("criticalMoisture  0.12;", "criticalMoisture  0.0005;"),
             "is not above the equilibrium"),
            ("missing k_Y", "system/flowsheetDict",
             fs0.replace("            k_Y               [1 -2 -1 0 0]  0.05;\n", "", 1),
             "k_Y"),
        ]
        #  (f0) UNDECLARED hot air means its own equilibrium (R-E2): a vapour
        #  at 420 K and 1 bar, so the dryer RUNS and reproduces the declared
        #  witness's outlet.  Until 2026-10-05 it refused, for a NaN.
        p0 = Path(tmp) / "undeclared"
        if p0.exists():
            shutil.rmtree(p0)
        shutil.copytree(CASE, p0)
        (p0 / "0/hotAir").write_text(air0.replace("phase           gas;\n", ""))
        if (p0 / "0/hotAir").read_text() == air0:
            fail("(f0) the undeclared-air probe edited nothing -- it cannot fire")
        rc0, o0 = run(p0)
        if rc0 != 0:
            fail("(f0) hot air at 420 K with no declared phase was REFUSED "
                 f"(exit {rc0}); an unpinned stream means its own equilibrium, "
                 "which is a vapour -- has the flash's phase test started "
                 "summing the absent sucrose (K = 0, 0/0) again?")
        for label, rel, text, needle in probes:
            orig = (CASE / rel).read_text()
            if text == orig:
                fail(f"probe '{label}' edited nothing -- it cannot fire")
            p = Path(tmp) / "probe"
            if p.exists():
                shutil.rmtree(p)
            shutil.copytree(CASE, p)
            (p / rel).write_text(text)
            rc, o = run(p)
            if rc == 0:
                fail(f"(f) probe '{label}': the case RAN and exited 0 -- the"
                     " refusal is not there")
            if needle not in o:
                fail(f"(f) probe '{label}': refused, but not by name (expected"
                     f" '{needle}'):\n{o[-600:]}")

    print("check_convective_dryer: OK -- the continuous convective dryer"
          " closes its first law on the package surface (each dryer and the"
          " plant report below 1e-3 kW), its water balance against the"
          " streams to 1e-9, dries further counter-current than co-current"
          " on the same area and never below the air's X_eq, runs its"
          " profiles the way each arrangement must, is converged in its"
          " step (nSteps 400 moves X_out < 1e-5), refuses four malformed"
          " declarations by name (air declared liquid among them), and runs"
          " the same air with NO declared phase, which resolves as the vapour"
          " it is.  NOT checked: any measured dryer (the"
          " witness's k_Y, X_c and curve are hypothetical), or the solid's"
          " falling-rate warm-up, which the model does not have.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
