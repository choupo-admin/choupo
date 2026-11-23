#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: choupoBatch steps freely and writes by dense output (DEV.md 4c C471).

    bin/curate/check_batch_dense_output.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  Under `timeStepping adaptive;` the batch driver
cut the integrator's step at EVERY write point, so an AramcoMech 1.3 ignition run with
2500 write points took 2500 steps whatever the error asked for (and wrote 2500 `<t>/`
directories): 33-49 s against Cantera's 4-7 s (docs/reviews/2026-11-21-aramcomech-
validation/REPORT.md).  No golden sees it (the numbers were right) and no closure sees it.

WHAT THIS GATE CHECKS (choupoBatch on a private copy of tutorials/batch/reactor/
batch06_adaptive_runaway on a 0.5 s write grid: one batchReactor, 1201 write points):

  (a) THE STEP IS FREE.  The accepted steps printed in the step history number at most
      one quarter of the write points.  The old code gave exactly one step per write
      point or more.
  (b) THE ROWS ARE RIGHT.  Every trajectory.csv row equals the row of the same case with
      `deltaTmax` declared at writeInterval (the step cut at each write point, the old
      behaviour; batch06 runs at rtol 1e-6), T to 1e-5 relative, every species to
      5e-4 of the total moles.
  (c) THE DIRECTORIES HAVE THEIR OWN CADENCE.  The default writes at most 101 `<t>/`
      (1201 write points is the case the cadence is for), trajectory.csv keeps all 1201
      rows, `solutionControl { interval 50; }` (100 write intervals) writes 12, and an
      interval that is not a whole multiple of writeInterval is refused by name.

  (d) THE DEFAULT TOLERANCE WATCHES THE RADICALS.  ignition02 made adaptive at the
      case's DEFAULT rtol/atol, against a tight reference (rtol 1e-11, atol 1e-20): the
      ignition delay agrees to one write interval and T at 41 us to 1 %.  The defect:
      a uniform atol of 1e-9 kmol on a 2.5e-5 kmol vessel left ppm radicals out of the
      error test (T(41 us) 2418 K against a truth of 1280 K at commit 516fd3c55d).
  (e) THE INTERPOLATED ROWS CONSERVE THE ELEMENTS.  The same case at rtol 1e-3 (big
      steps, so most rows are interpolated): the H, O and N atoms of every row equal
      those of row 0 to 1e-7 relative.  The defect: a log-space interpolant on the
      species rows broke the atom balance by 7e-5 inside a step.
  (f) THE DIRECTORIES STAY RESTARTABLE.  batch20 (a fixed bed that writes
      <t>/<bed>.profile) writes a profile only into a directory the cadence gives, and
      every directory holds internalStates/; batch24_tsa_until_css writes a directory at
      the instant `repeat untilCSS` stops.

  (g) THE GRID OF A STIFF NETWORK IS HELD TO A TIGHT REFERENCE (C473 h).  The 235-reaction
      nox03_millerbowman_large on a 1 ms write grid, free stepping, at rtol 1e-8 under
      seulex, Rodas4 and Rosenbrock23, against the same case at rtol 1e-11 (Rodas4,
      atol 1e-20): the worst |value - reference| / column maximum over the grid is below a
      bound set about 3x above what the integrators' OWN dense outputs reach and well
      below what the driver's cubic Hermite did.  THE DEFECT: the Hermite multiplied the
      end-state difference of a trace radical by lambda*h (f(y_end) enters times h), so
      under seulex the interior rows were 4e-2 of a column maximum from the truth while
      every step end was right to 1e-8; finer writing and a tighter rtol did not help
      (docs/reviews/2026-11-22-densesparse).  No golden saw it (the goldens pinned the
      Hermite's rows) and no closure saw it (the Hermite keeps the atoms).

  (h) THE ARM HAS TEETH.  The same case with `solver { denseOutput hermite; }` (the driver's
      cubic Hermite, a declared key, announced in the run) shows the 4e-2 of arm (g)'s defect
      (so a bound that no longer sees it would fail here), and a value other than
      integrator | hermite is refused by name.

  (i) A NON-STIFF WITNESS.  batch06_adaptive_runaway (an adiabatic esterification, no stiffness)
      under seulex at rtol 1e-4 on its 0.5 s grid, against the same case at rtol 1e-11 (Rodas4):
      the worst grid deviation is bounded.  THE DEFECT (the Opus review, 2026-11-22): a first
      version took the left-end derivatives of the seulex polynomial from ONE column, a raw
      one-sided Euler difference that is never extrapolated, and on a non-stiff step the
      interpolant was 10-90x worse than the Hermite it replaced (Prothero-Robinson at
      lambda = -1: 1.7e-2 against 1.1e-3) while arm (g), a stiff case, did not see it.
      IN-SAMPLE: the bounds of (g) and (i) were set from nox03 and this one case; no other
      network has been measured, and the polynomial's error is NOT controlled by the step.

NOT CHECKED: the order of the interpolant (Theory Guide sec:batch-dense-output), a vessel
other than batchReactor (those keep the write grid as the step boundary and are covered by
their own goldens).
"""
import csv
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

CASE = "tutorials/batch/reactor/batch06_adaptive_runaway"
STRIP = ("expected", "converged", "constant/propertyManifest")
#  The one directory walk below is over the gate's OWN scratch copy of the case (the
#  time directories an earlier run left in it), never over the tree.
SCAN_ROOTS = ()
#  Arm (g): the worst grid deviation, in column maxima, that nox03 may show at rtol 1e-8.  Measured with
#  the integrators' own dense outputs (2026-11-22, docs/reviews/2026-11-22-dense-output) and set about 3x
#  above it (Rosenbrock23 sits AT its method's step-end level, 4.2e-3); the driver's cubic Hermite gave 4e-2 (seulex),
#  1.9e-4 on the dense solver (Rodas4), 4.2e-3 (Rosenbrock23).  seulex is the arm that has teeth.
GRID_BOUND = {"seulex": 1.0e-3, "Rodas4": 3.0e-4, "Rosenbrock23": 1.5e-2}
MILD_BOUND = 1.0e-4     # arm (i): batch06 under seulex at rtol 1e-4 (measured 1.1e-5 with atol 1e-12 or the case's)
WI = 0.5     # the write interval of the probe: 1201 write points over the case's 600 s



def calibrated_nox03(c):
    """C477 gave nox03 a log write grid and a `routeIntegral` block; this gate's bounds were
    measured on its earlier shape (a uniform 1 ms grid, no routes), so the probe copy is put
    back in that shape: the routes' tiny cumulative columns are quadrature-level numbers that
    would be judged as state, and the log grid moves the rows the bounds were set on."""
    (Path(c) / "system/postDict").unlink(missing_ok=True)   # its log-axis figures refuse t = 0
    fd = Path(c) / "system/flowsheetDict"
    t = fd.read_text()
    m = re.search(r"\n[ \t]*routeIntegral\s*\{", t)
    if m:
        i = t.index("{", m.start()); d = 0
        for k in range(i, len(t)):
            if t[k] == "{": d += 1
            elif t[k] == "}":
                d -= 1
                if d == 0:
                    t = t[:m.start()] + t[k + 1:]
                    break
        fd.write_text(t)
    cd = Path(c) / "system/controlDict"
    s = cd.read_text()
    if re.search(r"^writeSpacing\s+log;", s, flags=re.M):
        s = re.sub(r"^writeSpacing[^\n]*\n", "writeInterval   1.0e-3;\n", s, flags=re.M)
        s = re.sub(r"^writeStart[^\n]*\n", "", s, flags=re.M)
        s = re.sub(r"^writePerDecade[^\n]*\n", "", s, flags=re.M)
        cd.write_text(s)

def run_variant(batch, deltaTmax, solution=""):
    """Run the case on the 0.5 s write grid with deltaTmax declared (or deleted: None); (rc, out, rows, ndirs)."""
    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        for d in Path(c).iterdir():          # time directories a earlier run left in the source tree
            if d.is_dir() and re.fullmatch(r"[0-9.eE+-]+", d.name) and d.name != "0":
                shutil.rmtree(d)
        cd = Path(c) / "system/controlDict"
        text = cd.read_text()
        text = re.sub(r"^writeInterval\s+[^;]+;", "writeInterval 0.5;", text, flags=re.M)
        text = re.sub(r"^\s*deltaTmax\s+[^;]+;[^\n]*\n", "" if deltaTmax is None else f"    deltaTmax {deltaTmax};\n",
                      text, flags=re.M)
        cd.write_text(text + "\n" + solution + "\n")
        rc, out = gatekit.run(batch, c, inside=True)
        rows = []
        p = Path(c) / "trajectory.csv"
        if p.exists():
            rows = list(csv.reader(open(p)))
        ndirs = len([d for d in Path(c).iterdir()
                     if d.is_dir() and re.fullmatch(r"[0-9.eE+-]+", d.name) and d.name != "0"])
        return rc, out, rows, ndirs


def clean(c):
    """Remove the time directories an earlier run left in the scratch copy."""
    for d in Path(c).iterdir():
        if d.is_dir() and re.fullmatch(r"[0-9.eE+-]+", d.name) and d.name != "0":
            shutil.rmtree(d)


def steps_in(out):
    i = out.find("adaptive step history")
    if i < 0:
        return 0
    return len(re.findall(r"^\s+[0-9]\.[0-9]+e[-+][0-9]+\s+[0-9]\.[0-9]+e[-+][0-9]+\s*$", out[i:], re.M))


def main():
    failures = []
    batch = gatekit.binary("choupoBatch")

    rcF, outF, rowsF, dirsF = run_variant(batch, None)
    rcC, outC, rowsC, dirsC = run_variant(batch, WI)
    if rcF or rcC or len(rowsF) < 100 or len(rowsF) != len(rowsC):
        return gatekit.verdict("check_batch_dense_output",
                               [f"did not run: free exit {rcF}, cut exit {rcC}, rows {len(rowsF)}/{len(rowsC)}"],
                               "")
    nWrite = len(rowsF) - 1          # data rows: t = 0 and every write point
    nF, nC = steps_in(outF), steps_in(outC)

    # (a) the step is free
    if "free stepping" not in outF:
        failures.append("(a) the run does not announce free stepping")
    if nF * 4 > nWrite:
        failures.append(f"(a) {nF} accepted steps for {nWrite} write points (> a quarter): the step is "
                        "still cut at the write points")
    if nC < nWrite // 2:
        failures.append(f"(a) the reference with deltaTmax = writeInterval took only {nC} steps for "
                        f"{nWrite} write points: the comparison below would not be against the cut run")

    # (b) the rows are those of the cut run (both at rtol 1e-10, so what differs is the
    #     interpolant and the length of the steps, not a loose tolerance)
    head = rowsF[0]
    nCols = [i for i, h in enumerate(head) if ".n_" in h]
    tCol = [i for i, h in enumerate(head) if h.endswith(".T")][0]
    wT = wN = 0.0
    for rf, rc_ in zip(rowsF[1:], rowsC[1:]):
        if abs(float(rf[0]) - float(rc_[0])) > 1e-12:
            failures.append("(b) the time columns differ")
            break
        total = sum(float(rc_[i]) for i in nCols)
        wT = max(wT, abs(float(rf[tCol]) - float(rc_[tCol])) / float(rc_[tCol]))
        for i in nCols:
            wN = max(wN, abs(float(rf[i]) - float(rc_[i])) / total)
    if wT > 1e-5:
        failures.append(f"(b) a temperature row differs from the cut run by {wT:.2e} relative > 1e-5")
    if wN > 5e-4:
        failures.append(f"(b) a species row differs from the cut run by {wN:.2e} of the total moles > 5e-4")


    # (c) the directories
    if dirsF > 101:
        failures.append(f"(c) the default wrote {dirsF} <t>/ directories for {nWrite} write points (> 101)")
    if len(rowsF) != 1202:
        failures.append(f"(c) trajectory.csv has {len(rowsF) - 1} rows, not 1201: the trajectory must keep every write point")
    rcI, outI, rowsI, dirsI = run_variant(batch, None, "solutionControl { interval 50; }")
    if rcI or dirsI != 12:
        failures.append(f"(c) interval = 100 writeIntervals wrote {dirsI} directories (expected 12, the last instant among them; exit {rcI})")
    rcB, outB, _, _ = run_variant(batch, None, "solutionControl { interval 0.7; }")
    if rcB == 0 or "whole multiple of writeInterval" not in outB:
        failures.append("(c) an interval that is not a whole multiple of writeInterval was not refused by name")

    # (d), (e): ignition02 made adaptive
    def ign(extra):
        with gatekit.probe_copy("tutorials/batch/combustion/ignition02_h2air_slack", strip=STRIP) as c:
            clean(c)
            cd = Path(c) / "system/controlDict"
            cd.write_text(cd.read_text() + "\ntimeStepping adaptive;\n" + extra
                          + "\nsolutionControl { write false; }\n")
            rc_, out_ = gatekit.run(batch, c, inside=True)
            p = Path(c) / "trajectory.csv"
            return rc_, out_, (list(csv.reader(open(p))) if p.exists() else [])

    rcR, outR, rowsR = ign("rtol 1e-11; atol 1e-20; deltaT0 1e-9;")
    rcD, outD, rowsD = ign("")
    rcL, outL, rowsL = ign("rtol 1e-3;")
    tauR = tauD = float("nan")
    dTau = dT41 = clos = float("nan")
    if rcR or rcD or rcL or len(rowsR) != len(rowsD):
        failures.append(f"(d) ignition02 probes did not run (exit {rcR}/{rcD}/{rcL})")
    else:
        def tau(out):
            m = re.search(r"tau_ign \(max dT/dt\) = ([0-9.e+-]+) s", out)
            return float(m.group(1)) if m else float("nan")
        tauR, tauD = tau(outR), tau(outD)
        hd = rowsR[0]
        tc = [i for i, h in enumerate(hd) if h.endswith(".T")][0]
        dT41 = abs(float(rowsD[42][tc]) - float(rowsR[42][tc])) / float(rowsR[42][tc])
        dTau = abs(tauD - tauR)
        if not dTau <= 1.0e-6 + 1e-12:
            failures.append(f"(d) at default tolerances the ignition delay is {tauD:.4e} s against {tauR:.4e} s of the "
                            "tight reference (> one write interval)")
        if not dT41 <= 1.0e-2:
            failures.append(f"(d) at default tolerances T(41 us) differs from the tight reference by {dT41:.2e} "
                            "relative (> 1e-2): the species rows' atol does not watch the radicals")
        # (e) atoms per species column: H2 O2 H O OH HO2 H2O2 water N2
        atoms = {"H2": (2, 0, 0), "O2": (0, 2, 0), "H": (1, 0, 0), "O": (0, 1, 0), "OH": (1, 1, 0),
                 "HO2": (1, 2, 0), "H2O2": (2, 2, 0), "water": (2, 1, 0), "N2": (0, 0, 2)}
        cols = {}
        for i, h in enumerate(rowsL[0]):
            if ".n_" in h:
                nm = h.split(".n_", 1)[1]
                if nm not in atoms:
                    failures.append(f"(e) species column {h} has no atom row in the gate: the arm cannot judge it")
                cols[i] = atoms.get(nm, (0, 0, 0))
        def inv(row):
            return [sum(float(row[i]) * a[k] for i, a in cols.items()) for k in range(3)]
        base = inv(rowsL[1])
        clos = 0.0
        for row in rowsL[2:]:
            v = inv(row)
            for k in range(3):
                if base[k] > 0:
                    clos = max(clos, abs(v[k] - base[k]) / base[k])
        if clos > 1.0e-7:
            failures.append(f"(e) an atom balance of an interpolated row is off by {clos:.2e} relative (> 1e-7)")
        if steps_in(outL) * 2 > len(rowsL) - 1:
            failures.append("(e) the rtol 1e-3 probe took a step per write point: its rows are not interpolated")

    # (f) restartable directories
    def beds(case, edit_wi=None):
        with gatekit.probe_copy(case, strip=STRIP) as c:
            clean(c)
            rc_, out_ = gatekit.run(batch, c, inside=True)
            dirs = sorted((d for d in Path(c).iterdir()
                           if d.is_dir() and re.fullmatch(r"[0-9.eE+-]+", d.name) and d.name != "0"),
                          key=lambda d: float(d.name))
            bad = [d.name for d in dirs if not (d / "internalStates").is_dir()]
            last = float(list(csv.reader(open(Path(c) / "trajectory.csv")))[-1][0]) if (Path(c) / "trajectory.csv").exists() else -1
            return rc_, bad, (float(dirs[-1].name) if dirs else -1), last, len(dirs)
    rc20, bad20, _, _, n20 = beds("tutorials/batch/adsorber/batch20_thermal_breakthrough")
    if rc20 or bad20 or n20 == 0:
        failures.append(f"(f) batch20: exit {rc20}, {len(bad20)} of {n20} directories lack internalStates/ "
                        f"(e.g. {bad20[:3]}): a fixed-bed profile was written into a directory the cadence skipped")
    rc24, bad24, lastDir, lastT, n24 = beds("tutorials/batch/adsorber/batch24_tsa_until_css")
    if rc24 or bad24 or abs(lastDir - lastT) > 1e-6 * max(1.0, lastT):
        failures.append(f"(f) batch24_tsa_until_css: the last directory is t = {lastDir:g} but the run stopped at "
                        f"t = {lastT:g} (exit {rc24})")

    # (g) the grid of a stiff network against a tight reference
    def nox(integ, rtol, atol, solver_extra=""):
        with gatekit.probe_copy("tutorials/batch/combustion/nox03_millerbowman_large", strip=STRIP) as c:
            clean(c)
            calibrated_nox03(c)
            fd = Path(c) / "system/flowsheetDict"
            fd.write_text(re.sub(r"integrator\s+\w+;", f"integrator {integ}; {solver_extra}", fd.read_text()))
            cd = Path(c) / "system/controlDict"
            t = re.sub(r"rtol\s+[0-9.eE+-]+;", f"rtol {rtol};", cd.read_text())
            t = re.sub(r"atol\s+[0-9.eE+-]+;", f"atol {atol};", t)
            t = re.sub(r"\n\s*deltaTmax[^\n]*", "", t)
            cd.write_text(t + "\nsolutionControl { write false; }\n")
            rc_, out_ = gatekit.run(batch, c, inside=True)
            p = Path(c) / "trajectory.csv"
            nox.out = out_
            return rc_, (list(csv.reader(open(p))) if p.exists() else [])
    rcT, refRows = nox("Rodas4", "1e-11", "1e-20")
    worstG = {}
    if rcT or len(refRows) < 31:
        failures.append(f"(g) the tight reference of nox03 did not run (exit {rcT}, {len(refRows)} rows)")
    else:
        ref = [[float(x) for x in r] for r in refRows[1:]]
        colmax = [max(abs(r[j]) for r in ref) or 1.0 for j in range(len(ref[0]))]
        for integ, bound in GRID_BOUND.items():
            rcG, rowsG = nox(integ, "1e-8", "1e-15")
            if rcG or len(rowsG) != len(refRows):
                failures.append(f"(g) nox03 under {integ} did not run or wrote {len(rowsG)} rows (exit {rcG})")
                continue
            w = 0.0
            for rg, rr in zip(rowsG[1:], ref):
                for j in range(1, len(rr)):
                    w = max(w, abs(float(rg[j]) - rr[j]) / colmax[j])
            worstG[integ] = w
            if not w <= bound:
                failures.append(f"(g) nox03 under {integ}: the write grid is {w:.2e} of a column maximum from the tight "
                                f"reference (> {bound:.0e}): the rows between steps are not held to the step's accuracy")

        # (h) THE ARM HAS TEETH: the same case declaring `solver { denseOutput hermite; }` (the driver's
        #     cubic Hermite, the interpolant before 2026-11-22) must show the defect arm (g) bounds, the run
        #     must say it chose Hermite, and a value that is not a choice is refused by name.
        rcH, rowsH = nox("seulex", "1e-8", "1e-15", "denseOutput hermite;")
        if rcH or len(rowsH) != len(refRows):
            failures.append(f"(h) nox03 under seulex with `denseOutput hermite;` did not run (exit {rcH})")
        else:
            wH = max(abs(float(rg[j]) - rr[j]) / colmax[j]
                     for rg, rr in zip(rowsH[1:], ref) for j in range(1, len(rr)))
            worstG["seulex+hermite"] = wH
            if not wH > 10 * GRID_BOUND["seulex"]:
                failures.append(f"(h) `denseOutput hermite;` gives a grid error of {wH:.2e}, not above "
                                f"{10 * GRID_BOUND['seulex']:.0e}: arm (g) would not see the Hermite defect it exists for")
            if "denseOutput hermite" not in nox.out:
                failures.append("(h) a run with `denseOutput hermite;` does not announce it")
        rcX, _ = nox("seulex", "1e-8", "1e-15", "denseOutput quadratic;")
        if rcX == 0 or "denseOutput" not in nox.out:
            failures.append("(h) `denseOutput quadratic;` was not refused by name")

    # (i) the non-stiff witness
    def mild(integ, rtol, atol, extra=""):
        with gatekit.probe_copy("tutorials/batch/reactor/batch06_adaptive_runaway", strip=STRIP) as c:
            clean(c)
            cd = Path(c) / "system/controlDict"
            t = cd.read_text()
            t = re.sub(r"rtol\s+[0-9.eE+-]+;", f"rtol {rtol};", t)
            t = re.sub(r"atol\s+[0-9.eE+-]+;", f"atol {atol};", t) if "atol" in t else t
            t = re.sub(r"\n\s*deltaTmax[^\n]*", "", t)
            t = re.sub(r"^writeInterval\s+[^;]+;", "writeInterval 0.5;", t, flags=re.M)
            cd.write_text(t + "\nsolutionControl { write false; }\n")
            fd = Path(c) / "system/flowsheetDict"
            ft = fd.read_text()
            ins = f" integrator {integ};{extra}"
            if re.search(r"solver\s*\{", ft):
                ft = re.sub(r"integrator\s+\w+;", "", ft)
                ft = re.sub(r"solver(\s*)\{", lambda m: "solver" + m.group(1) + "{" + ins, ft, count=1)
            else:
                ft = re.sub(r"(type\s+batchReactor\s*;)", lambda m: m.group(1) + "\n        solver {" + ins + " }", ft, count=1)
            fd.write_text(ft)
            rc_, out_ = gatekit.run(batch, c, inside=True)
            p = Path(c) / "trajectory.csv"
            return rc_, (list(csv.reader(open(p))) if p.exists() else [])
    rcM, refM = mild("Rodas4", "1e-11", "1e-20")
    if rcM or len(refM) < 100:
        failures.append(f"(i) the tight reference of batch06 did not run (exit {rcM}, {len(refM)} rows)")
    else:
        refm = [[float(x) for x in r] for r in refM[1:]]
        cmM = [max(abs(r[j]) for r in refm) or 1.0 for j in range(len(refm[0]))]
        rcS, rowsS = mild("seulex", "1e-4", "1e-12")
        if rcS or len(rowsS) != len(refM):
            failures.append(f"(i) batch06 under seulex did not run or wrote {len(rowsS)} rows (exit {rcS})")
        else:
            wM = max(abs(float(a) - b) / cmM[j + 1] for ra, rb in zip(rowsS[1:], refm)
                     for j, (a, b) in enumerate(zip(ra[1:], rb[1:])))
            worstG["batch06 seulex"] = wM
            if not wM <= MILD_BOUND:
                failures.append(f"(i) batch06 under seulex: the write grid is {wM:.2e} of a column maximum from the tight "
                                f"reference (> {MILD_BOUND:.0e}): on a non-stiff step the interpolant is far worse than the step")

    return gatekit.verdict(
        "check_batch_dense_output", failures,
        f"free stepping: {nF} accepted steps for {nWrite} write points against {nC} with the step cut at each; "
        f"rows equal the cut run's to {wT:.1e} relative in T (tol 1e-5) and {wN:.1e} of the total moles (tol 5e-4); "
        f"default tolerances: ignition delay within {dTau:.1e} s and T(41 us) within {dT41:.1e} of a tight reference; "
        f"interpolated rows keep the atoms to {clos:.1e}; fixed-bed and untilCSS directories restartable; "
        f"nox03 grid vs tight reference: " + ", ".join(f"{k} {v:.1e}" for k, v in worstG.items()) + "; "
        f"{dirsF} directories by default, 12 at interval 100 x writeInterval, trajectory.csv keeps {nWrite} rows",
    )


if __name__ == "__main__":
    sys.exit(main())
