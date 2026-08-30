#!/usr/bin/env python3
"""Gate: a declared solid catalyst with no pellet model ANNOUNCES eta = 1.

    bin/curate/check_pellet_announcement.py

WHY THIS EXISTS.  `catalystLoading` is a unit conversion and never claimed
otherwise: a heterogeneous rate constant is reported per gram of dry catalyst
and the bed turns it into a volumetric rate.  Four reactors read it -- cstr,
pfr, batchReactor, dynamicCSTR -- and all four then evaluate the rate at BULK
conditions.  That is a modelling assumption with a name, the effectiveness
factor taken as eta = 1, and until 2026-08-18 nothing in the engine, the
dictionaries or the output said so.  A student ran a packed bed and got an
answer carrying an approximation nobody had mentioned.

The magnitude is why it is not decoration.  eta MULTIPLIES the rate; the
first-order sphere gives eta = 0.1867 at phi = 5, so a bed sized on eta = 1
can be undersized by more than a factor of five, silently, at exit 0.  The
engine cannot decide whether that is the reader's case -- a Weisz-Prater
check needs the pellet dimension and an effective diffusivity, and no case
declares either -- so it announces and JUDGES NOTHING.  Same posture as the
extrapolated sub-273 K Antoine and the sub-band Davies.

WHAT THIS GATE CHECKS.

  (a) THE ANNOUNCEMENT FIRES, on both a steady and a time-dependent case
      that declare `catalystLoading`.  Two binaries, because the four
      readers sit in three different folders and one probe is a claim about
      reach that one probe cannot test.

  (b) IT REACHES THE READER TWICE -- at its site as a `[pellet]` log line
      AND in the end-of-run ASSUMPTIONS AND CAVEATS block.  The block is the
      point: a warning a thousand lines above the answer has been delivered
      and not received, which is why `core/AdvisorySummary.H` exists.

  (c) THE NUMBER IS RECOMPUTED HERE, not compared with a remembered one.
      This gate evaluates eta = (1/phi)[1/tanh(3 phi) - 1/(3 phi)] at phi = 5
      in Python and requires the engine's printed value to match it.  A
      constant transcribed into a message and then checked against itself
      would be a second home for the arithmetic, which is the defect this
      project keeps paying for.

  (d) THE REMEDY IS NAMED.  An announcement that states a limitation without
      saying what would lift it teaches the reader only to feel uneasy.

  (e) THE NEGATIVE: a reactor with NO `catalystLoading` says nothing.  An
      absence must go on meaning what it meant -- the homogeneous case
      claims no pellet, so it has none to leave unresolved.  Without this
      arm the gate would pass just as happily if the announcement fired on
      every reactor in the corpus.

  (f) ONE HOME.  The sentence exists in exactly one source file.  This is
      the arity doctrine applied to the thing that made the announcement
      worth writing: the reason eta = 1 was silent for so long is that
      `catalystLoading` had four readers and no owner.

WHAT THIS GATE DOES **NOT** COVER, stated so its green line cannot imply it.
It does not check that eta = 1 is a GOOD assumption anywhere, because the
engine cannot compute eta and neither can this script.  It does not exercise
`pfr` or `batchReactor`'s LHHW branch directly -- no corpus case declares
`catalystLoading` on a pfr, and (a) covers the batch vessel through
batch07 -- so reach across all four readers rests on the single-home check
(f) plus the compiler, not on four observed runs.  And it says nothing about
whether the four call sites are placed where the loading is actually USED;
they are placed where it is READ.

SABOTAGE-VERIFIED 2026-08-18, four times; OBSERVED output recorded below,
verbatim -- not the output that was predicted, which was wrong twice and is
the reason there are four sabotages instead of three.

Sabotage 1 -- the announcement suppressed (`if (true) return;` at the top of
announceUnresolvedPellet):

    check_pellet_announcement: FAILED
      cstr07_lhhw_methylAcetate (choupoSolve): declares catalystLoading but the run never announced the unresolved pellet -- no `[pellet]` line
      batch07_lhhw_methylAcetate (choupoBatch): declares catalystLoading but the run never announced the unresolved pellet -- no `[pellet]` line

    TWO lines, where FOUR were predicted.  The check `continue`s after a
    missing `[pellet]` line, so arm (b) -- the caveat block -- never runs
    under this sabotage and was left UNPROVEN by it.  Hence sabotage 4.

Sabotage 2 -- the guard inverted (`if (catalystLoading > 0.0) return;`), so
every reactor announces a pellet nobody declared:

    check_pellet_announcement: FAILED
      cstr07_lhhw_methylAcetate (choupoSolve): declares catalystLoading but the run never announced the unresolved pellet -- no `[pellet]` line
      batch07_lhhw_methylAcetate (choupoBatch): declares catalystLoading but the run never announced the unresolved pellet -- no `[pellet]` line
      cstr03_series_selectivity declares NO catalystLoading, yet the run announced an unresolved pellet -- an absence stopped meaning what it meant

    THE THIRD LINE IS NOT THERE BY LUCK.  On the first run of this sabotage
    it was absent: the negative was cstr01_first_order, a SINGLE-reaction
    case, and `catalystLoading` is read inside CSTR::solveMultiReaction --
    so cstr01 returns before the call site and its silence was a property of
    the control flow, not of the guard.  A negative that cannot fire pins
    nothing.  The negative moved to cstr03, which takes the same path
    cstr07 takes; see the comment on NEGATIVE below.

Sabotage 3 -- the printed eta changed from 0.1867 to 0.19 (a plausible
rounding of the right answer):

    check_pellet_announcement: FAILED
      the announced eta is 0.19, but eta(phi = 5) recomputed here is 0.186667 -- the number in the message is not the number the formula gives
      the announced eta is 0.19, but eta(phi = 5) recomputed here is 0.186667 -- the number in the message is not the number the formula gives

    Twice, once per positive case: each carries the claim, so each reports it.

Sabotage 4 -- the log line kept but the advisory dropped (`const bool isNew
= true;` in place of the AdvisoryLog::add call), i.e. announced at its site
and nowhere the reader will meet it:

    check_pellet_announcement: FAILED
      cstr07_lhhw_methylAcetate (choupoSolve): the announcement did not reach the end-of-run ASSUMPTIONS AND CAVEATS block
      batch07_lhhw_methylAcetate (choupoBatch): the announcement did not reach the end-of-run ASSUMPTIONS AND CAVEATS block

    This is the sabotage that matters most, because "announced" without the
    replay is exactly the slightly-louder-form-of-silence the summary block
    was built to end -- and sabotage 1 could not reach it.
"""

import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
SRC = ROOT / "src"

#  (label, tutorial, binary) -- cases that DECLARE catalystLoading.
POSITIVES = [
    ("cstr07_lhhw_methylAcetate",
     "tutorials/steady/reactors/cstr07_lhhw_methylAcetate", "choupoSolve"),
    ("batch07_lhhw_methylAcetate",
     "tutorials/batch/reactor/batch07_lhhw_methylAcetate", "choupoBatch"),
]

#  A reactor that declares NO catalystLoading.  It must stay silent.
#
#  IT MUST ALSO REACH THE CODE, and the first draft of this gate did not.
#  `catalystLoading` is read inside CSTR::solveMultiReaction -- the SINGLE
#  -reaction path (`reaction <name>;`) never reads it and returns long before
#  the call site.  cstr01_first_order is a single-reaction case, so its
#  silence was guaranteed by its control flow rather than by the guard, and
#  sabotage 2 (guard inverted, so every reactor should have announced) came
#  back reporting only the positives.  A negative that cannot fire pins
#  nothing -- the `check_true_ions` shape, caught here by the protocol rather
#  than a year later.  cstr03 declares `reactions ( ... );`, so it takes the
#  same path cstr07 takes and its silence is the guard's doing.
NEGATIVE = ("cstr03_series_selectivity",
            "tutorials/steady/reactors/cstr03_series_selectivity", "choupoSolve")

#  The announcement must SAY these, not merely appear.
MUST_SAY = [
    "eta = 1",                 # the assumption, by name
    "Weisz-Prater",            # what would decide whether it matters
    "diffusivity",             # ... and what that check needs
    "undersized",              # the direction of the error, not just its size
]

#  The signature phrase, for the single-home check.
SENTENCE = "NO pellet is resolved"

PHI = 5.0


def eta_sphere(phi: float) -> float:
    """First-order sphere effectiveness factor, phi = (R/3) sqrt(k/D_eff)."""
    return (1.0 / phi) * (1.0 / math.tanh(3.0 * phi) - 1.0 / (3.0 * phi))


def run(binary: str, case: str):
    p = subprocess.run([str(BUILD / binary), str(ROOT / case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    failures = []

    for label, case, binary in POSITIVES:
        decl = (ROOT / case / "system" / "flowsheetDict").read_text()
        if "catalystLoading" not in decl:
            failures.append(f"{label}: the probe is STALE -- this case no "
                            "longer declares catalystLoading, so it cannot "
                            "witness the announcement")
            continue

        rc, out = run(binary, case)
        if rc != 0:
            failures.append(f"{label} ({binary}): the case did not run "
                            f"(exit {rc})")
            continue

        if "[pellet]" not in out:
            failures.append(f"{label} ({binary}): declares catalystLoading but "
                            "the run never announced the unresolved pellet -- "
                            "no `[pellet]` line")
            continue

        #  (b) it must ALSO survive into the end-of-run block.  Split on the
        #  banner and look only AFTER it, so finding the site line again
        #  cannot be mistaken for the summary having replayed it.
        head, sep, tail = out.partition("ASSUMPTIONS AND CAVEATS")
        if not sep or "pellet is resolved" not in tail:
            failures.append(f"{label} ({binary}): the announcement did not "
                            "reach the end-of-run ASSUMPTIONS AND CAVEATS "
                            "block")

        line = next(l for l in out.splitlines() if "[pellet]" in l)
        for phrase in MUST_SAY:
            if phrase not in line:
                failures.append(f"{label}: the announcement never says "
                                f"'{phrase}'")

        #  (c) recompute, do not compare with a remembered constant.
        m = re.search(r"is\s+([0-9.]+)\s+at phi = 5", line)
        if not m:
            failures.append(f"{label}: the announcement quotes no eta at "
                            "phi = 5 -- the magnitude is what makes it bite")
        else:
            printed = float(m.group(1))
            exact = eta_sphere(PHI)
            if abs(printed - exact) > 5e-5:
                failures.append(
                    f"the announced eta is {m.group(1)}, but eta(phi = 5) "
                    f"recomputed here is {exact:.6f} -- the number in the "
                    "message is not the number the formula gives")

    #  (e) THE NEGATIVE.
    label, case, binary = NEGATIVE
    decl = (ROOT / case / "system" / "flowsheetDict").read_text()
    if "catalystLoading" in decl:
        failures.append(f"{label}: the negative is STALE -- this case now "
                        "declares catalystLoading, so its silence proves "
                        "nothing")
    else:
        rc, out = run(binary, case)
        if rc != 0:
            failures.append(f"{label}: the negative did not run (exit {rc})")
        elif "[pellet]" in out or "pellet is resolved" in out:
            failures.append(f"{label} declares NO catalystLoading, yet the run "
                            "announced an unresolved pellet -- an absence "
                            "stopped meaning what it meant")

    #  (f) ONE HOME for the sentence.
    homes = sorted(p.relative_to(ROOT).as_posix()
                   for p in SRC.rglob("*")
                   if p.suffix in (".H", ".cpp") and SENTENCE in
                   p.read_text(errors="ignore"))
    if len(homes) != 1:
        failures.append("the announcement has "
                        f"{len(homes)} home(s) in src/, expected exactly 1: "
                        + ", ".join(homes))

    #  ---- (g) THE SINGLE-REACTION PATH USES THE LOADING (added 2026-08-30).
    #  Until that day `catalystLoading` was read only inside the
    #  solveMultiReaction paths: a single-reaction case declaring it ran with
    #  the per-gram rate as if it were volumetric -- wrong by 1000*rho_cat, at
    #  exit 0 -- and this gate's own NOT-COVERED line recorded the unreached
    #  path.  The probe is built here (no corpus case declares the key on the
    #  single grammar) and the CONVERSION is recomputed independently: for the
    #  first-order law, X_cstr = fDa/(1+fDa) and X_pfr = 1-exp(-fDa) with
    #  f = 1000*catLoad and Da taken from the UNLOADED case's own published
    #  Da_kTau.  An announcement alone would not pin this: the announce sits
    #  at the READ site, so a loading read-but-never-multiplied (the shipped
    #  defect) would announce and still be wrong -- the arithmetic is the arm.
    import json as _json
    import shutil as _sh
    import tempfile as _tf

    def _result(out: str):
        m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)<<<Choupo:result-end>>>",
                      out, re.S)
        return _json.loads(m.group(1)) if m else None

    def _kpi(js, unit, key):
        for u in js.get("units", []):
            if u.get("name") == unit and key in u.get("kpis", {}):
                return u["kpis"][key]
        # fall back: search any kpis dict carrying the key
        text = _json.dumps(js)
        m = re.search(r'"%s":\s*([-0-9.eE+]+)' % key, text)
        return float(m.group(1)) if m else None

    #  DELIBERATELY SMALL: the first run of this arm used CAT = 2 kg/m^3 and
    #  the PFR probe came back with X = 11.09 -- the coarse RK4 crossing a
    #  suddenly-stiff transient in one step, a PRE-EXISTING silent defect the
    #  probe exposed on first contact (the same case at nSteps 100000 gives
    #  X = 1).  The engine now REFUSES that run (arm (i) below); this arm
    #  keeps its probe in the resolvable regime so it measures the loading
    #  arithmetic and not the integrator.
    CAT = 0.005                        # kg/m^3, the probe's declared loading
    f = 1000.0 * CAT
    SINGLES = [
        ("cstr01 single+loading",
         "tutorials/steady/reactors/cstr01_first_order",
         lambda Da: f * Da / (1.0 + f * Da)),
        ("pfr01 single+loading",
         "tutorials/steady/reactors/pfr01_first_order",
         lambda Da: 1.0 - math.exp(-f * Da)),
    ]
    with _tf.TemporaryDirectory(prefix="pelletSingle.") as td:
        for label, case, xOf in SINGLES:
            rc0, out0 = run("choupoSolve", case)
            js0 = _result(out0) if rc0 == 0 else None
            Da = _kpi(js0, "reactor", "Da_kTau") if js0 else None
            if Da is None:
                failures.append(f"{label}: the unloaded case publishes no "
                                "Da_kTau to anchor the recompute")
                continue
            probe = Path(td) / Path(case).name
            _sh.copytree(ROOT / case, probe)
            fs = probe / "system" / "flowsheetDict"
            t = fs.read_text()
            t2 = re.sub(r"operation\s*\{", "operation   { catalystLoading %g;"
                        % CAT, t, count=1)
            if t2 == t:
                failures.append(f"{label}: could not inject catalystLoading "
                                "into the probe's operation block")
                continue
            fs.write_text(t2)
            p = subprocess.run([str(BUILD / "choupoSolve"), str(probe)],
                               capture_output=True, text=True, timeout=600)
            out = p.stdout + p.stderr
            if p.returncode != 0:
                failures.append(f"{label}: the probe did not run "
                                f"(exit {p.returncode})")
                continue
            if "[pellet]" not in out:
                failures.append(f"{label}: the single-reaction path read the "
                                "loading but never announced the pellet")
            js = _result(out)
            X = _kpi(js, "reactor", "X_limiting") if js else None
            want = xOf(float(Da))
            if X is None or abs(float(X) - want) > 1e-4:
                failures.append(
                    f"{label}: X_limiting = {X}, but f*Da recomputed here "
                    f"gives {want:.6f} (Da = {Da}, f = {f:g}) -- the loading "
                    "is read and NOT multiplied into the rate, which is the "
                    "shipped 2026-08-30 defect")

        #  ---- (i) A STIFF TRANSIENT IS COMMITTED TO THE BOUNDARY, NOT
        #  OVERSHOT.  The same pfr01 probe at CAT = 2 (f*Da = 2218 against
        #  100 axial steps) used to publish X = 11.09 at exit 0 -- the RK4
        #  crossing the whole transient in one coarse step and leaving the
        #  limiting reactant at -10x its feed.  The single path now carries
        #  the multi path's fraction-to-boundary commit (#106), so the same
        #  run must return the RESOLVED answer: complete conversion, X = 1
        #  to O(dV).  (A materially negative outlet flow still refuses as
        #  the backstop; this arm proves the mechanism makes the backstop
        #  unreachable on the route that found the hole.)
        stiff = Path(td) / "pfr_stiff"
        _sh.copytree(ROOT / "tutorials/steady/reactors/pfr01_first_order",
                     stiff)
        fs = stiff / "system" / "flowsheetDict"
        fs.write_text(re.sub(r"operation\s*\{",
                             "operation   { catalystLoading 2;",
                             fs.read_text(), count=1))
        p = subprocess.run([str(BUILD / "choupoSolve"), str(stiff)],
                           capture_output=True, text=True, timeout=600)
        out = p.stdout + p.stderr
        if p.returncode != 0:
            failures.append("pfr stiff probe: refused or crashed (exit "
                            f"{p.returncode}) -- the fraction-to-boundary "
                            "commit should resolve this run to X = 1")
        else:
            js = _result(out)
            X = _kpi(js, "reactor", "X_limiting") if js else None
            if X is None or not (0.999 <= float(X) <= 1.0 + 1e-9):
                failures.append(f"pfr stiff probe: X_limiting = {X} -- "
                                "neither the old overshoot (>1) is allowed "
                                "back nor an unconverted answer; the "
                                "boundary commit must land it at 1")

        #  ---- (h) THE MONOTONE REFUSALS.  The single-reaction extent Newton
        #  claims a monotone g(xi); an autocatalytic order (on a product) or
        #  a negative order voids the claim, and the bracket tightening could
        #  then expel the true root silently.  Both shapes must REFUSE naming
        #  the law and the `reactions ( ... )` remedy.
        for tag, patch, expect in [
            ("autocatalytic",
             ("{ component ethylAcetate;  nu  1;  order 0; }",
              "{ component ethylAcetate;  nu  1;  order 1; }"), "PRODUCT"),
            ("negative-order",
             ("{ component ethanol;       nu -1;  order 1; }",
              "{ component ethanol;       nu -1;  order -0.5; }"), "NEGATIVE"),
        ]:
            probe = Path(td) / ("mono_" + tag)
            _sh.copytree(ROOT / "tutorials/steady/reactors/cstr01_first_order",
                         probe)
            rf = probe / "constant" / "reactions"
            t = rf.read_text()
            if patch[0] not in t:
                failures.append(f"monotone probe ({tag}) is STALE -- "
                                "cstr01's reactions file changed shape")
                continue
            rf.write_text(t.replace(patch[0], patch[1]))
            p = subprocess.run([str(BUILD / "choupoSolve"), str(probe)],
                               capture_output=True, text=True, timeout=600)
            out = p.stdout + p.stderr
            if p.returncode == 0:
                failures.append(f"monotone probe ({tag}): ran to exit 0 -- a "
                                "law the extent Newton cannot guarantee a "
                                "single root for must refuse, not solve")
            elif expect not in out or "reactions (" not in out:
                failures.append(f"monotone probe ({tag}): the refusal no "
                                f"longer names {expect} and the "
                                "`reactions ( ... )` remedy")

    if failures:
        print("check_pellet_announcement: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print("check_pellet_announcement: OK -- a declared catalystLoading with no "
          "pellet model announces eta = 1 at its site AND in the end-of-run "
          f"caveat block, in {len(POSITIVES)} case(s) across 2 binaries; the "
          f"quoted eta(phi = 5) reproduces {eta_sphere(PHI):.6f} recomputed "
          "here; the remedy is named; a reactor with no catalystLoading stays "
          "silent; and the sentence has one home in src/.  Since 2026-08-30 "
          "the SINGLE-reaction grammar is covered too: built probes on cstr01 "
          "and pfr01 verify the loading is READ AND MULTIPLIED (X recomputed "
          "here from the unloaded case's own Da), and the two monotone "
          "refusals (product order, negative order) fire naming the "
          "`reactions ( ... )` remedy.  NOT covered: whether eta = 1 is a "
          "good assumption anywhere (the engine cannot compute eta and "
          "neither can this script), and the batch LHHW branch, which rests "
          "on the single-home check and the compiler rather than an observed "
          "run.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
