#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: boron in reverse osmosis as an acid and its base split by the pH
(DEV.md 4c C198, Stage 1), recomputed OUTSIDE the engine.

    bin/curate/check_boron_split.py

THE FEATURE.  A module's `aqueousSplit {}` carries ONE apparent component
(boron, as B) as boric acid (neutral) and borate (an anion), each with its own
intrinsic rejection.  The base fraction alpha is the PACKAGE's: the curated
record data/standards/chemistry/BOH4-formation.dat (log K and its enthalpy),
the case's declared aqueous activity model, the module inlet's bulk and the
DECLARED pH.  The two forms recombine exactly into the component's effective
rejection when the split is frozen (docs/design/boron-in-reverse-osmosis-
proposal.md, BUILT Stage 1); the permeances come from rated tests.

WHAT THIS CHECKS, each by arithmetic the engine does not share:
  (a) THE RECORD is the databank's number, transcribed here beside its source
      (USGS phreeqc.dat, H3BO3 = H2BO3- + H+, log_k -9.24, delta_h 3.224 kcal,
      read 2026-11-02): logK25 -9.24 and dH 3.224 x 4184 J.
  (b) ALPHA.  For RO1 (pH 8.2, seawater strength) and RO2a (pH 10, permeate
      strength) alpha is recomputed from the record, the declared pH and the
      Davies activity of the bulk NaCl (the case's declared model, written out
      here from its definition), and equals the engine's `split_alpha`.
  (c) THE PERMEANCES FROM THE TEST.  The acid's rejection is recomputed from
      the rated test (the engine's own per-test effective R_int, a one-test
      inversion of the same module film), alpha at the TEST's pH in pure water,
      and the base's rejection (= the salt's): 1 - R_eff,test = (1 - a_t)
      p_acid + a_t p_base.  R_eff of the plant, and the permeate shares of the
      two forms, are recomputed from alpha and the two rejections.
  (d) THE PLANT'S BORON FOLLOWS THE pH.  Declaring the second pass at pH 9
      instead of 10 moves its effective rejection to the value alpha(9)
      predicts, and the product's boron UP.  This arm is the positive form of
      the one that, in check_swro_plant, pinned the opposite while the engine
      did not couple the pH.
  (e) TWO RATED TESTS give BOTH forms.  A fixture adds a second boron test at
      another pH to a module record (SYNTHETIC, labelled so in the fixture --
      it is no datum) and the engine's pair equals the 2x2 solution recomputed
      here; both tests are reproduced.
  (f) REFUSALS BY NAME (fixtures): one test given to `tests ( )`; two tests at
      the same pH; a solution with a negative passage; no aqueous chemistry
      declared; a transport law other than constantRejection; a
      `fromAqueousSplit` with no block; a block with no `fromAqueousSplit`.
  (g) A HELD-OUT MEASURED POINT, with its band declared BEFORE the comparison.
      See HELD_OUT below: a laboratory polyamide-like membrane (NOT the plant's)
      whose boron rejection was measured at pH 7, 8 and 10 in an open paper;
      the acid's rejection is fixed from the pH 7 point alone, and the model's
      pH 8 value and its pH 10 lower bound are compared with the paper's.

WHAT IT DOES NOT CHECK, said plainly:
  * that Davies is right at seawater strength: it is outside its own band
    there and the run says so (the engine's announcement is required below);
  * the plant's boron against any measurement: the Toray sheet's numbers are
    the FIT (one test per element), so they validate nothing;
  * the pKa against Dickson's conditional seawater constant: that comparison
    is PRINTED (never gated, never tuned): pKa* = 8.597 at S = 35, 25 C against
    the engine's;
  * that borate is rejected like the salt: it is a declared assumption of the
    shipped case, announced on every run, because one test cannot identify two
    permeances.
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
CASE = ROOT / "tutorials" / "plant" / "swro01_campoDalias"
ENV = dict(os.environ, CHOUPO_HOME=str(ROOT))
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")

fails = []

# ---- (a) the databank's number, typed here beside its source ----------------
#  USGS PHREEQC phreeqc.dat (usgs-coupled/phreeqc3, database/phreeqc.dat,
#  read 2026-11-02, lines 319-321):   H3BO3 = H2BO3- + H+ ; -log_k -9.24 ;
#  -delta_h 3.224 kcal.  The file states no primary and no temperature window.
PHREEQC_LOGK25 = -9.24
PHREEQC_DH_KCAL = 3.224
CAL = 4184.0                       # J/cal (thermochemical)
R_GAS = 8.314462618

# ---- (g) the held-out point, DECLARED BEFORE the comparison ------------------
#  Lu, Shang, Ma, Xu, A, Sun, Li, Jia, Lu, Wu, Chen, Chen, Fan and An (corr.),
#  "Supramolecular nanocrystalline membranes with well-aligned subnanochannels
#  for enhanced reverse osmosis desalination", Nature Communications 16, 6289
#  (2025), doi 10.1038/s41467-025-61352-6 (Europe PMC PMC12238270), licence CC
#  BY-NC-ND 4.0: individual measured values are quoted here for comparison,
#  nothing is redistributed as data.  Text, 5 ppm boric acid, 15.5 bar, NaOH to
#  set the pH, no salt: "boron rejection ... 92.6% for SNM-0 to SNM-2" at pH 7,
#  "at pH 8, SNM-2 showed a boron rejection rate of 93.5%", "the rejection rate
#  of anionic B(OH)4- exceeded 98% at pH = 10".
#  THE COMPARISON AND ITS BAND, written before it was run: the acid's
#  rejection is the pH 7 value (alpha(7) = 0.0057: the form is all acid); the
#  base's is the salt-like 0.99 the shipped case declares; the pH 8 rejection
#  the model then PREDICTS is compared with 93.5 % within +-1.0 percentage
#  point (a lab membrane without a film, the mean of four coupons: the film is
#  neglected, so only the SHAPE of the pH dependence is tested), and the pH 10
#  prediction must be >= 98 %.  It is a different membrane from the plant's.
HELD_OUT = {"pH": (7.0, 8.0, 10.0), "R7": 0.926, "R8": 0.935, "R10_min": 0.98,
            "band_pp": 1.0, "R_base": 0.99}


def rel(a, b):
    return abs(a - b) / abs(b) if b != 0 else abs(a)


def run_case(case: Path):
    if _CACHE and case == CASE:
        f = Path(_CACHE) / (case.relative_to(ROOT).as_posix().replace("/", "__") + ".out")
        try:
            return f.read_text(errors="replace"), 0
        except OSError:
            pass
    r = subprocess.run([str(ROOT / "choupoSolve"), str(case)], capture_output=True, text=True, env=ENV)
    return r.stdout + r.stderr, r.returncode


def result_json(out: str):
    a, b = out.find("<<<Choupo:result-begin>>>"), out.find("<<<Choupo:result-end>>>")
    if a < 0 or b < 0:
        return None
    try:
        return json.loads(out[a + len("<<<Choupo:result-begin>>>"):b])
    except ValueError:
        return None


def fixture(tmp: Path, name: str, edit) -> Path:
    dst = tmp / name
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns("converged", "design", "reports",
                    "iterations", "log.*", "*.json"))
    edit(dst)
    return dst


def sub_file(p: Path, old: str, new: str, count: int = 1):
    s = p.read_text()
    if old not in s:
        raise RuntimeError("fixture edit: %r not in %s" % (old, p))
    p.write_text(s.replace(old, new, count))


# ---- the independent chemistry ----------------------------------------------
def record_values():
    p = ROOT / "data" / "standards" / "chemistry" / "BOH4-formation.dat"
    s = re.sub(r"//[^\n]*", "", p.read_text())
    lk = float(re.search(r"logK25\s+(-?[0-9.]+);", s).group(1))
    dh = float(re.search(r"dH\s+(-?[0-9.]+);", s).group(1))
    return lk, dh


def logK_T(T):
    lk, dh = record_values()
    return lk + dh / (R_GAS * math.log(10.0)) * (1.0 / 298.15 - 1.0 / T)


def davies_gamma1(I, T=298.15):
    A = 0.51      # 25 C; the module inlet is within 0.1 K of it (the pump's heat), a 1e-4 effect on A
    s = math.sqrt(I)
    return 10.0 ** (-A * (s / (1.0 + s) - 0.3 * I))


def alpha_of(pH, I, T=298.15):
    """base fraction: m_B/m_A = K gamma_A / (a_H gamma_B), gamma_A = 1 (neutral)."""
    r = 10.0 ** logK_T(T) / (10.0 ** (-pH) * davies_gamma1(I, T))
    return r / (1.0 + r)


def alpha_I(pH, m_nacl, m_B, T=298.15):
    """The base fraction and the ionic strength, SELF-CONSISTENT (Davies): the ions are Na+, Cl-
    (the lumped salt), the borate itself, H+ at the declared pH and OH- (log Kw = -14, the
    water-dissociation record).  Every singly charged ion has the one Davies gamma; the
    water activity is the model's phi = 1 one."""
    I = m_nacl
    a = 0.0
    for _ in range(500):
        g = davies_gamma1(I, T)
        mH = 10.0 ** (-pH) / g
        mOH = 1.0e-14 / (10.0 ** (-pH) * g)
        # the formation consumes a water (nuWater 1): K = a_B a_H / (a_A a_w); a_w = exp(-M_w/1000 sum m_i), phi = 1 (Davies)
        aw = math.exp(-18.015e-3 * (2.0 * m_nacl + m_B + mH + mOH))
        r = 10.0 ** logK_T(T) * aw / (10.0 ** (-pH) * g)
        a = r / (1.0 + r)
        In = m_nacl + 0.5 * (a * m_B + mH + mOH)
        if abs(In - I) < 1e-15:
            I = In
            break
        I = In
    return a, I


def eff(alpha, Ra, Rb):
    return 1.0 - ((1.0 - alpha) * (1.0 - Ra) + alpha * (1.0 - Rb))


MW = {"water": 18.015, "NaCl": 58.44, "boron": 10.81}


def mw_water():
    s = re.sub(r"//[^\n]*", "", (ROOT / "data" / "standards" / "components" / "water.dat").read_text())
    return float(re.search(r"\bMW\s+([0-9.]+);", s).group(1))


def molalities(stream, rho):
    """(NaCl, boron) in mol per kg of water, for a stream of the case (water, NaCl, boron)
    closed on the module's solution density rho."""
    z = stream["composition"]
    mw = {"water": mw_water(), "NaCl": MW["NaCl"], "boron": MW["boron"]}
    mass = sum(z[k] * mw[k] for k in mw)                     # kg per kmol of stream
    water = rho - sum(z[k] * rho / mass * mw[k] for k in ("NaCl", "boron"))
    return z["NaCl"] * rho / mass * 1.0e3 / water, z["boron"] * rho / mass * 1.0e3 / water


# ---------------------------------------------------------------------------
def arm_a():
    lk, dh = record_values()
    if abs(lk - PHREEQC_LOGK25) > 1e-12:
        fails.append("(a) BOH4-formation.dat logK25 is %r, the databank's is %r" % (lk, PHREEQC_LOGK25))
    if abs(dh - PHREEQC_DH_KCAL * CAL) > 0.5:
        fails.append("(a) BOH4-formation.dat dH is %r J/mol, the databank's %.3f kcal = %.1f J/mol"
                     % (dh, PHREEQC_DH_KCAL, PHREEQC_DH_KCAL * CAL))
    return lk, dh


def kpis(res, unit):
    return res["kpis"][unit]


def arm_bc(res, out):
    S = res["streams"]
    done = {}
    for unit, inlet, rho, pH in (("RO1", "roFeed", 1025.0, 8.2), ("RO2a", "feed2", 1000.0, 10.0)):
        K = kpis(res, unit)
        need = ("split_alpha", "split_R_acid", "split_R_base", "split_R_eff", "split_I", "split_test1_alpha",
                "split_test1_R_eff", "R_int_fromRatedTest_NaCl", "split_pKa_thermo")
        if not all(k in K for k in need):
            fails.append("(b) %s lacks KPIs %s" % (unit, [k for k in need if k not in K]))
            continue
        # (b) alpha
        m_nacl, m_B = molalities(S[inlet], rho)
        T = S[inlet]["T"]
        a_ind, I = alpha_I(pH, m_nacl, m_B, T)
        if abs(K["split_I"] - I) > 1e-4 * I + 1e-7:
            fails.append("(b) %s: the engine's ionic strength %.6g, the NaCl molality recomputed %.6g" % (unit, K["split_I"], I))
        if abs(K["split_alpha"] - a_ind) > 2e-4 * a_ind + 1e-7:
            fails.append("(b) %s: alpha %.6g, recomputed from the record, pH %.1f and Davies %.6g" % (unit, K["split_alpha"], pH, a_ind))
        if abs(K["split_pKa_thermo"] + logK_T(T)) > 1e-6:
            fails.append("(b) %s: pKa_thermo %r is not -logK(T)" % (unit, K["split_pKa_thermo"]))
        # (c) the test: pure water + 5 ppm boron at the test's pH (I ~ 0, gamma = 1)
        pHt = K.get("split_test1_pH")
        m_t = 5.0e-6 / (1.0 - 5.0e-6) / MW["boron"] * 1.0e3          # the rated test: 5 ppm boron in water
        a_t, _ = alpha_I(pHt, 0.0, m_t)
        if abs(K["split_test1_alpha"] - a_t) > 5e-4 * a_t:
            fails.append("(c) %s: alpha at the test (pH %.1f) %.6g, recomputed %.6g" % (unit, pHt, K["split_test1_alpha"], a_t))
        Rb = K["R_int_fromRatedTest_NaCl"]
        pa = ((1.0 - K["split_test1_R_eff"]) - a_t * (1.0 - Rb)) / (1.0 - a_t)
        Ra = 1.0 - pa
        if abs(K["split_R_acid"] - Ra) > 2e-4 or abs(K["split_R_base"] - Rb) > 1e-9:
            fails.append("(c) %s: R_acid %.6f / R_base %.6f, recomputed from the test %.6f / %.6f"
                         % (unit, K["split_R_acid"], K["split_R_base"], Ra, Rb))
        # the plant's effective rejection and the permeate shares
        Re = eff(K["split_alpha"], K["split_R_acid"], K["split_R_base"])
        if abs(K["split_R_eff"] - Re) > 1e-9:
            fails.append("(c) %s: R_eff %.9f, recomputed %.9f" % (unit, K["split_R_eff"], Re))
        wa, wb = (1 - K["split_alpha"]) * (1 - K["split_R_acid"]), K["split_alpha"] * (1 - K["split_R_base"])
        pa_k, pb_k = K["split_permeate_acid_kmol_s"], K["split_permeate_base_kmol_s"]
        if abs(pa_k / (pa_k + pb_k) - wa / (wa + wb)) > 1e-9:
            fails.append("(c) %s: the permeate acid share %.9f, recomputed %.9f" % (unit, pa_k / (pa_k + pb_k), wa / (wa + wb)))
        ra, rb = K["split_retentate_acid_kmol_s"], K["split_retentate_base_kmol_s"]
        if abs(rb / (ra + rb) - K["split_alpha"]) > 1e-12:
            fails.append("(c) %s: the retentate keeps the frozen split; its base share is %.9f, not alpha" % (unit, rb / (ra + rb)))
        done[unit] = (K["split_alpha"], I, K["split_R_acid"], K["split_R_base"])
    # the permeate boron by species closes on the permeate stream
    for unit, perm in (("RO1", "perm1"), ("RO2a", "perm2a")):
        K = kpis(res, unit)
        if "split_permeate_acid_kmol_s" not in K:
            continue
        got = K["split_permeate_acid_kmol_s"] + K["split_permeate_base_kmol_s"]
        st = S[perm]
        want = st["composition"]["boron"] * st["F"]
        if rel(got, want) > 1e-9:
            fails.append("(c) %s: permeate boron by species %.6e kmol/s, the stream carries %.6e" % (unit, got, want))
    #  both channels: stdout "  [split] boron split into ..." and stderr "[split] spiralWoundModule 'RO1': boron split into ..."
    for needle in ("[split] boron split into", "[split] spiralWoundModule 'RO1': boron split into",
                   "FROZEN at the module inlet", "pH 8.200 DECLARED", "DECLARED ASSUMPTION"):
        if needle not in out:
            fails.append("(b) the run does not announce %r" % needle)
    if not re.search(r"beyond its ~0\.5 mol/kg", out):
        fails.append("(b) the declared activity model's own out-of-band announcement (Davies beyond ~0.5 mol/kg) did not fire")
    return done


def kp(res, unit, key):
    return res["kpis"][unit][key]


def product_boron(res):
    st = res["streams"]["perm2"]
    return st["composition"]["boron"] * st["F"] * MW["boron"] / (st["F_mass"] / 1000.0) * 1000.0     # mg/L


def arm_d(res, tmp):
    base = product_boron(res)
    d = fixture(tmp, "pass2-pH9", lambda d: [sub_file(d / "system" / "flowsheetDict",
                "                pH          10;", "                pH          9;", 2)])
    out, code = run_case(d)
    r2 = result_json(out) if code == 0 else None
    if r2 is None:
        fails.append("(d) the pass-2 pH 9 fixture did not run:\n" + out[-800:])
        return None
    K1, K2 = kpis(res, "RO2a"), kpis(r2, "RO2a")
    m_nacl, m_B = molalities(res["streams"]["feed2"], 1000.0)
    a9, _ = alpha_I(9.0, m_nacl, m_B, res["streams"]["feed2"]["T"])
    Re9 = eff(a9, K1["split_R_acid"], K1["split_R_base"])
    # the acid and base rejections come from the test at pH 10 and must NOT move with the plant's pH
    if abs(K2["split_R_acid"] - K1["split_R_acid"]) > 1e-9:
        fails.append("(d) the acid's rejection moved with the pass-2 pH (%.6f -> %.6f): it is the membrane's" % (K1["split_R_acid"], K2["split_R_acid"]))
    if abs(K2["split_alpha"] - a9) > 2e-4 * a9 + 1e-7:
        fails.append("(d) alpha at pH 9 %.6f, recomputed %.6f" % (K2["split_alpha"], a9))
    if abs(K2["split_R_eff"] - Re9) > 5e-6:
        fails.append("(d) R_eff at pH 9 %.6f, recomputed %.6f" % (K2["split_R_eff"], Re9))
    if not (K2["split_R_eff"] < K1["split_R_eff"]):
        fails.append("(d) lowering the pass-2 pH 10 -> 9 did not lower its effective boron rejection")
    b9 = product_boron(r2)
    if not (b9 > base):
        fails.append("(d) the product boron did not rise when the second pass went from pH 10 to 9 (%.5g -> %.5g mg/L)" % (base, b9))
    return base, b9, K1["split_R_eff"], K2["split_R_eff"]


def arm_e(res, tmp):
    def edit(d):
        p = d / "constant" / "assets" / "TM820E-400.dat"
        s = p.read_text()
        i = s.index("    {\n        id                 boronRef;")
        j = s.index("    }\n", i) + 6
        block = s[i:j]
        syn = block.replace("boronRef", "boronSyn10")
        for old, new in (("pH                 8;", "pH                 10;"),
                         ("rejection          0.91;", "rejection          0.98;  // SYNTHETIC (gate fixture, not a datum)")):
            if old not in syn:
                raise RuntimeError("fixture edit: %r not in the boron test" % old)
            syn = syn.replace(old, new)
        p.write_text(s[:j] + syn + s[j:])
        sub_file(d / "system" / "flowsheetDict",
                 "                    acid  ( fromRatedTest boronRef );    // the acid from the sheet's 91 % at pH 8 (Table 1)\n"
                 "                    base  ( sameAs NaCl );              // ASSUMED: borate is an anion and is rejected like the salt (the module's own NaCl intrinsic rejection); the data sheet states one boron test per element, which cannot identify two permeances\n",
                 "                    tests ( boronRef boronSyn10 );\n")
    d = fixture(tmp, "two-tests", edit)
    out, code = run_case(d)
    r2 = result_json(out) if code == 0 else None
    if r2 is None:
        fails.append("(e) the two-test fixture did not run:\n" + out[-1000:])
        return None
    K = kpis(r2, "RO1")
    if K.get("split_tests") != 2:
        fails.append("(e) the two-test fixture used %r tests" % K.get("split_tests"))
        return None
    a1, a2 = K["split_test1_alpha"], K["split_test2_alpha"]
    p1, p2 = 1.0 - K["split_test1_R_eff"], 1.0 - K["split_test2_R_eff"]
    det = a2 - a1
    pa = (p1 * a2 - a1 * p2) / det
    pb = ((1 - a1) * p2 - (1 - a2) * p1) / det
    if abs(K["split_R_acid"] - (1 - pa)) > 1e-9 or abs(K["split_R_base"] - (1 - pb)) > 1e-9:
        fails.append("(e) the engine's (R_acid, R_base) = (%.9f, %.9f); the 2x2 recomputed gives (%.9f, %.9f)"
                     % (K["split_R_acid"], K["split_R_base"], 1 - pa, 1 - pb))
    for t in (1, 2):
        at, Rt = K["split_test%d_alpha" % t], K["split_test%d_R_eff" % t]
        if abs(eff(at, K["split_R_acid"], K["split_R_base"]) - Rt) > 1e-9:
            fails.append("(e) test %d is not reproduced by the pair" % t)
    if abs(K["split_R_base"] - K["R_int_fromRatedTest_NaCl"]) < 1e-3:
        fails.append("(e) the two-test base rejection equals the salt's: the tests were not what determined it")
    return K["split_R_acid"], K["split_R_base"], a1, a2


def arm_f(tmp):
    n = 0

    def refused(name, edit, words):
        nonlocal n
        d = fixture(tmp, name, edit)
        out, code = run_case(d)
        if code == 0:
            fails.append("(f) %s: the run EXITED 0 -- not refused" % name)
            return
        miss = [w for w in words if w not in out]
        if miss:
            fails.append("(f) %s: refused, but not naming %r.  Tail:\n%s" % (name, miss, out[-700:]))
        n += 1

    FS = lambda d: d / "system" / "flowsheetDict"
    ACID = ("                    acid  ( fromRatedTest boronRef );    // the acid from the sheet's 91 % at pH 8 (Table 1)\n"
            "                    base  ( sameAs NaCl );              // ASSUMED: borate is an anion and is rejected like the salt (the module's own NaCl intrinsic rejection); the data sheet states one boron test per element, which cannot identify two permeances\n")

    def add_syn_test(d, pH, rej):
        p = d / "constant" / "assets" / "TM820E-400.dat"
        s = p.read_text()
        i = s.index("    {\n        id                 boronRef;")
        j = s.index("    }\n", i) + 6
        blk = s[i:j].replace("boronRef", "boronSyn").replace("pH                 8;", "pH                 %s;" % pH) \
                    .replace("rejection          0.91;", "rejection          %s;" % rej)
        p.write_text(s[:j] + blk + s[j:])

    refused("one-test-in-tests", lambda d: sub_file(FS(d), ACID, "                    tests ( boronRef );\n"),
            ["TWO unknowns", "tests"])
    def same_ph(d):
        add_syn_test(d, "8", "0.93")
        sub_file(FS(d), ACID, "                    tests ( boronRef boronSyn );\n")
    refused("two-tests-same-pH", same_ph, ["same pH", "alpha"])
    def negative(d):
        # RO2a: a base that passes everything (R_base 0) at pH 10 (alpha 0.85) would pass more than the sheet measured
        p = FS(d)
        s = p.read_text()
        i = s.index("name        RO2a;")
        j = s.index("base  ( sameAs NaCl );", i)
        p.write_text(s[:j] + "base  0.0;" + s[j + len("base  ( sameAs NaCl );"):])
    refused("negative-acid-passage", negative, ["NEGATIVE", "acid passage"])
    refused("no-aqueous-chemistry", lambda d: sub_file(d / "constant" / "thermoPhysPropDict",
            "    aqueous\n    {\n        activityModel { model davies; }\n    }\n", ""),
            ["aqueous chemistry", "activityModel"])
    refused("split-with-solutionDiffusion", lambda d: sub_file(FS(d),
            "            transport        constantRejection;", "            transport        solutionDiffusion;", 1),
            ["aqueousSplit", "constantRejection"])
    def drop_block(d):
        p = FS(d)
        s = p.read_text()
        i = s.index("            aqueousSplit\n")
        j = s.index("            transport        constantRejection;", i)
        p.write_text(s[:i] + s[j:])
    refused("fromAqueousSplit-without-a-block", drop_block, ["fromAqueousSplit", "aqueousSplit"])
    def no_word(d):
        sub_file(FS(d), "                    boron ( fromAqueousSplit );", "                    boron ( fromRatedTest boronRef );", 1)
    refused("block-without-fromAqueousSplit", no_word, ["fromAqueousSplit"])
    refused("no-pHSource", lambda d: sub_file(FS(d),
            "                pHSource    \"Toray case study MC-CS-CAMPODEDALIAS-1910, Table 2 (the seawater analysis: pH 8.2); the pH of the feed is a DECLARED label of this module (Stage 1: no stream carries a pH)\";\n", "", 1),
            ["pHSource"])
    return n


def arm_g():
    """The held-out comparison: the model's PREDICTION (acid fixed at pH 7, base declared) against the paper's pH 8 value."""
    pH7, pH8, pH10 = HELD_OUT["pH"]
    m_t = 5.0e-6 / (1.0 - 5.0e-6) / MW["boron"] * 1.0e3          # 5 ppm, as the paper
    a7, a8, a10 = (alpha_I(p, 0.0, m_t)[0] for p in HELD_OUT["pH"])
    pb = 1.0 - HELD_OUT["R_base"]
    # observed R7 = 1 - [(1-a7) pa + a7 pb]  ->  pa
    pa = ((1.0 - HELD_OUT["R7"]) - a7 * pb) / (1.0 - a7)
    R8 = eff(a8, 1.0 - pa, HELD_OUT["R_base"])
    R10 = eff(a10, 1.0 - pa, HELD_OUT["R_base"])
    gap8 = (R8 - HELD_OUT["R8"]) * 100.0
    if abs(gap8) > HELD_OUT["band_pp"]:
        fails.append("(g) HELD-OUT pH 8: predicted %.2f %%, measured %.1f %% (gap %+.2f pp, band +-%.1f)"
                     % (R8 * 100, HELD_OUT["R8"] * 100, gap8, HELD_OUT["band_pp"]))
    if R10 < HELD_OUT["R10_min"]:
        fails.append("(g) HELD-OUT pH 10: predicted %.2f %%, the paper reports > %.0f %%" % (R10 * 100, HELD_OUT["R10_min"] * 100))
    return R8, gap8, R10


def main():
    if not (ROOT / "choupoSolve").exists():
        print("check_boron_split: FAILED -- no choupoSolve build")
        return 1
    arm_a()
    out, code = run_case(CASE)
    if code != 0:
        print("check_boron_split: FAILED -- the case did not run (exit %d)\n%s" % (code, out[-1500:]))
        return 1
    res = result_json(out)
    if res is None:
        print("check_boron_split: FAILED -- no result JSON")
        return 1
    done = arm_bc(res, out)
    tmp = Path(tempfile.mkdtemp(prefix="check_boron_split_"))
    try:
        d = arm_d(res, tmp)
        e = arm_e(res, tmp)
        nref = arm_f(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    g = arm_g()
    if fails or not done or d is None or e is None:
        print("check_boron_split: FAILED")
        for f in fails:
            print("  " + f)
        return 1
    a1, I1, Ra1, Rb1 = done["RO1"]
    a2, I2, Ra2, Rb2 = done["RO2a"]
    pK_app = 8.2 + math.log10((1 - a1) / a1)
    print("check_boron_split: OK -- the record is the databank's (log K %.2f, dH %.3f kcal); on %s alpha is %.5f at pass 1 "
          "(pH 8.2, I %.3f, Davies) and %.5f at pass 2 (pH 10, I %.4f), recomputed from the record, the declared pH and the "
          "activity model; the acid's rejection (%.4f at pass 1, %.4f at pass 2) is recomputed from the rated test and the "
          "salt-like base (%.4f, %.4f), R_eff, the permeate shares of the two forms and the closure of the permeate boron "
          "reproduce; the pass-2 pH moved 10 -> 9 lowers R_eff %.5f -> %.5f as alpha(9) predicts and raises the product boron "
          "%.4f -> %.4f mg/L; TWO rated tests (alpha %.4f, %.4f; the second a SYNTHETIC fixture) give R_acid %.4f and R_base %.4f = the 2x2 recomputed; %d fixtures "
          "refuse by name; HELD-OUT (a lab membrane, NOT the plant's; pH 7 fixes the acid): predicted %.2f %% at pH 8 against "
          "93.5 %% measured (%+.2f pp, band +-%.1f), %.2f %% at pH 10 against > 98 %%.  PRINTED, never gated: the engine's "
          "apparent pKa at seawater strength %.3f against Dickson's pK*B 8.597 (S 35, 25 C, total scale).  NOT CHECKED: Davies "
          "at seawater strength (outside its band, announced), the Toray numbers (the fit), any boron measurement of the plant."
          % (PHREEQC_LOGK25, PHREEQC_DH_KCAL, CASE.name, a1, I1, a2, I2, Ra1, Ra2, Rb1, Rb2, d[2], d[3], d[0], d[1],
             e[2], e[3], e[0], e[1], nref, g[0] * 100, g[1], HELD_OUT["band_pp"], g[2] * 100, pK_app))
    return 0


if __name__ == "__main__":
    sys.exit(main())
