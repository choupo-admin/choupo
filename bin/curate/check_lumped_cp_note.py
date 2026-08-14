#!/usr/bin/env python3
"""check_lumped_cp_note -- an approximate energy model must announce itself.

WHY.  `Absorber` and `Stripper` carry the same textbook stage energy balance:
liquid Cp is the SOLVENT's alone, vapour Cp is the FEED gas at feed
composition, both evaluated once at the inlet and held constant, with the
per-solute heat of absorption as the only source.  That is not the canonical
enthalpy the energy report prices, so the converged temperature profile leaves
a first-law residual on the unit's own streams: -19.87 kW on
stripper01_NH3_water and -11.25 kW on the acetone plant's absorber (measured
2026-08-14).  absorber01_NH3_water shows +82.93 kW, but only ~28 kW of that
is this model: the rest is its gas feed being priced as a LIQUID, because
N2's vapour pressure extrapolated above its critical temperature makes the
phase resolution return all-liquid for the mixture.  See the correction in
docs/design/model-boundary-energy-ledger.md.

None of those was visible before that date -- all three read `n/a` in the
model-boundary ledger, because the audit only ran on units declaring a duty.
Once lit, the residual needed a name.  It is the same posture choupoCtrl's
dynamicCSTR already takes (a Cp/convective energy equation is not the
derivative of the canonical U): ANNOUNCE the approximation, do not present it
as a first-law failure, and do not quietly reformulate a model the corpus is
pinned to.

WHAT IT CHECKS
  A1  absorber01_NH3_water raises the note, and it reaches BOTH durable
      surfaces -- the end-of-run caveat summary and the result JSON.
  A2  stripper01_NH3_water raises it too.  Absorber and Stripper are separate
      classes sharing one balance; the sentence has ONE home
      (separation/LumpedCpEnergyNote.H) so two columns cannot drift into two
      descriptions of the same approximation.  A2 is what makes that real.
  A3  the note names the ledger column a reader must go and read, so the
      announcement leads somewhere instead of merely worrying them.
  A4  the NEGATIVE: a case with no absorber and no stripper raises no such
      note -- the advisory is emitted by the unit, not by every run.

WHAT IT DOES *NOT* CHECK, and this is the honest limit:
  * THE ISOTHERMAL BRANCH.  A column that runs isothermal makes no temperature
    claim and must stay silent, and NO corpus case exercises that branch --
    all four absorber/stripper cases converge non-isothermal.  So the "stays
    silent when it should" half is unproven here.  Synthesising it means
    defeating a sealed case's Henry data, which would test the seal rather
    than the branch.  Stated rather than implied: a gate that suggests more
    coverage than it has is worse than one that reports less.
  * whether the residual is CORRECT, or whether the lumped-Cp model should be
    replaced.  Both are open; this gate only enforces that it is declared.

SABOTAGE-VERIFIED 2026-08-14, observed output:
  S1  the Stripper's call removed (so the shared home has one caller left) ->
      "A2: stripper01_NH3_water raises no lumped-Cp advisory" plus the
      summary arm.  A2 is the arm that keeps the two classes honest.
  S2  the note's pointer to `raw_imbalance_kW` softened to "somewhere in the
      reports" -> A3 fires on BOTH cases.
Each sabotage was rebuilt and the binary's timestamp checked before the
verdict was read: a sabotage that does not compile tests the previous binary.

Exit 0 = the note is raised, reaches both surfaces, and is absent where it
should be.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"
NEEDLE = "LUMPED-Cp"

CASES = {
    "absorber": ROOT / "tutorials/steady/absorption/absorber01_NH3_water",
    "stripper": ROOT / "tutorials/steady/absorption/stripper01_NH3_water",
    "neither":  ROOT / "tutorials/steady/absorption/absorption01_CO2_water",
}

failures = []


def run(case: Path) -> str:
    p = subprocess.run([str(SOLVE), str(case)], capture_output=True, text=True)
    return p.stdout + p.stderr


def result_json(out: str) -> dict:
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def notes_in_json(out: str):
    return [a for a in result_json(out).get("advisories", [])
            if NEEDLE in a.get("message", "")]


def in_summary(out: str) -> bool:
    """The note must appear in the end-of-run replay, not only at its site.
    That replay is the surface a reader actually meets -- units inside a
    recycle run silent per iteration, so on the acetone plant the site line
    is not printed at all and the summary is the ONLY place it surfaces."""
    m = re.search(r"ASSUMPTIONS AND CAVEATS(.*?)(?:-{20,}\s*<<<Choupo:result-begin)",
                  out, re.S)
    return bool(m) and NEEDLE in m.group(1)


def main() -> int:
    if not SOLVE.exists():
        print("check_lumped_cp_note: choupoSolve missing -- build first")
        return 1

    for tag in ("absorber", "stripper"):
        out = run(CASES[tag])
        arm = "A1" if tag == "absorber" else "A2"
        js = notes_in_json(out)
        if not js:
            failures.append(f"{arm}: {CASES[tag].name} raises no lumped-Cp"
                            f" advisory -- its energy model is an"
                            f" approximation and says so nowhere")
        if not in_summary(out):
            failures.append(f"{arm}: the note is missing from the end-of-run"
                            f" caveat summary on {CASES[tag].name} -- a"
                            f" warning that only exists at its site, a"
                            f" thousand lines up, has been delivered and not"
                            f" received")
        # -- A3: it must point at the column a reader can go and read
        if js and "raw_imbalance_kW" not in js[0].get("message", ""):
            failures.append(f"A3: the note on {CASES[tag].name} does not name"
                            f" `raw_imbalance_kW` -- it worries the reader"
                            f" without telling them where the size is")

    # -- A4: the negative
    out = run(CASES["neither"])
    if notes_in_json(out) or NEEDLE in out:
        failures.append("A4: %s has neither an absorber nor a stripper and"
                        " still carries the lumped-Cp note -- it is being"
                        " emitted by the run, not by the unit"
                        % CASES["neither"].name)

    if failures:
        print("check_lumped_cp_note: FAIL")
        for f in failures:
            print("  -", f)
        return 1

    print("check_lumped_cp_note: OK -- both column classes announce their"
          " lumped-Cp energy model, the note reaches the caveat summary and"
          " the result JSON, it names the ledger column carrying the size,"
          " and a case with neither unit stays silent.  NOT checked: the"
          " ISOTHERMAL branch (no corpus case reaches it, so 'stays silent"
          " when it should' is unproven), whether the residual is correct, or"
          " whether the model should be replaced.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
