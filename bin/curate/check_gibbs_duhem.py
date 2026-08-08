#!/usr/bin/env python3
"""Gate: every activity model obeys Gibbs-Duhem, which no golden can check.

    bin/curate/check_gibbs_duhem.py

WHY THIS EXISTS.  `bin/runTests` prints, at the end of every run, that a PASS
means the answer has not MOVED -- not that it is right.  Almost the whole
corpus is regression against self-recorded goldens, and the validation subset
is six cases.  If a model was wrong the day its golden was recorded, the golden
preserves the error forever and every future run confirms it.

Gibbs-Duhem escapes that trap completely.  It needs no experimental data and no
reference answer -- it is a constraint thermodynamics places on ANY model
derived from an excess Gibbs energy.  For a binary at constant T, P:

        x1 dln(gamma1)/dx1  +  x2 dln(gamma2)/dx1  =  0

A transposed tau, a swapped alpha, an i/j mix-up in a pair lookup, a dropped
term in a derivative -- each breaks this, and NONE of them would disturb a
single golden.  It is the cheapest first-principles check available and the
tree did not have one.

THE RESIDUAL IS NORMALISED, and the reason matters.  Central differences put a
floor under the residual (truncation falls as h^2, round-off grows as eps/h),
so the raw number is meaningless without its scale.  The gate reports

        R = |x1 g1' + x2 g2'| / (|x1 g1'| + |x2 g2'|)

A correct model returns R at 1e-10..1e-8.  The synthetic negative -- the same
model with gamma_2 replaced by gamma_1, a pair no excess Gibbs energy can
produce -- returns 1.0.  Ten orders of magnitude apart with nothing between
them, which is what makes this decisive rather than a tolerance argument.

THE VACUITY GUARD IS THE PART THAT WAS PAID FOR.  A model returning gamma = 1
everywhere passes this test trivially: both derivatives are zero and the
residual is 0/0.  During development that happened TWICE for different reasons
-- once because `std::to_string` writes six decimal places, so every residual
below 1e-6 serialised as "0.000000", and once because the probe never set
`Database::currentRoot()`, so the pair lookup was relative and every model
silently defaulted to ideal.  Both produced a clean sheet of zeros that read
exactly like success.  So the gate REFUSES any case whose activity
coefficients do not vary with composition: a test that measured nothing must
not report a pass.

WHAT THIS DOES NOT CHECK, stated plainly:

  * NOT accuracy.  Gibbs-Duhem is a consistency constraint.  A model can be
    perfectly consistent and still disagree with every measurement ever made;
    consistency says the mathematics is sound, never that the parameters are
    right.  This is verification, not validation, and it does not enlarge the
    six-case validation subset by one.
  * ONLY BINARIES, and only the curated pairs.  Multicomponent Gibbs-Duhem is
    a stronger statement and is not tested.
  * THE SALT-LEVEL electrolyte kernels ARE covered, by the stronger form
    dln(gamma_pm)/dm = dphi/dm + (phi - 1)/m -- the molecular test ties two
    gammas to each other, this one ties the SOLVENT side to the ION side.  The
    PER-ION models (Davies, PitzerHMW, EdwardsPitzer) are NOT: they work on a
    molality-and-charge basis this probe does not reach.
  * `Wilson` IS REGISTERED AND CANNOT BE TESTED -- there is no
    data/standards/parameters/Wilson/ directory, so it always returns ideal.
    The gate reports that rather than silently passing it.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "build" / "linux64Gcc" / "gdProbe"
SRC = ROOT / "bin" / "curate" / "_gibbsDuhemProbe.cpp"

#  A correct model sits at the finite-difference floor.  1e-6 is far above it
#  and far below the O(1) a structural error produces -- deliberately in the
#  empty middle, so the threshold is not a tuned parameter.
TOL = 1e-6


def build():
    r = subprocess.run(
        ["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}", str(SRC),
         str(ROOT / "build" / "linux64Gcc" / "libchoupo.so"),
         "-Wl,-rpath," + str(ROOT / "build" / "linux64Gcc"), "-o", str(PROBE)],
        capture_output=True, text=True)
    return r.returncode, r.stderr[-1500:]


def main() -> int:
    if not SRC.exists():
        print("check_gibbs_duhem: FAILED\n  the probe source is missing")
        return 1
    if not (ROOT / "build" / "linux64Gcc" / "libchoupo.so").exists():
        print("check_gibbs_duhem: FAILED\n  libchoupo.so not built -- a check "
              "that cannot run must not pass")
        return 1

    rc, err = build()
    if rc != 0:
        print("check_gibbs_duhem: FAILED\n  the probe did not compile -- the "
              "LiquidPhase or ActivityModel surface moved.  A check that "
              "cannot build must not pass.\n" + err)
        return 1

    p = subprocess.run([str(PROBE)], capture_output=True, text=True,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT)), timeout=600)
    raw = p.stdout + p.stderr
    m = re.search(r'<<<JSON\n(.*?)JSON>>>', raw, re.S)
    if p.returncode != 0 or not m:
        print("check_gibbs_duhem: FAILED\n  the probe produced no JSON "
              f"(exit {p.returncode})\n" + raw[-1200:])
        return 1
    rows = json.loads(m.group(1))

    fail, tested, vacuous, refused = [], [], [], []
    negative = None

    #  BY MARKER, never by position.  This gate originally took rows[-1] as
    #  the synthetic negative; adding the electrolyte cases after it would
    #  have made a real model be read as the negative and the negative be
    #  checked as a model -- both passing, both meaningless.  Same defect as
    #  selecting a flash phase by declaration order, found the same day.
    negatives = [r for r in rows if r.get("negative")]
    if len(negatives) != 1:
        print("check_gibbs_duhem: FAILED\n  expected exactly one row marked "
              f"`negative`, found {len(negatives)}.  The probe's synthetic "
              "negative is what proves the residual can detect an "
              "inconsistent pair; without exactly one, every pass is unbacked.")
        return 1

    for r in [r for r in rows if not r.get("negative")]:
        tag = f"{r['model']}/{r['pair']}"
        if r["result"] != "ok":
            refused.append(f"{tag} ({r['result'][:60]})")
            continue
        if r["spread"] <= 0.0:
            #  gamma does not move with composition -> 0/0 -> a free pass.
            vacuous.append(tag)
            continue
        tested.append(f"{tag} R={r['worstR']:.1e}")
        if r["worstR"] > TOL:
            fail.append(
                f"{tag} violates Gibbs-Duhem: R = {r['worstR']:.3e} at "
                f"x1 = {r['worstX1']:.2f} (tolerance {TOL:.0e}).  The model's "
                "two activity coefficients do not come from a common excess "
                "Gibbs energy -- check the pair indexing and the derivative.")

    #  THE NEGATIVE.  Without it, every arm above could be measuring nothing.
    negative = negatives[0]
    if negative["result"] != "ok":
        fail.append("the synthetic negative did not run: " + negative["result"])
    elif negative["worstR"] < 0.1:
        fail.append(
            f"the synthetic negative returned R = {negative['worstR']:.3e}, "
            "which this gate would PASS.  It substitutes gamma_1 for gamma_2, "
            "a pair no excess Gibbs energy can produce, and must come back "
            "O(1).  If it does not, the residual is not measuring "
            "Gibbs-Duhem and every pass above is worthless.")

    if not tested:
        fail.append(
            "NOT ONE model was actually exercised -- every case was vacuous or "
            "refused.  This is the exact failure this gate was built around: "
            "gammas that do not vary with composition pass trivially, and a "
            "clean sheet of zeros reads just like success.")

    if fail:
        print("check_gibbs_duhem: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print(
        "check_gibbs_duhem: OK -- " + str(len(tested)) + " model/pair "
        "combination(s) satisfy x1*dln(g1)/dx1 + x2*dln(g2)/dx1 = 0 at the "
        "finite-difference floor: " + "; ".join(tested) + ".  The synthetic "
        f"negative (gamma_2 := gamma_1) returns R = {negative['worstR']:.3f}, "
        "so the residual provably detects an inconsistent pair -- ten orders "
        "of magnitude from the passes, with nothing in between.  "
        + (f"VACUOUS, reported not counted: {', '.join(vacuous)} -- gamma does "
           "not vary with composition (an ideal model, or a pair file "
           "carrying zero binary energies), so the residual is 0/0 and proves "
           "nothing.  " if vacuous else "")
        + (f"UNTESTABLE: {'; '.join(refused)}.  " if refused else "")
        + "The Wilson[inline flash03] row is INTERNAL CONSISTENCY "
        "VERIFICATION only (ruled 2026-08-08): it proves the implemented "
        "Wilson equations satisfy Gibbs-Duhem under the pair flash03 carries "
        "-- it curates nothing, validates nothing against experiment, and "
        "does NOT satisfy the owed standards-tier Wilson pair.  "
        + "THIS IS CONSISTENCY, NOT ACCURACY: a model can satisfy "
        "Gibbs-Duhem exactly and still disagree with every measurement ever "
        "made.  It does not enlarge the validation subset.  THE SALT-LEVEL "
        "electrolyte kernels are covered by the STRONGER form "
        "dln(g)/dm = dphi/dm + (phi-1)/m, which ties the water side of the "
        "model to the ion side -- on their DEFAULT parameters, so it tests the "
        "equations and not any curated salt.  Not covered: multicomponent "
        "Gibbs-Duhem; a_w against phi (PitzerSingleSalt DEFINES one from the "
        "other, so comparing them checks an identity the code asserts); and "
        "the PER-ION aqueous models (Davies, PitzerHMW, EdwardsPitzer), which "
        "work on a molality-and-charge basis this probe does not reach.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
