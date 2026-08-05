#!/usr/bin/env python3
"""Gate: the decision index covers every design record, and its counts are real.

    bin/curate/check_decision_index.py

WHY THIS EXISTS.  `docs/architecture/decision-records.md` is the V8 view of the
42010 description: the answer to *"has this been decided, and where?"*.  Its
usefulness rests on ONE property -- that it is COMPLETE.  An index missing a
record is worse than no index, because it answers the question wrongly with
apparent authority.

It is also a hand-maintained list of a derived fact, which is the shape this
project spent 2026-08-05 finding wrong FOUR separate times: the uncited-species
list (short by one), the unargued-founding-decision list (long by three), the
upward-edge and cycle counts (both short), the crossing-`../` count (short by
one).

And then the index did it too, THE SAME DAY IT WAS WRITTEN ABOUT.  A design
record was added; the table gained its row, and the prose still said "34
records" in three places.  Complete, and mis-stating its own size.

That is the argument for this gate over another careful reading: *a gate
recounts; a list remembers what it was told.*

WHAT IS CHECKED.

  (a) COVERAGE -- every `docs/design/*.md` is named somewhere in the index.
      Missing one is the failure that matters, because the index is consulted
      to establish that something was NOT decided.

  (b) THE STATED COUNTS MATCH THE TABLE.  The prose quotes how many records
      exist and how many state a rejected alternative; both are recounted here
      from the table's own `yes`/`no` column.  A number in prose that
      disagrees with the table beneath it is a second home for a derived fact.

WHAT IS NOT CHECKED, deliberately: whether a record's `alt` mark is TRUE --
whether a record that says `yes` really argues an alternative.  That is a
reading judgement, and a gate claiming it would be asserting more than it can
see.  The index's own §5 makes the same distinction.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "docs" / "architecture" / "decision-records.md"
DESIGN = ROOT / "docs" / "design"

#  A table row: | [`name.md`](../design/name.md) | KIND | yes/no | ... |
ROW = re.compile(r'^\|\s*\[`([^`]+\.md)`\]\([^)]*\)\s*\|([^|]*)\|([^|]*)\|', re.M)

#  Prose numbers the gate recounts.  Each pattern captures ONE integer.
CLAIMS = [
    (re.compile(r'when (\d+) records already exist'), "total"),
    (re.compile(r'Of (\d+) design records'), "total"),
    (re.compile(r'\*\*(\d+) state a rejected alternative and (\d+) do not\*\*'),
     "alt_pair"),
    #  The period sits INSIDE the bold in the source, so the pattern must
    #  tolerate it -- a first draft anchored on `\*\*` and reported the claim
    #  "gone" when it was merely punctuated.  A gate that mistakes its own
    #  regex for a missing fact sends the reader hunting a phantom.
    (re.compile(r'\*\*(\d+) of (\d+) records state no rejected alternative'),
     "no_of_total"),
]


def main() -> int:
    fail = []
    if not INDEX.exists() or not DESIGN.is_dir():
        print("check_decision_index: FAILED\n  index or docs/design/ missing")
        return 1
    text = INDEX.read_text()

    # ---- (a) coverage -------------------------------------------------
    on_disk = sorted(p.name for p in DESIGN.glob("*.md"))
    missing = [n for n in on_disk if n not in text]
    for m in missing:
        fail.append(f"docs/design/{m} is NOT in the index.  An index consulted "
                    "to establish that something was not decided must be "
                    "complete, or it answers wrongly with authority.")

    # ---- (b) the stated counts match the table ------------------------
    rows = ROW.findall(text)
    design_rows = [r for r in rows if r[0] in on_disk]
    total = len(design_rows)
    yes = sum(1 for r in design_rows if r[2].strip().lower().startswith("yes"))
    no = total - yes

    for pat, kind in CLAIMS:
        m = pat.search(text)
        if not m:
            fail.append(f"the prose claim '{kind}' is gone -- this gate reads "
                        "it to recount; re-point the pattern or remove it")
            continue
        if kind == "total" and int(m.group(1)) != total:
            fail.append(f"prose says {m.group(1)} records; the table has "
                        f"{total} rows for files that exist on disk")
        elif kind == "alt_pair":
            if (int(m.group(1)), int(m.group(2))) != (yes, no):
                fail.append(f"prose says {m.group(1)} state an alternative and "
                            f"{m.group(2)} do not; the table says {yes} and {no}")
        elif kind == "no_of_total":
            if (int(m.group(1)), int(m.group(2))) != (no, total):
                fail.append(f"prose says {m.group(1)} of {m.group(2)} state no "
                            f"alternative; the table says {no} of {total}")

    if fail:
        print("check_decision_index: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print(f"check_decision_index: OK -- all {len(on_disk)} design record(s) "
          f"appear in the index, and its stated counts ({yes} state a rejected "
          f"alternative, {no} do not) are recounted from the table rather than "
          "trusted.  Whether an `alt` mark is TRUE is a reading judgement and "
          "is deliberately not claimed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
