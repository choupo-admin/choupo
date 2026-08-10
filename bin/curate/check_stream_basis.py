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

  5. CLOSURE.  The solver WRITES a `speciation {}` decomposition on the liquid
     outlet.  Fed back as state it must be accepted; broken by hand it must
     REFUSE, naming the master and both numbers.  Summing free ions would not
     detect it -- the calcium of this water is spread over Ca(2+), CaHCO3(+),
     CaCO3(aq) and CaOH(+), so the check collapses through the NETWORK's own
     stoichiometry.

  6. DELETABILITY.  Delete the block and the answer must not move.  That is
     the design's own test of whether a field is state: if removing it loses
     information, it was a second home for the material and the shape is
     wrong.

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

#  ---- 5. CLOSURE, and 6. DELETABILITY -------------------------------------
conv = CASE / "converged" / "liquid"
if not conv.is_file():
    bad.append("no converged/liquid to read back -- the case must have been "
               "run before this gate (it is, by the tutorial sweep)")
else:
    body = conv.read_text()
    if "speciation" not in body:
        bad.append("the solver wrote no `speciation` block on the liquid "
                   "outlet -- the decomposition the case exists to show is "
                   "missing")
    else:
        rcA, outA = variant(body, "roundtrip")
        if rcA != 0:
            bad.append("the solver's own speciation block was REFUSED when "
                       f"fed back as state (exit {rcA}):\n" + outA[-800:])
        base = result(outA) if rcA == 0 else None

        broken = re.sub(r"^(\s+Ca\s+)[0-9.eE+-]+", r"\g<1>0.5", body,
                        count=1, flags=re.M)
        if broken == body:
            bad.append("could not break the speciation block to test the "
                       "closure check -- the gate would pass vacuously")
        else:
            rcB, outB = variant(broken, "brokenspec")
            if rcB == 0:
                bad.append("a speciation block broken by hand SOLVED -- a "
                           "decomposition that does not close is a second "
                           "account of the same matter")
            elif "does NOT collapse back to the material" not in outB:
                bad.append("the broken block refused, but not by naming the "
                           "closure.  Got:\n" + outB[-600:])

        #  Deleting the block means deleting it AND the cross-reference that
        #  names it (calculated.equilibriumState, ruled 2026-08-10): a
        #  reference must never outlive its target, so stripping the target
        #  alone is an INCOMPLETE deletion the engine now refuses by name --
        #  which this gate observed the day the reference shipped.  The
        #  report-only claim is about the pair; the dangling-reference
        #  refusal has its own gate (check_equilibrium_state_ref).
        stripped = re.sub(r"\nspeciation\n\{.*?\n\}\n", "\n", body,
                          flags=re.S)
        stripped = re.sub(r"\ncalculated\n\{.*?\n\}\n", "\n", stripped,
                          flags=re.S)
        if stripped == body:
            bad.append("could not strip the speciation block -- the "
                       "deletability test would pass vacuously")
        else:
            rcC, outC = variant(stripped, "nospec")
            got = result(outC) if rcC == 0 else None
            if got is None:
                bad.append(f"deleting the speciation block broke the case "
                           f"(exit {rcC}) -- it is meant to be report-only")
            elif base is not None:
                for unit, kpis in base["kpis"].items():
                    for k, v in kpis.items():
                        w = got["kpis"].get(unit, {}).get(k)
                        if w is None or abs(v - w) > 1e-9 * max(1.0, abs(w)):
                            bad.append(f"{unit}.{k} moved when the speciation "
                                       f"block was deleted ({v} -> {w}) -- it "
                                       f"is STATE, and this design says it "
                                       f"must not be")

if bad:
    print("stream-basis gate FAILED:")
    for b in bad:
        print("  - " + b)
    sys.exit(1)

print("stream-basis gate: species basis == component basis; charge, network "
      "and basis refusals fire; the written speciation closes, refuses when "
      "broken, and is deletable without moving the answer")
