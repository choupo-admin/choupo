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
      `deltaTmax` declared at writeInterval (the step cut at each write point: the old
      behaviour, still available by declaration), T to 1e-5
      relative, every species to 5e-4 of the total moles.
  (c) THE DIRECTORIES HAVE THEIR OWN CADENCE.  The default writes at most 101 `<t>/`
      (1201 write points is the case the cadence is for), trajectory.csv keeps all 1201
      rows, `solutionControl { interval 50; }` (100 write intervals) writes 12, and an
      interval that is not a whole multiple of writeInterval is refused by name.

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
WI = 0.5     # the write interval of the probe: 1201 write points over the case's 600 s


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

    return gatekit.verdict(
        "check_batch_dense_output", failures,
        f"free stepping: {nF} accepted steps for {nWrite} write points against {nC} with the step cut at each; "
        f"rows equal the cut run's to {wT:.1e} relative in T (tol 1e-5) and {wN:.1e} of the total moles (tol 5e-4); "
        f"{dirsF} directories by default, 12 at interval 100 x writeInterval, trajectory.csv keeps {nWrite} rows",
    )


if __name__ == "__main__":
    sys.exit(main())
