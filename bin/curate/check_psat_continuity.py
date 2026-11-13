#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the pure-component vapour pressure is a continuous, monotone
function of T over the whole range a solver can visit.

    bin/curate/check_psat_continuity.py [--show]      (--show prints the probe)

WHY THIS EXISTS (2026-11-09, DEV.md 4c C245 slice 5a).  Every gamma-phi
K-value is Psat times something, and the kernel audit of 2026-11-08 (Rank 8)
found three places where Psat(T) was not a function a Newton iteration or a
temperature search can cross:

  - Antoine has a pole at T = -C (Psat -> inf, and the slope changes sign
    below it);
  - Ambrose-Walton and Wagner return Pc / Pr from Tc up: continuous in value,
    not in slope, and a different number from what Antoine returns above Tc;
  - water switches between the record's correlation and IF97 at the window
    edges (273.15 K, 647.096 K), a step of several per cent.

A step in a thermodynamic surface is where a Newton iteration stalls (the Tc
step of the liquid reference factor, C239, was found the slow way).  The rule
now lives once, in the BASE class `VaporPressureModel::Psat_Pa`: inside
[T_lo, T_hi] the model's own formula, bit for bit; outside, ln Psat continued
LINEARLY IN 1/T with the model's value and slope at the edge; announced once
per component, model and side.  The water edge is joined by scaling the
record's correlation with the IF97/record ratio at the edge.

WHAT THIS GATE CHECKS, by a probe (`_psatContinuityProbe.cpp`) linked against
the real classes of the native build:

  (a) three components per model (Antoine: benzene, toluene, water; Ambrose-
      Walton: three catalogue records; Wagner: the catalogue's heavyWater and
      two declared fixtures): Psat finite, positive and strictly increasing on
      [50 K, 1.5 Tc];
  (b) d ln Psat / dT continuous across the record's Tmin and across Tc, to
      1e-6 relative (one-sided second-order finite differences);
  (c) inside the window the value equals the model's own formula bit for bit
      (the probe exposes each model's protected `computePsat` through a
      derived class and compares 2001 temperatures with memcmp), and the
      source still returns `computePsat(T)` unchanged on that branch;
  (d) water: `saturationPressure` continuous at 273.15 K and 647.096 K to
      1e-9 relative, and monotone on 200..900 K;
  (e) the announcement fires once per side and names it (ABOVE / BELOW).

WHAT IT DOES NOT COVER: that a continuation is a physical vapour pressure (a
component above Tc has none -- the continuation is a numerical surface for a
solver in transit), the water H(vf) endpoints, the z = 0.999 pure-fluid wall,
direct m.p_sat calls in ThermoPackage.cpp, phi_sat's root near 0.99 Tc and the
flash (slice 6).
"""
import glob
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "bin" / "curate" / "_psatContinuityProbe.cpp"
BASE_H = ROOT / "src/thermo/vaporPressure/VaporPressureModel.H"
BASE_CPP = ROOT / "src/thermo/vaporPressure/VaporPressureModel.cpp"

ANTOINE = ["benzene", "toluene", "water"]
AMBROSE = ["adipicAcid", "246Trinitrotoluene", "24Dinitrotoluene"]
WAGNER_FILE = ["heavyWater"]
WAGNER_FIX = ["waterWagnerPruss", "methaneWagner"]

fails = []
show = "--show" in sys.argv


def objects():
    """Library objects of the native build (everything but the applications)."""
    objs = []
    for pat in ("build/*/src/**/*.o", "build/*/**/*.o"):
        objs = [o for o in glob.glob(str(ROOT / pat), recursive=True)]
        if objs:
            break
    objs = [o for o in objs if "/applications/" not in o]
    return sorted(set(objs))


def build_probe(tmp: Path):
    cxx = shutil.which("g++") or shutil.which("clang++")
    objs = objects()
    if not cxx or not objs:
        fails.append("(probe) needs a compiler and a native build of this tree"
                     " (run `make all`): a check that cannot run must not pass")
        return None
    exe = tmp / "probe"
    r = subprocess.run([cxx, "-std=c++17", "-O1", "-I", str(ROOT / "src"),
                        str(PROBE)] + objs + ["-lpthread", "-o", str(exe)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("(probe) does not compile/link:\n" + r.stderr[-2500:])
        return None
    return exe


def run(exe, kind, names):
    p = subprocess.run([str(exe), str(ROOT), kind] + names,
                       capture_output=True, text=True, timeout=300)
    if show:
        print(p.stdout, end="")
    if "probeDone 1" not in p.stdout:
        fails.append(f"(probe {kind}) exited {p.returncode} early:\n"
                     f"{p.stdout[-800:]}\n{p.stderr[-800:]}")
        return []
    return p.stdout.splitlines()


def need(arm, cond, msg):
    if not cond:
        fails.append(f"({arm}) {msg}")


def check_models(lines, label):
    for ln in lines:
        t = ln.split()
        if not t:
            continue
        if t[0] == "a":
            need("a", t[3] == "1" and t[5] == "1" and t[7] == "1",
                 f"{label} {t[1]}: finite/positive/monotone = {t[3]}/{t[5]}/"
                 f"{t[7]}, first bad T = {t[9]} K")
        elif t[0] == "b":
            rel = float(t[-1])
            need("b", rel < 1e-6,
                 f"{label} {t[1]}: d ln Psat/dT jumps by {rel:.2e} (relative)"
                 f" at {t[3]} (T = {t[5]} K)")


def source_arms():
    base = BASE_H.read_text() + BASE_CPP.read_text()
    code = re.sub(r"/\*.*?\*/", "", base, flags=re.S)
    code = re.sub(r"//[^\n]*", "", code)
    need("c", "return computePsat(T_K)" in code or "return computePsat(T)" in code,
         "Psat_Pa no longer returns computePsat(T) unchanged inside the window")
    need("c", "continuationWindow" in code or "T_lo" in code,
         "the continuation window is not derived in the base class")
    for m in ("Antoine", "AmbroseWalton", "Wagner"):
        txt = (ROOT / f"src/thermo/vaporPressure/{m}.cpp").read_text()
        need("c", "computePsat" in txt, f"{m}.cpp lost its computePsat")


def main() -> int:
    with tempfile.TemporaryDirectory() as td:
        exe = build_probe(Path(td))
        if exe is not None:
            check_models(run(exe, "file", ANTOINE), "Antoine")
            check_models(run(exe, "file", AMBROSE), "AmbroseWalton")
            check_models(run(exe, "file", WAGNER_FILE), "Wagner")
            check_models(run(exe, "wagner", WAGNER_FIX), "Wagner(fixture)")
            for ln in run(exe, "water", ["water"]):
                t = ln.split()
                if t[:2] == ["d", "edge"]:
                    rel = float(t[-1])
                    need("d", rel < 1e-9,
                         f"water Psat steps by {rel:.2e} (relative) at "
                         f"{t[2]} K")
                elif t[:2] == ["d", "monotone200to900"]:
                    need("d", t[2] == "1",
                         "water Psat not finite and strictly increasing on "
                         "200..900 K")
            for ln in run(exe, "bitwise", ["x"]):
                t = ln.split()
                if t and t[0] == "c":
                    need("c", t[-1] == "0" and int(t[6]) > 1000,
                         f"{t[1]}: {t[-1]} of {t[6]} values inside the window "
                         "differ from the model's own formula")
            for ln in run(exe, "announce", ["benzene"]):
                t = ln.split()
                if t and t[0] == "e":
                    need("e", t[2] == "1" and t[4] == "1",
                         f"announcements above/below = {t[2]}/{t[4]}; "
                         "expected exactly one per side")
    source_arms()
    if fails:
        print("check_psat_continuity: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    print("check_psat_continuity: OK -- Psat(T) is finite, positive and strictly"
          " increasing on [50 K, 1.5 Tc] for 12 components over the three"
          " models (Antoine: benzene, toluene, water; Ambrose-Walton: three"
          " records; Wagner: heavyWater and two fixtures); d ln Psat/dT is"
          " continuous across Tmin and Tc to 1e-6; inside the window the"
          " entry point equals the model's own formula bit for bit; water's"
          " saturation pressure is continuous across both IF97 window edges"
          " to 1e-9; the continuation is announced once per side.  NOT"
          " covered: that a continuation is a physical vapour pressure, water"
          " H(vf), the z = 0.999 pure-fluid wall, direct p_sat calls in"
          " ThermoPackage.cpp, phi_sat near 0.99 Tc, the flash.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
