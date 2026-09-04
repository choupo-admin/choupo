#!/usr/bin/env python3
"""Gate: no steady case ships a plant that does not conserve mass.

    bin/curate/check_mass_closure.py

WHY THIS EXISTS.  Vitor opened the flagship sugar plant on the live site on
2026-09-04 and the mass-balance plot showed 22032 kg/h in against 24980 out.
His question was the right one: *a case with a balance violation has to fail,
doesn't it?*  It did not.  It could not: nothing in bin/runTests looks at
closure at all, and a golden pins whatever the run PRINTS -- a stable wrong
answer passes by construction.

The defect underneath was a spray dryer whose residual-moisture model asked
the powder to hold 3633 kg/h of water from a feed carrying 685, creating 2948
kg/h out of nothing at exit 0.  It had been shipping.  This gate is the
instrument that makes that class of defect impossible to ship again: it does
not care WHY a plant fails to close, only that one does.

WHAT THIS CHECKS.  For every steady case, the GLOBAL mass closure the engine's
own massBalance report computes must be within BAND of 100 %.  The number is
read from the engine, never recomputed here -- the balance has one home
(CLAUDE.md: engine-owned, the GUI only draws) and a gate that re-derived it
would be a second one, free to drift from the report a student reads.

WHY A BAND AND NOT MACHINE ZERO.  Real corpus cases carry recycle tears that
converge to a declared tolerance, so a plant closes to a residual and not to
zero: FERMENTATION's Mixer/Fermentor pair sits at 99.9997 / 100.0002 %.  The
band is the loosest thing that is still a physical statement, and the defect
this was built for was 113 % -- three orders of magnitude outside it.

WHAT THIS DOES NOT CHECK, said plainly:
  * ENERGY closure.  A different report, a different band, and the corpus
    carries known unattributed first-law residuals that are pinned elsewhere.
  * PER-UNIT closure.  `massBalance_byUnit.csv` localises a violation to one
    unit and is what turned "the plant leaks" into "the dryer leaks" in under
    a minute -- but a plant can close globally with two units cancelling, and
    this arm would not see it.  Named as the next slice rather than implied.
  * A CASE THE REPORT NEVER RUNS FOR.  Under an outerDict driver the balance
    reports do not run at all, which is precisely how the sugar plant carried
    this for as long as it did.  Those cases are LISTED by this gate, never
    silently skipped: an absence nobody counts is not a finding.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  Per cent, either side of 100.  See "WHY A BAND" above.
BAND = 0.5

_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")

CLOSURE = re.compile(r"global closure\s+([0-9.]+)\s*%")


APP = re.compile(r"^\s*application\s+(\w+)\s*;", re.M)
DECLARES_MB = re.compile(r"\bmassBalance\b")


def steady_cases():
    """Cases whose controlDict DECLARES `application choupoSolve`.

    Read from the FIELD, never by grepping the file: the first version of this
    discovery searched the whole text for the word `choupoSolve` and swept in a
    choupoBatch combustion case and a choupoCtrl brine case, because each
    mentions the steady binary in a COMMENT.  A gate that measures cases it was
    never meant to measure reports coverage it does not have."""
    for cd in sorted(ROOT.glob("tutorials/**/system/controlDict")):
        try:
            txt = cd.read_text(errors="ignore")
        except OSError:
            continue
        m = APP.search(txt)
        if m and m.group(1) == "choupoSolve":
            yield cd.parent.parent, bool(DECLARES_MB.search(txt))


RAN = re.compile(r"\[report\] massBalance ->")
#  The engine's own announcement that a declared report chain did not run.
ANNOUNCED = re.compile(r"\[reports\] this case declares reports \{[^}]*\}"
                       r" and an outer driver")


def output(case: Path):
    """-> (text, ranOk).  `ranOk` is False when a LIVE run exits non-zero;
    a cached text carries no exit code, and the suite that filled the cache
    has already accounted for exit codes itself."""
    if _CACHE:
        rel = case.resolve().relative_to(ROOT).as_posix().replace("/", "__")
        f = Path(_CACHE) / (rel + ".out")
        try:
            return f.read_text(errors="replace"), True
        except OSError:
            pass
    p = subprocess.run([str(ROOT / "choupoSolve"), str(case)],
                       capture_output=True, text=True, timeout=900)
    return p.stdout + p.stderr, p.returncode == 0


def main() -> int:
    #  FOUR STATES, and the first version of this gate collapsed them into two
    #  and accused three honest cases.  Each is a different fact about the run:
    #    unrun       the case exits non-zero (a userOps tutorial needs a
    #                user-compiled unit type).  Not this gate's business --
    #                the suite already checks exit codes.
    #    checked     the report ran and states a closure -> hold it to the band.
    #    noBoundary  the report ran and states it has NO material boundary (a
    #                closed Rankine cycle has no boundary streams, so there is
    #                no closure to state and its per-unit balances carry the
    #                verification).  A legitimate absence; listed.
    #    notRun      the case DECLARES massBalance and the report never ran ->
    #                FAIL.  This is the real finding: a declared check that
    #                cannot run must not pass, and it is exactly how a 113 %
    #                closure shipped unseen.
    bad, checked, noBoundary, unrun, silent, announced = [], 0, [], [], [], []
    for case, declaresMB in steady_cases():
        rel = case.relative_to(ROOT).as_posix()
        txt, ranOk = output(case)
        if not ranOk:
            unrun.append(rel)
            continue
        m = CLOSURE.search(txt)
        if m is None:
            if RAN.search(txt):
                noBoundary.append(rel)
            elif declaresMB and ANNOUNCED.search(txt):
                #  ANNOUNCED IS NOT SILENT.  The driver said out loud that the
                #  declared chain did not run and that nothing here was
                #  verified by it.  Whether a sweep SHOULD report on its final
                #  point is a design question; being told is the contract.
                announced.append(rel)
            elif declaresMB:
                bad.append(
                    "%s DECLARES `reports { massBalance }` and its run emits "
                    "no massBalance report at all -- the report was silently "
                    "not run.  A declared check that cannot run must not pass: "
                    "either the driver runs the reports, or the case must stop "
                    "declaring one it does not get." % rel)
            else:
                silent.append(rel)
            continue
        checked += 1
        pct = float(m.group(1))
        if abs(pct - 100.0) > BAND:
            bad.append(
                "%s: global mass closure %.4f %% -- the plant does not "
                "conserve mass.  Run it and read "
                "postProcessing/massBalance/0/massBalance_byUnit.csv (or "
                "reports/massBalance/): it names the unit."
                % (rel, pct))

    if not checked:
        print("check_mass_closure: FAILED\n"
              "  no case reported a closure at all.  A gate with no subject "
              "reports PASS forever -- fix the discovery, do not retire the "
              "check.")
        return 1
    if bad:
        print("check_mass_closure: FAILED")
        for b in bad:
            print("  " + b)
        return 1

    print("check_mass_closure: OK -- %d steady case(s) close their plant-"
          "boundary mass balance within %.1f %% of 100, read from the engine's "
          "own massBalance report and never recomputed here.  %d ran the report "
          "and state they have NO MATERIAL BOUNDARY (a closed cycle: their "
          "per-unit balances carry the verification), %d are told ALOUD by the "
          "engine that their declared chain did not run under an outer driver "
          "(announced, so not silent), %d exit non-zero and "
          "belong to the suite's exit-code check rather than this one, and %d "
          "neither declare the report nor emit one.  Every one of those is "
          "LISTED rather than skipped, because an absence nobody counts is not "
          "a finding -- and a case that DECLARES the report and never gets it "
          "FAILS by name, which is how a 113 %% closure shipped unseen until "
          "2026-09-04.  NOT CHECKED: energy closure, and PER-UNIT closure (two "
          "units can cancel and this arm would not see it)."
          % (checked, BAND, len(noBoundary), len(announced), len(unrun),
             len(silent)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
