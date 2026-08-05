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

#  NF270 IS NO LONGER PINNED -- the contradiction was resolved 2026-08-05, and
#  not by choosing between the two numbers.
#
#  The header quoted three PERMEABILITIES beside the three the record ships;
#  two disagreed, glucose by 40x.  But the datasheet does not publish
#  permeabilities at all -- it publishes REJECTIONS.  So the header was quoting
#  a kind of quantity its own cited source never stated, which is why it could
#  drift: nothing anchored it.  The fix removes the false KIND of claim.  The
#  header now quotes the sourced rejections (MgSO4 >= 97 %, NaCl ~ 50 %, both
#  at the datasheet's own test condition) and says plainly that no citable
#  glucose figure was obtained; the permeabilities keep ONE home, the block,
#  and are labelled `provenance fittedToCase`.
#
#  Not a single value moved, so no golden moved.
#
#  ALSO CORRECTED: the audit called the shipped glucose value "backwards for a
#  loose NF membrane" because it is more permeable than NaCl.  That is not
#  obviously true for NF270 -- NaCl gains DONNAN exclusion from a negatively
#  charged membrane, while a neutral sugar at 180 Da against a ~200 Da cutoff
#  has only steric hindrance.  Low glucose rejection on a loose NF is reported
#  behaviour.  What is unestablished is the NUMBER, which is exactly what
#  `fittedToCase` now says.
PINNED = {}

#  A record that SHIPS transport parameters must declare where they came from.
#  This is the rule that keeps the NF270 fix from decaying: the old header said
#  "chosen to reproduce" in prose, which no reader and no tool could act on.
#  A tier that changes how a number should be READ belongs in a field.
PROVENANCE_VALUES = {"fittedToCase", "primarySource", "estimated"}

def to_float(mant, exp):
    e = "".join(SUP.get(ch, ch) for ch in exp)
    try:
        return float(mant) * (10.0 ** int(e))
    except ValueError:
        return None


def main() -> int:
    bad, seen, nfiles, ncompared, nprov = [], set(), 0, 0, 0
    for p in sorted((ROOT / "data/standards/assets").glob("*.dat")):
        text = p.read_text()
        nfiles += 1
        rel = p.relative_to(ROOT).as_posix()

        #  (b) a shipped permeability set declares its provenance
        #  MATCH THE KEYWORD, NOT THE WHOLE LINE.  A first version anchored on
        #  `permeabilities\s*$` or `\s*\{`, so `permeabilities   // comment`
        #  matched NEITHER -- NF270_dspmde.dat has exactly that, and the gate
        #  skipped it silently while reporting OK.  A record escaping a check
        #  because of a trailing comment is the same defect this gate exists to
        #  catch, one level up.
        if re.search(r'^\s*permeabilities\b', text, re.M):
            m = re.search(r'^\s*provenance\s+(\w+)\s*;', text, re.M)
            if not m:
                bad.append(f"{rel}: ships a `permeabilities {{}}` block with no "
                           "`provenance <fittedToCase|primarySource|estimated>;` "
                           "field.  Prose saying values were 'chosen to "
                           "reproduce' something is invisible to every reader "
                           "and every tool; a tier that changes how a number "
                           "should be READ belongs in a field.")
            elif m.group(1) not in PROVENANCE_VALUES:
                bad.append(f"{rel}: provenance '{m.group(1)}' is not one of "
                           + "|".join(sorted(PROVENANCE_VALUES)))
            else:
                nprov += 1
                if m.group(1) == "fittedToCase" and not re.search(
                        r'^\s*fittedAgainst\s+\S+\s*;', text, re.M):
                    bad.append(f"{rel}: `provenance fittedToCase` without "
                               "`fittedAgainst <case>;` -- a fit that does not "
                               "name what it was fitted to cannot be checked, "
                               "and reads like a measurement.")

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

    print(f"check_record_self_consistency: OK -- {nprov} record(s) ship a "
          f"permeability set and every one declares its provenance (a fitted "
          f"set must also name the case it was fitted against).  "
          f"{ncompared} of {nfiles} asset "
          f"record(s) state header values this gate can compare, and every one "
          f"agrees with what is shipped within {TOL:g}x, except {len(PINNED)} "
          f"pinned contradiction(s) awaiting a ruling.  The other "
          f"{nfiles - ncompared} document no comparable number, so they are "
          "UNCHECKED, not clean.  The gate reports a disagreement; it does not "
          "choose which side is right.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
