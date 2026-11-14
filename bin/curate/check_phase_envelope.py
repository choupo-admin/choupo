#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: the P-T envelope draws only points that are on the curve, and says
where it stopped and why.

    bin/curate/check_phase_envelope.py

WHY THIS EXISTS.  A phase envelope is drawn to find two things: the
CRICONDENTHERM (the highest temperature at which the feed can hold a liquid --
what a pipeline is designed against) and the retrograde region beside it.
Both live at the nose, and the nose is where every simple method fails.  An
envelope op that quietly extrapolates a nose is worse than one that has none,
because the nose is the answer.

AND THE DEFECT THIS GATE WAS BUILT AROUND IS NOT THE NOSE.  Both saturation
solvers bracket T in 200-700 K and are warm-started from the previous
pressure step, so Newton can converge to a DIFFERENT ROOT and report success.
The first version of the op traced a C3/C4/C5 bubble branch 243 -> 332 K to
16 bar and then reported 268 K at 19 bar -- a bubble temperature FALLING as
pressure rises, which is impossible -- and the cricondentherm detector read
the matching spike on the dew branch as a maximum and published 371.492 K.
A plausible number, confidently reported, from a root nobody asked for.
*A converged point is not necessarily a point on this curve.*

WHAT THIS GATE CHECKS.

  (a) THE BUBBLE CURVE NEVER FALLS.  T_bubble(P) is monotonically increasing
      up to the critical point -- physics, not a heuristic -- so every drawn
      bubble point is checked against its predecessor, from the CSV, here.

  (b) THE DEW CURVE IS CONTINUOUS.  It is not monotone (the cricondentherm is
      an interior maximum), so the test is that no step exceeds a multiple of
      the branch's own median step.  Recomputed here from the CSV rather than
      trusted from the op.

  (c) A ROOT JUMP IS REPORTED AS ONE, and distinguished from a turning point
      in the text: they have different remedies, and calling a jump a
      turning point invents a feature of the mixture.

  (d) AN EMPTY BRANCH IS NOT A STOPPED BRANCH.  envelope01's bubble line lies
      below the solver's own 200 K bracket and produces nothing; the first
      version reported "stopped at 1.000 bar, last converged point 0.000 K at
      0.000 bar", a sentence about nothing.

  (e) A CRICONDENTHERM IS CLAIMED ONLY FOR AN INTERIOR MAXIMUM, and is
      labelled as BRACKETED rather than refined.  envelope01 has a genuine
      one and reports it; envelope02's apparent maximum is the discarded
      jump's endpoint and must NOT be reported.  Both directions are pinned,
      because a detector that only ever fires is as useless as one that never
      does.

  (f) THE UNCLOSED NOSE IS NAMED, with the algorithm that would close it
      (Michelsen 1980) and the statement that it is a different algorithm and
      not a tolerance.

  (g) ONE HOME FOR THE DEW RESIDUAL.  `DewPoint::compute` is the only place
      sum(y_i/K_i) = 1 is solved; the op must not carry a second copy.
      Checked by reading the source, because two implementations that both
      converge produce two slightly different curves and nothing says which.

  (h) THE PR SLOPE IS PR78's (2026-10-21, DEV.md 4c C123).  Both witnesses'
      K-values come from Choupo's PR, which by ruling is the 1978 form: the
      1976 polynomial up to omega = 0.491, the Robinson & Peng (1978) cubic
      above it.  Every component in the witnesses is below the break, so a
      PROBE with methanol (omega 0.565) is run; the engine's own
      announcement is read, both slopes are recomputed HERE from the printed
      omega, and the arm fails if the engine returned the 1976 value.  A
      source arm holds the four cubic coefficients and the break constant.

  (i) THE VAPOUR ROOT IS CONTINUOUS ACROSS ITS SPINODAL (DEV.md 4c C245
      slice 4).  Propane on SRK at 0.98 Tc, P swept from 0.97 to 1.03 of
      the vapour spinodal pressure, which THIS script computes from the
      record's Tc, Pc, omega (dP/dv = 0 on the large-v side).  Held: the
      engine's pseudo flag is 0 below the spinodal and 1 above it; below,
      Z_vap is a root of the cubic (|f| < 1e-11); above, Z_vap = P v_sp/RT,
      the vapour spinodal volume (the pseudo-root); no step of Z_vap is
      more than 3x its neighbours.  Before C245 the vapour got the LIQUID
      root past the spinodal, unflagged (Z 0.416 -> 0.206).

  (j) A PR AZEOTROPE IS NOT A TRIVIAL ROOT.  CO2 + ethane, kij 0.13 (an
      inline value under `variedBy`, the probe's own), 250 K: the azeotrope
      is located HERE by Newton on ln K1 = ln K2 = 0 through the package's
      K, on PengRobinson and on SRK, and trivialSaturationRoot must accept
      both (two distinct roots, K = 1).  PR used to answer hasLiquidRoot()
      == false and was refused.

  envelope02 (C245): above 28 bar the bubble branch had been drawn with
      the incipient vapour on the liquid's root -- a straight 0.42 K/bar
      plateau after ~2 K/bar.  The arm now holds that the slope never
      collapses by more than 3x between steps and that both branches now
      reach the top of the range (40 bar) unstopped.  The dew branch, ended
      at 36 bar by the root-jump guard from C239, now runs through with a
      1.1 K dip between 35 and 36 bar that is NOT explained here; the
      root-jump report is unwitnessed by a shipped case again.

SABOTAGE-VERIFIED 2026-11-08 (C245), by hand, observed:
  S1  CubicEoS::pickRoot returns the liquid root, unflagged, to a vapour
      past its spinodal (the old behaviour): FAILS (i) ("at P/Psp = 1.00037
      the pseudo flag is 0") and the envelope02 arm ("bubble slope
      collapses 5.7x").
  S1b the same root, flagged pseudo: FAILS (i) ("the pseudo Z_vap =
      0.2062533860 is not ...").
  S2  PR overriding hasLiquidRoot() to false: FAILS (j) ("PengRobinson:
      the CO2 + ethane azeotrope ... is REFUSED as a trivial root").
  S4  the Newton polish of the root removed: PASSES -- PROVES NOTHING.  The
      trigonometric and Cardano roots on these states already sit at
      round-off (|f| ~ 1e-17 measured down to P/Psp = 1 - 1e-10), so no arm
      here can see the polish; it is kept as cheap insurance and recorded
      as unwitnessed.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
No number in either witness is checked against a MEASURED envelope -- the
feeds are plausible, not sampled, and the K-values come from Peng-Robinson
over an ideal liquid.  Both cases are STRUCTURAL witnesses: they pin what the
op reports and refuses to report, never that the curve is right.  The gate
says nothing about the nose itself (it is not drawn), about the critical
point (not located), or about whether the continuity thresholds would catch a
SMALL root jump -- they are sized to catch the discontinuous kind, and a jump
inside the noise of the branch's own steps would pass.

SABOTAGE-VERIFIED 2026-08-27, six times; OBSERVED output below, verbatim.
One of them PROVED NOTHING on its first attempt and is recorded as what it
was, because a sabotage aimed at a line that is not load-bearing is a green
run that means nothing.

S1 -- the bubble monotonicity guard removed, i.e. the original defect put
back:

    - envelope02: the drawn bubble curve FALLS, 334.703 K at 17.000 bar to 266.011 K at 18.000 bar.  A bubble temperature cannot drop as pressure rises; that point is on another root
    - envelope02 reports a cricondentherm.  Its highest kept dew point is the ENDPOINT left by the discarded jump

S2 -- the dew continuity guard removed:

    - envelope02: a drawn dew step is 172.1x its immediate predecessor (86.929 K after 0.505 K) -- a jump, not a curve

S3 -- a root jump reported through the turning-point branch instead:

    - envelope02's branches jump root and the run does not say so -- a discarded point that is not explained reads as a mixture that simply ends there

S4 -- **PROVED NOTHING.**  It removed `if (best == 0 || best + 1 >= size)
return;`, which reads like the endpoint guard and is not: the search loop
runs over interior indices only, so `best` can never BE an endpoint and the
line is redundant.  The gate stayed green and the sabotage said nothing about
it.  A sabotage must attack the line the behaviour rests on, and finding
which one that is is the work.

S4b -- the same intent against the load-bearing guard, the comparison with
both neighbours:

    - envelope02 reports a cricondentherm.  Its highest kept dew point is the ENDPOINT left by the discarded jump, not an interior maximum -- this is exactly the false 371.492 K the first version published

S5 -- an empty branch routed through the stopped-branch report.  Note the
first line: it does not merely misreport, it reads `b.pts.back()` on an empty
vector and the run dies of a signal:

    - envelope01 did not run (exit -11)
    - envelope01's bubble branch produces no point at all, and the run does not distinguish that from a branch that STOPPED

S6 -- the unclosed-nose statement softened in the header:

    - the unclosed nose is not named with the algorithm that would close it and the statement that it is a different algorithm -- otherwise a reader tries to tune it
"""

import math
import re
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
GAS = ROOT / "tutorials" / "props" / "molecular" / "envelope01_natural_gas"
#  Named envelope02_root_jump until C235 (2026-11-07).  Its jump was an
#  artefact of the one-sided liquid reference; with phi_sat and Poynting in
#  it a search of twelve neighbours (six compositions x PengRobinson/SRK, to
#  60 bar) found no root jump, so the case then witnessed a STOPPED branch.
#  Since C239 (2026-11-08) the reference factor is continuous in T and the
#  branches cross propane's Tc: the bubble branch reaches the top of the range
#  and the dew branch ends at a reported root jump.
JUMP = ROOT / "tutorials" / "props" / "molecular" / "envelope02_c3c4c5_branch_stop"
OP = ROOT / "src" / "propertyOps" / "PhaseEnvelope.cpp"


def run(case: Path):
    p = subprocess.run([str(BUILD / "choupoProps"), str(case)],
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def curves(case: Path):
    """curve -> [(P, T)] read from the run's OWN csv, in file order."""
    hits = sorted(case.rglob("envelope.csv"))
    if not hits:
        return {}
    out = {}
    for line in hits[0].read_text().splitlines()[1:]:
        f = line.split(",")
        if len(f) == 3:
            out.setdefault(f[2], []).append((float(f[0]), float(f[1])))
    return out


# ---- (i)(j) EoS root continuity (DEV.md 4c C245 slice 4) ----------------
#  Both arms ask a probe case's OWN package through
#  bin/curate/_gibbsAuditProbe (ZROOT, TRIVIAL, K), and recompute what they
#  hold from the component records' Tc, Pc and omega HERE, with no engine
#  arithmetic reused.
R_GAS = 8.314462618


def _srk_pure(T, rec):
    """a, b of pure SRK (Graboski-Daubert slope, as SRK.cpp), SI."""
    Tc, Pc, w = rec["Tc"], rec["Pc"] * 1e5, rec["omega"]
    m = 0.48508 + 1.55171 * w - 0.15613 * w * w
    alpha = (1.0 + m * (1.0 - (T / Tc) ** 0.5)) ** 2
    return (0.42747 * R_GAS**2 * Tc**2 / Pc * alpha, 0.08664 * R_GAS * Tc / Pc)


def _vapour_spinodal(T, a, b):
    """The VAPOUR spinodal of P = RT/(v-b) - a/(v(v+b)): the larger-v zero
    of dP/dv, bracketed walking down from large v, then bisected."""
    def dPdv(v):
        return -R_GAS * T / (v - b) ** 2 + a * (2 * v + b) / (v * (v + b)) ** 2
    lo, hi, v = None, None, 100.0 * b
    while v > 1.0001 * b:
        nv = v / 1.01
        if dPdv(nv) > 0.0:
            lo, hi = nv, v
            break
        v = nv
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if dPdv(mid) > 0.0:
            lo = mid
        else:
            hi = mid
    v = 0.5 * (lo + hi)
    return R_GAS * T / (v - b) - a / (v * (v + b)), v


def _record(name):
    rec = {}
    path = ROOT / "data" / "standards" / "components" / (name + ".dat")
    for line in path.read_text().splitlines():
        m = re.match(r"\s*(Tc|Pc|omega)\s+([-0-9.eE+]+)\s*;", line)
        if m:
            rec[m.group(1)] = float(m.group(2))
    return rec


def _write_case(root, comps, eq_block):
    (root / "system").mkdir(parents=True)
    (root / "constant").mkdir()
    (root / "system" / "controlDict").write_text(
        "application choupoProps;\ndescription \"EoS root probe\";\nverbosity 0;\n")
    (root / "constant" / "thermoPhysPropDict").write_text(
        "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
        "components ( %s );\n%s" % (" ".join(comps), eq_block))


def eos_root_arms(fails, notes):
    import tempfile
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import gibbs_audit_probe as gap
    err = gap.build()
    if err:
        fails.append("(i/j) " + err)
        return
    with tempfile.TemporaryDirectory(prefix="choupo-eosroots-") as td:
        tmp = Path(td)

        # ---- (i) propane's vapour spinodal at 0.98 Tc on SRK ------------
        #  Below the vapour spinodal pressure the cubic has three roots and
        #  the vapour is the largest; above it only the liquid root exists,
        #  and the engine used to hand that LIQUID root to the label
        #  "vapour", unflagged -- Z_vap jumped at the spinodal.  Held: the
        #  pseudo flag flips exactly at the spinodal computed HERE from the
        #  record; below it Z_vap is a root of the cubic; above it Z_vap is
        #  P v_sp / (R T), the vapour SPINODAL volume (the pseudo-root),
        #  recomputed here; and no step of Z_vap exceeds 3x its neighbours.
        rec = _record("propane")
        T = 0.98 * rec["Tc"]
        a, b = _srk_pure(T, rec)
        Psp, vsp = _vapour_spinodal(T, a, b)
        case = tmp / "propane"
        _write_case(case, ["propane"],
                    "equilibrium\n{\n    formulation gammaPhi;\n"
                    "    liquid { activityModel ideal; standardState pureLiquid; }\n"
                    "    vapour { fugacityModel SRK; }\n}\n")
        Ps = [Psp * (0.97 + 0.0015 * k + 0.00037) for k in range(41)]
        try:
            rows = gap.ask(case, ["ZROOT V %r %r 1.0" % (T, P) for P in Ps], tmp)
        except RuntimeError as e:
            fails.append("(i) " + str(e))
            rows = []
        bad = []
        if len(rows) != len(Ps):
            bad.append("the probe answered %d of %d points" % (len(rows), len(Ps)))
        for P, (Z, ps) in zip(Ps, rows):
            A = a * P / (R_GAS * T) ** 2
            B = b * P / (R_GAS * T)
            c2, c1, c0 = -1.0, A - B - B * B, -A * B
            f = ((Z + c2) * Z + c1) * Z + c0
            want_ps = P > Psp
            if bool(ps) != want_ps:
                bad.append("at P/Psp = %.5f the pseudo flag is %d (the vapour"
                           " spinodal recomputed here is %.6f bar)"
                           % (P / Psp, int(ps), Psp / 1e5))
            elif not want_ps and abs(f) > 1e-11:
                bad.append("at P/Psp = %.5f Z_vap = %.10f is not a root of"
                           " the cubic (f = %.2e)" % (P / Psp, Z, f))
            elif want_ps:
                Zsp = P * vsp / (R_GAS * T)
                if abs(Z - Zsp) > 1e-9:
                    bad.append("at P/Psp = %.5f the pseudo Z_vap = %.10f is"
                               " not P v_sp/RT = %.10f at the vapour spinodal"
                               " volume" % (P / Psp, Z, Zsp))
        Zs = [r[0] for r in rows]
        steps = [abs(Zs[k] - Zs[k - 1]) for k in range(1, len(Zs))]
        worst = 0.0
        for k in range(1, len(steps) - 1):
            ref = max(steps[k - 1], steps[k + 1], 1e-12)
            worst = max(worst, steps[k] / ref)
        if worst > 3.0:
            bad.append("Z_vap takes a step %.1fx its neighbours across the"
                       " sweep -- a root swap, not a curve" % worst)
        if bad:
            fails.extend("(i) " + x for x in bad[:4])
        else:
            flip = next(i for i, r in enumerate(rows) if r[1])
            notes.append("propane on SRK at 0.98 Tc: the vapour root's pseudo"
                         " flag flips between %.4f and %.4f bar, around the"
                         " spinodal %.4f bar recomputed here; Z_vap %.5f ->"
                         " %.5f across it (worst step %.1fx its neighbours)"
                         % (Ps[flip - 1] / 1e5, Ps[flip] / 1e5, Psp / 1e5,
                            Zs[flip - 1], Zs[flip], worst))

        # ---- (j) a PR azeotrope is not a trivial root ---------------------
        #  CO2 + ethane with kij = 0.13 has a positive azeotrope at 250 K on
        #  both cubics.  At the azeotrope K = 1 on two DISTINCT roots: an EoS
        #  azeotrope, which trivialSaturationRoot must accept.  PR used to
        #  answer hasLiquidRoot() == false and was judged by K alone, so its
        #  azeotrope was refused as a trivial root while SRK's was accepted.
        #  The azeotrope is located HERE (Newton on ln K1 = ln K2 = 0 in
        #  x_CO2 and ln P through the probe's K), then the verdict is asked.
        for model in ("PengRobinson", "SRK"):
            c = tmp / ("az" + model)
            _write_case(c, ["CO2", "ethane"],
                        "equilibrium\n{\n    formulation phiPhi;\n"
                        "    equationOfState\n    {\n        model %s;\n"
                        "        mixingRule vanDerWaalsOneFluid;\n"
                        "        binaryInteractions { p { i CO2; j ethane;"
                        " kij 0.13; variedBy gateProbe; } }\n    }\n"
                        "    liquid { fugacityRoute equationOfState; root liquid; }\n"
                        "    vapour { fugacityRoute equationOfState; root vapour; }\n}\n"
                        "caloric\n{\n    energyBasis elementsDatum;\n"
                        "    liquid { departureRoute equilibriumEquationOfState; root liquid; }\n"
                        "    vapour { departureRoute equilibriumEquationOfState; root vapour; }\n}\n"
                        % model)
            T, x, lnP = 250.0, 0.65, math.log(20e5)
            h = 1e-6
            try:
                for _ in range(30):
                    pts = [(x, lnP), (x + h, lnP), (x, lnP + h)]
                    req = ["K %r %r %r %r %r %r" % (T, math.exp(q), u, 1 - u, u, 1 - u)
                           for u, q in pts]
                    K = gap.ask(c, req, tmp)
                    r = [[math.log(k[0]), math.log(k[1])] for k in K]
                    J = [[(r[1][i] - r[0][i]) / h, (r[2][i] - r[0][i]) / h]
                         for i in range(2)]
                    det = J[0][0] * J[1][1] - J[0][1] * J[1][0]
                    dx = (-r[0][0] * J[1][1] + r[0][1] * J[0][1]) / det
                    dq = (-r[0][1] * J[0][0] + r[0][0] * J[1][0]) / det
                    x, lnP = x + dx, lnP + dq
                    if max(abs(dx), abs(dq)) < 1e-12:
                        break
                P = math.exp(lnP)
                pt = "%r %r %r %r" % (T, P, x, 1 - x)
                v, dev = gap.ask(c, ["TRIVIAL 1e-7 " + pt], tmp)[0]
                Zv = gap.ask(c, ["ZROOT V " + pt], tmp)[0][0]
                Zl = gap.ask(c, ["ZROOT L " + pt], tmp)[0][0]
            except (RuntimeError, ZeroDivisionError, ValueError) as e:
                fails.append("(j) %s: could not locate the azeotrope: %s" % (model, e))
                continue
            if dev > 1e-7:
                fails.append("(j) %s: the located point is not an azeotrope"
                             " (max|K-1| = %.2e)" % (model, dev))
            elif int(v) != 0:
                fails.append("(j) %s: the CO2 + ethane azeotrope at %.3f K,"
                             " %.4f bar, x_CO2 = %.4f (Z_L %.4f, Z_V %.4f:"
                             " two distinct roots) is REFUSED as a trivial"
                             " root" % (model, T, P / 1e5, x, Zl, Zv))
            else:
                notes.append("%s: the CO2 + ethane azeotrope (kij 0.13, 250 K,"
                             " %.3f bar, x_CO2 %.4f, Z_L %.4f / Z_V %.4f) is"
                             " accepted, not refused as a trivial root"
                             % (model, P / 1e5, x, Zl, Zv))


def main() -> int:
    fails, notes = [], []

    # ---- (g) one home for the dew residual -------------------------------
    src = OP.read_text()
    if "DewPoint::compute" not in src or "BubblePoint::compute" not in src:
        fails.append("the envelope op does not call BubblePoint::compute and"
                     " DewPoint::compute -- the saturation residuals must have"
                     " ONE home, or the envelope and the units draw two"
                     " slightly different curves with nothing to say which")
    if re.search(r"y\[i\]\s*/\s*K\[i\]", src) or re.search(r"x\[i\]\s*\*\s*K\[i\]", src):
        fails.append("the envelope op contains its own saturation residual --"
                     " a second home for sum(y_i/K_i) = 1")
    if not fails:
        notes.append("the saturation residuals have one home")

    for case, label in ((GAS, "envelope01"), (JUMP, "envelope02")):
        rc, out = run(case)
        if rc != 0:
            fails.append(f"{label} did not run (exit {rc})")
            continue
        cs = curves(case)

        # ---- (a) the bubble curve never falls ---------------------------
        bub = cs.get("bubble", [])
        for i in range(1, len(bub)):
            if bub[i][1] < bub[i-1][1]:
                fails.append(
                    f"{label}: the drawn bubble curve FALLS, {bub[i-1][1]:.3f}"
                    f" K at {bub[i-1][0]/1e5:.3f} bar to {bub[i][1]:.3f} K at"
                    f" {bub[i][0]/1e5:.3f} bar.  A bubble temperature cannot"
                    " drop as pressure rises; that point is on another root")
                break

        # ---- (b) the dew curve is continuous ----------------------------
        dew = cs.get("dew", [])
        #  A LOCAL test, not a global one, and deliberately not a copy of the
        #  op's own rule.  A dew curve legitimately takes large steps at low
        #  pressure and small ones near the nose, so comparing every step to
        #  the branch's GLOBAL median flags the honest steep start -- which is
        #  what the first version of this arm did on envelope01 (14.451 K
        #  against a median of 0.759).  What a root jump actually looks like
        #  is a step tens of times its IMMEDIATE neighbour, so that is what is
        #  measured.
        if len(dew) >= 4:
            steps = [abs(dew[i][1] - dew[i-1][1]) for i in range(1, len(dew))]
            worst, at = 0.0, 0
            for i in range(1, len(steps)):
                prev = max(steps[i-1], 1.0e-9)
                if steps[i] / prev > worst:
                    worst, at = steps[i] / prev, i
            if worst > 10.0:
                fails.append(
                    f"{label}: a drawn dew step is {worst:.1f}x its immediate"
                    f" predecessor ({steps[at]:.3f} K after"
                    f" {steps[at-1]:.3f} K) -- a jump, not a curve")
            else:
                notes.append(f"{label} dew steps within 10x their neighbour"
                             f" (worst {worst:.1f}x)")

    # ---- (c)(d)(e)(f) the announcements ---------------------------------
    rc, gas = run(GAS)
    rc2, jump = run(JUMP)

    if "never started" not in gas:
        fails.append("envelope01's bubble branch produces no point at all, and"
                     " the run does not distinguish that from a branch that"
                     " STOPPED -- the two have different remedies")
    else:
        notes.append("an empty branch is reported as never started")

    #  envelope02 (C239, 2026-11-08; C245 slice 4, 2026-11-08): with the
    #  liquid reference CONTINUOUS in T (held above 0.99 Tc) the branches
    #  cross propane's Tc instead of stopping below it.  Until C245 the bubble
    #  branch "reached the top of the requested range" on the TRIVIAL side
    #  above 28 bar: the incipient vapour was past its spinodal, the PR vapour
    #  root did not exist, and the cubic handed the vapour the LIQUID root,
    #  unflagged -- the drawn line kinked from ~2 K/bar to a straight
    #  0.42 K/bar plateau.  And the dew branch was ended at 36 bar by the
    #  root-jump guard.  With the pseudo-root (CubicEoS.H) both branches run
    #  on their own curvature to the top of the range (40 bar).  What this arm
    #  holds: both branches reach 40 bar, the bubble slope never collapses by
    #  more than 3x between consecutive steps (the trivial plateau put back
    #  makes it 5.7x), and neither branch is reported as stopped.
    cs2 = curves(JUMP)
    bub2, dew2 = cs2.get("bubble", []), cs2.get("dew", [])
    slopes = [(bub2[i][1] - bub2[i-1][1]) / ((bub2[i][0] - bub2[i-1][0]) / 1e5)
              for i in range(1, len(bub2))]
    collapse = max((slopes[i-1] / slopes[i] for i in range(1, len(slopes))
                    if slopes[i] > 0.0), default=0.0)
    for name, br in (("bubble", bub2), ("dew", dew2)):
        if not br or br[-1][0] < 40.0e5 - 1.0:
            fails.append("envelope02's %s branch ends below the top of the"
                         " range (last point %.1f bar); with the pseudo-root"
                         " it reaches 40 bar" % (name, br[-1][0] / 1e5 if br else 0.0))
        if "%s branch stopped" % name in jump:
            fails.append("envelope02's %s branch is reported as STOPPED; it"
                         " reaches the top of the requested range" % name)
    if collapse > 3.0:
        fails.append("envelope02's bubble slope collapses %.1fx between two"
                     " steps -- the incipient vapour has been handed the"
                     " liquid root (a trivial plateau), not a curve" % collapse)
    if not fails or all("envelope02" not in f for f in fails):
        notes.append("envelope02's branches cross propane's Tc to the top of"
                     " the range (40 bar), the bubble one with no trivial"
                     " plateau (worst slope collapse %.1fx)" % collapse)

    # ---- (e) both directions -------------------------------------------
    if "CRICONDENTHERM" not in gas:
        fails.append("envelope01's dew branch has an interior temperature"
                     " maximum and no cricondentherm is reported -- a detector"
                     " that never fires pins nothing")
    elif "BRACKETED" not in gas:
        fails.append("the cricondentherm is reported without saying it is a"
                     " BRACKETED maximum of the traced points; a reader takes"
                     " a refined extremum from it")
    else:
        notes.append("envelope01's interior maximum is reported, as bracketed")

    if "CRICONDENTHERM" in jump:
        fails.append("envelope02 reports a cricondentherm.  Its highest kept"
                     " dew point is the ENDPOINT left by the stopped branch,"
                     " not an interior maximum -- this is exactly the false"
                     " 371.492 K the first version published")
    else:
        notes.append("envelope02 claims no cricondentherm from a branch endpoint")

    if "Michelsen" not in gas or "not a tolerance" not in gas:
        fails.append("the unclosed nose is not named with the algorithm that"
                     " would close it and the statement that it is a different"
                     " algorithm -- otherwise a reader tries to tune it")
    else:
        notes.append("the unclosed nose names Michelsen (1980)")

    # ---- (h) the PR slope is PR78's, recomputed from the printed omega --
    #  The K-values both witnesses draw come from Choupo's PR, and since
    #  2026-10-21 (DEV.md 4c C123) that PR IS PR78: the 1976 polynomial up to
    #  omega = 0.491 and the Robinson & Peng (1978) cubic above it.  Every
    #  component of the two witnesses sits below the break, so no envelope
    #  can see which branch the engine took -- which is exactly why this arm
    #  runs a PROBE with a component above it (methanol, omega 0.565), reads
    #  the omega the engine PRINTS, recomputes both slopes from it here, and
    #  fails if the engine returned the 1976 value.  A source arm beside it
    #  holds the coefficients and the break: an output arm alone would pass
    #  a branch whose constant drifted to 0.49 on a component at 0.565.
    pr_src = (ROOT / "src" / "thermo" / "equationOfState" / "PR.cpp").read_text()
    for needle in ("0.379642", "1.48503", "0.164423", "0.016666", "PR78_BREAK = 0.491"):
        if needle not in pr_src:
            fails.append(f"PR.cpp no longer carries the PR78 slope constant"
                         f" '{needle}' (Robinson & Peng 1978, as PPR78 2010"
                         f" Eq. 2 prints it) -- the model is PR78 by ruling,"
                         f" not an option")
    import tempfile
    with tempfile.TemporaryDirectory(prefix="choupo-pr78-") as td:
        probe = Path(td) / "pr78probe"
        (probe / "system").mkdir(parents=True)
        (probe / "constant").mkdir()
        (probe / "system" / "controlDict").write_text(
            "application choupoProps;\ndescription \"PR78 probe\";\nverbosity 3;\n")
        (probe / "constant" / "thermoPhysPropDict").write_text(
            "recordType thermophysicalPropertySystem;\nschemaVersion 2;\n"
            "components ( methanol water );\n"
            "equilibrium\n{\n    formulation gammaPhi;\n"
            "    liquid { activityModel ideal; standardState pureLiquid; }\n"
            "    vapour { fugacityModel PengRobinson; }\n}\n")
        (probe / "system" / "propsDict").write_text(
            "operations\n(\n    {\n        name pt;\n        type propertyPoint;\n"
            "        state { T 400 K;  P 10 bar;  composition { methanol 0.5;  water 0.5; } }\n"
            "        properties ( Z );\n    }\n);\n")
        rc, out = run(probe)
        m = re.search(r"\[PR78\] methanol omega = ([0-9.]+) > 0\.491: the 1978"
                      r" branch applies, m = ([0-9.]+) \(the 1976 polynomial would"
                      r" give ([0-9.]+)\)", out)
        if rc != 0:
            fails.append(f"the PR78 probe (methanol + water on a PengRobinson"
                         f" vapour) did not run (exit {rc}): {out[-400:]}")
        elif not m:
            fails.append("the PR78 probe ran and the engine did not announce"
                         " methanol (omega 0.565 > 0.491) with the slope it"
                         " received -- a component on the 1978 branch is"
                         " announced, by ruling")
        else:
            w = float(m.group(1)); m_print = float(m.group(2)); m76_print = float(m.group(3))
            m78 = 0.379642 + 1.48503 * w - 0.164423 * w**2 + 0.016666 * w**3
            m76 = 0.37464 + 1.54226 * w - 0.26992 * w**2
            if abs(m_print - m78) > 2e-5:
                fails.append(f"PR78 probe: the engine prints m = {m_print} for"
                             f" omega = {w}; the 1978 cubic gives {m78:.5f}"
                             + (" -- that is the 1976 polynomial"
                                if abs(m_print - m76) < 2e-5 else ""))
            elif abs(m76_print - m76) > 2e-5:
                fails.append(f"PR78 probe: the 1976 value printed beside the"
                             f" slope ({m76_print}) is not the 1976 polynomial"
                             f" at omega = {w} ({m76:.5f})")
            else:
                notes.append(f"PR78: methanol (omega {w}) gets the 1978 slope"
                             f" {m78:.5f}, recomputed here, not the 1976"
                             f" {m76:.5f}")

    eos_root_arms(fails, notes)

    if fails:
        print("check_phase_envelope: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    print("check_phase_envelope: OK -- " + "; ".join(notes) + "."
          "  NOT COVERED: no number in either witness is checked against a"
          " MEASURED envelope (the feeds are plausible, not sampled, and the"
          " K-values are Peng-Robinson over an ideal liquid) -- both are"
          " STRUCTURAL witnesses for what the op reports and refuses to"
          " report.  The nose itself is not drawn and the critical point is"
          " not located.  The continuity thresholds are sized for the"
          " discontinuous kind of root jump; one inside the noise of the"
          " branch's own steps would pass unseen.  THE ROOT-JUMP REPORT IS"
          " UNWITNESSED AGAIN since C245: envelope02's dew branch, which it"
          " ended at 36 bar from C239, now runs to 40 bar on the pseudo-root,"
          " with a 1.1 K DIP between 35 and 36 bar that no arm here explains"
          " (a retrograde turn or a residual root swap; not decided).  The"
          " cubic's"
          " root polish (C245) is UNWITNESSED: the roots these arms read are"
          " already at round-off without it.  Sabotage by hand (C245): the"
          " vapour handed the liquid root past its spinodal FAILS (i) and the"
          " envelope02 slope arm; PR without hasLiquidRoot FAILS (j).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
