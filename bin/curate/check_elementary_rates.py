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

NOT CHECKED: the Troe broadening (F is not 1 only with a `troe` list; the witnesses
have none), a mole-changing reaction, CHEMKIN laws in `dynamicCSTR`, and the
engine's Kc itself (held by the reversible-reaction gates).
"""
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

    return gatekit.verdict(
        "check_elementary_rates", failures,
        "the CHEMKIN laws modifiedArrhenius, thirdBody and falloff in a pfr equal the Arrhenius law they stand "
        "for (3 pairs, max relative outlet difference "
        + ", ".join(nums) + f"; tol {TOL:g}); a unit factor 10^3 off is seen",
    )


if __name__ == "__main__":
    sys.exit(main())
