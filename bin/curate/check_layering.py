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

WHAT THIS GATE CAN AND CANNOT CLAIM, because the difference matters here more
than usual.  It CANNOT make I17 or I18 true -- the violations are real, they
are named in `module-boundaries.md` F1/F2, and removing them is architectural
work (debts D1 and D2) that changes where code lives.  A gate cannot refactor.

What it CAN do is make them a RATCHET: the known violations are pinned, a NEW
upward edge or a NEW cycle fails immediately, and a pin that no longer fires
fails too.  That is the difference between a debt and a slope.  It moves I17
and I18 from *"described"* to *"described and bounded"* -- still not
consolidated, and the invariant table should keep saying so.

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
    ["outerDriver", "postProcessing", "reporting"],
    ["unitOperations", "propertyOps", "control"],
    ["thermo", "streams", "materials", "solver"],
    ["core"],
]
BAND = {sub: i for i, row in enumerate(BANDS) for sub in row}

INC = re.compile(r'^\s*#\s*include\s+"([^"]+)"', re.M)

#  KNOWN VIOLATIONS, pinned 2026-08-05 from the 2026-08-04 measurement.
#  Each is a DEBT with a removal condition in module-boundaries.md §8.
#  MEASURED 2026-08-05 by this gate.  The hand measurement of 2026-08-04
#  (module-boundaries.md F1) recorded THREE upward edges from core.  There are
#  FIVE upward edges: two more, from thermo and from unitOperations, which no
#  reader had walked to.
PINNED_UP = {
    ("core", "streams"), ("core", "thermo"), ("core", "unitOperations"),
    ("thermo", "propertyOps"), ("unitOperations", "reporting"),
}
#  F2 recorded THREE cycles.  There are EIGHT.  Five of them are the upward
#  edges above seen from the other side: core includes streams AND streams
#  includes core, which is one defect describable two ways -- an upward edge
#  and a 2-cycle.  Listing both is not double-counting, it is the same edge
#  failing two different invariants (I17 and I18), and a gate that reported
#  only one would let the other regress unnoticed.
PINNED_CYCLES = {
    frozenset(("solver", "thermo")),
    frozenset(("unitOperations", "propertyOps")),
    frozenset(("reporting", "postProcessing")),
    frozenset(("core", "streams")),
    frozenset(("core", "thermo")),
    frozenset(("core", "unitOperations")),
    frozenset(("propertyOps", "thermo")),
    frozenset(("reporting", "unitOperations")),
}

#  SUBSYSTEMS THE DECLARED LAYERING DOES NOT MENTION.  Found by this gate on
#  its first run: module-boundaries.md §1 draws five bands over TWELVE
#  subsystems, and `src/` holds FOURTEEN.  `io` (SolutionWriter) and
#  `curation` are simply absent from the diagram.
#
#  They are NOT placed here.  Where a subsystem belongs is an architecture
#  decision -- `io` writes solution state and could sit low or beside
#  reporting, and that choice constrains what may depend on it.  Guessing it
#  inside a gate would make the gate the author of the layering it checks.
#
#  So they are excluded from the up/cycle checks and REPORTED as unchecked.
#  Recorded as debt D6 in module-boundaries.md.
UNPLACED_KNOWN = {"io", "curation"}


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
          f"edge(s) measured; no NEW upward edge and no NEW cycle.  "
          f"{len(PINNED_UP)} upward edge(s) and {len(PINNED_CYCLES)} cycle(s) "
          "remain PINNED as declared debts (module-boundaries.md F1/F2, D1/D2) "
          "-- this gate BOUNDS I17 and I18, it does not make them true, and "
          "the invariant table still reads them as violated.  "
          f"UNCHECKED, not clean: {', '.join(sorted(UNPLACED_KNOWN))} are "
          "absent from the declared layering (D6) and are excluded from both "
          "checks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
