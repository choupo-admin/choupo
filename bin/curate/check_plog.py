#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the PLOG pressure-dependent rate law reads its table the way CHEMKIN does.

    bin/curate/check_plog.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  `type plog` interpolates a rate constant
between tabulated pressures.  Interpolating k itself instead of ln k, or in P
instead of ln P, gives a PLAUSIBLE rate (a few tens of percent off between two
lines, exact at the lines), and taking only the last of several lines written at
one pressure gives another plausible one.  Every closure stays green and no golden
can see it: a golden pins what a run prints.  Only a value computed by hand from
the definition catches it, so the witnesses are built so that the right answer is
a hand value that is ALSO the law of an existing, independently-read case.

WHAT THIS GATE CHECKS (choupoSolve, tutorials/steady/reactors).  Four pfr cases in an
isothermal, isobaric 900 K / 3 bar gas bed, nButane => isoButane, second order, all
of whose tables give, at P = 3 bar, the SAME k as elementary01a (modifiedArrhenius,
A = 1.2e7 cm3/mol/s, b = 1.5, Ea = 30 kcal/mol, k = 0.016814971049578225 m3/mol/s):

  plog01_onePressure   one line (at 1 atm, below the bed): k is that line's, no extrapolation
  plog02_atTabulated   P exactly at a tabulated pressure: that line's k
  plog03_midway        1 bar (0.6e7) and 9 bar (2.4e7): 3 bar is midway in ln P, so k is the
                       geometric mean, A = 1.2e7 (k linear in ln P would give 1.5e7, ln k
                       linear in P 0.85e7)
  plog04_sameP         two lines at 3 bar (0.5e7 + 0.7e7): SUMMED, A = 1.2e7

Each reported k_isom must equal the hand value 0.016814971049578225 to 1e-9 AND the
outlet composition must equal elementary01a's to 1e-9 (the bed must have reacted).

  SABOTAGE ARMS.  plog03 is rerun with its 9 bar line at A = 3.0e7 and plog04 with
  one of its two 3 bar lines deleted (the defects above, in the data): each must then
  DISAGREE with the hand value by far more than 1e-9, so the comparison has teeth.
  (The engine-side sabotage, k interpolated linearly instead of ln k, was run by hand
  when the gate was written: plog03 then failed at 25 %; recorded in the review.)

NOT CHECKED: the Cantera comparison along an ignition (docs/reviews/2026-11-19-chemkin-
real-mechanism/REPORT.md section 8, run by hand: Cantera is not a dependency), a
reversible PLOG reaction, PLOG in a batch vessel (the hand run), P in other units.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

REACTORS = "tutorials/steady/reactors/"
REF = "elementary01a_modArrhenius_chemkin"
CASES = ["plog01_onePressure", "plog02_atTabulated", "plog03_midway", "plog04_sameP"]
K_HAND = 0.016814971049578225
TOL = 1.0e-9
STRIP = ("expected", "converged", "constant/propertyManifest")


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def rel(x, y):
    return abs(x - y) / max(abs(y), 1e-300)


def read(out):
    j = result(out)
    try:
        return j["streams"]["product"]["composition"], j["kpis"]["reactor"]["k_isom"]
    except (TypeError, KeyError):
        return None


def main():
    failures = []
    solve = gatekit.binary("choupoSolve")

    def run(name, edits=()):
        with gatekit.probe_copy(REACTORS + name, strip=STRIP) as c:
            for old, new in edits:
                gatekit.edit(c / "constant/reactions", old, new)
            rc, out = gatekit.run(solve, c)
        return rc, out

    rc, out = run(REF)
    ref = read(out) if rc == 0 else None
    if ref is None:
        return gatekit.verdict("check_plog", [f"{REF}: did not run / no result (exit {rc})"], "")
    z_ref, k_ref = ref
    if rel(k_ref, K_HAND) > 1e-6:
        failures.append(f"{REF}: k_isom {k_ref} is not the hand value {K_HAND}")
    if abs(z_ref.get("nButane", 1.0) - 1.0) < 1e-3:
        failures.append(f"{REF}: the bed did not react; an unreacted comparison agrees trivially")

    worst = {}
    for name in CASES:
        rc, out = run(name)
        r = read(out) if rc == 0 else None
        if r is None:
            failures.append(f"{name}: did not run / no result (exit {rc}): " + " | ".join(out.strip().splitlines()[-2:]))
            continue
        z, k = r
        dz = max(rel(z[s], z_ref[s]) for s in z_ref)
        dk = rel(k, K_HAND)
        worst[name] = max(dz, dk)
        if dk > TOL:
            failures.append(f"{name}: k_isom {k:.15g} differs from the hand value {K_HAND:.15g} by {dk:.2e} relative")
        if dz > TOL:
            failures.append(f"{name}: outlet differs from {REF} by {dz:.2e} relative")

    sab = [
        ("plog03_midway", [("A 2.4e7", "A 3.0e7")], "9 bar line 25 % high"),
        ("plog04_sameP", [("{ P 3 bar;  A 0.7e7; b 1.5; Ea 30.0; }", "")], "one of the two 3 bar lines dropped"),
    ]
    for name, edits, what in sab:
        try:
            rc, out = run(name, edits)
        except gatekit.EditNotApplied as e:
            failures.append(f"sabotage arm {name}: {e}")
            continue
        r = read(out) if rc == 0 else None
        if r is None:
            failures.append(f"sabotage arm {name}: the sabotaged case did not run (exit {rc})")
        elif rel(r[1], K_HAND) < 1.0e-3:
            failures.append(f"sabotage arm {name} ({what}): k moved by only {rel(r[1], K_HAND):.1e} "
                            "-- the comparison cannot see a table defect")

    return gatekit.verdict(
        "check_plog", failures,
        "PLOG equals its hand values in a pfr: one line, a tabulated pressure, midway in ln P and two lines at one "
        "pressure summed (max relative difference "
        + ", ".join(f"{n.split('_')[0]} {v:.1e}" for n, v in worst.items())
        + f"; tol {TOL:g}); a 25 % table defect and a dropped line are seen",
    )


if __name__ == "__main__":
    sys.exit(main())
