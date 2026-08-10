#!/usr/bin/env python3
"""Gate: the derived density is a DERIVATION, and `iterative` stays refused.

    bin/curate/check_derived_density.py

WHY THIS EXISTS.  Slice B's first build wrapped the direct dilute-volume
closure in an "iteration" whose update was independent of the iterate, and
Vitor REJECTED it: immediate convergence was not a solver property but
evidence that no iterative problem exists, so `provenance iterative` named
machinery that was not numerically present.  The correction (2026-08-10):
the calculation survives under its honest name --

    density { provenance derivedDiluteVolume; }
    rho = rhoWaterKell(T_sample) + soluteMass

with BOTH terms recorded -- and `provenance iterative` is REFUSED, stating
that no composition-dependent volume closure currently exists to define an
iteration.  Slice B is recorded as BLOCKED on that machinery, not
completed.

WHAT THIS CHECKS, through real engine runs on staged copies of
`analysis01_water_analysis_inlet` (whose corpus form stays MEASURED):

  (D1) THE AUTHORISED DERIVATION runs; converged/feed carries the
       `densityDerivation {}` record with closure, rhoWater, soluteMass and
       final; this gate recomputes the closure INDEPENDENTLY in python
       (Kell polynomial + the sheet's own solutes, post-reconciliation
       chloride included) and requires the final rho to agree to
       0.1 kg/m3; the record's own two terms must sum to its final.
  (D2) NOT SILENT: a provenance-less `density {}` refuses naming both
       explicit provenances.
  (D3) TWO SOURCES refuse: `derivedDiluteVolume` beside a `value`.
  (D4) NO SAMPLE TEMPERATURE refuses: the water term has nothing to be
       evaluated at.
  (D5) INVALID DOMAIN refuses: 380 K is outside Kell's 0-100 degC, named.
  (D6) `provenance iterative` REFUSES, stating the missing machinery ("no
       composition-dependent volume closure") -- the honest state of
       slice B, which is BLOCKED, not completed.
  (D7) MOLALITY basis with a density block refuses: no volume to close.
  (D8) an `iteration {}` block on the derived closure refuses: a direct
       calculation has nothing for a tolerance to govern, and a
       declaration nothing reads is refused rather than ignored.

DELIBERATELY ABSENT: any non-convergence probe.  The first build had one,
reachable only because the loop existed; a refusal that can only fire
against machinery that should not exist tests the ceremony, not the
physics.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * the dilute-volume closure's ACCURACY -- solutes add mass, not volume,
    is an announced approximation, not a validated density model
    (density-model improvement stays out of scope by ruling);
  * the reconciliation and inversion arithmetic (their own gates).

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- the iterative refusal removed (the word silently accepted as
derived):

    check_derived_density: FAILED
      D6: `provenance iterative` was ACCEPTED -- it must refuse, stating
      that no composition-dependent volume closure exists to define an
      iteration (slice B is BLOCKED, not completed)

Sabotage 2 -- the soluteMass term dropped from the closure (rho = rhoWater
alone):

    check_derived_density: FAILED
      D1: the record's terms do not sum to its final
      D1: final rho 998.2041 disagrees with the independently recomputed
      closure 998.4756 kg/m3 (Kell + the sheet's own solutes)
    (998.4756, not the authored run's 998.4841: with the water term short
    the reconciliation's chloride adjustment lands slightly differently,
    and the oracle recomputes from THAT run's own record)
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                    "analysis01_water_analysis_inlet")
SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
ENV = dict(os.environ, CHOUPO_HOME=ROOT)
MEASURED = "density   { value 998.4 kg/m3;  provenance measured; }"

fails = []


def rho_kell(t):
    num = (999.83952 + 16.945176 * t - 7.9870401e-3 * t * t
           - 46.170461e-6 * t ** 3 + 105.56302e-9 * t ** 4
           - 280.54253e-12 * t ** 5)
    return num / (1.0 + 16.879850e-3 * t)


def staged(density_repl, extra=None):
    d = tempfile.mkdtemp(prefix="dvdens_")
    dst = os.path.join(d, "case")
    shutil.copytree(CASE, dst)
    p = os.path.join(dst, "0", "feed")
    s = open(p, encoding="utf-8").read()
    if MEASURED not in s:
        shutil.rmtree(d, ignore_errors=True)
        return None, None, "the witness's measured density line moved"
    s = s.replace(MEASURED, density_repl)
    if extra:
        s = extra(s)
    open(p, "w", encoding="utf-8").write(s)
    pr = subprocess.run([SOLVE], cwd=dst, env=ENV, capture_output=True,
                       text=True, timeout=900)
    return (d, dst), (pr.returncode, pr.stdout + pr.stderr), None


# ---- D1: the derivation, record complete, closure recomputed --------------
st, res, err = staged("density   { provenance derivedDiluteVolume; }")
if err:
    fails.append("D1: " + err)
else:
    rc, out = res
    if rc != 0:
        fails.append("D1: the authorised derivation refused -- " + out[-300:])
    else:
        conv = open(os.path.join(st[1], "converged", "feed"),
                    encoding="utf-8").read()
        blk = re.search(r"densityDerivation\s*\{(.*?)\n        \}", conv, re.S)
        if not blk:
            fails.append("D1: no densityDerivation record in the resolved "
                         "snapshot -- both terms must stay visible")
        else:
            b = blk.group(1)
            vals = {}
            for key in ("rhoWater", "soluteMass", "final"):
                m = re.search(rf"{key}\s+([0-9.eE+-]+) kg/m3", b)
                if not m:
                    fails.append(f"D1: the record is missing '{key}'")
                else:
                    vals[key] = float(m.group(1))
            if "closure            diluteVolume;" not in b:
                fails.append("D1: the record does not name its closure")
            if len(vals) == 3:
                if abs(vals["rhoWater"] + vals["soluteMass"]
                       - vals["final"]) > 1e-4:
                    fails.append("D1: the record's terms do not sum to its "
                                 "final")
                madj = re.search(r"Cl \{[^}]*reconciled ([0-9.eE+-]+) kmol/h",
                                 conv)
                if madj:
                    clM = (float(madj.group(1)) / 3600.0 / 2.0e-3
                           * 1000.0 * 35.453)
                    solutes = (84.0 + clM
                               + 143.0 / 100.0869 * 2.0 * 61.016) * 1e-3
                    want = rho_kell(20.0) + solutes
                    if abs(vals["final"] - want) > 0.1:
                        fails.append(f"D1: final rho {vals['final']:.4f} "
                                     f"disagrees with the independently "
                                     f"recomputed closure {want:.4f} kg/m3 "
                                     f"(Kell + the sheet's own solutes)")
    if st:
        shutil.rmtree(st[0], ignore_errors=True)

# ---- D2..D8: the refusals, each by name -----------------------------------
PROBES = [
    ("D2", "density   { }", None,
     "Two provenances exist, both explicit",
     "a provenance-less density block was ACCEPTED"),
    ("D3", "density   { value 998.4 kg/m3; provenance derivedDiluteVolume; }",
     None, "Two sources for one number",
     "derivedDiluteVolume beside a value was ACCEPTED"),
    ("D4", "density   { provenance derivedDiluteVolume; }",
     lambda s: re.sub(r"\n\s*sampleTemperature[^\n]*\n", "\n", s),
     "needs `sampleTemperature`", "no sampleTemperature was ACCEPTED"),
    ("D5", "density   { provenance derivedDiluteVolume; }",
     lambda s: s.replace("sampleTemperature  293.15 K;",
                         "sampleTemperature  380.15 K;"),
     "0-100 degC", "380 K (outside Kell) was ACCEPTED"),
    ("D6", "density   { provenance iterative; }", None,
     "direct calculation wearing a loop",
     "`provenance iterative` was ACCEPTED -- it must refuse, stating that "
     "no composition-dependent volume closure exists to define an "
     "iteration (slice B is BLOCKED, not completed)"),
    ("D8", "density   { provenance derivedDiluteVolume; "
           "iteration { maxIterations 5; } }", None,
     "nothing for a tolerance or an iteration count to govern",
     "an iteration{} block on the direct closure was ACCEPTED"),
]
for tag, dens, extra, need, msg in PROBES:
    st, res, err = staged(dens, extra)
    if err:
        fails.append(f"{tag}: {err}")
        continue
    rc, out = res
    shutil.rmtree(st[0], ignore_errors=True)
    if rc == 0:
        fails.append(f"{tag}: {msg}")
    elif need not in out:
        fails.append(f"{tag}: it refused, but without the named reason "
                     f"(expected '{need}')")

# ---- D7: molality basis + density block -----------------------------------
st, res, err = staged(
    "density   { provenance derivedDiluteVolume; }",
    lambda s: s.replace("basis              mg/L;", "basis              mol/kg;")
               .replace("volumetricFlow     2.0 m3/h;",
                        "solventMassFlow    1993.0 kg/h;"))
if err:
    fails.append("D7: " + err)
else:
    rc, out = res
    shutil.rmtree(st[0], ignore_errors=True)
    if rc == 0:
        fails.append("D7: a MOLALITY basis with a density block was ACCEPTED")
    elif "no volume to close" not in out:
        fails.append("D7: it refused, but without saying why")

if fails:
    print("check_derived_density: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_derived_density: OK -- the authorised derivedDiluteVolume "
      "closure runs with both terms recorded (they sum to the final, and "
      "the final agrees with an independent python recomputation to 0.1 "
      "kg/m3); provenance-less, two-sources, missing sample temperature, "
      "out-of-domain (Kell 0-100 degC), molality-basis and iteration{}-on-"
      "a-direct-closure all refuse by name; and `provenance iterative` "
      "refuses stating the missing machinery -- slice B is BLOCKED on a "
      "composition-dependent volume model, not completed.  DELIBERATELY "
      "ABSENT: a non-convergence probe (only reachable against machinery "
      "that should not exist).  NOT COVERED: the closure's ACCURACY (an "
      "announced approximation, not a validated density model) and the "
      "reconciliation/inversion arithmetic (their own gates).")
