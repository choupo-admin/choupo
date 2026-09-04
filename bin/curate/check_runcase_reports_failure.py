#!/usr/bin/env python3
"""Gate: a failed run REACHES THE TERMINAL, not only the log.

    bin/curate/check_runcase_reports_failure.py

WHY THIS EXISTS.  `bin/runCase` and `bin/runApplication` both end in a branch
that prints `FAILED (exit N)` and the log's last lines.  Both scripts run under
`set -euo pipefail`, and both invoked the binary BARE:

    "$RUN_BIN" "$CASE_ABS" > "$LOG" 2>&1
    rc=$?                                   # never reached on failure

so a non-zero exit killed the script at the invocation, before `rc` was taken,
and therefore before the branch that reports it.  The FAILED branch was dead
code in both files.

WHAT THAT COST, measured 2026-09-04 on a copy of `flash01` with the unit type
mistyped as `isothermalFlashh`:

    $ bin/runCase <case>
    Running case: ...
      log:    .../log.choupoSolve
      binary: choupoSolve
    $ echo $?
    2

Three lines that look like a normal start, then nothing -- on stdout AND
stderr.  Meanwhile the engine's own message, which is one of the best in the
tree (it names the unknown type and lists all 48 registered ones), sat unread
in the log.  This is the FIRST thing a new student meets when they make their
first typo, and the answer they got was silence.

WHAT THIS GATE CHECKS.  It builds a case that cannot run -- a copy of a real
tutorial with its unit type corrupted, in a temp directory, never in the tree
-- runs `bin/runCase` on it, and requires that:

  (a) the exit status is non-zero (the failure is not swallowed), AND
  (b) the combined terminal output NAMES the failure -- it must carry the
      engine's own error text, not merely the word "FAILED".  A branch that
      printed a bare "FAILED" and no cause would satisfy a weaker check and
      still leave the student with nothing to act on.

It also checks the NEGATIVE, because a check that cannot distinguish the two
states proves nothing: the same case UNCORRUPTED must exit 0 and must NOT
print the failure text.

WHAT IT DOES NOT CHECK: `runApplication`, which takes a binary and arguments
rather than a case and has no corpus fixture to corrupt -- it carries the same
`|| rc=$?` fix and the same comment, but only `runCase` is exercised here.  Nor
the QUIET or APPEND paths, nor whether the log itself is complete.
"""
import re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials" / "steady" / "flash" / "flash01_benzene_toluene"
#  The engine's own words for this failure.  Matching the CAUSE, not the
#  wrapper's "FAILED", is the whole point of arm (b).
CAUSE = "unknown type"


def fail(msg):
    print("check_runcase_reports_failure: FAIL -- " + msg)
    sys.exit(1)


def run_case(case_dir):
    r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(case_dir)],
                       capture_output=True, text=True, timeout=600)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main():
    if not CASE.is_dir():
        fail(f"fixture case missing: {CASE.relative_to(ROOT)}")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        #  ---- the NEGATIVE first: an intact case must run and stay quiet ----
        good = tmp / "good"
        shutil.copytree(CASE, good)
        for junk in ("converged", "reports"):
            shutil.rmtree(good / junk, ignore_errors=True)
        rc, out = run_case(good)
        if rc != 0:
            fail(f"the UNCORRUPTED fixture failed (exit {rc}) -- this gate"
                 f" cannot tell a reported failure from a broken fixture."
                 f"  Output:\n{out[-800:]}")
        if CAUSE in out:
            fail("the uncorrupted fixture printed the failure text -- the"
                 " positive arm below would pass on a run that did not fail")

        #  ---- the POSITIVE: a case that cannot run must SAY so ----
        bad = tmp / "bad"
        shutil.copytree(CASE, bad)
        for junk in ("converged", "reports"):
            shutil.rmtree(bad / junk, ignore_errors=True)
        fs = bad / "system" / "flowsheetDict"
        text = fs.read_text()
        if "isothermalFlash;" not in text:
            fail("the fixture no longer declares `isothermalFlash;` -- this"
                 " gate corrupts that token and can no longer build its probe")
        fs.write_text(text.replace("isothermalFlash;", "isothermalFlashh;", 1))

        rc, out = run_case(bad)
        if rc == 0:
            fail("a case with an unknown unit type exited 0 through runCase")
        if CAUSE not in out:
            fail("runCase exited %d and the terminal never said WHY: the"
                 " engine's own message (%r) reached the log and not the"
                 " reader.  This is the dead-FAILED-branch defect of"
                 " 2026-09-04 -- the invocation must swallow the status"
                 " (`|| rc=$?`) instead of letting `set -e` kill the script"
                 " before it.  Terminal was:\n%s"
                 % (rc, CAUSE, out[-800:] or "(completely empty)"))

    print("check_runcase_reports_failure: OK -- a case that cannot run exits"
          " non-zero THROUGH bin/runCase and the engine's own reason reaches"
          " the terminal (not merely the word FAILED, and not only the log),"
          " while the same case uncorrupted exits 0 and stays quiet.  This was"
          " dead code under `set -euo pipefail` until 2026-09-04: a student's"
          " first typo printed three lines that look like a normal start and"
          " then nothing at all.  NOT CHECKED: bin/runApplication (same fix,"
          " no corpus fixture to corrupt), the -q and -a paths, and whether"
          " the log itself is complete.")


main()
