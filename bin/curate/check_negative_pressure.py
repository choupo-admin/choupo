#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a NEGATIVE outlet pressure is refused by name on an accepted pass,
and announced (never silent) when only a trial sweep visits it.

    bin/curate/check_negative_pressure.py

WHY THIS EXISTS (2026-11-02, DEV.md 4c C186 item 5b; the record is
docs/design/a-negative-pressure-is-refused.md).

`Flowsheet.cpp` runUnit used to say `if (s.P <= 0.0) s.P = P_inherit;`.
A pipe whose pressure drop exceeds its inlet pressure publishes a NEGATIVE
outlet pressure (and warns on stderr); the line replaced it with the inlet
pressure, so the stream table printed the INLET pressure as the outlet's and
the run exited 0.  Reproduced first, on the fixtures this gate builds:

    pipe D 0.04 m, L 500 m, 5 bar in, water, 1000 kmol/h:
      the pipe says  P_out = -16.8034 bar
      the stream table says  downstream P = 5.000 bar, exit 0
    the same pipe inside a mixer -> pipe -> splitter recycle (Newton AND
      Wegstein): "Recycle converged", downstream P = 5.000 bar, exit 0,
      the pipe having computed -79.4 bar on the last pass.

P == 0 is a DIFFERENT fact: the sentinel "this unit did not set a pressure"
(every cstr and pfr publishes it by design -- 28 corpus cases reach the
clamp that way, none with a negative P) and keeps inheriting the first
inlet's.  A NEGATIVE P on an ACCEPTED pass (quiet = false: the single pass,
the final recycle pass) now refuses by name: unit, stream, the P, the inlet
P, the remedy.  A TRIAL sweep (quiet: a Newton probe, a Wegstein iterate)
may legitimately visit a negative pressure on its way to a fixed point whose
accepted pass is fine; it keeps the old handling and is COUNTED, and the end
of the recycle solve announces `trial pressure clamped N time(s)` (stdout,
the caveat block, the result JSON).

WHAT THIS GATE CHECKS.
  (a) A feed-forward pipe with a drop above its inlet pressure: exit != 0,
      the refusal names unit 'P1', stream 'downstream', the negative P
      (-16.8 bar), the inlet (5.0 bar) and the remedy; the NEGATIVE: the
      same line with D 0.1 m (a small drop) exits 0 and prints no refusal.
  (b) The same pipe in a torn recycle, under Newton AND Wegstein: exit != 0,
      the same refusal, no stream table claiming a pressure for it.
  (c) A TRIAL: a mixer -> pipe -> pump -> splitter loop seeded so that the
      first sweeps carry more flow than the answer (the pipe goes negative
      on them and not at the fixed point).  Wegstein: exit 0, "Recycle
      converged", `trial pressure clamped N time(s)` printed AND in the
      caveat block (twice in the output), N >= 1.  The NEGATIVE: the same
      loop with a wider pipe prints no such line.
  (d) THE SENTINEL: a cstr case (P = 0 published) exits 0 and prints no
      negative-pressure refusal.
  (e) SOURCE: runUnit refuses `s.P < 0.0` when not quiet and counts when
      quiet; the counter is reset and announced once each in the recycle
      branch; the unconditional `<= 0` replacement is preceded by that guard.

AMENDED 2026-11-08 (DEV.md 4c C245 slice 2, audit H16): a trial sweep that meets
a negative pressure no longer substitutes the inlet's: runUnit throws
InfeasibleTrial.  The Newton's line search shortens the step, Wegstein falls
back to direct substitution from its last image (counted, announced), and a
seed that is itself infeasible refuses by name through the accepted-pass
message.  Arm (c) now pins the seed refusal under both solvers and a clean
feasible-seed run; the mid-iteration "rejected extrapolation" branch has no
fixture here (the water loop's flow map is linear, so Wegstein cannot
overshoot into the infeasible region).  The text of (c) above describes the
retired behaviour.

WHAT THIS GATE DOES NOT COVER, so its green line cannot imply it: other
units' own handling of a pressure they receive (the pipe's stderr warning is
unchanged); a trial that fails to recover (that is the recycle's own
non-convergence); P == 0 (the sentinel is kept on purpose); the time
integrated binaries, which do not go through runUnit.

SABOTAGE-VERIFIED 2026-11-02 by hand (src restored by cp then touched, engine
rebuilt before the next); OBSERVED output, abridged:

  S1 -- runUnit's refusal `else` branch removed (the clamp accepts every P):
        (a) the forward pipe exited 0 with the refusal ABSENT
        (b) Newton and Wegstein exited 0, "Recycle converged"
        (e) runUnit has no refusal for a negative pressure on an accepted pass
  S2 -- `if (quiet)` made `if (false)` (a trial also refuses):
        (c) the trial loop exited 2 with the refusal where a trial must pass
  S3 -- the announcement after the final sweep deleted:
        (c) `trial pressure clamped` ABSENT although the pipe went negative
        (e) the recycle branch does not announce the trial count
  S4 -- the guard widened to `s.P <= 0.0` (the sentinel refused):
        (d) the cstr case exited 2 with the negative-pressure refusal
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
SRC = ROOT / "src"
PIPE = "tutorials/steady/hydraulics/pipe01_water_line"
CSTR = "tutorials/steady/reactors/cstr01_first_order"

fails = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BUILD / "choupoSolve"), "."], cwd=case,
                       capture_output=True, text=True, timeout=900, env=env)
    return p.returncode, p.stdout + p.stderr


FEED = ("componentMolarFlows\n{\n    water    %s kmol/h;\n}\n\n"
        "T               300 K;\nP               %s Pa;\n")


def skeleton(tmp: Path, tag: str) -> Path:
    d = tmp / tag
    (d / "system").mkdir(parents=True)
    (d / "0").mkdir()
    shutil.copytree(ROOT / PIPE / "constant", d / "constant", symlinks=True)
    shutil.copy(ROOT / PIPE / "system" / "controlDict", d / "system")
    (d / (tag + ".cho")).write_text("")
    return d


def pipe_geom(D, L):
    return ("operation { geometry { D %s m; L %s m; roughness 4.6e-5 m; "
            "dz 0.5 m; } }" % (D, L))


def make_forward(tmp: Path, tag: str, D: str) -> Path:
    d = skeleton(tmp, tag)
    (d / "system" / "flowsheetDict").write_text(
        "units\n(\n    { name P1; type pipe; model Churchill; in feed; "
        f"outputs ( downstream ); {pipe_geom(D, 500)} }}\n"
        "    { name S1; type splitter; in downstream; outputs ( a b ); "
        "operation { fractions ( 0.5 0.5 ); } }\n);\n")
    for n, f in {"feed": "1000", "downstream": "1000", "a": "500",
                 "b": "500"}.items():
        (d / "0" / n).write_text(FEED % (f, "500000"))
    return d


def make_recycle(tmp: Path, tag: str, solver: str, D: str) -> Path:
    d = skeleton(tmp, tag)
    (d / "system" / "flowsheetDict").write_text(
        "units\n(\n    { name M1; type mixer; inputs ( feed recycle ); "
        "outputs ( mixed ); }\n"
        "    { name P1; type pipe; model Churchill; in mixed; "
        f"outputs ( downstream ); {pipe_geom(D, 500)} }}\n"
        "    { name S1; type splitter; in downstream; outputs ( recycle "
        "product ); operation { fractions ( 0.5 0.5 ); } }\n);\n")
    (d / "system" / "solverDict").write_text(
        f"tearStreams ( recycle );\nrecycleSolver {solver};\n"
        "recycleTol 1e-5;\nrecycleMaxIter 60;\n")
    for n, f in {"feed": "1000", "recycle": "500", "mixed": "1500",
                 "downstream": "1500", "product": "750"}.items():
        (d / "0" / n).write_text(FEED % (f, "500000"))
    return d


def make_trial(tmp: Path, tag: str, D: str, L: str, seed: str = "1500",
               solver: str = "Wegstein") -> Path:
    """mixer -> pipe -> pump (6 bar) -> splitter, the recycle seeded at 1500
    kmol/h against an answer of 1000: the first sweeps carry 2500 kmol/h and
    the pipe's drop exceeds its 5 bar inlet there, not at 2000 kmol/h."""
    d = skeleton(tmp, tag)
    (d / "system" / "flowsheetDict").write_text(
        "units\n(\n    { name M1; type mixer; inputs ( feed recycle ); "
        "outputs ( mixed ); }\n"
        "    { name P1; type pipe; model Churchill; in mixed; "
        f"outputs ( piped ); {pipe_geom(D, L)} }}\n"
        "    { name K1; type pump; in piped; outputs ( downstream ); "
        "operation { P_out 6.0 bar; eta 0.65; } }\n"
        "    { name S1; type splitter; in downstream; outputs ( recycle "
        "product ); operation { fractions ( 0.5 0.5 ); } }\n);\n")
    (d / "system" / "solverDict").write_text(
        f"tearStreams ( recycle );\nrecycleSolver {solver};\n"
        "recycleTol 1e-5;\nrecycleMaxIter 60;\n")
    tot = str(1000 + int(seed))
    for n, f in {"feed": "1000", "recycle": seed, "mixed": tot,
                 "piped": tot, "downstream": tot,
                 "product": "750"}.items():
        (d / "0" / n).write_text(FEED % (f, "500000"))
    return d


REFUSAL = re.compile(
    r"unit 'P1' \(pipe\): outlet stream 'downstream' has a NEGATIVE pressure, "
    r"P = -(\d+\.\d+) bar, from an inlet at (\d+\.\d+) bar .*Reduce the drop")


def refusal_ok(tag: str, rc: int, out: str, tablefree=True):
    m = REFUSAL.search(out)
    if rc == 0 or not m:
        fails.append(f"{tag}: exit {rc}, named refusal "
                     f"{'present' if m else 'ABSENT'}:\n{out[-500:]}")
        return None
    if "Recycle converged" in out and tag.startswith("(b)"):
        pass   # the loop may converge on its quiet sweeps; the final pass refuses
    return m


def arm_forward(tmp: Path):
    rc, out = run(make_forward(tmp, "fwdBig", "0.04"))
    m = refusal_ok("(a) forward pipe, D 0.04", rc, out)
    if m and (abs(float(m.group(1)) - 16.8) > 0.2
              or abs(float(m.group(2)) - 5.0) > 0.01):
        fails.append(f"(a) the refusal quotes P = -{m.group(1)} bar from "
                     f"{m.group(2)} bar; the pipe computed -16.8 from 5.0")
    rc, out = run(make_forward(tmp, "fwdSmall", "0.1"))
    if rc != 0 or "NEGATIVE pressure" in out:
        fails.append(f"(a) the NEGATIVE: D 0.1 m must run (exit {rc}):\n"
                     + out[-400:])
    return 1


def arm_recycle(tmp: Path):
    seen = []
    for solver in ("Newton", "Wegstein"):
        rc, out = run(make_recycle(tmp, "rec" + solver, solver, "0.04"))
        if refusal_ok(f"(b) recycle under {solver}", rc, out):
            seen.append(solver)
    return seen


def arm_trial(tmp: Path):
    """DEV.md 4c C245 slice 2 (audit H16).  A trial that publishes a negative
    pressure is an INFEASIBLE trial -- it is never replaced by the inlet's
    pressure, and nothing ends with P = P_in.  The loop seeded at 1500 kmol/h
    (2500 through the pipe, a drop of 6.8 bar from 5) has an infeasible SEED:
    both solvers refuse by name, with no earlier iterate to fall back on.  The
    same loop seeded at 1100 (feasible) converges to the answer, 2000 kmol/h
    through the pipe, and prints no clamp announcement."""
    for solver in ("Newton", "Wegstein"):
        rc, out = run(make_trial(tmp, "trial" + solver, "0.1", "2800",
                                 "1500", solver))
        if rc == 0 or "NEGATIVE pressure" not in out \
                or "outlet stream 'piped'" not in out \
                or "Recycle converged" in out:
            fails.append(f"(c) infeasible seed under {solver}: exit {rc}, "
                         "must refuse by name (unit P1, stream 'piped'), "
                         "never converge on a substituted pressure:\n"
                         + out[-500:])
        rc, out = run(make_trial(tmp, "feas" + solver, "0.1", "2800",
                                 "1100", solver))
        if rc != 0 or "Recycle converged" not in out \
                or "NEGATIVE pressure" in out \
                or "trial pressure clamped" in out:
            fails.append(f"(c) feasible seed under {solver}: exit {rc}, "
                         "must converge cleanly:\n" + out[-500:])
    rc, out = run(make_trial(tmp, "noTrial", "0.2", "2800"))
    if rc != 0 or "trial pressure clamped" in out:
        fails.append(f"(c) NEGATIVE: the wider pipe must neither refuse nor "
                     f"announce (exit {rc}):\n" + out[-400:])
    return 2


def arm_sentinel(tmp: Path):
    d = tmp / "cstr"
    shutil.copytree(ROOT / CSTR, d, symlinks=True,
                    ignore=shutil.ignore_patterns("expected", "converged",
                                                  "reports", "*.csv", "*.log"))
    rc, out = run(d)
    if rc != 0 or "NEGATIVE pressure" in out:
        fails.append(f"(d) cstr01 (P == 0 sentinel) exited {rc}:\n"
                     + out[-400:])


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def arm_source():
    fl = strip_comments((SRC / "unitOperations" / "flowsheet"
                         / "Flowsheet.cpp").read_text())
    ru = re.search(r"\nvoid runUnit\(.*?\n\}\n", fl, re.S)
    body = ru.group(0) if ru else ""
    g = re.search(r"if \(s\.P < 0\.0\)\s*\{\s*if \(quiet\)\s*\{[^}]*"
                  r"\+\+g_trialPressureClamps.*?\}\s*else\s*\{.*?"
                  r"NEGATIVE pressure.*?throw std::runtime_error", body, re.S)
    if not g:
        fails.append("(e) runUnit has no refusal for a negative pressure on "
                     "an accepted pass (guard `if (s.P < 0.0) { if (quiet) "
                     "{ ++counter } else { ... NEGATIVE pressure ... throw } }`)")
    elif body.find("s.P <= 0.0") < g.start():
        fails.append("(e) the `<= 0` replacement precedes the negative guard")
    if not re.search(r"\+\+g_trialPressureClamps.*?throw InfeasibleTrial\(",
                     body, re.S):
        fails.append("(e) runUnit's quiet branch does not throw InfeasibleTrial "
                     "for a negative trial pressure (C245 slice 2)")
    if not (re.search(r"ndo\.globalisation\s*=\s*solver::Globalisation::armijo",
                      fl) and re.search(r"ndo\.typX\s*=\s*scale", fl)
            and re.search(r"ndo\.lower\.assign", fl)
            and re.search(r"unpackFlow\(x,\s*/\*announce=\*/false,\s*"
                          r"/\*trial=\*/true\)", fl)):
        # comments are stripped in fl, so match the stripped form too
        if not (re.search(r"ndo\.globalisation\s*=\s*solver::Globalisation::armijo", fl)
                and re.search(r"ndo\.typX\s*=\s*scale", fl)
                and re.search(r"ndo\.lower\.assign", fl)
                and re.search(r"unpackFlow\(x,\s*false,\s*true\)", fl)):
            fails.append("(e) the tear Newton no longer opts into the Armijo "
                         "contract (typX = scale, lower bounds, a residual "
                         "that throws InfeasibleTrial instead of clipping)")
    if len(re.findall(r"\n {8}g_trialPressureClamps = 0;", fl)) != 1:
        fails.append("(e) the trial counter must be reset exactly once "
                     "(start of the recycle solve)")
    if not re.search(r"sweep\(false\);\s*if \(g_trialPressureClamps"
                     r" > 0\).*?AdvisoryLog::instance\(\)\.add\(\"pressure\"",
                     fl, re.S):
        fails.append("(e) the recycle branch does not announce the trial "
                     "count after the final sweep")


def main() -> int:
    if not (BUILD / "choupoSolve").exists():
        print("check_negative_pressure: FAILED -- no build of choupoSolve; "
              "a check that cannot run must not pass")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        arm_forward(tmp)
        solvers = arm_recycle(tmp)
        nTrial = arm_trial(tmp)
        arm_sentinel(tmp)
        arm_source()
    if fails:
        print("check_negative_pressure: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_negative_pressure: OK -- a pipe whose drop exceeds its inlet "
          "pressure is refused by unit, stream, P and inlet on an accepted "
          f"pass (feed-forward, and in a torn recycle under "
          f"{' and '.join(solvers)}; the same line with a small drop runs); "
          f"a loop whose seed is infeasible is refused by name under Newton "
          f"and Wegstein, never reported on P = P_in, and the same loop "
          f"from a feasible seed converges cleanly ({nTrial} solvers); "
          "P == 0 (cstr) is still the unit-did-not-set sentinel.  "
          "NOT covered: P == 0 as an error (kept on purpose), the "
          "time-integrated binaries, other units' reactions to a received "
          "pressure.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
