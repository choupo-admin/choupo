#!/usr/bin/env python3
"""Gate: a declared validity window must be a window.

    bin/curate/check_validity_windows.py

WHY THIS EXISTS.  Invariant I4 says a number outside its fitted range is
ANNOUNCED, never silently extrapolated -- the professor extrapolates on
purpose, but knows he did.  That announcement is driven by a declared
interval, and nothing ever checked that the interval is one.

The 2026-08-05 provenance audit found six component records declaring
`Trange (hi lo)` with hi <= lo:

    neon           (30  27)      krypton        (121 120)
    Xe             (166 165)     D2             (24  24)
    OrthoDeuterium (24  24)      ParaDeuterium  (24  24)

all inside `liquidHeatCapacity`, all under a comment claiming a real fit
("fitted to CoolProp saturated-liquid cp") with a FOUR-TERM polynomial.
A cubic cannot be fitted over a 1 K span, and it cannot be fitted at all
over a 0 K one.

The consequence is not cosmetic: an empty or inverted interval makes the
I4 announcement either DEAD (nothing is ever outside it, if the test is
lo <= T <= hi and the set is empty -- so it fires always) or MEANINGLESS.
Either way the user is told something false about the domain of a number
he is about to use.  A validity field nobody validates is exactly the
"declared but unenforceable" shape this project keeps finding.

WHAT IS AND IS NOT CHECKED.  This gate makes the WEAKEST claim that is
certainly true: an interval's upper bound must exceed its lower bound.
It deliberately does NOT check that a range is physically sensible (inside
the liquid span, say), because that requires knowing what was fitted and
this gate does not.  A weak check that cannot be wrong beats a strong one
that guesses.

SIX RECORDS ARE KNOWN-BAD AND PINNED BELOW.  They are NOT fixed by
inventing a range: the fit's true domain is a fact about the regression
that produced it, and fabricating it would put a made-up number where a
measured one belongs -- the estimate-dressed-as-measurement failure I3
forbids.  They are pinned so the gate is GREEN on today's tree and turns
RED the moment a SEVENTH appears, and the pin list is the curation
work-list.  Removing a name from the pin list without fixing the record
makes the gate fail, by design.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  The interval keys this project uses for a declared validity window.
#  `Trange (lo hi)` is the common one; pRange appears on adsorption records.
PAT = re.compile(r'\b(Trange|pRange)\s*\(\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s*\)')

#  KNOWN-BAD, pinned 2026-08-05.  Each is a CoolProp-derived liquid-Cp fit
#  whose declared window is inverted or degenerate.  The remedy is to
#  re-derive the window from the regression that produced the coefficients
#  -- a CURATION act, not a code change.  Do not "fix" these by guessing.
PINNED = {
    "data/standards/components/neon.dat",
    "data/standards/components/krypton.dat",
    "data/standards/components/Xe.dat",
    "data/standards/components/D2.dat",
    "data/standards/components/OrthoDeuterium.dat",
    "data/standards/components/ParaDeuterium.dat",
}

SCAN = ["data/standards", "tutorials"]


def main() -> int:
    bad, pinned_seen, nfiles, nwindows = [], set(), 0, 0
    for root in SCAN:
        for p in sorted((ROOT / root).rglob("*.dat")):
            try:
                text = p.read_text()
            except (UnicodeDecodeError, OSError):
                continue
            nfiles += 1
            rel = p.relative_to(ROOT).as_posix()
            for n, line in enumerate(text.splitlines(), 1):
                m = PAT.search(line)
                if not m:
                    continue
                nwindows += 1
                key, lo, hi = m.group(1), float(m.group(2)), float(m.group(3))
                if hi > lo:
                    continue
                if rel in PINNED:
                    pinned_seen.add(rel)
                    continue
                bad.append(f"{rel}:{n}  {key} ({lo} {hi})"
                           f"  -- upper bound {'equals' if hi == lo else 'is below'}"
                           f" the lower")

    #  A pin that no longer fires means the record was fixed (good) or moved
    #  (needs attention).  Either way the pin is stale and must not linger:
    #  a pin list that outlives its reason is a second home for a fact.
    stale = sorted(PINNED - pinned_seen)

    if bad or stale:
        print("check_validity_windows: FAILED")
        for b in bad:
            print("  NEW inverted/empty window: " + b)
        for s in stale:
            print(f"  STALE PIN: {s} no longer declares a bad window "
                  "-- remove it from PINNED")
        return 1

    print(f"check_validity_windows: OK -- {nwindows} declared window(s) across "
          f"{nfiles} record(s); every one has hi > lo, except {len(PINNED)} "
          "pinned CoolProp liquid-Cp fits awaiting re-derivation of their "
          "regression domain (a curation act, not a guess)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
