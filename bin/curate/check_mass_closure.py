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

THE SECOND SCOPE (2026-09-08).  A case may DECLARE a utility circuit
(`utilities ( { name; service; supply; return; } )` in its flowsheetDict), and
the massBalance report then publishes TWO closures: the TOTAL one, over every
boundary stream, and the PROCESS one, with the declared circuits left out.
This gate holds the PROCESS closure where one is published and the TOTAL one
otherwise, and its claim line says which it used and over how many cases.
Reading the total on a plant whose cooling water is 99.2 % of the mass in the
balance is reading a number that passes by DILUTION: ammonia02's syngas could
lose 1 % of its mass and move that total by 0.008 %.

THE REFUSAL ARM.  The shipped witness is VALID, so a guard whose only case
satisfies it is a guard nothing tests.  This gate BUILDS invalid declarations
in a temporary copy of a corpus case -- supply == return, a service that is
not in the utility catalogue, a supply that is not a boundary inlet, and a
pair that does not conserve -- and requires each to refuse AND to name why.
It never patches a source file and never rebuilds the engine (the 2026-08-18
tree-poisoning rule: only `check_gate_selftest` may take that shape).

SABOTAGES PERFORMED (2026-09-08), each by hand against the rebuilt engine:
  S1  the `supply == return` refusal removed from `utilityCircuits::read`
      -> FAILED: "probe supply-equals-return refused, but its message never
      says 'SAME stream'".  It landed through the MESSAGE and not the exit
      code, because with that guard gone a LATER guard catches the same probe
      (`feed` is consumed, so it is not a boundary outlet) -- which is exactly
      why every probe asserts the phrase and not merely a non-zero exit.
  S2  the service lookup's `UtilityCatalogue::has` refusal removed
      -> FAILED: "probe service-not-in-catalogue was ACCEPTED (exit 0)".  This
      probe spoils ONE field of a case that ships a VALID circuit, so removing
      its guard leaves nothing else to catch it: the strongest form a probe
      takes, and the reason the arm carries two base cases.
  S3  the "supply is PRODUCED inside the plant" refusal removed
      -> FAILED on the phrase, same shape as S1.
  S4  `kConservationRelTol` widened from 1e-6 to 1.0
      -> FAILED: "probe pair-does-not-conserve was ACCEPTED (exit 0)".
  S5  the massBalance report subtracts the declared SUPPLY from the process
      scope but not the RETURN (a plausible one-line bug)
      -> FAILED: "process mass closure 12851.8820 %".  This is the arm that
      JUDGES rather than counts, and it is the one the whole gate exists for.
  S6  this gate reverted to reading the TOTAL closure only (`mp = None`)
      -> it PASSED, and that is the finding: the process-scope count in its
      own claim fell from 1 to 0 while a case was publishing one.  A gate can
      go on passing while its CLAIM goes false, which is why the claim names
      the scope it used and counts the two separately.  Recorded as a claim
      defect, not an engine one.
  S7  the witness's `utilities` block deleted from ammonia02 (intended as a
      NEGATIVE: nothing declared is not a violation)
      -> FAILED, and correctly: "probe service-not-in-catalogue could not
      spoil ammonia02_full_plant: the text 'service  coolingWater;' is not in
      its flowsheetDict any more".  A SPOILER THAT MATCHES NOTHING PROVES
      NOTHING -- without that guard the probe would have run an unmodified
      case and filed its clean exit as evidence.  A side effect worth knowing:
      the witness declaration cannot now be deleted in silence.

WHAT THIS DOES NOT CHECK, said plainly:
  * ENERGY closure.  A different report, a different band, and the corpus
    carries known unattributed first-law residuals that are pinned elsewhere.
  * PER-UNIT closure.  `massBalance_byUnit.csv` localises a violation to one
    unit and is what turned "the plant leaks" into "the dryer leaks" in under
    a minute -- but a plant can close globally with two units cancelling, and
    this arm would not see it.  Named as the next slice rather than implied.
  * WHETHER A DECLARED CIRCUIT *SHOULD* HAVE BEEN DECLARED.  The engine
    refuses a declaration the topology or conservation contradicts; nothing
    here (or anywhere) can tell that a plant which declares no circuit ought
    to.  A case that dilutes its own balance with an undeclared utility still
    passes, exactly as before.
  * A CASE THE REPORT NEVER RUNS FOR.  Under an outerDict driver the balance
    reports do not run at all, which is precisely how the sugar plant carried
    this for as long as it did.  Those cases are LISTED by this gate, never
    silently skipped: an absence nobody counts is not a finding.
"""
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from suite_cache import SCOPED, scope_sentence, stdout_of   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

#  Per cent, either side of 100.  See "WHY A BAND" above.
BAND = 0.5

CLOSURE = re.compile(r"global closure\s+([0-9.]+)\s*%")
#  THE PROCESS SCOPE, published only by a case that DECLARES a utility circuit
#  (the `[utilities]` announcement the massBalance report writes).  Where it
#  exists it is the number this gate holds: the total scope on such a plant is
#  diluted by the circuit's own mass and says little about the process.
PROCESS = re.compile(r"process closure\s+([0-9.]+)\s*%")


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


OUT_OF_SCOPE = object()


def output(case: Path):
    """-> (text, ranOk).  `ranOk` is False when a LIVE run exits non-zero;
    a cached text carries no exit code, and the suite that filled the cache
    has already accounted for exit codes itself.

    Under CHOUPO_SUITE_SCOPE (bin/runTests --fast) the cache is the SCOPE:
    a case it does not hold was not run by the caller, and running it live
    behind the caller's back would cost 222 s -- measured -- at a tier whose
    whole budget is under 20 s.  It is returned OUT_OF_SCOPE, counted, and
    named in the claim; it is never silently dropped."""
    txt = stdout_of(case)
    if txt is not None:
        return txt, True
    if SCOPED:
        return OUT_OF_SCOPE, False
    p = subprocess.run([str(ROOT / "choupoSolve"), str(case)],
                       capture_output=True, text=True, timeout=900)
    return p.stdout + p.stderr, p.returncode == 0


#  ---- The refusal arm ---------------------------------------------------
#
#  A DECLARATION THAT IS FALSE MUST REFUSE, and the shipped witness is valid,
#  so nothing in the corpus exercises the refusals.  These probes build the
#  invalid declarations in a TEMPORARY COPY of a corpus case: no source file
#  is patched and the engine is never rebuilt (2026-08-18).
#
#  TWO BASE CASES, and the choice is load-bearing.
#
#  `flash01_benzene_toluene` is the smallest case in the corpus with the shape
#  three of the probes need -- a boundary INLET and two boundary OUTLETS
#  meeting at ONE unit.  That shape is also what makes the conservation probe
#  possible at all: `supply feed; return vapor;` is a pair at one unit that
#  genuinely does not conserve, because the liquid leaves too.  What it CANNOT
#  offer is a VALID circuit, so a probe built on it can only be distinguished
#  by its message: strip a guard and some OTHER guard refuses instead.
#
#  `ammonia02_full_plant` ships a VALID declaration, so a probe that spoils
#  exactly one field of it can be accepted at exit 0 when its guard is removed
#  -- which is the strongest form a probe takes.  The service word is spoiled
#  that way.
PROBE_FLASH = ROOT / "tutorials/steady/flash/flash01_benzene_toluene"
PROBE_PLANT = ROOT / "tutorials/plant/ammonia02_full_plant"

#  (label, base case, how to spoil the flowsheetDict, the phrase the refusal
#   must contain).  `append` adds a block; `replace` spoils one field of the
#   case's own valid block.
PROBES = [
    ("supply-equals-return", PROBE_FLASH,
     ("append", "{ name P1; service coolingWater; supply feed; return feed; }"),
     "SAME stream"),
    ("service-not-in-catalogue", PROBE_PLANT,
     ("replace", "service  coolingWater;", "service  coolingWaterXX;"),
     "unknown utility service"),
    ("supply-is-not-a-boundary-inlet", PROBE_FLASH,
     ("append", "{ name P1; service coolingWater; supply vapor; return liquid; }"),
     "not a boundary inlet"),
    ("pair-does-not-conserve", PROBE_FLASH,
     ("append", "{ name P1; service coolingWater; supply feed; return vapor; }"),
     "does not conserve"),
]


def refusal_arm():
    """Each invalid declaration must refuse AND name why.  Returns findings."""
    import shutil
    import tempfile
    out = []
    for base in (PROBE_FLASH, PROBE_PLANT):
        if not base.is_dir():
            return ["the refusal arm's base case %s is gone -- a check that "
                    "cannot run must not pass" % base.name]
    with tempfile.TemporaryDirectory(prefix="choupo-utilcirc-") as tmp:
        for label, base, (how, *args), phrase in PROBES:
            case = Path(tmp) / label
            shutil.copytree(base, case)
            fd = case / "system" / "flowsheetDict"
            txt = fd.read_text()
            if how == "append":
                txt += "\n\nutilities\n(\n    " + args[0] + "\n);\n"
            else:
                old, new = args
                if old not in txt:
                    #  A SPOILER THAT MATCHES NOTHING PROVES NOTHING -- the
                    #  probe would then run the case UNMODIFIED and report a
                    #  clean refusal-less pass as evidence.  Say so instead.
                    out.append("probe %s could not spoil %s: the text %r is "
                               "not in its flowsheetDict any more"
                               % (label, base.name, old))
                    continue
                txt = txt.replace(old, new, 1)
            fd.write_text(txt)
            p = subprocess.run([str(ROOT / "choupoSolve"), str(case)],
                               capture_output=True, text=True, timeout=300)
            body = p.stdout + p.stderr
            if p.returncode == 0:
                out.append("probe %s was ACCEPTED (exit 0) -- a false utility "
                           "declaration must refuse, not be honoured" % label)
            elif phrase not in body:
                #  REFUSING IS NOT ENOUGH.  A refusal that does not name what
                #  is wrong sends the author back to the manual; and an exit
                #  code alone cannot tell this probe's refusal from an
                #  unrelated one, or from a DIFFERENT guard catching the case
                #  after the one under test was removed.
                out.append("probe %s refused, but its message never says "
                           "'%s' -- the refusal must name why" % (label, phrase))
    return out


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
    outOfScope = []
    processScope = 0        # cases whose closure was read on the PROCESS scope
    for case, declaresMB in steady_cases():
        rel = case.relative_to(ROOT).as_posix()
        txt, ranOk = output(case)
        if txt is OUT_OF_SCOPE:
            outOfScope.append(rel)
            continue
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
        #  THE PROCESS SCOPE WINS WHERE ONE IS PUBLISHED.  A plant that
        #  declares a utility circuit has two closures, and the total one is
        #  diluted by the circuit's own mass -- holding that would be holding
        #  a number that passes whatever the process does.
        mp = PROCESS.search(txt)
        scope = "process" if mp else "total"
        if mp:
            processScope += 1
        pct = float((mp or m).group(1))
        if abs(pct - 100.0) > BAND:
            bad.append(
                "%s: %s mass closure %.4f %% -- the plant does not "
                "conserve mass.  Run it and read "
                "postProcessing/massBalance/0/massBalance_byUnit.csv (or "
                "reports/massBalance/): it names the unit."
                % (rel, scope, pct))

    if not checked:
        print("check_mass_closure: FAILED\n"
              + ("  no case IN SCOPE reported a closure at all.  The scope is "
                 "the caller's own case pass, so the fix is the fast set: it "
                 "must contain at least one steady case with a material "
                 "boundary, or this tier checks no conservation at all.\n"
                 if SCOPED else
                 "  no case reported a closure at all.  A gate with no "
                 "subject reports PASS forever -- fix the discovery, do not "
                 "retire the check.\n"))
        return 1
    bad += refusal_arm()

    if bad:
        print("check_mass_closure: FAILED")
        for b in bad:
            print("  " + b)
        return 1

    print("check_mass_closure: OK -- %d steady case(s) close their plant-"
          "boundary mass balance within %.1f %% of 100, read from the engine's "
          "own massBalance report and never recomputed here; of those, %d "
          "publish a PROCESS scope (they DECLARE a utility circuit, and the "
          "process closure is the number held -- the total one is diluted by "
          "the circuit's own mass) and the rest are held on their total "
          "closure, which for them IS the whole balance.  %d invalid "
          "declarations were built and every one refused BY NAME (supply == "
          "return, a service outside the catalogue, a supply that is not a "
          "boundary inlet, a pair that does not conserve).  %d ran the report "
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
          "units can cancel and this arm would not see it).%s"
          % (checked, BAND, processScope, len(PROBES), len(noBoundary),
             len(announced), len(unrun), len(silent),
             scope_sentence(checked + len(noBoundary) + len(announced)
                            + len(unrun) + len(silent), len(outOfScope))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
