#!/usr/bin/env python3
"""Gate: the newcomer's on-ramp shows the trace the ENGINE prints.

    bin/curate/check_intro_trace.py

WHY THIS EXISTS.  `gui/src/ui/CaseIntro.tsx` is the `?intro=1` on-ramp, the
screen a newcomer meets before anything else, and its whole purpose is to
show that the box is GLASS: it prints the outer Newton's iterations for the
flagship cases, under a comment saying "captured from an actual run -- the
numbers are the engine's own".

THAT CLAIM WENT FALSE AND NOTHING NOTICED.  Audited 2026-09-22 on the first
case a student runs, `adiabaticFlash01_benzene_toluene`: three of its seven
rows had drifted -- `3.17088e+04` where the engine prints `3.30212e+04` (two
rows) and `1.83628e+04` where it prints `1.90096e+04`.  The other four rows,
and the whole of flash01's trace, still matched, which is how it survived
being looked at.

A TRANSCRIBED NUMBER IS A SECOND HOME FOR A RESULT, and this one had NO
READER: the literals appear nowhere else in gui/, docs/ or bin/, so no
golden, no test and no gate could see them go stale.  On the screen that
exists to prove the engine's honesty, that is the worst possible place for
an unpinned copy.

WHAT THIS CHECKS.  For every case `CaseIntro`'s GUIDE table gives a `trace`
for, the case is RUN and every iteration row the screen prints is required
to appear in the engine's own output, byte for byte on the columns the
screen shows (iteration, T, residual).  The screen may ABRIDGE -- the
adiabatic trace deliberately skips iterations 6 and 7 -- so this is a SUBSET
test: every row shown must be real, never that every real row is shown.

WHAT THIS DOES NOT CHECK, said plainly:
  * THE PROSE around the trace.  Whether the `model` and `sequence` lines
    describe what the engine does is a reading judgement, not a comparison.
  * THAT AN ABRIDGEMENT IS HONEST.  A screen could show rows 0 and 8 and
    call it a Newton; every row would be real and the impression false.
  * ANY CASE WITHOUT A `trace` ENTRY, and the generic fallback text.
  * THAT THE SCREEN RENDERS.  Nothing here draws a React component.

Exit 1 naming the row, what the screen says and what the engine printed.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INTRO = ROOT / "gui" / "src" / "ui" / "CaseIntro.tsx"
SOLVER = ROOT / "choupoSolve"

#  A trace row as the screen writes it: "  0     380.0000     3.30212e+04".
ROW = re.compile(r"^\s*(\d+)\s+([0-9.]+)\s+(-?[0-9.]+e[+-]\d+)")


def screen_traces(src: str):
    """{case id: [(it, T, residual), ...]} from the GUIDE table's `trace`."""
    out = {}
    #  Each entry is `[CONST]: { ... trace: "..." + "..." }`; the case id is
    #  the const's own value, so the consts are resolved first.
    consts = dict(re.findall(r'^const ([A-Z0-9_]+) = "([^"]+)";', src, re.M))
    for m in re.finditer(r"\[([A-Z0-9_]+)\]:\s*\{(.*?)\n  \},", src, re.S):
        name, body = m.group(1), m.group(2)
        case = consts.get(name)
        tm = re.search(r"trace:\s*((?:\s*\+?\s*\"(?:[^\"\\]|\\.)*\"\s*)+)", body)
        if case is None or tm is None:
            continue
        text = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', tm.group(1)))
        text = text.replace("\\n", "\n")
        rows = []
        for line in text.split("\n"):
            r = ROW.match(line)
            if r:
                rows.append((r.group(1), r.group(2), r.group(3)))
        if rows:
            out[case] = rows
    return out


def decimals(text: str) -> int:
    """Digits after the point in a fixed-notation number, as WRITTEN."""
    return len(text.split(".")[1]) if "." in text else 0


def sigfigs(text: str) -> int:
    """Significant digits in an exponent-notation number, as WRITTEN."""
    mant = text.split("e")[0].lstrip("+-").replace(".", "").lstrip("0")
    return max(len(mant), 1)


def agrees(shown: str, printed: str) -> bool:
    """Is the engine's number the screen's number, at the screen's precision?

    The SCREEN chooses how many digits to show; this rounds the ENGINE to
    exactly that and demands equality.  A transcription is allowed to round
    and is not allowed to drift.
    """
    try:
        a, b = float(shown), float(printed)
    except ValueError:
        return False
    if "e" in shown.lower():
        n = sigfigs(shown)
        if b == 0.0:
            return a == 0.0
        from math import floor, log10
        exp = floor(log10(abs(b)))
        q = round(b, -(exp - (n - 1)))
        return f"{q:.{n - 1}e}" == f"{a:.{n - 1}e}"
    return round(b, decimals(shown)) == round(a, decimals(shown))


def engine_rows(case_id: str):
    case = ROOT / "tutorials" / case_id
    if not case.is_dir():
        return None, f"{case} is missing"
    try:
        p = subprocess.run([str(SOLVER), str(case)], capture_output=True,
                           text=True, timeout=300)
    except Exception as e:                                # noqa: BLE001
        return None, f"could not run {case_id}: {e}"
    rows = set()
    for line in (p.stdout + p.stderr).split("\n"):
        r = ROW.match(line)
        if r:
            rows.add((r.group(1), r.group(2), r.group(3)))
    return rows, None


def main() -> int:
    if not INTRO.is_file():
        print(f"check_intro_trace: FAILED\n  {INTRO} is missing -- the screen "
              "this gate holds to the engine does not exist.")
        return 1
    if not SOLVER.exists():
        print("check_intro_trace: FAILED\n  choupoSolve is not built, so the "
              "engine's own trace cannot be read.  A check that cannot run "
              "must not pass.")
        return 1

    traces = screen_traces(INTRO.read_text())
    if not traces:
        print("check_intro_trace: FAILED\n  harvested NO traces from "
              f"{INTRO.relative_to(ROOT)} -- the GUIDE table's shape changed, "
              "so this gate is blind rather than satisfied.")
        return 1

    fails = []
    checked = 0
    for case_id, rows in sorted(traces.items()):
        actual, err = engine_rows(case_id)
        if err:
            fails.append(err)
            continue
        for it, t, res in rows:
            checked += 1
            mine = [a for a in actual if a[0] == it]
            if mine and agrees(t, mine[0][1]) and agrees(res, mine[0][2]):
                continue
            got = (f"the engine prints {mine[0][1]} / {mine[0][2]}" if mine
                   else "the engine has no such iteration")
            fails.append(
                f"{case_id} iteration {it}: the on-ramp shows T={t} "
                f"residual={res}, but {got}")

    if fails:
        print("check_intro_trace: FAILED")
        for f in fails:
            print("  -", f)
        print("  The `?intro=1` screen exists to show that the engine is "
              "glass.  A transcribed number that has drifted is the one "
              "thing it must never carry.")
        return 1

    print(f"check_intro_trace: OK -- {checked} trace row(s) across "
          f"{len(traces)} on-ramp case(s) ({', '.join(sorted(traces))}) each "
          f"agree with that case's OWN run at HEAD, each compared at the "
          f"precision the SCREEN chose to show (a transcription may round; "
          f"it may not drift).  SUBSET test: the screen may abridge (the "
          f"adiabatic trace skips two iterations on purpose), so every row "
          f"SHOWN must be real, never that every real row is shown.  "
          f"NOT CHECKED: the prose around the trace, whether "
          f"an abridgement gives an honest impression, cases with no trace "
          f"entry, and anything about rendering.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
