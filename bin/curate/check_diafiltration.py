#!/usr/bin/env python3
"""Gate: the batch diafilter conserves matter, and its washout law is falsifiable.

    bin/curate/check_diafiltration.py

WHY THIS EXISTS.  `batchDiafilter` is the tree's first batch membrane, and it
carries two claims that are easy to make and easy to get quietly wrong.

THE FIRST IS CONSERVATION, and it is not free here.  Most batch vessels are
closed: whatever is in them stays, and a mass balance closes by construction.
This one is OPEN in both directions at once -- permeate leaves continuously
and, in constant-volume mode, make-up solvent arrives continuously -- so its
ledger has to agree with the state the integrator accepted, on two boundary
flows, at every step.  The first version re-integrated the flux with a
first-order quadrature to build those records while the state was advanced by
the adaptive stiff sweep, and the two disagreed at O(dt): the element closure
came out at 1.9e-3 instead of machine precision.  Worse, the first version did
not declare the make-up solvent AT ALL, and the campaign balance reported 4996
kg of unaccounted mass -- the balance was right and the unit was wrong.

Both are fixed by making the permeated VOLUME an integrated state and reading
every record as a DIFFERENCE against the accepted inventory.  This gate pins
the result of that, because "it closed when I looked" is not a contract.

THE SECOND IS THE LESSON.  The classical constant-volume washout law

    c/c_0 = exp( -(1 - R) N ),    N = diavolumes

is derived assuming the rejection R is CONSTANT.  It is not: as the poorly
rejected solute leaves, the retentate's osmotic pressure falls, the flux
rises, and the observed rejection moves with it.  The unit publishes the
actual washout beside the idealisation evaluated from THIS RUN's own initial
R, so a student can see where the hand derivation stops being safe.

That comparison is only worth publishing if it is REAL, and a gate is the only
thing standing between "the model disobeys the ideal law" and "the two numbers
were computed from each other".  So this gate recomputes the idealisation
independently, in Python, from the run's own published R_initial and
diavolumes -- and then requires the actual to DIFFER from it, in the direction
the physics dictates.

WHAT THIS GATE CHECKS.

  (a) MATTER IS CONSERVED TO MACHINE PRECISION, on a case that both drinks
      and discharges.  The element closure must be at machine level, not
      merely inside a tolerance -- an open vessel whose ledger is a
      difference against its own accepted state has no reason to be
      approximate, and a loose bound here would hide the O(dt) defect that
      provoked this gate.

  (b) THE MAKE-UP SOLVENT IS DECLARED, as a boundary intake in the ledger.
      Without this arm the unit could conserve mass by simply not drinking.

  (c) THE IDEALISATION IS RECOMPUTED HERE, not compared with itself.
      exp(-(1 - R_initial) * N) is evaluated in Python from the run's own two
      published numbers and must reproduce the published `washoutIdeal_`.

  (d) THE TWO CURVES ACTUALLY PART, and in the right direction.  The observed
      rejection RISES over this run, so the real washout must be SLOWER than
      the constant-R law -- actual > ideal.  A model that happened to obey the
      idealisation exactly would make the case pedagogically pointless and is
      failed here rather than shipped as a lesson.

  (e) THE REJECTION MOVES.  The whole argument rests on R not being constant,
      so R_final != R_initial is required for the poorly-rejected solute.

  (f) THE DISCRIMINATION IS REAL: the well-rejected solute is retained and the
      poorly-rejected one is not.  Without it the case would pass just as
      happily if the membrane rejected everything equally.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
Nothing here is validated against a measured diafiltration -- the NF270
permeabilities are the record's own case-fitted pedagogical set
(`provenance fittedToCase`) and this gate makes no claim about a real element.
Fouling and flux decline are NOT modelled by the unit and therefore not tested.
The `concentration` mode is exercised by no corpus case yet, so its washout
branch (deliberately absent, a different law) rests on the source and not on a
run.  And the film coefficient is DECLARED by the case, so nothing here tests
a polarisation correlation -- there is none.

SABOTAGE-VERIFIED 2026-08-25, five times; OBSERVED output recorded below,
verbatim.

Sabotage 1 -- `takeContinuousIntake` returns nothing, so the vessel drinks in
silence.  This IS the defect the first run of the case had:

    check_diafiltration: FAILED
      the element closure is 0.845112689669, above the machine-level bound 1e-12 ...
      the mass closure is 0.844644886847, above 1e-12
      no `externalIntake` record: the vessel is in constant-volume mode, so it drinks make-up solvent at the permeate rate ...

Sabotage 2 -- the permeate ledger goes back to re-integrating the flux instead
of differencing the accepted inventory.  This is the arm this gate exists for,
and the magnitude is the point: the run still converges, still looks sane, and
closes 500x worse than the bound.

    check_diafiltration: FAILED
      the element closure is 0.000503112144406, above the machine-level bound 1e-12 ...
      the mass closure is 0.000502833792254, above 1e-12

    A tolerance of 1e-3 -- which reads generous for a mass balance -- would
    have passed this.  That is why (a) is pinned at machine level and not at
    a number that sounds careful.

Sabotage 3 -- `washoutIdeal` set to `washoutActual`, i.e. the comparison
computed from itself.  Both the independent recomputation AND the
must-differ arm fire, which is the point of having both:

    check_diafiltration: FAILED
      NaCl: the published washoutIdeal 0.5015289241 is not exp(-(1-R0) N) = 0.4969936895 recomputed here from the run's own R_initial 0.871400548 and diavolumes 5.436865705
      MgSO4: the published washoutIdeal 0.9921573497 is not exp(-(1-R0) N) = 0.9920202209 ...
      NaCl: the actual washout 0.501529 is not SLOWER than the constant-R idealisation 0.501529 ...

Sabotage 4 -- the published rejection frozen at its initial value, which is
the assumption the whole case exists to break:

    check_diafiltration: FAILED
      NaCl: the observed rejection did not move (R 0.87140054802 -> 0.87140054802). The entire lesson is that R is not a constant; if it is one here, the comparison in (d) is measuring rounding

Sabotage 5 -- the DRIVER stops draining the intake (the unit is innocent).
Same signature as sabotage 1, which is correct and is why both exist: the
declaration can be lost on either side of the hook, and a gate that only
sabotaged the unit would not notice the driver dropping it.

    check_diafiltration: FAILED
      the element closure is 0.845112689669, above the machine-level bound 1e-12 ...
      no `externalIntake` record: ...
"""

import json
import math
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
CASE = "tutorials/batch/membrane/diafilter01_nf_desalting"

WASHED = "NaCl"      # poorly rejected: it must leave
RETAINED = "MgSO4"   # well rejected:  it must stay

#  Machine level, with room for the summation order -- not a tolerance.
CLOSURE_MAX = 1.0e-12


def main():
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(BUILD / "choupoBatch"), str(ROOT / CASE)],
                       capture_output=True, text=True, timeout=900, env=env)
    out = p.stdout + p.stderr
    if "<<<Choupo:result-begin>>>" not in out:
        print("check_diafiltration: FAILED")
        print("  the case produced no result block:\n" + out[-1500:])
        return 1
    j = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                      .split("<<<Choupo:result-end>>>")[0])
    k = j["kpis"]["retentate"]
    camp = j["kpis"]["campaign"]
    failures = []

    # ---- (a) conservation, at machine level -------------------------------
    worst = camp.get("element_worst_closure_rel")
    if worst is None or worst > CLOSURE_MAX:
        failures.append(
            f"the element closure is {worst}, above the machine-level bound "
            f"{CLOSURE_MAX:g} -- an open vessel whose ledger is a difference "
            "against its own accepted state has no reason to be approximate; "
            "a re-integrated flux disagrees with the integrator at O(dt)")
    if camp.get("mass_closure_rel", 1.0) > CLOSURE_MAX:
        failures.append(
            f"the mass closure is {camp.get('mass_closure_rel')}, above "
            f"{CLOSURE_MAX:g}")

    # ---- (b) the make-up solvent is declared ------------------------------
    intake = [t for t in j.get("transfers", [])
              if t.get("kind") == "externalIntake"]
    if not intake:
        failures.append(
            "no `externalIntake` record: the vessel is in constant-volume "
            "mode, so it drinks make-up solvent at the permeate rate, and a "
            "vessel that consumes matter without declaring it reads to the "
            "campaign balance as one fabricating mass")
    elif not any(v > 0.0 for v in intake[0].get("dn", {}).values()):
        failures.append("the `externalIntake` record carries no matter")

    # ---- (c) the idealisation, recomputed here ----------------------------
    N = k.get("diavolumes", 0.0)
    if N <= 1.0:
        failures.append(f"the run reached only {N} diavolumes -- too few for "
                        "the washout comparison to mean anything")
    for sp in (WASHED, RETAINED):
        R0 = k.get("R_initial_" + sp)
        got = k.get("washoutIdeal_" + sp)
        if R0 is None or got is None:
            failures.append(f"{sp}: R_initial or washoutIdeal is not published")
            continue
        mine = math.exp(-(1.0 - R0) * N)
        if abs(mine - got) > 1.0e-9 * max(abs(mine), 1.0e-30):
            failures.append(
                f"{sp}: the published washoutIdeal {got:.10g} is not "
                f"exp(-(1-R0) N) = {mine:.10g} recomputed here from the run's "
                f"own R_initial {R0:.10g} and diavolumes {N:.10g}")

    # ---- (d) the curves part, in the direction the physics dictates -------
    a = k.get("washoutActual_" + WASHED)
    i = k.get("washoutIdeal_" + WASHED)
    if a is None or i is None:
        failures.append(f"{WASHED}: the washout pair is not published")
    elif not (a > i):
        failures.append(
            f"{WASHED}: the actual washout {a:.6g} is not SLOWER than the "
            f"constant-R idealisation {i:.6g}.  The observed rejection RISES "
            "over this run (the osmotic pressure falls as the salt leaves and "
            "the flux climbs), so more solute must remain than the law "
            "predicts.  If these two agree, the case teaches nothing")

    # ---- (e) the rejection is not a constant ------------------------------
    R0, Rf = k.get("R_initial_" + WASHED), k.get("R_final_" + WASHED)
    if R0 is None or Rf is None or abs(Rf - R0) < 1.0e-6:
        failures.append(
            f"{WASHED}: the observed rejection did not move (R {R0} -> {Rf}). "
            "The entire lesson is that R is not a constant; if it is one here, "
            "the comparison in (d) is measuring rounding")

    # ---- (f) the membrane discriminates -----------------------------------
    rw, rr = k.get("recovery_" + WASHED, 1.0), k.get("recovery_" + RETAINED, 0.0)
    if not (rw < 0.7):
        failures.append(f"{WASHED} was not washed out (recovery {rw:.4g}) -- "
                        "the poorly rejected solute must leave")
    if not (rr > 0.95):
        failures.append(f"{RETAINED} was not retained (recovery {rr:.4g}) -- "
                        "the well rejected solute must stay")

    if failures:
        print("check_diafiltration: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print("check_diafiltration: OK -- the batch diafilter conserves matter to "
          f"{worst:.2e} on the elements while both discharging permeate and "
          "drinking declared make-up solvent; over "
          f"{N:.4g} diavolumes it washes {WASHED} to {rw:.4g} of the charge "
          f"while retaining {RETAINED} at {rr:.4g}; its observed rejection "
          f"MOVES ({R0:.4f} -> {Rf:.4f}), so the actual washout {a:.6g} is "
          f"slower than the constant-R law's {i:.6g} -- an idealisation "
          "recomputed here from the run's own R_initial and diavolume count, "
          "not read back from the engine.  NOT COVERED: agreement with any "
          "measured diafiltration (the NF270 set is the record's own "
          "case-fitted pedagogical one), fouling and flux decline (not "
          "modelled), the `concentration` mode (no corpus case), and any "
          "polarisation correlation (k_film is declared by the case).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
