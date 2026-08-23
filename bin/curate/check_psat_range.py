#!/usr/bin/env python3
"""Gate: a declared vapour-pressure window has a CONSUMER, and it tells the
two physically different failures apart.

    bin/curate/check_psat_range.py

WHY THIS EXISTS.  All 108 `vaporPressure {}` blocks in the catalogue declare a
`Trange`.  `VaporPressureModel::range()` is a PURE VIRTUAL every model
implements -- Antoine returns its window, AmbroseWalton returns `{0, Tc}`.
Until 2026-08-06 nothing in the tree had ever CALLED it: zero consumers, by
grep.  Not one temperature was ever compared against one of those windows, on
the correlation behind every K-value, every flash and every column stage.

`Antoine::Psat_Pa` parsed `Tmin_`/`Tmax_` into members and never read them --
the `PolynomialCp` defect (AP3, fixed the day before) one model over, on a far
hotter path.  `AmbroseWalton.H` admitted it in a comment: *"range() is
advisory (the engine does not yet gate on it)."*

THE FIX IS ON THE BASE, and that is what makes this gate short.  `Psat_Pa` is
a public NON-VIRTUAL that runs `noteRange(T)` and delegates to a protected
pure-virtual `computePsat(T)`.  A subclass CANNOT skip the check by
overriding, because there is nothing to override -- so this gate does not test
for that, and says so rather than pretending to cover it.

WHAT IS CHECKED -- three run witnesses and a source guard:

  (a) ABOVE Tc GETS ITS OWN SENTENCE.  `gibbs06_h2_flame_radicals` asks for a
      saturation pressure at 2400 K for H2 (Tc 33.18 K), O2 (154.58) and N2
      (126.2) -- nineteen times Tc for nitrogen.  The message must say ABOVE
      ITS CRITICAL TEMPERATURE and must NOT say "extrapolated": above Tc there
      is no vapour-liquid saturation curve at all, and calling it extrapolated
      teaches that one exists and could be extended.  It must quote Tc.

  (b) BELOW Tc AND OUTSIDE THE WINDOW GETS THE OTHER SENTENCE.
      `flash01_benzene_toluene` -- the flagship first flash a student meets --
      runs at 370 K while benzene's Antoine window ends at 354.07 K.  The
      message must say OUTSIDE its declared Trange, quote both bounds, and say
      the value is still returned (I4: extrapolation is a legitimate choice,
      announced, never refused).

  (c) A CASE INSIDE ITS WINDOWS SAYS NOTHING.  `flash02_ethanol_water`.
      Without this arm the gate would pass just as happily on a `noteRange`
      that fired unconditionally, which is a different bug wearing the same
      output.

  (d) EVERY MESSAGE NAMES ITS COMPONENT.  An anonymous validity warning in a
      twenty-component flowsheet is one the reader cannot act on -- the Cp
      path shipped exactly that for twenty components before the owner was
      stamped, and this check exists so the vapour-pressure path cannot repeat
      it.  The owner is stamped in ONE place, `VaporPressureModel::New`.

WHY THE BRANCH IS ON Tc AND NOT ON MAGNITUDE, since that was a real decision.
The corpus was measured before the message was written: 111 of 332 cases
evaluate outside a window, and the excursions are BIMODAL -- 27 under 1 K, 27
at 1-10 K, 47 at 10-50 K, 23 at 50-200 K, and 101 above 200 K.  A magnitude
threshold would separate those two populations too, and it was REJECTED: a
threshold is an arbitrary constant, and it would hide precisely the case where
a fit degrades sharply just past its edge.  Tc is a real physical boundary,
every record already carries it, and it separates the populations for the
right reason.

WHAT IS NOT CHECKED: whether an extrapolation is JUSTIFIED.  A case may
legitimately run past a fit; I4 is explicit that the professor extrapolates on
purpose but knows he did.  This gate checks that he is TOLD, never whether he
should have.

Exit 1 naming the arm that failed.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"

SUPERCRITICAL = "tutorials/steady/gibbs/gibbs06_h2_flame_radicals"
EXTRAPOLATED = "tutorials/steady/flash/flash01_benzene_toluene"
INSIDE = "tutorials/steady/flash/flash02_ethanol_water"

SRC = ROOT / "src" / "thermo" / "vaporPressure" / "VaporPressureModel.H"


def run(case):
    r = subprocess.run([str(SOLVE), str(ROOT / case)],
                       capture_output=True, text=True, timeout=300)
    return r.returncode, r.stdout + r.stderr


def psat_lines(out):
    return [ln for ln in out.splitlines() if "[psat]" in ln]


def main() -> int:
    fail, checked = [], []

    if not SOLVE.exists():
        print("check_psat_range: FAILED\n  choupoSolve missing -- build first")
        return 1

    # ---- (a) above Tc ------------------------------------------------------
    rc, out = run(SUPERCRITICAL)
    if rc != 0:
        fail.append(f"(a) {Path(SUPERCRITICAL).name} exited {rc}")
    else:
        lines = psat_lines(out)
        #  Arm (a)'s subject is the FLAME evaluation (2400 K, far above every
        #  Tc there).  The same case may legitimately announce a below-window
        #  extrapolation at its 298 K initial state -- first seen 2026-08-23,
        #  when H2O2's Trange became the honest Landolt window (330-446 K)
        #  and its ambient evaluation started saying so.  Those lines belong
        #  to arm (b)'s class, not this one, so the filter keeps only
        #  evaluations hot enough that no saturation curve can exist.
        hot = [l for l in lines
               if (m := re.search(r"T = ([0-9.]+)", l)) and float(m.group(1)) >= 1000.0]
        if not hot:
            fail.append("(a) a flame at 2400 K raised no vapour-pressure "
                        "advisory at all -- every species there is hundreds of "
                        "kelvin above its critical temperature")
        else:
            lines = hot
            bad = [l for l in lines if "ABOVE its critical temperature" not in l]
            if bad:
                fail.append("(a) a supercritical evaluation did not use the "
                            "above-Tc sentence:\n      " + bad[0])
            elif any("extrapolat" in l.lower() for l in lines):
                fail.append("(a) a supercritical evaluation called itself "
                            "EXTRAPOLATED.  Above Tc there is no saturation "
                            "curve to extrapolate, and saying so teaches that "
                            "one exists.")
            elif not any(re.search(r"Tc = [0-9.]+ K", l) for l in lines):
                fail.append("(a) the above-Tc message does not quote Tc, so "
                            "the reader cannot see how far above it they are")
            else:
                checked.append(f"above Tc gets its own sentence, quoting Tc "
                               f"({len(lines)} species at 2400 K)")

    # ---- (b) below Tc, outside the window ---------------------------------
    rc, out = run(EXTRAPOLATED)
    if rc != 0:
        fail.append(f"(b) {Path(EXTRAPOLATED).name} exited {rc}")
    else:
        lines = psat_lines(out)
        if not lines:
            fail.append("(b) flash01 runs at 370 K with benzene's Antoine "
                        "window ending at 354.07 K and raised nothing")
        else:
            hit = [l for l in lines if "OUTSIDE its declared Trange" in l]
            if not hit:
                fail.append("(b) a sub-critical excursion did not use the "
                            "extrapolation sentence:\n      " + lines[0])
            elif "ABOVE its critical temperature" in "".join(lines):
                fail.append("(b) a sub-critical excursion used the above-Tc "
                            "sentence -- the branch is inverted")
            elif not re.search(r"Trange \([0-9.]+ [0-9.]+\)", hit[0]):
                fail.append("(b) the extrapolation message does not quote both "
                            "bounds of the window it left")
            else:
                checked.append("below Tc and outside the window gets the "
                               "extrapolation sentence, quoting both bounds")

    # ---- (c) the negative --------------------------------------------------
    rc, out = run(INSIDE)
    if rc != 0:
        fail.append(f"(c) {Path(INSIDE).name} exited {rc}")
    elif psat_lines(out):
        fail.append("(c) a case whose components are INSIDE their declared "
                    "windows still raised a vapour-pressure advisory:\n      "
                    + psat_lines(out)[0]
                    + "\n      Without this arm the gate would pass on a "
                      "noteRange that fired unconditionally.")
    else:
        checked.append("a case inside its windows says nothing")

    # ---- (d) every message names its component ----------------------------
    named = True
    for case in (SUPERCRITICAL, EXTRAPOLATED):
        _, out = run(case)
        for ln in psat_lines(out):
            if "component '" not in ln:
                fail.append("(d) an anonymous advisory -- a validity warning "
                            "that cannot name its component is one the reader "
                            "cannot act on:\n      " + ln)
                named = False
                break
    if named and not any(f.startswith("(d)") for f in fail):
        checked.append("every message names its component")

    # ---- source guard: the check cannot be bypassed by a subclass ---------
    if SRC.exists():
        src = SRC.read_text()
        if "virtual scalar Psat_Pa" in src:
            fail.append("source: Psat_Pa is virtual again.  The whole point of "
                        "the base-class shape is that a model CANNOT be reached "
                        "without its window having been checked; a virtual "
                        "Psat_Pa restores the forget-to-check defect.")
        elif "noteRange" not in src:
            fail.append("source: Psat_Pa no longer calls noteRange")
        else:
            checked.append("Psat_Pa is non-virtual and calls noteRange, so no "
                           "model can skip the check by overriding")

    if fail:
        print("check_psat_range: FAILED")
        for f in fail:
            print("  * " + f)
        return 1

    print("check_psat_range: OK -- " + "; ".join(checked)
          + ".  The gate checks that the reader is TOLD, never whether an "
            "extrapolation was JUSTIFIED -- that is a modelling judgement (I4: "
            "the professor extrapolates on purpose, but knows he did).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
