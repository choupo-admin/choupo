#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the REACTIVE FULL MESH -- a reaction that CHANGES THE NUMBER OF MOLES in a rigorous column.

    bin/curate/check_reactive_mesh.py

WHY THIS EXISTS (DEV.md 4c C231).  `DistillationColumn` refused any reaction
with Sum nu != 0 ("needs the full-MESH energy balance") and refused `model
fullMESH` over any reaction at all (C169).  The full MESH now carries the
reaction: one equilibrium extent per reactive stage as an unknown, component
rows `-nu_i xi_j`, TOTAL rows `-Sum(nu) xi_j`, NO heat-of-reaction term (the
stage energy rows price on the elements datum, which already holds it), the
equilibrium row `sum nu_i ln(gamma_i x_i) - ln K_a(T_j)`, and a specification
pair (bottomsRate, boilupRatio) that makes the distillate an unknown closed by
the top balance.  A column of this kind can be wrong in ways no golden sees --
a sign on the mole change, a reaction heat counted twice, a stoichiometry
ignored all converge to a plausible profile -- so this gate recomputes what the
engine claims from numbers the engine PUBLISHES, with the equations written
independently here.

WHAT IT CHECKS, on `column19_mtbe_reactive_mesh` (methanol + isobutene <=>
MTBE, 15 stages, partial condenser, reactive stages 6-10):

  (a) THE WITNESS CONVERGES, and on every reactive stage
      |sum nu_i ln(gamma_i x_i) - ln K_a(T_j)| is small, with x, T and gamma
      READ from the published profile and ln K_a(T) = dS/R - dH/(R T)
      (Izquierdo et al. 1992, Eq. 15) evaluated HERE from the constants the
      case declares.
  (b) CLOSURE WITHOUT A PLUG.  Mass (to the MW rounding of the MTBE record,
      7e-7), every element (atoms close although moles do not), the plant
      boundary first law (priced on the streams, independent of the unit), and
      the reboiler's OWN envelope against the duty the unit reports -- the
      full MESH's closure is VERIFIED, not "by construction".
  (c) THE PUBLISHED CONSTANT IS THE PAPER'S: Eq. 15 reproduces the 21 runs of
      the paper's Table II (transcribed in the case) with AAD 4.6 % and
      max 8.5 %.  Eq. 14 and Eq. 16 of the paper, printed with a rounded
      constant, are NOT used and the case says so.
  (d) THE MOLE BALANCE WITH A MOLE CHANGE: B + D = F + Sum(nu) Sum(xi), and
      component by component (out - in) = nu_i Sum(xi).
  (e) `fromRecords`: ln K_a(T) = -Sum nu_i [g_ig,i(T)/(R T) + ln(Psat_i(T)/P0)]
      recomputed in Python from the component records (Cp integrated
      numerically) and compared with what the column published; its
      difference from Eq. 15 at the reactive-stage temperatures is PRINTED, not
      asserted -- it carries the Joback isobutene datum, announced.
  (f) REFUSALS BY NAME on constructed cases: Sum nu != 0 under `model
      simultaneous` (names fullMESH), an invalid pair of specifications, a
      total condenser with bottomsRate/boilupRatio, and a reacting species with no
      formation datum.  (The kinetic form under the full MESH was refused here
      until C233 built it; `check_kinetic_mesh` owns it now.)
  (g) SOURCE: the C169 refusal sentence is gone, the extents and the mole
      change are in the full-MESH rows, and the energy rows carry no
      reaction-heat term.

NOT CHECKED, said plainly: that the column agrees with any measured MTBE
column (nothing here was validated against a measurement); that UNIFAC
predicts these activities; the sealed-case bytes.

SABOTAGES performed by hand (the engine rebuilt each time, then restored):
  S1  flip the sign of Sum(nu) in the TOTAL rows
  S2  add the reaction heat to the stage energy rows (counted twice)
  S3  ignore nu in the COMPONENT rows (the extent changes nothing)
The record of what each one made this gate say is in the commit message.
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
CASE = ROOT / "tutorials" / "steady" / "distillation" / "column19_mtbe_reactive_mesh"
COLUMN = ROOT / "src" / "unitOperations" / "distillation" / "DistillationColumn.cpp"
R_GAS = 8.314462
FAILS = []


def fail(msg):
    FAILS.append(msg)
    print("  FAIL " + msg)


def strip_comments(text):
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(ROOT / "choupoSolve"), "."], cwd=str(case),
                       env=env, capture_output=True, text=True, timeout=900)
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


def copy_case(dst_root: Path, tag: str) -> Path:
    dst = dst_root / tag
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns("reports", "converged", "iterations"))
    return dst


def edit(case: Path, rel: str, old: str, new: str):
    f = case / rel
    t = f.read_text()
    if old not in t:
        raise SystemExit("check_reactive_mesh: fixture edit target missing in %s: %r" % (rel, old[:60]))
    f.write_text(t.replace(old, new, 1))


# --------------------------------------------------------------------------
#  The declared constants of the case, read as text (an independent parse)
# --------------------------------------------------------------------------
def declared_constants():
    t = strip_comments((CASE / "system" / "flowsheetDict").read_text())
    def num(name):
        m = re.search(r"^\s*" + name + r"\s+(-?[0-9][0-9.eE+-]*)\s+J/mol", t, flags=re.M)
        if not m:
            raise SystemExit("check_reactive_mesh: the case no longer declares `%s`" % name)
        return float(m.group(1))
    return num("dH"), num("dSK"), num("RK")


def lnKa_eq15(T, dH, dS, R):
    return dS / R - dH / (R * T)


# --------------------------------------------------------------------------
#  Component records (independent reader), g_ig(T) and Psat(T)
# --------------------------------------------------------------------------
def record(name, case_dir=None):
    txt = None
    if case_dir is not None and (case_dir / "constant" / "components" / (name + ".dat")).exists():
        over = strip_comments((case_dir / "constant" / "components" / (name + ".dat")).read_text())
    else:
        over = ""
    base = strip_comments((ROOT / "data" / "standards" / "components" / (name + ".dat")).read_text())
    return over, base


def pick(name, key, case_dir):
    over, base = record(name, case_dir)
    m = re.search(r"\b" + key + r"\s+(-?[0-9.eE+-]+)\s*;", over)
    if m:
        return float(m.group(1))
    m = re.search(r"\b" + key + r"\s+(-?[0-9.eE+-]+)\s*;", base)
    return float(m.group(1))


def cp_coeffs(name):
    _, base = record(name)
    blk = re.search(r"idealGasHeatCapacity\s*\{(.*?)\}", base, flags=re.S).group(1)
    model = re.search(r"model\s+(\w+)\s*;", blk).group(1)
    co = [float(v) for v in re.search(r"coefficients\s*\(([^)]*)\)", blk).group(1).split()]
    return model, co


def cp_ig(name, T):
    model, co = cp_coeffs(name)
    if model == "polynomial":
        return sum(c * T ** k for k, c in enumerate(co))
    if model == "chemsepCp16":
        A, B, C, D, E = co
        return A + math.exp(B / T + C + D * T + E * T * T)
    raise SystemExit("check_reactive_mesh: Cp model %s not implemented in the gate" % model)


def g_ig(name, T, case_dir):
    Hf = pick(name, "dHf_298", case_dir)
    S0 = pick(name, "s_298", case_dir)
    n = 400
    h = (T - 298.15) / n
    I1 = I2 = 0.0
    for i in range(n + 1):
        t = 298.15 + i * h
        w = 1 if i in (0, n) else (4 if i % 2 else 2)
        I1 += w * cp_ig(name, t)
        I2 += w * cp_ig(name, t) / t
    I1 *= h / 3.0
    I2 *= h / 3.0
    return (Hf + I1) - T * (S0 + I2)


def psat_pa(name, T):
    _, base = record(name)
    blk = re.search(r"vaporPressure\s*\{(.*?)\}", base, flags=re.S).group(1)
    A, B, C = [float(v) for v in re.search(r"coefficients\s*\(([^)]*)\)", blk).group(1).split()]
    return 10 ** (A - B / (T + C)) * 1.0e5


def ref_fugacity_pa(name, T, P, case_dir):
    """The pure-liquid reference fugacity of a species on a REAL (SRK) vapour,
    recomputed here from the record's own Tc, Pc, omega and Vliq (C235):
        f_ref = phi_sat(T) Psat(T) exp(Vliq (P - Psat)/(R T)),
    phi_sat the pure SRK vapour fugacity coefficient at (T, Psat); above Tc
    there is no saturation and the reference is Psat itself."""
    ps = psat_pa(name, T)
    Tc = pick(name, "Tc", case_dir)
    if not T < Tc:
        return ps
    Pc = pick(name, "Pc", case_dir) * 1.0e5
    w = pick(name, "omega", case_dir)
    m = 0.48508 + 1.55171 * w - 0.15613 * w * w      # the engine's SRK alpha (Graboski-Daubert)
    al = (1.0 + m * (1.0 - math.sqrt(T / Tc))) ** 2
    a = 0.42747 * R_GAS ** 2 * Tc ** 2 / Pc * al
    b = 0.08664 * R_GAS * Tc / Pc
    A = a * ps / (R_GAS * T) ** 2
    B = b * ps / (R_GAS * T)
    Z = 1.0
    for _ in range(200):
        f = Z ** 3 - Z ** 2 + (A - B - B * B) * Z - A * B
        Z -= f / (3 * Z * Z - 2 * Z + (A - B - B * B))
    phisat = math.exp(Z - 1.0 - math.log(Z - B) - A / B * math.log(1.0 + B / Z))
    vl = pick(name, "Vliq", case_dir)
    return phisat * ps * math.exp(vl * (P - ps) / (R_GAS * T))


def lnKa_records(T, nu, case_dir, P):
    acc = 0.0
    for name, v in nu.items():
        acc += v * (g_ig(name, T, case_dir) / (R_GAS * T)
                    + math.log(ref_fugacity_pa(name, T, P, case_dir) / 1.0e5))
    return -acc


NU = {"methanol": -1.0, "isoButene": -1.0, "methylTertButylEther": 1.0}
RX_STAGES = [5, 6, 7, 8, 9]            # 0-based, reactive stages 6..10


def main():
    tmp = Path(tempfile.mkdtemp(prefix="reactmesh."))
    try:
        # ---------------------------------------------------------------- (a)
        case = copy_case(tmp, "witness")
        rc, out = run(case)
        if rc != 0:
            fail("(a) the witness did not run (exit %d)\n%s" % (rc, out[-1500:]))
            return report()
        js = result_json(out)
        if not js or not js.get("converged"):
            fail("(a) the witness did not converge")
            return report()
        dH, dSK, RK = declared_constants()
        dS = dSK / 1.0          # J/mol/K: the case states dS x 1 K as J/mol
        Rg = RK / 1.0
        prof = js["profiles"]["mtbeColumn"]["columns"]
        T = prof["T"]
        worst = 0.0
        for j in RX_STAGES:
            lnQ = 0.0
            for name, v in NU.items():
                x = prof["x_" + name][j]
                g = prof["gamma_" + name][j]
                lnQ += v * math.log(g * x)
            worst = max(worst, abs(lnQ - lnKa_eq15(T[j], dH, dS, Rg)))
        if not worst < 1.0e-8:
            fail("(a) |ln Q - ln K_a(T)| on a reactive stage reaches %.3e (> 1e-8)" % worst)
        ext = js["kpis"]["mtbeColumn"]["reactionExtent"]
        conv = js["kpis"]["mtbeColumn"]["conversion"]
        print("  (a) converged; worst |ln Q - ln K_a| over stages 6-10 = %.2e; extent %.4f kmol/h, "
              "methanol conversion %.2f %%" % (worst, ext * 3600.0, conv * 100.0))

        # ---------------------------------------------------------------- (b)
        k = js["kpis"]["mtbeColumn"]
        def csvrows(f):
            return list(csv.reader((case / "reports" / "balances" / f).open()))
        mb = csvrows("massBalance.csv")
        tot = [r for r in mb if r and r[0] == "TOTAL"][0]
        net, inn = float(tot[3]), float(tot[1])
        if abs(net) / inn > 1.0e-5:
            fail("(b) mass: net %.4f kg/h of %.1f (> 1e-5; the MTBE record's MW rounding is 7e-7)" % (net, inn))
        eb = csvrows("elementBalance.csv")[1:]
        wor = max(abs(float(r[4]) - 100.0) for r in eb if len(r) >= 5 and r[4])
        if wor > 1.0e-6:
            fail("(b) an element closes at %.8f %% (atoms must close although moles do not)" % (100 + wor))
        ge = {r[0]: r[1] for r in csvrows("globalEnergyBoundary.csv")[1:] if len(r) >= 2}
        if abs(float(ge["residual"])) > 1.0e-3:
            fail("(b) plant-boundary first law residual %s kW" % ge["residual"])
        cl = [c for c in js.get("closuresByConstruction", []) if c.get("unit") == "mtbeColumn"]
        if not cl or cl[0].get("status") != "verified":
            fail("(b) the reboiler closure is not VERIFIED by the unit's second route: %s" % cl)
        gap = k["Q_reboiler_kW"] - k["Q_reboiler_ownEnvelope_kW"]
        if abs(gap) > 1.0e-4:
            fail("(b) reboiler duty %.6f kW vs its own envelope %.6f kW (gap %.3e)"
                 % (k["Q_reboiler_kW"], k["Q_reboiler_ownEnvelope_kW"], gap))
        print("  (b) mass net %.4f kg/h; element closure off by %.1e %%; boundary first-law residual %s kW; "
              "reboiler plug - own envelope = %.2e kW (verified); Q_cond %.3f MW, Q_reb %.3f MW"
              % (net, wor, ge["residual"], gap, k["Q_condenser_kW"] / 1e3, k["Q_reboiler_kW"] / 1e3))

        # ---------------------------------------------------------------- (c)
        tbl = []
        for line in (CASE / "constant" / "experimental" / "izquierdo1992_tableII.csv").read_text().splitlines():
            if line.startswith("#") or line.startswith("run"):
                continue
            r = line.split(",")
            tbl.append((float(r[1]), float(r[2])))
        err = [abs(math.exp(lnKa_eq15(t, -39100.0, -85.3, R_GAS)) / K - 1.0) * 100.0 for t, K in tbl]
        aad, mx = sum(err) / len(err), max(err)
        if len(tbl) != 21 or abs(aad - 4.6) > 0.1 or abs(mx - 8.5) > 0.1:
            fail("(c) Eq. 15 vs Table II: n=%d AAD %.2f %% max %.2f %% (expected 21, 4.6, 8.5)" % (len(tbl), aad, mx))
        if (dH, dSK, RK) != (-39100.0, -85.3, 8.314462):
            fail("(c) the case's constants (%s, %s, %s) are not Eq. 15's" % (dH, dSK, RK))
        print("  (c) Izquierdo Eq. 15 vs Table II (21 runs): AAD %.2f %%, max %.2f %%" % (aad, mx))

        # ---------------------------------------------------------------- (d)
        st = js["streams"]
        F = st["methanolFeed"]["F"] + st["c4Feed"]["F"]
        D, B = st["distillate"]["F"], st["bottoms"]["F"]
        sumNu = sum(NU.values())
        lhs, rhs = B + D, F + sumNu * ext
        if abs(lhs - rhs) / F > 1.0e-9:
            fail("(d) B + D = %.12e but F + sumNu Sum(xi) = %.12e" % (lhs, rhs))
        for name in js["components"]:
            nin = sum(st[s]["F"] * st[s]["composition"].get(name, 0.0) for s in ("methanolFeed", "c4Feed"))
            nout = sum(st[s]["F"] * st[s]["composition"].get(name, 0.0) for s in ("distillate", "bottoms"))
            if abs((nout - nin) - NU.get(name, 0.0) * ext) / F > 1.0e-9:
                fail("(d) component %s: out - in = %.6e but nu*xi = %.6e" % (name, nout - nin, NU.get(name, 0.0) * ext))
        print("  (d) B + D = F + sumNu Sum(xi) (%.8f vs %.8f kmol/h), and every component (out - in) = nu_i Sum(xi)"
              % (lhs * 3600.0, rhs * 3600.0))

        # ---------------------------------------------------------------- (e)
        fr = copy_case(tmp, "fromRecords")
        (fr / "constant" / "components" / "isoButene.dat").unlink()      # the STANDARD (Joback) isobutene
        (fr / "constant" / "propertyManifest").unlink()                   # unsealed: the catalogue answers
        t = (fr / "system" / "flowsheetDict").read_text()
        a = t.index("equilibrium\n            {")
        b = t.index("validity")
        b = t.index("}", b) + 1
        t = t[:a] + "equilibrium { fromRecords true; }" + t[b:].replace("            }\n", "", 1)
        (fr / "system" / "flowsheetDict").write_text(t)
        rc, out2 = run(fr)
        js2 = result_json(out2) if rc == 0 else None
        if rc != 0 or not js2 or not js2.get("converged"):
            fail("(e) the fromRecords variant did not converge (exit %d)\n%s" % (rc, out2[-800:]))
        else:
            if "ESTIMATED dHf_298 of 'isoButene'" not in out2:
                fail("(e) the Joback isobutene datum was not ANNOUNCED as an estimate")
            p2 = js2["profiles"]["mtbeColumn"]["columns"]
            worst2 = 0.0
            diffs = []
            for j in RX_STAGES:
                mine = lnKa_records(p2["T"][j], NU, fr, 7.0e5)
                worst2 = max(worst2, abs(mine - p2["lnKa"][j]))
                diffs.append((p2["T"][j], mine, lnKa_eq15(p2["T"][j], -39100.0, -85.3, R_GAS)))
            if worst2 > 1.0e-6:
                fail("(e) fromRecords ln K_a differs from the independent recomputation by %.3e" % worst2)
            print("  (e) fromRecords ln K_a(T) recomputed independently: worst difference %.2e" % worst2)
            for tt, mine, e15 in diffs:
                print("      T = %.2f K  ln Ka(records, Joback isobutene) = %.4f   ln Ka(Eq. 15) = %.4f   "
                      "difference %+.3f (K ratio %.3f)" % (tt, mine, e15, mine - e15, math.exp(mine - e15)))
            print("      column under fromRecords: methanol conversion %.2f %% (Eq. 15: %.2f %%)"
                  % (js2["kpis"]["mtbeColumn"]["conversion"] * 100.0, conv * 100.0))

        # ---------------------------------------------------------------- (f)
        def expect_refusal(tag, mutate, must):
            c = copy_case(tmp, tag)
            mutate(c)
            rc, o = run(c)
            low = o
            if rc == 0:
                fail("(f) %s: the case RAN (exit 0); it must refuse" % tag)
                return
            for w in must:
                if w not in low:
                    fail("(f) %s: the refusal does not say %r\n%s" % (tag, w, o[-600:]))
                    return
            print("  (f) %-26s refused by name (exit %d): says %s" % (tag, rc, ", ".join(repr(w) for w in must)))

        expect_refusal("simultaneousSumNu",
                       lambda c: (edit(c, "system/flowsheetDict", "model       fullMESH;", "model       simultaneous;"),
                                  edit(c, "system/flowsheetDict", "bottomsRate    240 kmol/h;", "refluxRatio    2;"),
                                  edit(c, "system/flowsheetDict", "boilupRatio    5;", "distillateRate 300 kmol/h;")),
                       ["Sum nu != 0", "fullMESH"])
        expect_refusal("simultaneousBoilup",
                       lambda c: edit(c, "system/flowsheetDict", "model       fullMESH;", "model       simultaneous;"),
                       ["bottomsRate", "fullMESH"])
        expect_refusal("specsMixed",
                       lambda c: edit(c, "system/flowsheetDict", "boilupRatio    5;", "boilupRatio    5;\n            refluxRatio 2;"),
                       ["two specifications", "refluxRatio"])
        expect_refusal("specsHalf",
                       lambda c: edit(c, "system/flowsheetDict", "boilupRatio    5;", ""),
                       ["two specifications", "boilupRatio"])
        expect_refusal("totalCondenser",
                       lambda c: edit(c, "system/flowsheetDict", "condenser      { type partial; }", ""),
                       ["PARTIAL condenser"])

        def ghost(c):
            (c / "constant" / "components" / "ghostEther.dat").write_text(
                (ROOT / "data" / "standards" / "components" / "methylTertButylEther.dat").read_text()
                .replace("name        methylTertButylEther;", "name        ghostEther;")
                .replace("CAS         1634-04-4;", "")
                [:].split("standardThermochemistry")[0]
                + "\nvaporPressure { model Antoine; coefficients (3.871333382 1034.446026 -60.58); Trange (299.35 444.59); }\n"
                  "idealGasHeatCapacity { model polynomial; coefficients (12.5882 0.293076 -0.000120145 1.02185e-08); Trange (200 1000); }\n"
                  "Vliq 0.00012013;\nHvapTb 28317.7;\n")
            for f in ("system/flowsheetDict", "0/distillate", "0/bottoms"):
                p = c / f
                p.write_text(p.read_text().replace("methylTertButylEther", "ghostEther"))
            tp = c / "constant" / "thermoPhysPropDict"
            tp.write_text(tp.read_text().replace("methylTertButylEther", "ghostEther")
                          .replace("activityModel { model UNIFAC; }", "activityModel ideal;"))
            (c / "constant" / "components" / "isoButene.dat").unlink()
            (c / "constant" / "propertyManifest").unlink()
        expect_refusal("missingDatum", ghost, ["ghostEther", "formation datum"])

        # ---------------------------------------------------------------- (h)
        #  The other specification pair reproduces the first, and a mole-
        #  conserving esterification run under the full MESH lands within a
        #  point of conversion of the CMO column (the enthalpies weigh a little).
        rd = copy_case(tmp, "refluxForm")
        edit(rd, "system/flowsheetDict", "bottomsRate    240 kmol/h;", "refluxRatio    %.10f;" % k["R"])
        edit(rd, "system/flowsheetDict", "boilupRatio    5;", "distillateRate %.6f kmol/h;" % (k["D"] * 3600.0))
        rcr, outr = run(rd)
        jr = result_json(outr) if rcr == 0 else None
        if not jr or not jr.get("converged"):
            fail("(h) the (refluxRatio, distillateRate) form did not converge")
        else:
            kr = jr["kpis"]["mtbeColumn"]
            if abs(kr["conversion"] - conv) > 1.0e-6 or abs(kr["T_bottom"] - k["T_bottom"]) > 1.0e-4:
                fail("(h) the reflux form gives conversion %.8f / T_bottom %.5f against %.8f / %.5f"
                     % (kr["conversion"], kr["T_bottom"], conv, k["T_bottom"]))
            print("  (h) (refluxRatio, distillateRate) form reproduces the (bottomsRate, boilupRatio) column: "
                  "conversion %.6f vs %.6f, T_bottom %.4f vs %.4f K" % (kr["conversion"], conv, kr["T_bottom"], k["T_bottom"]))
        ES = ROOT / "tutorials" / "steady" / "distillation" / "column05_reactive_methylacetate"
        res = {}
        for tag, model in (("estSimul", "simultaneous"), ("estFull", "fullMESH")):
            d = tmp / tag
            shutil.copytree(ES, d, ignore=shutil.ignore_patterns("reports", "converged", "iterations"))
            edit(d, "system/flowsheetDict", "model       simultaneous;", "model       %s;" % model)
            rce, oute = run(d)
            je = result_json(oute) if rce == 0 else None
            if not je or not je.get("converged"):
                fail("(h) column05 did not converge under %s" % model)
                break
            res[model] = je["kpis"]["rdColumn"]["conversion"]
        if len(res) == 2:
            if abs(res["simultaneous"] - res["fullMESH"]) > 0.01:
                fail("(h) column05 conversion %.4f (CMO) vs %.4f (full MESH): more than one point apart"
                     % (res["simultaneous"], res["fullMESH"]))
            print("  (h) column05 (Sum nu = 0 esterification): conversion %.4f under simultaneous, %.4f under fullMESH"
                  % (res["simultaneous"], res["fullMESH"]))

        # ---------------------------------------------------------------- (g)
        src = strip_comments(COLUMN.read_text())
        if "the full MESH is not implemented with a reaction" in src or "carries no reaction" in src:
            fail("(g) the C169 refusal sentence is still in the source")
        for needle in ("m -= nu[i] * xij", "sumNuAll*xij", "iXi + k"):
            if needle not in src:
                fail("(g) the full MESH rows no longer contain %r" % needle)
        if re.search(r"dH_rxn|reactionHeat|heatOfReaction", src[src.find("auto residualF"):src.find("auto residualF") + 9000]):
            fail("(g) a reaction-heat term appears in the full-MESH rows (it is already in the elements datum)")
        print("  (g) source: extents and mole change in the full-MESH rows; no reaction-heat term; C169 sentence gone")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return report()


def report():
    if FAILS:
        print("check_reactive_mesh: FAILED (%d)" % len(FAILS))
        return 1
    print("check_reactive_mesh: OK -- the full MESH carries a mole-changing reaction: on column19_mtbe_reactive_mesh "
          "(methanol + isobutene <=> MTBE, Sum nu = -1) it converges with |ln Q - ln K_a(T)| below 1e-8 on every reactive "
          "stage (x, T and gamma READ from the published profile, K_a from the paper's Eq. 15 evaluated here), closes mass, "
          "every element, the plant-boundary first law and the reboiler's own envelope WITHOUT a plug, satisfies "
          "B + D = F + Sum(nu) Sum(xi) overall and per component, reproduces the 21 runs of the paper's Table II with "
          "AAD 4.6 % (max 8.5 %), recomputes the `fromRecords` K_a(T) independently and prints its distance from Eq. 15 "
          "unadjusted, and refuses by name Sum nu != 0 under simultaneous, an invalid pair of specifications, a total "
          "condenser with bottomsRate and a reacting species with no formation "
          "datum.  SCANNED: the witness and nine fixtures written by this gate, "
          "src/unitOperations/distillation/DistillationColumn.cpp.  NOT CHECKED: agreement with any measured column "
          "(nothing here is validated against a measurement); UNIFAC's accuracy; the sealed bytes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
