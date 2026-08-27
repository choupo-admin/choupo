#!/usr/bin/env python3
"""One home for "did `bin/runTests` actually compare this case?"

    from runtests_verdict import verdict

WHY THIS EXISTS.  A gate that ends an arm with

    if "PASS 1 / FAIL 0" not in r.stdout:
        fails.append("<case> no longer reproduces its golden")

reports a MOVED ANSWER whenever the harness produced no verdict -- and there
are several ways for that to happen that have nothing to do with the answer:

  * a destructive session's journal is open, so `bin/runTests` refuses at the
    top (the shape `check_friction_correlations` found in its own sabotage
    run: three of four sabotages "moved pipe01's golden" while touching
    nothing the pipe computes);
  * `check_build_fresh` aborts on a stale build;
  * the script was EDITED WHILE RUNNING -- bash reads a script incrementally
    from a held offset, so rewriting `bin/runTests` under a live run makes it
    execute torn bytes.  This is how `check_component_name_hint` came to
    report a moved golden on 2026-08-27, and the reported cause sent the
    reader to `Database.cpp`, where nothing was wrong;
  * the run was killed, timed out, or died.

A CHECK THAT CANNOT RUN MUST NOT PASS -- AND MUST NOT FAIL WITH A FALSE
REASON EITHER.  Diagnosing a cause the evidence does not establish is worse
than reporting nothing, because it sends the next reader to the wrong file.

Two gates had each grown their own half of this test, catching the journal
case and nothing else.  Two spellings of one question is how they drift, so
the question has one home now.

THE TEST IS POSITIVE, not an absence.  "The golden moved" is claimed only when
the harness printed a verdict LINE for the case -- a `FAIL <name>` of its own.
Anything else is `could-not-run`, with the harness's own output carried back
so the caller can say WHY rather than guess.
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  Phrases `bin/runTests` prints when it declines to run at all.  Absence of
#  one of these is NOT evidence that it ran -- see `verdict` -- they only let
#  the caller name the reason when it is one of the known ones.
_DECLINED = (
    "REFUSING TO RUN",
    "ABORTED before running anything",
    "destructive session is open",
    "destructive session's journal",
    "STALE",
)


def verdict(case, timeout=900):
    """Run one case through bin/runTests.

    Returns (state, output, reason) where state is:
      "pass"          -- the harness compared the case and it reproduced
      "fail"          -- the harness compared the case and it did NOT
      "could-not-run" -- no comparison happened; `reason` says what is known
    """
    try:
        r = subprocess.run([str(ROOT / "bin/runTests"), str(case)],
                           cwd=str(ROOT), capture_output=True, text=True,
                           timeout=timeout)
        out = r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        return "could-not-run", "", f"bin/runTests timed out after {timeout} s"

    name = Path(case).name

    #  The tally line is the harness's own statement that it compared things.
    tally = re.search(r"^PASS (\d+) / FAIL (\d+)", out, re.M)
    per_case_fail = re.search(r"^FAIL\s+" + re.escape(name), out, re.M)
    per_case_pass = re.search(r"^PASS\s+" + re.escape(name), out, re.M)

    if per_case_fail or (tally and int(tally.group(2)) > 0):
        return "fail", out, ""
    if per_case_pass and tally and int(tally.group(1)) >= 1:
        return "pass", out, ""

    for phrase in _DECLINED:
        if phrase in out:
            return "could-not-run", out, (
                f"bin/runTests declined to run (it printed \"{phrase}\")")
    return "could-not-run", out, (
        "bin/runTests printed no verdict line for this case and no reason "
        "this helper recognises -- it did not compare anything, so nothing "
        "can be concluded about the golden")
