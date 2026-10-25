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

  (g) A DECLARED FOULING LAW BITES (diafilter02, the same operation): see
      the arm itself.  (h) THE FOULING REFUSALS FIRE, on cases built here.

  (i) THE CAMPAIGN'S TIME-AVERAGED REJECTION is rebuilt from OTHER numbers
      (C157c, 2026-10-25).  The spiral module states a stage's rejection as
      a SPATIAL average (the channel's mixed permeate against the inlet
      feed); a batch campaign's is a TIME average, and the unit publishes
      per solute c_permPooled = (n0 - n)/V_perm, c_bMeanPerm = INTEGRAL c_b
      dV_perm / V_perm, c_bInitial = n0/V0, R_avg = 1 - c_permPooled/
      c_bMeanPerm and R_avgVsInitialFeed = 1 - c_permPooled/c_bInitial.
      Here: the identities from the inventory (n_final, recovery, V_initial,
      V_permeated); c_bInitial against the trajectory's first row; on the
      error-controlled witness (diafilter03, DSPM-DE in concentration mode)
      the integral against a Simpson quadrature of c_b * Q_p on the
      published trajectory; R_avg inside the range of R_obs (it is their
      weighted mean); and the ordering each mode dictates -- the pooled
      permeate against the charge lies BELOW R_avg when the retentate
      concentrates and ABOVE it when the solute is washed out.  The witness
      must also SAY that DSPM-DE solved its pore and that the sweep was
      Rosenbrock23, so a solution-diffusion run under a DSPM-DE name cannot
      pass.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
Nothing here is validated against a measured diafiltration -- the NF270
permeabilities and pore parameters are the records' own case-fitted
pedagogical sets (`provenance fittedToCase`) and this gate makes no claim
about a real element.  No fouling arm uses measured fouling data; the tree
carries none.  The trajectory quadrature of (i) is applied only to the
error-controlled witness: the fixed-step cases are advanced by the unit's
explicit Euler step, so their engine integral is first order and a Simpson
rule would measure the step, not a defect.  SDEM runs in the batch vessel
(verified by hand on a probe, C157c) but no corpus case carries it.  The
`concentration` mode's absent washout comparison (a different law) rests on
the source.  And the film coefficient is DECLARED by the case, so nothing here tests
a polarisation CORRELATION: `k_film` is a constant and the Sherwood
correlations are never reached.  The `polarisation {}` POLICY is read (the
unit builds the shared Polarisation object like the steady module, so a
suction correction and ion coupling are available to it), but no corpus
diafiltration declares one, so no arm here exercises either.

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

ARM (i), sabotage-verified 2026-10-25 (C157c); OBSERVED output, abridged:

Before the unit published the average (origin/main's engine, run against
this gate): every arm (i) witness fails on the missing key.

    tutorials/batch/membrane/diafilter01_nf_desalting: `R_avg_NaCl` is not published ...
    tutorials/batch/membrane/diafilter03_dspmde_batch: `R_avg_NaCl` is not published ...

Sabotage 9 -- the integrand is the PERMEATE concentration instead of the
bulk (dS/dt = c_p Q_p), so the "mean feed" is the pooled permeate itself
and every R_avg is zero.  The Simpson quadrature of the trajectory and the
weighted-mean bound both fire:

    diafilter03 NaCl: c_bMeanPerm 0.01062396667 is not the trajectory's INTEGRAL c_b Q_p dt / V_perm = 0.02909550425 ...
    diafilter03 NaCl: R_avg -1.110223e-15 lies outside the range of R_obs [0.55402304, 0.69119481] ...

Sabotage 10 -- the pooled permeate taken from the LAST instant's c_p
instead of the inventory difference (n0 - n)/V_perm:

    diafilter01 NaCl: c_permPooled = (n0 - n)/V_perm -- published 0.00125118244129, recomputed here 0.00182693130446
    diafilter03 NaCl: R_avg 0.27950642 lies outside the range of R_obs [0.55402306, 0.69119481] ...
"""

import csv
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
#  Batch CONCENTRATION on the DSPM-DE pore model, integrated by the
#  error-controlled sweep: the witness of the time-averaged rejection.
DSPMDE = "tutorials/batch/membrane/diafilter03_dspmde_batch"
DSPMDE_SALTS = ("NaCl", "MgSO4")

WASHED = "NaCl"      # poorly rejected: it must leave
RETAINED = "MgSO4"   # well rejected:  it must stay

#  Machine level, with room for the summation order -- not a tolerance.
CLOSURE_MAX = 1.0e-12

#  The adaptive witness closes its ledger through a Rosenbrock sweep whose
#  Jacobian is a finite difference: the linear invariant survives to that
#  round-off (measured 1.03e-12), not to the 1e-16 the fixed-step cases
#  reach.  Still six orders below the 5e-4 signature of a re-quadrature
#  (sabotage 2).
CLOSURE_MAX_ADAPTIVE = 1.0e-10

#  The time-averaged rejection is published from three integrated states:
#  the identities in arm (i) hold to round-off, and a Simpson quadrature of
#  c_b * Q_p on the witness's 5 s write grid reproduces the integral to the
#  trajectory's own printed precision (measured 5e-6).
IDENTITY_TOL = 1.0e-10
SIMPSON_TOL = 1.0e-4


def avg_failures(case, kk, traj_path, salts, mode, simpson):
    """Arm (i): rebuild the time-averaged rejection from OTHER numbers.

    The unit publishes, per solute, c_permPooled = (n0 - n)/V_perm,
    c_bMeanPerm = INTEGRAL c_b dV_perm / V_perm, c_bInitial = n0/V0,
    R_avg = 1 - c_permPooled/c_bMeanPerm and R_avgVsInitialFeed =
    1 - c_permPooled/c_bInitial.  Each is recomputed here from the inventory
    (n_final, recovery, V_initial, V_permeated) and the trajectory -- never
    read back from itself."""
    fl = []
    pre = "retentate."
    try:
        rows = list(csv.DictReader(open(traj_path)))
    except OSError:
        return [f"{case}: no trajectory.csv to cross-check"]
    for sp in salts:
        got, missing = {}, None
        for key in ("R_avg_", "R_avgVsInitialFeed_", "c_permPooled_",
                    "c_bMeanPerm_", "c_bInitial_", "recovery_", "n_"):
            name = key + sp + ("_final" if key == "n_" else "")
            if name not in kk:
                missing = name
                break
            got[key] = kk[name]
        if missing:
            fl.append(f"{case}: `{missing}` is not published -- the "
                      "campaign's time-averaged rejection has no home in "
                      "the result")
            continue
        n_f, rec = got["n_"], got["recovery_"]
        V0, Vp = kk.get("V_initial_m3"), kk.get("V_permeated_m3")
        if not (rec > 0 and V0 and Vp):
            fl.append(f"{case} {sp}: recovery/V_initial/V_permeated missing "
                      "or zero")
            continue
        n0 = n_f / rec
        for what, pub, mine in (
                ("c_bInitial = n0/V0", got["c_bInitial_"], n0 / V0),
                ("c_permPooled = (n0 - n)/V_perm", got["c_permPooled_"],
                 (n0 - n_f) / Vp),
                ("R_avg = 1 - c_permPooled/c_bMeanPerm", got["R_avg_"],
                 1.0 - got["c_permPooled_"] / got["c_bMeanPerm_"]),
                ("R_avgVsInitialFeed = 1 - c_permPooled/c_bInitial",
                 got["R_avgVsInitialFeed_"],
                 1.0 - got["c_permPooled_"] / got["c_bInitial_"])):
            #  A concentration is held RELATIVE; a rejection is a number of
            #  order one and held ABSOLUTE (a relative band on R near zero
            #  would compare round-off with round-off).
            scale = 1.0 if what.startswith("R_") else max(abs(mine), 1e-30)
            if abs(pub - mine) > IDENTITY_TOL * scale:
                fl.append(f"{case} {sp}: {what} -- published {pub:.12g}, "
                          f"recomputed here {mine:.12g}")
        cb = [float(r[pre + "c_b_" + sp]) for r in rows]
        qp = [float(r[pre + "Q_p_m3s"]) for r in rows]
        ro = [float(r[pre + "R_obs_" + sp]) for r in rows]
        tt = [float(r["t"]) for r in rows]
        #  The charge is the trajectory's first bulk concentration.
        if abs(cb[0] - got["c_bInitial_"]) > 1e-8 * cb[0]:
            fl.append(f"{case} {sp}: c_bInitial {got['c_bInitial_']:.10g} is "
                      f"not the trajectory's c_b at t = 0, {cb[0]:.10g}")
        #  The integral S = INTEGRAL c_b Q_p dt, by a quadrature of the
        #  gate's own on the published trajectory.  Only where the engine
        #  integrated with error control: under the fixed explicit step the
        #  engine's own integral is first order and a Simpson rule would
        #  measure the engine's step, not a defect.
        if simpson:
            h = tt[1] - tt[0]
            f = [a * b for a, b in zip(cb, qp)]
            nint = len(f) - 1
            uniform = all(abs((tt[i + 1] - tt[i]) - h) < 1e-9 * h
                          for i in range(nint))
            if nint < 2 or nint % 2 or not uniform:
                fl.append(f"{case}: the trajectory grid is not even and "
                          "uniform -- Simpson cannot be applied; fix the "
                          "witness's writeInterval")
            else:
                I = h / 3.0 * (f[0] + f[-1] + 4 * sum(f[1:-1:2])
                               + 2 * sum(f[2:-1:2]))
                mean = I / Vp
                if abs(mean / got["c_bMeanPerm_"] - 1.0) > SIMPSON_TOL:
                    fl.append(
                        f"{case} {sp}: c_bMeanPerm {got['c_bMeanPerm_']:.10g} "
                        "is not the trajectory's INTEGRAL c_b Q_p dt / V_perm "
                        f"= {mean:.10g} (Simpson on the write grid) within "
                        f"{SIMPSON_TOL:g} -- the weight is not the permeate "
                        "rate, or the integrand is not the bulk concentration")
        #  R_avg is a weighted mean of R_obs (weights c_b Q_p).
        lo, hi = min(ro), max(ro)
        if not (lo - 1e-9 <= got["R_avg_"] <= hi + 1e-9):
            fl.append(f"{case} {sp}: R_avg {got['R_avg_']:.8g} lies outside "
                      f"the range of R_obs [{lo:.8g}, {hi:.8g}] -- a weighted "
                      "mean of R_obs cannot")
        #  The ordering the mode dictates: a concentrating retentate puts the
        #  pooled-permeate rejection BELOW R_avg, a washed-out one ABOVE it.
        ra, ri = got["R_avg_"], got["R_avgVsInitialFeed_"]
        if mode == "concentration" and not (ri < ra):
            fl.append(f"{case} {sp}: R_avgVsInitialFeed {ri:.8g} is not "
                      f"below R_avg {ra:.8g}, though the retentate "
                      "concentrated -- the pooled permeate was drawn from a "
                      "bulk richer than the charge")
        if mode == "constantVolume" and not (ri > ra):
            fl.append(f"{case} {sp}: R_avgVsInitialFeed {ri:.8g} is not "
                      f"above R_avg {ra:.8g}, though the solute was washed "
                      "out of the retentate")
    return fl


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

    # ---- (i) the campaign's TIME-AVERAGED rejection, rebuilt here --------
    #  The batch counterpart of the spiral module's SPATIAL average (its
    #  R_obs is the channel's mixed permeate against the inlet feed).  On
    #  the constant-volume witness the washed-out salt orders one way; on
    #  the DSPM-DE concentration witness both salts order the other, and
    #  the integral is held to a quadrature of the published trajectory.
    failures += avg_failures(CASE, k, ROOT / CASE / "trajectory.csv",
                             (WASHED,), "constantVolume", simpson=False)

    dout = run(DSPMDE)
    dk = {}
    if "<<<Choupo:result-begin>>>" not in dout:
        failures.append(f"{DSPMDE}: produced no result block:\n"
                        + dout[-800:])
    else:
        dj = json.loads(dout.split("<<<Choupo:result-begin>>>")[1]
                            .split("<<<Choupo:result-end>>>")[0])
        dk = dj["kpis"]["retentate"]
        #  DSPM-DE, SOLVED, at every instant, under the error-controlled
        #  sweep -- not a solution-diffusion run under a DSPM-DE name.
        for want in ("transport DSPM-DE", "[DSPM-DE] pore SOLVED",
                     "Rosenbrock23"):
            if want not in dout:
                failures.append(f"{DSPMDE}: the run does not say `{want}` -- "
                                "the pore model or the error-controlled "
                                "sweep did not run")
        dc = dj["kpis"]["campaign"]
        if dc.get("element_worst_closure_rel", 1.0) > CLOSURE_MAX_ADAPTIVE:
            failures.append(f"{DSPMDE}: element closure "
                            f"{dc.get('element_worst_closure_rel')} above "
                            f"{CLOSURE_MAX_ADAPTIVE:g}")
        if not (dk.get("concentrationFactor", 0.0) > 2.0):
            failures.append(f"{DSPMDE}: concentration factor "
                            f"{dk.get('concentrationFactor')} -- the vessel "
                            "did not concentrate")
        #  The poorly rejected salt's rejection FALLS as the retentate
        #  concentrates: R is not the membrane's alone.
        r0, rf = dk.get("R_initial_NaCl"), dk.get("R_final_NaCl")
        if r0 is None or rf is None or not (rf < r0 - 1e-3):
            failures.append(f"{DSPMDE}: the NaCl rejection did not fall "
                            f"({r0} -> {rf}) as the retentate concentrated")
        failures += avg_failures(DSPMDE, dk, ROOT / DSPMDE / "trajectory.csv",
                                 DSPMDE_SALTS, "concentration", simpson=True)

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
          "unharmed.  The campaign's TIME-AVERAGED rejection is rebuilt here "
          "from the inventory and the trajectory: on the DSPM-DE "
          f"concentration witness (factor "
          f"{dk.get('concentrationFactor', float('nan')):.3g}, the pore "
          "SOLVED at every instant) R_avg is "
          f"{dk.get('R_avg_NaCl', float('nan')):.4f} NaCl and "
          f"{dk.get('R_avg_MgSO4', float('nan')):.4f} MgSO4, inside the range "
          "of the instantaneous R_obs, its integral held to a Simpson "
          f"quadrature of the trajectory within {SIMPSON_TOL:g}, and the "
          "pooled permeate against the charge lies BELOW it ("
          f"{dk.get('R_avgVsInitialFeed_NaCl', float('nan')):.4f} NaCl) as a "
          "concentrating retentate dictates, ABOVE it on the washed-out "
          "constant-volume run.  NOT COVERED: agreement with any MEASURED "
          "diafiltration or any measured fouling (the NF270 sets are the "
          "records' own case-fitted pedagogical ones and diafilter02's k is "
          "declared HYPOTHETICAL in its own header -- the tree carries no "
          "fouling data at all), Hermia's `standard` and `complete` laws "
          "(refused by name, not implemented), the trajectory quadrature on "
          "the fixed-step cases (their engine integral is an explicit Euler "
          "sum), SDEM in the batch vessel (no corpus case), and any "
          "polarisation correlation (k_film is declared by the case).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
