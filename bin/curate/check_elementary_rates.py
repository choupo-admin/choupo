#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the CHEMKIN laws in a continuous reactor equal the Arrhenius law they stand for.

    bin/curate/check_elementary_rates.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  Slice 1 of bin/curate/chemkin_to_choupo.py
converted a CHEMKIN A (cm3/mol/s) to mol/m3 with x1e-6 per order, while the batch
reactor reads kmol/m3 and converts with x1e-3 per order: an imported mechanism ran
10^3 per order too fast or too slow depending on the vessel, at exit 0, with every
closure green (a wrong rate constant is a legal rate constant).  Slice 3 puts the
same three words into the `cstr` / `pfr` (class ElementaryRate), whose amount unit
is mol, so the conversion is now done in TWO bases by two readers of one file.  A
golden cannot see it: it pins what a run prints.

WHAT THIS GATE CHECKS, every pair run through choupoSolve (tutorials/steady/reactors):

  elementary01a/b  modifiedArrhenius A T^b exp(-Ea/RT), second order, cm3/mol/s and
                   kcal/mol       vs  Arrhenius(A 1e-6 T^b, Ea in J)
  elementary02a/b  thirdBody with efficiency 2 on both species, reversible, cm6/mol2/s
                   vs  Arrhenius(A 1e-6 T^b [M])  with [M] = 2 P/(R T)
  elementary03a/b  falloff (Lindemann, no troe), reversible, kInf in 1/s and kLow in
                   cm6/mol2/s     vs  Arrhenius(kInf Pr/(1+Pr))

Each pair is an isothermal, isobaric gas isomerisation with no mole change, so
[M] = P/(R T) is constant along the bed and the two sides are the SAME ODE: the
outlet compositions must agree to 1e-9 relative, and must differ from the feed
(a pair that did not react would agree trivially).

  SABOTAGE ARM.  The CHEMKIN side of elementary02 is rerun with its A multiplied by
  1e3 (exactly the defect above: one order's conversion off by 10^3); the pair must
  then DISAGREE by far more than 1e-9, so the comparison has teeth.

THE CHEMKIN FORMS OF 2026-11-21 (Theory Guide sec:elementary-rate).  THE REAL DEFECT: before
that slice a `sri ( ... )` list or a `defaultEfficiency` key in a reactions file was IGNORED by
both readers (the batch vessel's own fall-off and ElementaryRate) -- the reaction ran on
Lindemann, or on [M] = sum c, at exit 0 -- and the importer refused every such reaction of a
real mechanism (41 of AramcoMech 1.3's 1542).  Arms, each on a private copy:

  (s) SRI, HAND VALUE.  elementary03a with `sri ( 0.45 797 979 1.2 0.1 );` against
      elementary03b whose A is the hand k = kInf Pr/(1+Pr) F, F = d [a exp(-b/T) +
      exp(-T/c)]^X T^e, X = 1/(1+log10(Pr)^2), computed HERE: outlets to 1e-9, and the
      SRI run must differ from the Lindemann one (F != 1, else the arm proves nothing).
  (d) defaultEfficiency.  elementary02a with `thirdBody { nButane 2.0; }
      defaultEfficiency 2.0;` (isoButane unlisted) equals elementary02a to 1e-12.
  (b) A SPECIES ON BOTH SIDES = A SINGLE COLLIDER, in the pfr.  nButane + nButane <=>
      isoButane + nButane (nButane order 2, orderRev 1, nu -1; modifiedArrhenius) against
      the thirdBody law with `thirdBody { nButane 1; } defaultEfficiency 0;`: the same ODE
      (k c_n c_n - k/Kc c_n c_iso), outlets to 1e-9.
  (B) THE SAME IN THE BATCH VESSEL.  ignition01_h2o2 with R8 written H + OH + N2 <=> H2O +
      N2 (N2 order 1, orderRev 1, nu 0) against R8 as `type thirdBody` on the single
      collider N2: every KPI equal to 1e-12 relative (measured: identical), through an
      ignition.
  SABOTAGE-VERIFIED 2026-11-21 (by hand in a copy of the tree, rebuilt): ElementaryRate's kEff
  without `sri_` -- (s) FAILS, outlets 1.75e-1 apart and "F was not applied"; the batch reverse
  leg read on nu instead of orderRev -- (B) FAILS (the both-sides run is refused by its own
  Jacobian audit).

NOT CHECKED: the Troe broadening (F is not 1 only with a `troe` list; the witnesses
have none), a mole-changing reaction, CHEMKIN laws in `dynamicCSTR`, and the
engine's Kc itself (held by the reversible-reaction gates).  Explicit FORD orders need no
engine change (a declared `order` was always honoured on an irreversible reaction); the
importer's reading of them is held by `chemkin_to_choupo.py --selftest`, the derivative by
check_kinetics_jacobian (e).
"""
import math
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

REACTORS = "tutorials/steady/reactors/"
PAIRS = [
    ("elementary01a_modArrhenius_chemkin", "elementary01b_modArrhenius_arrhenius"),
    ("elementary02a_thirdBody_chemkin", "elementary02b_thirdBody_arrhenius"),
    ("elementary03a_falloff_chemkin", "elementary03b_falloff_arrhenius"),
]
TOL = 1.0e-9
STRIP = ("expected", "converged", "constant/propertyManifest")


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def rel(x, y):
    return abs(x - y) / max(abs(y), 1e-300)


def main():
    failures = []
    solve = gatekit.binary("choupoSolve")
    outs = {}
    for a, b in PAIRS:
        for name in (a, b):
            with gatekit.probe_copy(REACTORS + name, strip=STRIP) as c:
                rc, out = gatekit.run(solve, c)
            if rc != 0:
                failures.append(f"{name}: did not run (exit {rc}): " + " | ".join(out.strip().splitlines()[-3:]))
                outs[name] = None
            else:
                outs[name] = out

    def compare(a_out, b_out, label):
        """-> ((worst relative outlet difference, worst k difference, z of a), error)."""
        ja, jb = result(a_out), result(b_out)
        try:
            za = ja["streams"]["product"]["composition"]
            zb = jb["streams"]["product"]["composition"]
            ka = ja["kpis"]["reactor"]["k_isom"]
            kb = jb["kpis"]["reactor"]["k_isom"]
        except (TypeError, KeyError):
            return None, f"{label}: no product composition / k_isom in the result JSON"
        return (max(rel(za[k], zb[k]) for k in zb), rel(ka, kb), za), None

    nums = []
    for a, b in PAIRS:
        if outs[a] is None or outs[b] is None:
            continue
        r, err = compare(outs[a], outs[b], a)
        if err:
            failures.append(err)
            continue
        worst, kdiff, za = r
        if worst > TOL:
            failures.append(f"{a} vs {b}: product compositions differ by {worst:.3e} relative (> {TOL:g})")
        if kdiff > TOL:
            failures.append(f"{a} vs {b}: the reported rate constant k_isom differs by {kdiff:.3e} relative")
        feed_n = 1.0
        zn = za.get("nButane", None)
        if zn is None or abs(zn - feed_n) < 1e-3:
            failures.append(f"{a}: the bed did not react (z nButane = {zn}); an unreacted pair agrees trivially")
        nums.append(f"{a.split('_')[0]} {worst:.1e}")

    # sabotage arm: the CHEMKIN A of elementary02 off by 10^3
    a, b = PAIRS[1]
    if outs[b] is not None:
        with gatekit.probe_copy(REACTORS + a, strip=STRIP) as c:
            try:
                gatekit.edit(c / "constant/reactions", "A      3.0e8;", "A      3.0e11;")
            except gatekit.EditNotApplied as e:
                failures.append(f"sabotage arm: {e}")
            else:
                rc, out = gatekit.run(solve, c)
                if rc != 0:
                    failures.append(f"sabotage arm: the sabotaged case did not run (exit {rc})")
                else:
                    r, err = compare(out, outs[b], "sabotage")
                    if err:
                        failures.append(err)
                    elif r[0] < 1.0e-4:
                        failures.append(f"sabotage arm: a rate constant 10^3 off moved the outlet by only "
                                        f"{r[0]:.2e} -- the comparison cannot see a unit-factor defect")

    # ---- the CHEMKIN forms of 2026-11-21 ------------------------------------------------
    def run_solve(name, edits):
        with gatekit.probe_copy(REACTORS + name, strip=STRIP) as c:
            for old_, new_ in edits:
                gatekit.edit(c / "constant/reactions", old_, new_)
            rc, out = gatekit.run(solve, c)
        if rc != 0:
            raise gatekit.GateRefusal(f"{name} probe did not run (exit {rc}): "
                                      + " | ".join(out.strip().splitlines()[-3:])[:500])
        return out

    def outlet(out):
        j = result(out)
        return j["streams"]["product"]["composition"]

    def worst(za, zb):
        return max(rel(za[k], zb[k]) for k in zb)

    forms = []
    try:
        # (s) SRI hand value
        R, T, P = 8.314462618, 900.0, 3.0e5
        a_, b_, c_, d_, e_ = 0.45, 797.0, 979.0, 1.2, 0.1
        kinf = 20.0 * T ** 0.3 * math.exp(-10.0 * 4184.0 / (R * T))
        klow = 2.0e5 * 1.0e-6 * math.exp(-5.0 * 4184.0 / (R * T))
        M = P / (R * T)
        Pr = klow * M / kinf
        X = 1.0 / (1.0 + math.log10(Pr) ** 2)
        F = d_ * (a_ * math.exp(-b_ / T) + math.exp(-T / c_)) ** X * T ** e_
        k_sri = kinf * Pr / (1.0 + Pr) * F
        o_sri = run_solve("elementary03a_falloff_chemkin",
                          [("    }\n}", "        sri ( 0.45 797 979 1.2 0.1 );\n    }\n}")])
        o_hand = run_solve("elementary03b_falloff_arrhenius",
                           [("A      0.26428597010565014;", "A      %.17g;" % k_sri)])
        w = worst(outlet(o_sri), outlet(o_hand))
        if w > TOL:
            failures.append(f"(s) SRI fall-off vs its hand value k = {k_sri:.10g} 1/s: outlets differ by {w:.3e}")
        if outs[PAIRS[2][0]] is not None and worst(outlet(o_sri), outlet(outs[PAIRS[2][0]])) < 1e-6:
            failures.append("(s) the SRI run equals the Lindemann run: F was not applied")
        forms.append(f"SRI vs hand (F = {F:.6f}) {w:.1e}")
        # (d) defaultEfficiency
        o_def = run_solve("elementary02a_thirdBody_chemkin",
                          [("thirdBody { nButane 2.0; isoButane 2.0; }",
                            "thirdBody { nButane 2.0; }  defaultEfficiency 2.0;")])
        if outs[PAIRS[1][0]] is not None:
            w = worst(outlet(o_def), outlet(outs[PAIRS[1][0]]))
            if w > 1e-12:
                failures.append(f"(d) an unlisted species did not take defaultEfficiency: outlets differ by {w:.3e}")
            forms.append(f"defaultEfficiency {w:.1e}")
        # (b) both sides vs a single collider, in the pfr
        st_old = """        { component nButane;    nu -1;  order 1; }
        { component isoButane;  nu  1;  order 0; }"""
        o_both = run_solve("elementary02a_thirdBody_chemkin", [
            (st_old, """        { component nButane;    nu -1;  order 2;  orderRev 1; }
        { component isoButane;  nu  1;  order 0; }"""),
            ("type   thirdBody;", "type   modifiedArrhenius;"),
            ("        thirdBody { nButane 2.0; isoButane 2.0; }\n", "")])
        o_coll = run_solve("elementary02a_thirdBody_chemkin",
                           [("thirdBody { nButane 2.0; isoButane 2.0; }",
                             "thirdBody { nButane 1.0; }  defaultEfficiency 0;")])
        w = worst(outlet(o_both), outlet(o_coll))
        if w > TOL:
            failures.append(f"(b) pfr: nButane on both sides vs the single collider nButane: outlets differ by {w:.3e}")
        forms.append(f"pfr both sides = single collider {w:.1e}")
    except (gatekit.GateRefusal, gatekit.EditNotApplied, KeyError, TypeError) as e:
        failures.append(f"CHEMKIN-form arms: {e}")

    # (B) the batch vessel: R8 on both sides = R8 on the single collider N2
    batch = gatekit.binary("choupoBatch")
    r8_old = """        { component H;      nu -1;  order 1; }
        { component OH;     nu -1;  order 1; }
        { component water;  nu  1;  order 0; }
    );
    kinetics
    {
        type thirdBody;
        A 4.5000e+22;  b -2.0;  Ea 0.0;
        thirdBody { water 12.0; H2 0.73; }"""
    r8_both = """        { component H;      nu -1;  order 1; }
        { component N2;     nu  0;  order 1;  orderRev 1; }
        { component OH;     nu -1;  order 1; }
        { component water;  nu  1;  order 0; }
    );
    kinetics
    {
        type modifiedArrhenius;
        A 4.5000e+22;  b -2.0;  Ea 0.0;"""
    r8_coll = r8_old.replace("thirdBody { water 12.0; H2 0.73; }", "thirdBody { N2 1.0; }  defaultEfficiency 0;")
    kb = {}
    for label, new_ in (("both", r8_both), ("collider", r8_coll)):
        with gatekit.probe_copy("tutorials/batch/combustion/ignition01_h2o2",
                                strip=("expected", "latest", "solution.log", "trajectory.csv")) as c:
            try:
                gatekit.edit(c / "constant/reactions", r8_old, new_)
            except gatekit.EditNotApplied as e:
                failures.append(f"(B) {e}")
                continue
            rc, out = gatekit.run(batch, c)
            j = result(out)
            if rc != 0 or not j:
                failures.append(f"(B) ignition01_h2o2 with R8 {label} did not run (exit {rc})")
                continue
            kb[label] = j["kpis"]["bomb"]
    if len(kb) == 2:
        num = [k for k, v in kb["both"].items() if isinstance(v, (int, float)) and not isinstance(v, bool)]
        wb = max((abs(kb["both"][k] - kb["collider"][k]) / max(abs(kb["both"][k]), 1e-300)
                  for k in num if k in kb["collider"]), default=1.0)
        if wb > 1e-12 or not num:
            failures.append(f"(B) batch: R8 with N2 on both sides vs on the single collider N2: KPIs differ by {wb:.3e}")
        forms.append(f"batch both sides = single collider {wb:.1e} ({len(num)} KPIs)")

    return gatekit.verdict(
        "check_elementary_rates", failures,
        "the CHEMKIN laws modifiedArrhenius, thirdBody and falloff in a pfr equal the Arrhenius law they stand "
        "for (3 pairs, max relative outlet difference "
        + ", ".join(nums) + f"; tol {TOL:g}); a unit factor 10^3 off is seen; the CHEMKIN forms: "
        + "; ".join(forms),
    )


if __name__ == "__main__":
    sys.exit(main())
