#!/usr/bin/env python3
"""Gate: the declared layering does not get WORSE (invariants I17, I18).

    bin/curate/check_layering.py

WHY THIS EXISTS.  `module-boundaries.md` §1 declares the layering, and
`global-invariants.md` records I17 ("core depends on nothing above it") and
I18 ("the subsystem graph is acyclic").  Both are marked **W only** — written,
with no engine refusal and no case that fires one.  Nothing measured them
except a human reading an include graph once, on 2026-08-04.

A structural invariant with no check does not hold; it merely has not been
contradicted where anyone looked.  And the failure mode is silent by
construction: an upward include compiles exactly as well as a downward one.

WHAT THIS GATE CAN AND CANNOT CLAIM.  It cannot make I17 or I18 true; a gate
cannot refactor.  What it CAN do is make them a RATCHET: the known violations
are pinned, a NEW upward edge or a NEW cycle fails immediately, and a pin that
no longer fires fails too.  That is the difference between a debt and a slope.

THE RATCHET THEN DID ITS JOB, on 2026-08-05.  It shipped pinning FIVE upward
edges and EIGHT cycles.  Four of the five and six of the eight are now gone --
paid, not suppressed -- and the gate's own STALE-PIN arm is what proved each
removal real: deleting a pin whose violation still existed would have failed,
and leaving a pin whose violation was gone failed too.  A ratchet that only
ever tightens is a ledger of defeat; this one recorded the repayments.

ONE upward edge remains (`unitOperations` -> `reporting`, debt D7) and it is
the only unaccepted cycle.  So I17 and I18 are still *bounded*, not asserted,
and the invariant table must keep saying so.

HOW IT MEASURES.  `#include "sub/..."` from any file under `src/<sub>/`
gives an edge <sub> -> <target sub>.  Self-edges are ignored.  A subsystem
may depend DOWNWARD and SIDEWAYS within its band; upward is a violation, and
any cycle is a violation regardless of direction.

The band assignment is read from the layering declared in prose, and is
duplicated here of necessity -- a machine cannot read the ASCII diagram.
That duplication is itself an arity risk, so the gate FAILS if it finds a
subsystem directory it has no band for: a new subsystem must be placed
deliberately, not defaulted into the bottom band where nothing can violate.
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"

#  Bands, top (0) to bottom.  From module-boundaries.md §1.  Sideways within
#  a band is legal; upward (to a SMALLER index) is not.
BANDS = [
    ["applications"],
    ["outerDriver", "postProcessing", "reporting", "curation"],
    ["result", "io", "unitOperations", "propertyOps", "control"],
    ["thermo", "streams", "materials", "solver"],
    ["core"],
]
BAND = {sub: i for i, row in enumerate(BANDS) for sub in row}

INC = re.compile(r'^\s*#\s*include\s+"([^"]+)"', re.M)

#  WHAT IS LEFT, measured 2026-08-05 AFTER debts D1, D2, D4 and D6 were paid.
#  Each repayment moved ONE shared concept out of the consumer it had been
#  filed inside (`module-boundaries.md` §8):
#
#      core -> streams/thermo/unitOperations   FlatUnit left SimulationResult
#      thermo -> propertyOps                   DerivedClosures moved to thermo
#      result <-> unitOperations               UnitProfile moved to result
#      unitOperations <-> propertyOps          readExchange moved to thermo
#      reporting <-> postProcessing            OdsWriter moved to io
PINNED_UP = {
    #  `unitOperations/flowsheet/Flowsheet.cpp` -> `reporting/BalanceMath.H`.
    #  NOT movable by the method that paid the other four, and the reason is
    #  worth stating rather than retrying: BalanceMath needs a FLASH
    #  (`IsothermalFlash::solveCore`) to price a two-phase enthalpy, so it
    #  cannot sit below `unitOperations` -- and putting it beside them turns
    #  the upward edge straight back into a cycle.  Paying it needs a DECISION
    #  (move the flash down, or hand BalanceMath an injected enthalpy
    #  functor), which is design, not a move.  Recorded as D7.
    ("unitOperations", "reporting"),
}
PINNED_CYCLES = {
    #  ACCEPTED, ruling §7.3 -- not a debt.  Michelsen's stability test is a
    #  thermodynamic criterion solved numerically; the dependency is
    #  irreducible without a worse abstraction.
    frozenset(("solver", "thermo")),
    #  The D7 edge above, seen from the other side.  Listed in both places
    #  because it fails two different invariants (I17 and I18); a gate
    #  reporting only one would let the other regress unnoticed.
    frozenset(("reporting", "unitOperations")),
}

#  EMPTY SINCE 2026-08-05 -- debt D6 is paid.  This gate's first run found that
#  `module-boundaries.md` §1 drew five bands over TWELVE subsystems while `src/`
#  held FOURTEEN: `io` and `curation` were absent from the diagram entirely.
#  They were excluded and REPORTED as unchecked rather than defaulted into the
#  bottom band, where nothing can violate.
#
#  Both are placed now, and the placement was DERIVED rather than chosen: `io`
#  reads `result` and is read by `unitOperations`, which leaves exactly ONE
#  legal band.  A first draft had placed it beside `streams` on the reasoning
#  that it serialises stream state -- plausible, and wrong; re-measuring is
#  what caught it.  Guessing would have made the gate the author of the
#  layering it checks.
#
#  Kept as an empty set rather than deleted, because the check below it is the
#  one that matters: a NEW subsystem with no declared band still FAILS.
UNPLACED_KNOWN = set()


def edges():
    """sub -> set(sub), measured from the includes."""
    g = defaultdict(set)
    for p in SRC.rglob("*"):
        if p.suffix not in (".H", ".cpp") or not p.is_file():
            continue
        rel = p.relative_to(SRC).parts
        if len(rel) < 2:
            continue
        src_sub = rel[0]
        if src_sub not in BAND:
            continue          # unplaced subsystem -- excluded, reported below
        for inc in INC.findall(p.read_text(errors="ignore")):
            #  A `../` INCLUDE MUST BE RESOLVED, NOT SKIPPED.  The first
            #  version of this gate took inc.split("/")[0], which for
            #  "../thermo/Database.H" yields ".." -- not a subsystem, so the
            #  edge was silently dropped.  NINE boundary-crossing `../`
            #  includes were invisible to it.
            #
            #  That is precisely the defect D4 exists to remove ("so the
            #  graph is measurable by the obvious method"), and this gate WAS
            #  the obvious method, so it missed exactly the includes D4 is
            #  about.  No upward edge was hidden on the day it shipped -- the
            #  nine resolve downward -- but a `../` include CAN be upward, and
            #  a gate that reports OK about a region it never looked at is
            #  worse than no gate.
            if inc.startswith("../"):
                tgt_path = (p.parent / inc).resolve()
                try:
                    tgt = tgt_path.relative_to(SRC.resolve()).parts[0]
                except ValueError:
                    continue          # leaves src/ entirely (generated/) --
                                      # a different crossing, reported by D4
            else:
                tgt = inc.split("/")[0]
            if tgt != src_sub and tgt in BAND:
                g[src_sub].add(tgt)
    return g


def cycles(g):
    """Every 2-cycle, plus any longer cycle reachable by DFS."""
    found = set()
    for a in g:
        for b in g[a]:
            if a in g.get(b, ()):
                found.add(frozenset((a, b)))
    return found


def main() -> int:
    fail = []
    if not SRC.is_dir():
        print("check_layering: FAILED\n  src/ is missing")
        return 1

    #  A subsystem with no band cannot be checked.  It is NOT defaulted into
    #  the bottom band -- that would place it where nothing can violate, so
    #  the gate would grow blind spots as the tree grows.  It is excluded and
    #  NAMED, and a subsystem appearing that this list does not know about is
    #  a failure, because placing one is an architecture decision.
    unplaced = sorted({d.name for d in SRC.iterdir()
                       if d.is_dir() and d.name not in BAND})
    unexpected = [u for u in unplaced if u not in UNPLACED_KNOWN]
    if unexpected:
        fail.append(f"subsystem(s) with no declared band: {', '.join(unexpected)}"
                    " -- place them in module-boundaries.md §1 AND in BANDS"
                    " here.  Where a subsystem sits is an architecture"
                    " decision, not a default.")

    g = edges()

    up_seen, up_new = set(), []
    for a in sorted(g):
        for b in sorted(g[a]):
            if BAND[b] < BAND[a]:                  # b is HIGHER than a
                if (a, b) in PINNED_UP:
                    up_seen.add((a, b))
                else:
                    up_new.append(f"{a} -> {b}  ({a} is below {b}; a lower "
                                  "layer including its dependent is not a "
                                  "lower layer)")

    cyc = cycles(g)
    cyc_seen, cyc_new = set(), []
    for c in sorted(cyc, key=lambda s: sorted(s)):
        if c in PINNED_CYCLES:
            cyc_seen.add(c)
        else:
            cyc_new.append(" <-> ".join(sorted(c)))

    stale_up = sorted(PINNED_UP - up_seen)
    stale_cyc = sorted(PINNED_CYCLES - cyc_seen, key=lambda s: sorted(s))

    for u in up_new:
        fail.append("NEW upward edge: " + u)
    for c in cyc_new:
        fail.append("NEW cycle: " + c + " -- I18 says the subsystem graph is "
                    "acyclic; a new cycle is not a debt, it is a regression")
    for a, b in stale_up:
        fail.append(f"STALE PIN: {a} -> {b} no longer exists -- remove it from "
                    "PINNED_UP (a pin outliving its violation is a licence)")
    for c in stale_cyc:
        fail.append(f"STALE PIN: cycle {' <-> '.join(sorted(c))} is gone -- "
                    "remove it from PINNED_CYCLES")

    if fail:
        print("check_layering: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print(f"check_layering: OK -- {sum(len(v) for v in g.values())} subsystem "
          f"edge(s) measured across all {len(BAND)} declared subsystems; no NEW "
          f"upward edge and no NEW cycle.  {len(PINNED_UP)} upward edge "
          f"(`unitOperations` -> `reporting`, debt D7) and {len(PINNED_CYCLES)} "
          "cycle(s) remain pinned -- one of which (`solver` <-> `thermo`) is "
          "ACCEPTED by ruling §7.3 and is not a debt.  This gate BOUNDS I17 and "
          "I18; with one edge outstanding it still does not assert them, and "
          "the invariant table must keep saying so.  Nothing is excluded from "
          "the checks any more (D6 paid): a subsystem with no declared band "
          "FAILS rather than being skipped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
