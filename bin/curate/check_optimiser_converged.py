#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the optimiser never reads an objective off a simulation that did
not converge -- an unconverged simulation is a FAILED evaluation on every
path (Nelder-Mead, SQP, the integer enumeration), counted by cause, and a
run whose every evaluation failed refuses by name instead of reporting an
optimum.

    bin/curate/check_optimiser_converged.py

WHY THIS EXISTS (2026-10-31, DEV.md 4c C186 item (4); the record is §6 of
docs/design/a-failed-computation-is-not-a-result.md).  An external review
found that `OptimizationDriver`'s evaluators read the objective and the
constraint responses off the `SimulationResult` without its `converged`
flag: the SQP evaluator set `ok` from finiteness alone, the Nelder-Mead
evaluator from "did the simulator throw".  A UNIT that fails to converge
throws inside the flowsheet (`Flowsheet.cpp`, runUnit) and was already a
failed evaluation; a RECYCLE that stops at `recycleMaxIter` does NOT throw
-- the flowsheet returns 1, `runSimulation` stamps `converged = false` on a
result that still carries the last iterate's streams and KPIs, and the
optimiser priced that iterate as if it were the plant.  Reproduced before
the fix on a copy of cavett01 (the corpus's smallest recycle case) with
`recycleMaxIter 2`: Nelder-Mead reported `status: converged (tolX)` with
"best objective 4.25e+00" read off twelve unconverged recycles, exit 0;
the SQP certified a KKT point on the same; the integer enumeration kept
every value as "converged yes".

WHY A GATE OF ITS OWN, and not arms of check_solver_failures (C178): that
gate compiles a probe against the solver sources and drives the three
time-integrated binaries; this defect is choupoSolve's, in the driver layer
above the solvers, and needs a steady recycle case.  The two share the
rule, not the fixtures.

WHAT THIS GATE CHECKS.

  (a) THE REPRODUCTION, on all three paths.  Copies of cavett01 declaring
      `recycleMaxIter 2` under a Nelder-Mead, an SQP and an integer-
      enumeration outerDict must each exit non-zero, report EVERY
      evaluation as `[evaluation k] FAILED -- the simulation did not
      converge` with the point named, and refuse by name -- Nelder-Mead:
      "every one of the N evaluation(s) FAILED"; SQP: "could not be
      evaluated at the initial point (the simulation did not converge";
      the enumeration: "NO converged-feasible value" with the failed
      evaluations counted across the values -- and print no optimum (no
      `status: converged`, no `Optimum (SQP)` certificate, no `<-- BEST`).
  (b) A PARTLY CONVERGING SEARCH.  The same copy, the objective MINIMISED
      (toward the end where the Newton needs more iterations) under a
      `recycleMaxIter` that admits some trial temperatures and not others
      (measured: see PARTIAL_CAP), must finish with exit 0, count its
      failed evaluations by cause (the count equal to the FAILED lines
      printed), report a finite best objective, and replay a simulation
      that says "Recycle converged" -- the optimum is read off converged
      points only.
  (c) UNCHANGED WHERE NOTHING FAILS.  The same copy with its own
      `recycleMaxIter 300` prints no FAILED line and no ledger line and
      ends `status: converged` -- a converging case keeps its console
      shape (the optim goldens are held by `bin/runTests --scope`).
  (d) SOURCE.  In `src/outerDriver/OptimizationDriver.cpp` every call of
      `simulator_(` is followed, before the result is read, by
      `simulationFailure(` -- the ONE home of "is this simulation an
      answer?", which reads `.converged`; and that function is the only
      site reading the flag.

WHAT THIS GATE DOES NOT COVER, stated so its green line cannot imply it:
the sweep, gridSweep and designSpec drivers (named in the record as
siblings of the same shape, NOT fixed here); whether a corpus optimisation
SHOULD converge at every point (the optim goldens see the answer, this gate
sees the refusal's shape); the choupoCtrl functor behind ctrl16, whose
`converged` is set by the dynamic driver.

SABOTAGE-VERIFIED 2026-10-31, by hand, each restored and the engine rebuilt
before the next; OBSERVED output, abridged:

  S1 -- simulationFailure()'s test made `if (false && !r.converged)` (the
        flag dead, its text still in the source):
          (a) nelderMead on an all-failing recycle exited 0 and printed
              'status:        converged' -- the pre-fix defect, exactly
          (a) sqp on an all-failing recycle exited 0 and printed
              'Optimum (SQP)'
          (a) integer on an all-failing recycle exited 0 and printed
              '<-- BEST'
          (b) recycleMaxIter 8 failed NO evaluation; the ledger line
              absent; the replay at the optimum does not say 'Recycle
              converged'
          Arm (d) did NOT fire: a dead read still spells `.converged`, so
          the source arm sees the text and not the branch.  (d) holds the
          SHAPE (every site goes through the one home); the behaviour is
          arms (a)-(c), which is why all three exist.
  S2 -- the Nelder-Mead evaluator's `cause = simulationFailure(result)`
        removed (the SQP path intact):
          (a) nelderMead on an all-failing recycle exited 2 and printed
              'status:        converged' -- then the REPLAY refused ("the
              replay at the optimum FAILED ... although the evaluation at
              this point was accepted"): the second line of defence
          (a) integer: no evaluation was reported FAILED by name (its
              children are nelderMead)
          (b) the partly converging search exited 2 (the replay refusal)
          (d) a `simulator_(` call at line ~387 is not followed by
              simulationFailure( before its result is read
  S3 -- the all-fail refusal after nelderMead() made `if (false)`:
          (a) nelderMead on an all-failing recycle exited 2 and printed
              'status:        converged' (best objective inf), the replay
              refusing afterwards -- which is why this arm requires the
              optimum NOT to be printed and not the exit code alone
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
SRC = ROOT / "src" / "outerDriver" / "OptimizationDriver.cpp"
CASE = "tutorials/steady/flowsheets/cavett01_recycle_train"

#  The recycle cap at which the Newton on cavett01's two tears converges at
#  SOME of the trial temperatures of the Nelder-Mead search and not at
#  others (measured 2026-10-31 at FL2's T: 6-7 iterations for 318-323 K,
#  8 at 324, 10 at 325, 11 at 326).  P1.F falls with T, so MINIMISING it
#  drives the simplex toward the slow end: with the cap at 8 the vertices
#  at 326 and 325 fail and the search ends at 324 (3 of 8 evaluations
#  failed, best 3.68374 kmol/s).  A measurement, re-taken if arm (b)
#  reports zero or every evaluation failed.
PARTIAL_CAP = 8

OUTER_NM = """type optimization;
method nelderMead;
variables ( { path units[0].operation.T; min 318; max 326; initial 322; } );
objective { kind stream; path P1.F; sense maximise; }
options { maxIter 12; tolX 5e-3; tolF 1e-4; simplexInit 0.1; }
report { file optimization_history.csv; }
"""
OUTER_PARTIAL = OUTER_NM.replace("sense maximise", "sense minimise")
OUTER_SQP = """type optimization;
method sqp;
variables ( { path units[0].operation.T; min 318; max 326; initial 322; } );
objective { kind stream; path P1.F; sense maximise; }
options { maxIter 6; fdStep 1e-3; }
report { file optimization_history.csv; }
"""
OUTER_INT = """type optimization;
method nelderMead;
variables
(
    { path units[0].operation.T; integer true; min 321; max 323; }
    { path units[1].operation.T; min 305; max 312; initial 308.706; }
);
objective { kind stream; path P1.F; sense maximise; }
options { maxIter 8; tolX 5e-3; tolF 1e-4; simplexInit 0.1; }
report { file optimization_history.csv; }
"""

FAILED_LINE = re.compile(r"\[evaluation \d+\] FAILED -- the simulation did "
                         r"not converge")

fails = []


def make_case(tmp: Path, tag: str, outer: str, cap) -> Path:
    dst = tmp / tag
    shutil.copytree(ROOT / CASE, dst, symlinks=True,
                    ignore=shutil.ignore_patterns("expected", "*.csv",
                                                  "converged", "*.log",
                                                  "reports", "latest*"))
    sd = dst / "system" / "solverDict"
    txt = sd.read_text()
    if cap is not None:
        txt, n = re.subn(r"^recycleMaxIter\s+\d+\s*;", f"recycleMaxIter {cap};",
                         txt, flags=re.M)
        if n != 1:
            raise RuntimeError("cavett01's solverDict no longer declares "
                               "recycleMaxIter once -- re-read the fixture")
    sd.write_text(txt)
    (dst / "system" / "outerDict").write_text(outer)
    return dst


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BUILD / "choupoSolve"), "."], cwd=case,
                       capture_output=True, text=True, timeout=900, env=env)
    return p.returncode, p.stdout + p.stderr


def arm_reproduction(tmp: Path):
    specs = [
        ("nelderMead", OUTER_NM,
         r"every one of the \d+ evaluation\(s\) FAILED",
         "status:        converged"),
        ("sqp", OUTER_SQP,
         r"could not be evaluated at the initial point \(the simulation did "
         r"not converge", "Optimum (SQP)"),
        ("integer", OUTER_INT,
         r"failed evaluations across the enumeration: \d+ of \d+ \(did not "
         r"converge \d+.*?NO converged-feasible value", "<-- BEST"),
    ]
    seen = []
    for tag, outer, refusal, optimum in specs:
        case = make_case(tmp, "allfail_" + tag, outer, 2)
        rc, out = run(case)
        nFailed = len(FAILED_LINE.findall(out))
        named = re.search(refusal, out, re.S) is not None
        #  The tail quoted is short: the last lines of a run are the caveat
        #  block, and the evidence here is the status line and the exit.
        if rc == 0 or optimum in out:
            fails.append(f"(a) {tag} on an all-failing recycle exited {rc} "
                         f"and {'printed' if optimum in out else 'did not print'}"
                         f" {optimum!r} -- an optimum read off unconverged "
                         f"simulations:\n{out[-500:]}")
            continue
        if nFailed == 0:
            fails.append(f"(a) {tag}: no evaluation was reported FAILED by "
                         f"name:\n{out[-500:]}")
        if not named:
            fails.append(f"(a) {tag} did not refuse by name: {refusal!r} "
                         f"absent:\n{out[-500:]}")
        m = re.search(r"\[evaluation 1\] FAILED -- .*?[(, ]units\[0\]"
                      r"\.operation\.T = ([0-9.]+)", out)
        if not m:
            fails.append(f"(a) {tag}: the FAILED line does not name the "
                         f"point (units[0].operation.T = ...):\n{out[-800:]}")
        seen.append((tag, nFailed))
    return seen


def arm_partial(tmp: Path):
    case = make_case(tmp, "partial", OUTER_PARTIAL, PARTIAL_CAP)
    rc, out = run(case)
    nFailed = len(FAILED_LINE.findall(out))
    m = re.search(r"failed evaluations:\s+(\d+) of (\d+)\s+\(did not converge "
                  r"(\d+), simulator threw (\d+), non-finite (\d+)\)", out)
    best = re.search(r"best objective:\s+([-+0-9.e]+)", out)
    if rc != 0:
        fails.append(f"(b) the partly converging search exited {rc}:\n"
                     f"{out[-1500:]}")
        return nFailed, 0
    if nFailed == 0:
        fails.append(f"(b) recycleMaxIter {PARTIAL_CAP} failed NO evaluation "
                     "-- the fixture no longer partitions the search; "
                     "re-measure PARTIAL_CAP")
    if not m or int(m.group(1)) != nFailed or int(m.group(3)) != nFailed:
        fails.append(f"(b) the ledger line does not count the {nFailed} "
                     f"FAILED line(s) under 'did not converge': "
                     f"{m.group(0) if m else 'absent'}")
    total = int(m.group(2)) if m else 0
    if m and nFailed >= total:
        fails.append(f"(b) every evaluation failed ({nFailed} of {total}) "
                     "-- the fixture no longer partitions the search")
    if not best or not re.fullmatch(r"[-+0-9.e]+", best.group(1)) \
            or "inf" in best.group(1) or "nan" in best.group(1):
        fails.append("(b) no finite best objective was reported: "
                     f"{best.group(0) if best else 'absent'}")
    if "Recycle converged in" not in out.split("[replaying simulator")[-1]:
        fails.append("(b) the replay at the optimum does not say 'Recycle "
                     "converged' -- the optimum was read off an unconverged "
                     "point")
    return nFailed, total


def arm_unchanged(tmp: Path):
    case = make_case(tmp, "clean", OUTER_NM, None)
    rc, out = run(case)
    nFailed = len(FAILED_LINE.findall(out))
    if rc != 0 or nFailed or "failed evaluations:" in out \
            or "status:        converged" not in out:
        fails.append(f"(c) the converging copy exited {rc} with {nFailed} "
                     "FAILED line(s), ledger line "
                     f"{'present' if 'failed evaluations:' in out else 'absent'}"
                     f", status line {'present' if 'status:        converged' in out else 'ABSENT'}"
                     f":\n{out[-1200:]}")
    return rc == 0


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def arm_source():
    code = strip_comments(SRC.read_text(errors="replace"))
    sites = [m.start() for m in re.finditer(r"\bsimulator_\(", code)]
    readers = re.compile(r"\b(extractObjective|extractResponse|setFinalResult|"
                         r"emitResultJson|PostProcessor::buildChain)\s*\(")
    n = 0
    for pos in sites:
        tail = code[pos:]
        home = tail.find("simulationFailure(")
        read = readers.search(tail)
        line = code.count("\n", 0, pos) + 1
        if home < 0 or (read and read.start() < home):
            fails.append(f"(d) a `simulator_(` call at line ~{line} is not "
                         "followed by simulationFailure( before its result "
                         "is read")
        n += 1
    if n < 4:
        fails.append(f"(d) only {n} `simulator_(` call site(s) found in "
                     "OptimizationDriver.cpp (expected the two evaluators "
                     "and the two replays)")
    #  Since 2026-11-01 the verdict lives in ResponseExtractor.cpp, shared
    #  by every outer driver (check_driver_convergence); it must not be
    #  defined here a second time.
    rx = strip_comments((ROOT / "src" / "outerDriver"
                         / "ResponseExtractor.cpp").read_text(errors="replace"))
    m = re.search(r"std::string simulationFailure\(const SimulationResult& "
                  r"\w+\)\s*\{(.*?)\n\}", rx, re.S)
    if not m or ".converged" not in m.group(1):
        fails.append("(d) simulationFailure() (ResponseExtractor.cpp) does "
                     "not read `.converged`")
    if re.search(r"std::string simulationFailure\(", code):
        fails.append("(d) OptimizationDriver.cpp defines its own "
                     "simulationFailure -- two homes for one verdict")
    other = [ln for ln in strip_comments(SRC.read_text()).splitlines()
             if ".converged" in ln and "R.converged" not in ln
             and "r.conv" not in ln and "simulationFailure" not in ln]
    other = [ln for ln in other
             if not re.search(r"\bconverged\s*=|ek\[|csv <<|lastConverged_", ln)]
    if m and len(other) > 1:
        fails.append("(d) `.converged` is read outside simulationFailure(): "
                     + "; ".join(l.strip() for l in other))
    return n


def main() -> int:
    if not (BUILD / "choupoSolve").exists():
        print("check_optimiser_converged: FAILED -- no build of choupoSolve; "
              "a check that cannot run must not pass")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        seen = arm_reproduction(tmp)
        nPart, nTot = arm_partial(tmp)
        clean = arm_unchanged(tmp)
        nSites = arm_source()
    if fails:
        print("check_optimiser_converged: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    paths = ", ".join(f"{t} ({n} evaluations FAILED by name)" for t, n in seen)
    print("check_optimiser_converged: OK -- an unconverged simulation is a "
          "FAILED evaluation, never an objective: on cavett01 copies whose "
          "recycle stops at recycleMaxIter 2, " + paths + " each refuse by "
          "name and print no optimum; with recycleMaxIter "
          f"{PARTIAL_CAP} the Nelder-Mead search counts {nPart} of {nTot} "
          "evaluations failed (did not converge), reports a finite best and "
          "replays a converged recycle; the converging copy prints no FAILED "
          f"line and ends 'status: converged' ({'held' if clean else 'NOT held'}); "
          f"{nSites} `simulator_(` call site(s) read the verdict through "
          "simulationFailure() before the result is read.  NOT covered: the "
          "sweep, gridSweep and designSpec drivers; whether a corpus "
          "optimisation SHOULD converge; the choupoCtrl functor.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
