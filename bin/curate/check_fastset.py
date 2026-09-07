#!/usr/bin/env python3
"""Gate: the FAST SET is a declared, resolvable list -- and it is COMPLETE.

    bin/curate/check_fastset.py

WHY THIS EXISTS.  `tutorials/FASTSET` names one representative case per
tutorial FAMILY, and `bin/runTests --fast` runs exactly that list as the rung
between `--witnesses` (15 cases, one per execution class) and the full sweep
(~590 items, 31-43 min).  The tier's whole claim is *"no family of the corpus
has gone dark"*, and a hand-kept list cannot make that claim on its own: it
goes stale SILENTLY the first time a family is added, because a missing case
does not fail -- it just stops running.  That is the `check_true_ions` failure
shape, this project's worst instance of a permanently-green check.

So the LIST is declared (a tracked file a human reviews and can reason about)
and its COMPLETENESS is recomputed here from the tree.  Deriving the list
itself was rejected: "the cheapest case per family" is not stable -- two
complete runs of the same 598 items on one day measured 42.5 and 31.3 min, a
26 % spread -- so a derived list would reshuffle between runs and nobody could
review what it covers.

THE FAMILY RULE, and it is the one thing here that is a SECOND HOME.  A family
is a case's own parent directory, EXCEPT under `tutorials/plant/`, where each
plant is a family (its sub-cases belong to it) because two plants share
nothing but the folder they sit in.  Which cases the suite WALKS is restated
below from `bin/runTests`' gather -- the same restatement `check_mass_closure`
and `check_energy_boundary_pinned` make for their own discoveries.  It is a
copy, and a copy can drift: what keeps it honest is that a drift in the
PERMISSIVE direction adds a family this gate then demands a line for, and a
drift in the RESTRICTIVE direction leaves a declared line that arm (S3)
refuses as not-walked.  Both directions fail loudly; neither goes green.

WHAT THIS CHECKS:

  (S1) tutorials/FASTSET exists, parses (one case path per line) and declares
       at least one case;
  (S2) every declared path is an existing runnable case (system/controlDict);
  (S3) every declared path is a case the SUITE WALKS -- a line pointing at a
       case the full sweep never checks would give the fast tier reach the
       sweep above it does not have;
  (S4) no case is declared twice;
  (S5) COMPLETENESS -- every walked family has at least one line, or a
       declared `# EXCLUDED <family>  <reason>` line naming it.  This is the
       arm `check_witness_tier` deliberately does not have, and it is the
       reason this gate exists at all;
  (S6) every EXCLUDED line names a walked family, carries a reason, and does
       NOT also carry a representative -- a stale exclusion outliving the
       family it named, or one contradicted by a line beneath it, is a waiver
       nobody reads.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * whether the declared cases are CHEAP.  The tier's budget is a
    MEASUREMENT, and one that moves 26 % between runs on the same tree; a
    gate asserting a wall clock would fail on machine load and teach the
    reader to ignore it.  The measurement lives in FASTSET's header, dated;
  * whether the fast set PASSES -- that is `bin/runTests --fast` itself;
  * whether a family's representative is REPRESENTATIVE of it.  That is an
    author's judgement, made in review when a line is added or moved, exactly
    as `check_witness_tier` leaves representativeness to the architect;
  * whether the four conservation gates the tier runs are the right four.
    They are named and argued in FASTSET's header; this gate does not read
    that argument.

SABOTAGE-VERIFIED 2026-09-07, BY HAND, between the run and the check; the
OBSERVED output is recorded in the report of that day, not predicted here.
The four fired: a family's line deleted (S5 names the family), a line pointed
at a path that is not a case (S2), a line duplicated (S4), and a NEW family
directory holding a case with no line (S5).
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIST = ROOT / "tutorials" / "FASTSET"

#  `# EXCLUDED <family path>  <reason>` -- a DECLARED absence carried in the
#  list itself, never a waiver hidden in this script.  (If a waiver ever needs
#  a home of its own it is bin/curate/debt_registry.py, the one home; a family
#  with no representative is not that -- it is a fact about this list, and it
#  belongs beside the list.)
EXCLUDED = re.compile(r"^#\s*EXCLUDED\s+(\S+)\s\s*(.+?)\s*$")


def family(case: str) -> str:
    """The directory whose cases this one represents.  See THE FAMILY RULE."""
    parent = str(Path(case).parent)
    return case if parent == "tutorials/plant" else parent


def walked():
    """Every case `bin/runTests` sweeps, restated from its gather.

    steady/batch/ctrl/props/electrochem: any directory holding
    system/controlDict, at any depth.  plant/: run-only EXCEPT a case that
    ships an `expected` golden or carries a `.known-broken` marker."""
    out = []
    for cat in ("steady", "batch", "ctrl", "props", "electrochem"):
        d = ROOT / "tutorials" / cat
        if not d.is_dir():
            continue
        for cd in sorted(d.glob("**/system/controlDict")):
            out.append(cd.parent.parent)
    p = ROOT / "tutorials" / "plant"
    if p.is_dir():
        for cd in sorted(p.glob("**/system/controlDict")):
            case = cd.parent.parent
            if (case / ".known-broken").is_file() or (case / "expected").is_file():
                out.append(case)
    return [c.relative_to(ROOT).as_posix() for c in out]


def main() -> int:
    if not LIST.is_file():
        print("check_fastset: FAILED")
        print("  tutorials/FASTSET is missing -- the fast tier is a declared "
              "list, and it is gone")
        return 1

    fails = []
    declared, seen, excluded = [], {}, {}
    for ln, raw in enumerate(LIST.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("#"):
            m = EXCLUDED.match(line)
            if m:
                fam, why = m.group(1), m.group(2)
                if fam in excluded:
                    fails.append(f"S6: family '{fam}' is EXCLUDED twice "
                                 f"(lines {excluded[fam][0]} and {ln})")
                else:
                    excluded[fam] = (ln, why)
            continue
        parts = line.split()
        if len(parts) != 1:
            fails.append(f"S1: line {ln} does not parse as a single case "
                         f"path: '{line}'")
            continue
        case = parts[0]
        if case in seen:
            fails.append(f"S4: {case} is declared twice (lines "
                         f"{seen[case]} and {ln}) -- one family, one line, "
                         f"and a duplicate is a case run twice for nothing")
            continue
        seen[case] = ln
        declared.append(case)

    if not declared:
        fails.append("S1: the list declares no cases")

    walk = set(walked())
    for case in declared:
        if not (ROOT / case / "system" / "controlDict").is_file():
            fails.append(f"S2: {case} is not a case directory "
                         f"(system/controlDict not found)")
        elif case not in walk:
            fails.append(
                f"S3: {case} is a case the full sweep does NOT walk, so the "
                f"fast tier would check something the rung above it never "
                f"does.  A plant case joins the walk by shipping an "
                f"`expected` golden.")

    families = sorted({family(c) for c in walk})
    covered = {family(c) for c in declared}
    for fam in families:
        if fam in covered:
            if fam in excluded:
                fails.append(
                    f"S6: family '{fam}' is EXCLUDED on line "
                    f"{excluded[fam][0]} and ALSO represented by a case line "
                    f"-- a declared absence contradicted by a presence is a "
                    f"waiver nobody can read.  Drop one.")
            continue
        if fam in excluded:
            continue
        fails.append(
            f"S5: family '{fam}' holds case(s) the suite walks and has NO "
            f"line in tutorials/FASTSET -- `--fast` would run none of it, "
            f"silently.  Remedy: add its cheapest case as a line, or declare "
            f"the absence with `# EXCLUDED {fam}  <reason>`.")

    for fam, (ln, why) in sorted(excluded.items()):
        if fam not in families:
            fails.append(
                f"S6: line {ln} EXCLUDES '{fam}', which is not a family the "
                f"suite walks any more -- a stale exclusion outliving its "
                f"subject.  Remove it.")
        elif len(why) < 10:
            fails.append(
                f"S6: line {ln} EXCLUDES '{fam}' with no usable reason "
                f"('{why}') -- an absence without a reason is a silence with "
                f"a comment in front of it.")

    if fails:
        print("check_fastset: FAILED")
        for f in fails:
            print("  " + f)
        return 1

    print("check_fastset: OK -- %d declared case(s) covering %d of the %d "
          "tutorial famil(ies) the suite walks, each an existing case the "
          "full sweep also walks, no case declared twice; the remaining %d "
          "famil(ies) carry a DECLARED `# EXCLUDED` line with a reason (%s).  "
          "NOT COVERED: whether the declared cases are CHEAP (a measurement, "
          "and one that moved 26 %% between two runs of the same tree -- it "
          "lives dated in FASTSET's header, not in a gate), whether they PASS "
          "(that is `bin/runTests --fast`), and whether a family's "
          "representative is REPRESENTATIVE of it (an author's judgement, "
          "made in review, exactly as check_witness_tier leaves "
          "representativeness to the architect)."
          % (len(declared), len(covered), len(families), len(excluded),
             ", ".join(sorted(excluded)) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
