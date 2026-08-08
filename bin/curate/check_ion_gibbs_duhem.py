#!/usr/bin/env python3
"""Gate: multi-ion Gibbs-Duhem, and it MEASURES Davies' declared approximation.

    bin/curate/check_ion_gibbs_duhem.py

For a multi-ion aqueous solution at constant T, P:

    (1000/M_w) dln(a_w)  +  SUM_i m_i dln(gamma_i)  +  SUM_i dm_i  =  0

evaluated along a scaling path m_i(s) = s*m_i0, on a seawater-like state
(Na/Cl/Mg/SO4/K).  This ties the SOLVENT activity to the ION activities.  A
model whose water activity and ion activities do not come from one excess
Gibbs energy fails it, and no golden could ever notice -- a golden recorded
against an inconsistent model is perfectly stable forever.

TWO KINDS OF MODEL, AND TWO DIFFERENT QUESTIONS.  `ActivityResult::osmotic` is
OPTIONAL by design (AqueousActivity.H):

  * PitzerHMW and EdwardsPitzer SUPPLY phi, computed on the same virial
    parameters as their gammas.  For them the constraint is a real test of the
    implementation and the gate demands the finite-difference floor.

  * Davies leaves it null, so the solver keeps phi = 1 -- the dilute limit.
    Its solvent side is FIXED AT IDEAL while its ion side is not, so it cannot
    satisfy the constraint and is not expected to.  That is a declared
    modelling choice, not a defect.

A gate that ran one tolerance over both would manufacture a bug out of a
documented approximation.  One that skipped Davies would conceal that its
water activity is not thermodynamically tied to its ion activities at all.  So
this gate does neither: it MEASURES the departure and requires it to be
present AND to GROW with ionic strength.

That third arm is the useful one, and it is a real negative.  If Davies ever
came back consistent, something would have started supplying an osmotic
coefficient behind its back -- the model would have silently stopped being
Davies.  Requiring the violation to exist is how the gate notices.

It also turns a qualitative caveat into a number a student can see: at I=0.43
the departure is ~6e-3, at I=0.72 it is ~6e-2.  "Indicative model" is
vaguer than "your solvent activity is wrong by this much, and it worsens
here".

WHAT THIS DOES NOT CHECK:
  * NOT accuracy.  Consistency says the two sides agree with each other, never
    that either agrees with measurement.  This does not enlarge the validation
    subset.
  * ONE composition path, one temperature (298.15 K).  A model could be
    consistent along this scaling ray and not elsewhere.
  * NOT the speciation network -- the ions here are a fixed state, not the
    solution of an equilibrium.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROBE = ROOT / "build" / "linux64Gcc" / "ionGdProbe"
SRC = ROOT / "bin" / "curate" / "_ionGibbsDuhemProbe.cpp"

CONSISTENT_TOL = 1e-6      # far above the FD floor, far below any real defect
DECLARED_MIN = 1e-4        # a phi=1 model must depart at least this much


def build():
    r = subprocess.run(
        ["g++", "-std=c++17", "-O2", f"-I{ROOT / 'src'}", f"-I{ROOT}", str(SRC),
         str(ROOT / "build" / "linux64Gcc" / "libchoupo.so"),
         "-Wl,-rpath," + str(ROOT / "build" / "linux64Gcc"), "-o", str(PROBE)],
        capture_output=True, text=True)
    return r.returncode, r.stderr[-1500:]


def main() -> int:
    if not SRC.exists():
        print("check_ion_gibbs_duhem: FAILED\n  the probe source is missing")
        return 1
    if not (ROOT / "build" / "linux64Gcc" / "libchoupo.so").exists():
        print("check_ion_gibbs_duhem: FAILED\n  libchoupo.so not built -- a "
              "check that cannot run must not pass")
        return 1
    rc, err = build()
    if rc != 0:
        print("check_ion_gibbs_duhem: FAILED\n  the probe did not compile -- "
              "the AqueousActivity surface moved.  A check that cannot build "
              "must not pass.\n" + err)
        return 1

    p = subprocess.run([str(PROBE)], capture_output=True, text=True,
                       env=dict(os.environ, CHOUPO_HOME=str(ROOT)), timeout=600)
    raw = p.stdout + p.stderr
    m = re.search(r'<<<JSON\n(.*?)JSON>>>', raw, re.S)
    if p.returncode != 0 or not m:
        print("check_ion_gibbs_duhem: FAILED\n  the probe produced no JSON "
              f"(exit {p.returncode})\n" + raw[-1200:])
        return 1
    rows = json.loads(m.group(1))

    fail, consistent, declared = [], [], []
    by_model = {}
    for r in rows:
        if r["result"] != "ok":
            fail.append(f"{r['model']} did not run: {r['result'][:80]}")
            continue
        by_model.setdefault(r["model"], []).append(r)

    for model, rs in sorted(by_model.items()):
        rs.sort(key=lambda r: r["I"])
        supplies = rs[0]["hasPhi"]
        #  The two kinds must not be silently reclassified.  If a model that
        #  supplied phi stops doing so, its arm changes and nobody is told --
        #  so the KIND is reported in the verdict, every run.
        if supplies:
            worst = max(r["R"] for r in rs)
            if worst > CONSISTENT_TOL:
                fail.append(
                    f"{model} supplies an osmotic coefficient but violates "
                    f"Gibbs-Duhem: R = {worst:.3e} (tolerance "
                    f"{CONSISTENT_TOL:.0e}).  Its water activity and its ion "
                    "activities are not coming from one excess Gibbs energy.")
            consistent.append(
                f"{model} R={worst:.1e} (phi={rs[0]['phi']:.3f}..{rs[-1]['phi']:.3f})")
        else:
            lo, hi = rs[0], rs[-1]
            if hi["R"] < DECLARED_MIN:
                fail.append(
                    f"{model} declares NO osmotic coefficient -- the solver "
                    f"holds phi = 1 -- yet its Gibbs-Duhem residual is only "
                    f"{hi['R']:.3e}.  A model whose solvent side is fixed at "
                    "ideal while its ion side is not CANNOT satisfy the "
                    "constraint.  Consistency here means something is "
                    "supplying an osmotic coefficient behind its back, and the "
                    "model has silently stopped being what it claims.")
            if hi["R"] <= lo["R"]:
                fail.append(
                    f"{model}: the departure does not grow with ionic "
                    f"strength (I={lo['I']:.2f} -> {lo['R']:.2e}, "
                    f"I={hi['I']:.2f} -> {hi['R']:.2e}).  The phi = 1 "
                    "approximation is a DILUTE one; its error must worsen as "
                    "the solution concentrates, or it is not the "
                    "approximation it is documented to be.")
            declared.append(
                f"{model} departs {lo['R']:.1e} at I={lo['I']:.2f} and "
                f"{hi['R']:.1e} at I={hi['I']:.2f}")

    if not consistent:
        fail.append("NOT ONE model supplied an osmotic coefficient, so the "
                    "constraint was never actually tested on anything.")

    if fail:
        print("check_ion_gibbs_duhem: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print(
        "check_ion_gibbs_duhem: OK -- (1000/Mw)dln(a_w) + SUM m_i dln(g_i) + "
        "SUM dm_i = 0 on a seawater-like Na/Cl/Mg/SO4/K state at 298.15 K.  "
        "CONSISTENT (they supply phi on the same parameters as their gammas): "
        + "; ".join(consistent) + ".  DECLARED APPROXIMATION (no phi, solver "
        "holds phi = 1, so the solvent side is fixed at ideal and the "
        "constraint CANNOT hold): " + "; ".join(declared) + " -- the departure "
        "is required to be present and to GROW with ionic strength, because a "
        "Davies that came back consistent would have silently stopped being "
        "Davies.  THIS IS CONSISTENCY, NOT ACCURACY: it says the solvent and "
        "ion sides agree with each other, never that either agrees with "
        "measurement, and it does not enlarge the validation subset.  Not "
        "covered: one composition ray, one temperature, and the ions are a "
        "fixed state rather than a solved speciation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
