#!/usr/bin/env python3
"""Retirement guard for the mineralSolubility KIND.

The kind is RETIRED: a mineral's dissolution data lives in the owning
component's own solidPhases{} block (64 components carry one at the
2026-08-22 census), never in a standalone chemistry/ record.  Two arms,
both of which can FAIL:

(1) the retired monolith data/standards/electrolyte/minerals.dat must stay
    ABSENT -- its reintroduction would resurrect a second home (arity, I1);
(2) no record under data/standards/chemistry/ may declare
    `recordType mineralSolubility` -- the kind has no reader, so such a
    record would be data the engine can never reach, filed where a curator
    would trust it.

History: until 2026-08-22 this gate was DOUBLY dead -- its first act read
the retired monolith and exited 0, and even its unreachable arms pointed at
a directory (chemistry/mineralSolubility) that never matched a file.  Found
by the fresh-eyes audit (docs/audit/2026-08-22-fresh-eyes/).
"""
import sys
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
fails = []

monolith = repo / "data/standards/electrolyte/minerals.dat"
if monolith.exists():
    fails.append(f"{monolith} EXISTS again -- mineral dissolution data lives"
                 " in the owning component's solidPhases{} block, and a"
                 " resurrected monolith is a second home that will drift")

chem = repo / "data/standards/chemistry"
if not chem.is_dir():
    fails.append("data/standards/chemistry is MISSING -- scan surface collapsed")
else:
    n = 0
    for f in sorted(chem.glob("*.dat")):
        n += 1
        if "recordType mineralSolubility" in f.read_text(encoding="utf-8",
                                                         errors="replace"):
            fails.append(f"{f.relative_to(repo)}: declares recordType"
                         " mineralSolubility -- a RETIRED kind with no reader;"
                         " put the dissolution data in the owning component's"
                         " solidPhases{} block")
    if n < 45:   # census 2026-08-22: 77 chemistry records
        fails.append(f"only {n} chemistry record(s) scanned (floor 45,"
                     " census 77) -- collapsed scan")

if fails:
    print("minerals-retirement FAILED:")
    for x in fails[:20]:
        print("  -", x)
    sys.exit(1)
print("minerals-retirement: OK -- monolith absent, and no chemistry/ record"
      " resurrects the retired mineralSolubility kind.")
