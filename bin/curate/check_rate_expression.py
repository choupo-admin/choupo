#!/usr/bin/env python3
"""Gate: a rate law written in the case is compiled, checked and evaluated as declared.

    bin/curate/check_rate_expression.py

WHY THIS EXISTS (DEV.md 4c C67, 2026-10-12).  Vitor's ruling: the kinetics
live in the CASE.  A case carries its own rate law either as `kinetics {
type expression; }` -- a formula in constant/reactions, compiled by
core/Formula into thermo/reaction/ExpressionRate -- or as a C++ law in its
`code/` folder, registered into the ReactionRate factory from
`registerUserTypes()`.  An evaluator that reads a formula out of a text file
is exactly the place a silent misreading hides: a precedence rule read the
wrong way, a dimension nobody checked, a NaN that integrates on as a number.
This gate holds the evaluator to what it promises.

WHAT IT CHECKS, on `tutorials/steady/userops/userOp03_case_rate_law` (one
Michaelis-Menten law, written in C++ AND as an expression, in two CSTRs fed
the same stream) and on throwaway copies of its expression half:

  (a) THE TWO ROUTES AGREE, AND BOTH ARE RIGHT.  The C++ law and the
      expression law give the same extent to 1e-12, and both equal the
      closed-form CSTR solution of Michaelis-Menten kinetics (a quadratic in
      the conversion, solved here independently).

  (b) THE FORMULA IS PRINTED BACK AS PARSED, with its dimensions -- the
      glass box.  The printed text is the PARSE, not the input string, so a
      reader sees the precedence the engine read.

  (c) PRECEDENCE AND ASSOCIATIVITY, by value: `2^3^2` is 512 (right-
      associative), `8/4/2` is 1 (left), `-1^2` is -1 (`-(1^2)`).  A factor
      built from them equals 1 exactly when the parser reads them as written;
      the extent must not move.

  (d) EVERY REFUSAL FIRES, BY NAME: an unknown symbol (with the closest
      name), a rate whose dimensions contradict its basis, `+` across
      dimensions, a parameter with no unit, a dimensional argument to `exp`,
      an unknown function, a definition cycle, a non-finite value (naming the
      state), a table read outside its points, a `validity` declared
      `refuse` and left, a per-catalyst-mass law with no `catalystLoading`, a
      syntax error (with the column), a power-law `order` the law does not
      read, and an unknown `kinetics.type` (with the registered list).

  (e) A TABLE INTERPOLATES LINEARLY AND SAYS SO: a table read inside its
      span changes the rate by exactly the interpolated factor, and the run
      announces the interpolation.

WHAT THIS DOES NOT CHECK, said plainly:

  * whether any law is RIGHT -- the witness's Vmax and Km are author-set;
    the ammonia law's anchors are `check_ammonia_rate`'s;
  * the batchReactor / dynamicCSTR routes (they reach the same factory; a
    law reading P refuses there by construction, not exercised here);
  * the WASM build -- `check_wasm_dialect` holds the evaluator to C++17.

SABOTAGES PERFORMED BY HAND, 2026-10-12, each on the engine, rebuilt, the
gate run, the source restored and rebuilt.  One did not do what was
predicted and is recorded as it happened.

  S1  division made right-associative in Formula's `term` (8/4/2 -> 4).
      CAUGHT by (c), and by (b), (d8) and (e) besides.
  S2  the `+` dimension check disabled.  CAUGHT by (d3).
  S3  a table allowed to extrapolate.  CAUGHT by (d9).
  S4  the non-finite check on DEFINITIONS disabled.  SURVIVED the first
      version of this gate: its only non-finite probe put the infinity in
      the RATE, whose own guard still refused.  Arm (d8b) now makes a
      definition go non-finite and requires the refusal to NAME it.  CAUGHT.
  S5  netRate ignoring the reactor's amount unit (mol vs kmol).  CAUGHT by
      (a) -- the two routes disagree -- and (e).
  S6  a parameter with no unit accepted.  CAUGHT by (d4), through the
      MESSAGE: a deeper guard (the dictionary's own dimension lookup)
      refuses the same probe a line later, with a sentence that does not
      say what to do.
  (S7, a table point interpolated rather than returned exactly, is
  `check_ammonia_rate`'s arm (f).)
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials/steady/userops/userOp03_case_rate_law"

#  The witness's own numbers, read from its files so a change there moves
#  the check with it rather than leaving a stale copy here.
def witness_numbers():
    rx = (CASE / "constant/reactions").read_text()
    vmax = float(re.search(r"Vmax\s+([0-9.eE+-]+)\s+kmol/m3/s;", rx).group(1))
    km = float(re.search(r"Km\s+([0-9.eE+-]+)\s+kmol/m3;", rx).group(1))
    fs = (CASE / "system/flowsheetDict").read_text()
    vr = float(re.search(r"V_R\s+([0-9.eE+-]+);", fs).group(1))
    feed = (CASE / "0/feedExpr").read_text()
    fa = float(re.search(r"compA\s+([0-9.eE+-]+)\s+kmol/h;", feed).group(1)) / 3600.0
    vliq = float(re.search(r"^Vliq\s+([0-9.eE+-]+);",
                           (CASE / "constant/components/compA.dat").read_text(),
                           re.M).group(1))           # m3/mol
    return vmax, km, vr, fa, vliq


def closed_form_extent():
    """F_A0 X = V Vmax cA/(Km + cA), cA = cA0 (1 - X), cA0 = 1/Vliq (pure A)."""
    vmax, km, vr, fa, vliq = witness_numbers()
    ca0 = 1.0 / vliq / 1000.0                       # kmol/m3
    # fa X (Km + ca0 (1-X)) = vr vmax ca0 (1-X)   -> a X^2 + b X + c = 0
    a = -fa * ca0
    b = fa * (km + ca0) + vr * vmax * ca0
    c = -vr * vmax * ca0
    disc = math.sqrt(b * b - 4 * a * c)
    roots = [(-b + disc) / (2 * a), (-b - disc) / (2 * a)]
    x = [r for r in roots if 0.0 <= r <= 1.0][0]
    return fa * x * 1000.0                          # mol/s


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def kpi(js, unit, key):
    for u in js.get("units", []):
        if u.get("name") == unit:
            return u.get("kpis", {}).get(key)
    return js.get("kpis", {}).get(unit, {}).get(key)


def expression_only_copy(td):
    """The witness's expression half alone: no code/, so the plain binary runs it."""
    dst = Path(td) / "case"
    shutil.copytree(CASE, dst, ignore=shutil.ignore_patterns(
        "code", "converged", "reports", "design", "*.build"))
    fs = dst / "system/flowsheetDict"
    t = fs.read_text()
    t = re.sub(r"\{\s*name\s+reactorCode;.*?\}\s*(?=\{\s*name\s+reactorExpr)", "", t, flags=re.S)
    fs.write_text(t)
    for s in ("feedCode", "productCode"):
        (dst / "0" / s).unlink()
    rx = dst / "constant/reactions"
    rx.write_text(re.sub(r"\nmm_code\s*\{.*?\n\}\n", "\n", rx.read_text(), flags=re.S))
    return dst


def run(case, binary=SOLVE):
    p = subprocess.run([str(binary), str(case)], capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    fails, notes = [], []
    if not SOLVE.exists():
        print("check_rate_expression: FAIL -- build/linux64Gcc/choupoSolve missing; run `make all`")
        return 1

    # ---- (a) the two routes agree, and both are right -----------------
    b = subprocess.run([str(ROOT / "bin/buildCode"), str(CASE)], capture_output=True, text=True)
    if b.returncode != 0:
        print("check_rate_expression: FAIL -- the witness's code/ did not build "
              "(a check that cannot run must not pass)\n" + b.stdout[-800:] + b.stderr[-800:])
        return 1
    rc, out = run(CASE, CASE / "code/.build/choupoCase")
    js = result_json(out) if rc == 0 else None
    if js is None:
        print(f"check_rate_expression: FAIL -- the witness exited {rc}\n{out[-900:]}")
        return 1
    xc = re.search(r'"xi_mm_code_mol_per_s":\s*([0-9.eE+-]+)', out)
    xe = re.search(r'"xi_mm_expr_mol_per_s":\s*([0-9.eE+-]+)', out)
    if not xc or not xe:
        fails.append("(a) the witness did not publish both extents")
    else:
        xc, xe = float(xc.group(1)), float(xe.group(1))
        exact = closed_form_extent()
        if abs(xc - xe) > 1e-12 * abs(xe):
            fails.append(f"(a) the C++ law gives {xc!r} mol/s and the expression "
                         f"{xe!r} -- one law, two answers")
        for tag, v in (("C++", xc), ("expression", xe)):
            if abs(v - exact) > 1e-9 * exact:
                fails.append(f"(a) the {tag} reactor's extent {v!r} mol/s is not the "
                             f"closed form {exact!r}")
        notes.append(f"the C++ law and the expression agree ({xe:.12g} mol/s) and "
                     "both equal the closed-form Michaelis-Menten CSTR")

    # ---- (b) the formula is printed back as parsed ---------------------
    if "Vmax*c[compA]/(Km + c[compA])" not in out:
        fails.append("(b) the run log does not print the expression back as PARSED")
    if "[0 -3 -1 0 1]" not in out:
        fails.append("(b) the printed law does not carry its dimensions")

    with tempfile.TemporaryDirectory() as td:
        base = expression_only_copy(td)
        rcb, outb = run(base)
        xb = re.search(r'"xi_mm_expr_mol_per_s":\s*([0-9.eE+-]+)', outb)
        if rcb != 0 or not xb:
            fails.append(f"the expression-only copy of the witness did not run (exit {rcb}); "
                         "the probes below would measure nothing\n" + outb[-600:])
            report(fails, notes)
            return 1
        xb = float(xb.group(1))

        def probe(label, edit, expect, must_run=False):
            with tempfile.TemporaryDirectory() as td2:
                dst = Path(td2) / "case"
                shutil.copytree(base, dst, ignore=shutil.ignore_patterns("converged", "reports"))
                rx = dst / "constant/reactions"
                rx.write_text(edit(rx.read_text()))
                rcp, outp = run(dst)
                if must_run:
                    return rcp, outp
                if rcp == 0:
                    fails.append(f"{label}: ran to exit 0 -- no refusal at all")
                elif expect not in outp:
                    fails.append(f"{label}: refused, but the message does not say "
                                 f"`{expect}`.  Got: ...{outp[-300:]}")
                return rcp, outp

        RATE = 'rate    "Vmax * c[compA] / (Km + c[compA])";'
        sub = lambda new: (lambda t: t.replace(RATE, new))

        # ---- (c) precedence and associativity, by value ----------------
        rcp, outp = probe("(c)", sub('rate    "Vmax * c[compA] / (Km + c[compA]) * (2^3^2/512) * (8/4/2) * (-1^2 + 2)";'),
                          "", must_run=True)
        xp = re.search(r'"xi_mm_expr_mol_per_s":\s*([0-9.eE+-]+)', outp)
        if rcp != 0 or not xp or float(xp.group(1)) != xb:
            fails.append("(c) a factor of exactly 1 built from 2^3^2, 8/4/2 and -1^2 "
                         "moved the extent -- the parser does not read precedence or "
                         f"associativity as written (got {xp.group(1) if xp else rcp})")
        else:
            notes.append("precedence held by value (2^3^2 = 512, 8/4/2 = 1, -1^2 = -1)")

        # ---- (d) every refusal, by name --------------------------------
        probe("(d1) unknown symbol", sub('rate    "Vmax * c[compA] / (Km + cA)";'),
              "unknown name `cA`")
        probe("(d2) rate vs basis", sub('rate    "Vmax * c[compA]";'),
              "basis reactorVolume")
        probe("(d3) + across dimensions", sub('rate    "Vmax * c[compA] / (Km + 1)";'),
              "`+` adds quantities of different dimensions")
        probe("(d4) parameter with no unit", lambda t: t.replace(
              "Km    5.0     kmol/m3;", "Km    5.0;"), "carries no unit")
        probe("(d5) exp of a dimensional argument", sub('rate    "Vmax * exp(c[compA])";'),
              "takes a dimensionless argument")
        probe("(d6) unknown function", sub('rate    "Vmax * foo(1)";'),
              "unknown function `foo`")
        probe("(d7) definition cycle", lambda t: t.replace(RATE,
              'definitions { a "b"; b "a"; }\n        ' + RATE), "CYCLE")
        probe("(d8) non-finite value", sub(
              'rate    "Vmax * c[compA] / (Km + c[compA]) * Km / (Km - Km)";'),
              "non-finite")
        #  A DEFINITION that goes non-finite is a separate guard from the rate's
        #  own (S4 disabled it and survived the arm above): the refusal must
        #  name the definition, because that is what the reader goes to fix.
        probe("(d8b) a definition goes non-finite", lambda t: t.replace(RATE,
              'definitions { blowUp "Km / (Km - Km)"; }\n        '
              'rate    "Vmax * c[compA] / (Km + c[compA]) * blowUp / blowUp";'),
              "definition `blowUp`")
        probe("(d9) table read outside its points", lambda t: t.replace(RATE,
              'tables { TT { x ( 300 340 ); xUnit K; f ( 1 1 ); yUnit -; } }\n        '
              'rate    "Vmax * c[compA] / (Km + c[compA]) * f(T)";'),
              "OUTSIDE its declared points")
        probe("(d10) validity declared refuse", lambda t: t.replace(RATE,
              RATE + '\n        validity { Km { max 1 kmol/m3; outside refuse; } }'),
              "REFUSES")
        probe("(d11) per-mass law, no loading", lambda t: t.replace(
              "basis   reactorVolume;", "basis   catalystMass;").replace(
              "Vmax  1.0e-2  kmol/m3/s;", "Vmax  1.0e-2  mol/g/s;").replace(
              "rateConstant { name Vmax;  unit kmol/m3/s; }", ""),
              "declares no `catalystLoading`")
        probe("(d12) syntax error", sub('rate    "Vmax * (c[compA] / (Km + c[compA])";'),
              "expected `)`")
        probe("(d13) a power-law order", lambda t: t.replace(
              "{ component compA;  nu -1; }", "{ component compA;  nu -1; order 1; }", 1),
              "declares `order`")
        probe("(d14) unknown kinetics type", lambda t: t.replace(
              "type    expression;", "type    expresion;"), "Registered")
        notes.append("15 refusals fired by name")

        # ---- (e) a table interpolates linearly and says so -------------
        rcp, outp = probe("(e)", lambda t: t.replace(RATE,
              'tables { TT { x ( 300 400 ); xUnit K; f ( 1 3 ); yUnit -; } }\n        '
              'rate    "Vmax * c[compA] / (Km + c[compA]) * f(T)";'), "", must_run=True)
        xt = re.search(r'"xi_mm_expr_mol_per_s":\s*([0-9.eE+-]+)', outp)
        if rcp != 0 or not xt:
            fails.append(f"(e) the in-span table probe did not run (exit {rcp})")
        else:
            #  f(350 K) = 2 exactly: the CSTR is the same law at twice Vmax.
            vmax, km, vr, fa, vliq = witness_numbers()
            ca0 = 1.0 / vliq / 1000.0
            a = -fa * ca0; bq = fa * (km + ca0) + vr * 2 * vmax * ca0; c = -vr * 2 * vmax * ca0
            d = math.sqrt(bq * bq - 4 * a * c)
            x2 = [r for r in ((-bq + d) / (2 * a), (-bq - d) / (2 * a)) if 0 <= r <= 1][0]
            if abs(float(xt.group(1)) - fa * x2 * 1000.0) > 1e-9 * fa * 1000.0:
                fails.append(f"(e) a table interpolated at its midpoint (f = 2) gave "
                             f"{xt.group(1)} mol/s, not the closed form {fa*x2*1000.0!r}")
            if "LINEARLY INTERPOLATED" not in outp:
                fails.append("(e) the interpolation was not announced")
            else:
                notes.append("a table read at its midpoint doubles the rate exactly, announced")

    return report(fails, notes)


def report(fails, notes):
    if fails:
        print("check_rate_expression: FAILED")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_rate_expression: OK -- " + "; ".join(notes)
          + ".  NOT CHECKED: whether any law is RIGHT (the witness's Vmax and Km "
            "are author-set; the ammonia law's anchors are check_ammonia_rate's), "
            "the batchReactor and dynamicCSTR routes, and the WASM build "
            "(check_wasm_dialect's).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
