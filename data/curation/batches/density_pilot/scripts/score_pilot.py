#!/usr/bin/env python3
"""Score the liquid-density pilot (C378) against the measured sets the mirror holds.

    data/curation/batches/density_pilot/scripts/score_pilot.py      (from the repository root)

The kernel's own double at each measured state, through
`choupoProps <case> --liquid-density-probe=<file>` on the pilot's shipped
cases (tutorials/steady/thermo/liquidDensity02_waterEthanol and
liquidDensity03_NaOH), against the per-point files build_data.py regenerates
from the mirror (not in git).  Prints, per the thresholds as amended in
DEV.md 4c (C378): D2 at 0.1 MPa per isotherm and laboratory -- SCORED at
298.15 and 323.15 K, REPORTED at 348.15 K -- and D3 (b) set A at 0.1 MPa and
(c) set B up to 2 MPa, 10 MPa reported.  Exits 2 when a data file is missing
(no subject), 1 when a scored threshold fails, 0 otherwise.
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path.cwd()
BATCH = ROOT / "data" / "curation" / "batches" / "density_pilot"
PROPS = ROOT / "choupoProps"
MW = {"water": 18.015, "ethanol": 46.069, "NaOH": 39.997}
OLS_BANDS = [(273.15, 283.15, .8), (283.15, 293.15, .7), (293.15, 333.15, .5),
             (333.15, 343.15, .4), (343.15, 423.15, .3), (423.15, 473.15, .2)]
#  (laboratory, T) -> (AAD %, max %): DEV.md 4c, "C378, THE PILOT'S
#  THRESHOLDS CORRECTED BEFORE IT RUNS", point (1).
D2_LIMITS = {("Pecar", 298.15): (1.9, 3.5), ("Pecar", 323.15): (2.2, 3.7),
             ("Rehman", 298.15): (2.3, 3.5), ("Rehman", 323.15): (2.7, 3.6)}


def table(name):
    f = BATCH / name
    if not f.exists():
        print(f"NO SUBJECT: {f} is missing -- run scripts/build_data.py where the mirror exists")
        sys.exit(2)
    rows, hdr = [], None
    for l in f.read_text().splitlines():
        if l.startswith("#") or not l.strip():
            continue
        p = l.split("\t")
        if hdr is None:
            hdr = p
            continue
        rows.append(dict(zip(hdr, p)))
    return rows


def probe(case, states):
    tmp = Path(tempfile.mkdtemp(prefix="scorePilot-"))
    try:
        d = tmp / "c"
        shutil.copytree(ROOT / "tutorials" / "steady" / "thermo" / case, d)
        (d / "system" / "propsDict").write_text("operations\n(\n);\n")
        f = tmp / "states.txt"
        f.write_text("".join(f"{T!r} {P!r} " + " ".join(f"{k} {v!r}" for k, v in x.items()) + "\n"
                             for T, P, x in states))
        r = subprocess.run([str(PROPS), str(d), f"--liquid-density-probe={f}"], capture_output=True,
                           text=True, env=dict(os.environ, CHOUPO_HOME=str(ROOT), LC_ALL="C"))
        out = [l.split("\t") for l in r.stdout.splitlines() if l.startswith("probe\t")]
        return [None if p[2] == "REFUSED" else float(p[2]) for p in out]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def stats(devs):
    a = [abs(d) for d in devs]
    return sum(a) / len(a), max(a), sum(devs) / len(devs)


def main():
    bad = 0
    # ---- D2 ---------------------------------------------------------------
    for lab, fname in (("Pecar", "d2_waterEthanol_pecar2005.tsv"),
                       ("Rehman", "d2b_waterEthanol_rehmanAnsari2008.tsv")):
        rows = [r for r in table(fname) if abs(float(r["P_kPa"]) - 100) <= 2
                and 0 < float(r["x_ethanol"]) < 1]
        for T in (298.15, 323.15, 348.15):
            pts = [r for r in rows if abs(float(r["T_K"]) - T) < 0.06]
            if not pts:
                continue
            vals = probe("liquidDensity02_waterEthanol",
                         [(float(r["T_K"]), 101325.0, {"water": 1 - float(r["x_ethanol"]),
                                                      "ethanol": float(r["x_ethanol"])}) for r in pts])
            devs = [(v / float(r["rho_kg_m3"]) - 1) * 100 for v, r in zip(vals, pts) if v]
            aad, mx, bias = stats(devs)
            lim = D2_LIMITS.get((lab, T))
            ok = lim is None or (aad <= lim[0] and mx <= lim[1])
            bad += 0 if ok else 1
            tag = ("SCORED  " + ("PASS" if ok else "FAIL") + f" (limits {lim[0]} / {lim[1]})") if lim else "REPORTED"
            print(f"D2 {lab:6} {T} K, 0.1 MPa, {len(devs):3} points: AAD {aad:.3f} %, max {mx:.3f} %, "
                  f"bias {bias:+.3f} %   {tag}")
    # ---- D3 ---------------------------------------------------------------
    def xm(w):
        a, b = w / MW["NaOH"], (1 - w) / MW["water"]
        return {"NaOH": a / (a + b), "water": b / (a + b)}

    def inwin(T, w):
        return any(lo <= T <= hi and 1 - w >= xmin for lo, hi, xmin in OLS_BANDS)

    A = table("d3a_naoh_galindoLuna2019.tsv")
    vals = probe("liquidDensity03_NaOH", [(float(r["T_K"]), float(r["P_kPa"]) * 1e3, xm(float(r["w_NaOH"])))
                                          for r in A])
    devs = [(v / float(r["rho_kg_m3"]) - 1) * 100 for v, r in zip(vals, A) if v]
    aad, mx, bias = stats(devs)
    ok = aad <= 0.10 and mx <= 0.30
    bad += 0 if ok else 1
    print(f"D3 (b) set A, 0.1 MPa, {len(devs)} points: AAD {aad:.3f} %, max {mx:.3f} %, bias {bias:+.3f} %   "
          f"SCORED  {'PASS' if ok else 'FAIL'} (limits 0.10 / 0.30)")
    B = [r for r in table("d3b_naoh_hnedkovsky2007.tsv") if inwin(float(r["T_K"]), float(r["w_NaOH"]))]
    vals = probe("liquidDensity03_NaOH", [(float(r["T_K"]), float(r["P_kPa"]) * 1e3, xm(float(r["w_NaOH"])))
                                          for r in B])
    for label, sel, lim in (("<= 2 MPa", lambda p: p <= 2000.5, (0.20, 0.30)), ("10 MPa", lambda p: p > 2000.5, None)):
        devs = [(v / float(r["rho_kg_m3"]) - 1) * 100 for v, r in zip(vals, B) if v and sel(float(r["P_kPa"]))]
        aad, mx, bias = stats(devs)
        ok = lim is None or (aad <= lim[0] and mx <= lim[1])
        bad += 0 if ok else 1
        tag = (f"SCORED  {'PASS' if ok else 'FAIL'} (limits {lim[0]} / {lim[1]})" if lim
               else "REPORTED (the law carries no pressure term)")
        print(f"D3 (c) set B {label}, {len(devs)} points: AAD {aad:.3f} %, max {mx:.3f} %, bias {bias:+.3f} %   {tag}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
