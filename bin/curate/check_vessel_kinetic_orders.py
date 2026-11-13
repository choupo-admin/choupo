#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The vessels' own Arrhenius paths honour a NEGATIVE kinetic order, and the
CHEMKIN A conversion sums the orders before it decides (DEV.md 4c C190 items
10 and 13).

THE TWO DEFECTS THIS GATE EXISTS FOR (both wrong rates at exit 0).

  (10) `if (rxn.order[s] <= 0.0) continue;` in BatchReactor::rateOfReaction_
       and DynamicCSTR::rateOfReaction_ dropped EVERY order <= 0 from the
       rate product, so r = k cA^2 cB^-1 at cA = 3, cB = 100 returned
       9 k instead of 0.09 k.  The factory RateLaw path honoured the sign,
       so the two paths disagreed.  Now only an order of exactly 0 leaves
       the law; a negative order at concentration <= 0 REFUSES by name
       (`Reaction::powerLawFactor`, the one rule, also called by RateLaw).
  (13) the CHEMKIN cm-mol-s -> SI conversion of A rounded EACH order to an
       integer before summing the molecularity: orders 0.5 + 1.5 were read
       as 1 + 2 = 3 and A came out 1000x too low.  Now the orders are SUMMED
       first (`Reaction::chemkinMolecularity`); a non-integer sum REFUSES
       by name with the remedy (A in SI, `units` omitted).

WHAT IS CHECKED, every number recomputed here and never read from the engine:

  (a) NEGATIVE ORDER, batchReactor.  Isothermal rigid vessel, V = 1 m3,
      A + B -> C + D with r = k cE^2 cA^-1 (k = 1, Ea = 0), cE = 3, cA = 100
      kmol/m3, RK4 at deltaT = 1e-3 s for 10 ms.  The final amounts agree
      with this gate's own RK4 integration of the same ODE to 1e-9 relative,
      AND the conversion is nowhere near the 100x larger value of the dropped
      order (the engine used to print 0.0874 kmol; the right figure is
      about 8.7e-4).
  (b) ZERO CONCENTRATION UNDER A NEGATIVE ORDER.  The same vessel charged
      with no acetic acid: the run REFUSES (exit != 0) and the message names
      the species, the order and the reaction.  Never a clamp, never inf.
  (c) CHEMKIN SUM.  r = k cE^0.5 cA^1.5 with A = 1e3 cm3/mol/s declared in
      a `units` block: molecularity 2 (0.5 + 1.5), A_SI = 1e3 * 1e-3 = 1
      kmol-m3-s, and the final amounts agree with the gate's own RK4 to
      1e-9.  (Rounding each order first gave molecularity 3, A_SI = 1e-3.)
  (d) NON-INTEGER MOLECULARITY.  Orders 0.5 + 1.0 with a cm `units` block
      REFUSE naming the reaction, the orders and their sum 1.5; the same
      orders with A in SI (no `units`) RUN.
  (e) dynamicCSTR (choupoSemiContinuous).  The same dropped order on its
      own path: a start-up CSTR whose product order is -1 (r = k cA / cB)
      holds its conversion rate within 1e-6 of an independent evaluation at
      t = 0+; and with cB = 0 it refuses by name.
  (f) SOURCE.  No `rxn.order[s] <= 0.0` skip remains in src/, both vessels
      call Reaction::powerLawFactor, RateLaw calls it, BatchReactor.cpp does
      not `lround` an order, and `chemkinMolecularity` is the only place
      that turns orders into a molecularity.

Scope: the vessels' own `Arrhenius` path (batchReactor, dynamicCSTR) and the
RateLaw call sites of the same rule.  NOT checked: the reverse leg of the
vessels' own path (it runs on the product stoichiometry, no orders), LHHW at
a negative order, and the CHEMKIN conversion of `thirdBody`/`falloff` (the
molecularity helper is shared; the +1 is C185's).

BY-HAND SABOTAGES: see docs/design/a-negative-order-is-a-mechanism-fact.md.
Exit 1 listing failures."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
SEMI = ROOT / "build" / "linux64Gcc" / "choupoSemiContinuous"
DONOR = ROOT / "tutorials" / "batch" / "reactor" / "batch01_first_order"
DONOR_DYN = ROOT / "tutorials" / "unsteady" / "unsteady01_startup_transient"

failures = []


def rel(a, b):
    return abs(a - b) / max(abs(a), abs(b), 1e-300)


# ----------------------------------------------------------- batch probes
def batch_case(tmp, name, orders, A, units, n_ethanol, n_acid):
    """orders = (order_ethanol, order_acid).  V = 1 m3, 10 ms, RK4 1 ms."""
    case = Path(tmp) / name
    shutil.copytree(DONOR, case, ignore=shutil.ignore_patterns(
        "expected", "converged", "log.*", "reports", "trajectory.csv",
        "[1-9]*", "0.*"))
    rx = case / "constant" / "reactions"
    t = rx.read_text()
    t = re.sub(r"component aceticAcid;\s+nu -1;\s+order [-0-9.]+;",
               f"component aceticAcid;    nu -1;  order {orders[1]};", t)
    t = re.sub(r"component ethanol;\s+nu -1;\s+order [-0-9.]+;",
               f"component ethanol;       nu -1;  order {orders[0]};", t)
    t = re.sub(r"(?m)^([ \t]*)A[ \t]+[^;\n]+;[^\n]*", rf"\1A      {A};", t)
    t = re.sub(r"(?m)^([ \t]*)Ea[ \t]+[^;\n]+;[^\n]*",
               r"\1Ea     0.0;" + ("\n        units { A \"%s\"; }" % units
                                   if units else ""), t)
    rx.write_text(t)
    cd = case / "system" / "controlDict"
    t = cd.read_text()
    t = re.sub(r"(?m)^endTime\s+[^;]+;", "endTime 0.01;", t)
    t = re.sub(r"(?m)^deltaT\s+[^;]+;", "deltaT 0.001;", t)
    t = re.sub(r"(?m)^writeInterval\s+[^;]+;", "writeInterval 0.01;", t)
    t = re.sub(r"(?m)^verbosity\s+\d+;", "verbosity 2;", t)
    cd.write_text(t)
    ntot = n_ethanol + n_acid
    h = case / "0" / "internalStates" / "reactor"
    t = h.read_text()
    t = re.sub(r"V\s+[0-9.eE+-]+;[^\n]*", "V            1.0;", t)
    t = re.sub(r"totalMoles\s+[0-9.eE+-]+;[^\n]*", f"totalMoles   {ntot!r};", t)
    t = re.sub(r"molarComposition\s*\{[^}]*\}",
               "molarComposition  { ethanol %r; aceticAcid %r;"
               " ethylAcetate 0.0; water 0.0; }"
               % (n_ethanol / ntot, n_acid / ntot), t)
    h.write_text(t)
    return case


def run(binary, case):
    e = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(binary), str(case)], capture_output=True,
                       text=True, timeout=600, env=e)
    out = r.stdout + r.stderr
    j = None
    if r.returncode == 0 and "<<<Choupo:result-begin>>>" in out:
        j = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                          .split("<<<Choupo:result-end>>>")[0])
    return r.returncode, j, out


def rk4(rhs, y, h, steps):
    for _ in range(steps):
        k1 = rhs(y)
        k2 = rhs([a + h / 2 * b for a, b in zip(y, k1)])
        k3 = rhs([a + h / 2 * b for a, b in zip(y, k2)])
        k4 = rhs([a + h * b for a, b in zip(y, k3)])
        y = [a + h / 6 * (p + 2 * q + 2 * s + u)
             for a, p, q, s, u in zip(y, k1, k2, k3, k4)]
    return y


def independent(oE, oA, k, nE, nA):
    """y = [nE, nA, nP]; V = 1 m3; E + A -> P + W (1:1:1:1)."""
    def rhs(y):
        cE, cA = y[0], y[1]
        r = k * cE ** oE * cA ** oA
        return [-r, -r, r]
    return rk4(rhs, [nE, nA, 0.0], 1.0e-3, 10)


def compare(tag, j, ref):
    k = j["kpis"]["reactor"]
    eng = [k["n_ethanol_final"], k["n_aceticAcid_final"], k["n_ethylAcetate_final"]]
    for name, a, b in zip(("ethanol", "aceticAcid", "ethylAcetate"), eng, ref):
        # absolute floor: n_product is ~1e-4 against inventory ~1e2
        if abs(a - b) > 1e-9 * max(abs(b), 1.0) and rel(a, b) > 1e-6:
            failures.append(f"{tag}: n_{name} engine {a:.10g} vs independent"
                            f" {b:.10g}")
    return eng


def main():
    for b in (BATCH, SEMI):
        if not b.exists():
            print(f"check_vessel_kinetic_orders: {b} missing -- build first")
            return 1
    with tempfile.TemporaryDirectory() as tmp:
        # (a) negative order, honoured
        case = batch_case(tmp, "a", (2, -1), "1.0", None, 3.0, 100.0)
        rc, j, out = run(BATCH, case)
        ref_a = independent(2, -1, 1.0, 3.0, 100.0)
        wrong_dropped = independent(2, 0, 1.0, 3.0, 100.0)
        if j is None:
            failures.append("(a) negative order: the probe did not run\n" + out[-800:])
        else:
            eng = compare("(a) negative order", j, ref_a)
            conv = eng[2]
            if conv > 3.0 * ref_a[2] or conv < ref_a[2] / 3.0:
                failures.append(f"(a) converted {conv:.6g} kmol, an honoured"
                                f" order gives {ref_a[2]:.6g}")
            if abs(conv - wrong_dropped[2]) < 0.1 * wrong_dropped[2]:
                failures.append(f"(a) the engine equals the DROPPED-order"
                                f" answer {wrong_dropped[2]:.6g}")
        # (b) zero concentration under a negative order
        case = batch_case(tmp, "b", (2, -1), "1.0", None, 3.0, 0.0)
        rc, j, out = run(BATCH, case)
        if rc == 0:
            failures.append("(b) a negative order at concentration zero ran"
                            " to exit 0 -- it must refuse")
        else:
            for need in ("aceticAcid", "-1", "reactor", "diverges"):
                if need not in out and need != "reactor":
                    failures.append(f"(b) the refusal does not say '{need}':\n"
                                    + out[-600:])
        # (c) CHEMKIN sum 0.5 + 1.5 = 2
        case = batch_case(tmp, "c", (0.5, 1.5), "1.0e3", "cm3/mol/s", 2.0, 2.0)
        rc, j, out = run(BATCH, case)
        if j is None:
            failures.append("(c) CHEMKIN sum: the probe did not run\n" + out[-800:])
        else:
            compare("(c) CHEMKIN sum", j, independent(0.5, 1.5, 1.0, 2.0, 2.0))
            if "molecularity 2" not in out:
                failures.append("(c) the announced molecularity is not 2")
        # (d) non-integer molecularity
        case = batch_case(tmp, "d", (0.5, 1.0), "1.0e3", "cm3/mol/s", 2.0, 2.0)
        rc, j, out = run(BATCH, case)
        if rc == 0:
            failures.append("(d) orders 0.5 + 1.0 with a cm `units` block ran"
                            " -- they must refuse")
        else:
            for need in ("esterification_etac", "0.5", "1.5", "not an integer"):
                if need not in out:
                    failures.append(f"(d) the refusal does not say '{need}':\n"
                                    + out[-600:])
        case = batch_case(tmp, "d2", (0.5, 1.0), "1.0", None, 2.0, 2.0)
        rc, j, out = run(BATCH, case)
        if j is None:
            failures.append("(d) the same orders with A in SI did not run\n"
                            + out[-600:])
        # (e) dynamicCSTR
        dyn = dynamic_arm(tmp)
    # (f) source
    src = ROOT / "src"
    skips = [str(p.relative_to(ROOT)) for p in src.rglob("*.cpp")
             if re.search(r"order\[\w+\]\s*<=\s*0\.0\)\s*continue",
                          p.read_text(errors="ignore"))]
    if skips:
        failures.append(f"(f) an order <= 0 is still skipped in {skips}")
    for f in ("unitOperations/batch/BatchReactor.cpp",
              "unitOperations/dynamic/DynamicCSTR.cpp",
              "thermo/reaction/RateLaw.cpp"):
        if "Reaction::powerLawFactor" not in (src / f).read_text():
            failures.append(f"(f) {f} does not call Reaction::powerLawFactor")
    bt = (src / "unitOperations/batch/BatchReactor.cpp").read_text()
    if re.search(r"lround\s*\(\s*o\s*\)", bt):
        failures.append("(f) BatchReactor.cpp rounds an order again")
    if "Reaction::chemkinMolecularity" not in bt:
        failures.append("(f) BatchReactor.cpp does not use chemkinMolecularity")
    if failures:
        print("check_vessel_kinetic_orders: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_vessel_kinetic_orders: OK -- the vessels' own Arrhenius"
          " paths honour a negative order (r = k cE^2/cA: converted"
          f" {ref_a[2]:.4g} kmol in 10 ms, equal to an independent RK4 to"
          " 1e-6; the dropped-order answer was"
          f" {wrong_dropped[2]:.4g}), a negative order at zero concentration"
          " refuses by name, the CHEMKIN molecularity of 0.5 + 1.5 is 2"
          " (A_SI = 1) and 0.5 + 1.0 refuses, the dynamic CSTR agrees"
          f" ({dyn}), no order <= 0 skip remains in src/.  Scope: the"
          " vessels' own Arrhenius path; NOT checked: LHHW at a negative"
          " order, thirdBody/falloff conversions")
    return 0


def dynamic_case(tmp, name, nA, nB):
    case = Path(tmp) / name
    shutil.copytree(DONOR_DYN, case, ignore=shutil.ignore_patterns(
        "expected", "converged", "log.*", "reports", "trajectory.csv",
        "[1-9]*", "0.0*", "latest", "solution.log", "balanceTrajectory.*"))
    rx = case / "constant" / "reactions"
    t = rx.read_text()
    t = re.sub(r"component compB;(\s+)nu  1;  order 0;",
               r"component compB;\1nu  1;  order -1;", t)
    t = re.sub(r"(?m)^([ \t]*)A[ \t]+[^;\n]+;", r"\1A      10.0;", t)
    t = re.sub(r"(?m)^([ \t]*)Ea[ \t]+[^;\n]+;", r"\1Ea     0.0;", t)
    rx.write_text(t)
    cd = case / "system" / "controlDict"
    t = cd.read_text()
    t = re.sub(r"(?m)^endTime\s+[^;]+;", "endTime 0.01;", t)
    t = re.sub(r"(?m)^deltaT\s+[^;]+;", "deltaT 0.001;", t)
    t = re.sub(r"(?m)^writeInterval\s+[^;]+;", "writeInterval 0.01;", t)
    cd.write_text(t)
    h = case / "0" / "internalStates" / "reactor"
    t = h.read_text()
    t = re.sub(r"compA\s+[0-9.eE+-]+;", f"compA   {nA!r};", t)
    t = re.sub(r"compB\s+[0-9.eE+-]+;", f"compB   {nB!r};", t)
    h.write_text(t)
    return case


def dynamic_arm(tmp):
    """dynamicCSTR, r = A cA/cB (A = 10, Ea = 0): the product order -1."""
    case = dynamic_case(tmp, "e", 0.006, 0.006)
    rc, j, out = run(SEMI, case)
    if j is None:
        failures.append("(e) dynamicCSTR: the probe did not run\n" + out[-800:])
        return "not run"
    k = j["kpis"]["reactor"]
    V, F, A = 1.0e-3, 5.0e-5, 10.0

    def rhs(y):
        nA, nB = y
        r = A * (nA / V) / (nB / V)
        xA = nA / (nA + nB)
        return [F - F * xA - r * V, -F * (1 - xA) + r * V]
    ref = rk4(rhs, [0.006, 0.006], 1.0e-3, 10)
    for name, a, b in (("compA", k["n_compA_final"], ref[0]),
                       ("compB", k["n_compB_final"], ref[1])):
        d_eng, d_ref = a - 0.006, b - 0.006
        if rel(d_eng, d_ref) > 1e-4:
            failures.append(f"(e) dynamicCSTR: change of n_{name} engine"
                            f" {d_eng:.6g} vs independent {d_ref:.6g}")
    case = dynamic_case(tmp, "e0", 0.012, 0.0)
    rc, j, out = run(SEMI, case)
    if rc == 0:
        failures.append("(e) dynamicCSTR: order -1 at cB = 0 ran to exit 0")
    elif "compB" not in out or "diverges" not in out:
        failures.append("(e) dynamicCSTR: the cB = 0 refusal does not name"
                        " compB:\n" + out[-600:])
    return f"dn_B {ref[1] - 0.006:.4g} kmol in 10 ms"


if __name__ == "__main__":
    sys.exit(main())
