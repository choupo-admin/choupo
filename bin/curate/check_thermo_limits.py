#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
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

  (c) A TRIVIAL BUBBLE ROOT and (d) A TRIVIAL DEW ROOT.  On a phi-phi cubic a
      saturation search whose trial phase equals the given phase prices both
      fugacities off ONE root and every K is 1, which satisfies the residual
      identically.  flash09's own liquid (N2 + CH4, SRK, saturated at 149.82 K
      and 20.616 bar by the flash) once came back "T_bubble 200 K, Converged:
      yes" at the bracket floor, because the solvers priced the trial phase at
      the given phase's composition.  SINCE EX-05 (2026-11-15) the solvers
      iterate the incipient phase (Wilson-seeded), so at that state they find
      the GENUINE saturation point and the old probe is no longer a trivial
      root: the arms are in two halves.  (c-genuine)/(d-genuine): at the
      flash's own state both solvers converge to the flash's own temperature
      (149.82 K, within 0.01 K) -- the saturation the flash found by another
      route.  (c)/(d): above the mixture's critical pressure (50 bar, the same
      two compositions) there is no saturation point, the cubic has one root,
      and both solvers must report NOT converged naming the trivial root.  A
      genuine bubble point (bubbleT01, ideal gas vapour) must stay converged.

  (c') AN AZEOTROPE IS NOT A TRIVIAL ROOT.  Every K = 1 is ALSO the
      signature of a genuine azeotropic bubble point; the first cut of the
      refusal tested K alone and refused bubbleT02's UNIQUAC ethanol + water
      at its own azeotrope (x_ethanol = 0.8310270237, gamma-phi, ideal-gas
      vapour, no cubic anywhere), exit 2 with "the vapour was priced on the
      liquid's own root".  The refusal is now scoped to a phi-phi package
      whose two roots coincide (`trivialSaturationRoot`).  The arm requires
      that probe to stay converged, and first proves the probe still sits at
      the azeotrope (|K - 1| <= 1e-9 read back from the run).

  (e) THE T-x-y BLOCK.  The diagnostic sweep in choupoSolve published, for
      flash09, a "diagram" whose every bubble T was the 350 K seed.  The arm
      requires flash09's result to carry NO Tbubble array and the log to say
      why, and flash01's (a genuine ideal-gas binary) to still carry one.

WHAT THIS GATE DOES NOT COVER, so its OK line cannot imply it:
  * The independent value of (c-genuine)/(d-genuine) is the FLASH's own
    saturation (same equation of state, a different algorithm), not a
    calculation outside the engine; bin/curate/check_phase_envelope.py holds
    the phi-phi dew/bubble solvers to an independent Peng-Robinson calculation
    (arms k, l: pure fluids, an azeotrope, the near-critical refusals).
  * On a phi-phi package the solvers iterate the incipient phase and bracket
    T in 100-700 K (EX-05); the gamma-phi path keeps 200-700 K.  The pure
    component on a liquid-only root of a GAMMA-phi package (propane at 15 bar,
    y = x, gamma-phi + PR) is not covered here.
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
def satProbe(unitType, flows, label, word, P="2061600", genuine=None):
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
            "        operation { P %s Pa; }\n    }\n);\n" % (unitType, P))
        rc, out = run(solve, case)
        if genuine is not None:
            m = re.search(r"T_(?:bubble|dew):\s+([0-9.]+)\s+K", out)
            if (rc != 0 or not re.search(r"Converged:\s+yes", out)
                    or not m or abs(float(m.group(1)) - genuine) > 0.01):
                return (f"{label}: the genuine {word} point at the flash's own"
                        f" state must converge to {genuine} K (exit {rc},"
                        f" T = {m.group(1) if m else None})")
            return None
        if rc == 0 or not re.search(r"Converged:\s+NO", out):
            return (f"{label}: the trivial {word} root was published as"
                    f" converged (exit {rc})")
        if not re.search(r"root found is TRIVIAL", out):
            return f"{label}: refused, but without naming the trivial root"
        return None


for f in (satProbe("bubbleT", ("0.149515816249", "0.850484183751"),
                   "(c-genuine) bubble", "bubble", genuine=149.82),
          satProbe("dewT", ("0.465833270562", "0.534166730281"),
                   "(d-genuine) dew", "dew", genuine=149.82),
          satProbe("bubbleT", ("0.149515816249", "0.850484183751"),
                   "(c) bubble", "bubble", P="5000000"),
          satProbe("dewT", ("0.465833270562", "0.534166730281"),
                   "(d) dew", "dew", P="5000000")):
    if f:
        fails.append(f)

#  (c') A GENUINE BUBBLE POINT WITH EVERY K = 1: AN AZEOTROPE.  The trivial-
#  root test must not refuse it (C131 refutation): bubbleT02's UNIQUAC
#  ethanol + water at its own azeotrope, gamma-phi with an ideal-gas vapour,
#  has |K - 1| < 1e-9 for both components at a real saturation point, and a
#  K-only test refused it as "the vapour was priced on the liquid's own
#  root".  The probe first proves it sits AT the azeotrope (both |K - 1| <=
#  1e-9 read back from the run), so it cannot pass vacuously if the engine's
#  numbers drift: then it fails asking to be re-bisected.
#  re-bisected 2026-11-16 (water's Psat is the IAPWS equation: the azeotrope sits at
#  0.8402 instead of 0.8310); K = 1 to 5e-10 on the 12 digits the run publishes.
X_AZ = 0.84022650349168
with tempfile.TemporaryDirectory() as td:
    case = Path(td) / "az"
    shutil.copytree(uniquacBase, case)
    feed = case / "0/feed"
    t = feed.read_text()
    t2 = re.sub(r"ethanol\s+30 kmol/h;", "ethanol    %.16g kmol/h;" % (100 * X_AZ), t)
    t2 = re.sub(r"water\s+70 kmol/h;", "water    %.16g kmol/h;" % (100 * (1 - X_AZ)), t2)
    fd = case / "system/flowsheetDict"
    ft = fd.read_text()
    ft2 = ft.replace("operation   { P 1.01325 bar; }",
                     "operation   { P 1.01325 bar; Tinit 351.0186; }", 1)
    if t2 == t or ft2 == ft:
        fails.append("(c') bubbleT02's 0/feed or flowsheetDict changed shape --"
                     " re-point the azeotrope probe")
    else:
        feed.write_text(t2)
        fd.write_text(ft2)
        rc, out = run(solve, case)
        m = re.search(r'"bubble02": \{[^}]*"y_ethanol": ([0-9.eE+-]+),'
                      r' "y_water": ([0-9.eE+-]+)', out)
        if re.search(r"root found is TRIVIAL", out):
            #  The refusal itself certifies every K = 1 to 1e-9 at the probe,
            #  i.e. that the probe sits at the azeotrope.
            fails.append("(c') a GENUINE azeotropic bubble point (every K ="
                         " 1, gamma-phi, no cubic) was refused as a trivial"
                         f" root (exit {rc})")
        elif not m:
            fails.append(f"(c') the azeotrope probe published no y (exit {rc})")
        else:
            ke = float(m.group(1)) / X_AZ
            kw = float(m.group(2)) / (1 - X_AZ)
            if max(abs(ke - 1), abs(kw - 1)) > 1e-9:
                fails.append("(c') the probe no longer sits at the UNIQUAC"
                             f" azeotrope (K = {ke:.12f}, {kw:.12f}) -- re-bisect"
                             " X_AZ; the arm cannot test the refusal elsewhere")
            elif rc != 0 or not re.search(r"Converged:\s+yes", out) \
                    or re.search(r"root found is TRIVIAL", out):
                fails.append("(c') a GENUINE azeotropic bubble point (every K ="
                             " 1, gamma-phi, no cubic) was refused as a trivial"
                             f" root (exit {rc})")

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
      " loop, uncapped converges; (c-genuine)/(d-genuine) flash09's own"
      " saturated liquid and vapour give their GENUINE bubble/dew point (149.82"
      " K, the flash's own); (c)/(d) the same compositions at 50 bar (above the"
      " mixture's critical pressure) give a TRIVIAL root reported NOT"
      " converged,"
      " bubbleT01 and the UNIQUAC ethanol-water azeotrope (every K = 1, a"
      " genuine bubble point) stay converged; (e) flash09 publishes no T-x-y block and"
      " says why, flash01 keeps its.  NOT covered: the flash is not an"
      " independent calculation (check_phase_envelope holds one), a pure"
      " component on a liquid-only root of a gamma-phi package, phi_sat in"
      " gamma-phi, the phi-phi liquid enthalpy.")
