#!/usr/bin/env python3
"""Gate: a declared Cp validity window is USED, and its two failures differ.

    bin/curate/check_cp_range_announced.py

WHY THIS EXISTS.  `PolynomialCp` -- the most common heat-capacity model in the
corpus -- assigned `Tmin_`/`Tmax_` in its constructor and NEVER READ THEM
AGAIN.  The declared validity window was parsed and discarded, so invariant I4

    "a number outside its fitted range is ANNOUNCED, never silently
     extrapolated and never refused"

was not implemented on that path at all.

It also explains why the six inverted windows the provenance audit pinned did
no visible harm: nothing looked at them.  HARMLESS-BECAUSE-UNCHECKED IS NOT
SAFETY.  `check_validity_windows` gated the DATA while the engine ignored the
field -- the same shape as the review-status defect found the same day.

TWO FAILURES, TWO SENTENCES, and the gate checks they stay distinct:

  * NOT A WINDOW (hi <= lo).  "Outside the range" would be nonsense here --
    every T is outside an empty interval -- so the message names the DEFECT:
    the fit's domain is unknown and the Cp carries no validity claim.
  * OUTSIDE A VALID WINDOW.  Announced, and the value still returned.  I4 is
    explicit that extrapolation is a legitimate choice knowingly made.

If those two ever collapse into one message, a reader can no longer tell "you
extrapolated" from "this record is broken", and the second is the one that
needs curation rather than judgement.

A THIRD SENTENCE ARRIVED 2026-08-19: THE SPAN.  `H(T, Tref)` and `S(T, Tref)`
integrate the polynomial across the whole interval between the datum and the
state, and until that date they crossed a declared window in SILENCE -- only
`Cp(T)` noted anything, and the integral is the commoner call because every
enthalpy takes that road.  A GUARD ARMED ON ONE OF TWO ROUTES GUARDS NEITHER;
this is the third time that shape has been paid for here.

The span gets its OWN sentence rather than borrowing the point's, and the
reason is a measurement.  When H/S first noted their two ENDPOINTS through the
point message, a sweep of every steady tutorial that runs choupoSolve --

    for d in tutorials/steady/*/*/; do ./choupoSolve "$d" | grep -q '^\\[cp\\]'

-- came back 100 LOUD of 210.  Every one of the hundred is TRUE: the corpus's
liquid-Cp fits are mostly regressed over ~280-350 K and process temperatures
run past them.  But "evaluated at T = 370 K" describes something that did not
happen -- no evaluation occurred at 370 K, an integral ran there from the
298.15 K datum -- and it hides the size of the excursion, which is the one
thing a reader needs.  The span names the interval, the window and how much of
the path fell outside it (flash01: "integrated from 298.15 K to 370 K ...
LEAVES its declared Trange (278 350) over 20 K of its 71.85 K").  That
incidence is a CURATION finding about the catalogue's windows, and it is
deliberately not fixed by widening one: inventing a validity domain converts
unsourced into falsely sourced, which no reader and no gate can detect.

THE NEGATIVE IS THE LOAD-BEARING CHECK, AND IT NOW PROVES IT CAN FIRE.  An
in-range case must be SILENT -- but a case that is silent because nothing ever
reaches the code is worth nothing, which is exactly the `check_true_ions`
shape.  So the silent witness is run twice: once as it ships (silent), and once
in a COPY with its own declared window narrowed to a hair (loud).  The second
run is what makes the first one evidence.

SABOTAGE-VERIFIED 2026-08-19, three ways, each OBSERVED failing on a rebuilt
engine under a destructive-session journal and each restored afterwards:

  * SUPPRESSION (`noteSpan` returns before saying anything) -> exit 1 on TWO
    arms at once, and the pair is the point: "bubbleT01_ethanol_water says
    NOTHING even with ethanol's declared Trange narrowed to (300 301)" AND
    "solidDryer01_sugar integrates a polynomial Cp across a declared window
    and does not say so in the span's own words".
  * ARITHMETIC (the outside length reported 1 K too long) -> exit 1: "the span
    message reports 18.512679 K outside the window, but [298.15, 347.512679]
    against (280.0 330.0) leaves 17.51267899999999 K outside".  This is the
    arm that would not exist if the gate read the engine's number back.
  * SAME SENTENCE (the span re-worded to the point's "OUTSIDE its declared
    Trange") -> exit 1 on the distinctness arm.  Two failures must not collapse
    into one sentence, and neither must two different KINDS of extrapolation.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"

#  THE SILENT WITNESS MOVED (2026-08-19), and it moved because it stopped
#  being silent for a REAL reason.  flash01_benzene_toluene flashes at 370 K
#  and benzene's liquid-Cp fit is declared over (278 350): its enthalpy has
#  been integrated 20 K past that window on every run since the case existed,
#  and nothing said so because only Cp(T) was watched.  It was never a healthy
#  control -- it was an unexamined one, and the day the integral learned to
#  speak, the gate's own negative told the truth about it.
#
#  bubbleT01_ethanol_water replaces it: ethanol (280 351), water (273 369),
#  bubble temperatures around 350 K, and the whole integration path from the
#  298.15 K datum stays inside both windows.  Its silence is checked to be a
#  property of the TEMPERATURE by the narrowed-window arm below.
SILENT = "tutorials/steady/flash/bubbleT01_ethanol_water"
#  The component whose window the non-vacuity arm narrows, and the exact text
#  it replaces.  Kept beside the case so a record edit that changes the
#  spelling breaks the arm loudly instead of quietly making it a no-op.
SILENT_RECORD = "constant/components/ethanol.dat"
SILENT_WINDOW = "Trange        (280  351);"
LOUD = "tutorials/steady/drying/solidDryer01_sugar"

#  THE NON-INTERVAL BRANCH LEFT THIS GATE (AP3, 2026-08-05).
#
#  It used to check that a window with hi <= lo produced its OWN message
#  rather than being reported as "outside the range".  That behaviour is gone:
#  an impossible window now REFUSES at construction, and `Trange unknown;` is
#  the honest way to say a domain could not be recovered.
#
#  The refusal is exercised by `check_validity_windows`, which owns the DATA
#  rule and runs a three-state engine probe (clean / inverted / unknown).
#  Keeping a copy here would be a second home for one contract -- and the two
#  copies would drift, which is the failure this project spent the day
#  removing everywhere else.
#
#  What stays here is the ANNOUNCEMENT contract, which is a different claim:
#  I4 says an evaluation outside a VALID window is announced and never
#  refused, and an evaluation inside one is silent.

#  THE PROPS PROBE WAS DELETED (2026-08-19).  A `propertyPoint` template
#  and a `props_probe()` helper sat here, unused by any arm since the
#  non-interval branch left this gate (AP3) -- and its template asked for
#  a property `cpLiquid` that `propertyPoint` does not publish, so it
#  would not have run had anything called it.  Dead scaffolding that
#  looks like a working probe is worse than none: the next reader budgets
#  for coverage this gate does not have.  The non-vacuity arm below uses
#  a real corpus case with its own window narrowed instead.


def run(binary, case):
    p = subprocess.run([str(binary), str(case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    fail, checked = [], []
    for b in (SOLVE, PROPS):
        if not b.exists():
            print(f"check_cp_range_announced: FAILED\n  {b.name} not built")
            return 1

    #  (a) THE NEGATIVE.  An in-range case says nothing.
    rc, out = run(SOLVE, ROOT / SILENT)
    if rc != 0:
        fail.append(f"{Path(SILENT).name} does not run (exit {rc})")
    elif "[cp]" in out:
        fail.append(f"{Path(SILENT).name} keeps every Cp evaluation AND every "
                    "Cp integration path inside the declared windows, yet "
                    "announces an extrapolation.  A warning that fires on a "
                    "healthy case is not read on a sick one.")
    else:
        checked.append("silent in-range control")

    #  (a2) THE NEGATIVE IS NOT VACUOUS.  Narrow that case's own declared
    #  window to a hair, in a COPY, and the silence must break.  Without this
    #  arm a silent witness proves only that nothing looked -- which is what
    #  `check_true_ions` turned out to have been proving for a year, and what
    #  the pellet gate's first negative was proving on the day it shipped.
    with tempfile.TemporaryDirectory() as td:
        sab = Path(td) / "sabotage"
        shutil.copytree(ROOT / SILENT, sab)
        rec = sab / SILENT_RECORD
        text = rec.read_text()
        if text.count(SILENT_WINDOW) != 1:
            fail.append(
                f"the narrowed-window arm cannot find exactly one "
                f"'{SILENT_WINDOW}' in {SILENT_RECORD} (found "
                f"{text.count(SILENT_WINDOW)}).  The record was re-spelled and "
                "this arm would have become a silent no-op -- which is the "
                "vacuity it exists to prevent.")
        else:
            rec.write_text(text.replace(SILENT_WINDOW,
                                        "Trange        (300  301);"))
            rc, out = run(SOLVE, sab)
            if rc != 0:
                fail.append(f"the narrowed-window copy of {Path(SILENT).name} "
                            f"does not run (exit {rc}), so the negative's "
                            "non-vacuity could not be established")
            elif "[cp]" not in out:
                fail.append(
                    f"{Path(SILENT).name} says NOTHING even with ethanol's "
                    "declared Trange narrowed to (300 301), which its own "
                    "integration path cannot possibly stay inside.  Its "
                    "silence in arm (a) therefore proves nothing: the "
                    "announcement is not reached on this case at all.")
            else:
                checked.append("the silent control speaks when its window is "
                               "narrowed (the negative can fire)")

    #  (b) EXTRAPOLATION IS ANNOUNCED, on a case that really does it.
    rc, out = run(SOLVE, ROOT / LOUD)
    if rc != 0:
        fail.append(f"{Path(LOUD).name} does not run (exit {rc})")
    else:
        m = re.search(r'\[cp\].*OUTSIDE its declared Trange \(([\d.]+) ([\d.]+)\)',
                      out)
        if not m:
            fail.append(
                f"{Path(LOUD).name} evaluates a polynomial Cp outside its "
                "fitted range and says nothing.  The window is declared in "
                "the record and would be parsed and discarded again -- which "
                "is the defect this gate exists for (I4).")
        elif float(m.group(2)) <= float(m.group(1)):
            fail.append("the extrapolation message was emitted for a window "
                        "that is not an interval -- the two failures must "
                        "stay distinct, or 'you extrapolated' and 'this "
                        "record is broken' become the same sentence")
        else:
            checked.append(f"point extrapolation announced ({Path(LOUD).name}, "
                           f"Trange {m.group(1)}-{m.group(2)})")

        #  (c) THE SPAN IS ITS OWN SENTENCE.  The same case integrates past
        #  the same windows, and that must be said in words a reader cannot
        #  confuse with the point message: an interval, not a temperature,
        #  and a SIZE, because "you extrapolated" without "by how much" is
        #  the half of the fact nobody can act on.
        s = re.search(r'\[cp\].*integrated from ([\d.]+) K to ([\d.]+) K, a '
                      r'path that LEAVES its declared Trange '
                      r'\(([\d.]+) ([\d.]+)\) over ([\d.]+) K of its '
                      r'([\d.]+) K', out)
        if not s:
            fail.append(
                f"{Path(LOUD).name} integrates a polynomial Cp across a "
                "declared window and does not say so in the span's own words. "
                " Only Cp(T) was ever watched before 2026-08-19, and the "
                "integral is the route every enthalpy actually travels.")
        else:
            lo, hi = float(s.group(1)), float(s.group(2))
            wlo, whi = float(s.group(3)), float(s.group(4))
            out_k, span_k = float(s.group(5)), float(s.group(6))
            #  Recomputed here, never read back from the message: the overlap
            #  of [lo, hi] with the window is arithmetic this gate can do
            #  itself, and a gate that quotes the engine's own number checks
            #  nothing.
            a, b = min(lo, hi), max(lo, hi)
            inside = max(0.0, min(b, whi) - max(a, wlo))
            if abs(span_k - (b - a)) > 1e-6:
                fail.append(f"the span message reports a path length "
                            f"{span_k} K that is not {b} - {a}")
            elif abs(out_k - ((b - a) - inside)) > 1e-6:
                fail.append(f"the span message reports {out_k} K outside the "
                            f"window, but [{a}, {b}] against ({wlo} {whi}) "
                            f"leaves {(b - a) - inside} K outside")
            elif out_k <= 0.0:
                fail.append("the span message fired for a path that never "
                            "leaves its window")
            else:
                checked.append(f"span extrapolation announced and its "
                               f"arithmetic recomputed ({out_k} K of "
                               f"{span_k} K outside ({wlo} {whi}))")

    if fail:
        print("check_cp_range_announced: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_cp_range_announced: OK -- " + "; ".join(checked)
          + ".  An in-range case stays silent, its silence is PROVEN to be a "
            "property of the temperature rather than of an unreached branch, "
            "and an extrapolating one speaks in two distinct sentences -- the "
            "point and the span -- with the span's arithmetic recomputed here "
            "rather than read back.  NOT CHECKED: how much any extrapolation "
            "COSTS (that depends on the polynomial, and no gate here knows "
            "it), and the corpus-wide incidence -- measured at 100 loud of "
            "210 steady cases on 2026-08-19 by the sweep in this file's "
            "docstring, recorded there rather than re-run per gate, and a "
            "CURATION finding about the catalogue's windows rather than a "
            "defect in the announcement.  The IMPOSSIBLE-window case is not "
            "checked here: it refuses now, and `check_validity_windows` owns "
            "that contract with its own engine probe -- one home, not two.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
