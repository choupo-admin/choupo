#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the economic extensions of the PIF reports -- a building cost from the
GMP rooms, the two break-evens, a royalty inside a patent window, and the
working capital by three methods -- are READ BACK against the case's own
declarations.

    bin/curate/check_economic_extensions.py
    bin/curate/check_economic_extensions.py --keep DIR    run, keep the runs in DIR, check
    bin/curate/check_economic_extensions.py --reuse DIR   check the runs kept in DIR (no run)

WHY THIS EXISTS (2026-11-04, DEV.md 4c C195 items E4/E5).  Of eighteen
previous-year plant-design reports fourteen computed a break-even, all took the
working capital from whichever of three methods suited, the royalty was
charged after the patent had expired, and the building cost varied fivefold.
`economics { buildings {} breakEven {} royalty {} workingCapitalMethods {} }`
(src/postProcessing/EconomicsPass.cpp) are OPT-IN, ship no number, and a
number the run publishes that nobody recomputes is a number nobody checks.
Every arm below recomputes from the CASE'S DECLARATIONS (postDict, layoutDict)
and the published cash flow, never from the engine's source.

  (a) THE BUILDING.  Area = the sum of the layoutDict rooms' box areas, price
      = the room's grade price else the general price, both read from the
      dicts: `building_area_m2`, `building_C_BM` and `building_inFCI` equal
      them, and a TWIN run with the `buildings` block deleted has an FCI lower
      by exactly contingencyFee x C_BM (the facility sits in the FCI ladder at
      1.18 and adds nothing to the siteFactor base).
  (b) THE OPERATING BREAK-EVEN recomputes from the published economics KPIs
      and the declared depreciation life: x = F / (R(1-rS) - V(1+rC)), F =
      (0.180 FCI + 2.73 C_OL)(1+rC) + FCI/Ndepr, V = 1.23 (C_RM + C_UT); at x
      the year's sales equal the year's cost of production.
  (c) THE NPV BREAK-EVEN is a root of the real pipeline: a TWIN run with the
      stream factor scaled by the published fraction has |NPV| < 1 EUR, and
      the twins at +-0.5 % of it have opposite signs.  It differs from (b).
  (c2) THE PRICE BREAK-EVEN (2026-11-13), `breakEven { price ( <stream> ... ); }`:
      for a product and for a raw material, a TWIN run with that stream's
      price in constant/economics set to the published `breakEven_price_<stream>`
      has |NPV| < 1 EUR and the twins at +-0.5 % of it have the right signs
      (up is better for a product, worse for a raw material); the twin's
      revenue column in cashFlow.csv equals the base revenue x (price found /
      declared price) year by year -- recomputed from the published cash flow,
      never from the engine's source.  The refusals fire by name: a stream the
      appraisal neither sells nor buys, a stream named twice, a key the block
      does not read.
  (d) THE ROYALTY.  cashFlow.csv carries a royalty column equal to
      rate x revenue in operating years 1..expiry and ZERO after, the taxable
      income of every year is revenue - operatingCost - royalty -
      depreciation, `royalty_total` is their sum.  The costOfManufacture basis
      is the same on the operatingCost column.
  (e) THE THREE WORKING CAPITALS: fractionOfSales x R, fractionOfFixedCapital
      x FCI, the used one is the appraisal's WC, the spread is max - min; a
      block with one fraction prints the other as NOT computed and publishes
      no spread.
  (f) THE REFUSALS fire through the real reader, each required to exit
      non-zero and NAME its defect: a building price without a building, a
      building with no source, a room grade without a price, a royalty with
      no expiry, with a fractional expiry, an unknown basis, a working-capital
      block with no fraction, a royalty sensitivity without a royalty.
  (g) ABSENCE IS SILENCE: the twin with all four blocks deleted publishes none
      of the extension KPIs, writes no royalty column and no extension line.
  (h) PUBLISHED => PINNED: the witness's expected file carries a row for every
      extension KPI the run publishes.
  (i) TAX ON A LOSS (2026-11-09, DEV.md 4c C269 decision (2)), on a twin whose
      product price is cut until every operating year is a loss.  Under the
      default (`taxOnLoss credit`, or no key) each loss year's tax is
      NEGATIVE, tau x its taxable income, the run ANNOUNCES the assumption
      (the loss set against the owner's other profit) with the credit's total,
      and `taxCreditOnLoss` equals minus the sum of the negative taxes.  Under
      `taxOnLoss none;` the taxable income of every year is the same, the tax
      of a loss year is ZERO, each year's cash flow is lower by exactly the
      credit it no longer earns, the NPV is lower by the credit twin's
      `taxCreditOnLoss_NPV`, and the stand-alone reading is announced.  Any
      other word refuses by name; the witness itself (no loss year) publishes
      no loss KPI.

  (j) THE OPERATORS' COVER (2026-11-13, review row PH-01): a declared crew is
      multiplied by 4.5 positions per operator-per-shift unless the case
      declares `operatorCover { positionsPerShift <n>; source; reason; }`.
      On the witness with a crew added: the default prices 4.5 x the crew
      and publishes no cover KPI; the declared cover of 2.0 prices 2.0 x the
      crew, publishes `operatorCover_positionsPerShift`, and C_OL is lower in
      exactly the ratio 2.0 / 4.5; a cover below 1, a cover with no source
      and an unknown key refuse by name.  On a batch plant whose trains run
      3840 h (donepezil01_tablets) the default is ANNOUNCED once, class
      `assumed`, naming the 4.5 and the hours, and declaring the cover
      silences it and scales C_OL the same way.

NOT CHECKED, said plainly: that the classification of the cost into fixed and
variable is the right one (it is a modelling choice, printed); that a price per
m2 is realistic (the case's); and the royalty/break-even interaction beyond the
sales and costOfManufacture bases.  Exit 0 = OK; 1 = a failure, listed."""
import argparse
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
WIT = ROOT / "tutorials/steady/economics/economics04_building_royalty_breakeven"
fails = []


def fail(m):
    fails.append(m)


# ------------------------------------------------------------- dict reading --
def block(text, word):
    """The text inside `word { ... }` (first occurrence, brace-matched)."""
    ms = list(re.finditer(r"(?<![`\w])" + re.escape(word) + r"\s*\{(?!\})", text))
    if not ms:
        return None
    m = ms[-1]
    i = m.end()
    d = 1
    while d:
        d += {"{": 1, "}": -1}.get(text[i], 0)
        i += 1
    return text[m.end():i - 1]


def val(text, key):
    m = re.search(r"\b" + re.escape(key) + r"\s+(-?[0-9.eE+-]+)\s*;", text)
    return float(m.group(1)) if m else None


def word(text, key):
    m = re.search(r"\b" + re.escape(key) + r"\s+(\w+)\s*;", text)
    return m.group(1) if m else None


def rooms(layout_text):
    out = []
    for m in re.finditer(
            r"\{\s*room\s+(\w+);\s*floor\s+(\w+);\s*xMin\s+(-?[\d.]+)\s*m;\s*xMax\s+(-?[\d.]+)\s*m;"
            r"\s*yMin\s+(-?[\d.]+)\s*m;\s*yMax\s+(-?[\d.]+)\s*m;\s*grade\s+(\w+);", layout_text):
        n, f, x0, x1, y0, y1, g = m.groups()
        out.append((n, g, (float(x1) - float(x0)) * (float(y1) - float(y0))))
    return out


def decl(d):
    post = (d / "system/postDict").read_text()
    eco = block(post, "economics")
    return post, eco


# ---------------------------------------------------------------- running ----
def prepare(work, name, edit=None, layout_edit=None, econ_edit=None):
    d = work / name
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(WIT, d, ignore=shutil.ignore_patterns("reports", "converged", "design", "iterations"))
    if edit:
        p = d / "system/postDict"
        p.write_text(edit(p.read_text()))
    if layout_edit:
        p = d / "system/layoutDict"
        p.write_text(layout_edit(p.read_text()))
    if econ_edit:
        p = d / "constant/economics"
        p.write_text(econ_edit(p.read_text()))
    return d


def run(d):
    p = subprocess.run([str(BIN), str(d)], capture_output=True, text=True, cwd=str(ROOT), timeout=900)
    out = p.stdout + p.stderr
    (d.parent / (d.name + ".out")).write_text(out + f"\n__rc={p.returncode}\n")
    return out, p.returncode


def _run_batch(d):
    """Run a case with the binary its controlDict names (choupoBatch for the batch plants)."""
    app = re.search(r"application\s+(\w+);", (d / "system/controlDict").read_text())
    exe = ROOT / (app.group(1) if app else "choupoSolve")
    p = subprocess.run([str(exe), str(d)], capture_output=True, text=True, cwd=str(ROOT), timeout=1800)
    out = p.stdout + p.stderr
    (d.parent / (d.name + ".out")).write_text(out + f"\n__rc={p.returncode}\n")
    return out, p.returncode


def stored(d):
    t = (d.parent / (d.name + ".out")).read_text()
    m = re.search(r"\n__rc=(-?\d+)\n$", t)
    return t[:m.start()], int(m.group(1))


def kpis(out):
    m = re.search(r'"economics": \{([^{}]*)\}', out)
    kv = {}
    if m:
        for k, v in re.findall(r'"(\w+)":\s*(-?[0-9][0-9.eE+-]*|null)', m.group(1)):
            kv[k] = float("nan") if v == "null" else float(v)
    return kv


def cashflow(d):
    rows, foot, header = [], {}, None
    for l in (d / "reports/economics/cashFlow.csv").read_text().splitlines():
        if not l or l.startswith("#"):
            continue
        if l.startswith("year,"):
            header = l.split(",")
            continue
        f = l.split(",")
        if header and re.fullmatch(r"-?\d+", f[0]) and len(f) == len(header):
            rows.append({h: float(v) for h, v in zip(header, f)})
        else:
            foot[f[0]] = f[1:]
    return rows, foot, header


def close(a, b, tol=1.0, rel=1e-9):
    return abs(a - b) <= max(tol, rel * max(abs(a), abs(b)))


def drop_block(post, word_):
    """The economics sub-block `word_ { ... }` (and a bare `word_ {}` ) removed."""
    m = re.search(r"\n[ \t]*" + re.escape(word_) + r"\s*\{", post)
    if not m:
        return post
    i = m.end()
    d = 1
    while d:
        d += {"{": 1, "}": -1}.get(post[i], 0)
        i += 1
    return post[:m.start()] + post[i:]


# ------------------------------------------------------------------- arms ----
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep")
    ap.add_argument("--reuse")
    a = ap.parse_args()
    if not BIN.exists():
        print("check_economic_extensions: FAIL -- no choupoSolve build; run `make all`")
        return 1
    if a.reuse:
        work = Path(a.reuse)
        reuse = True
    else:
        work = Path(a.keep) if a.keep else Path(tempfile.mkdtemp(prefix="econext."))
        work.mkdir(parents=True, exist_ok=True)
        reuse = False
    go = (lambda d: stored(d)) if reuse else run

    base = prepare(work, "base") if not reuse else work / "base"
    out, rc = go(base)
    if rc != 0:
        print(f"check_economic_extensions: FAIL -- the witness did not run (rc {rc})\n{out[-1500:]}")
        return 1
    K = kpis(out)
    post, eco = decl(base)
    layout = (base / "system/layoutDict").read_text()
    bl = block(eco, "buildings")
    ry = block(eco, "royalty")
    wm = block(eco, "workingCapitalMethods")
    cf, foot, header = cashflow(base)
    fci = K["FCI"]
    cont = val(eco, "contingencyFee")
    ndepr = val(eco, "depreciableLife")

    # (a) the building ------------------------------------------------------
    gp = block(bl, "gradePrice") or ""
    price_general = val(bl, "price")
    area = cost = 0.0
    for n, g, ar in rooms(layout):
        p = val(gp, g) if val(gp, g) is not None else price_general
        area += ar
        cost += ar * p
    if len(rooms(layout)) != 17:
        fail(f"(a) parsed {len(rooms(layout))} rooms from the layoutDict, expected 17")
    for k, v in (("building_area_m2", area), ("building_C_BM", cost), ("building_inFCI", cont * cost)):
        if k not in K or not close(K[k], v):
            fail(f"(a) {k}: published {K.get(k)} vs recomputed from the dicts {v}")
    twin = prepare(work, "noBuilding", lambda s: drop_block(s, "buildings")) if not reuse else work / "noBuilding"
    o2, r2 = go(twin)
    K2 = kpis(o2)
    if r2 != 0 or "building_C_BM" in K2:
        fail("(a) the twin without `buildings` did not run clean or still publishes a building")
    elif not close(fci - K2["FCI"], cont * cost):
        fail(f"(a) FCI with the building minus FCI without = {fci - K2['FCI']}, expected contingencyFee x C_BM = {cont * cost}")

    # (b) the operating break-even -------------------------------------------
    rate = val(ry, "rate")
    basis = word(ry, "basis")
    expiry = int(val(ry, "expiry"))
    rS = rate if basis == "sales" else 0.0
    rC = rate if basis == "costOfManufacture" else 0.0
    F = (0.180 * fci + 2.73 * K["C_OL"]) * (1 + rC) + fci / ndepr
    V = 1.23 * (K["C_RM"] + K["C_UT"]) * (1 + rC)
    Rn = K["revenue"] * (1 - rS)
    x = F / (Rn - V)
    if not close(K["breakEven_operating_fraction"], x, tol=1e-9, rel=1e-9):
        fail(f"(b) operating break-even published {K['breakEven_operating_fraction']} vs recomputed {x}")
    for k, v in (("breakEven_operating_fixed", F), ("breakEven_operating_variable", V), ("breakEven_operating_sales", Rn)):
        if not close(K[k], v):
            fail(f"(b) {k}: published {K[k]} vs recomputed {v}")
    if not close(x * Rn, F + V * x):
        fail("(b) at the break-even the sales do not equal the cost of production")

    # (c) the NPV break-even --------------------------------------------------
    s = K["breakEven_npv_fraction"]
    sf = val(eco, "streamFactor")

    def npv_at(name, scale):
        def e(p):
            return re.sub(r"streamFactor\s+[0-9.]+;", f"streamFactor {sf * scale:.12f};", p)
        d = prepare(work, name, e) if not reuse else work / name
        o, r = go(d)
        return kpis(o).get("NPV", float("nan"))
    n0 = npv_at("npvRoot", s)
    nlo = npv_at("npvLo", s * 0.995)
    nhi = npv_at("npvHi", s * 1.005)
    if not abs(n0) < 1.0:
        fail(f"(c) NPV at the published break-even fraction {s} is {n0}, not 0")
    if not (nlo < 0.0 < nhi):
        fail(f"(c) NPV is not a sign change across the break-even: {nlo} .. {nhi}")
    if close(s, K["breakEven_operating_fraction"], tol=1e-3, rel=0):
        fail("(c) the NPV and the operating break-even coincide, which they cannot (capital charge, tax, WC)")

    # (c2) the price break-even ---------------------------------------------------
    p_star = K.get("breakEven_price_powder")
    if p_star is None or not (p_star > 0.0):
        fail(f"(c2) breakEven_price_powder not published or not positive: {p_star}")
    else:
        p_decl = 20.0

        def with_price(pat, new_price):
            return lambda t: re.sub(pat, lambda m: m.group(1) + f"{new_price:.12f};", t, count=1)
        prod_pat = r"(price\s+)20\.0;"

        def npv_price(name, new_price):
            d = prepare(work, name, econ_edit=with_price(prod_pat, new_price)) if not reuse else work / name
            o, r = go(d)
            return kpis(o).get("NPV", float("nan")), d
        n0, d0 = npv_price("priceRoot", p_star)
        nlo, _ = npv_price("priceLo", p_star * 0.995)
        nhi, _ = npv_price("priceHi", p_star * 1.005)
        if not abs(n0) < 1.0:
            fail(f"(c2) NPV with the product at the published break-even price {p_star} is {n0}, not 0")
        if not (nlo < 0.0 < nhi):
            fail(f"(c2) NPV is not a sign change (up = better) across the product's break-even price: {nlo} .. {nhi}")
        cf0, _, _ = cashflow(d0)
        for rb, rt in zip(cf, cf0):
            if not close(rt["revenue_EUR"], rb["revenue_EUR"] * p_star / p_decl, tol=2.0):
                fail(f"(c2) year {int(rb['year'])}: revenue at the break-even price {rt['revenue_EUR']} vs base x ratio {rb['revenue_EUR'] * p_star / p_decl}")
        # a raw material, on a twin that declares it too
        two = prepare(work, "priceTwo", lambda t: t.replace("price ( powder );", "price ( powder feed );")) if not reuse else work / "priceTwo"
        o2p, r2p = go(two)
        K2p = kpis(o2p)
        f_star = K2p.get("breakEven_price_feed")
        if r2p != 0 or f_star is None or not close(K2p.get("breakEven_price_powder", float("nan")), p_star, tol=1e-6):
            fail(f"(c2) the twin naming powder and feed did not run clean or moved the powder's price (rc {r2p})")
        else:
            def feed_edit(price):
                return lambda t: re.sub(r"(price\s+)1\.50;", lambda m: m.group(1) + f"{price:.12f};", t, count=1)
            res = []
            for nm, f_ in (("feedRoot", f_star), ("feedLo", f_star * 0.995), ("feedHi", f_star * 1.005)):
                d = prepare(work, nm, econ_edit=feed_edit(f_)) if not reuse else work / nm
                o, r = go(d)
                res.append(kpis(o).get("NPV", float("nan")))
            if not abs(res[0]) < 1.0:
                fail(f"(c2) NPV with the feed at its break-even price {f_star} is {res[0]}, not 0")
            if not (res[1] > 0.0 > res[2]):
                fail(f"(c2) NPV is not a sign change (up = worse) across the feed's break-even price: {res[1]} .. {res[2]}")
            if "(3) PRICE of powder" not in o2p or "minimum selling price" not in o2p or "highest purchase price" not in o2p:
                fail("(c2) the printed block does not carry the (3) PRICE line in words for both roles")
        for nm, pe, needle in (
                ("priceUnknown", lambda t: t.replace("price ( powder );", "price ( noSuchStream );"), "neither sells nor buys"),
                ("priceTwice", lambda t: t.replace("price ( powder );", "price ( powder powder );"), "named twice"),
                ("priceBadKey", lambda t: t.replace("price ( powder );", "price ( powder );\n        threshold 1;"), "only key of the block")):
            d = prepare(work, nm, pe) if not reuse else work / nm
            o, r = go(d)
            if r == 0:
                fail(f"(c2) {nm}: expected a refusal, the run exited 0")
            elif needle not in o:
                fail(f"(c2) {nm}: refused but the message does not name `{needle}`")

    # (d) the royalty ---------------------------------------------------------
    if "royalty_EUR" not in header:
        fail("(d) cashFlow.csv carries no royalty column")
    else:
        tot = 0.0
        for r in cf:
            t = int(r["year"])
            if t < 1:
                continue
            exp = rate * r["revenue_EUR"] if t <= expiry else 0.0
            if not close(r["royalty_EUR"], exp, tol=1.0):
                fail(f"(d) year {t}: royalty {r['royalty_EUR']} vs {exp}")
            tax_inc = r["revenue_EUR"] - r["operatingCost_EUR"] - r["royalty_EUR"] - r["depreciation_EUR"]
            if not close(r["taxableIncome_EUR"], tax_inc, tol=2.0):
                fail(f"(d) year {t}: taxable income {r['taxableIncome_EUR']} vs {tax_inc}")
            tot += r["royalty_EUR"]
        if not close(K["royalty_total"], tot, tol=6.0):
            fail(f"(d) royalty_total {K['royalty_total']} vs the column's sum {tot}")
        if K["royalty_years"] != expiry:
            fail(f"(d) royalty_years {K['royalty_years']} vs declared expiry {expiry}")
    twc = prepare(work, "royaltyCost", lambda p: p.replace("basis       sales;", "basis       costOfManufacture;")) if not reuse else work / "royaltyCost"
    oc, rcx = go(twc)
    cfc, _, _ = cashflow(twc)
    for r in cfc:
        t = int(r["year"])
        if t < 1:
            continue
        exp = rate * r["operatingCost_EUR"] if t <= expiry else 0.0
        if not close(r["royalty_EUR"], exp, tol=1.0):
            fail(f"(d) costOfManufacture basis, year {t}: royalty {r['royalty_EUR']} vs {exp}")

    # (e) the working capital by three methods -------------------------------
    fs, ff = val(wm, "fractionOfSales"), val(wm, "fractionOfFixedCapital")
    ms, mf = fs * K["revenue"], ff * fci
    # the three here are: sales, fixed capital, and the itemised build-up (absent); the used one is the
    # appraisal's fraction-of-FCI WC, which is not one of the compared ones when no build-up is declared
    for k, v in (("WCm_sales", ms), ("WCm_fixedCapital", mf), ("WCm_spread", abs(ms - mf)), ("WCm_used", K["WC"])):
        if k not in K or not close(K[k], v):
            fail(f"(e) {k}: published {K.get(k)} vs recomputed {v}")
    if "itemised build-up            : NOT computed" not in out:
        fail("(e) the missing itemised method is not named as NOT computed")
    one = prepare(work, "oneFraction", lambda p: re.sub(r"\n\s*fractionOfFixedCapital\s+[0-9.]+;", "", p)) if not reuse else work / "oneFraction"
    o1, r1 = go(one)
    K1 = kpis(o1)
    if r1 != 0 or "WCm_spread" in K1 or "% of fixed capital           : NOT computed" not in o1:
        fail("(e) one declared fraction must name the other as NOT computed and publish no spread")

    # (f) the refusals --------------------------------------------------------
    refusals = {
        "noBuildingDeclared": (lambda p: p, "UNLINK",
                               "no `building {}`"),
        "buildingNoSource": (lambda p: p.replace('source      "author-set teaching assumption (round numbers); replace with a quote or a local construction-cost index";', ""), None,
                             "`source"),
        "gradeNoPrice": (lambda p: p.replace("price       1800;", ""), None, "neither a `gradePrice"),
        "royaltyNoExpiry": (lambda p: p.replace("expiry      6;", ""), None, "expiry"),
        "royaltyFractionalExpiry": (lambda p: p.replace("expiry      6;", "expiry 6.5;"), None, "whole operating year"),
        "royaltyBadBasis": (lambda p: p.replace("basis       sales;", "basis profit;"), None, "royalty basis"),
        "wcmNoFraction": (lambda p: re.sub(r"\n\s*fractionOf\w+\s+[0-9.]+;", "", p), None, "declares no fraction"),
        "sensNoRoyalty": (lambda p: drop_block(p, "royalty").replace("    breakEven\n", "    sensitivity { royalty.rate { relative ( -0.2 0.2 ); } }\n    breakEven\n"), None, "royalty.rate"),
    }
    for name, (pe, le, needle) in refusals.items():
        d = prepare(work, name, pe, None if le == "UNLINK" else le) if not reuse else work / name
        if le == "UNLINK" and not reuse:
            (d / "system/layoutDict").unlink()
        o, r = go(d)
        if r == 0:
            fail(f"(f) {name}: expected a refusal, the run exited 0")
        elif needle not in o:
            fail(f"(f) {name}: refused but the message does not name `{needle}`")

    # (g) absence is silence ---------------------------------------------------
    def strip(p):
        for w in ("buildings", "breakEven", "royalty", "workingCapitalMethods"):
            p = drop_block(p, w)
        return p
    ab = prepare(work, "absent", strip) if not reuse else work / "absent"
    oa, ra = go(ab)
    Ka = kpis(oa)
    bad = [k for k in Ka if k.startswith(("building_", "breakEven_", "royalty_", "WCm_"))]
    _, fa, ha = cashflow(ab) if ra == 0 else ([], {}, [])
    if ra != 0 or bad or any("royalty" in h for h in ha) or any(k.startswith(("building", "royalty", "breakEven", "WCm")) for k in fa):
        fail(f"(g) the twin without the four blocks is not silent: rc {ra}, {bad}")
    if ra == 0 and not close(Ka["FCI"], K2["FCI"]):
        fail("(g) FCI without any extension differs from the twin without the building")

    # (h) published => pinned ---------------------------------------------------
    exp = (WIT / "expected").read_text()
    for k in K:
        if k.startswith(("building_", "breakEven_", "royalty_", "WCm_")) and not re.search(r"\b" + k + r"\b", exp):
            fail(f"(h) `economics.{k}` is published and no row of the witness's expected file pins it")

    # (i) tax on a loss: both readings on a priced-down twin ---------------------
    for k in ("lossYears", "taxCreditOnLoss", "taxCreditOnLoss_NPV"):
        if k in K:
            fail(f"(i) the witness has no loss year and still publishes `economics.{k}`")
    tau = val(eco, "taxRate")
    i_rate = val(eco, "discountRate")

    def cut_price(t):
        # the product's `price 20.0;` -> 0.6 x: every operating year a loss
        return re.sub(r"(price\s+)20\.0;", r"\g<1>12.0;", t, count=1)
    cr = prepare(work, "lossCredit", econ_edit=cut_price) if not reuse else work / "lossCredit"
    ocr, rcr = go(cr)
    Kc = kpis(ocr)
    cfc_, _, hc = cashflow(cr) if rcr == 0 else ([], {}, [])
    if rcr != 0 or "tax_EUR" not in hc:
        fail(f"(i) the priced-down twin did not run clean (rc {rcr})")
    else:
        op = [r for r in cfc_ if int(r["year"]) >= 1]
        losses = [r for r in op if r["taxableIncome_EUR"] < 0.0]
        if len(losses) != len(op):
            fail(f"(i) the twin was meant to lose money every year; {len(losses)} of {len(op)} are losses")
        credit = 0.0
        credit_disc = 0.0
        for r in losses:
            if not close(r["tax_EUR"], tau * r["taxableIncome_EUR"], tol=2.0):
                fail(f"(i) credit, year {int(r['year'])}: tax {r['tax_EUR']} is not tau x the loss {tau * r['taxableIncome_EUR']}")
            credit += -r["tax_EUR"]
            credit_disc += -r["tax_EUR"] / (1.0 + i_rate) ** int(r["year"])
        if Kc.get("lossYears") != len(losses):
            fail(f"(i) credit: lossYears {Kc.get('lossYears')} vs {len(losses)} loss years in the table")
        if "taxCreditOnLoss" not in Kc or not close(Kc["taxCreditOnLoss"], credit, tol=len(losses) * 2.0):
            fail(f"(i) credit: taxCreditOnLoss {Kc.get('taxCreditOnLoss')} vs minus the summed negative taxes {credit}")
        if "taxCreditOnLoss_NPV" not in Kc or not close(Kc["taxCreditOnLoss_NPV"], credit_disc, tol=len(losses) * 2.0):
            fail(f"(i) credit: taxCreditOnLoss_NPV {Kc.get('taxCreditOnLoss_NPV')} vs the credits discounted {credit_disc}")
        if "are credited tax" not in ocr or "OTHER taxable profit" not in ocr:
            fail("(i) credit: the loss years are not announced with the assumption (other taxable profit)")

        def no_credit(p):
            return p.replace("taxRate             0.21;", "taxRate             0.21;\n    taxOnLoss           none;", 1)
        nc = prepare(work, "lossNone", no_credit, econ_edit=cut_price) if not reuse else work / "lossNone"
        onc, rnc = go(nc)
        Kn = kpis(onc)
        cfn, _, _ = cashflow(nc) if rnc == 0 else ([], {}, [])
        if rnc != 0 or len(cfn) != len(cfc_):
            fail(f"(i) the `taxOnLoss none` twin did not run clean (rc {rnc})")
        else:
            for rc_, rn_ in zip(cfc_, cfn):
                t = int(rc_["year"])
                if not close(rn_["taxableIncome_EUR"], rc_["taxableIncome_EUR"], tol=1.0):
                    fail(f"(i) none, year {t}: the taxable income moved ({rn_['taxableIncome_EUR']} vs {rc_['taxableIncome_EUR']})")
                if t >= 1 and rc_["taxableIncome_EUR"] < 0.0:
                    if rn_["tax_EUR"] != 0.0:
                        fail(f"(i) none, year {t}: a loss year is taxed {rn_['tax_EUR']}")
                    if not close(rn_["cashFlow_EUR"], rc_["cashFlow_EUR"] + rc_["tax_EUR"], tol=2.0):
                        fail(f"(i) none, year {t}: cash flow {rn_['cashFlow_EUR']} is not the credit reading's {rc_['cashFlow_EUR']} less its credit {-rc_['tax_EUR']}")
                elif not close(rn_["cashFlow_EUR"], rc_["cashFlow_EUR"], tol=1.0):
                    fail(f"(i) none, year {t}: a year with no loss moved ({rn_['cashFlow_EUR']} vs {rc_['cashFlow_EUR']})")
            if not close(Kn["NPV"], Kc["NPV"] - Kc.get("taxCreditOnLoss_NPV", float("nan")), tol=5.0):
                fail(f"(i) none: NPV {Kn['NPV']} is not the credit reading's {Kc['NPV']} less the discounted credit {Kc.get('taxCreditOnLoss_NPV')}")
            if Kn.get("taxCreditOnLoss") != 0.0 or Kn.get("lossYears") != Kc.get("lossYears"):
                fail(f"(i) none: taxCreditOnLoss {Kn.get('taxCreditOnLoss')} / lossYears {Kn.get('lossYears')} (expected 0 / {Kc.get('lossYears')})")
            if "pay no tax" not in onc:
                fail("(i) none: the stand-alone reading is not announced")
        bad = prepare(work, "lossBadWord", lambda p: no_credit(p).replace("taxOnLoss           none;", "taxOnLoss carryForward;"), econ_edit=cut_price) if not reuse else work / "lossBadWord"
        ob, rb = go(bad)
        if rb == 0 or "taxOnLoss" not in ob:
            fail("(i) `taxOnLoss carryForward;` did not refuse by name")

    # (j) the operators' cover ---------------------------------------------------
    crew = ('    operatingCrew\n    {\n        areas ( { area "plant"; operatorsPerShift 2; } );\n'
            '        source "gate twin"; reason "gate twin";\n    }\n')
    cover = '    operatorCover { positionsPerShift 2.0; source "gate twin"; reason "gate twin"; }\n'

    def with_blocks(*blocks):
        return lambda t: t.replace("    refuseOnMissingPrice 1;\n", "    refuseOnMissingPrice 1;\n" + "".join(blocks), 1)
    cdef = prepare(work, "coverDefault", with_blocks(crew)) if not reuse else work / "coverDefault"
    odef, rdef = go(cdef)
    Kdef = kpis(odef)
    cdec = prepare(work, "coverDeclared", with_blocks(crew, cover)) if not reuse else work / "coverDeclared"
    odec, rdec = go(cdec)
    Kdec = kpis(odec)
    if rdef != 0 or rdec != 0 or "operatingPositions" not in Kdef or "operatingPositions" not in Kdec:
        fail(f"(j) the crew twins did not run clean (rc {rdef}, {rdec})")
    else:
        if not close(Kdef["operatingPositions"], 9.0, tol=1e-9) or "operatorCover_positionsPerShift" in Kdef:
            fail(f"(j) default cover: positions {Kdef['operatingPositions']} (expected 4.5 x 2 = 9) or a cover KPI published")
        if not close(Kdec["operatingPositions"], 4.0, tol=1e-9) or Kdec.get("operatorCover_positionsPerShift") != 2.0:
            fail(f"(j) declared cover 2.0: positions {Kdec['operatingPositions']} (expected 4) / KPI {Kdec.get('operatorCover_positionsPerShift')}")
        if not close(Kdec["C_OL"] * 4.5, Kdef["C_OL"] * 2.0, tol=1.0):
            fail(f"(j) C_OL {Kdec['C_OL']} vs default {Kdef['C_OL']} is not in the ratio 2.0 / 4.5")
        if "[assumed] economics: the declared operating crew" in odef:
            fail("(j) the announcement fired with no batch plan (no calendar is declared)")
    for nm, blocks, needle in (
            ("coverBelowOne", (crew, cover.replace("2.0", "0.5")), "at least one person"),
            ("coverNoSource", (crew, cover.replace('source "gate twin"; ', "")), "`source"),
            ("coverUnknownKey", (crew, cover.replace("positionsPerShift 2.0;", "positionsPerShift 2.0; hours 5;")), "unknown key")):
        d = prepare(work, nm, with_blocks(*blocks)) if not reuse else work / nm
        o, r = go(d)
        if r == 0:
            fail(f"(j) {nm}: expected a refusal, the run exited 0")
        elif needle not in o:
            fail(f"(j) {nm}: refused but the message does not name `{needle}`")
    # the announcement, on a batch plant whose trains run 3840 h
    don = ROOT / "tutorials/batch/plant/donepezil01_tablets"
    if don.exists():
        def don_case(name, edit):
            d = work / name
            if d.exists():
                shutil.rmtree(d)
            shutil.copytree(don, d, ignore=shutil.ignore_patterns("reports", "converged", "design", "iterations"))
            if edit:
                pp = d / "system/postDict"
                pp.write_text(edit(pp.read_text()))
            return d
        dd = don_case("donBase", None) if not reuse else work / "donBase"
        # donepezil01 is a choupoBatch case: the runner is the case's own binary
        odd, rdd = _run_batch(dd) if not reuse else stored(dd)
        Kdd = kpis(odd)
        msgs = [l for l in odd.splitlines() if "[assumed] economics: the declared operating crew" in l]
        if rdd != 0 or len(msgs) != 1 or "4.5 positions" not in msgs[0] or "3840 h/yr" not in msgs[0]:
            fail(f"(j) donepezil01: expected ONE `assumed` line naming 4.5 and 3840 h/yr (rc {rdd}, {len(msgs)} line(s): {msgs[:1]})")
        elif "operatorCover" not in msgs[0]:
            fail("(j) donepezil01: the announcement does not name the remedy `operatorCover`")
        dc = don_case("donCover", lambda t: t.replace("    operatingCrew\n", cover + "    operatingCrew\n", 1)) if not reuse else work / "donCover"
        odc, rdc = (_run_batch(dc) if not reuse else stored(dc))
        Kdc = kpis(odc)
        if rdc != 0 or "[assumed] economics: the declared operating crew" in odc:
            fail(f"(j) donepezil01 with the cover declared: rc {rdc} or the announcement still fires")
        elif "C_OL" in Kdd and "C_OL" in Kdc and not close(Kdc["C_OL"] * 4.5, Kdd["C_OL"] * 2.0, tol=1.0):
            fail(f"(j) donepezil01: C_OL {Kdc['C_OL']} vs {Kdd['C_OL']} is not in the ratio 2.0 / 4.5")

    if a.keep is None and not a.reuse:
        shutil.rmtree(work, ignore_errors=True)
    if fails:
        print("check_economic_extensions: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_economic_extensions: OK -- the building (area x grade price, FCI +1.18 C_BM), both break-evens "
          "(operating recomputed, NPV a root of the real pipeline), the price break-even (twin NPV zero for a product and a raw material, revenue recomputed from the cash flow, 3 refusals), the royalty window (years 1.." + str(expiry) +
          ", both bases), the three working capitals, 8 refusals, absence silent, all pinned; tax on a loss: "
          "the credit reading announced and summed, `taxOnLoss none` zero in every loss year and the NPV lower by "
          "exactly the discounted credit, a bad word refused; the operators' cover: the default 4.5 and a declared 2.0 price the crew in exactly that ratio, 3 refusals, the default announced once on a 3840 h batch plan and silenced by the declaration.  NOT CHECKED: the fixed/variable classification, "
          "any price's realism")
    return 0


if __name__ == "__main__":
    sys.exit(main())
