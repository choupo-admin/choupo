#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the plant's three statements tie, and moving one account is caught.

    bin/curate/check_plant_books.py

WHY THIS EXISTS (2026-11-25, DEV.md 4c C524).  The economics pass writes a
column of cash flows; an accountant keeps the same plant as an income
statement, a balance sheet and a cash-flow statement.  A student who reads
them is checking the appraisal against a second description of the same
money, and a second description is only worth having if it CANNOT drift: if
an account is missing from the appraisal (a tax that is paid but never
earned, a recovery taken twice, a loan that is repaid and never borrowed) the
balance sheet stops balancing.  The defect this gate would have caught is a
books layer that is built from the rows and quietly forces its own tie --
a plug.  So the gate rebuilds the three statements BY HAND, in Python, from
the published cash-flow rows and the loan's schedule alone, shares no code
with PlantBooks.cpp, and requires the engine's published statements to equal
the hand ones account by account and the six identities to hold.

WHAT IT CHECKS, on economics01 (unlevered, loss-making: negative cash), a
copy of economics01 WITH a loan declared, economics03 (three construction
years, ramp-up, start-up cost, a shipped loan), economics04 (building,
royalty), greenAmmoniaPEQ_baseCase (the reference plant, unedited), and a
copy of economics01 with `taxOnLoss none;`:

  (a) the hand statements equal the engine's, account by account, every year;
  (b) assets = liabilities + equity, every year, to 1e-9 of the sheet's size;
  (c) operations + investing + loan flows = the appraisal's own cash flow;
  (d) closing cash of the cash-flow statement = the balance sheet's cash;
  (e) retained earnings roll forward; EBIT = the appraisal's taxable income;
  (f) the owners' identity: sum of cash flows = closing cash - paid in;
  (g) the engine's own `checks` block agrees with (b)-(f) and `kpis.books`
      carries assets, liabilities and equity for every year;
  (h) the appraisal is not moved: a run with the books has the NPV of the
      cash-flow rows (NPV recomputed from them at the discount rate);
  (i) SABOTAGE: this gate's own comparison is run on a copy of the engine's
      statements with ONE account moved by 1e-6 of the sheet, in turn, and
      must fail every time (an assets line, a liability, an equity line, the
      cash line of each statement), so a comparison that cannot see a moved
      account is itself caught.
"""
import copy
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

REPO = gatekit.repo
TOL = 1e-9
fails = []


def fail(msg):
    fails.append(msg)


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*\n(.*?)\n<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def binary_for(case):
    cd = (case / "system" / "controlDict").read_text()
    m = re.search(r"^\s*application\s+(\w+)\s*;", cd, re.M)
    return gatekit.binary(m.group(1) if m else "choupoSolve")


# ---------------------------------------------------------- the hand books --
def hand_books(res):
    """The three statements from the cash-flow rows and the loan schedule ONLY."""
    econ = res["economics"]
    kp = res["kpis"]["economics"]
    rows = econ["cashFlow"]
    yrs = [r["year"] for r in rows]
    n = len(rows)
    N = yrs[-1]
    tau = econ["taxRate"]
    FCI, WC = econ["FCI"], econ["WC"]
    land = econ["land"]["cost"] if "land" in econ else 0.0
    fin = econ.get("financing")
    sch = fin["schedule"] if fin else None
    fixed = 0.180 * FCI + 2.73 * kp["C_OL"]
    last = rows[-1]
    # the sale price of the plant, read back from the last year's cash flow:
    #   CF_N = PAT + D + WC + land + V (1 - tau)
    V = (last["cashFlow"] - last["afterTaxProfit"] - last["depreciation"] - WC - land) / (1 - tau)
    H = {k: [0.0] * n for k in (
        "revenue", "variable", "fixed", "royalty", "startup", "ebitda", "dep", "ebit",
        "interest", "pbt", "tax", "pat", "disp", "disptax", "net",
        "cost", "accdep", "land", "wcassets", "pay", "loan", "share", "re", "cash",
        "assets", "liab", "equity", "flow", "opcash", "inv", "draw", "repaid")}
    cumcost = cumdep = cumshare = cumre = cash = 0.0
    for i, r in enumerate(rows):
        t = r["year"]
        y = sch[i] if sch else None
        idcdep = y["idcDepreciation"] if y else 0.0
        if t >= 1:
            H["revenue"][i] = r["revenue"]
            H["fixed"][i] = fixed
            H["variable"][i] = r["opex"] - fixed
            H["startup"][i] = r.get("startupCost", 0.0)
            H["royalty"][i] = 0.0     # recovered below from the taxable income
            H["dep"][i] = r["depreciation"] + idcdep
            # royalty: whatever remains between the taxable income and the lines known
            H["royalty"][i] = (r["revenue"] - r["opex"] - H["startup"][i]
                               - r["depreciation"] - r["taxableIncome"])
            H["ebitda"][i] = (H["revenue"][i] - H["variable"][i] - fixed
                              - H["royalty"][i] - H["startup"][i])
            H["ebit"][i] = H["ebitda"][i] - H["dep"][i]
            H["interest"][i] = y["interestPaid"] if y else 0.0
            H["pbt"][i] = H["ebit"][i] - H["interest"][i]
            H["tax"][i] = y["tax"] if y else r["tax"]
            H["pat"][i] = H["pbt"][i] - H["tax"][i]
        capex = (-r["investment"] - (WC if t == 0 else 0.0)) if t <= 0 else 0.0
        idccap = y["interestCapitalised"] if y else 0.0
        cumcost += capex + idccap
        cumdep += H["dep"][i]
        if t == N:
            H["disp"][i] = V - (cumcost - cumdep)
            H["disptax"][i] = tau * V
        H["net"][i] = H["pat"][i] + H["disp"][i] - H["disptax"][i]
        landbuy = land if (land and t == rows[0]["year"] and "land" in econ
                           and econ["land"]["investedAtYear"] == t) else 0.0
        inv = (-capex - landbuy - (WC if t == 0 else 0.0)
               + ((WC + land + V - tau * V) if t == N else 0.0))
        H["opcash"][i] = H["pat"][i] + H["dep"][i]
        H["inv"][i] = inv
        H["draw"][i] = y["draw"] if y else 0.0
        H["repaid"][i] = y["principal"] if y else 0.0
        H["flow"][i] = y["cashFlow"] if y else r["cashFlow"]
        paid = -H["flow"][i] if t <= 0 else 0.0
        cash += H["opcash"][i] + inv + H["draw"][i] - H["repaid"][i] + paid
        cumshare += paid
        cumre += H["net"][i]
        held = (t != N)
        H["cost"][i] = cumcost if held else 0.0
        H["accdep"][i] = -cumdep if held else 0.0
        H["land"][i] = land if (held and "land" in econ) else 0.0
        H["wcassets"][i] = (WC + 0.0) if (held and t >= 0) else 0.0   # net, see pay
        H["loan"][i] = y["balance"] if y else 0.0
        H["share"][i] = cumshare
        H["re"][i] = cumre
        H["cash"][i] = cash
        H["equity"][i] = cumshare + cumre
    return H, yrs


def row(statement, key):
    for r in statement:
        if r["key"] == key:
            return r["values"]
    raise KeyError(key)


def compare(res, label, scale_floor=1.0):
    """The engine's statements against the hand ones, and the identities.  Returns
    the failures it found as a list (so the sabotage arm can count them)."""
    out = []
    books = res["economics"].get("books")
    if not books:
        return [f"{label}: the result carries no economics.books block"]
    H, yrs = hand_books(res)
    if books["years"] != yrs:
        return [f"{label}: books years {books['years']} != cash-flow years {yrs}"]
    inc, bal, cf = books["incomeStatement"], books["balanceSheet"], books["cashFlowStatement"]
    n = len(yrs)
    scale = max(scale_floor, max(abs(v) for v in row(bal, "totalAssets")))

    def eq(name, vals, hand, what):
        for i in range(n):
            if abs(vals[i] - hand[i]) > TOL * scale:
                out.append(f"{label}: {what} {name} year {yrs[i]}: engine {vals[i]:.6f}"
                           f" hand {hand[i]:.6f}")
                return

    # (a) the hand statements equal the engine's
    for key, hk in (("revenue", "revenue"), ("variableCost", "variable"),
                    ("fixedOperatingCost", "fixed"), ("ebitda", "ebitda"),
                    ("depreciation", "dep"), ("ebit", "ebit"), ("interest", "interest"),
                    ("profitBeforeTax", "pbt"), ("tax", "tax"), ("profitAfterTax", "pat"),
                    ("disposalResult", "disp"), ("disposalTax", "disptax"),
                    ("netProfit", "net")):
        eq(key, row(inc, key), H[hk], "income")
    eq("fixedAssetsAtCost", row(bal, "fixedAssetsAtCost"), H["cost"], "balance")
    eq("accumulatedDepreciation", row(bal, "accumulatedDepreciation"), H["accdep"], "balance")
    eq("land", row(bal, "land"), H["land"], "balance")
    eq("loan", row(bal, "loan"), H["loan"], "balance")
    eq("shareCapital", row(bal, "shareCapital"), H["share"], "balance")
    eq("retainedEarnings", row(bal, "retainedEarnings"), H["re"], "balance")
    eq("cash", row(bal, "cash"), H["cash"], "balance")
    eq("closingCash", row(cf, "closingCash"), H["cash"], "cash flow")
    eq("operatingCash", row(cf, "operatingCash"), H["opcash"], "cash flow")
    eq("investingCash", row(cf, "investingCash"), H["inv"], "cash flow")
    # working capital: the lines the balance sheet holds net to the WC the NPV invests
    wc = [sum(row(bal, k)[i] for k in ("rawMaterialStock", "processInventory", "productStock",
                                       "receivables", "operatingCashReserve",
                                       "undividedWorkingCapital"))
          - row(bal, "payables")[i] for i in range(n)]
    eq("working capital (assets - payables)", wc, H["wcassets"], "balance")

    # (b) assets = liabilities + equity, from the engine's OWN sums and from the lines
    ta, tl, te = (row(bal, k) for k in ("totalAssets", "totalLiabilities", "totalEquity"))
    for i in range(n):
        lines = (row(bal, "netFixedAssets")[i] + row(bal, "land")[i]
                 + sum(row(bal, k)[i] for k in ("rawMaterialStock", "processInventory",
                                                "productStock", "receivables",
                                                "operatingCashReserve",
                                                "undividedWorkingCapital", "cash")))
        if abs(lines - ta[i]) > TOL * scale:
            out.append(f"{label}: total assets year {yrs[i]} is not the sum of its lines")
        if abs(ta[i] - tl[i] - te[i]) > TOL * scale:
            out.append(f"{label}: (b) assets {ta[i]:.4f} != liabilities {tl[i]:.4f} +"
                       f" equity {te[i]:.4f} in year {yrs[i]}")
    # (c) the appraisal's flow
    eq("appraisal flow tie", [row(cf, "operatingCash")[i] + row(cf, "investingCash")[i]
                              + row(cf, "loanDrawn")[i] - row(cf, "loanRepaid")[i]
                              for i in range(n)], H["flow"], "(c)")
    # (d) closing cash = balance sheet cash
    eq("closing cash = balance-sheet cash", row(cf, "closingCash"), row(bal, "cash"), "(d)")
    # (e) retained earnings; EBIT vs the taxable income
    re_, np_ = row(bal, "retainedEarnings"), row(inc, "netProfit")
    for i in range(1, n):
        if abs(re_[i] - re_[i - 1] - np_[i]) > TOL * scale:
            out.append(f"{label}: (e) retained earnings do not roll forward in year {yrs[i]}")
    rows_ = res["economics"]["cashFlow"]
    sch = res["economics"].get("financing", {}).get("schedule")
    for i, r in enumerate(rows_):
        if r["year"] >= 1:
            idc = sch[i]["idcDepreciation"] if sch else 0.0
            if abs(row(inc, "ebit")[i] + idc - r["taxableIncome"]) > TOL * scale:
                out.append(f"{label}: (e) EBIT != the appraisal's taxable income, year {yrs[i]}")
    # (f) owners
    paid = row(cf, "shareCapitalPaidIn")
    lhs = sum(H["flow"])
    rhs = row(cf, "closingCash")[-1] - sum(paid)
    if abs(lhs - rhs) > TOL * scale:
        out.append(f"{label}: (f) sum of owners' flows {lhs:.4f} != closing cash - paid in {rhs:.4f}")
    # (g) the engine's own block and the KPIs
    ck = books["checks"]
    for k in ("balanceError", "cashTieError", "incomeTieError", "retainedEarningsError",
              "ownersError", "worstError"):
        if not (ck[k] <= TOL):
            out.append(f"{label}: (g) the engine's own check {k} = {ck[k]:.2e} > {TOL}")
    kb = res["kpis"].get("books", {})
    for i, t in enumerate(yrs):
        k = ("ym%d" % -t) if t < 0 else ("y%d" % t)
        for nm, vals in (("totalAssets", ta), ("totalLiabilities", tl), ("totalEquity", te)):
            if abs(kb.get(f"{nm}_{k}", math.nan) - vals[i]) > 1e-6 * max(1.0, scale):
                out.append(f"{label}: (g) kpis.books.{nm}_{k} missing or != the balance sheet")
                break
    # (h) the NPV is the rows' NPV
    e = res["economics"]
    npv = sum(r["cashFlow"] / (1 + e["discountRate"]) ** r["year"] for r in e["cashFlow"])
    if abs(npv - e["NPV"]) > 1e-7 * max(1.0, abs(e["NPV"])):
        out.append(f"{label}: (h) the NPV {e['NPV']:.2f} is not the rows' {npv:.2f}")
    return out


SABOTAGE = [("balanceSheet", "netFixedAssets"), ("balanceSheet", "cash"),
            ("balanceSheet", "totalLiabilities"), ("balanceSheet", "retainedEarnings"),
            ("balanceSheet", "shareCapital"), ("incomeStatement", "profitAfterTax"),
            ("cashFlowStatement", "operatingCash"), ("cashFlowStatement", "closingCash")]


def arm_sabotage(res, label):
    """Move ONE account of a copy by 1e-6 of the sheet; the comparison must see it."""
    scale = max(abs(v) for v in row(res["economics"]["books"]["balanceSheet"], "totalAssets"))
    for stmt, key in SABOTAGE:
        bad = copy.deepcopy(res)
        r = next(x for x in bad["economics"]["books"][stmt] if x["key"] == key)
        j = len(r["values"]) // 2
        r["values"][j] += 1e-6 * scale
        if not compare(bad, label + " [sabotaged]"):
            fail(f"(i) {label}: moving {stmt}.{key} by 1e-6 of the sheet was NOT caught")


# ------------------------------------------------------------------ runs ---
def run_case(path, edit=None):
    with gatekit.probe_copy(path) as d:
        if edit:
            edit(d)
        code, out = gatekit.run(binary_for(d), d)
        res = result_json(out)
        if code != 0 or res is None or "economics" not in res:
            fail(f"{path}: the run exited {code} or published no economics\n"
                 + "\n".join(out.splitlines()[-6:]))
            return None, out
        csvs = [d / "reports/economics" / f for f in
                ("incomeStatement.csv", "balanceSheet.csv", "cashFlowStatement.csv")]
        for c in csvs:
            if not c.exists():
                fail(f"{path}: {c.name} was not written")
        return res, out


def with_loan(d):
    p = d / "system" / "postDict"
    s = p.read_text()
    i = s.rindex("economics")
    j = s.index("{", i)
    depth, k = 0, j
    while True:
        depth += (s[k] == "{") - (s[k] == "}")
        if depth == 0:
            break
        k += 1
    block = ("\n    financing\n    {\n        debtFraction 0.5;\n        basis fixedCapital;\n"
             "        rate 0.06;\n        graceYears 1;\n        termYears 6;\n"
             "        repayment annuity;\n        source \"gate probe: a declared loan\";\n"
             "        reason \"exercise the loan accounts in the books\";\n    }\n")
    p.write_text(s[:k] + block + s[k:])


def tax_none(d):
    gatekit.edit(d / "system" / "postDict", "taxRate", "taxOnLoss none;\n    taxRate")


CASES = [
    ("tutorials/steady/economics/economics01_esterification_dcf", None, "economics01"),
    ("tutorials/steady/economics/economics01_esterification_dcf", with_loan,
     "economics01 + loan (copy)"),
    ("tutorials/steady/economics/economics01_esterification_dcf", tax_none,
     "economics01 taxOnLoss none (copy)"),
    ("tutorials/steady/economics/economics03_startup_years", None, "economics03"),
    ("tutorials/steady/economics/economics04_building_royalty_breakeven", None, "economics04"),
    ("tutorials/plant/greenAmmoniaPEQ_baseCase", None, "greenAmmoniaPEQ_baseCase"),
]


def main():
    sabotaged = False
    overdraft = tied_loan = 0
    for path, edit, label in CASES:
        try:
            res, out = run_case(path, edit)
        except gatekit.GateRefusal as e:
            print(f"check_plant_books: FAIL -- {e}")
            return 1
        if res is None:
            continue
        bad = compare(res, label)
        for b in bad:
            fail(b)
        if not bad and not sabotaged:
            arm_sabotage(res, label)
            sabotaged = True
        bk = res["economics"]["books"]
        if "worst relative error" not in out:
            fail(f"{label}: the run log carries no `worst relative error` line")
        overdraft += bool(bk["checks"]["cashOverdrawn"])
        tied_loan += ("financing" in res["economics"])
    if not overdraft:
        fail("no witness closes a year with negative cash: the overdraft path is unwitnessed")
    if tied_loan < 2:
        fail("fewer than two witnesses carry a loan: the loan accounts are unwitnessed")
    return gatekit.verdict(
        "check_plant_books", fails,
        f"{len(CASES)} witnesses: the hand-built statements equal the engine's, assets ="
        " liabilities + equity and cash ties to the appraisal in every year to 1e-9,"
        " and eight moved accounts are each caught")


if __name__ == "__main__":
    sys.exit(main())
