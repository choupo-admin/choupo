#!/usr/bin/env python3
"""Gate: the azeotrope CEILING -- a prediction written in one case and tested
in another, pinned so the link between them cannot rot.

    bin/curate/check_azeotrope_ceiling.py

WHY THIS EXISTS.  On 2026-08-12 `props/compare/acetone04_acetone_water_vle`
measured the acetone/water VLE and found that the corpus UNIFAC table puts a
minimum-boiling azeotrope near x_acetone 0.978 where Luyben's UNIQUAC has only
a pinch.  It then wrote down, IN ADVANCE and in the case's own CLAUDE.md, what
a column built on that thermodynamics would do:

    "A column C1 built on this thermodynamics should be expected to asymptote
     near 97.9 % and fail his spec"

On 2026-08-13 `steady/distillation/acetone06_luyben_column_C1` was built and
the prediction held: 0.97312 against a 0.999 spec.

THE CLAIM IS THE LINK, AND THE LINK LIVES IN NEITHER GOLDEN.  acetone04's
golden pins its scan; acetone06's pins its column.  Each can pass while the
sentence connecting them quietly stops being true -- the thermodynamics could
change and take the azeotrope away, or the column could stop being capped by
it, and both cases would still be green.  A finding pinned only in prose goes
stale silently; this gate pins it executably, and at BOTH ends.

  (A1) THE PREMISE.  acetone04's fine scan still contains an interior
       minimum-boiling azeotrope in x_acetone 0.92..1.0: T_bubble has an
       interior minimum AND (y - x) changes sign there.  Reports x*.

  (A2) THE CEILING BINDS.  acetone06's acetone product sits BELOW that x*
       and above 0.95 -- capped by the azeotrope, not collapsed.

  (A3) THE MECHANISM IS A PINCH, NOT A SHORTAGE OF STAGES.  Over the top 40
       rectifying stages x_acetone moves by less than 0.05, while the column
       as a whole moves it by more than 0.9.  Without this arm A2 would also
       pass for a column that is merely too short, which is a different
       finding with a different remedy.

  (A4) THE SPEC STILL FAILS -- the arm that fires on PROGRESS.  If the product
       ever reaches Luyben's 0.999, this gate fails ON PURPOSE: either the
       activity model changed (and acetone04's finding must be re-measured and
       both CLAUDE.md files rewritten), or the case drifted off his design.

  (A5) THE ACETONE IS CONSERVED, recomputed INDEPENDENTLY of the engine's own
       balance report: feed acetone == D*x_D + B*x_B from the run's own stream
       table.  The point of §2 of acetone06's record is that the acetone the
       azeotrope keeps out of the distillate ends up in the WATER product, and
       that sentence is only worth writing if the arithmetic closes.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it:

  * It does NOT establish that the azeotrope is REAL.  Everything above rests
    on a predictive UNIFAC group table with no fitted acetone/water pair
    behind it, and Luyben -- running fitted UNIQUAC -- says there is no
    azeotrope at all.  This gate pins a MODEL's behaviour and the consequence
    that follows from it.  A4 is deliberately written so that the day a
    curated pair settles the question, the gate fails and forces the finding
    to be rewritten rather than quietly inherited.
  * It says nothing about the DUTIES.  acetone06's reboiler is 15 % under the
    paper and rides an isopropanol liquid Cp from a correlation known to be
    poor for alcohols; that is pinned by the case's golden as regression, and
    is not an agreement claim anywhere.
  * It does not check the 16 K bottoms-temperature gap, which acetone06
    records as UNATTRIBUTED with the one measurement that would attribute it.

SABOTAGE-VERIFIED 2026-08-13, three times, plus one attempt that did NOT
fire.  OBSERVED output is recorded below -- in one case it is not the output
that was expected, and that one is the most useful entry here.

Sabotage 1 -- acetone04's fine scan narrowed to x 0.92..0.96, so the azeotrope
falls outside the sampled window (the premise removed):

    check_azeotrope_ceiling: FAILED
      A1: no interior T_bubble minimum in the fine scan over x_acetone
      0.9200..0.9600 -- the azeotrope acetone04 reports is not in this
      output, so nothing downstream is being capped by a measured feature

Sabotage 2 -- acetone06's feed moved from stage 54 to stage 6, leaving the
column with almost no rectifying section (stage-starved instead of pinched):

    check_azeotrope_ceiling: FAILED
      A3: the top 40 rectifying stages move x_acetone by 0.2933 (> 0.05) --
      the rectifying section is no longer pinched against the azeotrope, so
      A2's ceiling reading no longer describes this column

Sabotage 3 -- reflux ratio 2.78 -> 0.25, a column that simply does not
separate:

    check_azeotrope_ceiling: FAILED
      A2: the acetone product is only x = 0.88406 -- far below the azeotrope
      at 0.9780, so whatever limits this column is no longer the ceiling this
      gate pins
      A3: the top 40 rectifying stages move x_acetone by 0.3150 (> 0.05) ...
      A3: the column as a whole moves x_acetone by only 0.6894 (< 0.9) ...

THE ATTEMPT THAT DID NOT FIRE, kept because it is a result rather than a gap.
Reflux ratio raised 2.78 -> 40 was tried first, as "throw reflux at it until
it meets spec".  The gate stayed GREEN, and correctly:

    the column tops out at 0.97781, below it [x* 0.9780], against Luyben's
    0.999 spec, and it is PINCHED there (the top 40 rectifying stages move
    x by 0.0034)

Fourteen times the reflux buys 0.0047 in purity and leaves the product 0.021
short of the spec -- it pushes the profile HARDER against the azeotrope
rather than through it, which is what a ceiling means and is exactly the claim
this gate pins.  A green line there is the gate working, not the gate blind;
what it cost was a docstring that had been drafted with the failure it
expected, and would have been false if the sabotage had not actually been run.

All restored; the gate passed again after each.
"""

import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VLE = os.path.join(ROOT, "tutorials", "props", "compare",
                   "acetone04_acetone_water_vle")
COL = os.path.join(ROOT, "tutorials", "steady", "distillation",
                   "acetone06_luyben_column_C1")
SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
PROPS = os.path.join(ROOT, "build", "linux64Gcc", "choupoProps")

ENV = dict(os.environ, CHOUPO_HOME=ROOT)

fails = []
notes = {}


def run(binary, cwd):
    p = subprocess.run([binary], cwd=cwd, env=ENV,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def result_json(text):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  text, re.S)
    return json.loads(m.group(1)) if m else None


# ---- A1: the premise -- the azeotrope is in acetone04's own output --------
x_star = None
rc, out = run(PROPS, VLE)
csv = os.path.join(VLE, "txy_top_fine.csv")
if rc != 0:
    fails.append(f"A1: acetone04 did not run (exit {rc})")
elif not os.path.exists(csv):
    fails.append("A1: acetone04 produced no txy_top_fine.csv -- the fine scan"
                 " over the top of the composition range is what resolves a"
                 " feature living at 1e-4, and it is gone")
else:
    xs, ts, dys = [], [], []
    with open(csv, encoding="utf-8") as fh:
        header = fh.readline().strip().split(",")
        ix, it, iy = (header.index("x[acetone]"), header.index("T_bubble"),
                      header.index("y_eq_acetone"))
        for line in fh:
            f = line.strip().split(",")
            if len(f) <= max(ix, it, iy):
                continue
            xs.append(float(f[ix]))
            ts.append(float(f[it]))
            dys.append(float(f[iy]) - float(f[ix]))

    #  An INTERIOR minimum: strictly inside the sampled window, so a scan that
    #  merely stops on a downslope cannot be read as finding one.
    jmin = min(range(len(ts)), key=lambda j: ts[j])
    interior = 0 < jmin < len(ts) - 1
    #  ... and (y - x) must change sign there, which is what makes it an
    #  azeotrope rather than a numerical dip in the bubble curve.
    signchange = any(dys[j] > 0.0 > dys[j + 1] for j in range(len(dys) - 1))

    if not interior:
        fails.append("A1: no interior T_bubble minimum in the fine scan over"
                     f" x_acetone {xs[0]:.4f}..{xs[-1]:.4f} -- the azeotrope"
                     " acetone04 reports is not in this output, so nothing"
                     " downstream is being capped by a measured feature")
    elif not signchange:
        fails.append("A1: T_bubble has an interior minimum but (y - x) never"
                     " changes sign -- a dip in the bubble curve is not an"
                     " azeotrope, and only the sign change makes it a ceiling")
    else:
        x_star = xs[jmin]
        notes["x_star"] = x_star
        #  Depth against the PURE-acetone end of the scan, which is what
        #  "below the pure boiling point" means.  Against max(ts) it would
        #  instead measure the scan's own left edge and read four times
        #  larger -- a number that would silently disagree with the 0.044 K
        #  acetone04 publishes for the same feature.
        notes["depth_K"] = ts[-1] - ts[jmin]

# ---- A2..A5: the column that the ceiling acts on --------------------------
rc, out = run(SOLVE, COL)
res = result_json(out)
if rc != 0 or res is None or not res.get("converged"):
    fails.append(f"A2: acetone06 did not run to a converged result (exit {rc})")
else:
    prod = res["streams"]["acetoneProduct"]
    bot = res["streams"]["B1"]
    feed = res["streams"]["F1"]
    xD = prod["composition"]["acetone"]
    notes["x_D"] = xD

    if x_star is not None:
        if not xD < x_star:
            fails.append(
                f"A2: the acetone product reaches x = {xD:.5f}, at or above"
                f" the azeotrope at x* = {x_star:.4f} -- the ceiling"
                " acetone04 measured is no longer capping this column."
                " Re-measure the VLE before believing the column")
        if not xD > 0.95:
            fails.append(
                f"A2: the acetone product is only x = {xD:.5f} -- far below"
                f" the azeotrope at {x_star:.4f}, so whatever limits this"
                " column is no longer the ceiling this gate pins")

    # A3: pinched, not stage-starved.
    prof = res["profiles"]["C1"]["columns"]["x_acetone"]
    if len(prof) < 45:
        fails.append(f"A3: the column has only {len(prof)} stages -- too few"
                     " to read a rectifying pinch off the profile")
    else:
        d_top = abs(prof[0] - prof[39])          # stages 1..40
        d_all = abs(prof[0] - prof[-1])
        notes["d_top40"] = d_top
        if not d_top < 0.05:
            fails.append(
                f"A3: the top 40 rectifying stages move x_acetone by"
                f" {d_top:.4f} (> 0.05) -- the rectifying section is no longer"
                " pinched against the azeotrope, so A2's ceiling reading no"
                " longer describes this column")
        if not d_all > 0.9:
            fails.append(
                f"A3: the column as a whole moves x_acetone by only"
                f" {d_all:.4f} (< 0.9) -- it is not performing the separation"
                " whose ceiling is under test")

    # A4: the arm that fires on progress.
    if xD >= 0.999:
        fails.append(
            f"A4: the acetone product now MEETS Luyben's 0.999 spec"
            f" (x = {xD:.5f}).  That is not a pass -- it means either the"
            " activity model changed (re-measure acetone04's azeotrope and"
            " rewrite both CLAUDE.md files, which state the opposite), or"
            " this case has drifted off his 66/54/2.78 design")

    # A5: the acetone the ceiling keeps out of the product is in the water,
    #     recomputed here rather than read off the engine's balance report.
    aIn = feed["F"] * feed["composition"]["acetone"]
    aOut = (prod["F"] * prod["composition"]["acetone"]
            + bot["F"] * bot["composition"]["acetone"])
    rel = abs(aOut - aIn) / aIn
    notes["acetone_closure"] = rel
    if not rel < 1e-9:
        fails.append(f"A5: acetone in != out by {rel:.3e} relative -- the"
                     " statement that the acetone lost from the product ends"
                     " up in the water product does not close")
    else:
        notes["lost_pct"] = 100.0 * bot["F"] * bot["composition"]["acetone"] / aIn

if fails:
    print("check_azeotrope_ceiling: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_azeotrope_ceiling: OK -- the prediction acetone04 wrote before"
      " acetone06 existed is pinned to its outcome."
      f"  UNIFAC's minimum-boiling azeotrope sits at x_acetone {notes['x_star']:.4f}"
      f" ({notes['depth_K']:.3f} K below the pure boiling point);"
      f" the column tops out at {notes['x_D']:.5f}, below it, against Luyben's"
      " 0.999 spec, and it is PINCHED there (the top 40 rectifying stages move"
      f" x by {notes['d_top40']:.4f}), so the cap is the azeotrope and not the"
      f" stage count.  {notes['lost_pct']:.2f} % of the feed acetone leaves in"
      " the WATER product, closing to"
      f" {notes['acetone_closure']:.1e} relative on an independent recount."
      "  NOT CHECKED: whether the azeotrope is real -- there is no fitted"
      " acetone/water pair in the corpus and the paper says it does not exist,"
      " so this pins a MODEL and its consequence; nor the duties, nor the 16 K"
      " bottoms-temperature gap the case records as unattributed.")
