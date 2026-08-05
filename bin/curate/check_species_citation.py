#!/usr/bin/env python3
"""Gate: a species record that carries thermochemistry carries its source.

    bin/curate/check_species_citation.py

WHY THIS EXISTS.  Invariant I3 -- "every value carries its provenance, and an
estimate is never dressed as a measurement" -- is the one a reader has no way
to check for himself.  A wrong number can be recomputed; an UNSOURCED number
cannot be traced at all, and it looks exactly like a sourced one.

The 2026-08-05 provenance audit found seventeen aqueous species carrying
`hfAq` / `sAq` / `cpAq` with no `source`, `citation` or `origin` anywhere in
the file -- under a header that says *"citations ride"*.  Nothing rode.

There are EIGHTEEN.  This gate found `Acetate.dat` on its first run, which is
the case for building it: a hand-compiled list of violations is itself a
hand-maintained derived fact, and this one was already short on the day it
was written.  The gate recounts; the list remembers.  Their
compliant siblings show what the shape should be:

    Cl.dat:  source "Criss & Cobble, JACS 86 (1964) 5390, Table II";

WHAT THIS GATE CHECKS, and it is deliberately the weakest claim that is
certainly true: a record declaring a THERMOCHEMICAL value must contain a
citation field.  It does NOT check that the citation is correct, that the
paper says what the record claims, or that the value was transcribed
faithfully.  No gate can do those; a curator reading the primary can.
Pretending otherwise would be the estimate-dressed-as-measurement failure
wearing a checkmark.

THE EIGHTEEN ARE PINNED, NOT FIXED.  Writing a citation I have not verified
would be worse than the gap it hides: it would convert "unsourced" into
"falsely sourced", and the second is undetectable.  The pin list IS the
curation work-list, and a NEW uncited record fails immediately -- which is
the ratchet the tree never had.  Removing a name from the pin list without
adding a real citation fails, by design.
"""
import re
import sys
from pathlib import Path

#  THE WAIVERS LIVE IN ONE PLACE.  See `debt_registry.py` -- a pin is a
#  decision to tolerate a known violation, and "what are we currently
#  tolerating?" is a fact with exactly one home.
import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import SPECIES_WITHOUT_CITATION

ROOT = Path(__file__).resolve().parents[2]
SPECIES = ROOT / "data" / "standards" / "species"

#  A record makes a thermochemical CLAIM if it declares any of these.
CLAIMS = re.compile(r'^\s*(hfAq|sAq|cpAq|gfAq)\s', re.M)

#  Any of these fields, anywhere in the file, discharges the obligation.
CITED = re.compile(r'^\s*(source|citation|origin|reference)\b', re.M | re.I)

#  KNOWN-UNCITED, pinned 2026-08-05.  NOT fixed by writing a plausible
#  reference: an invented citation is undetectable, and it would turn a
#  visible gap into an invisible falsehood.
PINNED = SPECIES_WITHOUT_CITATION
def main() -> int:
    missing, seen, nclaim = [], set(), 0
    if not SPECIES.is_dir():
        print("check_species_citation: FAILED\n  data/standards/species is "
              "missing -- the probe is stale, not the tree")
        return 1

    for p in sorted(SPECIES.glob("*.dat")):
        text = p.read_text()
        if not CLAIMS.search(text):
            continue                      # no thermochemical claim, no duty
        nclaim += 1
        if CITED.search(text):
            continue
        if p.stem in PINNED:
            seen.add(p.stem)
            continue
        missing.append(p.relative_to(ROOT).as_posix())

    stale = sorted(PINNED - seen)
    if missing or stale:
        print("check_species_citation: FAILED")
        for m in missing:
            print(f"  NO CITATION: {m} declares thermochemistry (hfAq / sAq / "
                  "cpAq) with no source, citation or origin field.\n"
                  '        Compliant form: source "Criss & Cobble, JACS 86 '
                  '(1964) 5390, Table II";')
        for s in stale:
            print(f"  STALE PIN: {s}.dat now carries a citation (or no longer "
                  "declares thermochemistry) -- remove it from PINNED")
        return 1

    print(f"check_species_citation: OK -- {nclaim} species record(s) declare "
          f"thermochemistry; every one carries a source, except {len(PINNED)} "
          "pinned records awaiting curation.  The gate checks that a citation "
          "EXISTS, never that it is right -- that judgement needs a curator "
          "reading the primary, and a gate claiming it would be the failure "
          "I3 forbids.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
