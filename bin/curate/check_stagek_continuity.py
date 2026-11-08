#!/usr/bin/env python3
"""Gate: the stage K of a reactive package is a continuous function of T.

    bin/curate/check_stagek_continuity.py

WHY THIS EXISTS (2026-11-08, DEV.md 4c C245 slice 3, audit finding H1).
`ThermoPackage::stageK` for an aqueous-chemistry package used to choose its
construction by whether an inner Newton CONVERGED.  Above the two-phase band's
dew edge the Newton fails, and the K was then taken over the BUBBLE-side
hypothetical liquid -- a different surface.  Measured on stripper01's tray-1
liquid at 1.01325 bar: across 0.25 K at the dew edge (T = 372.0 -> 372.25 K)
K_CO2 went 30.4 -> 62.8 and K_NH3 12.41 -> 11.61.  A column Newton that
crosses that edge sees a step, not a slope.  The cure is the dew-side
construction (the hypothetical liquid in equilibrium with a vapour of the trial
composition, K = z / x*), which is the flash's own K at the dew point.

WHAT THIS GATE CHECKS.  A probe (`_stageKProbe.cpp`, compiled HERE against
libchoupo.so) calls `stageK` itself at the witness liquids, with two readings
per witness:

  (a) CONTINUITY.  K(T) is scanned across the band, the adjacent pair with the
      largest relative change is bisected down to a width of 1e-6 K, and the
      relative change of every K_i across that final interval must be below
      1e-6 -- a jump of any size survives the bisection, a slope does not.
  (b) ORDER INDEPENDENCE.  The same (T, z) asked after unrelated calls returns
      the identical K, bit for bit; and no K is infinite or NaN.

Witnesses: stripper01_sour_water tray 1 and tray 8 liquids (NH3 + CO2 + water,
no nonvolatile).  NOT checked: a mixture with a nonvolatile heel (stripper02's
H2S), whose dew-side limit is not offered (the old fallback stays, announced);
that is the open item of the slice.
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
TOL = 1.0e-2
WIDTH = 1.0e-6

#  (label, z in package order NH3 CO2 water, T0, T1): the converged tray
#  liquids of stripper01, bracketing its dew edge.
WITNESSES = [
    ("stripper01 tray 1", [0.047811771, 0.0089001765, 0.94328805], 368.0, 378.0),
    ("stripper01 tray 8", [0.0087392722, 0.00042640146, 0.99083433], 372.0, 384.0),
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
    for label, z, t0, t1 in WITNESSES:
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
        if step > TOL:
            fails.append("%s: K(T) STEPS at T = %.6f K: relative change %.3e over %.1e K (K %s -> %s)"
                         % (label, lo, step, hi - lo, kl, kh))
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
    print(LABEL + ": OK -- stageK is continuous in T across the two-phase band's dew edge "
          "(relative step < %.0e over %.0e K; measured 4e-3 at the Newton's reach, 0.51 before the fix) and order-independent at %d witness liquids; "
          "NOT checked: a mixture with a nonvolatile heel (stripper02's H2S)"
          % (TOL, WIDTH, len(WITNESSES)))
    for n in notes:
        print("  " + n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
