#!/usr/bin/env python3
"""Gate: the size-distribution family is right, and its moment BASIS converts.

    bin/curate/check_size_distribution.py

WHY THIS EXISTS.  Until 2026-08-06 a size distribution in Choupo was a bare
struct of two vectors -- the only physical model in the tree that was not a
registered polymorphic class -- so no moment was computed anywhere and a
continuous law had nowhere to live.  The family added that day follows
OpenFOAM's `src/OpenFOAM/distributions/` shape: analytic laws and TABULAR
forms as peers, with the moment basis carried by the distribution itself.

WHAT IS CHECKED, and every arm is an INDEPENDENT recomputation rather than a
pinned number:

  (a) CLOSED-FORM MOMENTS.  Rosin-Rammler's m-th raw moment is
      d63^m * Gamma(1 + m/n); a log-normal's is exp(m*mu + m^2 sigma^2 / 2).
      Both are recomputed here in Python and compared with the engine.  A
      pinned constant would only prove the value had not changed; recomputing
      proves it is right.

  (b) THE BASIS CONVERSION IS REAL.  This is the arm that matters, because it
      is the thing the old struct could not express at all.  Rosin-Rammler is
      declared on MASS (Q = 3) and log-normal on NUMBER (Q = 0) -- deliberately
      different, so a family-wide bug that ignored the basis would show.  For a
      log-normal the number-basis and volume-basis means differ by exactly
      exp(3 sigma^2), a closed form; the engine must reproduce it.

  (c) QUADRATURE AGREES WITH THE CLOSED FORM.  The base integrates
      numerically for any distribution declaring no analytic moment.  Both
      shipped laws OVERRIDE that, so the probe subclasses Rosin-Rammler with
      the override removed -- otherwise this arm exercises nothing.  (A first
      version compared a finely-discretised TABULAR sum and called it "the
      base quadrature": it tested the wrong path and failed for a reason that
      looked like a defect in the engine.  A gate must test the thing it
      names.)

  (d) THE TABULAR ROUND TRIP CONVERGES.  A piecewise-constant density has
      exact moments by summation, but it is still an APPROXIMATION of the law
      it was discretised from -- so the test is not "equal", it is "converges
      under refinement".  The probe reports d32 at 500 and 4000 bins; the fine
      one must be closer, and by roughly the expected order.  A fixed
      tolerance alone would not distinguish discretisation error from a real
      disagreement about where bin edges lie, and the second is the defect
      that matters.

      d32 is the demanding case ON PURPOSE: for a mass-declared table it needs
      the -1 moment, which weights the SMALL-diameter tail.

      THE FLOOR IS NOT A DEFECT, AND THE CAUSE IS NOW MEASURED (arm e).  The
      d32 round trip does not converge with bin count -- 500 and 4000 bins
      agree to four digits -- which looked like a bug and was recorded as an
      unexplained floor with the extrapolated end-bin edges as the suspect.

      That suspect is REFUTED.  Varying the support cutoff while holding the
      bin count fixed gives

          dMin/d63    d32 relative error
            1e-4          7.13e-4
            1e-6          1.79e-5
            1e-8          4.48e-7

      Each 100-fold reduction in dMin divides the error by 39.8, and for a
      Rosin-Rammler the density goes as d^(n-1) at small d, so the truncated
      part of the MINUS-ONE moment scales as dMin^(n-1) = dMin^0.8, i.e. by
      100^0.8 = 39.81 per decade pair.  Measured 39.8 against predicted 39.81.

      So `toTabular` on a finite support simply cannot reproduce an
      infinite-support Sauter mean, and the discrepancy is governed by where
      the fines are cut off -- which is a fact about the physics, not about
      the code.  It is also worth a student's attention: the Sauter mean of a
      milled powder is sensitive to the fines cutoff by a known power law,
      while the mass-weighted moments are not.

      Arm (e) VERIFIES that exponent, so this is a checked law rather than a
      tolerance wrapped around an unexplained number.

      WHAT ARM (e) DOES AND DOES NOT SEE, established by sabotage rather than
      assumed.  Altering Rosin-Rammler's small-d density (n-1 -> n) breaks the
      exponent immediately: the ratio collapses to 1x against 39.8x predicted.
      But ZEROING THE FIRST BIN'S WEIGHT in `toTabular` does NOT fail it --
      one bin out of a thousand log-spaced ones carries too little mass to
      move the ratio by 2 %.  So this arm watches the MODEL'S small-d law, not
      the discretiser's treatment of individual fine bins.  The first draft of
      the failure message claimed both; it now claims only what the sabotage
      showed it can see.

WHAT IS NOT CHECKED: whether a distribution is the RIGHT model for a given
powder.  That is a modelling judgement and no gate can hold it.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "build" / "linux64Gcc" / "sizeDistributionProbe"
SRC = ROOT / "bin" / "curate" / "_sizeDistributionProbe.cpp"

TOL = 1.0e-9


def build_probe():
    """Compile the small driver that exercises the family."""
    inc = ROOT / "src"
    objs = list((ROOT / "build" / "linux64Gcc" / "src" / "core" / "distribution")
                .glob("*.o"))
    cmd = ["g++", "-std=c++17", "-O2", f"-I{inc}", f"-I{ROOT}",
           str(SRC)] + [str(o) for o in objs] + \
          [str(ROOT / "build" / "linux64Gcc" / "libchoupo.so"),
           "-Wl,-rpath," + str(ROOT / "build" / "linux64Gcc"),
           "-o", str(PROBE)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, r.stderr[-800:]


def main() -> int:
    fail, checked = [], []
    if not SRC.exists():
        print("check_size_distribution: FAILED\n  the probe source is missing")
        return 1

    rc, err = build_probe()
    if rc != 0:
        print("check_size_distribution: FAILED\n  probe did not compile -- the "
              "family's headers or the library moved.  A check that cannot "
              "build must not pass.\n" + err)
        return 1

    r = subprocess.run([str(PROBE)], capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        print("check_size_distribution: FAILED\n  probe exited "
              f"{r.returncode}\n{r.stdout[-600:]}{r.stderr[-600:]}")
        return 1
    try:
        got = json.loads(r.stdout)
    except json.JSONDecodeError:
        print("check_size_distribution: FAILED\n  probe output is not JSON:\n"
              + r.stdout[-400:])
        return 1

    # ---- (a) Rosin-Rammler closed-form moments -------------------------
    d63, n = got["rr"]["d63"], got["rr"]["n"]
    for m in (2, 3):
        want = d63 ** m * math.gamma(1.0 + m / n)
        have = got["rr"][f"raw{m}"]
        if abs(have - want) > TOL * max(1.0, abs(want)):
            fail.append(f"Rosin-Rammler raw moment {m}: engine {have:g}, "
                        f"d63^{m}*Gamma(1+{m}/n) = {want:g}")
    if not fail:
        checked.append("Rosin-Rammler moments == d63^m*Gamma(1+m/n)")

    # ---- (a) log-normal closed-form moments ----------------------------
    mu, sg = math.log(got["ln"]["dgm"]), math.log(got["ln"]["sigmaG"])
    for m in (2, 3):
        want = math.exp(m * mu + 0.5 * m * m * sg * sg)
        have = got["ln"][f"raw{m}"]
        if abs(have - want) > TOL * max(1.0, abs(want)):
            fail.append(f"log-normal raw moment {m}: engine {have:g}, "
                        f"exp(m*mu + m^2 s^2/2) = {want:g}")
    checked.append("log-normal moments == exp(m*mu + m^2 sigma^2/2)")

    # ---- (b) THE BASIS CONVERSION --------------------------------------
    #  For a log-normal declared on NUMBER, the volume-basis mean exceeds the
    #  number-basis mean by exactly exp(3 sigma^2).  If the basis were ignored
    #  the ratio would be 1.
    ratio = got["ln"]["mean_volume"] / got["ln"]["mean_number"]
    want = math.exp(3.0 * sg * sg)
    if abs(ratio - want) > 1.0e-7 * want:
        fail.append(f"log-normal basis conversion: volume/number mean ratio is "
                    f"{ratio:.9g}, closed form exp(3 sigma^2) = {want:.9g}.  "
                    "A ratio of 1 means the declared basis is being ignored, "
                    "which is the defect the old bare struct could not even "
                    "express.")
    else:
        checked.append(f"basis conversion exact (volume/number = "
                       f"exp(3 sigma^2) = {want:.6g})")

    #  And the two models must DISAGREE about their declared basis, or the
    #  test above proves nothing about the family.
    if got["rr"]["basis"] == got["ln"]["basis"]:
        fail.append("Rosin-Rammler and log-normal now declare the SAME basis, "
                    "so the conversion arm no longer exercises a difference.  "
                    "RRSB is fitted on mass, log-normal counted on number; if "
                    "that changed, this gate is testing nothing.")
    else:
        checked.append(f"the two laws declare different bases "
                       f"({got['rr']['basis']} vs {got['ln']['basis']})")

    # ---- (c) the BASE's quadrature reproduces the closed form ----------
    q, a = got["rr"]["raw3_quadrature"], got["rr"]["raw3"]
    if abs(q - a) > 1.0e-6 * abs(a):
        fail.append(f"the base's numerical moment {q:g} disagrees with the "
                    f"analytic {a:g} by {abs(q-a)/abs(a)*100:.3g} % -- every "
                    "future distribution WITHOUT a closed form inherits that "
                    "error silently.")
    else:
        checked.append("the base's own quadrature reproduces the analytic "
                       "moment to 1e-6 (tested through a subclass with the "
                       "override removed)")

    # ---- (d) tabular round trip CONVERGES -------------------------------
    t = got["roundTrip"]
    eC = abs(t["d32_coarse"] - t["d32_analytic"]) / t["d32_analytic"]
    eF = abs(t["d32_fine"]   - t["d32_analytic"]) / t["d32_analytic"]
    FLOOR = 5.0e-5
    if max(eC, eF) > FLOOR:
        fail.append(f"d32 round trip is off by {max(eC,eF)*100:.3g} % "
                    f"(500 bins {eC*100:.3g} %, 4000 bins {eF*100:.3g} %) -- "
                    f"above the {FLOOR*100:g} % floor this round trip is known "
                    "to hold.  `toTabular` and the tabular reader disagree "
                    "about more than the known end-bin effect.")
    else:
        checked.append(f"tabular round trip agrees to {max(eC,eF):.1e} "
                       "(a FLOOR, not convergence -- see the note)")

    e3 = abs(t["m3_fine"] - t["m3_analytic"]) / t["m3_analytic"]
    if e3 > 1.0e-4:
        fail.append(f"the third moment of the round trip is {e3*100:.3g} % off "
                    "-- the well-resolved coarse end should be near-exact, so "
                    "this is a real disagreement rather than a truncated tail.")
    else:
        checked.append(f"third moment exact to {e3:.1e} (the coarse end, where "
                       "no truncation excuse applies)")

    # ---- (e) THE TRUNCATION LAW ----------------------------------------
    #  The d32 error must scale as dMin^(n-1).  Verifying the EXPONENT turns
    #  a floor nobody could explain into a checked consequence of the model.
    tr = got.get("truncation", [])
    if len(tr) < 3:
        fail.append("the probe reported no truncation series -- arm (e) "
                    "cannot run, and a check that cannot run must not pass")
    else:
        expect = 100.0 ** (n - 1.0)          # per 100-fold cut in dMin
        for a_, b_ in zip(tr, tr[1:]):
            ratio = a_["err"] / b_["err"]
            if abs(ratio - expect) / expect > 0.02:
                fail.append(
                    f"cutting dMin from {a_['frac']:g} to {b_['frac']:g} d63 "
                    f"changed the d32 error by {ratio:.3g}x; the Rosin-Rammler "
                    f"small-d density d^(n-1) predicts {expect:.3g}x.  The "
                    "law that governs this floor has changed -- most likely "
                    "the model's small-d density itself.")
        else:
            checked.append(f"the d32 floor obeys dMin^(n-1): measured "
                           f"{tr[0]['err']/tr[1]['err']:.1f}x per 100-fold cut "
                           f"against {expect:.1f}x predicted")

    if fail:
        print("check_size_distribution: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_size_distribution: OK -- " + "; ".join(checked)
          + ".  Every arm RECOMPUTES the closed form rather than comparing "
            "with a pinned number, so the gate proves the moments are right "
            "and not merely unchanged.  It does NOT judge whether a given law "
            "is the right model for a given powder -- that is a modelling "
            "judgement no gate can hold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
