#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the multivariate Newton has a globalisation contract, and the
defaults that every undeclared caller still runs are what they were.

    bin/curate/check_newton_globalisation.py

WHY THIS EXISTS (2026-11-08, DEV.md 4c C245 slice 1).  The kernel numerical
audit of 2026-11-08 (docs/audits/2026-11-08-kernel-numerical-audit.md, Rank 1
and Rank 2) found that `newtonND` -- the solver under every MESH column, the
tear Newton, the multi-reaction CSTR, GibbsMethod, DesignSpec and the pellet
-- had no globalisation contract:

  - its finite-difference step was ABSOLUTE, h = 1e-7 * max(|x|, 1), wrong
    for a mole fraction of 1e-10 (the probe crosses zero) or a pressure;
  - it took the full step with no bounds and no cap;
  - its "Armijo" search tested SIMPLE decrease and, exhausted, still took an
    UPHILL step (up to maxStalledSteps = 25 of them);
  - the line search understood only InfeasibleTrial;
  - a NaN pivot passed the LU's `best < 1e-30`.

The fix is a contract a caller DECLARES (NDOptions::typX, lower, upper,
maxStep, globalisation = armijo) -- so that no golden moves until a caller
opts in -- plus two defaults that are never wrong: a relative pivot test that
refuses NaN, and a finite check on every Jacobian column.

WHAT THIS GATE CHECKS.  A probe, `_newtonGlobalisationProbe.cpp`, compiled
HERE against the solver sources alone with -D_GLIBCXX_ASSERTIONS:

  (a) UPHILL.  F = (x0^2 + x1^2 - 4, x0 - x1^3 + 1) from (1e-6, 1e-6), where
      J is singular to first order.  The legacy default must still be the
      legacy default (it stalls: > 0 floor-damped uphill steps, NOT
      converged -- the witness that the default did not move); the Armijo
      contract must converge with a strictly decreasing ||F||, no stalled
      step and at least one Levenberg-Marquardt step.
  (b) BOUND.  F = ln x - ln 2e-3 from x = 10: the full step lands at x < 0.
      The legacy default evaluates the residual at x <= 0 (witness); with
      lower = 0 -- under the legacy search AND under Armijo -- no trial and
      no probe may evaluate x <= 0, and the root must be reached.
  (c) NaN.  A residual whose forward probe of x1 returns NaN must stop the
      solve naming "non-finite Jacobian column 1" (a default); luFactor must
      refuse a NaN pivot and a row dependent on the row above to working
      precision ((1, 2), (2, 4 + 1e-15): a pivot ~1e-16 of its row, which the
      old absolute test factored), and must FACTOR diag(1, 1e-20) and
      ((1e-2, 1e13), (2e-2, 1e13)) (badly scaled by row and by column, not
      singular: the test reads the pivot in the two-sided equilibrated
      matrix) and a well-conditioned matrix of entries ~1e-31 (the old
      absolute test refused it).
  (d) SCALE.  F = ln(x / 1e-10) - 0.5 from x = 1e-10: the legacy step probes
      x < 0 and is refused as a non-finite column (the Rank 2 defect, now
      named); with typX = 1e-10 and lower = 0 the root 1e-10 e^0.5 is found
      to 1e-10 relative.
  (f) FD JACOBIAN AT A TRACE FRACTION (slice 2, Rank 2).  A 2x2 residual with
      x1 = 1e-10 inside ln x1: the Newton step taken under typX/lower equals
      the analytic one to 1e-4 relative.
  (e) THE DEFAULT AND THE OPT-INS, read from the source.  NewtonND.H
      declares `Globalisation globalisation = Globalisation::legacy;`, and
      DistillationColumn.cpp's full MESH declares `Globalisation::armijo`
      with lower and upper bounds (slice 1's single proof caller).

SABOTAGE-VERIFIED 2026-11-08 (observed output recorded in the C245 commit):
  S1 the LM fallback removed (exhausted Armijo search stops instead): arm (a)
     fails -- the Armijo run stops NOT converged.
  S2 fraction-to-boundary disabled (shapeStep returns at once): arm (b)
     fails -- the box runs evaluate x <= 0.
  S3 the LU pivot test restored to `best < 1e-30`: arm (c) fails -- the NaN
     pivot is factored and the 1e-31 matrix is refused.

WHAT THIS GATE DOES NOT COVER: whether any corpus case SHOULD converge (the
goldens), the behaviour of callers that have not opted in beyond what their
goldens pin, and the sum-of-fractions constraint 1 - sum(x) >= 0 of a MESH
(a linear inequality the box cannot express; slice 2).
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "bin" / "curate" / "_newtonGlobalisationProbe.cpp"
SOURCES = ["src/solver/NewtonND.cpp", "src/solver/LU.cpp",
           "src/solver/BlockTridiagonal.cpp", "src/solver/NewtonRaphson.cpp"]

fails = []


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def run_probe(tmp: Path):
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        fails.append("(probe) no C++ compiler: a check that cannot run must "
                     "not pass")
        return None
    exe = tmp / "probe"
    r = subprocess.run([cxx, "-std=c++17", "-O1", "-D_GLIBCXX_ASSERTIONS",
                        "-I", str(ROOT / "src"), str(PROBE)]
                       + [str(ROOT / s) for s in SOURCES]
                       + ["-lpthread", "-o", str(exe)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("(probe) does not compile:\n" + r.stderr[-2000:])
        return None
    p = subprocess.run([str(exe)], capture_output=True, text=True,
                       timeout=300)
    if p.returncode != 0 or "probeDone 1" not in p.stdout:
        fails.append(f"(probe) exited {p.returncode} before finishing:\n"
                     f"{p.stdout[-1500:]}\n{p.stderr[-1500:]}")
        return None
    v = {}
    for line in p.stdout.splitlines():
        key, _, rest = line.partition(" ")
        v[key] = rest
    return v


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        v = run_probe(Path(td))
    if v is None:
        print("check_newton_globalisation: FAILED")
        for f in fails:
            print("  " + f)
        return 1

    def num(k):
        try:
            return float(v[k].split()[0])
        except (KeyError, ValueError, IndexError):
            fails.append(f"(probe) did not print {k}")
            return float("nan")

    def need(arm, cond, msg):
        if not cond:
            fails.append(f"({arm}) {msg}")

    # (a) uphill
    need("a", num("uphillLegacyStalled") > 0
         and num("uphillLegacyConverged") == 0,
         "the LEGACY default no longer stalls on the singular start "
         f"(stalled {v.get('uphillLegacyStalled')}, converged "
         f"{v.get('uphillLegacyConverged')}): the default path moved, and "
         "every undeclared caller with it")
    need("a", num("uphillArmijoConverged") == 1
         and num("uphillArmijoStalled") == 0
         and num("uphillArmijoNonMonotone") == 0
         and num("uphillArmijoLM") >= 1
         and num("uphillArmijoRootErr") < 1e-6,
         "Armijo + Levenberg-Marquardt did not converge monotonically: "
         f"converged {v.get('uphillArmijoConverged')}, stalled "
         f"{v.get('uphillArmijoStalled')}, non-monotone iterations "
         f"{v.get('uphillArmijoNonMonotone')}, LM steps "
         f"{v.get('uphillArmijoLM')}, stop {v.get('uphillArmijoStop')!r}")
    # (b) bound
    need("b", num("boundLegacyBelow") > 0,
         "the legacy default no longer evaluates outside the domain "
         "(witness lost: the default path moved)")
    for tag in ("BoxLegacy", "Armijo"):
        need("b", num(f"bound{tag}Below") == 0
             and num(f"bound{tag}Converged") == 1,
             f"with lower = 0 ({tag}) the residual was evaluated "
             f"{v.get(f'bound{tag}Below')} time(s) at x <= 0, converged "
             f"{v.get(f'bound{tag}Converged')}")
    need("b", abs(num("boundArmijoX") / 2e-3 - 1.0) < 1e-6
         and num("boundArmijoBounded") >= 1,
         f"the bounded root is {v.get('boundArmijoX')} (expected 2e-3) with "
         f"{v.get('boundArmijoBounded')} bounded step(s) (expected >= 1)")
    # (c) NaN
    need("c", num("nanLegacyConverged") == 0
         and "non-finite Jacobian column 1" in v.get("nanLegacyStop", ""),
         "a NaN probe did not stop the solve by name: "
         f"{v.get('nanLegacyStop')!r}")
    need("c", num("luNaNPivotThrows") == 1, "luFactor factored a NaN pivot")
    need("c", num("luRelPivotThrows") == 1,
         "luFactor factored ((1, 2), (2, 4 + 1e-15)), whose second row is "
         "the first to working precision (the relative test is lost)")
    need("c", num("luColScaleThrows") == 0,
         "luFactor refused ((1e-2, 1e13), (2e-2, 1e13)), whose columns are "
         "merely in different units (the pivot test is not column-scale "
         "invariant: column05 at every flow x1e-8 stops, "
         "check_degenerate_limits A8)")
    need("c", num("luBadScaleThrows") == 0,
         "luFactor refused diag(1, 1e-20), badly scaled but not singular (the "
         "pivot test is no longer row-relative)")
    need("c", num("luTinyScaleThrows") == 0,
         "luFactor refused a well-conditioned matrix of entries ~1e-31 (the "
         "absolute 1e-30 test is back)")
    # (d) scale
    need("d", num("scaleLegacyConverged") == 0
         and "non-finite Jacobian column 0" in v.get("scaleLegacyStop", ""),
         "the legacy absolute step on x = 1e-10 was not refused by name: "
         f"{v.get('scaleLegacyStop')!r}")
    need("d", num("scaleTypConverged") == 1
         and num("scaleTypRelErr") < 1e-10,
         f"typX = 1e-10 did not find 1e-10 e^0.5: converged "
         f"{v.get('scaleTypConverged')}, relative error "
         f"{v.get('scaleTypRelErr')}")
    # (f) FD Jacobian at a trace fraction (slice 2, Rank 2)
    need("f", num("fdStepRelErr") < 1e-4,
         "the Newton step on the 2x2 residual with x1 = 1e-10 inside ln x1 "
         "differs from the analytic one by "
         f"{v.get('fdStepRelErr')} relative (limit 1e-4): the finite-"
         "difference Jacobian is not scaled by typX")
    # (e) source
    hdr = strip_comments((ROOT / "src/solver/NewtonND.H").read_text())
    need("e", re.search(r"Globalisation\s+globalisation\s*=\s*"
                        r"Globalisation::legacy\s*;", hdr) is not None,
         "NewtonND.H no longer defaults to Globalisation::legacy -- every "
         "undeclared caller would move")
    col = strip_comments((ROOT / "src/unitOperations/distillation/"
                          "DistillationColumn.cpp").read_text())
    need("e", re.search(r"optsF\.globalisation\s*=\s*solver::Globalisation::"
                        r"armijo", col) is not None
         and re.search(r"optsF\.lower(\.assign\(|\s*=)", col) is not None
         and re.search(r"optsF\.upper(\.assign\(|\s*=)", col) is not None,
         "the full-MESH column no longer opts in (globalisation armijo with "
         "lower and upper bounds) -- slice 1's proof caller is gone")
    #  slice 2: the simultaneous MESH and the multi-reaction CSTR opt in too
    need("e", re.search(r"\bopts\.globalisation\s*=\s*solver::Globalisation::"
                        r"armijo", col) is not None
         and re.search(r"\bopts\.lower(\.assign\(|\s*=)", col) is not None
         and re.search(r"\bopts\.upper(\.assign\(|\s*=)", col) is not None
         and re.search(r"\bopts\.typX(\.assign\(|\s*=)", col) is not None,
         "the simultaneous MESH no longer opts in (armijo, lower, upper, "
         "typX) -- slice 2's column caller is gone")
    cstr = strip_comments((ROOT / "src/unitOperations/reactor/CSTR.cpp"
                           ).read_text())
    need("e", re.search(r"\bo\.globalisation\s*=\s*solver::Globalisation::"
                        r"armijo", cstr) is not None
         and re.search(r"\bo\.typX(\.assign\(|\s*=)", cstr) is not None,
         "the multi-reaction CSTR no longer opts in (armijo, typX) -- "
         "slice 2's reactor caller is gone")

    #  (h) slice 3a: the safeguarded 1-D solve over an infeasible window
    need("h", num("infeasConverged") == 1 and num("infeasRootErr") < 1e-6,
         "newton1DSafeguarded did not reach the root past an infeasible "
         f"window: converged {v.get('infeasConverged')}, error "
         f"{v.get('infeasRootErr')}")
    need("h", num("infeasRefusals") >= 1,
         "the infeasible window was never probed "
         f"(refusals {v.get('infeasRefusals')})")
    need("h", num("infeasFeasibleSameIters") == 1,
         "on a feasible problem newton1DSafeguarded is no longer newton1D's "
         "iteration (every feasible Gibbs case would move)")
    #  slice 3 (unit half, Rank 3): residuals that are not functions of the
    #  state.  Source arms; the runtime witnesses are in check_reactor_limits
    #  (R8 gibbs seed, R9 cstr scan, R10 adiabatic flash).
    gib = strip_comments((ROOT / "src/unitOperations/reactor/GibbsReactor.cpp"
                          ).read_text())
    need("g", "1.0e30" not in gib and "InfeasibleTrial(" in gib
         and "penalisedT" in gib,
         "3a: GibbsReactor's adiabatic residual returns a 1e30 penalty again "
         "(or no longer throws InfeasibleTrial / counts penalisedT)")
    need("g", re.search(r"std::isnan\(f[pq]\)", cstr) is not None
         and "extents solve failed at" in cstr,
         "3b: the CSTR root scan no longer treats an unconverged extents "
         "solve as NaN, or no longer announces the failed-point count")
    need("g", re.search(r"bubbleTWithItsVapour\(thermo, yD, P, Ts\[0\], "
                        r"1\.0e-12,\s*&refluxOk\)", col) is not None
         and re.search(r"if \(!refluxOk\)\s*throw InfeasibleTrial", col),
         "3c: the full-MESH reflux bubble point's verdict is dropped again")
    need("g", re.search(r"stageVapourK\(thermo, Tj, P, xj, nullptr, &vapOk\)",
                        col) is not None
         and re.search(r"if \(!vapOk\)\s*throw InfeasibleTrial", col),
         "3d: the MESH stage K's incipient-vapour verdict is dropped again")
    adf = strip_comments((ROOT / "src/unitOperations/flash/AdiabaticFlash.cpp"
                          ).read_text())
    need("g", "lastSol.converged" in adf and "innerFailedTrials" in adf
         and "maxOuterIter" in adf,
         "3g: AdiabaticFlash no longer reads its inner flash's `converged`")
    rout = strip_comments((ROOT / "src/unitOperations/reactor/ReactorOutlet.cpp"
                           ).read_text())
    need("g", re.search(r"hRes\s*<=\s*1\.0e-9\s*\*\s*std::max\(1\.0, "
                        r"std::abs\(h\)\)", rout) is not None,
         "3h: the single-phase T(H) inversion no longer checks its own "
         "enthalpy residual before returning")

    if fails:
        print("check_newton_globalisation: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_newton_globalisation: OK -- the Newton's globalisation "
          "contract holds on five synthetic problems compiled against the "
          "solver sources: from a singular start the legacy default still "
          f"stalls ({v['uphillLegacyStalled']} uphill steps, the default "
          "unmoved) while Armijo + Levenberg-Marquardt converges in "
          f"{v['uphillArmijoIterations']} iterations with ||F|| strictly "
          f"decreasing ({v['uphillArmijoLM']} LM steps); a declared lower "
          "bound keeps every trial and probe of ln x inside x > 0 (legacy "
          f"default: {v['boundLegacyBelow']} evaluations at x <= 0); a NaN "
          "probe stops the solve naming its column and luFactor refuses a "
          "NaN pivot and a row dependent to working precision while "
          "factoring row- and column-scaled matrices and a 1e-31 matrix; typX = 1e-10 solves ln(x/1e-10) = 0.5 where the absolute "
          "step is refused; NewtonND.H defaults to legacy and the full MESH "
          "opts in.  a 2x2 residual with x1 = 1e-10 inside ln x1 gets its "
          f"analytic Newton step to {v['fdStepRelErr']} relative (typX); the "
          "simultaneous MESH and the multi-reaction CSTR opt in too.  "
          "NOT covered: whether corpus cases SHOULD converge (the "
          "goldens), callers that have not opted in, the MESH sum(x) <= 1 "
          "constraint (refused only beyond 0.05 below zero, see DistillationColumn.cpp).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
