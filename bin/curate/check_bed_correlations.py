#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the fixed bed's transport correlations are transcribed right, on the
right basis, and never override a declared value (DEV.md 4c C450).

    bin/curate/check_bed_correlations.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  Two of the same family, one field
apart.  (1) C451 (2026-11-19): a textbook INTERSTITIAL dispersion D_L pasted
under `Dax` -- a field that is on the BED basis, Dax = eps D_L -- overstated
the dispersion by 1/eps and nothing printed it.  The correlations of C450
hand the same trap to every case that chooses one: Edwards & Richardson's
velocity is interstitial, Wakao & Funazkri's left side is eps D_ax, Chung &
Wen's N_Pe uses the interstitial u, and a dropped or doubled eps moves Dax by
2.5x at eps = 0.4 while every anchor (taken at one point) can still pass.
(2) A coefficient, exponent or window mis-transcribed from a scan (0.48 for
0.84, 9.7 for 7.9, a Reynolds range read with the wrong power of ten) passes
the compile, the golden (self-recorded) and a reader who trusts the header.

WHAT THIS GATE CHECKS, on tutorials/batch/adsorber/batch30_bed_correlations:

  (a) AN INDEPENDENT TRANSCRIPTION.  Every published estimate (four Dax, two
      k_f, the series k and its shares) is recomputed HERE from the case's own
      numbers and the printed Re, Sc and Dm, in a second implementation of the
      printed equations, and must agree with the engine's KPI to 1e-9
      (relative).  It proves the C++ equals this file, so it catches a slip in
      ONE copy; the two were written from the articles' pages, not from each
      other (page numbers are in the engine source).  It does not prove the
      articles right.
  (b) THE BASIS.  Edwards & Richardson's bed-basis Dax equals eps times the
      interstitial D_L of its printed eq (17) at u = U/eps, and Gunn's high-Re
      limit D/(U dp) -> 0.5 equals Edwards & Richardson's 0.5 u dp on the same
      basis; both are checked by value, not by the label.
  (c) EVERY ANCHOR holds within its stated tolerance (the KPIs
      corr_anchor_dev_*): printed numbers and cross-checks 1 %, limits 1e-4,
      arithmetic 1e-6.
  (d) THE WINDOWS MEAN SOMETHING.  On this gas bed (Re 7.13) the three gas
      correlations are inside their windows and Chung & Wen and Wilson &
      Geankoplis are OUTSIDE (a liquid correlation asked about a gas), and the
      log names the reason and the page of each citation.
  (e) A DECLARED VALUE WINS.  The witness declares Dax and kLDF: Dax_used is
      the declared one, and the front equals batch13's golden to 1e-9
      (t_b(5 %) 2934.06908679 s) -- the correlations changed nothing.
  (f) A CORRELATION FILLS ONLY WHEN CHOSEN AND THE DECLARATION IS ABSENT.  The
      witness copied with its Dax and kLDF removed: Dax_used is the Edwards &
      Richardson estimate, Pe is u L / Dax_used, the run says ESTIMATE for
      both, and k is the series estimate (the front moves: t_50 differs from
      the declared run's).
  (g) REFUSALS BY NAME: a series with no film model; a series with no scope
      and source; an unknown model (lists the accepted ones); no Dax and no
      dispersion model (the old lookup error, unchanged).

SABOTAGE-VERIFIED 2026-11-22, both at once (the quoted lines are OBSERVED; every
anchor still passed, which is the point of arm (a) and (b)):

    S1 Edwards & Richardson's `Dax = eps D_L` made `Dax = D_L` (the 1/eps trap)
    S2 Chung & Wen's exponent 0.48 mistyped 0.84
      (a) corr_Dax_EdwardsRichardson: engine 8.83e-05 vs second transcription 3.53e-05
      (a) corr_Dax_ChungWen: engine 0.000155 vs second transcription 0.000175
      (b) Edwards Dax is not eps * D_L

NOT CHECKED: that any correlation predicts a real bed (the corpus holds no
packed-bed dispersion measurement); the Gunn basis reading (the paper says
"usual connotations"; the gate checks the engine against the reading it
documents); a liquid bed (the unit is gas-phase).
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import case_records  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
ADS = ROOT / "tutorials" / "batch" / "adsorber"
B30 = ADS / "batch30_bed_correlations"
B13 = ADS / "batch13_breakthrough_co2"
R_GAS = 8.314462618

failures = []


def need(cond, msg):
    if not cond:
        failures.append(msg)


def variant(tmp, tag, edits=()):
    case = tmp / tag
    case_records.copytree(B30, case, ignore=shutil.ignore_patterns(
        "expected", "[0-9]*", "latest", "reports", "*.csv", "log*",
        "solution.log"))
    fs = case / "system" / "flowsheetDict"
    t = fs.read_text()
    for pat, rep in edits:
        t2 = re.sub(pat, rep, t, flags=re.S)
        if t2 == t:
            raise SystemExit(f"check_bed_correlations: edit '{pat}' did not "
                             f"apply -- the witness changed")
        t = t2
    fs.write_text(t)
    return case


def run(case):
    p = subprocess.run([str(BATCH), "."], cwd=case, capture_output=True,
                       text=True, timeout=900,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT)))
    k = {}
    for line in p.stdout.splitlines():
        m = re.match(r'\s*"(\w+)": (\{.*\}),?$', line)
        if m:
            try:
                k[m.group(1)] = json.loads(m.group(2))
            except ValueError:
                pass
    return p.returncode, p.stdout + p.stderr, k


def rel(a, b):
    return abs(a - b) / abs(b)


# ---- the second transcription of the printed equations -------------------
def wakao_dax(Dm, Sc, Re, eps):
    return Dm * (20.0 + 0.5 * Sc * Re)               # eps D_ax = Dm(20+.5ScRe)


def edwards_dax(Dm, U, dp, eps):
    u = U / eps
    DL = 0.73 * Dm + 0.5 * u * dp / (1.0 + 9.7 * Dm / (u * dp))
    return eps * DL


def chung_dax(U, dp, Re, eps):
    return eps * dp * U / (0.20 + 0.011 * Re ** 0.48)


def gunn_dax(U, dp, Re, Sc, eps):
    a1 = 2.404825557695773
    p = 0.17 + 0.33 * math.exp(-24.0 / Re)
    RS = Re * Sc
    e1 = 1.0 - eps
    t1 = RS * (1 - p) ** 2 / (4 * a1 ** 2 * e1)
    x = 4 * e1 * a1 ** 2 / (p * (1 - p) * RS)
    t2 = RS ** 2 * p * (1 - p) ** 3 / (16 * a1 ** 4 * e1 ** 2) * math.expm1(-x)
    t3 = eps / (1.4 * RS)
    return U * dp * (t1 + t2 + t3)


def wakao_sh(Re, Sc):
    return 2.0 + 1.1 * Sc ** (1.0 / 3.0) * Re ** 0.6


def wilson_sh(Re, Sc, eps):
    if Re <= 55.0:
        return 1.09 / eps * Re ** (1.0 / 3.0) * Sc ** (1.0 / 3.0)
    return 0.250 / eps * Re ** 0.69 * Sc ** (1.0 / 3.0)


def main():
    if not BATCH.exists():
        print("check_bed_correlations: choupoBatch is not built "
              "(make all) -- NOT RUN")
        return 2
    fs = (B30 / "system" / "flowsheetDict").read_text()
    ad = (B30 / "constant" / "adsorbents" / "zeolite13X_beads.dat").read_text()
    eps = float(re.search(r"\beps\s+([\d.]+)\s*;", fs).group(1))
    U = float(re.search(r"\bu\s+([\d.]+)\s+m/s", fs).group(1))
    T = float(re.search(r"\bT\s+([\d.]+)\s+K", fs).group(1))
    P = float(re.search(r"\bP\s+([\d.]+)\s+bar", fs).group(1)) * 1e5
    daxDecl = float(re.search(r"Dax\s*\[[^\]]*\]\s*([\d.e+-]+)\s*;", fs).group(1))
    dp = float(re.search(r"dParticle\s+([\d.]+)\s*mm", ad).group(1)) * 1e-3
    rhob = float(re.search(r"rho_bulk\s+([\d.]+)", ad).group(1))
    epsP = float(re.search(r"\bepsP\s+([\d.]+)", fs).group(1))
    tauP = float(re.search(r"\btauP\s+([\d.]+)", fs).group(1))
    dcr2 = float(re.search(r"DcOverRc2\s+([\d.e+-]+)", fs).group(1))
    yCO2 = float(re.search(r"CO2\s+(0\.\d+);\s*N2", fs).group(1))

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- the witness ---------------------------------------------
        rc, out, k = run(variant(tmp, "w"))
        need(rc == 0, f"witness exited {rc}")
        b = k.get("bed", {})
        Re, Sc, Dm = b.get("corr_Re"), b.get("corr_Sc_CO2"), b.get("corr_Dm_CO2")
        need(None not in (Re, Sc, Dm), "witness published no corr_Re/Sc/Dm")
        if None in (Re, Sc, Dm):
            return report()

        # (a) independent transcription
        want = {
            "corr_Dax_WakaoFunazkri": wakao_dax(Dm, Sc, Re, eps),
            "corr_Dax_EdwardsRichardson": edwards_dax(Dm, U, dp, eps),
            "corr_Dax_ChungWen": chung_dax(U, dp, Re, eps),
            "corr_Dax_Gunn": gunn_dax(U, dp, Re, Sc, eps),
        }
        for key, v in want.items():
            need(key in b and rel(b[key], v) < 1e-9,
                 f"(a) {key}: engine {b.get(key)} vs second transcription {v}")
        shW = wakao_sh(Re, Sc)
        shL = wilson_sh(Re, Sc, eps)
        need(rel(b.get("corr_Sh_CO2_WakaoFunazkri", 0), shW) < 1e-9,
             f"(a) Sh Wakao: {b.get('corr_Sh_CO2_WakaoFunazkri')} vs {shW}")
        need(rel(b.get("corr_Sh_CO2_WilsonGeankoplis", 0), shL) < 1e-9,
             f"(a) Sh Wilson: {b.get('corr_Sh_CO2_WilsonGeankoplis')} vs {shL}")
        kf = shW * Dm / dp
        need(rel(b.get("corr_kf_CO2_WakaoFunazkri", 0), kf) < 1e-9,
             "(a) kf Wakao")
        # the series: K at the feed from the Langmuir record the case carries
        cTot = P / (R_GAS * T)
        cIn = yCO2 * cTot
        pBar = yCO2 * P / 1e5
        q = 5.0 * 9.0 * pBar / (1.0 + 9.0 * pBar)
        rhoP = rhob / (1.0 - eps)
        K = epsP + rhoP * q / cIn
        Rp = 0.5 * dp
        tF = K * Rp / (3.0 * kf)
        tM = K * Rp ** 2 / (15.0 * epsP * (Dm / tauP))
        tm = 1.0 / (15.0 * dcr2)
        s = tF + tM + tm
        need(rel(b.get("corr_K_CO2", 0), K) < 1e-9, "(a) K at the feed")
        need(rel(b.get("corr_kLDF_series_CO2", 0), 1.0 / s) < 1e-9,
             f"(a) k series {b.get('corr_kLDF_series_CO2')} vs {1.0 / s}")
        for nm, t in (("film", tF), ("macropore", tM), ("micropore", tm)):
            need(rel(b.get(f"corr_kLDF_share_{nm}_CO2", 0), t / s) < 1e-9,
                 f"(a) share {nm}")

        # (b) the basis, by value
        DLedw = 0.73 * Dm + 0.5 * (U / eps) * dp / (1 + 9.7 * Dm / ((U / eps) * dp))
        need(rel(b["corr_Dax_EdwardsRichardson"], eps * DLedw) < 1e-9,
             "(b) Edwards Dax is not eps * D_L")
        need(abs(gunn_dax(U, dp, 1e8, 0.77, eps) / (U * dp) - 0.5) < 1e-4,
             "(b) Gunn's high-Re limit is not 0.5 u dp (the shared basis)")

        # (c) anchors
        tol = {"corr_anchor_dev_disp_WakaoFunazkri": 1e-6,
               "corr_anchor_dev_disp_EdwardsRichardson": 1e-2,
               "corr_anchor_dev_disp_ChungWen": 1e-2,
               "corr_anchor_dev_disp_Gunn": 1e-4,
               "corr_anchor_dev_film_WakaoFunazkri": 1e-6,
               "corr_anchor_dev_film_WilsonGeankoplis": 1e-2,
               "corr_anchor_dev_ldf": 1e-6}
        for key, t in tol.items():
            need(key in b and b[key] <= t,
                 f"(c) {key} = {b.get(key)} exceeds {t}")

        # (d) windows
        for m, inside in (("WakaoFunazkri", 1), ("EdwardsRichardson", 1),
                          ("Gunn", 1), ("ChungWen", 0)):
            need(b.get(f"corr_Dax_inWindow_{m}") == inside,
                 f"(d) Dax {m}: inWindow {b.get(f'corr_Dax_inWindow_{m}')}, "
                 f"expected {inside}")
        need(b.get("corr_kf_inWindow_CO2_WakaoFunazkri") == 1
             and b.get("corr_kf_inWindow_CO2_WilsonGeankoplis") == 0,
             "(d) film windows")
        for needle in ("a LIQUID correlation", "p. 864 eqs (15)-(16)",
                       "p. 119 eq (17)", "p. 1383 eq (12)", "p. 13 eqs (8)-(9)",
                       "Ruthven, D.M. (1984)", "Glueckauf, E. (1955)",
                       "Dax is stored on the BED basis"):
            need(needle in out, f"(d) the log does not print '{needle}'")

        # (e) declared wins; the front is batch13's
        need(b.get("corr_Dax_used") == daxDecl and
             b.get("corr_Dax_declared") == daxDecl,
             "(e) the declared Dax did not win")
        need(b.get("corr_kLDF_declared_CO2") == 0.05, "(e) declared k lost")
        g13 = {}
        for line in (B13 / "expected").read_text().splitlines():
            f = line.split()
            if len(f) >= 4 and f[0] == "kpi" and f[1] == "bed":
                g13[f[2]] = float(f[3])
        need(rel(b.get("t_breakthrough_5pct_CO2", 0),
                 g13["t_breakthrough_5pct_CO2"]) < 1e-9,
             "(e) the front moved against batch13's declared run: "
             f"{b.get('t_breakthrough_5pct_CO2')} vs "
             f"{g13['t_breakthrough_5pct_CO2']}")

        # (f) fills when chosen and the declaration is absent
        rc, out2, k2 = run(variant(tmp, "fill", [
            (r"\n[ \t]*Dax\s*\[[^\]]*\][^\n]*", ""),
            (r"kLDF\s*//[^\n]*\n\s*\{.*?\n            \}\n", "")]))
        b2 = k2.get("bed", {})
        need(rc == 0, f"(f) the filled variant exited {rc}")
        need(b2.get("corr_Dax_used") is not None and
             rel(b2.get("corr_Dax_used", 0), b["corr_Dax_EdwardsRichardson"]) < 1e-12,
             "(f) Dax_used is not the Edwards & Richardson estimate")
        need(b2.get("Pe") is not None and
             rel(b2.get("Pe", 0), 0.5 * U / b["corr_Dax_EdwardsRichardson"]) < 1e-9,
             "(f) Pe is not u L / Dax_estimate")
        need("is the EdwardsRichardson ESTIMATE" in out2,
             "(f) the run does not say the Dax is an ESTIMATE")
        need("the series ESTIMATE is used" in out2,
             "(f) the run does not say the k is the series ESTIMATE")
        need(abs(b2.get("t_50_CO2", 0) - b.get("t_50_CO2", 0)) > 1.0,
             "(f) the series k did not reach the integration (t_50 unmoved)")

        # (g) refusals by name
        probes = [
            ("nofilm", [(r"film\s*\{[^}]*\}", "")], "needs a film model"),
            ("noscope", [(r"scope\s+\"2 mm 13X beads, teaching bed batch30\";\s*source\s+\"ASSUMED[^\n]*\n", "")],
             "declare scope"),
            ("unknown", [(r"model EdwardsRichardson", "model Foo")],
             "EdwardsRichardson"),
        ]
        for tag, ed, needle in probes:
            rc, o, _ = run(variant(tmp, tag, ed))
            need(rc != 0 and needle in o,
                 f"(g) '{tag}': expected a refusal naming '{needle}' "
                 f"(exit {rc})")
        rc, o, _ = run(variant(tmp, "nodax", [
            (r"\n[ \t]*Dax\s*\[[^\]]*\][^\n]*", ""),
            (r"dispersion\s*\{[^}]*\}", "")]))
        need(rc != 0 and "Dax" in o,
             f"(g) no Dax and no dispersion model must still refuse (exit {rc})")
    return report()


def report():
    if failures:
        print("check_bed_correlations: FAIL")
        for f in failures:
            print("  " + f)
        return 1
    print("check_bed_correlations: OK -- the six correlations and the series "
          "equal an independent transcription to 1e-9, Edwards & Richardson's "
          "bed-basis Dax is eps D_L and Gunn's limit shares its basis, every "
          "anchor holds, the gas windows are inside and the two liquid "
          "correlations are flagged outside, a declared Dax and kLDF win "
          "(the front is batch13's to 1e-9), a missing Dax and k are filled "
          "by the chosen estimates and said so, and four misuses refuse by "
          "name.  NOT CHECKED: that any correlation predicts a real bed "
          "(no packed-bed dispersion data in the corpus), Gunn's basis "
          "reading (the paper says 'usual connotations'), a liquid bed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
