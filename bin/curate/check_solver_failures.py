#!/usr/bin/env python3
"""Gate: a failed computation is not a result -- the time integration, the
active-set QP and the SQP's finite differences each REFUSE (or relax, said
aloud) where they used to hand back a number.

    bin/curate/check_solver_failures.py

WHY THIS EXISTS (2026-10-27, DEV.md 4c C178).  An external review found three
places where the line between "a valid result" and "a failed computation"
was not drawn, each reproduced here against the real sources before it was
fixed (record: docs/design/a-failed-computation-is-not-a-result.md):

  (1) AdaptiveTimeStepper::advance returned the integrator's ODEStats with
      ok = false and neither time loop read it: asked to reach t1, the
      integrator stopped short and the driver set t = t1, routed, fired the
      recipe events and wrote the <t>/ directory over a state that never
      got there.
  (2) activeSetQP started at d = 0 with no treatment of an inequality
      violated there; on a zero step it tested only the active multipliers'
      sign, so min x^2/2 s.t. x >= 1 returned x = 0, "KKT satisfied".  Its
      second consumer, the analysis reconciliation, published a quantity
      reconciled to -1 under two enforced laws that forced it there.
  (3) The SQP's finite differences read perturbed responses without `ok`,
      so min x on [-1, 1], the model evaluable only for x <= 0, from x = 0,
      returned x = 0, "KKT conditions satisfied" (the answer is -1).

WHAT THIS GATE CHECKS.

  (a) THE PROBE.  `_solverFailureProbe.cpp`, compiled HERE against the
      solver sources (and the reconciler) alone, with -D_GLIBCXX_ASSERTIONS
      so a read of an unsized h/g vector ABORTS instead of returning
      garbage; it requires:
        - dy/dt = y^2 asked to t = 2: advance() throws IntegrationFailure
          naming the interval, the unit, a time reached in (0.99, 1) and the
          cause, and commits NOTHING (the unit's state stays at y = 1);
        - a declared maxSteps 5 fires by name; a well-posed interval
          (dy/dt = -y) throws nothing and reaches exp(-1) to 1e-4;
        - the QP: x >= 1 gives x = 1, lambda = 1, converged; x >= 1 with
          x <= 0 is NOT converged and flagged infeasible; two parallel
          violated rows (x1 >= 1, x1 >= 2) give (2, 0), converged -- the
          binding row enters, not a false "infeasible"; the hand-worked
          self-check still holds;
        - the reconciliation: laws forcing b = -1 REFUSE ("no admissible
          answer"); a consistent law still reconciles (a = 1.1);
        - the SQP: the reviewer's repro reaches x = -1, converged, with the
          one-sided difference counted, under forward AND central
          differences; a model evaluable at one point only stops
          UNCONVERGED naming "no finite difference exists"; an infeasible
          start (x >= 1 from 0) reaches x = 1; a problem with no feasible
          point (x^2 + 1 <= 0) stops unconverged; a feasible problem whose
          first linearisation is inconsistent with the box reaches x = 1
          under a counted Powell relaxation and is never evaluated more than
          one FD step (1e-4) outside its box (before C178: 3.05 outside);
          the Hock-Schittkowski self-check still holds.
  (b) THE THREE BINARIES, end to end.  Copies of batch06 (choupoBatch),
      ctrl03 (choupoCtrl) and unsteady01 (choupoSemiContinuous) declaring
      `timeSteppingControl { maxSteps 5; }` must exit non-zero with the
      named refusal (interval, unit 'reactor', maxSteps), write NO time
      directory beyond 0/, no converged/, and a trajectory holding the t = 0
      row alone.
  (c) UNDER AN OUTER DRIVER.  The ctrl03 copy wrapped in a two-point sweep
      outerDict must report every point as a FAILED evaluation naming the
      integration (nan in the sweep table, exit non-zero) -- never a pass.
  (d) SOURCE.  Every `->integrate(` call outside src/solver/ODE reads the
      returned `.ok`; both time loops reach the integrator only through
      AdaptiveTimeStepper::advance, whose failure branch throws
      IntegrationFailure before the scatter; the reconciler reads
      `qr.converged`.

WHAT THIS GATE DOES NOT COVER, stated so its green line cannot imply it:
the fixed-step RK4 path of the time loops (a unit's own step() -- the units
that integrate internally refuse on their own, arm (d) reads that they
check); whether a refused corpus case SHOULD converge (the suite's per-case
check sees an exit code, this gate sees the refusal's shape); the quality
of the SQP's path on corpus cases (their goldens); a feasibility-restoration
phase beyond Powell's relaxation (there is none).

SABOTAGE-VERIFIED 2026-10-27, by hand, each restored before the next;
OBSERVED output, abridged.  S1 needs the engine rebuilt between the edit
and the check (arms b, c run the binaries); S2-S6 reach the probe, which
compiles from source, and the source arm.  (Trap paid for: restoring a file
with its ORIGINAL mtime leaves make believing the sabotaged objects are
fresh -- touch the restored files before the rebuild.)

  S1 -- advance()'s `if (!st.ok) throw IntegrationFailure` removed:
          (a) dy/dt = y^2 asked to t = 2 did not throw IntegrationFailure
          (a) the failed interval COMMITTED state into the unit (1
              commit(s), y = 9.49577e+153)
          (b) batch06 / ctrl03 / unsteady01 with maxSteps 5 exited 0
              (ctrl03 ran on to t_end = 2000 s over five sub-steps)
          (c) the sweep over a failing ctrl03 exited 0 with 0 named failed
              evaluation(s) and 0 nan row(s)
          (d) advance does not throw IntegrationFailure on !st.ok
  S2 -- the QP's violated-row admission removed:
          (a) min x^2/2 s.t. x >= 1 gave x = 0 ...; two parallel violated
              rows gave (0 0) ...; min x^2 s.t. x >= 1 from 0 gave x = 0;
              verifySQP (HS35/HS21/HS71) failed
  S3 -- the QP's final primal-feasibility verdict bypassed:
          (a) x >= 1 with x <= 0 was certified: 'KKT satisfied'
          (a) the reconciliation published b = -1 ...
          (a) the SQP evaluated the model 3.0498 outside its declared box
              -- the pre-C178 out-of-box step, exactly
  S4 -- the SQP's forward-side `usable(rp)` test bypassed:
          (a) the probe exited -6 before finishing -- the failed response's
              UNSIZED g vector was read, and _GLIBCXX_ASSERTIONS aborted
  S5 -- the Powell relaxation replaced by an immediate stop:
          (a) the inconsistent first linearisation gave x = 0.1,
              converged = 0, relaxed steps = 0
  S6 -- BatchAdsorber's `if (!st.ok)` bypassed:
          (d) src/unitOperations/batch/BatchAdsorber.cpp calls ->integrate(
              and never reads .ok on its result
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
PROBE = ROOT / "bin" / "curate" / "_solverFailureProbe.cpp"
SOURCES = ["src/solver/ActiveSetQP.cpp", "src/solver/SQP.cpp",
           "src/solver/NewtonND.cpp", "src/solver/LU.cpp",
           "src/solver/BlockTridiagonal.cpp",
           "src/solver/ODE/Rosenbrock23.cpp", "src/solver/ODE/Jacobian.cpp",
           "src/solver/ODE/ODEIntegrator.cpp", "src/solver/ODE/RK4.cpp",
           "src/solver/ODE/EulerSI.cpp", "src/streams/AnalysisReconciler.cpp"]
CASES = [
    ("batch06", "tutorials/batch/reactor/batch06_adaptive_runaway",
     "choupoBatch"),
    ("ctrl03", "tutorials/ctrl/ctrl03_adaptive_disturbance", "choupoCtrl"),
    ("unsteady01", "tutorials/unsteady/unsteady01_startup_transient",
     "choupoSemiContinuous"),
]

fails = []


def arm_probe(tmp: Path):
    cxx = shutil.which("g++") or shutil.which("clang++")
    if not cxx:
        fails.append("(a) no C++ compiler: the probe cannot run -- a check "
                     "that cannot run must not pass")
        return None
    exe = tmp / "probe"
    r = subprocess.run([cxx, "-std=c++17", "-O1", "-D_GLIBCXX_ASSERTIONS",
                        "-I", str(ROOT / "src"), str(PROBE)]
                       + [str(ROOT / s) for s in SOURCES] + ["-o", str(exe)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("(a) the probe does not compile:\n" + r.stderr[-2000:])
        return None
    p = subprocess.run([str(exe)], capture_output=True, text=True,
                       timeout=600)
    if p.returncode != 0 or "probeDone 1" not in p.stdout:
        fails.append(f"(a) the probe exited {p.returncode} before finishing "
                     "(an out-of-bounds read of a failed response aborts "
                     f"under _GLIBCXX_ASSERTIONS):\n{p.stdout[-1500:]}"
                     f"\n{p.stderr[-1500:]}")
        return None
    v = {}
    for line in p.stdout.splitlines():
        key, _, rest = line.partition(" ")
        v[key] = rest

    def num(k):
        try:
            return float(v[k].split()[0])
        except (KeyError, ValueError, IndexError):
            fails.append(f"(a) the probe did not print {k}")
            return float("nan")

    def need(cond, msg):
        if not cond:
            fails.append("(a) " + msg)

    # (1) the integration
    msg = v.get("blowupMessage", "")
    m = re.search(r"gave up at t = ([0-9.e+-]+) s", msg)
    need(num("blowupThrew") == 1,
         "dy/dt = y^2 asked to t = 2 did not throw IntegrationFailure -- the"
         " failed interval was handed back as a step")
    need(m is not None and 0.99 < float(m.group(1)) < 1.0,
         f"the refusal does not name a time reached in (0.99, 1): {msg!r}")
    for needle in ("[0, 2]", "'blowup'", "hMin"):
        need(needle in msg, f"the refusal does not name {needle}: {msg!r}")
    need(num("blowupCommits") == 0 and num("blowupY") == 1.0,
         f"the failed interval COMMITTED state into the unit "
         f"({v.get('blowupCommits')} commit(s), y = {v.get('blowupY')})")
    gmsg = v.get("guardMessage", "")
    need(num("guardThrew") == 1 and "maxSteps: 5" in gmsg
         and "'decay'" in gmsg,
         f"a declared maxSteps 5 did not refuse by name: {gmsg!r}")
    need(num("guardZ") == 1.0, "the maxSteps refusal committed state")
    need(num("decayThrew") == 0 and num("decayRelErr") < 1e-4,
         "a well-posed interval (dy/dt = -y) threw or missed exp(-1)")
    # (2) the QP
    need(abs(num("qpX") - 1.0) < 1e-9 and abs(num("qpLambda") - 1.0) < 1e-9
         and num("qpConverged") == 1,
         f"min x^2/2 s.t. x >= 1 gave x = {v.get('qpX')}, lambda = "
         f"{v.get('qpLambda')}, converged = {v.get('qpConverged')} "
         "(expected 1, 1, 1)")
    need(num("qpInfeasibleConverged") == 0
         and num("qpInfeasibleFlag") == 1
         and "INFEASIBLE" in v.get("qpInfeasibleReason", ""),
         "x >= 1 with x <= 0 was certified, or not flagged infeasible: "
         f"{v.get('qpInfeasibleReason')!r}")
    par = v.get("qpParallelX", "nan nan").split()
    need(len(par) == 2 and abs(float(par[0]) - 2.0) < 1e-9
         and abs(float(par[1])) < 1e-9 and num("qpParallelConverged") == 1,
         f"two parallel violated rows gave ({' '.join(par)}) converged = "
         f"{v.get('qpParallelConverged')} (expected (2, 0), 1)")
    need(num("qpVerify") == 1, "verifyActiveSetQP failed")
    need(num("reconThrew") == 1
         and "no admissible answer" in v.get("reconMessage", ""),
         f"the reconciliation published b = {v.get('reconB')} under laws "
         "that force it negative instead of refusing")
    need(num("reconOkThrew") == 0 and abs(num("reconOkA") - 1.1) < 1e-9,
         "a consistent reconciliation (a + b = 2.2) no longer reconciles")
    # (3) the SQP
    for tag in ("Forward", "Central"):
        need(abs(num(f"sqp{tag}X") + 1.0) < 1e-6
             and num(f"sqp{tag}Converged") == 1
             and num(f"sqp{tag}OneSided") >= 1,
             f"{tag.lower()} differences: min x on [-1, 1] evaluable only "
             f"for x <= 0 gave x = {v.get(f'sqp{tag}X')}, converged = "
             f"{v.get(f'sqp{tag}Converged')}, one-sided = "
             f"{v.get(f'sqp{tag}OneSided')} (expected -1, 1, >= 1)")
    need(num("sqpBothConverged") == 0
         and "no finite difference exists" in v.get("sqpBothReason", ""),
         "a model evaluable at one point did not stop unconverged naming "
         f"the missing derivative: {v.get('sqpBothReason')!r}")
    need(abs(num("sqpConX") - 1.0) < 1e-5 and num("sqpConConverged") == 1,
         f"min x^2 s.t. x >= 1 from 0 gave x = {v.get('sqpConX')}, "
         f"converged = {v.get('sqpConConverged')}")
    need(num("sqpNeverConverged") == 0,
         "x^2 + 1 <= 0 (no feasible point) was certified")
    need(abs(num("sqpRelaxX") - 1.0) < 1e-5
         and num("sqpRelaxConverged") == 1 and num("sqpRelaxSteps") >= 1,
         f"the inconsistent first linearisation gave x = "
         f"{v.get('sqpRelaxX')}, converged = {v.get('sqpRelaxConverged')},"
         f" relaxed steps = {v.get('sqpRelaxSteps')} (expected 1, 1, >= 1)")
    need(num("sqpRelaxOutside") <= 1e-4,
         f"the SQP evaluated the model {v.get('sqpRelaxOutside')} outside "
         "its declared box (more than one FD step)")
    need(num("sqpVerify") == 1, "verifySQP (HS35/HS21/HS71) failed")
    return v


def copy_case(rel: str, dst: Path) -> Path:
    shutil.copytree(ROOT / rel, dst, symlinks=True, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "latest", "latest.txt", "converged", "*.log",
        "balanceTrajectory.meta", "reports"))
    for d in dst.iterdir():
        if d.is_dir() and d.name != "0" and re.fullmatch(r"[0-9][0-9.e+-]*",
                                                         d.name):
            shutil.rmtree(d)
    return dst


def declare_guard(case: Path):
    cd = case / "system" / "controlDict"
    txt = cd.read_text()
    if re.search(r"\btimeSteppingControl\s*\{", txt):
        txt = re.sub(r"\btimeSteppingControl\s*\{",
                     "timeSteppingControl\n{\n    maxSteps 5;", txt, count=1)
    else:
        txt = re.sub(r"\btimeStepping\s+\w+\s*;", "", txt)
        txt += ("\ntimeStepping adaptive;\ntimeSteppingControl"
                " { maxSteps 5; deltaT0 0.01; deltaTmax 0.01; }\n")
    cd.write_text(txt)


def run(binary: str, case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BUILD / binary), "."], cwd=case,
                       capture_output=True, text=True, timeout=900, env=env)
    return p.returncode, p.stdout + p.stderr


def arm_binaries(tmp: Path):
    seen = []
    for tag, rel, binary in CASES:
        case = copy_case(rel, tmp / tag)
        declare_guard(case)
        rc, out = run(binary, case)
        m = re.search(r"time integration FAILED on the interval \[0, "
                      r"[0-9.e+-]+\] s: .*?maxSteps: 5 .*?Unit\(s\) "
                      r"integrated: 'reactor'", out, re.S)
        if rc == 0 or not m:
            fails.append(f"(b) {tag} ({binary}) with maxSteps 5 exited {rc} "
                         "without the named refusal (interval, maxSteps, "
                         f"unit 'reactor'):\n{out[-1500:]}")
            continue
        later = [d.name for d in case.iterdir() if d.is_dir()
                 and d.name != "0"
                 and re.fullmatch(r"[0-9][0-9.e+-]*", d.name)]
        if later or (case / "converged").exists():
            fails.append(f"(b) {tag} refused but WROTE {later or ''} "
                         f"{'converged/' if (case / 'converged').exists() else ''}"
                         " -- a state that stopped short was published")
        traj = case / "trajectory.csv"
        rows = [ln for ln in traj.read_text().splitlines()[1:] if ln.strip()] \
            if traj.exists() else []
        if len(rows) != 1 or float(rows[0].split(",")[0]) != 0.0:
            fails.append(f"(b) {tag} refused but its trajectory holds "
                         f"{len(rows)} row(s) (expected the t = 0 row alone)")
        seen.append(tag)
    return seen


def arm_outer(tmp: Path):
    case = copy_case(CASES[1][1], tmp / "ctrl03outer")
    declare_guard(case)
    (case / "system" / "outerDict").write_text(
        "type sweep;\nparameter\n{\n    target controllers[1].setpoint;\n"
        "    range ( 345 355 );\n    nPoints 2;\n}\n"
        "responses ( reactor.T_final );\n"
        "report { format csv; file sweep_results.csv; }\n")
    rc, out = run("choupoCtrl", case)
    failed = re.findall(r"simulator FAILED: time integration FAILED", out)
    table = case / "sweep_results.csv"
    nan_rows = [ln for ln in (table.read_text().splitlines()[1:]
                              if table.exists() else []) if "nan" in ln]
    if rc == 0 or len(failed) != 2 or len(nan_rows) != 2:
        fails.append(f"(c) the sweep over a failing ctrl03 exited {rc} with "
                     f"{len(failed)} named failed evaluation(s) and "
                     f"{len(nan_rows)} nan row(s) (expected non-zero, 2, 2)"
                     f":\n{out[-1500:]}")
    return len(failed)


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def arm_source():
    n = 0
    for path in sorted((ROOT / "src").rglob("*.[cH]*")):
        if "solver/ODE" in path.as_posix():
            continue
        code = strip_comments(path.read_text(errors="replace"))
        for m in re.finditer(r"->integrate\(", code):
            n += 1
            window = code[m.end():m.end() + 1500]
            line = code[:m.start()].rsplit("\n", 1)[-1]
            bound = re.search(r"(\w+)\s*=\s*\w+$", line.strip().split("->")[0])
            var = bound.group(1) if bound else None
            if not var or not re.search(rf"\b{var}\.ok\b", window):
                fails.append(f"(d) {path.relative_to(ROOT)} calls ->integrate("
                             " and never reads .ok on its result -- a failed "
                             "integration would be committed as a step")
    callers = [p.relative_to(ROOT).as_posix()
               for p in (ROOT / "src").rglob("*.[cH]*")
               if re.search(r"\bstepper\.advance\(",
                            strip_comments(p.read_text(errors="replace")))]
    if sorted(callers) != ["src/applications/choupoBatch/main.cpp",
                           "src/dynamicDriver/DynamicDriver.cpp"]:
        fails.append(f"(d) AdaptiveTimeStepper::advance is called from "
                     f"{sorted(callers)}, not exactly the two time loops")
    ats = strip_comments((ROOT / "src/solver/ODE/AdaptiveTimeStep.H")
                         .read_text())
    m = re.search(r"integrate\(y, t0, t1, f, ctrl\);(.*?)units\[u\]\.commit",
                  ats, re.S)
    if not m or not re.search(r"if\s*\(\s*!st\.ok\s*\)\s*throw\s+"
                              r"IntegrationFailure", m.group(1)):
        fails.append("(d) AdaptiveTimeStepper::advance does not throw "
                     "IntegrationFailure on !st.ok BEFORE scattering the "
                     "state into the units")
    rec = strip_comments((ROOT / "src/streams/AnalysisReconciler.cpp")
                         .read_text())
    if not re.search(r"!\s*qr\.converged", rec):
        fails.append("(d) AnalysisReconciler.cpp never reads qr.converged -- "
                     "an infeasible QP would be published as reconciled")
    return n


def arm_declaration(tmp: Path):
    """(e) THE KEY ITSELF (Vitor, 2026-10-27: optional, defaults unchanged,
    validated rigorously).  One reader, solver::readMaxSteps; each bad
    declaration must refuse by name before any integration, on choupoBatch
    (whose main calls the reader) and choupoCtrl (the dynamic driver)."""
    bad = [("zero", "0", "between 1 and 1e9 (got 0)"),
           ("fraction", "2.5", "between 1 and 1e9 (got 2.5)"),
           ("huge", "1e12", "between 1 and 1e9 (got 1e+12)"),
           ("fixed", "5", "this run is `timeStepping fixed`")]
    n = 0
    for tag, rel, binary in CASES[:2]:
        for name, val, want in bad:
            case = copy_case(rel, tmp / f"{tag}_{name}")
            cd = case / "system" / "controlDict"
            txt = cd.read_text()
            txt = re.sub(r"\btimeStepping\s+\w+\s*;", "", txt)
            txt = re.sub(r"\btimeSteppingControl\s*\{[^}]*\}", "", txt)
            mode = "fixed" if name == "fixed" else "adaptive"
            txt += (f"\ntimeStepping {mode};\ntimeSteppingControl"
                    f" {{ maxSteps {val}; deltaT0 0.01; deltaTmax 0.01; }}\n")
            cd.write_text(txt)
            rc, out = run(binary, case)
            if rc == 0 or want not in out or "Time integration" in out:
                fails.append(f"(e) {tag} ({binary}) maxSteps {val} under "
                             f"{mode} stepping exited {rc} without refusing "
                             f"it by name before integrating ({want!r}):\n"
                             f"{out[-800:]}")
            n += 1
    return n


def main() -> int:
    missing = [b for _, _, b in CASES if not (BUILD / b).exists()]
    if missing:
        print(f"check_solver_failures: FAILED -- no build of {missing}; a "
              "check that cannot run must not pass")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        v = arm_probe(tmp)
        seen = arm_binaries(tmp)
        nOuter = arm_outer(tmp)
        nDecl = arm_declaration(tmp)
        nInt = arm_source()
    if fails:
        print("check_solver_failures: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_solver_failures: OK -- a failed computation is refused, not "
          "returned: the probe (solver sources alone, bounds-checked) sees "
          "dy/dt = y^2 asked to t = 2 refused by name at t = "
          f"{re.search(r'gave up at t = ([0-9.e+-]+)', v['blowupMessage']).group(1)}"
          " s with NOTHING committed, a declared maxSteps 5 refused (and "
          f"{nDecl} bad maxSteps declarations -- 0, 2.5, 1e12, or under fixed "
          "stepping -- refused by name before integrating), a "
          "well-posed interval untouched; the QP gives x = 1 (not 0) for "
          "x >= 1, flags x >= 1 with x <= 0 INFEASIBLE instead of certifying "
          "it, and the reconciliation refuses laws that force b = -1; the "
          "SQP reaches x = -1 (not 0) on the reviewer's half-evaluable model "
          "under forward and central differences with the one-sided step "
          "counted, stops unconverged when no difference exists, and solves "
          "an inconsistent first linearisation under a counted Powell "
          f"relaxation within {float(v['sqpRelaxOutside']):.1e} of its box; "
          f"{len(seen)} binaries ({', '.join(seen)}) refuse a failed "
          "interval with no time directory, no converged/ and the t = 0 "
          f"trajectory row alone; a sweep over the failing ctrl03 reports "
          f"{nOuter} of 2 evaluations FAILED; {nInt} `->integrate(` call "
          "site(s) outside src/solver/ODE read .ok.  NOT covered: the "
          "fixed-step RK4 time loop (units refuse on their own), whether a "
          "corpus case SHOULD converge, the SQP path on corpus cases (their "
          "goldens), any restoration beyond Powell's relaxation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
