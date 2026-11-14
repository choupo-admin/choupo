#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""audit_components_thermoml.py -- the catalogue's pure-component records,
read back against the measurements the NIST ThermoML archive locates
(DEV.md 4c C279).

WHAT IT CHECKS
  For every catalogue component the identity bridge joins to archive
  compounds (thirdParty/thermoml/identity.json, built by
  `bin/choupo-thermoml identity`: InChIKey -> catalogue names), and for each
  of four properties, the record's OWN model -- evaluated by the engine --
  against every measured PURE-compound point:

    vapour pressure   ThermoML "Vapor or sublimation pressure, kPa" (liquid /
                      gas equilibrium only; a point whose property phase or
                      block phases name a crystal is excluded) and
                      "Boiling temperature at pressure P, K" read as a (T, P)
                      point.  Engine: choupoProps `propertyScan1D`, key
                      `Psat_<component>`.
    liquid Cp         "Molar heat capacity at constant pressure" and
                      "Specific heat capacity at constant pressure", liquid
                      phase.  Engine: key `Cp_liquid_<component>`.
    liquid viscosity  "Viscosity, Pa*s", liquid.  Engine: key
                      `viscosity_liquid`, once per liquid-viscosity model the
                      record carries (Andrade and Vogel, selected by the case's
                      `transport { liquid { viscosity { model ... } } }`).
    liquid density    "Mass density, kg/m3", liquid.  NO choupoProps key
                      publishes it.  The audit recomputes the engine's route
                      (ThermoPackage::density, liquid branch, src/thermo/
                      ThermoPackage.cpp: Rackett anchored on the record's
                      declared Vliq, closures::rackettVliq in src/thermo/
                      DerivedClosures.H) INDEPENDENTLY in Python, and is
                      cross-checked against the engine's own published
                      density (the `pipe` unit's `density` KPI) by
                      `--cross-check-density`.  The report labels it so.

  Per (component, property[, model]): points, studies (DOIs), temperature
  span, the record's declared validity window and how many points lie outside
  it, then -- inside and outside the window separately -- bias (mean signed
  relative error), AAD, maximum, and the share of points whose deviation is
  within the point's own stated expanded uncertainty
  (<nCombExpandUncertValue>, when present).  A per-study screen flags a STUDY
  that disagrees with the other studies by more than their spread; a record
  is "suspect" only when two or more studies that survive the screen agree
  against it.

WHAT IT DOES NOT CHECK
  * Mixtures (blocks with more than one <Component> are never read).
  * Anything the record does not model: a missing model is "no model in
    record", never a failure.
  * Pressure dependence: liquid points above 1000 kPa are excluded (the
    engine's liquid Cp, viscosity and density are saturated / low-pressure
    routes); a point with no declared pressure is kept and counted.
  * Whether an archive point is itself right: the archive is a transcription
    of journal tables (the screen can find a bad study, not prove a good one).
  * Critical constants, enthalpy of vaporisation, thermal conductivity,
    surface tension, transport of gases: not in this slice.
  * Kinematic viscosity (needs a density) and molar density are not read.
  * The text of any record, the engine source, or any gate.

OUTPUT
  A summary table on stdout; the full per-point CSV only to the path given by
  --csv (default: under --work).  The archive and its points are NEVER copied
  into the repository tree (Vitor's C225/C226 ruling: DOI and archive sha256,
  not the data).  Reads only the gitignored cache and the catalogue; runs the
  built engine (bin/choupoProps) in --work.  Run with `python3 -I`.
"""

import argparse
import csv
import hashlib
import json
import math
import os
import re
import statistics
import subprocess
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE = os.path.join(ROOT, "thirdParty", "thermoml")
CATALOGUE = os.path.join(ROOT, "data", "standards", "components")

# Relative-uncertainty floors used ONLY by the per-study screen, so a study
# is not flagged for disagreeing by less than the property is ever measured.
FLOOR = {"vp": 0.01, "cp": 0.01, "visc": 0.02, "dens": 0.001}
# A record is suspect when the surviving studies' AAD exceeds this.
SUSPECT = {"vp": 0.05, "cp": 0.05, "visc": 0.10, "dens": 0.02}
P_LIQUID_MAX_KPA = 1000.0


def local(tag):
    return tag.rsplit("}", 1)[-1]


def kids(el, name):
    return [c for c in el if local(c.tag) == name]


def first(el, name):
    for c in el.iter():
        if local(c.tag) == name:
            return c
    return None


def text_of(el, name):
    e = first(el, name) if el is not None else None
    return (e.text or "").strip() if e is not None else None


def num(s):
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


# --------------------------------------------------------------------------
#  Archive extraction
# --------------------------------------------------------------------------

PROPS = {
    "Vapor or sublimation pressure, kPa": "vp",
    "Boiling temperature at pressure P, K": "bt",
    "Molar heat capacity at constant pressure, J/K/mol": "cp",
    "Specific heat capacity at constant pressure, J/K/kg": "cp_mass",
    "Viscosity, Pa*s": "visc",
    "Mass density, kg/m3": "dens",
}
CRYSTALLINE = ("crystal", "solid", "sublim")


def to_kpa(label, value):
    u = label.rsplit(",", 1)[-1].strip()
    return value * {"kPa": 1.0, "MPa": 1000.0, "Pa": 1e-3, "bar": 100.0}.get(u, float("nan"))


def extract_file(args):
    path, wanted = args
    out, rej = [], defaultdict(int)
    try:
        root = ET.parse(path).getroot()
    except Exception:
        return out, {"unparseable file": 1}
    doi = os.path.relpath(path, CACHE)[:-4]
    org = {}
    for cpd in kids(root, "Compound"):
        o = text_of(cpd, "nOrgNum")
        k = text_of(cpd, "sStandardInChIKey")
        if o and k:
            org[o] = k
    for blk in kids(root, "PureOrMixtureData"):
        comps = kids(blk, "Component")
        if len(comps) != 1:
            continue
        key = org.get(text_of(comps[0], "nOrgNum") or "")
        if key not in wanted:
            continue
        phases = [(e.text or "").lower() for e in blk.iter() if local(e.tag) == "ePhase"]
        props = {}
        for pr in kids(blk, "Property"):
            nm = text_of(pr, "ePropName")
            pn = text_of(pr, "nPropNumber")
            if nm in PROPS:
                props[pn] = (PROPS[nm], (text_of(pr, "ePropPhase") or "").lower())
        if not props:
            continue
        # variables and constraints: temperature and pressure only
        var, fixed, bad = {}, {}, False
        for v in kids(blk, "Variable"):
            vt = first(v, "VariableType")
            lab = (list(vt)[0].text or "").strip() if vt is not None and len(vt) else ""
            var[text_of(v, "nVarNumber")] = lab
        for c in kids(blk, "Constraint"):
            ct = first(c, "ConstraintType")
            lab = (list(ct)[0].text or "").strip() if ct is not None and len(ct) else ""
            fixed[lab] = num(text_of(c, "nConstraintValue"))
        for lab in list(var.values()) + list(fixed):
            if not (lab.startswith("Temperature") or lab.startswith("Pressure")):
                bad = True
        if bad:
            rej["variable other than T/P"] += 1
            continue
        Tc = next((v for l, v in fixed.items() if l.startswith("Temperature")), None)
        Pc = next((to_kpa(l, v) for l, v in fixed.items()
                   if l.startswith("Pressure") and v is not None), None)
        for nv in kids(blk, "NumValues"):
            T, P = Tc, Pc
            for vv in kids(nv, "VariableValue"):
                lab = var.get(text_of(vv, "nVarNumber"), "")
                x = num(text_of(vv, "nVarValue"))
                if x is None:
                    continue
                if lab.startswith("Temperature"):
                    T = x
                elif lab.startswith("Pressure"):
                    P = to_kpa(lab, x)
            for pv in kids(nv, "PropertyValue"):
                pn = text_of(pv, "nPropNumber")
                if pn not in props:
                    continue
                kind, pph = props[pn]
                val = num(text_of(pv, "nPropValue"))
                if val is None:
                    rej["non-numeric value"] += 1
                    continue
                unc = num(text_of(pv, "nCombExpandUncertValue"))
                if kind in ("vp", "bt"):
                    # liquid/gas equilibrium only
                    if any(s in pph for s in CRYSTALLINE) or (
                            not pph and any(any(s in p for s in CRYSTALLINE) for p in phases)):
                        rej["sublimation / crystal phase"] += 1
                        continue
                    if kind == "vp":
                        if T is None:
                            rej["no temperature"] += 1
                            continue
                        out.append((key, "vp", T, val, unc, "P_kPa", doi))
                    else:
                        if P is None or not (P > 0):
                            rej["boiling T without pressure"] += 1
                            continue
                        out.append((key, "vp", val, P, unc, "T_K", doi))
                else:
                    if pph != "liquid":
                        rej["property phase '%s' (not liquid), %s%s" % (
                            pph or "none", kind,
                            ", P<=1000 kPa" if P is not None and P <= P_LIQUID_MAX_KPA else "")] += 1
                        continue
                    if T is None:
                        rej["no temperature"] += 1
                        continue
                    if P is not None and P > P_LIQUID_MAX_KPA:
                        rej["liquid above 1000 kPa"] += 1
                        continue
                    out.append((key, kind, T, val, unc,
                                "noP" if P is None else "ok", doi))
    return out, dict(rej)


def candidate_files(wanted):
    """Files that mention a wanted InChIKey (cheap text prefilter)."""
    rx = re.compile(r"<sStandardInChIKey>\s*([^<\s]+)\s*</sStandardInChIKey>")
    res = []
    for sub in sorted(os.listdir(CACHE)):
        d = os.path.join(CACHE, sub)
        if not (os.path.isdir(d) and sub.startswith("10.")):
            continue
        for f in sorted(os.listdir(d)):
            if not f.endswith(".xml"):
                continue
            p = os.path.join(d, f)
            try:
                t = open(p, encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            if any(k in wanted for k in rx.findall(t)):
                res.append(p)
    return res


# --------------------------------------------------------------------------
#  Catalogue records (the declared windows and the density route's inputs)
# --------------------------------------------------------------------------

def scalar(txt, key):
    m = re.search(r"^\s*%s\s+([-+0-9.eE]+)\s*;" % key, txt, re.M)
    return float(m.group(1)) if m else None


def block(txt, key, top=True):
    m = re.search((r"^%s\s*\{" if top else r"^\s*%s\s*\{") % key, txt, re.M)
    if not m:
        return None
    i, depth = m.end(), 1
    while i < len(txt) and depth:
        depth += {"{": 1, "}": -1}.get(txt[i], 0)
        i += 1
    return txt[m.end():i - 1]


def trange(b):
    if b is None:
        return None
    m = re.search(r"Trange\s*\(\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)\s*\)", b)
    return (float(m.group(1)), float(m.group(2))) if m else None


def read_record(name):
    t = open(os.path.join(CATALOGUE, name + ".dat"), encoding="utf-8").read()
    rec = {"name": name, "MW": scalar(t, "MW"), "Tc": scalar(t, "Tc"),
           "Pc": scalar(t, "Pc"), "omega": scalar(t, "omega"),
           "Vliq": scalar(t, "Vliq")}
    vp = block(t, "vaporPressure")
    rec["vp_model"] = (re.search(r"model\s+(\w+)", vp).group(1)
                       if vp and re.search(r"model\s+(\w+)", vp) else None)
    rec["vp_window"] = trange(vp)
    cp = block(t, "liquidHeatCapacity")
    rec["cp_has"] = cp is not None
    rec["cp_window"] = trange(cp)
    mm = re.search(r"coefficients\s*\(([^)]*)\)", cp or "")
    rec["cp_ncoef"] = len(mm.group(1).split()) if mm else None
    lv = block(t, "liquidViscosity")
    rec["visc_models"], rec["visc_windows"] = [], {}
    for m in ("andrade", "vogel", "chemsepEq101"):
        sb = block(lv, m, top=False) if lv else None
        if lv and re.search(r"(^|\s)%s\s*\{" % m, lv):
            sb = sb if sb is not None else lv[re.search(r"%s\s*\{" % m, lv).end():]
            rec["visc_models"].append(m)
            lo, hi = scalar(sb, "Tmin"), scalar(sb, "Tmax")
            rec["visc_windows"][m] = (lo, hi) if lo is not None and hi is not None else trange(sb)
    return rec


# --------------------------------------------------------------------------
#  Engine evaluation (choupoProps), one scratch case per component
# --------------------------------------------------------------------------

HEADER = "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"


def write_case(case, comp, transport_model):
    os.makedirs(os.path.join(case, "system"), exist_ok=True)
    os.makedirs(os.path.join(case, "constant"), exist_ok=True)
    open(os.path.join(case, "system", "controlDict"), "w").write(
        "application choupoProps;\ndescription \"c279 audit\";\nverbosity 0;\n")
    tr = ""
    if transport_model:
        tr = ("transport { liquid { viscosity { model %s; } } }\n" % transport_model)
    open(os.path.join(case, "constant", "thermoPhysPropDict"), "w").write(
        HEADER + "components ( %s );\n" % comp +
        "equilibrium { formulation gammaPhi; liquid { activityModel ideal; }"
        " vapour { fugacityModel idealGas; } }\n" + tr)


def scan_op(name, comp, prop, temps):
    pts = " ".join(repr(float(t)) for t in temps)
    return ("    { name %s; type propertyScan1D; vary { variable T; points ( %s ); }\n"
            "      state { P 1 bar; composition { %s 1.0; } }\n"
            "      properties ( %s ); output { file %s.csv; } }\n"
            % (name, pts, comp, prop, name))


def run_engine(case, ops, binary):
    open(os.path.join(case, "system", "propsDict"), "w").write(
        "operations\n(\n" + "".join(ops) + ");\n")
    r = subprocess.run([binary, case], capture_output=True, text=True,
                       env=dict(os.environ, CHOUPO_HOME=ROOT), timeout=900)
    return r


def read_scan(case, opname):
    """-> {T rounded to 1e-3 K: value (nan where the engine refused)}, or None."""
    path = os.path.join(case, opname + ".csv")
    if not os.path.exists(path):
        return None
    rows = list(csv.reader(open(path)))
    out = {}
    for r in rows[1:]:
        try:
            out[round(float(r[0]), 3)] = float(r[1])
        except ValueError:
            out[round(float(r[0]), 3)] = float("nan")
    return out


# --------------------------------------------------------------------------
#  Liquid density: the engine's route, recomputed (see the docstring)
# --------------------------------------------------------------------------

R_GAS = 8.314462618       # J/(mol K) -- closures::rackettVliq's own constant


def rackett(T, Tc, Pc_Pa, omega):
    """src/thermo/DerivedClosures.H rackettVliq, line for line."""
    Tr = T / Tc
    Zra = 0.29056 - 0.08775 * omega
    if Tr >= 1.0 or Zra <= 0.0:
        return float("nan")      # the engine's pow() gives NaN here
    return (R_GAS * Tc / Pc_Pa) * Zra ** (1.0 + (1.0 - Tr) ** (2.0 / 7.0))


def density_route(rec, T):
    """ThermoPackage::density, liquid branch (src/thermo/ThermoPackage.cpp,
    'constexpr scalar Tref_Vliq = 298.15' onward): anchored Rackett where the
    record declares Vliq and Tc/Pc, flat Vliq without critical constants,
    bare Rackett without Vliq.  Returns kg/m3, or None when the engine
    refuses (no route, or T >= Tc)."""
    MW, Tc, Pc, om, Vl = (rec["MW"], rec["Tc"], rec["Pc"], rec["omega"],
                          rec["Vliq"])
    if not MW:
        return None
    hasc = bool(Tc and Pc and Tc > 0 and Pc > 0)
    if hasc and T >= Tc:
        return None
    om = om or 0.0
    if Vl and hasc:
        V = Vl * rackett(T, Tc, Pc * 1e5, om) / rackett(298.15, Tc, Pc * 1e5, om)
    elif Vl:
        V = Vl
    elif hasc:
        V = rackett(T, Tc, Pc * 1e5, om)
    else:
        return None
    return MW / 1000.0 / V if math.isfinite(V) and V > 0 else None


# --------------------------------------------------------------------------
#  Statistics
# --------------------------------------------------------------------------

def stats(errs, within):
    """errs: relative errors; within: list of True/False/None."""
    n = len(errs)
    if not n:
        return {"n": 0}
    w = [x for x in within if x is not None]
    return {"n": n, "bias_pct": 100 * sum(errs) / n,
            "aad_pct": 100 * sum(abs(e) for e in errs) / n,
            "max_pct": 100 * max(abs(e) for e in errs),
            "n_unc": len(w),
            "within_unc_pct": (100.0 * sum(1 for x in w if x) / len(w)) if w else None}


def mad(xs):
    m = statistics.median(xs)
    return statistics.median([abs(x - m) for x in xs])


def screen_studies(rows, prop):
    """-> (flagged {doi: bool}, errors-by-study, median-by-study, deviation).

    The record's error is temperature dependent, so studies covering
    different temperature ranges are NOT compared by their median error.
    Each point's error is compared with the CONSENSUS of the OTHER studies in
    its temperature bin (width max(5 K, span/15); the consensus is the median
    of the other studies' own bin medians, needing at least two other
    studies in the bin).  A study's deviation is the median of those
    differences over its points; it is flagged when at least three points
    could be compared and |deviation| > 3 x FLOOR[prop] (vp, Cp 1 %; viscosity
    2 %; density 0.1 % -- what the property is ever measured to).  With fewer
    than three studies in a bin nothing can be flagged there: an
    unverifiable study is not a flagged one."""
    by = defaultdict(list)
    for r in rows:
        by[r["doi"]].append(r["err"])
    med = {d: statistics.median(v) for d, v in by.items()}
    flagged = {d: False for d in by}
    dev = {d: None for d in by}
    if len(by) >= 3:
        ts = [r["T"] for r in rows]
        w = max(5.0, (max(ts) - min(ts)) / 15.0)
        cell = defaultdict(lambda: defaultdict(list))
        for r in rows:
            cell[int((r["T"] - min(ts)) // w)][r["doi"]].append(r["err"])
        diffs = defaultdict(list)
        for r in rows:
            c = cell[int((r["T"] - min(ts)) // w)]
            oth = [statistics.median(v) for d, v in c.items() if d != r["doi"]]
            if len(oth) >= 2:
                diffs[r["doi"]].append(r["err"] - statistics.median(oth))
        for d, v in diffs.items():
            if len(v) >= 3:
                dev[d] = statistics.median(v)
                flagged[d] = abs(dev[d]) > 3 * FLOOR[prop]
    return flagged, by, med, dev


def analyse(name, prop, model, rows, window, rec_has_model):
    """rows: list of dict(T, meas, eng, err, within, doi, flag...)."""
    out = {"component": name, "property": prop, "model": model,
           "window": list(window) if window else None}
    out["n_points"] = len(rows)
    out["n_studies"] = len({r["doi"] for r in rows})
    if rows:
        out["T_min"] = min(r["T"] for r in rows)
        out["T_max"] = max(r["T"] for r in rows)
    if window:
        ins = [r for r in rows if window[0] <= r["T"] <= window[1]]
        outs = [r for r in rows if not (window[0] <= r["T"] <= window[1])]
        out["n_outside_window"] = len(outs)
        out["inside"] = stats([r["err"] for r in ins], [r["within"] for r in ins])
        out["outside"] = stats([r["err"] for r in outs], [r["within"] for r in outs])
        focus = ins
    else:
        out["n_outside_window"] = None
        out["no_window"] = stats([r["err"] for r in rows], [r["within"] for r in rows])
        focus = rows
    flagged, by, med, dev = screen_studies(focus, prop)
    out["studies"] = {d: {"n": len(v), "bias_pct": 100 * statistics.mean(v),
                          "median_pct": 100 * med[d],
                          "dev_vs_others_pct": None if dev[d] is None else 100 * dev[d],
                          "flagged": flagged[d]}
                      for d, v in by.items()}
    clean = [r for r in focus if not flagged.get(r["doi"], False)]
    cs = stats([r["err"] for r in clean], [r["within"] for r in clean])
    out["clean"] = cs
    nclean = len({r["doi"] for r in clean})
    out["n_clean_studies"] = nclean
    thr = SUSPECT[prop]
    out["suspect"] = bool(cs["n"] and nclean >= 2 and cs["aad_pct"] / 100 > thr
                          and len(by) >= 2)
    if len(by) == 2:
        a, b = list(med.values())
        out["two_study_conflict"] = abs(a - b) > 3 * FLOOR[prop]
    return out


# --------------------------------------------------------------------------
#  Per-component evaluation and the driver
# --------------------------------------------------------------------------

def eval_component(args):
    name, rec, temps, work, binary = args
    res = {"psat": {}, "psatg": {}, "grid": [], "cp": {}, "visc": {}, "log": []}
    base = os.path.join(work, "cases", name)
    ops, cp_ok = [], False
    if temps["vp"] and rec["vp_model"]:
        ops.append(scan_op("psat", name, "Psat_" + name, temps["vp"]))
        lo, hi = temps["vp"][0] - 100.0, temps["vp"][-1] + 100.0
        if rec["Tc"]:
            hi = min(hi, rec["Tc"] - 0.5)
        n = int((hi - max(lo, 20.0)) / 0.5) + 1
        grid = [round(max(lo, 20.0) + 0.5 * i, 3) for i in range(max(n, 2))]
        res["grid"] = grid
        ops.append(scan_op("psatg", name, "Psat_" + name, grid))
    if temps["cp"] and rec["cp_has"]:
        ops.append(scan_op("cp", name, "Cp_liquid_" + name, temps["cp"]))
    if ops:
        write_case(base, name, None)
        r = run_engine(base, ops, os.path.join(ROOT, "choupoProps")
                       if not binary else binary)
        res["log"].append("main rc=%d" % r.returncode)
        for op, key in (("psat", "psat"), ("psatg", "psatg"), ("cp", "cp")):
            if any(op == o.split()[2].rstrip(";") for o in ops):
                res[key] = read_scan(base, op) or {}
                if not res[key]:
                    res["log"].append("%s: no output (%s)" % (op, (r.stderr or r.stdout)[-300:].replace("\n", " ")))
    if temps["visc"]:
        for m in rec["visc_models"]:
            case = base + "_visc_" + m
            write_case(case, name, {"andrade": "Andrade", "vogel": "Vogel", "chemsepEq101": "chemsepEq101"}[m])
            op = scan_op("visc", name, "viscosity_liquid", temps["visc"])
            r = run_engine(case, [op], os.path.join(ROOT, "choupoProps")
                           if not binary else binary)
            res["visc"][m] = read_scan(case, "visc") or {}
            if not res["visc"][m]:
                res["log"].append("visc %s: no output (%s)" % (m, (r.stderr or r.stdout)[-300:].replace("\n", " ")))
    return name, res


def cross_check_density(work, comps, temps):
    """Run the engine's own published liquid density (the `pipe` unit's
    `density` KPI, tutorials/steady/hydraulics/pipe01_water_line copied to
    the scratch directory with the component and T replaced) and compare it
    with density_route().  Returns [(component, T, engine, recomputed)]."""
    import shutil
    src = os.path.join(ROOT, "tutorials", "steady", "hydraulics", "pipe01_water_line")
    out = []
    for c in comps:
        rec = read_record(c)
        for T in temps:
            d = os.path.join(work, "xc_%s_%g" % (c, T))
            shutil.rmtree(d, ignore_errors=True)
            shutil.copytree(src, d, ignore=shutil.ignore_patterns(
                "expected", "components", "propertyManifest", "converged", "reports"))
            for rel in ("0/feed", "0/downstream", "constant/thermoPhysPropDict",
                        "system/flowsheetDict"):
                f = os.path.join(d, rel)
                t = open(f).read().replace("water", c)
                t = re.sub(r"^T\s+300 K;", "T %g K;" % T, t, flags=re.M)
                open(f, "w").write(t)
            r = subprocess.run([os.path.join(ROOT, "choupoSolve"), d], capture_output=True,
                               text=True, env=dict(os.environ, CHOUPO_HOME=ROOT), timeout=300)
            m = re.search(r'"density":\s*([-+0-9.eE]+)', r.stdout)
            out.append((c, T, float(m.group(1)) if m else None, density_route(rec, T)))
    return out


def invert_boiling(curve, grid, P_pa, T_meas):
    """Engine boiling temperature at P_pa minus T_meas, by log-linear
    interpolation of the engine's own Psat curve (a scan on `grid`, 0.5 K
    steps).  None when P_pa lies outside the engine's curve over the grid."""
    pts = [(t, curve.get(rk(t))) for t in grid]
    pts = [(t, v) for t, v in pts if v is not None and math.isfinite(v) and v > 0]
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if v0 <= P_pa <= v1 and v1 > v0:
            f = (math.log(P_pa) - math.log(v0)) / (math.log(v1) - math.log(v0))
            return t0 + f * (t1 - t0) - T_meas
    return None


def rk(t):
    return round(float(t), 3)


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    scratch = os.environ.get("C279_WORK", "/tmp/c279")
    ap.add_argument("--work", default=scratch)
    ap.add_argument("--csv", default=None, help="full per-point CSV (default <work>/points.csv)")
    ap.add_argument("--summary", default=None, help="summary JSON (default <work>/summary.json)")
    ap.add_argument("--components", default="", help="comma list (default: all joined)")
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--binary", default=None)
    ap.add_argument("--reuse-points", action="store_true",
                    help="reuse <work>/extract.json instead of re-reading the archive")
    ap.add_argument("--cross-check-density", default="", metavar="COMP,COMP",
                    help="compare the recomputed density route with the engine's"
                         " own `pipe` density KPI for these components, then exit")
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    if a.cross_check_density:
        worst = 0.0
        for c, T, eng, rec_ in cross_check_density(a.work, a.cross_check_density.split(","),
                                                   (290.0, 300.0, 320.0)):
            dv = abs(eng - rec_) / eng if eng and rec_ else float("nan")
            worst = max(worst, dv) if dv == dv else worst
            print("%-12s T=%6.1f K  engine(pipe KPI)=%9.4f  recomputed=%9.4f  rel.diff=%.2e"
                  % (c, T, eng or float("nan"), rec_ or float("nan"), dv))
        print("worst relative difference: %.2e" % worst)
        return
    if os.path.realpath(a.work).startswith(os.path.realpath(ROOT) + os.sep) or \
            (a.csv and os.path.realpath(a.csv).startswith(os.path.realpath(ROOT) + os.sep)):
        sys.exit("refusing to write archive-derived points inside the repository tree")
    for need in (CACHE, os.path.join(CACHE, "identity.json")):
        if not os.path.exists(need):
            sys.exit("the ThermoML cache is absent (%s): run bin/choupo-thermoml sync" % need)
    sync = json.load(open(os.path.join(CACHE, "SYNC.json")))
    tgz = os.path.join(CACHE, sync["tarball"])
    if os.path.exists(tgz):
        verified = sha256_of(tgz) == sync["sha256"]
        if not verified:
            sys.exit("the cached tarball does not match the sha256 in SYNC.json: re-sync")
        print("archive %s sha256 %s: tarball verified against SYNC.json" % (sync["archiveDoi"], sync["sha256"]))
    else:
        verified = False
        print("NOTE: the tarball is absent, so the extracted XML is trusted as synced, NOT re-verified")
    ident = json.load(open(os.path.join(CACHE, "identity.json")))["byInchiKey"]
    key2names = {k: [n for n in v if os.path.exists(os.path.join(CATALOGUE, n + ".dat"))]
                 for k, v in ident.items()}
    key2names = {k: v for k, v in key2names.items() if v}
    if a.components:
        want = set(a.components.split(","))
        key2names = {k: [n for n in v if n in want] for k, v in key2names.items()}
        key2names = {k: v for k, v in key2names.items() if v}
    wanted = set(key2names)

    ex = os.path.join(a.work, "extract.json")
    if a.reuse_points and os.path.exists(ex):
        pts, rej = json.load(open(ex))
        rej = defaultdict(int, rej)
    else:
        files = candidate_files(wanted)
        pts, rej = [], defaultdict(int)
        with ProcessPoolExecutor(a.jobs) as pool:
            for o, r in pool.map(extract_file, [(f, wanted) for f in files], chunksize=20):
                pts.extend(o)
                for k, v in r.items():
                    rej[k] += v
        json.dump([pts, rej], open(ex, "w"))

    # group by catalogue name
    recs = {}
    byc = defaultdict(list)
    for p in pts:
        for n in key2names[p[0]]:
            byc[n].append(p)
    for n in byc:
        recs[n] = read_record(n)

    jobs = []
    for n, plist in byc.items():
        temps = {"vp": sorted({rk(p[2]) for p in plist if p[1] == "vp"}),
                 "cp": sorted({rk(p[2]) for p in plist if p[1] in ("cp", "cp_mass")}),
                 "visc": sorted({rk(p[2]) for p in plist if p[1] == "visc"})}
        jobs.append((n, recs[n], temps, a.work, a.binary))
    engine = {}
    with ProcessPoolExecutor(a.jobs) as pool:
        for n, res in pool.map(eval_component, jobs):
            engine[n] = res

    summary, csvrows, nomodel = [], [], defaultdict(list)
    for n, plist in sorted(byc.items()):
        rec, E = recs[n], engine[n]
        # ---- vapour pressure
        rows = []
        for (key, prop, T, val, unc, flag, doi) in plist:
            if prop != "vp":
                continue
            P = val        # kPa; for a boiling-T point T is the measured Tb at P
            e = E["psat"].get(rk(T))
            if e is None or not math.isfinite(e) or P <= 0:
                continue
            Pe = e / 1000.0
            err = (Pe - P) / P
            dTb = invert_boiling(E["psatg"], E["grid"], P * 1000.0, T)
            if unc is None:
                within = None
            elif flag == "T_K":
                within = (abs(dTb) <= unc) if dTb is not None else None
            else:
                within = abs(Pe - P) <= unc
            rows.append({"T": T, "meas": P, "eng": Pe, "err": err, "within": within,
                         "doi": doi, "dTb": dTb, "kind": flag})
            csvrows.append([n, "vp", rec["vp_model"], doi, T, P, Pe, err, dTb, within])
        if rows:
            s = analyse(n, "vp", rec["vp_model"], rows, rec["vp_window"], True)
            dts = [r["dTb"] for r in rows if r["dTb"] is not None and 50 <= r["meas"] <= 200]
            s["dTb_region_n"] = len(dts)
            s["dTb_region_mean_K"] = statistics.mean(dts) if dts else None
            s["dTb_region_studies"] = len({r["doi"] for r in rows if r["dTb"] is not None and 50 <= r["meas"] <= 200})
            summary.append(s)
        elif any(p[1] == "vp" for p in plist):
            nomodel[n].append("vp: %s" % ("no model in record" if not rec["vp_model"] else "engine returned no value (" + "; ".join(E["log"])[:120] + ")"))
        # ---- Cp
        rows = []
        for (key, prop, T, val, unc, flag, doi) in plist:
            if prop not in ("cp", "cp_mass"):
                continue
            e = E["cp"].get(rk(T))
            if e is None or not math.isfinite(e):
                continue
            f = (rec["MW"] / 1000.0) if prop == "cp_mass" else 1.0
            m = val * f
            u = unc * f if unc is not None else None
            err = (e - m) / m
            within = None if u is None else abs(e - m) <= u
            rows.append({"T": T, "meas": m, "eng": e, "err": err, "within": within, "doi": doi})
            csvrows.append([n, "cp", "polynomial", doi, T, m, e, err, None, within])
        if rows:
            s = analyse(n, "cp", "liquidHeatCapacity", rows, rec["cp_window"], True)
            s["cp_ncoef"] = rec["cp_ncoef"]
            summary.append(s)
        elif any(p[1] in ("cp", "cp_mass") for p in plist):
            nomodel[n].append("cp: no model in record" if not rec["cp_has"] else "cp: engine returned no value")
        # ---- viscosity
        vp_ = [p for p in plist if p[1] == "visc"]
        if vp_:
            if not rec["visc_models"]:
                nomodel[n].append("visc: no model in record")
            for m_ in rec["visc_models"]:
                rows = []
                for (key, prop, T, val, unc, flag, doi) in vp_:
                    e = E["visc"].get(m_, {}).get(rk(T))
                    if e is None or not math.isfinite(e) or val <= 0:
                        continue
                    err = (e - val) / val
                    within = None if unc is None else abs(e - val) <= unc
                    rows.append({"T": T, "meas": val, "eng": e, "err": err, "within": within, "doi": doi})
                    csvrows.append([n, "visc", m_, doi, T, val, e, err, None, within])
                if rows:
                    summary.append(analyse(n, "visc", m_, rows, rec["visc_windows"].get(m_), True))
        # ---- density (independent recomputation)
        dp = [p for p in plist if p[1] == "dens"]
        if dp:
            rows, refused = [], 0
            for (key, prop, T, val, unc, flag, doi) in dp:
                e = density_route(rec, T)
                if e is None or val <= 0:
                    refused += 1
                    continue
                err = (e - val) / val
                within = None if unc is None else abs(e - val) <= unc
                rows.append({"T": T, "meas": val, "eng": e, "err": err, "within": within, "doi": doi})
                csvrows.append([n, "dens", "RackettAnchored(recomputed)", doi, T, val, e, err, None, within])
            if rows:
                # Rackett declares no window; the AUDIT's own convention is Tr <= 0.95
                # (a saturated-liquid correlation is not asked near the critical point)
                dwin = (0.0, 0.95 * rec["Tc"]) if rec["Tc"] else None
                s = analyse(n, "dens", "RackettAnchored(recomputed)", rows, dwin, True)
                s["window_kind"] = "audit convention Tr<=0.95 (not declared by the record)"
                s["refused_points"] = refused
                s["route"] = ("anchored Rackett (Vliq + Tc/Pc)" if rec["Vliq"] and rec["Tc"] and rec["Pc"]
                              else "flat Vliq" if rec["Vliq"] else "bare Rackett (no Vliq)")
                s["omega"] = rec["omega"]
                summary.append(s)
            elif not (rec["Vliq"] or (rec["Tc"] and rec["Pc"])):
                nomodel[n].append("dens: no model in record (no Vliq, no Tc/Pc)")

    out_csv = a.csv or os.path.join(a.work, "points.csv")
    with open(out_csv, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["component", "property", "model", "doi", "T_K", "measured",
                    "engine", "rel_err", "dTb_K", "within_unc"])
        w.writerows(csvrows)
    sj = a.summary or os.path.join(a.work, "summary.json")
    json.dump({"rows": summary, "no_model": nomodel, "rejected": rej,
               "n_components": len(byc),
               "archive_sha256": sync["sha256"], "archive_tarball_verified": verified,
               "engine_logs": {n: E["log"] for n, E in engine.items() if E["log"]}},
              open(sj, "w"), indent=1)
    ranked = [r for r in summary if r["clean"]["n"] >= 5 and r["n_clean_studies"] >= 2]
    ranked.sort(key=lambda r: -r["clean"]["aad_pct"] / (100 * SUSPECT[r["property"]]))
    print("\nworst rows (>= 5 points, >= 2 studies surviving the screen; AAD relative to the property's threshold):")
    for r in ranked[:15]:
        print("  %-26s %-5s %-28s pts %5d studies %3d clean AAD %7.2f %%  suspect=%s"
              % (r["component"], r["property"], r["model"], r["n_points"], r["n_studies"],
                 r["clean"]["aad_pct"], r["suspect"]))
    print("components audited: %d; (component, property, model) rows: %d; per-point CSV: %s; summary: %s"
          % (len(byc), len(summary), out_csv, sj))


if __name__ == "__main__":
    main()
