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

  (e) NEITHER KNOB IN THIS TREE FIXES IT.  The case claims that the residual
      is the cubic's own volumetric error rather than a missing parameter,
      and that claim is CHECKED, not asserted, on throwaway copies of the
      case (the shipped one is never touched):

        * substituting hydrogen's QUANTUM-CORRECTED effective critical
          constants -- the standard remedy for H2 in a cubic -- must make the
          density WORSE, not better;
        * no kij across a wide bracket may bring the AAD below a floor that
          is well above what a real fix would reach.

      Both were MEASURED on 2026-09-09 and both are negative results: the
      effective constants took the AAD from 1.045 % to 1.564 %, and the best
      kij in [-0.10, +0.20] reached 1.003 %.  The reason is visible in the
      per-composition means: a kij moves the equimolar mixture and barely
      touches x(N2) = 0.95, where the fluid is nearly pure nitrogen and the
      error is largest.  An error that a MIXTURE parameter cannot reach is
      not a mixture problem.

      This arm exists because the negative result is the pedagogically
      valuable half, and it is the half that rots: someone adds a curated
      N2-H2 pair or a better H2 record, the case's prose still says "no
      parameter fixes this", and nothing notices.  If either sabotage stops
      failing, the tree has gained something and the case must be rewritten
      to say what.

  (f) THE TUTORIAL'S OWN TABLE IS TRUE.  The README prints all three AAD
      figures, because a student needs to SEE the negative result and not be
      told it happened.  That makes them published numbers, and published
      implies pinned: this arm reads them back out of the README and requires
      each to match what it just measured.  A table nobody re-measures is the
      transcription this gate exists to avoid, moved one file along.

      A TRAP PAID FOR HERE, and it is about sabotage rather than about the
      engine.  Arm (e)'s first sabotage -- making the probe use the catalogue
      constants, so the two AADs coincide -- appeared to SURVIVE.  It had not:
      the `sed` that was meant to apply it never matched, because the
      substitution string carries backslash escapes.  The gate was correct and
      the evidence was not.  A SABOTAGE THAT DOES NOT LAND PROVES NOTHING, and
      the way to know is to read the file back, never to trust the edit.

  (d) THE CITATION IS PRESENT.  The evidence file declares its DOI, and the
      case header carries the composition caveat.  Sixteen values with their
      primary source is a citation; the same sixteen with the source stripped
      is an unattributed table, which philosophy 4 rules worse than a gap.

NOT CHECKED, and said plainly:

  * WHETHER SRK IS ADEQUATE.  This gate measures the disagreement; whether
    1 % on density is good enough for a synthesis loop is an engineering
    judgement no gate can take.
  * WHETHER VOLUME TRANSLATION WOULD FIX IT.  Arm (e) shows that the two
    knobs this tree HAS do not.  A Peneloux-type volume shift, or a reference
    Helmholtz equation, is the lever the literature uses and neither exists
    here -- so the case names that as the remedy and nothing verifies the
    claim, because there is nothing to run it against.
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
import shutil
import subprocess
import tempfile
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

    #  (e) neither knob fixes it -- on THROWAWAY COPIES, never the shipped case.
    #  KIJ_FLOOR is set below the 1.003 % the best kij reached and well above
    #  where a real fix lands, so it fails if a kij ever becomes the answer.
    KIJ_FLOOR = 0.95
    eff = best = None
    with tempfile.TemporaryDirectory() as tmp:
        def aad_of(case_dir):
            q = subprocess.run([str(PROPS), str(case_dir)], capture_output=True,
                               text=True, timeout=600)
            b = (q.stdout + q.stderr).split("<<<Choupo:result-end>>>")[0]
            if "\n{\n" not in b:
                return None
            dd = {o["name"]: o.get("diagnostics", {})
                  for o in json.loads(b[b.rindex("\n{\n"):])["operationResults"]}
            acc = []
            for T, P, x, rho in rows:
                nm = f"p_{T:.0f}K_{P / 100.0:.0f}bar_xN2_{x:.5f}".replace(".", "p")
                v = dd.get(nm, {}).get("v_molar")
                if not v:
                    return None
                acc.append(abs((x * mw["N2"] + (1.0 - x) * mw["H2"]) / v - rho)
                           / rho * 100.0)
            return sum(acc) / len(acc)

        base = Path(tmp) / "eff"
        shutil.copytree(CASE, base)
        (base / "constant/components").mkdir(parents=True, exist_ok=True)
        #  Quantum-corrected effective constants for hydrogen (Gunn, Chueh &
        #  Prausnitz's correction, in the fixed form process simulators use).
        #  A case-local record OVERLAYS the standard entry field by field.
        (base / "constant/components/H2.dat").write_text(
            "name H2;\nformula H2;\nMW 2.016;\n"
            "Tc 41.67;\nPc 20.77;\nomega 0.0;\n")
        eff = aad_of(base)
        if eff is None:
            fail.append("the effective-constants probe did not run, so this "
                        "gate cannot check its own negative result")
        elif eff <= aad:
            fail.append(
                f"substituting hydrogen's quantum-corrected effective critical "
                f"constants gives AAD {eff:.3f} %, no worse than the "
                f"catalogue record's {aad:.3f} % -- when this slice was built "
                "the substitution made it WORSE (1.564 % against 1.045 %), "
                "which is why the case says the residual is not a "
                "pure-component problem.  Something changed; re-measure and "
                "rewrite the case rather than widening this arm")

        floor_case = Path(tmp) / "kij"
        shutil.copytree(CASE, floor_case)
        (floor_case / "constant/parameters/SRK").mkdir(parents=True, exist_ok=True)
        tp = floor_case / "constant/thermoPhysPropDict"
        tp.write_text(tp.read_text().replace(
            "        mixingRule vanDerWaalsOneFluid;",
            "        mixingRule vanDerWaalsOneFluid;\n"
            "        binaryInteractions\n        {\n"
            "            N2-H2 { source "
            "\"constant/parameters/SRK/N2-H2.dat\"; }\n        }"))
        rec = floor_case / "constant/parameters/SRK/N2-H2.dat"
        for k in (-0.10, 0.0, 0.05, 0.10, 0.20):
            rec.write_text("recordType eosBinaryInteraction;\nschemaVersion 1;\n"
                           f"i N2;\nj H2;\nkij {k};\neos SRK;\n")
            got = aad_of(floor_case)
            if got is None:
                fail.append(f"the kij probe refused at kij = {k}, so this "
                            "gate cannot check that no kij is the answer")
                best = None
                break
            best = got if best is None else min(best, got)
        if best is not None and best < KIJ_FLOOR:
            fail.append(
                f"a binary interaction parameter now reaches AAD {best:.3f} %, "
                f"below the {KIJ_FLOOR} % floor -- when this slice was built "
                "the best kij in that bracket reached only 1.003 % against "
                "1.045 % at kij = 0, because a MIXTURE parameter cannot reach "
                "the x(N2) = 0.95 points where the error is largest.  If a kij "
                "is now the answer, the case's central claim is false and it "
                "must be rewritten")

    #  (f) the README's own table, read back and re-measured.
    readme = (CASE / "README.md").read_text()
    for label, got, pat in (
        ("the catalogue records at kij = 0", aad,
         r"catalogue records.*?\*\*([0-9.]+) %\*\*"),
        ("the effective hydrogen constants", eff,
         r"effective H2 constants.*?\|\s*([0-9.]+) %"),
        ("the best kij", best,
         r"best kij in.*?\|\s*([0-9.]+) %"),
    ):
        if got is None:
            continue
        m = re.search(pat, readme.replace("\u2082", "2"), re.S)
        if not m:
            fail.append(f"the README no longer states the AAD for {label} in "
                        "the shape this arm reads -- either the table went, or "
                        "it was reformatted; a number a student reads must be "
                        "re-measurable, so restore it or drop the claim")
        elif abs(float(m.group(1)) - got) > 0.02:
            fail.append(f"the README says {float(m.group(1)):.3f} % for {label} "
                        f"and this run measures {got:.3f} % -- the tutorial is "
                        "teaching a number the engine no longer produces")

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
          "composition caveat.  The case's NEGATIVE result is re-measured too, "
          "on throwaway copies: hydrogen's quantum-corrected effective critical "
          f"constants make it WORSE ({eff:.3f} %), and the best kij in "
          f"[-0.10, +0.20] reaches only {best:.3f} % -- so neither knob this "
          "tree has is the answer, and the README's own table of all three is "
          "read back and required to match.  SCOPE: density only, one binary, "
          "240-350 K and 50-200 bar at x(N2) 0.50-0.95.  NOT CHECKED: whether "
          "that agreement is ADEQUATE for a synthesis loop (an engineering "
          "judgement), any other property (the loop's condenser turns on the "
          "ammonia dew point, which no case here tests), and the loop's own "
          "composition -- the dataset holds no point between x(N2) 0.19 and "
          "0.31, so this says nothing about a stoichiometric synthesis gas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
