#!/usr/bin/env python3
"""Gate: a credited model-boundary step is PINNED, not merely reported.

    bin/curate/check_closure_ledger_pinned.py

WHY THIS EXISTS.  Found 2026-08-12, one field over from the same defect in the
`validation` overlay table, and by the same question: which blocks of the
result JSON can a golden row actually read?

The model-boundary energy ledger (2026-08-09) exists to keep THREE quantities
apart and never collapse them -- the raw imbalance, the DECLARED enthalpy step
at a per-unit `thermo {}` boundary, and what REMAINS after the step is
credited -- with the verdict taken on the third.  All three are emitted as
objects in a top-level `"energyClosures"` array keyed by `"unit"`, which is
neither the `"<name>": {}` form nor an `operationResults[].diagnostics` object.
So no golden row could reach them, and not one number of the ledger was
checked by anything.

What that cost is specific.  The step is credited ONLY when an INDEPENDENTLY
assembled package reproduces the imbalance -- *an auditor that reuses the
auditee's arithmetic checks nothing* -- and if that independent path ever
stopped reproducing it, `remaining_kW` would climb from 9.4e-9 to the full
2.99 kW on basis01 and the status would fall back to `unconfirmed`, with the
suite green throughout.

WHAT THIS CHECKS, per candidate case:
  (a) PUBLISHED IS PINNED: every unit whose run reports a closure status other
      than `none` has `closure` rows for raw_kW, step_kW and remaining_kW.
  (b) PINNED IS PUBLISHED: every `closure` row names a unit and field the run
      still emits -- a row matching nothing reads as coverage it does not give.

CANDIDATES, and why the discovery is what it is.  A closure entry can only be
non-`none` where a unit declares its own world: the ledger's own `rule` string
for every other unit reads "no model boundary declared for this unit".  So the
candidates are the cases whose `flowsheetDict` carries a unit-level `thermo`
sub-dict -- cheap to find, and the verdict is then taken from the RUN, never
from the dict.  A candidate that declares an override and publishes no
non-`none` entry is FINE and passes silently: `crystalliser09_KHT_KCl_series`
is exactly that, because its crossing is REFUSED across a speciation flip and
reported in the separate `modelBoundaries` block instead.  Any case whose
golden already carries `closure` rows is also a candidate, so arm (b) cannot
be escaped by a row that stops matching.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER A STEP IS RIGHT.  A wrong step pins as happily as a right one.
    This gate is about the three numbers being falsifiable.
  * THE STATUS WORD.  `status`, `rule`, `criterion` and the two world strings
    are prose, and no golden kind reads them.  (The reason given here until
    2026-09-04 was that "a golden row compares numbers"; the `verdict` kind
    made that false, and the sentence was standing in three homes at once.)
    A status downgrade is
    caught INDIRECTLY and reliably -- it zeroes step_kW and pushes
    remaining_kW back up to raw, both of which these rows pin -- but it is not
    read directly, and that is a real difference.
  * A BOUNDARY ARISING WITHOUT A PER-UNIT `thermo {}` BLOCK.  None exists
    today and the ledger's own rule string says none can, but the discovery
    above would not see one.  Arm (b) still covers any case already pinned.
"""
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  Single-pass cache (2026-08-24): under bin/runTests this sweep reads the
#  suite's own case pass (env CHOUPO_SUITE_OUTPUTS; cache-present implies
#  ran-clean); standalone it runs live; anything absent runs live.
_CACHE = os.environ.get("CHOUPO_SUITE_OUTPUTS")


def cached_stdout(case: Path):
    if not _CACHE:
        return None
    rel = case.resolve().relative_to(ROOT).as_posix().replace("/", "__")
    f = Path(_CACHE) / (rel + ".out")
    try:
        return f.read_text(errors="replace")
    except OSError:
        return None
FIELDS = ("raw_kW", "step_kW", "remaining_kW")


def candidates():
    """Cases whose flowsheetDict declares a unit-level `thermo` sub-dict, plus
    any case whose golden already carries `closure` rows."""
    found = {}
    for fd in sorted(ROOT.glob("tutorials/**/system/flowsheetDict")):
        text = fd.read_text(errors="replace")
        if re.search(r'^\s{4,}thermo\s*$\s*^\s*\{', text, re.M):
            found[fd.parent.parent] = "declares a per-unit thermo override"
    for exp in sorted(ROOT.glob("tutorials/**/expected")):
        for line in exp.read_text(errors="replace").splitlines():
            if line.split()[:1] == ["closure"]:
                found.setdefault(exp.parent, "already carries closure rows")
                break
    return found


def published(case: Path):
    """{(unit, field)} the run emits for units whose status is not `none`."""
    app = "choupoSolve"
    cd = case / "system" / "controlDict"
    if cd.is_file():
        m = re.search(r'^\s*application\s+(\w+)', cd.read_text(errors="replace"), re.M)
        if m:
            app = m.group(1)
    txt = cached_stdout(case)
    if txt is None:
        proc = subprocess.run([str(ROOT / app), str(case)], capture_output=True, text=True)
        if proc.returncode != 0:
            return None, f"the case exits {proc.returncode}"
        txt = proc.stdout
    line = next((l for l in txt.splitlines() if '"energyClosures":' in l), None)
    if line is None:
        return set(), None          # no ledger emitted: nothing to pin
    keys = set()
    for rec in re.split(r'\}, *\{', line):
        st = re.search(r'"status": "([^"]*)"', rec)
        un = re.search(r'"unit": "([^"]*)"', rec)
        if not (st and un) or st.group(1) == "none":
            continue
        for f in FIELDS:
            if re.search(r'"%s": *-?[0-9]' % f, rec):
                keys.add((un.group(1), f))
    return keys, None


def pinned(case: Path):
    """{(unit, field)} named by `closure` rows in the golden, or None."""
    exp = case / "expected"
    if not exp.is_file():
        return None
    out = set()
    for line in exp.read_text(errors="replace").splitlines():
        parts = line.split()
        if len(parts) >= 4 and parts[0] == "closure":
            out.add((parts[1], parts[2]))
    return out


def main() -> int:
    cases = candidates()
    if not cases:
        print("check_closure_ledger_pinned: FAILED\n"
              "  no candidate case was found.  A gate with no subject reports"
              " PASS forever -- fix the discovery, do not retire the check.")
        return 1

    problems, npins, nsilent = [], 0, 0
    for case, why in sorted(cases.items()):
        rel = case.relative_to(ROOT).as_posix()
        pub, err = published(case)
        if pub is None:
            problems.append(f"{rel}: {err}")
            continue
        pin = pinned(case)
        if pin is None:
            if not pub:
                nsilent += 1
                continue        # nothing published, nothing owed
            problems.append(
                f"{rel}: publishes a credited model-boundary step and ships no"
                " `expected`.  Remedy: bin/runTests --record " + rel)
            continue
        if not pub:
            nsilent += 1
        for t in sorted(pub - pin):
            problems.append(
                f"{rel}: publishes {t[1]} for unit '{t[0]}' that NO `closure`"
                " row pins -- the ledger's own arithmetic may drift with the"
                " suite still green."
                "  Remedy: bin/runTests --record " + rel)
        for t in sorted(pin - pub):
            problems.append(
                f"{rel}: pins {t[1]} for unit '{t[0]}', which the run does NOT"
                " publish as a credited boundary -- a row that matches nothing"
                " reads as coverage it does not give.")
        npins += len(pin & pub)

    if problems:
        print("check_closure_ledger_pinned: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print(f"check_closure_ledger_pinned: OK -- {npins} model-boundary ledger "
          f"quantit(ies) pinned across {len(cases)} candidate case(s), in both "
          f"directions (published implies pinned, pinned implies published); "
          f"{nsilent} candidate(s) declare an override and publish no credited "
          "step, which is a legitimate outcome (a crossing refused across a "
          "speciation flip is reported in `modelBoundaries` instead) and passes "
          "silently.  NOT CHECKED: whether any step is RIGHT, the status/rule "
          "WORDS (a golden row compares numbers; a status downgrade is caught "
          "indirectly, through step_kW and remaining_kW), and a boundary "
          "arising without a per-unit `thermo {}` block -- none exists and the "
          "ledger says none can, but this discovery would not see one.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
