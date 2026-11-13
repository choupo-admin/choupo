#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the KINETIC FULL MESH -- a reaction rate LAW (written in the case) carried by the rigorous column.

    bin/curate/check_kinetic_mesh.py

WHY THIS EXISTS (DEV.md 4c C233).  C231 gave the full MESH an equilibrium
extent per reactive stage and refused `kinetics {}` there by name.  The
kinetic form now enters the same rows with the extent COMPUTED, not solved for:
xi_j = r(T_j, x_j, gamma_j) x m_cat,j on every reactive stage, the law READ by
the reaction factory from the case (`kinetics { model expression; ... }`, with
`a[i]` = gamma_i x_i added to the state a law may read and offered ONLY by the
column), the catalyst mass entering by an announced continuation, and still no
heat-of-reaction term.  A column of this kind can be wrong in ways no golden
sees -- a sign on the extent, a missing continuation, a reaction heat counted
twice, a law evaluated at the wrong state -- so this gate proves the machinery
by a LIMIT and recomputes what the engine claims from numbers it publishes.

WHAT IT CHECKS

  (a) THE PROOF, A LIMIT.  A constructed case on column19's problem whose law
      is mass action on the SAME K_a column19 closes (Izquierdo Eq. 15),
      r = kcat (a_MeOH a_IB - a_MTBE / K_a): its fixed point is column19's
      equilibrium, so as the catalyst mass grows the kinetic column must
      CONVERGE on column19's answer -- the conversion rising monotonically
      and the distance to column19's temperature and composition profile
      falling monotonically over 100 to 1e6 kg, ending within 1e-3 in
      conversion, 0.5 K and 1e-2 in mole fraction (MEASURED: 2e-4, 0.32 K,
      3.7e-3 at 1e6 kg; the continuation does not reach 1e8 kg in minutes, so
      the limit is approached, never claimed exactly).
  (b) ZERO CATALYST gives the non-reactive column: extent exactly zero, every
      component leaving as it entered, no MTBE on any stage, B + D = F.  (A
      reference column with the `reaction` block deleted or K_a = 1e-30 was
      tried and is NOT used: the first does not converge from the CMO seed, the
      second does not finish in minutes -- both measured, both pre-existing
      fragilities of the cold reactive-seed path.)
  (c) THE WITNESS (column20, Rehfinger & Hoffmann): r is RECOMPUTED here in
      Python from the T, x and gamma the column publishes on every reactive
      stage (k(T) Eq. 15, K_a(T) Eq. 6, capacity, the rate of Eq. 12) and must
      equal the published r to 1e-9 relative; the extent equals r x m_cat/5;
      the a_MeOH and x_MeOH of the reactive stages are PRINTED against the
      x_MeOH = 0.3 below which the paper says its model under-predicts.
  (d) CLOSURE WITHOUT A PLUG on the witness: mass, every element, the
      plant-boundary first law, the reboiler's own envelope, and
      B + D = F + Sum(nu) Sum(xi) with the mole change.
  (e) REFUSALS BY NAME on constructed cases: `a[i]` in a reactor that does
      not offer it (a cstr), an unknown component inside `a[..]`, a law per
      reactor volume in the column, an unknown kinetics model word, the
      native word without its legs, `model simultaneous` over Sum nu != 0, and
      a law with no value (0/0) -- which must end as an ANNOUNCED infeasible
      trial and a NOT-converged column, never a number.
  (f) Eq. 6 of Rehfinger & Hoffmann with K_a(298.15) = 284 reproduces the
      seven values of Izquierdo's Table IV (Rehfinger column), to its rounding.
  (g) SOURCE: the C231 refusal of kinetics under the full MESH is gone, the
      rate is evaluated per reactive stage in the full-MESH rows, the
      continuation is present, and no reaction-heat term enters those rows.

NOT CHECKED, said plainly: that the column agrees with any measured MTBE
column (nothing here is validated against a measurement); that UNIFAC predicts
the activities the UNIQUAC-fitted law was fitted on; the effectiveness factor
(internal diffusion) which the law does not carry.

SABOTAGES performed by hand (engine rebuilt each time, then restored): see the
commit message for what each made this gate say.
  S1  drop the sign of the mole change in the TOTAL rows for kinetics
  S2  delete the catalyst-mass continuation (switch the reaction on whole)
  S3  add the reaction heat to the stage energy rows (counted twice)
  S4  evaluate the rate at the previous iterate's gamma (stale activities)
"""

import csv
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
DIST = ROOT / "tutorials" / "steady" / "distillation"
C19 = DIST / "column19_mtbe_reactive_mesh"
C20 = DIST / "column20_mtbe_kinetic_mesh"
USEROP03 = ROOT / "tutorials" / "steady" / "userops" / "userOp03_case_rate_law"
COLUMN = ROOT / "src" / "unitOperations" / "distillation" / "DistillationColumn.cpp"
FAILS = []
NU = {"methanol": -1.0, "isoButene": -1.0, "methylTertButylEther": 1.0}
RX_STAGES = [5, 6, 7, 8, 9]
R_GAS = 8.314462


def fail(msg):
    FAILS.append(msg)
    print("  FAIL " + msg)


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def run(case: Path, timeout=900):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    try:
        p = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=str(case), env=env,
                           capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT"
    return p.returncode, p.stdout + p.stderr


def result_json(out):
    a = out.find("<<<Choupo:result-begin>>>")
    b = out.find("<<<Choupo:result-end>>>")
    if a < 0 or b < 0:
        return None
    try:
        return json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    except ValueError:
        return None


def copy_case(src: Path, dst_root: Path, tag: str) -> Path:
    dst = dst_root / tag
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns("reports", "converged", "iterations", "log.*"))
    return dst


def edit(case: Path, rel: str, old: str, new: str):
    f = case / rel
    t = f.read_text()
    if old not in t:
        raise SystemExit("check_kinetic_mesh: fixture edit target missing in %s: %r" % (rel, old[:60]))
    f.write_text(t.replace(old, new, 1))


# ---------------------------------------------------------------- fixtures
LIMIT_LAW = '''kinetics
            {
                model        expression;
                catalystMass %s kg;
                source       "limit fixture: mass action on column19's own K_a (Izquierdo 1992, Eq. 15); no physical catalyst";
                basis        catalystMass;
                rateOf       extent;
                parameters
                {
                    kcat   1 mol/kg/s;
                    dH     -39100 J/mol;
                    dSK    -85.3  J/mol;
                    RK     8.314462 J/mol;
                    Kelvin 1 K;
                }
                definitions
                {
                    Ka   "exp(dSK / RK - dH / (RK * (T / Kelvin)))";
                }
                rate "%s";
            }'''
LIMIT_RATE = "kcat * (a[methanol] * a[isoButene] - a[methylTertButylEther] / Ka)"


def limit_case(tmp: Path, tag: str, mass: str, rate: str = LIMIT_RATE) -> Path:
    c = copy_case(C19, tmp, tag)
    f = c / "system" / "flowsheetDict"
    t = f.read_text()
    a = t.index("equilibrium\n            {")
    b = t.index("validity", a)
    b = t.index("}", b) + 1
    b = t.index("}", b) + 1
    f.write_text(t[:a] + (LIMIT_LAW % (mass, rate)) + t[b:])
    return c


def solved(case: Path, what: str):
    rc, out = run(case)
    js = result_json(out) if rc == 0 else None
    if not js or not js.get("converged"):
        fail("%s did not converge (exit %d)\n%s" % (what, rc, out[-900:]))
        return None, out
    return js, out


def prof(js):
    return js["profiles"]["mtbeColumn"]["columns"]


def profile_distance(p, q):
    dT = max(abs(a - b) for a, b in zip(p["T"], q["T"]))
    dx = 0.0
    for key in p:
        if key.startswith("x_") and key in q:
            dx = max(dx, max(abs(a - b) for a, b in zip(p[key], q[key])))
    return dT, dx


# ---------------------------------------------------------------- (f) Eq. 6
EQ6 = dict(A=[-1.49277e3, -7.74002e1, 5.07563e-1, -9.12739e-4, 1.10649e-6, -6.27996e-10], T0=298.15)
TABLE_IV_REHFINGER = [(40, 136), (50, 85), (60, 54), (70, 35), (80, 23), (90, 16), (100, 11)]


def ka_rehfinger(T, Ka298):
    A, T0 = EQ6["A"], EQ6["T0"]
    l = (A[0] * (1 / T - 1 / T0) + A[1] * math.log(T / T0) + A[2] * (T - T0)
         + A[3] * (T * T - T0 * T0) + A[4] * (T ** 3 - T0 ** 3) + A[5] * (T ** 4 - T0 ** 4))
    return Ka298 * math.exp(l)


def declared(text, name):
    m = re.search(r"^\s*" + name + r"\s+(\[[^\]]*\]\s*)?(-?[0-9][0-9.eE+-]*)", text, flags=re.M)
    if not m:
        raise SystemExit("check_kinetic_mesh: column20 no longer declares `%s`" % name)
    return float(m.group(2))


def main():
    tmp = Path(tempfile.mkdtemp(prefix="kinmesh."))
    try:
        # ---------------------------------------------------------------- (a)
        eq, _ = solved(copy_case(C19, tmp, "eq19"), "(a) column19")
        if eq is None:
            return report()
        conv_eq = eq["kpis"]["mtbeColumn"]["conversion"]
        peq = prof(eq)
        rows = []
        for mass in ("100", "1000", "10000", "1000000"):
            js, out = solved(limit_case(tmp, "lim" + mass, mass), "(a) limit fixture m = %s kg" % mass)
            if js is None:
                return report()
            if "catalyst mass was raised to its declared value" not in out:
                fail("(a) m = %s: the catalyst-mass continuation was not announced" % mass)
            cv = js["kpis"]["mtbeColumn"]["conversion"]
            dT, dx = profile_distance(prof(js), peq)
            rows.append((float(mass), cv, dT, dx))
        for (m0, c0, T0_, x0), (m1, c1, T1_, x1) in zip(rows, rows[1:]):
            if not c1 > c0:
                fail("(a) conversion is not increasing with the catalyst mass (%g kg: %.5f, %g kg: %.5f)" % (m0, c0, m1, c1))
            if not x1 < x0:
                fail("(a) the composition distance to column19 is not falling (%g kg: %.3e, %g kg: %.3e)" % (m0, x0, m1, x1))
        last = rows[-1]
        if not (abs(last[1] - conv_eq) < 1.0e-3 and last[2] < 0.5 and last[3] < 1.0e-2):
            fail("(a) at %g kg the kinetic column is not column19's equilibrium: conversion %.5f vs %.5f, max dT %.3e K"
                 % (last[0], last[1], conv_eq, last[2]))
        print("  (a) THE LIMIT, mass-action law on column19's own K_a (column19 equilibrium conversion %.4f):" % conv_eq)
        for m, cv, dT, dx in rows:
            print("      m_cat = %9.0f kg   conversion %.4f   max|dT| %.2e K   max|dx| %.2e" % (m, cv, dT, dx))

        # ---------------------------------------------------------------- (b)
        z, _ = solved(limit_case(tmp, "zero", "0"), "(b) zero catalyst")
        if z is not None:
            kz = z["kpis"]["mtbeColumn"]
            pz = prof(z)
            stz = z["streams"]
            Fz = stz["methanolFeed"]["F"] + stz["c4Feed"]["F"]
            worst_c = 0.0
            for name in z["components"]:
                nin = sum(stz[s_]["F"] * stz[s_]["composition"].get(name, 0.0) for s_ in ("methanolFeed", "c4Feed"))
                nout = sum(stz[s_]["F"] * stz[s_]["composition"].get(name, 0.0) for s_ in ("distillate", "bottoms"))
                worst_c = max(worst_c, abs(nout - nin) / Fz)
            xm = max(pz["x_methylTertButylEther"])
            if kz["reactionExtent"] != 0.0 or worst_c > 1.0e-9 or xm > 1.0e-12:
                fail("(b) zero catalyst is not a non-reactive column: extent %.3e, worst component (out-in)/F %.2e, "
                     "max x_MTBE %.2e" % (kz["reactionExtent"], worst_c, xm))
            print("  (b) zero catalyst: extent exactly %.1f, every component out = in (worst %.1e of the feed), "
                  "no MTBE on any stage (max x %.1e), D = %.4f kmol/h = F - B"
                  % (kz["reactionExtent"], worst_c, xm, kz["D"] * 3600.0))
            if abs(stz["distillate"]["F"] + stz["bottoms"]["F"] - Fz) / Fz > 1e-9:
                fail("(b) zero catalyst: B + D != F")

        # ---------------------------------------------------------------- (c)
        w = copy_case(C20, tmp, "witness")
        rc, wout = run(w)
        wj = result_json(wout) if rc == 0 else None
        if not wj or not wj.get("converged"):
            fail("(c) the witness column20 did not converge (exit %d)\n%s" % (rc, wout[-900:]))
            return report()
        txt = strip_comments((C20 / "system" / "flowsheetDict").read_text())
        k90, E, T90 = declared(txt, "k90"), declared(txt, "E"), declared(txt, "T90")
        cap, Ka298, T0 = declared(txt, "capacity"), declared(txt, "Ka298"), declared(txt, "T0")
        mcat = declared(txt, "catalystMass")
        if abs(Ka298 - 300.5) > 0 or abs(declared(txt, "A1") + 1492.77) > 0:
            fail("(c) the witness no longer carries the paper's Table 4 / Eq. 6 constants")
        pw = prof(wj)
        worst = worst_ext = 0.0
        amin, xmin = 1e9, 1e9
        for j in RX_STAGES:
            T = pw["T"][j]
            a = {n: pw["a_" + n][j] for n in NU}
            for n in NU:       # activity = gamma x, from the published pieces
                if abs(pw["gamma_" + n][j] * pw["x_" + n][j] - a[n]) > 1e-8 * abs(a[n]):
                    fail("(c) published a_%s differs from gamma x on stage %d" % (n, j + 1))
            k = k90 * math.exp(-E / R_GAS * (1 / T - 1 / T90))
            Ka = ka_rehfinger(T, Ka298)
            r = 1e-3 * k * cap * (a["isoButene"] / a["methanol"]
                                   - a["methylTertButylEther"] / (Ka * a["methanol"] ** 2))   # kmol/(kg s)
            worst = max(worst, abs(r - pw["r_mol_gcat_s"][j]) / abs(r))
            xi_h = r * mcat / 5.0 * 3600.0
            worst_ext = max(worst_ext, abs(xi_h - pw["extent_kmol_h"][j]) / abs(xi_h))
            amin = min(amin, a["methanol"])
            xmin = min(xmin, pw["x_methanol"][j])
        if worst > 1.0e-9 or worst_ext > 1.0e-9:
            fail("(c) the law recomputed in Python differs from the engine's: r %.2e, extent %.2e (relative)" % (worst, worst_ext))
        wk = wj["kpis"]["mtbeColumn"]
        print("  (c) r recomputed from published T, x, gamma on stages 6-10: relative difference %.1e (extent %.1e)"
              % (worst, worst_ext))
        print("      witness: %.0f kg illustrative catalyst -> methanol conversion %.2f %%, extent %.3f kmol/h"
              % (mcat, wk["conversion"] * 100.0, wk["reactionExtent"] * 3600.0))
        print("      a_MeOH on the reactive stages: min %.4f;  x_MeOH min %.4f (the paper: model under-predicts below 0.3)"
              % (amin, xmin))
        if not (amin > 0 and xmin > 0):
            fail("(c) a reactive stage carries no methanol")
        if "[window] `xMeOH`" not in wout:
            fail("(c) the x_MeOH < 0.3 excursion was not announced although the profile is below it")

        # ---------------------------------------------------------------- (d)
        def csvrows(f):
            return list(csv.reader((w / "reports" / "balances" / f).open()))
        mb = csvrows("massBalance.csv")
        tot = [r for r in mb if r and r[0] == "TOTAL"][0]
        net, inn = float(tot[3]), float(tot[1])
        if abs(net) / inn > 1.0e-5:
            fail("(d) mass: net %.4f kg/h of %.1f" % (net, inn))
        eb = csvrows("elementBalance.csv")[1:]
        wor = max(abs(float(r[4]) - 100.0) for r in eb if len(r) >= 5 and r[4])
        if wor > 1.0e-6:
            fail("(d) an element closes at %.8f %%" % (100 + wor))
        ge = {r[0]: r[1] for r in csvrows("globalEnergyBoundary.csv")[1:] if len(r) >= 2}
        if abs(float(ge["residual"])) > 1.0e-3:
            fail("(d) plant-boundary first law residual %s kW" % ge["residual"])
        cl = [c for c in wj.get("closuresByConstruction", []) if c.get("unit") == "mtbeColumn"]
        if not cl or cl[0].get("status") != "verified":
            fail("(d) the reboiler closure is not VERIFIED: %s" % cl)
        gap = wk["Q_reboiler_kW"] - wk["Q_reboiler_ownEnvelope_kW"]
        if abs(gap) > 1.0e-4:
            fail("(d) reboiler duty vs its own envelope: gap %.3e kW" % gap)
        st = wj["streams"]
        F = st["methanolFeed"]["F"] + st["c4Feed"]["F"]
        D, B = st["distillate"]["F"], st["bottoms"]["F"]
        ext = wk["reactionExtent"]
        if abs((B + D) - (F + sum(NU.values()) * ext)) / F > 1.0e-9:
            fail("(d) B + D != F + Sum(nu) Sum(xi)")
        for name in wj["components"]:
            nin = sum(st[s]["F"] * st[s]["composition"].get(name, 0.0) for s in ("methanolFeed", "c4Feed"))
            nout = sum(st[s]["F"] * st[s]["composition"].get(name, 0.0) for s in ("distillate", "bottoms"))
            if abs((nout - nin) - NU.get(name, 0.0) * ext) / F > 1.0e-9:
                fail("(d) component %s: out - in != nu_i Sum(xi)" % name)
        print("  (d) witness: mass net %.4f kg/h, elements off by %.1e %%, boundary first law %s kW, reboiler plug - own "
              "envelope %.1e kW (verified), B + D = F + Sum(nu) Sum(xi) overall and per component"
              % (net, wor, ge["residual"], gap))

        # ---------------------------------------------------------------- (e)
        def expect_refusal(tag, case, must, rc_nonzero=True):
            rc_, o = run(case)
            if rc_ == 0 and rc_nonzero:
                fail("(e) %s: the case RAN (exit 0); it must refuse" % tag)
                return
            for s in must:
                if s not in o:
                    fail("(e) %s: the output does not say %r\n%s" % (tag, s, o[-600:]))
                    return
            print("  (e) %-24s refused by name (exit %d): says %s" % (tag, rc_, ", ".join(repr(s) for s in must)))

        # a[i] in a reactor that does not supply it
        u = copy_case(USEROP03, tmp, "cstrActivity")
        fd = u / "system" / "flowsheetDict"
        t = fd.read_text()
        a0 = t.index("    {\n        name        reactorCode;")
        a1 = t.index("    {\n        name        reactorExpr;")
        fd.write_text(t[:a0] + t[a1:])                          # only the formula cstr
        rx = u / "constant" / "reactions"
        t = rx.read_text()
        b0 = t.index("mm_code\n{")
        b1 = t.index("mm_expr\n{")
        rx.write_text(t[:b0] + t[b1:])
        for nme in ("feedCode", "productCode"):
            (u / "0" / nme).unlink()
        shutil.rmtree(u / "code", ignore_errors=True)
        edit(u, "constant/reactions", "Vmax * c[isomerA] / (Km + c[isomerA])", "Vmax * a[isomerA] / (1 + a[isomerA])")
        expect_refusal("cstr reads a[i]", u, ["reads activities", "No activity is assumed"])
        # unknown component inside a[..]
        expect_refusal("a[nothing]", limit_case(tmp, "ghostComp", "10",
                       "kcat * a[unobtainium]"), ["a[unobtainium]", "not in this system"])
        expect_refusal("unknown symbol", limit_case(tmp, "ghostSym", "10",
                       "kcat * foo"), ["foo"])
        # a law per reactor volume
        v = limit_case(tmp, "perVolume", "10", "kvol * a[methanol]")
        edit(v, "system/flowsheetDict", "kcat   1 mol/kg/s;", "kcat   1 mol/kg/s;\n                    kvol   1 mol/m3/s;")
        edit(v, "system/flowsheetDict", "basis        catalystMass;", "basis        reactorVolume;")
        expect_refusal("basis reactorVolume", v, ["catalystMass"])
        # unknown model word
        q = limit_case(tmp, "badWord", "10")
        edit(q, "system/flowsheetDict", "model        expression;", "model        expresion;")
        expect_refusal("misspelt model word", q, ["expresion", "expression"])
        # the native word without its legs
        n_ = copy_case(C19, tmp, "nativeNoLegs")
        edit(n_, "system/flowsheetDict", "reactiveStages ( 6 7 8 9 10 );",
             "reactiveStages ( 6 7 8 9 10 );\n            kinetics { catalystMass 10 kg; }")
        expect_refusal("native word, no legs", n_, ["forward"])
        # Sum nu != 0 under the CMO model
        s_ = limit_case(tmp, "simulKin", "10")
        edit(s_, "system/flowsheetDict", "model       fullMESH;", "model       simultaneous;")
        edit(s_, "system/flowsheetDict", "bottomsRate    240 kmol/h;", "refluxRatio    2;")
        edit(s_, "system/flowsheetDict", "boilupRatio    5;", "distillateRate 300 kmol/h;")
        expect_refusal("Sum nu != 0, CMO", s_, ["Sum nu != 0", "fullMESH"])
        # a law with no value: ANNOUNCED infeasible trial, never a number
        nv = limit_case(tmp, "noValue", "100", "kcat * a[methanol] / (a[methanol] - a[methanol])")
        rc_, o = run(nv)
        js_ = result_json(o) if rc_ == 0 else None
        if rc_ == 0 and js_ and js_.get("converged"):
            fail("(e) a law with no value (0/0) produced a converged column")
        elif "the kinetic law has no value at this MESH trial" not in o:
            fail("(e) the infeasible trial of a value-less law was not announced\n%s" % o[-600:])
        else:
            print("  (e) %-24s ANNOUNCED as an infeasible trial; the column is not converged (exit %d)" % ("law with no value", rc_))

        # ---------------------------------------------------------------- (f)
        worst6 = 0.0
        for tC, tab in TABLE_IV_REHFINGER:
            val = ka_rehfinger(tC + 273.15, 284.0)
            if round(val) != tab:
                fail("(f) Eq. 6 (K_a298 = 284) at %d C gives %.2f; Izquierdo's Table IV prints %d" % (tC, val, tab))
            worst6 = max(worst6, abs(val - tab))
        print("  (f) Eq. 6 with K_a(298.15) = 284 reproduces Izquierdo's Table IV (Rehfinger column, 40-100 C) to its rounding "
              "(worst |difference| %.2f)" % worst6)
        r300 = ka_rehfinger(363.15, 300.5) / ka_rehfinger(363.15, 284.0) - 1.0
        print("      the witness uses the Table 4 value 300.5 (the one k and E were fitted with): %.1f %% above 284" % (r300 * 100))

        # ---------------------------------------------------------------- (g)
        src = strip_comments(COLUMN.read_text())
        if "is not implemented: the full MESH carries equilibrium extents" in src or "KINETIC `reaction { kinetics {} }`" in src:
            fail("(g) the C231 refusal of kinetics under the full MESH is still in the source")
        i = src.find("auto residualF")
        seg = src[i:i + 12000]
        for needle in ("rateOnTrial(xs[jr], Ts[jr])", "mCatScale", "m -= nu[i] * xij", "sumNuAll*xij"):
            if needle not in seg:
                fail("(g) the full-MESH rows no longer contain %r" % needle)
        if "mCatScale = sTry" not in src:
            fail("(g) the catalyst-mass continuation is gone")
        if re.search(r"dH_rxn|reactionHeat|heatOfReaction", seg):
            fail("(g) a reaction-heat term appears in the full-MESH rows")
        print("  (g) source: rate evaluated per reactive stage in the full-MESH rows, continuation present, "
              "no reaction-heat term, the C231 refusal gone")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return report()


def report():
    if FAILS:
        print("check_kinetic_mesh: FAILED (%d)" % len(FAILS))
        return 1
    print("check_kinetic_mesh: OK -- the full MESH carries a rate LAW written in the case: a mass-action law on column19's "
          "own K_a converges on column19's equilibrium as the catalyst mass grows (conversion rising and the profile "
          "distance falling monotonically over 100 to 1e6 kg), zero catalyst gives the non-reactive column, the "
          "Rehfinger & Hoffmann witness's rate is recomputed in Python from the published T, x and gamma of every reactive "
          "stage (and its a_MeOH printed against the paper's range), closure holds without a plug, Eq. 6 reproduces "
          "Izquierdo's Table IV, and a[i] in a cstr, an unknown component, a per-volume law, a misspelt word, the native "
          "word without legs, Sum nu != 0 under the CMO and a value-less law are each refused or announced by name.  "
          "SCANNED: column19, column20, userOp03 and nine fixtures written here, DistillationColumn.cpp.  NOT CHECKED: "
          "agreement with any measured column (nothing here is validated against a measurement); UNIFAC against the "
          "UNIQUAC the law was fitted on; the effectiveness factor.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
