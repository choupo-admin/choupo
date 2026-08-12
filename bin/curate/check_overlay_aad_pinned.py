#!/usr/bin/env python3
"""Gate: a comparison against measured data is PINNED, not merely printed.

    bin/curate/check_overlay_aad_pinned.py

WHY THIS EXISTS.  Found 2026-08-12.  A choupoProps case declares an
`experimental {}` overlay to say how far each model sits from a MEASURED
dataset -- the whole reason a `compare_*` case exists.  That table was emitted
in a top-level `"validation"` block of the result JSON, and `bin/runTests`
could read `kpis`, `streams` and `operationResults[].diagnostics` and nothing
else.  So every AAD in the corpus was pinned by nothing, and the only place
those numbers survived was prose.

Prose about a number goes stale silently, and it had:
`compare_vle_etoh_water`'s header claimed original UNIFAC gave "T_bubble AAD
~2.6 K" with the azeotrope "misplaced to x_eth ~0.77".  The case's own output
says 0.407 K and 0.888.  Six times off and 0.12 in mole fraction, both in the
direction that made the method look worse than it is, both published, neither
falsifiable by the suite.  `compare_kinetics_order` was worse: no golden at
all, so its entire lesson (order 2 fits 7x better than order 1) was a smoke
pass.

WHAT THIS CHECKS, per case carrying an `experimental (...)` block:
  (a) PUBLISHED IS PINNED: every (dataset, model, property, statistic) the run
      emits a number for has an `aad` row in the case's `expected`.  The
      STATISTIC is part of the key: a case publishing both an absolute and a
      relative AAD publishes two numbers, and pinning one leaves the other
      free to move.
  (b) PINNED IS PUBLISHED: every `aad` row names a key the run still emits.  A
      row that stopped matching anything would otherwise sit there looking
      like coverage -- the permanently-green shape.
  (c) THE CASE HAS A GOLDEN AT ALL.  An overlay case with no `expected` is a
      case whose headline result is checked by the exit code.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER THE AAD IS GOOD.  An AAD of 40 K pins as happily as one of 0.4 K.
    This gate is about the number being falsifiable, never about its value.
  * VALIDATION.  An AAD is a statistic derived from the model and the dataset
    TOGETHER, so no primary published it and it is a self-recorded regression
    row, never an `anchor`.  Pinning it says the agreement has not MOVED.
  * `tutorials/plant/` OVERLAYS.  The two esterification2sector sector dicts
    carry overlays, and a fractal plant case is run-only in `bin/runTests` --
    demanding a checked golden there would demand a golden nothing checks.
    They are SKIPPED and NAMED below, so the exclusion is visible rather than
    silent.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  A run-only tier, excluded on purpose (see the docstring).  Named, not
#  pattern-matched, so a NEW plant overlay is a decision someone makes here
#  rather than a case that quietly slips out of coverage.
SKIP_PREFIXES = ("tutorials/plant/",)


def overlay_cases():
    """Every case directory whose system/propsDict declares `experimental (`."""
    found, skipped = [], []
    for pd in sorted(ROOT.glob("tutorials/**/system/propsDict")):
        text = pd.read_text(errors="replace")
        if not re.search(r'^\s*experimental\s*\(', text, re.M):
            continue
        case = pd.parent.parent
        rel = case.relative_to(ROOT).as_posix()
        (skipped if rel.startswith(SKIP_PREFIXES) else found).append(case)
    return found, skipped


def published_aads(case: Path):
    """Run the case; return {(dataset, model, property, stat)} actually emitted.

    Reads the SAME JSON block `bin/runTests` reads.  The STATISTIC is part of
    the key on purpose: a case that publishes both an absolute and a relative
    AAD publishes two numbers, and pinning one of them leaves the other free
    to move.  A null field published nothing and is not required to be pinned
    -- a `status` other than ok (out of range, non-finite) is a real outcome,
    not a missing pin.
    """
    proc = subprocess.run([str(ROOT / "choupoProps"), str(case)],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        return None, f"the case exits {proc.returncode}"
    out = proc.stdout
    block = re.search(r'"validation":\s*\[(.*?)\n  \]', out, re.S)
    if not block:
        return None, "the run emits no `validation` block"
    keys, dataset = set(), None
    for line in block.group(1).splitlines():
        md = re.search(r'"dataset":\s*"([^"]*)"', line)
        if md:
            dataset = md.group(1)
        mm = re.search(r'"model":\s*"([^"]*)"', line)
        mp = re.search(r'"property":\s*"([^"]*)"', line)
        if not (mm and mp and dataset):
            continue
        for stat in ("aadAbs", "aadRelPct"):
            if re.search(r'"%s":\s*-?[0-9]' % stat, line):
                keys.add((dataset, mm.group(1), mp.group(1), stat))
    return keys, None


def pinned_aads(case: Path):
    """{(dataset, model, property, stat)} named by `aad` rows in the golden."""
    exp = case / "expected"
    if not exp.is_file():
        return None
    pinned = set()
    for line in exp.read_text(errors="replace").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 4 or parts[0] != "aad":
            continue
        key = parts[2].split(".")
        if len(key) < 3:
            continue
        #  `<model>.<property>.<stat>`; a property may itself carry dots in
        #  principle, so the model is the first field and the stat the last.
        pinned.add((parts[1], key[0], ".".join(key[1:-1]), key[-1]))
    return pinned


def main() -> int:
    cases, skipped = overlay_cases()
    if not cases:
        print("check_overlay_aad_pinned: FAILED\n"
              "  no `experimental (` overlay case was found under tutorials/."
              "  This gate has no subject, and a gate with no subject reports"
              " PASS forever -- fix the discovery, do not retire the check.")
        return 1

    problems, npins = [], 0
    for case in cases:
        rel = case.relative_to(ROOT).as_posix()
        published, why = published_aads(case)
        if published is None:
            problems.append(f"{rel}: {why}")
            continue
        pinned = pinned_aads(case)
        if pinned is None:
            problems.append(
                f"{rel}: declares an `experimental {{}}` overlay and ships NO"
                " `expected`, so its comparison against measured data is"
                " checked by the exit code alone."
                "  Remedy: bin/runTests --record " + rel)
            continue
        for t in sorted(published - pinned):
            problems.append(
                f"{rel}: publishes {t[3]} for {t[0]}/{t[1]}/{t[2]} that NO"
                " `aad` row pins -- the model may drift off the measured data"
                " with the suite still green."
                "  Remedy: bin/runTests --record " + rel)
        for t in sorted(pinned - published):
            problems.append(
                f"{rel}: pins {t[3]} for {t[0]}/{t[1]}/{t[2]}, which the run"
                " does NOT publish -- a row that matches nothing reads as"
                " coverage it does not give.")
        npins += len(pinned & published)

    for s in skipped:
        print(f"  [skipped, run-only tier] {s.relative_to(ROOT).as_posix()}")

    if problems:
        print("check_overlay_aad_pinned: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print(f"check_overlay_aad_pinned: OK -- {npins} AAD statistic(s) across "
          f"{len(cases)} overlay case(s) are pinned in their goldens, in both "
          "directions (published implies pinned, pinned implies published).  "
          "NOT CHECKED: whether any AAD is GOOD -- this gate makes the number "
          "falsifiable, never good; and these are self-recorded regression "
          "rows, never anchors, because an AAD is derived from the model and "
          "the dataset together and no primary published it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
