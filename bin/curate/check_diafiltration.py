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

SABOTAGE-VERIFIED 2026-08-25, eight times; OBSERVED output recorded below,
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

Sabotage 6 -- a declared fouling law parsed and NOT honoured
(effectivePermeance returns the clean value):

    check_diafiltration: FAILED
      the effective permeance ended at 1 of clean -- a declared cake law that leaves the membrane unchanged is a block the engine parsed and did not honour
      the fouled run reached 5.437 diavolumes against the clean twin's 5.437 -- fouling must COST throughput, or it is not being applied
      the fouled run washed out MORE NaCl than the clean twin ...
      the fouled run's final flux is not below the clean twin's

Sabotage 7 -- the mechanism applied but never announced:

    check_diafiltration: FAILED
      the fouling law did not announce `fouling    Hermia` ...
      the fouling law did not announce `CAKE` ...
      the fouling law did not announce `declared because:` ...

Sabotage 8 -- `reason` stops being required, so a mechanism can be claimed
in silence.  IT SURVIVED THE FIRST TIME, and for a reason worth keeping:
the shipped witness DECLARES a reason, so removing the requirement changes
nothing about it.  A guard whose only case satisfies it is a guard nothing
tests.  Arm (h) now BUILDS the offending cases -- a fouling block with the
reason stripped, one asking for Hermia's `standard`, one asking for a law
nobody implemented -- and requires each to refuse AND to name why.  With
that arm present:

    check_diafiltration: FAILED
      probe `reason`: a case declaring a mechanism claimed with no stated reason RAN and exited 0 -- the refusal is not there

    This is the second arm in one day that could not fail until it was made
    to (see sabotage 1).  The lesson is not about this gate: a claim in an
    OK line -- "refuses by name" -- is not evidence, and the corpus will
    not supply the negative because a shipped case is by construction a
    valid one.

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
#  The SAME operation with a declared Hermia cake-law decline.  Everything
#  else is identical, so the difference between the two runs IS the fouling.
FOULED = "tutorials/batch/membrane/diafilter02_fouling_decline"

WASHED = "NaCl"      # poorly rejected: it must leave
RETAINED = "MgSO4"   # well rejected:  it must stay

#  Machine level, with room for the summation order -- not a tolerance.
CLOSURE_MAX = 1.0e-12


def main():
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))

    def run(case):
        r = subprocess.run([str(BUILD / "choupoBatch"), str(ROOT / case)],
                           capture_output=True, text=True, timeout=900, env=env)
        return r.stdout + r.stderr

    out = run(CASE)
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

    # ---- (g) fouling: the declared decline actually bites ----------------
    fout = run(FOULED)
    if "<<<Choupo:result-begin>>>" not in fout:
        failures.append(f"{FOULED}: produced no result block")
        fk = {}
    else:
        fj = json.loads(fout.split("<<<Choupo:result-begin>>>")[1]
                            .split("<<<Choupo:result-end>>>")[0])
        fk = fj["kpis"]["retentate"]

        #  It must ANNOUNCE, with the mechanism and the author's reason.  A
        #  blocking law is a claim, and a claim made in silence is the
        #  no-silent-crutch violation this project exists to avoid.
        for want in ("fouling    Hermia", "CAKE", "declared because:"):
            if want not in fout:
                failures.append(
                    f"the fouling law did not announce `{want}` -- a blocking "
                    "law names a MECHANISM and must reach the reader with the "
                    "reason the author gave for it")

        #  The permeance must actually be LOST, and the run must feel it.
        aeff = fk.get("A_eff_over_A_w_final")
        if aeff is None or not (0.05 < aeff < 0.99):
            failures.append(
                f"the effective permeance ended at {aeff} of clean -- a "
                "declared cake law that leaves the membrane unchanged is a "
                "block the engine parsed and did not honour")

        #  And the CONSEQUENCE, which is the whole reason to model it: the
        #  same clock buys fewer diavolumes and leaves more solute behind.
        #  Compared against the clean twin, so the difference is the fouling
        #  and not a different operation.
        if k.get("diavolumes") and fk.get("diavolumes"):
            if not (fk["diavolumes"] < k["diavolumes"]):
                failures.append(
                    f"the fouled run reached {fk['diavolumes']:.4g} diavolumes "
                    f"against the clean twin's {k['diavolumes']:.4g} -- fouling "
                    "must COST throughput, or it is not being applied")
        if k.get("recovery_" + WASHED) and fk.get("recovery_" + WASHED):
            if not (fk["recovery_" + WASHED] > k["recovery_" + WASHED]):
                failures.append(
                    f"the fouled run washed out MORE {WASHED} than the clean "
                    "twin -- fewer diavolumes must leave more solute behind")

        #  The flux must turn round.  Without fouling this run's flux RISES
        #  (the osmotic pressure falls as the salt leaves); with it, the
        #  decline must overwhelm that, which is the observable a reader
        #  recognises from a real rig.
        if k.get("J_w_final_LMH") and fk.get("J_w_final_LMH"):
            if not (fk["J_w_final_LMH"] < k["J_w_final_LMH"]):
                failures.append(
                    "the fouled run's final flux is not below the clean twin's")

        #  Conservation must survive the extra model.
        fcamp = fj["kpis"]["campaign"]
        if fcamp.get("element_worst_closure_rel", 1.0) > CLOSURE_MAX:
            failures.append(
                f"the fouled run's element closure is "
                f"{fcamp.get('element_worst_closure_rel')}, above "
                f"{CLOSURE_MAX:g}")

    # ---- (h) the REFUSALS fire, on cases built here ----------------------
    #  Without these the gate would pass just as happily with the refusals
    #  deleted: the shipped witness declares a valid law AND a reason, so
    #  nothing in the corpus exercises either guard.  Sabotage 8 proved
    #  exactly that -- it removed the `reason` requirement and this gate
    #  said OK.
    import shutil, tempfile, re as _re
    probes = [
        ("reason", _re.compile(r'\n\s*reason\s+"[^"]*";'), "",
         "reason", "a mechanism claimed with no stated reason"),
        ("law", _re.compile(r'law\s+cake;'), "law      standard;",
         "pore-INTERNAL geometry",
         "Hermia's `standard`, which this lumped permeance cannot represent"),
        ("unknown", _re.compile(r'law\s+cake;'), "law      wishful;",
         "unknown fouling law", "a law nobody implemented"),
    ]
    with tempfile.TemporaryDirectory() as td:
        for tag, pat, repl, want, why in probes:
            dst = Path(td) / ("probe_" + tag)
            shutil.copytree(ROOT / FOULED, dst)
            fd = dst / "system" / "flowsheetDict"
            txt = fd.read_text()
            new_txt = pat.sub(repl, txt, count=1)
            if new_txt == txt:
                failures.append(f"probe `{tag}`: could not build it -- its "
                                "anchor is gone from the witness, so the "
                                "refusal it tests is unproven")
                continue
            fd.write_text(new_txt)
            r = subprocess.run([str(BUILD / "choupoBatch"), str(dst)],
                               capture_output=True, text=True, timeout=900,
                               env=env)
            blob = r.stdout + r.stderr
            if r.returncode == 0:
                failures.append(
                    f"probe `{tag}`: a case declaring {why} RAN and exited 0 "
                    "-- the refusal is not there")
            elif want not in blob:
                failures.append(
                    f"probe `{tag}`: refused, but without saying `{want}` -- "
                    "a refusal that does not name its reason teaches nothing")

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
          "not read back from the engine.  A declared Hermia CAKE law on the "
          f"same operation announces its mechanism and reason, ends at "
          f"{fk.get('A_eff_over_A_w_final', float('nan')):.4f} of clean "
          f"permeance, and COSTS what fouling must cost: "
          f"{fk.get('diavolumes', float('nan')):.4g} diavolumes against the "
          f"clean twin's {N:.4g}, a final flux BELOW the twin's instead of "
          f"above it, and {fk.get('recovery_' + WASHED, float('nan')):.4f} of "
          f"the {WASHED} left behind against {rw:.4f} -- with conservation "
          "unharmed.  NOT COVERED: agreement with any MEASURED "
          "diafiltration or any measured fouling (the NF270 set is the "
          "record's own case-fitted pedagogical one and diafilter02's k is "
          "declared HYPOTHETICAL in its own header -- the tree carries no "
          "fouling data at all), Hermia's `standard` and `complete` laws "
          "(refused by name, not implemented), the `concentration` mode (no "
          "corpus case), and any polarisation correlation (k_film is declared "
          "by the case).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
