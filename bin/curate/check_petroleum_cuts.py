#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: `petroleumCuts` cuts a TBP curve into pseudo-components the way Riazi
(ASTM MNL50, 2005) says, and refuses what it cannot do honestly.

    bin/curate/check_petroleum_cuts.py

WHY THIS EXISTS (DEV.md 4c C228).  The engine had the Riazi-Daubert constants
for ONE lump (estimateComponent) and nothing that turns a distillation CURVE
into several.  `petroleumCuts` does, and its arithmetic is a chain of eight
steps (mid-point Tb, Watson K by fixed point, cut SG, mole fractions, MABP,
CABP, MeABP, blend SG) in which a slip in any one still produces a plausible
table.  This gate RECOMPUTES the chain in independent Python, from the
curve and from the book's equations as printed (the Kelvin form of Eq. 2.50,
2.63, 2.64, 2.98 -- the engine carries the Rankine form of the same
constants), and holds the engine to it.

WHAT IT CHECKS, ARM BY ARM.
  (a) THE CHAIN.  For both ops of the witness (`cuts5`, `cuts3`): feed SG,
      cut Tb, bulk Watson K, cut SG, API, Watson K per cut, the three
      fraction bases and their sums (each = 1), VABP / MABP / CABP / MeABP,
      the blend SG, API and Watson K, and the closure miss are equal to the
      independent recomputation to 1e-9 relative; MW, Tc, Pc, Vc (the
      Riazi-Daubert constants of the estimator the op REUSES) to 5e-4
      relative -- the engine's constants are the Rankine-form roundings of
      the book's Kelvin-form ones, which is a published-constant rounding and
      NOT an engine difference.  omega is checked for consistency with the
      engine's own Lee-Kesler closure at 2e-3, not against the book (Eq.
      2.105 was not re-read for this gate).
  (b) THE BOOK'S PRINTED NUMBERS.  Riazi prints a TBP curve (Table 3.6, p.
      103) and, in Example 3.2 (p. 102), the SG 0.7862 it gives by Eq. 3.17
      (T10 = 71.1 C, T50 = 204.4 C, the TBP row of Table 3.4).  The engine's
      feed SG from `specificGravityFrom TBP` is held to 0.7862 within 2e-4
      (the book adds 273 for K, the engine 273.15: 0.78632 against 0.7862 --
      a 0.015 % difference named here, and the replay with 273 gives the
      printed digits exactly).  Example 2.11 (p. 73) prints Kw = 11.08 and
      API = 12.23 for Tb = 720.7 K, SG = 0.9845: a constructed probe (one
      cut, declared SG) reproduces them to the printed digits.  These are
      ARITHMETIC anchors: the book prints no cut Tb, SG, MW or Tc for the
      curve, so nothing here is a validation against a unit.
  (c) REFUSALS BY NAME, each fired through the real reader on a case built
      for the purpose: ASTM D86 / D1160 curve type ("conversion ... not
      implemented"); curve basis absent; a non-monotone curve (temperature,
      and fraction); cut boundaries that do not run 0 -> 1 ("cut fractions do
      not sum to 1"); the closure tolerance absent; a cut mid-point outside
      the curve ("cannot extrapolate"); the feed SG declared twice and not at
      all; an unknown cut-SG method; a proposal under data/standards/.
      The negative (the witness) exits 0.
  (d) CLOSURE IS ANNOUNCED, NOT ADJUSTED.  `cuts3` declares a tolerance
      tighter than its miss: the run prints `[closure]`, publishes
      closure_ok = 0 and the SAME blend SG the independent replay computes;
      `cuts5` closes and announces nothing.
  (e) THE RECORDS.  Every cut writes one `.estimated.dat` that says ESTIMATE,
      lumped and "NOT a real species", carries the cut's API and Watson K in
      its header (equal to the published numbers), and -- promoted by `mv` as
      its own header says -- is READ BY THE ENGINE: an isothermal flash over
      the five cuts as components runs.
  (f) THE GATE CAN FAIL.  A 1 % change of the replayed Watson K is rejected
      by the comparator of arm (a); the header of PetroleumCuts.H cites the
      equations the gate holds.

NOT COVERED, stated so the OK line cannot imply it: nothing here is a
measurement -- the curve is a book's illustration, the cut boundaries are the
witness's choice, and constant Watson K across the cuts is an assumption of
the op, not a finding.  ASTM D86 -> TBP (Riazi Eq. 3.14, Table 3.2) is legible
in the book and is not implemented.  The Kesler-Lee Cp is reused as shipped
and is not held to the book's Eq. 6.72 here.

SABOTAGE-VERIFIED 2026-11-05, by hand on PetroleumCuts.cpp (each restored
byte-identical, rebuilt, the gate green again):

S1 -- the Eq. 3.17 exponent 0.20862 -> 0.21862:
    (a) cuts5: feed.SG engine 0.836355 != independent 0.786322 (and every
    downstream number)
S2 -- the CABP constant 255.37 -> 255.0 (Eq. 3.4):
    (a) cuts5: feed.WatsonK engine 11.80839 != independent 11.81002
S3 -- MABP weighted by MASS fraction instead of mole fraction (Eq. 3.3):
    (a) cuts5: feed.WatsonK engine 11.9358 != independent 11.8100
S4 -- the extrapolation refusal of the curve interpolation disabled:
    (c) mid-point outside the curve: exited 0 (the refusal did not fire)
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/estimate/petroleumCuts01_riazi_table36_tbp"
PROPS = ROOT / "choupoProps"
SRC_H = ROOT / "src/propertyOps/PetroleumCuts.H"

# Riazi Table 3.6 TBP column (vol% distilled, C), p. 103.
CURVE_C = [(0.0, 10.0), (0.1, 71.1), (0.3, 143.3), (0.5, 204.4),
           (0.7, 250.6), (0.9, 291.7)]
CURVE_K = [(f, t + 273.15) for f, t in CURVE_C]
CUTS5 = [0.0, 0.1, 0.3, 0.5, 0.7, 1.0]
CUTS3 = [0.0, 0.3, 0.7, 1.0]


def run(binary, cwd):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(binary)], cwd=str(cwd), env=env, capture_output=True,
                       text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def ops_of(out):
    js = result_json(out) or {}
    return {o["name"]: o.get("diagnostics", {}) for o in js.get("operationResults", [])}


# ------------------------------- the independent replay -----------------------
def interp(curve, f):
    for k in range(1, len(curve)):
        if f <= curve[k][0] + 1e-12:
            t = (f - curve[k - 1][0]) / (curve[k][0] - curve[k - 1][0])
            return curve[k - 1][1] + t * (curve[k][1] - curve[k - 1][1])
    return curve[-1][1]


def riazi_daubert_K(Tb, SG):
    """Riazi Eq. 2.50, 2.63, 2.64, 2.98 as printed (Tb in K)."""
    return {
        "MW": 1.6607e-4 * Tb ** 2.1962 * SG ** -1.0164,
        "Tc": 19.06232 * Tb ** 0.58848 * SG ** 0.3596,
        "Pc": 5.53027e7 * Tb ** -2.3125 * SG ** 2.3201,
        "Vc": 1.7842e-4 * Tb ** 2.3829 * SG ** -1.683,
    }


def mw_rankine(Tb_K, SG):
    """The MW constants in the form the engine's RiaziDaubert.cpp carries them
    (Tb in degrees Rankine) -- used INSIDE the chain so that the mole-fraction
    arithmetic is compared at 1e-9; the book's Kelvin form (above) is compared
    to the engine's published MW at 5e-4 per cut."""
    return 4.5673e-5 * (1.8 * Tb_K) ** 2.1962 * SG ** -1.0164


def feed_sg_eq317(curve, offset=273.15):
    c = [(f, t - 273.15 + offset) for f, t in curve]
    T10, T50 = interp(c, 0.10), interp(c, 0.50)
    return 0.10431 * T10 ** 0.12550 * T50 ** 0.20862


def replay(curve, bounds, SGfeed, kw_scale=1.0):
    n = len(bounds) - 1
    w = [bounds[i + 1] - bounds[i] for i in range(n)]
    Tb = [interp(curve, 0.5 * (bounds[i] + bounds[i + 1])) for i in range(n)]
    Kw = (1.8 * sum(a * b for a, b in zip(w, Tb))) ** (1 / 3) / SGfeed
    for _ in range(500):
        SG = [(1.8 * t) ** (1 / 3) / Kw for t in Tb]
        MW = [mw_rankine(t, s) for t, s in zip(Tb, SG)]
        mass = [a * s for a, s in zip(w, SG)]
        m = sum(mass)
        mass = [x / m for x in mass]
        mol = [x / mw for x, mw in zip(mass, MW)]
        nn = sum(mol)
        mol = [x / nn for x in mol]
        MABP = sum(a * b for a, b in zip(mol, Tb))
        s3 = sum(a * (1.8 * t - 459.67) ** (1 / 3) for a, t in zip(w, Tb))
        CABP = s3 ** 3 / 1.8 + 255.37
        Me = 0.5 * (MABP + CABP)
        Kn = (1.8 * Me) ** (1 / 3) / SGfeed
        if abs(Kn - Kw) <= 1e-13 * Kw:
            Kw = Kn
            break
        Kw = Kn
    Kw *= kw_scale
    SG = [(1.8 * t) ** (1 / 3) / Kw for t in Tb]
    MW = [mw_rankine(t, s) for t, s in zip(Tb, SG)]
    mass = [a * s for a, s in zip(w, SG)]
    m = sum(mass)
    mass = [x / m for x in mass]
    mol = [x / mw for x, mw in zip(mass, MW)]
    nn = sum(mol)
    mol = [x / nn for x in mol]
    vol = list(w)
    MABP = sum(a * b for a, b in zip(mol, Tb))
    VABP = sum(a * b for a, b in zip(vol, Tb))
    s3 = sum(a * (1.8 * t - 459.67) ** (1 / 3) for a, t in zip(vol, Tb))
    CABP = s3 ** 3 / 1.8 + 255.37
    Me = 0.5 * (MABP + CABP)
    SGmix = sum(a * b for a, b in zip(vol, SG))
    return dict(w=w, Tb=Tb, Kw=Kw, SG=SG, MW=MW, mass=mass, mole=mol, vol=vol,
                MABP=MABP, VABP=VABP, CABP=CABP, MeABP=Me, SGmix=SGmix,
                APImix=141.5 / SGmix - 131.5,
                Kwmix=(1.8 * Me) ** (1 / 3) / SGmix,
                MWmix=sum(a * b for a, b in zip(mol, MW)),
                diff=(SGmix - SGfeed) / SGfeed)


def close(a, b, rel, absol=0.0):
    return abs(a - b) <= max(rel * abs(b), absol)


def compare_chain(name, d, r, SGfeed, fails, kw_scale=1.0):
    def chk(key, got, want, rel=1e-9, absol=1e-12):
        if got is None:
            fails.append(f"(a) {name}: {key} not published")
        elif not close(got, want, rel, absol):
            fails.append(f"(a) {name}: {key} engine {got!r} != independent {want!r}")

    chk("feed_SG", d.get("feed_SG"), SGfeed)
    chk("feed_WatsonK", d.get("feed_WatsonK"), r["Kw"])
    chk("feed_API", d.get("feed_API"), 141.5 / SGfeed - 131.5)
    chk("mixture_SG", d.get("mixture_SG"), r["SGmix"])
    chk("mixture_API", d.get("mixture_API"), r["APImix"])
    chk("mixture_WatsonK", d.get("mixture_WatsonK"), r["Kwmix"])
    chk("mixture_VABP_K", d.get("mixture_VABP_K"), r["VABP"])
    chk("mixture_MABP_K", d.get("mixture_MABP_K"), r["MABP"])
    chk("mixture_CABP_K", d.get("mixture_CABP_K"), r["CABP"])
    chk("mixture_MeABP_K", d.get("mixture_MeABP_K"), r["MeABP"])
    chk("mixture_MW", d.get("mixture_MW"), r["MWmix"])
    chk("closure_SGdiff_rel", d.get("closure_SGdiff_rel"), r["diff"], rel=1e-6, absol=1e-9)
    for k in ("fractionSum", "volumeFractionSum", "massFractionSum", "moleFractionSum"):
        chk(k, d.get(k), 1.0, rel=1e-12)
    for i in range(len(r["Tb"])):
        p = f"cut{i + 1:02d}_"
        chk(p + "fraction", d.get(p + "fraction"), r["w"][i])
        chk(p + "volumeFraction", d.get(p + "volumeFraction"), r["vol"][i])
        chk(p + "massFraction", d.get(p + "massFraction"), r["mass"][i])
        chk(p + "moleFraction", d.get(p + "moleFraction"), r["mole"][i])
        chk(p + "Tb_K", d.get(p + "Tb_K"), r["Tb"][i])
        chk(p + "SG", d.get(p + "SG"), r["SG"][i])
        chk(p + "API", d.get(p + "API"), 141.5 / r["SG"][i] - 131.5)
        chk(p + "WatsonK", d.get(p + "WatsonK"), (1.8 * r["Tb"][i]) ** (1 / 3) / r["SG"][i])
        rd = riazi_daubert_K(r["Tb"][i], r["SG"][i])
        chk(p + "MW", d.get(p + "MW"), rd["MW"], rel=5e-4)
        chk(p + "Tc_K", d.get(p + "Tc_K"), rd["Tc"], rel=5e-4)
        chk(p + "Pc_bar", d.get(p + "Pc_bar"), rd["Pc"], rel=5e-4)
        chk(p + "Vc_cm3mol", d.get(p + "Vc_cm3mol"), rd["Vc"], rel=5e-4)
        # omega: consistency with Lee-Kesler (Eq. 2.105 form, engine closure)
        Tc, Pc_atm, Tb = d.get(p + "Tc_K"), d.get(p + "Pc_bar") / 1.01325, r["Tb"][i]
        tbr = Tb / Tc
        t6 = tbr ** 6
        alpha = -math.log(Pc_atm) - 5.97214 + 6.09648 / tbr + 1.28862 * math.log(tbr) - 0.169347 * t6
        beta = 15.2518 - 15.6875 / tbr - 13.4721 * math.log(tbr) + 0.43577 * t6
        chk(p + "omega", d.get(p + "omega"), alpha / beta, rel=2e-3)
    return not any(f.startswith(f"(a) {name}") for f in fails)


# ------------------------------- probe cases -----------------------------------
POINTS = ("{ fraction 0.00; T 10.0 C; } { fraction 0.10; T 71.1 C; } "
          "{ fraction 0.30; T 143.3 C; } { fraction 0.50; T 204.4 C; } "
          "{ fraction 0.70; T 250.6 C; } { fraction 0.90; T 291.7 C; }")


def op_text(name="probe", ctype="TBP", basis="basis volume;", points=POINTS,
            feed="feed { specificGravityFrom TBP; }",
            cuts="cuts { boundaries ( 0.0 0.1 0.3 0.5 0.7 1.0 ); }",
            sgm="specificGravity { method constantWatsonK; }",
            closure="closure { specificGravityTolerance 0.02; }",
            output=""):
    return (f"operations\n(\n {{ name {name}; type petroleumCuts;\n"
            f"  curve {{ type {ctype}; {basis} points ( {points} ); }}\n"
            f"  {feed}\n  {cuts}\n  {sgm}\n  {closure}\n  {output}\n }}\n);\n")


def probe(propsdict_text, extra_edit=None):
    d = Path(tempfile.mkdtemp(prefix="pc_probe_"))
    try:
        dst = d / "case"
        shutil.copytree(CASE, dst)
        for stale in list((dst / "constant/components").glob("*.estimated.dat")):
            stale.unlink()
        (dst / "system/propsDict").write_text(propsdict_text)
        if extra_edit:
            extra_edit(dst)
        rc, out = run(PROPS, dst)
        return rc, out, dst, d
    except Exception:
        shutil.rmtree(d, ignore_errors=True)
        raise


def refusal(label, text, needle, fails, extra_edit=None):
    rc, out, _dst, d = probe(text, extra_edit)
    shutil.rmtree(d, ignore_errors=True)
    if rc == 0:
        fails.append(f"(c) {label}: exited 0 (the refusal did not fire)")
    elif needle not in out:
        fails.append(f"(c) {label}: refused without naming '{needle}': {out[-300:]!r}")


def main():
    fails = []
    if not PROPS.exists():
        print(f"check_petroleum_cuts: CANNOT RUN -- {PROPS} is not built")
        return 2

    # ---- the witness, in a scratch copy (it writes records and CSVs) -----------
    d = Path(tempfile.mkdtemp(prefix="pc_wit_"))
    try:
        wit = d / "case"
        shutil.copytree(CASE, wit)
        for stale in list((wit / "constant/components").glob("*.estimated.dat")):
            stale.unlink()
        rc, out = run(PROPS, wit)
        if rc != 0:
            print("check_petroleum_cuts: FAIL\n  - the witness exited %d:\n%s" % (rc, out[-800:]))
            return 1
        ops = ops_of(out)

        # ---- (a) the chain -----------------------------------------------------
        SGfeed = feed_sg_eq317(CURVE_K)
        r5 = replay(CURVE_K, CUTS5, SGfeed)
        r3 = replay(CURVE_K, CUTS3, SGfeed)
        ok5 = compare_chain("cuts5", ops.get("cuts5", {}), r5, SGfeed, fails)
        ok3 = compare_chain("cuts3", ops.get("cuts3", {}), r3, SGfeed, fails)

        # ---- (f) the comparator can fail ---------------------------------------
        pert = replay(CURVE_K, CUTS5, SGfeed, kw_scale=1.01)
        scratch = []
        compare_chain("cuts5", ops.get("cuts5", {}), pert, SGfeed, scratch)
        if not scratch:
            fails.append("(f) the comparator accepted a 1 % change of Watson K: the gate cannot fail")
        hdr = SRC_H.read_text()
        for needle in ("Eq. 3.17", "Table 3.4", "Eq. 2.13", "Eq. 3.45", "Eq. 3.5",
                       "Eq. 2.4 ", "p. 102-103", "p. 35"):
            if needle not in hdr:
                fails.append(f"(f) PetroleumCuts.H does not cite '{needle}'")

        # ---- (b) the book's printed numbers -----------------------------------
        sg_engine = ops.get("cuts5", {}).get("feed_SG", float("nan"))
        if abs(sg_engine - 0.7862) > 2e-4:
            fails.append(f"(b) feed SG {sg_engine:.5f} is not the book's 0.7862 within 2e-4")
        if abs(feed_sg_eq317(CURVE_K, offset=273.0) - 0.7862) > 5e-5:
            fails.append("(b) the replay with the book's +273 does not give the printed 0.7862")
        ex211 = op_text(
            name="ex211", basis="basis mass;",
            points="{ fraction 0.0; T 700.0 K; } { fraction 0.5; T 720.7 K; } { fraction 1.0; T 740.0 K; }",
            feed="feed { specificGravity 0.9845; }", cuts="cuts { boundaries ( 0.0 1.0 ); }",
            sgm="specificGravity { method declared; values ( 0.9845 ); }",
            closure="closure { specificGravityTolerance 0.05; }")
        rc, o, _dst, dd = probe(ex211)
        shutil.rmtree(dd, ignore_errors=True)
        e = ops_of(o).get("ex211", {}) if rc == 0 else {}
        if rc != 0 or not e:
            fails.append("(b) the Example 2.11 probe did not run: " + o[-300:])
        else:
            if abs(e["cut01_WatsonK"] - 11.08) > 0.005:
                fails.append(f"(b) Example 2.11 Kw {e['cut01.WatsonK']:.4f} != printed 11.08")
            if abs(e["cut01_API"] - 12.23) > 0.015:
                fails.append(f"(b) Example 2.11 API {e['cut01.API']:.4f} != printed 12.23")

        # ---- (d) closure announced, not adjusted -------------------------------
        a3, a5 = ops.get("cuts3", {}), ops.get("cuts5", {})
        if a3.get("closure_ok") != 0.0 or a5.get("closure_ok") != 1.0:
            fails.append(f"(d) closure_ok cuts3={a3.get('closure_ok')} cuts5={a5.get('closure_ok')} "
                         "(expected 0 and 1)")
        if out.count("[closure]") != 1:
            fails.append(f"(d) expected exactly one [closure] announcement, saw {out.count('[closure]')}")
        if not close(a3.get("mixture_SG", 0), r3["SGmix"], 1e-9):
            fails.append("(d) the blend SG was adjusted on a miss")

        # ---- (e) the records ----------------------------------------------------
        recs = sorted((wit / "constant/components").glob("petCut*_*.estimated.dat"))
        if len(recs) != len(CUTS5) - 1 + len(CUTS3) - 1:
            fails.append(f"(e) {len(recs)} records written, expected {len(CUTS5) + len(CUTS3) - 2}")
        for f in recs:
            t = f.read_text()
            for needle in ('status        "ESTIMATE"', "lumped        true", "NOT a real species", "Watson K =", "API ="):
                if needle not in t:
                    fails.append(f"(e) {f.name} lacks '{needle}'")
        if recs:
            m = re.search(r"SG\(60/60 F\) = ([0-9.]+)\s+API = ([0-9.]+)\s+Watson K = ([0-9.]+)",
                          (wit / "constant/components/petCut_03.estimated.dat").read_text())
            if not m or not (close(float(m.group(1)), a5["cut03_SG"], 1e-5)
                             and close(float(m.group(2)), a5["cut03_API"], 1e-5)
                             and close(float(m.group(3)), a5["cut03_WatsonK"], 1e-5)):
                fails.append("(e) the record header's SG/API/Watson K differ from the published ones")
        # promote by `mv` (as the header says) into an UNSEALED copy and use them
        use = d / "use"
        shutil.copytree(CASE, use)
        (use / "constant/propertyManifest").unlink()
        for f in recs:
            if f.name.startswith("petCut_"):
                shutil.copy(f, use / "constant/components" / f.name.replace(".estimated", ""))
        comps = " ".join(f"petCut_{i:02d}" for i in range(1, 6))
        (use / "constant/thermoPhysPropDict").write_text(
            "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
            f"components ( {comps} );\n"
            "equilibrium { formulation gammaPhi;\n"
            " liquid { activityModel ideal; standardState pureLiquid; }\n"
            " vapour { fugacityModel idealGas; } }\n")
        # a steady isothermal flash over the five cuts: the records carry
        # Tc/Pc/omega + Ambrose-Walton + Cp, which is what a flash reads.
        for sub in ("system", "0"):
            (use / sub).mkdir(exist_ok=True)
        (use / "system/controlDict").write_text(
            "application choupoSolve;\ndescription \"gate probe\";\nverbosity 1;\n")
        (use / "system/flowsheetDict").write_text(
            "units\n(\n { name fl; type isothermalFlash; in feed; outputs ( liquid vapor );\n"
            "   operation { T 450 K; P 1 bar; } }\n);\n")
        body = "componentMolarFlows\n{\n" + "".join(
            f"    petCut_{i:02d} 10 kmol/h;\n" for i in range(1, 6)) + "}\nT 450 K;\nP 100000 Pa;\n"
        for nm in ("feed", "liquid", "vapor"):
            (use / "0" / nm).write_text(body)
        rc, o = run(ROOT / "choupoSolve", use)
        if rc != 0 or '"vapor"' not in o:
            fails.append("(e) the promoted cut records are not read by a flash: " + o[-500:])
    finally:
        shutil.rmtree(d, ignore_errors=True)

    # ---- (c) the refusals ---------------------------------------------------------
    refusal("ASTM D86 curve", op_text(ctype="D86"), "conversion D86 -> TBP not implemented", fails)
    refusal("ASTM D1160 curve", op_text(ctype="D1160"), "conversion D1160 -> TBP not implemented", fails)
    refusal("basis absent", op_text(basis=""), "`curve.basis` not declared", fails)
    refusal("non-monotone temperature",
            op_text(points=POINTS.replace("T 143.3 C", "T 60.0 C")), "not monotone", fails)
    refusal("non-monotone fraction",
            op_text(points=POINTS.replace("fraction 0.30", "fraction 0.10")), "not monotone", fails)
    refusal("fractions do not sum to 1",
            op_text(cuts="cuts { boundaries ( 0.0 0.5 0.9 ); }"), "cut fractions do not sum to 1", fails)
    refusal("tolerance absent", op_text(closure=""), "specificGravityTolerance", fails)
    refusal("mid-point outside the curve",
            op_text(points="{ fraction 0.0; T 10 C; } { fraction 0.2; T 70 C; } { fraction 0.4; T 140 C; }",
                    feed="feed { specificGravity 0.78; }"),
            "cannot extrapolate", fails)
    refusal("feed SG declared twice",
            op_text(feed="feed { specificGravity 0.78; specificGravityFrom TBP; }"),
            "exactly one way", fails)
    refusal("feed SG not declared", op_text(feed="feed { }"), "exactly one way", fails)
    refusal("unknown cut-SG method", op_text(sgm="specificGravity { method magic; }"),
            "unknown (constantWatsonK | declared)", fails)
    refusal("proposal under data/standards",
            op_text(output="output { proposal " + str(ROOT / "data/standards/zz_probe") + "; }"),
            "refusing to write", fails)

    if fails:
        print("check_petroleum_cuts: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_petroleum_cuts: OK -- the TBP curve of Riazi Table 3.6 cut into 5 and 3 pseudo-components "
          "equals an independent Python recomputation (feed SG, cut Tb, bulk Watson K, cut SG, API, Watson K, "
          "the three fraction bases summing to 1, VABP/MABP/CABP/MeABP, blend SG/API/Watson K, closure miss "
          "to 1e-9; MW/Tc/Pc/Vc to 5e-4, the Rankine-form rounding of the book's Kelvin-form constants); "
          f"Eq. 3.17 gives the printed {sg_engine:.4f} against 0.7862 (the book adds 273, the engine 273.15) and "
          "Example 2.11's Kw 11.08 and API 12.23 are reproduced -- ARITHMETIC anchors, the book prints no cut "
          "Tb/SG/MW/Tc for the curve; 12 refusals fire through the real reader; the closure miss is "
          "announced and never adjusted; every record is read by the engine once promoted.  NOT covered: "
          "nothing here is measured, constant Watson K is the op's assumption, D86 -> TBP is not implemented, "
          "Kesler-Lee Cp and Lee-Kesler omega are reused as shipped and not held to the book.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
