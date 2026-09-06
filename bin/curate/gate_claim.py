#!/usr/bin/env python3
"""ONE HOME for a single fact: WHICH LINE OF A GATE'S OUTPUT IS ITS CLAIM.

    bin/curate/gate_claim.py <gate-script-stem> [file]      # file, or stdin

Prints the gate's claim line and exits 0; prints a stated placeholder and
exits 3 when the gate marks none.  Importable as `claim_in(text, gate_name)`.

WHY THIS FILE EXISTS.  The fact above had TWO homes, and they disagreed
without anything noticing.

  * `gate_manifest.py` took `line[0]` -- the FIRST line of the gate's output.
    Its own function docstring said "first line of its output"; the module
    docstring three screens above said `CAPTURED claim -- the OK line,
    verbatim`.  Two sentences in one file, describing two different rules.
  * `bin/runTests` captured the line for a gate's PASS row by its own,
    per-site rule.  Counted over the 201 `PASS` rows of the file as it stood
    on 2026-09-06: 100 took `head -1`, 89 took `tail -1`, 3 took
    `grep -m1 ': OK'`, 5 something else again, 4 a literal string.

So for any gate that prints detail BEFORE its verdict, the manifest recorded a
detail line as the gate's own account of itself, while the suite printed
something else in the same run.  Five were confirmed by running the gate and
reading the committed entry beside it; the worst of them,
`check_equipment_pinned`, had the coverage record naming precisely the one
case the gate SKIPPED.

THE RULE, and why it is a MARK rather than a POSITION.

A gate's claim is **the first line of its output that MARKS itself as the
claim**:

    <label>: OK ...          or          [<label>] OK ...

at the start of the line (leading whitespace allowed), where `<label>`
resolves to the gate's own name -- compared after lowercasing, mapping `-`
and `.` to `_`, and dropping a leading `check_` from both sides.  That is
what lets `check_costing_refusals` mark its claim as `costing-refusals: OK`
and `check_groups` as `[check_groups] OK` while a per-item line inside
`check_ion_pins` (`  NaOH  ions-solid = ... OK`) is NOT mistaken for one: the
mark is a label that answers to the gate, not the word OK.

"First line" and "last line" are both GUESSES about where a gate happens to
print its verdict, and swapping one for the other only points the same guess
the other way.  A mark is a statement by the gate about its own output, and
it is checkable.

THE RULE WAS CHOSEN FROM A MEASUREMENT, not from taste.  Of the 191 gates in
`bin/curate/` on 2026-09-06, **139 already printed a correctly-labelled claim
mark** and 52 did not; `check_ion_pins` and `check_seal_drift` were given one
in the same commit as this file, leaving 141 and 50.  The convention existed;
what was missing was anything that read it.

A GATE THAT MARKS NO CLAIM GETS NONE.  This module returns `None` rather than
donating the gate's heading, its first line or its last -- an unmarked gate's
output is prose, and picking a line out of prose and filing it as "what this
gate proves" is the defect, not the fix.  The 50 unmarked gates are a named
campaign, not a silent tolerance: see
`docs/design/which-line-is-a-gates-claim.md`.
"""
import re
import sys

#  The MARK.  Anchored at the line start (leading whitespace allowed) so that
#  a label can never be quarried out of the middle of a sentence, and `OK`
#  must be a whole word so `OKAY` or `OK_COUNT` cannot pose as one.
MARK = re.compile(r"^[ \t]*(?:\[(?P<bracket>[A-Za-z0-9_.\-]+)\]"
                  r"|(?P<plain>[A-Za-z0-9_.\-]+):)[ \t]*OK\b")

UNMARKED = ("(no claim line marked -- this gate prints no `<name>: OK ...` "
            "line; see bin/curate/gate_claim.py)")


def _resolve(label: str) -> str:
    """Normalise a printed label or a gate script stem to one comparable word."""
    s = label.strip().lower().replace("-", "_").replace(".", "_")
    return s[len("check_"):] if s.startswith("check_") else s


def claim_in(text: str, gate_name: str):
    """Return the gate's marked claim line, or None if it marks none.

    `gate_name` is the gate's script stem (`check_seal_drift`); the label the
    gate prints need not be spelled the same way, only resolve the same way.
    """
    want = _resolve(gate_name)
    for line in (text or "").splitlines():
        m = MARK.match(line)
        if not m:
            continue
        label = m.group("plain") or m.group("bracket")
        if _resolve(label) == want:
            return line.strip()
    return None


def main(argv) -> int:
    if len(argv) < 2:
        print("usage: gate_claim.py <gate-script-stem> [file]", file=sys.stderr)
        return 2
    name = argv[1]
    if len(argv) > 2:
        try:
            text = open(argv[2], errors="ignore").read()
        except OSError as e:
            #  A tool that cannot LOOK must refuse, not report what it did not
            #  see (2026-09-06).  An unreadable file is not a gate without a
            #  claim.
            print(f"(claim unreadable -- {e})")
            return 2
    else:
        text = sys.stdin.read()
    claim = claim_in(text, name)
    if claim is None:
        print(UNMARKED)
        return 3
    print(claim)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
