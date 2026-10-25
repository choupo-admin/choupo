#!/usr/bin/env python3
"""Gate: four thermodynamic answers that used to be published as converged
when they were not (DEV.md 4c C131, phase 2, family (a) -- the review of the
flash, the saturation solvers and the activity models against good practice).

    bin/curate/check_thermo_limits.py

Every probe is BUILT in a temporary directory from a real corpus case and run
through the real binary; nothing in the tree is written.

  (a) UNIQUAC AT INFINITE DILUTION.  `UNIQUAC::gamma` returned gamma = 1 for a
      component with x_i = 0, so ethanol in water (bubbleT02's pair, 350 K)
      read 1 at x = 0 and 7.711 at x = 1e-9.  The combinatorial is now written
      in phi_i/x_i and theta_i/phi_i (as UNIFAC.cpp always was), whose limit
      is finite.  The arm requires gamma(x = 0) to equal gamma(x = 1e-9) to
      1e-6 in ln gamma, and that limit to be far from 1 (> 2).

  (b) AN EXHAUSTED FLASH OUTER LOOP.  The VL flash fell out of its
      composition loop at `maxOuterIter` with the inner Rachford-Rice verdict
      standing: flash02 with `maxOuterIter 1;` published V/F 0.890 (the
      converged answer is 0.798), "Converged: yes", exit 0.  The arm requires
      the capped probe to exit non-zero naming the exhausted loop, AND the
      same case uncapped to exit 0 converged (so the refusal is not a refusal
      of every flash).

  (c) A TRIVIAL BUBBLE ROOT and (d) A TRIVIAL DEW ROOT.  `BubblePoint::
      compute` prices the vapour at the liquid's own composition (y = x) and
      `DewPoint::compute` starts the liquid at x = y; on a phi-phi cubic both
      fugacities then come off ONE root and every K is 1, which satisfies the
      residual identically.  flash09's own liquid (N2 + CH4, SRK, saturated at
      149.82 K and 20.616 bar by the flash) came back "T_bubble 200 K,
      Converged: yes" at the bracket floor.  The arms require both probes to
      report NOT converged, naming the trivial root, and a genuine bubble
      point (bubbleT01, ideal gas vapour) to stay converged.

  (e) THE T-x-y BLOCK.  The diagnostic sweep in choupoSolve published, for
      flash09, a "diagram" whose every bubble T was the 350 K seed.  The arm
      requires flash09's result to carry NO Tbubble array and the log to say
      why, and flash01's (a genuine ideal-gas binary) to still carry one.

WHAT THIS GATE DOES NOT COVER, so its OK line cannot imply it:
  * It does NOT make the bubble/dew solvers RIGHT on a cubic: they still
    price the trial phase at the given phase's composition (no incipient-
    phase iteration, as `BubblePoint::pressure` has) and still bracket T in
    200-700 K.  Those are proposals in docs/design/review-c131-thermodynamics.md;
    this gate only holds the refusal of the trivial root.
  * The trivial-root test excludes a PURE component on purpose: its genuine
    saturation point has K = 1 too.  A pure component on a liquid-only root
    (propane at 15 bar, y = x, gamma-phi + PR: 228.6 K against 316.3 K) is NOT
    caught here; it is the incipient-phase proposal.
  * It says nothing about the missing phi_sat in gamma-phi, nor about the
    phi-phi liquid enthalpy (both in the review, both golden-moving).

Measured against the PRE-fix binary on 2026-10-25, every arm's subject read as
described above (the witness logs are cited in the review); against the
patched binary every arm passes.  A missing binary REFUSES (a check that
cannot run must not pass).
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
solve = repo / "choupoSolve"
props = repo / "choupoProps"
T = repo / "tutorials"
uniquacBase = T / "steady/flash/bubbleT02_uniquac_ethanol_water"
flash02 = T / "steady/flash/flash02_ethanol_water"
flash09 = T / "steady/flash/flash09_n2ch4_stryjek"
flash01 = T / "steady/flash/flash01_benzene_toluene"
bubble01 = T / "steady/flash/bubbleT01_ethanol_water"

for b in (solve, props):
    if not b.exists():
        print(f"thermo-limits GATE FAILED: no {b.name} binary -- build first"
              " (make).  A check that cannot run must not pass.")
        sys.exit(1)
for c in (uniquacBase, flash02, flash09, flash01, bubble01):
    if not c.is_dir():
        print(f"thermo-limits GATE FAILED: probe base case {c.name} is gone"
              " -- re-point the gate.")
        sys.exit(1)

fails = []


def run(binary, case):
    r = subprocess.run([str(binary), "."], cwd=case, capture_output=True,
                       text=True, timeout=600)
    return r.returncode, r.stdout + r.stderr


def resultJson(out):
    """The result block the binaries print last (a JSON object)."""
    start = out.rfind("\n{")
    if start < 0:
        return None
    try:
        return json.loads(out[start + 1:])
    except ValueError:
        return None


# ---- (a) UNIQUAC at infinite dilution ------------------------------------
with tempfile.TemporaryDirectory() as td:
    case = Path(td) / "uq"
    (case / "system").mkdir(parents=True)
    shutil.copytree(uniquacBase / "constant", case / "constant")
    (case / "uq.cho").write_text("")
    (case / "system/controlDict").write_text(
        "application choupoProps;\n"
        "description \"check_thermo_limits (a): UNIQUAC gamma at x = 0\";\n"
        "verbosity 1;\n")
    ops = ""
    for name, xe in (("x0", "0.0"), ("x1em9", "1e-9")):
        xw = "1.0" if xe == "0.0" else "0.999999999"
        ops += ("    { name %s; type propertyPoint;\n"
                "      state { T 350 K; P 1 bar; composition { ethanol %s;"
                " water %s; } }\n"
                "      properties ( gamma_ethanol ); }\n" % (name, xe, xw))
    (case / "system/propsDict").write_text("operations\n(\n" + ops + ");\n")
    rc, out = run(props, case)
    g = dict(re.findall(r'"name": "(x0|x1em9)".*?"gamma_ethanol": ([0-9.eE+-]+)',
                        out))
    import math
    if rc != 0 or set(g) != {"x0", "x1em9"}:
        fails.append("(a) the UNIQUAC probe did not run or published no"
                     f" gamma_ethanol (exit {rc})")
    else:
        g0, g9 = float(g["x0"]), float(g["x1em9"])
        if not (abs(math.log(g0) - math.log(g9)) < 1e-6 and g0 > 2.0):
            fails.append(f"(a) UNIQUAC gamma_ethanol(x=0) = {g0:.6g} but"
                         f" gamma_ethanol(x=1e-9) = {g9:.6g}: the infinite-"
                         "dilution limit is not what x = 0 returns")
        else:
            claimA = f"gamma_inf(ethanol/water, 350 K) = {g0:.4f} at x = 0"

# ---- (b) an exhausted flash outer loop -----------------------------------
with tempfile.TemporaryDirectory() as td:
    case = Path(td) / "f02"
    shutil.copytree(flash02, case)
    rc0, out0 = run(solve, case)
    fd = case / "system/flowsheetDict"
    txt = fd.read_text()
    probe = txt.replace("        type        isothermalFlash;",
                        "        type        isothermalFlash;\n"
                        "        maxOuterIter 1;", 1)
    if probe == txt:
        fails.append("(b) flash02's flowsheetDict changed shape -- the probe"
                     " could not insert `maxOuterIter 1;`")
    else:
        fd.write_text(probe)
        rc1, out1 = run(solve, case)
        if rc0 != 0 or not re.search(r"Converged:\s+yes", out0):
            fails.append(f"(b) negative: uncapped flash02 did not converge"
                         f" (exit {rc0}) -- the refusal is firing on a good flash")
        if rc1 == 0:
            fails.append("(b) the capped flash02 exited 0 -- an exhausted outer"
                         " loop is being published as converged")
        elif not re.search(r"composition outer loop did NOT converge", out1):
            fails.append("(b) the capped flash02 failed, but not naming the"
                         " exhausted outer loop")

# ---- (c), (d) trivial bubble / dew roots on phi-phi SRK ------------------
def satProbe(unitType, flows, label, word):
    with tempfile.TemporaryDirectory() as td:
        case = Path(td) / "sat"
        shutil.copytree(flash09, case)
        for f in ("liq", "vap"):
            p = case / "0" / f
            if p.exists():
                p.unlink()
        feed = case / "0/feed"
        t = feed.read_text()
        t2 = re.sub(r"N2\s+0\.3 kmol/h;", f"N2    {flows[0]} kmol/h;", t)
        t2 = re.sub(r"CH4\s+0\.7 kmol/h;", f"CH4    {flows[1]} kmol/h;", t2)
        if t2 == t:
            return f"{label}: flash09's 0/feed changed shape -- re-point the probe"
        feed.write_text(t2)
        (case / "system/flowsheetDict").write_text(
            "units\n(\n    {\n        name sat01;\n        type %s;\n"
            "        in feed;\n        outputs ( );\n"
            "        operation { P 2061600 Pa; }\n    }\n);\n" % unitType)
        rc, out = run(solve, case)
        if rc == 0 or not re.search(r"Converged:\s+NO", out):
            return (f"{label}: the trivial {word} root was published as"
                    f" converged (exit {rc})")
        if not re.search(r"root found is TRIVIAL", out):
            return f"{label}: refused, but without naming the trivial root"
        return None


for f in (satProbe("bubbleT", ("0.149515816249", "0.850484183751"),
                   "(c) bubble", "bubble"),
          satProbe("dewT", ("0.465833270562", "0.534166730281"),
                   "(d) dew", "dew")):
    if f:
        fails.append(f)

with tempfile.TemporaryDirectory() as td:
    case = Path(td) / "b01"
    shutil.copytree(bubble01, case)
    rc, out = run(solve, case)
    if rc != 0 or not re.search(r"Converged:\s+yes", out) \
            or re.search(r"root found is TRIVIAL", out):
        fails.append("(c) negative: bubbleT01 (a genuine bubble point) no"
                     f" longer converges cleanly (exit {rc})")

# ---- (e) the T-x-y block ---------------------------------------------------
with tempfile.TemporaryDirectory() as td:
    case = Path(td) / "f09"
    shutil.copytree(flash09, case)
    rc, out = run(solve, case)
    if '"Tbubble"' in out:
        fails.append("(e) flash09's result still carries a T-x-y Tbubble array"
                     " (a trivial-root 'diagram')")
    if not re.search(r"\[txy\] T-x-y block omitted: .*trivial", out):
        fails.append("(e) flash09's log does not say why the T-x-y block is"
                     " omitted")
with tempfile.TemporaryDirectory() as td:
    case = Path(td) / "f01"
    shutil.copytree(flash01, case)
    rc, out = run(solve, case)
    if '"Tbubble"' not in out:
        fails.append("(e) negative: flash01 (ideal-gas benzene/toluene) lost"
                     " its T-x-y block -- the omission is firing on a real one")

if fails:
    print("thermo-limits GATE FAILED:")
    for x in fails:
        print("  -", x)
    sys.exit(1)
print("thermo-limits: OK -- (a) " + claimA + ", continuous to 1e-6;"
      " (b) flash02 capped at maxOuterIter 1 refuses naming the exhausted"
      " loop, uncapped converges; (c)/(d) flash09's phi-phi SRK liquid and"
      " vapour give TRIVIAL bubble/dew roots that are reported NOT converged,"
      " bubbleT01 stays converged; (e) flash09 publishes no T-x-y block and"
      " says why, flash01 keeps its.  NOT covered: the y = x pricing and the"
      " 200-700 K bracket themselves, a pure component on a liquid-only root,"
      " phi_sat in gamma-phi, the phi-phi liquid enthalpy.")
