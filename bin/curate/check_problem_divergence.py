#!/usr/bin/env python3
"""Problem-divergence gate (ruled by Vitor 2026-08-11; record
core/ProblemDivergence.H + thermo/ApproximationAuthorisation.H).

WHAT WAS WRONG.  An agent test reached a converged acetone process only by
downgrading the physics twice -- a rigorous column replaced by an FUG
shortcut, and a declared non-ideal liquid run as ideal because two binary
pairs had no parameters.  Both downgrades were declared, in comments the
agent chose to write.  Nothing in the result JSON, the KPIs or `converged/`
carried either, and the distillate still read 99.55 mol% acetone.

THE CONTRACT, inverted from what it was:

    an approximation the case AUTHORISED  ->  runs, and is RECORDED
    an approximation nobody authorised    ->  REFUSED

and a divergence travels on its OWN channel, above the KPIs, never mixed in
with the advisories -- a run emitting nine extrapolation warnings makes the
tenth line invisible, and the tenth is not a warning at all.

THE ARMS, each probed through a real binary.

  A1  THE REFUSAL FIRES, BY NAME, WITH THE WAY OUT.  A gammaPhi case
      declaring NRTL over three components with two uncurated pairs refuses,
      names BOTH pairs, says the word IDEAL, and offers four paths --
      including a paste-ready `approximations { idealBinaryPair { ... } }`
      block listing exactly the pairs it refused.  A refusal that does not
      carry its own remedy is a dead end, which is the defect this slice
      exists to remove.

  A2  THE AUTHORISATION IS READ AT THE TOP LEVEL AND ONLY THERE.  The same
      case with the block pasted at the top of `constant/thermoPhysPropDict`
      runs.  The same block placed inside `activityModel {}` does NOT
      silently work -- the grammar refuses the key.  One home.

  A3  AUTHORISING ONE PAIR DOES NOT AUTHORISE THE OTHER.  With only
      `ethanol-acetone` listed, the run still refuses, and names
      `water-acetone` alone.  A blanket effect from a delimited block would
      make the delimitation decorative.

  A4  ALL THREE PAIR MODELS ANSWER THE SAME WAY.  NRTL, UNIQUAC and Wilson
      reach the ideal default by the same route; each must refuse an
      unauthorised pair naming ITSELF.  Checked through the engine, not by
      reading the source: three transcriptions of one refusal would be the
      arity sin committed inside the machinery built to enforce it.

  A5  THE ENGINE'S THREE SURFACES CARRY IT.  (The GUI band is a fourth,
      rendered from the same JSON; it is covered by the GUI's own tests and
      not by this gate, which runs the binaries.)  On `shortcut01_benzene_toluene` (a
      DECLARED approximation -- the case asked for FUG, so nothing is
      refused) the divergence appears in (a) the human block, ABOVE the
      caveats block, (b) the result JSON under `problemDivergence`,
      positioned BEFORE `kpis`, and (c) `converged/problemDivergence` on
      disk.  The locus names the UNIT, not the type.

  A6  SILENCE IS A REAL ANSWER.  A case with nothing to declare prints the
      block saying so.  An absent block would let "the code did not run"
      read as "nothing diverged" -- the same rule the caveat surface
      follows, for the same reason.

  A8  THE UNEXAMINED BRANCH STAYS UNREACHED.  `ApproximationAuthorisation`
      is TRI-VALUED -- NotRead / Read-empty / Read-listed -- because refusing
      on ignorance would produce a refusal the author cannot escape.  The
      price is that NotRead silently downgrades a refusal into a recorded
      substitution, so the branch announces itself as an ENGINE DEFECT and
      this arm asserts no witness reaches it.  Sabotage S1 below is why the
      arm exists: forcing the branch on changed nothing any other arm could
      see.

  A7  THE CORPUS CASE THAT WAS CAUGHT STAYS CAUGHT.
      `crystalliser09_KHT_KCl_series` overrides its rectifier to NRTL and
      its two salts have no pairs; before today the only record of that was
      a comment in the flowsheetDict.  Its authorisation block must still be
      present and its five pairs must still surface as substitutions.  If
      someone deletes the block the case refuses; if someone deletes the
      RECORDING the case goes quiet again, and this arm catches the second.

WHAT THIS GATE DOES NOT CLAIM.  It does not check that an authorised
approximation is scientifically acceptable -- that is the author's
judgement and the reason the block demands a `reason`.  It does not
enumerate every approximation in Choupo: `shortcutColumn` and the three
pair-parameter activity models are wired, and any other downgrade is
UNCOVERED and silently so.  That is a real limit, stated here rather than
implied away by a green line.

SABOTAGE-VERIFIED (2026-08-11), four sabotages, OBSERVED output transcribed
-- not predicted, because the first one caught NOTHING and predicting it as a
pass would have shipped a false claim about coverage:

  S1  Drop the wasRead() gate so an UNREAD authorisation refuses anyway
      (`if (true)` in ApproximationAuthorisation.cpp):
        check_problem_divergence: OK

      IT CAUGHT NOTHING, and that is the most useful thing this gate has
      produced.  It means no probe -- and no corpus path -- ever reaches the
      NotRead state: the ONE parse sits at `buildV2Dispatch`, which every v2
      formulation passes through, so `wasRead()` is always true by the time
      an activity model is constructed.  The tri-valued state is therefore a
      construction-ORDER guard, not an observed need, and its silent branch
      was invisible.  Rather than write this sabotage up as a pass, the
      branch was made to ANNOUNCE itself as an engine defect and arm A8 was
      added to assert it stays unreached.  A guard nobody can see fire is
      indistinguishable from no guard.

  S2  Record the divergence but do not refuse (delete the throw):
        check_problem_divergence: FAIL
          - A1: the unauthorised case exited 0 -- the substitution ran
          - A3: authorising one pair let the other through
          - A4: NRTL / Wilson / UNIQUAC did not refuse an unauthorised
            ideal pair

  S3  Route the divergences into the advisory list instead of their own
      channel (`r.divergences.clear()` after the drain):
        check_problem_divergence: FAIL
          - A5: no human divergence block on a shortcut column
          - A5: result JSON problemDivergence is empty on a shortcut column
          - A5: converged/problemDivergence lists 0 entries, expected 1
          - A7: crystalliser09 records 0 of 5 substitutions

  S4  Bypass the ONE parse (`clear()` where `readFrom(v2)` sits in
      ThermoPackageBuilder.cpp) -- the defect A8 was written for:
        check_problem_divergence: FAIL
          - A1: the unauthorised case exited 0 -- the substitution ran
          - A3: authorising one pair let the other through
          - A4: NRTL did not refuse an unauthorised ideal pair
          - A4: Wilson did not refuse an unauthorised ideal pair
          - A4: UNIQUAC did not refuse an unauthorised ideal pair
          - A8: crystalliser09's per-unit thermo world bypassed the ONE parse
            -- its substitutions are recorded UNEXAMINED
      A8 is the only arm that names the CAUSE.  The other five say the
      contract stopped working; A8 says why.

Exit 1 listing failures."""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
SOLVE = BUILD / "choupoSolve"
PROPS = BUILD / "choupoProps"
SHORTCUT = ROOT / "tutorials" / "steady" / "distillation" / "shortcut01_benzene_toluene"
CRYST = ROOT / "tutorials" / "steady" / "crystallisation" / "crystalliser09_KHT_KCl_series"

failures = []


#  A minimal three-component props case: the smallest thing that reaches an
#  activity model with an uncurated pair.  Built here rather than borrowed
#  from the corpus so the arms do not depend on a tutorial's data staying
#  the way it is today.
SYSTEM = """recordType    thermophysicalPropertySystem;
schemaVersion 2;

components       ( %(comps)s );
%(approx)s
equilibrium
{
    formulation gammaPhi;
    liquid
    {
        activityModel
        {
            model %(model)s;
        }
        standardState pureLiquid;
    }
    vapour
    {
        fugacityModel idealGas;
    }
}
"""

CONTROL = """recordType controlDict;
application choupoProps;
description "problem-divergence gate probe";
verbosity   3;
"""

PROPSDICT = """operations
(
    {
        name       p;
        type       propertyPoint;
        state      { T 350 K; P 1 bar; composition { %(x)s } }
        properties ( molarVolume );
    }
);
"""
TERNARY = "ethanol 0.4; water 0.4; acetone 0.2;"
BINARY = "ethanol 0.5; water 0.5;"

#  PER-MODEL COMPONENT SETS.  A model can only reach the ideal-pair default
#  after every EARLIER refusal is satisfied, and UNIQUAC has one: a component
#  with no `uniquac { r; q; }` record refuses first, and acetone has none.  So
#  UNIQUAC is probed on ethanol/water -- both carry r/q, and the standards tree
#  ships no UNIQUAC pair for them.  Choosing the set to clear an unrelated
#  refusal is legitimate; INVENTING the r/q in the case to force it through
#  would be putting data in a gate.
MODEL_PROBE = {
    "NRTL":    ("ethanol  water  acetone", {"ethanol-acetone", "water-acetone"}),
    "Wilson":  ("ethanol  water  acetone", None),
    "UNIQUAC": ("ethanol  water",          None),
}
#  A `None` above means: do not predict WHICH pairs are missing.  Which pairs a
#  model happens to lack is a fact about today's catalogue -- Wilson lacks
#  ethanol-water where NRTL has it -- and a gate that hard-codes it fails the
#  day someone curates a pair, which is the opposite of what it should reward.
#  What is invariant is that the offered block lists EXACTLY the pairs the
#  refusal named, and that check is taken on every model.


def refused_and_offered(out: str):
    """(the pairs the refusal named, the pairs its remedy offers)."""
    m = re.search(r"would therefore run as IDEAL: ([^.\n]*)", out)
    refused = set(p.strip() for p in m.group(1).split(",")) if m else set()
    o = re.search(r"idealBinaryPair \{ pairs \( ([^)]*)\)", out)
    offered = set(o.group(1).split()) if o else set()
    return refused, offered

AUTH_BOTH = """
approximations
{
    idealBinaryPair
    {
        pairs  ( ethanol-acetone water-acetone );
        reason "gate probe";
    }
}
"""

AUTH_ONE = """
approximations
{
    idealBinaryPair
    {
        pairs  ( ethanol-acetone );
        reason "gate probe -- deliberately partial";
    }
}
"""


def probe_case(tmp: Path, tag: str, model: str, approx: str,
               approx_inside: bool = False, comps: str = None,
               x: str = None) -> Path:
    d = tmp / tag
    (d / "system").mkdir(parents=True)
    (d / "constant").mkdir(parents=True)
    if approx_inside:
        #  The same block, filed where it does NOT belong: inside the
        #  activityModel sub-dict.  A2's negative.
        body = SYSTEM % {"approx": "", "model": model,
                         "comps": comps or "ethanol  water  acetone"}
        body = body.replace("            model %s;\n" % model,
                            "            model %s;\n%s" % (model, approx))
    else:
        body = SYSTEM % {"approx": approx, "model": model,
                         "comps": comps or "ethanol  water  acetone"}
    (d / "constant" / "thermoPhysPropDict").write_text(body)
    (d / "system" / "controlDict").write_text(CONTROL)
    (d / "system" / "propsDict").write_text(PROPSDICT % {"x": x or TERNARY})
    return d


def run(binary: Path, case: Path):
    p = subprocess.run([str(binary), "."], cwd=str(case), capture_output=True,
                       text=True, timeout=1200)
    return p.returncode, p.stdout + p.stderr


def result_json(out: str) -> dict:
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


with tempfile.TemporaryDirectory() as td:
    tmp = Path(td)

    # ---- A1: the refusal fires, names the pairs, carries the remedy -------
    rc, out = run(PROPS, probe_case(tmp, "a1", "NRTL", ""))
    if rc == 0:
        failures.append("A1: the unauthorised case exited 0 -- the"
                        " substitution ran")
    else:
        for want in ("ethanol-acetone", "water-acetone", "IDEAL",
                     "approximations { idealBinaryPair { pairs ("):
            if want not in out:
                failures.append("A1: the refusal does not carry %r" % want)
        #  The paste-ready block must list exactly the refused pairs.
        refused, offered = refused_and_offered(out)
        if refused != {"ethanol-acetone", "water-acetone"}:
            failures.append("A1: the refusal named %s, expected the two"
                            " uncurated acetone pairs" % sorted(refused))
        if refused != offered:
            failures.append("A1: the offered block lists %s, not the pairs it"
                            " refused (%s)" % (sorted(offered), sorted(refused)))

    # ---- A2: read at the top level, and only there ------------------------
    rc, out = run(PROPS, probe_case(tmp, "a2ok", "NRTL", AUTH_BOTH))
    if "would therefore run as IDEAL" in out:
        failures.append("A2: a top-level authorisation did not authorise")
    rc, out = run(PROPS, probe_case(tmp, "a2bad", "NRTL", AUTH_BOTH,
                                    approx_inside=True))
    if rc == 0 or "approximations" not in out:
        failures.append("A2: an `approximations` block INSIDE activityModel"
                        " was accepted -- the authorisation has two homes")

    # ---- A3: a delimited block delimits -----------------------------------
    rc, out = run(PROPS, probe_case(tmp, "a3", "NRTL", AUTH_ONE))
    if rc == 0:
        failures.append("A3: authorising one pair let the other through")
    elif "water-acetone" not in out or "ethanol-acetone" in out.split(
            "would therefore run as IDEAL:")[-1].split("\n")[0]:
        failures.append("A3: the partial refusal does not name water-acetone"
                        " alone")

    # ---- A4: all three pair models answer the same way --------------------
    for model, (comps, want_pairs) in MODEL_PROBE.items():
        x = BINARY if "acetone" not in comps else TERNARY
        rc, out = run(PROPS, probe_case(tmp, "a4" + model, model, "",
                                        comps=comps, x=x))
        if rc == 0:
            failures.append("A4: %s did not refuse an unauthorised ideal"
                            " pair" % model)
        elif ("%s: the case declares %s" % (model, model)) not in out:
            failures.append("A4: %s's refusal does not name itself -- it said"
                            " %r" % (model, out.strip().splitlines()[-1][:140]))
        else:
            refused, offered = refused_and_offered(out)
            if not refused:
                failures.append("A4: %s refused without naming a pair" % model)
            elif refused != offered:
                failures.append("A4: %s refused %s but its remedy offers %s"
                                % (model, sorted(refused), sorted(offered)))
            elif want_pairs and not want_pairs <= refused:
                failures.append("A4: %s did not refuse the known-uncurated"
                                " pair(s) %s" % (model, sorted(want_pairs)))

    # ---- A6: silence is a real answer -------------------------------------
    #  Two curated components only: nothing defaults to ideal, nothing is
    #  approximated, and the block must still speak.
    d = tmp / "a6"
    (d / "system").mkdir(parents=True)
    (d / "constant").mkdir(parents=True)
    (d / "constant" / "thermoPhysPropDict").write_text(
        SYSTEM % {"approx": "", "model": "NRTL", "comps": "ethanol  water"})
    (d / "system" / "controlDict").write_text(CONTROL)
    (d / "system" / "propsDict").write_text(PROPSDICT % {"x": BINARY})
    rc, out = run(PROPS, d)
    if "PROBLEM SOLVED == PROBLEM POSED" not in out:
        failures.append("A6: a run with nothing to declare said nothing --"
                        " its silence is then indistinguishable from the"
                        " block not running")

    # ---- A5: the engine's three surfaces -------------------------------------------
    d = tmp / "a5"
    shutil.copytree(SHORTCUT, d, ignore=shutil.ignore_patterns(
        "converged", "reports", "log.*"))
    rc, out = run(SOLVE, d)
    if rc != 0:
        failures.append("A5: shortcut01 exited %d" % rc)
    else:
        # (a) the human block, above the caveats
        i_div = out.find("THE PROBLEM SOLVED IS NOT THE PROBLEM POSED")
        i_cav = out.find("ASSUMPTIONS AND CAVEATS")
        if i_div < 0:
            failures.append("A5: no human divergence block on a shortcut"
                            " column")
        elif i_cav >= 0 and i_div > i_cav:
            failures.append("A5: the divergence block prints BELOW the"
                            " caveats -- a reader meets the qualifications"
                            " before learning which problem was solved")
        # (b) the result JSON, above the kpis
        js = result_json(out)
        dv = js.get("problemDivergence")
        if not dv:
            failures.append("A5: result JSON problemDivergence is empty on a"
                            " shortcut column")
        else:
            e = dv[0]
            if e.get("kind") != "declaredApproximation":
                failures.append("A5: the shortcut column is recorded as %r,"
                                " not a declaredApproximation"
                                % e.get("kind"))
            if e.get("locus") != "unit column":
                failures.append("A5: the locus is %r -- it must name the"
                                " UNIT, not the type" % e.get("locus"))
            if "Fenske" not in e.get("solved", ""):
                failures.append("A5: the record does not say what actually"
                                " ran")
        raw = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                        out, re.S)
        if raw:
            body = raw.group(1)
            if body.find('"problemDivergence"') > body.find('"kpis"'):
                failures.append("A5: problemDivergence sits BELOW kpis in the"
                                " JSON -- a consumer reads the numbers first")
        # (c) converged/
        f = d / "converged" / "problemDivergence"
        if not f.exists():
            failures.append("A5: converged/problemDivergence was not written")
        else:
            txt = f.read_text()
            n = txt.count("kind ")
            if n != 1:
                failures.append("A5: converged/problemDivergence lists %d"
                                " entries, expected 1" % n)
            if "declaredApproximation" not in txt:
                failures.append("A5: converged/problemDivergence does not"
                                " carry the kind")

    # ---- A8: the unexamined branch stays unreached -------------------------
    for tag, case in (("shortcut01", tmp / "a5"),):
        rc2, out2 = run(SOLVE, case) if not (case / "log.choupoSolve").exists() \
            else (0, out)
        if "[divergence]" in out2 and "NEVER READ" in out2:
            failures.append("A8: %s reached the UNEXAMINED branch -- a"
                            " construction path bypassed the ONE parse, so"
                            " the authorisation contract was not enforced"
                            " there" % tag)

    # ---- A7: the corpus case that was caught stays caught ------------------
    sysfile = (CRYST / "constant" / "thermoPhysPropDict").read_text()
    if "idealBinaryPair" not in sysfile:
        failures.append("A7: crystalliser09 no longer carries its"
                        " authorisation -- the case refuses without it")
    d = tmp / "a7"
    shutil.copytree(CRYST, d, ignore=shutil.ignore_patterns(
        "converged", "reports", "log.*"))
    rc, out = run(SOLVE, d)
    if rc != 0:
        failures.append("A7: crystalliser09 exited %d" % rc)
    else:
        js = result_json(out)
        subs = [e for e in js.get("problemDivergence", [])
                if e.get("kind") == "substitution"]
        if len(subs) != 5:
            failures.append("A7: crystalliser09 records %d of 5"
                            " substitutions" % len(subs))
        if subs and not subs[0].get("reason"):
            failures.append("A7: a recorded substitution carries no reason --"
                            " the authorisation's own justification is what"
                            " makes it reviewable")
        #  A8 on the per-unit path, which is the one that could plausibly
        #  bypass the parse: crystalliser09's NRTL world is built by
        #  `thermoFor`, and its substitutions must carry the CASE's reason,
        #  never the unexamined fallback.
        if any("UNEXAMINED" in (e.get("reason") or "") for e in subs):
            failures.append("A8: crystalliser09's per-unit thermo world"
                            " bypassed the ONE parse -- its substitutions are"
                            " recorded UNEXAMINED")

if failures:
    print("check_problem_divergence: FAIL")
    for f in failures:
        print("  - " + f)
    sys.exit(1)

print("check_problem_divergence: OK -- an unauthorised ideal-pair"
      " substitution refuses by name with a paste-ready remedy on all three"
      " pair models; the authorisation is read at the top level ONLY and"
      " delimits to the pairs it lists; a declared approximation reaches the"
      " human block (above the caveats), the result JSON (above the kpis) and"
      " converged/, naming the unit; silence is printed rather than implied."
      "  NOT CHECKED: whether any authorised approximation is scientifically"
      " acceptable (the author's judgement, which is why `reason` is"
      " demanded), and any downgrade outside shortcutColumn + the three"
      " pair-parameter activity models -- those are UNCOVERED.  The NotRead"
      " branch of the authorisation is asserted UNREACHED rather than"
      " exercised: no path in this corpus produces it, which is why it"
      " announces itself as an engine defect if it ever does.")
