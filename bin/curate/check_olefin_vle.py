#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the engine's cubic equation of state against MEASURED relative volatility of the two olefin splitters.

    bin/curate/check_olefin_vle.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  A splitter's tray count goes as
1/ln(alpha), and alpha - 1 is 0.05 to 0.2 for propene/propane and 0.1 to 0.5 for
ethylene/ethane: a 2 % error in alpha is a 20 % error in the tower.  Every thermodynamic
defect that moves alpha by that little (a transposed digit in one record's acentric
factor, a Soave alpha function read for another, a kij silently applied, a mole
fraction paired with the wrong component) is invisible to the whole suite: the
case runs at exit 0, every balance closes, and a golden pins what the run prints.
Only a comparison with a measurement sees it, and until this gate no case compared
the engine's alpha for either splitter pair with one.

WHAT THIS GATE CHECKS.

  (A) tutorials/props/compare/olefins01_propane_propene_laurance1972.  SRK and PR78,
      kij = 0, against Laurance & Swift (1972) Table IV, 63 points (7 isotherms
      100-160 degF, x = 0.1 ... 0.9).  The alpha the engine implies is recomputed here
      from its y and x, alpha = (y1/x1)/(y2/x2), and compared point by point.
      THE BAND WAS DECLARED IN THE CASE'S README BEFORE THE FIRST RUN: |d alpha| <= 3 %
      each point, mean <= 1.5 %, bubble P <= 3 % each and 1.5 % mean.  The engine
      MEETS the pressure band and MISSES the alpha band (SRK mean 1.8 %, max 4.6 %, PR
      the same to 0.05); the gate says so by name and PINS the measured miss (a drift
      allowance only), so it fails if the distance CHANGES in either direction without
      the README being re-read -- the band is not widened after the run.  The miss has
      a signature, held too: alpha too LOW at the propane-rich end (x = 0.1) and too
      HIGH at the propene-rich end (x = 0.9), at every isotherm.

  (B) tutorials/props/compare/olefins02_ethane_ethylene_fredenslund1976.  The same two
      models against Fredenslund, Mollerup & Hall (1976) Table I, 14 SAMPLED points at
      263.15 and 293.15 K.  Declared band: |d alpha| <= max(5 %, the point's own
      uncertainty from the paper's +-0.003 on x and y), mean <= 4 %, bubble P <= 4 %
      each and 2 % mean, y mean absolute <= 0.010.  One point (x = 0.1446 at 263.15 K)
      lies 0.3 point outside the 5 % limit; it is held by name.

  (C) tutorials/steady/distillation/c3splitter01_propylene_propane.  The shortcut
      column's N_min, R_min and N are re-derived HERE (Fenske, Underwood, Molokanov-
      Gilliland, typed from the textbook) from the engine's own alpha and must agree
      to 0.5 %; the same arithmetic on Laurance & Swift's measured alpha at the
      engine's temperature (linear in T between their 110 and 120 degF blocks, x =
      0.7) gives the tower the measurement implies, and the engine's is pinned at its
      measured distance from it (-16.5 % in stages, -17.9 % in reflux).  The rigorous
      column at the shortcut's N and R must meet the illustrative specification
      within 0.2 point of purity.

  (D) THE TRANSCRIPTION.  Laurance's printed alpha agrees with the alpha recomputed
      from its own printed x and y to 0.0015 at every row except one printed slip
      (110 degF, x = 0.2, a y one digit off), which is named and bounded.

  (E) SABOTAGE.  The Laurance case copy is rerun with propylene's omega transposed
      (0.142 -> 0.124, a case-local overlay); (A)'s pins must then fail.

NOT CHECKED: any kij (none exists for these pairs and none was fitted); the vapour
pressures of the pure fluids separately (they enter through alpha at x -> 0, 1,
which the dataset does not list); the C2 or C3 column against a published plant
(no splitter specification is in the literature folder -- the steady case's
specification is declared illustrative).
"""
import csv
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

A_CASE = "tutorials/props/compare/olefins01_propane_propene_laurance1972"
B_CASE = "tutorials/props/compare/olefins02_ethane_ethylene_fredenslund1976"
C_CASE = "tutorials/steady/distillation/c3splitter01_propylene_propane"
STRIP = ("expected", "converged", "reports", "constant/propertyManifest")

TEMPS_F = (100, 110, 120, 130, 140, 150, 160)
B_TAGS = ("263p15", "293p15")

# ---- the bands DECLARED in the READMEs before the first run -----------------------------
A_BAND = {"alpha_each": 3.0, "alpha_mean": 1.5, "P_each": 3.0, "P_mean": 1.5}
B_BAND = {"alpha_each_min": 5.0, "alpha_mean": 4.0, "P_each": 4.0, "P_mean": 2.0, "y_mean": 0.010}
B_XY_UNCERT = 0.003      # Fredenslund et al. Table I footnote: x and y "accurate to within 0.003"

# ---- what the engine ACTUALLY does, measured; the gate pins it (drift allowances only) ----
A_PIN = {"srk": {"alpha_mean": 1.82, "alpha_max": 4.62, "P_max": 1.07, "P_mean": 0.40},
         "pr":  {"alpha_mean": 1.80, "alpha_max": 4.63, "P_max": 1.73, "P_mean": 0.76}}
A_DRIFT = {"alpha_mean": 0.04, "alpha_max": 0.15, "P_max": 0.15, "P_mean": 0.06}
B_PIN = {"srk": {"alpha_mean": 2.58, "n_outside": 1}, "pr": {"alpha_mean": 2.59, "n_outside": 1}}
B_DRIFT_MEAN = 0.05
C_PIN = {"N_vs_measured_pct": -16.5, "R_vs_measured_pct": -17.9, "drift": 1.0}


def num(s):
    return float(s)


def read_csv(path):
    with open(path) as f:
        return list(csv.DictReader(f))


def alpha_of(x, y):
    return (y / x) / ((1.0 - y) / (1.0 - x))


# ------------------------------------------------------------------------------------------
def run_props(case_dir, solve):
    rc, out = gatekit.run(solve, case_dir)
    return rc, out


def analyse_A(d):
    """-> {model: {alpha devs %, P devs %, y devs}} over the 63 points."""
    res = {}
    for m in ("srk", "pr"):
        ad, pd, yd, rows = [], [], [], []
        for F in TEMPS_F:
            ex = read_csv(d / f"exp_laurance1972_{F}F.csv")
            en = read_csv(d / f"pxy_{m}_{F}F.csv")
            for e, g in zip(ex, en):
                x = num(e["x[propylene]"])
                ye, ym = num(g["y_eqT_propylene"]), num(e["y_eqT_propylene"])
                am = num(e["alpha"])
                ad.append(100.0 * (alpha_of(x, ye) / am - 1.0))
                pd.append(100.0 * (num(g["P_bubble"]) / num(e["P_bubble"]) - 1.0))
                yd.append(ye - ym)
                rows.append((F, x))
        res[m] = {"alpha": ad, "P": pd, "y": yd, "rows": rows}
    return res


def analyse_B(d):
    res = {}
    for m in ("srk", "pr"):
        rows = []
        for T in B_TAGS:
            ex = read_csv(d / f"exp_fredenslund1976_{T}K.csv")
            en = read_csv(d / f"pxy_{m}_{T}K.csv")
            for e, g in zip(ex, en):
                x = num(e["x[ethylene]"])
                ym, ye = num(e["y_eqT_ethylene"]), num(g["y_eqT_ethylene"])
                am = alpha_of(x, ym)
                corners = [alpha_of(x + sx * B_XY_UNCERT, ym + sy * B_XY_UNCERT)
                           for sx in (-1, 1) for sy in (-1, 1)]
                u = 100.0 * max(abs(c - am) for c in corners) / am
                rows.append({"T": T, "x": x,
                             "alpha_dev": 100.0 * (alpha_of(x, ye) / am - 1.0),
                             "limit": max(B_BAND["alpha_each_min"], u),
                             "P_dev": 100.0 * (num(g["P_bubble"]) / num(e["P_bubble"]) - 1.0),
                             "y_dev": ye - ym})
        res[m] = rows
    return res


def fug(a, zlk, rlk, rhk, fac, q=1.0):
    """Fenske-Underwood-Molokanov-Gilliland, binary, constant alpha, typed from the textbook."""
    D_lk, D_hk = zlk * rlk, (1.0 - zlk) * rhk
    nmin = math.log((D_lk / D_hk) * ((1.0 - zlk) - D_hk) / (zlk - D_lk)) / math.log(a)
    D = D_lk + D_hk
    xD = D_lk / D
    lo, hi = 1.0 + 1e-9, a - 1e-9
    g = lambda t: a * zlk / (a - t) + (1.0 - zlk) / (1.0 - t) - (1.0 - q)  # noqa: E731
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if g(lo) * g(mid) < 0:
            hi = mid
        else:
            lo = mid
    th = 0.5 * (lo + hi)
    rmin = a * xD / (a - th) + (1.0 - xD) / (1.0 - th) - 1.0
    r = fac * rmin
    X = (r - rmin) / (r + 1.0)
    Y = 1.0 - math.exp((1.0 + 54.4 * X) / (11.0 + 117.2 * X) * (X - 1.0) / math.sqrt(X))
    return nmin, rmin, r, (Y + nmin) / (1.0 - Y)


def laurance_alpha_at(T_K, x):
    """Laurance & Swift Table IV alpha at (T, x), linear in T between the printed isotherms."""
    d = gatekit.base_case(A_CASE) / "constant/experiments"
    F = (T_K - 273.15) * 1.8 + 32.0
    lo = int(min(150, max(100, 10 * math.floor(F / 10.0))))
    pts = {}
    for G in (lo, lo + 10):
        txt = (d / f"propane-propene-laurance1972-{G}F.dat").read_text()
        body = txt.split("data\n(")[1].split(");")[0]
        for line in body.strip().splitlines():
            a = line.split()
            if abs(float(a[0]) - x) < 1e-9:
                pts[G] = float(a[3])
    return pts[lo] + (pts[lo + 10] - pts[lo]) * (F - lo) / 10.0


def result(out):
    import json
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def mean(v):
    return sum(v) / len(v)


def check_A(d, label, failures, numbers):
    r = analyse_A(d)
    for m in ("srk", "pr"):
        ad = [abs(v) for v in r[m]["alpha"]]
        pd = [abs(v) for v in r[m]["P"]]
        got = {"alpha_mean": mean(ad), "alpha_max": max(ad), "P_max": max(pd), "P_mean": mean(pd)}
        numbers[(label, m)] = got
        # the declared band on bubble pressure: MET
        if got["P_max"] > A_BAND["P_each"] or got["P_mean"] > A_BAND["P_mean"]:
            failures.append(f"{label} {m}: bubble P outside the declared band (max {got['P_max']:.2f} %, mean "
                            f"{got['P_mean']:.2f} %; declared {A_BAND['P_each']} / {A_BAND['P_mean']} %)")
        # the declared band on alpha: MISSED -- pinned, by name
        for k, tol in A_DRIFT.items():
            if abs(got[k] - A_PIN[m][k]) > tol:
                failures.append(f"{label} {m}: {k} = {got[k]:.3f} (pinned {A_PIN[m][k]} +- {tol}): the model, a record or "
                                "the dataset changed -- re-read the README's declared band and its table")
        if label == "shipped":
            if got["alpha_max"] <= A_BAND["alpha_each"] or got["alpha_mean"] <= A_BAND["alpha_mean"]:
                failures.append(f"{m}: the engine now MEETS the alpha band the README says it misses -- "
                                "update the README (a pin that stops being true is a claim gone stale)")
            # the signature: low at x = 0.1, high at x = 0.9, at every isotherm
            for F in TEMPS_F:
                idx = [i for i, (f, x) in enumerate(r[m]["rows"]) if f == F]
                lo_end, hi_end = r[m]["alpha"][idx[0]], r[m]["alpha"][idx[-1]]
                if not (lo_end < -1.5 and hi_end > 1.5):
                    failures.append(f"{m} at {F} degF: the miss no longer has its signature "
                                    f"(x = 0.1: {lo_end:+.2f} %, x = 0.9: {hi_end:+.2f} %; was about -2 to -5 / +2 to +4)")
    return r


def main():
    failures = []
    numbers = {}
    props = gatekit.binary("choupoProps")
    solve = gatekit.binary("choupoSolve")

    # ---- (D) the transcription of Laurance's table ------------------------------------
    d0 = gatekit.base_case(A_CASE) / "constant/experiments"
    worst, slip = 0.0, None
    for F in TEMPS_F:
        body = (d0 / f"propane-propene-laurance1972-{F}F.dat").read_text().split("data\n(")[1].split(");")[0]
        for line in body.strip().splitlines():
            x, P, y, a = (float(t) for t in line.split())
            dev = abs(alpha_of(x, y) - a)
            if (F, x) == (110, 0.2):
                slip = dev
            else:
                worst = max(worst, dev)
    if worst > 0.0015:
        failures.append(f"transcription: a printed alpha differs from (y/x)/((1-y)/(1-x)) by {worst:.4f} (limit 0.0015)")
    if slip is None or not (0.004 < slip < 0.009):
        failures.append(f"transcription: the known printed slip at 110 degF, x = 0.2 is {slip} (expected about 0.0066)")

    # ---- the declared band is WRITTEN in the READMEs (the band the pins above are measured against)
    for case, needles in ((A_CASE, ("DECLARED BEFORE THE FIRST RUN", "<= 3 %", "<= 1.5 %")),
                          (B_CASE, ("DECLARED BEFORE THE FIRST RUN", "max(5 %", "<= 4 %", "<= 2 %", "<= 0.010"))):
        txt = (gatekit.base_case(case) / "README.md").read_text()
        for n in needles:
            if n not in txt:
                failures.append(f"{case}/README.md no longer states the declared band ({n!r}): the gate's bands "
                                "and the README's are the same numbers or the claim is stale")

    # ---- (A) ---------------------------------------------------------------------------
    with gatekit.probe_copy(A_CASE, strip=STRIP) as c:
        rc, out = run_props(c, props)
        if rc != 0:
            return gatekit.verdict("check_olefin_vle", ["the Laurance case did not run (exit %d): " % rc
                                   + " | ".join(out.strip().splitlines()[-3:])], "")
        rA = check_A(c, "shipped", failures, numbers)

    # ---- (B) ---------------------------------------------------------------------------
    with gatekit.probe_copy(B_CASE, strip=STRIP) as c:
        rc, out = run_props(c, props)
        if rc != 0:
            return gatekit.verdict("check_olefin_vle", ["the Fredenslund case did not run (exit %d)" % rc], "")
        rB = analyse_B(c)
    outside_names = {}
    for m, rows in rB.items():
        am = mean([abs(r["alpha_dev"]) for r in rows])
        outside = [r for r in rows if abs(r["alpha_dev"]) > r["limit"]]
        outside_names[m] = [f"{r['T']} K x = {r['x']}" for r in outside]
        numbers[("fredenslund", m)] = {"alpha_mean": am, "n_outside": len(outside),
                                       "P_max": max(abs(r["P_dev"]) for r in rows),
                                       "P_mean": mean([abs(r["P_dev"]) for r in rows]),
                                       "y_mean": mean([abs(r["y_dev"]) for r in rows])}
        n = numbers[("fredenslund", m)]
        if n["P_max"] > B_BAND["P_each"] or n["P_mean"] > B_BAND["P_mean"]:
            failures.append(f"Fredenslund {m}: bubble P outside the declared band (max {n['P_max']:.2f} %, "
                            f"mean {n['P_mean']:.2f} %)")
        if n["y_mean"] > B_BAND["y_mean"]:
            failures.append(f"Fredenslund {m}: y mean |dev| {n['y_mean']:.4f} > the declared {B_BAND['y_mean']}")
        if am > B_BAND["alpha_mean"]:
            failures.append(f"Fredenslund {m}: alpha mean |dev| {am:.2f} % > the declared {B_BAND['alpha_mean']} %")
        if abs(am - B_PIN[m]["alpha_mean"]) > B_DRIFT_MEAN:
            failures.append(f"Fredenslund {m}: alpha mean {am:.2f} % moved from its pin {B_PIN[m]['alpha_mean']} %")
        if len(outside) != B_PIN[m]["n_outside"] or (outside and (outside[0]["T"], round(outside[0]["x"], 4)) != ("263p15", 0.1446)):
            failures.append(f"Fredenslund {m}: the points outside the per-point band changed: {outside_names[m]} "
                            "(held: 263.15 K x = 0.1446 only)")

    # ---- (C) the splitter ---------------------------------------------------------------
    with gatekit.probe_copy(C_CASE, strip=STRIP) as c:
        rc, out = gatekit.run(solve, c)
        if rc != 0:
            failures.append(f"the splitter case did not run (exit {rc}): " + " | ".join(out.strip().splitlines()[-2:]))
            js = None
        else:
            js = result(out)
    if js is not None:
        kp = js.get("kpis", {}).get("fug")
        if kp is None:
            failures.append("the splitter result carries no unit KPIs (fug)")
        else:
            a_eng = kp["alpha_LK_HK"]
            hand = fug(a_eng, 0.7, 0.99, 0.0116, 1.2)
            eng = (kp["N_min"], kp["R_min"], kp["R"], kp["N_theoretical"])
            for name, h, e in zip(("N_min", "R_min", "R", "N"), hand, eng):
                if abs(h / e - 1.0) > 0.005:
                    failures.append(f"shortcut {name}: engine {e:.3f} against the textbook arithmetic on its own alpha {h:.3f}")
            T_K = js["streams"]["distillate"]["T"]   # the shortcut's reference T: the feed's bubble point
            a_meas = laurance_alpha_at(T_K, 0.7)
            hm = fug(a_meas, 0.7, 0.99, 0.0116, 1.2)
            dN = 100.0 * (eng[3] / hm[3] - 1.0)
            dR = 100.0 * (eng[2] / hm[2] - 1.0)
            numbers["splitter"] = {"alpha_engine": a_eng, "alpha_measured": a_meas, "N_engine": eng[3], "N_measured": hm[3],
                                   "R_engine": eng[2], "R_measured": hm[2], "dN": dN, "dR": dR}
            for k, v in (("N_vs_measured_pct", dN), ("R_vs_measured_pct", dR)):
                if abs(v - C_PIN[k]) > C_PIN["drift"]:
                    failures.append(f"splitter: the engine's tower is {v:+.1f} % from the measured-alpha tower "
                                    f"({k}; pinned {C_PIN[k]:+.0f} +- {C_PIN['drift']})")
            st = js["streams"]
            xd = st["distillate2"]["composition"]["propylene"]
            xb = st["bottoms2"]["composition"]["propane"]
            if abs(xd - 0.995) > 0.002 or abs(xb - 0.9769) > 0.002:
                failures.append(f"splitter: the rigorous column at the shortcut's N and R gives {xd:.4f} propylene overhead "
                                f"and {xb:.4f} propane in the bottoms (illustrative spec 0.995 / 0.9769, tolerance 0.002)")

    # ---- (E) sabotage ---------------------------------------------------------------------
    with gatekit.probe_copy(A_CASE, strip=STRIP) as c:
        comp = c / "constant/components"
        comp.mkdir(parents=True, exist_ok=True)
        (comp / "propylene.dat").write_text(
            "name        propylene;\noverlayOf   propylene;\n"
            'variationReason "gate sabotage arm: a transposed digit in omega (0.142 -> 0.124)";\n'
            "omega       0.124;\n")
        rc, out = run_props(c, props)
        if rc != 0:
            failures.append(f"sabotage arm: the sabotaged case did not run (exit {rc})")
        else:
            fl = []
            check_A(c, "sabotaged", fl, numbers)
            if not fl:
                failures.append("sabotage arm: a transposed omega on propylene passed every pin -- "
                                "the gate cannot see a record-level defect of this size")

    if "--print" in sys.argv:
        for k, v in numbers.items():
            print(k, {a: round(b, 4) for a, b in v.items()})
    sA = numbers.get(("shipped", "srk"), {})
    sP = numbers.get(("shipped", "pr"), {})
    sp = numbers.get("splitter", {})
    return gatekit.verdict(
        "check_olefin_vle", failures,
        f"alpha of propene/propane vs Laurance & Swift (63 points): SRK mean {sA.get('alpha_mean', 0):.2f} % max "
        f"{sA.get('alpha_max', 0):.1f} %, PR {sP.get('alpha_mean', 0):.2f} % / {sP.get('alpha_max', 0):.1f} % -- OUTSIDE the declared 3 % / 1.5 % "
        f"band and pinned, bubble P inside it; ethylene/ethane vs Fredenslund (14 points) inside the declared band but for one point "
        f"({', '.join(outside_names.get('srk', []))}); the engine's C3 tower is "
        f"{sp.get('dN', 0):+.0f} % in stages and {sp.get('dR', 0):+.0f} % in reflux from the one the measured alpha implies; "
        "a transposed omega is seen",
    )


if __name__ == "__main__":
    sys.exit(main())
