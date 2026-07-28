#!/usr/bin/env python3
"""Stream-basis gate: a stream written in the AQUEOUS-SPECIES basis is a change
of COORDINATES, not a change of model -- and its three refusals still fire.

WHY THIS EXISTS.  The species basis is invisible to every other check.  The
projection happens on read, so by the time a KPI or a mass balance sees the
case it is an ordinary component-basis stream: a golden master cannot tell a
correct inversion from a wrong one, and cannot tell either from a refusal that
stopped firing.  Only two things can -- comparing against the same water
written in components, and provoking the refusals on purpose.

  1. EQUIVALENCE.  The analysis (Ca 0.0122, HCO3 0.0244) must give the SAME
     answer as the components it inverts to (CO2 0.0122, CaCO3 0.0122).  Not
     close: the same, to solver tolerance.  If a coordinate change moves the
     answer, it was not a coordinate change.

  2. CHARGE.  An analysis that does not close in charge must REFUSE.  An
     unbalanced water is a measurement to fix; absorbing it into the solved pH
     would hide a laboratory fault inside a result.

  3. NETWORK.  A `network` naming a chemistry set the system does not declare
     must REFUSE -- a species name means nothing outside its set, and a typo
     that passes silently makes the file look authoritative.

  4. BASIS.  A missing `basis` must REFUSE.  Analytical and stoichiometric
     sets differ exactly in whether charge must close (H/OH are the network's
     own mediators and are excluded from the masters), so one default refuses
     correct waters and the other waves broken ones through.

Contract: docs/design/aqueous-stream-basis-proposal.md.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"
CASE = ROOT / "tutorials/steady/flash/flash18_water_analysis_basis"

bad = []


def run(case):
    p = subprocess.run([str(SOLVE), "-case", str(case)],
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    return json.loads(m.group(1)) if m else None


def variant(feed_body, name):
    """Copy the case with a replacement 0/feed; return (rc, out)."""
    td = tempfile.mkdtemp()
    try:
        sub = Path(td) / name
        shutil.copytree(CASE, sub)
        for stale in ("converged", "reports"):
            if (sub / stale).exists():
                shutil.rmtree(sub / stale)
        (sub / "0" / "feed").write_text(feed_body)
        return run(sub)
    finally:
        shutil.rmtree(td, ignore_errors=True)


HEAD = "T               313.15 K;\nP               101325 Pa;\n"

#  ---- 1. EQUIVALENCE -------------------------------------------------------
rc, out = run(CASE)
if rc != 0:
    bad.append(f"{CASE.name}: exited {rc} -- the species-basis case must "
               f"solve.  Output:\n" + out[-2000:])
species = result(out)

rc2, out2 = variant(
    "componentMolarFlows\n{\n    CO2      0.0122 kmol/h;\n"
    "    CaCO3    0.0122 kmol/h;\n    water   97.0    kmol/h;\n}\n" + HEAD,
    "components")
comps = result(out2) if rc2 == 0 else None
if comps is None:
    bad.append("the equivalent COMPONENT-basis water did not solve -- the "
               "comparison that proves this is a coordinate change cannot run"
               f" (exit {rc2})")
elif species is not None:
    for unit, kpis in species["kpis"].items():
        for k, v in kpis.items():
            w = comps["kpis"].get(unit, {}).get(k)
            if w is None:
                bad.append(f"KPI {unit}.{k} missing from the component run")
                continue
            if abs(v - w) > 1e-6 * max(1.0, abs(w)):
                bad.append(f"{unit}.{k}: species basis gives {v}, components "
                           f"give {w} -- a change of coordinates moved the "
                           f"answer, so it was not a change of coordinates")

#  ---- 2. CHARGE ------------------------------------------------------------
rc3, out3 = variant(
    "speciesMolarFlows\n{\n    network   carbonate;\n"
    "    basis     analytical;\n    Ca         0.0122 kmol/h;\n"
    "    HCO3       0.0500 kmol/h;\n    water     97.0    kmol/h;\n}\n" + HEAD,
    "unbalanced")
if rc3 == 0:
    bad.append("an analysis with net charge SOLVED -- an unbalanced water is "
               "a measurement to fix, never a residue for the pH to absorb")
elif "does NOT balance charge" not in out3:
    bad.append("the unbalanced analysis refused, but not by naming the charge "
               "residue.  Got:\n" + out3[-600:])

#  ---- 3. NETWORK -----------------------------------------------------------
rc4, out4 = variant(
    "speciesMolarFlows\n{\n    network   sulfide;\n"
    "    basis     analytical;\n    Ca         0.0122 kmol/h;\n"
    "    HCO3       0.0244 kmol/h;\n    water     97.0    kmol/h;\n}\n" + HEAD,
    "wrongnet")
if rc4 == 0:
    bad.append("a `network` this system does not declare SOLVED -- a species "
               "name means nothing outside its set")
elif "is not a chemistry set this" not in out4:
    bad.append("the wrong network refused, but not by naming the declared "
               "sets.  Got:\n" + out4[-600:])

#  ---- 4. BASIS -------------------------------------------------------------
rc5, out5 = variant(
    "speciesMolarFlows\n{\n    network   carbonate;\n"
    "    Ca         0.0122 kmol/h;\n    HCO3       0.0244 kmol/h;\n"
    "    water     97.0    kmol/h;\n}\n" + HEAD,
    "nobasis")
if rc5 == 0:
    bad.append("a species block with no `basis` SOLVED -- analytical and "
               "stoichiometric sets differ in whether charge must close, so "
               "there is no safe default")
elif "carries no `basis analytical|" not in out5:
    bad.append("the missing basis refused, but not by naming the choice.  "
               "Got:\n" + out5[-600:])

if bad:
    print("stream-basis gate FAILED:")
    for b in bad:
        print("  - " + b)
    sys.exit(1)

print("stream-basis gate: species basis == component basis to solver "
      "tolerance; charge, network and basis refusals all fire")
