#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: every view a time-integrated case declares draws something.

    bin/curate/check_dynamic_views.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT (measured 2026-11-23, C487 slice 2).  The
views reader of choupoCtrl / choupoSemiContinuous REFUSES, by name, every series it
cannot resolve -- a unit that is not in the run, a table the unit does not publish,
a column it lacks (probed that day: exit 2, `unit operation 'TC9' is not a unit
operation of this run`, `table 'trajectory' ... has no column 'PVx'`) -- so a
mistyped NAME needs no gate.  What it does NOT refuse is a WINDOW: an axis
`min` / `max` the author typed against one run that holds no point of a series.
ctrl01_cstr_temp_control with `xAxis { ... min 5000; max 6000; }` (the run ends at
150 s) exits 0, prints `SP: 76 point(s)` for every series, writes every file, and
the figure the student opens is an EMPTY plot.  The ranges this slice types by hand
(ctrl02's `rejection`: 600 to 2000 s, 349.5 to 350.8 K) are numbers read from one
run; when the case's end time, set point or tuning later changes, the window can
silently stop meeting the data, and nothing else notices: a golden pins what the
run prints, and the `postProcessing` block is not in the golden format.

WHAT THIS GATE CHECKS.  Every case under tutorials/ctrl and tutorials/unsteady whose
system/postDict declares `views` is run (a private copy, its own binary) and every
published view is read back from postProcessing/<op>/<view>.json + .csv:

  (1) every declared series carries at least one point;
  (2) the x window of its view (xAxis min / max), and the y window of the axis the
      series sits on (yAxis or yAxis2 min / max), each hold at least ONE of the
      series' points -- a series wholly outside its window is drawn nowhere.

A run that refuses the postDict (exit != 0) FAILS the gate with the engine's own
ERROR line: a figure that cannot be built is a defect of the case, never a skip.

SABOTAGE ARM.  A private copy of ctrl01_cstr_temp_control gets `min 5000; max 6000`
on its time axis (the case's end time is 150 s); the checker must then name
`ctrl01_cstr_temp_control / response / SP` as empty.  A checker that cannot see the
defect it exists for would pass every case.

NOT CHECKED.  That a figure answers the engineer's question, that its note's numbers
equal the run's (read by the author from the run, and by the reviewer), and views of
an outerDict campaign (refused by the engine by name: ctrl16, ctrl20 draw nothing).
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

ROOTS = ("tutorials/ctrl", "tutorials/unsteady")
# The walk reads exactly these two trees (check_scan_roots: bin/integrate --plan
# names a touched case under them as this gate's input).
SCAN_ROOTS = ROOTS
STRIP = ("expected", "converged", "constant/propertyManifest")


def cases():
    out, skipped = [], []
    for root in ROOTS:
        for d in sorted((gatekit.repo / root).iterdir()):
            if (d / "system" / "outerDict").exists():
                skipped.append(d.name)
                continue
            pd = d / "system" / "postDict"
            if pd.is_file() and re.search(r"^\s*views\b", pd.read_text(), re.M):
                out.append(d)
    return out, skipped


def application(case):
    m = re.search(r"^\s*application\s+(\w+)\s*;", (case / "system" / "controlDict").read_text(), re.M)
    return m.group(1) if m else "choupoCtrl"


def empties(case_dir, name):
    """-> list of 'case / view / series: why' for every series of the run's views that draws nothing."""
    bad = []
    n_series = n_views = 0
    for jf in sorted(Path(case_dir, "postProcessing").glob("*/*.json")):
        doc = json.loads(jf.read_text())
        view = doc.get("name") or jf.stem
        n_views += 1
        rows = {}
        for line in jf.with_suffix(".csv").read_text().splitlines()[1:]:
            s, x, y = line.split(",")[:3]
            try:
                rows.setdefault(s, []).append((float(x), float(y)))
            except ValueError:
                continue
        xa = doc.get("xAxis", {})
        for s in doc.get("series", []):
            n_series += 1
            sn = s["name"]
            pts = rows.get(sn, [])
            where = f"{name} / {view} / {sn}"
            if not pts:
                bad.append(f"{where}: zero points")
                continue
            ya = doc.get("yAxis2" if s.get("axis") == "right" else "yAxis", {})
            for axis, label, col in ((xa, "x", 0), (ya, "y", 1)):
                lo, hi = axis.get("min"), axis.get("max")
                if lo is None and hi is None:
                    continue
                lo = float("-inf") if lo is None else float(lo)
                hi = float("inf") if hi is None else float(hi)
                if not any(lo <= p[col] <= hi for p in pts):
                    vals = [p[col] for p in pts]
                    bad.append(f"{where}: no point inside the {label} window [{lo:g}, {hi:g}] "
                               f"(the series spans {min(vals):g} to {max(vals):g}) -- the figure draws nothing")
    return bad, n_views, n_series


def run_case(case, name, edit=None):
    with gatekit.probe_copy(case, strip=STRIP) as c:
        if edit:
            gatekit.edit(c / "system" / "postDict", *edit)
        rc, out = gatekit.run(gatekit.binary(application(c)), c)
        if rc != 0:
            err = [l for l in out.splitlines() if l.startswith("ERROR")] or out.strip().splitlines()[-2:]
            return [f"{name}: the run refused the postDict (exit {rc}): " + " | ".join(err)[:400]], 0, 0
        return empties(c, name)


def main():
    failures = []
    try:
        todo, skipped = cases()
    except gatekit.GateRefusal as e:
        print(f"check_dynamic_views: REFUSED -- {e}")
        return 2
    nv = ns = 0
    for case in todo:
        try:
            bad, v, s = run_case(case, case.name)
        except (gatekit.GateRefusal, gatekit.EditNotApplied) as e:
            failures.append(f"{case.name}: {e}")
            continue
        failures += bad
        nv += v
        ns += s
    if not todo:
        failures.append("no case under tutorials/ctrl or tutorials/unsteady declares views -- the gate has no subject")

    # sabotage arm: a time window beyond the end of the run must be seen
    arm = "tutorials/ctrl/ctrl01_cstr_temp_control"
    try:
        bad, _, _ = run_case(arm, "ctrl01_cstr_temp_control",
                             edit=('unit "s"; scale linear; }', 'unit "s"; scale linear; min 5000; max 6000; }'))
        if not any("ctrl01_cstr_temp_control / response / SP: no point inside the x window" in b for b in bad):
            failures.append("sabotage arm: an x window [5000, 6000] on a 150 s run was NOT reported as empty -- "
                            "the checker cannot see the defect it exists for")
    except (gatekit.GateRefusal, gatekit.EditNotApplied) as e:
        failures.append(f"sabotage arm: {e}")

    return gatekit.verdict(
        "check_dynamic_views", failures,
        f"{len(todo)} time-integrated cases declare views; {nv} views, {ns} series, every series carries points "
        f"inside its declared axis windows; a window beyond the run's end is seen; "
        f"{len(skipped)} case(s) with an outerDict draw nothing by design ({', '.join(skipped) or 'none'}); "
        f"NOT CHECKED: that a figure answers its question or that a note's numbers equal the run's")


if __name__ == "__main__":
    sys.exit(main())
