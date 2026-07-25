#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_panel.py -- LVPP (NWChem b3lyp/def2-SVPD) vs the shipped VT-2005
                     COSMO sets, on a diverse panel of compounds present in BOTH.

PRIVATE STAGING TOOL under data/tmp/ (gitignored).  READ-ONLY with respect to
data/standards/ and src/.  It writes exactly one artefact: validation_panel.csv
next to this file (plus an optional per-compound profile dump).

For each panel compound it
  1. regenerates the 51-point sigma profile from the raw LVPP `.cosmo` with
     `sigma_profile.py` using the **Mullins** averaging (r_av = 0.8176300195 A,
     f_decay = 1) -- the convention of the VT-2005 profiles Choupo ships, so
     the two are compared on the same footing;
  2. reads the shipped `cosmo { VT2005 { area; volume; sigmaProfile (...) } }`
     block straight out of data/standards/components/<name>.dat;
  3. reports area/volume conservation, normalisation, sigma moments, and the
     profile-shape difference.

Usage:  python3 validate_panel.py [--dump]
"""

from __future__ import annotations

import csv
import math
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sigma_profile import profile, sigma_grid, moments  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, "..", "..", "..", ".."))
STD = os.path.join(REPO, "data", "standards", "components")
LVPP = os.path.join(HERE, "..", "lvpp_sigma", "release_v25")

# (choupo component, LVPP file stem, family)   -- diverse on purpose
PANEL = [
    ("nHexane",       "N-HEXANE",           "n-alkane"),
    ("nOctane",       "N-OCTANE",           "n-alkane"),
    ("cyclohexane",   "CYCLOHEXANE",        "cycloalkane"),
    ("ethylene",      "ETHYLENE",           "olefin"),
    ("benzene",       "BENZENE",            "aromatic"),
    ("toluene",       "TOLUENE",            "aromatic"),
    ("methanol",      "METHANOL",           "alcohol"),
    ("ethanol",       "ETHANOL",            "alcohol"),
    ("acetone",       "ACETONE",            "ketone"),
    ("ethylAcetate",  "ETHYL_ACETATE",      "ester"),
    ("aceticAcid",    "ACETIC_ACID",        "carboxylic acid"),
    ("diethylEther",  "DIETHYL_ETHER",      "ether"),
    ("Dichloroethane", "1,2-DICHLOROETHANE", "halogenated"),
    ("CS2",           "CARBON_DISULFIDE",   "sulfur / inorganic"),
    ("water",         "WATER",              "water"),
]


def read_vt2005(name: str) -> dict:
    """Pull the VT2005 cosmo set out of a Choupo component .dat (read-only)."""
    path = os.path.join(STD, name + ".dat")
    txt = open(path).read()
    i = txt.find("VT2005")
    if i < 0:
        raise ValueError("no VT2005 set in " + path)
    blk = txt[i:]
    area = float(re.search(r"\barea\s+([-\d.eE+]+)\s*;", blk).group(1))
    vol = float(re.search(r"\bvolume\s+([-\d.eE+]+)\s*;", blk).group(1))
    mvar = re.search(r"variant\s+\"([^\"]+)\"", blk)
    prof_txt = re.search(r"sigmaProfile\s*\((.*?)\)\s*;", blk, re.DOTALL).group(1)
    vals = [float(v) for v in prof_txt.split()]
    if len(vals) != 51:
        raise ValueError("%s: VT2005 profile has %d points" % (name, len(vals)))
    return {"area": area, "volume": vol, "variant": mvar.group(1) if mvar else "?",
            "psigmaA": np.array(vals)}


SIGMA_HB = 0.0084          # CosmoSac.cpp / usnistgov COSMO1Constants [e/A^2]


def hb_fraction(grid: np.ndarray, p: np.ndarray) -> float:
    """Fraction of the cavity area carrying |sigma| > sigma_hb -- the part of the
    surface the COSMO-SAC-2002 hydrogen-bond term can act on at all."""
    return float(p[np.abs(grid) > SIGMA_HB - 1e-12].sum() / p.sum())


def formula(atoms) -> str:
    from collections import Counter
    c = Counter(a.capitalize() for a in atoms)
    order = ["C", "H"] + sorted(k for k in c if k not in ("C", "H"))
    return "".join("%s%s" % (e, c[e] if c[e] > 1 else "") for e in order if e in c)


def main() -> int:
    dump = "--dump" in sys.argv
    grid = sigma_grid()
    rows = []
    print("%-16s %-9s | %9s %9s %6s | %9s %9s %6s | %8s %8s"
          % ("compound", "family", "A_LVPP", "A_VT", "dA%", "V_LVPP", "V_VT",
             "dV%", "L1n%", "maxdn"))
    print("-" * 118)
    # The CONTROL entry first: the SOURCE file the VT-2005 ethanol profile itself
    # was made from (usnistgov/COSMOSAC profiles/DMol3_TEST, InChIKey
    # LFQSCWFLJHTTHZ = ethanol, cavity area 88.40645 A^2 == the shipped VT2005
    # area).  Pushing it through this very pipeline measures the pipeline error,
    # so every LVPP row below can be read against a known-zero baseline.
    entries = [("ethanol", os.path.join(HERE, "..", "nist_cosmosac_ref",
                                        "LFQSCWFLJHTTHZ-UHFFFAOYSA-N.cosmo"),
                "CONTROL", "LFQSCWFLJHTTHZ-UHFFFAOYSA-N.cosmo (DMol3, VT-2005 source)")]
    entries += [(c, os.path.join(LVPP, s + ".cosmo"), f, s + ".cosmo")
                for c, s, f in PANEL]

    for comp, cpath, fam, stem in entries:
        if not os.path.exists(cpath):
            print("MISSING " + cpath)
            continue
        rec = profile(cpath, "Mullins")
        vt = read_vt2005(comp)

        pL = np.array(rec["psigmaA_A2"])          # [A^2] per bin
        pV = vt["psigmaA"]                        # [A^2] per bin

        # (a) conservation -----------------------------------------------------
        closL = pL.sum() - rec["cavityArea_A2"]
        closV = pV.sum() - vt["area"]
        segclos = rec["segmentAreaSum_A2"] - rec["cavityArea_A2"]

        # (c) moments ----------------------------------------------------------
        mL = moments(grid, pL)
        mV = moments(grid, pV)

        # (d) shape ------------------------------------------------------------
        # absolute (area) profiles
        maxdev_A = float(np.max(np.abs(pL - pV)))
        L1_A = float(np.sum(np.abs(pL - pV)))
        # normalised (probability) profiles -- shape only, scale removed
        nL, nV = pL / pL.sum(), pV / pV.sum()
        maxdev_n = float(np.max(np.abs(nL - nV)))
        L1_n = float(np.sum(np.abs(nL - nV)))      # 2 x total-variation distance

        dA = 100.0 * (rec["cavityArea_A2"] / vt["area"] - 1.0)
        dV = 100.0 * (rec["cavityVolume_A3"] / vt["volume"] - 1.0)

        rows.append({
            "component": comp, "family": fam, "sourceFile": stem,
            "lvppFormula": formula(rec["atoms"]),
            "nSegments": rec["nSegments"],
            "area_LVPP_A2": round(rec["cavityArea_A2"], 5),
            "area_VT2005_A2": round(vt["area"], 5),
            "areaDiff_pct": round(dA, 3),
            "volume_LVPP_A3": round(rec["cavityVolume_A3"], 5),
            "volume_VT2005_A3": round(vt["volume"], 5),
            "volumeDiff_pct": round(dV, 3),
            "segAreaSum_minus_cavity_A2": round(segclos, 6),
            "profileSum_LVPP_A2": round(float(pL.sum()), 6),
            "profileSum_minus_area_LVPP_A2": round(closL, 9),
            "profileSum_VT2005_A2": round(float(pV.sum()), 6),
            "profileSum_minus_area_VT2005_A2": round(closV, 6),
            "M0_LVPP_A2": round(mL["M0_area_A2"], 5),
            "M0_VT_A2": round(mV["M0_area_A2"], 5),
            "M1_LVPP": round(mL["M1_mean_sigma"], 8),
            "M1_VT": round(mV["M1_mean_sigma"], 8),
            "M1abs_LVPP": round(mL["M1abs_mean_absSigma"], 8),
            "M1abs_VT": round(mV["M1abs_mean_absSigma"], 8),
            "M1abs_diff_pct": round(100.0 * (mL["M1abs_mean_absSigma"]
                                             / mV["M1abs_mean_absSigma"] - 1.0), 3),
            "M2_LVPP": round(mL["M2_meansq_sigma"], 10),
            "M2_VT": round(mV["M2_meansq_sigma"], 10),
            "M2_diff_pct": round(100.0 * (mL["M2_meansq_sigma"]
                                          / mV["M2_meansq_sigma"] - 1.0), 3),
            # sigma-moment in AREA units (the extensive form: A * <sigma^2>)
            "AM2_LVPP": round(mL["M0_area_A2"] * mL["M2_meansq_sigma"], 8),
            "AM2_VT": round(mV["M0_area_A2"] * mV["M2_meansq_sigma"], 8),
            "AM2_diff_pct": round(100.0 * (mL["M0_area_A2"] * mL["M2_meansq_sigma"]
                                           / (mV["M0_area_A2"] * mV["M2_meansq_sigma"])
                                           - 1.0), 3),
            "maxAbsDev_area_A2": round(maxdev_A, 5),
            "L1_area_A2": round(L1_A, 5),
            "L1_area_pct_of_VT": round(100.0 * L1_A / pV.sum(), 3),
            "maxAbsDev_norm": round(maxdev_n, 6),
            "L1_norm": round(L1_n, 6),
            "hbAreaFrac_LVPP": round(hb_fraction(grid, pL), 5),
            "hbAreaFrac_VT": round(hb_fraction(grid, pV), 5),
            "hbAreaFrac_ratio": (round(hb_fraction(grid, pL) / hb_fraction(grid, pV), 4)
                                 if hb_fraction(grid, pV) > 0 else ""),
            "sigmaAvgMin_LVPP": round(rec["sigmaAvgMin"], 6),
            "sigmaAvgMax_LVPP": round(rec["sigmaAvgMax"], 6),
            "totalCharge_e": round(rec["totalCharge_e"], 6),
            "VT_variant": vt["variant"],
        })
        print("%-16s %-9s | %9.3f %9.3f %+6.2f | %9.3f %9.3f %+6.2f | %8.2f %8.4f"
              % (comp, fam[:9], rec["cavityArea_A2"], vt["area"], dA,
                 rec["cavityVolume_A3"], vt["volume"], dV, 100 * L1_n, maxdev_n))

        if dump:
            with open(os.path.join(HERE, "profiles", "profiles_%s_%s.csv" % (comp, fam.replace("/","-").replace(" ",""))), "w") as fp:
                fp.write("sigma,psigmaA_LVPP_A2,psigmaA_VT2005_A2\n")
                for s, a, b in zip(grid, pL, pV):
                    fp.write("%+.3f,%.10e,%.10e\n" % (s, a, b))

    out = os.path.join(HERE, "validation_panel.csv")
    with open(out, "w", newline="") as fp:
        w = csv.DictWriter(fp, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print("\nwrote " + out)

    # ---- overall (CONTROL row excluded: it measures the pipeline, not LVPP) ---
    rows_l = [r for r in rows if r["family"] != "CONTROL"]
    dA = np.array([r["areaDiff_pct"] for r in rows_l])
    dV = np.array([r["volumeDiff_pct"] for r in rows_l])
    L1n = np.array([r["L1_norm"] for r in rows_l])
    m2 = np.array([r["M2_diff_pct"] for r in rows_l])
    am2 = np.array([r["AM2_diff_pct"] for r in rows_l])
    clo = np.array([abs(r["profileSum_minus_area_LVPP_A2"]) for r in rows_l])
    print("\nPANEL SUMMARY -- LVPP rows only (n = %d); CONTROL row excluded" % len(rows_l))
    print("  area   LVPP vs VT2005 : mean %+.2f %%  min %+.2f  max %+.2f  (all positive: %s)"
          % (dA.mean(), dA.min(), dA.max(), bool((dA > 0).all())))
    print("  volume LVPP vs VT2005 : mean %+.2f %%  min %+.2f  max %+.2f  (all positive: %s)"
          % (dV.mean(), dV.min(), dV.max(), bool((dV > 0).all())))
    print("  <sigma^2> (intensive) : mean %+.2f %%  min %+.2f  max %+.2f" % (m2.mean(), m2.min(), m2.max()))
    print("  A*<sigma^2> (extensive): mean %+.2f %%  min %+.2f  max %+.2f" % (am2.mean(), am2.min(), am2.max()))
    print("  shape L1 (normalised) : mean %.3f  min %.3f  max %.3f   (0 = identical, 2 = disjoint)"
          % (L1n.mean(), L1n.min(), L1n.max()))
    hb = np.array([r["hbAreaFrac_ratio"] for r in rows_l if r["hbAreaFrac_ratio"] != "" and r["hbAreaFrac_VT"] > 0])
    print("  HB-active area ratio  : mean %.3f  min %.3f  max %.3f   (1 = same HB-capable area)"
          % (hb.mean(), hb.min(), hb.max()))
    print("  area closure |sum p - A_cavity| : max %.3e A^2" % clo.max())
    ctl = [r for r in rows if r["family"] == "CONTROL"]
    if ctl:
        c = ctl[0]
        print("  CONTROL (VT-2005 source file through this very pipeline):"
              " dArea %+.4f %%  dM2 %+.3f %%  L1_norm %.4f  maxAbsDev %.4f A^2"
              % (c["areaDiff_pct"], c["M2_diff_pct"], c["L1_norm"], c["maxAbsDev_area_A2"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
