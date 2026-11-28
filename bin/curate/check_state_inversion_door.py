#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: units that invert H(T) with their OWN search may only shrink in number.

    bin/curate/check_state_inversion_door.py

THE REAL DEFECT.  2026-11-28: a water letdown through a `valve` (IF97, 450 K,
20 -> 1 bar) did not converge -- the unit published T = 372.76 K with vf = 0
and "Converged: NO".  Its own Newton in T had no root: on a pure fluid's
saturation plateau H(T) jumps by the whole latent heat.  The one home that
handles that state, `flashState::specifiedFlash` (docs/design/
a-general-flash-specification.md, sections 5-6), had existed for weeks while
five units kept a private T-from-H search, each blind to the plateau (the
mixer failed the same way asking IF97 for 175 K; adiabaticFlash reported
"Outer T search converged: NO").  They migrate one per slice.

WHAT IT CHECKS.  Every .cpp under src/unitOperations (SpecifiedFlash.cpp
excepted) that calls a 1-D root finder (newton1D, newton1DSafeguarded,
bisectIncreasing, temperatureOfEnthalpy) AND names an enthalpy target
(Hreq, H_target, h_target, hTarget, H_in, Hin) AND does not call
`specifiedFlash(` is a unit with its own inversion.  The set is pinned in
bin/curate/state_inversion_door.tsv.  A file in the set and not in the pin
FAILS (a new private inversion: route it through specifiedFlash).  A pinned
file that no longer matches is reported so its row is deleted; the pin only
shrinks.  The grep is a census, not a proof: it finds the pattern that bit,
and a unit that hides it behind a helper must be added to the pin by name.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "src" / "unitOperations"
PIN = ROOT / "bin" / "curate" / "state_inversion_door.tsv"
SOLVER = re.compile(r"\b(newton1D|newton1DSafeguarded|bisectIncreasing|temperatureOfEnthalpy)\s*\(")
TARGET = re.compile(r"\b(Hreq|H_target|h_target|hTarget|H_in|Hin)\b")
HOME = re.compile(r"\bspecifiedFlash\s*\(")


def census():
    found = set()
    for p in sorted(SRC.rglob("*.cpp")):
        if p.name == "SpecifiedFlash.cpp":
            continue
        t = p.read_text(errors="replace")
        if SOLVER.search(t) and TARGET.search(t) and not HOME.search(t):
            found.add(str(p.relative_to(ROOT)))
    return found


def pinned():
    rows = set()
    for l in PIN.read_text().splitlines():
        l = l.strip()
        if l and not l.startswith("#"):
            rows.add(l.split("\t")[0])
    return rows


def main():
    now, pin = census(), pinned()
    grown = sorted(now - pin)
    shrunk = sorted(pin - now)
    if grown:
        print("check_state_inversion_door: FAIL -- %d unit file(s) run their own T-from-H search "
              "and are not pinned (route them through flashState::specifiedFlash):" % len(grown))
        for g in grown:
            print("  " + g)
        return 1
    note = (" Pinned but migrated (delete the row): " + ", ".join(shrunk) + ".") if shrunk else ""
    print("check_state_inversion_door: OK -- %d unit file(s) still run their own T-from-H search "
          "(pin %d); none new.%s" % (len(now), len(pin), note))
    return 0


if __name__ == "__main__":
    sys.exit(main())
