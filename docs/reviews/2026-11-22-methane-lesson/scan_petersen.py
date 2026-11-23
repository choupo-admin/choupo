#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Run a methane case at the points of Petersen, Davidson & Hanson 1999, Table 2, and print tau.

usage: scan_petersen.py <case dir> <scratch dir> <mixture> [mixture ...]   (rows from
        docs/reviews/2026-11-21-aramcomech-validation/petersen1999_table2.tsv)
Each point: a scratch copy of the case with the holdup replaced (T, P, n = PV/RT at 1 L, the mixture's
mole fractions), endTime = 4 x the measured delay (x4 again when not ignited), run with choupoBatch,
tau_ign = the engine's `tau_ign (max dT/dt)` line.  Prints one line per point: mixture, P, T, measured,
this case (microseconds).  Only the N2 mixtures (2 and 4) run: the vessel carries no Ar and no He.
"""
import csv
import os
import re
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
REV = os.path.join(REPO, "docs", "reviews", "2026-11-21-aramcomech-validation")
R = 8314.462618
MIX = {  # Table 1, p. 84 (CH4, O2, diluent)
    "1": (0.4, 2.0, "Ar", 8.0), "2": (3.0, 2.0, "N2", 10.0), "3": (3.0, 2.0, "Ar", 10.0),
    "4": (3.0, 2.0, "N2", 6.0), "5": (3.0, 2.0, "Ar", 6.0),
}


def points(mixtures):
    with open(os.path.join(REV, "petersen1999_table2.tsv")) as f:
        rows = [r for r in csv.DictReader((l for l in f if not l.startswith("#")), delimiter="\t")]
    return [r for r in rows if r["mixture"] in mixtures]


def holdup(text, T, P, comp):
    n = P * 101325.0 * 1.0e-3 / (R * T)
    text = re.sub(r"T\s+[\d.eE+-]+ K;", "T            %g K;" % T, text, 1)
    text = re.sub(r"P\s+[\d.eE+-]+ atm;", "P            %g atm;" % P, text, 1)
    text = re.sub(r"totalMoles\s+[\d.eE+-]+;", "totalMoles   %.8e;" % n, text, 1)
    for sp in ("CH4", "O2", "N2", "Ar", "NO"):
        text = re.sub(r"(\n\s+%s\s+)[\d.eE+-]+;" % sp, lambda m: m.group(1) + ("%.8f;" % comp.get(sp, 0.0)), text)
    return text


def run(case, scratch, T, P, comp, end):
    os.makedirs(scratch, exist_ok=True)
    shutil.copytree(case, scratch, dirs_exist_ok=True)
    v = os.path.join(scratch, "0", "internalStates", "vessel")
    with open(os.path.join(case, "0", "internalStates", "vessel")) as f:
        base = f.read()
    with open(v, "w") as f:
        f.write(holdup(base, T, P, comp))
    c = os.path.join(scratch, "system", "controlDict")
    with open(os.path.join(case, "system", "controlDict")) as f:
        t = f.read()
    t = re.sub(r"endTime\s+[\d.eE+-]+;", "endTime         %.6e;" % end, t, 1)
    t = re.sub(r"deltaT\s+[\d.eE+-]+;", "deltaT          %.6e;" % (end / 600), t, 1)
    t = re.sub(r"writeInterval\s+[\d.eE+-]+;", "writeInterval   %.6e;" % (end / 600), t, 1)
    with open(c, "w") as f:
        f.write(t)
    env = dict(os.environ, CHOUPO_HOME=REPO)
    out = subprocess.run([os.environ.get("CHOUPO_BATCH", os.path.join(REPO, "choupoBatch")), "."], cwd=scratch, env=env,
                         capture_output=True, text=True).stdout
    m = re.search(r"tau_ign \(max dT/dt\) = ([\d.eE+-]+) s", out)
    return float(m.group(1)) * 1e6 if m else None


def main():
    case, scratch, mixes = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]), sys.argv[3:]
    for r in points(mixes):
        ch4, o2, dil, nd = MIX[r["mixture"]]
        tot = ch4 + o2 + nd
        comp = {"CH4": ch4 / tot, "O2": o2 / tot, dil: nd / tot}
        T, P, meas = float(r["T5_K"]), float(r["P5_atm"]), float(r["tau_ign_us"])
        end = 4 * meas * 1e-6
        tau = run(case, scratch, T, P, comp, end)
        if tau is None:
            tau = run(case, scratch, T, P, comp, end * 4)
        print("%s\t%g\t%g\t%g\t%s" % (r["mixture"], P, T, meas, "%.1f" % tau if tau else "none"), flush=True)


if __name__ == "__main__":
    main()
