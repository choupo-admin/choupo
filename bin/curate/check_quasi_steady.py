#!/usr/bin/env python3
"""check_quasi_steady -- a steady unit inside a transient (2026-09-30, #185).

`quasiSteady` (src/unitOperations/dynamic/QuasiSteadyUnit.H) wraps any steady
unit and re-solves it on its inlets at every accepted state of the dynamic
driver; the driver routes ports (several inlets and outlets), solves the
algebraic units in topological order within the instant, and refuses a loop
that holds no inventory.  The witness
tutorials/unsteady/unsteady03_nf_feed_and_bleed_startup is the START-UP of
the loop whose steady state is tutorials/steady/membranes/
membrane18_nf_feed_and_bleed.  This gate holds, from the runs themselves:

  (a) THE ANCHOR: after 6 h (some 16 loop time constants) the transient's
      module flux, observed rejection, permeate and bleed flows equal
      membrane18's own golden values within 2e-5 relative -- a transient
      that does not end on the steady answer is wrong;
  (b) the domain mass residual CONVERGES with deltaT: halving it divides the
      residual over the first hour by 2 to 5.  MEASURED ~4 (second order) on
      2026-09-30, where a first-order one-step route lag was expected: in
      this loop the ledger's trapezoid dominates, not the lag the driver's
      NOTE names.  The measured order is printed on the claim line;
  (c) four refusals fired through the real reader on copies of the witness:
      a loop with no vessel on it, a vessel given two inputs, topology
      written inside the wrapped unit's block, and an inlet with no face;
  (d) the vessel's `energy isothermal;` (2026-09-30), which a loop tank of a
      species with no heat capacity needs: on the witness, where nothing
      moves T, every KPI over the first hour equals the probed (canonical)
      route's to 1e-9; and it refuses by name an unknown energy word, a
      jacket (UA != 0) and a reaction (on a copy of unsteady01).

NOT CHECKED: the first law (the adapter claims no stored energy functional
and the run withholds the rung, which this gate does not re-verify); any
measured start-up (there is none in the tree); a pump or a pressure change
around the loop (the witness has none, as in membrane18).
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
CASE = ROOT / "tutorials/unsteady/unsteady03_nf_feed_and_bleed_startup"
STEADY = ROOT / "tutorials/steady/membranes/membrane18_nf_feed_and_bleed/expected"
REACTING = ROOT / "tutorials/unsteady/unsteady01_startup_transient"
BIN = ROOT / "choupoSemiContinuous"


def fail(msg):
    print(f"check_quasi_steady: FAILED\n  {msg}")
    sys.exit(1)


def run(case_dir):
    p = subprocess.run([str(BIN), "."], cwd=case_dir, capture_output=True,
                       text=True, timeout=600,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    return p.returncode, p.stdout + p.stderr


def kpis(out):
    i = out.find('"kpis": {')
    if i < 0:
        fail("no 'kpis' block in the run's output")
    j = out.index("{", i)
    depth = 0
    for k in range(j, len(out)):
        depth += {"{": 1, "}": -1}.get(out[k], 0)
        if depth == 0:
            return json.loads(out[j:k + 1])
    fail("unterminated 'kpis' block")


def golden(kind, name, key):
    for line in STEADY.read_text().splitlines():
        f = line.split()
        if len(f) >= 4 and f[0] == kind and f[1] == name and f[2] == key:
            return float(f[3])
    fail(f"membrane18's golden carries no row `{kind} {name} {key}`")


def copy(tmp, tag, edit=None):
    d = Path(tmp) / tag
    shutil.copytree(CASE, d)
    if edit:
        edit(d)
    return d


def sub(path, old, new):
    t = path.read_text()
    if old not in t:
        fail(f"sabotage anchor not found in {path.name}: {old!r}")
    path.write_text(t.replace(old, new, 1))


def main():
    if not BIN.exists():
        fail(f"{BIN} is missing -- build first; a check that cannot run must"
             " not pass")
    with tempfile.TemporaryDirectory() as tmp:
        # (a) the anchor
        rc, out = run(copy(tmp, "witness"))
        if rc != 0:
            fail(f"the witness did not run (exit {rc}):\n{out[-800:]}")
        k = kpis(out)
        pairs = [
            ("NF J_w_avg", k["NF"]["kpi_J_w_avg_final"],
             golden("kpi", "NF", "J_w_avg")),
            ("NF R_obs_glucose", k["NF"]["kpi_R_obs_glucose_final"],
             golden("kpi", "NF", "R_obs_glucose")),
            ("Permeate F", k["NF"]["F_Permeate_final"],
             golden("stream", "Permeate", "F")),
            ("Bleed F", k["SPLIT"]["F_Bleed_final"],
             golden("stream", "Bleed", "F")),
        ]
        worst = 0.0
        for name, got, ref in pairs:
            rel = abs(got - ref) / abs(ref)
            worst = max(worst, rel)
            if rel > 2e-5:
                fail(f"(a) {name}: the transient ends at {got:.10g}, membrane18"
                     f" says {ref:.10g} ({rel:.2e} relative > 2e-5)")

        # (b) the lag is first order in deltaT
        def hour(dt):
            def e(d):
                sub(d / "system/controlDict",
                    "endTime         21600;", "endTime         3600;")
                sub(d / "system/controlDict",
                    "deltaT          5.0;", f"deltaT          {dt};")
            return e
        res = []
        for dt in ("5.0", "2.5"):
            rc, o = run(copy(tmp, "dt" + dt, hour(dt)))
            if rc != 0:
                fail(f"(b) the deltaT {dt} run failed:\n{o[-600:]}")
            res.append(kpis(o)["balance"]["mass_residual_kg"])
        ratio = res[1] / res[0] if res[0] else float("nan")
        if not (0.2 <= ratio <= 0.5):
            fail(f"(b) halving deltaT moved the mass residual from {res[0]:.4g}"
                 f" to {res[1]:.4g} kg (ratio {ratio:.3f}, expected 0.2-0.5):"
                 " the residual does not converge with the step")
        order = math.log2(1.0 / ratio)

        # (c) refusals
        fs = "system/flowsheetDict"
        refusals = [
            ("no vessel on the loop",
             lambda d: (sub(d / fs, "        in          ModuleIn;",
                            "        in          ToTank;"),
                        sub(d / "0/streamFaces", '"NF.ModuleIn"',
                            '"NF.ToTank"')),
             "NO unit holds an inventory"),
            ("two inputs into a vessel",
             lambda d: sub(d / fs, "        in          ToTank;",
                           "        inputs      ( ToTank  Recycle );"),
             "a vessel has ONE feed face"),
            ("topology inside the wrapped unit",
             lambda d: sub(d / fs, "            type        splitter;",
                           "            type        splitter;\n"
                           "            in          Retentate;"),
             "belong to the quasiSteady block"),
            ("an inlet with no face",
             lambda d: sub(d / "0/streamFaces", '"SPLIT.Retentate"',
                           '"SPLIT.Other"'),
             "carries no face"),
        ]
        for tag, edit, want in refusals:
            rc, o = run(copy(tmp, re.sub(r"\W", "_", tag), edit))
            if rc == 0 or want not in o:
                fail(f"(c) {tag}: expected a refusal naming \"{want}\","
                     f" got exit {rc}:\n{o[-600:]}")

    # (d) the isothermal vessel
    with tempfile.TemporaryDirectory() as tmp:
        def hour(d):
            sub(d / "system/controlDict", "endTime         21600;",
                "endTime         3600;")
        def iso(d, extra=None):
            hour(d)
            sub(d / "system/flowsheetDict", "            T_jacket     298.15 K;",
                "            T_jacket     298.15 K;\n            energy       isothermal;")
            if extra:
                extra(d)
        rc, ob = run(copy(tmp, "probed", hour))
        rc2, oi = run(copy(tmp, "isothermal", iso))
        if rc or rc2:
            fail(f"(d) the probed/isothermal runs failed ({rc}/{rc2}):\n{oi[-600:]}")
        if "ISOTHERMAL, as declared" not in oi:
            fail("(d) the isothermal run did not announce its declaration")
        kb, ki = kpis(ob), kpis(oi)
        for u in ("NF", "SPLIT", "TANK"):
            for key, v in kb[u].items():
                w = ki[u].get(key)
                if isinstance(v, (int, float)) and (w is None
                        or abs(v - w) > 1e-9 * max(1.0, abs(v))):
                    fail(f"(d) {u}.{key}: probed {v!r}, isothermal {w!r} --"
                         " holding a T that nothing moves changed the answer")
        vessel = [
            ("an unknown energy word",
             lambda d: iso(d, lambda e: sub(e / "system/flowsheetDict",
                           "energy       isothermal;", "energy       adiabatic;")),
             "is not a declaration this unit reads"),
            ("a jacket", lambda d: iso(d, lambda e: sub(
                e / "system/flowsheetDict", "UA           0.0; ",
                "UA           5.0; ")), "with a jacket"),
        ]
        for tag, edit, want in vessel:
            rc, o = run(copy(tmp, re.sub(r"\W", "_", tag), edit))
            if rc == 0 or want not in o:
                fail(f"(d) {tag}: expected a refusal naming \"{want}\","
                     f" got exit {rc}:\n{o[-600:]}")
        rx = Path(tmp) / "reacting"
        shutil.copytree(REACTING, rx)
        sub(rx / "system/flowsheetDict", "            T_jacket     320.0 K;",
            "            T_jacket     320.0 K;\n            energy       isothermal;")
        rc, o = run(rx)
        if rc == 0 or "with a reaction" not in o:
            fail(f"(d) a reaction: expected a refusal naming \"with a"
                 f" reaction\", got exit {rc}:\n{o[-600:]}")

    print(f"check_quasi_steady: OK -- the NF feed-and-bleed start-up ends on"
          f" membrane18's steady answer (flux, rejection, permeate, bleed;"
          f" worst {worst:.1e} relative, band 2e-5);"
          f" the loop converges with the step (mass residual ratio {ratio:.3f}"
          f" on halving deltaT, measured order {order:.2f}); {len(refusals)} refusals fired through the reader"
          f" (a loop with no vessel, a vessel with two inputs, topology inside"
          f" the wrapped unit, an inlet with no face); `energy isothermal;` on the"
          f" tank reproduces the probed route where nothing moves T and refuses"
          f" an unknown word, a jacket and a reaction.  NOT CHECKED: the first"
          f" law (withheld by the run), any measured start-up, a pump.")


if __name__ == "__main__":
    main()
