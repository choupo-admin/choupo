#!/usr/bin/env python3
"""Charge-balance gate: when a case SOLVES the pH, electroneutrality is an
equation the solver imposes -- so its residual on the ANSWER belongs at
round-off, and nothing physical may move it.

The regression this exists to prevent (found 2026-07-28, theory guide
ch:speciation): the electroneutrality row carried an extra `nu_pH * n_p`
term "so the freed H+ re-acidifies the solved pH".  The effect is real but
the row already delivers it -- a precipitating crystal is NEUTRAL, so its
dissolution reaction is charge-balanced (calcite: +2 -1 -1 = 0) and the
proton arrives through the master balances.  Counting it twice forced
sum z_i m_i = +n_p (exactly 1.00000 of the precipitated amount, 24 % of the
total charge), under-reading calcite scale by 37 % at high recovery.
The failure was INVISIBLE: every case converged, exit 0, goldens green.

Two claims, both causal:

  1. IMPOSED rows are at round-off.  Every "electroneutrality IMPOSED" line
     printed by the listed cases must satisfy |sum z m| / sum |z| m <= TOL.
     The cases with a PRECIPITATING carbonate are the ones that matter --
     they are the exact configuration the bug lived in -- so a solid must
     actually PRECIPITATE (n > 0) in each of them.  The first version of
     this gate wrote that assertion two ways round and it asserted nothing
     (an MIT audit, 2026-07-28: it passed on `stayed dissolved`, which is
     the NO-precipitation message).  It now reads the amount.

  2. GIVEN rows are REPORTED, never forced.  A pH-given case carries the
     analysis's own net charge, and at least one of them must be NON-ZERO:
     a corpus where every given-pH line reads 0.00e+00 is a corpus where
     the solver has started imposing electroneutrality behind a given pH,
     which is precisely the silent behaviour change the label denies.

Exit 1 listing failures."""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"

TOL = 1.0e-12          # round-off on a sum of ~1e-2 molalities

# (case, binary, must the run contain a PRECIPITATING solid under a solved pH?)
# Named, not globbed: the gate says out loud what it covers.
CASES = [
    # --- pH solved WITH a precipitating carbonate: where the bug lived -----
    ("tutorials/steady/flash/flash16_calcite_precipitation",   "choupoSolve", True),
    ("tutorials/props/electrolyte/precipitation_ro_brackish",  "choupoProps", True),
    ("tutorials/props/electrolyte/pitzer_vs_davies_ro_concentrate",
                                                              "choupoProps", True),
    # --- pH solved, no solid: the row must be exact there too -------------
    ("tutorials/props/electrolyte/scaling_ro_brackish",        "choupoProps", False),
    ("tutorials/props/electrolyte/rainwater_air",              "choupoProps", False),
    ("tutorials/props/electrolyte/softener_brackish",          "choupoProps", False),
    ("tutorials/steady/flash/flash09_nh3_water_reactive",      "choupoSolve", False),
    ("tutorials/steady/flash/flash14_calcite_carbonate_basis", "choupoSolve", False),
]

IMPOSED = re.compile(
    r"charge balance on the answer: .*= *([-+0-9.eE]+) *\(electroneutrality IMPOSED")
GIVEN = re.compile(
    r"charge balance on the answer: .*= *([-+0-9.eE]+) *\(pH GIVEN")
#  "  calcite       n = 1.0120e-02 mol/kg = 1012.87 mg/kg   SI -> +0.000"
#  -- the AMOUNT, not the word: `stayed dissolved (n = 0)` is the sibling
#  line that means the opposite.
PRECIP = re.compile(r"^\s+(\w+)\s+n = ([0-9.eE+-]+) mol/kg", re.M)


def run(case, binary):
    exe = BUILD / binary
    if not exe.exists():
        return None, f"{binary} not built -- run `make` first"
    p = subprocess.run([str(exe), str(ROOT / case)],
                       capture_output=True, text=True, timeout=900)
    return p.stdout + p.stderr, None


def main():
    fails, imposed_seen, given_seen, precipitated = [], 0, 0, 0
    given_vals = []
    for case, binary, wants_solid in CASES:
        out, err = run(case, binary)
        if err:
            fails.append(err)
            break
        rows = [float(v) for v in IMPOSED.findall(out)]
        if not rows:
            fails.append(f"{case}: no 'electroneutrality IMPOSED' line -- the "
                         "case no longer solves its pH, or the announce was "
                         "removed (this gate reads it)")
            continue
        imposed_seen += len(rows)
        worst = max(abs(v) for v in rows)
        if worst > TOL:
            fails.append(f"{case}: electroneutrality residual {worst:.3e} > {TOL:.0e} "
                         f"over {len(rows)} solved speciation(s) -- the imposed "
                         "row is not being satisfied")
        if wants_solid:
            got = [(m, float(v)) for m, v in PRECIP.findall(out) if float(v) > 0.0]
            if not got:
                fails.append(f"{case}: NOTHING precipitated.  This case is the "
                             "gate's causal coverage for the precipitation "
                             "path -- with no solid it exercises none of it, "
                             "and the electroneutrality row it is here to "
                             "watch never sees a mineral sink")
            else:
                precipitated += len(got)
        vals = [float(v) for v in GIVEN.findall(out)]
        given_seen += len(vals)
        given_vals += vals

    if given_seen == 0:
        fails.append("no 'pH GIVEN' charge line anywhere in the corpus sample -- "
                     "a given pH must still REPORT the analysis's net charge; "
                     "if that announce is gone, the diagnostic went with it")
    elif not any(abs(v) > TOL for v in given_vals):
        fails.append(f"every one of the {given_seen} given-pH charge lines is at "
                     "round-off.  Nothing forces charge balance under a GIVEN "
                     "pH, so a corpus of exact zeros means electroneutrality is "
                     "being imposed there too -- the label would then be lying "
                     "about which equation was solved")

    if fails:
        print("charge-balance gate FAILED:")
        for f in fails:
            print("  -", f)
        return 1
    print(f"charge balance: {imposed_seen} imposed row(s) at <= {TOL:.0e}, "
          f"{given_seen} given-pH row(s) reported (max |q| "
          f"{max(abs(v) for v in given_vals):.1e}), {precipitated} solid "
          f"amount(s) > 0 on the precipitation path, over {len(CASES)} cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
