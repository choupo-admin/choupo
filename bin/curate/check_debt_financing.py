#!/usr/bin/env python3
"""Gate: a loan changes what the OWNERS receive, never what the PROJECT is worth.

    bin/curate/check_debt_financing.py
    bin/curate/check_debt_financing.py --keep DIR    run, keep the runs in DIR, check
    bin/curate/check_debt_financing.py --reuse DIR   check the runs kept in DIR (no run)

WHY THIS EXISTS (2026-10-20, DEV.md 4c C110 G4).  Students' projects finance
part of the investment with a bank loan -- half the total investment at a
declared rate, say -- compute the interest during construction ("juros
intercalares") and repay the loan in the cash flow.  The appraisal was
unlevered and had no debt.  `economics { financing { ... } }` adds the loan
and the EQUITY (levered) view BESIDE the project's, through the one cash-flow
home `appraise`.

Two risks are specific to such a feature, and the arms are built against
them.  The first is that the loan leaks into the PROJECT's figures: a
project NPV that improves when the plant borrows cheaply says the plant got
better, and it did not -- the project's merit must not depend on how it is
financed.  The second is a loan schedule nobody can redo: interest
capitalised on the wrong balance, a grace year that repays, an annuity that
does not clear.  So the central arms do what a student would do: take the
PROJECT's published cash flow and the declared terms, build the loan and the
equity cash flow by hand in Python -- by the income statement, not by the
engine's delta formula -- and require the engine's numbers.

WHAT THIS GATE CHECKS:

  (a) A HAND LOAN SCHEDULE.  The gate's own loan helper first reproduces a
      schedule written out BY HAND below (1000 at 10 %, three years, annuity
      and linear), so the recomputation the other arms trust is itself
      anchored to numbers a reader can check on paper.

  (b) THE ANNUITY PROBE RECOMPUTES ROW BY ROW.  economics03_startup_years
      (three construction years, a ramp-up, a start-up cost) with a loan of
      0.5 x FCI at 6 %, two grace years, eight annuity years, an equity rate
      of 12 %: the draws follow the capital schedule, the interest is
      capitalised on the balance already drawn, the loan at start-up is the
      draws compounded to t = 0, the grace years pay interest only, the
      payments are level, the balance clears at the last one; the equity
      cash flow is rebuilt from the project's income statement (taxable
      income less interest and the capitalised interest's depreciation, tax,
      + depreciation, - principal, the project's end-of-life recoveries);
      the equity NPV at 12 %, an IRR zeroing that cash flow, and the
      discounted payback recompute.  financing.csv, the JSON schedule and the
      KPIs all agree with the recomputation.

  (c) THE PROJECT IS UNCHANGED.  The same case without the loan writes a
      cashFlow.csv BYTE-IDENTICAL to the probe's, every economics KPI it
      publishes has the probe's value, and the JSON's `economics` object is
      identical once the probe's `financing` block (and its new KPIs) are
      set aside.  The console says, on the table, that the project figures
      are the merit and the equity view does not replace them.

  (d) THE LINEAR PROBE, totalCapital, no grace, no declared equity rate:
      the working capital is financed at t = 0, the principal is constant,
      the equity rate is the project's and that default is ANNOUNCED
      ([assumed], into the caveat block).

  (e) A ONE-YEAR CONSTRUCTION ACCRUES NO INTEREST DURING CONSTRUCTION
      (economics01): the whole capital is spent at t = 0, IDC = 0 exactly,
      the loan at start-up is the draw, and the console says why.

  (f) THE SENSITIVITY: `financing.rate` and `financing.debtFraction` are
      inputs; at both ends the PROJECT NPV equals the base (a swing of
      exactly zero) and the EQUITY NPV recomputes from the hand model with
      that one term moved; their KPIs are published.

  (g) THE REFUSALS fire by name: a missing term, a debt fraction of 0 or 1,
      a rate written in per cent, a fractional term, a loan outliving the
      plant, an unknown repayment, an unknown basis, an unknown key, a bare
      value, an empty source, a sensitivity on a loan nobody declared, a
      rate end outside [0, 1), an equity rate at or below -100 %.

  (h) AN ABSENT BLOCK IS SILENT: economics01 and economics03 as shipped
      publish no `financing` object, no debt_/equity_ KPI, no financing.csv,
      no equity line, and their .ods has one sheet.

  (i) PUBLISHED IMPLIES PINNED: every scalar of the JSON `financing` object
      equals a `debt_*` / `equity_*` KPI (which the golden `kpi` kind pins),
      and financing.csv equals the JSON schedule row for row.

  (j) ONE HOME (a SOURCE arm): the loan's arithmetic -- the draws
      (`debtFraction *`), the interest on the balance (`r * B`), the
      annuity -- and the equity NPV / IRR / payback calls lie inside
      `appraise()`, and the sensitivity moves `in.fin.rate` /
      `in.fin.debtFraction` through `withSensitivityValue`.  No output arm
      can tell a correct second copy from the first.

BY-HAND SABOTAGES: see the record beside `main` (all caught).

NOT COVERED, said plainly: whether the declared terms are sensible (the
author's); a country's tax law on capitalised interest (the convention is
IAS 23's capitalisation, stated); the equity IRR's uniqueness beyond the
printed multiple-IRR guard; byte identity of every economics case against
the previous build -- measured when the block was built (twelve cases,
console, JSON and every reports/economics file), a measurement, not a gate.
"""
import csv
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
SRC = ROOT / "src/postProcessing/EconomicsPass.cpp"
E01 = ROOT / "tutorials/steady/economics/economics01_esterification_dcf"
E03 = ROOT / "tutorials/steady/economics/economics03_startup_years"

fails = []
CLAIM = []


def fail(msg):
    fails.append(msg)


# ---------------------------------------------------------------- running --
def insert_in_economics(s, text):
    """`text` inserted just before the economics block's closing brace."""
    i = s.rindex("\neconomics")
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


def prepare(work, name, src, text=None):
    d = work / name
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(src, d, ignore=shutil.ignore_patterns("reports", "converged",
                                                          "design", "iterations"))
    if text is not None:
        p = d / "system" / "postDict"
        p.write_text(insert_in_economics(p.read_text(), text))
    return d


def run(d):
    p = subprocess.run([str(BIN), str(d)], capture_output=True, text=True,
                       cwd=str(ROOT), timeout=1800)
    out = p.stdout + p.stderr
    (d.parent / (d.name + ".out")).write_text(out + f"\n__rc={p.returncode}\n")
    return out, p.returncode


def stored(d):
    t = (d.parent / (d.name + ".out")).read_text()
    m = re.search(r"\n__rc=(-?\d+)\n$", t)
    return t[:m.start()], int(m.group(1))


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*\n(.*?)\n<<<Choupo:result-end>>>", out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def econ_kpis(res):
    k = (res or {}).get("kpis", {}).get("economics")
    return k if isinstance(k, dict) else {}


def close(a, b, abs_tol=1e-6, rel=1e-9):
    if a is None and b is None:
        return True                      # both absent / null (a NaN in the JSON)
    if a is None or b is None:
        return False
    if isinstance(a, float) and math.isnan(a) and isinstance(b, float) and math.isnan(b):
        return True
    return abs(a - b) <= max(abs_tol, rel * max(abs(a), abs(b)))


# ------------------------------------------------- the hand loan schedule --
def loan(draws, r, grace, term, repayment, years_op):
    """The loan, by the rules the record states.  `draws` maps a construction
    year t <= 0 (ascending) to the cash drawn at its END.  Returns per-year
    dicts and the totals."""
    rows, B, idc, drawn = {}, 0.0, 0.0, 0.0
    for t in sorted(draws):
        cap = r * B                      # interest on the balance already drawn
        B += cap + draws[t]
        idc += cap
        drawn += draws[t]
        rows[t] = dict(draw=draws[t], cap=cap, I=0.0, pr=0.0, bal=B)
    P = B
    A = (P * r / (1 - (1 + r) ** -term)) if (repayment == "annuity" and r > 0) else P / term
    for t in range(1, years_op + 1):
        I = r * B
        pr = 0.0
        if grace < t <= grace + term:
            if t == grace + term:
                pr = B
            elif repayment == "annuity":
                pr = A - I
            else:
                pr = P / term
        B -= pr
        rows[t] = dict(draw=0.0, cap=0.0, I=I, pr=pr, bal=B)
    return rows, dict(drawn=drawn, idc=idc, P=P, A=A)


def arm_hand_anchor():
    """(a) the helper against a schedule written out on paper.
    Annuity, P = 1000, r = 0.10, n = 3:  A = 1000 x 0.1 / (1 - 1.1^-3)
      = 402.1148;  year 1: I = 100.0000, principal 302.1148, balance 697.8852;
      year 2: I = 69.7885, principal 332.3263, balance 365.5589;
      year 3: I = 36.5559, principal 365.5589, balance 0.
    Linear, the same loan: principal 333.3333 each year; interest 100.0000,
    66.6667, 33.3333.
    Capitalisation: 500 drawn at t = -1 and 500 at t = 0 at 10 % -> the
      first draw earns 50 in year 0, the loan at start-up is 1050, IDC 50."""
    hand_ann = [(100.0, 302.1148, 697.8852), (69.7885, 332.3263, 365.5589),
                (36.5559, 365.5589, 0.0)]
    rows, tot = loan({0: 1000.0}, 0.10, 0, 3, "annuity", 3)
    if not close(tot["A"], 402.1148, abs_tol=1e-4):
        fail(f"(a) the helper's annuity is {tot['A']:.4f}, the hand value 402.1148")
    for t, (I, pr, bal) in enumerate(hand_ann, start=1):
        x = rows[t]
        if not (close(x["I"], I, 1e-4) and close(x["pr"], pr, 1e-4) and close(x["bal"], bal, 1e-4)):
            fail(f"(a) helper annuity year {t}: {x}, hand ({I}, {pr}, {bal})")
    rows, _ = loan({0: 1000.0}, 0.10, 0, 3, "linear", 3)
    for t, I in ((1, 100.0), (2, 66.6667), (3, 33.3333)):
        if not (close(rows[t]["I"], I, 1e-4) and close(rows[t]["pr"], 1000.0 / 3, 1e-4)):
            fail(f"(a) helper linear year {t}: {rows[t]}")
    _, tot = loan({-1: 500.0, 0: 500.0}, 0.10, 0, 3, "annuity", 3)
    if not (close(tot["P"], 1050.0, 1e-9) and close(tot["idc"], 50.0, 1e-9)):
        fail(f"(a) helper capitalisation: P {tot['P']}, IDC {tot['idc']}; hand 1050, 50")


# ------------------------------------------------ the equity, by the book --
def hand_equity(res, fin):
    """The loan and the equity cash flow rebuilt from the PROJECT's published
    cash flow (the result JSON's rows, full precision) and the declared
    terms -- through the income statement, not the engine's delta form."""
    e = res["economics"]
    k = econ_kpis(res)
    FCI, WC, tau = k["FCI"], k["WC"], e["taxRate"]
    dl = FCI / e["depreciation"]                       # depreciableLife
    rows = e["cashFlow"]
    Nlife = max(r["year"] for r in rows)
    sched = (e.get("timeline") or {}).get("capitalSchedule") or [1.0]
    Nc = len(sched)
    draws = {t: 0.0 for t in range(1 - Nc, 1)}
    for kk in range(1, Nc + 1):
        draws[kk - Nc] += fin["debtFraction"] * sched[kk - 1] * FCI
    if fin["basis"] == "totalCapital":
        draws[0] += fin["debtFraction"] * WC
    L, tot = loan(draws, fin["rate"], fin["graceYears"], fin["termYears"],
                  fin["repayment"], Nlife)
    Ndepr = sum(1 for r in rows if r["year"] >= 1 and r["depreciation"] > 0)
    dI = tot["idc"] / dl
    eq = {}
    for r in rows:
        t = r["year"]
        if t <= 0:
            eq[t] = dict(cf=r["cashFlow"] + draws.get(t, 0.0), taxable=0.0, tax=0.0, dI=0.0)
            continue
        di = dI if t <= Ndepr else 0.0
        taxable = (r["revenue"] - r["opex"] - r.get("startupCost", 0.0)
                   - r["depreciation"] - L[t]["I"] - di)
        tax = tau * taxable
        op_project = r["taxableIncome"] * (1 - tau) + r["depreciation"]
        recoveries = r["cashFlow"] - op_project           # WC, salvage, land at N
        cf = taxable - tax + r["depreciation"] + di - L[t]["pr"] + recoveries
        eq[t] = dict(cf=cf, taxable=taxable, tax=tax, dI=di)
    ie = fin["equityDiscountRate"]
    npv = sum(eq[t]["cf"] / (1 + ie) ** t for t in eq)
    invested = -sum(eq[t]["cf"] for t in eq if t <= 0)
    return L, tot, eq, npv, invested


def irr_of(eq):
    f = lambda i: sum(eq[t]["cf"] / (1 + i) ** t for t in eq)
    lo, hi = -0.5, 5.0
    if f(lo) * f(hi) > 0:
        return float("nan")
    for _ in range(200):
        m = 0.5 * (lo + hi)
        if f(lo) * f(m) <= 0:
            hi = m
        else:
            lo = m
    return 0.5 * (lo + hi)


def payback_of(eq, i):
    cum = prev = 0.0
    for t in sorted(eq):
        disc = eq[t]["cf"] / (1 + i) ** t
        prev, cum = cum, cum + disc
        if cum >= 0 and t > 0:
            return (t - 1) + (-prev / disc if disc else 0.0)
    return float("nan")


def read_fin_csv(d):
    path = d / "reports/economics/financing.csv"
    if not path.exists():
        return None, None
    lines = path.read_text().splitlines()
    body, foot, header = [], {}, None
    for l in lines:
        if not l or l.startswith("#"):
            continue
        if l.startswith("year,"):
            header = l.split(",")
            continue
        f = l.split(",")
        if header and re.fullmatch(r"-?\d+", f[0]) and len(f) == len(header):
            body.append(dict(zip(header, f)))
        else:
            foot[f[0]] = f[1:]
    return body, foot


def check_probe(label, d, out, rc, fin):
    """(b)/(d)/(e) one financed run against the hand model; (i) its pins."""
    if rc != 0:
        fail(f"({label}) the probe exited {rc}:\n    " + "\n    ".join(out.strip().splitlines()[-5:]))
        return None
    res = result_json(out)
    if not res:
        fail(f"({label}) no result JSON")
        return None
    e = res["economics"]
    F = e.get("financing")
    if not F:
        fail(f"({label}) the result carries no economics.financing object")
        return None
    L, tot, eq, npv, invested = hand_equity(res, fin)
    sched = F["schedule"]
    by = {y["year"]: y for y in sched}
    if sorted(by) != sorted(eq):
        fail(f"({label}) the schedule's years {sorted(by)} are not the project's {sorted(eq)}")
        return None
    for t in sorted(eq):
        y, h, q = by[t], L.get(t), eq[t]
        pairs = [("draw", h["draw"]), ("interestCapitalised", h["cap"]),
                 ("interestPaid", h["I"]), ("principal", h["pr"]), ("balance", h["bal"]),
                 ("idcDepreciation", q["dI"]), ("taxableIncome", q["taxable"]),
                 ("tax", q["tax"]), ("cashFlow", q["cf"])]
        for key, want in pairs:
            if not close(y[key], want, abs_tol=1e-3, rel=1e-9):
                fail(f"({label}) t = {t}: {key} {y[key]!r}, recomputed by hand {want!r}")
    for key, want in (("loanDrawn", tot["drawn"]), ("interestDuringConstruction", tot["idc"]),
                      ("loanAtStartup", tot["P"]), ("equityNPV", npv),
                      ("equityInvested", invested),
                      ("interestPaidTotal", sum(L[t]["I"] for t in L if t >= 1))):
        if not close(F[key], want, abs_tol=1e-3, rel=1e-9):
            fail(f"({label}) {key} {F[key]!r}, recomputed {want!r}")
    # the loan clears, the principal adds up to the loan, the annuity is level
    Nlife = max(eq)
    if abs(by[Nlife]["balance"]) > 1e-6 * max(1.0, tot["P"]):
        fail(f"({label}) the balance at t = {Nlife} is {by[Nlife]['balance']}, not 0")
    if not close(sum(y["principal"] for y in sched), tot["P"], abs_tol=1e-3):
        fail(f"({label}) the principal repaid sums to {sum(y['principal'] for y in sched)}"
             f", the loan at start-up is {tot['P']}")
    g, n = fin["graceYears"], fin["termYears"]
    for t in range(1, g + 1):
        if by[t]["principal"] != 0.0:
            fail(f"({label}) grace year {t} repays {by[t]['principal']}")
    if fin["repayment"] == "annuity":
        pays = [by[t]["interestPaid"] + by[t]["principal"] for t in range(g + 1, g + n + 1)]
        if max(pays) - min(pays) > 1e-6 * max(pays):
            fail(f"({label}) the annuity payments are not level: {min(pays)} .. {max(pays)}")
    irr = irr_of(eq)
    if F["equityIRR"] is None or not close(F["equityIRR"], irr, abs_tol=2e-5, rel=0.0):
        fail(f"({label}) equity IRR {F['equityIRR']}, the root of the hand cash flow {irr}")
    pb = payback_of(eq, fin["equityDiscountRate"])
    if not close(F["equityDiscountedPayback"], pb, abs_tol=1e-6):
        fail(f"({label}) equity payback {F['equityDiscountedPayback']}, recomputed {pb}")
    # (i) published implies pinned
    k = econ_kpis(res)
    for jk, kk in (("loanDrawn", "debt_drawn"), ("interestDuringConstruction", "debt_IDC"),
                   ("loanAtStartup", "debt_atStartup"), ("interestPaidTotal", "debt_interestPaid"),
                   ("equityInvested", "equity_invested"), ("equityNPV", "equity_NPV"),
                   ("equityIRR", "equity_IRR"), ("equityDiscountedPayback", "equity_paybackYears")):
        if not close(F[jk], k.get(kk), abs_tol=0.0, rel=1e-12):
            fail(f"(i) {label}: financing.{jk} = {F[jk]} but KPI economics.{kk} = {k.get(kk)}"
                 " -- a number the golden does not pin")
    for jk in ("debtFraction", "rate", "graceYears", "termYears", "repayment", "basis",
               "equityDiscountRate"):
        if not (F[jk] == fin[jk] or (isinstance(fin[jk], float) and close(F[jk], fin[jk]))):
            fail(f"(i) {label}: financing.{jk} = {F[jk]!r}, declared {fin[jk]!r}")
    body, foot = read_fin_csv(d)
    if body is None:
        fail(f"(i) {label}: no reports/economics/financing.csv")
    else:
        cur = e["currency"]
        if len(body) != len(sched):
            fail(f"(i) {label}: financing.csv has {len(body)} rows, the JSON schedule {len(sched)}")
        for row, y in zip(body, sched):
            for key in ("draw", "interestCapitalised", "interestPaid", "principal",
                        "balance", "tax"):
                if not close(float(row[f"{key}_{cur}"]), y[key], abs_tol=0.006, rel=0.0):
                    fail(f"(i) {label}: financing.csv t = {row['year']} {key}"
                         f" {row[key + '_' + cur]}, JSON {y[key]}")
            if not close(float(row[f"equityCashFlow_{cur}"]), y["cashFlow"], abs_tol=0.006, rel=0.0):
                fail(f"(i) {label}: financing.csv t = {row['year']} equity CF differs from the JSON")
        if not close(float(foot["equityNPV"][0]), F["equityNPV"], abs_tol=0.006, rel=0.0):
            fail(f"(i) {label}: financing.csv equityNPV {foot['equityNPV']}, JSON {F['equityNPV']}")
        if not close(float(foot["projectNPV"][0]), e["NPV"], abs_tol=0.006, rel=0.0):
            fail(f"(i) {label}: financing.csv projectNPV is not the project's NPV")
    return res


FIN_ANNUITY = dict(debtFraction=0.5, basis="fixedCapital", rate=0.06, graceYears=2,
                   termYears=8, repayment="annuity", equityDiscountRate=0.12)
FIN_LINEAR = dict(debtFraction=0.6, basis="totalCapital", rate=0.05, graceYears=0,
                  termYears=10, repayment="linear")
FIN_ONEYEAR = dict(debtFraction=0.5, basis="fixedCapital", rate=0.07, graceYears=1,
                   termYears=6, repayment="annuity", equityDiscountRate=0.10)


def block(fin, extra=""):
    lines = ["    financing", "    {"]
    for k in ("debtFraction", "basis", "rate", "graceYears", "termYears", "repayment",
              "equityDiscountRate"):
        if k in fin:
            lines.append(f"        {k} {fin[k]};")
    lines.append('        source "gate probe: author-set loan terms";')
    lines.append('        reason "gate probe: exercises every term of the loan";')
    lines.append("    }")
    return "\n".join(lines) + ("\n" + extra if extra else "")


SENS = """    sensitivity
    {
        financing.rate         { absolute ( 0.04 0.08 ); }
        financing.debtFraction { relative ( -0.4 0.4 ); }
    }"""

REFUSALS = [
    ("missing rate", lambda: block({k: v for k, v in FIN_ONEYEAR.items() if k != "rate"}),
     r"`rate` is not declared"),
    ("debt fraction 1", lambda: block(dict(FIN_ONEYEAR, debtFraction=1.0)),
     r"strictly between 0 and 1"),
    ("debt fraction 0", lambda: block(dict(FIN_ONEYEAR, debtFraction=0.0)),
     r"strictly between 0 and 1"),
    ("rate in per cent", lambda: block(dict(FIN_ONEYEAR, rate=6)),
     r"6 % is `rate 0\.06;`"),
    ("fractional term", lambda: block(dict(FIN_ONEYEAR, termYears=2.5)),
     r"`termYears 2\.5;` must be a whole number"),
    ("loan outlives the plant", lambda: block(dict(FIN_ONEYEAR, graceYears=4, termYears=8)),
     r"the loan would outlive the plant"),
    ("unknown repayment", lambda: block(dict(FIN_ONEYEAR, repayment="bullet")),
     r"unknown financing repayment 'bullet'"),
    ("unknown basis", lambda: block(dict(FIN_ONEYEAR, basis="TCI")),
     r"unknown financing basis 'TCI'"),
    ("unknown key", lambda: block(FIN_ONEYEAR).replace("        rate 0.07;",
                                                       "        rate 0.07;\n        interestRate 0.07;"),
     r"unknown financing key 'interestRate'"),
    ("bare value", lambda: "    financing 0.5;", r"`financing` must be a block"),
    ("empty source", lambda: block(FIN_ONEYEAR).replace('"gate probe: author-set loan terms"', '""'),
     r"`source \"\.\.\.\";` is\s+empty"),
    ("sensitivity with no loan",
     lambda: "    sensitivity { financing.rate { absolute ( 0.04 0.08 ); } }",
     r"`financing\.rate` moves a term\s+of the loan, and this economics block declares no loan"),
    ("rate end out of range",
     lambda: block(FIN_ONEYEAR, "    sensitivity { financing.rate { absolute ( 0.05 1.2 ); } }"),
     r"a loan's interest rate is a fraction in \[0, 1\)"),
    ("equity rate at -100 %", lambda: block(dict(FIN_ONEYEAR, equityDiscountRate=-1.5)),
     r"`equityDiscountRate` at or\s+below -100 %"),
]


def code_of(src):
    return re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), src)


def body_of(code, sig):
    m = re.search(sig, code)
    if not m:
        return None
    j = code.index("{", m.end())
    depth, k = 0, j
    while True:
        if code[k] == "{":
            depth += 1
        elif code[k] == "}":
            depth -= 1
            if depth == 0:
                return (j, k)
        k += 1


def arm_source():
    """(j) the loan's arithmetic lives inside appraise() only."""
    code = code_of(SRC.read_text())
    b = body_of(code, r"\nAppraisalOutcome appraise\(")
    if not b:
        fail("(j) EconomicsPass.cpp has no `AppraisalOutcome appraise(`")
        return
    pats = {
        "the draws `debtFraction *`": r"debtFraction\s*\*",
        "the interest on the balance `r * B`": r"\br\s*\*\s*B\b",
        "the annuity `std::pow(1.0 + r`": r"std::pow\(1\.0 \+ r\b",
        "the equity NPV `npvOf(equityFlow`": r"npvOf\(equityFlow",
        "the equity IRR `irrOf(equityFlow)`": r"irrOf\(equityFlow\)",
        "the equity payback `discPaybackOf(equityFlow`": r"discPaybackOf\(equityFlow",
    }
    for what, pat in pats.items():
        hits = list(re.finditer(pat, code))
        if not hits:
            fail(f"(j) {what} is nowhere in EconomicsPass.cpp: the loan is not computed")
        outside = [code.count("\n", 0, x.start()) + 1 for x in hits
                   if not (b[0] < x.start() < b[1])]
        if outside:
            fail(f"(j) {what} appears OUTSIDE appraise() at EconomicsPass.cpp line(s)"
                 f" {outside}: a second home for the loan")
    for key, field in (("financing.rate", "rate"), ("financing.debtFraction", "debtFraction")):
        if not re.search(r'key == "' + re.escape(key) + r'"\)\s+in\.fin\.' + field + r"\s*=\s*v;", code):
            fail(f"(j) withSensitivityValue does not move `in.fin.{field}` for `{key}`")


def main():
    argv = sys.argv[1:]
    keep = reuse = None
    if "--keep" in argv:
        keep = Path(argv[argv.index("--keep") + 1]).resolve()
    if "--reuse" in argv:
        reuse = Path(argv[argv.index("--reuse") + 1]).resolve()
    if not BIN.exists():
        print("check_debt_financing: FAIL -- no choupoSolve build; run `make all`")
        return 1
    work = reuse or keep or Path(tempfile.mkdtemp(prefix="debtfin."))
    work.mkdir(parents=True, exist_ok=True)

    def get(name, src, text=None):
        d = work / name
        if reuse:
            return d, *stored(d)
        d = prepare(work, name, src, text)
        return d, *run(d)

    try:
        arm_hand_anchor()

        # (b) + (i): the annuity probe, with the two financing sensitivities
        d1, out1, rc1 = get("annuity", E03, block(FIN_ANNUITY, SENS))
        res1 = check_probe("b", d1, out1, rc1, FIN_ANNUITY)

        # (c) the project is unchanged: the same case without the loan
        d0, out0, rc0 = get("e03_absent", E03)
        if rc0 != 0:
            fail(f"(c) economics03 as shipped exited {rc0}")
        elif res1:
            a = (d0 / "reports/economics/cashFlow.csv").read_bytes()
            b = (d1 / "reports/economics/cashFlow.csv").read_bytes()
            if a != b:
                fail("(c) cashFlow.csv differs with the loan: the PROJECT cash flow moved")
            res0 = result_json(out0)
            k0, k1 = econ_kpis(res0), econ_kpis(res1)
            moved = [k for k in k0 if not close(k0[k], k1.get(k), abs_tol=0.0, rel=0.0)]
            if moved:
                fail(f"(c) project KPIs moved with the loan: {moved}")
            e0 = dict(res0["economics"])
            e1 = {k: v for k, v in res1["economics"].items()
                  if k not in ("financing", "sensitivity")}
            if e0 != e1:
                diff = [k for k in set(e0) | set(e1) if e0.get(k) != e1.get(k)]
                fail(f"(c) the result's economics object moved with the loan: {diff}")
            for phrase in ("the PROJECT figures above are unchanged",
                           "does NOT\n    replace them",
                           "the project's is the merit, the equity's is the owners' share"):
                if phrase not in out1:
                    fail(f"(c) the console does not say `{phrase}`")
            # (f) the sensitivity of the two terms
            sens = {r["input"]: r for r in res1["economics"]["sensitivity"]["inputs"]}
            base_npv = res1["economics"]["NPV"]
            for key, field, ends in (("financing.rate", "rate", (0.04, 0.08)),
                                     ("financing.debtFraction", "debtFraction", (0.3, 0.7))):
                r = sens.get(key)
                if not r:
                    fail(f"(f) no sensitivity row for {key}")
                    continue
                if not (close(r["NPV_low"], base_npv, 0.0, 0.0) and close(r["NPV_high"], base_npv, 0.0, 0.0)):
                    fail(f"(f) {key} moved the PROJECT NPV ({r['NPV_low']}, {r['NPV_high']}"
                         f" vs {base_npv}): the project's merit depends on its financing")
                for end, v in zip(("low", "high"), ends):
                    _, _, _, want, _ = hand_equity(res1, dict(FIN_ANNUITY, **{field: v}))
                    got = r.get(f"equityNPV_{end}")
                    if not close(got, want, abs_tol=1e-3, rel=1e-9):
                        fail(f"(f) {key} {end} ({v}): equity NPV {got}, recomputed {want}")
                    kk = "sens_" + key.replace(".", "_") + f"_equityNPV_{end}"
                    if not close(econ_kpis(res1).get(kk), got, 0.0, 1e-12):
                        fail(f"(f) KPI {kk} is not the row's equity NPV")
            if "moves the EQUITY view only" not in out1:
                fail("(f) the sensitivity table does not say financing.* moves the equity view only")

        # (d) linear, totalCapital, no grace, the equity rate defaulted
        d2, out2, rc2 = get("linear", E03, block(FIN_LINEAR))
        fl = dict(FIN_LINEAR)
        res2 = result_json(out2) if rc2 == 0 else None
        if res2:
            fl["equityDiscountRate"] = res2["economics"]["discountRate"]
        check_probe("d", d2, out2, rc2, fl)
        if res2:
            F2 = res2["economics"]["financing"]
            WC = econ_kpis(res2)["WC"]
            sched = res2["economics"]["timeline"]["capitalSchedule"]
            want0 = 0.6 * (sched[-1] * econ_kpis(res2)["FCI"] + WC)
            if not close(F2["schedule"][[y["year"] for y in F2["schedule"]].index(0)]["draw"], want0, 1e-3):
                fail("(d) the t = 0 draw does not finance the working capital")
            if F2["equityDiscountRateDeclared"] is not False:
                fail("(d) an undeclared equity rate is reported as declared")
            caveats = json.dumps(res2.get("advisories", []))
            if "equityDiscountRate was NOT declared" not in out2 or \
                    "equityDiscountRate was NOT declared" not in caveats:
                fail("(d) the defaulted equity rate is not ANNOUNCED (console and result)")

        # (e) one-year construction: no interest during construction
        d3, out3, rc3 = get("oneyear", E01, block(FIN_ONEYEAR))
        res3 = check_probe("e", d3, out3, rc3, FIN_ONEYEAR)
        if res3:
            F3 = res3["economics"]["financing"]
            if F3["interestDuringConstruction"] != 0.0 or \
                    not close(F3["loanAtStartup"], 0.5 * econ_kpis(res3)["FCI"], 1e-6):
                fail(f"(e) one construction year: IDC {F3['interestDuringConstruction']},"
                     f" loan at start-up {F3['loanAtStartup']} (want 0 and 0.5 FCI)")
            if "a one-year construction spends its capital at its END" not in out3:
                fail("(e) the console does not say why no interest accrued")
            if "(2 sheets, coloured)" not in out3:
                fail("(e) the .ods carries no equity sheet")

        # (g) refusals
        nref = 0
        for label, text, pat in REFUSALS:
            dd, o, rc = get("refuse_" + re.sub(r"\W", "_", label), E01, text())
            if rc == 0 or not re.search(pat, o):
                fail(f"(g) refusal `{label}`: exit {rc}, /{pat}/ "
                     + ("absent" if not re.search(pat, o) else "present"))
            nref += 1

        # (h) absent: silent
        dA, outA, rcA = get("e01_absent", E01)
        for dd, o, rc, nm in ((dA, outA, rcA, "economics01"), (d0, out0, rc0, "economics03")):
            if rc != 0:
                fail(f"(h) {nm} as shipped exited {rc}")
                continue
            res = result_json(o) or {}
            k = econ_kpis(res)
            if "financing" in (res.get("economics") or {}) \
                    or any(x.startswith(("debt_", "equity_")) for x in k) \
                    or (dd / "reports/economics/financing.csv").exists() \
                    or "EQUITY view" in o or "(1 sheet, coloured)" not in o:
                fail(f"(h) {nm} declares no loan and printed, published or wrote one")

        arm_source()
    finally:
        if not (keep or reuse):
            shutil.rmtree(work, ignore_errors=True)

    if fails:
        print("check_debt_financing: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_debt_financing: OK -- the gate's loan helper reproduces a schedule"
          " written out by hand (annuity, linear, capitalisation); on"
          " economics03_startup_years with an annuity loan (0.5 x FCI, 6 %, two grace"
          " years, eight repayments, equity at 12 %) and a linear one (0.6 x FCI + WC,"
          " no grace, the equity rate defaulted and announced), every draw, capitalised"
          " interest, interest, principal, balance, tax and equity cash flow recomputes"
          " by hand from the project's published cash flow, the loan clears, the equity"
          " NPV, IRR and payback recompute; the project's cashFlow.csv is byte-identical"
          " and its every KPI and result field unmoved with the loan; a one-year"
          " construction accrues no interest during construction and says why;"
          " `financing.rate` and `financing.debtFraction` leave the project NPV exactly"
          f" where it was and their equity NPVs recompute; {nref} malformed declarations"
          " refuse by name; economics01 and economics03 as shipped print, publish and"
          " write nothing of a loan; every financing scalar is a pinned KPI and"
          " financing.csv equals the JSON schedule; and the loan's arithmetic lives"
          " inside appraise().  NOT COVERED: whether the terms are sensible, a country's"
          " tax law on capitalised interest, and byte identity against the previous"
          " build (measured once, not gated).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
