#!/usr/bin/env python3
"""Gate: the AUTHORISED iterative density (slice B) -- nothing silent,
everything watchable.

    bin/curate/check_iterative_density.py

WHY THIS EXISTS.  Vitor's slice-B ruling (2026-08-10): the iterative density
route exists ONLY under explicit user authorisation (`density { provenance
iterative; }`); the complete iteration record must stay visible (initial
estimate, successive values, residuals, criterion, count, final density);
non-convergence REFUSES; an invalid thermodynamic domain REFUSES; and no
automatic or silent iterative route may exist.  The map itself is the
dilute-volume closure over the engine-owned Kell pure-water density --
constant in rho, so convergence is immediate BY CONSTRUCTION, and both the
engine's announcement and the written record SAY so rather than presenting
the closure's property as the solver's virtue.

WHAT THIS CHECKS, through real engine runs on staged copies of
`analysis01_water_analysis_inlet` (whose corpus form stays MEASURED --
the authorised route is exercised on stages only):

  (B1) THE AUTHORISED ROUTE runs, and converged/feed carries the COMPLETE
       record: initialEstimate (= rhoWaterKell at the sample T), criterion,
       tolerance and maxIterations each marked NAMED DEFAULT or declared,
       iteration count, the full values and residuals lists, and the final
       density.  This gate RECOMPUTES the closure independently in python
       (Kell polynomial + the sheet's own solute masses) and requires the
       final rho to agree to 0.1 kg/m3.
  (B2) NOT SILENT: an absent provenance still refuses (the A1 gate holds
       the no-density-route arm; here the probe is `density {}` with no
       provenance word at all, which must refuse naming both explicit
       provenances).
  (B3) TWO SOURCES refuse: `provenance iterative` beside a `value`.
  (B4) NO SAMPLE TEMPERATURE refuses: the initial estimate has nothing to
       be evaluated at.
  (B5) INVALID DOMAIN refuses: sampleTemperature 380 K is outside Kell's
       0-100 degC validity, and the refusal names the domain.
  (B6) NON-CONVERGENCE refuses WITH THE RECORD: `iteration { maxIterations
       1; tolerance 1e-30; }` cannot converge (the first residual is the
       full solute step), and the refusal prints every iterate and
       residual -- a non-converged density is not a density.
  (B7) MOLALITY basis with a density block refuses: there is no volume to
       close, so a density there is a number nothing reads.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * the dilute-volume closure's ACCURACY -- solutes add mass, not volume,
    is an announced approximation, not a validated density model; a
    composition-dependent volume model is a NAMED non-goal of the slice
    (density-model improvement is out of scope by ruling), and when one
    arrives the map gains a real rho-dependence and B1's oracle must learn
    it;
  * the reconciliation and inversion arithmetic (their own gates).

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- the authorisation check removed (a bare `density {}` silently
runs the iteration):

    check_iterative_density: FAILED
      B2: a density block with NO provenance was ACCEPTED -- the route must
      exist only under the explicit `provenance iterative;` authorisation

Sabotage 2 -- the non-convergence refusal removed (the last iterate used
as if converged):

    check_iterative_density: FAILED
      B6: maxIterations 1 with tolerance 1e-30 was ACCEPTED -- a
      non-converged density is not a density and must refuse with the
      record
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
    d = tempfile.mkdtemp(prefix="itdens_")
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


# ---- B1: the authorised route, record complete, closure recomputed --------
st, res, err = staged("density   { provenance iterative; }")
if err:
    fails.append("B1: " + err)
else:
    rc, out = res
    if rc != 0:
        fails.append("B1: the authorised route refused -- " + out[-300:])
    else:
        conv = open(os.path.join(st[1], "converged", "feed"),
                    encoding="utf-8").read()
        blk = re.search(r"densityIteration\s*\{(.*?)\n        \}", conv, re.S)
        if not blk:
            fails.append("B1: no densityIteration record in the resolved "
                         "snapshot -- the ruling is that the record stays "
                         "visible")
        else:
            b = blk.group(1)
            for need in ("initialEstimate", "criterion", "tolerance",
                         "maxIterations", "iterations", "values",
                         "residuals", "final", "NAMED DEFAULT"):
                if need not in b:
                    fails.append(f"B1: the record is missing '{need}'")
            m = re.search(r"final\s+([0-9.eE+-]+) kg/m3", b)
            #  independent closure: Kell(20 C) + the sheet's own solutes
            #  (Ca 84 + Cl 45 mg/L, alkalinity 143 mg/L as CaCO3 -> HCO3
            #  at 2 per unit: 143/100.0869*2*61.016 mg/L), chloride then
            #  absorbs the charge residue -- so recompute AFTER the
            #  declared reconciliation, from the record's own adjusted Cl.
            madj = re.search(r"Cl \{[^}]*reconciled ([0-9.eE+-]+) kmol/h",
                             conv)
            if m and madj:
                clM = float(madj.group(1)) / 3600.0 / 2.0e-3 * 1000.0 * 35.453
                #                        kmol/s / (m3/s) -> mol/m3 -> g/m3
                solutes = (84.0 + clM + 143.0 / 100.0869 * 2.0 * 61.016) * 1e-3
                want = rho_kell(20.0) + solutes
                got = float(m.group(1))
                if abs(got - want) > 0.1:
                    fails.append(f"B1: final rho {got} disagrees with the "
                                 f"independently recomputed closure {want:.4f}"
                                 f" kg/m3 (Kell + the sheet's own solutes)")
    if st:
        shutil.rmtree(st[0], ignore_errors=True)

# ---- B2..B7: the refusals, each by name -----------------------------------
PROBES = [
    ("B2", "density   { }",
     "Two provenances exist, both explicit",
     "a density block with NO provenance was ACCEPTED -- the route must "
     "exist only under the explicit `provenance iterative;` authorisation",
     None),
    ("B3", "density   { value 998.4 kg/m3; provenance iterative; }",
     "Two sources for one number",
     "iterative beside a value was ACCEPTED", None),
    ("B4", "density   { provenance iterative; }",
     "needs `sampleTemperature`",
     "no sampleTemperature was ACCEPTED",
     lambda s: re.sub(r"\n\s*sampleTemperature[^\n]*\n", "\n", s)),
    ("B5", "density   { provenance iterative; }",
     "0-100 degC",
     "sampleTemperature 380 K (outside Kell) was ACCEPTED",
     lambda s: s.replace("sampleTemperature  293.15 K;",
                         "sampleTemperature  380.15 K;")),
    ("B6", "density   { provenance iterative; "
           "iteration { maxIterations 1; tolerance 1e-30; } }",
     "did NOT converge",
     "maxIterations 1 with tolerance 1e-30 was ACCEPTED -- a non-converged "
     "density is not a density and must refuse with the record", None),
]
for tag, dens, need, msg, extra in PROBES:
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
    elif tag == "B6" and ("iter 1: rho" not in out):
        fails.append("B6: the non-convergence refusal does not print the "
                     "record -- every iterate and residual must be in it")

# ---- B7: molality basis + density block -----------------------------------
st, res, err = staged(
    "density   { provenance iterative; }",
    lambda s: s.replace("basis              mg/L;", "basis              mol/kg;")
               .replace("volumetricFlow     2.0 m3/h;",
                        "solventMassFlow    1993.0 kg/h;"))
if err:
    fails.append("B7: " + err)
else:
    rc, out = res
    shutil.rmtree(st[0], ignore_errors=True)
    if rc == 0:
        fails.append("B7: a MOLALITY basis with a density block was ACCEPTED "
                     "-- there is no volume to close, so the density is a "
                     "number nothing reads")
    elif "no volume to close" not in out:
        fails.append("B7: it refused, but without saying why")

if fails:
    print("check_iterative_density: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_iterative_density: OK -- the authorised route runs with the "
      "COMPLETE record (initial estimate, values, residuals, criterion, "
      "counts, final; defaults marked NAMED DEFAULT) and its final rho "
      "agrees with an independent python recomputation of the closure to "
      "0.1 kg/m3; a provenance-less density, iterative-plus-value, a "
      "missing sample temperature, an out-of-domain temperature (Kell "
      "0-100 degC), a non-converging declaration (record printed in the "
      "refusal) and a molality-basis density all refuse by name.  NOT "
      "COVERED: the dilute-volume closure's ACCURACY (an announced "
      "approximation, not a validated density model -- improving it is a "
      "named non-goal), and the reconciliation/inversion arithmetic (their "
      "own gates).")
