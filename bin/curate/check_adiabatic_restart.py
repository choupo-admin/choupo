#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: an ADIABATIC liquid batch vessel restarted from a written instant ends where the uninterrupted run ends.

    bin/curate/check_adiabatic_restart.py

REAL DEFECT THIS WOULD HAVE CAUGHT (DEV.md 4c C521, found 2026-11-25 by proofs_time T6).  The adiabatic
`liquidDH` energy equation integrated a FROZEN heat of reaction: dH_rxn was resolved ONCE, at the charge
temperature, and dT/dt = -sum r V dH / sum n Cp used that number for the whole run.  A restart resolves
it again at the restart instant's T (-2.41576 kJ/mol at 321.1 K against -2.42812 at 320 K), so
batch02_adiabatic, batch04_transient_dirs and batch06_adaptive_runaway restarted from t = 300 of 600
ended 6 mK away -- and the frozen number also left H(end) - H(charge) = 24 J on batch02, which is the
first law the vessel is meant to conserve.  The vessel now integrates H = const on the canonical
enthalpy surface (dH_j(T) at the current T, BatchReactor::liquidHeatAt_), so both defects are gone.

ARMS, on tutorials/batch/reactor/batch02_adiabatic, run in a scratch copy.
  (a) RESTART.  The case run to t = 600; the same case restarted from the written instant t = 300
      (its directory renamed 0/, startTime 300) ends on the same T_final and the same n_ethylAcetate_final,
      each to 1e-7 relative.  With the frozen dH the two differ by 1e-5 (T) and 3e-4 (n).
  (b) TRAJECTORY.  The restarted run's T at the next written instant (t = 310) equals the uninterrupted
      run's, to 1e-5 relative (the two runs' step grids differ in their first step, so this arm is looser
      than (a); the frozen dH misses it by 6e-7 only, which is why (a) carries the verdict).
  (c) SOURCE ARM.  In BatchReactor.cpp the adiabatic liquidDH branch of derivatives_ accumulates the
      heat of reaction through the per-T `dHT` table and no longer multiplies `rxn.dH` there
      (comments stripped).  A source arm because a frozen number can be right by luck at one T.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import case_records   # noqa: E402  the one copy home of a shipped case (C421)
CASE = ROOT / "tutorials/batch/reactor/batch02_adiabatic"
SRC = ROOT / "src/unitOperations/batch/BatchReactor.cpp"
TOL = 1.0e-7
SCAN_ROOTS = ()   # the only walk is rglob over the gate's own scratch copy of batch02, never the tree


def run(d):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(ROOT / "choupoBatch"), "."], cwd=d, env=env,
                       capture_output=True, text=True, timeout=900)
    return r


def kpis(out):
    m = re.search(r'"reactor":\s*\{([^}]*)\}', out)
    if not m:
        return None
    return {k: float(v) for k, v in re.findall(r'"(\w+)":\s*([-+0-9.eE]+)', m.group(1))}


def traj_T(d, t):
    """T of the vessel at instant t, from its internalStates record."""
    for f in (Path(d) / str(t)).rglob("*"):
        if f.is_file() and "internalStates" in str(f):
            m = re.search(r"\bT\s+([-+0-9.eE]+)", f.read_text())
            if m:
                return float(m.group(1))
    return None


def rel(a, b):
    return abs(a - b) / max(abs(a), abs(b), 1e-300)


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return re.sub(r"//[^\n]*", "", s)


def main():
    bad = []
    if not (ROOT / "choupoBatch").exists():
        print("check_adiabatic_restart: no choupoBatch in the tree (make all first)")
        return 1
    with tempfile.TemporaryDirectory(prefix="adiabrestart.") as tmp:
        tmp = Path(tmp)
        full = tmp / "full"
        part = tmp / "part"
        case_records.copytree(CASE, full, inline_kinetics=True)
        r = run(full)
        k0 = kpis(r.stdout)
        if r.returncode != 0 or not k0:
            print("FAIL (a): the uninterrupted run did not finish:\n" + r.stderr[-400:])
            return 1
        case_records.copytree(CASE, part, inline_kinetics=True)
        shutil.rmtree(part / "0")
        shutil.copytree(full / "300", part / "0")
        cf = part / "system/controlDict"
        txt = cf.read_text()
        txt = re.sub(r"(\bstartTime\s+)[-+0-9.eE]+", lambda m: m.group(1) + "300", txt, count=1)
        cf.write_text(txt)
        r2 = run(part)
        k1 = kpis(r2.stdout)
        if r2.returncode != 0 or not k1:
            print("FAIL (a): the restart from t = 300 did not finish:\n" + r2.stderr[-400:])
            return 1
        for key in ("T_final", "n_ethylAcetate_final"):
            e = rel(k0[key], k1[key])
            if e > TOL:
                bad.append("(a) %s: uninterrupted %.12g, restarted %.12g (rel %.2e > %.0e)"
                           % (key, k0[key], k1[key], e, TOL))
        t0, t1 = traj_T(full, 310), traj_T(part, 310)
        if t0 is None or t1 is None:
            bad.append("(b) no internalStates T at t = 310 in one of the runs")
        elif rel(t0, t1) > 1.0e-5:
            bad.append("(b) T(310): uninterrupted %.12g, restarted %.12g (rel %.2e)" % (t0, t1, rel(t0, t1)))
    src = strip_comments(SRC.read_text())
    a = src.index("std::vector<scalar> BatchReactor::derivatives_") if "std::vector<scalar> BatchReactor::derivatives_" in src else src.index("BatchReactor::derivatives_(")
    body = src[a:a + 6000]
    if "heatRate +=" not in body or "dHT" not in body.split("heatRate +=")[1].split(";")[0]:
        bad.append("(c) derivatives_ does not accumulate the heat of reaction through the per-T table dHT")
    if re.search(r"heatRate\s*\+=\s*rxn\.dH\s*\*", body):
        bad.append("(c) derivatives_ multiplies the frozen rxn.dH into heatRate")
    if bad:
        print("check_adiabatic_restart: FAIL")
        for b in bad:
            print("  " + b)
        return 1
    print("check_adiabatic_restart: OK -- batch02_adiabatic restarted from t = 300 ends on the uninterrupted T_final and"
          " n_ethylAcetate_final to 1e-7 and on the same T at t = 310; the energy equation reads dH_j(T) at the vessel's T.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
