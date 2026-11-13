#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the stage K of a reactive package -- a MEASURED, PINNED step in T.

    bin/curate/check_stagek_continuity.py

WHY THIS EXISTS (2026-11-08, DEV.md 4c C245 slice 3, audit finding H1).
`ThermoPackage::stageK` for an aqueous-chemistry package is NOT continuous in
T.  Where the two-phase Newton fails (just inside the band's dew side, V ~
0.998), the K is taken over the BUBBLE-side hypothetical liquid, a different
surface.  Measured on stripper01 at 1.01325 bar, worst relative change of any
K_i over a 1e-6 K interval:

    tray 1 liquid (NH3 .0478 CO2 .0089 water .943): 0.507 at 372.0937 K
        K_CO2 30.6 -> 62.2, K_NH3 12.44 -> 11.55
    tray 8 liquid (NH3 .0087 CO2 .00043 water .991): 0.0415 at 373.43 K

KNOWN_STEP (DEV.md 4c C245 slice 3).  The cause found: ReactiveVLE's outer
Newton reach ends at V ~ 0.998 (sum p / P = 0.998 on tray 1), and stageK takes
the bubble-side hypothetical liquid past that.  A dew-side construction (the
hypothetical liquid in equilibrium with a vapour of the trial composition,
K = z / x*) removed the step (tray 1: 0.507 -> 4e-3; tray 8: 4e-2 -> 4e-7)
but was DROPPED: it BREAKS stripper01 (legacy Newton: bottom T runs to 748 K,
"failed to converge"; bounded Armijo MESH: stalls at |F| = 3e-2), because the
accidental wall the old surface gave the Newton disappears.  With the OLD K
and the Armijo MESH, stripper01 and column13 converge in 6 iterations each.

STRIPPER02 DIAGNOSIS (measured 2026-11-08).  Its stall under the bounded
Armijo MESH (80 iterations, |F| = 1.078e-2) is IDENTICAL with the old K and
with the dew-side K, so the K step is not its cause.  It is a HEEL case: H2S
is nonvolatile (no partial pressure), the liquid never vanishes, and NH3 is
bound with it as NH4HS, so the V -> 1 limit of the flash is not "vapour = z".
Two constructions for that limit (heel share fixed; heel moles free with
sum p = P) landed on another branch than the flash (tray 4: K_NH3 12.9 against
0.73 at the failure).  Candidates: ReactiveVLE's outer Newton reach near V = 1
on a heeled mixture, or a pH / heel feature of the MESH residual.

WHAT THIS GATE CHECKS.  A probe (`_stageKProbe.cpp`, compiled HERE against
libchoupo.so) calls `stageK` at the two liquids.  The T scan's worst adjacent
interval is bisected to 1e-6 K and the relative step is held against its PIN,
TWO-SIDED: a step that GROWS fails; one that SHRINKS fails asking for the pin
to be moved.  HARD requirements: the same (T, z) after unrelated calls gives
bit-identical K, and no K is infinite or NaN.
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROBE = BUILD / "stageKProbe"
SRC = ROOT / "bin" / "curate" / "_stageKProbe.cpp"
LABEL = "check_stagek_continuity"
CASE = ROOT / "tutorials" / "steady" / "distillation" / "stripper01_sour_water"
P = 101325.0
PIN_REL = 0.02   # a pin matches within 2 % of its value
WIDTH = 1.0e-6

#  (label, z in package order NH3 CO2 water, T0, T1): the converged tray
#  liquids of stripper01, bracketing its dew edge.
WITNESSES = [
    ("stripper01 tray 1", [0.047811771, 0.0089001765, 0.94328805], 368.0, 378.0, 5.07e-1),
    ("stripper01 tray 8", [0.0087392722, 0.00042640146, 0.99083433], 372.0, 384.0, 4.15e-2),
]


def build_probe():
    lib = BUILD / "libchoupo.so"
    if not lib.exists():
        return "libchoupo.so is not built -- a check that cannot run must not pass"
    if PROBE.exists() and PROBE.stat().st_mtime > max(lib.stat().st_mtime, SRC.stat().st_mtime):
        return None
    p = subprocess.run(
        ["g++", "-std=c++17", "-O2", "-I" + str(ROOT / "src"), "-I" + str(ROOT),
         str(SRC), str(lib), "-Wl,-rpath," + str(BUILD), "-o", str(PROBE)],
        capture_output=True, text=True)
    return None if p.returncode == 0 else "the probe did not compile:\n" + p.stderr[-1500:]


def ask(reqs):
    path = BUILD / "stageKRequests.txt"
    path.write_text("\n".join(reqs) + "\n")
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    o = subprocess.run([str(PROBE), str(CASE), str(path)], capture_output=True,
                       text=True, env=env)
    out = []
    for l in o.stdout.splitlines():
        if l.startswith("OK"):
            out.append([float(v) for v in l.split()[1:]])
        elif l.startswith("ERR"):
            out.append(l)
    return out


def req(T, z):
    return "SK %.17g %.17g %s" % (T, P, " ".join("%.17g" % v for v in z))


def main():
    err = build_probe()
    if err:
        print(LABEL + ": FAILED\n  " + err)
        return 1
    fails = []
    notes = []
    for label, z, t0, t1, pin in WITNESSES:
        n_pts = int(round((t1 - t0) / 0.05)) + 1
        Ts = [t0 + 0.05 * k for k in range(n_pts)]
        Ks = ask([req(T, z) for T in Ts])
        if len(Ks) != len(Ts) or any(isinstance(k, str) for k in Ks):
            fails.append("%s: the scan refused: %s" % (label, [k for k in Ks if isinstance(k, str)][:1]))
            continue
        for T, K in zip(Ts, Ks):
            if any(not (v == v) or v in (float("inf"), float("-inf")) for v in K):
                fails.append("%s: K not finite at T = %.2f: %s" % (label, T, K))

        def rel(a, b):
            return max(abs(x - y) / max(abs(x), abs(y), 1e-300)
                       for x, y in zip(a, b) if x > 0 or y > 0) if a != b else 0.0
        # largest adjacent relative change
        j = max(range(len(Ts) - 1), key=lambda i: rel(Ks[i], Ks[i + 1]))
        lo, hi = Ts[j], Ts[j + 1]
        while hi - lo > WIDTH:
            mid = 0.5 * (lo + hi)
            kl, km, kh = ask([req(lo, z), req(mid, z), req(hi, z)])
            if rel(kl, km) >= rel(km, kh):
                hi = mid
            else:
                lo = mid
        kl, kh = ask([req(lo, z), req(hi, z)])
        step = rel(kl, kh)
        notes.append("%s: scan %.1f-%.1f K, worst interval %.6f K, step over %.1e K = %.2e"
                     % (label, t0, t1, lo, hi - lo, step))
        if step > pin * (1 + PIN_REL):
            fails.append("%s: the K step GREW: %.3e against its pin %.3e (KNOWN_STEP, C245 slice 3)"
                         % (label, step, pin))
        elif step < pin * (1 - PIN_REL):
            fails.append("%s: the K step SHRANK to %.3e from its pin %.3e -- good; move the pin"
                         % (label, step, pin))
        # order independence
        a = ask([req(0.5 * (t0 + t1), z)])[0]
        ask([req(t0, z), req(t1, [z[0] * 0.5, z[1], 1 - 0.5 * z[0] - z[1]])])
        b = ask([req(0.5 * (t0 + t1), z)])[0]
        if a != b:
            fails.append("%s: the same (T, z) gave different K after other calls" % label)
    if fails:
        print(LABEL + ": FAILED")
        for f in fails:
            print("  " + f)
        for n in notes:
            print("  " + n)
        return 1
    print(LABEL + ": OK -- stageK's KNOWN_STEP in T is pinned two-sided at %d stripper01 tray liquids "
          "(worst relative step over 1e-6 K: %s; DEV.md 4c C245 slice 3), the same (T, z) gives "
          "bit-identical K, no K is infinite or NaN; NOT checked: a heeled mixture (stripper02's H2S)"
          % (len(WITNESSES), ", ".join("%.2e" % w[4] for w in WITNESSES)))
    for n in notes:
        print("  " + n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
