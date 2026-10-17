#!/usr/bin/env python3
"""Gate: the economic sensitivity (tornado) is the base appraisal priced again, and nothing else.

    bin/curate/check_economic_sensitivity.py
    bin/curate/check_economic_sensitivity.py --keep DIR    run, keep the runs in DIR, check
    bin/curate/check_economic_sensitivity.py --reuse DIR   check the runs kept in DIR (no run)

WHY THIS EXISTS (2026-10-12, DEV.md 4c C68).  Vitor accepted "the
feasibility cases gain a preliminary CAPEX and a sensitivity".  The capital
was there; the sensitivity was not, and an outer `sweep` could not supply it,
because a sweep varies FLOWSHEET paths while what a feasibility-stage
sensitivity varies -- the capital, the prices, the discount rate, the hours
on stream -- lives in the economics pass.  And the declared `accuracyBand`
(-30 / +50 % on the capital) was printed as a band and propagated to nothing:
no NPV or IRR ever saw it.

So `economics { sensitivity { ... } }` was added: each declared input moved
ALONE to two declared ends, the plant priced again on the same converged run.
The risk such a feature carries is specific: a tornado bar is only a number
about THIS plant if it is computed by THIS plant's cash flow.  A second copy
of the arithmetic -- one that forgets the working capital follows the
revenue, or the 0.180 FCI inside COM_d -- prints bars of the right size and
the wrong plant, and nothing downstream could tell.  So the central arms do
what a student would do with the published artefacts: take the BASE cash flow
the pass wrote (`reports/economics/cashFlow.csv`) and redo a perturbation by
hand, in Python, from that file and the working-capital file alone -- never
from the engine's source, never from the JSON.

WHAT THIS GATE CHECKS, on the two shipped feasibility cases and on a probe
built from economics01_esterification_dcf:

  (a) THE FEASIBILITY CASES PUBLISH THE TORNADO.  Both cases run; every
      declared input has a row in `reports/economics/sensitivity.csv`, the
      console carries the table under its NOT-AN-UNCERTAINTY-ANALYSIS header
      (the CSV too), and each `economics.sens_<input>_NPV_low/_high` KPI in
      the result JSON equals the CSV's number (to the CSV's whole euro).

  (b) THE DISCOUNT RATE RECOMPUTES FROM cashFlow.csv ALONE.  The cash flow
      does not depend on the rate, so NPV(0.08) and NPV(0.12) are the base
      `cashFlow_<cur>` column discounted again.  First the base NPV at the
      file's own rate must reproduce the file's footer, so the arm is known to
      be reading the right column.

  (c) THE PRODUCT PRICE RECOMPUTES FROM cashFlow.csv + workingCapital.csv.
      A product price of (1 + d) times the base moves the revenue by d R
      every operating year (after tax), and the working capital by d times
      its RECEIVABLES line -- the only line of the build-up the revenue
      enters (stocks are valued at COST, never at the sales price) -- out at
      t = 0 and back at the end of life.  A sensitivity that forgot the
      working capital is off by that line's present value and fails here.

  (d) THE CAPITAL BAND REACHES THE NPV, AND RECOMPUTES.  On the feasibility
      case, the FCI row's two values are the base FCI times (1 + lo/100) and
      (1 + hi/100) with lo/hi the footer's own `accuracyBand_pct`.  On the
      economics01 probe (WC a fraction of FCI, one construction year), the
      FCI row recomputes from its cashFlow.csv alone: the investment and the
      WC scale with FCI, COM_d moves by 0.180 dFCI, the depreciation scales.

  (e) THE REFUSALS FIRE, each by name, on the probe: an unknown input (with
      the `Accepted:` list), a price the case does not declare, a utility no
      duty is allocated to, a bare list (no `relative`/`absolute`), and
      `absolute` on the FCI.  Each must exit non-zero and say why.

  (f) AN ABSENT BLOCK IS SILENT.  economics01 as shipped (no block): no
      `sens_` KPI, no table, no `sensitivity.csv`.

  (g) ONE HOME FOR THE CASH FLOW (a SOURCE arm).  Every discounting
      expression `std::pow(1.0 + ` and every after-tax expression
      `(1.0 - taxRate)` in EconomicsPass.cpp lies inside the body of
      `appraise(`, and the sensitivity prices each end through
      `appraise(withSensitivityValue(`.  No output arm can tell a correct
      second copy from the first; this one can.

  (h) THE RESULT CARRIES THE TABLE (2026-10-17, the GUI tornado).  The
      result JSON's `economics.sensitivity` block -- the ONLY thing the GUI's
      tornado reads -- reproduces sensitivity.csv row for row and IN ITS
      ORDER (the engine's tornado order; the GUI sorts nothing), carries the
      CSV's own caveat sentence, and every NPV and input end in it equals a
      `sens_<input>_NPV_*` / `sens_<input>_value_*` KPI, which the golden
      `kpi` kind pins: published implies pinned.  (f) also requires an
      absent block to publish no `"sensitivity":` key.

  (i) THE LAND (2026-10-17, DEV.md 4c C82), on the witness
      tutorials/plant/ammonia02_full_plant (a land price on the plot the
      layout publishes, two construction years) and the same case with its
      `land` block removed: from the two cashFlow.csv files alone, the land
      column is -L at the start of construction (t = -Nc, one row the
      no-land timeline does not have) and +L at the end of life, and zero
      between; every other column of every common year is identical (the
      land is not depreciated and changes no tax: the recovery is untaxed);
      the NPV difference is exactly -L (1+i)^Nc + L/(1+i)^N; the IRR the
      KPI publishes zeroes the land run's cash flow; TCI and FCI do not
      move; L is the declared price times the plot area the layout
      PUBLISHES (`layout.plot.plotArea` of the same run).  The no-land run
      prints, publishes and writes nothing of a land.
  (j) `land.price` IS A SENSITIVITY INPUT: on a witness probe its two ends
      recompute from the base NPV alone (the land enters only at t = -Nc
      and t = N), and its KPIs are published.
  (k) THE LAND REFUSES BY NAME: a price with no plot area and no `area`
      (economics01, no layout); an `area` beside a published plot (two
      homes); no price; no source; a negative price; `land.price` in a
      sensitivity of a block that declares no land.  And a declared `area`
      where there is no layout is priced on it.
  (l) THE LAND ENTERS ONLY THROUGH appraise() (a SOURCE arm): every
      arithmetic on the land -- `in.landPrice * in.landArea`, the outlay
      `-= land`, the recovery `+= land` -- lies inside appraise(), and the
      sensitivity moves it by `withSensitivityValue`, never by a cash flow
      of its own.

BY-HAND SABOTAGES (2026-10-12), each restored afterwards:

  S1  A SECOND HOME: the sensitivity loop priced each end with its own copy
      of the NPV (the base cash flow plus the after-tax revenue change,
      forgetting the working capital and the capital).  CAUGHT by (g) -- the
      copy's `std::pow(1.0 + ` and `(1.0 - taxRate)` sat outside
      `appraise(` and the loop no longer called it -- by (c), the
      receivables' present value missing from all four price ends, and by
      (d), the FCI ends equal to the base.  (b) PASSED under it, as it
      should: re-discounting the base cash flow is exactly right for the
      discount rate, which is why a copy can look correct on one input.
  S2  THE REFUSAL OF AN UNDECLARED PRICE DROPPED: `price.<stream>` of an
      unpriced stream accepted and moving nothing.  CAUGHT by (e).
  S3  AN ARTEFACT EDITED BETWEEN THE RUN AND THE CHECK (--keep, then the
      discountRate row's NPV_low in the kept 150 bar sensitivity.csv moved by
      +1e6, then --reuse).  CAUGHT by (b) and by (a)'s KPI = CSV comparison.
  S4  THE ABSENT BLOCK NOT SILENT: the table header printed whenever the
      pass ran.  CAUGHT by (f).

BY-HAND SABOTAGES of arm (h) (2026-10-17), each on a --keep copy of the 150
bar run edited between the run and the check, then --reuse:

  S5  a block value moved (price.H2Feed valueLow 3.6 -> 3.7).  CAUGHT twice:
      the block disagrees with the CSV and with its KPI.
  S6  two block rows swapped (the GUI would draw a ranking the engine did not
      make).  CAUGHT by the order comparison.
  S7  the `sens_price_H2Feed_value_low` KPI removed (a block number nothing
      pins).  CAUGHT.
  S8  the caveat sentence altered.  CAUGHT.
  S9  the block renamed away (the GUI would draw no tornado).  CAUGHT.

BY-HAND SABOTAGES of arms (i)-(l) (2026-10-17, C82): see the record beside
`arm_land` below.

NOT COVERED, said plainly: whether any END is a sensible one (the ends are
the author's assumptions); correlated inputs (a sensitivity moves one at a
time, by design); the ramp-up / multi-year construction under a perturbation
(the shipped feasibility cases declare neither; `appraise` is the same code
for both, which (g) holds); IRR and payback recomputation (pinned by the
golden, not recomputed here); and BYTE-identity of every economics case
against the previous build -- that was measured when the block was built
(all 11 cases, console, JSON, and every reports/economics file, .ods
included) and is a measurement, not a gate.
"""
import csv
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
SRC = ROOT / "src/postProcessing/EconomicsPass.cpp"
FEAS = [ROOT / "tutorials/plant/greenAmmonia02_feasibility150bar",
        ROOT / "tutorials/plant/greenAmmonia02_feasibility50bar"]
ECON01 = ROOT / "tutorials/steady/economics/economics01_esterification_dcf"

fails = []


def fail(msg):
    fails.append(msg)


# ---------------------------------------------------------------- running --
def insert_in_economics(s, text):
    """`text` inserted just before the economics block's closing brace."""
    i = s.rindex("economics")
    j = s.index("{", i)
    depth, k = 0, j
    while True:
        if s[k] == "{":
            depth += 1
        elif s[k] == "}":
            depth -= 1
            if depth == 0:
                break
        k += 1
    return s[:k] + text + "\n" + s[k:]


def prepare(work, name, src, block=None, edit=None):
    d = work / name
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(src, d, ignore=shutil.ignore_patterns("reports", "converged",
                                                          "design", "iterations"))
    if edit is not None:
        p = d / "system" / "postDict"
        p.write_text(edit(p.read_text()))
    if block is not None:
        p = d / "system" / "postDict"
        s = p.read_text()
        i = s.rindex("economics")
        j = s.index("{", i)
        # insert just before the economics block's closing brace
        depth, k = 0, j
        while True:
            if s[k] == "{":
                depth += 1
            elif s[k] == "}":
                depth -= 1
                if depth == 0:
                    break
            k += 1
        s = s[:k] + "    sensitivity\n    {\n" + block + "\n    }\n" + s[k:]
        p.write_text(s)
    return d


def run(d):
    p = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                       cwd=str(ROOT), timeout=900)
    out = p.stdout + p.stderr
    (d.parent / (d.name + ".out")).write_text(out + f"\n__rc={p.returncode}\n")
    return out, p.returncode


def stored(d):
    t = (d.parent / (d.name + ".out")).read_text()
    m = re.search(r"\n__rc=(-?\d+)\n$", t)
    return t[:m.start()], int(m.group(1))


# ----------------------------------------------------------------- reading --
def read_cashflow(d):
    """The base cash flow and footer, from cashFlow.csv alone."""
    rows, foot, cur = [], {}, None
    lines = (d / "reports/economics/cashFlow.csv").read_text().splitlines()
    header = None
    for l in lines:
        if not l or l.startswith("#"):
            continue
        if l.startswith("year,"):
            header = l.split(",")
            cur = [h for h in header if h.startswith("cashFlow_")][0][len("cashFlow_"):]
            continue
        f = l.split(",")
        if header and re.fullmatch(r"-?\d+", f[0]) and len(f) == len(header):
            rows.append(dict(zip(header, f)))
        else:
            foot[f[0]] = f[1:]
    num = lambda v: float(v) if v not in ("", None) else float("nan")
    out = []
    for r in rows:
        out.append({k: (int(v) if k == "year" else num(v)) for k, v in r.items()})
    return out, foot, cur


def read_sensitivity(d):
    path = d / "reports/economics/sensitivity.csv"
    if not path.exists():
        return None, ""
    text = path.read_text()
    body = [l for l in text.splitlines() if l and not l.startswith("#")]
    rows = {r["input"]: r for r in csv.DictReader(body)}
    return rows, text


def kpis_economics(out):
    m = re.search(r'"economics": \{([^{}]*)\}', out)
    if not m:
        return {}
    kv = {}
    for k, v in re.findall(r'"(\w+)":\s*(-?[0-9][0-9.eE+-]*|null)', m.group(1)):
        kv[k] = float("nan") if v == "null" else float(v)
    return kv


def npv(rows, i, cf_key):
    return sum(r[cf_key] / (1.0 + i) ** r["year"] for r in rows)


def close(a, b, abs_tol=60.0, rel=1e-8):
    return abs(a - b) <= max(abs_tol, rel * max(abs(a), abs(b)))


# ---------------------------------------------------------------- the arms --
FEAS_INPUTS_150 = ["FCI", "price.ProductNH3", "price.H2Feed", "price.N2Feed",
                   "utility.electricity", "utility.hitecSalt",
                   "utility.steamGenerationHP", "discountRate", "streamFactor"]
FEAS_INPUTS_50 = [x.replace("hitecSalt", "dowthermA") for x in FEAS_INPUTS_150]

PROBE_BLOCK = """        FCI           { relative ( -0.30 0.50 ); }
        price.vapProd { relative ( -0.20 0.20 ); }
        discountRate  { absolute ( 0.08 0.12 ); }"""

REFUSALS = {
    "unknown input": ("FCIx { relative ( -0.3 0.5 ); }",
                      [r"unknown economic sensitivity input 'FCIx'", r"Accepted:.*price\.vapProd"]),
    "undeclared price": ("price.liqProd { relative ( -0.2 0.2 ); }",
                         [r"price\.liqProd", r"prices no such stream"]),
    "unallocated utility": ("utility.dowthermA { relative ( -0.2 0.2 ); }",
                            [r"utility\.dowthermA", r"no duty of this run is allocated"]),
    "bare list": ("discountRate ( 0.08 0.12 );",
                  [r"`discountRate` must be a block", r"relative"]),
    "absolute FCI": ("FCI { absolute ( 1e5 2e5 ); }",
                     [r"`FCI` takes `relative` only"]),
}


def arm_feasibility(d, out, rc, inputs):
    name = d.name
    if rc != 0:
        fail(f"(a) {name} exited {rc}")
        return
    sens, text = read_sensitivity(d)
    if sens is None:
        fail(f"(a) {name}: no reports/economics/sensitivity.csv")
        return
    if "NOT AN UNCERTAINTY ANALYSIS" not in text:
        fail(f"(a) {name}: sensitivity.csv lacks its not-an-uncertainty-analysis header")
    if "Economic sensitivity (one input at a time)" not in out \
            or "NOT AN UNCERTAINTY ANALYSIS" not in out:
        fail(f"(a) {name}: the console carries no sensitivity table under its header")
    missing = [k for k in inputs if k not in sens]
    if missing:
        fail(f"(a) {name}: declared inputs without a row: {missing}")
    kp = kpis_economics(out)
    for k, r in sens.items():
        kk = "sens_" + re.sub(r"[^A-Za-z0-9_]", "_", k)
        for end in ("low", "high"):
            pub = kp.get(f"{kk}_NPV_{end}")
            csvv = float(r[f"NPV_{end}_EUR"])
            if pub is None or not close(pub, csvv, abs_tol=1.0, rel=0.0):
                fail(f"(a) {name}: KPI {kk}_NPV_{end} = {pub} but sensitivity.csv says {csvv}")

    rows, foot, cur = read_cashflow(d)
    cf = f"cashFlow_{cur}"
    i0 = float(foot["discountRate_pct"][0]) / 100.0
    base = npv(rows, i0, cf)
    if not close(base, float(foot["NPV"][0])):
        fail(f"(b) {name}: the base cash flow at its own rate gives {base:.0f}, the"
             f" footer says {foot['NPV'][0]} -- the arm is not reading what it thinks")
    # (b) discount rate
    r = sens.get("discountRate")
    if r:
        for end in ("low", "high"):
            i = float(r[f"value{end.capitalize()}"])
            want = npv(rows, i, cf)
            got = float(r[f"NPV_{end}_EUR"])
            if not close(want, got):
                fail(f"(b) {name}: NPV at i = {i} recomputed from cashFlow.csv is"
                     f" {want:.0f}; the tornado says {got:.0f}")
    # (c) product price
    r = sens.get("price.ProductNH3")
    if r:
        tau = float(foot["taxRate_pct"][0]) / 100.0
        R = float(foot["revenue"][0])
        wc = {}
        for l in (d / "reports/economics/workingCapital.csv").read_text().splitlines():
            f = l.split(",")
            if len(f) > 2 and f[0] in ("asset", "liability", "total"):
                wc[f[1]] = float(f[2])
        N = max(x["year"] for x in rows)
        pf = "productionFraction"
        for end in ("low", "high"):
            dlt = float(r[f"value{end.capitalize()}"]) / float(r["baseValue"]) - 1.0
            dR = dlt * R
            dWC = dlt * wc["receivables"]
            want = base - dWC + dWC / (1.0 + i0) ** N
            for x in rows:
                t = x["year"]
                if t >= 1:
                    p = x.get(pf, 1.0)
                    want += dR * p * (1.0 - tau) / (1.0 + i0) ** t
            got = float(r[f"NPV_{end}_EUR"])
            if not close(want, got, abs_tol=200.0):
                fail(f"(c) {name}: a product price x{1 + dlt:.2f} recomputed from"
                     f" cashFlow.csv + workingCapital.csv gives NPV {want:.0f}; the"
                     f" tornado says {got:.0f} (the receivables move {dWC:.0f})")
    # (d) the band reached the capital
    r = sens.get("FCI")
    if r:
        lo, hi = (float(x) for x in foot["accuracyBand_pct"][:2])
        F = float(foot["FCI"][0])
        if not r["mode"].endswith("accuracyBand"):
            fail(f"(d) {name}: the FCI row does not read the declared band ({r['mode']})")
        for end, pct in (("Low", lo), ("High", hi)):
            if not close(float(r[f"value{end}"]), F * (1 + pct / 100.0), abs_tol=2.0, rel=1e-9):
                fail(f"(d) {name}: FCI value{end} {r['value' + end]} is not FCI x"
                     f" (1 {pct:+.0f} %) = {F * (1 + pct / 100.0):.0f}")


def result_json(out):
    """The run's result JSON, between the engine's own markers."""
    m = re.search(r"<<<Choupo:result-begin>>>\s*\n(.*?)\n<<<Choupo:result-end>>>", out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def arm_result_block(d, out, rc):
    """(h) THE RESULT CARRIES THE TABLE THE CSV WRITES -- row for row, in the
    same order, with the engine's own caveat -- and every number in it is a
    pinned KPI.  The GUI's tornado draws `economics.sensitivity` and nothing
    else, so a block that drifted from the CSV (or from the KPIs the golden
    pins) would draw a tornado about a different appraisal."""
    name = d.name
    if rc != 0:
        return                                   # (a) already said so
    sens, text = read_sensitivity(d)
    res = result_json(out)
    blk = ((res or {}).get("economics") or {}).get("sensitivity")
    if not blk:
        fail(f"(h) {name}: the result JSON carries no economics.sensitivity block")
        return
    if "NOT AN UNCERTAINTY ANALYSIS" not in blk.get("caveat", "") \
            or ("# " + blk.get("caveat", "")) not in text:
        fail(f"(h) {name}: the block's caveat is not the CSV's not-an-uncertainty-analysis sentence")
    rows = blk.get("inputs", [])
    order_json = [r.get("input") for r in rows]
    order_csv = list(sens.keys())
    if order_json != order_csv:
        fail(f"(h) {name}: the block's order {order_json} is not the CSV's (tornado)"
             f" order {order_csv}")
    kp = kpis_economics(out)
    for r in rows:
        k = r.get("input")
        c = sens.get(k)
        if c is None:
            continue
        mode = r["mode"] + (" accuracyBand" if r.get("fromBand") else "")
        if mode != c["mode"] or r.get("unit") != c["unit"] \
                or r.get("NPVsignFlip") != c["NPVsignFlip"]:
            fail(f"(h) {name} {k}: mode/unit/sign-flip words disagree with the CSV"
                 f" ({mode!r}/{r.get('unit')!r}/{r.get('NPVsignFlip')!r} vs"
                 f" {c['mode']!r}/{c['unit']!r}/{c['NPVsignFlip']!r})")
        pairs = [("declaredLow", "declaredLow", 1e-6), ("declaredHigh", "declaredHigh", 1e-6),
                 ("baseValue", "baseValue", 1e-6), ("valueLow", "valueLow", 1e-6),
                 ("valueHigh", "valueHigh", 1e-6), ("NPV_low", "NPV_low_EUR", 1.0),
                 ("NPV_high", "NPV_high_EUR", 1.0), ("NPVswing", "NPVswing_EUR", 1.0)]
        for jk, ck, tol in pairs:
            if not close(float(r[jk]), float(c[ck]), abs_tol=tol, rel=1e-6):
                fail(f"(h) {name} {k}: block {jk} = {r[jk]} but sensitivity.csv says {c[ck]}")
        stem = "sens_" + r.get("kpiKey", "")
        for jk, kk in (("NPV_low", "NPV_low"), ("NPV_high", "NPV_high"),
                       ("valueLow", "value_low"), ("valueHigh", "value_high")):
            pub = kp.get(f"{stem}_{kk}")
            if pub is None or not close(pub, float(r[jk]), abs_tol=0.0, rel=1e-9):
                fail(f"(h) {name} {k}: block {jk} = {r[jk]} but KPI {stem}_{kk} = {pub}"
                     " -- a number the golden does not pin")


def arm_probe_fci(d, out, rc):
    if rc != 0:
        fail(f"(d) the economics01 probe exited {rc}:\n    "
             + "\n    ".join(out.strip().splitlines()[-4:]))
        return
    sens, _ = read_sensitivity(d)
    rows, foot, cur = read_cashflow(d)
    cf = f"cashFlow_{cur}"
    i0 = float(foot["discountRate_pct"][0]) / 100.0
    tau = float(foot["taxRate_pct"][0]) / 100.0
    F = float(foot["FCI"][0])
    f_wc = float(foot["WC"][0]) / F
    N = max(x["year"] for x in rows)
    if "startupCost_" + cur in rows[0] or rows[0]["year"] != 0:
        fail("(d) the probe is meant to have the one-year timeline; it does not")
        return
    last = [x for x in rows if x["year"] == N][0]
    op_N = (last[f"revenue_{cur}"] - last[f"operatingCost_{cur}"]
            - last[f"depreciation_{cur}"]) * (1 - tau) + last[f"depreciation_{cur}"]
    salvage_net = last[cf] - op_N - float(foot["WC"][0])     # salvage x (1 - tau)
    r = sens["FCI"]
    for end in ("low", "high"):
        dlt = float(r[f"value{end.capitalize()}"]) / F - 1.0
        dF = dlt * F
        want = -(F + dF) * (1 + f_wc)
        for x in rows:
            t = x["year"]
            if t < 1:
                continue
            dep = x[f"depreciation_{cur}"] * (1 + dlt)
            com = x[f"operatingCost_{cur}"] + 0.180 * dF
            cft = (x[f"revenue_{cur}"] - com - dep) * (1 - tau) + dep
            if t == N:
                cft += (F + dF) * f_wc + salvage_net * (1 + dlt)
            want += cft / (1 + i0) ** t
        got = float(r[f"NPV_{end}_EUR"])
        if not close(want, got, abs_tol=200.0):
            fail(f"(d) economics01 probe: FCI x{1 + dlt:.2f} recomputed from"
                 f" cashFlow.csv gives NPV {want:.0f}; the tornado says {got:.0f}")


def arm_source():
    s = SRC.read_text()
    m = re.search(r"\nAppraisalOutcome appraise\(", s)
    if not m:
        fail("(g) EconomicsPass.cpp has no `AppraisalOutcome appraise(` -- the one home is gone")
        return
    j = s.index("{", m.end())
    depth, k = 0, j
    while True:
        if s[k] == "{":
            depth += 1
        elif s[k] == "}":
            depth -= 1
            if depth == 0:
                break
        k += 1
    body = (j, k)
    # comments are not code: blank them, keeping every offset
    code = re.sub(r"//[^\n]*", lambda mm: " " * len(mm.group(0)), s)
    for pat in (r"std::pow\(1\.0 \+ ", r"\(1\.0 - taxRate\)"):
        outside = [code.count("\n", 0, x.start()) + 1 for x in re.finditer(pat, code)
                   if not (body[0] < x.start() < body[1])]
        if outside:
            fail(f"(g) `{pat.replace(chr(92), '')}` appears OUTSIDE appraise() at"
                 f" EconomicsPass.cpp line(s) {outside}: a second home for the cash flow")
    if len(re.findall(r"appraise\(withSensitivityValue\(", code)) < 2:
        fail("(g) the sensitivity does not price both ends through"
             " `appraise(withSensitivityValue(` -- each bar must be the base"
             " appraisal priced again")


# ------------------------------------------------------------------ the land --
#  BY-HAND SABOTAGES (2026-10-17, C82), one at a time, each file restored
#  byte for byte (sha256 checked) and the engine rebuilt; all CAUGHT:
#    L1  the land recovery TAXED (`cashFlow[at(Nlife)] += land * (1.0 -
#        taxRate)`)  -> (i) the cash flow at t = 15 moves by 354078, not
#        448200, and the NPV shift is -457559 against -435026; (j) both
#        land.price ends off their recomputation.
#    L2  the land bought at t = 0 (end of construction) instead of t = -Nc
#        -> (i) t = 0's investment and cash flow move, the NPV shift is
#        -340905; (j) both ends.
#    L3  the layout checked AFTER the economics in main.cpp (the C75 order)
#        -> (i) the land witness exits 2 (no plot area to price).
#    L4  `withSensitivityValue` ignores `land.price` -> (j) both ends equal
#        the base NPV; (l) the source arm names it.
LAND_CASE = ROOT / "tutorials/plant/ammonia02_full_plant"
LAND_RE = re.compile(r"\n    //  THE LAND \(DEV\.md 4c C82\).*?\n    land\n    \{.*?\n    \}\n", re.S)
LAND_PROBE = """    land
    {
        price   20;
        source  "gate probe";
        reason  "gate probe";
    }"""


def drop_land(t):
    t2, n = LAND_RE.subn("\n", t)
    if n != 1:
        raise RuntimeError("fixture anchor not found: the witness's land block")
    return t2


def irr_of(rows, cf):
    lo, hi = -0.5, 5.0
    f = lambda i: npv(rows, i, cf)
    if f(lo) * f(hi) > 0:
        return float("nan")
    for _ in range(200):
        m = 0.5 * (lo + hi)
        if f(lo) * f(m) <= 0:
            hi = m
        else:
            lo = m
    return 0.5 * (lo + hi)


def arm_land(get):
    d, out, rc = get("land_witness", LAND_CASE)
    dn, outn, rcn = get("land_absent", LAND_CASE, edit=drop_land)
    if rc != 0 or rcn != 0:
        fail(f"(i) the land witness exited {rc}, without its land {rcn}")
        return
    rows, foot, cur = read_cashflow(d)
    rows_n, foot_n, _ = read_cashflow(dn)
    cf = f"cashFlow_{cur}"
    L = float(foot["land"][0])
    price = float(foot["landPrice_per_m2"][0])
    area = float(foot["landArea_m2"][0])
    res = result_json(out) or {}
    plot = ((res.get("layout") or {}).get("plot") or {}).get("plotArea")
    if plot is None or not close(area, plot, abs_tol=1e-3, rel=1e-9) \
            or foot["landAreaFrom"][0] != "layoutPlot":
        fail(f"(i) the land's area {area} m2 ({foot['landAreaFrom'][0]}) is not the"
             f" plot the layout published ({plot} m2)")
    if not close(L, price * area, abs_tol=1.0, rel=0.0):
        fail(f"(i) land {L} is not price x area = {price} x {area}")
    Nc = int(foot["constructionPeriod_yr"][0])
    N = max(x["year"] for x in rows)
    i0 = float(foot["discountRate_pct"][0]) / 100.0
    if rows[0]["year"] != -Nc or rows_n[0]["year"] != 1 - Nc:
        fail(f"(i) the land run starts at t = {rows[0]['year']} (want {-Nc}, the start of"
             f" construction); the no-land run at {rows_n[0]['year']} (want {1 - Nc})")
    lc = f"land_{cur}"
    for x in rows:
        want = -L if x["year"] == -Nc else (L if x["year"] == N else 0.0)
        if not close(x.get(lc, float("nan")), want, abs_tol=1.0, rel=0.0):
            fail(f"(i) land column at t = {x['year']}: {x.get(lc)}, want {want}")
    by_n = {x["year"]: x for x in rows_n}
    for x in rows:
        y = by_n.get(x["year"])
        if y is None:
            continue
        for k in ("investment", "revenue", "operatingCost", "depreciation",
                  "taxableIncome", "tax", "afterTaxProfit"):
            kk = f"{k}_{cur}"
            if kk in x and not close(x[kk], y[kk], abs_tol=1.0, rel=0.0):
                fail(f"(i) t = {x['year']}: {k} {x[kk]} with the land, {y[kk]} without"
                     " -- the land must move no tax, depreciation or other capital")
        dcf = x[cf] - y[cf]
        want = L if x["year"] == N else 0.0
        if not close(dcf, want, abs_tol=1.0, rel=0.0):
            fail(f"(i) t = {x['year']}: the cash flow moves by {dcf}, want {want}"
                 " (the recovery at its purchase value, untaxed)")
    dNPV = float(foot["NPV"][0]) - float(foot_n["NPV"][0])
    want = -L * (1 + i0) ** Nc + L / (1 + i0) ** N
    if not close(dNPV, want, abs_tol=2.0, rel=0.0):
        fail(f"(i) the land moves the NPV by {dNPV:.0f}; -L(1+i)^Nc + L/(1+i)^N = {want:.0f}")
    for k in ("TCI", "FCI", "WC"):
        if foot[k][0] != foot_n[k][0]:
            fail(f"(i) {k} moved with the land ({foot[k][0]} vs {foot_n[k][0]}): it is NOT"
                 " part of the capital ladder")
    kp = kpis_economics(out)
    irr = irr_of(rows, cf)
    if not close(kp.get("IRR", float("nan")), irr, abs_tol=2e-5, rel=0.0):
        fail(f"(i) the published IRR {kp.get('IRR')} does not zero the land run's cash"
             f" flow (recomputed {irr})")
    if not close(kp.get("land", float("nan")), L, abs_tol=1.0, rel=0.0) \
            or not close(kp.get("landArea", float("nan")), area, abs_tol=1e-3, rel=0.0):
        fail(f"(i) the land KPIs {kp.get('land')}/{kp.get('landArea')} are not the CSV's")
    if "Land = " not in out or "NOT in TCI" not in out:
        fail("(i) the console prints no land line beside the capital")
    # absent: silent
    kpn = kpis_economics(outn)
    resn = result_json(outn) or {}
    if "land" in kpn or "landArea" in kpn or "land" in (resn.get("economics") or {}) \
            or any("land" in r for r in (resn.get("economics") or {}).get("cashFlow", [])) \
            or "Land = " in outn or lc in rows_n[0] or "land" in foot_n:
        fail("(i) the witness without its land block still printed, published or wrote one")

    # (j) land.price as a sensitivity input
    dp, outp, rcp = get("land_sens", LAND_CASE,
                        "        land.price { relative ( -0.5 1.0 ); }")
    sens, _ = read_sensitivity(dp) if rcp == 0 else (None, "")
    r = (sens or {}).get("land.price")
    if not r:
        fail(f"(j) a `land.price` sensitivity: exit {rcp}, no row")
    else:
        base = float(foot["NPV"][0])
        kpp = kpis_economics(outp)
        for end, f_ in (("low", 0.5), ("high", 2.0)):
            if not close(float(r[f"value{end.capitalize()}"]), price * f_, abs_tol=1e-9, rel=1e-9):
                fail(f"(j) land.price value_{end} {r['value' + end.capitalize()]}, want {price * f_}")
            dL = (price * f_ - price) * area
            want = base - dL * (1 + i0) ** Nc + dL / (1 + i0) ** N
            got = float(r[f"NPV_{end}_EUR"])
            if not close(want, got, abs_tol=3.0, rel=0.0):
                fail(f"(j) land.price {end}: NPV {got:.0f}, recomputed {want:.0f}")
            if f"sens_land_price_NPV_{end}" not in kpp:
                fail(f"(j) no KPI sens_land_price_NPV_{end}")

    # (k) refusals, each by name
    E01 = ECON01
    REF = [
        ("no area anywhere", E01, lambda t: insert_in_economics(t, LAND_PROBE),
         r"no plot area to price"),
        ("area beside a plot", LAND_CASE,
         lambda t: t.replace('        source  "placeholder for the students',
                             '        area    1000 m2;\n        source  "placeholder for the students', 1),
         r"one plot, one area"),
        ("no price", E01, lambda t: insert_in_economics(t, LAND_PROBE.replace("price   20;", "area 5000 m2;")),
         r"`price` is not declared"),
        ("no source", E01, lambda t: insert_in_economics(t, LAND_PROBE.replace(
            'source  "gate probe";', "area 5000 m2;")), r"`source \"\.\.\.\";` is not\s+declared"),
        ("negative price", E01, lambda t: insert_in_economics(t, LAND_PROBE.replace(
            "price   20;", "price -5; area 5000 m2;")), r"cannot be\s+negative"),
        ("land.price with no land", E01,
         lambda t: insert_in_economics(t, "    sensitivity { land.price { relative ( -0.5 0.5 ); } }"),
         r"`land\.price` moves the price\s+of the land, and this economics block declares\s+none"),
    ]
    n = 0
    for label, src, edit, pat in REF:
        dd, o, rcx = get("land_refuse_" + re.sub(r"\W", "_", label), src, edit=edit)
        if rcx == 0 or not re.search(pat, o):
            fail(f"(k) land refusal `{label}`: exit {rcx}, /{pat}/ "
                 + ("absent" if not re.search(pat, o) else "present"))
        n += 1
    dd, o, rcx = get("land_declared_area", E01,
                     edit=lambda t: insert_in_economics(t, LAND_PROBE.replace(
                         "price   20;", "price   20; area 5000 m2;")))
    if rcx != 0:
        fail(f"(k) a declared area with no layout: exit {rcx}")
    else:
        _, f2, _ = read_cashflow(dd)
        if f2.get("landAreaFrom", [""])[0] != "declared" \
                or not close(float(f2["land"][0]), 100000.0, abs_tol=1.0, rel=0.0):
            fail(f"(k) a declared 5000 m2 at 20 EUR/m2: land {f2.get('land')},"
                 f" from {f2.get('landAreaFrom')}")
    LAND_CLAIM.append(f"the land on ammonia02 recomputed from its two cashFlow.csv"
                      f" files (outlay at t = -{Nc}, untaxed recovery at t = {N}, no"
                      " other cell moved, the NPV shift exact, the IRR zeroing the"
                      " cash flow, TCI unmoved, the area the layout's plot); the"
                      " no-land run silent; `land.price` ends recomputed;"
                      f" {n} land refusals by name and a declared area priced")


LAND_CLAIM = []


def arm_land_source():
    """(l) the land's arithmetic lives inside appraise() only."""
    s = SRC.read_text()
    code = re.sub(r"//[^\n]*", lambda mm: " " * len(mm.group(0)), s)
    m = re.search(r"\nAppraisalOutcome appraise\(", code)
    if not m:
        fail("(l) no appraise() -- cannot place the land's arithmetic")
        return
    j = code.index("{", m.end())
    depth, k = 0, j
    while True:
        if code[k] == "{":
            depth += 1
        elif code[k] == "}":
            depth -= 1
            if depth == 0:
                break
        k += 1
    pats = (r"landPrice\s*\*", r"-=\s*land\b", r"\+=\s*land\b")
    for pat in pats:
        hits = list(re.finditer(pat, code))
        if not hits:
            fail(f"(l) /{pat}/ is nowhere in EconomicsPass.cpp: the land is not priced")
        outside = [code.count("\n", 0, x.start()) + 1 for x in hits
                   if not (j < x.start() < k)]
        if outside:
            fail(f"(l) /{pat}/ appears OUTSIDE appraise() at EconomicsPass.cpp"
                 f" line(s) {outside}: a second home for the land's cash flow")
    #  A second copy under other names: the declaration read by `readLand`
    #  multiplied anywhere at all (the outlay is priced from the bundle).
    copies = [code.count("\n", 0, x.start()) + 1 for x in
              re.finditer(r"landDecl\.(price|area)\s*\*|\*\s*landDecl\.(price|area)", code)]
    if copies:
        fail(f"(l) the land declaration is multiplied outside appraise() at"
             f" EconomicsPass.cpp line(s) {copies}: a second home for its cost")
    if not re.search(r'key == "land\.price"\)\s+in\.landPrice\s+=\s+v;', code):
        fail("(l) withSensitivityValue does not move `in.landPrice` for `land.price`")


def main():
    argv = sys.argv[1:]
    keep = reuse = None
    if "--keep" in argv:
        keep = Path(argv[argv.index("--keep") + 1]).resolve()
    if "--reuse" in argv:
        reuse = Path(argv[argv.index("--reuse") + 1]).resolve()
    if not BIN.exists():
        print("check_economic_sensitivity: FAIL -- no choupoSolve build; run `make all`")
        return 1
    work = reuse or keep or Path(tempfile.mkdtemp(prefix="econsens."))
    work.mkdir(parents=True, exist_ok=True)

    def get(name, src, block=None, edit=None):
        d = work / name
        if reuse:
            return d, *stored(d)
        d = prepare(work, name, src, block, edit)
        return d, *run(d)

    try:
        # (a)-(d) on the two shipped feasibility cases
        for c, inputs in zip(FEAS, (FEAS_INPUTS_150, FEAS_INPUTS_50)):
            d, out, rc = get(c.name, c)
            arm_feasibility(d, out, rc, inputs)
            arm_result_block(d, out, rc)

        # (d) the FCI recomputed on a fraction-WC probe
        d, out, rc = get("probe_fci", ECON01, PROBE_BLOCK)
        arm_probe_fci(d, out, rc)

        # (e) the refusals
        for label, (blk, pats) in REFUSALS.items():
            d, out, rc = get("refuse_" + re.sub(r"\W", "_", label), ECON01,
                             "        " + blk)
            if rc == 0:
                fail(f"(e) {label}: `{blk}` was ACCEPTED (exit 0)")
                continue
            for p in pats:
                if not re.search(p, out):
                    fail(f"(e) {label}: the refusal does not say /{p}/:\n    "
                         + "\n    ".join(l for l in out.splitlines() if "ERROR" in l)[:600])

        # (f) an absent block is silent
        d, out, rc = get("absent", ECON01)
        if rc != 0:
            fail(f"(f) economics01 as shipped exited {rc}")
        if re.search(r'"sens_', out) or "Economic sensitivity" in out \
                or "sensitivity table ->" in out or '"sensitivity":' in out:
            fail("(f) economics01 declares no sensitivity block and the run still"
                 " printed or published one")
        if (d / "reports/economics/sensitivity.csv").exists():
            fail("(f) economics01 declares no sensitivity block and a"
                 " sensitivity.csv was written")
        if "sens_" in (ECON01 / "expected").read_text():
            fail("(f) economics01's golden carries sens_ rows for a block it does not declare")

        arm_source()
        arm_land(get)
        arm_land_source()
    finally:
        if not (keep or reuse):
            shutil.rmtree(work, ignore_errors=True)

    if fails:
        print("check_economic_sensitivity: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_economic_sensitivity: OK -- the tornado of both feasibility"
          " cases (greenAmmonia02_feasibility150bar / 50bar) is published row by"
          " row in sensitivity.csv, the console and the result JSON, which agree;"
          " the result's economics.sensitivity block (the one input of the GUI"
          " tornado) reproduces the CSV row for row, in its tornado order, under"
          " the same caveat sentence, and its every NPV and input end is a KPI"
          " the golden pins;"
          " from the BASE cashFlow.csv alone the discount-rate ends recompute,"
          " the product-price ends recompute with the working capital moving by"
          " its receivables line, and the capital ends are the declared"
          " accuracyBand applied to the FCI; on an economics01 probe the FCI ends"
          " recompute through WC, 0.180 FCI and depreciation; five malformed"
          " declarations refuse by name; a case without the block prints,"
          " publishes and writes nothing of it; and every discounting and"
          " after-tax expression lives inside appraise(), which both ends of"
          " every bar call; " + "; ".join(LAND_CLAIM) + "; and the land's"
          " arithmetic lives inside appraise() alone.  NOT COVERED: whether an end is sensible (author's"
          " assumption), correlated inputs, a perturbed ramp-up or multi-year"
          " construction, IRR/payback recomputation, and byte-identity against"
          " the previous build (measured once, not gated).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
