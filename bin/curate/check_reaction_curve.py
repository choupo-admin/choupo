#!/usr/bin/env python3
"""Gate: the FOPDT identification is recomputed here, from the published curve.

    bin/curate/check_reaction_curve.py

WHY THIS EXISTS.  `reactionCurve` publishes three numbers a reader acts on --
a gain, a time constant and an apparent dead time -- and then turns them into
controller settings with three published rules.  Every one of those numbers is
the output of a regression, so the only check worth having is one that DOES
THE REGRESSION AGAIN, by another route, and compares.  Reading the engine's
own answer back out of its own JSON would test the plumbing and nothing else.

So this script parses the run's `trajectory.csv` -- the same record the engine
was given, and nothing the engine derived from it -- segments it, and fits the
FOPDT model with a completely different search: a shrinking two-dimensional
GRID, where the engine uses the project's shared Nelder-Mead simplex.  Two
searches that disagree cannot both be at the minimum, and the objective value
itself is compared as well as the parameters, because two parameter sets that
differ while their SSEs agree to ten digits mean a flat objective, not a bug.

THIS GATE IS NON-DESTRUCTIVE BY CONSTRUCTION.  Every sabotage below is applied
to a COPY of the tutorial case in a temporary directory, never to the tree, so
no `bin/curate/destructive_session.py` journal is needed and no repository file
is ever mutated -- not even briefly, not even inside a `try/finally`.  That is
a deliberate answer to the 2026-08-18 contamination: a gate that never touches
the tree cannot poison it, whatever signal kills the gate.  Nothing here
rebuilds the engine either, so a `kill -9` at any moment leaves exactly one
orphaned temporary directory behind.

WHAT THIS GATE CHECKS.

  (a) THE PAIR RUNS.  choupoCtrl writes the step record and choupoProps
      identifies from it, both at exit 0, in one case directory.

  (b) THE IDENTIFICATION IS RECOMPUTED, independently, for every segment of
      both published operations -- the composition loop and the temperature
      loop.  Parameters are compared at a stated tolerance AND the objective
      is compared at a much tighter one.

      This arm is the reason the engine's fit was WRONG when it was first
      built.  `solver::NelderMead` floors the scale of its f-range test at 1
      (`fScale = max(1, |fBest|)`), so on an objective of order 1e-11 -- a sum
      of squared kmol residuals -- `tolF` stopped being a relative tolerance.
      The op reported `converged` after NINE iterations at a point this grid
      search beat by 2.6 % in SSE.  The fix is in the op (it normalises its
      objective by the seed's value and restarts the simplex), not in the
      shared solver, whose other callers are unaffected.

  (c) THE TUNING ALGEBRA IS RECOMPUTED FROM THE ENGINE'S OWN TRIPLE, which
      separates two failures that would otherwise be one: a wrong fit and a
      mistyped formula.  Given (K, tau, theta) the three rules are closed-form,
      so this arm demands agreement to 1e-9 and would catch a single changed
      coefficient.

  (d) EVERY SETTING CARRIES ITS SOURCE.  The rules disagree by a factor of
      eight on this case, so a setting quoted without saying which rule and
      which paper produced it is not a result.  The `source` column must be
      present, non-empty, and must name the year the gate expects for that
      rule -- 1942, 1953, 1986.

  (e) THE SURROGATE STATEMENT REACHES THE READER TWICE: at its site and in the
      end-of-run ASSUMPTIONS AND CAVEATS block.  An FOPDT model of a plant
      that is neither first order nor delayed is an approximation, and the
      engine has to say so in its own voice rather than in a comment.

  (f) THE STEP-SIZE SENSITIVITY IS MEASURED AND PUBLISHED, and the gate
      recomputes the spread from the segments table.  A gain identified from
      one step and quoted as the plant's gain is a remembered measurement
      dressed as a property; on this case the +/-20 K steps identify a gain
      48 % larger than the +/-5 K steps do.

  (g) THE NEGATIVE, and it is the arm that stops the refusals from being
      decoration.  The SAME experiment analysed with the reactor TEMPERATURE
      as the measured variable has no dead time worth the name, so
      Ziegler-Nichols and Cohen-Coon are refused by name (both divide by
      theta) while IMC still publishes -- its algebra never does.  Without
      this arm the gate would pass just as happily if the theta guard fired on
      everything, or on nothing.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.

  * It says NOTHING about whether the FOPDT surrogate is a good description of
    this plant, or whether any of the three tuning rules produces a good loop.
    It never closes the loop; no tuned controller is simulated anywhere in
    Choupo today, so "these settings work" is a claim nothing here supports.
  * The three rules are checked against formulas TRANSCRIBED IN THIS FILE from
    the same primaries the op cites.  Two transcriptions of one paper agreeing
    is weaker than a primary check, and if both were mistyped the same way
    this arm would pass.  What it does catch is drift: the engine's algebra
    changing without this file changing.
  * `bin/runTests` dispatches a case by `controlDict.application`, so the
    corpus runs the choupoCtrl half of ctrl17 and NOT the choupoProps half.
    Until someone with the `bin/runTests` territory wires a props pass over
    this directory, the identification is pinned by THIS GATE ALONE -- there
    is no `expected` row anywhere that reads a K, a tau or a theta.
  * It exercises one plant.  The refusals for a missing trajectory, an unknown
    column, a missing lambda and an unsettled response are each fired once,
    below, and nothing here says they are the only ways this op can be wrong.

SABOTAGE-VERIFIED 2026-08-19, SEVEN times; OBSERVED output recorded below,
verbatim.  Sabotage 5 fired differently from the prediction and is the most
useful line in this docstring -- see its note.  The seventh is the source-level
one an earlier slice had named as the gap it could not close; it is at the end.

The first SIX are applied to a COPY in a temporary directory: sabotages 1-4 are
of the CASE and prove the ENGINE refuses, 5-6 are of the ENGINE'S PUBLISHED
OUTPUT and prove THIS GATE compares.  The SEVENTH is different in kind and is
the only one that touches the tree -- it edits `src/`, rebuilds, and is
performed BY HAND under a destructive-session journal, never by this gate.

Sabotage 1 -- the dynamic case's `endTime` cut from 15000 to 12400, so the
final -20 K step has 400 s of a ~240 s time constant to settle in.  choupoProps
exits 2 with:

    *** choupoProps fatal error: reactionCurve 'fopdt_jacket_to_composition': segment 4 NEVER SETTLED.  Over the final 60 s of the segment (t = 12340 to 12400 s) the output 'reactor.n_compB' was still moving by 7.3213e-02 of its own step change, against the declared `settling.tolerance` 0.005.  The steady-state gain and the time constant are BOTH read off the end of the curve, so neither means anything here: K would be the change so far rather than the change, and tau would be whatever exponential happens to pass through an unfinished transient.  Hold this step longer (raise `endTime` in the dynamic case, or move the next schedule entry later), or -- if the plant really does not settle -- identify it with a method that does not assume it does.  This bench will not report a time constant for a response that has not finished.

Sabotage 2 -- `measured reactor.n_compB;` changed to `measured reactor.n_compC;`
(a column that does not exist):

    *** choupoProps fatal error: reactionCurve 'fopdt_jacket_to_composition': the declared `measured` column 'reactor.n_compC' is not in the trajectory.  The columns it carries are: t, reactor.n_compA, reactor.n_compB, reactor.T, reactor.F_in, reactor.z_in_compA, reactor.z_in_compB, JacketStep.SP, JacketStep.PV, JacketStep.MV.  A controller's manipulated variable appears as `<controller>.MV`; a unit's state appears as `<unit>.<state>`.

Sabotage 3 -- the `lambda { relativeToTau 1.0; }` block deleted while
`imcLambda` stays in `rules`:

    *** choupoProps fatal error: reactionCurve 'fopdt_jacket_to_composition': the `imcLambda` rule was requested but no `tuning.lambda {}` was declared.  Lambda is the desired CLOSED-LOOP time constant: it is the engineer's choice of how fast the loop should be, not something the open-loop record can tell you, and this bench will not invent one.  Declare `lambda { relativeToTau 1.0; }` (a closed loop as fast as the plant) or `lambda { value <t> s; }`.  Rivera, Morari & Skogestad (1986) recommend keeping lambda above roughly 0.8 theta for robustness; that recommendation is theirs to make and yours to apply.

Sabotage 4 -- `trajectory.csv` deleted before choupoProps runs:

    *** choupoProps fatal error: reactionCurve 'fopdt_jacket_to_composition': the trajectory file 'trajectory.csv' does not exist.  This operation ANALYSES a step response; it does not run one -- the experiment is choupoCtrl's and the identification is this bench's, and keeping them apart is what stops a second time loop being written beside the first.  Run the dynamic experiment in this case directory first (`runCase <case>` or `choupoCtrl <case>`), then run choupoProps on the same directory.

Sabotage 5 -- THE ONE WORTH KNOWING.  `tau` in the published
`reactionCurveSegments.csv` multiplied by 1.05 after the run, to prove arm (b)
compares rather than transcribes.  PREDICTED: one failure, naming tau.
OBSERVED: TWO, and the second is much louder than the first --

    composition segment 1: published tau 250.7423051460432 s against 238.8021897454546 s recomputed here (rel. dev. 5.000e-02, tolerance 5.0e-03)
    composition segment 1: the published (K, tau, theta) gives SSE 1.07388e-10 against 1.81421e-11 at this gate's own optimum -- the published point is not the minimum of its own objective (excess 4.919e+00, tolerance 1.0e-06)

  A 5 % error in tau costs a FACTOR OF SIX in the sum of squares, because the
  objective is quadratic about its minimum and 5 % is a long way out on it.
  The objective arm would therefore have caught a tau error several hundred
  times smaller than the parameter arm's own tolerance admits -- which means
  the parameter tolerances are not what is protecting this gate, and TOL_TAU
  could be loosened a great deal without weakening it.  The parameter arm is
  kept anyway, because it names WHICH parameter moved and the objective arm
  cannot.  Note also what did NOT fire: K is re-derived in closed form from
  (tau, theta), so a doctored tau leaves the published K untouched and the K
  arm silent.  A gate with only the K arm would have passed this sabotage.

Sabotage 6 -- `Kc` of the first row of the published `reactionCurveTuning.csv`
multiplied by 1.01, to prove arm (c) recomputes the rule algebra:

    composition segment 1 zieglerNichols PI: published Kc 675121.4099764667 against 668437.0395806619 recomputed from the engine's own (K, tau, theta) (rel. dev. 1.000e-02)

  ONE line, where the sabotage touched one row -- as intended.  Arm (c) walks
  every published row, so a systematic change to a rule's coefficient would
  produce one line per segment.

Sabotage 7 -- THE SOURCE-LEVEL ONE, performed 2026-08-19 after the slice that
wrote arms (a)-(c) had named it as the gap it could not close (it had been told
not to run `make` while the commit was held).  Ziegler-Nichols' PID gain
coefficient changed in `src/propertyOps/ReactionCurve.cpp` from 1.2 to 1.1, the
engine REBUILT, and the gate re-run:

    composition segment 1 zieglerNichols PID: published Kc 816978.603931917 against 891249.3861075492 recomputed from the engine's own (K, tau, theta) (rel. dev. 8.333e-02)
    composition segment 2 zieglerNichols PID: published Kc 942424.010592421 against 1028098.9206462814 recomputed from the engine's own (K, tau, theta) (rel. dev. 8.333e-02)
    composition segment 3 zieglerNichols PID: published Kc 443399.066805716 against 483708.0728789624 recomputed from the engine's own (K, tau, theta) (rel. dev. 8.333e-02)
    composition segment 4 zieglerNichols PID: published Kc 765738.127342158 against 835350.6843732595 recomputed from the engine's own (K, tau, theta) (rel. dev. 8.333e-02)

  FOUR lines where sabotage 6's doctored CSV row produced one -- exactly the
  systematic signature that docstring predicted, one per segment, at the
  arithmetic deviation 0.1/1.2 = 8.333e-02.  Two silences are worth as much as
  the four lines: the PI rows are untouched (only the PID branch was edited),
  and the TEMPERATURE operation contributes nothing at all, because it refuses
  every Ziegler-Nichols setting for an unresolved dead time and so has no ZN
  row to be wrong.  This is what sabotage 6 could not establish: arm (c) reads
  the ENGINE'S LIVE ALGEBRA, not merely an artefact that agrees with itself.

  Performed under `bin/curate/destructive_session.py`, restored, rebuilt, and
  the gate re-run to exit 0 -- which is the only proof the tree came back.  The
  gate does NOT do this to itself: a gate that rebuilds the engine is the shape
  that poisoned the tree on 2026-08-18.
"""

import csv
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
CASE = ROOT / "tutorials" / "ctrl" / "ctrl17_step_reaction_curve"

#  Parameter tolerances for arm (b).  A shrinking grid and a simplex do not
#  land on the same floating-point point; what they must agree on is the
#  ANSWER.  theta is compared as a fraction of tau, because a dead time near
#  zero has no meaningful relative tolerance.
TOL_K = 5.0e-3
TOL_TAU = 5.0e-3
TOL_THETA_OVER_TAU = 5.0e-3
#  The objective arm: the published point must be at the gate's own minimum.
TOL_SSE_EXCESS = 1.0e-6

#  Arm (d): each rule's source string must name its year.
RULE_YEAR = {
    "zieglerNichols": "1942",
    "cohenCoon": "1953",
    "imcLambda": "1986",
}

#  Arm (e): what the surrogate advisory has to SAY, not merely that one fired.
SURROGATE_MUST_SAY = [
    "SURROGATE",            # the word, so the reader cannot miss the claim
    "not a property of the plant",
    "residual",             # the falsifiable half
    "tuned for the surrogate",
]


# ---------------------------------------------------------------------------
#  The independent identification.
# ---------------------------------------------------------------------------
def read_csv_columns(path):
    rows = list(csv.reader(open(path)))
    hdr = rows[0]
    return {h: [r[i] for r in rows[1:]] for i, h in enumerate(hdr)}


def read_trajectory(path):
    cols = read_csv_columns(path)
    return {k: [float(v) for v in vs] for k, vs in cols.items()}


def find_segments(t, u):
    scale = max(u) - min(u)
    changes = [i for i in range(1, len(t))
               if abs(u[i] - u[i - 1]) > 1.0e-9 * scale]
    segs = []
    for k, i in enumerate(changes):
        i_before = i - 1
        i_end = (changes[k + 1] - 1) if k + 1 < len(changes) else len(t) - 1
        segs.append((i_before, i_end))
    return segs


def sse_at(trel, z, tau, theta):
    """Sum of squares with the linear amplitude eliminated in closed form."""
    gg = 0.0
    gz = 0.0
    gs = []
    for k in range(len(trel)):
        a = trel[k] - theta
        g = 0.0 if a <= 0.0 else 1.0 - math.exp(-a / tau)
        gs.append(g)
        gg += g * g
        gz += g * z[k]
    if gg <= 0.0:
        return 1.0e300, 0.0
    amp = gz / gg
    s = 0.0
    for k in range(len(trel)):
        r = z[k] - amp * gs[k]
        s += r * r
    return s, amp


def fit_grid(trel, z, seg_length, tau_seed):
    """A SHRINKING GRID, deliberately not a simplex: an independent search."""
    t_lo, t_hi = 0.2 * tau_seed, 5.0 * tau_seed
    d_lo, d_hi = 0.0, 0.25 * seg_length
    best = None
    n = 15
    for _ in range(30):
        for i in range(n):
            tau = t_lo + (t_hi - t_lo) * i / (n - 1)
            if tau <= 0.0:
                continue
            for j in range(n):
                theta = d_lo + (d_hi - d_lo) * j / (n - 1)
                s, amp = sse_at(trel, z, tau, theta)
                if best is None or s < best[0]:
                    best = (s, tau, theta, amp)
        s, tau, theta, amp = best
        wt = (t_hi - t_lo) * 0.3
        wd = (d_hi - d_lo) * 0.3
        t_lo, t_hi = max(1.0e-9, tau - wt), tau + wt
        d_lo, d_hi = max(0.0, theta - wd), theta + wd
    return best


# ---------------------------------------------------------------------------
#  The tuning algebra, transcribed here from the SAME primaries the op cites.
# ---------------------------------------------------------------------------
def tuning_expected(rule, form, K, tau, th, lam):
    r = th / tau
    if rule == "zieglerNichols":
        if form == "PI":
            return 0.9 * tau / (K * th), 3.33 * th, None
        if form == "PID":
            return 1.2 * tau / (K * th), 2.0 * th, 0.5 * th
        if form == "P":
            return tau / (K * th), None, None
    if rule == "cohenCoon":
        base = (1.0 / K) * (tau / th)
        if form == "PI":
            return (base * (0.9 + r / 12.0),
                    th * (30.0 + 3.0 * r) / (9.0 + 20.0 * r), None)
        if form == "PID":
            return (base * (4.0 / 3.0 + r / 4.0),
                    th * (32.0 + 6.0 * r) / (13.0 + 8.0 * r),
                    th * 4.0 / (11.0 + 2.0 * r))
        if form == "P":
            return base * (1.0 + r / 3.0), None, None
    if rule == "imcLambda":
        kc = (1.0 / K) * (tau + 0.5 * th) / (lam + 0.5 * th)
        ti = tau + 0.5 * th
        if form == "PI":
            return kc, ti, None
        if form == "PID":
            return kc, ti, tau * th / (2.0 * tau + th)
    raise AssertionError(f"gate has no formula for {rule} {form}")


# ---------------------------------------------------------------------------
def run(binary, cwd):
    p = subprocess.run([str(BUILD / binary), "."], cwd=str(cwd),
                       capture_output=True, text=True, timeout=1800)
    return p.returncode, p.stdout + p.stderr


def stage(tmp, name):
    """A fresh COPY of the tutorial case.  The tree is never touched."""
    dst = Path(tmp) / name
    shutil.copytree(CASE, dst)
    for junk in dst.glob("*.csv"):
        junk.unlink()
    return dst


def rel(a, b):
    return abs(a - b) / max(abs(b), 1.0e-300)


def check_identification(label, traj_path, seg_path, u_col, y_col, failures):
    traj = read_trajectory(traj_path)
    t, u, y = traj["t"], traj[u_col], traj[y_col]
    segs = find_segments(t, u)
    published = list(csv.DictReader(open(seg_path)))

    if len(published) != len(segs):
        failures.append(f"{label}: the engine published {len(published)} "
                        f"segment(s) where this gate finds {len(segs)} step(s) "
                        "in the same input column")
        return None

    for k, (i_before, i_end) in enumerate(segs):
        row = published[k]
        trel = [t[i] - t[i_before] for i in range(i_before, i_end + 1)]
        z = [y[i] - y[i_before] for i in range(i_before, i_end + 1)]
        du = u[i_before + 1] - u[i_before]
        seg_len = t[i_end] - t[i_before]
        s_gate, tau_g, th_g, amp_g = fit_grid(trel, z, seg_len,
                                              max(float(row["tau_twoPoint"]),
                                                  1.0))
        K_g = amp_g / du

        K_p = float(row["K"])
        tau_p = float(row["tau"])
        th_p = float(row["theta"])
        s_pub, _ = sse_at(trel, z, tau_p, th_p)

        n = k + 1
        if rel(K_p, K_g) > TOL_K:
            failures.append(
                f"{label} segment {n}: published K {K_p} against {K_g} "
                f"recomputed here (rel. dev. {rel(K_p, K_g):.3e}, tolerance "
                f"{TOL_K:.1e})")
        if rel(tau_p, tau_g) > TOL_TAU:
            failures.append(
                f"{label} segment {n}: published tau {tau_p} s against {tau_g} "
                f"s recomputed here (rel. dev. {rel(tau_p, tau_g):.3e}, "
                f"tolerance {TOL_TAU:.1e})")
        d_theta = abs(th_p - th_g) / tau_g
        if d_theta > TOL_THETA_OVER_TAU:
            failures.append(
                f"{label} segment {n}: published theta {th_p} s against {th_g} "
                f"s recomputed here (difference {d_theta:.3e} of tau, "
                f"tolerance {TOL_THETA_OVER_TAU:.1e})")
        excess = (s_pub - s_gate) / max(s_gate, 1.0e-300)
        if excess > TOL_SSE_EXCESS:
            failures.append(
                f"{label} segment {n}: the published (K, tau, theta) gives SSE "
                f"{s_pub:.6g} against {s_gate:.6g} at this gate's own optimum "
                f"-- the published point is not the minimum of its own "
                f"objective (excess {excess:.3e}, tolerance "
                f"{TOL_SSE_EXCESS:.1e})")
    return published


def check_tuning(label, seg_path, tune_path, lambda_over_tau, failures):
    segs = {int(r["segment"]): r for r in csv.DictReader(open(seg_path))}
    rows = list(csv.DictReader(open(tune_path)))
    seen_rules = set()
    for r in rows:
        n = int(r["segment"])
        rule, form = r["rule"], r["form"]
        seen_rules.add(rule)
        s = segs[n]
        K, tau, th = float(s["K"]), float(s["tau"]), float(s["theta"])
        lam = lambda_over_tau * tau
        kc, ti, td = tuning_expected(rule, form, K, tau, th, lam)

        if rel(float(r["Kc"]), kc) > 1.0e-9:
            failures.append(
                f"{label} segment {n} {rule} {form}: published Kc {r['Kc']} "
                f"against {kc} recomputed from the engine's own "
                f"(K, tau, theta) (rel. dev. {rel(float(r['Kc']), kc):.3e})")
        for key, want in (("Ti", ti), ("Td", td)):
            got = r[key]
            if want is None:
                if got not in ("", None):
                    failures.append(
                        f"{label} segment {n} {rule} {form}: published a {key} "
                        f"of {got} for a form that has no {key} term")
                continue
            if got in ("", None):
                failures.append(f"{label} segment {n} {rule} {form}: no {key} "
                                "published for a form that has one")
                continue
            if rel(float(got), want) > 1.0e-9:
                failures.append(
                    f"{label} segment {n} {rule} {form}: published {key} {got} "
                    f"against {want} recomputed here "
                    f"(rel. dev. {rel(float(got), want):.3e})")

        # (d) the attribution travels with the number.
        src = r["source"]
        if not src.strip():
            failures.append(f"{label} segment {n} {rule} {form}: the `source` "
                            "column is empty -- a setting quoted without its "
                            "rule's primary is not a result")
        elif RULE_YEAR[rule] not in src:
            failures.append(
                f"{label} segment {n} {rule}: the published source does not "
                f"name {RULE_YEAR[rule]} -- got '{src}'")
    return seen_rules


def main() -> int:
    failures = []
    notes = []

    for b in ("choupoCtrl", "choupoProps"):
        if not (BUILD / b).exists():
            print(f"check_reaction_curve: FAILED\n  {b} is not built "
                  f"({BUILD / b}) -- run `make all` first.  A check that "
                  "cannot run must not pass.")
            return 1

    #  The probe must still BE the experiment it claims to be.
    fs = (CASE / "system" / "flowsheetDict").read_text()
    if "controllers" not in fs or "type         PID" in fs or "type  PID" in fs:
        failures.append("the probe is STALE: ctrl17's flowsheetDict now "
                        "carries a PID, so its record is no longer an "
                        "OPEN-loop step test and nothing below means what it "
                        "says")

    with tempfile.TemporaryDirectory(prefix="choupo-reactioncurve-") as tmp:
        # ------------------------------------------------------------- (a)
        good = stage(tmp, "good")
        rc, out = run("choupoCtrl", good)
        if rc != 0:
            print("check_reaction_curve: FAILED\n  the dynamic step test did "
                  f"not run (exit {rc}):\n{out[-2000:]}")
            return 1
        rc, props_out = run("choupoProps", good)
        if rc != 0:
            print("check_reaction_curve: FAILED\n  the identification did not "
                  f"run (exit {rc}):\n{props_out[-3000:]}")
            return 1

        # ------------------------------------------------------------- (b)
        traj = good / "trajectory.csv"
        comp_segs = check_identification(
            "composition", traj, good / "reactionCurveSegments.csv",
            "JacketStep.MV", "reactor.n_compB", failures)
        temp_segs = check_identification(
            "temperature", traj, good / "reactionCurveSegmentsT.csv",
            "JacketStep.MV", "reactor.T", failures)

        # --------------------------------------------------------- (c) (d)
        comp_rules = check_tuning("composition",
                                  good / "reactionCurveSegments.csv",
                                  good / "reactionCurveTuning.csv",
                                  1.0, failures)
        temp_rules = check_tuning("temperature",
                                  good / "reactionCurveSegmentsT.csv",
                                  good / "reactionCurveTuningT.csv",
                                  1.0, failures)

        if comp_rules != {"zieglerNichols", "cohenCoon", "imcLambda"}:
            failures.append("composition: the run published settings for "
                            f"{sorted(comp_rules)} -- all three declared rules "
                            "should apply on a loop with a resolved dead time")

        # ------------------------------------------------------------- (g)
        #  The negative: the SAME steps, read as a temperature loop, have no
        #  resolvable dead time.  ZN and CC must be refused BY NAME; IMC must
        #  survive, because its algebra never divides by theta.
        if temp_rules != {"imcLambda"}:
            failures.append(
                "temperature: expected ONLY imcLambda to survive on a loop "
                "whose identified dead time is below the sampling interval, "
                f"got {sorted(temp_rules)} -- either the theta guard stopped "
                "firing, or it now fires on everything")
        for rule in ("zieglerNichols", "cohenCoon"):
            if f"{rule} " not in props_out or "REFUSED rather than produced" \
                    not in props_out:
                failures.append(
                    f"temperature: the refusal of {rule} for an unresolved "
                    "theta was not announced -- a setting that silently does "
                    "not appear teaches the reader nothing")
                break
        if temp_segs is not None:
            for row in temp_segs:
                if float(row["theta"]) > float(row["sampleInterval"]):
                    failures.append(
                        "temperature: segment " + row["segment"] + " reports a "
                        "dead time of " + row["theta"] + " s, larger than the "
                        "sampling interval -- the negative no longer has the "
                        "property it was chosen for")

        # ------------------------------------------------------------- (e)
        for phrase in SURROGATE_MUST_SAY:
            if phrase not in props_out:
                failures.append("the surrogate announcement does not say "
                                f"'{phrase}'")
        caveat = props_out.split("ASSUMPTIONS AND CAVEATS")
        if len(caveat) < 2:
            failures.append("no ASSUMPTIONS AND CAVEATS block was printed -- a "
                            "warning a thousand lines above the answer has "
                            "been delivered and not received")
        elif "SURROGATE" not in caveat[-1]:
            failures.append("the surrogate announcement fired at its site but "
                            "does not appear in the end-of-run ASSUMPTIONS AND "
                            "CAVEATS block")

        # ------------------------------------------------------------- (f)
        if comp_segs is not None:
            Ks = [float(r["K"]) for r in comp_segs]
            spread = (max(Ks) - min(Ks)) / abs(sum(Ks) / len(Ks))
            m = re.search(r'"K_spread_relative":\s*([0-9.eE+-]+)', props_out)
            if not m:
                failures.append("the run publishes no `K_spread_relative` -- "
                                "the sensitivity to step size is not reported "
                                "at all")
            elif rel(float(m.group(1)), spread) > 1.0e-4:
                failures.append(
                    f"published K_spread_relative {m.group(1)} against "
                    f"{spread} recomputed from the published segments")
            elif spread < 0.05:
                failures.append(
                    f"the identified gain spreads only {spread:.3e} across the "
                    "four steps -- this case was chosen because its gain moves "
                    "visibly with step size, and if it no longer does, the "
                    "sensitivity arm is checking nothing")
            else:
                notes.append(f"gain spread {spread:.3f} across |du| = 5 to 20 K")

        # -------------------------------------------------- S1: unsettled
        s1 = stage(tmp, "s1")
        cd = s1 / "system" / "controlDict"
        cd.write_text(cd.read_text().replace("endTime         15000;",
                                             "endTime         12400;"))
        rc, _ = run("choupoCtrl", s1)
        rc, out = run("choupoProps", s1)
        if rc == 0:
            failures.append("S1 (unsettled response): choupoProps exited 0 -- "
                            "a response that never settled was identified "
                            "anyway")
        elif "NEVER SETTLED" not in out or "segment 4" not in out:
            failures.append("S1 (unsettled response): the run refused, but not "
                            f"by name -- got: {out[-400:]}")

        # ---------------------------------------------- S2: unknown column
        s2 = stage(tmp, "s2")
        shutil.copy(good / "trajectory.csv", s2 / "trajectory.csv")
        pd = s2 / "system" / "propsDict"
        pd.write_text(pd.read_text().replace("measured    reactor.n_compB;",
                                             "measured    reactor.n_compC;"))
        rc, out = run("choupoProps", s2)
        if rc == 0 or "is not in the trajectory" not in out:
            failures.append("S2 (unknown measured column): expected a named "
                            f"refusal, got exit {rc}: {out[-400:]}")

        # ---------------------------------------------- S3: missing lambda
        s3 = stage(tmp, "s3")
        shutil.copy(good / "trajectory.csv", s3 / "trajectory.csv")
        pd = s3 / "system" / "propsDict"
        pd.write_text(pd.read_text().replace(
            "lambda { relativeToTau 1.0; }", "", 1))
        rc, out = run("choupoProps", s3)
        if rc == 0 or "no `tuning.lambda {}` was declared" not in out:
            failures.append("S3 (imcLambda with no lambda): expected a named "
                            f"refusal, got exit {rc}: {out[-400:]}")

        # ------------------------------------------ S4: missing trajectory
        s4 = stage(tmp, "s4")
        rc, out = run("choupoProps", s4)
        if rc == 0 or "does not exist" not in out or "choupoCtrl" not in out:
            failures.append("S4 (no trajectory): expected a refusal naming the "
                            f"experiment as the remedy, got exit {rc}: "
                            f"{out[-400:]}")

        # ------------------------------- S5: the gate sabotages ITS OWN arm
        s5_failures = []
        s5 = stage(tmp, "s5")
        shutil.copy(good / "trajectory.csv", s5 / "trajectory.csv")
        rows = list(csv.DictReader(open(good / "reactionCurveSegments.csv")))
        field_names = list(rows[0].keys())
        rows[0]["tau"] = str(float(rows[0]["tau"]) * 1.05)
        with open(s5 / "reactionCurveSegments.csv", "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=field_names)
            w.writeheader()
            w.writerows(rows)
        check_identification("s5", s5 / "trajectory.csv",
                             s5 / "reactionCurveSegments.csv",
                             "JacketStep.MV", "reactor.n_compB", s5_failures)
        if not s5_failures:
            failures.append("S5 self-sabotage (tau x 1.05 in the published "
                            "segments table) was NOT caught by arm (b) -- the "
                            "independent recomputation is not comparing")

        # ------------------------------- S6: the gate sabotages arm (c) too
        s6_failures = []
        s6 = stage(tmp, "s6")
        rows = list(csv.DictReader(open(good / "reactionCurveTuning.csv")))
        field_names = list(rows[0].keys())
        rows[0]["Kc"] = str(float(rows[0]["Kc"]) * 1.01)
        with open(s6 / "reactionCurveTuning.csv", "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=field_names)
            w.writeheader()
            w.writerows(rows)
        shutil.copy(good / "reactionCurveSegments.csv",
                    s6 / "reactionCurveSegments.csv")
        check_tuning("s6", s6 / "reactionCurveSegments.csv",
                     s6 / "reactionCurveTuning.csv", 1.0, s6_failures)
        if not s6_failures:
            failures.append("S6 self-sabotage (Kc x 1.01 in the published "
                            "tuning table) was NOT caught by arm (c) -- the "
                            "tuning algebra is not being recomputed")

    if failures:
        print("check_reaction_curve: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print("check_reaction_curve: OK -- ctrl17's open-loop step record was "
          "re-identified here by an independent shrinking-grid search, and the "
          "engine's (K, tau, theta) agrees on every segment of both published "
          "operations, at the minimum of the same objective to "
          f"{TOL_SSE_EXCESS:.0e}; the three tuning rules reproduce from the "
          "engine's own triple to 1e-9 and each carries its primary's year; "
          "the FOPDT-surrogate statement reaches the reader at its site AND in "
          "the end-of-run caveat block; the step-size sensitivity is measured "
          f"and republished ({', '.join(notes) if notes else 'no note'}); and "
          "the same experiment read as a TEMPERATURE loop refuses "
          "Ziegler-Nichols and Cohen-Coon by name for an unresolved dead time "
          "while IMC still publishes.  Four engine refusals fired (unsettled, "
          "unknown column, missing lambda, missing trajectory) and the gate's "
          "own two arms were sabotage-checked in-process.  NOT covered: "
          "whether the surrogate or any of the three rules is any GOOD -- no "
          "tuned loop is ever closed anywhere in Choupo, so nothing here "
          "supports 'these settings work'; the rule formulas are a second "
          "transcription of the same primaries, so a shared mistyping would "
          "pass; and bin/runTests dispatches ctrl17 by its controlDict "
          "application, which runs the choupoCtrl half only -- until that is "
          "wired, no `expected` row anywhere reads a K, a tau or a theta and "
          "this gate is their only pin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
