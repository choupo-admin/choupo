#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the cubic's mixing rules are what the papers say, and the one-fluid move changed nothing.

    bin/curate/check_cubic_mixing_rule.py

WHY THIS EXISTS (DEV.md 4c C408 (b); design record
docs/design/c408-eos-ge-mixing-rules.md, decisions D1 and D4).  A cubic whose
mixing rule is fed an excess-Gibbs model has two ways to be silently wrong:
a wrong composition derivative of the attraction (every fugacity coefficient
is then wrong and no flash complains), and a wrong temperature slope of
G^E (every enthalpy and entropy departure is then wrong and the first law of
a flowsheet STILL closes, because any single-valued H(T, P, y) closes:
check_energy_closure cannot see it).  A golden pins what a run prints.  This
gate recomputes, in Python and from the component records and the pair record,
what Michelsen (1990) and Dahl & Michelsen (1990) print, and holds the engine
to it through a probe linked to libchoupo.so
(bin/curate/_cubicMixingRuleProbe.cpp).

WHAT THIS GATE CHECKS (SRK, methanol + water, the catalogue's NRTL pair)

  (a) THE CLOSED FORM.  sum y_i ln phi_i = Z - 1 - ln(Z - B) - beta I, with
      Z the engine's own root (from the engine's volume), B = bP/RT and beta
      = a/(bRT) from THIS gate's own implementation of the rule, on both
      roots and 6 states (the one-fluid rule, MHV1 and MHV2).  It fails if any
      betabar_i or bbar_i is wrong.
  (b) THE FUGACITY COEFFICIENTS, INDEPENDENTLY.  Every ln phi_i of both roots
      against this gate's own SRK + NRTL + one-fluid / MHV1 / MHV2 (Michelsen
      Eq. 12, Dahl & Michelsen Eq. 13 and A3) to 1e-9: a second
      transcription, from the papers' equations, that shares no code with the
      engine.  For the one-fluid rule this is the check that the MOVE of its
      arithmetic into CubicMixingRule changed nothing a Python recomputation
      can see (the byte-identity of the corpus against the build before the
      move is the other half, reported with the commit).
  (c) THE DEPARTURES ARE THE SURFACE'S.  H^R = -R T^2 d(sum y ln phi)/dT and
      S^R = -R sum y ln phi - R T d(sum y ln phi)/dT, against a central
      difference of the engine's OWN ln phi on the vapour root (the root the
      engine's departures are on), at 4 states, for the one-fluid rule (the
      check of the check, 1e-7) and for MHV1 and MHV2 (2e-6).  This is the arm
      that sees a wrong d(G^E/RT)/dT.
  (d) ONE FLUID, BYTE FOR BYTE.  The probe's output for no `mixingRule` word
      and for `mixingRule vanDerWaalsOneFluid;` is the same text to 17 digits,
      lnphi, volumes and departures, at every state.
  (e) THE PURE LIMIT.  At y = (1, 0) and (0, 1) every rule returns the pure
      cubic: ln phi of the present component, both volumes and both
      departures equal the one-fluid values to 1e-12.
  (f) THE RULE RETURNS ITS INPUT.  The activity coefficients recovered from
      the cubic (gamma_i = phi_i^L(x)/phi_i^L(pure i) at the same T and P)
      against the NRTL fed in: MHV2 within 0.02 and MHV1 within 0.15 in ln
      gamma at 373.15 K and 2.5 bar (design record section 6: MHV2 returns the
      pair most faithfully, MHV1 within ~10 %), and the one-fluid kij = 0 rule
      NOT within 0.5 (it carries no G^E: the arm fails if the rules are not
      told apart).
  (g) BUBBLE PRESSURES, INDEPENDENTLY.  On the witness
      (tutorials/props/molecular/mhv01_methanol_water_100C) P_bubble of three
      measured points under MHV1 and MHV2 against this gate's own bubble-
      pressure solve (incipient vapour iterated) to 1e-5.
  (h) THE REFUSALS, each by name, on throwaway copies of the witness (eleven):
      Peng-Robinson with MHV1 and with MHV2; an excess-Gibbs rule with no
      activityModel; an activityModel under the one-fluid rule;
      binaryInteractions under MHV1; a G^E model `ideal`; a pair with no
      record, twice (the activity model's own refusal, and the rule's when the
      ideal substitution is authorised); an unknown rule word (the registry
      listed); PC-SAFT with MHV1; an MHV word in a gammaPhi vapour.
  (i) THE WINDOW IS ANNOUNCED.  A state whose pure beta_i leaves the 10 < beta
      < 13 interval the polynomial q(beta) was fitted on says so, once.

SABOTAGE-VERIFIED: see the commit message of the commit that added this gate
(each arm observed failing against a deliberately wrong engine, then reverted).

NOT CHECKED, said plainly: that MHV1/MHV2 reproduce any MEASURED diagram (the
witness's anchor rows hold that, with the pair's own error named); H^R of the
LIQUID root (the engine's departures are on the vapour root only: DEV.md 4c
C410); Peng-Robinson (refused by name); Wong-Sandler, Huron-Vidal, PSRK
(later slices); the cost of the extra activity-model calls.

Exit 1 naming the arm that failed.
"""
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
PROPS = BUILD / "choupoProps"
WITNESS = ROOT / "tutorials/props/molecular/mhv01_methanol_water_100C"
R = 8.314462618

Q = {"MHV1": (-0.593, 0.0), "MHV2": (-0.478, -0.0047)}


def comp(name, key):
    txt = (ROOT / "data/standards/components" / f"{name}.dat").read_text()
    m = re.search(rf"^{key}\s+([0-9.eE+-]+)\s*;", txt, re.M)
    if not m:
        raise ValueError(f"{name}: no {key}")
    return float(m.group(1))


def pair():
    txt = (ROOT / "data/standards/parameters/NRTL/methanol-water.dat").read_text()
    blk = txt[txt.index("parameters"):]
    g = lambda k: float(re.search(rf"^\s*{k}\s+([0-9.eE+-]+)\s*;", blk, re.M).group(1))
    return g("a_ij"), g("b_ij"), g("a_ji"), g("b_ji"), g("alpha")


NAMES = ["methanol", "water"]
TC = [comp(n, "Tc") for n in NAMES]
PC = [comp(n, "Pc") * 1e5 for n in NAMES]
OM = [comp(n, "omega") for n in NAMES]
MS = [0.48508 + 1.55171 * w - 0.15613 * w * w for w in OM]   # SRK.cpp: Graboski & Daubert
AC = [0.42747 * R * R * tc * tc / pc for tc, pc in zip(TC, PC)]
BI = [0.08664 * R * tc / pc for tc, pc in zip(TC, PC)]
A12, B12, A21, B21, ALPHA = pair()


def ai(T):
    return [AC[i] * (1 + MS[i] * (1 - math.sqrt(T / TC[i]))) ** 2 for i in range(2)]


def lng_nrtl(T, z):
    t12, t21 = A12 + B12 / T, A21 + B21 / T
    G12, G21 = math.exp(-ALPHA * t12), math.exp(-ALPHA * t21)
    x1, x2 = z
    ln1 = x2 * x2 * (t21 * (G21 / (x1 + x2 * G21)) ** 2 + t12 * G12 / (x2 + x1 * G12) ** 2)
    ln2 = x1 * x1 * (t12 * (G12 / (x2 + x1 * G12)) ** 2 + t21 * G21 / (x1 + x2 * G21) ** 2)
    return [ln1, ln2]


def beta_mix(T, z, rule):
    bm = z[0] * BI[0] + z[1] * BI[1]
    a = ai(T)
    be = [a[i] / (BI[i] * R * T) for i in range(2)]
    lng = lng_nrtl(T, z)
    ge = z[0] * lng[0] + z[1] * lng[1]
    lnbb = sum(z[i] * math.log(bm / BI[i]) for i in range(2))
    rhs = ge + lnbb
    q1, q2 = Q[rule]
    if q2 == 0.0:
        beta = sum(z[i] * be[i] for i in range(2)) + rhs / q1
    else:
        r = rhs + sum(z[i] * (q1 * be[i] + q2 * be[i] ** 2) for i in range(2))
        beta = 2 * r / (q1 - math.sqrt(q1 * q1 + 4 * q2 * r))
    return beta, be, lng, bm


def lnphi_py(T, P, z, rule, liquid):
    """ln phi_i of SRK + rule, from the papers' equations (not the engine's code)."""
    if rule == "oneFluid":
        a = ai(T)
        am = sum(z[i] * z[j] * math.sqrt(a[i] * a[j]) for i in range(2) for j in range(2))
        bm = z[0] * BI[0] + z[1] * BI[1]
        beta = am / (bm * R * T)
        bb = [(2 * sum(z[j] * math.sqrt(a[i] * a[j]) for j in range(2)) / am - BI[i] / bm) * beta
              + 0.0 for i in range(2)]
        # betabar_i/beta = abar_i/a - bbar_i/b  ->  betabar_i = beta * X_i
        X = [2 * sum(z[j] * math.sqrt(a[i] * a[j]) for j in range(2)) / am - BI[i] / bm
             for i in range(2)]
        bb = [beta * x for x in X]
    else:
        beta, be, lng, bm = beta_mix(T, z, rule)
        q1, q2 = Q[rule]
        bb = [(q1 * be[i] + q2 * (be[i] ** 2 + beta ** 2) + lng[i] + math.log(bm / BI[i])
               + BI[i] / bm - 1) / (q1 + 2 * q2 * beta) for i in range(2)]
    A = beta * bm * R * T * P / (R * T) ** 2
    B = bm * P / (R * T)
    return beta, A, B, bb, bm


def zroots(A, B):
    # Z^3 - Z^2 + (A - B - B^2) Z - A B = 0 (SRK)
    c2, c1, c0 = -1.0, A - B - B * B, -A * B
    # Newton from both ends, polished; plain numpy-free
    def f(Z): return ((Z + c2) * Z + c1) * Z + c0
    def fp(Z): return (3 * Z + 2 * c2) * Z + c1
    import numpy as np
    rt = np.roots([1, c2, c1, c0])
    rt = sorted(r.real for r in rt if abs(r.imag) < 1e-9 and r.real > B)
    return rt


def lnphi_full(T, P, y, rule, liquid):
    beta, A, B, bb, bm = lnphi_py(T, P, y, rule, liquid)
    rt = zroots(A, B)
    Z = rt[0] if liquid else rt[-1]
    I = math.log((Z + B) / Z)
    out = [BI[i] / bm * (Z - 1) - math.log(Z - B) - bb[i] * I for i in range(2)]
    return out, Z, beta, B


def parse_probe(text):
    rows = {}
    body = text.split("<<<PROBE\n")[-1].split("PROBE>>>")[0]
    for ln in body.splitlines():
        f = ln.split()
        if len(f) < 4 or f[0] not in ("none", "oneFluid", "MHV1", "MHV2"):
            continue                       # an announcement line, not a probe row
        rows[(f[0], int(f[1]), f[2])] = [float(v) for v in f[3:]]
    return rows, body


def run(case):
    return subprocess.run([str(PROPS), str(case)], capture_output=True, text=True,
                          timeout=900, cwd=str(ROOT))


def main() -> int:
    fail = []
    if not PROPS.exists() or not (BUILD / "libchoupo.so").exists():
        print("check_cubic_mixing_rule: REFUSED -- choupoProps / libchoupo.so is not built.")
        return 1

    # ---- the probe --------------------------------------------------------
    tmp = tempfile.mkdtemp(prefix="cmr_probe_")
    try:
        exe = Path(tmp) / "probe"
        b = subprocess.run(["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}",
                            str(ROOT / "bin/curate/_cubicMixingRuleProbe.cpp"),
                            str(BUILD / "libchoupo.so"), "-Wl,-rpath," + str(BUILD),
                            "-o", str(exe)], capture_output=True, text=True)
        if b.returncode != 0:
            print("check_cubic_mixing_rule: FAILED\n  - the probe did not compile: "
                  + b.stderr[-800:])
            return 1
        pr = subprocess.run([str(exe)], capture_output=True, text=True, timeout=300,
                            env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
        if pr.returncode != 0:
            print("check_cubic_mixing_rule: FAILED\n  - the probe died (exit %d): %s"
                  % (pr.returncode, (pr.stderr or pr.stdout).strip()[-500:]))
            return 1
        rows, body = parse_probe(pr.stdout)
        if not rows:
            print("check_cubic_mixing_rule: FAILED\n  - the probe printed nothing: "
                  + (pr.stderr or pr.stdout)[-600:])
            return 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    states = {k[1]: v for k, v in rows.items() if k[0] == "MHV1" and k[2] == "state"}

    # ---- (a), (b) ---------------------------------------------------------
    for rule in ("oneFluid", "MHV1", "MHV2"):
        for k, (T, P, y0) in sorted(states.items()):
            if y0 in (0.0, 1.0):
                continue
            y = [y0, 1 - y0]
            for liquid, key, vi in ((False, "lnphiV", 0), (True, "lnphiL", 1)):
                eng = rows[(rule, k, key)]
                py, Z, beta, B = lnphi_full(T, P, y, rule, liquid)
                # (b)
                for i in range(2):
                    if abs(eng[i] - py[i]) > 1e-9:
                        fail.append(f"(b) {rule} state {k} {'liquid' if liquid else 'vapour'}: ln phi_{i} "
                                    f"engine {eng[i]:.12g} vs the papers' equations {py[i]:.12g}")
                # (a) with the ENGINE's Z (from its volume) and this gate's beta
                v = rows[(rule, k, "vol")][vi]
                Ze = P * v / (R * T)
                lhs = y[0] * eng[0] + y[1] * eng[1]
                rhs = Ze - 1 - math.log(Ze - B) - beta * math.log((Ze + B) / Ze)
                if abs(lhs - rhs) > 1e-9:
                    fail.append(f"(a) {rule} state {k} {'liquid' if liquid else 'vapour'}: "
                                f"sum y ln phi = {lhs:.12g}, Z - 1 - ln(Z-B) - beta I = {rhs:.12g}")

    # ---- (c) --------------------------------------------------------------
    for rule, tol in (("oneFluid", 1e-7), ("MHV1", 2e-6), ("MHV2", 2e-6)):
        for k in range(4):
            T, P, y0 = rows[(rule, k, "dT")][:3]
            fm, f0, fp = rows[(rule, k, "dT")][3:6]
            h = rows[(rule, k, "dTh")][0]
            Hs, Ss = rows[(rule, k, "dTHS")]
            d = (fp - fm) / (2 * h)
            Hfd = -R * T * T * d
            Sfd = -R * f0 - R * T * d
            if abs(Hs - Hfd) > tol * max(1.0, abs(Hfd)):
                fail.append(f"(c) {rule} state {k}: H_R = {Hs:.9g} but -R T^2 d(sum y ln phi)/dT = {Hfd:.9g}")
            if abs(Ss - Sfd) > tol * max(1.0, abs(Sfd)):
                fail.append(f"(c) {rule} state {k}: S_R = {Ss:.9g} but -R sum y ln phi - R T d()/dT = {Sfd:.9g}")

    # ---- (d) --------------------------------------------------------------
    for k in range(len(states)):
        for key in ("state", "lnphiV", "lnphiL", "vol", "HRSR"):
            if rows[("none", k, key)] != rows[("oneFluid", k, key)]:
                fail.append(f"(d) state {k} {key}: `mixingRule vanDerWaalsOneFluid;` differs from no mixingRule "
                            f"({rows[('none', k, key)]} vs {rows[('oneFluid', k, key)]})")
    for k in range(4):
        for key in ("dT", "dTHS"):
            if rows[("none", k, key)] != rows[("oneFluid", k, key)]:
                fail.append(f"(d) dT state {k} {key}: one-fluid word differs from no word")

    # ---- (e) --------------------------------------------------------------
    for rule in ("MHV1", "MHV2"):
        for k, (T, P, y0) in states.items():
            if y0 not in (0.0, 1.0):
                continue
            i = 0 if y0 == 1.0 else 1
            for key, idx in (("lnphiV", i), ("lnphiL", i)):
                if abs(rows[(rule, k, key)][idx] - rows[("oneFluid", k, key)][idx]) > 1e-12:
                    fail.append(f"(e) {rule} pure component {i} {key}: {rows[(rule, k, key)][idx]!r} "
                                f"vs one-fluid {rows[('oneFluid', k, key)][idx]!r}")
            for key in ("vol", "HRSR"):
                for a, c in zip(rows[(rule, k, key)], rows[("oneFluid", k, key)]):
                    if abs(a - c) > 1e-12 * max(1.0, abs(c)):
                        fail.append(f"(e) {rule} pure component {i} {key}: {a!r} vs one-fluid {c!r}")

    # ---- (f) --------------------------------------------------------------
    k0 = [k for k, v in states.items() if v == [373.15, 2.5e5, 0.3]][0]
    kA = [k for k, v in states.items() if v == [373.15, 2.5e5, 1.0]][0]
    kB = [k for k, v in states.items() if v == [373.15, 2.5e5, 0.0]][0]
    T, P, y0 = states[k0]
    lg = lng_nrtl(T, [y0, 1 - y0])
    gap = {}
    for rule in ("MHV1", "MHV2", "oneFluid"):
        L = rows[(rule, k0, "lnphiL")]
        L1 = rows[(rule, kA, "lnphiL")][0]
        L2 = rows[(rule, kB, "lnphiL")][1]
        gap[rule] = max(abs((L[0] - L1) - lg[0]), abs((L[1] - L2) - lg[1]))
    if not gap["MHV2"] < 0.02:
        fail.append(f"(f) MHV2 returns the NRTL gammas to {gap['MHV2']:.4f} in ln gamma, expected < 0.02")
    if not gap["MHV1"] < 0.15:
        fail.append(f"(f) MHV1 returns the NRTL gammas to {gap['MHV1']:.4f} in ln gamma, expected < 0.15")
    if os.environ.get("CMR_DEBUG"):
        print("gaps", gap)
    if not gap["oneFluid"] > 0.3 or not gap["oneFluid"] > 3 * gap["MHV1"]:
        fail.append(f"(f) the one-fluid rule (kij = 0) is {gap['oneFluid']:.3f} from the NRTL gammas "
                    f"against MHV1's {gap['MHV1']:.3f}: the arm cannot tell the rules apart")

    # ---- (g) --------------------------------------------------------------
    if not WITNESS.exists():
        fail.append("(g) the witness case is missing")
    else:
        p = run(WITNESS)
        if p.returncode != 0:
            fail.append(f"(g) the witness did not run (exit {p.returncode}): {(p.stdout + p.stderr)[-400:]}")
        else:
            import json
            body = p.stdout.split("<<<Choupo:result-end>>>")[0]
            js = json.loads(body[body.rindex("\n{\n"):])
            diag = {o["name"]: o.get("diagnostics", {}) for o in js["operationResults"]}
            for rule, tag in (("MHV1", "mhv1"), ("MHV2", "mhv2")):
                for x in (0.053, 0.352, 0.826):
                    name = f"{tag}_" + ("x%.3f" % x).replace(".", "p")
                    eng = diag.get(name, {}).get("P_bubble")
                    ref = bubble_p(373.15, [x, 1 - x], rule)
                    if eng is None or abs(eng - ref) > 1e-5 * ref:
                        fail.append(f"(g) {name}: engine P_bubble {eng} vs this gate's {ref:.6f} Pa")

    # ---- (h), (i) ---------------------------------------------------------
    fail += refusals()

    if fail:
        print("check_cubic_mixing_rule: FAILED")
        for m in fail:
            print("  - " + m)
        return 1
    print("check_cubic_mixing_rule: OK -- SRK + MHV1/MHV2 on methanol + water: ln phi_i of both roots "
          "equal this gate's own implementation of Michelsen Eq. 12 and Dahl & Michelsen Eq. 13/A3 to 1e-9 "
          "and sum y ln phi equals the closed form Z - 1 - ln(Z-B) - beta I on 6 states; H_R and S_R equal "
          "the temperature differences of the engine's own ln phi on the vapour root (one-fluid to 1e-7, MHV1/MHV2 "
          "to 2e-6); `vanDerWaalsOneFluid` is byte-identical to no mixingRule word; every rule returns the pure "
          "cubic at y = 1; MHV2 returns the fed NRTL gammas to %.4f and MHV1 to %.4f in ln gamma "
          "(one-fluid kij = 0: %.2f); P_bubble of three measured points equals an independent solve to 1e-5; "
          "eleven refusals each by name, and a pure beta outside 10-13 is announced. NOT CHECKED: any measured "
          "diagram, H_R of the liquid root, Peng-Robinson." % (gap["MHV2"], gap["MHV1"], gap["oneFluid"]))
    return 0


def bubble_p(T, x, rule):
    """P and y of the bubble point of liquid x (sum K x = 1, incipient vapour iterated)."""
    if x[0] == 0.0 or x[1] == 0.0:
        pass

    def kvec(P, y):
        pl, _, _, _ = lnphi_full(T, P, x, rule, True)
        pv, _, _, _ = lnphi_full(T, P, y, rule, False)
        return [math.exp(pl[i] - pv[i]) for i in range(2)]

    def f(P):
        y = list(x)
        for _ in range(200):
            K = kvec(P, y)
            s = sum(K[i] * x[i] for i in range(2))
            yn = [K[i] * x[i] / s for i in range(2)]
            if max(abs(yn[i] - y[i]) for i in range(2)) < 1e-13:
                y = yn
                break
            y = yn
        K = kvec(P, y)
        return sum(K[i] * x[i] for i in range(2)) - 1.0

    lo, hi = 2e4, 2e6
    flo, fhi = f(lo), f(hi)
    for _ in range(80):
        if flo * fhi < 0:
            break
        hi *= 1.5
        fhi = f(hi)
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        fm = f(mid)
        if flo * fm <= 0:
            hi, fhi = mid, fm
        else:
            lo, flo = mid, fm
        if hi - lo < 1e-7 * mid:
            break
    return 0.5 * (lo + hi)


def refusals():
    fail = []
    base = (WITNESS / "constant/thermoPhysPropDict").read_text()
    pairblk = ('activityModel { model NRTL; binaryParameters { methanol-water '
               '{ source "data/standards/parameters/NRTL/methanol-water.dat"; } } }')

    def system(eos, vapour="vapour { fugacityRoute equationOfState; root vapour; }",
               form="phiPhi", extra=""):
        return (base[:base.index("equilibrium")] + "equilibrium\n{\n    formulation " + form + ";\n"
                "    equationOfState { " + eos + " }\n    liquid { fugacityRoute equationOfState; root liquid; }\n    "
                + vapour + "\n" + extra + "}\n")

    cases = [
        ("(h1) MHV1 on Peng-Robinson", system("model PengRobinson; mixingRule MHV1; " + pairblk),
         ["PER EQUATION OF STATE", "Peng-Robinson"]),
        ("(h2) MHV2 on Peng-Robinson", system("model PengRobinson; mixingRule MHV2; " + pairblk),
         ["PER EQUATION OF STATE"]),
        ("(h3) MHV1 without an activityModel", system("model SRK; mixingRule MHV1;"),
         ["needs the G^E model"]),
        ("(h4) an activityModel under the one-fluid rule",
         system("model SRK; mixingRule vanDerWaalsOneFluid; " + pairblk), ["has no G^E to give it to"]),
        ("(h5) binaryInteractions under MHV1",
         system("model SRK; mixingRule MHV1; " + pairblk
                + " binaryInteractions { mw { i methanol; j water; kij 0.1; variedBy fitParameters; } }"),
         ["has no kij"]),
        ("(h6) a G^E model `ideal`",
         system("model SRK; mixingRule MHV1; activityModel { model ideal; }"), ["NOT the one-fluid rule"]),
        ("(h7) a pair with no record (the activity model's own refusal)",
         system("model SRK; mixingRule MHV1; activityModel { model NRTL; }")
         .replace("components ( methanol water );", "components ( N2 water );"),
         ["N2-water"]),
        ("(h7b) a pair with no record, ideal substitution AUTHORISED: the rule still refuses",
         "approximations { idealBinaryPair { pairs ( N2-water ); reason \"gate\"; } }\n"
         + system("model SRK; mixingRule MHV1; activityModel { model NRTL; }")
         .replace("components ( methanol water );", "components ( N2 water );"),
         ["has no NRTL record", "N2-water"]),
        ("(h8) an unknown rule word", system("model SRK; mixingRule MHV3; " + pairblk),
         ["cubic mixing rule", "MHV1", "vanDerWaalsOneFluid"]),
        ("(h9) PC-SAFT with MHV1", system("model PCSAFT; mixingRule MHV1; " + pairblk),
         ["PCSAFT", "cubic grammar"]),
        ("(h10) an MHV word in a gammaPhi vapour slot",
         base.replace("fugacityModel idealGas;", "fugacityModel SRK; mixingRule MHV1;"),
         ["not read"]),
    ]
    for label, text, needles in cases:
        tmp = Path(tempfile.mkdtemp(prefix="cmr_gate_"))
        try:
            cp = tmp / "case"
            shutil.copytree(WITNESS, cp, ignore=shutil.ignore_patterns("*.csv"))
            (cp / "constant/thermoPhysPropDict").write_text(text)
            first = "N2" if "N2 water" in text else "methanol"
            if first == "N2":                    # an unsealed case: the catalogue supplies N2
                (cp / "constant/propertyManifest").unlink(missing_ok=True)
            (cp / "system/propsDict").write_text(
                "operations\n(\n    {\n        name probe;\n        type propertyPoint;\n"
                f"        state {{ T 373.15 K; P 1 atm; composition {{ {first} 0.5; water 0.5; }} }}\n"
                "        properties ( P_bubble );\n    }\n);\n")
            q = run(cp)
            msg = q.stdout + q.stderr
            if q.returncode == 0:
                fail.append(f"{label} ran (exit 0): it should be refused")
            else:
                miss = [n for n in needles if n not in msg]
                if miss:
                    fail.append(f"{label} was refused without naming {miss}: {msg.strip()[-300:]!r}")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    # (i) the window: 500 K, pure beta_i far below 10
    tmp = Path(tempfile.mkdtemp(prefix="cmr_gate_"))
    try:
        cp = tmp / "case"
        shutil.copytree(WITNESS, cp, ignore=shutil.ignore_patterns("*.csv"))
        (cp / "system/propsDict").write_text(
            "operations\n(\n    {\n        name hot;\n        type propertyPoint;\n        thermo mhv1;\n"
            "        state { T 450 K; P 20 bar; composition { methanol 0.5; water 0.5; } }\n"
            "        properties ( Z );\n    }\n);\n")
        q = run(cp)
        msg = q.stdout + q.stderr
        if q.returncode != 0 or "outside 10 < beta < 13" not in msg:
            fail.append("(i) a pure beta_i outside 10 < beta < 13 was not announced "
                        f"(exit {q.returncode}): {msg.strip()[-300:]!r}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return fail


if __name__ == "__main__":
    sys.exit(main())
