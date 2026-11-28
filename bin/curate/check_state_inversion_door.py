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

WHAT IT CHECKS.  Every FUNCTION in a .cpp or .H under src/unitOperations
(SpecifiedFlash.cpp excepted) that calls a 1-D root finder (newton1D,
newton1DSafeguarded, bisectIncreasing, temperatureOfEnthalpy) AND names an
enthalpy target (Hreq, H_target, h_target, hTarget, H_in, Hin, or any Hout /
Hfeed / Hspec / Hset / hout / hspec / hset / hfeed / hspecified, or a
`temperatureOfEnthalpy(scalar h` parameter) AND does not itself call
`specifiedFlash(` is an inversion of its own; the file holding it is in the
census.  (Per function, not per file: one call to the home elsewhere in a file
does not excuse another function's private search.)  The set is pinned in
bin/curate/state_inversion_door.tsv.  A file in the census and not in the pin
FAILS (a new private inversion: route it through specifiedFlash).  A pinned
file that no longer matches FAILS too (a stale row: delete it; the pin only
shrinks).  CENSUS CORRECTION 2026-11-28: widening the target names and
scanning .H files (review of the valve migration) can add rows once; that
corrects the census, it is not a regression.  The grep is a census, not a
proof: a unit that hides the search behind a helper must be added by name.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "src" / "unitOperations"
PIN = ROOT / "bin" / "curate" / "state_inversion_door.tsv"
SOLVER = re.compile(r"\b(newton1D|newton1DSafeguarded|bisectIncreasing|temperatureOfEnthalpy)\s*\(")
TARGET = re.compile(r"\b(Hreq|H_target|h_target|hTarget|H_in|Hin|Hout|Hfeed|Hspec|Hset|hout|hspec|hset|hfeed|hspecified)\b"
                    r"|temperatureOfEnthalpy\s*\(\s*(?:const\s+)?(?:scalar|double)\s+h\b")
HOME = re.compile(r"\bspecifiedFlash\s*\(")


def strip(t):
    """Blank comments, string and char literals (keeps length and newlines)."""
    t = re.sub(r"/\*.*?\*/", lambda m: re.sub(r"[^\n]", " ", m.group(0)), t, flags=re.S)
    t = re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), t)
    t = re.sub(r'"(?:\\.|[^"\\\n])*"', lambda m: '"' + " " * (len(m.group(0)) - 2) + '"', t)
    return re.sub(r"'(?:\\.|[^'\\\n])'", "' '", t)


def functions(t):
    """Yield the text of each outermost function body (namespaces/classes descended)."""
    t = strip(t)
    out, stack, last, start = [], [], 0, None
    for i, ch in enumerate(t):
        if ch == "{":
            head = t[last:i]
            if start is None:
                container = re.search(r"\b(namespace|class|struct|enum|union)\b", head) and "(" not in head.split("{")[-1]
                if not container and ")" in head:
                    start = last        # the head too: a definition's own parameters
                    stack = ["f"]
                else:
                    stack.append("c")
            else:
                stack.append("f")
            last = i + 1
        elif ch == "}":
            if stack:
                stack.pop()
            if start is not None and not stack:
                out.append(t[start:i])
                start = None
            last = i + 1
        elif ch == ";" and start is None:
            last = i + 1
    return out


def census():
    found = set()
    for p in sorted(list(SRC.rglob("*.cpp")) + list(SRC.rglob("*.H"))):
        if p.name == "SpecifiedFlash.cpp":
            continue
        for body in functions(p.read_text(errors="replace")):
            if SOLVER.search(body) and TARGET.search(body) and not HOME.search(body):
                found.add(str(p.relative_to(ROOT)))
                break
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
    bad = False
    if grown:
        print("check_state_inversion_door: FAIL -- %d unit file(s) run their own T-from-H search "
              "and are not pinned (route them through flashState::specifiedFlash):" % len(grown))
        for g in grown:
            print("  " + g)
        bad = True
    if shrunk:
        print("check_state_inversion_door: FAIL -- %d pinned row(s) no longer match (migrated or "
              "renamed): delete them from bin/curate/state_inversion_door.tsv:" % len(shrunk))
        for g in shrunk:
            print("  " + g)
        bad = True
    if bad:
        return 1
    print("check_state_inversion_door: OK -- %d unit file(s) still run their own T-from-H search "
          "(pin %d); none new, none stale." % (len(now), len(pin)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
