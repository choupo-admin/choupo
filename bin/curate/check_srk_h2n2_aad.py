#!/usr/bin/env python3
"""Gate: SRK's density error on the ammonia loop's gas is RECOMPUTED, never quoted.

    bin/curate/check_srk_h2n2_aad.py

WHY THIS EXISTS.  Vitor asked, on 2026-09-09, whether the thermodynamic models
the green ammonia plant runs on are reasonable at its pressures and whether
anything measured backs them up.  `tutorials/props/molecular/srk01_h2n2_density`
answers it: sixteen published (T, P, x, rho) points on the nitrogen + hydrogen
binary, evaluated with the plant's own SRK declaration and kij = 0.

THE AGREEMENT STATISTIC HAS NO WRITTEN HOME, AND THAT IS DELIBERATE.  A case
header saying "AAD 1.0 %" is a transcription: it stays put while the engine,
the component records or the anchors move underneath it, and no golden can see
that it has gone false -- a golden pins what a run PRINTS, and prose is not
printed.  There is no `aad` golden row here either, because no operation in
this tree computes an equation-of-state density AAD against a declared
dataset; inventing one for a single case would put the arithmetic in the
engine before anyone has asked for it in general.

So the comparison is DONE HERE, from two sources this gate does not own:

  * the RUN's own `v_molar` diagnostics, read out of the result JSON;
  * the CASE's own evidence file, whose sixteen rows are cited to
    doi:10.1021/acs.jced.7b00694 (Hernandez-Gomez, Tuma, Gomez-Hernandez and
    Chamorro, J. Chem. Eng. Data, 2017).

and the molar masses come from the components' own records in
`data/standards/components/`, so not one number in the arithmetic is typed
into this file.

WHAT THIS GATE CHECKS.

  (a) EVERY MEASURED POINT WAS EVALUATED.  The evidence file's rows and the
      case's operations are the same set of states.  A case that quietly
      dropped a point would improve its own statistic, and nothing else would
      notice.

  (b) THE ERROR IS RECOMPUTED AND BOUNDED.  rho = MW_mix / v_molar against the
      cited rho, point by point.  Bands are RATCHETS around what was measured
      on 2026-09-09 (AAD 1.045 %, worst 2.24 %), loose enough not to fire on
      round-off and tight enough that a real regression -- a broken mixing
      rule, a wrong molar mass, a silently-applied kij -- moves them.  An
      agreement that gets much BETTER also fails, asking for the band to be
      re-cut, because on this case that means something was tuned and the
      case's whole claim ("nothing here is fitted") went false.

  (c) THE PREDICTION IS STILL UNTUNED.  The run announces kij = 0.  If a
      curated N2-H2 pair ever lands and this case picks it up, the case is
      measuring something else and must say so.

  (d) THE CITATION IS PRESENT.  The evidence file declares its DOI, and the
      case header carries the composition caveat.  Sixteen values with their
      primary source is a citation; the same sixteen with the source stripped
      is an unattributed table, which philosophy 4 rules worse than a gap.

NOT CHECKED, and said plainly:

  * WHETHER SRK IS ADEQUATE.  This gate measures the disagreement; whether
    1 % on density is good enough for a synthesis loop is an engineering
    judgement no gate can take.
  * ANY OTHER PROPERTY.  Density only.  The loop's condenser depends on the
    ammonia dew point, which this dataset does not touch and no case here
    tests.
  * THE LOOP'S COMPOSITION.  The measured mixtures are x(N2) = 0.50 to 0.95;
    a stoichiometric synthesis gas is near 0.25, and the dataset has no point
    between 0.19 and 0.31.  The case header states this; the gate cannot fix
    it, and a dataset that closed the gap would be a new case, not a wider
    band here.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"
CASE = ROOT / "tutorials/props/molecular/srk01_h2n2_density"
EVID = CASE / "constant/evidence/N2-H2-density-jced-7b00694.dat"

#  RATCHETS around the 2026-09-09 measurement (AAD 1.045 %, worst 2.24 %).
AAD_MAX, AAD_MIN = 1.30, 0.70
WORST_MAX = 3.00


def molar_mass(name):
    """From the component's OWN record -- never a literal in this file."""
    txt = (ROOT / "data/standards/components" / f"{name}.dat").read_text()
    m = re.search(r"^\s*MW\s+([0-9.eE+-]+)\s*;", txt, re.M)
    if not m:
        raise ValueError(f"component '{name}' declares no MW")
    return float(m.group(1)) / 1000.0            # kg/kmol -> kg/mol


def anchors():
    body = EVID.read_text().split("data\n(", 1)[1].split(");")[0]
    out = []
    for line in body.splitlines():
        f = line.split()
        if len(f) == 4:
            out.append(tuple(float(v) for v in f))
    return out


def main() -> int:
    fail = []

    if not PROPS.exists():
        print("check_srk_h2n2_aad: REFUSED -- choupoProps is not built, so "
              "this gate cannot run and therefore must not pass (run `make`).")
        return 1
    if not EVID.is_file():
        print(f"check_srk_h2n2_aad: REFUSED -- {EVID.relative_to(ROOT)} is "
              "missing, so there is nothing to compare the run against.")
        return 1

    p = subprocess.run([str(PROPS), str(CASE)], capture_output=True,
                       text=True, timeout=600)
    if p.returncode != 0:
        print(f"check_srk_h2n2_aad: FAILED\n  - the case did not run "
              f"(exit {p.returncode}) -- a broken witness is not evidence "
              "about the model")
        return 1
    out = p.stdout + p.stderr

    body = out.split("<<<Choupo:result-end>>>")[0]
    j = json.loads(body[body.rindex("\n{\n"):])
    diag = {o["name"]: o.get("diagnostics", {}) for o in j["operationResults"]}

    mw = {c: molar_mass(c) for c in ("N2", "H2")}
    rows = anchors()

    #  (a) every measured point evaluated.
    if len(rows) != len(diag):
        fail.append(f"the evidence file carries {len(rows)} measured point(s) "
                    f"and the run reports {len(diag)} operation(s) -- a point "
                    "that is cited and never evaluated, or evaluated and never "
                    "cited, breaks the correspondence this gate rests on")

    #  (b) the error, recomputed.
    errs = []
    for T, P, x, rho in rows:
        nm = f"p_{T:.0f}K_{P / 100.0:.0f}bar_xN2_{x:.5f}".replace(".", "p")
        if nm not in diag:
            fail.append(f"the measured point T={T:.2f} K P={P / 100:.1f} bar "
                        f"x(N2)={x:.5f} has no operation '{nm}' in the run")
            continue
        v = diag[nm].get("v_molar")
        if not v:
            fail.append(f"operation '{nm}' published no v_molar, so its "
                        "density cannot be recomputed")
            continue
        calc = (x * mw["N2"] + (1.0 - x) * mw["H2"]) / v
        errs.append(abs(calc - rho) / rho * 100.0)

    if errs:
        aad = sum(errs) / len(errs)
        worst = max(errs)
        if aad > AAD_MAX:
            fail.append(f"SRK's density AAD against the cited data is "
                        f"{aad:.3f} %, above the {AAD_MAX} % band -- the "
                        "prediction got WORSE; find what moved (mixing rule, "
                        "a component record, the anchors) before widening it")
        if aad < AAD_MIN:
            fail.append(f"SRK's density AAD is {aad:.3f} %, BELOW the "
                        f"{AAD_MIN} % floor.  On this case that is not good "
                        "news: it declares that nothing is fitted, so a sudden "
                        "improvement means something was tuned.  Establish "
                        "what, then re-cut the band")
        if worst > WORST_MAX:
            fail.append(f"the worst single point is off by {worst:.2f} %, "
                        f"above the {WORST_MAX} % band")
    else:
        fail.append("not one point could be recomputed -- this gate proved "
                    "nothing about the model")

    #  (c) still untuned.
    if "kij = 0" not in out:
        fail.append("the run no longer announces kij = 0 -- either a curated "
                    "N2-H2 pair is now in play (in which case this case is "
                    "measuring a FITTED model and its header is false), or "
                    "the announcement was lost")

    #  (d) the citation.
    ev = EVID.read_text()
    if "10.1021/acs.jced.7b00694" not in ev:
        fail.append("the evidence file no longer declares its DOI -- sixteen "
                    "measured values with the source stripped are an "
                    "unattributed table")
    if "0.19" not in ev or "0.31" not in ev:
        fail.append("the evidence file no longer states the composition gap "
                    "(no measured point between x(N2) 0.19 and 0.31) -- the "
                    "case would then claim more reach than it has")

    if fail:
        print("check_srk_h2n2_aad: FAILED")
        for f in fail:
            print(f"  - {f}")
        return 1

    aad = sum(errs) / len(errs)
    print(f"check_srk_h2n2_aad: OK -- SRK with kij = 0 reproduces "
          f"{len(errs)} published (T, P, x, rho) points on the nitrogen + "
          f"hydrogen binary to AAD {aad:.3f} % in density (worst "
          f"{max(errs):.2f} %), RECOMPUTED here from the run's own v_molar, "
          "the case's own cited evidence file and the components' own declared "
          "molar masses -- no agreement statistic is transcribed anywhere in "
          "the tree.  The run still announces kij = 0, so the prediction is "
          "untuned, and the evidence file still carries its DOI and its "
          "composition caveat.  SCOPE: density only, one binary, "
          "240-350 K and 50-200 bar at x(N2) 0.50-0.95.  NOT CHECKED: whether "
          "that agreement is ADEQUATE for a synthesis loop (an engineering "
          "judgement), any other property (the loop's condenser turns on the "
          "ammonia dew point, which no case here tests), and the loop's own "
          "composition -- the dataset holds no point between x(N2) 0.19 and "
          "0.31, so this says nothing about a stoichiometric synthesis gas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
