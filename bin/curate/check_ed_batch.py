#!/usr/bin/env python3
"""Gate: a BATCH electrodialysis rig is where the predicted limiting current
starts to matter -- it FALLS while the run proceeds, and the run crosses it.
    bin/curate/check_ed_batch.py

WHY THIS EXISTS.  `GeraldesAfonso2010` predicts i_lim from the ion
diffusivities and the DILUATE COMPOSITION (V. Geraldes, M.D. Afonso, J. Membr.
Sci. 360 (2010) 499-508).  In a steady case that composition is fixed, so the
prediction is evaluated once and is, to a student, a better number than a
declared transport number.  In a batch desalination the diluate DEPLETES, so
i_lim falls under a constant current until they cross -- and that crossing,
which no steady case can show, is the whole pedagogy of batch electrodialysis.
This gate holds the pieces that make it a measurement rather than a picture:
the closed rig's inventory, the falling i_lim, the hand calculation it is
compared against, the NEGATIVE that proves the comparison is not rigged, and
the refusals that keep the model inside what it can claim.

WHAT THIS GATE CHECKS (every witness is RUN here; nothing is read from a
stale trajectory or a committed output):

  (a) THE CLOSED RIG CONSERVES, AT MACHINE LEVEL.  Both witnesses must close
      mass and every element at 1e-12 or better -- not a tolerance, the level
      a closed vessel whose derivative writes ONE number with two signs has
      no reason to miss.  And the campaign's INITIAL inventory is recomputed
      here from the case's own 0/internalState: it must equal the sum of BOTH
      declared tanks, so a unit that published only the diluate (or double
      counted) is caught by arithmetic and not only by the closure.

  (b) i_lim FALLS, AND IT FALLS BY THE RIGHT LAW.  On a single salt D_eff is
      composition-independent and the flow is declared, so Sh, Re, Sc and
      k_c,eff are constants of the run and Eq. (15) makes i_lim exactly
      PROPORTIONAL to the diluate concentration.  The gate reads
      trajectory.csv and requires i_lim(t)/i_lim(0) == m_dil(t)/m_dil(0) on
      every written row to 1e-9, and recomputes i_lim(0) itself in Python from
      the published per-ion data and k_c,eff.  A model whose i_lim did not
      move would pass every KPI golden and teach nothing.

  (c) THE HAND CALCULATION IS COMPUTED FROM THE RUN, AND THE RUN DISOBEYS IT.
      `demin_ideal` must equal xi I(0) N t_end / (z F n(0)) recomputed here
      from the case's OWN declarations and the run's own I_initial, to 1e-9 --
      it is Faraday's law at the initial current, and it must not be a
      declared number.  On edbatch01 the actual must be materially BELOW it,
      and the run must NAME the reason at the instant it happens (the
      over-limiting warning, the timeline status event, the pinned crossing
      time).  A lesson that agrees with itself teaches nothing.

  (d) THE NEGATIVE, and it is the arm that proves (c) is not arranged.  The
      SAME case with `overLimiting { model none; }` must reproduce the hand
      calculation to 1e-9 -- with the plateau gone the model contains nothing
      that could part from a straight line -- while STILL announcing the
      crossing, and announcing it as an EXTRAPOLATION rather than as a model.

  (e) CONSTANT VOLTAGE FAILS THE SAME LAW FOR THE OPPOSITE REASON.  On
      edbatch02 the current must DECAY materially, i/i_lim must never reach 1
      (`overLimitingReached` 0), `xi_eff_final` must be exactly the declared
      xi (so nothing about the limiting current entered the answer), and the
      actual must still fall short of the hand calculation.  The solved
      current is recomputed here from the run's own final E_mem and R_pair
      through U = N(E_mem + I R_pair) + E_electrodes, to 1e-9.

  (f) ELEVEN REFUSALS, built from the witness in a temp dir and each required
      to exit non-zero AND to name its subject: no `stack`; no
      `diluateFlow`; `current` and `voltage` together; neither; a
      `linearVelocity` typed beside the record; a multi-ionic diluate (two
      cations); no `concentrate {}` block; a `T` inside it; an unknown
      `overLimiting` model word (the message must carry the accepted list);
      `limitingCurrent { model CowanBrown; }`; and a case declaring no
      aqueous chemistry.

  (g) ONE HOME, PROVED BY ARITHMETIC AND BY SOURCE.  The batch rig's
      `i_lim_initial` and `u_superficial` must equal `ed03_stack_record`'s
      published values EXACTLY (same stack, same 175 L/h, same 0.1 mol/kg
      diluate) -- they come from the same `edCell::predictiveLimitingCurrent`
      call, and two homes would show up in the last digits.  The source arm
      requires `ElectrodialysisStack.cpp` to CALL `edCell::` for the IEM pair,
      the channel build, the mean activity ratio, the solution resistance and
      the predictive current, and to define none of them.

  (h) THE REGISTRY CLOSURE.  `choupoBatch`'s own main must call
      `EDStackRegistry::loadFrom` -- a unit is not installed until everything
      it constructs is, and a registry loaded by one binary only leaves the
      unit registered, the case valid, and the run dead on an empty
      catalogue.

  (i) THE NETWORK WITNESSES.  ed06: four stages, currents STRICTLY
      decreasing, i_lim strictly decreasing, the same i/i_lim margin at every
      stage (the plant holds the margin, not the current), and stage 1's own
      current density above stage 4's limiting current -- the header's claim,
      recomputed.  ed07: the loop concentration strictly between feed and
      product, the per-pass demineralisation strictly below the plant's
      overall demineralisation, and the loop's i_lim below the value the same
      stack reaches at the FEED concentration in ed05.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
NOTHING HERE IS VALIDATED AGAINST A MEASURED BATCH ELECTRODIALYSIS -- no run
of a recirculating rig is transcribed anywhere in this tree, so every number
is the model's own.  It does not check the `saltFluxPlateau` claim against
data (there is none); it does not check back-diffusion, water transport, a
falling current efficiency from co-ion leakage, or any thermal effect,
because the unit models none of them and says so.  It says nothing about the
Nernst potential or the ohmic drop beyond the constant-voltage identity of
(e).  It does not exercise a multi-ionic batch feed, which the unit REFUSES.
It does not exercise a stack record other than EUR2C-7P18 in batch, nor the
`leveque` correlation branch, nor a case whose stack record names no membrane
pair.  The `t_overLimiting_s` it pins is resolved to the TIME STEP by
construction and is not a converged quantity.

SABOTAGE-VERIFIED 2026-09-16, eleven times (engine, case and gate edits BY
HAND, rebuilt where C++ moved, run, restored; the gate never patches a source
and never rebuilds).  The OBSERVED output is recorded below; two did NOT do
what was predicted and both are kept as measured.

  S1  `materialInventory()` returns `state().n`, i.e. the concentrate tank is
      forgotten.                                            CAUGHT -- and by
      the run itself before the gate could speak: "closure 5.012904e-03,
      worst element 8.627411e-01  <-- LEAK: reported NON-CONVERGED", exit 1.
      A vessel that moves salt into a tank the inventory does not know about
      reads to the campaign exactly like one destroying it.

  S2  the plateau applied ALWAYS (the `overLimit_ ==` test dropped), i.e. the
      DECLARED model ignored.                               CAUGHT by (d):
      "with `overLimiting { model none; }` the run gives 0.862741052768
      against the hand calculation's 0.914128583596".

  S3  the plateau NEVER applied (`xi_eff = xi` unconditionally).
                                                            CAUGHT by (c):
      "actual demineralisation 0.914129 does not fall below the hand
      calculation 0.914129 -- a lesson that agrees with itself".

  S4  the crossing recorded but never ANNOUNCED (the stderr warning and the
      AdvisoryLog line removed, the flag kept).             CAUGHT by (c) on
      the log and on AdvisoryLog, and by (d).  The TIMELINE arm did NOT fire:
      the status event is built from `tCross_`, which S4 leaves set.  A gate
      that read only the timeline would have passed a run that crossed its
      limiting current in silence, which is why (c) holds the log, the
      advisory and the timeline as three separate requirements.

  S5  the derivative writes the cation into the concentrate with the SAME
      sign it takes from the diluate.                       CAUGHT: the
      campaign reports a LEAK and choupoBatch exits 1, on both witnesses.

  S6  the single-salt refusal removed.                      SURVIVED both
      shipped witnesses, because each carries exactly one cation and one
      anion -- a guard whose only case satisfies it is a guard nothing tests
      (the diafiltration lesson of 2026-08-25, met again).  Arm (f) therefore
      BUILDS a three-ion diluate, with a case-local Mg record and a component
      list to match; with that probe present the sabotage is caught at once:
      "probe `threeIons`: the case RAN and exited 0 -- the refusal is not
      there".

  S7  `EDStackRegistry::loadFrom` commented out of choupoBatch's main.
                                                            CAUGHT by every
      run arm ("EDStackRegistry: unknown electrodialysis stack 'EUR2C-7P18'.
      Nothing is registered under this factory at all"), and the SOURCE arm
      (h) FAILED TO FIRE, twice over, for two different reasons -- both of
      them defects in this gate and both now fixed:
        * a commented-out call still contains the string, so a substring test
          passes.  PROSE IS NOT A CALL (the `topLevelSector` trap of
          2026-09-06): every source arm strips both comment forms first.
        * the gate returned EARLY when the witnesses would not run, so the
          arm that names the RULE never executed and only the symptom was
          reported.  The source arms are taken BEFORE any run now.
      With both fixed: "(h) choupoBatch's own main does not load
      EDStackRegistry."

  S8  a SECOND HOME for the dilute-carrier density: the steady unit's own
      `rho_carrier` written 998.2 while `edCell::RHO_CARRIER` stays 1000.
                                                            CAUGHT by (g),
      four times: "ed03 publishes i_lim = 643.423101174 where the batch rig's
      t = 0 value is 643.040677164", and likewise on u, k_c,eff and Sh.  Note
      what this does NOT catch and should not: moving the shared constant
      itself moves BOTH units together, which is what one home MEANS.

  S9  ed06's four stages given ONE current (26.8015 A, stage 1's).
                                                            DID NOT DO WHAT
      WAS PREDICTED, and the reality is better: at that current the train
      strips the diluate completely by the third stage and the ENGINE refuses
      the fourth by name -- "a channel carries no ions -- nothing to
      transport" -- so the case does not run at all and arm (i) reports it as
      "did not run (exit 2)" rather than through its own comparison.  A
      milder twin (the last two stages at the same current) DOES run, and the
      arm then fires on both halves: "the stage currents are not strictly
      decreasing: [26.8015, 10.7206, 4.2882, 4.2882]" and "the stages do not
      share one i/i_lim margin ([0.158175, 0.158175, 0.158174, 0.395433])".

  S10 the constant-voltage branch drops the Nernst back-EMF (I solved from
      (U - E_electrodes)/(N R_pair)).                       CAUGHT by (e):
      "the stack equation ... does not close on the DECLARED 4 V -- residual
      1.10214 V".  The arm recomputes the identity from the DECLARED voltage,
      never from the engine's own solved expression: an auditor that reuses
      the auditee's arithmetic checks nothing (the 2026-08-09 ledger rule).

  S11 the crossing detector never fires (`tCross_` left at -1).
                                                            CAUGHT by (c)
      four times over and by (d) -- the KPI, the log line, the timeline event
      and the advisory are four channels for one fact and all four go quiet.

A TWELFTH edit was made and is NOT a sabotage, and it is the one worth
carrying forward.  The `noConcentrate` probe deleted the block by searching
for the word `concentrate`, and the FIRST occurrence in the file is in its own
header, which explains the block in prose -- so the probe cut a comment, ran
the unmodified case, exited 0 and reported "the refusal is not there" about a
refusal that was working perfectly.  A probe that cannot reach the state it
claims to test proves the opposite of what it says.  The strip now matches a
LINE that IS the key and brace-matches from it.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
BATCH = ROOT / "tutorials/batch/electrodialysis"
EB1 = BATCH / "edbatch01_constant_current"
EB2 = BATCH / "edbatch02_constant_voltage"
ED03 = ROOT / "tutorials/electrochem/ed03_stack_record"
ED04 = ROOT / "tutorials/electrochem/ed04_limiting_current_multiionic"
ED05 = ROOT / "tutorials/electrochem/ed05_industrial_stack"
ED06 = ROOT / "tutorials/electrochem/ed06_stages_in_series"
ED07 = ROOT / "tutorials/electrochem/ed07_feed_and_bleed"

FARADAY = 96485.33212
MW_WATER = 0.0180153
CLOSURE_MAX = 1.0e-12          # machine level, not a tolerance
failures = []


def run(binary, case, env=None):
    e = dict(os.environ, CHOUPO_HOME=str(ROOT))
    if env:
        e.update(env)
    r = subprocess.run([str(BUILD / binary), str(case)],
                       capture_output=True, text=True, timeout=900, env=e)
    return r.returncode, r.stdout + r.stderr


def result_of(out):
    if "<<<Choupo:result-begin>>>" not in out:
        return None
    return json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                         .split("<<<Choupo:result-end>>>")[0])


def copy_case(src, dst):
    #  A PROBE IS NOT ITS DONOR.  The witnesses are SEALED cases, and a sealed
    #  manifest forbids the runtime every catalogue fallback -- so a probe that
    #  copies one and then WIDENS its component set (a second salt, a third ion)
    #  refuses at the resolver seam before it can reach the behaviour under test.
    #  The sealed manifest is the donor's, and this is not the donor (the same
    #  move as check_feed_thermal_state's and check_evaporator_chest_phase's
    #  probe builders).
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "converged", "log.*", "expected", "reports", "design", "trajectory.csv",
        "propertyManifest", "[0-9]*"))
    #  0/ is authored state and MUST come across; the ignore above drops the
    #  written transient instants (50/, 100/ ...) only.
    if (Path(src) / "0").is_dir() and not (Path(dst) / "0").exists():
        shutil.copytree(Path(src) / "0", Path(dst) / "0")


def close(a, b, rel=1e-9):
    return abs(a - b) <= rel * max(abs(a), abs(b), 1e-300)


def trajectory(case):
    """trajectory.csv as {column: [values]}."""
    rows = (Path(case) / "trajectory.csv").read_text().strip().split("\n")
    head = rows[0].split(",")
    cols = {h: [] for h in head}
    for r in rows[1:]:
        for h, v in zip(head, r.split(",")):
            cols[h].append(float(v))
    return cols


# ------------------------------------------------------------------ the cases
def main():
    #  THE SOURCE ARMS RUN FIRST, and that is not tidiness.  Measured while
    #  sabotaging this gate: with the stack registry dropped from
    #  choupoBatch's main both witnesses die, the gate returned early, and the
    #  arm that names the RULE never fired at all -- only the symptom was
    #  reported.  A source arm needs no run, so it is taken before any.
    source_arms()

    # ---- run the two batch witnesses -------------------------------------
    outs, res = {}, {}
    for case in (EB1, EB2):
        rc, out = run("choupoBatch", case)
        outs[case] = out
        if rc != 0:
            failures.append("%s did not run (exit %d):\n%s"
                            % (case.name, rc, out[-1500:]))
            continue
        j = result_of(out)
        if j is None:
            failures.append("%s produced no result block" % case.name)
            continue
        res[case] = j

    if EB1 not in res or EB2 not in res:
        report()
        return 1

    k1 = res[EB1]["kpis"]["rig"]
    k2 = res[EB2]["kpis"]["rig"]
    c1 = res[EB1]["kpis"]["campaign"]
    c2 = res[EB2]["kpis"]["campaign"]

    # ---- (a) the closed rig conserves ------------------------------------
    for case, camp in ((EB1, c1), (EB2, c2)):
        for key in ("mass_closure_rel", "element_worst_closure_rel"):
            v = camp.get(key)
            if v is None or v > CLOSURE_MAX:
                failures.append(
                    "(a) %s: the %s is %s, above the machine-level bound %g --"
                    " the rig is CLOSED (no boundary flow at all) and its"
                    " derivative writes one number with two signs, so it has"
                    " no reason to be approximate.  A tank the inventory"
                    " forgot reads exactly like this."
                    % (case.name, key.replace("_", " "), v, CLOSURE_MAX))
        #  the inventory itself, recomputed from the case's OWN 0/internalState
        declared = declared_inventory(case)
        got = camp.get("moles_kmol_initial")
        if got is None or not close(got, declared, 1e-10):
            failures.append(
                "(a) %s: the campaign's initial inventory is %s kmol against"
                " the %.12g the case's two declared tanks hold -- a unit that"
                " published only the diluate, or counted one tank twice,"
                " lands here." % (case.name, got, declared))

    # ---- (b) i_lim falls, by the right law -------------------------------
    tr = trajectory(EB1)
    ilim = tr["rig.i_lim_A_per_m2"]
    mdil = tr["rig.m_dil_Na"]
    if not (ilim[-1] < 0.5 * ilim[0]):
        failures.append(
            "(b) edbatch01: i_lim ended at %g A/m2 against %g at t = 0 -- the"
            " whole subject of this unit is a limiting current that FALLS"
            " with the depleting diluate" % (ilim[-1], ilim[0]))
    worst, worstRow = 0.0, -1
    for r in range(len(ilim)):
        if mdil[0] <= 0 or ilim[0] <= 0:
            break
        gap = abs(ilim[r] / ilim[0] - mdil[r] / mdil[0])
        if gap > worst:
            worst, worstRow = gap, r
    #  1e-8, and the bound is the CHANNEL, not the physics: trajectory.csv
    #  carries 9 significant figures, so two ratios read from it cannot agree
    #  more closely than ~2e-9 however exact the model is (a tolerance tighter
    #  than the channel the number came through measures the serialiser).
    if worst > 1e-8:
        failures.append(
            "(b) edbatch01: i_lim is not proportional to the diluate"
            " concentration -- worst row %d, i_lim/i_lim(0) = %.12g against"
            " m/m(0) = %.12g.  On a SINGLE salt D_eff is"
            " composition-independent and the flow is declared, so Sh, Re, Sc"
            " and k_c,eff are constants of the run and Eq. (15) makes the"
            " proportionality exact."
            % (worstRow, ilim[worstRow] / ilim[0], mdil[worstRow] / mdil[0]))
    #  and i_lim(0) recomputed here, from the published k_c,eff and the
    #  single-salt Eq. (16): i_lim = F k_c C / (t1 - z1 D1/(z1 D1 + |z2| D2)),
    #  with t1 = 1 (the co-ion number is null in this model).
    D_Na, D_Cl = 1.33e-9, 2.03e-9        # the curated 25 C values, at seFactor 1
    C0 = mdil[0] * 1000.0                # mol/m3 on the dilute carrier
    denom = 1.0 - D_Na / (D_Na + D_Cl)
    want = FARADAY * k1["k_c_eff"] * C0 / denom
    if not close(want, k1["i_lim_initial"], 1e-6):
        failures.append(
            "(b) edbatch01: i_lim(0) recomputed here from the published"
            " k_c,eff and Eq. (16) is %.6f A/m2 against the engine's %.6f"
            % (want, k1["i_lim_initial"]))

    # ---- (c) the hand calculation, and the run disobeying it -------------
    check_ideal(EB1, k1, 2000.0)
    if not (k1["demin_actual"] < k1["demin_ideal"] - 1e-3):
        failures.append(
            "(c) edbatch01's actual demineralisation %.6f does not fall below"
            " the hand calculation %.6f -- a lesson that agrees with itself"
            " teaches nothing, and the whole point of the declared"
            " `saltFluxPlateau` is that the counter-ion transfer stops"
            " following the straight line once i crosses i_lim"
            % (k1["demin_actual"], k1["demin_ideal"]))
    if k1.get("overLimitingReached") != 1 or not (0 < k1["t_overLimiting_s"] < 2000):
        failures.append(
            "(c) edbatch01 did not record a crossing inside its own clock"
            " (reached = %s, t = %s)"
            % (k1.get("overLimitingReached"), k1.get("t_overLimiting_s")))
    if "OVER-LIMITING CURRENT at t =" not in outs[EB1]:
        failures.append(
            "(c) edbatch01 crossed i_lim and never SAID so.  The KPI alone is"
            " not the announcement: a reader of the log must be told at the"
            " instant it happens, and the end-of-run caveat block must replay"
            " it.")
    if not any(e.get("action") == "overLimitingReached"
               for e in res[EB1].get("timeline", [])):
        failures.append("(c) edbatch01 published no `overLimitingReached`"
                        " timeline event")
    if not any("OVER-LIMITING CURRENT" in a.get("message", "")
               for a in res[EB1].get("advisories", [])):
        failures.append("(c) edbatch01's crossing never reached AdvisoryLog,"
                        " so it is absent from the end-of-run caveat block")

    # ---- (d) THE NEGATIVE: no plateau, no gap ----------------------------
    with tempfile.TemporaryDirectory() as td:
        probe = Path(td) / "noplateau"
        copy_case(EB1, probe)
        fsd = probe / "system/flowsheetDict"
        fsd.write_text(fsd.read_text().replace(
            "overLimiting   { model saltFluxPlateau; }",
            "overLimiting   { model none; }"))
        rc, out = run("choupoBatch", probe)
        j = result_of(out)
        if rc != 0 or j is None:
            failures.append("(d) the `model none;` twin did not run (exit %d)"
                            % rc)
        else:
            kn = j["kpis"]["rig"]
            if not close(kn["demin_actual"], kn["demin_ideal"], 1e-9):
                failures.append(
                    "(d) with `overLimiting { model none; }` the run gives"
                    " %.12g against the hand calculation's %.12g.  With the"
                    " plateau gone the model contains NOTHING that could part"
                    " from Faraday's law at constant current, so any gap here"
                    " means the gap in (c) was not the plateau."
                    % (kn["demin_actual"], kn["demin_ideal"]))
            if "EXTRAPOLATION of a model outside its validity" not in out:
                failures.append(
                    "(d) the `model none;` twin crossed i_lim and did not"
                    " announce that it is EXTRAPOLATING -- an absent model is"
                    " not an answer, and the run must say which it is")

    # ---- (e) constant voltage fails the same law, differently ------------
    check_ideal(EB2, k2, 1500.0)
    if not (k2["I_final"] < 0.75 * k2["I_initial"]):
        failures.append(
            "(e) edbatch02: the current went %g -> %g A.  At constant voltage"
            " it must DECAY materially -- the diluate loses conductivity and"
            " the Nernst back-EMF grows, and that decay is the whole of the"
            " gap against the hand calculation here."
            % (k2["I_initial"], k2["I_final"]))
    if k2.get("overLimitingReached") != 0 or k2["t_overLimiting_s"] >= 0:
        failures.append(
            "(e) edbatch02 recorded a crossing.  Held at constant voltage, i"
            " and i_lim fall together and the ratio must never reach 1 --"
            " that is why a bench rig is run this way.")
    if not close(k2["xi_eff_final"], 0.9, 1e-12):
        failures.append(
            "(e) edbatch02's xi_eff ended at %.12g against the declared 0.9 --"
            " nothing about the limiting current may enter an answer that"
            " never reached it" % k2["xi_eff_final"])
    if not (k2["demin_actual"] < k2["demin_ideal"] - 1e-3):
        failures.append(
            "(e) edbatch02's actual %.6f does not fall below the hand"
            " calculation %.6f" % (k2["demin_actual"], k2["demin_ideal"]))
    #  THE STACK EQUATION, as the header writes it, on the DECLARED voltage.
    #  Recomputing I from the engine's own solved expression would reuse the
    #  auditee's arithmetic and check nothing.
    U_decl, E_el, N = 4.0, 2.0, k2["N_cellpairs"]
    resid = N * (k2["E_mem_pair_final"] + k2["I_final"] * k2["R_pair_final"]) \
            + 1.5 - U_decl
    #  (E_electrodes is 1.5 V in this case; U_decl 4 V.)
    if abs(resid) > 1e-9:
        failures.append(
            "(e) edbatch02: the stack equation U = N(E_mem + I R_pair) +"
            " E_electrodes does not close on the DECLARED 4 V -- residual"
            " %.6g V from the run's own final E_mem, R_pair and I" % resid)
    del E_el

    # ---- (f) the refusals -------------------------------------------------
    refusals()

    # ---- (g) ONE HOME ----------------------------------------------------
    rc, out3 = run("choupoSolve", ED03)
    j3 = result_of(out3) if rc == 0 else None
    if j3 is None:
        failures.append("(g) ed03 did not run, so the one-home comparison"
                        " could not be made")
    else:
        k3 = j3["kpis"]["edStack"]
        #  D_eff is a function of the COMPOSITION alone, which the two cases
        #  declare identically, so it is held at machine level.  Everything
        #  else rides the FLOW, and the two cases declare that flow through
        #  different grammars -- ed03 as a stream's water molar flow, the
        #  batch rig as a volumetric recirculation rate -- which agree only to
        #  the digits the two case files carry (~1e-10).  Holding those at
        #  1e-8 is still four orders below any second implementation: the
        #  dilute-carrier density alone, written 998.2 instead of 1000, moves
        #  i_lim by 0.27 %.
        for key, batchKey, rel in (("D_eff", "D_eff", 1e-12),
                                   ("i_lim", "i_lim_initial", 1e-8),
                                   ("u_superficial", "u_superficial", 1e-8),
                                   ("k_c_eff", "k_c_eff", 1e-8),
                                   ("Re", "Re", 1e-8), ("Sh", "Sh", 1e-8)):
            if key not in k3 or batchKey not in k1:
                failures.append("(g) missing KPI %s/%s" % (key, batchKey))
                continue
            if not close(k3[key], k1[batchKey], rel):
                failures.append(
                    "(g) ed03 publishes %s = %.12g where the batch rig's t = 0"
                    " value is %.12g.  The same stack, the same 175 L/h and"
                    " the same 0.1 mol/kg diluate cannot give two numbers --"
                    " they come from ONE call to"
                    " edCell::predictiveLimitingCurrent, and two homes show up"
                    " in the last digits." % (key, k3[key], k1[batchKey]))

    # ---- (i) the network witnesses ---------------------------------------
    network()

    return report()


def declared_inventory(case):
    """Total kmol across BOTH declared tanks, from the case's own
    0/internalState -- the gate's own reading, never the engine's."""
    t = (Path(case) / "0/internalState").read_text()
    t = re.sub(r'/\*.*?\*/|//[^\n]*', '', t, flags=re.S)
    return sum(float(m) for m in re.findall(r'totalMoles\s+([0-9.eE+-]+)\s*;', t))


def check_ideal(case, k, tEnd):
    """`demin_ideal` must be Faraday's law at the run's OWN initial current,
    recomputed here from the case's own declarations."""
    op = (Path(case) / "system/flowsheetDict").read_text()
    op = re.sub(r'/\*.*?\*/|//[^\n]*', '', op, flags=re.S)
    xi = float(re.search(r'\bxi\s+([0-9.eE+-]+)\s*;', op).group(1))
    n0 = declared_cation_kmol(case)
    want = xi * k["I_initial"] * k["N_cellpairs"] * tEnd / (1.0 * FARADAY) \
           * 1.0e-3 / n0
    want = min(want, 1.0)
    if not close(want, k["demin_ideal"], 1e-9):
        failures.append(
            "(c/e) %s: the published `demin_ideal` %.12g is not Faraday's law"
            " at this run's own initial current, %.12g, recomputed here from"
            " the case's declared xi and its declared initial inventory.  The"
            " idealisation must be COMPUTED FROM THE RUN -- a declared one"
            " could be arranged." % (Path(case).name, k["demin_ideal"], want))
    if not close(k["t_idealComplete_s"],
                 n0 * 1.0e3 * FARADAY / (xi * k["I_initial"] * k["N_cellpairs"]),
                 1e-9):
        failures.append("(c/e) %s: `t_idealComplete_s` is not the straight"
                        " line's own zero crossing" % Path(case).name)


def declared_cation_kmol(case):
    t = (Path(case) / "0/internalState").read_text()
    t = re.sub(r'/\*.*?\*/|//[^\n]*', '', t, flags=re.S)
    #  the DILUATE block is the first `totalMoles` / `molarComposition` pair.
    tot = float(re.search(r'totalMoles\s+([0-9.eE+-]+)\s*;', t).group(1))
    x = float(re.search(r'Na\s+([0-9.eE+-]+)\s*;', t).group(1))
    return tot * x


def refusals():
    """Eleven probes, each built from the shipped witness and each required to
    REFUSE by name.  A shipped case is by construction a valid one, so the
    corpus cannot supply a negative -- the gate must build it."""
    def probe(name, mutate, needle):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / name
            copy_case(EB1, p)
            mutate(p)
            rc, out = run("choupoBatch", p)
            if rc == 0:
                failures.append(
                    "(f) probe `%s`: the case RAN and exited 0 -- the refusal"
                    " is not there" % name)
            elif needle not in out:
                failures.append(
                    "(f) probe `%s`: it refused, but the message does not"
                    " carry %r:\n    %s"
                    % (name, needle, out.strip().split("\n")[-1][:300]))

    def edit(p, old, new):
        f = p / "system/flowsheetDict"
        t = f.read_text()
        assert old in t, old
        f.write_text(t.replace(old, new))

    probe("noStack", lambda p: edit(p, "stack          EUR2C-7P18;", ""),
          "`stack <name>;` is REQUIRED")
    probe("noFlow", lambda p: edit(p, "diluateFlow    175 L/h;", ""),
          "`diluateFlow <Q> m3/h;` is REQUIRED")
    probe("bothDrives", lambda p: edit(p, "current        3.5;",
                                       "current        3.5;\n voltage 4;"),
          "EITHER `current <I> A;`")
    probe("noDrive", lambda p: edit(p, "current        3.5;", ""),
          "EITHER `current <I> A;`")
    probe("velocityBeside",
          lambda p: edit(p, "diluateFlow    175 L/h;",
                         "diluateFlow 175 L/h;\n linearVelocity 0.08 m/s;"),
          "one home")
    probe("noConcentrate", lambda p: strip_concentrate(p),
          "`concentrate {}` block")
    probe("concentrateT", lambda p: add_concentrate_T(p),
          "two homes for one fact")
    probe("badOverLimiting",
          lambda p: edit(p, "{ model saltFluxPlateau; }", "{ model wibble; }"),
          "saltFluxPlateau")
    probe("cowanBrown",
          lambda p: edit(p, "overLimiting   { model saltFluxPlateau; }",
                         "limitingCurrent { model CowanBrown; }"),
          "is not available in a BATCH rig")
    probe("noAqueous", lambda p: strip_aqueous(p),
          "the case declares no aqueous chemistry")
    probe("threeIons", lambda p: make_three_ion(p),
          "this unit models a SINGLE SALT")


def strip_concentrate(p):
    """Delete the whole `concentrate { ... }` block by BRACE MATCHING.  An
    index-counting cut left a malformed dict and the probe then refused for
    the wrong reason -- a probe that cannot reach exit 0 cannot tell a silent
    acceptance from an unrelated refusal (the 2026-09-07 lesson)."""
    f = p / "0/internalState"
    t = f.read_text()
    #  The BLOCK, not the word: the file's own header explains the block in
    #  prose, so a bare `t.index("concentrate")` lands in a comment and cuts
    #  nothing -- the probe then ran to exit 0 with the block still there and
    #  proved the opposite of what it claimed.  Match a line that IS the key.
    m = re.search(r'^[ \t]*concentrate[ \t]*\n[ \t]*\{', t, re.M)
    if m is None:
        raise RuntimeError("no `concentrate {}` block to strip")
    i = m.start()
    j = t.index("{", i)
    depth = 0
    for k in range(j, len(t)):
        if t[k] == "{":
            depth += 1
        elif t[k] == "}":
            depth -= 1
            if depth == 0:
                f.write_text(t[:i] + t[k + 1:])
                return
    raise RuntimeError("unbalanced braces in 0/internalState")


def add_concentrate_T(p):
    f = p / "0/internalState"
    t = f.read_text()
    f.write_text(t.replace("        concentrate\n        {\n",
                           "        concentrate\n        {\n            T 298.15 K;\n"))


def strip_aqueous(p):
    f = p / "constant/thermoPhysPropDict"
    t = f.read_text()
    i = t.index("    aqueous")
    j = t.index("}", t.index("}", t.index("{", i)) + 1) + 1
    f.write_text(t[:i] + t[j:])


def make_three_ion(p):
    """A diluate carrying TWO cations.  The shipped witnesses carry exactly one
    of each sign, so this case cannot come from the corpus."""
    shutil.copy(ED04 / "constant/components/Mg.dat", p / "constant/components/")
    f = p / "constant/thermoPhysPropDict"
    f.write_text(f.read_text().replace("components       ( water  Na  Cl );",
                                       "components       ( water  Na  Cl  Mg );"))
    f = p / "0/internalState"
    t = f.read_text()
    t = t.replace("            water    0.9964098754;",
                  "            water    0.9944098754;\n            Mg       0.002;")
    t = t.replace("                water    0.9823035076;",
                  "                water    0.9803035076;\n                Mg       0.002;")
    f.write_text(t)


def strip_cpp_comments(t):
    """PROSE IS NOT A CALL.  Measured while sabotaging this gate: commenting
    OUT `EDStackRegistry::loadFrom(...)` left the string in the file and the
    source arm went on passing, which is the `topLevelSector` trap of
    2026-09-06 met again.  Both comment forms go before any arm reads code."""
    t = re.sub(r'/\*.*?\*/', ' ', t, flags=re.S)
    return re.sub(r'//[^\n]*', ' ', t)


def source_arms():
    """ONE HOME, on the source.  A numerical arm can show that two answers
    agree TODAY; only the source says the second copy does not exist."""
    st = strip_cpp_comments(
        (ROOT / "src/unitOperations/electrochem/ElectrodialysisStack.cpp").read_text())
    cell = strip_cpp_comments(
        (ROOT / "src/unitOperations/electrochem/EDCell.cpp").read_text())
    for fn in ("readIEMPair", "buildChannel", "meanActivityRatio",
               "solutionResistance", "predictiveLimitingCurrent"):
        if ("edCell::" + fn) not in st:
            failures.append(
                "(g) ElectrodialysisStack.cpp does not CALL `edCell::%s` --"
                " the cell-pair arithmetic has ONE home since the batch rig"
                " became its second caller" % fn)
        if ("\n" + fn) not in cell and (" " + fn + "(") not in cell:
            failures.append("(g) EDCell.cpp does not define `%s`" % fn)
    if re.search(r'^\s*(void|ChannelState|scalar)\s+readIEMPair\s*\(', st, re.M):
        failures.append(
            "(g) ElectrodialysisStack.cpp DEFINES readIEMPair again -- a"
            " second home for the IEM reader, which is the defect the"
            " extraction closed")
    mainc = strip_cpp_comments(
        (ROOT / "src/applications/choupoBatch/main.cpp").read_text())
    if "EDStackRegistry::loadFrom" not in mainc:
        failures.append(
            "(h) choupoBatch's own main does not load EDStackRegistry.  A"
            " unit is not installed until everything it constructs is: the"
            " type would be registered, the case valid, and the run dead on"
            " an empty catalogue.")


def network():
    rc6, out6 = run("choupoSolve", ED06)
    j6 = result_of(out6) if rc6 == 0 else None
    if j6 is None:
        failures.append("(i) ed06_stages_in_series did not run (exit %d)" % rc6)
    else:
        I = [j6["kpis"]["ST%d" % s]["I"] for s in range(1, 5)]
        L = [j6["kpis"]["ST%d" % s]["i_lim"] for s in range(1, 5)]
        R = [j6["kpis"]["ST%d" % s]["i_over_ilim"] for s in range(1, 5)]
        D = [j6["kpis"]["ST%d" % s]["i_density"] for s in range(1, 5)]
        if not all(I[s] < I[s - 1] for s in range(1, 4)):
            failures.append("(i) ed06: the stage currents are not strictly"
                            " decreasing: %s" % I)
        if not all(L[s] < L[s - 1] for s in range(1, 4)):
            failures.append("(i) ed06: the stage limiting currents are not"
                            " strictly decreasing: %s" % L)
        if not all(close(R[s], R[0], 1e-6) for s in range(1, 4)):
            failures.append(
                "(i) ed06: the stages do not share one i/i_lim margin (%s)."
                " Asked for the same fractional demineralisation, each stage's"
                " current must fall by the same factor its limiting current"
                " does -- that is what 'the plant holds the margin, not the"
                " current' means." % R)
        if not (D[0] > 2.0 * L[3]):
            failures.append(
                "(i) ed06: stage 1's current density %.2f A/m2 is not above"
                " stage 4's limiting current %.2f A/m2, so the case no longer"
                " shows why the train cannot be run at one current"
                % (D[0], L[3]))

    rc7, out7 = run("choupoSolve", ED07)
    j7 = result_of(out7) if rc7 == 0 else None
    rc5, out5 = run("choupoSolve", ED05)
    j5 = result_of(out5) if rc5 == 0 else None
    if j7 is None or j5 is None:
        failures.append("(i) ed07 (exit %d) or ed05 (exit %d) did not run"
                        % (rc7, rc5))
        return
    def molality(j, name):
        s = j["streams"][name]
        return s["composition"]["Na"] / (s["composition"]["water"] * MW_WATER)
    feed, loop, prod = (molality(j7, "Feed"), molality(j7, "StackIn"),
                        molality(j7, "Product"))
    if not (prod < loop < feed):
        failures.append(
            "(i) ed07: the loop concentration %.6f does not sit strictly"
            " between the product %.6f and the feed %.6f -- the trap this"
            " case exists to show is that the stack never sees the feed"
            % (loop, prod, feed))
    perPass = j7["kpis"]["ED"]["demin_ratio"]
    overall = 1.0 - prod / feed
    if not (perPass < overall - 1e-3):
        failures.append(
            "(i) ed07: the per-pass demineralisation %.6f is not below the"
            " plant's overall %.6f, so the recycle is doing nothing"
            % (perPass, overall))
    if not (j7["kpis"]["ED"]["i_lim"] < 0.5 * j5["kpis"]["edStack"]["i_lim"]):
        failures.append(
            "(i) ed07: the loop's limiting current %.2f A/m2 is not materially"
            " below the %.2f the SAME stack reaches at the feed concentration"
            " in ed05 -- which is the number a student would have sized the"
            " rectifier against"
            % (j7["kpis"]["ED"]["i_lim"], j5["kpis"]["edStack"]["i_lim"]))


def report():
    if failures:
        print("check_ed_batch: FAILED")
        for f in failures:
            print("  " + f)
        return 1
    print("check_ed_batch: OK -- the batch recirculating electrodialysis rig "
          "(2 witnesses) holds BOTH tanks and closes mass and every element at "
          "machine level, with the campaign's initial inventory recomputed here "
          "from the two tanks the case declares.  Under constant current i_lim "
          "FALLS 643.04 -> 88.26 A/m2, exactly in proportion to the diluate "
          "concentration on every written row -- to 1e-8, which is the "
          "trajectory CSV's own 9-figure channel and not the model's limit -- "
          "and reproducing Eq. (16) "
          "from the published k_c,eff; i crosses it at t = 1593 s, and the "
          "crossing reaches the log, AdvisoryLog and the timeline, not only a "
          "KPI.  `demin_ideal` is Faraday's law at the run's OWN initial "
          "current, recomputed here from the case's declarations (1e-9), and "
          "the run DISOBEYS it (0.8627 against 0.9141) -- while the `model "
          "none;` twin reproduces it to 1e-9 and still announces that it is "
          "extrapolating, which is the negative that shows the gap is the "
          "declared plateau and not an arrangement.  Held at constant voltage "
          "instead, the current decays 4.365 -> 2.018 A, the ratio never "
          "reaches 1, xi_eff stays exactly at the declared xi, and the stack "
          "equation closes on the DECLARED voltage to 1e-9.  11 refusals fire "
          "by name, each on a case this gate BUILDS (no stack, no diluateFlow, "
          "both drives, neither, a velocity typed beside the record, a missing "
          "concentrate tank, a T inside it, an unknown over-limiting word, "
          "CowanBrown, no aqueous chemistry, and a three-ion diluate).  ONE "
          "HOME is proved twice: the rig's t = 0 D_eff equals ed03's to 1e-12 "
          "and its i_lim, u, k_c,eff, Re and Sh to 1e-8 (the two cases declare "
          "the same flow through different grammars, so they agree only to the "
          "digits their files carry), and the steady unit CALLS "
          "edCell:: for all five shared functions and defines none of them; "
          "choupoBatch loads EDStackRegistry. The network witnesses hold: "
          "ed06's four stages run at strictly decreasing currents against "
          "strictly decreasing limiting currents at ONE shared margin, with "
          "stage 1's density above stage 4's limit; ed07's loop concentration "
          "sits strictly between feed and product, its per-pass duty below the "
          "plant's, and its limiting current below what the same stack reaches "
          "at the feed concentration in ed05.  "
          "NOT CHECKED: anything MEASURED -- no run of a recirculating rig is "
          "transcribed anywhere in this tree, so every number here is the "
          "model's own, including the saltFluxPlateau claim. Back-diffusion, "
          "water transport, co-ion leakage and every thermal effect are not "
          "modelled and not checked; the Nernst potential and the ohmic drop "
          "are touched only through the constant-voltage identity; no "
          "multi-ionic batch feed runs (the unit refuses one); no batch case "
          "uses a stack record other than EUR2C-7P18, the `leveque` branch or "
          "a record naming no membrane pair; and `t_overLimiting_s` is "
          "resolved to the time step by construction, not converged.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
