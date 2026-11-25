#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""c501_column_design_table -- record the engine runs behind the EduTool
"Designing a column for a real mixture" (gui/src/ui/methods/ColumnDesignTool.tsx).

    bin/curate/c501_column_design_table.py            # all of it, ~20 minutes
    bin/curate/c501_column_design_table.py --only ew  # one system

WHAT IT RECORDS, AND WHY IT IS A RECORD AND NOT A LIVE RUN.  The page draws
the design curve R(N): for each integer stage count N, the reflux ratio at
which a rigorous column (`model simultaneous`) meets a FIXED specification --
both key purities.  Each point is a `designSpec` (two unknowns R and D, two
targets x_D and x_B) around ~20 MESH solves, 5-10 s each; a browser would
spend minutes per knob turn, so the sweep is run here, once, by the engine
(`choupoSolve`), and the numbers are written to
`gui/src/case/columnDesignRecorded.json`.  The page says "recorded run"
and names this command.  Nothing in that file is computed by this script:
it edits `nStages` / `feedStage` and the targets in COPIES of a case, runs
`choupoSolve` on them and copies the KPIs the engine printed.

THE TWO SYSTEMS.
  ew  ethanol/water, NRTL, ideal vapour: the shipped case
      tutorials/steady/distillation/column21_design_curve_ethanol_water
      (feed 100 kmol/h, 30/70 ethanol/water, saturated liquid, 1 atm), the
      strongly non-ideal mixture with the azeotrope at x ~ 0.894.
  bt  benzene/toluene, ideal: the SAME case with the thermo and the feed of
      column02_simultaneous (50/50), the ideal control.  Not a shipped case:
      a scratch copy of column21 with those two files swapped.

WHAT EACH SYSTEM'S TABLE HOLDS.
  curve      per N: R, D, Q_reboiler, Q_condenser, the designed diameter and
             the engine's Turton total-module cost of the five items, and the
             reboiler's utility cost per hour (the engine's own utility
             record), or `failed` when no reflux up to R_MAX meets the spec
  nMin       the smallest N for which the designSpec converges (R <= R_MAX)
  shortcut   the Fenske-Underwood-Gilliland `shortcutColumn` on the SAME
             mixture and the SAME products (recoveries from the mass
             balance), N_min, R_min, alpha, and N at a list of R/R_min
  specs      for ew only: the same two numbers (rigorous R at N = N_BIG,
             rigorous N_min, FUG R_min and N_min) at several distillate
             purities, to show where the shortcut parts from the rigorous
             column as the product nears the azeotrope

FEED PLACEMENT.  feedStage = round(FEED_FRACTION * N), the fraction chosen by
the scan `--scan-feed` (smallest R at N = 30); it is written into the record.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DIST = os.path.join(ROOT, "tutorials", "steady", "distillation")
CASE_EW = os.path.join(DIST, "column21_design_curve_ethanol_water")
CASE_COL02 = os.path.join(DIST, "column02_simultaneous")
CASE_SHORT = os.path.join(DIST, "shortcut01_benzene_toluene")
OUT = os.path.join(ROOT, "gui", "src", "case", "columnDesignRecorded.json")
SOLVE = os.path.join(ROOT, "choupoSolve")

R_MAX = 400.0
REFLUX_FACTORS = [1.02, 1.05, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0, 2.5, 3.5, 5.0, 8.0]
N_BIG = 80

# name -> (feed lines, spec x_D(LK), x_B(HK), N grid, feed fraction)
SPEC = {
    "ew": dict(xD=0.85, xB=0.99, fraction=0.9,
               grid=[11, 12, 13, 14, 16, 18, 20, 24, 30, 40, 50, 60, 80]),
    "bt": dict(xD=0.95, xB=0.95, fraction=0.5,
               grid=[8, 9, 10, 11, 12, 14, 16, 20, 25, 30, 40, 60, 80]),
}
# ew only: further distillate purities (x_B stays 0.99)
EW_XD = [0.60, 0.70, 0.80, 0.85, 0.88]


def sub(text, key, value):
    """Set `key <value>;` once in a dict text."""
    new, n = re.subn(r"(?m)^(\s*%s\s+)[^;]*;" % re.escape(key),
                     lambda m: "%s%s;" % (m.group(1), value), text)
    if n != 1:
        raise RuntimeError("key %r matched %d times" % (key, n))
    return new


def parse(stdout):
    a = stdout.index("<<<Choupo:result-begin>>>") + len("<<<Choupo:result-begin>>>")
    b = stdout.index("<<<Choupo:result-end>>>")
    return json.loads(stdout[a:b], strict=False)


def run(case):
    p = subprocess.run([SOLVE, case], capture_output=True, text=True)
    if "<<<Choupo:result-begin>>>" not in p.stdout:
        return None, (p.stdout + p.stderr)[-400:]
    return parse(p.stdout), ""


def scratch(system, tmp):
    """A copy of column21 (and, for bt, with column02's thermo and feed)."""
    dst = os.path.join(tmp, "case_" + system)
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(CASE_EW, dst, ignore=shutil.ignore_patterns(
        "converged", "reports", "design", "designspec_history.csv", "expected"))
    if system == "bt":
        for f in ("constant/thermoPhysPropDict", "0/feed", "0/distillate",
                  "0/bottoms"):
            shutil.copy(os.path.join(CASE_COL02, f), os.path.join(dst, f))
        # the hydraulics need a surface tension, as in column21
        with open(os.path.join(dst, "constant/thermoPhysPropDict"), "a") as fh:
            fh.write("\ntransport\n{\n    interface\n    {\n"
                     "        surfaceTension { model BrockBird; }\n    }\n}\n")
        # the reboiler of a benzene/toluene bottoms: column09's LMTD
        pd = os.path.join(dst, "system/postDict")
        t = open(pd).read().replace("LMTD            25.0;", "LMTD            17.0;")
        open(pd, "w").write(t)
    return dst


def point(dst, system, N, xD, xB, fraction, R0=3.0, keep_txy=False):
    fl = os.path.join(dst, "system/flowsheetDict")
    t = open(fl).read()
    t = sub(t, "nStages", str(N))
    t = sub(t, "feedStage", str(max(2, min(N - 1, round(fraction * N)))))
    open(fl, "w").write(t)
    od = os.path.join(dst, "system/outerDict")
    t = open(od).read()
    t = re.sub(r"(path\s+column\.x_D_LK;\s+value\s+)[^;]*;",
               lambda m: "%s%r;" % (m.group(1), xD), t)
    t = re.sub(r"(path\s+column\.x_B_HK;\s+value\s+)[^;]*;",
               lambda m: "%s%r;" % (m.group(1), xB), t)
    # bt's distillate is about half the feed: widen the D window
    t = re.sub(r"\{ variable D;[^}]*\}",
               "{ variable D;  initial 50.0 kmol/h;  min 10.0 kmol/h;  max 90.0 kmol/h; }"
               if system == "bt" else
               "{ variable D;  initial 32.0 kmol/h;  min 10.0 kmol/h;  max 60.0 kmol/h; }", t)
    t = re.sub(r"\{ variable R;[^}]*\}",
               "{ variable R;  initial %.4f;  min 0.05;  max %.1f; }" % (R0, R_MAX), t)
    open(od, "w").write(t)
    # the variables block carries the same start as outerDict's `initial`
    t = open(fl).read()
    t = re.sub(r"(?m)^(\s*D\s+)[^;]*;",
               lambda m: "%s%s kmol/h;" % (m.group(1), "50.0" if system == "bt" else "32.0"), t, count=1)
    t = re.sub(r"(?m)^(\s*R\s+)[^;]*;", lambda m: "%s%.4f;" % (m.group(1), R0), t, count=1)
    open(fl, "w").write(t)
    res, err = run(dst)
    if res is None or not res.get("converged"):
        return {"N": N, "failed": True, "why": err[-200:] if err else "not converged"}
    k = res["kpis"]["column"]
    # a designSpec stopped on a bound of R or D has not met the specification:
    # refuse the point rather than record an off-specification run
    if abs(k["x_D_LK"] - xD) > 1e-3 or abs(k["x_B_HK"] - xB) > 1e-3:
        return {"N": N, "failed": True,
                "why": "off specification: x_D %.4f, x_B %.4f" % (k["x_D_LK"], k["x_B_HK"])}
    items = {r["itemId"].split("/")[1]: r["totalModule"]
             for r in res["equipmentList"]["rows"]}
    eur_h = 0.0
    qkw = 0.0
    cond_eur_h = 0.0
    for u in res.get("utilityAllocation", []):
        if u["port"] == "reboiler":
            eur_h, qkw = u["eur_h"], u["duty_kW"]
        elif u["port"] == "condenser":
            cond_eur_h = u["eur_h"]
    if keep_txy:
        return res["txy"]
    return {
        "N": N, "feedStage": int(k["feedStage"]), "R": k["R"], "D_kmolh": k["D"] * 3600,
        "xD": k["x_D_LK"], "xB": k["x_B_HK"],
        "Qreb_kW": k["Q_reboiler_kW"], "Qcond_kW": -k["Q_condenser_kW"],
        "diameter_m": k["diameter"], "nTrays": int(k["nTrays"]),
        "capex_EUR": {**items, "total": sum(items.values())},
        "reboilerUtility": {"utility": "steamLP", "EUR_per_h": eur_h, "duty_kW": qkw,
                            "EUR_per_kWh": eur_h / qkw if qkw else None},
        "condenserUtility": {"utility": "coolingWater", "EUR_per_h": cond_eur_h},
    }


def shortcut_case(system, tmp, xD, xB, rf):
    dst = os.path.join(tmp, "short_" + system)
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(CASE_SHORT, dst, ignore=shutil.ignore_patterns(
        "converged", "reports", "design", "expected"))
    if system == "ew":
        for f in ("constant/thermoPhysPropDict", "0/feed", "0/distillate",
                  "0/bottoms"):
            shutil.copy(os.path.join(CASE_EW, f), os.path.join(dst, f))
        lk, hk, F, zlk, zhk = "ethanol", "water", 100.0, 30.0, 70.0
    else:
        lk, hk, F, zlk, zhk = "benzene", "toluene", 100.0, 50.0, 50.0
    # mass balance of the two-component split fixes the recoveries:
    #   D (xD) + B (1-xB) = lk feed ; D = F z_lk-based
    xBlk = 1.0 - xB
    D = (zlk - xBlk * F) / (xD - xBlk)
    recLK = D * xD / zlk
    recHK = D * (1.0 - xD) / zhk
    fl = os.path.join(dst, "system/flowsheetDict")
    t = open(fl).read()
    t = sub(t, "lightKey", lk)
    t = sub(t, "heavyKey", hk)
    t = sub(t, "recoveryLK", "%.8f" % recLK)
    t = sub(t, "recoveryHK", "%.8f" % recHK)
    t = sub(t, "refluxFactor", "%.6f" % rf)
    open(fl, "w").write(t)
    return dst, recLK, recHK


def shortcut(system, tmp, xD, xB):
    out = {"curve": []}
    for rf in REFLUX_FACTORS:
        dst, recLK, recHK = shortcut_case(system, tmp, xD, xB, rf)
        res, err = run(dst)
        if res is None:
            out["curve"].append({"refluxFactor": rf, "failed": True, "why": err})
            continue
        k = next(v for v in res["kpis"].values() if "N_min" in v)
        out["recoveryLK"], out["recoveryHK"] = recLK, recHK
        out.update({"Nmin": k["N_min"], "Rmin": k["R_min"], "theta": k["theta"],
                    "alpha": k["alpha_LK_HK"]})
        out["curve"].append({"refluxFactor": rf, "R": k["R"], "N": k["N_theoretical"],
                             "feedStage": k.get("feed_stage")})
    return out


def sweep(system, tmp, xD=None, xB=None, grid=None, fraction=None):
    s = SPEC[system]
    xD = s["xD"] if xD is None else xD
    xB = s["xB"] if xB is None else xB
    grid = s["grid"] if grid is None else grid
    fraction = s["fraction"] if fraction is None else fraction
    dst = scratch(system, tmp)
    pts = []
    R0 = 3.0
    for N in grid:
        p = point(dst, system, N, xD, xB, fraction, R0)
        if "R" in p:
            R0 = p["R"]
        print("  %s N=%d  %s" % (system, N, "R=%.4f" % p["R"] if "R" in p else "FAILED"),
              flush=True)
        pts.append(p)
    return pts


def n_min(system, tmp, xD, xB, fraction, lo=3, hi=14):
    """Smallest N whose designSpec converges (R <= R_MAX)."""
    dst = scratch(system, tmp)
    for N in range(lo, hi + 1):
        p = point(dst, system, N, xD, xB, fraction)
        if "R" in p and p["R"] < R_MAX - 1.0:
            return N, p
    return None, None


def specs_table(tmp):
    print("ew specs", flush=True)
    rows = []
    for xd in EW_XD:
        chain = sweep("ew", tmp, xD=xd, grid=[30, 40, 50, 60, 70, N_BIG])
        ok = [p for p in chain if "R" in p]
        big = ok[-1] if ok else {"N": None}
        nm, _ = n_min("ew", tmp, xd, 0.99, SPEC["ew"]["fraction"], lo=3, hi=40)
        sc = shortcut("ew", tmp, xd, 0.99)
        rows.append({"xD": xd, "xB": 0.99, "Nbig": big.get("N"),
                     "rigorousR_atNbig": big.get("R"),
                     "rigorousNmin": nm, "fugRmin": sc.get("Rmin"),
                     "fugNmin": sc.get("Nmin"), "fugAlpha": sc.get("alpha")})
    return {"Nbig": N_BIG, "rows": rows}


def txy(system, tmp):
    """The engine's own isobaric T-x-y scan (it prints one with every column
    run), and the azeotrope read from it: where the bubble curve T(x) and the
    dew curve T(y) cross at the same composition, interpolated linearly on the
    scan's grid (a reading, not a located point)."""
    dst = scratch(system, tmp)
    s = SPEC[system]
    t = point(dst, system, 30, s["xD"], s["xB"], s["fraction"], keep_txy=True)
    if isinstance(t, dict) and t.get("failed"):
        return None
    x, tb, y, td = t["xBubble"], t["Tbubble"], t["yDew"], t["Tdew"]
    az = None
    for i in range(len(x) - 1):
        d0, d1 = y[i] - x[i], y[i + 1] - x[i + 1]
        if d0 * d1 < 0:
            az = x[i] + (x[i + 1] - x[i]) * d0 / (d0 - d1)
            break
    t["azeotropeX"] = az
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["ew", "bt"])
    ap.add_argument("--specs-only", action="store_true",
                    help="redo only the ethanol/water purity table of an existing record")
    ap.add_argument("--shortcut-only", action="store_true",
                    help="redo only the shortcut records of an existing record")
    ap.add_argument("--txy-only", action="store_true",
                    help="add the T-x-y scans to an existing record and exit")
    ap.add_argument("--scan-feed", action="store_true",
                    help="print R at N=30 for several feed fractions and exit")
    a = ap.parse_args()
    if not os.path.exists(SOLVE):
        sys.exit("choupoSolve not built: make -j1 all")
    with tempfile.TemporaryDirectory() as tmp:
        if a.scan_feed:
            for system in (a.only or "ew",):
                dst = scratch(system, tmp)
                for fr in ((0.8, 0.85, 0.9, 0.93, 0.97) if system == "ew"
                           else (0.4, 0.5, 0.6)):
                    p = point(dst, system, 30, SPEC[system]["xD"], SPEC[system]["xB"], fr)
                    print(system, fr, p.get("R"), p.get("failed"))
            return
        if a.txy_only:
            rec = json.load(open(OUT))
            for system in ("ew", "bt"):
                if system in rec["systems"]:
                    rec["systems"][system]["txy"] = txy(system, tmp)
            json.dump(rec, open(OUT, "w"), indent=1)
            return
        if a.shortcut_only:
            rec = json.load(open(OUT))
            for system in ("ew", "bt"):
                sp = SPEC[system]
                rec["systems"][system]["shortcut"] = shortcut(system, tmp, sp["xD"], sp["xB"])
            json.dump(rec, open(OUT, "w"), indent=1)
            return
        if a.specs_only:
            rec = json.load(open(OUT))
            rec["specs"] = specs_table(tmp)
            json.dump(rec, open(OUT, "w"), indent=1)
            return
        rec = {"about": "Recorded engine runs behind the EduTool 'column-design'; "
                        "regenerate with bin/curate/c501_column_design_table.py. "
                        "Nothing here is computed by the script: it edits two dict "
                        "scalars of a case, runs choupoSolve and copies the KPIs.",
               "R_MAX": R_MAX, "systems": {}}
        for system in ([a.only] if a.only else ["ew", "bt"]):
            s = SPEC[system]
            print(system, "curve", flush=True)
            entry = {"spec": {"xD": s["xD"], "xB": s["xB"]},
                     "feedFraction": s["fraction"],
                     "curve": sweep(system, tmp)}
            nm, _ = n_min(system, tmp, s["xD"], s["xB"], s["fraction"])
            entry["nMin"] = nm
            entry["txy"] = txy(system, tmp)
            print(system, "shortcut", flush=True)
            entry["shortcut"] = shortcut(system, tmp, s["xD"], s["xB"])
            rec["systems"][system] = entry
        if not a.only or a.only == "ew":
            rec["specs"] = specs_table(tmp)
        rec["N_BIG"] = N_BIG
        old = {}
        if a.only and os.path.exists(OUT):
            old = json.load(open(OUT))
            old["systems"].update(rec["systems"])
            if "specs" in rec:
                old["specs"] = rec["specs"]
            rec = old
        with open(OUT, "w") as fh:
            json.dump(rec, fh, indent=1)
        print("wrote", OUT)


if __name__ == "__main__":
    main()
