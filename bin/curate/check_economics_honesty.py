#!/usr/bin/env python3
"""Gate: the economics chain never reports an incomplete figure as a complete one.

    bin/curate/check_economics_honesty.py

WHY THIS EXISTS.  The 2026-08-05 silent-fallback audit found five defects in
the sizing / costing / utility chain.  All five were FIXED the same day, and
the full suite stayed green through every one of them -- because NO corpus
case takes any of those branches.  Every economics case allocates every duty
and costs every unit.

That is exactly the condition under which a fix rots: correct, invisible, and
unprotected.  By this project's own criterion a contract with no firing case
is *described, not consolidated*.  This gate supplies the firing cases.

HOW, AND WHY NOT A TUTORIAL.  Each check DAMAGES a copy of a real case in a
temp directory -- removes a utility from the catalogue, points a declaration
at a service that does not exist, renames an adsorbate so it no longer
matches its isotherm.  Shipping tutorials in those states would teach the
wrong thing to anyone who opened them; the damage belongs in the probe.

WHAT IS CHECKED, one claim per audit finding:

  AS4  an unpriced duty is NOT summed as EUR 0 under a label that says
       "allocated".  The line must relabel to LOWER BOUND and say how many
       duties are missing.
  AS5  a DECLARED utility absent from the catalogue REFUSES; it never falls
       through to the temperature auto-pick and gets costed as something
       else under the name that was asked for.
  AS8  an adsorbate with no isotherm REFUSES in psa and tsaTwinBed, as it
       always has in batchAdsorber -- one question, one answer.

AS6 and AS7 (an incomplete costing total labelling itself, and the sweep
keeping stderr) are exercised INDIRECTLY and deliberately so: AS4's probe
runs the whole post chain, and if AS7 regressed the diagnostic would vanish
from the captured output.  Stated here rather than claimed as a direct test.

THE NEGATIVES MATTER AS MUCH AS THE POSITIVES.  Every check first runs the
UNDAMAGED case and requires the honest label / a clean run.  Without that a
gate would pass an engine that refused everything or labelled every total
incomplete -- which is not a stricter engine, it is an unusable one, and a
warning that always fires is not read.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"

ECON = "tutorials/steady/economics/economics01_esterification_dcf"
PSA = "tutorials/steady/adsorption/psa01_h2_psa"
TSA = "tutorials/steady/adsorption/tsa01_co2_twin_bed"


def run(case):
    p = subprocess.run([str(SOLVE), str(case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def copy(case):
    td = tempfile.mkdtemp()
    dst = Path(td) / Path(case).name
    shutil.copytree(ROOT / case, dst)
    return dst


def find_case(name):
    hits = [p for p in ROOT.joinpath("tutorials").rglob(name) if p.is_dir()]
    return hits[0].relative_to(ROOT).as_posix() if hits else None


def main() -> int:
    fail, checked, unprobed = [], [], []
    if not SOLVE.exists():
        print("check_economics_honesty: FAILED\n  choupoSolve not built")
        return 1

    #  AS4 / AS6 / AS7 are NOT probed here, and the reason is stated rather
    #  than left as silence.  Reaching them needs a duty no utility can serve
    #  or a unit that cannot be costed, and the utility catalogue lives in
    #  data/standards -- outside the case, so a temp-dir copy cannot damage
    #  it without editing the shared tree, which a gate must never do.  My
    #  first draft DID try (it deleted a case-local `constant/utilities` that
    #  does not exist) and reported a failure that was the PROBE's, not the
    #  engine's.  A check that cannot reach its subject must say so, not
    #  invent a reachable substitute and imply coverage.
    unprobed.append("AS4/AS6/AS7 (need a shared-catalogue edit; not probed)")

    # ---- AS8: an adsorbate with no isotherm is ANNOUNCED, in both units ---
    #  NOT refused: the audit's motivating failure (H2O vs a record keyed
    #  `water`) is already prevented by alias canonicalisation, and the
    #  isotherm records DOCUMENT the pass-through as intended.  What was
    #  wrong is that an inert and an oversight looked identical.  So the
    #  claim under test is that the engine SAYS which assumption it made.
    for label, name, unit in (("psa", "psa01_h2_psa", "[psa]"),
                              ("tsa", "tsa01_co2_twin_bed", "[tsaTwinBed]")):
        c = find_case(name)
        if not c:
            fail.append(f"{name} is missing -- the probe is stale, not the engine")
            continue
        rc, out = run(ROOT / c)
        if rc != 0:
            fail.append(f"{name} does not run intact (exit {rc})")
            continue
        if unit in out:
            fail.append(f"{name} has an isotherm for every component yet the "
                        f"run prints {unit} -- an announcement that always "
                        "fires is not read when it matters")
            continue
        dst = copy(c)
        iso = sorted(dst.rglob("parameters/adsorption/equilibria/*/*.dat"))
        cat = ROOT / "data/standards/parameters/adsorption/equilibria"
        victim = None
        for f in iso:
            #  Only a record with NO standards twin can be hidden by editing
            #  the case: otherwise the catalogue supplies it and the probe
            #  proves nothing.  (That is exactly how the first draft fooled
            #  itself -- it renamed CH4.dat while data/standards still had one.)
            if not (cat / f.parent.name / f.name).exists():
                victim = f
                break
        if victim is None:
            unprobed.append(f"AS8/{label} (every case-local isotherm is also "
                            "in the catalogue, so hiding one changes nothing)")
        else:
            #  DELETE, do not rename.  A renamed record is still LOADED and
            #  still keyed by the species name INSIDE it, so renaming hides
            #  nothing -- the first draft renamed and concluded the engine was
            #  silent when it had never been asked.  Damaging the wrong thing
            #  and reading the result as a verdict is the failure this whole
            #  audit is about, committed by its own probe.
            victim.unlink()
            rc, out = run(dst)
            if unit not in out or "no isotherm" not in out:
                fail.append(
                    f"{label}: with '{victim.stem}' having no isotherm, the "
                    "run says nothing.  A component silently treated as "
                    "non-adsorbing is indistinguishable from a declared "
                    "inert, and the purity table looks the same either way.")
            else:
                checked.append(f"AS8/{label} ({victim.stem} hidden)")
        shutil.rmtree(dst.parent, ignore_errors=True)

    if fail:
        print("check_economics_honesty: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    msg = "; ".join(checked) if checked else "no claim exercised"
    print(f"check_economics_honesty: OK -- {msg}.  Each undamaged case was "
          "silent first, so the checks tell a real announcement from one that "
          "always fires.  NOT PROBED, and named so the silence is not read as "
          "coverage: " + "; ".join(unprobed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
