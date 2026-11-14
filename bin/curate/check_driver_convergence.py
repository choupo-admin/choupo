#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a recycle's PRESSURE is a tear variable, and every outer driver
reads a point's result through the ONE verdict `simulationFailure`.

    bin/curate/check_driver_convergence.py

WHY THIS EXISTS (2026-11-01, DEV.md 4c C186 item (5) and the OPEN note on the
sibling drivers; the record is docs/design/a-tear-has-a-pressure.md).

(A) PRESSURE.  `packTears` and the Newton coordinates carried F, z (or the
    component flows) and T per tear stream -- not P.  A loop whose units drop
    the pressure and nothing in it sets one (a mixer takes the lowest inlet
    P, a pipe drops it, a splitter returns it) has NO pressure-consistent
    steady state, yet the tear test saw nothing move: reproduced on the loop
    this gate builds, before the fix: "Recycle converged in 1 Newton
    iteration(s) (|r|2 = 1.086e-10)", exit 0, the tear stream handed 5.000
    bar and the loop returning 3.006 bar.  P now rides in the tear vector
    (Wegstein and Newton), and a recycle that does not close on a tear's
    pressure is NOT converged and says so by stream name.

(B) THE SIBLING DRIVERS.  `OptimizationDriver` reads its evaluations through
    `simulationFailure` (check_optimiser_converged).  `sweep`, `gridSweep`
    and `designSpec` did not: a sweep put an unconverged point's responses
    in its table, a gridSweep treated only a THROW as a failed point, and
    designSpec priced its targets off the last iterate.  Each now reads the
    point through the same function; a failed point is named with its
    coordinates and published as nan (never as numbers); a run whose every
    point failed refuses by name.

WHAT THIS GATE CHECKS.
  (a) PRESSURE LOOP (built here from the pipe01 water data): mixer -> pipe
      -> splitter with the recycle torn.  Newton AND Wegstein must exit
      non-zero, print `[recycle] tear 'recycle': ... PRESSURE`, and print no
      "Recycle converged".  The NEGATIVE: the same loop with a valve to a
      fixed pressure after the pipe converges (exit 0, "Recycle converged"),
      so the refusal is about the missing pressure, not about pressure.
  (b) ALL FAIL.  A copy of cavett01 with `recycleMaxIter 2` under a sweep, a
      gridSweep and a designSpec outerDict: each exits non-zero, names every
      failed point with its coordinates, refuses by name ("every one of the
      N ... FAILED" / "evaluation 1 FAILED"), and the sweep CSVs hold nan
      only.
  (c) PARTLY FAILING.  The same copy with `recycleMaxIter` PARTIAL_CAP under
      a sweep: the rows that failed are nan and equal in number to the FAILED
      lines; the rows that did not are finite.
  (d) UNCHANGED WHERE NOTHING FAILS.  The converging copy: no FAILED line, a
      finite CSV, exit 0 (the corpus sweeps are held by bin/runTests --scope).
  (e) SOURCE.  Every `simulator_(` call in DesignSpec / GridSweepDriver /
      SweepDriver is followed by simulationFailure( before its result is
      read; simulationFailure is defined once (ResponseExtractor.cpp) and is
      the only reader of `.converged` there; Flowsheet.cpp's packTears and
      the Newton packFlow/unpackFlow both carry `.P`.

  (f) RELAXATION (DEV.md 4c C246 (2)).  process03_recycle under
      `recycleSolver directSubstitution;` with `recycleRelaxation` 1.0, 0.5
      and 0.3: all three converge to the SAME tear (F and T within 1e-3
      relative), and the loop is linear enough near its answer that the
      theory holds -- the late-pass contraction ratio of |dtear| under w is
      1 - w (1 - a), with a read off the w = 1 run (within 0.08), so the
      pass counts rise 1.0 < 0.5 < 0.3.  The refusals: a factor beside
      `recycleSolver Newton` (a number nothing reads), w = 1.5 and w = 0
      (outside (0, 1]), each by name; the declared factor is ANNOUNCED.
  (g) THE PER-TYPE KNOBS AND THE UNREAD KEY (C246 (3)).  An unknown
      top-level solverDict key is refused by name; `recycleMaxStep` is
      announced and a non-positive one refused; `cstr { maxStepExtent }`
      and `distillationColumn { maxStepT maxStepX }` run and are announced,
      a non-positive value is refused; `lineSearch none` is the SAME choice
      as the operation's `newton legacy` (announced), declaring both is
      refused, as are a cap beside the legacy Newton and a bad word.

WHAT THIS GATE DOES NOT COVER, so its green line cannot imply it: whether a
corpus loop with a pressure-changing unit SHOULD be pressure-consistent
(the corpus cases run through bin/runTests --scope; this gate sees the
refusal's shape); a loop whose pressure closes only through a unit this
gate does not build (a pump, a compressor) -- the valve is the witness; the
energy-tear (heat-link) Wegstein feedback, which is a different vector.

SABOTAGE-VERIFIED 2026-11-01 by hand, each restored and the engine rebuilt
before the next; OBSERVED output, abridged:

  S1 -- the Newton unpackFlow's `s.P = v[off++];` made `off++;` (the tear's
        P never set from the trial vector):
          (a) Newton: the pressure loop exited 2 with the by-stream refusal
              ABSENT (the pipe refused a vapour feed at 1346 Pa -- the
              pressure collapsing unchecked)
          (e) the Newton unpackFlow does not set the tear's P
  S2 -- simulationFailure()'s test made `if (false && !r.converged)`:
          (b) sweep and gridSweep exited 0 with the refusal ABSENT;
              designSpec exited 1 with its by-name refusal ABSENT
          (c) recycleMaxIter 8: 0 FAILED lines, 0 nan rows, 5 finite rows
          Arm (e) did NOT fire: a dead read still spells `.converged`, the
          same limit check_optimiser_converged records for its S1.
  S3 -- GridSweepDriver's verdict test replaced by an empty string (only a
        throw is a failed point, the pre-fix behaviour):
          (b) gridSweep exited 0, the all-fail refusal ABSENT
          (e) the `simulator_(` call at line ~109 is not followed by
              simulationFailure( before its result is read
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
CAV = "tutorials/steady/flowsheets/cavett01_recycle_train"
PIPE = "tutorials/steady/hydraulics/pipe01_water_line"

#  Same measurement as check_optimiser_converged: with recycleMaxIter 8 the
#  Newton on cavett01's tears converges at FL2 T <= 324 K and not at 326 K.
PARTIAL_CAP = 8

fails = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BUILD / "choupoSolve"), "."], cwd=case,
                       capture_output=True, text=True, timeout=900, env=env)
    return p.returncode, p.stdout + p.stderr


# ---------------------------------------------------------------- fixtures
FEED = """componentMolarFlows
{
    water    1000 kmol/h;
}

T               300 K;
P               500000 Pa;
"""

LOOP_UNITS = """units
(
    { name M1; type mixer; inputs ( feed recycle ); outputs ( mixed ); }
    {
        name P1; type pipe; model Churchill; in mixed; outputs ( %(pipeOut)s );
        operation { geometry { D 0.4 m; L 50.0 m; roughness 4.6e-5 m; dz 0.5 m; } }
    }
%(valve)s
    { name S1; type splitter; in downstream; outputs ( recycle product ); operation { fractions ( 0.5 0.5 ); } }
);
"""
VALVE = ("    { name V1; type valve; in piped; outputs ( downstream ); "
         "operation { P 1.5 bar; } }")


def make_loop(tmp: Path, tag: str, solver: str, valve: bool) -> Path:
    d = tmp / tag
    (d / "system").mkdir(parents=True)
    (d / "0").mkdir()
    shutil.copytree(ROOT / PIPE / "constant", d / "constant", symlinks=True)
    shutil.copy(ROOT / PIPE / "system" / "controlDict", d / "system")
    (d / (tag + ".cho")).write_text("")
    (d / "system" / "flowsheetDict").write_text(LOOP_UNITS % {
        "pipeOut": "piped" if valve else "downstream",
        "valve": VALVE if valve else ""})
    (d / "system" / "solverDict").write_text(
        f"tearStreams ( recycle );\nrecycleSolver {solver};\n"
        "recycleTol 1e-5;\nrecycleMaxIter 60;\n")
    names = ["feed", "recycle", "mixed", "downstream", "product"]
    if valve:
        names.append("piped")
    for n in names:
        f = FEED
        if n == "recycle":
            f = f.replace("1000 kmol", "500 kmol")
        if n == "mixed":
            f = f.replace("1000 kmol", "1500 kmol")
        (d / "0" / n).write_text(f)
    return d


def make_cav(tmp: Path, tag: str, outer: str, cap) -> Path:
    dst = tmp / tag
    shutil.copytree(ROOT / CAV, dst, symlinks=True,
                    ignore=shutil.ignore_patterns("expected", "*.csv",
                                                  "converged", "*.log",
                                                  "reports", "latest*"))
    sd = dst / "system" / "solverDict"
    txt, n = re.subn(r"^recycleMaxIter\s+\d+\s*;", f"recycleMaxIter {cap};",
                     sd.read_text(), flags=re.M)
    if n != 1:
        raise RuntimeError("cavett01's solverDict no longer declares "
                           "recycleMaxIter once -- re-read the fixture")
    sd.write_text(txt)
    (dst / "system" / "outerDict").write_text(outer)
    return dst


OUT_SWEEP = """type sweep;
parameter { target units[0].operation.T; range ( 318 326 ); nPoints %d; }
responses ( P1.F );
report { format csv; file tfx_sweep.csv; }
"""
OUT_GRID = """type gridSweep;
parameters ( { target units[0].operation.T; range ( 318 326 ); nPoints 2; }
             { target units[1].operation.T; range ( 306 310 ); nPoints 2; } );
responses ( P1.F );
report { format csv; file tfx_grid.csv; }
"""
OUT_DS = """type designSpec;
manipulate ( { variable streams.feed.F; initial 7500 kmol/h; min 5000 kmol/h; max 20000 kmol/h; } );
targets ( { path P1.F; value 12000 kmol/h; tol 1 kmol/h; } );
options { maxIter 10; tolF 1.0; fdStep 1e-3; }
report { file tfx_ds.csv; }
"""

FAILED_SWEEP = re.compile(r"\[point (\d+)\s+units\[0\]\.operation\.T = ([0-9.]+)\]"
                          r"\s+FAILED -- the simulation did not converge")
FAILED_GRID = re.compile(r"\[point \d+\s+A=[0-9.]+ B=[0-9.]+\]\s+FAILED -- "
                         r"the simulation did not converge")


def csv_rows(case: Path, name: str):
    f = case / name
    if not f.exists():
        return []
    return [l.split(",") for l in f.read_text().strip().splitlines()[1:]]


# ------------------------------------------------------------------ arms
def arm_pressure(tmp: Path):
    seen = []
    for solver in ("Newton", "Wegstein"):
        rc, out = run(make_loop(tmp, "loop" + solver, solver, False))
        if rc == 0 or "Recycle converged" in out \
                or not re.search(r"\[recycle\] tear 'recycle': the loop does "
                                 r"not close on PRESSURE", out):
            fails.append(f"(a) {solver}: the pressure-inconsistent loop "
                         f"exited {rc}"
                         f"{' and reported Recycle converged' if 'Recycle converged' in out else ''}"
                         f"; named-by-stream refusal "
                         f"{'present' if '[recycle] tear' in out else 'ABSENT'}:\n"
                         + out[-700:])
        else:
            seen.append(solver)
        rc, out = run(make_loop(tmp, "valve" + solver, solver, True))
        if rc != 0 or "Recycle converged" not in out or "[recycle] tear" in out:
            fails.append(f"(a) {solver}: the loop with a valve to a fixed P "
                         f"must converge (exit {rc}):\n" + out[-700:])
    return seen


def arm_allfail(tmp: Path):
    seen = []
    for tag, outer, refusal, csvn in (
            ("sweep", OUT_SWEEP % 3, r"SweepDriver: every one of the 3 sweep "
             r"point\(s\) FAILED", "tfx_sweep.csv"),
            ("grid", OUT_GRID, r"GridSweepDriver: every one of the 4 grid "
             r"point\(s\) FAILED", "tfx_grid.csv"),
            ("designSpec", OUT_DS, r"DesignSpec: evaluation 1 FAILED at "
             r"\(\$streams\.feed\.F = [0-9.]+\) -- the simulation did not "
             r"converge", None)):
        case = make_cav(tmp, "allfail_" + tag, outer, 2)
        rc, out = run(case)
        if rc == 0 or not re.search(refusal, out):
            fails.append(f"(b) {tag} on an all-failing recycle exited {rc}; "
                         f"refusal {refusal!r} "
                         f"{'present' if re.search(refusal, out) else 'ABSENT'}"
                         f":\n{out[-600:]}")
            continue
        if tag == "sweep" and len(FAILED_SWEEP.findall(out)) != 3:
            fails.append("(b) sweep: not every failed point was named with "
                         "its coordinate")
        if tag == "grid" and len(FAILED_GRID.findall(out)) != 4:
            fails.append("(b) gridSweep: not every failed point was named "
                         "with its coordinates")
        if csvn:
            rows = csv_rows(case, csvn)
            if not rows or any(r[-1] != "nan" for r in rows):
                fails.append(f"(b) {tag}: the CSV holds a number for an "
                             f"unconverged point: {rows}")
        seen.append(tag)
    return seen


def arm_partial(tmp: Path):
    case = make_cav(tmp, "partial", OUT_SWEEP % 5, PARTIAL_CAP)
    rc, out = run(case)
    named = FAILED_SWEEP.findall(out)
    rows = csv_rows(case, "tfx_sweep.csv")
    nan = [r for r in rows if r[-1] == "nan"]
    fin = [r for r in rows if r[-1] != "nan"]
    ok = (len(named) > 0 and len(fin) > 0 and len(named) == len(nan)
          and {n[0] for n in named} == {r[0] for r in nan}
          and all(re.fullmatch(r"[-+0-9.e]+", r[-1]) for r in fin))
    if not ok or rc == 0:
        fails.append(f"(c) recycleMaxIter {PARTIAL_CAP}: {len(named)} FAILED "
                     f"line(s), {len(nan)} nan row(s), {len(fin)} finite "
                     f"row(s), exit {rc} (a sweep with a failed point exits "
                     f"non-zero); the fixture may no longer partition -- "
                     f"re-measure PARTIAL_CAP:\n{out[-500:]}")
    return len(named), len(rows)


def arm_clean(tmp: Path):
    case = make_cav(tmp, "clean", OUT_SWEEP % 3, 300)
    rc, out = run(case)
    rows = csv_rows(case, "tfx_sweep.csv")
    if rc != 0 or FAILED_SWEEP.search(out) or len(rows) != 3 \
            or any(r[-1] == "nan" for r in rows):
        fails.append(f"(d) the converging copy exited {rc}, FAILED line "
                     f"{'present' if FAILED_SWEEP.search(out) else 'absent'},"
                     f" rows {rows}:\n{out[-500:]}")
    return rc == 0


def copy_case(tmp: Path, rel: str, tag: str) -> Path:
    d = tmp / tag
    shutil.copytree(ROOT / rel, d, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "resultJson*", "converged", "reports"))
    return d


def set_solver_dict(case: Path, text: str, replace_solver: str = None):
    """Write system/solverDict; `replace_solver` swaps the shipped
    `recycleSolver <word>;` line first."""
    sd = case / "system" / "solverDict"
    base = sd.read_text() if sd.exists() else ""
    if replace_solver is not None:
        base = re.sub(r"^recycleSolver\s+\w+;.*$",
                      f"recycleSolver {replace_solver};", base, flags=re.M)
    sd.write_text(base + "\n" + text + "\n")


PROC3 = "tutorials/steady/flowsheets/process03_recycle"
TAIL_TOL = 0.08


def tear_table(out: str):
    """|dtear| per pass from the recycle outer-loop table."""
    i = out.find("Recycle outer loop")
    j = out.find("Recycle converged", i)
    if i < 0 or j < 0:
        return []
    return [float(m.group(2)) for m in re.finditer(
        r"^\s+(\d+)\s+([0-9.]+e[+-]\d+)\s", out[i:j], re.M)]


def final_tear(out: str):
    last = None
    for m in re.finditer(r"^\s+recycle\s+F = ([0-9.eE+-]+)\s+kmol/h\s+T = "
                         r"([0-9.eE+-]+)\s+K", out, re.M):
        last = (float(m.group(1)), float(m.group(2)))
    return last


def arm_relaxation(tmp: Path):
    res = {}
    for w in (1.0, 0.5, 0.3):
        c = copy_case(tmp, PROC3, f"rlx{w}")
        set_solver_dict(c, f"recycleRelaxation {w};", "directSubstitution")
        rc, out = run(c)
        m = re.search(r"Recycle converged in (\d+) DirectSubstitution", out)
        if rc != 0 or not m:
            fails.append(f"(f) w={w}: exit {rc}, no DirectSubstitution "
                         f"convergence line:\n{out[-500:]}")
            return None
        if f"recycle relaxation w = {w:.4f}" not in out and w != 1.0:
            fails.append(f"(f) w={w}: the declared factor is not announced")
        res[w] = (int(m.group(1)), tear_table(out), final_tear(out))
    n1, n5, n3 = res[1.0][0], res[0.5][0], res[0.3][0]
    if not (n1 < n5 < n3):
        fails.append(f"(f) pass counts not monotone in 1/w: w=1 {n1}, "
                     f"w=0.5 {n5}, w=0.3 {n3}")
    t1 = res[1.0][2]
    for w in (0.5, 0.3):
        t = res[w][2]
        if not t1 or not t or abs(t[0] - t1[0]) > 1e-3 * abs(t1[0]) \
                or abs(t[1] - t1[1]) > 1e-3 * abs(t1[1]):
            fails.append(f"(f) w={w} reached a different tear {t} than "
                         f"w=1 {t1}")
    d1 = res[1.0][1]
    if len(d1) >= 4 and d1[-3] > 0 and d1[-2] > 0:
        a = d1[-2] / d1[-3]
        for w in (0.5, 0.3):
            d = res[w][1]
            r = d[-2] / d[-3] if len(d) >= 3 and d[-3] > 0 else float("nan")
            pred = 1.0 - w * (1.0 - a)
            if not abs(r - pred) <= TAIL_TOL:
                fails.append(f"(f) w={w}: late contraction ratio {r:.3f} vs "
                             f"linear theory 1 - w(1 - a) = {pred:.3f} "
                             f"(a = {a:.3f} from the w = 1 run)")
    else:
        fails.append("(f) the w = 1 table is too short to read a late ratio")
    for tag, solver, line, what in (
            ("rlxNewton", "Newton", "recycleRelaxation 0.5;",
             "recycleRelaxation is declared but recycleSolver is"),
            ("rlxBig", "directSubstitution", "recycleRelaxation 1.5;",
             "must lie in (0, 1]"),
            ("rlxZero", "directSubstitution", "recycleRelaxation 0;",
             "must lie in (0, 1]")):
        c = copy_case(tmp, PROC3, tag)
        set_solver_dict(c, line, solver)
        rc, out = run(c)
        if rc == 0 or what not in out:
            fails.append(f"(f) {tag}: expected a refusal containing "
                         f"'{what}', got exit {rc}:\n{out[-300:]}")
    return n1, n5, n3


def expect_refused(tmp, tag, rel, text, what, solver=None, edit=None):
    c = copy_case(tmp, rel, tag)
    if edit:
        edit(c)
    set_solver_dict(c, text, solver)
    rc, out = run(c)
    if rc == 0 or what not in out:
        fails.append(f"(g) {tag}: expected a refusal containing '{what}', "
                     f"got exit {rc}:\n{out[-300:]}")


def expect_runs(tmp, tag, rel, text, announce):
    c = copy_case(tmp, rel, tag)
    set_solver_dict(c, text)
    rc, out = run(c)
    if rc != 0 or announce not in out:
        fails.append(f"(g) {tag}: expected exit 0 announcing '{announce}', "
                     f"got exit {rc}:\n{out[-400:]}")


COL = "tutorials/steady/distillation/column02_simultaneous"
STRIP = "tutorials/steady/distillation/stripper02_sour_water_h2s"
CSTR = "tutorials/steady/reactors/cstr03_series_selectivity"
CIRCUIT = "tutorials/steady/solids/circuit01_herbstFuerstenau_closedCircuit"


def arm_knobs(tmp: Path):
    expect_refused(tmp, "unk", PROC3, "bogusKnob 1;", "'bogusKnob' is not a")
    expect_runs(tmp, "tearcap", PROC3, "recycleMaxStep 0.5;",
                "tear Newton step cap = 0.5")
    expect_refused(tmp, "tearcap0", PROC3, "recycleMaxStep 0;",
                   "recycleMaxStep must be > 0")
    expect_runs(tmp, "cstrcap", CSTR, "cstr { maxStepExtent 0.5; }",
                "maxStepExtent = 0.5")
    expect_refused(tmp, "cstrneg", CSTR, "cstr { maxStepExtent -1; }",
                   "maxStepExtent")
    expect_runs(tmp, "colcap", COL,
                "distillationColumn { maxStepT 20 K; maxStepX 0.2; }",
                "maxStepT = 20")
    expect_refused(tmp, "colneg", COL,
                   "distillationColumn { maxStepX -0.1; }", "maxStepX")
    expect_runs(tmp, "colnone", COL, "distillationColumn { lineSearch none; }",
                "lineSearch none")
    expect_refused(tmp, "colboth", STRIP,
                   "distillationColumn { lineSearch armijo; }",
                   "ONE choice")
    expect_refused(tmp, "colcapnone", COL,
                   "distillationColumn { lineSearch none; maxStepT 10 K; }",
                   "not read by the legacy Newton")
    expect_refused(tmp, "colword", COL,
                   "distillationColumn { lineSearch maybe; }",
                   "`lineSearch` must be")
    #  C361 slice 3: a tear that carries a size distribution on the grid is
    #  iterated by the fixed-point loop only; Newton on it (which could not
    #  even start on a dry solids recycle) is refused by tear name.
    def newton_on_grid_tear(c):
        fd = c / "system" / "flowsheetDict"
        t = fd.read_text()
        assert "recycleSolver  directSubstitution;" in t
        fd.write_text(t.replace("recycleSolver  directSubstitution;",
                                "recycleSolver  Newton;"))
    expect_refused(tmp, "gridnewton", CIRCUIT, "// no solver override",
                   "recycleSolver Newton cannot converge tear 'recycle'",
                   edit=newton_on_grid_tear)


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"//[^\n]*", "", src)


def arm_source():
    n = 0
    readers = re.compile(r"\b(extractResponse|largestOf|evaluateConstraint|"
                         r"emitResultJson|PostProcessor::buildChain)\s*\(")
    for fn in ("DesignSpec.cpp", "GridSweepDriver.cpp", "SweepDriver.cpp"):
        code = strip_comments((SRC / "outerDriver" / fn).read_text())
        for m in re.finditer(r"\bsimulator_\(", code):
            tail = code[m.start():]
            home = tail.find("simulationFailure(")
            read = readers.search(tail)
            line = code.count("\n", 0, m.start()) + 1
            if home < 0 or (read and read.start() < home):
                fails.append(f"(e) {fn}: the `simulator_(` call at line "
                             f"~{line} is not followed by simulationFailure( "
                             "before its result is read")
            n += 1
        #  `result.converged` in SweepDriver gates the representative point
        #  and the post chain AFTER the verdict was taken; the two other
        #  spellings a SimulationResult is read through are refused.
        if re.search(r"\b(r|finalResult)\.converged", code):
            fails.append(f"(e) {fn} reads a SimulationResult's `.converged` "
                         "itself instead of going through simulationFailure()")
    if n < 4:
        fails.append(f"(e) only {n} `simulator_(` site(s) found in the three "
                     "drivers (expected 4: designSpec x2 (residual, replay), "
                     "gridSweep, sweep)")
    rx = strip_comments((SRC / "outerDriver" / "ResponseExtractor.cpp").read_text())
    m = re.search(r"std::string simulationFailure\(const SimulationResult& "
                  r"\w+\)\s*\{(.*?)\n\}", rx, re.S)
    if not m or ".converged" not in m.group(1):
        fails.append("(e) ResponseExtractor.cpp's simulationFailure() does "
                     "not read `.converged`")
    od = strip_comments((SRC / "outerDriver" / "OptimizationDriver.cpp").read_text())
    if re.search(r"std::string simulationFailure\(", od):
        fails.append("(e) OptimizationDriver.cpp defines its own "
                     "simulationFailure -- two homes for one verdict")
    fl = strip_comments((SRC / "unitOperations" / "flowsheet" / "Flowsheet.cpp").read_text())
    pk = re.search(r"sVector packTears\(.*?\n\}", fl, re.S)
    if not pk or ".P" not in pk.group(0):
        fails.append("(e) packTears does not carry the tear's P")
    up = re.search(r"void unpackTears\(.*?\n\}", fl, re.S)
    if not up or "s.P" not in up.group(0):
        fails.append("(e) unpackTears does not set the tear's P")
    pf = re.search(r"auto packFlow = .*?\n            \};", fl, re.S)
    uf = re.search(r"auto unpackFlow = .*?\n            \};", fl, re.S)
    if not pf or "s.P" not in pf.group(0):
        fails.append("(e) the Newton packFlow does not carry the tear's P")
    if not uf or "s.P" not in uf.group(0):
        fails.append("(e) the Newton unpackFlow does not set the tear's P")
    return n


def main() -> int:
    if not (BUILD / "choupoSolve").exists():
        print("check_driver_convergence: FAILED -- no build of choupoSolve; "
              "a check that cannot run must not pass")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        solvers = arm_pressure(tmp)
        allfail = arm_allfail(tmp)
        nPart, nTot = arm_partial(tmp)
        clean = arm_clean(tmp)
        relax = arm_relaxation(tmp)
        arm_knobs(tmp)
        nSites = arm_source()
    if fails:
        print("check_driver_convergence: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_driver_convergence: OK -- a tear carries its pressure: a "
          "mixer -> pipe -> splitter recycle with no pressure set in the loop "
          f"is refused by tear name under {' and '.join(solvers)} (and the "
          "same loop with a valve to a fixed P converges); an unconverged "
          "simulation is a failed point in "
          f"{', '.join(allfail)} (all-fail refuses by name, failed points "
          f"named with coordinates and published as nan: {nPart} of {nTot} "
          f"points failed at recycleMaxIter {PARTIAL_CAP}); the converging "
          f"copy is unchanged ({'held' if clean else 'NOT held'}); "
          f"directSubstitution with recycleRelaxation 1.0 / 0.5 / 0.3 takes "
          f"{relax[0] if relax else '?'} / {relax[1] if relax else '?'} / "
          f"{relax[2] if relax else '?'} passes to one tear, its late ratio "
          "following 1 - w (1 - a), misdeclared factors and unread solverDict "
          f"keys refused by name; {nSites} "
          "`simulator_(` site(s) read the verdict through simulationFailure() "
          "first.  NOT covered: whether a corpus loop should be "
          "pressure-consistent (bin/runTests --scope), pumps/compressors as "
          "the setter of P, the energy-tear Wegstein vector.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
