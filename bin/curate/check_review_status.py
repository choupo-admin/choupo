#!/usr/bin/env python3
"""Gate: an unreviewed record SAYS SO at run time, and a reviewed one does not.

    bin/curate/check_review_status.py

WHY THIS EXISTS.  67 standard records carried "PROPOSAL TIER -- UNVERIFIED" in
the BANNER COMMENT, which the dictionary parser discards.  The announce-or-
refuse doctrine therefore could not see them, and a run said nothing about
them -- including `cavett01_recycle_train`, the flagship of the external-
reference battery, where SEVEN of SIXTEEN records are such imports.  A case
making this project's strongest validation claim was built substantially on
values marked unverified where nothing could read the mark.

`interim_review_dossier.py` had already declared `reviewStatus` the PREFERRED
form and free-text markers "a legacy fallback".  Exactly one record used it
and no engine code read it.  Written, never consolidated -- which is the
specific shape the consolidation criterion exists to catch: a contract is
consolidated only when the engine acts on it AND a case fires that action.

WHAT THIS GATE CHECKS.

  (a) THE ANNOUNCEMENT FIRES, FROM A SEALED CASE.  cavett01 reads its own
      mirrored constant/ records, so this also proves the seal carries the
      field -- the gap that made the first version of this work silent.
      One announcement per unverified record, counted, not merely present.

  (b) IT NAMES THE RECORD AND THE REMEDY.  A line saying "unverified" without
      saying WHICH datum and WHAT to do is not an announcement in this
      project's sense (invariant I5).

  (c) THE NEGATIVE, AND IT IS THE ONE THAT MATTERS: a case whose records are
      NOT marked interim must print NO such line.  Without this, a gate would
      pass just as happily if the engine announced on every record it loaded
      -- which is noise, and noise is how a real warning gets ignored.

  (d) NO BANNER-ONLY MARKERS SURVIVE in data/standards.  A record whose
      status lives only in a comment is invisible again, and the migration
      would rot one record at a time.  This is the ratchet.

WHAT IS NOT CHECKED.  Whether a record's status is TRUE -- whether the values
really were reviewed against primaries -- is a curation judgement no gate can
make.  This checks only that whatever the record claims, the engine voices it.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
STD = ROOT / "data" / "standards"

#  A SEALED case with unverified records: proves the field survives the seal.
POSITIVE = "tutorials/steady/flowsheets/cavett01_recycle_train"
#  A case with no interim record: proves the announcement is not unconditional.
NEGATIVE = "tutorials/steady/flash/flash01_benzene_toluene"

MARK = re.compile(r'^\s*reviewStatus\s+(\w+)\s*;', re.M)
BANNER_ONLY = re.compile(r'PROPOSAL TIER')


def run(case):
    p = subprocess.run([str(SOLVE), str(ROOT / case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    fail = []
    if not SOLVE.exists():
        print("check_review_status: FAILED\n  choupoSolve not built")
        return 1

    #  (a) how many records in the SEALED case declare interim?
    comps = ROOT / POSITIVE / "constant" / "components"
    want = sum(1 for p in comps.glob("*.dat")
               if (m := MARK.search(p.read_text())) and m.group(1) == "interim")
    if want == 0:
        fail.append(f"{Path(POSITIVE).name} mirrors no `reviewStatus interim` "
                    "record -- either the case was re-sealed away from them or "
                    "the seal dropped the field; the probe is stale, not the "
                    "engine")
    rc, out = run(POSITIVE)
    if rc != 0:
        fail.append(f"{POSITIVE} did not run (exit {rc})")
    else:
        got = len(re.findall(r'^\[unreviewed\] component ', out, re.M))
        if want and got != want:
            fail.append(f"{Path(POSITIVE).name} mirrors {want} interim "
                        f"record(s) but the run printed {got} [unreviewed] "
                        "line(s).  A sealed case must voice the status its own "
                        "records carry.")
        #  (b) the line names the record and the remedy.
        if want:
            for phrase in ("reviewStatus interim", "UNVERIFIED",
                           "`reviewStatus reviewed;`"):
                if phrase not in out:
                    fail.append(f"the announcement omits '{phrase}' -- a "
                                "warning without the remedy is not one (I5)")

    #  (c) THE NEGATIVE.  Unmarked records must stay silent.
    rc, out = run(NEGATIVE)
    if rc != 0:
        fail.append(f"{NEGATIVE} did not run (exit {rc})")
    elif "[unreviewed]" in out:
        fail.append(
            f"{Path(NEGATIVE).name} declares no interim record yet the run "
            "printed [unreviewed].  An announcement that fires on everything "
            "is noise, and noise is how a real warning gets ignored.")

    #  (d) THE RATCHET.  No status may live only in a banner comment.
    banner_only = []
    for p in sorted((STD / "components").glob("*.dat")):
        t = p.read_text()
        if BANNER_ONLY.search(t) and not MARK.search(t):
            banner_only.append(p.relative_to(ROOT).as_posix())
    if banner_only:
        fail.append("record(s) still carry their review state ONLY in the "
                    "banner comment, where the parser cannot see it: "
                    + ", ".join(banner_only[:5])
                    + (f" (+{len(banner_only) - 5} more)"
                       if len(banner_only) > 5 else ""))

    if fail:
        print("check_review_status: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    n = sum(1 for p in (STD / "components").glob("*.dat")
            if (m := MARK.search(p.read_text())) and m.group(1) == "interim")
    print(f"check_review_status: OK -- {n} standard record(s) declare "
          f"`reviewStatus interim` in a PARSED field (none in a banner only); "
          f"the sealed {Path(POSITIVE).name} voices all {want} of the ones it "
          "mirrors, with the remedy named, and a case with no interim record "
          "stays silent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
