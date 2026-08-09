#!/usr/bin/env python3
"""NORMALIZED-RESIDUAL CONVERGENCE -- the contract gate (2026-08-09).

Ruling (Vitor, 2026-08-09): `flash17_two_liquids_reactive` reports a
0.0845 kW duty and a 0.0024 kW first-law gap beside it, and neither may be
rounded to zero, compared against an arbitrary hard-coded threshold, or given
a case-specific tolerance.  The project instead adopts an OpenFOAM-style
NORMALIZED RESIDUAL convergence contract, implemented ONCE and used
consistently.  Record: `docs/design/normalized-residual-convergence.md`;
implementation: `src/solver/Convergence.H`.

A dimensional residual is a magnitude, not a verdict.  It becomes a verdict
only when divided by the magnitude of what is being balanced -- and then BOTH
numbers have to survive to the reader, because the normalized one decides and
the raw one is the one a student can interpret.  That is what this gate holds
in place.

WHAT IS CHECKED (five arms).

  A1  THE FIVE NUMBERS ARE REPORTED.  flash17's run prints, for the reactive
      outer Newton: the raw residual at the seed AND at the answer, the
      normalized residual at both, the achieved reduction, and the criterion
      that decided.  Four of the five could each go missing without any run
      failing, which is exactly why they are asserted from the log rather
      than trusted.

  A2  ONE NORMALIZATION, ONE PLACE.  The tree is grepped for a second
      definition of the norm factor.  A second normalization is worse than
      none: two verdicts on the same solve that disagree by a factor nobody
      can see.  The one home is `normalizeResidual` in
      `src/solver/Convergence.H`; any other definition of a `normFactor`
      fails this arm.

  A3  A TOLERANCE THAT CANNOT BE MET IS NOT A SILENT PASS.  The case is run
      with `reactiveEquilibrium { tolerance 1e-30; maxIter 12; }` -- a
      contract no double-precision solve can satisfy.  The run must FAIL,
      naming the criterion (`maxIter reached ... NOT converged`), and it must
      not write a converged answer.  This is the arm that matters: before the
      slice, the per-leg joint check would have waved that run through.

  A4  THE DEFAULTS ARE ANNOUNCED WHEN USED.  A case with no
      `reactiveEquilibrium` block (flash12) must print the defaults it is
      running under, marked DEFAULT.  A default that is never printed is
      indistinguishable from a number nobody chose -- the `reviewStatus`
      lesson of 2026-08-05, one field over.

  A5  THE REDUCTION IS CONSISTENT.  reduction == normFinal / normInitial to
      the printed precision.  A derived number printed beside its own inputs
      is a second home for a fact, and this arm is what keeps it honest.

  A6  AN UNKNOWN CONTROL REFUSES BY NAME.  A declared control the solver does
      not implement is an instruction the author believes is in force;
      dropping it silently turns a numeric contract into a comment.

WHAT IS NOT CLAIMED.  This gate does NOT check that the normalization is the
RIGHT one, that its value is physically meaningful, or that every nonlinear
solver in the tree has adopted it -- only ReactiveVLE's outer Newton is
wired, and the ADR names what is not.  It also does not check the 0.0845 kW
duty itself; that is flash17's golden's job.

SABOTAGE-VERIFIED (2026-08-09), observed evidence recorded here:

  * A3, sabotaged by reverting the acceptance to the pre-slice
    `const bool jointOK = rMax < 1.0e-7;` (dropping `&& conv.converged`) and
    rebuilding: the 1e-30 run then EXITED 0 and wrote a converged answer,
    with the log still printing `criterion  maxIter reached (12) without
    either test -- NOT converged`.  A verdict printed and not acted on.  The
    gate reported:
        check_convergence_residual: FAIL
          - A3: a tolerance of 1e-30 was declared and the run SUCCEEDED
            (exit 0) -- an unmeetable contract must not be a silent pass
          - A3: converged/ was written for a run that did not meet its
            declared contract -- the directory name is a claim
    Both halves of the arm fired, which is the point of having two: the exit
    code and the artefact are separate claims.  With the sabotage reverted the
    arm passes (observed exit 2, criterion line present, no converged/).

  * A1, sabotaged by deleting the `reduction    normFinal/normInitial` line
    from the announce block: the gate reported
        - A1: flash17 does not report 'reduction' (normFinal/normInitial)
    and A5 followed it with 'cannot check the reduction: not reported'.

Exit 1 listing failures."""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
SRC = ROOT / "src"
CASE = ROOT / "tutorials" / "steady" / "flash" / "flash17_two_liquids_reactive"
DEFAULTS_CASE = (ROOT / "tutorials" / "steady" / "flash"
                 / "flash12_nh3_acetic_ethanol_reactive")

failures = []


def fail(msg):
    failures.append(msg)


def fresh(tmp: Path, tag: str, src: Path) -> Path:
    d = tmp / tag
    shutil.copytree(src, d, ignore=shutil.ignore_patterns(
        "converged", "reports", "log.*", "resultJson*"))
    return d


def run(case: Path):
    p = subprocess.run([str(SOLVE), "."], cwd=case, capture_output=True,
                       text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


NUM = r'([-+0-9.eE]+)'


def main() -> int:
    if not SOLVE.exists():
        print("check_convergence_residual: FAIL\n  - choupoSolve is not built")
        return 1

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- the reference run (the case's own declared contract) --------
        base = fresh(tmp, "declared", CASE)
        rc, log = run(base)
        if rc != 0:
            fail(f"the witness does not run (exit {rc}) -- every other arm "
                 "reads its log")
            print("check_convergence_residual: FAIL")
            for f in failures:
                print("  - " + f)
            return 1

        # ---- A1: the five numbers + the criterion ------------------------
        raw = re.search(r'raw\s+\|r\|1\s+initial\s+' + NUM
                        + r'\s+->\s+final\s+' + NUM, log)
        nrm = re.search(r'normalized\s+initial\s+' + NUM
                        + r'\s+->\s+final\s+' + NUM, log)
        red = re.search(r'reduction\s+normFinal/normInitial\s*=\s*' + NUM, log)
        crit = re.search(r'criterion\s+(.+)', log)
        verdict = re.search(r'verdict\s+(CONVERGED|NOT converged)', log)

        if not raw:
            fail("A1: flash17 does not report the RAW residual (initial and "
                 "final) -- the dimensional number is the one a reader can "
                 "interpret and it must survive beside the normalized one")
        if not nrm:
            fail("A1: flash17 does not report the NORMALIZED residual "
                 "(initial and final) -- that is the number the verdict is "
                 "taken on")
        if not red:
            fail("A1: flash17 does not report 'reduction' "
                 "(normFinal/normInitial)")
        if not crit:
            fail("A1: flash17 does not report the CRITERION -- 'converged' "
                 "without saying which test passed is a claim with no content")
        if not verdict:
            fail("A1: flash17 does not report a verdict line")

        # ---- A5: the reduction is consistent -----------------------------
        if nrm and red:
            n0, n1 = float(nrm.group(1)), float(nrm.group(2))
            r_reported = float(red.group(1))
            r_expected = n1 / n0 if n0 > 0 else 0.0
            if abs(r_reported - r_expected) > 1.0e-3 * max(abs(r_expected),
                                                           1.0e-300):
                fail(f"A5: reduction {r_reported:g} is not normFinal/"
                     f"normInitial ({n1:g}/{n0:g} = {r_expected:g}) -- a "
                     "derived number printed beside its own inputs must agree "
                     "with them")
        else:
            fail("A5: cannot check the reduction: not reported")

        # ---- A1b: the case declares its contract, and the run says so ----
        if not re.search(r'\[convergence\] reactiveEquilibrium: declared '
                         r'controls', log):
            fail("A1: flash17 declares reactiveEquilibrium in "
                 "system/solverDict, but the run does not announce it as "
                 "DECLARED -- a reader cannot tell a chosen tolerance from an "
                 "inherited one")

        # ---- A3: an unmeetable declared tolerance is not a silent pass ---
        hard = fresh(tmp, "unmeetable", CASE)
        (hard / "system" / "solverDict").write_text(
            "reactiveEquilibrium { tolerance 1e-30; relTol 0; maxIter 12; }\n")
        rc3, log3 = run(hard)
        if rc3 == 0:
            fail("A3: a tolerance of 1e-30 was declared and the run SUCCEEDED "
                 "(exit 0) -- an unmeetable contract must not be a silent pass")
        if not re.search(r'criterion\s+maxIter reached \(12\).*NOT converged',
                         log3):
            fail("A3: the failed run does not name its criterion "
                 "('maxIter reached (12) ... NOT converged') -- a refusal that "
                 "does not say which test was not met is not a diagnosis")
        if (hard / "converged").exists():
            fail("A3: converged/ was written for a run that did not meet its "
                 "declared contract -- the directory name is a claim")

        # ---- A6: an unknown control refuses BY NAME ----------------------
        bad = fresh(tmp, "unknownkey", CASE)
        (bad / "system" / "solverDict").write_text(
            "reactiveEquilibrium { tolerance 1e-9; underRelaxation 0.5; }\n")
        rc6, log6 = run(bad)
        if rc6 == 0:
            fail("A6: an unimplemented control ('underRelaxation') was "
                 "accepted -- a declared control that is ignored is a comment")
        if "underRelaxation" not in log6:
            fail("A6: the refusal does not NAME the offending key")

        # ---- A4: the defaults are announced when used --------------------
        dflt = fresh(tmp, "defaults", DEFAULTS_CASE)
        sd = dflt / "system" / "solverDict"
        if sd.exists() and "reactiveEquilibrium" in sd.read_text():
            fail("A4: the defaults witness now declares its own controls -- "
                 "pick another case with no reactiveEquilibrium block")
        rc4, log4 = run(dflt)
        if rc4 != 0:
            fail(f"A4: the defaults witness does not run (exit {rc4})")
        elif not re.search(r'\[convergence\] reactiveEquilibrium: DEFAULT '
                           r'controls .*tolerance', log4):
            fail("A4: a run using the DEFAULT convergence controls does not "
                 "announce them -- a default that is never printed is "
                 "indistinguishable from a number nobody chose")

    # ---- A2: exactly ONE normalization in the tree ------------------------
    home = SRC / "solver" / "Convergence.H"
    if not home.exists():
        fail("A2: src/solver/Convergence.H is gone -- the one home for the "
             "normalization")
    else:
        defs = []
        for p in sorted(SRC.rglob("*.[HC]")) + sorted(SRC.rglob("*.cpp")):
            try:
                t = p.read_text()
            except (OSError, UnicodeDecodeError):
                continue
            #  A DEFINITION, not a mention: an assignment to something called
            #  normFactor / normalizationFactor.  Comments are stripped first
            #  so a doc paragraph quoting the formula is not a second home.
            stripped = re.sub(r'//[^\n]*', '', t)
            stripped = re.sub(r'/\*.*?\*/', '', stripped, flags=re.S)
            for m in re.finditer(r'\bnorm(?:alization)?Factor\s*(?:=|\+=)',
                                 stripped):
                defs.append(p)
                break
        others = [p for p in defs if p.resolve() != home.resolve()]
        for p in others:
            fail(f"A2: {p.relative_to(ROOT)} defines its own normalization "
                 "factor -- two normalizations are two verdicts on one solve, "
                 "differing by a factor nobody can see.  The one home is "
                 "src/solver/Convergence.H")
        if not others and not re.search(
                r'out\.normFactor\s*=\s*spread\s*\+\s*floorValue', home.read_text()):
            fail("A2: the one normalization no longer reads "
                 "`normFactor = spread + floorValue` in Convergence.H -- "
                 "re-point this arm deliberately if the formula changed")

    if failures:
        print("check_convergence_residual: FAIL")
        for f in failures:
            print("  - " + f)
        return 1

    print("check_convergence_residual: OK -- flash17 reports all five "
          "convergence numbers (raw initial/final, normalized initial/final, "
          "reduction) plus the criterion that decided; the reduction agrees "
          "with its own inputs; the normalization is defined in exactly one "
          "place (src/solver/Convergence.H); an unmeetable declared tolerance "
          "fails NAMING its criterion and writes no converged/; an "
          "unimplemented control refuses by name; and a run on the DEFAULT "
          "controls announces them.  NOT claimed: that the normalization is "
          "the right one, or that any solver beyond ReactiveVLE's outer "
          "Newton has adopted it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
