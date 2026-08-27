#!/usr/bin/env python3
"""Gate: the corpus's proven-impossible phase labels are PINNED, not hidden.

    bin/curate/check_impossible_phase_pins.py

WHAT THIS IS ABOUT.  The energy balance report prices every stream in the
phase its state file declares, and it CHECKS that label: a stream called
liquid whose own Rachford-Rice residual at (T, P, z) says it is above its
bubble point cannot hold the name, and the report says so -- naming the
stream, the residual, and the fact that the enthalpy it charged is "missing
(or inventing) that phase change, which is a residual of latent-heat size".
That check is excellent and is not in question here.

WHAT IS IN QUESTION is that seven SHIPPED tutorials trigger it, five of them
with a real energy residual beside it, and the corpus stayed green because
the finding is announced rather than refused.  Measured 2026-08-27:

    phasechange01_partial_condenser     3 line(s)   worst residual  898.6 kW
    acetone03_luyben_reaction_section   6 line(s)   worst residual  390.6 kW
    combined01_brayton_rankine          3 line(s)   worst residual  132.8 kW
    stripper02_sour_water_h2s           3 line(s)   worst residual   17.5 kW
    stripper01_sour_water               3 line(s)   worst residual   12.8 kW
    tsa01_co2_twin_bed                  3 line(s)   worst residual   0.023 kW
    flash10_ch4propane_pcsaft           3 line(s)   worst residual   2.4e-5 kW

The last two are numerically clean -- the label is impossible and the duty it
would have distorted is zero -- so the count and the consequence are separate
facts and this gate keeps them separate.

PINNED, NOT FIXED, and that is deliberate.  Correcting these means changing
what each case DECLARES about its streams, which changes published answers in
five tutorials with recorded goldens; that is a curation decision and it is
Vitor's.  Refusing an impossible label outright is a contract change with the
same blast radius.  What is NOT deferred is the ratchet: a case that acquires
one of these from here on must FAIL rather than join the list quietly.  A
visible gap is strictly better than an invisible falsehood -- the same
posture as the four NEVER-list records and the eighteen missing citations.

WHY IT MATTERS TO SOMEONE LEARNING.  Found by authoring a case as a student
would: the run reported `Recycle converged in 3 Newton iteration(s)`, wrote
`converged/`, exited 0, and its reactor energy balance closed at 167 % with
the engine's own proof of why printed further up.  The two words a student
quotes in a final presentation are "converged" and "zero".  The caveat block
does carry both findings -- that part works -- but a corpus that ships seven
examples of the state teaches by example that it is tolerable.

WHAT THIS GATE CHECKS.

  (a) THE PINNED SET IS EXACTLY THE SET.  A case that starts printing
      IMPOSSIBLE INLET PHASE and is not pinned FAILS -- the ratchet.

  (b) A PINNED CASE THAT STOPPED PRINTING IT MUST BE UNPINNED.  A stale pin
      is worse than no pin: it reports a debt that has been paid, and the
      next reader trusts the list.

  (c) THE CONSEQUENCE MAY NOT GROW.  Each pin carries the worst absolute
      energy residual measured when it was pinned; the gate FAILS if a case's
      residual grows past a band.  The count alone would let a case get
      quietly worse while staying on the list.

  (d) THE NUMBERS ARE MEASURED HERE, from the runs, never read back from this
      docstring.  A pinned measurement that is not recomputed is a
      remembered fact with a second home.

WHAT THIS GATE DOES **NOT** DO.  It does not judge whether any of these
labels SHOULD be corrected, nor how -- that needs a per-case thermodynamic
decision about what each stream really is.  It does not check the
Rachford-Rice test itself (the report owns that).  It does not cover batch,
ctrl or props cases: the check lives in the steady energy report.  And a case
whose residual is 0 kW is pinned for its LABEL, not for a numerical error --
the gate says which is which rather than lumping them.

SABOTAGE-VERIFIED 2026-08-27, three times; OBSERVED output below, verbatim.

S1 -- a case removed from PINS, i.e. one arriving unpinned (the ratchet):

    - stripper01_sour_water prints IMPOSSIBLE INLET PHASE (3 line(s), worst energy residual 12.79 kW) and is NOT pinned

S2 -- a stale pin, a case that does not print it:

    - flash01_benzene_toluene is pinned as printing IMPOSSIBLE INLET PHASE and no longer does.  Remove it from PINS: a pin that reports a debt already paid teaches the next reader that the list cannot be trusted

S3 -- the consequence growing while the COUNT stays put, which is the arm the
count alone cannot provide:

    - phasechange01_partial_condenser: the worst energy residual beside its impossible phase label grew from 1 kW to 898.6 kW, past the 2 kW band
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"

#  case -> worst absolute energy residual [kW] when pinned, 2026-08-27.
#  A band of +20 % (and +1 kW) allows for harmless drift; growth past it is a
#  case getting worse while staying on the list, which the count cannot see.
#  THE WAIVERS LIVE IN ONE PLACE -- see `debt_registry.py`.  A literal copy
#  here would be a second home for "what are we tolerating?", which is the
#  arity sin inside the machinery built to enforce it; check_debt_registry
#  refused the first version of this gate for exactly that, correctly.  It
#  then refused the SECOND version too, which loaded the table through
#  importlib and so was invisible to the reader that asks "does any gate
#  consult this waiver?" -- a plain import is part of the contract, not a
#  style preference.
import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import IMPOSSIBLE_PHASE_CASES as PINS

#  THESE NUMBERS WERE WRONG ONCE, AND THE GATE CAUGHT IT.  They were first
#  taken by hand with an awk one-liner that mis-indexed the balance line, and
#  two of the seven were out by a factor of two in opposite directions.  The
#  gate's own reader disagreed on its first run and the gate's reader is the
#  one that recomputes every time -- so the table above is what it measured,
#  not what anybody remembered.  That is the whole reason (d) exists.

BAL = re.compile(r"ENERGY balance, unit '[A-Za-z0-9_.]+': dH = (-?[\d.]+) kW"
                 r" vs declared items (-?[\d.]+) kW")


def steady_cases():
    for cd in sorted(ROOT.glob("tutorials/*/*/*/system/controlDict")):
        try:
            if "choupoSolve" not in cd.read_text(errors="ignore"):
                continue
        except OSError:
            continue
        yield cd.parent.parent


def measure(case: Path):
    """-> (n impossible lines, worst |dH - declared| in kW)."""
    p = subprocess.run([str(SOLVE), str(case)], capture_output=True,
                       text=True, timeout=900)
    out = p.stdout + p.stderr
    n = out.count("IMPOSSIBLE INLET PHASE")
    worst = 0.0
    for m in BAL.finditer(out):
        r = abs(float(m.group(1)) - float(m.group(2)))
        worst = max(worst, r)
    return n, worst


def main() -> int:
    fails, notes = [], []
    seen = {}
    for case in steady_cases():
        n, worst = measure(case)
        if n:
            seen[case.name] = (n, worst)

    # ---- (a) the ratchet -------------------------------------------------
    for nm, (n, worst) in sorted(seen.items()):
        if nm not in PINS:
            fails.append(
                f"{nm} prints IMPOSSIBLE INLET PHASE ({n} line(s), worst"
                f" energy residual {worst:.4g} kW) and is NOT pinned.  The"
                " engine has proved one of its streams cannot hold the phase"
                " its state file declares, so the enthalpy charged for it is"
                " out by a latent heat.  Fix the stream's declared"
                " `vaporFraction`/`phase` in 0/, or add it to PINS with its"
                " measurement and a reason -- but it may not join the corpus"
                " silently")

    # ---- (b) no stale pin ------------------------------------------------
    for nm in sorted(PINS):
        if nm not in seen:
            fails.append(
                f"{nm} is pinned as printing IMPOSSIBLE INLET PHASE and no"
                " longer does.  Remove it from PINS: a pin that reports a"
                " debt already paid teaches the next reader that the list"
                " cannot be trusted")

    # ---- (c) the consequence may not grow --------------------------------
    for nm, (n, worst) in sorted(seen.items()):
        if nm not in PINS:
            continue
        was = PINS[nm]
        band = max(was * 1.20, was + 1.0, 1.0)
        if worst > band:
            fails.append(
                f"{nm}: the worst energy residual beside its impossible phase"
                f" label grew from {was:.4g} kW to {worst:.4g} kW, past the"
                f" {band:.4g} kW band.  The count alone cannot see a pinned"
                " case getting worse")

    if fails:
        print("check_impossible_phase_pins: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    material = sorted(((nm, v[1]) for nm, v in seen.items() if v[1] >= 1.0),
                      key=lambda kv: -kv[1])
    clean = sorted(nm for nm, v in seen.items() if v[1] < 1.0)
    print("check_impossible_phase_pins: OK -- "
          f"{len(seen)} shipped steady case(s) print IMPOSSIBLE INLET PHASE,"
          " exactly the pinned set, and none has grown past its band."
          f"  {len(material)} carry a MATERIAL energy residual beside the"
          " label ("
          + "; ".join(f"{nm} {v:.4g} kW" for nm, v in material)
          + f"), and {len(clean)} are numerically clean -- the label is"
            " impossible and the duty it would distort is zero ("
          + ", ".join(clean) + ").  Every number here is measured from the"
          " runs, never read back from the pin table.  PINNED, NOT FIXED:"
          " correcting these changes what each case DECLARES about its"
          " streams, and so changes published answers in five tutorials with"
          " recorded goldens -- a curation decision, reserved.  NOT COVERED:"
          " whether any label SHOULD be corrected and how (a per-case"
          " thermodynamic judgement), the Rachford-Rice test itself (the"
          " energy report owns it), and batch/ctrl/props cases (the check"
          " lives in the steady report).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
