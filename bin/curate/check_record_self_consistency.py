#!/usr/bin/env python3
"""Gate: a record's header must not contradict the values it ships.

    bin/curate/check_record_self_consistency.py

WHY THIS EXISTS.  `assets/NF270.dat` states, in its own header, the solute
permeabilities "chosen to reproduce manufacturer-published rejections", citing
a named public document (the FilmTec NF270-400 data sheet).  Twenty lines
later it ships different numbers:

    solute     documented     shipped      ratio
    NaCl       ~2e-6 m/s      5.0e-6       2.5x
    MgSO4      ~5e-8 m/s      5.0e-8       agrees
    glucose    ~2e-7 m/s      8.0e-6       40x

Glucose is shipped MORE permeable than NaCl, which is backwards for a loose
NF membrane -- the whole point of NF270 is that it passes salt and holds
sugar.  The inline comment asserts `R_obs ~ 50 %`, and the tutorial that uses
it reports ~70 %.  So three statements in one file disagree: the header, the
comment, and the number.

THIS IS A DIFFERENT DEFECT FROM A WRONG VALUE, and that distinction is why
the gate is shaped this way.  A wrong value needs a better source.  A record
that CONTRADICTS ITSELF needs no external evidence at all to be recognised --
the file already contains both claims, and one of them is false whichever way
the curation goes.  A gate can therefore catch it honestly without holding
the data sheet, which this project does not.

WHAT IT DOES NOT DO.  It does not choose.  Picking the header's number would
be as much a guess as keeping the shipped one: the header says what the
values were *chosen to reproduce*, not what a measurement returned, and the
shipped numbers may have been tuned deliberately for a teaching case.
Deciding is Vitor's; the gate's job is to stop the disagreement being
invisible, and to stop a SECOND one appearing unnoticed.

NF270 is PINNED with its remedy.  A new self-contradicting record fails
immediately.  Removing a pin without fixing the record fails too, by design.

THE COVERAGE IS PARTIAL, AND THE GATE REPORTS BY HOW MUCH.  It can only
compare a record whose header states its values in a form it can parse
("~ 2 x 10^-6 m/s").  Sabotaging SW30HR -- multiplying a shipped permeability
by 50 -- did NOT fail this gate, because that record's header documents no
comparable number, so there was nothing to contradict.  That is a real limit,
found by sabotage rather than assumed away, and the OK line names how many
records were actually compared versus skipped.  A gate reporting "12 records
scanned" while comparing one would be claiming coverage it does not have.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  "~ 2 × 10⁻⁶  m/s" / "~2e-6 m/s" in prose, keyed by the solute named first.
DOC = re.compile(
    r'^\s*(?://\s*|\s+)?(\w+)\s*~\s*([\d.]+)\s*(?:x|×)\s*10\s*'
    r'([⁻¯-]?[⁰-₟\d]+)\s*m/s', re.M)
DOC_SCI = re.compile(r'^\s*(?://\s*)?(\w+)\s*~\s*([\d.]+)[eE]([-+]?\d+)\s*m/s', re.M)
SHIPPED = re.compile(r'^\s*(\w+)\s+([\d.]+[eE][-+]?\d+)\s*(?:m/s)?\s*;', re.M)

SUP = {"⁰": "0", "¹": "1", "²": "2", "³": "3",
       "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7",
       "⁸": "8", "⁹": "9", "⁻": "-", "¯": "-"}

#  Ratio above which a header and a value are calling each other wrong.
#  2x is generous: a record rounding "~2e-6" to 2.5e-6 is not a contradiction.
TOL = 3.0

PINNED = {
    "data/standards/assets/NF270.dat":
        "header documents glucose ~2e-7 m/s and the record ships 8.0e-6 (40x), "
        "so glucose is MORE permeable than NaCl -- backwards for a loose NF "
        "membrane.  NOT fixed here: the header states what the values were "
        "CHOSEN TO REPRODUCE, not a measurement, and the shipped numbers may "
        "have been tuned for the teaching case.  Choosing between them moves "
        "membrane02_NF_sugar's goldens and needs Vitor.",
}


def to_float(mant, exp):
    e = "".join(SUP.get(ch, ch) for ch in exp)
    try:
        return float(mant) * (10.0 ** int(e))
    except ValueError:
        return None


def main() -> int:
    bad, seen, nfiles, ncompared = [], set(), 0, 0
    for p in sorted((ROOT / "data/standards/assets").glob("*.dat")):
        text = p.read_text()
        nfiles += 1
        rel = p.relative_to(ROOT).as_posix()

        documented = {}
        for m in DOC.finditer(text):
            v = to_float(m.group(2), m.group(3))
            if v:
                documented[m.group(1)] = v
        for m in DOC_SCI.finditer(text):
            documented.setdefault(m.group(1), float(m.group(2) + "e" + m.group(3)))
        if not documented:
            continue
        ncompared += 1

        block = re.search(r'permeabilities\s*\{(.*?)\}', text, re.S)
        if not block:
            continue
        shipped = {m.group(1): float(m.group(2))
                   for m in SHIPPED.finditer(block.group(1))}

        for name, doc in documented.items():
            got = shipped.get(name)
            if got is None or doc <= 0:
                continue
            r = max(got / doc, doc / got)
            if r < TOL:
                continue
            if rel in PINNED:
                seen.add(rel)
                continue
            bad.append(f"{rel}: header documents {name} ~{doc:g} m/s but the "
                       f"record ships {got:g} ({r:.0f}x).  One of the two "
                       "statements in this file is false.")

    stale = sorted(set(PINNED) - seen)
    if bad or stale:
        print("check_record_self_consistency: FAILED")
        for b in bad:
            print("  " + b)
        for s in stale:
            print(f"  STALE PIN: {s} no longer contradicts itself -- remove it "
                  f"from PINNED ({PINNED[s][:60]}...)")
        return 1

    print(f"check_record_self_consistency: OK -- {ncompared} of {nfiles} asset "
          f"record(s) state header values this gate can compare, and every one "
          f"agrees with what is shipped within {TOL:g}x, except {len(PINNED)} "
          f"pinned contradiction(s) awaiting a ruling.  The other "
          f"{nfiles - ncompared} document no comparable number, so they are "
          "UNCHECKED, not clean.  The gate reports a disagreement; it does not "
          "choose which side is right.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
